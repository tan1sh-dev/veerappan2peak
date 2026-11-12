import * as THREE from 'three';
import { propMaterial } from './Props.js';
import { mergeStatic } from './merge.js';

// One surface definition drives both the rendered concrete and player/camera ground.
const surfaces = [
  { x0: -70, x1: 70, z0: -70, z1: 70, near: 3, far: 3 },
  { x0: 22, x1: 38, z0: 70, z1: 100, near: 3, far: 0 },
  { x0: -15, x1: 21, z0: -15, z1: 15, near: 11, far: 11 },
  { x0: 6, x1: 14, z0: 15, z1: 47, near: 11, far: 3 },
];
const surfaceHeight = (s, z) => THREE.MathUtils.lerp(s.near, s.far, (z - s.z0) / (s.z1 - s.z0));
export const LAUNCH_BOARD = { x: 16, y: 11, z: 9 };
export const launchGround = {
  height(x, z) {
    let h = 0;
    for (const s of surfaces) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) h = Math.max(h, surfaceHeight(s, z));
    return h;
  },
  slope(x, z) {
    const n = this.normal(x, z); return Math.acos(n[1]);
  },
  normal(x, z) {
    const d = 0.05;
    return new THREE.Vector3(this.height(x - d, z) - this.height(x + d, z), d * 2, this.height(x, z - d) - this.height(x, z + d)).normalize().toArray();
  },
  // No snapping through vertical concrete walls, including during a jump.
  canMove(x, z, nx, nz, feetY) {
    const rise = this.height(nx, nz) - Math.max(feetY, this.height(x, z));
    return rise <= Math.max(0.08, Math.hypot(nx - x, nz - z) * Math.tan(38 * Math.PI / 180) + 0.01);
  },
};

export function makeLaunchPlatform(colliders) {
  const root = new THREE.Group(); root.name = 'Solid launch pad and crew ramps';
  const box = (w, h, d, material, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), propMaterial(material));
    m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; root.add(m); return m;
  };
  const beam = (a, b, radius, material = 'alu') => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 8), propMaterial(material));
    m.position.copy(start).add(end).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); m.castShadow = true; root.add(m);
  };
  for (const s of surfaces) {
    // Closed wedge: bottom, both end walls, sides and the exact walkable top.
    const shape = new THREE.Shape();
    shape.moveTo(s.z0, 0); shape.lineTo(s.z1, 0); shape.lineTo(s.z1, s.far); shape.lineTo(s.z0, s.near); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: s.x1 - s.x0, bevelEnabled: false, steps: 1, curveSegments: 1 });
    geo.rotateY(-Math.PI / 2); geo.translate(s.x1, 0, 0);
    const mesh = new THREE.Mesh(geo, propMaterial('grey')); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
  }
  const rail = (x0, z0, x1, z1, y0, y1) => {
    const length = Math.hypot(x1 - x0, z1 - z0), count = Math.ceil(length / 2);
    for (let i = 0; i <= count; i++) {
      const t = i / count, x = THREE.MathUtils.lerp(x0, x1, t), z = THREE.MathUtils.lerp(z0, z1, t), y = THREE.MathUtils.lerp(y0, y1, t);
      beam([x, y, z], [x, y + 1.1, z], 0.045, 'orange');
    }
    const collisionCount = Math.ceil(length / 0.6);
    for (let i = 0; i <= collisionCount; i++) {
      const t = i / collisionCount;
      colliders.push({ x: THREE.MathUtils.lerp(x0, x1, t), z: THREE.MathUtils.lerp(z0, z1, t), r: 0.08, y: THREE.MathUtils.lerp(y0, y1, t), h: 1.15 });
    }
    for (const h of [0.5, 1.08]) beam([x0, y0 + h, z0], [x1, y1 + h, z1], 0.035, 'orange');
  };
  // Railings leave both ramp entrances and the elevator approach unobstructed.
  for (const x of [6.2, 13.8]) rail(x, 15, x, 47, 11, 3);
  for (const x of [22.2, 37.8]) rail(x, 70, x, 100, 3, 0);
  rail(-14.8, -14.8, -14.8, 14.8, 11, 11);
  rail(-14.8, -14.8, 20.8, -14.8, 11, 11);
  rail(20.8, -14.8, 20.8, 14.8, 11, 11);
  rail(-14.8, 14.8, 6, 14.8, 11, 11);
  rail(14, 14.8, 20.8, 14.8, 11, 11);
  // Concrete expansion joints, drainage channels and striped deck edge.
  for (let x = -60; x <= 60; x += 10) box(0.025, 0.012, 140, 'dark', x, 3.008, 0);
  for (let z = -60; z <= 60; z += 10) box(140, 0.012, 0.025, 'dark', 0, 3.008, z);
  for (const x of [-67, 67]) {
    box(0.65, 0.02, 132, 'dark', x, 3.02, 0);
    for (let z = -64; z <= 64; z += 2) box(0.7, 0.025, 0.09, 'alu', x, 3.035, z);
  }
  for (let x = -14; x < 21; x += 1) {
    if (x < 6 || x > 14) box(0.5, 0.018, 0.5, 'orange', x, 11.012, 14.4);
  }
  // Steel stiffeners and service panels break up the tall platform fascia.
  for (let x = -14; x < 21; x += 3) {
    box(0.16, 7.5, 0.18, 'dark', x, 7, -15.08);
    box(0.16, 7.5, 0.18, 'dark', x, 7, 15.08);
    if (x < 5 || x > 15) {
      box(1.8, 1.2, 0.12, 'white', x + 1.2, 5, 15.12);
      for (let y = 4.6; y <= 5.5; y += 0.18) box(1.4, 0.05, 0.05, 'dark', x + 1.2, y, 15.2);
    }
  }
  // Raised pipe rack on the far side of the pad, with valves and support saddles.
  for (let i = 0; i < 3; i++) {
    const z = -26 - i * 1.2;
    beam([-58, 4, z], [-20, 4, z], 0.18, i === 0 ? 'blue' : 'alu');
    beam([-20, 4, z], [-20, 8, z], 0.18);
    for (const x of [-55, -45, -35, -25]) box(0.3, 1, 0.8, 'dark', x, 3.5, z);
    const valve = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 8, 20), propMaterial('red')); valve.position.set(-32, 4.5, z); root.add(valve);
  }
  // Anti-slip ramp treads follow the slope; painted centerline guides the crew.
  for (const s of [surfaces[1], surfaces[3]]) for (let z = s.z0 + 0.5; z < s.z1; z += 1) {
    const m = box(s.x1 - s.x0 - 0.8, 0.016, 0.06, 'dark', (s.x0 + s.x1) / 2, surfaceHeight(s, z) + 0.015, z);
    m.rotation.x = -Math.atan2(s.far - s.near, s.z1 - s.z0);
  }
  // Lift lobby on the deck, facing the crew ramp.
  box(3, 3.5, 2, 'dark', 16, 12.75, 5.5);
  box(2.3, 2.8, 0.06, 'alu', 16, 12.4, 6.53);
  box(0.035, 2.8, 0.08, 'dark', 16, 12.4, 6.58);
  box(2.4, 0.12, 0.08, 'lightOn', 16, 14.05, 6.58);
  box(0.2, 0.35, 0.1, 'blue', 17.35, 12.4, 6.58);
  colliders.push({ x: 16, z: 5.5, r: 1.65, y: 11, h: 3.5 });
  return mergeStatic(root);
}
