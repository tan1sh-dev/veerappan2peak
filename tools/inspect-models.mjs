import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder': await draco3d.createDecoderModule()});
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f); const root = doc.getRoot();
  let tris = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { const i = p.getIndices(); const pos = p.getAttribute('POSITION'); tris += (i ? i.getCount() : pos.getCount()) / 3; }
  const tex = root.listTextures().map(t => { const s = t.getSize(); return s ? s.join('x') : '?'; });
  const scene = root.listScenes()[0];
  // bounding box
  const { getBounds } = await import('@gltf-transform/core');
  const b = getBounds(scene);
  console.log(f.split('/').pop(), 'meshes', root.listMeshes().length, 'tris', Math.round(tris), 'materials', root.listMaterials().length, 'textures', tex.join(','), 'skins', root.listSkins().length, 'anims', root.listAnimations().length, 'size', b.min.map(v=>v.toFixed(2)), b.max.map(v=>v.toFixed(2)));
}
