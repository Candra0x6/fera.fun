// Cream/teal arena island: lathe terrain, buildings and props merged into a few vertex-colour meshes; small dynamic bits kept apart.
import * as THREE from 'three';
import { add, mat, lin, rng, mergeStatic, bucketMaterial } from './kit.js';
import { MONUMENT_SPOTS, buildMonument } from './monuments.js';

// The island is laid out in "layout units" that match the pre-port arena footprint (radius 135). The whole island sits in one group scaled by U,
// so the playable world is 66% smaller than the old arena (WORLD_R = 45.9) while monsters keep their pre-port size. Props shrink a further PK so monsters stay readable.
const LR = 135;
export const U = 0.34;
export const WORLD_R = LR * U;
export const ISLAND_R = 138;
const PK = 0.85;
const KV = 6;
export const WATER_Y = -3.7 * KV;
export const PLAZA_R = 24, RING_IN = 36, RING_OUT = 82, RING_HALF = 7, SPOKE_HALF = 6, NORTH_SPOKE_LEN = 92;
const SPOKES = [-90, 0, 90, 180];

const hash = (x, y, z) => {
  const v = Math.sin(Math.round(x * 50) * 12.9898 + Math.round(y * 50) * 78.233 + Math.round(z * 50) * 37.719) * 43758.5453;
  return v - Math.floor(v);
};

export const sectorAt = (x, z) => (Math.abs(z) >= Math.abs(x) ? (z < 0 ? 'ice' : 'lava') : (x < 0 ? 'forest' : 'dark'));

export function makeTerrain(R = ISLAND_R, kv = KV) {
  const k = R / 10.4;
  const prof = [[0.01, -6.8], [2.5, -6.6], [5, -5.6], [7.4, -4.4], [8.9, -3.1], [9.8, -1.9], [10.3, -0.8], [10.5, -0.25], [10.3, 0], [0.01, 0]]
    .map(([r, y]) => new THREE.Vector2(r * k, y * kv));
  const lathe = new THREE.LatheGeometry(prof, 64);
  const g = lathe.toNonIndexed();
  lathe.dispose();
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const cache = new Map();
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = x.toFixed(3) + ',' + y.toFixed(3) + ',' + z.toFixed(3);
    let v = cache.get(key);
    if (!v) {
      const h = hash(x / k, y / kv, z / k);
      if (y < -0.3 * kv) {
        const s = 1 + (h - 0.5) * 0.18;
        x *= s; z *= s; y += (hash(z / k, x / k, y / kv) - 0.5) * 0.35 * kv;
      }
      const yy = y / kv;
      if (yy > -0.45) c.set(0x84cf49);
      else if (yy > -3.3) c.set(h > 0.5 ? 0xc08d55 : 0xae7c47);
      else c.set(h > 0.5 ? 0x8f8d99 : 0x7c7b88);
      c.offsetHSL(0, 0, (hash(y / kv, x / k, z / k) - 0.5) * 0.06);
      c.convertSRGBToLinear();
      v = [x, y, z, c.r, c.g, c.b];
      cache.set(key, v);
    }
    pos.setXYZ(i, v[0], v[1], v[2]);
    col.set([v[3], v[4], v[5]], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, bucketMaterial(THREE.DoubleSide));
  m.castShadow = m.receiveShadow = true;
  m.userData.keep = true;
  return m;
}

function gable(w, d, rh) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, rh); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

export function house(roof = 0xe2453c, wall = 0xf7ebd0, big = 1) {
  const g = new THREE.Group();
  const w = 1.5, d = 1.5, h = 0.9;
  add(g, 'box', 0xc9c4b8, [w + 0.25, 0.1, d + 0.25], [0, 0.05, 0]);
  add(g, 'box', wall, [w, h, d], [0, 0.1 + h / 2, 0]);
  add(g, gable(w + 0.4, d + 0.4, 0.85), roof, [1, 1, 1], [0, 0.1 + h, 0]);
  add(g, 'box', 0xffffff, [0.12, 0.1, d + 0.5], [0, 0.1 + h + 0.86, 0]);
  add(g, 'box', 0x8a5a33, [0.34, 0.55, 0.06], [0, 0.38, d / 2 + 0.02]);
  add(g, 'box', 0xffffff, [0.4, 0.06, 0.08], [0, 0.68, d / 2 + 0.04]);
  for (const s of [-1, 1]) {
    add(g, 'box', 0xffffff, [0.34, 0.34, 0.06], [s * 0.5, 0.65, d / 2 + 0.02]);
    add(g, 'box', 0x6bc7f0, [0.24, 0.24, 0.08], [s * 0.5, 0.65, d / 2 + 0.03]);
    add(g, 'box', 0xffffff, [0.06, 0.34, 0.06], [w / 2 + 0.02, 0.65, s * 0.35]);
  }
  add(g, 'box', 0xb9a58a, [0.22, 0.55, 0.22], [0.45, 1.75, -0.35]);
  add(g, 'box', 0x6bc7f0, [0.4, 0.28, 0.06], [0, 1.52, d / 2 + 0.17]);
  g.scale.setScalar(big);
  return g;
}

