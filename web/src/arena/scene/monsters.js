// The five Monster Arena creatures. Built from primitives, then baked per animated node into vertex-colour meshes (few draw calls).
import * as THREE from 'three';
import { add, G, withDetail, bakedGeometry, mergeBuckets, bucketMaterial, lin } from './kit.js';

const mirror = (fn) => { fn(1); fn(-1); };
const rig = (g) => { g.userData.rig = true; return g; };

function eye(p, x, y, z, s, iris = 0x23263a, white = 0xffffff) {
  add(p, 'sph', white, [s, s * 1.15, s * 0.7], [x, y, z]);
  add(p, 'sph', iris, [s * 0.62, s * 0.8, s * 0.5], [x, y - s * 0.05, z + s * 0.42]);
  add(p, 'sph', 0xffffff, [s * 0.2, s * 0.2, s * 0.2], [x + s * 0.14, y + s * 0.2, z + s * 0.78]);
}

function wingShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(0.5, 0.75); s.lineTo(0.62, 0.52); s.lineTo(0.95, 0.62); s.lineTo(0.85, 0.3); s.lineTo(1.1, 0.1); s.lineTo(0.55, -0.05); s.closePath();
  return new THREE.ShapeGeometry(s);
}
function boltShape() {
  const s = new THREE.Shape();
  s.moveTo(0.1, 0.5); s.lineTo(-0.25, -0.02); s.lineTo(-0.02, -0.02); s.lineTo(-0.12, -0.5); s.lineTo(0.28, 0.08); s.lineTo(0.04, 0.08); s.closePath();
  return new THREE.ShapeGeometry(s);
}

function fireDragon() {
  const g = rig(new THREE.Group()), B = rig(new THREE.Group());
  g.add(B);
  const red = 0xf2572b, org = 0xff8a3d, cream = 0xffd9a0;
  add(B, 'sph', red, [0.52, 0.5, 0.58], [0, 0.62, 0]);
  add(B, 'sph', cream, [0.38, 0.4, 0.3], [0, 0.55, 0.3]);
  for (let i = 0; i < 4; i++) add(B, 'cone', cream, [0.09, 0.2, 0.09], [0, 1.1 - i * 0.12, -0.12 - i * 0.14], [-0.5 - i * 0.2, 0, 0]);
  const head = rig(new THREE.Group()); head.position.set(0, 1.32, 0.3); B.add(head);
  add(head, 'sph', red, [0.5, 0.44, 0.46]);
  add(head, 'sph', org, [0.3, 0.2, 0.28], [0, -0.1, 0.4]);
  mirror((s) => {
    eye(head, s * 0.2, 0.1, 0.36, 0.12);
    add(head, 'sph', 0x5a1a10, 0.03, [s * 0.09, -0.05, 0.64]);
    add(head, 'cone', cream, [0.1, 0.42, 0.1], [s * 0.22, 0.46, -0.08], [-0.35, 0, -s * 0.45]);
    add(head, 'sph', org, [0.08, 0.2, 0.14], [s * 0.5, 0.0, -0.05], [0, 0, s * 0.3]);
    add(head, 'box', 0x8a2a14, [0.16, 0.035, 0.03], [s * 0.2, 0.28, 0.4], [0, 0, -s * 0.35]);
    add(B, 'sph', red, [0.13, 0.2, 0.13], [s * 0.5, 0.55, 0.28], [0.3, 0, -s * 0.3]);
    add(B, 'sph', cream, [0.1, 0.07, 0.09], [s * 0.54, 0.4, 0.4]);
    add(g, 'sph', red, [0.2, 0.17, 0.27], [s * 0.3, 0.17, 0.12]);
    add(g, 'sph', cream, [0.17, 0.08, 0.14], [s * 0.3, 0.07, 0.3]);
  });
  const wings = [];
  mirror((s) => {
    const w = rig(new THREE.Group()); w.position.set(s * 0.38, 0.95, -0.2); B.add(w);
    const m = add(w, wingShape(), org, [0.8, 0.8, 0.8], [0, 0, 0], [0, 0, 0], { side: THREE.DoubleSide, castShadow: false });
    m.scale.x = 0.8 * s;
    add(w, 'cyl6', red, [0.03, 0.8, 0.03], [s * 0.2, 0.34, 0], [0, 0, -s * 0.45]);
    w.userData.base = s * 0.5; wings.push(w);
  });
  const tail = []; let parent = B, z = -0.45, rr = 0.24;
  for (let i = 0; i < 4; i++) {
    let t = parent;
    if (i < 2) { t = rig(new THREE.Group()); parent.add(t); tail.push(t); } else { t = new THREE.Group(); parent.add(t); }
    t.position.set(0, i ? 0 : 0.5, z);
    add(t, 'sph', red, [rr, rr, 0.3], [0, 0, -0.18]);
    parent = t; z = -0.36; rr *= 0.8;
  }
  add(parent, 'cone', 0xffc233, [0.14, 0.4, 0.14], [0, 0.1, -0.5], [-1.9, 0, 0], { emissive: 0xff7a1a, emissiveIntensity: 0.7 });
  add(parent, 'cone', 0xff5a1f, [0.1, 0.28, 0.1], [0.05, 0.08, -0.46], [-1.7, 0, 0.3], { emissive: 0xff3a0a, emissiveIntensity: 0.6 });
  g.userData.parts = { head, tail: tail[0], wingL: wings[1], wingR: wings[0] };
  g.userData.anim = (t, mv) => {
    B.position.y = Math.abs(Math.sin(t * (mv ? 6 : 2.2))) * (mv ? 0.07 : 0.04);
    B.scale.y = 1 + Math.sin(t * 2.2) * 0.02;
    head.rotation.set(Math.sin(t * 1.7) * 0.06, Math.sin(t * 1.1) * 0.12, 0);
    wings.forEach((w) => { w.rotation.z = w.userData.base * 0.3 + Math.sin(t * (mv ? 7 : 3)) * 0.28 * Math.sign(w.userData.base); });
    tail.forEach((n, i) => { n.rotation.y = Math.sin(t * 2.4 - i * 0.7) * 0.3; });
  };
  return g;
}

