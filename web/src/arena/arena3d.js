import * as THREE_NS from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createDuelQueue } from './duelQueue.ts';
import { scriptDuel } from './scriptDuel.ts';
import { createSeededRandom, hashString, spawnAnchor } from './seeded.ts';
import { lin, G as KIT_GEOMETRIES } from './scene/kit.js';
import { buildIsland, updateIsland, WORLD_R, U } from './scene/island.js';
import { createMonsterModel, MODEL_SCALE, variantFromHash, growthFactor } from './scene/monsters.js';
import { renderMonsterIcons } from './scene/icons.js';
import { setMonsterIconImages } from '../chain/monsters.ts';
import { coinAvatarHtml } from '../chain/coinImage.ts';
import { MONSTER_BLURB, ELEMENT_STYLE, skinSwatchCss, trapTab } from './launchInfo.ts';
import { formatMonCompact, formatMonExact, formatRelativeTime, shortAddress } from '../chain/format.ts';

const THREE = { ...THREE_NS, OrbitControls };


const MONSTER_CATALOG = {
  fire_dragon: {
    id: 'fire_dragon',
    name: 'Fire Dragon',
    element: 'fire',
    sizeClass: 'medium',
    scaleUnits: 1.9,
    icon: '🐉',
    primaryColor: 0xff4d12,
    secondaryColor: 0xc81e12,
    bellyColor: 0xffd24a,
    glowColor: 0xffe14a,
    badgeHex: '#ff4d12',
    locomotion: 'winged_biped',
    attackName: 'Fire Breath',
    description: 'Brave winged cartoon dragon in orange-red with golden belly plates & fire breath.'
  },
  ice_wolf: {
    id: 'ice_wolf',
    name: 'Ice Wolf',
    element: 'ice',
    sizeClass: 'medium',
    scaleUnits: 1.72,
    icon: '🐺',
    primaryColor: 0x1aa8f0,
    secondaryColor: 0x0d5ec4,
    bellyColor: 0xf4fbff,
    glowColor: 0x8ae8ff,
    badgeHex: '#1aa8f0',
    locomotion: 'quadruped',
    attackName: 'Ice Slash',
    description: 'Nimble frost wolf in ice blue with stylized cyan back crystals & crescent slash.'
  },
  earth_golem: {
    id: 'earth_golem',
    name: 'Earth Golem',
    element: 'earth',
    sizeClass: 'large',
    scaleUnits: 2.45,
    icon: '🗿',
    primaryColor: 0xc46a3a,
    secondaryColor: 0xe8c48a,
    bellyColor: 0x5c3424,
    glowColor: 0x3ad14a,
    badgeHex: '#c46a3a',
    locomotion: 'heavy_biped',
    attackName: 'Ground Slam',
    description: 'Chunky stone colossus in warm earth rock with lush moss shoulders & seismic slam.'
  },
  electric_fox: {
    id: 'electric_fox',
    name: 'Electric Fox',
    element: 'electric',
    sizeClass: 'medium',
    scaleUnits: 1.6,
    icon: '🦊',
    primaryColor: 0xffb800,
    secondaryColor: 0xff6a00,
    bellyColor: 0xfff0d2,
    glowColor: 0xffe566,
    badgeHex: '#ffb800',
    locomotion: 'agile_quadruped',
    attackName: 'Thunder Dash',
    description: 'Spirited kitsune in golden-amber with cream chest, multi-tiered tails & voltage dash.'
  },
  dark_spirit: {
    id: 'dark_spirit',
    name: 'Dark Spirit',
    element: 'dark',
    sizeClass: 'small',
    scaleUnits: 1.35,
    icon: '👾',
    primaryColor: 0x7c2bff,
    secondaryColor: 0x3d0d80,
    bellyColor: 0x3d0d80,
    glowColor: 0xe8c4ff,
    badgeHex: '#7c2bff',
    locomotion: 'floating',
    attackName: 'Dark Orb',
    description: 'Playful floating shadow spirit in deep violet with glowing eyes & phantom soul-fire.'
  }
};

const SKIN_MODIFIERS = {
  default:  { label: 'Default',   tint: null,     accent: null,     emissiveBoost: 0.28 },
  obsidian: { label: 'Obsidian',  tint: 0x1e293b, accent: 0xf97316, emissiveBoost: 0.52 },
  royal:    { label: 'Gold',      tint: 0xfbbf24, accent: 0xfef08a, emissiveBoost: 0.45 },
  crystal:  { label: 'Azure',     tint: 0x0ea5e9, accent: 0x7dd3fc, emissiveBoost: 0.48 },
  celestial:{ label: 'Mythic',    tint: 0xc026d3, accent: 0xf472b6, emissiveBoost: 0.52 }
};

const INITIAL_TOKENS = [
  { ticker: 'MOOND',   name: 'Moon Dragon Protocol', monsterId: 'fire_dragon',  lp: 52400, skinId: 'royal' },
  { ticker: 'FIRECAT', name: 'FireCat On-Chain',     monsterId: 'fire_dragon',  lp: 48200, skinId: 'default' },
  { ticker: 'AQUA',    name: 'Aqua Frost Wolf',      monsterId: 'ice_wolf',     lp: 36900, skinId: 'crystal' },
  { ticker: 'TITAN',   name: 'Gaia Monolith LP',     monsterId: 'earth_golem',  lp: 34100, skinId: 'default' },
  { ticker: 'VOLT',    name: 'Volt Kitsune',         monsterId: 'electric_fox', lp: 31500, skinId: 'royal' },
  { ticker: 'SHADE',   name: 'Nether Wraith',        monsterId: 'dark_spirit',  lp: 28900, skinId: 'celestial' },
  { ticker: 'DRACO',   name: 'Draco Ignis',          monsterId: 'fire_dragon',  lp: 26400, skinId: 'obsidian' },
  { ticker: 'GLACIER', name: 'Glacier Fang',         monsterId: 'ice_wolf',     lp: 24800, skinId: 'default' },
  { ticker: 'KITSUNE', name: 'Spark NineTail',       monsterId: 'electric_fox', lp: 22300, skinId: 'default' },
  { ticker: 'CRAG',    name: 'Basalt Guardian',      monsterId: 'earth_golem',  lp: 19700, skinId: 'obsidian' },
  { ticker: 'UMBRA',   name: 'Umbra Core',           monsterId: 'dark_spirit',  lp: 18400, skinId: 'default' },
  { ticker: 'PYRO',    name: 'Pyro Scale',           monsterId: 'fire_dragon',  lp: 16900, skinId: 'default' }
];

const TICKER_PREFIXES = ['SOL', 'REX', 'ZAP', 'ICE', 'ASH', 'ORB', 'VEX', 'LUX', 'KAI', 'TOR', 'NYX', 'FEN', 'GRIM', 'BLAZE', 'FROST', 'TERRA', 'SPARK', 'VOID', 'NOVA', 'RUNE'];

const WORLD_RADIUS = WORLD_R;
const BIOMES = {
  ICE:    { name: 'Ice Zone (25%)',    angleStart: -Math.PI * 0.75, angleEnd: -Math.PI * 0.25, color: '#38bdf8', pos: { x: 0, z: -82 } },
  DARK:   { name: 'Dark Zone (20%)',   angleStart: -Math.PI * 0.25, angleEnd:  Math.PI * 0.25, color: '#a855f7', pos: { x: 82, z: 0 } },
  LAVA:   { name: 'Lava Zone (25%)',   angleStart:  Math.PI * 0.25, angleEnd:  Math.PI * 0.75, color: '#ef4444', pos: { x: 0, z: 82 } },
  FOREST: { name: 'Forest Zone (30%)', angleStart:  Math.PI * 0.75, angleEnd: -Math.PI * 0.75, color: '#22c55e', pos: { x: -82, z: 0 } }
};

function getBiomeAt(x, z) {
  const dist = Math.hypot(x, z);
  if (dist < 26) return 'Central Citadel';
  if (Math.abs(z) >= Math.abs(x)) {
    return z < 0 ? 'Ice' : 'Lava';
  } else {
    return x < 0 ? 'Forest' : 'Dark';
  }
}

let simMode = false;
let centralCrown = null;
const sceneListeners = {};

function emit(name, payload) {
  const list = sceneListeners[name];
  if (!list) return;
  list.slice().forEach(cb => cb(payload));
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

function zoneLabel(biome) {
  return biome === 'Central Citadel' ? biome : `${biome} Zone`;
}

const ELEMENT_PILL_BASE = 'text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full';
const ELEMENT_PILL_CLASS = {
  fire: 'bg-red-100 text-red-700 border border-red-300',
  ice: 'bg-sky-100 text-sky-700 border border-sky-300',
  earth: 'bg-amber-100 text-amber-800 border border-amber-300',
  electric: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
  dark: 'bg-purple-100 text-purple-700 border border-purple-300'
};

function formatPoolValue(m) {
  return simMode ? `$${(m.lp / 1000).toFixed(1)}K` : formatMonCompact(m.lp);
}

function formatDetailPool(m) {
  return simMode ? `$${m.lp.toLocaleString()}` : formatMonExact(m.lp);
}

function refreshRelativeTimes() {
  const now = Date.now();
  document.querySelectorAll('[data-feed-ts]').forEach(el => {
    el.textContent = formatRelativeTime(now, Number(el.dataset.feedTs));
  });
}

const container = document.getElementById('canvas-container');
const labelsContainer = document.getElementById('world-labels');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x63c4f4);
scene.fog = new THREE.Fog(lin(0x7fd0f6), 420 * U, 900 * U);

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 10 * U, 1000 * U);
// Pre-port framing (0,178,202 -> 0,0,10 for radius 135) scaled with the island.
const WORLD_MONSTER_K = 0.4;
const DEFAULT_CAM_POS = new THREE.Vector3(0, 377.8 * U, 132.2 * U);
const DEFAULT_CAM_TARGET = new THREE.Vector3(0, 0, 10 * U);
camera.position.copy(DEFAULT_CAM_POS);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

let selectedMonster = null;
const controls = new THREE.OrbitControls(camera, renderer.domElement);
// Dev-only handles for screenshot tooling; stripped from production builds.
if (import.meta.env.DEV) Object.assign(window, { __renderer: renderer, __scene: scene, __camera: camera, __controls: controls });

controls.target.copy(DEFAULT_CAM_TARGET);
controls.enableDamping = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2.35;
controls.minPolarAngle = Math.PI / 6;
controls.minDistance = 65 * U;
controls.maxDistance = 420 * U;
controls.enablePan = true;
controls.panSpeed = 0.85;

let isDraggingView = false;
controls.addEventListener('start', () => {
  isDraggingView = true;
  isZoomingToMonster = false;
  isResettingCamera = false;
});
controls.addEventListener('end', () => {
  isDraggingView = false;
});

controls.addEventListener('change', () => {
  controls.target.x = Math.max(-110 * U, Math.min(110 * U, controls.target.x));
  controls.target.z = Math.max(-110 * U, Math.min(110 * U, controls.target.z));
  if (!selectedMonster) controls.target.y = 0;
});

let isResettingCamera = false;
let isZoomingToMonster = false;
const targetZoomPos = new THREE.Vector3();
const targetZoomTarget = new THREE.Vector3();

// Monster close-ups are framed by monster size (kept from the pre-port arena), not island size; the 54/40 offsets give ~67 units, well outside controls.minDistance (45.5).
function computeMonsterZoom(m, camDir) {
  const spec = MONSTER_CATALOG[m.monsterId];
  const isLarge = spec && spec.sizeClass === 'large';
  const horizDist = isLarge ? 58 : 54;
  const heightDist = isLarge ? 44 : 40;
  const targetY = isLarge ? 3.6 : 3.0;
  targetZoomTarget.set(m.x, targetY, m.z);
  targetZoomPos.set(m.x + camDir.x * horizDist, targetY + heightDist, m.z + camDir.z * horizDist);
}

function zoomCameraToMonster(m) {
  if (!m) return;
  isResettingCamera = false;
  isZoomingToMonster = true;

  const camDir = camera.position.clone().sub(controls.target);
  camDir.y = 0;
  if (camDir.lengthSq() < 0.001) camDir.set(0, 0, 1);
  camDir.normalize();

  computeMonsterZoom(m, camDir);
}

let finalFocus = null;

function beginFinalDuelFocus(a, b) {
  finalFocus = { a, b };
  isResettingCamera = false;
  isZoomingToMonster = false;
}

function endFinalDuelFocus() {
  if (!finalFocus) return;
  finalFocus = null;
  if (!isDraggingView) isResettingCamera = true;
}

function updateFinalDuelFocus() {
  const { a, b } = finalFocus;
  if (!monsters.includes(a) || !monsters.includes(b)) {
    endFinalDuelFocus();
    return;
  }
  const midX = (a.x + b.x) * 0.5;
  const midZ = (a.z + b.z) * 0.5;
  const span = Math.hypot(a.x - b.x, a.z - b.z);
  const dist = Math.max(60, 54 + span * 1.4);
  const camDir = camera.position.clone().sub(controls.target);
  camDir.y = 0;
  if (camDir.lengthSq() < 0.001) camDir.set(0, 0, 1);
  camDir.normalize();
  const focusTarget = new THREE.Vector3(midX, 3, midZ);
  const focusPos = new THREE.Vector3(midX + camDir.x * dist, 3 + dist * 0.55, midZ + camDir.z * dist);
  const ease = reducedMotionQuery.matches ? 1 : 0.05;
  camera.position.lerp(focusPos, ease);
  controls.target.lerp(focusTarget, ease);
}

function fitToWorld() {
  endFinalDuelFocus();
  selectMonster(null);
  isResettingCamera = true;
  isZoomingToMonster = false;
}

const hemiLight = new THREE.HemisphereLight(0xffffff, lin(0xb8e08c), 0.5);
scene.add(hemiLight);

const mainDirLight = new THREE.DirectionalLight(0xfff4dc, 0.8);
mainDirLight.position.set(105 * U, 190 * U, 124 * U);
mainDirLight.castShadow = true;
mainDirLight.shadow.mapSize.width = 2048;
mainDirLight.shadow.mapSize.height = 2048;
mainDirLight.shadow.camera.near = 20 * U;
mainDirLight.shadow.camera.far = 450 * U;
const d = 155 * U;
mainDirLight.shadow.camera.left = -d;
mainDirLight.shadow.camera.right = d;
mainDirLight.shadow.camera.top = d;
mainDirLight.shadow.camera.bottom = -d;
mainDirLight.shadow.bias = -0.0004;
mainDirLight.shadow.normalBias = 0.3;
mainDirLight.shadow.radius = 3;
scene.add(mainDirLight);

const crownLight = new THREE.PointLight(0xffd16a, 0.5, 120 * U);
crownLight.position.set(0, 20 * U, 0);
scene.add(crownLight);

const environmentGroup = new THREE.Group();
scene.add(environmentGroup);

const obstacles = [];

const islandRoot = new THREE.Group();
environmentGroup.add(islandRoot);
const islandData = buildIsland(islandRoot);
islandData.occupied.forEach(([x, z, rad, kind]) => {
  if (kind === 'b' || kind === 't' || kind === 'm') obstacles.push({ x, z, r: rad });
});

