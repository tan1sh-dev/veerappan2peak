import * as THREE from 'three';

// Deterministic rock scattering around the player (gameplay visuals; real per-rock positions are not available).
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; h = h ^ (h >>> 16); return (h >>> 0) / 4294967295; }

function rockGeometry(seed, detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 0.75 + 0.5 * hash(Math.round(x * 50 + seed * 13), Math.round(y * 50 + z * 70));
    p.setXYZ(i, x * n, y * n * 0.7, z * n);
  }
  g.computeVertexNormals();
  return g;
}

export class RockField {
  constructor(site, { count = 1400, color = 0x8a8a86, radius = 260, cell = 9, keepOut = [] }) {
    this.site = site; this.count = count; this.radius = radius; this.cell = cell; this.keepOut = keepOut;
    this.group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true });
    this.meshes = [0, 1, 2].map(k => {
      const m = new THREE.InstancedMesh(rockGeometry(k + 1), mat, Math.ceil(count / 3));
      m.castShadow = true; m.receiveShadow = true; m.count = 0; m.frustumCulled = false;
      this.group.add(m); return m;
    });
    this.last = null;
    this.tmp = new THREE.Object3D();
  }
  setKeepOut(list) { this.keepOut = list; this.last = null; }
  update(pos, force = false) {
    if (!force && this.last && Math.hypot(pos.x - this.last.x, pos.z - this.last.z) < 35) return;
    this.last = { x: pos.x, z: pos.z };
    const C = this.cell, R = this.radius;
    const ci = Math.floor(pos.x / C), cj = Math.floor(pos.z / C), rc = Math.ceil(R / C);
    const counts = [0, 0, 0], cap = this.meshes[0].instanceMatrix.count;
    const cand = [];
    for (let j = -rc; j <= rc; j++) for (let i = -rc; i <= rc; i++) {
      const gi = ci + i, gj = cj + j;
      const h = hash(gi, gj);
      if (h > 0.55) continue;
      const x = (gi + hash(gi + 7, gj)) * C, z = (gj + hash(gi, gj + 7)) * C;
      const d = Math.hypot(x - pos.x, z - pos.z);
      if (d > R) continue;
      cand.push([d, x, z, h, gi, gj]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    for (const [, x, z, h, gi, gj] of cand) {
      if (this.keepOut.some(k => Math.hypot(x - k.x, z - k.z) < k.r)) continue;
      const k = Math.floor(hash(gi * 3, gj * 5) * 3);
      if (counts[k] >= cap) continue;
      const big = hash(gi * 11, gj * 3);
      const s = 0.1 + Math.pow(big, 8) * 0.9 + h * 0.18;
      const y = this.site.height(x, z);
      this.tmp.position.set(x, y + s * 0.15, z);
      this.tmp.rotation.set(hash(gi, gj * 2) * 0.6, hash(gi * 2, gj) * 6.28, 0);
      this.tmp.scale.set(s * (0.8 + h), s, s * (0.8 + hash(gi, gj + 3)));
      this.tmp.updateMatrix();
      this.meshes[k].setMatrixAt(counts[k]++, this.tmp.matrix);
    }
    this.meshes.forEach((m, k) => { m.count = counts[k]; m.instanceMatrix.needsUpdate = true; });
  }
}
