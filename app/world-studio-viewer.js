import * as THREE from './vendor/three/three.module.js';

const BIOMES = {
  village: { sky: '#cbd9d9', ground: '#7d9267', leaf: '#486650', roof: '#76554b' },
  forest: { sky: '#c1d4d0', ground: '#526949', leaf: '#315849', roof: '#675746' },
  coast: { sky: '#c0deea', ground: '#c8b993', leaf: '#657a53', roof: '#84675d' },
  interior: { sky: '#d8d2c8', ground: '#a89880', leaf: '#5d7751', roof: '#766550' },
  city: { sky: '#d2dce0', ground: '#a1aaa2', leaf: '#55715c', roof: '#596979' },
  desert: { sky: '#e4d2ac', ground: '#c4a577', leaf: '#7d8252', roof: '#996c50' },
  snow: { sky: '#cbdce8', ground: '#d7e2e3', leaf: '#597a75', roof: '#b8ccce' },
};
const ENTITY_KINDS = new Set(['building', 'tower', 'tree', 'rock', 'water', 'path', 'character', 'prop']);
const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
const clamp = THREE.MathUtils.clamp;

function finite(value, fallback, minimum, maximum) {
  return Number.isFinite(Number(value)) ? clamp(Number(value), minimum, maximum) : fallback;
}

function color(value, fallback) {
  return new THREE.Color(typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback);
}