const CROWN_Y = 12 * U;
const crownMesh = new THREE.Mesh(
  new THREE.OctahedronGeometry(2.6 * U, 0),
  new THREE.MeshLambertMaterial({ color: lin(0xffd23f), emissive: lin(0xf5a623), emissiveIntensity: 0.8 })
);
crownMesh.scale.set(0.85, 1.4, 0.85);
crownMesh.position.y = CROWN_Y;
crownMesh.name = 'centralCrown';
crownMesh.castShadow = true;
environmentGroup.add(crownMesh);

const biomeDOMElements = [];
[
  { label: 'Forest Zone (30%)', x: -82 * U, y: 12 * U, z: 0, bg: 'rgba(76, 184, 119, 0.92)', border: '#fff7e2' },
  { label: 'Ice Zone (25%)',    x: 0,   y: 16 * U, z: -86 * U, bg: 'rgba(63, 127, 224, 0.92)', border: '#fff7e2' },
  { label: 'Lava Zone (25%)',   x: 0,   y: 14 * U, z: 86 * U, bg: 'rgba(226, 69, 60, 0.92)', border: '#fff7e2' },
  { label: 'Dark Zone (20%)',   x: 86 * U,  y: 16 * U, z: 0, bg: 'rgba(122, 84, 214, 0.92)', border: '#fff7e2' },
  { label: 'Central Citadel',   x: 0,   y: CROWN_Y + 9 * U, z: 0, bg: 'rgba(247, 166, 52, 0.95)', border: '#fff7e2' }
].forEach(b => {
  const el = document.createElement('div');
  el.className = 'biome-tag text-white shadow-lg';
  el.style.background = b.bg;
  el.style.border = `1px solid ${b.border}`;
  el.textContent = b.label;
  labelsContainer.appendChild(el);
  biomeDOMElements.push({ ...b, el });
});

const POINT_SPRITE = (() => {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

const SHARED_GEO = {
  sphere:    new THREE.SphereGeometry(1, 20, 16),
  sphereLow: new THREE.SphereGeometry(1, 12, 10),
  box:       new THREE.BoxGeometry(1, 1, 1),
  cone:      new THREE.ConeGeometry(1, 1, 14),
  cone4:     new THREE.ConeGeometry(1, 1, 4),
  cyl:       new THREE.CylinderGeometry(1, 1, 1, 12),
  octa:      new THREE.OctahedronGeometry(1, 0),
  dodeca:    new THREE.DodecahedronGeometry(1, 0),
  torus:     new THREE.TorusGeometry(1, 0.14, 8, 24)
};


const SKIN_ALBEDO_TINT = 0.3;

function skinAlbedoTint(skinId) {
  const skin = SKIN_MODIFIERS[skinId] || SKIN_MODIFIERS.default;
  const tint = new THREE.Color(0xffffff);
  if (skin.tint !== null) tint.lerp(new THREE.Color(skin.tint), SKIN_ALBEDO_TINT);
  return tint;
}

function getMonsterPalette(monsterId, skinId = 'default') {
  const spec = MONSTER_CATALOG[monsterId] || MONSTER_CATALOG.fire_dragon;
  const skin = SKIN_MODIFIERS[skinId] || SKIN_MODIFIERS.default;

  const primary = new THREE.Color(spec.primaryColor);
  const secondary = new THREE.Color(spec.secondaryColor);
  const belly = new THREE.Color(spec.bellyColor);
  const glow = new THREE.Color(spec.glowColor);

  if (skin.tint !== null) {
    primary.lerp(new THREE.Color(skin.tint), 0.62);
    belly.lerp(new THREE.Color(skin.tint), 0.35);
  }
  if (skin.accent !== null) {
    secondary.lerp(new THREE.Color(skin.accent), 0.7);
    glow.lerp(new THREE.Color(skin.accent), 0.65);
  }

  return {
    primary,
    secondary,
    belly,
    glow,
    emissiveBoost: skin.emissiveBoost
  };
}

function createMonster3DMesh(monsterId, skinId = 'default', variantSeed = 0, opts = {}) {
  const spec = MONSTER_CATALOG[monsterId] || MONSTER_CATALOG.fire_dragon;
  const pal = getMonsterPalette(monsterId, skinId);
  const variant = variantSeed ? variantFromHash(monsterId, variantSeed) : null;
  const model = createMonsterModel(monsterId, {
    tint: skinAlbedoTint(skinId).getHex(),
    variant,
    hi: !!opts.hi,
    flat: !!opts.flat,
    glowColor: pal.glow.getHex()
  });
  const baseSize = (MODEL_SCALE[monsterId] || 2.4) * (variant ? variant.size : 1) * (opts.hi ? 1 : WORLD_MONSTER_K);
  model.root.scale.setScalar(baseSize);
  // Pre-port ground rings were sized by scaleUnits * 0.85; keep their world radius despite the new model scale.
  const ringK = (spec.scaleUnits * 0.85 * (opts.hi ? 1 : WORLD_MONSTER_K)) / baseSize;
  model.baseRing.scale.setScalar(ringK);
  model.selectionRing.scale.setScalar(ringK);
  return { ...model, spec, baseSize, baseScale: baseSize };
}

function applyMonsterSkin(monster, newSkinId) {
  if (!SKIN_MODIFIERS[newSkinId]) return;
  monster.skinId = newSkinId;
  const pal = getMonsterPalette(monster.monsterId, newSkinId);
  monster.visual.setTint(skinAlbedoTint(newSkinId).getHex());
  monster.visual.baseRing.material.color.copy(lin(pal.glow.getHex()));
}

let monsters = [];
let activeDuels = [];
let particleSystems = [];
// selectedMonster hoisted above
let totalConsumptions = 0;
let targetPopulation = 60;
let selectiveLabels = true;
let showBiomeMarkers = true;
let autoRespawn = true;
let activeElementFilter = 'all';
let activeModelFilter = 'all';
let searchTickerQuery = '';

const inspectorContainer = document.getElementById('inspector-canvas-container');
const inspectorScene = new THREE.Scene();
inspectorScene.background = new THREE.Color(0xf6ead0);

const inspectorCamera = new THREE.PerspectiveCamera(34, 340 / 176, 0.1, 60);
inspectorCamera.position.set(2.4, 2.2, 3.8);
inspectorCamera.lookAt(0, 1.05, 0);

const inspectorRenderer = new THREE.WebGLRenderer({ antialias: true });
inspectorRenderer.setSize(340, 176);
inspectorRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
inspectorRenderer.outputEncoding = THREE.sRGBEncoding;
inspectorContainer.appendChild(inspectorRenderer.domElement);

const inspectorHemi = new THREE.HemisphereLight(0xffffff, lin(0xb8e08c), 0.62);
inspectorScene.add(inspectorHemi);
const inspectorDir = new THREE.DirectionalLight(0xfff4dc, 0.85);
inspectorDir.position.set(3, 6, 4);
inspectorScene.add(inspectorDir);
const inspectorBackLight = new THREE.PointLight(0x7fd0f6, 0.6, 12);
inspectorBackLight.position.set(-2.5, 3, -3);
inspectorScene.add(inspectorBackLight);

const inspectorPedestalGroup = new THREE.Group();
const pedBase = new THREE.Mesh(
  new THREE.CylinderGeometry(1.55, 1.75, 0.28, 32),
  new THREE.MeshLambertMaterial({ color: lin(0xe8c88f) })
);
pedBase.position.y = -0.14;
const pedRing = new THREE.Mesh(
  new THREE.RingGeometry(1.32, 1.48, 32),
  new THREE.MeshBasicMaterial({ color: lin(0xf7a634), side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
);
pedRing.rotation.x = -Math.PI / 2;
pedRing.position.y = 0.01;
inspectorPedestalGroup.add(pedBase, pedRing);
inspectorScene.add(inspectorPedestalGroup);

let inspectorVisual = null;
let inspectorTargetYaw = 0.55;
let inspectorCurrentYaw = 0.55;
let isDraggingInspector = false;
let inspectorDragStartX = 0;

inspectorContainer.addEventListener('pointerdown', (e) => {
  isDraggingInspector = true;
  inspectorDragStartX = e.clientX;
  e.stopPropagation();
});
window.addEventListener('pointermove', (e) => {
  if (!isDraggingInspector) return;
  const dx = e.clientX - inspectorDragStartX;
  inspectorDragStartX = e.clientX;
  inspectorTargetYaw += dx * 0.018;
});
window.addEventListener('pointerup', () => {
  isDraggingInspector = false;
});

let inspectorFrame = 0;

function rebuildInspectorModel() {
  if (inspectorVisual) {
    inspectorScene.remove(inspectorVisual.root);
    inspectorVisual = null;
  }
  if (!selectedMonster) return;
  inspectorVisual = createMonster3DMesh(selectedMonster.monsterId, selectedMonster.skinId, selectedMonster.variantSeed, { hi: true });
  const fitScale = selectedMonster.monsterId === 'earth_golem' ? 0.92 : 1.0;
  inspectorVisual.root.scale.setScalar(fitScale);
  inspectorVisual.root.position.set(0, 0, 0);
  inspectorVisual.selectionRing.visible = false;
  inspectorScene.add(inspectorVisual.root);

  const pal = getMonsterPalette(selectedMonster.monsterId, selectedMonster.skinId);
  pedRing.material.color.copy(lin(pal.glow.getHex()));
  inspectorBackLight.color.copy(pal.glow);

  const w = inspectorContainer.clientWidth || 340;
  const h = inspectorContainer.clientHeight || 176;
  inspectorRenderer.setSize(w, h);
  inspectorCamera.aspect = w / h;
  inspectorCamera.updateProjectionMatrix();
}

// ---- Launch modal preview -------------------------------------------------------------------
// One small renderer per open launch modal (sim DOM modal and the chain React island share this).
// Created on open, disposed on close, so a closed modal costs no GPU or rAF time.
let launchPreviewLive = 0;

function disposeModelVisual(visual) {
  if (!visual) return;
  const shared = new Set(Object.values(KIT_GEOMETRIES));
  visual.root.traverse((o) => {
    if (!o.isMesh) return;
    if (!shared.has(o.geometry)) o.geometry.dispose();
  });
  [visual.baseRing, visual.selectionRing, visual.absorbAura].forEach((m) => m.material.dispose());
}

export function mountLaunchPreview(container, opts = {}) {
  let monsterId = MONSTER_CATALOG[opts.monsterId] ? opts.monsterId : 'fire_dragon';
  let skinId = SKIN_MODIFIERS[opts.skinId] ? opts.skinId : 'default';
  container.classList.add('launch-preview');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    container.classList.add('launch-preview-nogl');
    const spec = MONSTER_CATALOG[monsterId];
    container.dataset.fallback = spec.icon;
    return { supported: false, setMonster(id) { if (MONSTER_CATALOG[id]) container.dataset.fallback = MONSTER_CATALOG[id].icon; }, setSkin() {}, dispose() {} };
  }
  launchPreviewLive += 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.className = 'launch-preview-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  container.prepend(canvas);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, lin(0xb8e08c), 0.7));
  const key = new THREE.DirectionalLight(0xfff4dc, 0.85);
  key.position.set(3, 6, 4);
  scene.add(key);
  const rim = new THREE.PointLight(0x7fd0f6, 0.7, 14);
  rim.position.set(-3, 3.2, -3);
  scene.add(rim);

  // Ground disc: cream plinth, teal rim, glow ring in the monster colour, soft contact shadow.
  const stage = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.05, 0.24, 40), new THREE.MeshLambertMaterial({ color: lin(0xf1e2bd) }));
  disc.position.y = -0.12;
  const discRim = new THREE.Mesh(new THREE.CylinderGeometry(2.07, 2.1, 0.1, 40), new THREE.MeshLambertMaterial({ color: lin(0x2b7a8e) }));
  discRim.position.y = -0.2;
  const glowRing = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.66, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: lin(0xffe14a), transparent: true, opacity: 0.85, depthWrite: false }));
  glowRing.position.y = 0.012;
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 64;
  const sctx = shadowCanvas.getContext('2d');
  if (sctx) {
    const grad = sctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(20,60,80,0.38)');
    grad.addColorStop(1, 'rgba(20,60,80,0)');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 64, 64);
  }
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.position.y = 0.008;
  stage.add(disc, discRim, glowRing, shadow);
  scene.add(stage);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  const camDir = new THREE.Vector3(0.52, 0.3, 0.8).normalize();
  const camTarget = new THREE.Vector3(0, 1.0, 0);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let visual = null;
  let fit = 1;
  let yaw = 0.5;
  let dragging = false;
  let lastX = 0;
  let resumeAt = 0;
  let popT = 1;
  let disposed = false;
  let raf = 0;

  function resize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const dist = 2.35 / Math.tan(Math.min(vHalf, hHalf));
    camera.position.copy(camTarget).addScaledVector(camDir, dist);
    camera.lookAt(camTarget);
  }

  function rebuild() {
    if (visual) {
      scene.remove(visual.root);
      disposeModelVisual(visual);
      visual = null;
    }
    visual = createMonster3DMesh(monsterId, skinId, 0, { hi: true });
    visual.selectionRing.visible = false;
    visual.baseRing.visible = false;
    visual.absorbAura.visible = false;
    visual.root.scale.setScalar(1);
    visual.anim(0, false);
    visual.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(visual.bodyRig);
    const size = box.getSize(new THREE.Vector3());
    fit = Math.min(2.5 / Math.max(size.y, 0.01), 3.2 / Math.max(size.x, size.z, 0.01));
    visual.root.scale.setScalar(fit);
    visual.root.position.set(0, 0, 0);
    scene.add(visual.root);
    const pal = getMonsterPalette(monsterId, skinId);
    glowRing.material.color.copy(lin(pal.glow.getHex()));
    rim.color.copy(pal.glow);
    popT = 0;
  }

  function frame(now) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const t = now / 1000;
    if (!dragging && !reduceMotion && now > resumeAt) yaw += 0.011;
    if (visual) {
      popT = Math.min(1, popT + 0.06);
      const c1 = 1.70158;
      const k = popT >= 1 ? 1 : 1 + (c1 + 1) * Math.pow(popT - 1, 3) + c1 * Math.pow(popT - 1, 2);
      visual.root.scale.setScalar(fit * (0.8 + 0.2 * k));
      visual.root.rotation.y = yaw;
      animateVisualRig(visual, monsterId, 'idle', reduceMotion ? 0.4 : t, 0, true);
    }
    glowRing.material.opacity = 0.7 + Math.sin(t * 2.2) * 0.15;
    renderer.render(scene, camera);
  }

  const onDown = (e) => {
    dragging = true;
    lastX = e.clientX;
    try { container.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    e.stopPropagation();
  };
  const onMove = (e) => {
    if (!dragging) return;
    yaw += (e.clientX - lastX) * 0.018;
    lastX = e.clientX;
  };
  const onUp = () => {
    dragging = false;
    resumeAt = performance.now() + 1500;
  };
  const onKey = (e) => {
    if (e.key === 'ArrowLeft') yaw -= 0.35;
    else if (e.key === 'ArrowRight') yaw += 0.35;
    else return;
    resumeAt = performance.now() + 1500;
    e.preventDefault();
  };
  container.addEventListener('pointerdown', onDown);
  container.addEventListener('pointermove', onMove);
  container.addEventListener('pointerup', onUp);
  container.addEventListener('pointercancel', onUp);
  container.addEventListener('keydown', onKey);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(container);

  resize();
  rebuild();
  raf = requestAnimationFrame(frame);
  if (document.documentElement.dataset.debug !== undefined) window.__launchPreviewLive = () => launchPreviewLive;

  return {
    supported: true,
    setMonster(id) {
      if (disposed || !MONSTER_CATALOG[id] || id === monsterId) return;
      monsterId = id;
      rebuild();
    },
    setSkin(id) {
      if (disposed || !SKIN_MODIFIERS[id] || id === skinId) return;
      skinId = id;
      rebuild();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerup', onUp);
      container.removeEventListener('pointercancel', onUp);
      container.removeEventListener('keydown', onKey);
      disposeModelVisual(visual);
      [disc, discRim, glowRing, shadow].forEach((m) => { m.geometry.dispose(); m.material.dispose(); });
      shadowTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      container.classList.remove('launch-preview');
      launchPreviewLive -= 1;
    }
  };
}

