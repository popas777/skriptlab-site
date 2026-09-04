(function () {
    "use strict";

    const rootConfig = window.SKRIPTLAB_CONFIG || {};
    const API_BASE = String(rootConfig.API_BASE_URL || "").replace(/\/$/, "") + "/api";
    const STORAGE_KEY_PREFIX = "skriptlab_text_tool_model_";

    function element(tagName, className, text) {
        const node = document.createElement(tagName);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function authToken() {
        return localStorage.getItem("skriptlab_auth_token") || "";
    }

    function currentUserId() {
        try {
            const user = JSON.parse(localStorage.getItem("skriptlab_auth_user") || "null");
            return String(user?.id || "").trim();
        } catch (error) {
            return "";
        }
    }

    function modelRef(model) {
        const provider = String(model?.provider || "").trim();
        const name = String(model?.model_name || "").trim();
        return provider && name ? provider + ":" + name : "";
    }

    function modelLabel(model) {
        const label = String(model?.display_name || model?.model_name || "Tuntematon malli").trim();
        return label + (String(model?.model_tier || "") === "pro" ? " · pro" : "");
    }

    function catalogDefault(models, demanding) {
        return models.find((model) => demanding ? model?.is_demanding_default : model?.is_default)
            || models.find((model) => model?.is_default)
            || models.find((model) => model?.is_demanding_default)
            || models[0]
            || null;
    }

    function storageKey() {
        const userId = currentUserId();
        return userId ? STORAGE_KEY_PREFIX + userId : "";
    }

    function readStoredModel(key) {
        if (!key) return "";
        try {
            return String(localStorage.getItem(key) || "").trim();
        } catch (error) {
            return "";
        }
    }

    function writeStoredModel(key, value) {
        if (!key) return;
        try {
            if (value) localStorage.setItem(key, value);
            else localStorage.removeItem(key);
        } catch (error) {
            // The active page still retains the choice when storage is unavailable.
        }
    }

    function createDialog(trigger, options) {
        const dialog = element("dialog", "text-model-settings-dialog");
        dialog.id = options.dialogId || trigger.id + "-dialog";
        dialog.setAttribute("aria-labelledby", dialog.id + "-title");
        dialog.setAttribute("aria-describedby", dialog.id + "-description");

        const panel = element("div", "text-model-settings-panel");
        const header = element("header", "text-model-settings-header");
        const headingWrap = element("div");
        const eyebrow = element("span", "text-model-settings-eyebrow", "Tekstityökalut");
        const title = element("h2", "", "AI-mallin asetukset");
        title.id = dialog.id + "-title";
        headingWrap.append(eyebrow, title);
        const close = element("button", "text-model-settings-close", "×");
        close.type = "button";
        close.setAttribute("aria-label", "Sulje malliasetukset");
        header.append(headingWrap, close);

        const body = element("div", "text-model-settings-body");
        const description = element(
            "p",
            "text-model-settings-description",
            options.description
                || "Valinta koskee Tekstin parantelua, viimeistelyä ja oikolukua sekä Kirjoita ja editoi -työkaluja."
        );
        description.id = dialog.id + "-description";
        const field = element("label", "text-model-settings-field");
        const fieldLabel = element("span", "", "Kielimalli");
        const select = element("select");
        select.id = dialog.id + "-select";
        const help = element("small", "", "Automaattinen käyttää tehtävälle määritettyä palvelun oletusmallia.");
        field.append(fieldLabel, select, help);
        const defaults = element("p", "text-model-settings-defaults");
        const status = element("p", "text-model-settings-status", "Ladataan sallittuja malleja…");
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        const retry = element("button", "text-model-settings-retry", "Yritä uudelleen");
        retry.type = "button";
        retry.hidden = true;
        body.append(description, field, defaults, status, retry);

        const footer = element("footer", "text-model-settings-actions");
        const cancel = element("button", "text-model-settings-cancel", "Peruuta");
        cancel.type = "button";
        const save = element("button", "text-model-settings-save", "Tallenna mallivalinta");
        save.type = "button";
        footer.append(cancel, save);
        panel.append(header, body, footer);
        dialog.append(panel);
        document.body.append(dialog);

        return { dialog, close, select, defaults, status, retry, cancel, save };
    }

    function mount(options) {
        const settings = options || {};
        const trigger = document.getElementById(settings.triggerId || "");
        if (!trigger) {
            return {
                getModel: () => null,
                getLabel: () => "Automaattinen",
                labelFor: (value) => String(value || ""),
                load: async () => false,
            };
        }

        const controls = createDialog(trigger, settings);
        const key = storageKey();
        let selectedModel = readStoredModel(key);
        let draftModel = selectedModel;
        let models = [];
        let loaded = false;
        let loading = false;
        let activeLoad = null;
        let loadError = "";
        let loadRevision = 0;
        let notice = "";

        trigger.setAttribute("aria-haspopup", "dialog");
        trigger.setAttribute("aria-controls", controls.dialog.id);
        trigger.setAttribute("aria-expanded", "false");

        function selectedCatalogModel(value) {
            return models.find((model) => modelRef(model) === value) || null;
        }

        function labelFor(value) {
            const reference = String(value || "").trim();
            const model = selectedCatalogModel(reference);
            return model ? modelLabel(model) : reference;
        }

        function automaticLabel() {
            const defaultModel = catalogDefault(models, settings.defaultKind === "demanding");
            return defaultModel ? "Automaattinen · " + modelLabel(defaultModel) : "Automaattinen";
        }

        function activeLabel() {
            const model = loaded ? selectedCatalogModel(selectedModel) : null;
            return model ? modelLabel(model) : automaticLabel();
        }

        function renderTrigger() {
            const label = trigger.querySelector("[data-text-model-current]");
            if (label) {
                label.textContent = selectedCatalogModel(selectedModel)
                    ? "Malli: " + modelLabel(selectedCatalogModel(selectedModel))
                    : "Malli: automaattinen";
            }
            const accessible = "Avaa AI-mallin asetukset. Käytössä: " + activeLabel();
            trigger.setAttribute("aria-label", accessible);
            trigger.title = accessible;
        }

        function renderOptions() {
            const previousDraft = draftModel;
            const autoOption = element("option", "", automaticLabel());
            autoOption.value = "";
            const modelOptions = models.map((model) => {
                const option = element("option", "", modelLabel(model));
                option.value = modelRef(model);
                return option;
            });
            controls.select.replaceChildren(autoOption, ...modelOptions);
            controls.select.disabled = loading;
            controls.select.value = selectedCatalogModel(previousDraft) ? previousDraft : "";
            draftModel = controls.select.value;

            const standard = catalogDefault(models, false);
            const demanding = catalogDefault(models, true);
            controls.defaults.textContent = loaded && models.length
                ? "Palvelun oletukset: tekstitehtävät " + modelLabel(standard)
                    + "; vaativat parantelut ja viimeistely " + modelLabel(demanding) + "."
                : "";
            controls.retry.hidden = !loadError;
            if (loading) {
                controls.status.textContent = "Ladataan sallittuja malleja…";
            } else if (loadError) {
                controls.status.textContent = loadError + " Automaattinen malli on edelleen käytettävissä.";
            } else if (notice) {
                controls.status.textContent = notice;
            } else if (selectedCatalogModel(selectedModel)) {
                controls.status.textContent = "Tallennettu valinta: " + modelLabel(selectedCatalogModel(selectedModel)) + ".";
            } else {
                controls.status.textContent = "Käytössä on tehtäväkohtainen automaattinen oletusmalli.";
            }
            renderTrigger();
        }

        async function load(force) {
            if (loading) return activeLoad || false;
            if (loaded && !force) return true;
            const revision = ++loadRevision;
            loading = true;
            loadError = "";
            notice = "";
            renderOptions();
            activeLoad = (async () => {
                const controller = new AbortController();
                const timeout = window.setTimeout(() => controller.abort(), 30000);
                try {
                    const headers = {};
                    if (authToken()) headers.Authorization = "Bearer " + authToken();
                    const response = await fetch(API_BASE + "/models/text", {
                        headers,
                        signal: controller.signal,
                    });
                    if (!response.ok) throw new Error("Mallilistan lataaminen epäonnistui (" + response.status + ").");
                    const payload = await response.json();
                    if (revision !== loadRevision) return false;
                    models = (Array.isArray(payload) ? payload : []).filter((model) => modelRef(model));
                    loaded = true;
                    if (selectedModel && !selectedCatalogModel(selectedModel)) {
                        selectedModel = "";
                        draftModel = "";
                        writeStoredModel(key, "");
                        notice = "Aiemmin valittu malli ei ole enää käytettävissä. Vaihdettiin automaattiseen oletukseen.";
                    }
                    return true;
                } catch (error) {
                    if (revision !== loadRevision) return false;
                    models = [];
                    loaded = false;
                    loadError = error?.name === "AbortError"
                        ? "Mallilistan lataaminen kesti liian kauan."
                        : String(error?.message || "Mallilistan lataaminen epäonnistui.");
                    return false;
                } finally {
                    window.clearTimeout(timeout);
                    if (revision === loadRevision) {
                        loading = false;
                        renderOptions();
                    }
                    activeLoad = null;
                }
            })();
            return activeLoad;
        }

        function openDialog() {
            draftModel = selectedModel;
            renderOptions();
            trigger.setAttribute("aria-expanded", "true");
            if (typeof controls.dialog.showModal === "function") controls.dialog.showModal();
            else controls.dialog.setAttribute("open", "");
            window.requestAnimationFrame(() => controls.select.focus({ preventScroll: true }));
            if (!loaded && !loading) load(true);
        }

        function closeDialog() {
            if (typeof controls.dialog.close === "function") controls.dialog.close();
            else {
                controls.dialog.removeAttribute("open");
                trigger.setAttribute("aria-expanded", "false");
                trigger.focus({ preventScroll: true });
            }
        }

        function saveSelection() {
            const candidate = String(controls.select.value || "");
            if (candidate && (!loaded || !selectedCatalogModel(candidate))) {
                controls.status.textContent = "Valittu malli ei ole enää käytettävissä. Päivitä mallilista.";
                return;
            }
            selectedModel = candidate;
            draftModel = candidate;
            notice = "";
            writeStoredModel(key, selectedModel);
            renderTrigger();
            closeDialog();
        }

        controls.select.addEventListener("change", () => {
            draftModel = controls.select.value;
            controls.status.textContent = draftModel
                ? "Valinta tallennetaan, kun painat Tallenna mallivalinta."
                : "Automaattinen käyttää tehtävälle määritettyä palvelun oletusmallia.";
        });
        trigger.addEventListener("click", openDialog);
        controls.close.addEventListener("click", closeDialog);
        controls.cancel.addEventListener("click", closeDialog);
        controls.save.addEventListener("click", saveSelection);
        controls.retry.addEventListener("click", () => load(true));
        controls.dialog.addEventListener("close", () => {
            trigger.setAttribute("aria-expanded", "false");
            trigger.focus({ preventScroll: true });
        });
        controls.dialog.addEventListener("click", (event) => {
            if (event.target === controls.dialog) closeDialog();
        });
        window.addEventListener("storage", (event) => {
            if (!key || event.key !== key) return;
            selectedModel = String(event.newValue || "").trim();
            if (loaded && selectedModel && !selectedCatalogModel(selectedModel)) selectedModel = "";
            draftModel = selectedModel;
            renderOptions();
        });

        renderOptions();
        load(false);
        return {
            getModel() {
                return loaded && selectedCatalogModel(selectedModel) ? selectedModel : null;
            },
            getLabel: activeLabel,
            labelFor,
            load,
        };
    }

    window.SkriptLabTextModelSettings = {
        mount,
        modelLabel,
        modelRef,
    };
})();
