(function () {
    const TOKEN_KEY = "skriptlab_auth_token";
    const USER_KEY = "skriptlab_auth_user";
    const SHOWCASE_DEMO_ACCESS_GROUPS = new Set(["Demo", "Kustantamodemo"]);
    const WORKSPACE_KEYS = [
        "skriptlab_manuscript",
        "skriptlab_raw_text",
        "skriptlab_active_project_id",
    ];
    const RETRY_STATUSES = new Set([429, 502, 503, 504]);
    const MAX_READ_RETRIES = 2;
    const MAX_RETRY_DELAY_MS = 5000;

    function abortReason(signal) {
        return signal && "reason" in signal
            ? signal.reason : new DOMException("Pyyntö peruttiin.", "AbortError");
    }

    function retryDelay(response, retry) {
        const backoff = 500 * (2 ** retry);
        const value = response?.headers?.get("Retry-After");
        if (!value) return backoff;
        const seconds = Number(value);
        const requested = Number.isFinite(seconds) && seconds >= 0
            ? seconds * 1000 : Date.parse(value) - Date.now();
        return Number.isFinite(requested)
            ? Math.min(MAX_RETRY_DELAY_MS, Math.max(backoff, requested)) : backoff;
    }

    function waitForRetry(delay, signal) {
        return new Promise((resolve, reject) => {
            if (signal?.aborted) { reject(abortReason(signal)); return; }
            const onAbort = () => {
                window.clearTimeout(timer);
                signal.removeEventListener("abort", onAbort);
                reject(abortReason(signal));
            };
            const timer = window.setTimeout(() => {
                signal?.removeEventListener("abort", onAbort);
                resolve();
            }, delay);
            signal?.addEventListener("abort", onAbort, { once: true });
        });
    }

    function networkError(cause) {
        const error = new Error("Yhteys palvelimeen katkesi. Tarkista verkkoyhteys ja yritä hetken kuluttua uudelleen. Jo käynnistetty työ voi jatkua palvelimella.");
        error.cause = cause;
        error.code = "NETWORK_ERROR";
        error.retryable = true;
        return error;
    }

    window.SkriptLabAuth = {
        tokenKey: TOKEN_KEY,
        userKey: USER_KEY,

        getToken() {
            return localStorage.getItem(TOKEN_KEY);
        },

        getUser() {
            const raw = localStorage.getItem(USER_KEY);
            if (!raw) return null;
            try {
                return JSON.parse(raw);
            } catch (e) {
                return null;
            }
        },

        isShowcaseDemoUser(user = this.getUser()) {
            return SHOWCASE_DEMO_ACCESS_GROUPS.has(String(user?.access_group_name || ""));
        },

        setSession(token, user) {
            const previousUser = this.getUser();
            if (previousUser && user && previousUser.id !== user.id) {
                this.clearWorkspaceData();
            }
            localStorage.setItem(TOKEN_KEY, token);
            localStorage.setItem(USER_KEY, JSON.stringify(user));
        },

        clearSession() {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            this.clearWorkspaceData();
        },

        clearWorkspaceData() {
            WORKSPACE_KEYS.forEach((key) => localStorage.removeItem(key));
        },

        authHeaders(extraHeaders) {
            const headers = new Headers(extraHeaders || {});
            const token = this.getToken();
            if (token) {
                headers.set("Authorization", `Bearer ${token}`);
            }
            return headers;
        },

        async fetch(path, options) {
            const requestOptions = Object.assign({}, options || {});
            requestOptions.headers = this.authHeaders(requestOptions.headers);
            const method = String(requestOptions.method || "GET").toUpperCase();
            // Creating or changing work must not be repeated after an uncertain response.
            const retries = ["GET", "HEAD"].includes(method) ? MAX_READ_RETRIES : 0;
            const url = apiUrl(path);
            for (let attempt = 0; ; attempt += 1) {
                if (requestOptions.signal?.aborted) throw abortReason(requestOptions.signal);
                let response;
                try {
                    // Resolve fetch at call time so the shared access adapter stays active.
                    response = await fetch(url, requestOptions);
                } catch (error) {
                    if (requestOptions.signal?.aborted) throw abortReason(requestOptions.signal);
                    if (error?.name === "AbortError") throw error;
                    if (!["TypeError", "NetworkError"].includes(error?.name)) throw error;
                    if (attempt >= retries) throw networkError(error);
                    await waitForRetry(retryDelay(null, attempt), requestOptions.signal);
                    continue;
                }
                if (response.status === 401) {
                    this.clearSession();
                    window.location.replace("login.html");
                }
                if (attempt >= retries || !RETRY_STATUSES.has(response.status)) return response;
                const delay = retryDelay(response, attempt);
                response.body?.cancel().catch(() => {});
                await waitForRetry(delay, requestOptions.signal);
            }
        },

        requireLogin() {
            if (!this.getToken()) {
                window.location.replace("login.html");
                return false;
            }
            return true;
        },
    };
})();