function findSafeSpawnPosition() {
  for (let attempt = 0; attempt < 40; attempt++) {
    const r = (18 + Math.random() * (135 - 28)) * U;
    const theta = Math.random() * Math.PI * 2;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;

    let blocked = false;
    for (const ob of obstacles) {
      if (Math.hypot(x - ob.x, z - ob.z) < ob.r + 2.8) {
        blocked = true;
        break;
      }
    }
    if (!blocked) return { x, z };
  }
  return { x: (Math.random() - 0.5) * 60 * U, z: (Math.random() - 0.5) * 60 * U };
}

const MONSTER_KEYS_LIST = Object.keys(MONSTER_CATALOG);
const MONSTER_ICON_URL = renderMonsterIcons(MONSTER_KEYS_LIST);
setMonsterIconImages(MONSTER_KEYS_LIST.map(id => MONSTER_ICON_URL[id] || ''));

function coinAvatar(entity, cls = 'w-6 h-6') {
  return coinAvatarHtml(entity.imageUri, `${entity.ticker} token image`, cls) || iconImg(entity.monsterId, cls);
}

function iconImg(monsterId, cls = 'w-6 h-6') {
  const url = MONSTER_ICON_URL[monsterId];
  if (!url) return MONSTER_CATALOG[monsterId].icon;
  return `<img src="${url}" alt="" class="${cls} object-contain shrink-0" draggable="false">`;
}

function sanitizeTicker(raw) {
  return String(raw || 'TOKEN').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 7) || 'TOKEN';
}

function spawnShowcaseMonsters() {
  if (monsters.length >= 5) return;
  const showcaseDefs = [
    { ticker: 'DRAGON', name: 'Fire Dragon',   monsterId: 'fire_dragon', lp: 52000, skinId: 'royal',    pos: { x: 0,   z: 13 } },
    { ticker: 'WOLF',   name: 'Ice Wolf',      monsterId: 'ice_wolf',    lp: 43000, skinId: 'crystal',  pos: { x: -8,  z: 10 } },
    { ticker: 'GOLEM',  name: 'Earth Golem',   monsterId: 'earth_golem', lp: 47000, skinId: 'default',  pos: { x: 8,   z: 10 } },
    { ticker: 'FOX',    name: 'Electric Fox',  monsterId: 'electric_fox',lp: 38000, skinId: 'default',  pos: { x: -14, z: 6 } },
    { ticker: 'SPIRIT', name: 'Dark Spirit',   monsterId: 'dark_spirit', lp: 31000, skinId: 'celestial',pos: { x: 14,  z: 6 } }
  ];
  showcaseDefs.forEach((d, idx) => {
    if (!monsters.some(m => m.monsterId === d.monsterId)) {
      const ent = spawnMonsterEntity(d);
      if (idx === 0) {
        setTimeout(() => selectMonster(ent, 'init'), 100);
      }
    }
  });
}
if (import.meta.env.DEV) window.__spawnShowcase = spawnShowcaseMonsters;

function spawnMonsterEntity(tokenConfig) {
  const monsterId = MONSTER_CATALOG[tokenConfig.monsterId] ? tokenConfig.monsterId : 'fire_dragon';
  const spec = MONSTER_CATALOG[monsterId];
  const ticker = sanitizeTicker(tokenConfig.ticker);
  const skinId = SKIN_MODIFIERS[tokenConfig.skinId] ? tokenConfig.skinId : 'default';
  const pos = tokenConfig.pos || findSafeSpawnPosition();

  const uid = tokenConfig.uid || ('m_' + Math.random().toString(36).slice(2, 10));
  const variantSeed = hashString('variant:' + uid) || 1;
  const visual = createMonster3DMesh(monsterId, skinId, variantSeed, { flat: monsters.length >= 150 });
  visual.root.position.set(pos.x, 0, pos.z);
  scene.add(visual.root);

  const labelEl = document.createElement('div');
  labelEl.className = 'monster-label';
  labelEl.innerHTML = `
    <div class="combat-hp-bar hidden"><div class="combat-hp-fill" style="width:100%"></div></div>
    <div class="monster-ticker-pill">
      <span class="rank-crown hidden text-amber-400">👑</span>
      <span class="label-avatar hidden"></span>
      <span class="w-1.5 h-1.5 rounded-full" style="background:${spec.badgeHex}"></span>
      <span class="ticker-text">${escapeHtml(ticker)}</span>
    </div>
    <div class="pool-gauge hidden"><div class="pool-gauge-fill" style="width:0%"></div></div>
  `;
  labelsContainer.appendChild(labelEl);

  const rand = tokenConfig.rand || Math.random;
  const angle = rand() * Math.PI * 2;
  const speed = (spec.locomotion === 'agile_quadruped' ? 7.4 : spec.locomotion === 'heavy_biped' ? 4.3 : 5.8) * (0.9 + rand() * 0.25);

  const entity = {
    uid,
    variantSeed,
    tokenId: tokenConfig.tokenId || ('0x' + Math.random().toString(16).slice(2, 6) + '...' + Math.random().toString(16).slice(2, 6)),
    name: String(tokenConfig.name || `${ticker} Protocol`).slice(0, 32),
    ticker,
    monsterId,
    element: spec.element,
    skinId,
    lp: tokenConfig.lp === undefined ? Math.round(4000 + Math.random() * 32000) : Number(tokenConfig.lp) || 0,
    rank: 999,
    wins: 0,
    x: pos.x,
    z: pos.z,
    vx: Math.sin(angle),
    vz: Math.cos(angle),
    speed,
    facing: angle,
    state: 'walk',
    stateTimer: 2 + rand() * 4,
    animPhase: rand() * Math.PI * 2,
    hp: 100,
    maxHp: 100,
    opponentTicker: null,
    rand,
    level: 1,
    xp: 0,
    isHouse: false,
    order: 999,
    scripted: false,
    pendingClashes: 0,
    combatCooldown: 1.5 + rand() * 3,
    visual,
    labelEl,
    hpBarEl: labelEl.querySelector('.combat-hp-bar'),
    hpFillEl: labelEl.querySelector('.combat-hp-fill'),
    imageUri: undefined,
    avatarEl: labelEl.querySelector('.label-avatar'),
    pillEl: labelEl.querySelector('.monster-ticker-pill'),
    crownEl: labelEl.querySelector('.rank-crown'),
    gaugeEl: labelEl.querySelector('.pool-gauge'),
    gaugeFillEl: labelEl.querySelector('.pool-gauge-fill')
  };

  monsters.push(entity);
  return entity;
}

function createRandomTokenConfig(index) {
  if (index < INITIAL_TOKENS.length) {
    return { ...INITIAL_TOKENS[index] };
  }
  const catalogKeys = Object.keys(MONSTER_CATALOG);
  const skinKeys = Object.keys(SKIN_MODIFIERS);
  const monsterId = catalogKeys[index % catalogKeys.length];
  const skinId = skinKeys[(index * 3) % skinKeys.length];
  const prefix = TICKER_PREFIXES[index % TICKER_PREFIXES.length];
  const suffix = index >= TICKER_PREFIXES.length ? String(index) : '';
  const ticker = (prefix + suffix).slice(0, 6);
  return {
    ticker,
    name: `${ticker} Monster Token`,
    monsterId,
    skinId,
    lp: Math.round(2500 + Math.random() * 24000)
  };
}

function syncPopulation(newCount) {
  targetPopulation = newCount;
  document.getElementById('stat-target-count').textContent = targetPopulation;

  while (monsters.length < targetPopulation) {
    spawnMonsterEntity(createRandomTokenConfig(monsters.length));
  }
  while (monsters.length > targetPopulation) {
    const candidateIdx = monsters.findIndex(m => m.state !== 'combat' && m.state !== 'consuming' && m !== selectedMonster);
    if (candidateIdx === -1) break;
    const removed = monsters.splice(candidateIdx, 1)[0];
    scene.remove(removed.visual.root);
    removed.labelEl.remove();
  }
  recalculateLeaderboard();
}

const FLOATER_CLASS = {
  damage: 'damage-floater',
  consume: 'consume-floater',
  boost: 'consume-floater boost-floater',
  xp: 'consume-floater xp-floater'
};

function spawnFloatingText(worldPos, text, type = 'damage') {
  const projected = worldPos.clone();
  projected.project(camera);
  if (projected.z > 1) return;
  const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-(projected.y * 0.5) + 0.5) * window.innerHeight;

  const el = document.createElement('div');
  el.className = FLOATER_CLASS[type] || 'damage-floater';
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  labelsContainer.appendChild(el);
  setTimeout(() => el.remove(), type === 'damage' ? 850 : 1300);
}

let lastReducedBurstAt = -10000;

function spawnVictoryCelebrationBurst(x, y, z) {
  if (reducedMotionQuery.matches) {
    const nowMs = performance.now();
    if (nowMs - lastReducedBurstAt < 4000) return;
    lastReducedBurstAt = nowMs;
  }
  const count = 34;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const velocities = [];
  const palette = [
    new THREE.Color(0xfacc15),
    new THREE.Color(0x4ade80),
    new THREE.Color(0x38bdf8),
    new THREE.Color(0xf472b6),
    new THREE.Color(0xfef08a)
  ];

  for (let i = 0; i < count; i++) {
    positions[i * 3]     = x + (Math.random() - 0.5) * 1.2;
    positions[i * 3 + 1] = y + 1.0;
    positions[i * 3 + 2] = z + (Math.random() - 0.5) * 1.2;
    const c = palette[i % palette.length];
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;

    const theta = Math.random() * Math.PI * 2;
    const speed = 3.5 + Math.random() * 6.5;
    velocities.push({
      vx: Math.cos(theta) * speed,
      vy: 6.5 + Math.random() * 7.5,
      vz: Math.sin(theta) * speed
    });
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 2.0, vertexColors: true, transparent: true, opacity: 1.0, map: POINT_SPRITE, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  particleSystems.push({
    type: 'burst',
    points,
    velocities,
    age: 0,
    maxAge: 0.95
  });
}

function spawnSignatureAttackVFX(attacker, targetPos) {
  const pal = getMonsterPalette(attacker.monsterId, attacker.skinId);
  const startX = attacker.x;
  const startZ = attacker.z;
  const tx = targetPos ? targetPos.x : startX + Math.sin(attacker.facing) * 3.5;
  const tz = targetPos ? targetPos.z : startZ + Math.cos(attacker.facing) * 3.5;
  const dirX = tx - startX;
  const dirZ = tz - startZ;

  if (attacker.monsterId === 'fire_dragon') {
    const count = 28;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3]     = startX + dirX * 0.22;
      positions[i * 3 + 1] = 2.4 + (Math.random() - 0.5) * 0.3;
      positions[i * 3 + 2] = startZ + dirZ * 0.22;
      const speed = 2.2 + Math.random() * 2.2;
      velocities.push({
        vx: dirX * speed + (Math.random() - 0.5) * 3.2,
        vy: -1.2 + (Math.random() - 0.5) * 2.2,
        vz: dirZ * speed + (Math.random() - 0.5) * 3.2
      });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xff7700, size: 2.1, transparent: true, opacity: 0.95, map: POINT_SPRITE, depthWrite: false });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    particleSystems.push({ type: 'burst', points, velocities, age: 0, maxAge: 0.42 });

  } else if (attacker.monsterId === 'ice_wolf') {
    const slashGeo = new THREE.RingGeometry(1.2, 2.3, 18, 1, -Math.PI * 0.45, Math.PI * 0.9);
    const slashMat = new THREE.MeshBasicMaterial({ color: pal.glow, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
    const slashMesh = new THREE.Mesh(slashGeo, slashMat);
    slashMesh.position.set((startX + tx) * 0.5, 1.8, (startZ + tz) * 0.5);
    slashMesh.rotation.y = attacker.facing;
    slashMesh.rotation.x = Math.PI * 0.35;
    scene.add(slashMesh);
    particleSystems.push({ type: 'mesh_wave', mesh: slashMesh, expandRate: 2.6, age: 0, maxAge: 0.38 });

  } else if (attacker.monsterId === 'earth_golem') {
    const ringGeo = new THREE.RingGeometry(0.8, 1.6, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(tx, 0.18, tz);
    scene.add(ringMesh);
    particleSystems.push({ type: 'mesh_wave', mesh: ringMesh, expandRate: 4.2, age: 0, maxAge: 0.45 });

  } else if (attacker.monsterId === 'electric_fox') {
    const boltPoints = [];
    const steps = 6;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const jitter = (s === 0 || s === steps) ? 0 : (Math.random() - 0.5) * 1.2;
      boltPoints.push(new THREE.Vector3(
        THREE.MathUtils.lerp(startX, tx, t) + jitter,
        1.6 + Math.sin(t * Math.PI) * 1.1 + jitter * 0.5,
        THREE.MathUtils.lerp(startZ, tz, t) - jitter
      ));
    }
    const boltGeo = new THREE.BufferGeometry().setFromPoints(boltPoints);
    const boltMat = new THREE.LineBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 1 });
    const boltLine = new THREE.Line(boltGeo, boltMat);
    scene.add(boltLine);
    particleSystems.push({ type: 'mesh_wave', mesh: boltLine, expandRate: 0, age: 0, maxAge: 0.32 });

  } else {
    const orbMesh = new THREE.Mesh(
      SHARED_GEO.sphereLow,
      new THREE.MeshBasicMaterial({ color: pal.glow, transparent: true, opacity: 0.95 })
    );
    orbMesh.scale.setScalar(0.65);
    orbMesh.position.set(startX, 2.0, startZ);
    scene.add(orbMesh);
    particleSystems.push({
      type: 'projectile_orb',
      mesh: orbMesh,
      startX, startZ, tx, tz,
      age: 0,
      maxAge: 0.36
    });
  }

  spawnAttackImpactBurst(tx, 1.8, tz, pal.glow.getHex());
}

