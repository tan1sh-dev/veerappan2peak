import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeStatic } from './merge.js';

// Low-poly procedural models. Anything built here is a GAME MODEL (not a NASA 3D asset) and is labelled so in-game.
const M = {};
function mat(name) {
  if (M[name]) return M[name];
  const defs = {
    white: { color: 0xe8e8e2, roughness: 0.8 },
    suit: { color: 0xf1efe8, roughness: 0.9 },
    grey: { color: 0x8d9096, roughness: 0.7, metalness: 0.3 },
    dark: { color: 0x2a2d33, roughness: 0.6, metalness: 0.4 },
    black: { color: 0x111216, roughness: 0.5 },
    alu: { color: 0xb9bcc2, roughness: 0.35, metalness: 0.8 },
    gold: { color: 0xc89b3c, roughness: 0.3, metalness: 0.9 },
    foil: { color: 0xd8a640, roughness: 0.25, metalness: 1.0 },
    visor: { color: 0xb68329, roughness: 0.16, metalness: 0.65 },
    solar: { color: 0x1d2e5c, roughness: 0.25, metalness: 0.6, emissive: 0x050a1a },
    orange: { color: 0xd8612a, roughness: 0.7 },
    red: { color: 0xb3261e, roughness: 0.6 },
    blue: { color: 0x2456a6, roughness: 0.6 },
    tire: { color: 0x6b6b62, roughness: 0.9, metalness: 0.4 },
    glass: { color: 0x9fd2ff, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.35 },
    burnt: { color: 0x3b3029, roughness: 0.9 },
    heatshield: { color: 0x5a3b28, roughness: 0.95 },
    chute: { color: 0xe9e2d0, roughness: 0.9, side: THREE.DoubleSide },
    lightOn: { color: 0x9ff5ff, emissive: 0x6ff0ff, emissiveIntensity: 2 },
    lightRed: { color: 0xff5050, emissive: 0xff2020, emissiveIntensity: 2 },
    hab: { color: 0xdedbd2, roughness: 0.85 },
  };
  M[name] = new THREE.MeshStandardMaterial(defs[name] || { color: 0xff00ff });
  return M[name];
}
export { mat as propMaterial };

function box(w, h, d, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(m)); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; }
function cyl(rt, rb, h, m, x = 0, y = 0, z = 0, seg = 12) { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(m)); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; }
function sph(r, m, x = 0, y = 0, z = 0, ws = 12, hs = 8) { const o = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat(m)); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; }
function group(...kids) { const g = new THREE.Group(); kids.forEach(k => g.add(k)); return g; }

