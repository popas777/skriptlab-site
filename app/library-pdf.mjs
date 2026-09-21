// PDF.js is loaded only when a reader chooses PDF. No third-party document viewer.
import { getDocument, GlobalWorkerOptions, TextLayer } from "./vendor/pdfjs-6.3.289/pdf.mjs";

GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs-6.3.289/pdf.worker.mjs", import.meta.url).href;
const vendor = new URL("./vendor/pdfjs-6.3.289/", import.meta.url).href;

function element(tag, attributes = {}, label = "") {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  node.textContent = label;
  return node;
}

export async function openPdf({ container, outline, url, pageNumber = 1, onPage, onError, onNavigate, signal }) {
  let destroyed = false, renderSequence = 0, searchSequence = 0, renderTask, textLayer, resizeTimer;
  let currentPage = pageNumber, zoom = 1, currentPdfPage, lastWidth = 0;
  const toolbar = element("div", { class: "pdf-toolbar", role: "group", "aria-label": "PDF:n sivu ja suurennus" });
  const previous = element("button", { type: "button", "aria-label": "Edellinen PDF-sivu" }, "←");
  const next = element("button", { type: "button", "aria-label": "Seuraava PDF-sivu" }, "→");
  const pageLabel = element("label", {}, "Sivu ");
  const input = element("input", { type: "number", min: "1", inputmode: "numeric", "aria-label": "PDF-sivunumero" });
  const count = element("span");
  pageLabel.append(input, count);
  const scale = element("select", { "aria-label": "PDF:n suurennus" });
  for (const [value, label] of [[1, "Sovita leveyteen"], [1.25, "125 %"], [1.5, "150 %"], [2, "200 %"]]) scale.append(element("option", { value }, label));
  toolbar.append(previous, pageLabel, next, scale);
  const status = element("p", { class: "pdf-status", role: "status" }, "Ladataan PDF:ää…");
  const surface = element("div", { class: "pdf-surface" });
  container.replaceChildren(toolbar, status, surface);
  const loading = getDocument({ url, cMapUrl: vendor + "cmaps/", cMapPacked: true,
    standardFontDataUrl: vendor + "standard_fonts/", wasmUrl: vendor + "wasm/", iccUrl: vendor + "iccs/",
    isEvalSupported: false, enableXfa: false, disableAutoFetch: true, disableStream: true });
  let pdf;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true; renderSequence++; searchSequence++;
    clearTimeout(resizeTimer); observer.disconnect();
    renderTask?.cancel(); textLayer?.cancel();
    signal?.removeEventListener("abort", destroy);
    void loading.destroy().catch(() => {});
  };
  const observer = new ResizeObserver(() => {
    const width = Math.round(container.clientWidth);
    if (width === lastWidth) return;
    lastWidth = width;
    clearTimeout(resizeTimer);
    if (pdf && !destroyed) resizeTimer = setTimeout(() => void render(currentPage, false), 160);
  });
  if (signal?.aborted) { destroy(); return { destroy }; }
  signal?.addEventListener("abort", destroy, { once: true });

  async function render(number, announce = true) {
    if (destroyed || !pdf) return;
    const sequence = ++renderSequence;
    renderTask?.cancel(); textLayer?.cancel();
    currentPage = Math.max(1, Math.min(pdf.numPages, Math.floor(Number(number) || 1)));
    input.value = String(currentPage);
    previous.disabled = currentPage <= 1;
    next.disabled = currentPage >= pdf.numPages;
    status.textContent = `Ladataan sivua ${currentPage}…`;
    try {
      const page = await pdf.getPage(currentPage);
      if (destroyed || sequence !== renderSequence) return;
      const natural = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(180, Math.min(900, container.clientWidth - 32));
      const viewport = page.getViewport({ scale: availableWidth / natural.width * zoom });
      const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8_000_000 / (viewport.width * viewport.height)));
      const wrapper = element("div", { class: "pdf-sheet" });
      wrapper.style.width = `${viewport.width}px`;
      wrapper.style.height = `${viewport.height}px`;
      wrapper.style.setProperty("--total-scale-factor", viewport.scale);
      const canvas = element("canvas", { "aria-hidden": "true" });
      canvas.width = Math.ceil(viewport.width * ratio);
      canvas.height = Math.ceil(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const text = element("div", { class: "textLayer", "aria-label": `Sivun ${currentPage} teksti` });
      wrapper.append(canvas, text);
      surface.replaceChildren(wrapper);
      renderTask = page.render({ canvasContext: canvas.getContext("2d"), viewport,
        transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] });
      await renderTask.promise;
      if (destroyed || sequence !== renderSequence) return;
      textLayer = new TextLayer({ textContentSource: page.streamTextContent(), container: text, viewport });
      await textLayer.render();
      if (destroyed || sequence !== renderSequence) return;
      if (currentPdfPage && currentPdfPage !== page) currentPdfPage.cleanup();
      currentPdfPage = page;
      status.textContent = `Sivu ${currentPage} / ${pdf.numPages} · Lukukohta tallentuu automaattisesti.`;
      if (announce) {
        onPage(currentPage, pdf.numPages);
        container.parentElement.scrollTop = 0;
      }
    } catch (error) {
      if (destroyed || sequence !== renderSequence || error.name === "RenderingCancelledException" || error.name === "AbortException") return;
      status.textContent = "PDF-sivua ei voitu avata. Sulje lukija ja avaa teos uudelleen; näin myös latauslinkki uusitaan.";
      onError(error);
    }
  }

  previous.addEventListener("click", () => void render(currentPage - 1));
  next.addEventListener("click", () => void render(currentPage + 1));
  input.addEventListener("change", () => void render(input.value));
  scale.addEventListener("change", () => { zoom = Number(scale.value); void render(currentPage, false); });
  try {
    pdf = await loading.promise;
    if (destroyed) return { destroy };
    count.textContent = ` / ${pdf.numPages}`;
    input.max = String(pdf.numPages);
    const toc = await pdf.getOutline();
    if (destroyed) return { destroy };
    outline.replaceChildren();
    function addOutline(items, depth = 0) {
      if (depth > 8) return;
      for (const item of (items || []).slice(0, 1000)) {
        if (item.dest) {
          const li = element("li");
          const action = element("button", { type: "button", class: "reader-chapter-action" }, item.title || "PDF-kohta");
          action.style.paddingInlineStart = `${12 + depth * 12}px`;
          action.addEventListener("click", async () => {
            try {
              const destination = typeof item.dest === "string" ? await pdf.getDestination(item.dest) : item.dest;
              if (!Array.isArray(destination)) return;
              const index = typeof destination[0] === "number" ? destination[0] : await pdf.getPageIndex(destination[0]);
              await render(index + 1); onNavigate?.();
            } catch (error) { if (!destroyed) onError(error); }
          });
          li.append(action); outline.append(li);
        }
        addOutline(item.items, depth + 1);
      }
    }
    addOutline(toc);
    if (!outline.children.length) outline.append(element("li", {}, "PDF:ssä ei ole sisällysluetteloa. Valitse sivu lukijan yläreunasta."));
    lastWidth = Math.round(container.clientWidth);
    observer.observe(container);
    await render(currentPage);
  } catch (error) {
    destroy(); throw error;
  }

  return {
    destroy,
    turnPage: direction => render(currentPage + direction),
    getPosition: () => ({ page: currentPage, count: pdf.numPages }),
    async search(query, results, feedback) {
      const sequence = ++searchSequence;
      results.replaceChildren();
      const term = query.trim().toLocaleLowerCase("fi");
      if (term.length < 2) { feedback.textContent = "Kirjoita vähintään kaksi merkkiä."; return; }
      let count = 0;
      try {
        for (let number = 1; number <= pdf.numPages; number++) {
          if (destroyed || sequence !== searchSequence) return;
          feedback.textContent = `Etsitään PDF:stä · sivu ${number} / ${pdf.numPages}`;
          const page = await pdf.getPage(number);
          const content = await page.getTextContent();
          if (destroyed || sequence !== searchSequence) return;
          const text = content.items.map(item => item.str || "").join(" ");
          const index = text.toLocaleLowerCase("fi").indexOf(term);
          if (index >= 0) {
            count++;
            const li = element("li");
            const action = element("button", { type: "button" }, `Sivu ${number}: …${text.slice(Math.max(0, index - 40), index + term.length + 90)}…`);
            action.addEventListener("click", async () => { await render(number); onNavigate?.(); });
            li.append(action); results.append(li);
          }
          if (page !== currentPdfPage) page.cleanup();
          if (count >= 40) break;
          if (number % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        }
        feedback.textContent = count ? `${count} osuvaa sivua.${count === 40 ? " Näytetään enintään 40. Tarkenna tarvittaessa." : ""}`
          : "Ei osumia. Kuvaksi skannattu PDF tarvitsee OCR-tekstin, jotta siitä voi hakea.";
      } catch (error) { if (!destroyed && sequence === searchSequence) { feedback.textContent = "PDF:n haku epäonnistui."; onError(error); } }
    },
  };
}