function spawnAttackImpactBurst(x, y, z, colorHex) {
  const geo = new THREE.BufferGeometry();
  const count = 16;
  const positions = new Float32Array(count * 3);
  const velocities = [];
  for (let i = 0; i < count; i++) {
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const speed = 4 + Math.random() * 8;
    velocities.push({
      vx: Math.cos(theta) * Math.sin(phi) * speed,
      vy: Math.abs(Math.cos(phi)) * speed + 2,
      vz: Math.sin(theta) * Math.sin(phi) * speed
    });
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: colorHex, size: 1.45, transparent: true, opacity: 1, map: POINT_SPRITE, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  particleSystems.push({
    type: 'burst',
    points,
    velocities,
    age: 0,
    maxAge: 0.42
  });
}

function spawnConsumptionParticleStream(loser, winner, streamColor) {
  const count = 42;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const offsets = [];
  const spec = MONSTER_CATALOG[loser.monsterId];

  for (let i = 0; i < count; i++) {
    const ox = (Math.random() - 0.5) * 2.4;
    const oy = 0.5 + Math.random() * 2.5;
    const oz = (Math.random() - 0.5) * 2.4;
    positions[i * 3]     = loser.x + ox;
    positions[i * 3 + 1] = oy;
    positions[i * 3 + 2] = loser.z + oz;
    offsets.push({ ox, oy, oz, delay: Math.random() * 0.25 });
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: streamColor === undefined ? spec.glowColor : streamColor,
    size: 1.9,
    transparent: true,
    opacity: 0.95,
    map: POINT_SPRITE,
    depthWrite: false
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  particleSystems.push({
    type: 'consumption_stream',
    points,
    offsets,
    startX: loser.x,
    startZ: loser.z,
    winner,
    age: 0,
    maxAge: 1.05
  });
}

function startDuel(m1, m2) {
  m1.state = 'combat';
  m2.state = 'combat';
  m1.hp = 100;
  m2.hp = 100;
  m1.opponentTicker = m2.ticker;
  m2.opponentTicker = m1.ticker;
  m1.hpBarEl.classList.remove('hidden');
  m2.hpBarEl.classList.remove('hidden');
  m1.hpFillEl.style.width = '100%';
  m2.hpFillEl.style.width = '100%';

  m1.facing = Math.atan2(m2.x - m1.x, m2.z - m1.z);
  m2.facing = Math.atan2(m1.x - m2.x, m1.z - m2.z);

  activeDuels.push({
    m1,
    m2,
    timer: 0,
    nextStrike: 0.35,
    turn: 0
  });
}

function resolveDuel(duel, winner, loser) {
  winner.state = 'victory';
  winner.stateTimer = 2.4;
  if (simMode) winner.wins += 1;
  winner.hp = 100;
  winner.opponentTicker = null;
  winner.hpBarEl.classList.add('hidden');
  winner.visual.absorbAura.material.opacity = 0.72;

  loser.state = 'consuming';
  loser.stateTimer = 1.05;
  loser.opponentTicker = null;
  loser.hpBarEl.classList.add('hidden');

  spawnConsumptionParticleStream(loser, winner, simMode ? undefined : 0x38bdf8);
  spawnVictoryCelebrationBurst(winner.x, 1.5, winner.z);
  spawnFloatingText(new THREE.Vector3(winner.x, 3.8, winner.z), `${winner.ticker} WINS`, 'consume');

  totalConsumptions += 1;
  document.getElementById('stat-consume-count').textContent = totalConsumptions;

  if (simMode) addKillFeedEntry(winner, loser);
  recalculateLeaderboard();
  if (selectedMonster === winner || selectedMonster === loser) {
    updateDetailPanelUI();
  }
}

function animateVisualRig(visual, monsterId, state, animPhase, stateTimer, isInspector = false) {
  const rig = visual.bodyRig;
  const parts = visual.parts;
  const t = animPhase;

  rig.position.set(0, 0, 0);
  rig.rotation.set(0, 0, 0);
  if (parts.head) parts.head.rotation.set(0, 0, 0);
  if (parts.tail) parts.tail.rotation.set(0, 0, 0);
  visual.anim(t, state !== 'idle');

  if (state === 'combat' || state === 'attack') {
    const strikeWave = Math.sin(t * 13);
    rig.position.z = Math.max(0, strikeWave) * 0.3;
    rig.position.y = Math.abs(Math.cos(t * 13)) * 0.1;
    rig.rotation.x = Math.max(0, strikeWave) * 0.2;
    if (parts.head) {
      parts.head.rotation.x = -Math.max(0, strikeWave) * 0.28;
    }
    if (parts.wingL && parts.wingR) {
      parts.wingL.rotation.z = Math.sin(t * 16) * 0.52;
      parts.wingR.rotation.z = -Math.sin(t * 16) * 0.52;
    }
    if (parts.armL && parts.armR) {
      parts.armL.rotation.x = -0.85 + Math.sin(t * 15) * 0.75;
      parts.armR.rotation.x = -0.85 - Math.sin(t * 15) * 0.75;
    }

  } else if (state === 'hit') {
    rig.position.z = -0.22;
    rig.rotation.x = -0.35;
    rig.rotation.z = Math.sin(t * 32) * 0.22;
    if (parts.head) {
      parts.head.rotation.x = -0.4;
      parts.head.rotation.y = Math.sin(t * 28) * 0.3;
    }

  } else if (state === 'victory') {
    const joyJump = Math.abs(Math.sin(t * 11.5));
    const happySpin = (t * 5.2) % (Math.PI * 2);
    rig.position.y = joyJump * 0.55;
    rig.rotation.y = happySpin;
    rig.rotation.z = Math.sin(t * 11.5) * 0.18;

    if (monsterId === 'fire_dragon') {
      rig.rotation.x = -0.22 * joyJump;
      if (parts.wingL && parts.wingR) {
        parts.wingL.rotation.z = 0.35 + Math.sin(t * 24) * 0.65;
        parts.wingR.rotation.z = -0.35 - Math.sin(t * 24) * 0.65;
      }
      if (parts.head) {
        parts.head.rotation.x = -0.45;
        parts.head.rotation.z = Math.sin(t * 16) * 0.2;
      }
    } else if (monsterId === 'earth_golem') {
      if (parts.armL && parts.armR) {
        parts.armL.rotation.x = -2.4 + Math.sin(t * 18) * 0.45;
        parts.armR.rotation.x = -2.4 - Math.sin(t * 18) * 0.45;
      }
      if (parts.head) {
        parts.head.rotation.x = -0.3;
      }
    } else if (monsterId === 'ice_wolf' || monsterId === 'electric_fox') {
      rig.rotation.x = Math.sin(t * 11.5) * 0.3;
      if (parts.tail) {
        parts.tail.rotation.y = Math.sin(t * 28) * 0.65;
        parts.tail.rotation.z = Math.cos(t * 28) * 0.35;
      }
    } else {
      rig.rotation.x = t * 8.0;
    }

    if (!isInspector) {
      visual.absorbAura.rotation.y += 0.14;
      visual.absorbAura.rotation.x += 0.08;
      visual.absorbAura.scale.setScalar(1.05 + joyJump * 0.35);
      visual.absorbAura.material.opacity = Math.max(0, Math.min(0.75, stateTimer * 0.45));
    }

  } else if (state === 'consuming') {
    const progress = Math.max(0.05, stateTimer / 1.05);
    visual.root.scale.setScalar(visual.baseScale * progress);
    rig.rotation.y += 0.25;
    rig.position.y = (1 - progress) * 0.7;
  }
}

function applyGrowth(m, dt) {
  const v = m.visual;
  if (m.state === 'consuming') return;
  const target = v.baseSize * growthFactor(m.level);
  v.baseScale += (target - v.baseScale) * Math.min(1, dt * 3);
  v.root.scale.setScalar(v.baseScale);
}

function getMonsterActivityDescription(m) {
  const biome = getBiomeAt(m.x, m.z);
  const spec = MONSTER_CATALOG[m.monsterId];
  switch (m.state) {
    case 'idle':
      return {
        badge: 'IDLE • ALERT',
        dotColor: 'bg-sky-400',
        narrative: `Resting and watching the ${zoneLabel(biome)}`
      };
    case 'walk':
      return {
        badge: 'ROAMING',
        dotColor: 'bg-emerald-400',
        narrative: `Exploring the ${zoneLabel(biome)} for opponents (${m.speed.toFixed(1)} u/s)`
      };
    case 'combat':
      return {
        badge: `⚔️ DUEL vs ${m.opponentTicker || 'ENEMY'}`,
        dotColor: 'bg-rose-500',
        narrative: `Fighting fiercely with ${spec.attackName}!`
      };
    case 'attack':
      return {
        badge: `🔥 ${spec.attackName.toUpperCase()}`,
        dotColor: 'bg-amber-400',
        narrative: `Unleashing ${spec.attackName}!`
      };
    case 'hit':
      return {
        badge: '💥 TAKING A HIT',
        dotColor: 'bg-rose-400',
        narrative: `Bracing against the opponent's strike!`
      };
    case 'victory':
      return {
        badge: '🎉 VICTORY!',
        dotColor: 'bg-yellow-300',
        narrative: `Celebrating the win and absorbing the loser's liquidity!`
      };
    case 'consuming':
      return {
        badge: '✨ DISSOLVING',
        dotColor: 'bg-purple-400',
        narrative: `Defeated — energy absorbed by the winner...`
      };
    default:
      return {
        badge: m.state.toUpperCase(),
        dotColor: 'bg-emerald-400',
        narrative: `Active in the ${zoneLabel(biome)}`
      };
  }
}

function updateSimulation(dt, elapsed) {
  if (!centralCrown) centralCrown = environmentGroup.getObjectByName('centralCrown');
  if (centralCrown) {
    centralCrown.rotation.y = elapsed * 1.1;
    centralCrown.position.y = CROWN_Y + Math.sin(elapsed * 2.5) * 0.35;
  }
  updateIsland(islandData.dyn, elapsed, dt);

  for (let i = activeDuels.length - 1; i >= 0; i--) {
    const duel = activeDuels[i];
    duel.timer += dt;

    if (!monsters.includes(duel.m1) || !monsters.includes(duel.m2)) {
      activeDuels.splice(i, 1);
      continue;
    }

    if (duel.timer >= duel.nextStrike) {
      duel.nextStrike += 0.45;
      const attacker = duel.turn % 2 === 0 ? duel.m1 : duel.m2;
      const defender = duel.turn % 2 === 0 ? duel.m2 : duel.m1;
      duel.turn += 1;

      const dmg = Math.round(18 + Math.random() * 22);
      defender.hp = Math.max(0, defender.hp - dmg);
      defender.hpFillEl.style.width = `${defender.hp}%`;

      spawnSignatureAttackVFX(attacker, { x: defender.x, z: defender.z });
      spawnFloatingText(new THREE.Vector3(defender.x, 2.8, defender.z), `-${dmg}`, 'damage');

      if (defender.hp <= 0) {
        resolveDuel(duel, attacker, defender);
        activeDuels.splice(i, 1);
      }
    }
  }

  updateScriptedDuels(dt);
  updateHunts(dt);
  updateFinale(dt);
  document.getElementById('stat-duel-count').textContent = activeDuels.length + scriptedDuels.length;

  for (let i = monsters.length - 1; i >= 0; i--) {
    const m = monsters[i];
    m.animPhase += dt;
    if (m.combatCooldown > 0) m.combatCooldown -= dt;

    if (m.state === 'consuming') {
      m.stateTimer -= dt;
      animateVisualRig(m.visual, m.monsterId, m.state, m.animPhase, m.stateTimer, false);
      if (m.stateTimer <= 0) {
        scene.remove(m.visual.root);
        m.labelEl.remove();
        if (selectedMonster === m) {
          selectedMonster = null;
          document.getElementById('detail-panel').classList.add('hidden');
          emit('select', { id: null, source: 'removed' });
        }
        monsters.splice(i, 1);
        if (simMode && autoRespawn && monsters.length < targetPopulation) {
          spawnMonsterEntity(createRandomTokenConfig(Math.floor(Math.random() * 50)));
          recalculateLeaderboard();
        } else if (!simMode) {
          recalculateLeaderboard();
        }
      }
      continue;
    }

    applyGrowth(m, dt);

    if (m.scripted) {
      m.visual.root.position.set(m.x, 0, m.z);
      m.visual.root.rotation.y = m.facing;
      animateVisualRig(m.visual, m.monsterId, m.state, m.animPhase, m.stateTimer, false);
      continue;
    }

    if (m.state === 'victory' || m.state === 'attack' || m.state === 'hit') {
      m.stateTimer -= dt;
      if (m.stateTimer <= 0) {
        m.state = 'walk';
        m.stateTimer = 2.5 + m.rand() * 4;
        m.visual.absorbAura.material.opacity = 0;
      }
    } else if (m.state === 'idle' || m.state === 'walk') {
      if (arenaLocked) {
        m.state = 'idle';
        m.stateTimer = 1;
      }
      m.stateTimer -= dt;
      if (m.stateTimer <= 0) {
        if (m.state === 'walk' && m.rand() < 0.25) {
          m.state = 'idle';
          m.stateTimer = 1.4 + m.rand() * 2.0;
        } else {
          m.state = 'walk';
          m.stateTimer = 2.5 + m.rand() * 4.5;
          const newAngle = m.facing + (m.rand() - 0.5) * 1.8;
          m.vx = Math.sin(newAngle);
          m.vz = Math.cos(newAngle);
        }
      }

      if (m.state === 'walk') {
        let nx = m.x + m.vx * m.speed * dt;
        let nz = m.z + m.vz * m.speed * dt;

        const distFromCenter = Math.hypot(nx, nz);
        if (distFromCenter > WORLD_RADIUS - 10 * U) {
          const toCenterAngle = Math.atan2(-nx, -nz) + (m.rand() - 0.5) * 0.5;
          m.vx = Math.sin(toCenterAngle);
          m.vz = Math.cos(toCenterAngle);
          nx = m.x + m.vx * m.speed * dt;
          nz = m.z + m.vz * m.speed * dt;
        }

        for (const ob of obstacles) {
          const dx = nx - ob.x;
          const dz = nz - ob.z;
          const d = Math.hypot(dx, dz);
          if (d < ob.r + 2.2) {
            const pushAngle = Math.atan2(dx, dz);
            m.vx = Math.sin(pushAngle);
            m.vz = Math.cos(pushAngle);
            nx = ob.x + Math.sin(pushAngle) * (ob.r + 2.3);
            nz = ob.z + Math.cos(pushAngle) * (ob.r + 2.3);
            break;
          }
        }

        if (monsters.length <= 120) {
          const myR = m.visual.baseScale * 0.62;
          for (let j = 0; j < monsters.length; j++) {
            const o = monsters[j];
            if (o === m || o.state === 'consuming') continue;
            const sx = nx - o.x;
            const sz = nz - o.z;
            const sd = Math.hypot(sx, sz);
            const minD = myR + o.visual.baseScale * 0.62;
            if (sd < minD && sd > 0.001) {
              const push = (minD - sd) * 0.5;
              nx += (sx / sd) * push;
              nz += (sz / sd) * push;
            }
          }
        }

        m.x = nx;
        m.z = nz;
        const cdx = m.x - CITADEL_COLLIDER.x;
        const cdz = m.z - CITADEL_COLLIDER.z;
        const cd = Math.hypot(cdx, cdz);
        if (cd < CITADEL_COLLIDER.r + 2.5) {
          const away = Math.atan2(cdx, cdz);
          m.vx = Math.sin(away);
          m.vz = Math.cos(away);
          pushOutOfCitadel(m);
        }
        m.facing = Math.atan2(m.vx, m.vz);
      }

      if (simMode && activeDuels.length < 8 && m.combatCooldown <= 0 && Math.random() < 0.08) {
        for (let j = i - 1; j >= 0; j--) {
          const other = monsters[j];
          if ((other.state === 'walk' || other.state === 'idle') && other.combatCooldown <= 0) {
            const dist = Math.hypot(m.x - other.x, m.z - other.z);
            if (dist < 4.5) {
              startDuel(m, other);
              break;
            }
          }
        }
      }
    }

    m.visual.root.position.set(m.x, 0, m.z);
    m.visual.root.rotation.y = m.facing;
    animateVisualRig(m.visual, m.monsterId, m.state, m.animPhase, m.stateTimer, false);
  }

  document.getElementById('stat-active-count').textContent = monsters.length;

  if (selectedMonster && inspectorVisual) {
    if (!isDraggingInspector && selectedMonster.state !== 'victory') {
      inspectorCurrentYaw += (inspectorTargetYaw - inspectorCurrentYaw) * 0.12;
    }
    inspectorVisual.root.rotation.y = inspectorCurrentYaw;
    animateVisualRig(
      inspectorVisual,
      selectedMonster.monsterId,
      selectedMonster.state,
      selectedMonster.animPhase,
      selectedMonster.stateTimer,
      true
    );
    inspectorFrame += 1;
    if (inspectorFrame % 2 === 0) inspectorRenderer.render(inspectorScene, inspectorCamera);
    updateLiveInspectorTelemetry();
  }

  for (let i = particleSystems.length - 1; i >= 0; i--) {
    const ps = particleSystems[i];
    ps.age += dt;
    const t = Math.min(1, ps.age / ps.maxAge);

    if (ps.type === 'burst') {
      const posAttr = ps.points.geometry.attributes.position;
      for (let k = 0; k < ps.velocities.length; k++) {
        const v = ps.velocities[k];
        posAttr.setXYZ(
          k,
          posAttr.getX(k) + v.vx * dt,
          posAttr.getY(k) + v.vy * dt,
          posAttr.getZ(k) + v.vz * dt
        );
        v.vy -= 14 * dt;
      }
      posAttr.needsUpdate = true;
      ps.points.material.opacity = 1 - t;
      if (ps.age >= ps.maxAge) {
        scene.remove(ps.points);
        ps.points.geometry.dispose();
        ps.points.material.dispose();
        particleSystems.splice(i, 1);
      }
    } else if (ps.type === 'mesh_wave') {
      if (ps.expandRate > 0) {
        ps.mesh.scale.addScalar(ps.expandRate * dt);
      }
      ps.mesh.material.opacity = 1 - t;
      if (ps.age >= ps.maxAge) {
        scene.remove(ps.mesh);
        ps.mesh.geometry.dispose();
        ps.mesh.material.dispose();
        particleSystems.splice(i, 1);
      }
    } else if (ps.type === 'projectile_orb') {
      ps.mesh.position.x = THREE.MathUtils.lerp(ps.startX, ps.tx, t);
      ps.mesh.position.z = THREE.MathUtils.lerp(ps.startZ, ps.tz, t);
      ps.mesh.position.y = 2.0 + Math.sin(t * Math.PI) * 0.8;
      if (ps.age >= ps.maxAge) {
        scene.remove(ps.mesh);
        ps.mesh.material.dispose();
        particleSystems.splice(i, 1);
      }
    } else if (ps.type === 'consumption_stream') {
      const posAttr = ps.points.geometry.attributes.position;
      const wx = ps.winner ? ps.winner.x : ps.startX;
      const wz = ps.winner ? ps.winner.z : ps.startZ;
      for (let k = 0; k < ps.offsets.length; k++) {
        const off = ps.offsets[k];
        const localT = Math.max(0, Math.min(1, (t - off.delay) / (1 - off.delay)));
        const easeT = localT * localT * (3 - 2 * localT);
        const arcY = Math.sin(easeT * Math.PI) * 3.2;
        posAttr.setXYZ(
          k,
          THREE.MathUtils.lerp(ps.startX + off.ox, wx, easeT),
          THREE.MathUtils.lerp(off.oy, 1.5, easeT) + arcY,
          THREE.MathUtils.lerp(ps.startZ + off.oz, wz, easeT)
        );
      }
      posAttr.needsUpdate = true;
      ps.points.material.opacity = 1 - t * 0.65;
      if (ps.age >= ps.maxAge) {
        scene.remove(ps.points);
        ps.points.geometry.dispose();
        ps.points.material.dispose();
        particleSystems.splice(i, 1);
      }
    }
  }
}

function checkMonsterFilterMatch(m) {
  if (activeElementFilter !== 'all' && m.element !== activeElementFilter) return false;
  if (activeModelFilter !== 'all' && m.monsterId !== activeModelFilter) return false;
  if (searchTickerQuery && !m.ticker.includes(searchTickerQuery)) return false;
  return true;
}

const labelTempVec = new THREE.Vector3();

function updateProjectedLabels() {
  const halfW = window.innerWidth * 0.5;
  const halfH = window.innerHeight * 0.5;
  const tempVec = labelTempVec;
  let visibleMatches = 0;

  monsters.forEach(m => {
    const isMatch = checkMonsterFilterMatch(m);
    if (isMatch) visibleMatches++;

    m.visual.root.visible = isMatch;
    if (!isMatch) {
      m.labelEl.style.display = 'none';
      return;
    }

    const showLabel =
      !selectiveLabels ||
      m === selectedMonster ||
      m.rank <= 10 ||
      m.state === 'combat' ||
      m.state === 'victory' ||
      searchTickerQuery.length > 0;

    if (!showLabel) {
      m.labelEl.style.display = 'none';
      return;
    }

    tempVec.set(m.x, 3.1, m.z).project(camera); // pre-port label height
    if (tempVec.z > 1) {
      m.labelEl.style.display = 'none';
      return;
    }

    const sx = tempVec.x * halfW + halfW;
    const sy = -tempVec.y * halfH + halfH;
    m.labelEl.style.display = 'flex';
    m.labelEl.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -100%)`;
  });

  const matchCountEl = document.getElementById('filter-match-count');
  if (matchCountEl) {
    matchCountEl.textContent = visibleMatches === monsters.length ? 'All visible' : `${visibleMatches} / ${monsters.length}`;
  }

  biomeDOMElements.forEach(b => {
    if (!showBiomeMarkers) {
      b.el.style.display = 'none';
      return;
    }
    tempVec.set(b.x, b.y, b.z).project(camera);
    if (tempVec.z > 1) {
      b.el.style.display = 'none';
      return;
    }
    const sx = tempVec.x * halfW + halfW;
    const sy = -tempVec.y * halfH + halfH;
    b.el.style.display = 'block';
    b.el.style.left = `${sx}px`;
    b.el.style.top = `${sy}px`;
  });
}

function recalculateLeaderboard() {
  const sorted = simMode
    ? [...monsters].sort((a, b) => b.lp - a.lp || b.wins - a.wins)
    : [...monsters].sort((a, b) => a.order - b.order || (a.uid < b.uid ? -1 : 1));
  const poolTotal = simMode ? 0 : monsters.reduce((sum, m) => sum + m.lp, 0);
  sorted.forEach((m, idx) => {
    m.gaugeEl.classList.toggle('hidden', simMode);
    if (!simMode) m.gaugeFillEl.style.width = `${poolTotal > 0 ? Math.max(4, Math.min(100, (m.lp / poolTotal) * 100 * 4)) : 0}%`;
    m.rank = idx + 1;
    const isTop3 = m.rank <= 3;
    m.pillEl.classList.toggle('is-top-rank', isTop3);
    m.crownEl.classList.toggle('hidden', !isTop3);
  });

  const lbContainer = document.getElementById('leaderboard-list');
  if (!lbContainer) return;
  const visibleRows = simMode ? sorted.slice(0, 8) : sorted;
  lbContainer.innerHTML = visibleRows.map(m => {
    const spec = MONSTER_CATALOG[m.monsterId];
    const isSel = selectedMonster === m;
    const pool = formatPoolValue(m).split(' ');
    const poolSymbol = pool[1] ? ` <span class="text-[9px] font-bold text-[#4d6670]">${pool[1]}</span>` : '';
    const houseTag = m.isHouse ? '<span class="text-[8px] font-extrabold px-1.5 py-px rounded-full bg-[#ffc233] text-[#4a2c00]">HOUSE</span>' : '';
    const medal = m.rank <= 3 ? ` m${m.rank}` : '';
    return `
      <div data-uid="${escapeHtml(m.uid)}" data-testid="leaderboard-row-${escapeHtml(m.ticker)}" class="lb-row${isSel ? ' is-selected' : ''}">
        <span class="medal${medal}">${m.rank}</span>
        ${coinAvatar(m, 'w-8 h-8')}
        <div class="flex-1 min-w-0 truncate">
          <div class="lb-name flex items-center gap-1">${escapeHtml(m.ticker)}${houseTag}</div>
          <div class="lb-sub">${spec.name} • W:${m.wins}</div>
        </div>
        <div class="lb-score font-mono-num">${pool[0]}${poolSymbol}</div>
      </div>
    `;
  }).join('');

  lbContainer.querySelectorAll('.lb-row').forEach(row => {
    row.addEventListener('click', () => {
      const found = monsters.find(m => m.uid === row.dataset.uid);
      if (found) selectMonster(found);
    });
  });
}

function addKillFeedEntry(winner, loser) {
  const feedList = document.getElementById('kill-feed-list');
  if (!feedList) return;
  if (feedList.querySelector('.italic')) {
    feedList.innerHTML = '';
  }
  const wSpec = MONSTER_CATALOG[winner.monsterId];
  const lSpec = MONSTER_CATALOG[loser.monsterId];

  const item = document.createElement('div');
  item.className = 'flex flex-col gap-0.5 text-[11px] animate-fade-in text-[#2a4a57]';
  item.innerHTML = `
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-1 font-extrabold text-[#2a4a57] min-w-0">
        ${iconImg(winner.monsterId, 'w-6 h-6')}
        <span>${escapeHtml(winner.ticker)}</span>
        <span class="text-[9px] font-extrabold px-1.5 py-0.5 bg-[#43c291]/30 text-[#17674a] rounded-full">CONSUMED</span>
        <span class="flex items-center gap-1 text-[#4d6670]">${iconImg(loser.monsterId, 'w-6 h-6')} ${escapeHtml(loser.ticker)}</span>
      </div>
      <span class="text-[10px] font-bold text-[#4d6670] shrink-0 whitespace-nowrap" data-feed-ts="${Date.now()}">Just now</span>
    </div>
    <div class="text-[10px] font-bold text-[#4d6670] flex items-center justify-between">
      <span>✨ Particle absorption complete</span>
      <span class="text-[#1f7a46]">Sim LP: $${loser.lp.toLocaleString()}</span>
    </div>
  `;
  feedList.prepend(item);
  while (feedList.children.length > 10) {
    feedList.lastElementChild.remove();
  }
}

function selectMonster(m, source = 'pick') {
  if (selectedMonster) {
    selectedMonster.visual.selectionRing.visible = false;
    selectedMonster.pillEl.classList.remove('is-selected');
  }
  selectedMonster = m;
  const panel = document.getElementById('detail-panel');
  if (!m) {
    panel.classList.add('hidden');
    isZoomingToMonster = false;
    isResettingCamera = true;
    emit('select', { id: null, source });
    return;
  }
  m.visual.selectionRing.visible = true;
  m.pillEl.classList.add('is-selected');
  panel.classList.remove('hidden');

  if (source !== 'init') {
    zoomCameraToMonster(m);
  }

  rebuildInspectorModel();
  updateDetailPanelUI();
  recalculateLeaderboard();
  emit('select', { id: m.uid, source });
}

function updateLiveInspectorTelemetry() {
  if (!selectedMonster) return;
  const m = selectedMonster;
  const act = getMonsterActivityDescription(m);
  const biome = getBiomeAt(m.x, m.z);

  const statusEl = document.getElementById('inspector-action-status');
  const dotEl = document.getElementById('inspector-status-dot');
  const descEl = document.getElementById('inspector-activity-desc');
  const hpTextEl = document.getElementById('inspector-hp-text');
  const spdTextEl = document.getElementById('inspector-speed-text');
  const hpBarFill = document.getElementById('detail-hp-bar-fill');
  const stateBiomeEl = document.getElementById('detail-state-biome');
  const winsEl = document.getElementById('detail-wins-losses');

  if (statusEl) statusEl.textContent = act.badge;
  if (dotEl) dotEl.className = `w-2 h-2 rounded-full ${act.dotColor} animate-ping`;
  if (descEl) descEl.textContent = act.narrative;
  if (hpTextEl) hpTextEl.textContent = `HP ${m.hp}/${m.maxHp}`;
  if (spdTextEl) spdTextEl.textContent = `Pos: (${Math.round(m.x)}, ${Math.round(m.z)})`;
  if (hpBarFill) hpBarFill.style.width = `${(m.hp / m.maxHp) * 100}%`;
  const xpFill = document.getElementById('detail-xp-fill');
  if (xpFill) xpFill.style.width = `${m.xp % XP_PER_LEVEL_DISPLAY}%`;
  const xpText = document.getElementById('detail-xp-text');
  if (xpText) xpText.textContent = `Lv ${m.level} • XP ${m.xp}`;
  if (stateBiomeEl) {
    stateBiomeEl.textContent = m.opponentTicker ? `${biome} • vs ${m.opponentTicker}` : `${biome} • ${m.state.toUpperCase()}`;
  }
  if (winsEl) winsEl.textContent = simMode ? `Wins: ${m.wins}` : `Wins: ${m.wins} • XP ${m.xp}`;
  if (simMode) markAnimationButtons(m);
  if (sceneListeners.telemetry) {
    emit('telemetry', { id: m.uid, state: m.state, x: m.x, z: m.z, biome, opponent: m.opponentTicker });
  }
}

function updateDetailPanelUI() {
  if (!selectedMonster) return;
  const m = selectedMonster;
  const spec = MONSTER_CATALOG[m.monsterId];

  const badge = document.getElementById('detail-icon-badge');
  badge.innerHTML = coinAvatar(m, 'w-8 h-8');
  badge.style.background = '#fbf3de';

  document.getElementById('detail-ticker').textContent = m.ticker;
  document.getElementById('detail-rank-badge').textContent = simMode ? `#${m.rank}` : `#${m.rank} • Lv ${m.level}`;
  const pill = document.getElementById('detail-element-pill');
  pill.textContent = spec.element.toUpperCase();
  pill.className = `${ELEMENT_PILL_BASE} ${ELEMENT_PILL_CLASS[spec.element]}`;
  document.getElementById('detail-name').textContent = m.name;
  document.getElementById('detail-model-id').textContent = `${m.monsterId} (${spec.sizeClass})`;
  document.getElementById('detail-element-size').textContent = spec.attackName;
  document.getElementById('detail-lp').textContent = formatDetailPool(m);
  const tokenEl = document.getElementById('detail-token-id');
  tokenEl.textContent = simMode ? m.tokenId : shortAddress(m.tokenId);
  tokenEl.dataset.full = m.tokenId;
  tokenEl.title = m.tokenId;
  markSkinButtons(m);

  updateLiveInspectorTelemetry();
}

const XP_PER_LEVEL_DISPLAY = 100;

const SELECTED_BUTTON_CLASSES = ['ring-1', 'ring-amber-400/70'];

function markAnimationButtons(m) {
  document.querySelectorAll('.anim-preview-btn').forEach(btn => {
    const active = btn.dataset.anim === m.state;
    SELECTED_BUTTON_CLASSES.forEach(name => btn.classList.toggle(name, active));
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function markSkinButtons(m) {
  document.querySelectorAll('.skin-switch-btn').forEach(btn => {
    const active = btn.dataset.skin === m.skinId;
    SELECTED_BUTTON_CLASSES.forEach(name => btn.classList.toggle(name, active));
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

const minimapCanvas = document.getElementById('minimap-canvas');
const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

function drawMinimap() {
  if (!minimapCanvas || !minimapCtx) return;
  const w = minimapCanvas.width;
  const h = minimapCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  minimapCtx.clearRect(0, 0, w, h);

  const qRadius = w * 0.46;
  const quadrants = [
    { start: -Math.PI * 0.75, end: -Math.PI * 0.25, color: 'rgba(56, 189, 248, 0.28)' },
    { start: -Math.PI * 0.25, end:  Math.PI * 0.25, color: 'rgba(168, 85, 247, 0.28)' },
    { start:  Math.PI * 0.25, end:  Math.PI * 0.75, color: 'rgba(239, 68, 68, 0.28)' },
    { start:  Math.PI * 0.75, end:  Math.PI * 1.25, color: 'rgba(34, 197, 94, 0.28)' }
  ];
  quadrants.forEach(q => {
    minimapCtx.beginPath();
    minimapCtx.moveTo(cx, cy);
    minimapCtx.arc(cx, cy, qRadius, q.start, q.end);
    minimapCtx.closePath();
    minimapCtx.fillStyle = q.color;
    minimapCtx.fill();
  });

  minimapCtx.beginPath();
  minimapCtx.arc(cx, cy, w * 0.11, 0, Math.PI * 2);
  minimapCtx.fillStyle = 'rgba(245, 158, 11, 0.45)';
  minimapCtx.fill();

  monsters.forEach(m => {
    const mx = cx + (m.x / WORLD_RADIUS) * qRadius;
    const my = cy + (m.z / WORLD_RADIUS) * qRadius;
    const spec = MONSTER_CATALOG[m.monsterId];
    minimapCtx.beginPath();
    minimapCtx.arc(mx, my, m === selectedMonster ? 3.5 : m.state === 'combat' ? 2.6 : 1.8, 0, Math.PI * 2);
    minimapCtx.fillStyle = m === selectedMonster ? '#ffffff' : spec.badgeHex;
    minimapCtx.fill();
  });

  const tx = cx + (controls.target.x / WORLD_RADIUS) * qRadius;
  const tz = cy + (controls.target.z / WORLD_RADIUS) * qRadius;
  minimapCtx.strokeStyle = '#fbbf24';
  minimapCtx.lineWidth = 1.2;
  minimapCtx.strokeRect(tx - 10, tz - 8, 20, 16);
}

function initCatalogSidebar() {
  const listEl = document.getElementById('catalog-filter-list');
  if (!listEl) return;
  listEl.innerHTML = Object.values(MONSTER_CATALOG).map(spec => `
    <button data-model="${spec.id}" class="catalog-btn flex items-center justify-between px-2 py-1.5 rounded-xl bg-[#fbf3de] hover:bg-[#ffffff] border-2 border-[#e3d1a6] text-left transition">
      <div class="flex items-center gap-2">
        ${iconImg(spec.id, 'w-6 h-6')}
        <div>
          <div class="font-extrabold text-[#2a4a57] leading-none">${spec.name}</div>
          <div class="text-[9px] font-bold text-[#4d6670]">${spec.attackName} • ${spec.sizeClass}</div>
        </div>
      </div>
      <span class="w-2 h-2 rounded-full" style="background:${spec.badgeHex}"></span>
    </button>
  `).join('');

  listEl.querySelectorAll('.catalog-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const modelId = btn.dataset.model;
      activeModelFilter = activeModelFilter === modelId ? 'all' : modelId;
      listEl.querySelectorAll('.catalog-btn').forEach(b => {
        b.classList.toggle('!border-[#ffc233]', b.dataset.model === activeModelFilter);
      });
      const sample = monsters.find(m => m.monsterId === modelId);
      if (sample) selectMonster(sample);
    });
  });
}

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let pointerDownPos = { x: 0, y: 0 };

renderer.domElement.addEventListener('pointerdown', (e) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
});

renderer.domElement.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) > 6) return;
  pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);

  let closestMonster = null;
  let bestDist = Infinity;
  const ray = raycaster.ray;
  const mPos = new THREE.Vector3();

  monsters.forEach(m => {
    if (!m.visual.root.visible) return;
    mPos.set(m.x, 1.5, m.z);
    const distToRay = ray.distanceToPoint(mPos);
    if (distToRay < 2.8) {
      const camDist = camera.position.distanceTo(mPos);
      if (camDist < bestDist) {
        bestDist = camDist;
        closestMonster = m;
      }
    }
  });

  if (closestMonster) {
    selectMonster(closestMonster);
  }
});

document.getElementById('btn-close-detail').addEventListener('click', () => selectMonster(null));

document.getElementById('detail-token-id').addEventListener('click', (e) => {
  const full = e.currentTarget.dataset.full;
  if (full && navigator.clipboard) navigator.clipboard.writeText(full);
});

document.querySelectorAll('.inspector-view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.inspector-view-btn').forEach(b => {
      b.className = 'inspector-view-btn px-1.5 py-0.5 rounded text-[9px] font-bold text-[#2a4a57]';
    });
    btn.className = 'inspector-view-btn px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-[#1f566b] text-white';
    const view = btn.dataset.view;
    if (view === 'front') inspectorTargetYaw = 0;
    else if (view === 'side') inspectorTargetYaw = Math.PI * 0.5;
    else if (view === 'back') inspectorTargetYaw = Math.PI;
    else inspectorTargetYaw = 0.55;
  });
});