// ---------------- Astronaut (animated limbs) ----------------
export function makeAstronaut({ accent = 'red', scale = 1 } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const rounded = (w, h, d, material, x, y, z, radius = 0.04) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, radius), mat(material));
    m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m;
  };
  const torso = rounded(0.5, 0.62, 0.35, 'suit', 0, 1.2, 0, 0.09); body.add(torso);
  body.add(rounded(0.44, 0.6, 0.25, 'white', 0, 1.24, 0.27)); // PLSS backpack
  body.add(box(0.3, 0.18, 0.06, 'grey', 0, 1.25, -0.18));  // chest control unit
  body.add(box(0.52, 0.06, 0.34, accent, 0, 1.0, 0));      // waist ring stripe
  const head = new THREE.Group(); head.position.set(0, 1.62, 0); body.add(head);
  head.add(sph(0.215, 'suit', 0, 0, 0, 32, 20));
  const rim = sph(0.189, 'dark', 0, -0.01, -0.075, 32, 20); rim.scale.set(1, 0.87, 0.8); head.add(rim);
  const visor = sph(0.174, 'visor', 0, -0.01, -0.097, 32, 20); visor.scale.set(1, 0.85, 0.8); head.add(visor);
  head.add(rounded(0.27, 0.025, 0.055, 'white', 0, 0.135, -0.16, 0.01));
  body.add(cyl(0.156, 0.17, 0.055, 'alu', 0, 1.47, 0, 24));
  for (const x of [-0.205, 0.205]) {
    head.add(rounded(0.05, 0.09, 0.095, 'grey', x, 0.01, 0));
    head.add(box(0.035, 0.025, 0.025, 'lightOn', x, 0.05, -0.055));
    body.add(rounded(0.035, 0.43, 0.03, 'grey', x * 0.82, 1.23, -0.176, 0.01));
  }
  const limb = (w, h, m) => {
    const g = new THREE.Group();
    g.add(rounded(w, h * 0.49, w * 1.08, m, 0, -h * 0.245, 0, w * 0.35));
    g.add(rounded(w * 0.88, h * 0.47, w, m, 0, -h * 0.765, 0, w * 0.3));
    for (let i = -1; i <= 1; i++) g.add(cyl(w * 0.49, w * 0.49, 0.018, 'grey', 0, -h * 0.5 + i * 0.022, 0, 16));
    g.add(cyl(w * 0.52, w * 0.52, 0.045, accent, 0, -h * 0.22, 0, 20));
    return g;
  };
  const armL = limb(0.15, 0.62, 'suit'); armL.position.set(-0.33, 1.47, 0); body.add(armL);
  const armR = limb(0.15, 0.62, 'suit'); armR.position.set(0.33, 1.47, 0); body.add(armR);
  armL.add(box(0.16, 0.12, 0.16, 'grey', 0, -0.66, 0)); armR.add(box(0.16, 0.12, 0.16, 'grey', 0, -0.66, 0));
  const legL = limb(0.19, 0.86, 'suit'); legL.position.set(-0.13, 0.9, 0); body.add(legL);
  const legR = limb(0.19, 0.86, 'suit'); legR.position.set(0.13, 0.9, 0); body.add(legR);
  legL.add(box(0.22, 0.12, 0.32, 'grey', 0, -0.86, -0.04)); legR.add(box(0.22, 0.12, 0.32, 'grey', 0, -0.86, -0.04));
  armR.add(box(0.06, 0.06, 0.1, accent, 0, -0.3, -0.08));
  for (const arm of [armL, armR]) {
    arm.add(rounded(0.14, 0.15, 0.16, 'suit', 0, -0.68, -0.015));
    arm.add(sph(0.042, 'grey', 0.075, -0.67, -0.03));
    arm.add(box(0.085, 0.09, 0.025, 'blue', 0, -0.18, -0.085));
  }
  for (const leg of [legL, legR]) {
    leg.add(rounded(0.14, 0.13, 0.05, 'white', 0, -0.43, -0.095));
    leg.add(rounded(0.22, 0.17, 0.31, 'suit', 0, -0.8, -0.045));
    for (let i = 0; i < 4; i++) leg.add(box(0.225, 0.025, 0.025, 'dark', 0, -0.9, -0.16 + i * 0.07));
  }
  body.add(box(0.18, 0.065, 0.012, 'blue', -0.045, 1.28, -0.216));
  for (let i = 0; i < 3; i++) body.add(box(0.025, 0.025, 0.015, i === 0 ? 'lightOn' : 'orange', -0.09 + i * 0.065, 1.215, -0.22));
  for (const x of [-0.15, 0.15]) {
    body.add(cyl(0.045, 0.045, 0.028, 'alu', x, 1.07, -0.19, 16).rotateX(Math.PI / 2));
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x, 1.07, -0.21), new THREE.Vector3(x * 1.8, 0.96, -0.2), new THREE.Vector3(x * 2, 1.02, 0.18), new THREE.Vector3(x, 1.13, 0.36)]);
    body.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.018, 8, false), mat('dark')));
    body.add(box(0.035, 0.48, 0.02, accent, x, 1.24, 0.405));
  }
  for (let i = 0; i < 6; i++) body.add(box(0.2, 0.015, 0.015, 'dark', 0, 1.13 + i * 0.035, 0.405));
  // Merge within each animated part; retain the existing animation pivots.
  for (const part of [head, armL, armR, legL, legR]) { mergeStatic(part); part.userData.keep = true; }
  mergeStatic(body);
  root.scale.setScalar(scale);
  root.userData.rig = { body, head, armL, armR, legL, legR, phase: 0 };
  return root;
}