function iceWolf() {
  const g = rig(new THREE.Group()), B = rig(new THREE.Group()); g.add(B);
  const wh = 0xf0f7ff, bl = 0x73aaf5, dk = 0x3f78e8;
  add(B, 'sph', wh, [0.4, 0.38, 0.6], [0, 0.55, -0.05]);
  add(B, 'sph', bl, [0.3, 0.1, 0.5], [0, 0.88, -0.1]);
  for (let i = 0; i < 4; i++) add(B, 'cone', dk, [0.08, 0.25, 0.08], [0, 0.95, 0.15 - i * 0.2], [0.2, 0, 0]);
  add(B, 'cone', wh, [0.2, 0.3, 0.2], [0, 0.6, 0.55], [Math.PI / 2 + 0.2, 0, 0]);
  mirror((s) => {
    add(g, 'sph', wh, [0.12, 0.3, 0.13], [s * 0.2, 0.3, 0.3]);
    add(g, 'sph', bl, [0.14, 0.09, 0.17], [s * 0.2, 0.06, 0.34]);
    add(g, 'sph', wh, [0.13, 0.28, 0.14], [s * 0.22, 0.3, -0.38]);
    add(g, 'sph', bl, [0.15, 0.09, 0.18], [s * 0.22, 0.06, -0.34]);
  });
  const head = rig(new THREE.Group()); head.position.set(0, 1.08, 0.5); B.add(head);
  add(head, 'sph', wh, [0.44, 0.4, 0.4]);
  add(head, 'sph', 0xe3efff, [0.22, 0.17, 0.26], [0, -0.1, 0.36]);
  add(head, 'sph', 0x2b3350, [0.07, 0.05, 0.05], [0, -0.03, 0.6]);
  add(head, 'sph', 0xff8fb0, [0.07, 0.03, 0.09], [0, -0.2, 0.52]);
  add(head, 'cone', bl, [0.12, 0.3, 0.1], [0, 0.4, 0.05], [0.4, 0, 0]);
  mirror((s) => {
    eye(head, s * 0.18, 0.08, 0.3, 0.1, 0x3a7bd8);
    add(head, 'cone', wh, [0.14, 0.42, 0.1], [s * 0.24, 0.42, -0.08], [-0.1, 0, -s * 0.25]);
    add(head, 'cone', dk, [0.09, 0.28, 0.06], [s * 0.245, 0.4, -0.04], [-0.1, 0, -s * 0.25]);
    add(head, 'cone', bl, [0.1, 0.34, 0.08], [s * 0.42, -0.08, 0.05], [0, 0, s * 1.9]);
    add(head, 'cone', dk, [0.08, 0.26, 0.07], [s * 0.4, -0.2, 0.08], [0, 0, s * 2.3]);
  });
  const tail = rig(new THREE.Group()); tail.position.set(0, 0.7, -0.6); B.add(tail);
  add(tail, 'sph', wh, [0.18, 0.18, 0.5], [0, 0.2, -0.25], [0.7, 0, 0]);
  add(tail, 'sph', bl, [0.17, 0.17, 0.2], [0, 0.5, -0.5], [0.7, 0, 0]);
  g.userData.parts = { head, tail };
  g.userData.anim = (t, mv) => {
    B.position.y = Math.abs(Math.sin(t * (mv ? 7 : 2))) * (mv ? 0.06 : 0.03);
    head.rotation.set(Math.sin(t * 1.9) * 0.05, Math.sin(t * 1.2) * 0.15, 0);
    tail.rotation.y = Math.sin(t * 3) * 0.35; tail.rotation.x = Math.sin(t * 2) * 0.08;
  };
  return g;
}

