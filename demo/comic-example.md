# Vihreä ovi: comic and title artwork

Added to `/demo/` and `/demo3/` on 13 September 2026 at the user's request. Original-work references use *The Door In The Wall*; the Finnish sample is *Vihreä ovi*.

## Supplied comic

- Source: `/Users/skriptlab/Downloads/Vihrea-ovi-tussi-ja-akvarelli.pdf`.
- Published exact copy: `assets/vihrea-ovi-sarjakuva.pdf` (10,269,895 bytes; two A4 pages).
- SHA-256 of both source and published copy: `3c5d2abcc246bdc20ecab257c1320b026cf46c321314461aec914aaff5c3b83e`.
- Both pages were rendered with Poppler at 145 dpi and visually checked. Web previews `vihrea-ovi-sarjakuva-1.webp` and `vihrea-ovi-sarjakuva-2.webp` are 1199 × 1696 pixels, encoded with Pillow (WebP quality 92, method 6). No panels, text or artwork were edited.
- `comic-reader.js` contains the exact PDF text extracted with pypdf as an accessible, page-specific transcript. The reader preserves the supplied page order.

## Finnish title artwork

The previous `output-book.webp` and `output-campaign.webp` are preserved. Two new variants change the visible title from *Ovi muurissa* to *Vihreä ovi*, preserving H. G. Wells, the illustration, color palette and composition. The built-in Imagegen tool performed the text edits; both results were visually inspected and exported as WebP at 1536 × 1024 pixels (quality 92, method 6).

- Book: `assets/output-book-vihrea-ovi.webp`; reference `assets/output-book.webp`; original generated PNG `/Users/skriptlab/.codex/generated_images/01a0756e-32d3-76f1-bc96-78f5be6656df/exec-3936ff79-d827-4313-bad9-68a9432e6e3a.png`.
- Campaign: `assets/output-campaign-vihrea-ovi.webp`; reference `assets/output-campaign.webp`; original generated PNG `/Users/skriptlab/.codex/generated_images/01a0756e-32d3-76f1-bc96-78f5be6656df/exec-ea51c9ab-8a1e-4e43-8658-de1750c348f4.png`.

These are prepared examples. Adding the comic does not introduce an upload, a model call in the page, or new backend functionality.