/** Simple procedural walk cycle. speed in m/s, airborne flag gives a "floaty" pose. */
export function animateAstronaut(model, dt, speed, airborne, lowG = true) {
  const r = model.userData.rig; if (!r) return;
  const rate = lowG ? 4.5 : 7.5;
  r.phase += dt * rate * Math.min(speed, 6) / 2;
  const amp = Math.min(speed / 3, 1) * (lowG ? 0.55 : 0.7);
  const s = Math.sin(r.phase);
  if (airborne) {
    r.legL.rotation.x = THREE.MathUtils.lerp(r.legL.rotation.x, 0.35, 0.1); r.legR.rotation.x = THREE.MathUtils.lerp(r.legR.rotation.x, -0.2, 0.1);
    r.armL.rotation.x = THREE.MathUtils.lerp(r.armL.rotation.x, -0.4, 0.1); r.armR.rotation.x = THREE.MathUtils.lerp(r.armR.rotation.x, -0.4, 0.1);
  } else {
    r.legL.rotation.x = s * amp; r.legR.rotation.x = -s * amp;
    r.armL.rotation.x = -s * amp * 0.7; r.armR.rotation.x = s * amp * 0.7;
  }
  r.body.position.y = airborne ? 0 : Math.abs(Math.cos(r.phase)) * amp * 0.06;
  r.body.rotation.x = -Math.min(speed / 10, 0.15);
}

// ---------------- Lunar Roving Vehicle (game model, Apollo LRV-inspired) ----------------
export function makeLRV({ dusty = false } = {}) {
  const g = new THREE.Group();
  g.add(box(1.9, 0.08, 2.9, 'alu', 0, 0.55, 0));
  g.add(box(1.6, 0.25, 0.6, 'grey', 0, 0.7, 1.1));   // aft pallet
  g.add(box(1.6, 0.2, 0.5, 'grey', 0, 0.68, -1.2));  // forward chassis
  for (const x of [-0.45, 0.45]) { g.add(box(0.55, 0.06, 0.5, 'dark', x, 0.85, 0.1)); g.add(box(0.55, 0.5, 0.06, 'dark', x, 1.08, 0.36)); }
  g.add(box(0.3, 0.35, 0.12, 'grey', 0, 1.0, -0.4));  // control console
  const ant = cyl(0.02, 0.02, 1.2, 'alu', -0.6, 1.3, -1.1); g.add(ant);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 6, 0, Math.PI * 2, 0, 0.6), mat('alu'));
  dish.position.set(-0.6, 1.95, -1.1); dish.rotation.x = -0.6; dish.castShadow = true; g.add(dish);
  g.add(box(0.3, 0.3, 0.3, 'grey', 0.6, 1.0, -1.15)); // TV camera
  const wheels = [];
  for (const [x, z] of [[-1.0, -1.15], [1.0, -1.15], [-1.0, 1.15], [1.0, 1.15]]) {
    const w = new THREE.Group();
    const t = cyl(0.41, 0.41, 0.23, dusty ? 'grey' : 'tire', 0, 0, 0, 14); t.rotation.z = Math.PI / 2; w.add(t);
    const hub = cyl(0.15, 0.15, 0.25, 'dark', 0, 0, 0, 8); hub.rotation.z = Math.PI / 2; w.add(hub);
    w.position.set(x, 0.41, z); g.add(w); wheels.push(w);
    g.add(box(0.45, 0.04, 0.8, 'foil', x, 0.86, z)); // fender
  }
  g.userData.wheels = wheels;
  return g;
}