function earthGolem() {
  const g = rig(new THREE.Group()), B = rig(new THREE.Group()); g.add(B);
  const br = 0x8d6b3c, br2 = 0x6e5230, br3 = 0xa07c48, moss = 0x66a83c;
  const F = { flatShading: true };
  add(B, 'dod', br, [0.72, 0.62, 0.6], [0, 0.95, -0.02], [0.2, 0.3, 0], F);
  add(B, 'dod', br2, [0.55, 0.42, 0.5], [0, 0.5, 0], [0, 0.5, 0], F);
  add(B, 'dod', moss, [0.5, 0.17, 0.45], [0, 1.5, -0.1], [0.1, 0.5, 0], F);
  add(B, 'ico', moss, 0.12, [-0.3, 1.58, -0.05], [0, 0, 0], F); add(B, 'ico', moss, 0.09, [0.25, 1.6, -0.2], [0, 0, 0], F);
  for (let i = 0; i < 3; i++) add(B, 'cone7', br3, [0.12, 0.34, 0.12], [(i - 1) * 0.3, 1.45, -0.42], [-0.6, 0, 0], F);
  const head = rig(new THREE.Group()); head.position.set(0, 1.5, 0.2); B.add(head);
  add(head, 'dod', br3, [0.36, 0.3, 0.32], [0, 0, 0], [0.2, 0.4, 0], F);
  add(head, 'dod', br, [0.14, 0.1, 0.12], [0, -0.05, 0.3], [0, 0.4, 0], F);
  const arms = [];
  mirror((s) => {
    eye(head, s * 0.15, 0.04, 0.26, 0.09, 0x3a2a14, 0xfff1c0);
    add(head, 'box', br2, [0.2, 0.05, 0.05], [s * 0.15, 0.15, 0.3], [0, 0, -s * 0.35]);
    const a = rig(new THREE.Group()); a.position.set(s * 0.72, 1.28, 0.02); B.add(a);
    add(a, 'dod', br3, [0.32, 0.3, 0.3], [0, 0, 0], [0.3, 0.2, 0], F);
    add(a, 'dod', br, [0.2, 0.3, 0.2], [s * 0.1, -0.35, 0.05], [0.2, 0, 0.2], F);
    add(a, 'dod', br2, [0.34, 0.3, 0.32], [s * 0.1, -0.72, 0.16], [0.4, 0.6, 0], F);
    add(a, 'ico', moss, [0.2, 0.08, 0.2], [0, 0.26, 0], [0, 0, 0], F);
    a.userData.s = s; arms.push(a);
    add(g, 'dod', br, [0.27, 0.22, 0.32], [s * 0.34, 0.2, 0.05], [0, s * 0.5, 0], F);
    add(g, 'dod', br2, [0.2, 0.1, 0.12], [s * 0.34, 0.07, 0.32], [0, 0, 0], F);
  });
  g.userData.parts = { head, armL: arms[1], armR: arms[0] };
  g.userData.anim = (t, mv) => {
    B.position.y = Math.abs(Math.sin(t * (mv ? 3.2 : 1.4))) * (mv ? 0.07 : 0.025);
    B.scale.set(1, 1 + Math.sin(t * 1.4) * 0.02, 1);
    head.rotation.y = Math.sin(t * 0.9) * 0.15;
    arms.forEach((a) => { a.rotation.x = Math.sin(t * (mv ? 3.2 : 1.4) + (a.userData.s > 0 ? 0 : Math.PI)) * (mv ? 0.35 : 0.1); });
  };
  return g;
}

