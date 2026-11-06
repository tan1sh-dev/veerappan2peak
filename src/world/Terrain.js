import * as THREE from 'three';

// Builds chunked, LOD'd meshes for a TerrainSite. The near core uses the high-resolution DEM and orthophoto;
// the far ring uses the wide backdrop DEM. Detail noise adds close-range texture (gameplay visual, not data).

let detailTex = null;
function getDetailTexture() {
  if (detailTex) return detailTex;
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), img = g.createImageData(S, S);
  // tileable value noise, 3 octaves
  const rnd = (x, y, s) => { const n = Math.sin((x % s) * 127.1 + (y % s) * 311.7 + s * 17.0) * 43758.5453; return n - Math.floor(n); };
  const vn = (x, y, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const a = rnd(xi, yi, s), b = rnd(xi + 1, yi, s), c = rnd(xi, yi + 1, s), d = rnd(xi + 1, yi + 1, s);
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0, amp = 0.5, tot = 0;
    for (const s of [8, 16, 32, 64]) { v += vn(x / S * s, y / S * s, s) * amp; tot += amp; amp *= 0.55; }
    v /= tot;
    const sp = Math.random() < 0.02 ? -0.15 : 0; // grains
    const c = Math.max(0, Math.min(255, (0.72 + (v - 0.5) * 0.65 + sp) * 255));
    const i = (y * S + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = c; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  detailTex = new THREE.CanvasTexture(cv);
  detailTex.wrapS = detailTex.wrapT = THREE.RepeatWrapping;
  detailTex.anisotropy = 4;
  return detailTex;
}

/**
 * opts.map: core orthophoto, opts.farMap: backdrop orthophoto, opts.tint: [r,g,b] multiplier,
 * opts.colorize: true to colorize the (grayscale) core image with farMap colour (Mars HiRISE + Viking colour)
 */
function makeMaterial(site, map, opts, isFar) {
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0, color: new THREE.Color(...(opts.tint || [1, 1, 1])) });
  const core = site.core;
  mat.onBeforeCompile = sh => {
    sh.uniforms.uDetail = { value: getDetailTexture() };
    sh.uniforms.uCoreHalf = { value: new THREE.Vector2(core.widthM / 2 - 2, core.heightM / 2 - 2) };
    sh.uniforms.uColorMap = { value: opts.farMap || map };
    sh.uniforms.uFarRect = { value: new THREE.Vector4(site.far.x0, site.far.z0, site.far.widthM, site.far.heightM) };
    sh.uniforms.uColorize = { value: (!isFar && opts.colorize) ? 1 : 0 };
    sh.uniforms.uContrast = { value: opts.contrast || 1.0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; uniform sampler2D uDetail; uniform vec2 uCoreHalf; uniform sampler2D uColorMap; uniform vec4 uFarRect; uniform float uColorize; uniform float uContrast;`)
      .replace('#include <map_fragment>', `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  vec3 base = sampledDiffuseColor.rgb;
  base = clamp((base - 0.5) * uContrast + 0.5, 0.0, 1.0);
  if (uColorize > 0.5) {
    vec2 fuv = vec2((vWPos.x - uFarRect.x) / uFarRect.z, 1.0 - (vWPos.z - uFarRect.y) / uFarRect.w);
    vec3 col = texture2D(uColorMap, fuv).rgb;
    float lum = dot(base, vec3(0.333));
    float clum = max(dot(col, vec3(0.333)), 0.05);
    base = col / clum * lum;
  }
  diffuseColor.rgb *= base;
#endif
  float camDist = length(vWPos - cameraPosition);
  float d1 = texture2D(uDetail, vWPos.xz * 0.35).r;
  float d2 = texture2D(uDetail, vWPos.xz * 0.045).r;
  float fade = 1.0 - smoothstep(60.0, 450.0, camDist);
  diffuseColor.rgb *= mix(1.0, d1 * 1.3, fade * 0.55) * mix(1.0, d2 * 1.3, 0.35);
  ${isFar ? 'if (abs(vWPos.x) < uCoreHalf.x && abs(vWPos.z) < uCoreHalf.y) discard;' : ''}
`);
  };
  mat.customProgramCacheKey = () => (isFar ? 'terrainFar' : 'terrainCore') + (opts.colorize ? 'C' : '');
  return mat;
}

function buildGrid(site, x0, z0, dx, dz, nx, nz, uvFn, skirt) {
  // (nx+1) x (nz+1) vertices; optional skirt ring
  const vx = nx + 1, vz = nz + 1;
  const extra = skirt ? 2 * (vx + vz) : 0;
  const pos = new Float32Array((vx * vz + extra) * 3), nor = new Float32Array((vx * vz + extra) * 3), uv = new Float32Array((vx * vz + extra) * 2);
  const idx = [];
  let p = 0;
  const put = (x, z, y) => {
    pos[p * 3] = x; pos[p * 3 + 1] = y; pos[p * 3 + 2] = z;
    const n = site.normal(x, z, Math.max(dx, 1.5));
    nor[p * 3] = n[0]; nor[p * 3 + 1] = n[1]; nor[p * 3 + 2] = n[2];
    const [u, v] = uvFn(x, z); uv[p * 2] = u; uv[p * 2 + 1] = v;
    return p++;
  };
  for (let j = 0; j < vz; j++) for (let i = 0; i < vx; i++) { const x = x0 + i * dx, z = z0 + j * dz; put(x, z, site.height(x, z)); }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * vx + i, b = a + 1, c = a + vx, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  if (skirt) {
    const drop = skirt;
    const edge = (list) => {
      const s = [];
      for (const k of list) { const x = pos[k * 3], z = pos[k * 3 + 2]; s.push(put(x, z, pos[k * 3 + 1] - drop)); }
      for (let t = 0; t < list.length - 1; t++) {
        const a = list[t], b = list[t + 1], c = s[t], d = s[t + 1];
        idx.push(a, b, c, b, d, c, a, c, b, b, c, d); // both windings so it is visible from either side
      }
    };
    edge([...Array(vx).keys()]);                                   // north
    edge([...Array(vx).keys()].map(i => (vz - 1) * vx + i));       // south
    edge([...Array(vz).keys()].map(j => j * vx));                  // west
    edge([...Array(vz).keys()].map(j => j * vx + vx - 1));         // east
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, p * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, p * 3), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv.subarray(0, p * 2), 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export class TerrainMesh {
  constructor(site, { map, farMap, tint, colorize, contrast, settings }) {
    this.site = site;
    this.group = new THREE.Group();
    this.chunks = [];
    const core = site.core;
    const opts = { tint, farMap, colorize, contrast };
    this.coreMat = makeMaterial(site, map, opts, false);
    this.farMat = makeMaterial(site, farMap, opts, true);
    const coreUV = (x, z) => [(x - core.x0) / core.widthM, 1 - (z - core.z0) / core.heightM];
    const far = site.far;
    const farUV = (x, z) => [(x - far.x0) / far.widthM, 1 - (z - far.z0) / far.heightM];

    // Core chunks
    const step0 = settings.coreStep || 1;
    const CH = 64; // cells per chunk at full res
    const cellsX = core.width - 1, cellsZ = core.height - 1;
    for (let cj = 0; cj < cellsZ; cj += CH) for (let ci = 0; ci < cellsX; ci += CH) {
      const nxFull = Math.min(CH, cellsX - ci), nzFull = Math.min(CH, cellsZ - cj);
      const x0 = core.x0 + ci * core.dx, z0 = core.z0 + cj * core.dz;
      const w = nxFull * core.dx, h = nzFull * core.dz;
      const levels = [];
      for (const step of [step0, 4, 16]) {
        const nx = Math.max(1, Math.round(nxFull / step)), nz = Math.max(1, Math.round(nzFull / step));
        const geo = buildGrid(site, x0, z0, w / nx, h / nz, nx, nz, coreUV, step === step0 ? 1.5 : 6);
        const m = new THREE.Mesh(geo, this.coreMat);
        m.receiveShadow = true; m.visible = false; m.matrixAutoUpdate = false;
        this.group.add(m); levels.push(m);
      }
      this.chunks.push({ cx: x0 + w / 2, cz: z0 + h / 2, r: Math.hypot(w, h) / 2, levels, cur: -1 });
    }
    // Far ring (single mesh, step 1 or 2)
    const fs = settings.quality === 'low' ? 2 : 1;
    const fnx = Math.floor((far.width - 1) / fs), fnz = Math.floor((far.height - 1) / fs);
    const fgeo = buildGrid(site, far.x0, far.z0, far.widthM / fnx, far.heightM / fnz, fnx, fnz, farUV, 0);
    this.farMesh = new THREE.Mesh(fgeo, this.farMat);
    this.farMesh.receiveShadow = false; this.farMesh.matrixAutoUpdate = false;
    this.group.add(this.farMesh);
    this.lodNear = settings.quality === 'low' ? 350 : settings.quality === 'high' ? 900 : 600;
  }
  update(camPos) {
    for (const c of this.chunks) {
      const d = Math.max(0, Math.hypot(camPos.x - c.cx, camPos.z - c.cz) - c.r);
      const lv = d < this.lodNear ? 0 : d < this.lodNear * 4 ? 1 : 2;
      if (lv !== c.cur) { if (c.cur >= 0) c.levels[c.cur].visible = false; c.levels[lv].visible = true; c.cur = lv; }
    }
  }
  dispose() {
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.coreMat.dispose(); this.farMat.dispose();
  }
}
