// Shared low-poly kit for the cream/teal island: seeded RNG, linear colours (r128 has no colour management), unit geometries, vertex-colour merge.
import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();

const lowDetail = {
  sph: new THREE.SphereGeometry(1, 12, 9),
  ico: new THREE.IcosahedronGeometry(1, 1),
  dod: new THREE.DodecahedronGeometry(1, 0),
  oct: new THREE.OctahedronGeometry(1, 0),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cone: new THREE.ConeGeometry(1, 1, 8),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  cone7: new THREE.ConeGeometry(1, 1, 7),
  plane: new THREE.PlaneGeometry(1, 1)
};
const hiDetail = { ...lowDetail, sph: new THREE.SphereGeometry(1, 20, 14), cone: new THREE.ConeGeometry(1, 1, 14) };
export const G = lowDetail;
let active = lowDetail;
export function withDetail(hi, fn) {
  const prev = active;
  active = hi ? hiDetail : lowDetail;
  try { return fn(); } finally { active = prev; }
}

const mats = new Map();
export function mat(color, o = {}) {
  const key = color + '|' + JSON.stringify(o);
  if (!mats.has(key)) {
    const p = { color: lin(color) };
    if (o.side !== undefined) p.side = o.side;
    if (o.emissive !== undefined) { p.emissive = lin(o.emissive); p.emissiveIntensity = o.emissiveIntensity ?? 1; }
    if (o.transparent) { p.transparent = true; p.opacity = o.opacity ?? 1; p.depthWrite = false; }
    mats.set(key, new THREE.MeshLambertMaterial(p));
  }
  return mats.get(key);
}

// add(parent, geoKey|geometry, color, scale, position, rotation, {flatShading, side, emissive, emissiveIntensity})
export function add(parent, geo, color, s = [1, 1, 1], p = [0, 0, 0], r = [0, 0, 0], mo = {}) {
  const g = typeof geo === 'string' ? active[geo] : geo;
  const m = new THREE.Mesh(g, mat(color, mo));
  if (typeof s === 'number') s = [s, s, s];
  m.scale.set(s[0], s[1], s[2]);
  m.position.set(p[0], p[1], p[2]);
  m.rotation.set(r[0], r[1], r[2]);
  m.castShadow = mo.castShadow !== false;
  m.receiveShadow = true;
  m.userData.hex = color;
  m.userData.flat = !!mo.flatShading;
  m.userData.mo = mo;
  parent.add(m);
  return m;
}

const vcMats = new Map();
// one Lambert vertex-colour material per (side, emissive) bucket and skin tint
export function bucketMaterial(side, emissive, intensity, tint = 0xffffff) {
  const key = `${side}|${emissive}|${intensity}|${tint}`;
  if (!vcMats.has(key)) {
    const p = { vertexColors: true, side, color: lin(tint) };
    if (emissive !== undefined) { p.emissive = lin(emissive); p.emissiveIntensity = intensity; }
    vcMats.set(key, new THREE.MeshLambertMaterial(p));
  }
  return vcMats.get(key);
}

export const bucketKey = (m) => `${m.userData.mo.side || THREE.FrontSide}|${m.userData.mo.emissive ?? ''}|${m.userData.mo.emissiveIntensity ?? 1}`;

// Bake `mesh` into a non-indexed, vertex-coloured geometry in the space of `space` (a matrix, usually identity or an inverse parent matrix).
export function bakedGeometry(mesh, matrix, colorFn) {
  let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'color') g.deleteAttribute(n);
  g.clearGroups();
  if (mesh.userData.flat || !g.attributes.normal) g.computeVertexNormals();
  g.applyMatrix4(matrix);
  if (!g.attributes.color) {
    const c = colorFn ? colorFn(mesh) : lin(mesh.userData.hex);
    const arr = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  return g;
}

export function mergeBuckets(entries, tint) {
  const buckets = new Map();
  for (const { mesh, geometry } of entries) {
    const k = bucketKey(mesh);
    if (!buckets.has(k)) buckets.set(k, { mesh, list: [] });
    buckets.get(k).list.push(geometry);
  }
  const out = [];
  for (const [key, { mesh, list }] of buckets) {
    const geometry = BufferGeometryUtils.mergeBufferGeometries(list, false);
    list.forEach((g) => g.dispose());
    if (!geometry) continue;
    const mo = mesh.userData.mo;
    const m = new THREE.Mesh(geometry, bucketMaterial(mo.side || THREE.FrontSide, mo.emissive, mo.emissiveIntensity ?? 1, tint));
    m.userData.bucket = key;
    m.castShadow = mo.castShadow !== false;
    m.receiveShadow = true;
    out.push(m);
  }
  return out;
}

// Merge every non-kept mesh in `group` into one mesh per bucket (a few draw calls for the whole island).
export function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const entries = [];
  const dead = [];
  group.traverse((o) => {
    if (!o.isMesh || o.userData.keep) return;
    entries.push({ mesh: o, geometry: bakedGeometry(o, o.matrixWorld) });
    dead.push(o);
  });
  dead.forEach((o) => o.parent.remove(o));
  const out = new THREE.Group();
  mergeBuckets(entries).forEach((m) => out.add(m));
  return out;
}