document.querySelectorAll('.anim-preview-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!selectedMonster) return;
    const anim = btn.dataset.anim;
    selectedMonster.state = anim;
    selectedMonster.stateTimer = anim === 'victory' ? 2.6 : 1.5;

    if (anim === 'attack') {
      spawnSignatureAttackVFX(selectedMonster, null);
    } else if (anim === 'victory') {
      selectedMonster.visual.absorbAura.material.opacity = 0.75;
      spawnVictoryCelebrationBurst(selectedMonster.x, 1.5, selectedMonster.z);
      spawnFloatingText(new THREE.Vector3(selectedMonster.x, 3.6, selectedMonster.z), `🎉 ${selectedMonster.ticker} VICTORY!`, 'consume');
    }
    updateDetailPanelUI();
  });
});

document.querySelectorAll('.skin-switch-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!selectedMonster) return;
    applyMonsterSkin(selectedMonster, btn.dataset.skin);
    rebuildInspectorModel();
    markSkinButtons(selectedMonster);
  });
});

document.querySelectorAll('.pop-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pop-btn').forEach(b => {
      b.className = 'pop-btn px-2 py-1 rounded-lg text-[11px] font-mono-num font-bold bg-[#fbf3de] text-[#2a4a57] hover:bg-[#ffffff] border-2 border-[#e3d1a6] transition';
    });
    btn.className = 'pop-btn px-2 py-1 rounded-lg text-[11px] font-mono-num font-bold bg-[#ffc233] text-[#2a4a57] border-2 border-[#d9c593] transition';
    syncPopulation(Number(btn.dataset.pop));
  });
});

