import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const base = './assets/';
const texLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const cache = new Map();

function once(key, fn) { if (!cache.has(key)) cache.set(key, fn().catch(e => { cache.delete(key); throw e; })); return cache.get(key); }

export const Assets = {
  json(rel) { return once('j:' + rel, async () => { const r = await fetch(base + rel); if (!r.ok) throw new Error('missing ' + rel); return r.json(); }); },
  bin(rel) { return once('b:' + rel, async () => { const r = await fetch(base + rel); if (!r.ok) throw new Error('missing ' + rel); return r.arrayBuffer(); }); },
  texture(rel, { srgb = true, repeat = false, aniso = 4 } = {}) {
    return once('t:' + rel, () => new Promise((res, rej) => texLoader.load(base + rel, t => {
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = aniso;
      res(t);
    }, undefined, rej)));
  },
  gltf(rel) { return once('g:' + rel, () => new Promise((res, rej) => gltfLoader.load(base + rel, res, undefined, rej))); },
  /** Clone of a GLB scene scaled so its largest dimension (or height) equals the given metres. */
  async model(rel, { height = null, size = null } = {}) {
    const g = await this.gltf(rel);
    const obj = g.scene.clone(true);
    const box = new THREE.Box3().setFromObject(obj);
    const dim = box.getSize(new THREE.Vector3());
    let s = 1;
    if (height) s = height / dim.y; else if (size) s = size / Math.max(dim.x, dim.y, dim.z);
    obj.scale.setScalar(s);
    // put the base on y=0 and centre it on x/z
    const c = box.getCenter(new THREE.Vector3());
    obj.position.set(-c.x * s, -box.min.y * s, -c.z * s);
    const wrap = new THREE.Group(); wrap.add(obj);
    wrap.userData.animations = g.animations;
    obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return wrap;
  },
  /** Terrain heightfield: Float32 elevations + header JSON written by tools/fetch-nasa-data.mjs */
  async heightfield(name) {
    const [hdr, buf] = await Promise.all([this.json(`terrain/${name}.json`), this.bin(`terrain/${name}.bin`)]);
    return { ...hdr, data: new Float32Array(buf) };
  },
};