// ---------------- Pressurised Mars rover (game model) ----------------
export function makeMarsRover() {
  const g = new THREE.Group();
  g.add(box(2.4, 0.3, 4.2, 'grey', 0, 0.75, 0));
  const cab = box(2.2, 1.5, 2.6, 'hab', 0, 1.65, 0.3); g.add(cab);
  const win = box(2.0, 0.6, 0.05, 'glass', 0, 1.9, -1.0); g.add(win);
  g.add(box(2.2, 0.9, 1.0, 'hab', 0, 1.35, -1.4));
  g.add(box(2.0, 0.08, 1.4, 'solar', 0, 2.45, 0.6));
  g.add(box(0.6, 0.2, 0.05, 'lightOn', -0.7, 1.15, -1.92)); g.add(box(0.6, 0.2, 0.05, 'lightOn', 0.7, 1.15, -1.92));
  g.add(box(0.2, 0.2, 0.05, 'orange', 0, 2.2, 1.62));
  const wheels = [];
  for (const z of [-1.5, 0, 1.5]) for (const x of [-1.35, 1.35]) {
    const w = new THREE.Group();
    const t = cyl(0.5, 0.5, 0.4, 'tire', 0, 0, 0, 14); t.rotation.z = Math.PI / 2; w.add(t);
    w.position.set(x, 0.5, z); g.add(w); wheels.push(w);
  }
  g.userData.wheels = wheels;
  return g;
}

// ---------------- ALSEP (Apollo Lunar Surface Experiments Package) ----------------
export function makeALSEP() {
  const g = new THREE.Group();
  // central station with sunshield
  g.add(box(0.7, 0.35, 0.45, 'foil', 0, 0.25, 0));
  g.add(box(0.75, 0.04, 0.55, 'white', 0, 0.75, 0));
  for (const x of [-0.33, 0.33]) for (const z of [-0.24, 0.24]) g.add(cyl(0.015, 0.015, 0.4, 'alu', x, 0.55, z, 6));
  const ant = cyl(0.03, 0.03, 0.9, 'alu', 0.2, 1.1, 0, 6); ant.rotation.z = 0.4; g.add(ant);
  // RTG
  const rtg = cyl(0.2, 0.2, 0.45, 'dark', -2.6, 0.45, 1.0, 10); g.add(rtg);
  for (let i = 0; i < 8; i++) { const f = box(0.02, 0.45, 0.32, 'dark', -2.6 + Math.cos(i / 8 * Math.PI * 2) * 0.2, 0.45, 1.0 + Math.sin(i / 8 * Math.PI * 2) * 0.2); f.rotation.y = -i / 8 * Math.PI * 2; g.add(f); }
  // passive seismometer (silver dome on a skirt)
  const pse = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.3, 12), mat('alu')); pse.position.set(3.2, 0.15, -1.5); g.add(pse);
  g.add(new THREE.Mesh(new THREE.CircleGeometry(0.75, 16), mat('foil')).rotateX(-Math.PI / 2).translateZ(0.01).translateX(3.2).translateY(1.5));
  // magnetometer arms
  g.add(box(0.15, 0.25, 0.15, 'grey', 1.5, 0.25, 3)); for (const a of [0, 2.1, 4.2]) { const arm = box(1.0, 0.04, 0.04, 'alu', 1.5 + Math.cos(a) * 0.5, 0.45, 3 + Math.sin(a) * 0.5); arm.rotation.y = -a; g.add(arm); }
  // cables
  const cable = (x2, z2) => { const len = Math.hypot(x2, z2); const c = box(0.02, 0.01, len, 'dark', x2 / 2, 0.02, z2 / 2); c.rotation.y = Math.atan2(x2, z2); g.add(c); };
  cable(-2.6, 1.0); cable(3.2, -1.5); cable(1.5, 3);
  return g;
}

