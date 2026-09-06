# Yhteinen konteksti — /demo2/

Standalone Finnish product demonstration within the existing public landing-site design. The home page, its links and all shared files remain unchanged. Published from the existing `skriptlab-site` main branch by Netlify; no build command, dependencies or backend release.

## Files and editing

- `index.html`: semantic page shell, metadata, shared CSS and ES-module entry point.
- `demo-data.js`: all demo copy, manuscript metadata, source paragraph, translations, nine context fields, five branch definitions and embedded media. Edit the readable `demo` object at the beginning of the file. The long final `media` export contains existing image/audio bytes.
- `demo2.js`: DOM rendering and local interaction. Every branch's `fields` array references keys of the single `demo.context` object. These same references produce highlighted context rows and the context labels beside the output; there are no independent branch contexts.
- `demo2.css`: component layout, responsive stacking, connectors, focus and motion. All selectors are scoped to `.d2-*`; colors come directly from `demo2/site.css`.
- `fonts.css` and `font-licenses.txt`: the site's existing Cormorant Garamond and DM Sans, embedded as official WOFF2 files with SIL Open Font License notices. `site.css` is an exact snapshot of the existing shared `assets/styles.css`, except its first import loads these local fonts instead of Google Fonts. This snapshot preserves the existing site tokens and component conventions without modifying the landing page. To update it later, copy the shared CSS again and change only its first font import. No new palette or typography system.

## Behavior

An IntersectionObserver watches the phase buttons, so the sequence also starts reliably in the tall mobile layout. The manuscript appears first. Context occupies most of the 10.8-second sequence, revealing one field every 850 ms. The final state opens translation and remains still. Every branch and phase is a real button and can be opened immediately. Pointer input, keyboard input, clicks and select changes permanently cancel the automatic sequence for that page visit. Selecting a branch completes its prerequisites and highlights the fields it reads. Leaving the page pauses audio.

Reduced motion shows the complete final state immediately. The same final state is the fallback without IntersectionObserver. Context values retain layout space before they are revealed. All output panels occupy the same CSS grid cell, so the largest panel reserves the space while inactive panels are invisible and inert. The screen reader status announces manual selections and the referenced context fields. Hidden panels cannot receive focus. On mobile, the field labels repeat beside the output and a link returns to the highlighted context.

The browser initially loads HTML, stylesheets and two ES modules from this site. All illustrations, fonts and audio are data URLs. No subsequent interaction sends an HTTP request. CSP explicitly prohibits connections, forms, remote media and remote fonts. There are no upload/download controls, model calls, API credentials, analytics, cookies or added window globals. Audio is a real embedded recording with media-driven duration, progress and play/pause; it never starts automatically. EPUB/PDF switches a visual preview and does not generate a file.

## Content provenance and boundaries

H. G. Wells, *The Door in the Wall*, the title story of [Project Gutenberg ebook 456](https://www.gutenberg.org/ebooks/456). Source checked against the local translator project's `h-g-wells-the-door-in-the-wall-fi-translated/source/manuscript.md`. It contains four numbered parts (I–IV). The displayed 6,756-word count excludes Markdown heading lines and counts Unicode words with internal apostrophes/hyphens as one word. It describes this cleaned source, not the entire Gutenberg collection.

The opening English paragraph and Finnish translation match the project's `source/manuscript.md` and `output/translated_manuscript.md`. Swedish and German paragraph translations are editorial demo drafts, labeled accordingly. Context fields are curated interpretations and summaries. Redmond is the framing narrator, Wallace his friend and the subject of the memories. October is Wallace's inference from the leaves. His appearance is unspecified. The reality of the garden remains unresolved. The final-door motif contains a mild plot detail.

Media is reused, unchanged, from the first demo: `demo/assets/door-landscape.webp`, `narrator-fi.m4a` and `narrator-en.m4a`. The illustration was generated for that demo. Recordings were locally synthesized using macOS Satu and Daniel; they are labeled as illustrative, not product voice-model benchmarks. The selected image deliberately contains no human figure. The video branch shows a static 15-second scene outline and labels the product's short-video tool experimental. The layout is a browser preview, not an exported book. No automatic full-publication promise is made; the reader reviews interpretations and outputs. The existing paused-service notice remains.

## Verification

Serve the repository using `python3 -m http.server 8765` and open `/demo2/`. Check each branch from each phase, all three target languages, both audio recordings, both page formats, Tab/Enter/Space, narrow/mobile layout, and reduced motion. After initial load, these controls must work offline. Syntax check the two modules with `node --check`. Review the working tree and stage only this `demo2/` directory.