export function townHall() {
  const g = new THREE.Group();
  const cream = 0xf3e7c9, trim = 0xd8c79b;
  add(g, 'box', 0xcfc7b4, [4.0, 0.2, 3.0], [0, 0.1, 0]);
  add(g, 'box', 0xdcd3bd, [3.5, 0.2, 2.6], [0, 0.3, 0]);
  add(g, 'box', cream, [2.9, 1.5, 2.0], [0, 1.15, -0.1]);
  add(g, 'box', trim, [3.0, 0.12, 2.1], [0, 1.95, -0.1]);
  add(g, 'box', cream, [1.9, 0.9, 1.4], [0, 2.46, -0.1]);
  add(g, 'box', trim, [2.0, 0.1, 1.5], [0, 2.95, -0.1]);
  for (const x of [-1.15, -0.4, 0.4, 1.15]) add(g, 'cyl', 0xfff7e2, [0.12, 1.45, 0.12], [x, 1.1, 1.15]);
  add(g, 'box', trim, [2.7, 0.14, 0.4], [0, 1.88, 1.1]);
  add(g, gable(2.9, 0.4, 0.55), 0xefe2c0, [1, 1, 1], [0, 1.95, 1.1]);
  add(g, 'box', 0x8a5a33, [0.6, 0.9, 0.08], [0, 0.85, 0.92]);
  add(g, 'box', 0xe2453c, [1.3, 0.1, 0.55], [0, 1.45, 1.0], [0.35, 0, 0]);
  for (const s of [-1, 1]) {
    add(g, 'box', 0x6bc7f0, [0.3, 0.55, 0.06], [s * 1.0, 1.1, 0.92]);
    add(g, 'box', 0x6bc7f0, [0.3, 0.5, 0.06], [s * 0.55, 2.5, 0.62]);
  }
  add(g, 'cyl', cream, [0.62, 0.35, 0.62], [0, 3.15, -0.1]);
  add(g, new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0x4cb877, [0.78, 0.85, 0.78], [0, 3.3, -0.1]);
  add(g, 'sph', 0xf5c542, [0.1, 0.1, 0.1], [0, 4.2, -0.1]);
  add(g, 'cyl', 0x8a5a33, [0.025, 0.5, 0.025], [0, 4.45, -0.1]);
  return g;
}

export function umbrellaStall() {
  const g = new THREE.Group();
  add(g, 'cyl', 0xc9a06a, [0.06, 1.6, 0.06], [0, 0.8, 0]);
  const n = 10, R = 1.5;
  for (let i = 0; i < n; i++) {
    const geo = new THREE.ConeGeometry(R, 0.8, 1, 1, true, (i / n) * Math.PI * 2, (Math.PI * 2) / n);
    add(g, geo, i % 2 ? 0xffffff : 0xe2453c, [1, 1, 1], [0, 1.95, 0], [0, 0, 0], { side: THREE.DoubleSide });
  }
  add(g, 'sph', 0xf5c542, [0.1, 0.1, 0.1], [0, 2.38, 0]);
  add(g, 'cyl', 0xd8a86a, [0.55, 0.45, 0.55], [0, 0.22, 0]);
  add(g, 'cyl', 0xefd9a5, [0.62, 0.05, 0.62], [0, 0.47, 0]);
  [0xe2453c, 0xf7a634, 0xf5d542, 0x7ccf4a].forEach((c, i) => {
    const a = (i / 4) * Math.PI * 2;
    add(g, 'sph', c, 0.1, [Math.cos(a) * 0.3, 0.57, Math.sin(a) * 0.3]);
  });
  return g;
}