function electricFox() {
  const g = rig(new THREE.Group()), B = rig(new THREE.Group()); g.add(B);
  const ye = 0xffc72e, or = 0xf58a1f, cr = 0xfff1cf;
  add(B, 'sph', ye, [0.34, 0.33, 0.46], [0, 0.55, -0.02]);
  add(B, 'sph', cr, [0.24, 0.26, 0.28], [0, 0.5, 0.2]);
  mirror((s) => {
    add(g, 'sph', ye, [0.1, 0.27, 0.12], [s * 0.18, 0.28, 0.25]); add(g, 'sph', or, [0.11, 0.07, 0.15], [s * 0.18, 0.05, 0.28]);
    add(g, 'sph', ye, [0.11, 0.26, 0.12], [s * 0.2, 0.28, -0.3]); add(g, 'sph', or, [0.12, 0.07, 0.15], [s * 0.2, 0.05, -0.27]);
  });
  const head = rig(new THREE.Group()); head.position.set(0, 1.0, 0.36); B.add(head);
  add(head, 'sph', ye, [0.44, 0.34, 0.36]);
  add(head, 'sph', cr, [0.17, 0.13, 0.2], [0, -0.1, 0.32]);
  add(head, 'sph', 0x2b2f45, [0.05, 0.04, 0.04], [0, -0.04, 0.5]);
  add(head, boltShape(), or, [0.3, 0.3, 0.3], [0, 0.2, 0.33], [-0.35, 0, 0], { side: THREE.DoubleSide });
  mirror((s) => {
    eye(head, s * 0.17, 0.07, 0.28, 0.09, 0x23263a);
    add(head, 'cone', ye, [0.17, 0.7, 0.12], [s * 0.25, 0.55, -0.06], [-0.1, 0, -s * 0.28]);
    add(head, 'cone', or, [0.1, 0.28, 0.08], [s * 0.31, 0.78, -0.07], [-0.1, 0, -s * 0.28]);
    add(head, 'cone', cr, [0.08, 0.36, 0.05], [s * 0.24, 0.48, 0.0], [-0.1, 0, -s * 0.28]);
    add(head, 'cone', cr, [0.12, 0.3, 0.1], [s * 0.4, -0.09, 0.0], [0, 0, s * 1.8]);
    add(head, 'sph', 0xff8a7a, [0.05, 0.05, 0.02], [s * 0.26, -0.06, 0.32]);
  });
  const tail = rig(new THREE.Group()); tail.position.set(0, 0.55, -0.45); B.add(tail);
  add(tail, 'sph', ye, [0.24, 0.24, 0.4], [0, 0.04, -0.25], [0.3, 0, 0]);
  add(tail, 'sph', or, [0.25, 0.22, 0.3], [0, 0.16, -0.6], [0.4, 0, 0]);
  add(tail, 'sph', cr, [0.2, 0.2, 0.26], [0, 0.3, -0.88], [0.5, 0, 0]);
  g.userData.parts = { head, tail };
  g.userData.anim = (t, mv) => {
    B.position.y = Math.abs(Math.sin(t * (mv ? 8 : 2.4))) * (mv ? 0.08 : 0.03);
    head.rotation.set(Math.sin(t * 2.1) * 0.06, Math.sin(t * 1.3) * 0.15, Math.sin(t * 1.7) * 0.05);
    tail.rotation.y = Math.sin(t * 3.2) * 0.35; tail.rotation.z = Math.sin(t * 2.2) * 0.08;
  };
  return g;
}