export function makeRetroreflector() {
  const g = new THREE.Group();
  const panel = box(1.05, 0.08, 0.65, 'alu', 0, 0.45, 0); panel.rotation.x = -0.45; g.add(panel);
  for (let i = 0; i < 12; i++) for (let j = 0; j < 6; j++) {
    const c = new THREE.Mesh(new THREE.CircleGeometry(0.035, 8), mat('black'));
    c.position.set(-0.45 + i * 0.082, 0.495 + (j - 2.5) * 0.04 * Math.sin(0.45), (j - 2.5) * 0.085 * Math.cos(0.45));
    c.rotation.x = -Math.PI / 2 - 0.45 + Math.PI / 2 - Math.PI / 2; g.add(c);
  }
  g.add(cyl(0.03, 0.03, 0.4, 'alu', -0.4, 0.2, 0.2, 6)); g.add(cyl(0.03, 0.03, 0.4, 'alu', 0.4, 0.2, 0.2, 6));
  return g;
}

export function makeFlag(colors = ['#ffffff']) {
  const g = new THREE.Group();
  g.add(cyl(0.02, 0.02, 2.2, 'alu', 0, 1.1, 0, 6));
  g.add(cyl(0.012, 0.012, 1.0, 'alu', 0.5, 2.1, 0, 6).rotateZ(Math.PI / 2));
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 80; const c = cv.getContext('2d');
  c.fillStyle = '#e8e8e8'; c.fillRect(0, 0, 128, 80);
  c.fillStyle = '#0b3d91'; c.fillRect(0, 0, 128, 18); c.fillRect(0, 62, 128, 18);
  c.fillStyle = '#0b3d91'; c.font = 'bold 22px sans-serif'; c.textAlign = 'center'; c.fillText('VEERAPPAN', 64, 48);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const f = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.62), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.9 }));
  f.position.set(0.5, 1.78, 0); f.castShadow = true; g.add(f);
  return g;
}

// ---------------- Discarded / fictional mission debris (game models) ----------------
export function makeBrokenSolarArray() {
  const g = new THREE.Group();
  g.add(box(0.3, 1.2, 0.3, 'grey', 0, 0.6, 0));
  const p1 = box(2.4, 0.05, 1.2, 'solar', -1.2, 1.1, 0); p1.rotation.z = 0.25; g.add(p1);
  const p2 = box(2.0, 0.05, 1.2, 'solar', 1.4, 0.25, 0.3); p2.rotation.set(0.1, 0.4, -0.35); g.add(p2);
  g.add(box(2.5, 0.08, 0.08, 'alu', 0, 1.15, 0.62));
  return g;
}
export function makeCommsDish() {
  const g = new THREE.Group();
  g.add(cyl(0.12, 0.2, 1.4, 'grey', 0, 0.7, 0));
  const d = new THREE.Mesh(new THREE.SphereGeometry(1.3, 20, 8, 0, Math.PI * 2, 0, 0.75), mat('white'));
  d.position.set(0, 1.9, 0); d.rotation.set(-1.1, 0, 0.3); d.castShadow = true; d.material.side = THREE.DoubleSide; g.add(d);
  g.add(cyl(0.02, 0.02, 1.0, 'alu', 0, 2.2, -0.4).rotateX(-0.6));
  return g;
}
export function makeCargoPallet() {
  const g = new THREE.Group();
  g.add(box(2.2, 0.12, 1.6, 'alu', 0, 0.06, 0));
  g.add(box(0.8, 0.6, 0.6, 'white', -0.5, 0.42, -0.3)); g.add(box(0.7, 0.5, 0.7, 'orange', 0.55, 0.37, 0.2));
  const tipped = box(0.6, 0.5, 0.5, 'white', 1.6, 0.25, -0.8); tipped.rotation.z = 1.2; g.add(tipped);
  for (const x of [-1.1, 1.1]) g.add(cyl(0.02, 0.02, 0.6, 'alu', x, 0.4, -0.8, 6));
  return g;
}
export function makeFuelTank() { const g = new THREE.Group(); const t = cyl(0.55, 0.55, 2.0, 'white', 0, 0.55, 0, 16); t.rotation.z = Math.PI / 2; g.add(t); g.add(sph(0.55, 'white', 1.0, 0.55, 0)); g.add(sph(0.55, 'white', -1.0, 0.55, 0)); g.add(box(0.2, 0.1, 0.2, 'gold', 0, 1.1, 0)); return g; }
export function makeRoboticArm() {
  const g = new THREE.Group();
  g.add(box(0.6, 0.3, 0.6, 'dark', 0, 0.15, 0));
  const s1 = box(0.15, 1.2, 0.15, 'white', 0.3, 0.6, 0); s1.rotation.z = -0.9; g.add(s1);
  const s2 = box(0.12, 1.0, 0.12, 'white', 1.0, 0.35, 0.2); s2.rotation.z = 1.2; g.add(s2);
  g.add(box(0.25, 0.25, 0.25, 'grey', 1.4, 0.12, 0.25));
  return g;
}
export function makeLanderLeg() {
  const g = new THREE.Group();
  const strut = cyl(0.08, 0.08, 2.4, 'foil', 0, 0.35, 0, 8); strut.rotation.z = 1.35; g.add(strut);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 14), mat('alu')).translateX(1.2).translateY(0.08));
  g.add(cyl(0.04, 0.04, 1.4, 'alu', -0.4, 0.3, 0.3, 6).rotateX(1.1));
  return g;
}
export function makeInstrumentBox() { const g = new THREE.Group(); g.add(box(0.6, 0.4, 0.45, 'foil', 0, 0.2, 0)); g.add(cyl(0.02, 0.02, 0.7, 'alu', 0.2, 0.6, 0, 6)); g.add(box(0.3, 0.02, 0.3, 'solar', -0.1, 0.42, 0)); return g; }
export function makeAntennaMast() { const g = new THREE.Group(); const m = cyl(0.04, 0.06, 3.2, 'alu', 0, 1.6, 0, 6); m.rotation.z = 0.35; g.add(m); g.add(box(0.5, 0.05, 0.05, 'alu', 0.55, 3.0, 0)); g.add(box(0.4, 0.3, 0.3, 'grey', 0, 0.15, 0)); return g; }