export function awningStall(roof = 0xe2453c) {
  const g = new THREE.Group();
  add(g, 'box', 0xe8c88f, [1.6, 0.6, 0.7], [0, 0.3, 0]);
  add(g, 'box', 0xf6ead0, [1.7, 0.08, 0.8], [0, 0.62, 0]);
  for (const s of [-1, 1]) add(g, 'cyl6', 0xa86f3e, [0.05, 0.9, 0.05], [s * 0.78, 1.05, 0.3]);
  for (let i = 0; i < 6; i++) add(g, 'box', i % 2 ? 0xffffff : roof, [0.27, 0.06, 0.9], [-0.68 + i * 0.27, 1.55, 0.2], [0.35, 0, 0]);
  [0xe2453c, 0xf7a634, 0x7ccf4a].forEach((c, i) => add(g, 'sph', c, 0.1, [-0.4 + i * 0.4, 0.74, 0.05]));
  return g;
}

export function roundTree(sc = 1, r = rng(1), gs = [0x58b848, 0x6bcb52, 0x4aa63f]) {
  const g = new THREE.Group();
  add(g, 'cyl6', 0x9a6a3a, [0.1, 0.5, 0.1], [0, 0.25, 0]);
  const crown = [[0, 0.95, 0, 0.5], [0.22, 0.7, 0.1, 0.34], [-0.2, 0.75, -0.12, 0.34]];
  crown.forEach(([x, y, z, s], i) => add(g, 'ico', gs[i], [s, s * 0.95, s], [x, y, z], [r(), r(), 0], { flatShading: true }));
  g.scale.setScalar(sc);
  g.rotation.y = r() * 6;
  return g;
}

export function pineTree(sc = 1, r = rng(2), cs = [0x2f9a4e, 0x38ad57, 0x45bd62]) {
  const g = new THREE.Group();
  add(g, 'cyl6', 0x8a5a33, [0.08, 0.35, 0.08], [0, 0.17, 0]);
  [[0.5, 0.55, 0.5], [0.4, 0.5, 0.95], [0.28, 0.45, 1.33]].forEach(([rad, h, y], i) =>
    add(g, 'cone7', cs[i], [rad, h, rad], [0, y, 0], [0, i, 0], { flatShading: true }));
  g.scale.setScalar(sc);
  return g;
}

export function rock(sc = 1, r = rng(3), cols = [0xb8bac4, 0x9ea1ad]) {
  const g = new THREE.Group();
  add(g, 'dod', cols[0], [0.34, 0.24, 0.3], [0, 0.18, 0], [r(), r() * 3, 0], { flatShading: true });
  add(g, 'dod', cols[1], [0.18, 0.14, 0.18], [0.3, 0.1, 0.1], [r(), r() * 3, 0], { flatShading: true });
  g.scale.setScalar(sc);
  return g;
}

export function bush(r = rng(4)) {
  const g = new THREE.Group();
  [[0, 0.17, 0, 0.26], [0.22, 0.12, 0.05, 0.18], [-0.2, 0.12, -0.05, 0.19]].forEach(([x, y, z, s], i) =>
    add(g, 'ico', [0x3f9e45, 0x58b848, 0x4aa63f][i], s, [x, y, z], [r(), r(), 0], { flatShading: true }));
  [0xffffff, 0xff7eb3, 0xffd23f].forEach((c) => add(g, 'sph', c, 0.045, [(r() - 0.5) * 0.5, 0.26 + r() * 0.1, 0.18 + r() * 0.1]));
  return g;
}

export function fence(n = 4) {
  const g = new THREE.Group();
  const wood = 0xb67a45;
  for (let i = 0; i <= n; i++) add(g, 'box', wood, [0.09, 0.5, 0.09], [i * 0.55, 0.25, 0]);
  for (const y of [0.18, 0.38]) add(g, 'box', 0xd09a60, [n * 0.55 + 0.1, 0.07, 0.05], [(n * 0.55) / 2, y, 0.04]);
  return g;
}

