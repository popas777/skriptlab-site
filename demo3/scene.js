import * as THREE from './vendor/three.module.min.js';

// Three.js r180 is served locally; this scene makes no network requests.
const GOLD = 0xd2b77d;
const PALETTES = {
  dark: { background: 0x08120f, line: GOLD, filament: GOLD, astrolabe: 0xf0d7a0, node: 0xe0bf77, halo: 0xe5c98d, letter: GOLD, sparkle: 0xffe8b6, emissive: 0x4b3817 },
  light: { background: 0xf5f3ed, line: 0x8a682f, filament: 0x315847, astrolabe: 0x8a682f, node: 0x8a682f, halo: 0x143329, letter: 0x143329, sparkle: 0x8a682f, emissive: 0x143329 },
};
const CONTEXT = [
  ['wallace', 'Lionel Wallace', -1.88, 1.12, 0.28],
  ['redmond', 'Redmond', 1.70, 1.45, -0.15],
  ['door', 'Vihreä ovi', 2.13, -0.18, 0.48],
  ['garden', 'Lumottu puutarha', 1.12, -1.66, -0.12],
  ['longing', 'Kaipaus', -1.22, -1.57, 0.25],
  ['memory', 'Muisti & epävarmuus', -2.18, -0.25, -0.10],
];
const OUTPUTS = [
  ['translation', 'Kielet', 0.00, 1.96, 0.02],
  ['illustration', 'Kuvitus', 1.78, 1.27, 0.18],
  ['book', 'Kirja', 2.21, -0.04, -0.12],
  ['video', 'Video', 1.60, -1.40, 0.23],
  ['campaign', 'Kampanja', 0.02, -1.94, 0.02],
  ['world', '3D-maailma', -1.79, -1.31, -0.18],
  ['audio', 'Ääni', -1.90, 1.06, 0.19],
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function randomGenerator() {
  let state = 73921;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function makeTexture(draw, width = 128, height = width) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context) draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeGlowTexture() {
  return makeTexture((context, size) => {
    const glow = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    glow.addColorStop(0, 'rgba(255,245,211,1)');
    glow.addColorStop(0.09, 'rgba(240,215,155,.9)');
    glow.addColorStop(0.24, 'rgba(210,183,125,.28)');
    glow.addColorStop(0.6, 'rgba(210,183,125,.06)');
    glow.addColorStop(1, 'rgba(210,183,125,0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, size, size);
  });
}

function makeLetterTexture(letter) {
  return makeTexture((context, width, height) => {
    // White glyphs can be tinted by the current palette without rebuilding textures.
    context.fillStyle = '#ffffff';
    context.font = 'italic 74px Georgia, serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(letter, width / 2, height * 0.55);
  });
}

function makeDustTexture() {
  return makeTexture((context, size) => {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.45);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.25, 'rgba(255,255,255,.95)');
    gradient.addColorStop(0.6, 'rgba(255,255,255,.36)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }, 32);
}

/**
 * Container-relative, progressively enhanced literary constellation.
 * Buttons remain in the DOM and work when WebGL is unavailable.
 */
export function createScene(container, { onNodeSelect = () => {}, onReady = () => {} } = {}) {
  if (!(container instanceof HTMLElement)) throw new TypeError('A scene container is required.');

  let phase = 0;
  let theme = 'dark';
  let compact = false;
  let selected = '';
  let disposed = false;
  let lostContext = false;
  let width = 1;
  let height = 1;
  let frame = 0;
  let lastTime = 0;
  let elapsed = 0;
  let inView = true;
  let motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let drag = null;
  let orbitX = 0;
  let orbitY = 0;
  let targetPointerX = 0;
  let targetPointerY = 0;
  let phaseBlend = 0;
  let baseCameraZ = 9.0;
  const pointer = new THREE.Vector2();
  const projected = new THREE.Vector3();
  const random = randomGenerator();
  const textures = new Set();
  const resources = new Set();

  const root = document.createElement('div');
  root.className = 'scene-layer';
  root.style.cssText = 'position:absolute;inset:0;overflow:hidden;touch-action:pan-y;';
  const labels = document.createElement('div');
  labels.className = 'scene-labels';
  labels.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  labels.setAttribute('role', 'group');
  labels.setAttribute('aria-label', 'Tutki tarinan yhteyksiä');
  root.append(labels);
  container.append(root);

  const buttons = new Map();
  const allDefinitions = [...CONTEXT, ...OUTPUTS];
  for (const [id, text] of allDefinitions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'scene-node';
    button.dataset.node = id;
    button.textContent = text;
    button.setAttribute('aria-pressed', 'false');
    button.style.cssText = 'position:absolute;transform:translate(-50%,-50%);pointer-events:auto;';
    button.hidden = true;
    button.addEventListener('click', () => {
      setSelected(id);
      onNodeSelect(id);
    });
    labels.append(button);
    buttons.set(id, button);
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 40);
  camera.position.set(0, 0, 9.0);
  const universe = new THREE.Group();
  const rings = new THREE.Group();
  const graph = new THREE.Group();
  const core = new THREE.Group();
  const letterCloud = new THREE.Group();
  universe.add(rings, graph, core, letterCloud);
  scene.add(universe);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: true });
    renderer.setClearColor(0x08120f, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'scene-canvas';
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    root.prepend(renderer.domElement);
  } catch {
    root.classList.add('scene-fallback');
  }

  const remember = (item) => { resources.add(item); return item; };
  const glowTexture = makeGlowTexture();
  const dustTexture = makeDustTexture();
  textures.add(glowTexture);
  textures.add(dustTexture);

  // Lights affect only the tiny gold spheres; the field and filaments stay unlit.
  const hemisphereLight = new THREE.HemisphereLight(0xf3dfae, 0x263c30, 1.7);
  scene.add(hemisphereLight);
  const keyLight = new THREE.DirectionalLight(0xffefc9, 3.2);
  keyLight.position.set(-3, 4, 7);
  scene.add(keyLight);
  const nodeGeometry = remember(new THREE.SphereGeometry(0.075, 16, 10));
  const nodeGold = remember(new THREE.MeshStandardMaterial({
    color: 0xe0bf77, metalness: 0.55, roughness: 0.32,
    emissive: 0x4b3817, emissiveIntensity: 0.22,
  }));

  function addEllipse(radius, flattening, rotation, opacity) {
    const points = [];
    for (let index = 0; index <= 180; index++) {
      const angle = index / 180 * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * flattening, 0));
    }
    const material = remember(new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity, depthWrite: false }));
    material.userData.baseOpacity = opacity;
    const ellipse = new THREE.Line(remember(new THREE.BufferGeometry().setFromPoints(points)), material);
    ellipse.rotation.set(...rotation);
    rings.add(ellipse);
    return ellipse;
  }

  const primaryRing = addEllipse(2.65, 0.72, [0.34, -0.28, -0.37], 0.42);
  const secondaryRing = addEllipse(2.88, 0.52, [-0.54, 0.23, 0.52], 0.20);
  addEllipse(2.66, 0.74, [0.38, -0.26, -0.37], 0.10);
  addEllipse(3.32, 0.91, [0.20, 0.08, -0.14], 0.075);

  const orbitSparkles = new THREE.Group();
  rings.add(orbitSparkles);
  const markerMaterial = remember(new THREE.SpriteMaterial({ map: glowTexture, color: 0xffe8b6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
  for (let index = 0; index < 7; index++) {
    const dot = new THREE.Sprite(markerMaterial);
    dot.scale.setScalar(index % 3 === 0 ? 0.115 : 0.065);
    dot.userData.baseScale = dot.scale.x;
    dot.userData.angle = index * 0.91;
    orbitSparkles.add(dot);
  }

  // A sphere of curved filaments, never filled polygons. All 36 loops are batched
  // into a single LineSegments geometry; shared sphere geometry/material and every
  // added line resource are registered above for the existing dispose() path.
  const filamentVertices = [];
  const filamentPoint = new THREE.Vector3();
  const previousPoint = new THREE.Vector3();
  for (let loop = 0; loop < 36; loop++) {
    const tilt = new THREE.Euler(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    const radius = 0.89 + random() * 0.19;
    const seed = random() * Math.PI * 2;
    const flattening = 0.82 + random() * 0.18;
    for (let step = 0; step <= 128; step++) {
      const angle = step / 128 * Math.PI * 2;
      const wave = 1 + Math.sin(angle * 3 + seed) * 0.019 + Math.cos(angle * 5 - seed) * 0.012;
      filamentPoint.set(
        Math.cos(angle) * radius * wave,
        Math.sin(angle) * radius * flattening * wave,
        Math.sin(angle * 2 + seed) * 0.035,
      ).applyEuler(tilt);
      if (step) filamentVertices.push(previousPoint.x, previousPoint.y, previousPoint.z, filamentPoint.x, filamentPoint.y, filamentPoint.z);
      previousPoint.copy(filamentPoint);
    }
  }
  const filamentGeometry = remember(new THREE.BufferGeometry());
  filamentGeometry.setAttribute('position', new THREE.Float32BufferAttribute(filamentVertices, 3));
  const filaments = new THREE.LineSegments(filamentGeometry, remember(new THREE.LineBasicMaterial({
    color: GOLD, transparent: true, opacity: 0.36, depthWrite: false,
  })));
  core.add(filaments);

  const astrolabe = new THREE.Group();
  const astrolabeMarkers = [];
  const astrolabeMaterial = remember(new THREE.LineBasicMaterial({ color: 0xf0d7a0, transparent: true, opacity: 0.58, depthWrite: false }));
  for (let index = 0; index < 5; index++) {
    const orbit = new THREE.Group();
    const orbitRadius = 0.97 + index * 0.041;
    orbit.rotation.set(0.4 + index * 0.57, index * 0.69, -0.3 + index * 0.43);
    const points = [];
    for (let step = 0; step <= 128; step++) {
      const angle = step / 128 * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(angle) * orbitRadius, Math.sin(angle) * orbitRadius, 0));
    }
    orbit.add(new THREE.Line(remember(new THREE.BufferGeometry().setFromPoints(points)), astrolabeMaterial));
    const marker = new THREE.Mesh(nodeGeometry, nodeGold);
    marker.scale.setScalar(0.64);
    marker.userData.radius = orbitRadius;
    marker.userData.angle = index * 1.43 + 0.4;
    orbit.add(marker);
    astrolabeMarkers.push(marker);
    astrolabe.add(orbit);
  }
  core.add(astrolabe);

  const particleCount = window.innerWidth <= 760 ? 280 : 620;
  const particlePositions = new Float32Array(particleCount * 3);
  const particleColors = new Float32Array(particleCount * 3);
  const particleBrightness = new Float32Array(particleCount);
  for (let index = 0; index < particleCount; index++) {
    const distance = 1.18 + random() * 3.75;
    const angle = random() * Math.PI * 2;
    particlePositions[index * 3] = Math.cos(angle) * distance;
    particlePositions[index * 3 + 1] = Math.sin(angle) * distance * 0.82;
    particlePositions[index * 3 + 2] = (random() - 0.5) * 4;
    const brightness = 0.55 + random() * 0.45;
    particleBrightness[index] = brightness;
    particleColors[index * 3] = brightness;
    particleColors[index * 3 + 1] = brightness * 0.83;
    particleColors[index * 3 + 2] = brightness * 0.53;
  }
  const particleGeometry = remember(new THREE.BufferGeometry());
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
  const particleMaterial = remember(new THREE.PointsMaterial({ size: 0.038, map: dustTexture, vertexColors: true, transparent: true, opacity: 0.90, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  universe.add(particles);

  const alphabet = ['a', 'e', 'm', 'o', 'v', 'i', 's', 't', 'k'];
  const letterTextures = alphabet.map((letter) => {
    const texture = makeLetterTexture(letter);
    textures.add(texture);
    return texture;
  });
  for (let index = 0; index < 25; index++) {
    const material = remember(new THREE.SpriteMaterial({ map: letterTextures[index % alphabet.length], color: GOLD, transparent: true, opacity: 0.12 + random() * 0.2, depthWrite: false }));
    material.userData.baseOpacity = material.opacity;
    const letter = new THREE.Sprite(material);
    const angle = random() * Math.PI * 2;
    const distance = 1.35 + random() * 2.4;
    letter.position.set(Math.cos(angle) * distance, Math.sin(angle) * distance * 0.9, (random() - 0.5) * 2.4);
    letter.scale.setScalar(0.12 + random() * 0.12);
    letter.userData.home = letter.position.clone();
    letter.userData.seed = random() * 12;
    letterCloud.add(letter);
  }

  const contextGroup = new THREE.Group();
  const outputGroup = new THREE.Group();
  graph.add(contextGroup, outputGroup);
  const nodeObjects = new Map();
  const nodePins = new Map();
  const nodeMaterials = new Map();
  const nodeHalos = new Map();
  const lineMaterials = new Map();
  const neighbourMaterials = [];

  function addGraph(definitions, group) {
    for (const [id, , x, y, z] of definitions) {
      const anchor = new THREE.Group();
      anchor.position.set(x, y, z);
      const pin = new THREE.Mesh(nodeGeometry, nodeGold);
      anchor.add(pin);
      const haloPoints = [];
      for (let step = 0; step <= 48; step++) {
        const angle = step / 48 * Math.PI * 2;
        haloPoints.push(new THREE.Vector3(Math.cos(angle) * 0.106, Math.sin(angle) * 0.106, 0));
      }
      const haloMaterial = remember(new THREE.LineBasicMaterial({ color: 0xe5c98d, transparent: true, opacity: 0.5, depthWrite: false }));
      const halo = new THREE.Line(remember(new THREE.BufferGeometry().setFromPoints(haloPoints)), haloMaterial);
      halo.rotation.set(0.38, -0.2, 0.08);
      anchor.add(halo);
      group.add(anchor);
      nodeObjects.set(id, anchor);
      nodePins.set(id, pin);
      nodeMaterials.set(id, haloMaterial);
      nodeHalos.set(id, halo);

      const bend = new THREE.Vector3(x * 0.49, y * 0.49, z + 0.18);
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), bend, new THREE.Vector3(x, y, z));
      const material = remember(new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.19, depthWrite: false }));
      const connection = new THREE.Line(remember(new THREE.BufferGeometry().setFromPoints(curve.getPoints(26))), material);
      group.add(connection);
      lineMaterials.set(id, material);
    }
    // Neighbouring connections make the context a shared network, rather than isolated outputs.
    for (let index = 0; index < definitions.length; index++) {
      const a = definitions[index];
      const b = definitions[(index + 1) % definitions.length];
      const geometry = remember(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(a[2], a[3], a[4]), new THREE.Vector3(b[2], b[3], b[4]),
      ]));
      const material = remember(new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.085, depthWrite: false }));
      neighbourMaterials.push(material);
      group.add(new THREE.Line(geometry, material));
    }
  }
  addGraph(CONTEXT, contextGroup);
  addGraph(OUTPUTS, outputGroup);

  function updateAppearance() {
    const palette = PALETTES[theme];
    const light = theme === 'light';
    const connectionBoost = compact ? (light ? 1.7 : 1.5) : 1;
    renderer?.setClearColor(palette.background, 0);
    hemisphereLight.color.setHex(light ? 0xffffff : 0xf3dfae);
    hemisphereLight.groundColor.setHex(light ? 0x677c68 : 0x263c30);
    hemisphereLight.intensity = light ? 2.3 : 1.7;
    keyLight.color.setHex(light ? 0xfff6e8 : 0xffefc9);
    keyLight.intensity = light ? 2.1 : 3.2;
    nodeGold.color.setHex(palette.node);
    nodeGold.emissive.setHex(palette.emissive);
    nodeGold.emissiveIntensity = light ? 0.05 : 0.22;
    nodeGold.metalness = light ? 0.2 : 0.55;
    nodeGold.roughness = light ? 0.48 : 0.32;
    for (const ring of rings.children) {
      if (!ring.isLine) continue;
      ring.material.color.setHex(palette.line);
      ring.material.opacity = Math.min(0.9, ring.material.userData.baseOpacity * (light ? 1.28 : 1) * (compact ? 0.72 * connectionBoost : 1));
    }
    filaments.material.color.setHex(palette.filament);
    filaments.material.opacity = light ? (compact ? 0.24 : 0.31) : 0.36;
    astrolabeMaterial.color.setHex(palette.astrolabe);
    astrolabeMaterial.opacity = light ? 0.65 : 0.58;
    for (const material of nodeMaterials.values()) material.color.setHex(palette.halo);
    for (const pin of nodePins.values()) pin.scale.setScalar(compact ? 1.6 : 1);
    for (const marker of astrolabeMarkers) marker.scale.setScalar(0.64 * (compact ? 1.6 : 1));
    for (const sparkle of orbitSparkles.children) sparkle.scale.setScalar(sparkle.userData.baseScale * (compact ? 1.6 : 1));
    for (const material of lineMaterials.values()) material.color.setHex(palette.line);
    for (const material of neighbourMaterials) {
      material.color.setHex(palette.line);
      material.opacity = (light ? 0.2 : 0.085) * connectionBoost;
    }
    markerMaterial.color.setHex(palette.sparkle);
    markerMaterial.map = light ? dustTexture : glowTexture;
    markerMaterial.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
    markerMaterial.opacity = compact ? 0.65 : 0.8;
    markerMaterial.needsUpdate = true;
    particleMaterial.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
    particleMaterial.opacity = light ? (compact ? 0.24 : 0.55) : (compact ? 0.38 : 0.9);
    particleMaterial.size = light ? 0.044 : 0.038;
    particleMaterial.needsUpdate = true;
    const lightParticle = new THREE.Color(0x315847);
    for (let index = 0; index < particleCount; index++) {
      const brightness = particleBrightness[index];
      particleColors[index * 3] = light ? lightParticle.r * brightness : brightness;
      particleColors[index * 3 + 1] = light ? lightParticle.g * brightness : brightness * 0.83;
      particleColors[index * 3 + 2] = light ? lightParticle.b * brightness : brightness * 0.53;
    }
    particleGeometry.attributes.color.needsUpdate = true;
    particleGeometry.setDrawRange(0, compact ? Math.min(particleCount, 105) : particleCount);
    letterCloud.children.forEach((letter, index) => {
      letter.visible = !compact || index < 8;
      letter.material.color.setHex(palette.letter);
      letter.material.opacity = letter.material.userData.baseOpacity * (light ? 1.25 : 1) * (compact ? 0.6 : 1);
    });
    core.scale.setScalar(compact ? 0.59 : 1);
  }

  function updateLabels() {
    const definitions = phase === 1 ? CONTEXT : phase === 2 ? OUTPUTS : [];
    const positions = [];
    for (const [id, button] of buttons) {
      const active = definitions.some((entry) => entry[0] === id);
      button.hidden = !active;
      button.setAttribute('aria-pressed', String(id === selected));
      button.classList.toggle('is-selected', id === selected);
      if (!active) continue;
      if (!renderer || lostContext) {
        const entry = definitions.find((definition) => definition[0] === id);
        const x = clamp(50 + entry[2] * 17, 14, 86);
        const y = clamp(49 - entry[3] * 17, 12, 87);
        positions.push({ button, x: x / 100 * width, y: y / 100 * height });
      } else {
        nodeObjects.get(id).getWorldPosition(projected);
        projected.project(camera);
        // Reserve a label-sized gutter so every control stays inside narrow containers.
        const gutter = Math.min(width * 0.19, id === 'wallace' ? 83 : 65);
        const x = clamp((projected.x * 0.5 + 0.5) * width, gutter, width - gutter);
        const y = clamp((-projected.y * 0.5 + 0.5) * height + (compact ? 19 : 26), 26, height - 26);
        positions.push({ button, x, y });
      }
    }
    // The compact map still exposes the full set of native button controls.
    // Resolve their actual text bounds, including fallback mode and orbit drag,
    // instead of hiding labels or allowing one button to obscure another.
    if (compact) {
      for (const position of positions) {
        position.halfWidth = Math.max(22, position.button.offsetWidth / 2) + 3;
        position.halfHeight = Math.max(22, position.button.offsetHeight / 2) + 2;
        position.x = clamp(position.x, position.halfWidth, Math.max(position.halfWidth, width - position.halfWidth));
        position.y = clamp(position.y, position.halfHeight, Math.max(position.halfHeight, height - position.halfHeight));
      }
      for (let pass = 0; pass < 8; pass++) {
        let overlap = false;
        for (let a = 0; a < positions.length; a++) {
          for (let b = a + 1; b < positions.length; b++) {
            const first = positions[a];
            const second = positions[b];
            const overlapX = first.halfWidth + second.halfWidth - Math.abs(second.x - first.x);
            const overlapY = first.halfHeight + second.halfHeight - Math.abs(second.y - first.y);
            if (overlapX <= 0 || overlapY <= 0) continue;
            overlap = true;
            // Prefer a small horizontal separation so the labels stay beneath
            // their corresponding spheres and keep the expanded hit area useful.
            if (overlapX < overlapY) {
              const direction = second.x >= first.x ? 1 : -1;
              first.x = clamp(first.x - direction * (overlapX / 2 + 1), first.halfWidth, width - first.halfWidth);
              second.x = clamp(second.x + direction * (overlapX / 2 + 1), second.halfWidth, width - second.halfWidth);
            } else {
              const direction = second.y >= first.y ? 1 : -1;
              first.y = clamp(first.y - direction * (overlapY / 2 + 1), first.halfHeight, height - first.halfHeight);
              second.y = clamp(second.y + direction * (overlapY / 2 + 1), second.halfHeight, height - second.halfHeight);
            }
          }
        }
        if (!overlap) break;
      }
    }
    for (const { button, x, y } of positions) {
      button.style.left = `${x.toFixed(1)}px`;
      button.style.top = `${y.toFixed(1)}px`;
    }
  }

  function render(time = performance.now()) {
    frame = 0;
    if (disposed || document.hidden || !inView) return;
    const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
    lastTime = time;
    if (motion) elapsed += delta;
    const easing = motion ? 1 - Math.exp(-delta * 5.3) : 1;
    phaseBlend += (phase - phaseBlend) * easing;
    pointer.x += (targetPointerX - pointer.x) * easing;
    pointer.y += (targetPointerY - pointer.y) * easing;
    universe.rotation.y = orbitX + (motion ? pointer.x * 0.065 : 0);
    universe.rotation.x = orbitY + (motion ? pointer.y * 0.045 : 0);
    const scale = 1 + phaseBlend * 0.052;
    rings.scale.setScalar(scale);
    const cameraTarget = baseCameraZ * (phase === 0 ? 1.035 : phase === 1 ? 1.015 : 1);
    camera.position.z += (cameraTarget - camera.position.z) * easing;
    primaryRing.rotation.z = -0.37 + Math.sin(elapsed * 0.045) * 0.095;
    secondaryRing.rotation.z = 0.52 - Math.sin(elapsed * 0.032) * 0.08;
    particles.rotation.y = elapsed * 0.009;
    particles.rotation.z = elapsed * 0.0025;
    letterCloud.rotation.z = -elapsed * 0.003;
    for (const letter of letterCloud.children) {
      letter.position.y = letter.userData.home.y + Math.sin(elapsed * 0.2 + letter.userData.seed) * 0.055;
    }
    for (const sparkle of orbitSparkles.children) {
      const angle = sparkle.userData.angle + elapsed * 0.026;
      sparkle.position.set(Math.cos(angle) * 2.65, Math.sin(angle) * 1.75, Math.sin(angle + 0.5) * 0.5);
    }
    core.visible = phase > 0;
    core.rotation.y = elapsed * 0.065;
    core.rotation.z = elapsed * 0.018;
    astrolabe.rotation.y = -elapsed * 0.052;
    for (const marker of astrolabeMarkers) {
      const angle = marker.userData.angle + elapsed * 0.10;
      marker.position.set(Math.cos(angle) * marker.userData.radius, Math.sin(angle) * marker.userData.radius, 0);
    }
    contextGroup.visible = phase === 1;
    outputGroup.visible = phase === 2;
    graph.scale.setScalar(0.97 + phaseBlend * 0.016);
    for (const [id, material] of nodeMaterials) material.opacity = id === selected ? 0.95 : theme === 'light' ? 0.7 : 0.43;
    for (const [id, halo] of nodeHalos) halo.scale.setScalar((id === selected ? 1.17 : 1) * (compact ? 1.6 : 1));
    for (const [id, material] of lineMaterials) {
      const opacity = id === selected ? (theme === 'light' ? 0.86 : 0.64) : (theme === 'light' ? 0.32 : 0.18);
      material.opacity = Math.min(0.94, opacity * (compact ? (theme === 'light' ? 1.7 : 1.5) : 1));
    }
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    if (renderer && !lostContext) renderer.render(scene, camera);
    updateLabels();
    if (motion && renderer && !lostContext) frame = requestAnimationFrame(render);
  }

  function invalidate() {
    if (!disposed && !frame && !document.hidden && inView) frame = requestAnimationFrame(render);
  }

  function resize() {
    if (disposed) return;
    const rectangle = container.getBoundingClientRect();
    width = Math.max(1, rectangle.width);
    height = Math.max(1, rectangle.height);
    camera.aspect = width / height;
    // Keep the whole constellation in the short dimension, including its labels.
    // A small, nearly square inspector map needs extra room for the outer rings
    // and all seven labels. Container dimensions, rather than viewport width,
    // determine the fit during the parent's expand/collapse transition.
    baseCameraZ = compact
      ? 10.8 / Math.min(camera.aspect, 1)
      : Math.max(8.5, 8.25 / Math.min(camera.aspect, 1));
    camera.position.z = baseCameraZ * (phase === 0 ? 1.035 : phase === 1 ? 1.015 : 1);
    camera.updateProjectionMatrix();
    renderer?.setSize(width, height, false);
    // Resizing clears a WebGL canvas. Redraw immediately, including while motion
    // is paused, so a viewport change cannot leave blank geometry or stale labels.
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    render();
  }

  function setPhase(value) {
    phase = clamp(Math.round(Number(value) || 0), 0, 2);
    root.dataset.phase = String(phase);
    labels.setAttribute('aria-label', phase === 2 ? 'Tutki tarinan uusia muotoja' : 'Tutki tarinan yhteyksiä');
    if (!motion) phaseBlend = phase;
    updateLabels();
    invalidate();
  }

  function setSelected(id) {
    selected = buttons.has(id) ? id : '';
    updateLabels();
    invalidate();
  }

  function setMotion(enabled) {
    motion = Boolean(enabled);
    root.dataset.motion = String(motion);
    if (!motion) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      phaseBlend = phase;
      targetPointerX = targetPointerY = 0;
    }
    lastTime = 0;
    invalidate();
  }

  function setTheme(value) {
    theme = value === 'light' ? 'light' : 'dark';
    root.dataset.theme = theme;
    updateAppearance();
    // Render once immediately even when animation is disabled.
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    render();
  }

  function setCompact(enabled) {
    compact = Boolean(enabled);
    root.dataset.compact = String(compact);
    root.classList.toggle('is-compact', compact);
    updateAppearance();
    resize();
  }

  function onPointerDown(event) {
    if (event.target.closest('button') || event.button > 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, orbitX, orbitY };
    root.setPointerCapture?.(event.pointerId);
    root.classList.add('is-dragging');
  }
  function onPointerMove(event) {
    const rectangle = container.getBoundingClientRect();
    targetPointerX = ((event.clientX - rectangle.left) / width - 0.5) * 2;
    targetPointerY = ((event.clientY - rectangle.top) / height - 0.5) * 2;
    if (drag?.id === event.pointerId) {
      orbitX = clamp(drag.orbitX + (event.clientX - drag.x) * 0.0022, -0.48, 0.48);
      orbitY = clamp(drag.orbitY + (event.clientY - drag.y) * 0.0012, -0.19, 0.19);
    }
    if (motion || drag) invalidate();
  }
  function onPointerUp(event) {
    if (drag?.id !== event.pointerId) return;
    drag = null;
    root.classList.remove('is-dragging');
    if (root.hasPointerCapture?.(event.pointerId)) root.releasePointerCapture(event.pointerId);
  }
  function onPointerLeave() { targetPointerX = targetPointerY = 0; }
  function onVisibility() {
    if (document.hidden) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    } else {
      lastTime = 0;
      invalidate();
    }
  }
  function onContextLost(event) {
    event.preventDefault();
    lostContext = true;
    root.classList.add('scene-fallback');
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    updateLabels();
  }
  function onContextRestored() {
    lostContext = false;
    root.classList.remove('scene-fallback');
    lastTime = 0;
    invalidate();
  }

  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', onPointerUp);
  root.addEventListener('pointerleave', onPointerLeave);
  document.addEventListener('visibilitychange', onVisibility);
  renderer?.domElement.addEventListener('webglcontextlost', onContextLost);
  renderer?.domElement.addEventListener('webglcontextrestored', onContextRestored);
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(container);
  if (!resizeObserver) window.addEventListener('resize', resize);
  const intersectionObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (!inView && frame) { cancelAnimationFrame(frame); frame = 0; }
    if (inView) { lastTime = 0; invalidate(); }
  }) : null;
  intersectionObserver?.observe(container);

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (frame) cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVisibility);
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerup', onPointerUp);
    root.removeEventListener('pointercancel', onPointerUp);
    root.removeEventListener('pointerleave', onPointerLeave);
    renderer?.domElement.removeEventListener('webglcontextlost', onContextLost);
    renderer?.domElement.removeEventListener('webglcontextrestored', onContextRestored);
    for (const resource of resources) resource.dispose();
    for (const texture of textures) texture.dispose();
    renderer?.dispose();
    root.remove();
  }

  root.dataset.theme = theme;
  root.dataset.compact = String(compact);
  updateAppearance();
  setPhase(0);
  resize();
  queueMicrotask(() => { if (!disposed) onReady({ webgl: Boolean(renderer) }); });
  return { setPhase, setSelected, setMotion, setTheme, setCompact, dispose };
}
