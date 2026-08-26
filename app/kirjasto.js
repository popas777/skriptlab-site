(function () {
  "use strict";

  const API_ROOT = "/api/library";
  const READER_SETTINGS_KEY = "skriptlab_library_reader_settings_v1";
  const PROGRESS_KEY_PREFIX = "skriptlab_library_progress_v1";
  const AUTH_TOKEN_KEY = "skriptlab_auth_token";
  const AUTH_USER_KEY = "skriptlab_auth_user";
  const AUDIO_TIMING_FEATURE_ENABLED = false;
  const FONT_SIZES = ["small", "medium", "large", "xlarge"];
  const SHELL_MESSAGE_TYPES = new Set([
    "skriptlab:library-context-changed",
    "skriptlab:library-open-publish",
  ]);

  const state = {
    scope: "all",
    query: "",
    media: "",
    theme: "",
    works: [],
    availableThemes: new Map(),
    selectedWork: null,
    selectedProgress: null,
    chapters: [],
    chapterIndex: 0,
    listController: null,
    listSequence: 0,
    searchTimer: null,
    progressTimer: null,
    progressPayload: null,
    progressWorkId: null,
    audioWork: null,
    audioLastSavedAt: 0,
    pendingAudioPosition: 0,
    audioIntentPlaying: false,
    audioResumeAfterLoad: false,
    audioRefreshInFlight: false,
    audioRefreshWorkId: null,
    audioRefreshAttemptedAt: 0,
    restoreReaderScroll: false,
    addSource: "import",
    addIntent: "review",
    addBusy: false,
    draftWork: null,
    reviewThemes: [],
    lastModalTrigger: null,
    noticeAction: null,
    projectContext: {
      projectId: null,
      projectTitle: "",
      projectAuthor: "",
      themaClasses: [],
      source: "shell",
      publicationId: null,
      packageId: null,
      editionId: null,
    },
    viewer: null,
    readerSettings: {
      fontSize: "medium",
      lineHeight: "comfortable",
      columnWidth: "medium",
      theme: "light",
      followAudio: false,
    },
  };

  const elements = {};

  class LibraryApiError extends Error {
    constructor(message, status, payload) {
      super(message);
      this.name = "LibraryApiError";
      this.status = status;
      this.payload = payload;
    }
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function collectElements() {
    [
      "library-app",
      "library-notice",
      "library-notice-text",
      "library-notice-action",
      "library-notice-close",
      "library-browser",
      "library-add-work",
      "library-scope-tabs",
      "library-search-form",
      "library-search-input",
      "library-search-clear",
      "library-media-filters",
      "library-theme-filter",
      "library-loading",
      "library-continue-section",
      "library-continue-card",
      "library-results",
      "library-results-title",
      "library-result-count",
      "library-work-grid",
      "library-empty",
      "library-empty-title",
      "library-empty-copy",
      "library-empty-add",
      "library-clear-filters",
      "library-detail",
      "detail-back",
      "detail-owner-actions",
      "detail-review",
      "detail-unpublish",
      "detail-delete",
      "detail-cover",
      "detail-status",
      "detail-title",
      "detail-author",
      "detail-media-labels",
      "detail-description",
      "detail-themes",
      "detail-progress",
      "detail-progress-label",
      "detail-progress-value",
      "detail-progress-bar",
      "detail-read",
      "detail-listen",
      "detail-meta",
      "library-reader",
      "reader-back",
      "reader-work-title",
      "reader-work-author",
      "reader-contents-toggle",
      "reader-bookmark",
      "reader-settings-toggle",
      "reader-close",
      "reader-backdrop",
      "reader-contents",
      "reader-chapter-list",
      "reader-scroll",
      "reader-page",
      "reader-chapter-title",
      "reader-text",
      "reader-progress-percent",
      "reader-settings",
      "reader-font-decrease",
      "reader-font-increase",
      "reader-line-height-options",
      "reader-width-options",
      "reader-theme-options",
      "reader-follow-audio-setting",
      "reader-follow-audio",
      "library-add-dialog",
      "library-add-form",
      "add-work-title",
      "add-work-description",
      "add-work-close",
      "add-work-notice",
      "add-work-source-step",
      "add-tab-import",
      "add-tab-project",
      "add-panel-import",
      "add-panel-project",
      "add-work-text",
      "add-work-file",
      "add-work-file-name",
      "add-project-name",
      "add-project-id",
      "add-project-id-value",
      "add-work-title-input",
      "add-work-author-input",
      "add-work-description-input",
      "add-work-language",
      "add-work-cover",
      "add-work-audio",
      "add-cancel",
      "add-work-classification-step",
      "classification-title",
      "thema-review-list",
      "thema-review-empty",
      "thema-custom-input",
      "thema-custom-add",
      "add-work-rights",
      "classification-back",
      "classification-keep-draft",
      "classification-publish",
      "library-audio-dock",
      "library-audio",
      "audio-open-work",
      "audio-cover",
      "audio-title",
      "audio-chapter",
      "audio-back-15",
      "audio-previous",
      "audio-play",
      "audio-next",
      "audio-forward-15",
      "audio-time-current",
      "audio-seek",
      "audio-time-duration",
      "audio-speed",
      "audio-mute",
      "audio-volume",
      "audio-collapse",
      "mobile-library-nav",
    ].forEach((id) => {
      elements[id] = byId(id);
    });
  }

  function makeIcon(name) {
    const icon = document.createElement("i");
    icon.className = `ph ph-${name}`;
    icon.setAttribute("aria-hidden", "true");
    return icon;
  }

  function text(value, fallback = "") {
    if (value === null || value === undefined) return fallback;
    const normalized = String(value).trim();
    return normalized || fallback;
  }

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function firstValue(source, keys, fallback = null) {
    for (const key of keys) {
      if (source && source[key] !== undefined && source[key] !== null && source[key] !== "") {
        return source[key];
      }
    }
    return fallback;
  }

  function asArray(value) {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined || value === "") return [];
    return [value];
  }

  function booleanValue(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      return ["1", "true", "yes", "on", "available", "ready"].includes(value.trim().toLowerCase());
    }
    return Boolean(value);
  }

  function safePrimitive(value, maximumLength = 500) {
    if (!["string", "number"].includes(typeof value)) return "";
    return String(value).trim().slice(0, maximumLength);
  }

  function apiBase() {
    return text(window.API_BASE_URL || window.SKRIPTLAB_CONFIG?.API_BASE_URL).replace(/\/$/, "");
  }

  function mediaUrl(value) {
    const url = text(value);
    if (!url) return "";
    if (/^(?:https?:|blob:|data:)/i.test(url)) return url;
    if (url.startsWith("/")) return `${apiBase()}${url}`;
    return `${apiBase()}/${url}`;
  }

  function workAudioUrl(work) {
    return mediaUrl(work?.audioUrl || "");
  }

  async function requestJson(path, options = {}) {
    if (!window.SkriptLabAuth?.fetch) {
      throw new LibraryApiError("Kirjautumispalvelu ei ole käytettävissä.", 0, null);
    }

    const requestOptions = { ...options };
    const headers = { ...(requestOptions.headers || {}) };
    if (requestOptions.body && !(requestOptions.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    requestOptions.headers = headers;

    const response = await window.SkriptLabAuth.fetch(path, requestOptions);
    if (response.status === 204) return null;

    const contentType = response.headers.get("content-type") || "";
    let payload = null;
    if (contentType.includes("application/json")) {
      payload = await response.json().catch(() => null);
    } else {
      const raw = await response.text().catch(() => "");
      payload = raw ? { detail: raw } : null;
    }

    if (!response.ok) {
      const detail = firstValue(payload || {}, ["detail", "message", "error"], null);
      const message = typeof detail === "string" ? detail : `Pyyntö epäonnistui (${response.status}).`;
      throw new LibraryApiError(message, response.status, payload);
    }
    return payload;
  }

  function unwrapWork(payload) {
    if (!payload || typeof payload !== "object") return payload;
    if (payload.work && typeof payload.work === "object") return payload.work;
    if (payload.data?.work && typeof payload.data.work === "object") return payload.data.work;
    if (payload.data && !Array.isArray(payload.data) && typeof payload.data === "object") return payload.data;
    return payload;
  }

  function unwrapWorks(payload) {
    if (Array.isArray(payload)) return payload;
    const candidates = [
      payload?.works,
      payload?.items,
      payload?.results,
      payload?.data?.works,
      payload?.data?.items,
      payload?.data,
    ];
    return candidates.find(Array.isArray) || [];
  }

  function normalizeThema(input) {
    const output = [];

    function push(value) {
      if (value === null || value === undefined || value === "") return;
      if (Array.isArray(value)) {
        value.forEach(push);
        return;
      }
      if (typeof value === "object") {
        if (Array.isArray(value.subjects)) {
          value.subjects.forEach(push);
          return;
        }
        const code = text(firstValue(value, ["code", "thema_code", "id", "value"], ""));
        const label = text(firstValue(value, ["label", "name", "title", "description", "theme"], ""));
        if (code || label) {
          output.push({
            code: code.toUpperCase(),
            label: label || code,
            primary: booleanValue(value.primary),
            status: text(value.status),
            source: text(value.source),
          });
        }
        return;
      }

      const raw = text(value);
      if (!raw) return;
      if ((raw.startsWith("[") || raw.startsWith("{")) && raw.length < 10000) {
        try {
          push(JSON.parse(raw));
          return;
        } catch (_error) {
          // Continue as a human-readable value.
        }
      }
      raw.split(/[;|\n]+/).map((part) => part.trim()).filter(Boolean).forEach((part) => {
        const match = part.match(/^([A-Z][A-Z0-9]{2,6})\s*[·:\-–—]\s*(.+)$/);
        if (match) {
          output.push({ code: match[1].toUpperCase(), label: match[2].trim() });
        } else if (/^[A-Z][A-Z0-9]{2,6}$/.test(part)) {
          output.push({ code: part, label: part });
        } else {
          output.push({ code: "", label: part });
        }
      });
    }

    push(input);
    const seen = new Set();
    return output.filter((item) => {
      const key = `${item.code}|${item.label}`.toLocaleLowerCase("fi");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function mergeThemes(...inputs) {
    const seenLabels = new Set();
    return normalizeThema(inputs).filter((item) => {
      const labelKey = text(item.label || item.code).toLocaleLowerCase("fi");
      if (!labelKey || seenLabels.has(labelKey)) return false;
      seenLabels.add(labelKey);
      return true;
    });
  }

  function normalizeProgress(input) {
    const source = input && typeof input === "object" ? input : {};
    let percent = finiteNumber(firstValue(source, [
      "progress_percent",
      "reading_progress_percent",
      "percent",
      "percentage",
      "progress",
    ], 0));
    if (percent > 0 && percent <= 1) percent *= 100;
    return {
      percent: clamp(percent, 0, 100),
      chapterId: text(firstValue(source, ["chapter_id", "chapterId"], "")),
      chapterIndex: Math.max(0, Math.floor(finiteNumber(firstValue(source, ["chapter_index", "chapterIndex"], 0)))),
      chapterProgress: clamp(finiteNumber(firstValue(source, ["chapter_progress", "chapterProgress", "scroll_fraction"], 0)), 0, 1),
      chapterTitle: text(firstValue(source, ["chapter_title", "chapterTitle"], "")),
      audioPosition: Math.max(0, finiteNumber(firstValue(source, ["audio_position_seconds", "audio_position", "audioPosition"], 0))),
      audioDuration: Math.max(0, finiteNumber(firstValue(source, ["audio_duration_seconds", "audio_duration", "audioDuration"], 0))),
      paragraphIndex: Math.max(0, Math.floor(finiteNumber(firstValue(source, ["paragraph_index", "paragraphIndex"], 0)))),
      bookmarks: asArray(source.bookmarks).filter((bookmark) => bookmark && typeof bookmark === "object").map((bookmark) => ({
        chapter_id: text(firstValue(bookmark, ["chapter_id", "chapterId"], "")),
        paragraph_index: Math.max(0, Math.floor(finiteNumber(firstValue(bookmark, ["paragraph_index", "paragraphIndex"], 0)))),
        audio_position_seconds: Math.max(0, finiteNumber(firstValue(bookmark, ["audio_position_seconds", "audioPosition"], 0))),
        label: text(bookmark.label),
        note: text(bookmark.note),
      })),
      updatedAt: text(firstValue(source, ["updated_at", "updatedAt"], "")),
    };
  }

  function normalizeWork(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const media = source.media && typeof source.media === "object" && !Array.isArray(source.media) ? source.media : {};
    const formats = asArray(firstValue(source, ["formats", "available_formats", "media_types"], []))
      .map((value) => text(typeof value === "object" ? value.type || value.kind : value).toLowerCase());
    const progressSource = firstValue(source, ["progress", "user_progress", "reading_progress"], {});
    const status = text(firstValue(source, ["status", "publication_status"], "published")).toLowerCase();
    const hasText = booleanValue(firstValue(source, [
      "has_text",
      "has_content",
      "is_readable",
      "text_available",
      "readable",
    ], media.readable || media.has_text)) || formats.some((item) => ["text", "read", "epub", "pdf", "html"].includes(item));
    const hasAudio = booleanValue(firstValue(source, [
      "has_audio",
      "is_listenable",
      "audio_available",
      "listenable",
    ], media.audio || media.has_audio)) || formats.some((item) => ["audio", "mp3", "m4a", "wav", "ogg"].includes(item));

    const chapterCount = Math.max(0, Math.floor(finiteNumber(firstValue(source, ["chapter_count", "chapters_count"], 0))));
    const themaSubjects = normalizeThema(firstValue(source, ["thema", "thema_classes"], []));
    const themeLabels = normalizeThema(firstValue(source, ["theme_labels", "themes", "theme"], []));
    const themes = mergeThemes(themaSubjects, themeLabels);
    const suggestions = themaSubjects.filter((item) => item.status !== "confirmed");

    return {
      id: text(firstValue(source, ["id", "work_id", "uuid"], "")),
      title: text(firstValue(source, ["title", "name", "work_title"], ""), "Nimetön teos"),
      author: text(firstValue(source, ["author", "creator", "author_name"], ""), "Tekijä tuntematon"),
      description: text(firstValue(source, ["description", "summary", "synopsis"], "")),
      coverUrl: mediaUrl(firstValue(source, ["cover_data_url", "cover_url", "cover_image_url", "cover", "thumbnail_url"], media.cover_url || "")),
      status,
      language: text(firstValue(source, ["language", "language_code"], "")),
      hasText: hasText || chapterCount > 0,
      hasAudio,
      audioUrl: text(firstValue(source, ["audio_url"], media.audio_url || "")),
      themes,
      suggestions: suggestions.length ? suggestions : normalizeThema(firstValue(source, ["thema_suggestions", "suggested_thema", "classification_suggestions"], [])),
      progress: normalizeProgress(progressSource),
      ownerId: text(firstValue(source, ["owner_user_id", "owner_id", "user_id", "created_by"], "")),
      canEdit: booleanValue(firstValue(source, ["can_manage", "can_edit", "editable"], false)),
      chapterCount,
      durationSeconds: Math.max(0, finiteNumber(firstValue(source, ["audio_duration_seconds", "duration_seconds", "audio_duration"], 0))),
      publishedAt: text(firstValue(source, ["published_at", "publication_date"], "")),
      updatedAt: text(firstValue(source, ["updated_at", "modified_at"], "")),
      raw: source,
    };
  }

  function currentUser() {
    return state.viewer || window.SkriptLabAuth?.getUser?.() || null;
  }

  function canPublish() {
    const user = currentUser();
    if (!user) return false;
    const role = text(user.role).toLowerCase();
    if (["admin", "test_user"].includes(role)) return true;
    if (user.allowed_modules === null) return true;
    if (!Array.isArray(user.allowed_modules)) return false;
    return user.allowed_modules.includes("published_library_publish");
  }

  function syncPublisherUi() {
    const allowed = canPublish();
    elements["library-add-work"].hidden = !allowed;
    elements["library-empty-add"].hidden = !allowed;
    if (!allowed && elements["library-add-dialog"]?.open) closeAddDialog();
  }

  function canManageWork(work) {
    if (!work || !canPublish()) return false;
    if (work.canEdit) return true;
    const user = currentUser();
    if (!user) return false;
    return Boolean(work.ownerId && String(user.id) === String(work.ownerId));
  }

  function showNotice(message, options = {}) {
    elements["library-notice-text"].textContent = text(message, "Tuntematon ilmoitus.");
    state.noticeAction = typeof options.action === "function" ? options.action : null;
    elements["library-notice-action"].hidden = !state.noticeAction;
    elements["library-notice-action"].textContent = text(options.label, "Yritä uudelleen");
    elements["library-notice"].hidden = false;
  }

  function hideNotice() {
    elements["library-notice"].hidden = true;
    state.noticeAction = null;
  }

  function errorMessage(error, fallback) {
    if (error instanceof LibraryApiError && error.message) return error.message;
    if (error instanceof Error && error.message && !/failed to fetch/i.test(error.message)) return error.message;
    return fallback;
  }

  function renderCover(container, work, options = {}) {
    container.replaceChildren();
    const fallback = document.createElement("span");
    fallback.className = "cover-fallback";
    fallback.append(makeIcon("book-open-text"));

    if (!work?.coverUrl) {
      container.append(fallback);
      return;
    }

    const image = document.createElement("img");
    image.src = work.coverUrl;
    image.alt = options.alt === undefined ? "" : options.alt;
    image.loading = options.eager ? "eager" : "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => container.replaceChildren(fallback), { once: true });
    container.append(image);
  }

  function appendMediaIcons(container, work) {
    container.replaceChildren();
    if (work.hasText) {
      const icon = makeIcon("book-open");
      icon.title = "Luettavissa";
      container.append(icon);
    }
    if (work.hasAudio) {
      const icon = makeIcon("headphones");
      icon.title = "Kuunneltavissa";
      container.append(icon);
    }
  }

  function progressLabel(work) {
    const progress = work.progress || normalizeProgress({});
    const chapter = progress.chapterTitle || (progress.chapterIndex >= 0 && work.chapterCount ? `Luku ${progress.chapterIndex + 1}` : "");
    const percent = Math.round(progress.percent);
    return chapter ? `${chapter} · ${percent} %` : `${percent} %`;
  }

  function firstThemeLabel(work) {
    return work.themes[0]?.label || work.themes[0]?.code || "";
  }

  function workMatchesContinue(work) {
    return work.progress.percent > 0 && work.progress.percent < 100;
  }

  function renderContinueCard(work) {
    const host = elements["library-continue-card"];
    host.replaceChildren();
    if (!work) {
      elements["library-continue-section"].hidden = true;
      return;
    }

    const article = document.createElement("article");
    article.className = "continue-work";

    const cover = document.createElement("div");
    cover.className = "continue-cover";
    renderCover(cover, work);

    const info = document.createElement("div");
    info.className = "continue-info";
    const title = document.createElement("h3");
    title.textContent = work.title;
    const author = document.createElement("p");
    author.textContent = work.author;
    const icons = document.createElement("div");
    icons.className = "media-icons";
    icons.setAttribute("aria-label", "Saatavilla olevat muodot");
    appendMediaIcons(icons, work);
    const progressCopy = document.createElement("p");
    progressCopy.className = "continue-progress-copy";
    progressCopy.textContent = progressLabel(work);
    const track = document.createElement("div");
    track.className = "progress-track";
    track.setAttribute("aria-label", `Edistyminen ${Math.round(work.progress.percent)} prosenttia`);
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    track.setAttribute("aria-valuenow", String(Math.round(work.progress.percent)));
    const fill = document.createElement("span");
    fill.style.width = `${work.progress.percent}%`;
    track.append(fill);
    info.append(title, author, icons, progressCopy, track);

    const actions = document.createElement("div");
    actions.className = "continue-actions";
    const resume = document.createElement("button");
    resume.type = "button";
    resume.className = "primary-action";
    resume.textContent = work.hasText ? "Jatka lukemista" : "Jatka kuuntelua";
    resume.addEventListener("click", () => work.hasText ? openReader(work) : startAudio(work, true));
    actions.append(resume);

    if (work.hasAudio) {
      const play = document.createElement("button");
      play.type = "button";
      play.className = "continue-play";
      play.setAttribute("aria-label", `Kuuntele ${work.title}`);
      play.append(makeIcon("play"));
      play.addEventListener("click", () => startAudio(work, true));
      actions.append(play);
    }

    article.append(cover, info, actions);
    host.append(article);
    elements["library-continue-section"].hidden = false;
  }

  function createWorkCard(work) {
    const article = document.createElement("article");
    article.className = "work-card";
    article.dataset.workId = work.id;

    const cover = document.createElement("div");
    cover.className = "work-cover";
    renderCover(cover, work);

    if (work.status === "draft") {
      const status = document.createElement("span");
      status.className = "work-status";
      status.textContent = "Luonnos";
      cover.append(status);
    }

    const copy = document.createElement("div");
    copy.className = "work-card-copy";
    const title = document.createElement("h3");
    title.textContent = work.title;
    const author = document.createElement("p");
    author.className = "work-author";
    author.textContent = work.author;
    const icons = document.createElement("div");
    icons.className = "media-icons";
    icons.setAttribute("aria-label", "Saatavilla olevat muodot");
    appendMediaIcons(icons, work);
    copy.append(title, author, icons);

    const theme = firstThemeLabel(work);
    if (theme) {
      const themeNode = document.createElement("p");
      themeNode.className = "work-theme";
      themeNode.textContent = theme;
      copy.append(themeNode);
    }

    const open = document.createElement("button");
    open.type = "button";
    open.className = "work-card-open";
    open.setAttribute("aria-label", `Avaa ${work.title}, ${work.author}`);
    open.addEventListener("click", () => openDetail(work.id));

    article.append(cover, copy, open);

    if (work.progress.percent > 0) {
      const progress = document.createElement("div");
      progress.className = "work-card-progress";
      progress.setAttribute("aria-hidden", "true");
      const fill = document.createElement("span");
      fill.style.width = `${work.progress.percent}%`;
      progress.append(fill);
      article.append(progress);
    }
    return article;
  }

  function resultsHeading(scope) {
    if (scope === "continue") return "Jatka lukemista ja kuuntelua";
    if (scope === "mine") return "Omat teokset";
    if (state.query || state.media || state.theme) return "Hakutulokset";
    return "Poimintoja sinulle";
  }

  function renderEmptyState(visibleWorks, continuation) {
    const empty = elements["library-empty"];
    const hasFilters = Boolean(state.query || state.media || state.theme);
    const isEmpty = visibleWorks.length === 0 && !continuation;
    empty.hidden = !isEmpty;
    if (!isEmpty) return;

    if (hasFilters) {
      elements["library-empty-title"].textContent = "Hakusi ei löytänyt teoksia";
      elements["library-empty-copy"].textContent = "Kokeile toista hakusanaa tai poista yksi rajauksista.";
      elements["library-empty-add"].hidden = true;
      elements["library-clear-filters"].hidden = false;
      return;
    }
    if (state.scope === "continue") {
      elements["library-empty-title"].textContent = "Ei vielä kesken olevia teoksia";
      elements["library-empty-copy"].textContent = "Kun aloitat lukemisen tai kuuntelun, voit jatkaa tästä samasta kohdasta.";
      elements["library-empty-add"].hidden = true;
      elements["library-clear-filters"].hidden = true;
      return;
    }
    if (state.scope === "mine") {
      elements["library-empty-title"].textContent = "Et ole vielä lisännyt teoksia";
      elements["library-empty-copy"].textContent = "Tuo oma teksti tai julkaise valmis SkriptLab-projekti.";
    } else {
      elements["library-empty-title"].textContent = "Kirjasto odottaa ensimmäistä teosta";
      elements["library-empty-copy"].textContent = "Tuo oma teos tai julkaise valmis projekti luettavaksi ja kuunneltavaksi.";
    }
    elements["library-empty-add"].hidden = !canPublish();
    elements["library-clear-filters"].hidden = true;
  }

  function renderWorks() {
    const continuation = state.scope === "all" ? state.works.find(workMatchesContinue) || null : null;
    renderContinueCard(continuation);

    const visibleWorks = continuation && state.works.length > 1
      ? state.works.filter((work) => work.id !== continuation.id)
      : (continuation ? [] : state.works);
    elements["library-results-title"].textContent = resultsHeading(state.scope);
    elements["library-result-count"].textContent = `${state.works.length} ${state.works.length === 1 ? "teos" : "teosta"}`;
    elements["library-work-grid"].replaceChildren(...visibleWorks.map(createWorkCard));
    renderEmptyState(visibleWorks, continuation);
    elements["library-results"].hidden = visibleWorks.length === 0 && Boolean(continuation);
  }

  function updateThemeOptions() {
    const select = elements["library-theme-filter"];
    const current = state.theme;
    state.works.forEach((work) => {
      work.themes.forEach((theme) => {
        const value = theme.code || theme.label;
        if (value && !state.availableThemes.has(value)) {
          state.availableThemes.set(value, theme.label || theme.code);
        }
      });
    });
    const options = [document.createElement("option")];
    options[0].value = "";
    options[0].textContent = "Kaikki teemat";
    [...state.availableThemes.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], "fi"))
      .forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        options.push(option);
      });
    select.replaceChildren(...options);
    select.value = current;
  }

  function syncScopeControls() {
    document.querySelectorAll("[data-scope]").forEach((button) => {
      const selected = button.dataset.scope === state.scope;
      if (selected) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    document.querySelectorAll("[data-mobile-action]").forEach((button) => {
      const action = button.dataset.mobileAction;
      const selected = action !== "search" && action === state.scope;
      button.classList.toggle("is-active", selected);
      if (selected) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  async function loadWorks(options = {}) {
    const sequence = ++state.listSequence;
    state.listController?.abort();
    state.listController = new AbortController();
    const params = new URLSearchParams({ scope: state.scope });
    if (state.query) params.set("q", state.query);
    if (state.media) params.set("media", state.media);
    if (state.theme) params.set("theme", state.theme);

    elements["library-loading"].hidden = false;
    elements["library-work-grid"].setAttribute("aria-busy", "true");
    elements["library-empty"].hidden = true;
    if (!options.silent) hideNotice();

    try {
      const payload = await requestJson(`${API_ROOT}/works?${params.toString()}`, {
        signal: state.listController.signal,
      });
      if (sequence !== state.listSequence) return;
      state.works = unwrapWorks(payload).map(normalizeWork).filter((work) => work.id);
      updateThemeOptions();
      renderWorks();
    } catch (error) {
      if (error?.name === "AbortError") return;
      if (sequence !== state.listSequence) return;
      state.works = [];
      renderWorks();
      elements["library-empty"].hidden = false;
      elements["library-empty-title"].textContent = "Kirjastoa ei voitu ladata";
      elements["library-empty-copy"].textContent = "Tarkista yhteys ja yritä uudelleen.";
      elements["library-empty-add"].hidden = true;
      elements["library-clear-filters"].hidden = true;
      showNotice(errorMessage(error, "Kirjaston lataaminen epäonnistui."), {
        action: () => loadWorks(),
      });
    } finally {
      if (sequence === state.listSequence) {
        elements["library-loading"].hidden = true;
        elements["library-work-grid"].setAttribute("aria-busy", "false");
      }
    }
  }

  function setScope(scope) {
    if (!["all", "continue", "mine"].includes(scope)) return;
    state.scope = scope;
    syncScopeControls();
    closeDetail(false);
    loadWorks();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clearFilters() {
    state.query = "";
    state.media = "";
    state.theme = "";
    elements["library-search-input"].value = "";
    elements["library-search-clear"].hidden = true;
    elements["library-theme-filter"].value = "";
    document.querySelectorAll("[data-media]").forEach((button) => {
      const selected = button.dataset.media === "";
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    loadWorks();
  }

  function mergeWork(partial, full) {
    const normalized = normalizeWork(full?.raw ? full.raw : full);
    if (!partial) return normalized;
    const mergedRaw = { ...partial.raw, ...normalized.raw };
    return normalizeWork(mergedRaw);
  }

  function languageLabel(code) {
    return ({ fi: "Suomi", sv: "Ruotsi", en: "Englanti", de: "Saksa", fr: "Ranska", es: "Espanja" })[text(code).toLowerCase()] || text(code);
  }

  function durationLabel(seconds) {
    const total = Math.max(0, Math.round(finiteNumber(seconds)));
    if (!total) return "";
    const hours = Math.floor(total / 3600);
    const minutes = Math.round((total % 3600) / 60);
    return hours ? `${hours} h ${minutes} min` : `${minutes} min`;
  }

  function dateLabel(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("fi-FI", { dateStyle: "medium" }).format(date);
  }

  function renderDetailMeta(work) {
    const rows = [];
    const values = [
      ["Kieli", languageLabel(work.language)],
      ["Lukuja", work.chapterCount ? String(work.chapterCount) : ""],
      ["Äänitteen kesto", durationLabel(work.durationSeconds)],
      ["Julkaistu", dateLabel(work.publishedAt)],
    ];
    values.forEach(([label, value]) => {
      if (!value) return;
      const wrapper = document.createElement("div");
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = label;
      description.textContent = value;
      wrapper.append(term, description);
      rows.push(wrapper);
    });
    elements["detail-meta"].replaceChildren(...rows);
    elements["detail-meta"].hidden = rows.length === 0;
  }

  function renderDetail(work) {
    renderCover(elements["detail-cover"], work, { eager: true });
    elements["detail-title"].textContent = work.title;
    elements["detail-author"].textContent = work.author;
    elements["detail-description"].textContent = work.description || "Teokselle ei ole vielä lisätty kuvausta.";

    elements["detail-status"].hidden = work.status !== "draft";
    elements["detail-status"].textContent = work.status === "draft" ? "Luonnos" : "";

    const mediaLabels = [];
    if (work.hasText) {
      const item = document.createElement("span");
      item.append(makeIcon("book-open"), document.createTextNode("Luettavissa"));
      mediaLabels.push(item);
    }
    if (work.hasAudio) {
      const item = document.createElement("span");
      item.append(makeIcon("headphones"), document.createTextNode("Kuunneltavissa"));
      mediaLabels.push(item);
    }
    elements["detail-media-labels"].replaceChildren(...mediaLabels);

    elements["detail-themes"].replaceChildren(...work.themes.map((theme) => {
      const item = document.createElement("span");
      item.textContent = theme.code ? `${theme.code} · ${theme.label}` : theme.label;
      return item;
    }));
    elements["detail-themes"].hidden = work.themes.length === 0;

    const progress = state.selectedProgress || work.progress;
    const hasProgress = progress.percent > 0 || progress.audioPosition > 0;
    elements["detail-progress"].hidden = !hasProgress;
    if (hasProgress) {
      elements["detail-progress-label"].textContent = progress.chapterTitle || "Jatka teosta";
      elements["detail-progress-value"].textContent = `${Math.round(progress.percent)} %`;
      elements["detail-progress-bar"].style.width = `${progress.percent}%`;
    }

    elements["detail-read"].hidden = !work.hasText || work.status === "draft";
    elements["detail-listen"].hidden = !work.hasAudio || work.status === "draft";
    elements["detail-read"].querySelector("span").textContent = hasProgress ? "Jatka lukemista" : "Aloita lukeminen";
    elements["detail-listen"].querySelector("span").textContent = progress.audioPosition > 0 ? "Jatka kuuntelua" : "Kuuntele";

    const manageable = canManageWork(work);
    elements["detail-owner-actions"].hidden = !manageable;
    elements["detail-review"].hidden = !(manageable && work.status === "draft");
    elements["detail-unpublish"].hidden = !(manageable && work.status === "published");
    elements["detail-delete"].hidden = !(manageable && work.status === "draft");
    renderDetailMeta(work);
  }

  async function openDetail(workId) {
    const id = text(workId);
    if (!id) return;
    hideNotice();
    const partial = state.works.find((work) => work.id === id) || null;
    state.selectedWork = partial;
    state.selectedProgress = partial?.progress || null;
    if (partial) renderDetail(partial);
    elements["library-browser"].hidden = true;
    elements["library-detail"].hidden = false;
    document.body.classList.add("is-detail");
    elements["detail-title"].focus?.({ preventScroll: true });
    window.scrollTo(0, 0);

    try {
      const [workPayload, progress] = await Promise.all([
        requestJson(`${API_ROOT}/works/${encodeURIComponent(id)}`),
        loadProgress(id),
      ]);
      if (state.selectedWork?.id && state.selectedWork.id !== id) return;
      state.selectedWork = mergeWork(partial, unwrapWork(workPayload));
      state.selectedProgress = progress;
      state.selectedWork.progress = progress;
      renderDetail(state.selectedWork);
    } catch (error) {
      showNotice(errorMessage(error, "Teoksen tietojen lataaminen epäonnistui."), {
        action: () => openDetail(id),
      });
    }
  }

  function closeDetail(restoreFocus = true) {
    if (elements["library-detail"].hidden) return;
    const workId = state.selectedWork?.id;
    elements["library-detail"].hidden = true;
    elements["library-browser"].hidden = false;
    document.body.classList.remove("is-detail");
    if (restoreFocus && workId) {
      document.querySelector(`[data-work-id="${CSS.escape(workId)}"] .work-card-open`)?.focus();
    }
  }

  async function deleteSelectedDraft() {
    const work = state.selectedWork;
    if (!work || work.status !== "draft" || !canManageWork(work)) return;
    if (!window.confirm(`Poistetaanko luonnos “${work.title}”? Toimintoa ei voi perua.`)) return;
    elements["detail-delete"].disabled = true;
    try {
      await requestJson(`${API_ROOT}/works/${encodeURIComponent(work.id)}`, { method: "DELETE" });
      closeDetail(false);
      state.selectedWork = null;
      showNotice("Luonnos poistettiin kirjastosta.");
      await loadWorks({ silent: true });
    } catch (error) {
      showNotice(errorMessage(error, "Luonnoksen poistaminen epäonnistui."));
    } finally {
      elements["detail-delete"].disabled = false;
    }
  }

  async function unpublishSelectedWork() {
    const work = state.selectedWork;
    if (!work || work.status !== "published" || !canManageWork(work)) return;
    const confirmed = window.confirm(
      `Poistetaanko “${work.title}” julkaistusta kirjastosta? Teos säilyy luonnoksena eikä ole enää lukijoiden nähtävissä.`,
    );
    if (!confirmed) return;
    elements["detail-unpublish"].disabled = true;
    try {
      const payload = await requestJson(`${API_ROOT}/works/${encodeURIComponent(work.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "draft" }),
      });
      state.selectedWork = mergeWork(work, unwrapWork(payload));
      renderDetail(state.selectedWork);
      await loadWorks({ silent: true });
      showNotice(`“${work.title}” poistettiin julkaistusta kirjastosta ja säilytettiin luonnoksena.`);
    } catch (error) {
      showNotice(errorMessage(error, "Teoksen poistaminen julkaisusta epäonnistui."));
    } finally {
      elements["detail-unpublish"].disabled = false;
    }
  }

  function progressStorageKey(workId) {
    const userId = text(currentUser()?.id, "anonymous");
    return `${PROGRESS_KEY_PREFIX}:${userId}:${workId}`;
  }

  function purgeLocalProgress(exceptUserId = null) {
    try {
      const prefix = `${PROGRESS_KEY_PREFIX}:`;
      const keepPrefix = exceptUserId === null || exceptUserId === undefined
        ? ""
        : `${prefix}${text(exceptUserId)}:`;
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (!key?.startsWith(prefix) || (keepPrefix && key.startsWith(keepPrefix))) continue;
        localStorage.removeItem(key);
      }
    } catch (_error) {
      // Server-side progress remains isolated by the authenticated user.
    }
  }

  function installProgressPrivacyCleanup() {
    const auth = window.SkriptLabAuth;
    if (!auth || auth.__libraryProgressCleanupInstalled) return;
    const original = auth.clearWorkspaceData;
    if (typeof original === "function") {
      auth.clearWorkspaceData = function (...args) {
        try {
          return original.apply(this, args);
        } finally {
          purgeLocalProgress();
        }
      };
    }
    try {
      Object.defineProperty(auth, "__libraryProgressCleanupInstalled", { value: true });
    } catch (_error) {
      auth.__libraryProgressCleanupInstalled = true;
    }
  }

  function handleAuthStorageChange(event) {
    if (event.storageArea !== localStorage) return;
    if (![AUTH_TOKEN_KEY, AUTH_USER_KEY].includes(event.key)) return;
    purgeLocalProgress();
  }

  function readLocalProgress(workId) {
    try {
      const raw = localStorage.getItem(progressStorageKey(workId));
      return raw ? normalizeProgress(JSON.parse(raw)) : normalizeProgress({});
    } catch (_error) {
      return normalizeProgress({});
    }
  }

  function writeLocalProgress(workId, payload) {
    try {
      const storageKey = progressStorageKey(workId);
      let existing = {};
      try {
        existing = JSON.parse(localStorage.getItem(storageKey) || "{}") || {};
      } catch (_error) {
        existing = {};
      }
      localStorage.setItem(storageKey, JSON.stringify({ ...existing, ...payload, updated_at: new Date().toISOString() }));
    } catch (_error) {
      // Server persistence remains the source of truth when storage is unavailable.
    }
  }

  function hasProgressValue(progress) {
    return progress.percent > 0 || progress.audioPosition > 0 || progress.chapterId || progress.bookmarks.length > 0;
  }

  function progressUpdatedTime(progress) {
    const timestamp = Date.parse(progress.updatedAt);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  async function loadProgress(workId) {
    const local = readLocalProgress(workId);
    try {
      const payload = await requestJson(`${API_ROOT}/works/${encodeURIComponent(workId)}/progress`);
      const normalized = normalizeProgress(payload?.progress || payload?.data || payload || {});
      if (hasProgressValue(local) && progressUpdatedTime(local) > progressUpdatedTime(normalized)) return local;
      return hasProgressValue(normalized) ? normalized : local;
    } catch (error) {
      if (error instanceof LibraryApiError && error.status === 404) return local;
      return local;
    }
  }

  function queueProgress(workId, patch) {
    if (!workId) return;
    const current = state.progressWorkId === workId && state.progressPayload ? state.progressPayload : {};
    state.progressWorkId = workId;
    state.progressPayload = { ...current, ...patch };
    writeLocalProgress(workId, state.progressPayload);
    window.clearTimeout(state.progressTimer);
    state.progressTimer = window.setTimeout(() => flushProgress(), 850);
  }

  async function flushProgress() {
    window.clearTimeout(state.progressTimer);
    state.progressTimer = null;
    const workId = state.progressWorkId;
    const payload = state.progressPayload;
    if (!workId || !payload) return;
    state.progressWorkId = null;
    state.progressPayload = null;
    const requestPayload = {};
    ["media", "chapter_id", "paragraph_index", "progress_percent", "audio_position_seconds", "audio_duration_seconds"].forEach((key) => {
      if (payload[key] !== undefined && payload[key] !== null) requestPayload[key] = payload[key];
    });
    if (Array.isArray(payload.bookmarks)) requestPayload.bookmarks = payload.bookmarks;
    try {
      await requestJson(`${API_ROOT}/works/${encodeURIComponent(workId)}/progress`, {
        method: "PATCH",
        body: JSON.stringify(requestPayload),
        keepalive: true,
      });
    } catch (_error) {
      state.progressWorkId = workId;
      state.progressPayload = { ...payload, ...(state.progressPayload || {}) };
    }
  }

  function stripMarkup(value) {
    const raw = text(value);
    if (!raw) return "";
    if (!/<[a-z][\s\S]*>/i.test(raw)) return raw;
    try {
      return new DOMParser().parseFromString(raw, "text/html").body.textContent || "";
    } catch (_error) {
      return raw.replace(/<[^>]+>/g, " ");
    }
  }

  function chapterText(chapter) {
    if (!chapter || typeof chapter !== "object") return text(chapter);
    const paragraphs = firstValue(chapter, ["paragraphs", "blocks"], null);
    if (Array.isArray(paragraphs)) {
      return paragraphs.map((item) => text(typeof item === "object" ? firstValue(item, ["text", "content"], "") : item)).filter(Boolean).join("\n\n");
    }
    return text(firstValue(chapter, ["text", "content", "body", "plain_text", "html"], ""));
  }

  function normalizeContent(payload, work) {
    const source = payload?.data && typeof payload.data === "object" ? payload.data : payload;
    const contentObject = source?.content && typeof source.content === "object" && !Array.isArray(source.content) ? source.content : null;
    const chapterSource = firstValue(source || {}, ["chapters", "sections"], contentObject?.chapters || contentObject?.sections || []);
    const chapters = asArray(chapterSource).map((chapter, index) => {
      const object = chapter && typeof chapter === "object" ? chapter : { text: chapter };
      return {
        id: text(firstValue(object, ["id", "chapter_id", "slug"], index + 1)),
        title: text(firstValue(object, ["title", "name", "heading"], ""), `Luku ${index + 1}`),
        text: stripMarkup(chapterText(object)),
        audioStart: Math.max(0, finiteNumber(firstValue(object, ["audio_start_seconds", "audio_start"], 0))),
        audioEnd: Math.max(0, finiteNumber(firstValue(object, ["audio_end_seconds", "audio_end"], 0))),
      };
    }).filter((chapter) => chapter.text || chapter.title);

    if (chapters.length) return chapters;
    const rawContent = typeof source?.content === "string"
      ? source.content
      : firstValue(source || {}, ["text", "plain_text", "body", "html"], contentObject?.text || contentObject?.body || "");
    const content = stripMarkup(rawContent);
    if (!content) return [];
    return [{ id: "1", title: work?.title || "Teos", text: content, audioStart: 0, audioEnd: 0 }];
  }

  function paragraphsFromText(value) {
    const normalized = text(value).replace(/\r\n?/g, "\n").trim();
    if (!normalized) return [];
    const blocks = normalized.split(/\n\s*\n+/).map((part) => part.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
    return blocks.length ? blocks : [normalized];
  }

  function renderChapterList() {
    const items = state.chapters.map((chapter, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "reader-chapter-action";
      button.classList.toggle("is-current", index === state.chapterIndex);
      button.setAttribute("aria-current", index === state.chapterIndex ? "true" : "false");
      button.append(makeIcon("book-open"));
      const label = document.createElement("span");
      label.textContent = chapter.title;
      button.append(label);
      button.addEventListener("click", () => {
        renderChapter(index, { focus: true });
        closeReaderPanels();
      });
      item.append(button);
      return item;
    });
    elements["reader-chapter-list"].replaceChildren(...items);
  }

  function currentReaderProgress(chapterProgress = 0) {
    if (!state.chapters.length) return 0;
    return clamp(((state.chapterIndex + clamp(chapterProgress, 0, 1)) / state.chapters.length) * 100, 0, 100);
  }

  function renderChapter(index, options = {}) {
    if (!state.chapters.length) return;
    state.chapterIndex = clamp(Math.floor(index), 0, state.chapters.length - 1);
    const chapter = state.chapters[state.chapterIndex];
    elements["reader-chapter-title"].textContent = chapter.title;
    elements["audio-chapter"].textContent = hasAudioTimingManifest(state.audioWork) ? chapter.title : "Äänite";
    const paragraphs = paragraphsFromText(chapter.text).map((paragraphText, paragraphIndex) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = paragraphText;
      paragraph.dataset.paragraphIndex = String(paragraphIndex);
      return paragraph;
    });
    if (!paragraphs.length) {
      const paragraph = document.createElement("p");
      paragraph.textContent = "Tämän luvun tekstiä ei ole saatavilla.";
      paragraphs.push(paragraph);
    }
    elements["reader-text"].replaceChildren(...paragraphs);
    renderChapterList();
    const initialFraction = clamp(finiteNumber(options.scrollFraction, 0), 0, 1);
    const initialParagraph = Math.max(0, Math.floor(finiteNumber(options.paragraphIndex, 0)));
    const percent = currentReaderProgress(initialFraction);
    elements["reader-progress-percent"].textContent = `${Math.round(percent)} %`;
    syncReaderBookmark(initialParagraph);

    state.restoreReaderScroll = true;
    requestAnimationFrame(() => {
      const paragraph = elements["reader-text"].querySelector(`[data-paragraph-index="${initialParagraph}"]`);
      if (initialParagraph > 0 && paragraph) {
        elements["reader-scroll"].scrollTop = Math.max(0, paragraph.offsetTop - elements["reader-scroll"].clientHeight * 0.18);
      } else {
        const maximum = Math.max(0, elements["reader-scroll"].scrollHeight - elements["reader-scroll"].clientHeight);
        elements["reader-scroll"].scrollTop = maximum * initialFraction;
      }
      state.restoreReaderScroll = false;
      if (options.focus) elements["reader-chapter-title"].focus?.({ preventScroll: true });
    });

    const progress = {
      chapter_id: chapter.id,
      paragraph_index: initialParagraph,
      progress_percent: percent,
    };
    queueProgress(state.selectedWork?.id, progress);
  }

  function applyReaderSettings() {
    const reader = elements["library-reader"];
    reader.dataset.fontSize = state.readerSettings.fontSize;
    reader.dataset.lineHeight = state.readerSettings.lineHeight;
    reader.dataset.columnWidth = state.readerSettings.columnWidth;
    reader.dataset.readerTheme = state.readerSettings.theme;
    syncAudioTimingControls();
    elements["reader-follow-audio"].checked = Boolean(state.readerSettings.followAudio);

    document.querySelectorAll("button[data-line-height]").forEach((button) => {
      const selected = button.dataset.lineHeight === state.readerSettings.lineHeight;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    document.querySelectorAll("button[data-column-width]").forEach((button) => {
      const selected = button.dataset.columnWidth === state.readerSettings.columnWidth;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    document.querySelectorAll("button[data-reader-theme]").forEach((button) => {
      const selected = button.dataset.readerTheme === state.readerSettings.theme;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    persistReaderSettings();
  }

  function loadReaderSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(READER_SETTINGS_KEY) || "null");
      if (!saved || typeof saved !== "object") return;
      if (FONT_SIZES.includes(saved.fontSize)) state.readerSettings.fontSize = saved.fontSize;
      if (["compact", "comfortable", "relaxed"].includes(saved.lineHeight)) state.readerSettings.lineHeight = saved.lineHeight;
      if (["narrow", "medium", "wide"].includes(saved.columnWidth)) state.readerSettings.columnWidth = saved.columnWidth;
      if (["light", "sepia", "dark"].includes(saved.theme)) state.readerSettings.theme = saved.theme;
      state.readerSettings.followAudio = AUDIO_TIMING_FEATURE_ENABLED && Boolean(saved.followAudio);
    } catch (_error) {
      // Keep accessible defaults.
    }
  }

  function persistReaderSettings() {
    try {
      localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(state.readerSettings));
    } catch (_error) {
      // Reader remains functional without local storage.
    }
  }

  function changeFontSize(delta) {
    const current = FONT_SIZES.indexOf(state.readerSettings.fontSize);
    state.readerSettings.fontSize = FONT_SIZES[clamp(current + delta, 0, FONT_SIZES.length - 1)];
    applyReaderSettings();
  }

  function isMobileReader() {
    return window.matchMedia("(max-width: 860px)").matches;
  }

  function syncReaderBackdrop() {
    const open = isMobileReader() && (
      elements["reader-contents"].classList.contains("is-open") ||
      elements["reader-settings"].classList.contains("is-open")
    );
    elements["reader-backdrop"].hidden = !open;
  }

  function toggleReaderPanel(panelName) {
    const target = panelName === "contents" ? elements["reader-contents"] : elements["reader-settings"];
    const other = panelName === "contents" ? elements["reader-settings"] : elements["reader-contents"];
    if (isMobileReader()) {
      const willOpen = !target.classList.contains("is-open");
      other.classList.remove("is-open");
      target.classList.toggle("is-open", willOpen);
      elements["reader-contents-toggle"].setAttribute("aria-expanded", String(elements["reader-contents"].classList.contains("is-open")));
      elements["reader-settings-toggle"].setAttribute("aria-expanded", String(elements["reader-settings"].classList.contains("is-open")));
    } else {
      const className = panelName === "contents" ? "contents-closed" : "settings-closed";
      const closed = elements["library-reader"].classList.toggle(className);
      const button = panelName === "contents" ? elements["reader-contents-toggle"] : elements["reader-settings-toggle"];
      button.setAttribute("aria-expanded", String(!closed));
      button.classList.toggle("is-active", !closed);
    }
    syncReaderBackdrop();
  }

  function closeReaderPanels() {
    elements["reader-contents"].classList.remove("is-open");
    elements["reader-settings"].classList.remove("is-open");
    if (isMobileReader()) {
      elements["reader-contents-toggle"].setAttribute("aria-expanded", "false");
      elements["reader-settings-toggle"].setAttribute("aria-expanded", "false");
    }
    syncReaderBackdrop();
  }

  async function openReader(work = state.selectedWork) {
    if (!work?.id || !work.hasText || work.status === "draft") return;
    state.selectedWork = work;
    elements["reader-work-title"].textContent = work.title;
    elements["reader-work-author"].textContent = work.author;
    elements["reader-chapter-title"].textContent = "Ladataan…";
    const loading = document.createElement("p");
    loading.textContent = "Teoksen sisältöä ladataan…";
    elements["reader-text"].replaceChildren(loading);
    elements["library-reader"].hidden = false;
    document.body.classList.add("is-reading");
    closeReaderPanels();
    applyReaderSettings();
    elements["reader-back"].focus({ preventScroll: true });

    try {
      const [contentPayload, progress] = await Promise.all([
        requestJson(`${API_ROOT}/works/${encodeURIComponent(work.id)}/content`),
        loadProgress(work.id),
      ]);
      if (state.selectedWork?.id !== work.id) return;
      state.selectedProgress = progress;
      state.chapters = normalizeContent(contentPayload, work);
      if (!state.chapters.length) {
        throw new LibraryApiError("Teoksen luettavaa sisältöä ei löytynyt.", 404, contentPayload);
      }
      const byIdIndex = progress.chapterId ? state.chapters.findIndex((chapter) => chapter.id === progress.chapterId) : -1;
      const startIndex = byIdIndex >= 0 ? byIdIndex : clamp(progress.chapterIndex, 0, state.chapters.length - 1);
      renderChapter(startIndex, { scrollFraction: progress.chapterProgress, paragraphIndex: progress.paragraphIndex });
    } catch (error) {
      elements["reader-chapter-title"].textContent = "Sisältöä ei voitu avata";
      const message = document.createElement("p");
      message.textContent = errorMessage(error, "Teoksen sisällön lataaminen epäonnistui.");
      elements["reader-text"].replaceChildren(message);
      showNotice(message.textContent);
    }
  }

  function closeReader() {
    if (elements["library-reader"].hidden) return;
    flushProgress();
    closeReaderPanels();
    elements["library-reader"].hidden = true;
    document.body.classList.remove("is-reading");
    if (!elements["library-detail"].hidden) elements["detail-read"].focus();
    else elements["library-results"].focus({ preventScroll: true });
  }

  function toggleBookmark() {
    const work = state.selectedWork;
    const chapter = state.chapters[state.chapterIndex];
    if (!work || !chapter) return;
    const paragraphIndex = currentParagraphIndex();
    const existingBookmarks = state.selectedProgress?.bookmarks || [];
    const isCurrentBookmark = existingBookmarks.some((bookmark) => bookmarkMatches(bookmark, chapter.id, paragraphIndex));
    const next = !isCurrentBookmark;
    const bookmarks = next
      ? [...existingBookmarks.slice(-99), {
        chapter_id: chapter.id,
        paragraph_index: paragraphIndex,
        audio_position_seconds: elements["library-audio"].src ? elements["library-audio"].currentTime : 0,
        label: chapter.title,
        note: "",
      }]
      : existingBookmarks.filter((bookmark) => !bookmarkMatches(bookmark, chapter.id, paragraphIndex));
    if (!state.selectedProgress) state.selectedProgress = normalizeProgress({});
    state.selectedProgress.bookmarks = bookmarks;
    syncReaderBookmark(paragraphIndex);
    queueProgress(work.id, { bookmarks });
    showNotice(next ? "Kirjanmerkki lisättiin." : "Kirjanmerkki poistettiin.");
  }

  function bookmarkMatches(bookmark, chapterId, paragraphIndex) {
    return text(bookmark?.chapter_id) === text(chapterId)
      && Math.max(0, Math.floor(finiteNumber(bookmark?.paragraph_index, 0))) === paragraphIndex;
  }

  function syncReaderBookmark(paragraphIndex = currentParagraphIndex()) {
    const chapter = state.chapters[state.chapterIndex];
    const bookmarks = state.selectedProgress?.bookmarks || [];
    const bookmarked = Boolean(chapter && bookmarks.some((bookmark) => bookmarkMatches(bookmark, chapter.id, paragraphIndex)));
    elements["reader-bookmark"].setAttribute("aria-pressed", String(bookmarked));
    elements["reader-bookmark"].classList.toggle("is-active", bookmarked);
  }

  function currentParagraphIndex() {
    const scrollerRect = elements["reader-scroll"].getBoundingClientRect();
    const readingLine = scrollerRect.top + scrollerRect.height * 0.28;
    const paragraphs = [...elements["reader-text"].querySelectorAll("[data-paragraph-index]")];
    let index = 0;
    for (const paragraph of paragraphs) {
      if (paragraph.getBoundingClientRect().top > readingLine) break;
      index = Math.max(0, Math.floor(finiteNumber(paragraph.dataset.paragraphIndex, index)));
    }
    return index;
  }

  function handleReaderScroll() {
    if (state.restoreReaderScroll || !state.selectedWork || !state.chapters.length) return;
    const scroller = elements["reader-scroll"];
    const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const fraction = maximum ? clamp(scroller.scrollTop / maximum, 0, 1) : 1;
    const chapter = state.chapters[state.chapterIndex];
    const percent = currentReaderProgress(fraction);
    const paragraphIndex = currentParagraphIndex();
    elements["reader-progress-percent"].textContent = `${Math.round(percent)} %`;
    syncReaderBookmark(paragraphIndex);
    queueProgress(state.selectedWork.id, {
      chapter_id: chapter.id,
      paragraph_index: paragraphIndex,
      progress_percent: percent,
    });
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Math.floor(finiteNumber(seconds)));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const rest = safe % 60;
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${minutes}:${String(rest).padStart(2, "0")}`;
  }

  function setPlayIcon(isPlaying) {
    elements["audio-play"].replaceChildren(makeIcon(isPlaying ? "pause" : "play"));
    elements["audio-play"].setAttribute("aria-label", isPlaying ? "Keskeytä" : "Toista");
  }

  function hasAudioTimingManifest(work) {
    if (!AUDIO_TIMING_FEATURE_ENABLED || !work?.raw) return false;
    return Boolean(work.raw.audio_timing_manifest || work.raw.timing_manifest);
  }

  function syncAudioTimingControls() {
    const audioTimingAvailable = hasAudioTimingManifest(state.audioWork);
    const readerTimingAvailable = audioTimingAvailable
      && state.audioWork?.id === state.selectedWork?.id
      && !elements["library-reader"].hidden;
    elements["audio-previous"].hidden = !audioTimingAvailable;
    elements["audio-previous"].disabled = !audioTimingAvailable;
    elements["audio-next"].hidden = !audioTimingAvailable;
    elements["audio-next"].disabled = !audioTimingAvailable;
    elements["reader-follow-audio-setting"].hidden = !readerTimingAvailable;
    elements["reader-follow-audio"].disabled = !readerTimingAvailable;
    if (!readerTimingAvailable) {
      state.readerSettings.followAudio = false;
      elements["reader-follow-audio"].checked = false;
    }
  }

  function renderAudioWork(work) {
    elements["audio-title"].textContent = work.title;
    elements["audio-chapter"].textContent = hasAudioTimingManifest(work)
      ? state.chapters[state.chapterIndex]?.title || "Äänite"
      : "Äänite";
    renderCover(elements["audio-cover"], work, { eager: true });
    syncAudioTimingControls();
  }

  async function startAudio(work = state.selectedWork, autoplay = false) {
    if (!work?.id || !work.hasAudio || work.status === "draft") return;
    try {
      const freshPayload = await requestJson(`${API_ROOT}/works/${encodeURIComponent(work.id)}`);
      work = mergeWork(work, unwrapWork(freshPayload));
      if (state.selectedWork?.id === work.id) state.selectedWork = work;
    } catch (_error) {
      // A still-valid signed URL from the list response can remain usable.
    }
    const source = workAudioUrl(work);
    if (!source) {
      showNotice("Äänitteen turvallista toistolinkkiä ei saatu palvelimelta.");
      return;
    }

    const sameWork = state.audioWork?.id === work.id;
    if (!sameWork) {
      state.audioRefreshWorkId = null;
      state.audioRefreshAttemptedAt = 0;
    }
    state.audioWork = work;
    elements["library-audio-dock"].hidden = false;
    document.body.classList.add("has-audio");
    renderAudioWork(work);

    if (!sameWork || elements["library-audio"].src !== source) {
      const progress = await loadProgress(work.id);
      state.pendingAudioPosition = progress.audioPosition;
      elements["library-audio"].src = source;
      elements["library-audio"].load();
    }

    if (autoplay) {
      state.audioIntentPlaying = true;
      try {
        await elements["library-audio"].play();
      } catch (_error) {
        state.audioIntentPlaying = false;
        showNotice("Selain odottaa, että käynnistät äänitteen toistopainikkeesta.");
      }
    }
  }

  async function toggleAudio() {
    const audio = elements["library-audio"];
    if (!audio.src && state.selectedWork?.hasAudio) {
      await startAudio(state.selectedWork, true);
      return;
    }
    if (!audio.src) return;
    if (audio.paused) {
      state.audioIntentPlaying = true;
      try {
        await audio.play();
      } catch (_error) {
        state.audioIntentPlaying = false;
        showNotice("Äänitettä ei voitu käynnistää.");
      }
    } else {
      state.audioIntentPlaying = false;
      audio.pause();
    }
  }

  function seekAudio(delta) {
    const audio = elements["library-audio"];
    if (!audio.src) return;
    const maximum = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    audio.currentTime = clamp(audio.currentTime + delta, 0, maximum);
  }

  function syncAudioParagraph() {
    if (!hasAudioTimingManifest(state.audioWork) || !state.readerSettings.followAudio || elements["library-reader"].hidden) return;
    const paragraphs = [...elements["reader-text"].querySelectorAll("p")];
    if (!paragraphs.length || !Number.isFinite(elements["library-audio"].duration) || !elements["library-audio"].duration) return;
    const fraction = clamp(elements["library-audio"].currentTime / elements["library-audio"].duration, 0, 0.9999);
    const target = Math.floor(fraction * paragraphs.length);
    paragraphs.forEach((paragraph, index) => paragraph.classList.toggle("is-audio-current", index === target));
  }

  function handleAudioTimeUpdate() {
    const audio = elements["library-audio"];
    elements["audio-time-current"].textContent = formatTime(audio.currentTime);
    elements["audio-time-duration"].textContent = formatTime(audio.duration);
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      elements["audio-seek"].max = String(audio.duration);
      if (document.activeElement !== elements["audio-seek"]) elements["audio-seek"].value = String(audio.currentTime);
      elements["audio-seek"].style.setProperty("--seek-progress", `${(audio.currentTime / audio.duration) * 100}%`);
    }
    syncAudioParagraph();

    if (state.audioWork && Math.abs(audio.currentTime - state.audioLastSavedAt) >= 5) {
      state.audioLastSavedAt = audio.currentTime;
      const percent = Number.isFinite(audio.duration) && audio.duration > 0 ? (audio.currentTime / audio.duration) * 100 : 0;
      queueProgress(state.audioWork.id, {
        media: "audio",
        audio_position_seconds: audio.currentTime,
        audio_duration_seconds: Number.isFinite(audio.duration) ? audio.duration : 0,
        progress_percent: percent,
      });
    }
  }

  function handleAudioLoaded() {
    const audio = elements["library-audio"];
    elements["audio-seek"].max = String(Number.isFinite(audio.duration) ? audio.duration : 100);
    elements["audio-time-duration"].textContent = formatTime(audio.duration);
    if (state.pendingAudioPosition > 0 && state.pendingAudioPosition < audio.duration) {
      audio.currentTime = state.pendingAudioPosition;
    }
    state.pendingAudioPosition = 0;
    if (state.audioResumeAfterLoad) {
      state.audioResumeAfterLoad = false;
      state.audioIntentPlaying = true;
      audio.play().catch(() => {
        state.audioIntentPlaying = false;
        showNotice("Äänitteen toisto odottaa toistopainikkeen painamista.");
      });
    }
  }

  async function handleAudioError() {
    const work = state.audioWork;
    if (!work?.id || state.audioRefreshInFlight) return;
    const now = Date.now();
    const throttled = state.audioRefreshWorkId === work.id && now - state.audioRefreshAttemptedAt < 60_000;
    if (throttled) {
      showNotice("Äänitettä ei voitu ladata. Tarkista yhteys ja yritä hetken kuluttua uudelleen.");
      return;
    }

    const audio = elements["library-audio"];
    const position = Math.max(0, finiteNumber(audio.currentTime, state.selectedProgress?.audioPosition || 0));
    const shouldResume = state.audioIntentPlaying;
    state.audioRefreshInFlight = true;
    state.audioRefreshWorkId = work.id;
    state.audioRefreshAttemptedAt = now;
    try {
      const payload = await requestJson(`${API_ROOT}/works/${encodeURIComponent(work.id)}`);
      const freshWork = mergeWork(work, unwrapWork(payload));
      const freshSource = workAudioUrl(freshWork);
      if (!freshSource) throw new LibraryApiError("Uutta toistolinkkiä ei saatu.", 404, payload);
      state.audioWork = freshWork;
      if (state.selectedWork?.id === freshWork.id) state.selectedWork = freshWork;
      state.pendingAudioPosition = position;
      state.audioResumeAfterLoad = shouldResume;
      renderAudioWork(freshWork);
      audio.src = freshSource;
      audio.load();
    } catch (error) {
      state.audioResumeAfterLoad = false;
      state.audioIntentPlaying = false;
      showNotice(errorMessage(error, "Äänitteen turvallisen toistolinkin uusiminen epäonnistui."));
    } finally {
      state.audioRefreshInFlight = false;
    }
  }

  function changeAudioChapter(delta) {
    if (!hasAudioTimingManifest(state.audioWork)) return;
    if (!state.chapters.length || elements["library-reader"].hidden) {
      if (delta < 0) elements["library-audio"].currentTime = 0;
      return;
    }
    renderChapter(state.chapterIndex + delta, { focus: true });
  }

  function toggleMute() {
    const audio = elements["library-audio"];
    audio.muted = !audio.muted;
    elements["audio-mute"].replaceChildren(makeIcon(audio.muted || audio.volume === 0 ? "speaker-slash" : "speaker-high"));
    elements["audio-mute"].setAttribute("aria-label", audio.muted ? "Poista mykistys" : "Mykistä");
  }

  function resetAddForm() {
    elements["library-add-form"].reset();
    state.draftWork = null;
    state.reviewThemes = [];
    state.addBusy = false;
    elements["add-work-notice"].hidden = true;
    elements["add-work-source-step"].hidden = false;
    elements["add-work-classification-step"].hidden = true;
    elements["add-work-text"].closest("label").hidden = false;
    elements["add-work-file"].closest("label").hidden = true;
    elements["add-work-file-name"].textContent = "Ei valittua tiedostoa";
    elements["add-work-rights"].checked = false;
    elements["thema-custom-input"].value = "";
    setAddSource("import");
    updateProjectCard();
  }

  function showDialogNotice(message) {
    elements["add-work-notice"].textContent = message;
    elements["add-work-notice"].hidden = false;
  }

  function setAddBusy(busy) {
    state.addBusy = busy;
    elements["library-add-form"].setAttribute("aria-busy", String(busy));
    elements["library-add-form"].querySelectorAll("button, input, select, textarea").forEach((control) => {
      if (control.id === "add-work-close") return;
      control.disabled = busy;
    });
    if (!busy) setAddSource(state.addSource);
  }

  function setAddSource(source) {
    state.addSource = source === "project" ? "project" : "import";
    const importSelected = state.addSource === "import";
    elements["add-tab-import"].setAttribute("aria-selected", String(importSelected));
    elements["add-tab-import"].tabIndex = importSelected ? 0 : -1;
    elements["add-tab-project"].setAttribute("aria-selected", String(!importSelected));
    elements["add-tab-project"].tabIndex = importSelected ? -1 : 0;
    elements["add-panel-import"].hidden = !importSelected;
    elements["add-panel-project"].hidden = importSelected;
    [elements["add-work-cover"], elements["add-work-audio"]].forEach((input) => {
      input.disabled = !importSelected;
      input.closest("label").hidden = !importSelected;
    });
  }

  function setContentSource(source) {
    const textSource = source !== "file";
    elements["add-work-text"].closest("label").hidden = !textSource;
    elements["add-work-file"].closest("label").hidden = textSource;
  }

  function updateProjectCard() {
    const context = state.projectContext;
    elements["add-project-id-value"].value = context.projectId || "";
    elements["add-project-name"].textContent = context.projectTitle || (context.projectId ? "Valittu SkriptLab-projekti" : "Projektia ei ole valittu");
    elements["add-project-id"].textContent = context.projectId
      ? `Projektitunnus ${context.projectId}`
      : "Avaa projekti työtilassa ennen julkaisemista.";
  }

  function openAddDialog(options = {}) {
    if (!canPublish()) {
      showNotice("Käyttäjäryhmälläsi on luku- ja kuunteluoikeus, mutta ei teosten julkaisuoikeutta.");
      return;
    }
    state.lastModalTrigger = document.activeElement;
    resetAddForm();
    if (options.projectId !== undefined) {
      setProjectContext({
        projectId: options.projectId,
        projectTitle: options.projectTitle,
        projectAuthor: options.projectAuthor,
        source: options.source,
        publicationId: options.publicationId,
        packageId: options.packageId,
        editionId: options.editionId,
      });
    }
    setAddSource(options.sourceTab === "project" || options.projectId ? "project" : "import");
    updateProjectCard();
    if (!elements["library-add-dialog"].open) elements["library-add-dialog"].showModal();
    requestAnimationFrame(() => {
      const target = state.addSource === "project" ? elements["add-tab-project"] : elements["add-tab-import"];
      target.focus();
    });
  }

  function closeAddDialog() {
    if (elements["library-add-dialog"].open) elements["library-add-dialog"].close();
    const restore = state.lastModalTrigger;
    resetAddForm();
    restore?.focus?.();
  }

  function metadataFromForm() {
    return {
      title: text(elements["add-work-title-input"].value),
      author: text(elements["add-work-author-input"].value),
      description: text(elements["add-work-description-input"].value),
      language: text(elements["add-work-language"].value),
    };
  }

  function appendOptional(form, key, value) {
    if (value !== null && value !== undefined && value !== "") form.append(key, String(value));
  }

  function validateImportSource() {
    const source = document.querySelector('input[name="content_source"]:checked')?.value || "text";
    elements["add-work-text"].setCustomValidity("");
    elements["add-work-file"].setCustomValidity("");
    if (source === "text" && !text(elements["add-work-text"].value)) {
      elements["add-work-text"].setCustomValidity("Liitä teoksen teksti.");
      elements["add-work-text"].reportValidity();
      return null;
    }
    if (source === "file" && !elements["add-work-file"].files?.[0]) {
      elements["add-work-file"].setCustomValidity("Valitse teostiedosto.");
      elements["add-work-file"].reportValidity();
      return null;
    }
    return source;
  }

  function draftFileName(title) {
    const base = text(title, "teos")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 80) || "teos";
    return `${base}.txt`;
  }

  async function createImportDraft(metadata) {
    const contentSource = validateImportSource();
    if (!contentSource) return null;
    const form = new FormData();
    if (contentSource === "text") {
      const blob = new Blob([elements["add-work-text"].value], { type: "text/plain;charset=utf-8" });
      form.append("file", blob, draftFileName(metadata.title));
    } else {
      form.append("file", elements["add-work-file"].files[0]);
    }
    appendOptional(form, "title", metadata.title);
    appendOptional(form, "author", metadata.author);
    appendOptional(form, "description", metadata.description);
    appendOptional(form, "language", metadata.language);
    if (elements["add-work-cover"].files?.[0]) form.append("cover", elements["add-work-cover"].files[0]);
    if (elements["add-work-audio"].files?.[0]) form.append("audio", elements["add-work-audio"].files[0]);
    form.append("status", "draft");
    form.append("rights_confirmed", "false");
    return requestJson(`${API_ROOT}/works/import`, { method: "POST", body: form });
  }

  async function createProjectDraft(metadata) {
    const projectId = text(state.projectContext.projectId);
    if (!projectId) {
      showDialogNotice("Valitse SkriptLab-projekti ennen jatkamista.");
      elements["add-tab-project"].focus();
      return null;
    }
    const payload = {
      project_id: projectId,
      status: "draft",
      rights_confirmed: false,
      ...metadata,
    };
    ["publicationId", "packageId", "editionId"].forEach((key) => {
      if (!state.projectContext[key]) return;
      const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
      payload[snakeKey] = state.projectContext[key];
    });
    if (state.projectContext.source) payload.source = state.projectContext.source;
    Object.keys(payload).forEach((key) => {
      if (payload[key] === "") delete payload[key];
    });
    return requestJson(`${API_ROOT}/works/from-project`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function refreshDraftWork(work) {
    try {
      const payload = await requestJson(`${API_ROOT}/works/${encodeURIComponent(work.id)}`);
      return mergeWork(work, unwrapWork(payload));
    } catch (_error) {
      return work;
    }
  }

  async function updateExistingDraft(metadata) {
    const update = {
      description: metadata.description,
      status: "draft",
      rights_confirmed: false,
    };
    if (metadata.title) update.title = metadata.title;
    if (metadata.author) update.author = metadata.author;
    if (metadata.language) update.language = metadata.language;
    const payload = await requestJson(`${API_ROOT}/works/${encodeURIComponent(state.draftWork.id)}`, {
      method: "PATCH",
      body: JSON.stringify(update),
    });
    return normalizeWork(unwrapWork(payload));
  }

  async function handleAddSubmit(event) {
    event.preventDefault();
    if (state.addBusy || !canPublish()) return;
    const intent = event.submitter?.dataset.addIntent || "review";
    state.addIntent = intent;
    elements["add-work-notice"].hidden = true;
    const metadata = metadataFromForm();
    setAddBusy(true);

    try {
      let payload;
      if (state.draftWork?.id) {
        payload = await updateExistingDraft(metadata);
      } else {
        payload = state.addSource === "project"
          ? await createProjectDraft(metadata)
          : await createImportDraft(metadata);
      }
      if (!payload) return;
      let work = payload.raw ? payload : normalizeWork(unwrapWork(payload));
      if (!work.id) throw new LibraryApiError("Palvelin ei palauttanut luonnoksen tunnistetta.", 500, payload);
      work = await refreshDraftWork(work);
      state.draftWork = work;

      if (intent === "draft") {
        closeAddDialog();
        showNotice("Teos tallennettiin luonnokseksi. Thema-ehdotukset voi tarkistaa Omat teokset -näkymässä.");
        await loadWorks({ silent: true });
        return;
      }
      showClassificationStep(work);
    } catch (error) {
      showDialogNotice(errorMessage(error, "Teoksen luonnoksen tallentaminen epäonnistui."));
    } finally {
      setAddBusy(false);
    }
  }

  function reviewThemeSource(work) {
    const reviewItems = mergeThemes(work.suggestions, work.themes);
    return reviewItems.map((item, index) => ({ ...item, selected: true, key: `${item.code}|${item.label}|${index}` }));
  }

  function renderReviewThemes() {
    const nodes = state.reviewThemes.map((theme, index) => {
      const label = document.createElement("label");
      label.className = "thema-choice";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = theme.selected;
      input.dataset.themeIndex = String(index);
      input.addEventListener("change", () => {
        state.reviewThemes[index].selected = input.checked;
      });
      const card = document.createElement("span");
      card.append(makeIcon("check"));
      const strong = document.createElement("strong");
      strong.textContent = theme.code || "Automaattinen ehdotus";
      const small = document.createElement("small");
      small.textContent = theme.label || theme.code;
      card.append(strong, small);
      label.append(input, card);
      return label;
    });
    elements["thema-review-list"].replaceChildren(...nodes);
    elements["thema-review-empty"].hidden = nodes.length > 0;
  }

  function showClassificationStep(work) {
    state.draftWork = work;
    state.reviewThemes = reviewThemeSource(work);
    elements["add-work-source-step"].hidden = true;
    elements["add-work-classification-step"].hidden = false;
    elements["add-work-title"].textContent = "Julkaise teos";
    elements["add-work-description"].textContent = `${work.title} on tallennettu luonnokseksi.`;
    elements["add-work-rights"].checked = false;
    renderReviewThemes();
    requestAnimationFrame(() => elements["classification-title"].focus?.({ preventScroll: true }));
  }

  function addCustomTheme() {
    const raw = text(elements["thema-custom-input"].value);
    if (!raw) {
      elements["thema-custom-input"].focus();
      return;
    }
    const normalized = normalizeThema(raw)[0] || { code: "", label: raw };
    state.reviewThemes.push({ ...normalized, selected: true, key: `custom-${Date.now()}` });
    elements["thema-custom-input"].value = "";
    renderReviewThemes();
    elements["thema-review-list"].lastElementChild?.querySelector("input")?.focus();
  }

  function selectedReviewThemes() {
    return state.reviewThemes
      .filter((theme) => theme.selected)
      .map((theme) => ({
        code: text(theme.code).toUpperCase(),
        label: theme.label || theme.code,
        primary: Boolean(theme.primary),
      }));
  }

  async function publishDraft() {
    const work = state.draftWork;
    if (!work?.id || state.addBusy || !canPublish()) return;
    elements["add-work-rights"].setCustomValidity("");
    if (!elements["add-work-rights"].checked) {
      elements["add-work-rights"].setCustomValidity("Vahvista, että sinulla on oikeus jakaa teos.");
      elements["add-work-rights"].reportValidity();
      elements["add-work-rights"].focus();
      return;
    }

    setAddBusy(true);
    try {
      const reviewed = selectedReviewThemes();
      const subjects = reviewed.filter((theme) => /^[A-Z][A-Z0-9]{2,6}$/.test(theme.code));
      if (subjects.length && !subjects.some((theme) => !theme.code.startsWith("FX"))) {
        showDialogNotice("Valitse vähintään yksi varsinainen Thema-aiheluokka. FX-teemakoodi ei voi olla ainoa luokka.");
        return;
      }
      let primaryAssigned = false;
      const themaSubjects = subjects.map((theme) => {
        const primary = !primaryAssigned && !theme.code.startsWith("FX") && (theme.primary || !subjects.some((item) => item.primary && !item.code.startsWith("FX")));
        if (primary) primaryAssigned = true;
        return { code: theme.code, label: theme.label, primary };
      });
      const themeLabels = [...new Set(reviewed
        .filter((theme) => !/^[A-Z][A-Z0-9]{2,6}$/.test(theme.code))
        .map((theme) => text(theme.label))
        .filter(Boolean))];
      const payload = await requestJson(`${API_ROOT}/works/${encodeURIComponent(work.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "published",
          rights_confirmed: true,
          thema_subjects: themaSubjects,
          theme_labels: themeLabels,
        }),
      });
      const published = normalizeWork(unwrapWork(payload));
      closeAddDialog();
      showNotice(`“${published.title || work.title}” julkaistiin kirjastoon.`);
      await loadWorks({ silent: true });
    } catch (error) {
      showDialogNotice(errorMessage(error, "Teoksen julkaiseminen epäonnistui."));
    } finally {
      setAddBusy(false);
    }
  }

  function keepDraft() {
    const title = state.draftWork?.title || "Teos";
    closeAddDialog();
    showNotice(`“${title}” säilytettiin luonnoksena.`);
    loadWorks({ silent: true });
  }

  async function openDraftReview(work) {
    if (!canPublish()) return;
    state.lastModalTrigger = document.activeElement;
    resetAddForm();
    if (!elements["library-add-dialog"].open) elements["library-add-dialog"].showModal();
    elements["add-work-title"].textContent = "Ladataan luonnosta…";
    try {
      const payload = await requestJson(`${API_ROOT}/works/${encodeURIComponent(work.id)}`);
      const full = mergeWork(work, unwrapWork(payload));
      showClassificationStep(full);
    } catch (error) {
      showDialogNotice(errorMessage(error, "Luonnoksen tietojen lataaminen epäonnistui."));
    }
  }

  function setProjectContext(context = {}) {
    if (Object.prototype.hasOwnProperty.call(context, "projectId")) {
      state.projectContext.projectId = safePrimitive(context.projectId, 120) || null;
    }
    if (Object.prototype.hasOwnProperty.call(context, "projectTitle")) {
      state.projectContext.projectTitle = safePrimitive(context.projectTitle, 300);
    }
    if (Object.prototype.hasOwnProperty.call(context, "projectAuthor")) {
      state.projectContext.projectAuthor = safePrimitive(context.projectAuthor, 300);
    }
    if (Array.isArray(context.themaClasses)) {
      state.projectContext.themaClasses = normalizeThema(context.themaClasses);
    }
    if (["production", "correction-reprints", "shell"].includes(context.source)) {
      state.projectContext.source = context.source;
    }
    ["publicationId", "packageId", "editionId"].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(context, key)) {
        state.projectContext[key] = safePrimitive(context[key], 160) || null;
      }
    });
    updateProjectCard();
  }

  function handleShellMessage(event) {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    const data = event.data;
    if (!data || typeof data !== "object" || !SHELL_MESSAGE_TYPES.has(data.type)) return;

    if (data.type === "skriptlab:library-context-changed") {
      setProjectContext({
        projectId: data.projectId,
        projectTitle: data.projectTitle,
        projectAuthor: data.projectAuthor,
        themaClasses: data.themaClasses,
      });
      if (["light", "dark"].includes(data.theme)) document.body.dataset.shellTheme = data.theme;
      return;
    }

    setProjectContext({
      projectId: data.projectId,
      projectTitle: data.projectTitle,
      projectAuthor: data.projectAuthor,
      source: data.source,
      publicationId: data.publicationId,
      packageId: data.packageId,
      editionId: data.editionId,
    });
    openAddDialog({
      sourceTab: "project",
      projectId: data.projectId,
      projectTitle: data.projectTitle,
      projectAuthor: data.projectAuthor,
      source: data.source,
      publicationId: data.publicationId,
      packageId: data.packageId,
      editionId: data.editionId,
    });
  }

  function handleKeyboard(event) {
    const target = event.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;

    if (event.key === "Escape") {
      if (elements["library-add-dialog"].open) {
        event.preventDefault();
        closeAddDialog();
        return;
      }
      if (!elements["library-reader"].hidden) {
        if (elements["reader-contents"].classList.contains("is-open") || elements["reader-settings"].classList.contains("is-open")) {
          closeReaderPanels();
        } else {
          closeReader();
        }
        return;
      }
      if (!elements["library-detail"].hidden) closeDetail();
      return;
    }

    if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "/") {
      event.preventDefault();
      closeDetail(false);
      elements["library-search-input"].focus();
      return;
    }
    if (event.key.toLowerCase() === "k" && elements["library-audio"].src) {
      event.preventDefault();
      toggleAudio();
    } else if (event.key.toLowerCase() === "j" && elements["library-audio"].src) {
      event.preventDefault();
      seekAudio(-15);
    } else if (event.key.toLowerCase() === "l" && elements["library-audio"].src) {
      event.preventDefault();
      seekAudio(15);
    } else if (event.key.toLowerCase() === "m" && elements["library-audio"].src) {
      event.preventDefault();
      toggleMute();
    }
  }

  function bindEvents() {
    elements["library-notice-action"].addEventListener("click", () => state.noticeAction?.());
    elements["library-notice-close"].addEventListener("click", hideNotice);
    elements["library-add-work"].addEventListener("click", () => openAddDialog());
    elements["library-empty-add"].addEventListener("click", () => openAddDialog());
    elements["library-clear-filters"].addEventListener("click", clearFilters);

    elements["library-scope-tabs"].addEventListener("click", (event) => {
      const button = event.target.closest("[data-scope]");
      if (button) setScope(button.dataset.scope);
    });

    elements["library-search-form"].addEventListener("submit", (event) => {
      event.preventDefault();
      window.clearTimeout(state.searchTimer);
      state.query = text(elements["library-search-input"].value);
      elements["library-search-clear"].hidden = !state.query;
      loadWorks();
    });
    elements["library-search-input"].addEventListener("input", () => {
      state.query = text(elements["library-search-input"].value);
      elements["library-search-clear"].hidden = !state.query;
      window.clearTimeout(state.searchTimer);
      state.searchTimer = window.setTimeout(() => loadWorks({ silent: true }), 320);
    });
    elements["library-search-clear"].addEventListener("click", () => {
      elements["library-search-input"].value = "";
      state.query = "";
      elements["library-search-clear"].hidden = true;
      elements["library-search-input"].focus();
      loadWorks();
    });
    elements["library-media-filters"].addEventListener("click", (event) => {
      const button = event.target.closest("[data-media]");
      if (!button) return;
      state.media = button.dataset.media || "";
      document.querySelectorAll("[data-media]").forEach((item) => {
        const selected = item === button;
        item.classList.toggle("is-active", selected);
        item.setAttribute("aria-pressed", String(selected));
      });
      loadWorks();
    });
    elements["library-theme-filter"].addEventListener("change", () => {
      state.theme = elements["library-theme-filter"].value;
      loadWorks();
    });

    elements["detail-back"].addEventListener("click", () => closeDetail());
    elements["detail-read"].addEventListener("click", () => openReader());
    elements["detail-listen"].addEventListener("click", () => startAudio(state.selectedWork, true));
    elements["detail-delete"].addEventListener("click", deleteSelectedDraft);
    elements["detail-unpublish"].addEventListener("click", unpublishSelectedWork);
    elements["detail-review"].addEventListener("click", () => state.selectedWork && openDraftReview(state.selectedWork));

    elements["reader-back"].addEventListener("click", closeReader);
    elements["reader-close"].addEventListener("click", closeReader);
    elements["reader-contents-toggle"].addEventListener("click", () => toggleReaderPanel("contents"));
    elements["reader-settings-toggle"].addEventListener("click", () => toggleReaderPanel("settings"));
    elements["reader-backdrop"].addEventListener("click", closeReaderPanels);
    document.querySelectorAll("[data-close-reader-panel]").forEach((button) => {
      button.addEventListener("click", closeReaderPanels);
    });
    elements["reader-bookmark"].addEventListener("click", toggleBookmark);
    elements["reader-font-decrease"].addEventListener("click", () => changeFontSize(-1));
    elements["reader-font-increase"].addEventListener("click", () => changeFontSize(1));
    elements["reader-line-height-options"].addEventListener("click", (event) => {
      const button = event.target.closest("[data-line-height]");
      if (!button) return;
      state.readerSettings.lineHeight = button.dataset.lineHeight;
      applyReaderSettings();
    });
    elements["reader-width-options"].addEventListener("click", (event) => {
      const button = event.target.closest("[data-column-width]");
      if (!button) return;
      state.readerSettings.columnWidth = button.dataset.columnWidth;
      applyReaderSettings();
    });
    elements["reader-theme-options"].addEventListener("click", (event) => {
      const button = event.target.closest("[data-reader-theme]");
      if (!button) return;
      state.readerSettings.theme = button.dataset.readerTheme;
      applyReaderSettings();
    });
    elements["reader-follow-audio"].addEventListener("change", () => {
      state.readerSettings.followAudio = elements["reader-follow-audio"].checked;
      if (!state.readerSettings.followAudio) elements["reader-text"].querySelectorAll(".is-audio-current").forEach((node) => node.classList.remove("is-audio-current"));
      applyReaderSettings();
      syncAudioParagraph();
    });
    elements["reader-scroll"].addEventListener("scroll", handleReaderScroll, { passive: true });

    document.querySelectorAll("[data-add-source]").forEach((button) => {
      button.addEventListener("click", () => setAddSource(button.dataset.addSource));
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        const source = button.dataset.addSource === "import" ? "project" : "import";
        setAddSource(source);
        (source === "project" ? elements["add-tab-project"] : elements["add-tab-import"]).focus();
      });
    });
    document.querySelectorAll('input[name="content_source"]').forEach((input) => {
      input.addEventListener("change", () => setContentSource(input.value));
    });
    elements["add-work-file"].addEventListener("change", () => {
      elements["add-work-file"].setCustomValidity("");
      elements["add-work-file-name"].textContent = elements["add-work-file"].files?.[0]?.name || "Ei valittua tiedostoa";
    });
    elements["add-work-text"].addEventListener("input", () => elements["add-work-text"].setCustomValidity(""));
    elements["library-add-form"].addEventListener("submit", handleAddSubmit);
    elements["add-work-close"].addEventListener("click", closeAddDialog);
    elements["add-cancel"].addEventListener("click", closeAddDialog);
    elements["library-add-dialog"].addEventListener("cancel", (event) => {
      event.preventDefault();
      closeAddDialog();
    });
    elements["classification-back"].addEventListener("click", () => {
      elements["add-work-classification-step"].hidden = true;
      elements["add-work-source-step"].hidden = false;
      elements["add-work-title"].textContent = "Muokkaa luonnoksen tietoja";
      elements["add-work-description"].textContent = "Luonnos on jo tallennettu. Tietojen muutokset päivitetään samaan luonnokseen.";
      showDialogNotice("Sisältö on jo tallennettu. Tässä vaiheessa voit päivittää metatietoja ennen luokituksen tarkistusta.");
    });
    elements["classification-keep-draft"].addEventListener("click", keepDraft);
    elements["classification-publish"].addEventListener("click", publishDraft);
    elements["thema-custom-add"].addEventListener("click", addCustomTheme);
    elements["thema-custom-input"].addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      addCustomTheme();
    });
    elements["add-work-rights"].addEventListener("change", () => elements["add-work-rights"].setCustomValidity(""));

    elements["audio-play"].addEventListener("click", toggleAudio);
    elements["audio-back-15"].addEventListener("click", () => seekAudio(-15));
    elements["audio-forward-15"].addEventListener("click", () => seekAudio(15));
    elements["audio-previous"].addEventListener("click", () => changeAudioChapter(-1));
    elements["audio-next"].addEventListener("click", () => changeAudioChapter(1));
    elements["audio-seek"].addEventListener("input", () => {
      if (elements["library-audio"].src) elements["library-audio"].currentTime = finiteNumber(elements["audio-seek"].value);
    });
    elements["audio-speed"].addEventListener("change", () => {
      elements["library-audio"].playbackRate = finiteNumber(elements["audio-speed"].value, 1);
    });
    elements["audio-volume"].addEventListener("input", () => {
      elements["library-audio"].volume = clamp(finiteNumber(elements["audio-volume"].value, 1), 0, 1);
      elements["library-audio"].muted = false;
      elements["audio-mute"].replaceChildren(makeIcon(elements["library-audio"].volume === 0 ? "speaker-slash" : "speaker-high"));
    });
    elements["audio-mute"].addEventListener("click", toggleMute);
    elements["audio-collapse"].addEventListener("click", () => {
      const collapsed = elements["library-audio-dock"].classList.toggle("is-collapsed");
      elements["audio-collapse"].setAttribute("aria-expanded", String(!collapsed));
      elements["audio-collapse"].setAttribute("aria-label", collapsed ? "Laajenna soitin" : "Pienennä soitin");
    });
    elements["audio-open-work"].addEventListener("click", () => state.audioWork && openDetail(state.audioWork.id));
    elements["library-audio"].addEventListener("play", () => {
      state.audioIntentPlaying = true;
      setPlayIcon(true);
    });
    elements["library-audio"].addEventListener("pause", () => setPlayIcon(false));
    elements["library-audio"].addEventListener("loadedmetadata", handleAudioLoaded);
    elements["library-audio"].addEventListener("timeupdate", handleAudioTimeUpdate);
    elements["library-audio"].addEventListener("ended", () => {
      state.audioIntentPlaying = false;
      setPlayIcon(false);
      if (state.audioWork) {
        const duration = Number.isFinite(elements["library-audio"].duration) ? elements["library-audio"].duration : 0;
        queueProgress(state.audioWork.id, {
          media: "audio",
          progress_percent: 100,
          audio_position_seconds: duration,
          audio_duration_seconds: duration,
        });
      }
    });
    elements["library-audio"].addEventListener("error", handleAudioError);

    elements["mobile-library-nav"].addEventListener("click", (event) => {
      const button = event.target.closest("[data-mobile-action]");
      if (!button) return;
      const action = button.dataset.mobileAction;
      if (action === "search") {
        closeDetail(false);
        elements["library-search-input"].focus();
        elements["library-search-input"].scrollIntoView({ block: "center", behavior: "smooth" });
      } else {
        setScope(action);
      }
    });

    window.addEventListener("message", handleShellMessage);
    window.addEventListener("storage", handleAuthStorageChange);
    window.addEventListener("keydown", handleKeyboard);
    window.addEventListener("resize", syncReaderBackdrop);
    window.addEventListener("pagehide", flushProgress);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushProgress();
    });
  }

  function initialProjectContext() {
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get("project") || params.get("project_id") || localStorage.getItem("skriptlab_active_project_id");
    setProjectContext({ projectId, source: "shell" });
  }

  function notifyReady() {
    if (window.parent === window || window.location.origin === "null") return;
    window.parent.postMessage({
      type: "skriptlab:library-ready",
      capabilities: ["browse", "read", "audio", "import", "publish", "thema-review"],
    }, window.location.origin);
  }

  async function loadViewer() {
    state.viewer = window.SkriptLabAuth?.getUser?.() || null;
    try {
      const payload = await requestJson("/api/auth/me");
      const viewer = payload?.user || payload?.data?.user || payload?.data || payload;
      if (viewer && typeof viewer === "object") state.viewer = viewer;
    } catch (_error) {
      // Keep the cached session user if the refresh is temporarily unavailable.
    }
    const viewerId = currentUser()?.id;
    if (viewerId === null || viewerId === undefined) purgeLocalProgress();
    else purgeLocalProgress(viewerId);
    syncPublisherUi();
  }

  async function boot() {
    collectElements();
    installProgressPrivacyCleanup();
    loadReaderSettings();
    applyReaderSettings();
    initialProjectContext();
    bindEvents();
    syncScopeControls();
    setPlayIcon(false);
    notifyReady();

    if (!window.SkriptLabAuth?.getToken?.()) {
      purgeLocalProgress();
      window.SkriptLabAuth?.requireLogin?.();
      return;
    }
    await loadViewer();
    await loadWorks();
  }

  window.SkriptLabLibrary = {
    refresh: () => loadWorks(),
    openAdd: (options) => openAddDialog(options || {}),
    openWork: (workId) => openDetail(workId),
    normalizeWork,
    normalizeThema,
    normalizeProgress,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