export function sign() {
  const g = new THREE.Group();
  for (const s of [-1, 1]) add(g, 'box', 0x8a5a33, [0.08, 0.9, 0.08], [s * 0.4, 0.45, 0]);
  add(g, 'box', 0xb67a45, [1.0, 0.5, 0.07], [0, 0.75, 0.02]);
  add(g, 'box', 0x6fc06a, [0.8, 0.3, 0.08], [0, 0.75, 0.03]);
  add(g, 'box', 0xfff0c8, [0.5, 0.06, 0.09], [0, 0.78, 0.04]);
  return g;
}

// Piles reach down to the waterline; `len` is the pile length in the dock's own (scaled) units.
export function dock(len = 3.8) {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) add(g, 'box', i % 2 ? 0xc48a52 : 0xb67a45, [0.9, 0.08, 0.35], [0, 0, i * 0.37]);
  for (const s of [-1, 1]) for (const z of [0, 1.85]) add(g, 'cyl6', 0x8a5a33, [0.07, len, 0.07], [s * 0.42, -len / 2, z]);
  return g;
}

function boat() {
  const g = new THREE.Group();
  const hull = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  add(g, hull, 0xa86f3e, [0.9, 0.42, 0.42], [0, 0.18, 0], [0, 0, 0], { side: THREE.DoubleSide });
  add(g, 'box', 0xe8c88f, [0.1, 0.05, 0.7], [0.1, 0.23, 0]);
  add(g, 'box', 0xe8c88f, [0.08, 0.04, 0.6], [-0.3, 0.2, 0]);
  g.rotation.y = Math.PI / 2;
  g.updateMatrix();
  const flat = new THREE.Group();
  flat.add(g);
  const merged = mergeStatic(flat);
  const o = new THREE.Group();
  o.add(merged);
  return o;
}

function islet(R, r, withTrees) {
  const g = new THREE.Group();
  g.add(makeTerrain(R, R / 10.4 * 0.45));
  const S = new THREE.Group();
  if (withTrees) for (let i = 0; i < 3 + Math.round(R / 12); i++) {
    const a = r() * 6.28, d = r() * R * 0.6;
    const tr = r() > 0.5 ? roundTree(3 + r(), r) : pineTree(3 + r(), r);
    tr.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    S.add(tr);
  }
  g.add(mergeStatic(S));
  return g;
}

function miniVillager(r, phase) {
  const m = new THREE.Group();
  const body = new THREE.Group();
  add(body, 'sph', 0xffffff, [0.11, 0.15, 0.11], [0, 0.17, 0]);
  add(body, 'sph', 0x2b2f45, 0.025, [-0.04, 0.22, 0.095]); add(body, 'sph', 0x2b2f45, 0.025, [0.04, 0.22, 0.095]);
  add(body, 'sph', 0xdddde8, [0.05, 0.04, 0.05], [-0.07, 0.04, 0.02]); add(body, 'sph', 0xdddde8, [0.05, 0.04, 0.05], [0.07, 0.04, 0.02]);
  const merged = mergeStatic(body);
  merged.scale.setScalar(VILLAGER_SCALE);
  m.add(merged);
  m.userData = { tx: 0, tz: 0, wait: r() * 3, phase };
  return m;
}

function altar() {
  const g = new THREE.Group();
  add(g, 'cyl', 0xcfc7b4, [8.2, 0.9, 8.2], [0, 0.45, 0]);
  add(g, 'cyl', 0xdcd3bd, [6.6, 1.3, 6.6], [0, 1.2, 0]);
  add(g, 'cyl', 0xf5c542, [4.6, 0.3, 4.6], [0, 1.95, 0]);
  add(g, 'cyl', 0xf3e7c9, [3.6, 1.2, 3.6], [0, 2.4, 0]);
  add(g, 'cyl', 0xfff7e2, [2.2, 0.4, 2.2], [0, 3.2, 0]);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(g, 'cyl', 0xfff7e2, [0.4, 2.2, 0.4], [Math.cos(a) * 5.6, 1.9, Math.sin(a) * 5.6]); }
  return g;
}

function lampPost() {
  const g = new THREE.Group();
  add(g, 'cyl6', 0x8a5a33, [0.35, 4.2, 0.35], [0, 2.1, 0]);
  add(g, 'sph', 0xfff0a8, 0.9, [0, 4.6, 0], [0, 0, 0], { emissive: 0xffd86a, emissiveIntensity: 0.5, castShadow: false });
  return g;
}