// ---------------- Mars EDL hardware (game models of real MSL components) ----------------
export function makeHeatShield() { const g = new THREE.Group(); const s = new THREE.Mesh(new THREE.ConeGeometry(2.25, 0.7, 24, 1, true), mat('heatshield')); s.position.y = 0.35; s.rotation.x = Math.PI; s.rotation.z = 0.25; s.castShadow = true; s.material.side = THREE.DoubleSide; g.add(s); return g; }
export function makeBackshell() {
  const g = new THREE.Group();
  const s = new THREE.Mesh(new THREE.ConeGeometry(2.25, 2.2, 24, 1, true), mat('white')); s.material.side = THREE.DoubleSide; s.rotation.z = 1.4; s.position.y = 1.1; s.castShadow = true; g.add(s);
  const chute = new THREE.Mesh(new THREE.PlaneGeometry(9, 7, 6, 4), mat('chute'));
  chute.rotation.x = -Math.PI / 2 + 0.05; chute.position.set(-7, 0.05, 2); chute.receiveShadow = true;
  const p = chute.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 0.9) * 0.15);
  g.add(chute);
  return g;
}
export function makeDescentStageWreck() {
  const g = new THREE.Group();
  const frame = box(2.6, 0.5, 2.2, 'burnt', 0, 0.3, 0); frame.rotation.set(0.25, 0.4, -0.3); g.add(frame);
  for (const [x, z] of [[-1.2, -1], [1.2, -0.8], [1.0, 1.1], [-1.1, 1.0]]) { const e = cyl(0.12, 0.25, 0.45, 'dark', x, 0.4, z, 8); e.rotation.set(0.6, 0, 0.4); g.add(e); }
  for (let i = 0; i < 6; i++) { const d = box(0.4 + Math.random() * 0.6, 0.05, 0.3, 'burnt', (Math.random() - 0.5) * 8, 0.03, (Math.random() - 0.5) * 8); d.rotation.y = Math.random() * 3; g.add(d); }
  const crater = new THREE.Mesh(new THREE.RingGeometry(1.6, 3.4, 20), new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 1, transparent: true, opacity: 0.5, depthWrite: false }));
  crater.rotation.x = -Math.PI / 2; crater.position.y = 0.04; g.add(crater);
  return g;
}

