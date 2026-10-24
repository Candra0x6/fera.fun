// One-off offscreen bust renders of the five monsters for HUD icons (leaderboard, feed, tray).
import * as THREE from 'three';
import { lin } from './kit.js';
import { createMonsterModel } from './monsters.js';

const HEAD_Y = { fire_dragon: 1.35, ice_wolf: 1.1, earth_golem: 1.35, electric_fox: 1.05, dark_spirit: 1.05 };

export function renderMonsterIcons(ids, size = 96) {
  const out = {};
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return out;
  }
  renderer.setSize(size, size);
  renderer.setPixelRatio(1);
  renderer.outputEncoding = THREE.sRGBEncoding;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, lin(0xb8e08c), 0.62));
  const dir = new THREE.DirectionalLight(0xffffff, 0.7);
  dir.position.set(2, 4, 5);
  scene.add(dir);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  ids.forEach((id) => {
    const model = createMonsterModel(id, { hi: true });
    model.anim(0.4, false);
    model.baseRing.visible = false;
    scene.add(model.root);
    const y = HEAD_Y[id] || 1.1;
    camera.position.set(0.55, y + 0.08, 3.0);
    camera.lookAt(0, y - 0.1, 0);
    renderer.render(scene, camera);
    out[id] = renderer.domElement.toDataURL('image/png');
    scene.remove(model.root);
  });
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
