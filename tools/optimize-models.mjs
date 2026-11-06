// Optimizes the original NASA GLBs (data-src/models) for weak laptops:
// removes Draco (so the game needs no decoder), merges duplicates, simplifies heavy meshes,
// and downsizes textures to WebP. Output: public/assets/models/*.glb
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress, flatten, join, palette } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'data-src', 'models');
const OUT = path.join(ROOT, 'public', 'assets', 'models');

// id: [simplify ratio (fraction of triangles kept), max texture size]
const PLAN = {
  apollo_lm: [0.35, 512],
  astronaut: [1.0, 512],
  ingenuity: [0.8, 512],
  perseverance: [0.25, 512],
  saturn_v: [0.6, 512],
  viking_lander: [0.3, 512],
  z2_suit: [0.5, 1024],
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
await MeshoptSimplifier.ready;
await fs.mkdir(OUT, { recursive: true });

for (const [id, [ratio, tex]] of Object.entries(PLAN)) {
  const doc = await io.read(path.join(SRC, `${id}.glb`));
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (ext.extensionName === 'KHR_draco_mesh_compression') ext.dispose();
  }
  // The game shows these models statically: drop animations and skins so meshes can be merged (fewer draw calls).
  const root = doc.getRoot();
  for (const a of root.listAnimations()) a.dispose();
  for (const node of root.listNodes()) if (node.getSkin()) node.setSkin(null);
  for (const sk of root.listSkins()) sk.dispose();
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { for (const sem of ['JOINTS_0', 'WEIGHTS_0']) { const a = p.getAttribute(sem); if (a) p.setAttribute(sem, null); } }
  const steps = [dedup(), prune(), palette({ min: 3 }), dedup(), flatten(), join({ keepNamed: false }), weld({ tolerance: 0.0001 })];
  if (ratio < 1) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.002 }));
  steps.push(prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 80 }));
  await doc.transform(...steps);
  const out = path.join(OUT, `${id}.glb`);
  await io.write(out, doc);
  const st = await fs.stat(out);
  let tris = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const i = p.getIndices(); tris += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3;
  }
  console.log(`${id}: ${(st.size / 1e6).toFixed(2)} MB, ${Math.round(tris)} tris, ${doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().length, 0)} primitives`);
}