// ---------------- Our spacecraft: VX-1 crew lander (game model) ----------------
export function makeLander() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  body.add(cyl(1.5, 1.7, 1.6, 'foil', 0, 2.0, 0, 8));
  body.add(cyl(1.3, 1.5, 2.0, 'white', 0, 3.8, 0, 8));
  body.add(cyl(0.6, 1.3, 0.8, 'white', 0, 5.2, 0, 8));
  body.add(box(0.9, 1.4, 0.1, 'dark', 0, 2.9, -1.36)); // hatch
  body.add(box(0.6, 0.35, 0.08, 'glass', 0, 4.2, -1.25));
  body.add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.75, 1.0, 12, 1, true), mat('dark')).translateY(0.85));
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + Math.PI / 4;
    const leg = cyl(0.06, 0.06, 2.6, 'alu', Math.cos(a) * 2.1, 1.0, Math.sin(a) * 2.1, 6);
    leg.lookAt(Math.cos(a) * 1.2, 2.8, Math.sin(a) * 1.2); leg.rotateX(Math.PI / 2); body.add(leg);
    body.add(cyl(0.35, 0.35, 0.06, 'alu', Math.cos(a) * 2.6, 0.03, Math.sin(a) * 2.6, 10));
    body.add(box(0.25, 0.25, 0.25, 'grey', Math.cos(a) * 1.35, 4.3, Math.sin(a) * 1.35)); // RCS quads
  }
  const ladder = box(0.5, 2.0, 0.05, 'alu', 0, 1.2, -1.95); ladder.rotation.x = 0.3; body.add(ladder);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.6, 4, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.rotation.x = Math.PI; flame.position.y = -1.6; flame.visible = false; g.add(flame);
  g.userData.flame = flame;
  return g;
}

