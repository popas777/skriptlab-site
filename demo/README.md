# SkriptLab public demo

Static Finnish demo at `/demo/`, published with the existing Netlify site. No build step, backend, account, upload, API call, tracking or new browser storage is required. The sample-opening button reveals the next step and highlights the manuscript's motifs; it does not perform a live analysis.

## Files

- `index.html`: semantic page, manuscript excerpts and eight production panels.
- `demo.css`: responsive visual system, focus states and reduced-motion support.
- `story-data.js`: curated source evidence, interpretations, translation examples, voice transcripts, campaign variants and world hotspots.
- `demo.js`: context selection, accessible keyboard-operated output tabs, sample state, media lifecycle and example controls.
- `comic-reader.js` / `comic-reader.css`: shared two-page comic reader, zoomable native dialog, transcript and PDF links; also used by `/demo3/`.
- `assets/`: local images, audio, video, captions, downloadable text excerpt and the original comic PDF.

## Content provenance

The example is H. G. Wells's *The Door in the Wall*, the title story of Project Gutenberg ebook 456. Finnish quotations are from the completed local Finnish translation, presented here as *Vihreä ovi*, in the local translator project's `h-g-wells-the-door-in-the-wall-fi-translated/output/translated_manuscript.md`, synchronized on 12 September 2026 with the project’s reviewed 6 September 2026 revision. The six source quotations and Finnish audio transcript have been matched verbatim to that text. Only brief excerpts are included here.

Descriptions of people, places and motifs are editorial summaries prepared for the demo. Theme and voice guidance are interpretations, not additional quotations. Preserve the distinction between Redmond's framing narration and Wallace's memories, and keep the garden's reality open to interpretation.

The Swedish and German sentence translations, campaign copy and interactive garden concept were prepared for this demo and are labeled accordingly. They are not completed translated books or live-generated application results.

## Media provenance

- Context portraits, places and themes, plus translation, audio, illustration, campaign and book concept art: reused from `/demo3/assets/`. The eleven WebP files in this directory are exact copies, so this page remains independent of the `/demo3/` route. Context images change with the selected story node; captions identify the images as interpretations or concepts.
- Door and garden illustrations: generated for this demo with Imagegen. The original doorway illustration remains available separately from the video.
- Finnish and English voice samples: locally synthesized using macOS Satu and Daniel, respectively, then encoded as AAC. They illustrate language switching and are explicitly not a benchmark of the application's audio models. The Finnish sample was regenerated on 12 September 2026 from the current opening paragraph; the same text and recording are synchronized in `/demo2/` and `/demo3/`, including the embedded Finnish recording in `/demo2/demo-data.js`.
- Video: the user’s Gemini-generated `loppu_oli_hyvä_mutta_haluaisin.mp4`, trimmed from 12.000 s to the source end at 20.000 s. The eight-second MP4 retains the source audio and is exported as H.264 at 1280×720, 24 fps, with web streaming optimization. The source file is preserved. The WebP poster is from 6.5 s of the trimmed clip; the Finnish VTT describes the visible action. Both `/demo/` and `/demo3/` use this clip. It is a prepared external example, not a live generation in the application.
- The garden is a clickable image concept, not a 3D engine or a currently available world-generation feature. Its three numbered locations open new full-image viewpoints: the two panthers, the vegetation, and a reverse view from the wooded mountains toward the garden and green door. The new images use the original garden as a reference, with the door as an additional architectural reference for the mountain view. See [world-images.md](world-images.md) for the built-in Imagegen prompts and asset provenance. The views are prepared visual interpretations, not new quotations from Wells.
- The overview keeps its original 3:2 proportions at every screen size so hotspot coordinates stay anchored to the same subjects. The native modal dialog supports Escape, previous/next buttons, left/right arrow keys, backdrop dismissal, and focus restoration to the originating numbered button. Images load only when a view is opened.

## Product boundaries

Current workflows are illustrated separately from experimental short-video production and the future virtual-environment direction. Do not remove these status distinctions or imply that all tools are available to every account. The site's existing paused-service notice remains in place.

This directory belongs to the public site repository. It is not an `/app/` frontend mirror and has no corresponding backend release dependency.

## Book-page typography

The layout example uses the first two consecutive paragraphs of the reviewed Finnish translation, unchanged apart from optional HTML soft hyphens. The 13 px Georgia text has a 1.55 line height, justified edges, a left-aligned final line and a first-line indent on the second paragraph. Other excerpts and the downloadable TXT remain unchanged.

Discretionary breaks are reviewed for this fixed sample rather than delegated to an operating system's optional Finnish dictionary. `hyphens: manual` and `&shy;` allow the browser to choose among these breakpoints as the page width changes; no line endings are fixed. Foreign names are not split, compound boundaries are preferred, and single-vowel fragments are avoided. Sources: [Kielitoimiston ohjepankki: Tavutus](https://kielitoimistonohjepankki.fi/ohje/tavutus-yleisperiaatteet/) and [MDN: hyphens](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/hyphens).

## Vihreä ovi and comics (2026-09-13)

References to the original work use *The Door in the Wall*. Finnish sample artifacts, including the book layout, audio label, downloadable excerpt, cover and campaign artwork, use *Vihreä ovi*. Only the title and original-work credit changed in the TXT; the reviewed translation remains unchanged. The translator project and legacy asset URLs are preserved. New title-bearing images are separate files, leaving the earlier artwork available.

Sarjakuvat is the eighth output. It presents both pages of the user-supplied ink-and-watercolor comic, with page selection, an enlarged scrollable reading view, zoom, keyboard navigation, a text transcript and the unchanged original PDF. Background media pauses while reading. See [comic-example.md](comic-example.md) for source checksums and image provenance.

Verification for the comic/title update: JavaScript syntax checks, exact PDF checksum, unchanged Finnish excerpt paragraphs and discretionary hyphens; browser checks at 1440×900 and 390×844; both comic pages, modal opening/closing, focus restoration, zoom and keyboard scrolling; light/dark demo3 themes and scene motion pause/resume; eight visible mobile output nodes with no clipped or overlapping buttons. No browser warnings or errors were observed.

The latest supplied `Vihrea-ovi-tussi-ja-akvarelli (3).pdf` replaces the previous comic example in both demos, including both rendered pages and their text transcripts. The original-work spelling is *The Door in the Wall*, and the illustration output label is Grafiikka. See `/demo/comic-example.md` for the current PDF checksum.