const VILLAGER_SCALE = 6 * PK;
// Prop scales (layout units per prop unit, then x U in the island group). Monsters stand 2.5 to 5.8 tall in world units, so houses (~4 tall) and trees (~3.5) stay neighbours, not giants.
const S_HOUSE = 4 * PK, S_HALL = 5.2, S_STALL = 3.6 * PK, S_SIGN = 3.2 * PK, S_FENCE = 3.4 * PK, S_DOCK = 6, S_BOAT = 5;

const FLAVOR = {
  ice: { ground: [0xcdeedd, 0xb9e6de], pine: [0x3c9f94, 0x52b8a8, 0x86d8c8], round: [0x6cc4b0, 0x7fd0bc, 0x5ab9a4], rock: [0xd2e4f2, 0xb7cfe3], pineShare: 0.85, dens: 0.9 },
  dark: { ground: [0xa9cf9a, 0x9cc3aa], pine: [0x6b52b4, 0x8168cb, 0x9d86df], round: [0x8a6fd0, 0x9b84df, 0x7a60c4], rock: [0xa59cc2, 0x8a82ab], pineShare: 0.6, dens: 0.9 },
  lava: { ground: [0xcfd45c, 0xd9bd58], pine: [0x2f9a4e, 0x38ad57, 0x45bd62], round: [0xe8803a, 0xf2a03d, 0xd9603a], rock: [0xc9a08e, 0xa98170], pineShare: 0.25, dens: 0.8 },
  forest: { ground: [0x6fc84f, 0x5bb449], pine: [0x2f9a4e, 0x38ad57, 0x45bd62], round: [0x58b848, 0x6bcb52, 0x4aa63f], rock: [0xb8bac4, 0x9ea1ad], pineShare: 0.3, dens: 1.25 }
};