function disposeTree(object) {
  if (!object) return;
  const geometries = new Set();
  const materials = new Set();
  object.traverse((child) => {
    if (child.geometry) geometries.add(child.geometry);
    const entries = Array.isArray(child.material) ? child.material : [child.material];
    entries.forEach((material) => { if (material) materials.add(material); });
    if (child.shadow) child.shadow.dispose();
    if (child.isInstancedMesh) child.dispose();
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  object.clear();
}

/**
 * Browser-only, low-poly scene viewer. Entity positions are ground/base centers;
 * scale is the actual [width, height, depth] in meters. Y is up, angles radians.
 * onSelect receives an entity or null. onError receives an Error. load returns
 * true on success and false on failure. No network requests or asset loaders run.
 */
export class WorldStudioViewer {
  constructor(container, { onSelect = () => {}, onError = () => {} } = {}) {
    if (!(container instanceof HTMLElement)) throw new TypeError('3D-näkymän säiliö puuttuu.');
    this.container = container;
    this.onSelect = onSelect;
    this.onError = onError;
    this.active = true;
    this.destroyed = false;
    this.hasWorld = false;
    this.contextLost = false;
    this.frameId = 0;
    this.lastFrame = 0;
    this.viewportWidth = 0;
    this.viewportHeight = 0;
    this.viewMode = 'world';
    this.listeners = [];
    this.keys = new Set();
    this.pointers = new Map();
    this.entities = new Map();
    this.target = new THREE.Vector3();
    this.radius = 30;
    this.theta = Math.PI / 4;
    this.phi = Math.PI / 3.1;
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1200);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    } catch (cause) {
      const error = new Error('3D-näkymä tarvitsee WebGL 2 -tuen. Kokeile ajantasaista selainta ja laitteistokiihdytystä.', { cause });
      this.onError(error);
      throw error;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'world-studio-canvas';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', 'Kolmiulotteinen maailma. Vedä hiirellä kääntääksesi, vieritä zoomataksesi. Liiku WASD- tai nuolinäppäimillä.');
    Object.assign(this.canvas.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none' });
    container.appendChild(this.canvas);
    this._bindControls();
    this.resizeObserver = new ResizeObserver(() => this._resize());
    this.resizeObserver.observe(container);
    this._resize();
  }

  _listen(target, type, callback, options) {
    target.addEventListener(type, callback, options);
    this.listeners.push(() => target.removeEventListener(type, callback, options));
  }

  _bindControls() {
    this._listen(this.canvas, 'contextmenu', (event) => event.preventDefault());
    this._listen(this.canvas, 'pointerdown', (event) => {
      if (!this.hasWorld || !this.active) return;
      this.canvas.focus({ preventScroll: true });
      this.canvas.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, button: event.button, moved: false });
      if (this.pointers.size > 1) this.pointers.forEach((point) => { point.moved = true; });
      event.preventDefault();
    });
    this._listen(this.canvas, 'pointermove', (event) => {
      const point = this.pointers.get(event.pointerId);
      if (!point) return;
      const before = [...this.pointers.values()];
      const oldDistance = before.length === 2 ? Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y) : 0;
      const dx = event.clientX - point.x;
      const dy = event.clientY - point.y;
      point.x = event.clientX;
      point.y = event.clientY;
      point.moved ||= Math.hypot(point.x - point.startX, point.y - point.startY) > 5;
      this.viewMode = 'manual';
      if (this.pointers.size === 2) {
        const points = [...this.pointers.values()];
        const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        if (distance > 2 && oldDistance > 2) this.radius = clamp(this.radius * oldDistance / distance, 1.5, 4000);
        this._pan(dx * 0.5, dy * 0.5);
      } else if (point.button === 2 || event.shiftKey) {
        this._pan(dx, dy);
      } else {
        this.theta -= dx * 0.006;
        this.phi = clamp(this.phi - dy * 0.005, 0.16, Math.PI / 2 - 0.025);
      }
      this._updateCamera();
    });
    const releasePointer = (event, select) => {
      const point = this.pointers.get(event.pointerId);
      this.pointers.delete(event.pointerId);
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
      if (select && point && !point.moved && point.button === 0) this._selectAt(event.clientX, event.clientY);
    };
    this._listen(this.canvas, 'pointerup', (event) => releasePointer(event, true));
    this._listen(this.canvas, 'pointercancel', (event) => releasePointer(event, false));
    this._listen(this.canvas, 'lostpointercapture', (event) => this.pointers.delete(event.pointerId));
    this._listen(this.canvas, 'wheel', (event) => {
      if (!this.hasWorld || !this.active) return;
      event.preventDefault();
      this.viewMode = 'manual';
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.canvas.clientHeight : 1);
      this.radius = clamp(this.radius * Math.exp(clamp(delta, -200, 200) * 0.0018), 1.5, 4000);
      this._updateCamera();
    }, { passive: false });
    this._listen(this.canvas, 'keydown', (event) => {
      if (!this.active || !this.hasWorld || event.ctrlKey || event.metaKey || event.altKey) return;
      if (MOVEMENT_KEYS.has(event.code)) {
        event.preventDefault();
        this.keys.add(event.code);
      } else if (event.code === 'Home') {
        event.preventDefault();
        this.resetView();
      } else if (event.code === 'Escape') {
        this._select(null);
      }
    });
    this._listen(this.canvas, 'keyup', (event) => {
      if (MOVEMENT_KEYS.has(event.code)) event.preventDefault();
      this.keys.delete(event.code);
    });
    this._listen(this.canvas, 'blur', () => this.keys.clear());
    this._listen(window, 'blur', () => { this.keys.clear(); this.pointers.clear(); });
    this._listen(document, 'visibilitychange', () => {
      this.keys.clear();
      this.pointers.clear();
      this._syncAnimation();
    });
    this._listen(this.canvas, 'webglcontextlost', (event) => {
      event.preventDefault();
      this.contextLost = true;
      this._syncAnimation();
      this.onError(new Error('Selaimen 3D-yhteys keskeytyi. Näkymä palautuu, kun grafiikkayhteys on taas käytettävissä.'));
    });
    this._listen(this.canvas, 'webglcontextrestored', () => {
      this.contextLost = false;
      this._resize();
      this._syncAnimation();
    });
  }

  _pan(dx, dy) {
    const factor = this.radius / Math.max(this.canvas.clientHeight, 240) * 0.85;
    this.target.x += (-Math.cos(this.theta) * dx + Math.sin(this.theta) * dy) * factor;
    this.target.z += (Math.sin(this.theta) * dx + Math.cos(this.theta) * dy) * factor;
    this._clampTarget();
  }

  _clampTarget() {
    this.target.x = clamp(this.target.x, -650, 650);
    this.target.z = clamp(this.target.z, -650, 650);
  }

  _updateCamera() {
    this.camera.position.set(
      this.target.x + this.radius * Math.sin(this.phi) * Math.sin(this.theta),
      this.target.y + this.radius * Math.cos(this.phi),
      this.target.z + this.radius * Math.sin(this.phi) * Math.cos(this.theta),
    );
    this.camera.lookAt(this.target);
    this.camera.far = Math.max(1200, this.radius * 4);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  _resize({ refit = true } = {}) {
    if (this.destroyed) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    // Hidden tabs must not replace a useful camera aspect with a 1x1 canvas.
    if (width < 1 || height < 1) return;
    if (width === this.viewportWidth && height === this.viewportHeight) return;
    const previousAspect = this.camera.aspect;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (!refit || !this.hasWorld) return;
    if (this.viewMode === 'world') {
      this.resetView({ resize: false });
    } else if (this.camera.aspect < previousAspect) {
      // Preserve the user's focus/heading while keeping the former horizontal
      // field of view when a desktop preview becomes a narrow mobile viewport.
      this.radius = clamp(this.radius * previousAspect / this.camera.aspect, 1.5, 4000);
      this._updateCamera();
    }
  }

  _syncAnimation() {
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    this.lastFrame = 0;
    if (this.active && this.hasWorld && !this.destroyed && !document.hidden && !this.contextLost) {
      this.frameId = requestAnimationFrame((time) => this._frame(time));
    }
  }

  _frame(time) {
    this.frameId = 0;
    if (!this.active || !this.hasWorld || this.destroyed || document.hidden || this.contextLost) return;
    const delta = Math.min((time - (this.lastFrame || time)) / 1000, 0.05);
    this.lastFrame = time;
    if (this.keys.size && document.activeElement === this.canvas) {
      this.viewMode = 'manual';
      let forward = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
      let right = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
      const length = Math.hypot(forward, right) || 1;
      forward /= length;
      right /= length;
      const speed = clamp(this.radius * 0.45, 2, 55) * delta;
      this.target.x += (-Math.sin(this.theta) * forward + Math.cos(this.theta) * right) * speed;
      this.target.z += (-Math.cos(this.theta) * forward - Math.sin(this.theta) * right) * speed;
      this._clampTarget();
      this._updateCamera();
    }
    try {
      this.renderer.render(this.scene, this.camera);
    } catch (cause) {
      this.active = false;
      this.onError(new Error('3D-näkymän piirtäminen keskeytyi. Lataa maailma uudelleen.', { cause }));
      return;
    }
    this.frameId = requestAnimationFrame((nextTime) => this._frame(nextTime));
  }

  load(world) {
    if (this.destroyed) return false;
    try {
      if (!world || !Array.isArray(world.entities)) throw new Error('Maailman kohdelista puuttuu.');
      if (world.entities.length > 48) throw new Error('3D-näkymään voi ladata enintään 48 kohdetta.');
      const seenIds = new Set();
      for (const entity of world.entities) {
        if (!entity || !ENTITY_KINDS.has(entity.kind) || !entity.id || seenIds.has(entity.id)) throw new Error('Maailman kohteen tyyppi tai tunniste on virheellinen.');
        seenIds.add(entity.id);
      }
      this._clearWorld();
      this.scene = new THREE.Scene();
      this.content = new THREE.Group();
      this.scene.add(this.content);
      this.palette = BIOMES[world.environment?.biome] || BIOMES.village;
      this.biome = world.environment?.biome || 'village';
      const environment = world.environment || {};
      this.scene.background = color(environment.sky_color, this.palette.sky);
      this.world = world;
      for (const entity of world.entities) {
        const object = this._entity(entity);
        this.entities.set(entity.id, { entity, object });
        this.content.add(object);
      }
      this.content.updateMatrixWorld(true);
      this.worldBounds = new THREE.Box3().setFromObject(this.content);
      if (this.worldBounds.isEmpty()) this.worldBounds.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 2, 5));
      this._environment(environment);
      this.hasWorld = true;
      this._resize();
      this.resetView();
      this._syncAnimation();
      return true;
    } catch (error) {
      this._clearWorld();
      this.onError(error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  _material(value, options = {}) {
    return new THREE.MeshStandardMaterial({ color: value, roughness: 0.88, metalness: 0, flatShading: true, ...options });
  }

  _mesh(parent, geometry, material, position = [0, 0, 0], scale = [1, 1, 1]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  _entity(entity) {
    const wrapper = new THREE.Group();
    const model = new THREE.Group();
    wrapper.add(model);
    const defaultColors = { building: '#c8bca2', tower: '#a7aa9d', tree: this.palette.leaf, rock: '#8f9992', water: '#6299a5', path: '#b6a280', character: '#bd7852', prop: '#997950' };
    const mainColor = color(entity.color, defaultColors[entity.kind]);
    const main = this._material(mainColor);
    const dark = this._material(mainColor.clone().multiplyScalar(0.63));
    const wood = this._material('#66503b');
    const roof = this._material(this.palette.roof);
    const box = (material, position, scale) => this._mesh(model, new THREE.BoxGeometry(1, 1, 1), material, position, scale);
    const cylinder = (top, bottom, height, sides, material, position) => this._mesh(model, new THREE.CylinderGeometry(top, bottom, height, sides), material, position);

    switch (entity.kind) {
      case 'building': {
        box(dark, [0, 0.035, 0], [1, 0.07, 1]);
        box(main, [0, 0.39, 0], [0.94, 0.71, 0.94]);
        const gable = new THREE.Shape();
        gable.moveTo(-0.47, 0);
        gable.lineTo(0.47, 0);
        gable.lineTo(0, 0.27);
        gable.closePath();
        const gableMaterial = this._material(mainColor.clone().multiplyScalar(0.93), { side: THREE.DoubleSide });
        this._mesh(model, new THREE.ShapeGeometry(gable), gableMaterial, [0, 0.745, 0.47]);
        this._mesh(model, new THREE.ShapeGeometry(gable), gableMaterial, [0, 0.745, -0.47]);
        const leftRoof = box(roof, [-0.267, 0.865, 0], [0.625, 0.055, 1.08]);
        leftRoof.rotation.z = 0.51;
        const rightRoof = box(roof, [0.267, 0.865, 0], [0.625, 0.055, 1.08]);
        rightRoof.rotation.z = -0.51;
        box(wood, [-0.532, 0.716, 0], [0.04, 0.06, 1.1]);
        box(wood, [0.532, 0.716, 0], [0.04, 0.06, 1.1]);
        box(dark, [0, 0.235, 0.478], [0.23, 0.41, 0.028]);
        box(wood, [0, 0.225, 0.499], [0.18, 0.38, 0.025]);
        const windowMaterial = this._material('#66878b', { emissive: this.world.environment?.time_of_day === 'night' ? '#e1a64c' : '#000000', emissiveIntensity: 0.8 });
        for (const x of [-0.285, 0.285]) {
          box(wood, [x, 0.45, 0.481], [0.19, 0.225, 0.032]);
          box(windowMaterial, [x, 0.45, 0.503], [0.145, 0.18, 0.025]);
          box(wood, [x, 0.45, 0.52], [0.015, 0.18, 0.018]);
          box(wood, [x, 0.45, 0.52], [0.145, 0.015, 0.018]);
        }
        box(wood, [0.481, 0.45, 0], [0.032, 0.225, 0.23]);
        box(windowMaterial, [0.503, 0.45, 0], [0.025, 0.18, 0.19]);
        break;
      }
      case 'tower': {
        cylinder(0.35, 0.4, 0.79, 8, main, [0, 0.395, 0]);
        cylinder(0.42, 0.42, 0.09, 8, dark, [0, 0.79, 0]);
        this._mesh(model, new THREE.ConeGeometry(0.49, 0.22, 8), roof, [0, 0.945, 0]);
        box(wood, [0, 0.14, 0.392], [0.13, 0.25, 0.018]);
        box(dark, [0, 0.6, 0.356], [0.07, 0.16, 0.018]);
        break;
      }
      case 'tree': {
        cylinder(0.055, 0.09, 0.56, 6, wood, [0, 0.28, 0]);
        if (this.biome === 'forest' || this.biome === 'snow') {
          this._mesh(model, new THREE.ConeGeometry(0.5, 0.56, 7), main, [0, 0.59, 0]);
          this._mesh(model, new THREE.ConeGeometry(0.34, 0.53, 7), this.biome === 'snow' ? this._material('#d6e2df') : main, [0, 0.81, 0]);
        } else {
          this._mesh(model, new THREE.IcosahedronGeometry(0.48, 1), main, [0, 0.72, 0], [1, 0.88, 1]);
          this._mesh(model, new THREE.IcosahedronGeometry(0.26, 0), main, [0.25, 0.61, 0.08]);
        }
        break;
      }
      case 'rock': {
        const stone = this._mesh(model, new THREE.DodecahedronGeometry(0.5, 0), main, [0, 0.38, 0], [1, 0.82, 0.92]);
        stone.rotation.set(0.18, 0.34, -0.14);
        break;
      }
      case 'water': {
        box(dark, [0, 0.45, 0], [1, 0.9, 1]);
        const surface = this._mesh(model, new THREE.PlaneGeometry(1, 1), this._material(mainColor, { roughness: 0.24, metalness: 0.16 }), [0, 0.905, 0]);
        surface.rotation.x = -Math.PI / 2;
        surface.castShadow = false;
        const ripple = this._material(mainColor.clone().lerp(new THREE.Color('#ffffff'), 0.22));
        for (let i = 0; i < 5; i += 1) box(ripple, [(i % 2 ? 0.1 : -0.1), 0.911, -0.32 + i * 0.15], [0.28, 0.005, 0.009]);
        break;
      }
      case 'path': {
        box(main, [0, 0.5, 0], [1, 1, 1]);
        break;
      }
      case 'character': {
        const skin = this._material('#d0a883');
        cylinder(0.125, 0.16, 0.3, 7, main, [0, 0.57, 0]);
        this._mesh(model, new THREE.IcosahedronGeometry(0.135, 1), skin, [0, 0.875, 0]);
        box(dark, [-0.078, 0.215, 0], [0.095, 0.43, 0.12]);
        box(dark, [0.078, 0.215, 0], [0.095, 0.43, 0.12]);
        const leftArm = cylinder(0.048, 0.04, 0.32, 5, main, [-0.17, 0.53, 0]);
        leftArm.rotation.z = -0.16;
        const rightArm = cylinder(0.048, 0.04, 0.32, 5, main, [0.17, 0.53, 0]);
        rightArm.rotation.z = 0.16;
        break;
      }
      default: {
        box(main, [0, 0.5, 0], [0.9, 1, 0.9]);
        box(dark, [0, 0.96, 0], [1, 0.08, 1]);
        box(wood, [0, 0.5, 0.46], [0.09, 0.95, 0.035]);
        box(wood, [0, 0.5, -0.46], [0.09, 0.95, 0.035]);
      }
    }

    // Dispose unused per-kind palette materials too; shared used materials are
    // disposed once by disposeTree when the scene is replaced or destroyed.
    const used = new Set();
    model.traverse((child) => { if (child.material) used.add(child.material); });
    [main, dark, wood, roof].forEach((material) => { if (!used.has(material)) material.dispose(); });
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    model.scale.set(1 / size.x, 1 / size.y, 1 / size.z);
    model.position.set(-center.x / size.x, -bounds.min.y / size.y, -center.z / size.z);
    wrapper.name = String(entity.name || entity.id);
    wrapper.userData.entityId = entity.id;
    wrapper.position.set(...[0, 1, 2].map((axis) => finite(entity.position?.[axis], 0, -500, 500)));
    wrapper.scale.set(...[0, 1, 2].map((axis) => finite(entity.scale?.[axis], 1, 0.02, 100)));
    wrapper.rotation.y = finite(entity.rotation_y, 0, -Math.PI * 100, Math.PI * 100);
    return wrapper;
  }

  _environment(environment) {
    const size = this.worldBounds.getSize(new THREE.Vector3());
    const center = this.worldBounds.getCenter(new THREE.Vector3());
    const extent = Math.max(size.x, size.z, 14);
    // This is continuous terrain, not an island-sized rectangle. Its distant
    // boundary is well beyond the fog so no square edge frames the miniatures.
    const groundSize = Math.max(1600, extent * 18);
    const indexedGround = new THREE.PlaneGeometry(groundSize, groundSize, 36, 36);
    const ground = indexedGround.toNonIndexed();
    indexedGround.dispose();
    ground.rotateX(-Math.PI / 2);
    const groundColor = color(environment.ground_color, this.palette.ground);
    const colors = [];
    const positions = ground.getAttribute('position');
    for (let vertex = 0; vertex < positions.count; vertex += 3) {
      const triangle = vertex / 3;
      const shade = groundColor.clone().multiplyScalar(0.985 + (Math.sin(triangle * 12.9898) * 43758.5453 % 1 + 1) * 0.012);
      for (let corner = 0; corner < 3; corner += 1) colors.push(shade.r, shade.g, shade.b);
    }
    ground.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const groundMesh = this._mesh(this.scene, ground, this._material('#ffffff', { vertexColors: true }), [center.x, -0.035, center.z]);
    groundMesh.castShadow = false;
    this._groundDressing(groundColor);
    // Fog belongs behind the actual subject; putting it at the initial camera
    // distance bleaches every roof and tree before the user even moves.
    this.scene.fog = new THREE.Fog(this.scene.background, Math.max(150, extent * 3.4), Math.max(420, extent * 8));
    const night = environment.time_of_day === 'night';
    const sunset = environment.time_of_day === 'sunset';
    if (night && this.scene.background.getHSL({}).l > 0.25) this.scene.background.lerp(new THREE.Color('#26364a'), 0.82);
    else if (sunset) this.scene.background.lerp(new THREE.Color('#d7a084'), 0.32);
    this.scene.fog.color.copy(this.scene.background);
    this.renderer.toneMappingExposure = night ? 1.08 : 0.92;
    this.scene.add(new THREE.HemisphereLight(night ? '#a6c4df' : '#d3e4e5', night ? '#29352f' : '#514c3f', night ? 0.9 : 1.05));
    const sun = new THREE.DirectionalLight(night ? '#bad4ec' : sunset ? '#ffc38e' : '#ffdfa9', night ? 1.0 : 2.7);
    sun.position.set(center.x - extent * 0.55, Math.max(extent * (sunset ? 0.38 : 0.64), 12), center.z + extent * 0.7);
    sun.target.position.set(center.x, 0, center.z);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const shadowExtent = extent * 0.8 + 8;
    Object.assign(sun.shadow.camera, { left: -shadowExtent, right: shadowExtent, top: shadowExtent, bottom: -shadowExtent, near: 0.5, far: extent * 4 + 80 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.camera.updateProjectionMatrix();
    this.scene.add(sun, sun.target);
  }

  _groundDressing(groundColor) {
    // Decorative ground patches and tufts are deliberately outside `content`:
    // they cannot be selected, exported, or treated as manuscript entities.
    const dressing = new THREE.Group();
    dressing.name = 'visual-only-biome-dressing';
    dressing.userData.visualOnly = true;
    this.scene.add(dressing);
    const patchGeometry = new THREE.CircleGeometry(1, 7);
    patchGeometry.rotateX(-Math.PI / 2);
    const patchMaterials = [0.92, 1.035].map((factor) => this._material(groundColor.clone().multiplyScalar(factor)));
    let seed = 17;
    for (const record of this.entities.values()) {
      for (const character of record.entity.id) seed = Math.imul(seed, 31) + character.charCodeAt(0) | 0;
    }
    const random = () => {
      seed = Math.imul(1664525, seed) + 1013904223 | 0;
      return (seed >>> 0) / 4294967296;
    };
    const tuftTransforms = [];
    const grassy = ['village', 'forest', 'coast'].includes(this.biome);
    let patchCount = 0;
    for (const { entity, object } of this.entities.values()) {
      if (['water', 'path', 'character'].includes(entity.kind) || object.position.y < -0.02) continue;
      const radius = Math.max(object.scale.x, object.scale.z) * 0.65;
      for (let i = 0; i < 4; i += 1) {
        const angle = random() * Math.PI * 2;
        const distance = radius * (0.8 + random() * 0.9);
        const x = object.position.x + Math.sin(angle) * distance;
        const z = object.position.z + Math.cos(angle) * distance;
        const patch = this._mesh(dressing, patchGeometry, patchMaterials[i % 2], [x, -0.028 + (i % 2) * 0.001, z], [0.75 + random() * 1.5, 1, 0.5 + random()]);
        patch.rotation.y = angle;
        patch.castShadow = false;
        patchCount += 1;
        if (grassy) {
          for (let tuft = 0; tuft < 3; tuft += 1) tuftTransforms.push([x + random() - 0.5, z + random() - 0.5, 0.75 + random() * 0.6]);
        }
      }
    }
    if (!patchCount) {
      patchGeometry.dispose();
      patchMaterials.forEach((material) => material.dispose());
    }
    if (tuftTransforms.length) {
      const geometry = new THREE.ConeGeometry(0.15, 0.52, 3);
      const material = this._material(this.biome === 'coast' ? '#7b8551' : this.palette.leaf);
      const grass = new THREE.InstancedMesh(geometry, material, tuftTransforms.length);
      const transform = new THREE.Object3D();
      tuftTransforms.forEach(([x, z, size], index) => {
        transform.position.set(x, 0.26 * size - 0.02, z);
        transform.scale.set(size, size, size);
        transform.rotation.y = random() * Math.PI;
        transform.updateMatrix();
        grass.setMatrixAt(index, transform.matrix);
      });
      grass.receiveShadow = true;
      grass.computeBoundingSphere();
      dressing.add(grass);
    }
  }

  _selectAt(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || !this.content) return;
    this.pointer.set((clientX - rect.left) / rect.width * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.content.children, true)[0];
    let object = hit?.object;
    while (object && !object.userData.entityId) object = object.parent;
    this._select(object?.userData.entityId || null);
  }

  _select(id, notify = true) {
    if (this.selection) {
      this.scene?.remove(this.selection);
      this.selection.geometry.dispose();
      this.selection.material.dispose();
      this.selection = null;
    }
    const record = this.entities.get(id);
    if (record) {
      const bounds = new THREE.Box3().setFromObject(record.object);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      this.selection = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.51, 64), new THREE.MeshBasicMaterial({ color: '#e4bb67', transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false }));
      this.selection.rotation.x = -Math.PI / 2;
      this.selection.scale.set(Math.max(size.x * 1.35, 0.9), Math.max(size.z * 1.35, 0.9), 1);
      this.selection.position.set(center.x, bounds.min.y + 0.015, center.z);
      this.scene.add(this.selection);
    }
    if (notify) this.onSelect(record?.entity || null);
  }

  resetView({ resize = true } = {}) {
    if (!this.hasWorld || this.destroyed) return;
    // Read current layout synchronously too: a reset click can arrive before
    // ResizeObserver has delivered the new phone-width dimensions.
    if (resize) this._resize({ refit: false });
    this.viewMode = 'world';
    const size = this.worldBounds.getSize(new THREE.Vector3());
    this.worldBounds.getCenter(this.target);
    this.target.y = Math.max(0, this.worldBounds.min.y + size.y * 0.2);
    this.theta = Math.PI / 4;
    this.phi = Math.PI / 3.05;
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const verticalSlope = Math.tan(fov / 2) * 0.89;
    const horizontalSlope = verticalSlope * this.camera.aspect;
    const backward = new THREE.Vector3(Math.sin(this.phi) * Math.sin(this.theta), Math.cos(this.phi), Math.sin(this.phi) * Math.cos(this.theta));
    const right = new THREE.Vector3(Math.cos(this.theta), 0, -Math.sin(this.theta));
    const up = new THREE.Vector3().crossVectors(backward, right);
    const corner = new THREE.Vector3();
    let distance = 8;
    // Fit real entities in camera space. A world bounding sphere includes huge
    // empty diagonal corners and makes a sparse village needlessly microscopic.
    for (const { object } of this.entities.values()) {
      const bounds = new THREE.Box3().setFromObject(object);
      for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
          for (const z of [bounds.min.z, bounds.max.z]) {
            corner.set(x, y, z).sub(this.target);
            const depth = corner.dot(backward);
            distance = Math.max(distance, depth + Math.abs(corner.dot(right)) / horizontalSlope, depth + Math.abs(corner.dot(up)) / verticalSlope);
          }
        }
      }
    }
    this.radius = clamp(distance, 8, 4000);
    this._updateCamera();
  }

  focusEntity(id) {
    const record = this.entities.get(id);
    if (!record || this.destroyed) return false;
    this.viewMode = 'manual';
    const bounds = new THREE.Box3().setFromObject(record.object);
    const size = bounds.getSize(new THREE.Vector3());
    bounds.getCenter(this.target);
    this.radius = clamp(size.length() * 2.2, 3.5, 250);
    this.phi = Math.PI / 3.1;
    this._select(id, false);
    this._updateCamera();
    return true;
  }

  setActive(value) {
    if (this.destroyed) return;
    this.active = Boolean(value);
    this.keys.clear();
    this.pointers.clear();
    if (this.active) this._resize();
    this._syncAnimation();
  }

  _clearWorld() {
    this.hasWorld = false;
    this.keys.clear();
    this.pointers.clear();
    this._syncAnimation();
    disposeTree(this.scene);
    this.scene = null;
    this.content = null;
    this.selection = null;
    this.worldBounds = null;
    this.world = null;
    this.entities.clear();
    this.renderer?.renderLists.dispose();
    if (!this.destroyed && !this.contextLost) this.renderer?.clear();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this._clearWorld();
    this.resizeObserver.disconnect();
    this.listeners.forEach((remove) => remove());
    this.listeners = [];
    // Release drawing-buffer storage without simulating a GPU/context failure.
    // dispose() frees renderer resources; WEBGL_lose_context is not needed for
    // routine navigation or changing projects.
    this.renderer.setSize(1, 1, false);
    this.renderer.dispose();
    this.canvas.remove();
    this.renderer = null;
    this.canvas = null;
    this.container = null;
    this.resizeObserver = null;
  }
}
