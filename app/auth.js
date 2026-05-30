(function () {
    const TOKEN_KEY = "skriptlab_auth_token";
    const USER_KEY = "skriptlab_auth_user";
    const WORKSPACE_KEYS = [
        "skriptlab_manuscript",
        "skriptlab_raw_text",
        "skriptlab_active_project_id",
    ];

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
            const headers = Object.assign({}, extraHeaders || {});
            const token = this.getToken();
            if (token) {
                headers.Authorization = `Bearer ${token}`;
            }
            return headers;
        },

        async fetch(path, options) {
            const requestOptions = Object.assign({}, options || {});
            requestOptions.headers = this.authHeaders(requestOptions.headers);
            const response = await fetch(apiUrl(path), requestOptions);
            if (response.status === 401) {
                this.clearSession();
                window.location.replace("login.html");
            }
            return response;
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
