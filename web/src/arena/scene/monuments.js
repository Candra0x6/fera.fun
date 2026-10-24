// One landmark per biome zone, low-poly. Each monument is a static group (merged by island.js into the island's few vertex-colour draw calls)
// plus a tiny animated `fx` group (2 to 5 draw calls: glow, smoke/embers, sparks, aura). All numbers are layout units; the island group scales them by U.
import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { add, lin, rng } from './kit.js';

// Sector centres are on the axes (ice -90, dark 0, lava 90, forest 180); monuments sit ~32 degrees off the axis near the rim,
// clear of the spokes, the two ring roads and the plaza. Electric has no sector of its own (its monsters roam a random quarter), so it shares the east/dark one.
export const MONUMENT_SPOTS = [
  { kind: 'ice', r: 108, deg: -122, rad: 15 },
  { kind: 'dark', r: 108, deg: -32, rad: 12 },
  { kind: 'electric', r: 108, deg: 32, rad: 12.5 },
  { kind: 'fire', r: 108, deg: 58, rad: 16.5 },
  { kind: 'earth', r: 108, deg: 148, rad: 17 }
];

let spriteTex = null;
const softSprite = () => {
  if (spriteTex) return spriteTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  spriteTex = new THREE.CanvasTexture(c);
  return spriteTex;
};

const FLAT = { flatShading: true };
const frustum = (p, rb, rt, y0, h, color, seg = 9, rot = 0) =>
  add(p, new THREE.CylinderGeometry(rt, rb, h, seg), color, [1, 1, 1], [0, y0 + h / 2, 0], [0, rot, 0], FLAT);
const polar = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];

// A flat box laid between two points (lava streaks, cables).
function strip(p, a, b, w, th, color, mo) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const m = add(p, 'box', color, [w, th, len], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [0, 0, 0], mo);
  m.lookAt(b[0], b[1], b[2]);
  return m;
}