// ---------------- Station modules (game models) ----------------
export function makeModule(type) {
  const g = new THREE.Group();
  if (type === 'habitat') {
    const h = cyl(2.4, 2.4, 6, 'hab', 0, 2.6, 0, 16); h.rotation.z = Math.PI / 2; g.add(h);
    g.add(sph(2.4, 'hab', 3, 2.6, 0, 16, 10)); g.add(sph(2.4, 'hab', -3, 2.6, 0, 16, 10));
    for (const x of [-2.5, 2.5]) for (const z of [-1.6, 1.6]) g.add(box(0.3, 1.0, 0.3, 'grey', x, 0.5, z));
    g.add(box(1.2, 1.8, 0.3, 'dark', 0, 2.2, -2.45)); g.add(box(0.8, 0.12, 0.1, 'lightOn', 0, 3.3, -2.5));
    g.add(box(6.5, 0.12, 0.12, 'blue', 0, 4.4, -1.6));
  } else if (type === 'solar') {
    for (const x of [-3, 0, 3]) {
      g.add(cyl(0.08, 0.1, 1.6, 'alu', x, 0.8, 0, 6));
      const p = box(2.6, 0.05, 1.8, 'solar', x, 1.7, 0); p.rotation.x = -0.6; g.add(p);
    }
  } else if (type === 'comms') {
    g.add(cyl(0.15, 0.3, 6, 'alu', 0, 3, 0, 8));
    const d = new THREE.Mesh(new THREE.SphereGeometry(1.4, 20, 8, 0, Math.PI * 2, 0, 0.7), mat('white')); d.material.side = THREE.DoubleSide;
    d.position.set(0, 6.2, 0); d.rotation.x = -0.9; g.add(d);
    g.add(box(0.15, 0.15, 0.15, 'lightRed', 0, 6.1, 0));
    g.add(box(1.4, 1.0, 1.4, 'grey', 0, 0.5, 0));
  } else if (type === 'lab') {
    g.add(box(5, 3, 4, 'hab', 0, 1.8, 0)); g.add(new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('glass')).translateY(3.3));
    g.add(box(4.6, 0.12, 0.1, 'orange', 0, 2.9, -2.05)); g.add(box(1.0, 1.8, 0.2, 'dark', 1.5, 1.2, -2.05));
    for (const x of [-2.2, 2.2]) for (const z of [-1.7, 1.7]) g.add(box(0.3, 0.6, 0.3, 'grey', x, 0.3, z));
  } else if (type === 'roverbay') {
    g.add(box(7, 0.2, 6, 'grey', 0, 0.1, 0));
    for (const x of [-3.4, 3.4]) g.add(box(0.2, 3.4, 6, 'hab', x, 1.8, 0));
    g.add(box(7, 0.2, 6, 'hab', 0, 3.5, 0)); g.add(box(6.6, 0.08, 0.1, 'lightOn', 0, 3.3, -3));
  } else if (type === 'isru') {
    g.add(cyl(1.2, 1.2, 2.6, 'white', 0, 1.3, 0, 14)); g.add(cyl(0.7, 0.7, 2.0, 'grey', 2.0, 1.0, 0, 12));
    g.add(box(1.6, 0.4, 0.4, 'alu', 1.0, 2.1, 0)); g.add(box(2, 0.6, 1.2, 'orange', -1.6, 0.3, 1.2));
  } else if (type === 'greenhouse') {
    const d = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('glass')); g.add(d);
    for (let i = 0; i < 6; i++) g.add(box(0.5, 0.4, 3.5, 'dark', -2 + i * 0.8, 0.2, 0));
    const leaves = new THREE.MeshStandardMaterial({ color: 0x3f9e4a, roughness: 0.8 });
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 4), leaves); s.position.set(-2 + i * 0.8, 0.55, -1.2 + j * 0.8); g.add(s); }
    g.add(new THREE.PointLight(0xff66cc, 2, 6).translateY(2));
  } else if (type === 'pad') {
    g.add(cyl(5, 5, 0.15, 'grey', 0, 0.07, 0, 24));
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.6, 32), mat('orange')); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.16; g.add(ring);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/** Ground marker ring (shows build sites and mission targets). */
export function makeMarkerRing(radius = 3, color = 0x4fd1ff) {
  const m = new THREE.Mesh(new THREE.RingGeometry(radius * 0.88, radius, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 2;
  return m;
}

/** Floating beacon (vertical light beam) for objectives. */
export function makeBeacon(color = 0x4fd1ff, height = 40) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, height, 8, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.position.y = height / 2; m.renderOrder = 3;
  const g = new THREE.Group(); g.add(m); return g;
}

// ---------------- Earth launch site (game model, inspired by a launch complex) ----------------
export function makeLaunchTower(height = 120) {
  const g = new THREE.Group();
  // The solid foundation and walkable deck are supplied by LaunchPlatform.
  const tower = new THREE.Group(); tower.position.set(16, 8, 0); g.add(tower);
  for (let y = 0; y < height; y += 6) {
    tower.add(box(8, 0.4, 8, 'red', 0, y, 0));
    for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) tower.add(box(0.5, 6, 0.5, 'red', x, y + 3, z));
    for (const z of [-4, 4]) {
      for (const sign of [-1, 1]) {
        const brace = box(0.18, 10, 0.18, 'red', 0, y + 3, z);
        brace.rotation.z = sign * Math.atan2(8, 6); tower.add(brace);
      }
      tower.add(box(8, 0.08, 0.08, 'orange', 0, y + 1.1, z));
    }
    tower.add(box(1.3, 6, 1.3, 'grey', 0, y + 3, 0));
  }
  // crew access arm
  const arm = box(10, 2.5, 2.5, 'grey', -8, 0, 0); arm.position.y = height * 0.82; tower.add(arm);
  g.userData.armHeight = 8 + height * 0.82;
  g.add(box(4, 3, 4, 'dark', 16, 9.5, -7)); // elevator house
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