document.querySelectorAll('.el-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeElementFilter = btn.dataset.el;
    document.querySelectorAll('.el-btn').forEach(b => {
      b.classList.remove('active');
    });
    btn.classList.add('active');
  });
});

document.getElementById('input-search-ticker').addEventListener('input', (e) => {
  searchTickerQuery = e.target.value.trim().toUpperCase();
});

document.getElementById('toggle-selective-labels').addEventListener('change', (e) => {
  selectiveLabels = e.target.checked;
});
document.getElementById('toggle-biome-markers').addEventListener('change', (e) => {
  showBiomeMarkers = e.target.checked;
});
document.getElementById('toggle-auto-respawn').addEventListener('change', (e) => {
  autoRespawn = e.target.checked;
});

document.getElementById('btn-trigger-duel').addEventListener('click', () => {
  const available = monsters.filter(m => m.state === 'walk' || m.state === 'idle');
  if (available.length < 2) return;
  const m1 = selectedMonster && (selectedMonster.state === 'walk' || selectedMonster.state === 'idle')
    ? selectedMonster
    : available[Math.floor(Math.random() * available.length)];
  let m2 = null;
  let bestD = Infinity;
  available.forEach(cand => {
    if (cand === m1) return;
    const d = Math.hypot(cand.x - m1.x, cand.z - m1.z);
    if (d < bestD) {
      bestD = d;
      m2 = cand;
    }
  });
  if (m1 && m2) {
    m2.x = m1.x + 3.2;
    m2.z = m1.z + 1.5;
    startDuel(m1, m2);
    selectMonster(m1);
  }
});

document.getElementById('btn-fit-world').addEventListener('click', fitToWorld);
document.querySelectorAll('.roster-tray-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const mId = btn.dataset.monsterId;
    const target = monsters.find(m => m.monsterId === mId);
    if (target) selectMonster(target);
  });
});
document.getElementById('btn-zoom-in').addEventListener('click', () => {
  camera.position.lerp(controls.target, 0.18);
});
document.getElementById('btn-zoom-out').addEventListener('click', () => {
  const dir = camera.position.clone().sub(controls.target).normalize();
  camera.position.addScaledVector(dir, 28 * U);
});
document.getElementById('minimap-wrapper')?.addEventListener('click', (e) => {
  if (!minimapCanvas) return;
  const rect = minimapCanvas.getBoundingClientRect();
  const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
  const nz = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  controls.target.x = Math.max(-100 * U, Math.min(100 * U, nx * WORLD_RADIUS));
  controls.target.z = Math.max(-100 * U, Math.min(100 * U, nz * WORLD_RADIUS));
});

const launchModal = document.getElementById('launch-modal');
const launchStageEl = document.getElementById('launch-preview');
let launchPreview = null;
let launchOpener = null;

function launchPickCard(group, value, checked, bodyHtml, label) {
  const wrap = document.createElement('label');
  wrap.className = 'pick-card';
  wrap.innerHTML = `<input type="radio" name="${group}" value="${value}" ${checked ? 'checked' : ''} aria-label="${escapeHtml(label)}"><span class="pick-body">${bodyHtml}</span>`;
  return wrap;
}

function buildLaunchPickers() {
  const monsterBox = document.getElementById('launch-monster-picker');
  const skinBox = document.getElementById('launch-skin-picker');
  monsterBox.replaceChildren(...Object.keys(MONSTER_CATALOG).map((id, i) => {
    const spec = MONSTER_CATALOG[id];
    const el = ELEMENT_STYLE[spec.element];
    return launchPickCard('launch-monster', id, i === 0,
      `${iconImg(id, 'pick-icon')}<span>${escapeHtml(spec.name)}</span><span class="el-pill" style="background:${el.bg};color:${el.fg}">${el.label}</span>`,
      spec.name);
  }));
  skinBox.replaceChildren(...Object.keys(SKIN_MODIFIERS).map((id, i) =>
    launchPickCard('launch-skin', id, i === 0,
      `<span class="pick-swatch" style="background:${skinSwatchCss(id)}"></span><span>${escapeHtml(SKIN_MODIFIERS[id].label)}</span>`,
      SKIN_MODIFIERS[id].label)));
}
buildLaunchPickers();

function updateLaunchInfo(monsterId, skinId) {
  const spec = MONSTER_CATALOG[monsterId];
  const blurb = MONSTER_BLURB[monsterId];
  const el = ELEMENT_STYLE[spec.element];
  document.getElementById('launch-info-name').textContent = spec.name;
  const pill = document.getElementById('launch-info-element');
  pill.textContent = el.label;
  pill.style.background = el.bg;
  pill.style.color = el.fg;
  document.getElementById('launch-info-skin').textContent = `${SKIN_MODIFIERS[skinId].label} skin`;
  document.getElementById('launch-info-line').textContent = `${blurb.size} · ${blurb.move} · ${blurb.attack}`;
  document.getElementById('launch-info-blurb').textContent = blurb.blurb;
}

function updateLaunchJsonPreview() {
  const name = document.getElementById('launch-name').value;
  const ticker = sanitizeTicker(document.getElementById('launch-ticker').value);
  const monsterId = document.getElementById('launch-monster-id').value;
  const skinId = document.getElementById('launch-skin-id').value;
  const spec = MONSTER_CATALOG[monsterId];
  const payload = {
    tokenId: '0x' + ticker.toLowerCase() + '...verified',
    name,
    ticker,
    monsterId,
    element: spec.element,
    skinId
  };
  document.getElementById('launch-json-preview').textContent = JSON.stringify(payload, null, 2);
  updateLaunchInfo(monsterId, skinId);
}

['launch-name', 'launch-ticker', 'launch-lp'].forEach(id => {
  document.getElementById(id).addEventListener('input', updateLaunchJsonPreview);
});
document.getElementById('launch-monster-picker').addEventListener('change', (e) => {
  const id = e.target.value;
  document.getElementById('launch-monster-id').value = id;
  if (launchPreview) launchPreview.setMonster(id);
  updateLaunchJsonPreview();
});
document.getElementById('launch-skin-picker').addEventListener('change', (e) => {
  const id = e.target.value;
  document.getElementById('launch-skin-id').value = id;
  if (launchPreview) launchPreview.setSkin(id);
  updateLaunchJsonPreview();
});

document.getElementById('btn-open-launch').addEventListener('click', () => {
  updateLaunchJsonPreview();
  launchModal.classList.remove('hidden');
  launchModal.classList.add('flex');
  launchOpener = document.activeElement;
  document.getElementById('launch-name').focus();
  if (!launchPreview) {
    launchPreview = mountLaunchPreview(launchStageEl, {
      monsterId: document.getElementById('launch-monster-id').value,
      skinId: document.getElementById('launch-skin-id').value
    });
  }
});
const closeLaunchModal = () => {
  launchModal.classList.add('hidden');
  launchModal.classList.remove('flex');
  if (launchPreview) {
    launchPreview.dispose();
    launchPreview = null;
  }
  if (launchOpener && launchOpener.focus) launchOpener.focus();
  launchOpener = null;
};
document.getElementById('btn-close-launch').addEventListener('click', closeLaunchModal);
document.getElementById('btn-cancel-launch').addEventListener('click', closeLaunchModal);
launchModal.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLaunchModal();
  else trapTab(e, launchModal);
});

document.getElementById('form-launch-token').addEventListener('submit', (e) => {
  e.preventDefault();
  const newMonster = spawnMonsterEntity({
    name: document.getElementById('launch-name').value,
    ticker: document.getElementById('launch-ticker').value,
    monsterId: document.getElementById('launch-monster-id').value,
    skinId: document.getElementById('launch-skin-id').value,
    lp: Number(document.getElementById('launch-lp').value) || 25000,
    pos: { x: (Math.random() - 0.5) * 28 * U, z: (Math.random() - 0.5) * 28 * U }
  });
  recalculateLeaderboard();
  selectMonster(newMonster);
  newMonster.state = 'victory';
  newMonster.stateTimer = 2.4;
  spawnVictoryCelebrationBurst(newMonster.x, 1.5, newMonster.z);
  closeLaunchModal();
});