function points(count, color, size, opts = {}) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const mat = new THREE.PointsMaterial({
    color: lin(color), size, map: softSprite(), transparent: true, opacity: opts.opacity ?? 1, depthWrite: false,
    blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

const glowMat = (color, opacity = 1, extra = {}) => new THREE.MeshBasicMaterial({ color: lin(color), transparent: opacity < 1, opacity, depthWrite: opacity >= 1, ...extra });

// ---------------------------------------------------------------- fire: lava volcano
function volcano() {
  const S = new THREE.Group(), F = new THREE.Group();
  // Profile of the cone: [radius, height]. Faces are 9-sided; lava streaks ride the vertex ridges so they sit on the rock.
  const prof = [[14.5, 0], [9, 10], [5.6, 19], [4, 23.2]];
  const rock = [0x6e4333, 0x7d4a36, 0x59352b];
  for (let i = 0; i < 3; i++) frustum(S, prof[i][0], prof[i + 1][0], prof[i][1], prof[i + 1][1] - prof[i][1], rock[i], 9);
  const r = rng(11);
  for (let i = 0; i < 8; i++) {
    const [x, z] = polar(13 + r() * 3.5, (i / 8) * 6.283 + r() * 0.4);
    add(S, 'dod', i % 2 ? 0x5a3a30 : 0x7d5a48, [1.6 + r() * 1.6, 1.2 + r() * 1.1, 1.6 + r() * 1.6], [x, 0.8, z], [r(), r() * 3, 0], FLAT);
  }
  for (let i = 0; i < 9; i++) {
    const [x, z] = polar(4.1, (i / 9) * 6.283);
    add(S, 'dod', 0x3e2620, [1.1 + r() * 0.7, 0.9 + r() * 0.6, 1.1 + r() * 0.7], [x, 23.5, z], [r(), r() * 3, 0], FLAT);
  }
  add(S, 'cyl', 0xff7a1a, [3.5, 0.3, 3.5], [0, 23.2, 0], [0, 0, 0], { emissive: 0xff5a14, emissiveIntensity: 0.9, castShadow: false });
  const lava = { emissive: 0xff5a14, emissiveIntensity: 0.9, castShadow: false };
  const ridge = [[4, 23.2], [5.6, 19], [9, 10], [12.4, 4.2]];
  [1, 3, 5, 7].forEach((k, ki) => {
    const th = (k / 9) * 6.283, sx = Math.sin(th), sz = Math.cos(th);
    for (let i = 0; i < 3; i++) {
      const [r0, y0] = ridge[i], [r1, y1] = ridge[i + 1];
      const dr = r1 - r0, dy = y1 - y0, n = Math.hypot(dr, dy), nr = -dy / n, ny = dr / n; // outward normal of the slope
      const off = 0.18;
      const a = [sx * (r0 + nr * off), y0 + ny * off, sz * (r0 + nr * off)], b = [sx * (r1 + nr * off), y1 + ny * off, sz * (r1 + nr * off)];
      strip(S, a, b, 1.15 - i * 0.2 + (ki % 2) * 0.2, 0.22, i === 0 ? 0xffb030 : 0xff6a1a, lava);
    }
  });

  // animated: pulsing crater glow, light smoke, rising embers
  const disc = new THREE.Mesh(new THREE.CircleGeometry(3.3, 12).rotateX(-Math.PI / 2), glowMat(0xff7a1a));
  disc.position.y = 23.65;
  F.add(disc);
  const puffGeo = new THREE.IcosahedronGeometry(1, 0);
  const puffs = [0, 1, 2].map((i) => {
    const m = new THREE.Mesh(puffGeo, glowMat(0xb4b8c6, 0.45, { depthWrite: false }));
    m.userData.i = i; F.add(m); return m;
  });
  const N = 22, embers = points(N, 0xff8a1a, 1.5, { additive: false });
  const ep = embers.geometry.attributes.position, st = [];
  for (let i = 0; i < N; i++) st.push({ age: r() * 2.5, life: 1.8 + r() * 1.4, vx: (r() - 0.3) * 1.8, vy: 6 + r() * 6, vz: (r() - 0.5) * 1.8, x: 0, z: 0, ox: 0, oz: 0 });
  F.add(embers);
  const c3 = lin(0xff5a14), c4 = lin(0xffc040);
  return {
    stat: S, fx: F,
    tick(t, dt) {
      disc.material.color.copy(c3).lerp(c4, 0.5 + 0.5 * Math.sin(t * 3.1) * Math.sin(t * 1.3 + 1));
      puffs.forEach((m) => {
        const ph = (t * 0.1 + m.userData.i / 3) % 1;
        m.position.set(Math.sin(t * 0.4 + m.userData.i * 2) * 1.2 + ph * 7, 24.5 + ph * 22, ph * 3);
        m.scale.setScalar(1.5 + ph * 3.6);
        m.rotation.y = t * 0.3 + m.userData.i;
        m.material.opacity = 0.42 * (1 - ph) * Math.min(1, ph * 6);
      });
      const d = Math.min(dt, 0.1);
      for (let i = 0; i < N; i++) {
        const s = st[i];
        s.age += d;
        if (s.age > s.life) { s.age = 0; const a = Math.random() * 6.283, rr = Math.random() * 2.6; s.ox = Math.cos(a) * rr; s.oz = Math.sin(a) * rr; s.x = 0; s.z = 0; }
        const k = s.age;
        ep.setXYZ(i, s.ox + s.vx * k + k * k * 0.6, 24 + s.vy * k - k * k * 0.8, s.oz + s.vz * k);
      }
      ep.needsUpdate = true;
      embers.material.opacity = 0.9;
    }
  };
}

// ---------------------------------------------------------------- ice: glacier peak with crystals
function iceMountain() {
  const S = new THREE.Group(), F = new THREE.Group();
  frustum(S, 14.5, 11, 0, 4, 0x8ea3c0, 9);
  add(S, 'cone7', 0xd2e8f7, [11, 23, 11], [0, 4 + 11.5, 0], [0, 0.2, 0], FLAT);
  add(S, 'cone7', 0xffffff, [6.4, 11, 6.4], [0, 22.3, 0], [0, 0.2, 0], FLAT);
  add(S, 'cone7', 0xc4e0f2, [7.6, 16, 7.6], [8.8, 4 + 8, 3.2], [0, 0.9, 0], FLAT);
  add(S, 'cone7', 0xffffff, [4.6, 7, 4.6], [8.8, 4 + 12.4, 3.2], [0, 0.9, 0], FLAT);
  add(S, 'cone7', 0xb9d6ec, [6, 12.5, 6], [-8, 4 + 6.2, -5.5], [0, 0.4, 0], FLAT);
  add(S, 'cone7', 0xffffff, [3.6, 5.5, 3.6], [-8, 4 + 9.8, -5.5], [0, 0.4, 0], FLAT);
  // glacier tongue toward the plaza
  add(S, 'box', 0xbfe6f5, [7, 0.9, 11], [0, 0.45, 12], [-0.1, 0, 0], FLAT);
  add(S, 'box', 0xe8f7ff, [4.2, 0.7, 8], [0.6, 1.0, 12.8], [-0.1, 0.2, 0], FLAT);
  const cryst = { emissive: 0x4cc8ff, emissiveIntensity: 0.38, flatShading: true };
  const r = rng(21);
  const cluster = (x, z, s, yaw) => {
    [[0, 0, 1, 0, 0], [0.9, 0.5, 0.7, 0.35, 0.3], [-0.8, -0.3, 0.8, -0.3, -0.25]].forEach(([dx, dz, k, tx, tz], i) => {
      const hh = 3.4 * s * k;
      add(S, 'oct', i === 0 ? 0x9be8ff : 0x7cd7f5, [0.85 * s * k, hh, 0.85 * s * k], [x + dx * s, hh * 0.85, z + dz * s], [tx + (r() - 0.5) * 0.1, yaw, tz], cryst);
    });
  };
  for (let i = 0; i < 8; i++) { const [x, z] = polar(13 + r() * 2.5, (i / 8) * 6.283 + 0.3); cluster(x, z, 0.9 + r() * 0.6, r() * 3); }
  cluster(4, 14.5, 1.2, 0.5); cluster(-4.5, 15, 0.9, 1.4);
  for (let i = 0; i < 6; i++) { const [x, z] = polar(8.5 + r() * 2, (i / 6) * 6.283 + 1); add(S, 'dod', 0xa8b6cc, [1.4 + r(), 1, 1.4 + r()], [x, 3.8, z], [r(), r() * 3, 0], FLAT); }

  // animated: pulsing crystal glow + twinkling sparkles
  const big = [[-6.5, 14.8, 2.4, 0.3], [6.2, 15.5, 2.0, -0.4], [0.5, 17.2, 1.6, 0.1], [-9.8, 11.5, 1.5, 0.5]].map(([x, z, s, tz]) => {
    const g = new THREE.OctahedronGeometry(1, 0); g.scale(0.85 * s, 3.8 * s, 0.85 * s); g.rotateZ(tz); g.translate(x, 3.2 * s, z); return g;
  });
  const glow = new THREE.Mesh(BufferGeometryUtils.mergeBufferGeometries(big), new THREE.MeshLambertMaterial({ color: lin(0xb4f0ff), emissive: lin(0x5ad2ff), emissiveIntensity: 0.6 }));
  F.add(glow);
  const N = 18, spark = points(N, 0xdff8ff, 1.5);
  const sp = spark.geometry.attributes.position;
  for (let i = 0; i < N; i++) {
    const a = r() * 6.283, rr = 5 + r() * 11;
    sp.setXYZ(i, Math.cos(a) * rr, 2 + r() * 20, Math.sin(a) * rr * 0.9 + (r() > 0.5 ? 6 : 0));
  }
  sp.needsUpdate = true;
  F.add(spark);
  return {
    stat: S, fx: F,
    tick(t) {
      glow.material.emissiveIntensity = 0.55 + 0.3 * Math.sin(t * 1.8);
      spark.rotation.y = t * 0.12;
      spark.material.opacity = 0.55 + 0.45 * Math.sin(t * 3.3);
      spark.material.size = 1.2 + 0.5 * Math.sin(t * 2.1 + 1);
    }
  };
}

// ---------------------------------------------------------------- earth: mossy rock mountain with standing stones
function rockMountain() {
  const S = new THREE.Group(), F = new THREE.Group();
  const r = rng(31);
  frustum(S, 14, 10.4, 0, 4.2, 0x7a6548, 8);
  frustum(S, 10.4, 6.8, 4.2, 8, 0x8a7352, 8, 0.4);
  frustum(S, 6.8, 3.6, 12.2, 9.5, 0x6e5a40, 7, 0.2);
  add(S, 'dod', 0x9a8560, [3.3, 3.8, 3.1], [0.3, 23.2, 0], [0.2, 0.5, 0.1], FLAT);
  add(S, 'dod', 0x84704f, [2, 2.6, 2], [-2.6, 21.2, 1.2], [0.1, 1, 0.3], FLAT);
  // moss: green caps on every ledge and the summit
  const moss = [0x66a83c, 0x7bbd48, 0x58953a];
  add(S, 'ico', moss[0], [3.1, 0.95, 2.9], [0.3, 26, 0], [0, 0.5, 0], FLAT);
  [[10.2, 4.2, 4], [6.7, 12.2, 3], [3.5, 21.4, 2]].forEach(([rr, y, n], k) => {
    for (let i = 0; i < n * 2 + 2; i++) {
      const [x, z] = polar(rr * (0.82 + r() * 0.15), (i / (n * 2 + 2)) * 6.283 + r());
      add(S, 'ico', moss[(i + k) % 3], [1.5 + r() * 1.7, 0.55 + r() * 0.35, 1.5 + r() * 1.7], [x, y + 0.15, z], [0, r() * 3, 0], FLAT);
    }
  });
  for (let i = 0; i < 9; i++) {
    const [x, z] = polar(13 + r() * 3.4, (i / 9) * 6.283 + r() * 0.4);
    const s = 1.5 + r() * 1.6;
    add(S, 'dod', i % 2 ? 0x7a6a50 : 0x92805f, [s, s * 0.8, s], [x, s * 0.4, z], [r(), r() * 3, 0], FLAT);
    if (i % 3 === 0) add(S, 'ico', moss[1], [s * 0.8, s * 0.3, s * 0.8], [x, s * 0.85, z], [0, r() * 3, 0], FLAT);
  }
  // standing stones with mossy tops and a green gem on two of them
  const gem = { emissive: 0x3ad14a, emissiveIntensity: 0.6, flatShading: true };
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 6.283 + 0.5, [x, z] = polar(16, a), h = 6.2 + r() * 3;
    add(S, 'box', 0x8d8472, [1.7, h, 1.4], [x, h / 2, z], [(r() - 0.5) * 0.18, a, (r() - 0.5) * 0.18], FLAT);
    add(S, 'ico', moss[i % 3], [1.2, 0.5, 1.0], [x, h + 0.1, z], [0, a, 0], FLAT);
    if (i % 2 === 0) add(S, 'oct', 0x6bdc6e, [0.45, 0.8, 0.45], [x + Math.cos(a) * -0.9, h * 0.62, z + Math.sin(a) * 0.1], [0, a, 0], gem);
  }
  // animated: drifting pollen/fireflies
  const N = 16, fly = points(N, 0xcaf56a, 1.3);
  const fp = fly.geometry.attributes.position, seed = [];
  for (let i = 0; i < N; i++) seed.push({ a: r() * 6.283, rr: 6 + r() * 12, y: 3 + r() * 14, sp: 0.15 + r() * 0.25, ph: r() * 6 });
  F.add(fly);
  return {
    stat: S, fx: F,
    tick(t) {
      for (let i = 0; i < N; i++) {
        const s = seed[i], a = s.a + t * s.sp;
        fp.setXYZ(i, Math.cos(a) * s.rr, s.y + Math.sin(t * 0.9 + s.ph) * 1.6, Math.sin(a) * s.rr);
      }
      fp.needsUpdate = true;
      fly.material.opacity = 0.6 + 0.4 * Math.sin(t * 2.2);
    }
  };
}

// ---------------------------------------------------------------- electric: tesla tower
function teslaTower() {
  const S = new THREE.Group(), F = new THREE.Group();
  add(S, 'cyl6', 0x7c8396, [11.5, 0.3, 11.5], [0, 0.15, 0], [0, 0, 0], FLAT);
  add(S, new THREE.RingGeometry(7.6, 8.4, 24).rotateX(-Math.PI / 2), 0xffd84a, [1, 1, 1], [0, 0.34, 0], [0, 0, 0], { emissive: 0xffc830, emissiveIntensity: 0.55, castShadow: false });
  add(S, 'cyl6', 0xb6b9c2, [6.4, 1.6, 6.4], [0, 1.1, 0], [0, 0, 0], FLAT);
  add(S, 'cyl6', 0x9aa1b0, [4.6, 1.8, 4.6], [0, 2.8, 0], [0, 0.3, 0], FLAT);
  add(S, new THREE.CylinderGeometry(1.15, 2.5, 19, 8), 0x8d97ac, [1, 1, 1], [0, 13.6, 0], [0, 0, 0], FLAT);
  [[9, 3.6], [13.6, 3.0], [18.2, 2.4]].forEach(([y, s]) => add(S, new THREE.TorusGeometry(1, 0.2, 6, 14), 0xd98a35, [s, s, s], [0, y, 0], [Math.PI / 2, 0, 0], FLAT));
  add(S, 'cyl', 0x4d556a, [1.5, 1.4, 1.5], [0, 23.8, 0], [0, 0, 0], FLAT);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.283 + 0.785, [x, z] = polar(1.9, a); add(S, 'cone4', 0x9aa1b0, [0.5, 3.4, 0.5], [x, 25.8, z], [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35], FLAT); }
  const tips = [];
  const lamp = { emissive: 0xffe040, emissiveIntensity: 0.7, flatShading: true };
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * 6.283 + 0.785, [x, z] = polar(10, a);
    add(S, 'cyl6', 0xd98a35, [0.8, 7, 0.8], [x, 3.5, z], [0, 0, 0], FLAT);
    add(S, 'cyl6', 0x9aa1b0, [1.6, 0.6, 1.6], [x, 0.6, z], [0, 0, 0], FLAT);
    add(S, 'sph', 0xffe66a, 1.15, [x, 7.7, z], [0, 0, 0], lamp);
    tips.push([x, 7.7, z]);
  }
  const ORB = [0, 28, 0];
  const orb = new THREE.Mesh(new THREE.SphereGeometry(2.1, 14, 10), glowMat(0xfff2a0));
  orb.position.set(...ORB);
  F.add(orb);
  const halo = points(1, 0xffe14a, 14);
  halo.geometry.attributes.position.setXYZ(0, ORB[0], ORB[1], ORB[2]);
  F.add(halo);
  // lightning: 4 pylon-to-orb arcs and 3 free arcs, re-rolled ~14 times a second
  const SEGS = 7, ARCS = 7, arcGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(ARCS * (SEGS - 1) * 2 * 3);
  arcGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const arcs = new THREE.LineSegments(arcGeo, new THREE.LineBasicMaterial({ color: lin(0xfff6b0), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
  arcs.frustumCulled = false;
  F.add(arcs);
  const NS = 14, sparks = points(NS, 0xfff2a0, 1.2), spp = sparks.geometry.attributes.position;
  F.add(sparks);
  let lastStep = -1;
  const v = new THREE.Vector3(), w = new THREE.Vector3(), a0 = new THREE.Vector3(), a1 = new THREE.Vector3();
  const reroll = () => {
    let o = 0;
    for (let k = 0; k < ARCS; k++) {
      const on = Math.random() < (k < 4 ? 0.85 : 0.55);
      if (k < 4) { a0.set(...tips[k]); a1.set(ORB[0] + (tips[k][0] > 0 ? 1 : -1) * 1.4, ORB[1] - 1, ORB[2] + (tips[k][2] > 0 ? 1 : -1) * 1.4); }
      else { const th = Math.random() * 6.283, el = (Math.random() - 0.3) * 1.2, L = 6 + Math.random() * 5; a0.set(...ORB); a1.set(ORB[0] + Math.cos(th) * Math.cos(el) * L, ORB[1] + Math.sin(el) * L, ORB[2] + Math.sin(th) * Math.cos(el) * L); }
      let prev = null;
      for (let i = 0; i < SEGS; i++) {
        const u = i / (SEGS - 1), amp = Math.sin(u * Math.PI) * 1.6;
        v.lerpVectors(a0, a1, u);
        if (i && i < SEGS - 1) { w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(amp * 2); v.add(w); }
        if (prev) { const q = on ? v : prev; pos.set([prev.x, prev.y, prev.z, q.x, q.y, q.z], o); o += 6; }
        prev = v.clone();
      }
    }
    arcGeo.attributes.position.needsUpdate = true;
    for (let i = 0; i < NS; i++) { const th = Math.random() * 6.283, el = Math.random() * 2 - 0.6, L = 3 + Math.random() * 8; spp.setXYZ(i, ORB[0] + Math.cos(th) * Math.cos(el) * L, ORB[1] + Math.sin(el) * L, ORB[2] + Math.sin(th) * Math.cos(el) * L); }
    spp.needsUpdate = true;
  };
  reroll();
  return {
    stat: S, fx: F,
    tick(t) {
      const step = Math.floor(t * 14);
      if (step !== lastStep) { lastStep = step; reroll(); }
      const p = 1 + 0.12 * Math.sin(t * 7) + 0.06 * Math.sin(t * 17);
      orb.scale.setScalar(p);
      halo.material.size = 12 + 4 * Math.sin(t * 5);
      sparks.material.opacity = 0.6 + 0.4 * Math.sin(t * 23);
    }
  };
}

// ---------------------------------------------------------------- dark: haunted crystal obelisk
function obelisk() {
  const S = new THREE.Group(), F = new THREE.Group();
  const r = rng(41);
  add(S, 'cyl6', 0x2a2147, [9, 1.2, 9], [0, 0.6, 0], [0, 0.2, 0], FLAT);
  add(S, 'cyl6', 0x3a2e63, [7, 1, 7], [0, 1.7, 0], [0, 0.5, 0], FLAT);
  add(S, 'cyl6', 0x2f2552, [5, 0.9, 5], [0, 2.65, 0], [0, 0.1, 0], FLAT);
  add(S, new THREE.CylinderGeometry(1.7, 2.8, 13, 4), 0x352457, [1, 1, 1], [0, 9.6, 0], [0, Math.PI / 4, 0], FLAT);
  add(S, 'cone4', 0x2d1d57, [2.7, 9, 2.7], [0, 20.6, 0], [0, Math.PI / 4, 0], FLAT);
  const glow = { emissive: 0x6a2cff, emissiveIntensity: 0.5, flatShading: true };
  for (let i = 0; i < 4; i++) { // glowing runes down each face of the shaft
    const a = (i / 4) * 6.283 + Math.PI / 4 - Math.PI / 4;
    const [x, z] = polar(2.15, a);
    add(S, 'box', 0xb98cff, [0.35, 4.6, 0.12], [x, 9.8, z], [0, -a + Math.PI / 2, 0], glow);
    add(S, 'box', 0xb98cff, [1.0, 0.25, 0.12], [x, 12.6, z], [0, -a + Math.PI / 2, 0], glow);
  }
  for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.283 + 0.4, [x, z] = polar(2.6, a); add(S, 'cone4', 0x2d1d57, [0.7, 3.4, 0.7], [x, 7.2, z], [Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0], FLAT); }
  for (let i = 0; i < 7; i++) { // shards
    const a = (i / 7) * 6.283 + r() * 0.3, [x, z] = polar(6.6 + r() * 2.4, a), h = 3.6 + r() * 2.6, lean = 0.2 + r() * 0.15;
    add(S, 'oct', 0x8f5bff, [1.0 + r() * 0.3, h, 1.0 + r() * 0.3], [x, h * 0.85 + 1.5, z], [Math.sin(a) * lean, r() * 3, -Math.cos(a) * lean], glow);
  }
  // animated: floating crystal, faint aura, orbit ring, rising wisps
  const cg = new THREE.OctahedronGeometry(1, 0); cg.scale(2.5, 5.6, 2.5);
  const crystal = new THREE.Mesh(cg, new THREE.MeshLambertMaterial({ color: lin(0xa070ff), emissive: lin(0x7a2cff), emissiveIntensity: 0.8 }));
  crystal.position.y = 31;
  F.add(crystal);
  const aura = new THREE.Mesh(new THREE.SphereGeometry(10.5, 14, 10), glowMat(0x9a5cff, 0.055, { side: THREE.BackSide }));
  aura.position.y = 17;
  F.add(aura);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(7.5, 0.14, 6, 40), glowMat(0xb98cff, 0.32));
  ring.position.y = 15;
  F.add(ring);
  const N = 18, wisps = points(N, 0x9a5cff, 1.6, { opacity: 0.75, additive: false });
  const wp = wisps.geometry.attributes.position, ws = [];
  for (let i = 0; i < N; i++) ws.push({ a: r() * 6.283, rr: 4 + r() * 6, sp: 0.4 + r() * 0.5, ph: r() });
  F.add(wisps);
  return {
    stat: S, fx: F,
    tick(t) {
      crystal.position.y = 31 + Math.sin(t * 1.1) * 0.9;
      crystal.rotation.y = t * 0.6;
      crystal.material.emissiveIntensity = 0.7 + 0.25 * Math.sin(t * 2.2);
      aura.scale.setScalar(1 + 0.04 * Math.sin(t * 1.5));
      ring.rotation.set(Math.PI / 2 + Math.sin(t * 0.5) * 0.35, t * 0.5, Math.cos(t * 0.4) * 0.3);
      for (let i = 0; i < N; i++) {
        const s = ws[i], u = (t * 0.07 * s.sp * 3 + s.ph) % 1, a = s.a + t * s.sp * 0.5;
        wp.setXYZ(i, Math.cos(a) * s.rr * (1 - u * 0.6), 2 + u * 28, Math.sin(a) * s.rr * (1 - u * 0.6));
      }
      wp.needsUpdate = true;
    }
  };
}

const BUILDERS = { fire: volcano, ice: iceMountain, earth: rockMountain, electric: teslaTower, dark: obelisk };
export const buildMonument = (kind) => BUILDERS[kind]();
