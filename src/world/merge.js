import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merges all static meshes inside `root` into one mesh per material (draw-call reduction for weak GPUs).
 * Meshes (or their ancestors) flagged with userData.keep, invisible meshes, skinned meshes and sprites are left alone.
 * Returns the same root object.
 */
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const remove = [];
  const kept = o => { for (let p = o; p && p !== root; p = p.parent) if (p.userData.keep) return true; return false; };
  root.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || kept(o) || Array.isArray(o.material)) return;
    let vis = true; for (let p = o; p; p = p.parent) { if (!p.visible) { vis = false; break; } if (p === root) break; }
    if (!vis) { remove.push(o); return; }
    const g = o.geometry;
    const attrs = Object.keys(g.attributes).filter(a => ['position', 'normal', 'uv'].includes(a)).sort();
    if (!attrs.includes('position') || !attrs.includes('normal')) return;
    const key = o.material.uuid + '|' + attrs.join(',') + '|' + (g.index ? 'i' : 'n') + '|' + o.castShadow;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const cg = new THREE.BufferGeometry();
    for (const a of attrs) cg.setAttribute(a, g.attributes[a].clone());
    if (g.index) cg.setIndex(g.index.clone());
    cg.applyMatrix4(m);
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, geos: [], cast: o.castShadow, recv: o.receiveShadow });
    buckets.get(key).geos.push(cg);
    remove.push(o);
  });
  let merged = 0;
  for (const b of buckets.values()) {
    if (b.geos.length < 2 && remove.length < 2) continue;
    const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, b.mat);
    mesh.castShadow = b.cast; mesh.receiveShadow = b.recv;
    root.add(mesh); merged++;
  }
  if (merged) for (const o of remove) o.parent && o.parent.remove(o);
  return root;
}
