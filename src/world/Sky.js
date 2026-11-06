import * as THREE from 'three';

export function makeStarfield(count = 3000, radius = 9000, seed = 7) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    pos[i * 3] = r * Math.cos(th) * radius; pos[i * 3 + 1] = u * radius; pos[i * 3 + 2] = r * Math.sin(th) * radius;
    const b = 0.45 + Math.pow(rnd(), 3) * 0.55, t = rnd();
    col[i * 3] = b * (t > 0.85 ? 1.0 : 0.9); col[i * 3 + 1] = b * 0.92; col[i * 3 + 2] = b * (t < 0.2 ? 1.0 : 0.85);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false, fog: false });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false; pts.renderOrder = -10;
  return pts;
}

export function makeGlowSprite(color = '#fff6e0', size = 300, inner = 0.15) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(inner, color); gr.addColorStop(0.4, color + '55'); gr.addColorStop(1, '#00000000');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  sp.scale.setScalar(size);
  return sp;
}

/** A photo of a planet disk (e.g. the Apollo 17 Blue Marble) shown as a round sprite. */
export function makeDiskSprite(texture, size) {
  const m = new THREE.SpriteMaterial({ map: texture, depthWrite: false, fog: false, transparent: true });
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float rr = length(vMapUv - 0.5);
      diffuseColor.a *= 1.0 - smoothstep(0.47, 0.5, rr);`);
  };
  const sp = new THREE.Sprite(m); sp.scale.setScalar(size); return sp;
}

/** Vertical gradient sky dome (Mars daytime sky, Earth sky). */
export function makeGradientSky(top, horizon, radius = 8000) {
  const geo = new THREE.SphereGeometry(radius, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float h = clamp(vP.y,0.0,1.0); gl_FragColor = vec4(mix(horizon, top, pow(h,0.55)),1.0); }',
  });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = -20; m.frustumCulled = false;
  return m;
}

/** Direction (unit vector, world axes x=east, y=up, z=south) from azimuth (deg from north, clockwise) and elevation (deg). */
export function dirFromAzEl(azDeg, elDeg) {
  const az = azDeg * Math.PI / 180, el = elDeg * Math.PI / 180;
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}
