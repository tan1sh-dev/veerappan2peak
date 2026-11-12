import * as THREE from 'three';
import { propMaterial, makeCargoPallet, makeFuelTank, makeCommsDish } from './Props.js';
import { mergeStatic } from './merge.js';

// Decorative structures are batched by material; the route to mission targets stays open.
export function makeLaunchSurroundings(colliders) {
  const root = new THREE.Group(); root.name = 'Launch complex surroundings';
  const box = (w, h, d, material, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), propMaterial(material));
    m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; root.add(m); return m;
  };
  const cylinder = (r, h, material, x, y, z) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), propMaterial(material));
    m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; root.add(m); return m;
  };
  // Crew apron, service road, pedestrian lane and painted crossing.
  box(65, 0.08, 52, 'grey', 38, 0.04, 143);
  box(14, 0.09, 460, 'dark', 65, 0.045, 170);
  box(5, 0.1, 112, 'grey', 30, 0.05, 77);
  for (let z = 25; z < 128; z += 6) box(0.15, 0.015, 3, 'white', 28, 0.11, z);
  for (let z = -50; z < 390; z += 12) box(0.16, 0.015, 5, 'white', 65, 0.1, z);
  for (let x = 59; x < 72; x += 2) box(1, 0.015, 4, 'white', x, 0.11, 147);
  for (let z = 125; z <= 165; z += 8) box(12, 0.015, 0.12, 'white', 47, 0.09, z);
  // Low service buildings with roof equipment, ribbed cladding and glazed control rooms.
  for (const [x, z, w, d, h] of [[99, 141, 30, 28, 7], [-83, 120, 38, 24, 10], [110, -64, 30, 36, 12], [-150, 320, 85, 65, 48]]) {
    box(w + 4, 0.2, d + 4, 'grey', x, 0.1, z);
    box(w, h, d, 'white', x, h / 2, z);
    box(w + 0.4, 0.4, d + 0.4, 'dark', x, h, z);
    box(w + 0.15, 0.65, d + 0.15, 'blue', x, h * 0.7, z);
    for (let dx = -w / 2 + 3; dx < w / 2; dx += 4) {
      box(2.6, 1.6, 0.08, 'solar', x + dx, h * 0.55, z + d / 2 + 0.05);
      box(0.12, h, 0.15, 'grey', x + dx, h / 2, z + d / 2 + 0.04);
    }
    box(4, 3, 0.12, 'dark', x, 1.5, z + d / 2 + 0.12);
    for (const dx of [-w / 4, w / 4]) box(3, 1.2, 4, 'grey', x + dx, h + 0.8, z);
    // Approximate rectangular walls with a chain of existing circular colliders.
    for (let dx = -w / 2 + 2; dx <= w / 2 - 2; dx += 4) for (let dz = -d / 2 + 2; dz <= d / 2 - 2; dz += 4) colliders.push({ x: x + dx, z: z + dz, r: 2.9 });
  }
  // Propellant farm, pipe racks and warning-striped crash barriers.
  for (const z of [-55, -30, -5]) {
    cylinder(6, 14, 'white', -96, 7, z);
    cylinder(6.1, 0.7, 'blue', -96, 11, z);
    cylinder(6.3, 0.3, 'alu', -96, 14, z);
    colliders.push({ x: -96, z, r: 6.5 });
    box(36, 0.35, 0.35, 'alu', -72, 1.5, z);
    for (const x of [-84, -72, -60]) box(0.3, 1.5, 1.4, 'grey', x, 0.75, z);
  }
  for (const x of [-50, 52]) for (let z = 82; z < 115; z += 12) {
    box(1, 0.85, 7, 'white', x, 0.425, z);
    for (let dz = -2.5; dz < 3; dz += 1.5) box(1.02, 0.3, 0.6, 'orange', x, 0.6, z + dz);
    colliders.push({ x, z, r: 1 });
  }
  // Perimeter posts, rails and floodlight masts frame the complex without blocking the entrance.
  for (const x of [-125, 135]) for (let z = -130; z < 280; z += 10) {
    cylinder(0.065, 2.6, 'alu', x, 1.3, z);
    box(0.045, 0.045, 10, 'alu', x, 0.5, z + 5);
    box(0.045, 0.045, 10, 'alu', x, 2.3, z + 5);
    for (let dz = 0; dz < 10; dz += 2) box(0.025, 1.8, 0.025, 'grey', x, 1.4, z + dz);
  }
  for (const [x, z] of [[-40, 140], [76, 105], [-76, 40], [76, -30], [-40, 220], [76, 230]]) {
    cylinder(0.14, 12, 'grey', x, 6, z);
    box(3, 0.16, 0.2, 'dark', x, 12, z);
    for (const dx of [-1, 0, 1]) box(0.65, 0.4, 0.3, 'white', x + dx, 11.9, z);
    colliders.push({ x, z, r: 0.4 });
  }
  for (const [x, z] of [[45, 119], [48, 114], [-60, 107]]) {
    const cargo = makeCargoPallet(); cargo.position.set(x, 0, z); root.add(cargo);
    colliders.push({ x, z, r: 2 });
  }
  // Detailed crew transport: glazing, wheel arches, hubs, lamps and roof ventilation.
  const van = new THREE.Group();
  const oldRoot = root.children.length;
  box(2.4, 2.3, 6, 'white', 0, 1.65, 0);
  box(2.43, 0.25, 6.03, 'blue', 0, 1.5, 0);
  box(2.08, 0.8, 0.04, 'solar', 0, 2.15, -3.025);
  for (const x of [-1.22, 1.22]) {
    for (const z of [-1.9, -0.45, 1]) box(0.035, 0.75, 1.1, 'solar', x, 2.2, z);
    for (const z of [-1.9, 1.9]) {
      const tire = cylinder(0.49, 0.22, 'black', x, 0.51, z); tire.rotation.z = Math.PI / 2;
      const hub = cylinder(0.25, 0.24, 'alu', x, 0.51, z); hub.rotation.z = Math.PI / 2;
    }
    box(0.15, 0.12, 0.28, 'alu', x, 1.65, -0.9);
  }
  box(2.45, 0.18, 0.22, 'alu', 0, 0.85, -3.05);
  for (const x of [-0.8, 0.8]) box(0.35, 0.23, 0.05, 'lightOn', x, 1.2, -3.04);
  box(1.3, 0.2, 1.4, 'grey', 0, 2.9, 0.6);
  for (const child of root.children.slice(oldRoot)) van.add(child);
  van.position.set(34, 0, 140); van.rotation.y = 0.3; root.add(van);
  // Crew staging area: equipment lockers, carts, cable reels and safety cones.
  for (const x of [44, 46, 48]) {
    box(1.6, 2.2, 0.8, 'white', x, 1.1, 155);
    box(1.42, 1.9, 0.04, 'blue', x, 1.12, 154.57);
    box(0.05, 0.3, 0.07, 'alu', x + 0.5, 1.1, 154.52);
    for (let y = 1.6; y < 2; y += 0.1) box(1, 0.025, 0.04, 'dark', x, y, 154.53);
    colliders.push({ x, z: 155, r: 1 });
  }
  for (const [x, z] of [[43, 130], [48, 130], [-59, 114]]) {
    box(2.4, 0.18, 1.3, 'alu', x, 0.5, z);
    box(1.5, 0.7, 0.9, 'orange', x, 0.95, z);
    for (const dx of [-0.9, 0.9]) for (const dz of [-0.55, 0.55]) {
      const wheel = cylinder(0.23, 0.12, 'black', x + dx, 0.25, z + dz); wheel.rotation.x = Math.PI / 2;
    }
    colliders.push({ x, z, r: 1.5 });
  }
  for (let z = 106; z < 122; z += 4) for (const x of [23, 37]) {
    box(0.6, 0.07, 0.6, 'black', x, 0.035, z);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 12), propMaterial('orange')); cone.position.set(x, 0.42, z); root.add(cone);
    cylinder(0.13, 0.12, 'white', x, 0.48, z);
  }
  for (const x of [-62, -57]) {
    const reel = cylinder(0.65, 0.9, 'dark', x, 0.7, 100); reel.rotation.z = Math.PI / 2;
    for (const dx of [-0.5, 0.5]) { const rim = cylinder(0.8, 0.08, 'orange', x + dx, 0.8, 100); rim.rotation.z = Math.PI / 2; }
    colliders.push({ x, z: 100, r: 1 });
  }
  // Readable wayfinding signs at the crew apron and ramp entrance.
  if (typeof document !== 'undefined') for (const [x, z, title, subtitle] of [
    [24, 125, 'CREW ACCESS', 'RAMP 01  /  ELEVATOR'],
    [41, 99, 'LAUNCH COMPLEX', 'AUTHORIZED CREW ONLY'],
    [89, 158, 'OPERATIONS', 'GROUND SUPPORT  /  02'],
  ]) {
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 256;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#122539'; ctx.fillRect(0, 0, 768, 256);
    ctx.fillStyle = '#efb44f'; ctx.fillRect(0, 0, 14, 256); ctx.font = 'bold 58px sans-serif'; ctx.fillStyle = '#ffffff'; ctx.fillText(title, 38, 110);
    ctx.font = '28px sans-serif'; ctx.fillStyle = '#a8c1cf'; ctx.fillText(subtitle, 38, 176);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.2, 0.12), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.75 })); sign.position.set(x, 2.3, z); root.add(sign);
    for (const dx of [-1.4, 1.4]) cylinder(0.06, 2.3, 'alu', x + dx, 1.15, z);
    colliders.push({ x, z, r: 1.9 });
  }
  // Deterministic scrub clusters outside the working apron, instanced for inexpensive depth.
  const vegetation = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x53633c, roughness: 1 }), 240);
  const transform = new THREE.Object3D(); let seed = 9127;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 240; i++) {
    const side = i % 2 ? -1 : 1, size = 0.6 + random() * 1.7;
    transform.position.set(side * (155 + random() * 450), size * 0.35, -220 + random() * 850);
    transform.scale.set(size * 1.5, size * 0.55, size); transform.rotation.y = random() * Math.PI; transform.updateMatrix(); vegetation.setMatrixAt(i, transform.matrix);
  }
  vegetation.receiveShadow = true; root.add(vegetation);
  return mergeStatic(root);
}

export function makeLunarFieldStation(ground, base, colliders) {
  const root = new THREE.Group(); root.name = 'Lunar field station';
  const place = (model, dx, dz, radius) => {
    const x = base.x + dx, z = base.z + dz;
    model.position.set(x, ground.height(x, z), z); root.add(model);
    colliders.push({ x, z, r: radius });
  };
  for (const [x, z] of [[-24, -15], [-28, -12], [24, 16]]) place(makeCargoPallet(), x, z, 2);
  for (const z of [12, 16, 20]) place(makeFuelTank(), -29, z, 1.7);
  place(makeCommsDish(), -25, -24, 1.5);
  // Survey poles form a readable approach from the landing area to the habitat.
  for (const x of [-5, 5]) for (let z = -22; z >= -46; z -= 8) {
    const pole = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 1, 8), propMaterial('alu')); shaft.position.y = 0.5; pole.add(shaft);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.14), propMaterial('lightOn')); cap.position.y = 1; pole.add(cap);
    place(pole, x, z, 0.1);
  }
  return mergeStatic(root);
}
