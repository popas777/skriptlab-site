# SkriptLab Demo 3

Standalone Finnish experience at `/demo3/`. The existing Netlify site publishes this static directory from `main`; there is no build step or backend release. No shared files, previous demos or application routes are changed.

## Structure

- `index.html`: semantic three-act shell, route metadata, native information dialog.
- `demo3.css`: deep-pine/gold visual system, responsive layout, focus and motion states.
- `app.js`: phase, context and output selections, focus management and media lifecycle.
- `content.js`: six curated contexts and seven output families; every output references shared context IDs.
- `scene.js`: actual local Three.js constellation with 36 curved core filaments, five astrolabe orbits, particles, gold spheres, projected HTML buttons, pointer tilt/drag and fallback.
- `vendor/`: pinned Three.js r180 modules, license and provenance; no runtime CDN.
- `assets/story-world.webp`: separately generated book/door artwork. The introductory book is an image with perspective/parallax; the constellation itself uses 3D geometry.

The page reuses existing local fonts from `/demo2/fonts.css`, and original images, AAC audio, MP4/VTT and downloadable source excerpt from `/demo/assets/`. No analytics, external API calls, login, cookies, persistent storage or uploads are added. The Content Security Policy allows same-origin resources only (plus embedded fonts/icons and positioning styles).

## Content boundaries

The example is H. G. Wells, *The Door in the Wall* / *Ovi muurissa*. Quotes and reviewed Finnish translation come from the original demo's curated source data. Redmond is the framing narrator; Wallace describes his memories. The garden's reality remains open to interpretation. Themes and voice/visual directions are labeled interpretations.

Languages, audio, illustration, book layout, video, campaign and world panels are prepared examples. Swedish/German translations and campaign copy are demo drafts. Audio files are the original locally synthesized Finnish and English recordings. Video is the existing silent eight-second image animation, not a live AI video generation. Book layout is a visual concept; the download is explicitly a real `.txt` excerpt. Generated virtual worlds are a future concept. The public site's paused-service notice remains visible.

## Interaction and accessibility

Select any act directly, or open the manuscript's world from the first screen. Six context buttons reveal source evidence and what carries forward. Seven output buttons reveal real examples; their context references return to the relevant shared node. Languages, voices, campaigns and garden concepts are selectable. Audio/video never autoplay and pause on panel/phase changes, opening the dialog, or leaving the page. The dialog closes with Escape and restores focus.

HTML buttons remain usable without WebGL. A second fallback preserves controls if the rendering module fails to load. Opening a new act through its action focuses the selected node. Reduced-motion preference starts a static scene; the header button also pauses/resumes motion. Paused scenes render only when an interaction requires it. Rendering pauses when the document or scene is not visible. Mobile uses normal document scrolling with the constellation above its detail panel; transparent layout space does not intercept node taps.

## Verification

Serve the repository root with `python3 -m http.server 8766 --bind 127.0.0.1` and visit `/demo3/`. Syntax-check the three application modules with `node --check`. Run `git diff --check` before publication.

Verified in Codex's in-app browser at 1280×720, 1536×1024 and 390×844: three acts, shared-context return links, all seven outputs, Finnish/Swedish/German text, language selection, real Finnish audio playback, English source switching, eight-second video playback, image loading, all campaign forms, garden hotspot details, node keyboard progression, native dialog/Escape, pause then phase changes, no horizontal mobile overflow and no console warnings/errors. WebGL creation failure was simulated temporarily in the local development source; context/output controls remained functional and the production source was then restored and rechecked.

Visual QA compared the two Imagegen concepts and final native-size browser captures, including typography, allowed hero copy, palette, imagery, 3D node order, open panel composition and the phase rail. Production artwork differs naturally from the concept render; real 3D filaments use an efficient geometry implementation rather than an image. Long expanded details can scroll on short displays.