function darkSpirit() {
  const g = rig(new THREE.Group()), B = rig(new THREE.Group()); g.add(B);
  const pu = 0x7b3fe4, lp = 0xa070ff, dp = 0x4d22a8;
  const E = { emissive: 0x3a1a90, emissiveIntensity: 0.5 };
  add(B, 'sph', pu, [0.55, 0.62, 0.5], [0, 0.7, 0], [0, 0, 0], E);
  add(B, 'sph', dp, [0.4, 0.22, 0.38], [0, 0.2, 0], [0, 0, 0], E);
  add(B, 'sph', lp, [0.34, 0.3, 0.2], [0, 0.55, 0.28], [0, 0, 0], E);
  const flames = rig(new THREE.Group()); flames.position.set(0, 1.2, 0); B.add(flames);
  [[0, 1.45, 0, 0.5, 0.2], [-0.22, 1.28, 0.02, 0.36, 0.14], [0.22, 1.3, -0.02, 0.4, 0.15], [0, 1.25, -0.2, 0.32, 0.13]].forEach(([x, y, z, h, r], i) => {
    add(flames, 'cone', i ? lp : 0xb88cff, [r, h, r], [x, y - 1.2, z], [0, 0, (i % 2 ? 1 : -1) * 0.12 * i], { emissive: 0x6a2fe0, emissiveIntensity: 0.9 });
  });
  mirror((s) => {
    eye(B, s * 0.2, 0.88, 0.4, 0.16, 0x2a1060);
    add(B, 'box', dp, [0.18, 0.04, 0.04], [s * 0.2, 1.1, 0.45], [0, 0, s * 0.3]);
    add(B, 'sph', pu, [0.11, 0.16, 0.11], [s * 0.55, 0.6, 0.12], [0, 0, -s * 0.5], E);
    add(g, 'sph', dp, [0.14, 0.1, 0.18], [s * 0.2, 0.08, 0.18]);
  });
  add(B, 'sph', 0x2a0f60, [0.1, 0.06, 0.04], [0, 0.6, 0.5]);
  const aura = new THREE.Mesh(G.sph, new THREE.MeshBasicMaterial({ color: lin(0xa070ff), transparent: true, opacity: 0.16, depthWrite: false }));
  aura.scale.set(0.95, 1.1, 0.9); aura.position.y = 0.85; B.add(aura);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), new THREE.MeshBasicMaterial({ color: lin(0x9a5cff), transparent: true, opacity: 0.35, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.03; g.add(glow);
  g.userData.parts = { head: null };
  g.userData.anim = (t, mv) => {
    B.position.y = 0.12 + Math.sin(t * 2.2) * 0.07 + (mv ? Math.abs(Math.sin(t * 5)) * 0.05 : 0);
    B.scale.set(1 + Math.sin(t * 2.6) * 0.025, 1 - Math.sin(t * 2.6) * 0.025, 1);
    const k = 1 + Math.sin(t * 7) * 0.14;
    flames.scale.set(2 - k, k, 2 - k);
    aura.material.opacity = 0.14 + Math.sin(t * 3) * 0.04; glow.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
  };
  return g;
}

const MAKERS = { fire_dragon: fireDragon, ice_wolf: iceWolf, earth_golem: earthGolem, electric_fox: electricFox, dark_spirit: darkSpirit };

// World height of each body matches the pre-port arena (4.49, 3.26, 5.83, 3.15, 2.49 units): old scaleUnits * 0.85 -> measured bounds, divided by the unit height of the new models.
export const MODEL_SCALE = { fire_dragon: 2.28, ice_wolf: 1.88, earth_golem: 3.22, electric_fox: 1.63, dark_spirit: 1.13 };
const HUE_SPREAD = { fire_dragon: 0.05, ice_wolf: 0.055, earth_golem: 0.035, electric_fox: 0.045, dark_spirit: 0.07 };

// Deterministic per-coin variation from a 32-bit hash: hue/saturation/lightness drift and body size.
export function variantFromHash(monsterId, h) {
  const u = (k) => { let x = Math.imul((h ^ (k * 0x9e3779b1)) >>> 0, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
  return {
    dh: (u(1) - 0.5) * 2 * (HUE_SPREAD[monsterId] || 0.05),
    ds: 0.9 + u(2) * 0.2,
    dl: 0.92 + u(3) * 0.17,
    size: 1 // pre-port arena had one fixed size per species, so no per-coin size jitter
  };
}

// The pre-port arena never grew monsters with level (level is text only). Kept as a hook, pinned to 1 to hold the old size.
const LEVEL_GROWTH = 0;
export const growthFactor = (level) => 1 + LEVEL_GROWTH * Math.min(8, Math.max(0, (level || 1) - 1));

const hsl = { h: 0, s: 0, l: 0 };
function variedColor(hex, v) {
  const c = new THREE.Color(hex);
  if (v) {
    c.getHSL(hsl);
    if (hsl.s > 0.3 && hsl.l > 0.25 && hsl.l < 0.9) c.setHSL((hsl.h + v.dh + 1) % 1, Math.min(1, hsl.s * v.ds), Math.min(0.95, hsl.l * v.dl));
  }
  return c.convertSRGBToLinear();
}

// Bake one rig node: its own meshes and every non-rig descendant group merge into per-bucket vertex-colour meshes.
function bake(node, tint, variant, flat, out) {
  const entries = [];
  const dead = [];
  const colorFn = (m) => variedColor(m.userData.hex, variant);
  const walk = (n, matrix) => {
    n.children.slice().forEach((c) => {
      c.updateMatrix();
      const m = new THREE.Matrix4().multiplyMatrices(matrix, c.matrix);
      if (c.isMesh) {
        if (c.userData.hex === undefined) return;
        entries.push({ mesh: c, geometry: bakedGeometry(c, m, colorFn) });
        dead.push(c);
      } else if (c.isObject3D && !c.userData.rig || flat) {
        if (c.children.length) { walk(c, m); dead.push(c); }
      } else if (c.userData.rig) {
        bake(c, tint, variant, flat, out);
      }
    });
  };
  walk(node, new THREE.Matrix4());
  dead.forEach((d) => d.parent && d.parent.remove(d));
  mergeBuckets(entries, tint).forEach((m) => { node.add(m); out.push(m); });
}

// -> { root, bodyRig, parts, baseRing, selectionRing, absorbAura, baseScale, anim, setTint }
export function createMonsterModel(monsterId, opts = {}) {
  const { tint = 0xffffff, variant = null, hi = false, flat = false, glowColor = 0xffffff } = opts;
  const model = withDetail(hi, () => (MAKERS[monsterId] || fireDragon)());
  const parts = { ...(model.userData.parts || {}) };
  const anim = flat ? () => {} : model.userData.anim;
  const baked = [];
  bake(model, tint, variant, flat, baked);

  const root = new THREE.Group();
  const bodyRig = new THREE.Group();
  root.add(bodyRig);
  bodyRig.add(model);

  const baseRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.08, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: lin(glowColor), side: THREE.DoubleSide, transparent: true, opacity: 0.5, depthWrite: false }));
  baseRing.position.y = 0.05;
  root.add(baseRing);

  const selectionRing = new THREE.Mesh(new THREE.RingGeometry(1.22, 1.48, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: lin(0xffd23f), side: THREE.DoubleSide, depthWrite: false }));
  selectionRing.position.y = 0.09;
  selectionRing.visible = false;
  root.add(selectionRing);

  const absorbAura = new THREE.Mesh(new THREE.SphereGeometry(1.25, 16, 12), new THREE.MeshBasicMaterial({ color: lin(0xffe27a), transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false }));
  absorbAura.position.y = 0.95;
  root.add(absorbAura);

  const setTint = (hex) => {
    baked.forEach((m) => {
      const [side, emissive, intensity] = m.userData.bucket.split('|');
      m.material = bucketMaterial(+side, emissive === '' ? undefined : +emissive, +intensity, hex);
    });
  };
  return { root, bodyRig, parts, baseRing, selectionRing, absorbAura, anim, setTint };
}

