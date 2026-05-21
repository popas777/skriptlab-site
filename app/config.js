(function () {
    const localHosts = ["localhost", "127.0.0.1", ""];
    const isLocal = localHosts.includes(window.location.hostname);

    window.SKRIPTLAB_CONFIG = {
        API_BASE_URL: isLocal ? "http://127.0.0.1:8000" : "https://api.skriptlab.com"
    };
})();