export function buildIsland(host) {
  const r = rng(7);
  const root = new THREE.Group();
  root.scale.setScalar(U);
  host.add(root);
  const S = new THREE.Group();
  const dyn = { minis: [], clouds: [], foam: [], mon: [], flag: null, boat: null, waterY: WATER_Y };

  root.add(makeTerrain());

  // Ground: big sector-tinted washes, then smaller grass patches; layers sit a hair apart (camera near is 10, so no z-fight at 400 m).
  const disc = (rad, color, x, z, y, seg = 6, rot = r() * 3) => add(S, new THREE.CircleGeometry(rad, seg), color, [1, 1, 1], [x, y, z], [-Math.PI / 2, 0, rot], { castShadow: false });
  for (let i = 0; i < 40; i++) {
    const a = r() * 6.283, d = Math.sqrt(r()) * (LR - 12);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (d < PLAZA_R + 6) continue;
    const f = FLAVOR[sectorAt(x, z)];
    disc(16 + r() * 16, f.ground[i % 2], x, z, 0.02 + (i % 6) * 0.004, 9);
  }
  for (let i = 0; i < 170; i++) {
    const a = r() * 6.28, d = Math.sqrt(r()) * (LR - 8), rad = 4 + r() * 10;
    disc(rad, r() > 0.5 ? 0x93da58 : 0x74c443, Math.cos(a) * d, Math.sin(a) * d, 0.05 + (i % 12) * 0.004);
  }
  const path = (inner, outer, color, y) => add(S, new THREE.RingGeometry(inner, outer, 96), color, [1, 1, 1], [0, y, 0], [-Math.PI / 2, 0, 0], { castShadow: false });
  for (const rr of [RING_IN, RING_OUT]) {
    path(rr - RING_HALF - 0.8, rr + RING_HALF + 0.8, 0xdcb470, 0.1);
    path(rr - RING_HALF, rr + RING_HALF, 0xf3d394, 0.115);
  }
  for (const deg of SPOKES) {
    const a = (deg * Math.PI) / 180;
    const len = deg === -90 ? NORTH_SPOKE_LEN : LR - 2;
    for (const [w, col, y] of [[SPOKE_HALF * 2 + 1.6, 0xdcb470, 0.07], [SPOKE_HALF * 2, 0xf3d394, 0.085]])
      add(S, 'box', col, [len, 0.04, w], [Math.cos(a) * len / 2, y, Math.sin(a) * len / 2], [0, -a, 0], { castShadow: false });
  }
  add(S, 'cyl', 0xdcb470, [PLAZA_R + 2.4, 0.06, PLAZA_R + 2.4], [0, 0.12, 0]);
  add(S, 'cyl', 0xf3d394, [PLAZA_R, 0.06, PLAZA_R], [0, 0.14, 0]);
  add(S, 'cyl', 0xfff0c8, [PLAZA_R * 0.55, 0.06, PLAZA_R * 0.55], [0, 0.16, 0]);

  const occupied = [];
  // Landmark monuments claim their footprint first; props that would overlap one are dropped.
  const monSpots = MONUMENT_SPOTS.map((m) => { const a = (m.deg * Math.PI) / 180; return [Math.cos(a) * m.r, Math.sin(a) * m.r, m.rad, m]; });
  const onMonument = (x, z, rad) => monSpots.some(([mx, mz, mr]) => Math.hypot(x - mx, z - mz) < mr + rad);
  const place = (obj, x, z, s, rad, kind = 'b', faceCenter = true, rk = PK) => {
    rad *= rk;
    if (onMonument(x, z, rad)) return null;
    obj.scale.setScalar(s);
    obj.position.set(x, 0, z);
    if (faceCenter) obj.rotation.y = Math.atan2(-x, -z);
    S.add(obj); occupied.push([x, z, rad, kind]);
    return obj;
  };
  const pol = (rr, deg) => [Math.cos((deg * Math.PI) / 180) * rr, Math.sin((deg * Math.PI) / 180) * rr];

  place(altar(), 0, 0, 1, 7, 'c', false, 1);
  for (const deg of [45, 135, 225, 315]) { const [x, z] = pol(PLAZA_R - 6, deg); place(lampPost(), x, z, PK, 1, 'l', false); }

  const [hx, hz] = pol(NORTH_SPOKE_LEN + 14, -90);
  place(townHall(), hx, hz, S_HALL, 11, 'b', true, 1);

  // Hamlets: one around each biome tag, plus a second row near the inner road.
  const COLORS = { p: 0x7a54d6, r: 0xe2453c, b: 0x3f7fe0, n: 0x2e3b6b };
  [[100, -128, 'b'], [101, -55, 'p'], [60, -118, 'b'], [62, -62, 'p'],
    [104, -24, 'p'], [106, 24, 'r'], [60, -26, 'r'], [60, 28, 'b'],
    [100, 55, 'r'], [102, 125, 'r'], [61, 62, 'p'], [60, 118, 'b'],
    [104, 152, 'p'], [104, 208, 'n'], [60, 152, 'r'], [60, 208, 'b'],
    [118, -100, 'r'], [118, -80, 'b'], [118, 100, 'p'], [118, 80, 'n'], [120, 10, 'r'], [120, -10, 'b'], [120, 170, 'p'], [120, 190, 'r']]
    .forEach(([rr, deg, c]) => { const [x, z] = pol(rr, deg); place(house(COLORS[c]), x, z, S_HOUSE * (1 + r() * 0.12), 5.2); });
  [[47, 118], [47, -118], [47, 62], [47, -62]].forEach(([rr, deg]) => { const [x, z] = pol(rr, deg); place(umbrellaStall(), x, z, S_STALL, 5.5, 'b', false); });
  [[92, 122, 0xe2453c], [92, 62, 0x3f7fe0], [92, -118, 0x3f7fe0], [92, -62, 0xe2453c], [92, 28, 0xe2453c], [92, 152, 0x3f7fe0]]
    .forEach(([rr, deg, c]) => { const [x, z] = pol(rr, deg); place(awningStall(c), x, z, S_STALL, 4.6); });

  [[70, 28, 2, 4], [72, 205, 1.9, 4], [70, -34, 0.5, 3], [70, 148, 1.2, 4], [70, 118, 0.3, 4], [70, -118, 2.4, 4], [70, 62, 0.9, 3], [70, -62, 1.6, 3]]
    .forEach(([rr, deg, rot, n]) => { const [x, z] = pol(rr, deg); if (onMonument(x, z, 6)) return; const f = fence(n); f.scale.setScalar(S_FENCE); f.position.set(x, 0, z); f.rotation.y = rot; S.add(f); occupied.push([x + Math.cos(rot) * n * 0.9, z - Math.sin(rot) * n * 0.9, 3.4 * PK, 'b']); });
  for (const deg of SPOKES) for (const side of [-1, 1]) {
    if (deg === -90 && side === -1) continue;
    const [x, z] = pol(64, deg + side * 8);
    place(sign(), x, z, S_SIGN, 2.2);
  }
  for (let i = 0; i < 16; i++) { const [x, z] = pol(RING_OUT + RING_HALF + 3, i * 22.5 + 11); place(lampPost(), x, z, PK, 1, 'l', false); }

  const dk = dock(22 / S_DOCK); { const [x, z] = pol(LR - 6, 45); dk.scale.setScalar(S_DOCK); dk.position.set(x, -0.4, z); dk.rotation.y = Math.atan2(x, z); S.add(dk); }
  const bt = boat(); { const [x, z] = pol(LR + 20, 24); bt.scale.setScalar(S_BOAT); bt.position.set(x, WATER_Y + 0.1, z); bt.rotation.y = 0.5; root.add(bt); dyn.boat = bt; }

  for (const [mx, mz, mr, spot] of monSpots) {
    const mon = buildMonument(spot.kind);
    for (const o of [mon.stat, mon.fx]) { o.position.set(mx, 0, mz); o.rotation.y = Math.atan2(-mx, -mz) + (spot.yaw || 0); }
    S.add(mon.stat); root.add(mon.fx); dyn.mon.push(mon);
    occupied.push([mx, mz, mr, 'm']);
  }

  const free = (x, z, pad) => {
    const rr = Math.hypot(x, z);
    if (rr > LR - 6 || rr < PLAZA_R + 4 + pad) return false;
    if (Math.abs(rr - RING_IN) < RING_HALF + 1 + pad || Math.abs(rr - RING_OUT) < RING_HALF + 1 + pad) return false;
    for (const deg of SPOKES) {
      const a = (deg * Math.PI) / 180;
      const d = Math.abs(-Math.sin(a) * x + Math.cos(a) * z), dot = Math.cos(a) * x + Math.sin(a) * z;
      if (dot > 0 && (deg !== -90 || dot < NORTH_SPOKE_LEN + 4) && d < SPOKE_HALF + 1 + pad) return false;
    }
    for (const [ox, oz, orad] of occupied) if (Math.hypot(x - ox, z - oz) < orad + pad) return false;
    return true;
  };
  let tries = 0, n = 0;
  while (n < 300 && tries++ < 12000) {
    const rr = Math.sqrt(r()) * (LR - 6), a = r() * 6.283;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const f = FLAVOR[sectorAt(x, z)];
    if (r() > f.dens * (rr > 100 ? 1 : 0.7)) continue;
    if (!free(x, z, 2.2)) continue;
    const t = r() < f.pineShare ? pineTree((3.2 + r() * 1.5) * PK, r, f.pine) : roundTree((3.2 + r() * 1.4) * PK, r, f.round);
    t.position.set(x, 0, z); S.add(t); occupied.push([x, z, 1.9 * PK, 't']); n++;
  }
  tries = 0; n = 0;
  while (n < 140 && tries++ < 6000) {
    const rr = PLAZA_R + 6 + r() * (LR - PLAZA_R - 12), a = r() * 6.283, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (!free(x, z, 1.4)) continue;
    const f = FLAVOR[sectorAt(x, z)];
    const o = n % 3 === 0 ? rock((3 + r() * 2.5) * PK, r, f.rock) : bush(r);
    if (n % 3 !== 0) o.scale.setScalar((3 + r() * 1.5) * PK);
    o.position.set(x, 0, z); o.rotation.y = r() * 6; S.add(o); occupied.push([x, z, 1.3 * PK, 'r']); n++;
  }

  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.32, 6, 1), mat(0xf7a634, { side: THREE.DoubleSide }));
  flag.scale.setScalar(S_HALL);
  flag.position.set(hx + 0.28 * S_HALL, 4.62 * S_HALL, hz - 0.1 * S_HALL);
  flag.castShadow = true;
  dyn.flag = flag; root.add(flag);

  root.add(mergeStatic(S));

  const isl = new THREE.Group();
  [[-196, -13, 52], [190, -42, 40], [214, 60, 30], [-205, 52, 34]].forEach(([x, z, R], i) => {
    const m = islet(R, rng(20 + i), true); m.position.set(x, WATER_Y + 0.5, z); isl.add(m);
  });
  root.add(isl);

  const water = new THREE.Mesh(new THREE.CircleGeometry(900, 48), mat(0x4fc3f2));
  water.rotation.x = -Math.PI / 2; water.position.y = WATER_Y; water.receiveShadow = true; root.add(water);
  const shallow = new THREE.Mesh(new THREE.CircleGeometry(ISLAND_R + 30, 64), new THREE.MeshBasicMaterial({ color: lin(0x9aeaf2), transparent: true, opacity: 0.55 }));
  shallow.rotation.x = -Math.PI / 2; shallow.position.y = WATER_Y + 0.12; root.add(shallow);
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 72), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
    f.rotation.x = -Math.PI / 2; f.position.y = WATER_Y + 0.25; root.add(f); dyn.foam.push(f);
  }
  const cr = rng(99);
  for (let i = 0; i < 10; i++) {
    const body = new THREE.Group();
    for (let j = 0; j < 4; j++) add(body, 'sph', 0xffffff, [0.9 + cr() * 0.5, 0.6 + cr() * 0.3, 0.8], [j * 0.9 - 1.3, cr() * 0.3, cr() * 0.4], [0, 0, 0], { emissive: 0xaad4f5, emissiveIntensity: 0.4, castShadow: false });
    const c = new THREE.Group();
    const merged = mergeStatic(body);
    merged.scale.setScalar(9 + cr() * 5);
    c.add(merged);
    const a = cr() * 6.283, d = 170 + cr() * 140;
    c.position.set(Math.cos(a) * d, 25 + cr() * 40, Math.sin(a) * d);
    c.userData.a = a; c.userData.d = d; c.userData.s = 0.01 + cr() * 0.015;
    root.add(c); dyn.clouds.push(c);
  }
  for (let i = 0; i < 24; i++) {
    const m = miniVillager(r, r() * 6);
    let x, z, k = 0;
    do { const rr = PLAZA_R + 4 + r() * (LR - PLAZA_R - 14), a = r() * 6.28; x = Math.cos(a) * rr; z = Math.sin(a) * rr; } while (k++ < 50 && !occupied.every(([ox, oz, orad]) => Math.hypot(x - ox, z - oz) > orad));
    m.position.set(x, 0, z);
    m.userData.tx = x; m.userData.tz = z;
    root.add(m); dyn.minis.push(m);
  }
  // Footprints in world units (the island group is scaled by U) for spawn and wander collision.
  return { dyn, occupied: occupied.map(([x, z, rad, kind]) => [x * U, z * U, rad * U, kind]) };
}

