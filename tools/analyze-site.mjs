// Prints world positions of real waypoints and finds flat ground for gameplay structures.
import fs from 'node:fs';
import { TerrainSite } from '../src/world/Heightfield.js';
const load = n => ({ ...JSON.parse(fs.readFileSync(`public/assets/terrain/${n}.json`)), data: new Float32Array(fs.readFileSync(`public/assets/terrain/${n}.bin`).buffer.slice(0)) });
for (const [core, far, wpf] of [['moon_a15_core', 'moon_a15_far', 'apollo15_waypoints'], ['mars_gale_core', 'mars_gale_far', 'curiosity_waypoints']]) {
  const c = load(core), f = load(far);
  const site = new TerrainSite(c, f);
  console.log(`\n== ${core} lon0 ${site.lon0.toFixed(4)} lat0 ${site.lat0.toFixed(4)} originElev ${site.originElevation.toFixed(1)} farBias ${site.far.bias.toFixed(1)}`);
  const wps = JSON.parse(fs.readFileSync(`public/assets/data/${wpf}.json`));
  for (const w of wps) { const [x, z] = site.toWorld(w.lon, w.lat); if (Math.abs(x) < 3000 && Math.abs(z) < 3000) console.log(`  ${w.name.padEnd(28)} x ${x.toFixed(0).padStart(6)} z ${z.toFixed(0).padStart(6)} h ${site.height(x, z).toFixed(1).padStart(7)} slope ${site.slope(x, z).toFixed(1)}`); }
  // min/max of height in core (rille / hills) on coarse grid
  let lo = [1e9], hi = [-1e9];
  for (let z = -2900; z <= 2900; z += 50) for (let x = -2900; x <= 2900; x += 50) { const h = site.height(x, z); if (h < lo[0]) lo = [h, x, z]; if (h > hi[0]) hi = [h, x, z]; }
  console.log('  lowest', lo.map(v => v.toFixed(0)).join(','), ' highest', hi.map(v => v.toFixed(0)).join(','));
  // flat spots: max slope within 40m radius < 4 deg, list some near origin-ish
  const flats = [];
  for (let z = -2600; z <= 2600; z += 100) for (let x = -2600; x <= 2600; x += 100) {
    let ms = 0; for (let a = 0; a < 8; a++) for (const r of [0, 20, 40]) ms = Math.max(ms, site.slope(x + Math.cos(a) * r, z + Math.sin(a) * r));
    if (ms < 3.5) flats.push([x, z, ms]);
  }
  console.log('  flat spots:', flats.length, flats.slice(0, 400).filter(([x, z]) => Math.hypot(x, z) < 2200).map(([x, z, s]) => `(${x},${z})`).join(' ').slice(0, 1500));
  // profile across x at z of first waypoint
  const z0 = site.toWorld(wps[0].lon, wps[0].lat)[1];
  let prof = ''; for (let x = -2900; x <= 2900; x += 200) prof += site.height(x, z0).toFixed(0) + ' ';
  console.log('  profile at z of', wps[0].name, ':', prof);
}
