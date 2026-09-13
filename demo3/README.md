# SkriptLab Demo 3

Standalone Finnish experience at `/demo3/`. The existing Netlify site publishes this static directory from `main`; there is no build step or backend release. No shared files, previous demos or application routes are changed.

## Structure

- `index.html`: semantic three-act shell, route metadata, native information and illustrated-world dialogs.
- `demo3.css`: deep-pine/gold visual system, responsive layout, focus and motion states.
- `app.js`: phase, context and output selections, focus management and media lifecycle.
- `content.js`: six curated contexts and seven output families; every output references shared context IDs.
- `world-viewer.js`: lazy image loading, previous/next viewpoints, keyboard navigation and focus restoration.
- `scene.js`: actual local Three.js constellation with 36 curved core filaments, five astrolabe orbits, particles, gold spheres, projected HTML buttons, pointer tilt/drag and fallback.
- `vendor/`: pinned Three.js r180 modules, license and provenance; no runtime CDN.
- `assets/story-world.webp`: separately generated book/door artwork. The introductory book is an image with perspective/parallax; the constellation itself uses 3D geometry.

The page reuses existing local fonts from `/demo2/fonts.css`, and original images, AAC audio, MP4/VTT and downloadable source excerpt from `/demo/assets/`. No analytics, external API calls, login, cookies or uploads are added. The Content Security Policy allows same-origin resources only (plus embedded fonts/icons and positioning styles).

## Content boundaries

The example is H. G. Wells, *The Door in the Wall* / *Ovi muurissa*. Quotes and reviewed Finnish translation come from the original demo's curated source data. Redmond is the framing narrator; Wallace describes his memories. The garden's reality remains open to interpretation. Themes and voice/visual directions are labeled interpretations.

Languages, audio, illustration, book layout, video, campaign and world panels are prepared examples. Swedish/German translations and campaign copy are demo drafts. Audio files are the original locally synthesized Finnish and English recordings. Video is the user-supplied Gemini-generated clip, trimmed from source time 12–20 s with its audio retained. The shared `/demo/assets/door-scene.mp4` runs for eight seconds and uses a poster and Finnish scene descriptions from the new clip. It is a prepared external example, not a live AI video generation in the application. Book layout is a reading sample with the first two reviewed Finnish paragraphs, 13 px Georgia, justified lines and manually reviewed discretionary hyphens, matching `/demo/`; the download is explicitly a real `.txt` excerpt. Generated virtual worlds are a future concept. The public site's paused-service notice remains visible.

## Interaction and accessibility

Select any act directly, or open the manuscript's world from the first screen. Six context buttons reveal source evidence and what carries forward. Seven output buttons reveal real examples; their context references return to the relevant shared node. Languages, voices and campaigns are selectable. The garden image has three 44 px numbered hotspots at the same positions as `/demo/`: panthers (43%, 84%), vegetation (80%, 56%) and mountain forest (65%, 24%). Each opens the matching shared `/demo/assets/world-*.webp` image in a native modal. Previous/next buttons and left/right arrows switch viewpoints; Escape, the backdrop or the return button close it and restore focus. The background scene pauses while the viewer is open, and restores the chosen motion preference on close. Audio/video never autoplay and pause on panel/phase changes, opening the dialog, or leaving the page. The dialog closes with Escape and restores focus.

HTML buttons remain usable without WebGL. A second fallback preserves controls if the rendering module fails to load. Opening a new act through its action focuses the selected node. Reduced-motion preference starts a static scene; the header button also pauses/resumes motion. Paused scenes render only when an interaction requires it. Rendering pauses when the document or scene is not visible. Mobile uses normal document scrolling with the constellation above its detail panel; transparent layout space does not intercept node taps.

## Verification

Serve the repository root with `python3 -m http.server 8766 --bind 127.0.0.1` and visit `/demo3/`. Syntax-check all application modules with `node --check`. Run `git diff --check` before publication.

Verified in Codex's in-app browser at 1280×720, 1536×1024 and 390×844: three acts, shared-context return links, all seven outputs, Finnish/Swedish/German text, language selection, real Finnish audio playback, English source switching, eight-second video playback, image loading, all campaign forms, garden hotspot details, node keyboard progression, native dialog/Escape, pause then phase changes, no horizontal mobile overflow and no console warnings/errors. WebGL creation failure was simulated temporarily in the local development source; context/output controls remained functional and the production source was then restored and rechecked.

Visual QA compared the two Imagegen concepts and final native-size browser captures, including typography, allowed hero copy, palette, imagery, 3D node order, open panel composition and the phase rail. Production artwork differs naturally from the concept render; real 3D filaments use an efficient geometry implementation rather than an image. Long expanded details can scroll on short displays.

## Updates shared with /demo (2026-09-13)

The two demos share the reviewed Finnish excerpt and audio, the 12–20 s video cut and its poster/captions, and all three new illustrated garden viewpoints. World-image provenance and prompts remain in `/demo/world-images.md`; this update makes no new model calls. The original hero, context artwork, theme colors and 3D constellation remain specific to demo3.

Visible output names now match the main demo: Kielet, Äänet, Kuvat, Videot, Kampanjat, Taitto and Virtuaalimaailma, under Uudet sisällöt. Captions use the approved context-aware production wording. The information dialog identifies the video correctly. Desktop introductory text starts at the upper left; the mobile layout keeps its existing flow.

The book-page paragraphs and all soft hyphens are copied exactly from `/demo/index.html`, with the title heading level adjusted for demo3. Georgia and manual hyphens make the Finnish word divisions consistent across browsers. See the main demo README for the reviewed translation source and hyphenation references.

Targeted verification for this update: 1440×900 and 390×844 in the Codex in-app browser, light and dark viewer themes, all three images, next/previous and arrow keys, Escape and focus restoration, background motion pause/resume, justified book-page rendering, eight-second video playback to completion, language/audio-source/campaign selection, shared-context return links and the updated information dialog. No console warnings or errors were observed. Narrow-map label collision handling also covers the longer Virtuaalimaailma label.