const MONSTER_KEYS = Object.keys(MONSTER_CATALOG);
const SKIN_KEYS = Object.keys(SKIN_MODIFIERS);
const MAX_CONCURRENT_DUELS = 8;
const APPROACH_SECONDS = 0.8;
const FIRST_STRIKE_SECONDS = 0.35;
const STRIKE_INTERVAL_SECONDS = 0.45;
const DUEL_GAP = 3.2;
const MERGE_HOLD_SECONDS = 1.1;
const HUNT_SECONDS = 1.2;
const DAIS_POSITION = { x: 0, z: 9 };

let arenaLocked = false;
let scriptedDuels = [];
let hunts = [];
let finale = null;
let chainClashesPlayed = 0;
let sceneStarted = false;
let sceneRunning = false;
let rafId = 0;
let relativeTimeTimer = 0;

const QUALITY_LEVELS = [
  { pixelRatio: Math.min(window.devicePixelRatio, 1.5), shadowEvery: 1, shadowSize: 2048 },
  { pixelRatio: Math.min(window.devicePixelRatio, 1.25), shadowEvery: 2, shadowSize: 2048 },
  { pixelRatio: 1, shadowEvery: 4, shadowSize: 1024 }
];
const QUALITY_WARMUP_MS = 4000;
const SLOW_FRAME_MS = 30;
const FAST_FRAME_MS = 17;
const DOWNGRADE_AFTER_MS = 2000;
const UPGRADE_AFTER_MS = 12000;
let qualityLevel = 0;
let smoothFrameMs = 16;
let slowForMs = 0;
let fastForMs = 0;
let shadowFrame = 0;
const startedAtMs = performance.now();

