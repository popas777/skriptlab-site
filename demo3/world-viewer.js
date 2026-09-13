import { hotspots } from './content.js';

export function setupWorldViewer({ onOpen, onClose }) {
  const $ = (selector) => document.querySelector(selector);
  const worldDialog = $('#world-dialog');
  const worldImage = $('#world-view-image');
  const worldMedia = $('#world-view-media');
  const worldStatus = $('#world-view-status');
  const worldKeys = Object.keys(hotspots);
  let worldIndex = 0;
  let worldTrigger;

  function finishWorldImage() {
    worldMedia.setAttribute('aria-busy', 'false');
    worldStatus.hidden = true;
  }
  worldImage.addEventListener('load', finishWorldImage);
  worldImage.addEventListener('error', () => {
    worldMedia.setAttribute('aria-busy', 'false');
    worldStatus.textContent = 'Kuva ei latautunut. Kokeile avata se erikseen.';
    worldStatus.hidden = false;
    $('#world-view-fallback').hidden = false;
  });

  function showWorldView(index) {
    worldIndex = (index + worldKeys.length) % worldKeys.length;
    const view = hotspots[worldKeys[worldIndex]];
    worldStatus.textContent = 'Näkymä avautuu…';
    worldStatus.hidden = false;
    worldMedia.setAttribute('aria-busy', 'true');
    $('#world-view-fallback').hidden = true;
    $('#world-view-fallback').href = view.image;
    worldImage.alt = view.imageAlt;
    worldImage.src = view.image;
    if (worldImage.complete && worldImage.naturalWidth) finishWorldImage();
    $('#world-view-title').textContent = view.title;
    $('#world-view-description').textContent = view.description;
    $('#world-view-count').textContent = `${worldIndex + 1} / ${worldKeys.length}`;
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-hotspot]');
    if (!button || !Object.hasOwn(hotspots, button.dataset.hotspot)) return;
    worldTrigger = button;
    showWorldView(worldKeys.indexOf(button.dataset.hotspot));
    onOpen();
    worldDialog.showModal();
    document.body.classList.add('world-view-open');
  });
  $('#world-view-close').addEventListener('click', () => worldDialog.close());
  $('#world-view-previous').addEventListener('click', () => showWorldView(worldIndex - 1));
  $('#world-view-next').addEventListener('click', () => showWorldView(worldIndex + 1));
  worldDialog.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    showWorldView(worldIndex + (event.key === 'ArrowRight' ? 1 : -1));
  });
  worldDialog.addEventListener('click', (event) => {
    if (event.target !== worldDialog) return;
    const bounds = worldDialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) worldDialog.close();
  });
  worldDialog.addEventListener('close', () => {
    document.body.classList.remove('world-view-open');
    onClose();
    worldTrigger?.focus({ preventScroll: true });
  });

}