export function updateIsland(dyn, t, dt, rnd = Math.random) {
  dyn.mon.forEach((m) => m.tick(t, dt));
  const fp = dyn.flag.geometry.attributes.position;
  for (let i = 0; i < fp.count; i++) { const x = fp.getX(i); fp.setZ(i, Math.sin(t * 5 + x * 7) * 0.05 * (x + 0.28)); }
  fp.needsUpdate = true;
  dyn.foam.forEach((f, i) => { const k = ((t * 0.18 + i / 3) % 1); f.scale.setScalar(ISLAND_R * 0.82 + k * 40); f.material.opacity = 0.55 * (1 - k); });
  dyn.clouds.forEach((c) => { c.userData.a += c.userData.s * dt * 0.3; c.position.x = Math.cos(c.userData.a) * c.userData.d; c.position.z = Math.sin(c.userData.a) * c.userData.d; });
  if (dyn.boat) { dyn.boat.position.y = dyn.waterY + 0.1 + Math.sin(t * 1.3) * 0.2; dyn.boat.rotation.z = Math.sin(t * 1.1) * 0.05; }
  dyn.minis.forEach((m) => {
    const u = m.userData;
    u.wait -= dt;
    const dx = u.tx - m.position.x, dz = u.tz - m.position.z, dist = Math.hypot(dx, dz);
    if (u.wait > 0 || dist < 0.5) {
      if (dist < 0.5 && u.wait <= 0) { u.wait = 1 + rnd() * 3; const a = rnd() * 6.28, rr = PLAZA_R + 4 + rnd() * (LR - PLAZA_R - 16); u.tx = Math.cos(a) * rr; u.tz = Math.sin(a) * rr; }
      m.position.y = 0;
    } else {
      m.position.x += (dx / dist) * dt * 4; m.position.z += (dz / dist) * dt * 4;
      m.position.y = Math.abs(Math.sin(t * 9 + u.phase)) * 0.35; m.rotation.y = Math.atan2(dx, dz);
    }
  });
}
