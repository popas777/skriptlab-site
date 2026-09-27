(function () {
  "use strict";

  function normalizeSearch(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fi").trim();
  }

  function boot() {
    const base = new URL(".", document.querySelector('script[src*="kirjailijat.js"]').src);
    if (!window.SkriptLabAuth?.getToken?.()) {
      window.location.replace(new URL("login.html", base));
      return;
    }

    // The static pages follow the shell theme without an extra API request.
    try {
      const themeRoot = window.parent.document.documentElement;
      const syncTheme = () => {
        document.body.dataset.shellTheme = themeRoot.getAttribute("data-theme") === "dark" ? "dark" : "light";
      };
      syncTheme();
      const observer = new MutationObserver(syncTheme);
      observer.observe(themeRoot, { attributes: true, attributeFilter: ["data-theme"] });
      window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
    } catch (_) { /* Standalone pages keep the readable light theme. */ }

    const form = document.querySelector(".author-search");
    const input = document.getElementById("author-query");
    const clear = document.querySelector(".clear-search");
    const rows = Array.from(document.querySelectorAll(".author-row"));
    const isDirectory = Boolean(document.getElementById("author-list"));
    input.value = new URLSearchParams(window.location.search).get("q") || "";

    function syncSearch(updateUrl = false) {
      const query = input.value.trim();
      clear.hidden = !input.value;
      const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
      let count = 0;
      rows.forEach(row => {
        const haystack = normalizeSearch(`${row.textContent} ${row.dataset.search || ""}`);
        row.hidden = !terms.every(term => haystack.includes(term));
        if (!row.hidden) count += 1;
      });
      if (isDirectory) {
        document.getElementById("result-count").textContent = `${count} ${count === 1 ? "kirjailija" : "kirjailijaa"}`;
        document.getElementById("results-title").textContent = query ? "Hakutulokset" : "Kaikki kirjailijat";
        document.getElementById("search-empty").hidden = count > 0;
      }
      document.querySelectorAll("[data-profile], [data-directory]").forEach(link => {
        const url = new URL(link.href);
        if (query) url.searchParams.set("q", query);
        else url.searchParams.delete("q");
        link.href = url.href;
      });
      if (updateUrl && isDirectory) {
        const url = new URL(window.location.href);
        if (query) url.searchParams.set("q", query);
        else url.searchParams.delete("q");
        window.history.replaceState(null, "", url);
      }
    }
    input.addEventListener("input", () => syncSearch(true));
    clear.addEventListener("click", () => { input.value = ""; syncSearch(true); input.focus(); });
    document.getElementById("reset-search")?.addEventListener("click", () => clear.click());
    if (isDirectory) form.addEventListener("submit", event => { event.preventDefault(); syncSearch(true); });
    window.addEventListener("popstate", () => {
      input.value = new URLSearchParams(window.location.search).get("q") || "";
      syncSearch();
    });
    syncSearch();

    document.querySelectorAll("[data-library-search]").forEach(link => {
      link.addEventListener("click", event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || window.parent === window) return;
        event.preventDefault();
        window.parent.postMessage({ type: "skriptlab:authors-open-library", query: link.dataset.librarySearch }, window.location.origin);
      });
    });
  }

  if (typeof module === "object" && module.exports) module.exports = { normalizeSearch };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
  }
})();
