# SkriptLab public demo

Static Finnish demo at `/demo/`, published with the existing Netlify site. No build step, backend, account, upload, API call, tracking or new browser storage is required. The sample-opening button reveals the next step and highlights the manuscript's motifs; it does not perform a live analysis.

## Files

- `index.html`: semantic page, manuscript excerpts and seven production panels.
- `demo.css`: responsive visual system, focus states and reduced-motion support.
- `story-data.js`: curated source evidence, interpretations, translation examples, voice transcripts, campaign variants and world hotspots.
- `demo.js`: context selection, accessible keyboard-operated output tabs, sample state, media lifecycle and example controls.
- `assets/`: local images, audio, video, captions and downloadable text excerpt.

## Content provenance

The example is H. G. Wells's *The Door in the Wall*, the title story of Project Gutenberg ebook 456. Finnish quotations are from the completed *Ovi muurissa* translation in the local translator project's `h-g-wells-the-door-in-the-wall-fi-translated/output/translated_manuscript.md`, reviewed on 5 September 2026. The six source quotations and Finnish audio transcript have been matched verbatim to that text. Only brief excerpts are included here.

Descriptions of people, places and motifs are editorial summaries prepared for the demo. Theme and voice guidance are interpretations, not additional quotations. Preserve the distinction between Redmond's framing narration and Wallace's memories, and keep the garden's reality open to interpretation.

The Swedish and German sentence translations, campaign copy and interactive garden concept were prepared for this demo and are labeled accordingly. They are not completed translated books or live-generated application results.

## Media provenance

- Context portraits, places and themes, plus translation, audio, illustration, campaign and book concept art: reused from `/demo3/assets/`. The eleven WebP files in this directory are exact copies, so this page remains independent of the `/demo3/` route. Context images change with the selected story node; captions identify the images as interpretations or concepts.
- Door and garden illustrations: generated for this demo with Imagegen. The doorway's wide composition is also used in the video.
- Finnish and English voice samples: locally synthesized using macOS Satu and Daniel, respectively, then encoded as AAC. They illustrate language switching and are explicitly not a benchmark of the application's audio models.
- Video: an eight-second, silent H.264 camera move over the generated doorway image, rendered locally. The page labels it as an image animation, distinct from AI video generation.
- The garden is a clickable image concept, not a 3D engine or a currently available world-generation feature.

## Product boundaries

Current workflows are illustrated separately from experimental short-video production and the future virtual-environment direction. Do not remove these status distinctions or imply that all tools are available to every account. The site's existing paused-service notice remains in place.

This directory belongs to the public site repository. It is not an `/app/` frontend mirror and has no corresponding backend release dependency.