function applyQuality(level) {
  qualityLevel = level;
  const q = QUALITY_LEVELS[level];
  renderer.setPixelRatio(q.pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (mainDirLight.shadow.mapSize.width !== q.shadowSize) {
    mainDirLight.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    if (mainDirLight.shadow.map) {
      mainDirLight.shadow.map.dispose();
      mainDirLight.shadow.map = null;
    }
  }
  renderer.shadowMap.autoUpdate = q.shadowEvery === 1;
  renderer.shadowMap.needsUpdate = true;
}

function updateQuality(rawMs, now) {
  if (now - startedAtMs < QUALITY_WARMUP_MS || rawMs > 250) return;
  smoothFrameMs += (rawMs - smoothFrameMs) * 0.1;
  if (smoothFrameMs > SLOW_FRAME_MS) {
    slowForMs += rawMs;
    fastForMs = 0;
    if (slowForMs > DOWNGRADE_AFTER_MS && qualityLevel < QUALITY_LEVELS.length - 1) {
      applyQuality(qualityLevel + 1);
      slowForMs = 0;
    }
  } else if (smoothFrameMs < FAST_FRAME_MS) {
    fastForMs += rawMs;
    slowForMs = 0;
    if (fastForMs > UPGRADE_AFTER_MS && qualityLevel > 0) {
      applyQuality(qualityLevel - 1);
      fastForMs = 0;
    }
  } else {
    slowForMs = 0;
    fastForMs = 0;
  }
}

const clashQueue = createDuelQueue({ limit: MAX_CONCURRENT_DUELS, start: startScriptedDuel });

function findEntity(id) {
  return monsters.find(m => m.uid === id) || null;
}

const CITADEL_COLLIDER = { x: 0, z: 0, r: 6.8 * U };

function pushOutOfCitadel(m) {
  const dx = m.x - CITADEL_COLLIDER.x;
  const dz = m.z - CITADEL_COLLIDER.z;
  const d = Math.hypot(dx, dz);
  if (d >= CITADEL_COLLIDER.r) return;
  const nx = d < 0.001 ? 0 : dx / d;
  const nz = d < 0.001 ? 1 : dz / d;
  m.x = CITADEL_COLLIDER.x + nx * CITADEL_COLLIDER.r;
  m.z = CITADEL_COLLIDER.z + nz * CITADEL_COLLIDER.r;
}

function lerpNumber(a, b, t) {
  return a + (b - a) * t;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Pre-port spawn band (seeded.ts: inner 28, rim margin 20 for radius 135) scaled with the island.
const SPAWN_INNER = 28 * U;
const SPAWN_RIM = 20 * U;

function isBlockedGround(x, z) {
  return obstacles.some(ob => Math.hypot(x - ob.x, z - ob.z) < ob.r + 2.8);
}

function coinConfigFromView(coin) {
  const parts = String(coin.id).split(':');
  const roundId = Number(parts[0]) || 0;
  const coinId = Number(parts[1]) || 0;
  const monsterId = MONSTER_KEYS[coin.monsterType] || 'fire_dragon';
  const skinId = SKIN_KEYS[coin.skinId] || 'default';
  return {
    uid: coin.id,
    ticker: coin.ticker,
    name: coin.name,
    monsterId,
    skinId,
    lp: coin.rMon,
    tokenId: coin.token || coin.id,
    pos: spawnAnchor({ roundId, coinId, monsterType: coin.monsterType, worldRadius: WORLD_RADIUS, innerRadius: SPAWN_INNER, rimMargin: SPAWN_RIM, isBlocked: isBlockedGround }),
    rand: createSeededRandom(hashString('wander:' + coin.id))
  };
}

function setEntityImage(entity, imageUri) {
  if (entity.imageUri === imageUri) return;
  entity.imageUri = imageUri;
  const html = coinAvatarHtml(imageUri, `${entity.ticker} token image`, 'w-4 h-4');
  entity.avatarEl.innerHTML = html || '';
  entity.avatarEl.classList.toggle('hidden', !html);
}

function applyCoinView(entity, coin) {
  setEntityImage(entity, coin.imageUri);
  entity.lp = coin.rMon;
  entity.level = coin.level;
  entity.xp = coin.xp;
  entity.wins = coin.wins;
  entity.order = coin.rank;
  entity.isHouse = coin.isHouse;
}

function removeEntity(m) {
  scene.remove(m.visual.root);
  m.labelEl.remove();
  const index = monsters.indexOf(m);
  if (index >= 0) monsters.splice(index, 1);
  if (selectedMonster === m) {
    selectedMonster = null;
    document.getElementById('detail-panel').classList.add('hidden');
    emit('select', { id: null, source: 'removed' });
  }
}

function clearAllEntities() {
  clashQueue.clear().forEach(item => item.resolve());
  scriptedDuels.forEach(d => d.resolve());
  scriptedDuels = [];
  hunts.forEach(h => {
    scene.remove(h.npc.visual.root);
    h.resolve();
  });
  hunts = [];
  if (finale) finale.resolve();
  finale = null;
  activeDuels = [];
  arenaLocked = false;
  [...monsters].forEach(removeEntity);
  recalculateLeaderboard();
}

function chainSpawn(coin, animate) {
  let entity = findEntity(coin.id);
  if (!entity) entity = spawnMonsterEntity(coinConfigFromView(coin));
  applyCoinView(entity, coin);
  entity.visual.baseScale = entity.visual.baseSize * growthFactor(entity.level);
  entity.visual.root.scale.setScalar(entity.visual.baseScale);
  if (animate) {
    entity.state = 'victory';
    entity.stateTimer = 2.4;
    spawnVictoryCelebrationBurst(entity.x, 1.5, entity.z);
  }
  recalculateLeaderboard();
  return entity;
}

function chainHydrate(coins) {
  clearAllEntities();
  coins.forEach(coin => chainSpawn(coin, false));
  recalculateLeaderboard();
}

function chainUpdateCoins(views) {
  views.forEach(view => {
    const m = findEntity(view.id);
    if (m) applyCoinView(m, view);
  });
  recalculateLeaderboard();
  if (selectedMonster) updateDetailPanelUI();
}

function chainTrade(e) {
  const m = findEntity(e.id);
  if (!m) return;
  m.liveReserve = e.rMon;
  spawnFloatingText(
    new THREE.Vector3(m.x, 3.8, m.z),
    `${e.isBuy ? '+' : '-'}${formatMonCompact(e.mon)}`,
    e.isBuy ? 'xp' : 'damage'
  );
}

function chainClash(plan) {
  return new Promise(resolve => {
    [plan.winnerId, plan.loserId].forEach(id => {
      const m = findEntity(id);
      if (m) m.pendingClashes = (m.pendingClashes || 0) + 1;
    });
    clashQueue.enqueue({ plan, resolve });
  });
}

function releaseClash(plan) {
  [plan.winnerId, plan.loserId].forEach(id => {
    const m = findEntity(id);
    if (m && m.pendingClashes > 0) m.pendingClashes -= 1;
  });
}

function startScriptedDuel(item, done) {
  const { plan, resolve } = item;
  const winner = findEntity(plan.winnerId);
  const loser = findEntity(plan.loserId);
  const usable = winner && loser && loser.state !== 'consuming';
  if (usable && (winner.scripted || loser.scripted)) return false;
  if (!usable) {
    releaseClash(plan);
    emit('duel', { clashId: plan.clashId, phase: 'skipped', winnerId: plan.winnerId, loserId: plan.loserId });
    done();
    resolve();
    return true;
  }
  const winnerIsA = winner.uid < loser.uid;
  const sideA = winnerIsA ? winner : loser;
  const sideB = winnerIsA ? loser : winner;
  const script = scriptDuel(
    plan.clashId,
    MONSTER_KEYS.indexOf(sideA.monsterId),
    MONSTER_KEYS.indexOf(sideB.monsterId),
    winnerIsA ? 'A' : 'B'
  );
  const midX = (sideA.x + sideB.x) * 0.5;
  const midZ = (sideA.z + sideB.z) * 0.5;
  let dirX = sideB.x - sideA.x;
  let dirZ = sideB.z - sideA.z;
  const dirLength = Math.hypot(dirX, dirZ) || 1;
  dirX /= dirLength;
  dirZ /= dirLength;
  [winner, loser].forEach(m => {
    m.scripted = true;
    m.state = 'walk';
    m.stateTimer = 99;
    m.opponentTicker = null;
  });
  scriptedDuels.push({
    plan,
    resolve,
    done,
    winner,
    loser,
    sideA,
    sideB,
    script,
    phase: 'approach',
    time: 0,
    strikeIndex: 0,
    doneAt: 0,
    fromA: { x: sideA.x, z: sideA.z },
    fromB: { x: sideB.x, z: sideB.z },
    toA: { x: midX - dirX * DUEL_GAP * 0.5, z: midZ - dirZ * DUEL_GAP * 0.5 },
    toB: { x: midX + dirX * DUEL_GAP * 0.5, z: midZ + dirZ * DUEL_GAP * 0.5 }
  });
  if (plan.finalDuel) beginFinalDuelFocus(sideA, sideB);
  emit('duel', { clashId: plan.clashId, phase: 'approach', winnerId: plan.winnerId, loserId: plan.loserId });
  return true;
}

function faceEachOther(a, b) {
  a.facing = Math.atan2(b.x - a.x, b.z - a.z);
  b.facing = Math.atan2(a.x - b.x, a.z - b.z);
}

function beginStrikePhase(d) {
  d.phase = 'strike';
  [d.sideA, d.sideB].forEach(m => {
    m.state = 'combat';
    m.hp = 100;
    m.hpBarEl.classList.remove('hidden');
    m.hpFillEl.style.width = '100%';
  });
  d.sideA.opponentTicker = d.sideB.ticker;
  d.sideB.opponentTicker = d.sideA.ticker;
}

function applyScriptedStrike(d, strike) {
  const attacker = strike.attacker === 'A' ? d.sideA : d.sideB;
  const defender = strike.attacker === 'A' ? d.sideB : d.sideA;
  defender.hp = strike.attacker === 'A' ? strike.hpB : strike.hpA;
  defender.hpFillEl.style.width = `${defender.hp}%`;
  spawnSignatureAttackVFX(attacker, { x: defender.x, z: defender.z });
  spawnFloatingText(new THREE.Vector3(defender.x, 2.8, defender.z), `-${strike.damage}`, 'damage');
  emit('duel', {
    clashId: d.plan.clashId,
    phase: strike.final ? 'finisher' : 'strike',
    winnerId: d.plan.winnerId,
    loserId: d.plan.loserId
  });
}

function spawnSpreadStreams(loser, winner) {
  const survivors = monsters
    .filter(m => m !== loser && m !== winner && m.state !== 'consuming')
    .sort((a, b) => Math.hypot(a.x - loser.x, a.z - loser.z) - Math.hypot(b.x - loser.x, b.z - loser.z))
    .slice(0, 8);
  survivors.forEach(m => {
    spawnConsumptionParticleStream(loser, m, 0x34d399);
    spawnFloatingText(new THREE.Vector3(m.x, 3.8, m.z), 'SPREAD', 'xp');
  });
}

function spawnHolderStreams(loser) {
  const offset = hashString(loser.uid) % 6;
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + offset;
    spawnConsumptionParticleStream(loser, { x: loser.x + Math.cos(angle) * 7, z: loser.z + Math.sin(angle) * 7 }, 0x34d399);
  }
}

function mergeScriptedDuel(d) {
  if (d.plan.finalDuel) endFinalDuelFocus();
  d.phase = 'merged';
  d.doneAt = d.time + MERGE_HOLD_SECONDS;
  d.winner.scripted = false;
  d.loser.scripted = false;
  resolveDuel(d, d.winner, d.loser);
  spawnFloatingText(
    new THREE.Vector3(d.winner.x, 5.0, d.winner.z),
    `+${formatMonCompact(d.plan.boost)} BOOST`,
    'boost'
  );
  if (d.plan.spread) {
    spawnSpreadStreams(d.loser, d.winner);
  } else {
    spawnHolderStreams(d.loser);
  }
  if (d.plan.consolation > 0 && !d.plan.spread) {
    spawnFloatingText(new THREE.Vector3(d.loser.x, 4.2, d.loser.z), `${formatMonCompact(d.plan.consolation)} TO HOLDERS`, 'xp');
  }
  chainClashesPlayed += 1;
  releaseClash(d.plan);
  emit('duel', { clashId: d.plan.clashId, phase: 'merged', winnerId: d.plan.winnerId, loserId: d.plan.loserId });
}

function abortScriptedDuel(d) {
  [d.winner, d.loser].forEach(m => {
    if (!monsters.includes(m)) return;
    m.scripted = false;
    m.hpBarEl.classList.add('hidden');
    if (m.state === 'combat' || m.state === 'walk') {
      m.state = 'walk';
      m.stateTimer = 1;
    }
  });
  releaseClash(d.plan);
  emit('duel', { clashId: d.plan.clashId, phase: 'skipped', winnerId: d.plan.winnerId, loserId: d.plan.loserId });
  d.done();
  d.resolve();
}

function updateScriptedDuels(dt) {
  for (let i = scriptedDuels.length - 1; i >= 0; i--) {
    const d = scriptedDuels[i];
    d.time += dt;
    if (!monsters.includes(d.winner) || !monsters.includes(d.loser)) {
      scriptedDuels.splice(i, 1);
      abortScriptedDuel(d);
      continue;
    }
    if (d.phase === 'approach') {
      const k = Math.min(1, d.time / APPROACH_SECONDS);
      const eased = easeOutCubic(k);
      d.sideA.x = lerpNumber(d.fromA.x, d.toA.x, eased);
      d.sideA.z = lerpNumber(d.fromA.z, d.toA.z, eased);
      d.sideB.x = lerpNumber(d.fromB.x, d.toB.x, eased);
      d.sideB.z = lerpNumber(d.fromB.z, d.toB.z, eased);
      pushOutOfCitadel(d.sideA);
      pushOutOfCitadel(d.sideB);
      faceEachOther(d.sideA, d.sideB);
      if (k >= 1) beginStrikePhase(d);
    } else if (d.phase === 'strike') {
      const t = d.time - APPROACH_SECONDS;
      const strikes = d.script.strikes;
      while (d.strikeIndex < strikes.length && t >= FIRST_STRIKE_SECONDS + STRIKE_INTERVAL_SECONDS * d.strikeIndex) {
        applyScriptedStrike(d, strikes[d.strikeIndex]);
        d.strikeIndex += 1;
      }
      if (d.strikeIndex >= strikes.length && t >= FIRST_STRIKE_SECONDS + STRIKE_INTERVAL_SECONDS * (strikes.length - 1) + 0.1) {
        mergeScriptedDuel(d);
      }
    } else if (d.time >= d.doneAt) {
      scriptedDuels.splice(i, 1);
      emit('duel', { clashId: d.plan.clashId, phase: 'done', winnerId: d.plan.winnerId, loserId: d.plan.loserId });
      d.done();
      d.resolve();
    }
  }
}

function chainHunt(e) {
  return new Promise(resolve => {
    const m = findEntity(e.id);
    if (!m || m.scripted || m.state === 'consuming') {
      resolve();
      return;
    }
    m.huntCount = (m.huntCount || 0) + 1;
    const npcType = MONSTER_KEYS[hashString(`hunt:${e.id}:${m.huntCount}`) % MONSTER_KEYS.length];
    const visual = createMonster3DMesh(npcType, 'obsidian', hashString(`hunt-variant:${e.id}:${m.huntCount}`) || 1);
    visual.baseScale *= 0.62;
    visual.root.scale.setScalar(0.01);
    const angle = (hashString(`hunt-angle:${e.id}:${m.huntCount}`) % 628) / 100;
    const npc = {
      monsterId: npcType,
      skinId: 'obsidian',
      visual,
      x: m.x + Math.sin(angle) * 3.4,
      z: m.z + Math.cos(angle) * 3.4,
      facing: 0,
      state: 'idle',
      animPhase: 0,
      stateTimer: 1.05,
      attackReady: true
    };
    visual.root.position.set(npc.x, 0, npc.z);
    scene.add(visual.root);
    m.scripted = true;
    m.state = 'combat';
    m.facing = Math.atan2(npc.x - m.x, npc.z - m.z);
    npc.facing = Math.atan2(m.x - npc.x, m.z - npc.z);
    hunts.push({ m, npc, success: e.success, xp: e.xp, time: 0, step: 0, resolve });
  });
}

function finishHunt(h) {
  scene.remove(h.npc.visual.root);
  if (monsters.includes(h.m)) {
    h.m.scripted = false;
    h.m.state = 'walk';
    h.m.stateTimer = 1;
  }
  h.resolve();
}

function updateHunts(dt) {
  for (let i = hunts.length - 1; i >= 0; i--) {
    const h = hunts[i];
    const { m, npc } = h;
    if (!monsters.includes(m)) {
      hunts.splice(i, 1);
      finishHunt(h);
      continue;
    }
    h.time += dt;
    npc.animPhase += dt;
    if (h.time < 0.2) {
      npc.visual.root.scale.setScalar(Math.max(0.01, npc.visual.baseScale * easeOutCubic(h.time / 0.2)));
    }
    if (h.step === 0 && h.time >= 0.25) {
      h.step = 1;
      spawnSignatureAttackVFX(m, { x: npc.x, z: npc.z });
      npc.state = 'hit';
    } else if (h.step === 1 && h.time >= 0.65) {
      h.step = 2;
      spawnSignatureAttackVFX({ ...npc, x: npc.x, z: npc.z }, { x: m.x, z: m.z });
      if (h.success) {
        npc.state = 'combat';
      } else {
        m.state = 'hit';
        npc.state = 'victory';
        npc.stateTimer = 2;
      }
    } else if (h.step === 2 && h.time >= 0.9) {
      h.step = 3;
      if (h.success) {
        spawnSignatureAttackVFX(m, { x: npc.x, z: npc.z });
        npc.state = 'hit';
      }
    } else if (h.step === 3 && h.time >= 1.0) {
      h.step = 4;
      if (h.success) {
        npc.state = 'consuming';
        spawnFloatingText(new THREE.Vector3(m.x, 3.8, m.z), `+${h.xp} XP`, 'xp');
      }
    }
    if (npc.state === 'consuming') {
      npc.stateTimer = Math.max(0, 1.05 - (h.time - 1.0) * 5.25);
    }
    animateVisualRig(npc.visual, npc.monsterId, npc.state, npc.animPhase, npc.stateTimer, true);
    if (h.time >= HUNT_SECONDS) {
      hunts.splice(i, 1);
      finishHunt(h);
    }
  }
}

function chainLevelUp(e) {
  const m = findEntity(e.id);
  if (!m) return;
  m.level = e.level;
  const ringGeo = new THREE.RingGeometry(0.9, 1.25, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x34d399, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.set(m.x, 0.2, m.z);
  scene.add(ring);
  particleSystems.push({ type: 'mesh_wave', mesh: ring, expandRate: 3.2, age: 0, maxAge: 0.7 });
  spawnFloatingText(new THREE.Vector3(m.x, 4.4, m.z), `LV ${e.level}`, 'xp');
}

function chainEliminated(e) {
  const m = findEntity(e.id);
  if (!m) return;
  if (m.pendingClashes > 0 || m.scripted) return;
  if (m.state !== 'consuming') {
    m.state = 'consuming';
    m.stateTimer = 1.05;
    m.hpBarEl.classList.add('hidden');
  }
}

function chainBye(e) {
  const m = findEntity(e.id);
  if (!m) return;
  spawnFloatingText(new THREE.Vector3(m.x, 3.8, m.z), 'BYE', 'consume');
}

function chainSettled(e) {
  endFinalDuelFocus();
  return new Promise(resolve => {
    const m = findEntity(e.winnerId);
    if (!m) {
      resolve();
      return;
    }
    if (finale) finale.resolve();
    m.scripted = true;
    m.state = 'walk';
    m.stateTimer = 99;
    finale = { m, phase: 'walk', time: 0, lastBurst: -10, fromX: m.x, fromZ: m.z, resolve, resolved: false };
  });
}

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

function updateFinale(dt) {
  if (!finale) return;
  const f = finale;
  const m = f.m;
  if (!monsters.includes(m)) {
    f.resolve();
    finale = null;
    return;
  }
  f.time += dt;
  if (f.phase === 'walk') {
    const k = Math.min(1, f.time / 3.0);
    const eased = k * k * (3 - 2 * k);
    m.facing = Math.atan2(DAIS_POSITION.x - f.fromX, DAIS_POSITION.z - f.fromZ);
    m.x = lerpNumber(f.fromX, DAIS_POSITION.x, eased);
    m.z = lerpNumber(f.fromZ, DAIS_POSITION.z, eased);
    if (k >= 1) {
      f.phase = 'celebrate';
      f.time = 0;
      m.state = 'victory';
      m.stateTimer = 99;
      m.visual.absorbAura.material.opacity = 0.72;
      spawnFloatingText(new THREE.Vector3(m.x, 4.2, m.z), `${m.ticker} IS THE CHOSEN ONE`, 'consume');
    }
  } else {
    if (f.time - f.lastBurst >= 1.2 && (f.lastBurst < 0 || !reducedMotionQuery.matches)) {
      f.lastBurst = f.time;
      spawnVictoryCelebrationBurst(m.x, 1.5, m.z);
    }
    if (!f.resolved && f.time >= 4) {
      f.resolved = true;
      f.resolve();
    }
  }
}

function setArenaFilters(f) {
  activeElementFilter = f.element;
  activeModelFilter = f.monsterId;
  searchTickerQuery = String(f.query || '').trim().toUpperCase();
  selectiveLabels = f.selectiveLabels;
  showBiomeMarkers = f.biomeMarkers;
  document.getElementById('input-search-ticker').value = f.query || '';
  document.getElementById('toggle-selective-labels').checked = f.selectiveLabels;
  document.getElementById('toggle-biome-markers').checked = f.biomeMarkers;
}

function zoomCamera(dir) {
  if (dir > 0) {
    camera.position.lerp(controls.target, 0.18);
  } else {
    const away = camera.position.clone().sub(controls.target).normalize();
    camera.position.addScaledVector(away, 28 * U);
  }
}

function panCameraTo(x, z) {
  controls.target.x = Math.max(-100 * U, Math.min(100 * U, x));
  controls.target.z = Math.max(-100 * U, Math.min(100 * U, z));
}

function applyMode(mode) {
  simMode = mode === 'sim';
  document.documentElement.dataset.mode = simMode ? 'sim' : 'chain';
  clearAllEntities();
  const badge = document.getElementById('feed-source-badge');
  if (badge) badge.textContent = simMode ? 'Sandbox' : 'On-chain';
  document.getElementById('stat-target-count').textContent = simMode ? 60 : 30;
  document.getElementById('stat-active-count').textContent = 0;
  spawnShowcaseMonsters();
  if (simMode) {
    syncPopulation(60);
    setTimeout(() => {
      if (simMode && monsters.length >= 2) selectMonster(monsters[0]);
    }, 350);
  }
}

function disposeScene() {
  sceneRunning = false;
  cancelAnimationFrame(rafId);
  window.clearInterval(relativeTimeTimer);
  clearAllEntities();
  renderer.dispose();
  inspectorRenderer.dispose();
  renderer.domElement.remove();
  inspectorRenderer.domElement.remove();
  labelsContainer.replaceChildren();
}

const arenaBridge = {
  hydrate: chainHydrate,
  spawnCoin(coin, opts) {
    chainSpawn(coin, !opts || opts.animate !== false);
  },
  updateCoins: chainUpdateCoins,
  onTrade: chainTrade,
  onEpochLocked() {
    arenaLocked = true;
  },
  onSeedReady() {
    crownLight.intensity = 1.6;
    setTimeout(() => {
      crownLight.intensity = 0.7;
    }, 600);
  },
  onEpochResolved() {
    arenaLocked = false;
  },
  onClashResolved: chainClash,
  onHuntResolved: chainHunt,
  onLevelUp: chainLevelUp,
  onCoinEliminated: chainEliminated,
  onBye: chainBye,
  onEpochCancelled() {
    arenaLocked = false;
  },
  onRoundSettled: chainSettled,
  select(id) {
    selectMonster(id === null ? null : findEntity(id), 'api');
  },
  setFilters: setArenaFilters,
  camera: {
    fit: fitToWorld,
    zoom: zoomCamera,
    panTo: panCameraTo
  },
  setMode: applyMode,
  dispose: disposeScene,
  on(name, cb) {
    const list = sceneListeners[name] || (sceneListeners[name] = []);
    list.push(cb);
    return () => {
      const index = list.indexOf(cb);
      if (index >= 0) list.splice(index, 1);
    };
  }
};

initCatalogSidebar();
document.querySelectorAll('.roster-tray-btn').forEach(btn => {
  btn.innerHTML = iconImg(btn.dataset.monsterId, 'w-full h-full');
});

let lastTime = performance.now();
let lastRawTime = performance.now();
let minimapFrame = 0;
let cpuMs = { sim: 0, labels: 0, minimap: 0, render: 0 };
let frameCount = 0;
let fpsAccumulator = 0;

function animate(now) {
  if (!sceneRunning) return;
  rafId = requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  const elapsed = now / 1000;

  const rawDt = (now - lastRawTime) / 1000;
  lastRawTime = now;
  frameCount++;
  fpsAccumulator += rawDt;
  if (fpsAccumulator >= 0.5) {
    const fps = Math.min(60, Math.round(frameCount / fpsAccumulator));
    document.getElementById('stat-fps').textContent = fps;
    emit('stats', {
      fps,
      quality: qualityLevel,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      cpuMs: cpuMs,
      liveCoins: monsters.length,
      activeDuels: activeDuels.length + scriptedDuels.length,
      clashesPlayed: simMode ? totalConsumptions : chainClashesPlayed
    });
    frameCount = 0;
    fpsAccumulator = 0;
  }

  if (finalFocus && !isDraggingView) {
    updateFinalDuelFocus();
  } else if (isResettingCamera) {
    camera.position.lerp(DEFAULT_CAM_POS, reducedMotionQuery.matches ? 1 : 0.075);
    controls.target.lerp(DEFAULT_CAM_TARGET, 0.075);
    if (camera.position.distanceTo(DEFAULT_CAM_POS) < 0.8 && controls.target.distanceTo(DEFAULT_CAM_TARGET) < 0.5) {
      isResettingCamera = false;
    }
  } else if (isZoomingToMonster && selectedMonster) {
    const camDir = camera.position.clone().sub(controls.target);
    camDir.y = 0;
    if (camDir.lengthSq() < 0.001) camDir.set(0, 0, 1);
    camDir.normalize();

    computeMonsterZoom(selectedMonster, camDir);

    camera.position.lerp(targetZoomPos, 0.08);
    controls.target.lerp(targetZoomTarget, 0.08);
    if (camera.position.distanceTo(targetZoomPos) < 0.6 && controls.target.distanceTo(targetZoomTarget) < 0.4) {
      isZoomingToMonster = false;
    }
  } else if (selectedMonster && !isDraggingView) {
    const spec = MONSTER_CATALOG[selectedMonster.monsterId];
    const targetY = spec && spec.sizeClass === 'large' ? 3.6 : 3.0;
    controls.target.lerp(new THREE.Vector3(selectedMonster.x, targetY, selectedMonster.z), 0.05);
  }

  updateQuality(rawDt * 1000, now);
  if (QUALITY_LEVELS[qualityLevel].shadowEvery > 1) {
    renderer.shadowMap.needsUpdate = shadowFrame % QUALITY_LEVELS[qualityLevel].shadowEvery === 0;
    shadowFrame += 1;
  }
  const t0 = performance.now();
  controls.update();
  updateSimulation(dt, elapsed);
  const t1 = performance.now();
  updateProjectedLabels();
  const t2 = performance.now();
  minimapFrame += 1;
  if (minimapFrame % 3 === 0) drawMinimap();
  const t3 = performance.now();
  renderer.render(scene, camera);
  const t4 = performance.now();
  cpuMs = { sim: t1 - t0, labels: t2 - t1, minimap: t3 - t2, render: t4 - t3 };
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

export function start(mode) {
  if (!sceneStarted) {
    sceneStarted = true;
    applyMode(mode);
    sceneRunning = true;
    relativeTimeTimer = window.setInterval(refreshRelativeTimes, 5000);
    animate(performance.now());
    setTimeout(() => emit('ready', {}), 0);
  }
  return arenaBridge;
}
