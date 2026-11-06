// VEERAPPAN — SPACE EXPLORER
// Downloads REAL NASA data once and converts it into compact game assets under public/assets.
// Every product written here is recorded in public/assets/provenance.json with its source URL.
//
// Usage:  node tools/fetch-nasa-data.mjs            (uses DEMO_KEY for api.nasa.gov)
//         set NASA_API_KEY=yourkey && node tools/fetch-nasa-data.mjs
//
// Sources used (all verified reachable at time of writing):
//   NASA Solar System Treks (trek.nasa.gov): ArcGIS ImageServer (DEMs, imagery), MapServer (waypoints), WMTS tiles
//   NASA 3D Resources (science.nasa.gov/3d-resources): GLB models
//   api.nasa.gov: InSight Mars Weather, APOD, EPIC
//   PDS Search API (pds.nasa.gov/api/search/1): product identifiers for attribution
//   data.nasa.gov (CKAN API): Apollo 15 lunar sample catalog metadata

import fs from 'node:fs/promises';
import path from 'node:path';
import { fromArrayBuffer } from 'geotiff';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'assets');
const API_KEY = process.env.NASA_API_KEY || 'DEMO_KEY';
const provenance = [];
const today = new Date().toISOString().slice(0, 10);

const MOON_R = 1737400;
const MARS_R = 3389500; // Mars 2000 sphere used by Trek (IAU)

const hb = h => [h.lonMin, h.latMin, h.lonMax, h.latMax];
function prov(entry) { provenance.push({ retrieved: today, ...entry }); }

async function get(url, { type = 'buffer', tries = 3 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'veerappan-space-explorer-datafetch' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      if (type === 'json') return await res.json();
      if (type === 'text') return await res.text();
      return Buffer.from(await res.arrayBuffer());
    } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
  }
  throw lastErr;
}

async function write(rel, data) {
  const p = path.join(OUT, rel);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, data);
  return p;
}

function bboxAround(lon0, lat0, halfMeters, R) {
  const dLat = (halfMeters / R) * 180 / Math.PI;
  const dLon = dLat / Math.cos(lat0 * Math.PI / 180);
  return [lon0 - dLon, lat0 - dLat, lon0 + dLon, lat0 + dLat];
}

// ---------- DEM export from a Trek ArcGIS ImageServer ----------
async function exportDEM({ body, service, bbox, size, outName, R, title, notes }) {
  const base = `https://trek.nasa.gov/${body}/trekarcgis/rest/services/${service}/ImageServer`;
  const sizeH = Math.round(size * (bbox[3] - bbox[1]) / (bbox[2] - bbox[0]));
  const q = `bbox=${bbox.join(',')}&size=${size},${sizeH}&format=tiff&pixelType=F32&noDataInterpretation=esriNoDataMatchAny&interpolation=RSP_BilinearInterpolation`;
  const buf = await get(`${base}/exportImage?${q}&f=image`);
  const tiff = await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const img = await tiff.getImage();
  const w = img.getWidth(), h = img.getHeight();
  const [ras] = await img.readRasters();
  const nodata = img.getGDALNoData();
  const data = new Float32Array(w * h);
  let min = Infinity, max = -Infinity, holes = 0;
  for (let i = 0; i < w * h; i++) {
    let v = ras[i];
    if (!Number.isFinite(v) || v < -1e20 || v > 1e20 || (nodata !== null && v === nodata)) { v = NaN; holes++; }
    data[i] = v;
    if (Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v; }
  }
  // Fill no-data holes with the nearest valid neighbour (row scan, then column scan)
  if (holes) {
    for (let pass = 0; pass < 4 && holes; pass++) {
      holes = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!Number.isNaN(data[i])) continue;
        let s = 0, c = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const v = data[yy * w + xx];
          if (!Number.isNaN(v)) { s += v; c++; }
        }
        if (c) data[i] = s / c; else holes++;
      }
    }
    for (let i = 0; i < w * h; i++) if (Number.isNaN(data[i])) data[i] = min;
  }
  const [lonMin, latMin, lonMax, latMax] = img.getBoundingBox();
  const lat0 = (latMin + latMax) / 2;
  const widthM = (lonMax - lonMin) * Math.PI / 180 * R * Math.cos(lat0 * Math.PI / 180);
  const heightM = (latMax - latMin) * Math.PI / 180 * R;
  await write(`terrain/${outName}.bin`, Buffer.from(data.buffer));
  const header = { width: w, height: h, lonMin, lonMax, latMin, latMax, widthM, heightM, min, max, bodyRadius: R,
    source: `${base}/exportImage`, service, title };
  await write(`terrain/${outName}.json`, JSON.stringify(header, null, 1));
  prov({ id: `terrain/${outName}`, kind: 'DEM (real elevation, metres)', title, source: base, query: q, notes,
    stats: { min: +min.toFixed(1), max: +max.toFixed(1), widthM: Math.round(widthM), heightM: Math.round(heightM), grid: `${w}x${h}` } });
  console.log(`DEM ${outName}: ${w}x${h} ${Math.round(widthM)}m x ${Math.round(heightM)}m  elev ${min.toFixed(1)}..${max.toFixed(1)}`);
  return header;
}

// ---------- Image export from an ImageServer ----------
async function exportImage({ body, service, bbox, size, outName, title, notes }) {
  const base = `https://trek.nasa.gov/${body}/trekarcgis/rest/services/${service}/ImageServer`;
  const sizeH = Math.round(size * (bbox[3] - bbox[1]) / (bbox[2] - bbox[0]));
  const q = `bbox=${bbox.join(',')}&size=${size},${sizeH}&format=jpgpng`;
  const buf = await get(`${base}/exportImage?${q}&f=image`);
  const jpg = await sharp(buf).flatten({ background: '#000' }).resize(size, size, { fit: 'fill' }).jpeg({ quality: 82 }).toBuffer();
  await write(`textures/${outName}.jpg`, jpg);
  prov({ id: `textures/${outName}.jpg`, kind: 'orthoimage (real)', title, source: base, query: q, notes,
    bbox });
  console.log(`IMG ${outName}: ${size}px`);
}

// ---------- WMTS stitching (Trek equirectangular tile scheme: level 0 = 2x1 tiles of 180 deg) ----------
async function stitchWMTS({ body, layer, ext, z, bbox, outSize, outName, title, notes, outW, outH }) {
  const tileDeg = 180 / Math.pow(2, z);
  const [lonMin, latMin, lonMax, latMax] = bbox;
  const c0 = Math.floor((lonMin + 180) / tileDeg), c1 = Math.floor((lonMax + 180) / tileDeg - 1e-9);
  const r0 = Math.floor((90 - latMax) / tileDeg), r1 = Math.floor((90 - latMin) / tileDeg - 1e-9);
  const cols = c1 - c0 + 1, rows = r1 - r0 + 1;
  const composites = [];
  const base = `https://trek.nasa.gov/tiles/${body}/EQ/${layer}/1.0.0/default/default028mm`;
  let got = 0;
  const jobs = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    jobs.push((async () => {
      try {
        const t = await get(`${base}/${z}/${r}/${c}.${ext}`, { tries: 2 });
        composites.push({ input: t, left: (c - c0) * 256, top: (r - r0) * 256 }); got++;
      } catch { /* missing tile = no coverage */ }
    })());
    if (jobs.length >= 8) { await Promise.all(jobs); jobs.length = 0; }
  }
  await Promise.all(jobs);
  const mosaic = await sharp({ create: { width: cols * 256, height: rows * 256, channels: 3, background: '#000' } })
    .composite(composites).png().toBuffer();
  const pxPerDeg = 256 / tileDeg;
  const left = Math.round((lonMin + 180 - c0 * tileDeg) * pxPerDeg);
  const top = Math.round((90 - latMax - r0 * tileDeg) * pxPerDeg);
  const width = Math.round((lonMax - lonMin) * pxPerDeg);
  const height = Math.round((latMax - latMin) * pxPerDeg);
  const out = await sharp(mosaic).extract({ left, top, width, height })
    .resize(outW || outSize, outH || outSize, { fit: 'fill' }).jpeg({ quality: 82 }).toBuffer();
  await write(`textures/${outName}.jpg`, out);
  prov({ id: `textures/${outName}.jpg`, kind: 'orthoimage mosaic (real, WMTS tiles stitched)', title,
    source: `${base}/{z}/{row}/{col}.${ext}`, notes: `${notes || ''} zoom ${z}, ${got}/${cols * rows} tiles`, bbox });
  console.log(`WMTS ${outName}: z${z} ${got}/${cols * rows} tiles -> ${outW || outSize}px`);
}

// ---------- MapServer feature query ----------
async function features(body, service) {
  const url = `https://trek.nasa.gov/${body}/trekarcgis/rest/services/${service}/MapServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&f=json`;
  const d = await get(url, { type: 'json' });
  return { url, features: d.features || [] };
}

function stripHtml(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"').replace(/\s+/g, ' ').trim();
}

async function waypointSet({ body, service, outName, bodyLabel, templateBase }) {
  const { url, features: f } = await features(body, service);
  const out = [];
  for (const ft of f) {
    const a = ft.attributes;
    let description = null;
    if (a.template) {
      const turl = a.template.startsWith('http') ? a.template : `${templateBase}/${a.template}`;
      try {
        const raw = await get(turl, { tries: 1 });
        let html = new TextDecoder('utf-8').decode(raw);
        if (html.includes('�')) html = new TextDecoder('windows-1252').decode(raw);
        const txt = stripHtml(html);
        description = txt.length > 20 ? txt.slice(0, 700) : null;
      } catch { description = null; }
      out.push({ name: a.name, lon: ft.geometry.x, lat: ft.geometry.y, description, descriptionSource: description ? turl : null });
    } else out.push({ name: a.name, lon: ft.geometry.x, lat: ft.geometry.y, description: null });
  }
  await write(`data/${outName}.json`, JSON.stringify(out, null, 1));
  prov({ id: `data/${outName}.json`, kind: `${bodyLabel} waypoint coordinates (real)`, source: url,
    notes: 'Descriptions are NASA Trek bookmark text, quoted with attribution.' });
  console.log(`WAYPOINTS ${outName}: ${out.length}`);
  return out;
}

async function pathSet({ body, service, outName, maxPts = 4000, attrs = [] }) {
  const { url, features: f } = await features(body, service);
  const paths = f.map(ft => ({
    attributes: Object.fromEntries(attrs.map(k => [k, ft.attributes[k]])),
    points: (ft.geometry.paths || []).flat().map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)])
  }));
  let total = paths.reduce((s, p) => s + p.points.length, 0);
  if (total > maxPts) {
    const step = Math.ceil(total / maxPts);
    for (const p of paths) p.points = p.points.filter((_, i) => i % step === 0 || i === p.points.length - 1);
  }
  await write(`data/${outName}.json`, JSON.stringify(paths));
  prov({ id: `data/${outName}.json`, kind: 'traverse polyline (real)', source: url });
  console.log(`PATH ${outName}: ${paths.length} lines`);
}

// ---------- Point sample of a science ImageServer ----------
async function samplePoint(body, service, lon, lat) {
  const base = `https://trek.nasa.gov/${body}/trekarcgis/rest/services/${service}/ImageServer`;
  const url = `${base}/identify?geometry=${encodeURIComponent(JSON.stringify({ x: lon, y: lat }))}&geometryType=esriGeometryPoint&returnGeometry=false&returnCatalogItems=false&f=json`;
  try {
    const d = await get(url, { type: 'json', tries: 2 });
    const v = parseFloat(d.value);
    return Number.isFinite(v) ? { value: v, url } : { value: null, url, raw: d.value };
  } catch (e) { return { value: null, url, error: String(e.message) }; }
}

// ---------- 3D models ----------
const MODELS = [
  ['apollo_lm', 'apollo-lunar-module', 'model/apollo-lunar-module/Apollo%20Lunar%20Module.glb', 'Apollo Lunar Module'],
  ['ingenuity', 'ingenuity-mars-helicopter', 'model/ingenuity-mars-helicopter/Ingenuity%20Mars%20Helicopter.glb', 'Ingenuity Mars Helicopter'],
  ['viking_lander', 'viking-lander', 'model/viking-lander/Viking%20Lander.glb', 'Viking Lander'],
  ['perseverance', 'mars-2020-perseverance-rover', 'model/mars-2020-perseverance-rover/Mars%202020%20Perseverance%20Rover.glb', 'Mars 2020 Perseverance Rover'],
  ['saturn_v', 'saturn-v', 'model/saturn-v/Saturn%20V.glb', 'Saturn V'],
  ['astronaut', 'astronaut', 'model/astronaut/Astronaut.glb', 'Astronaut'],
  ['z2_suit', 'z2-spacesuit', 'model/z2-spacesuit/Z2%20Spacesuit.glb', 'Z2 Spacesuit'],
];

async function fetchModels() {
  const dir = path.join(ROOT, 'data-src', 'models');
  await fs.mkdir(dir, { recursive: true });
  for (const [id, page, rel, title] of MODELS) {
    const url = `https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/${rel}`;
    const p = path.join(dir, `${id}.glb`);
    try { await fs.access(p); } catch {
      const b = await get(url);
      await fs.writeFile(p, b);
    }
    const st = await fs.stat(p);
    prov({ id: `models/${id}.glb`, kind: '3D model (NASA)', title, source: url, page: `https://science.nasa.gov/3d-resources/${page}/`,
      notes: `Original ${(st.size / 1e6).toFixed(1)} MB; optimized copy in public/assets/models by tools/optimize-models.mjs` });
    console.log(`MODEL ${id}: ${(st.size / 1e6).toFixed(1)} MB`);
  }
}

// ---------- api.nasa.gov snapshots (offline fallbacks; the game refreshes live if online) ----------
async function apiSnapshots() {
  try {
    const w = await get(`https://api.nasa.gov/insight_weather/?api_key=${API_KEY}&feedtype=json&ver=1.0`, { type: 'json' });
    const sols = (w.sol_keys || []).map(k => ({
      sol: +k, firstUTC: w[k].First_UTC, lastUTC: w[k].Last_UTC, season: w[k].Season,
      northernSeason: w[k].Northern_season,
      airTempC: w[k].AT ? { av: w[k].AT.av, mn: w[k].AT.mn, mx: w[k].AT.mx } : null,
      pressurePa: w[k].PRE ? { av: w[k].PRE.av, mn: w[k].PRE.mn, mx: w[k].PRE.mx } : null,
      windMs: w[k].HWS ? { av: w[k].HWS.av, mn: w[k].HWS.mn, mx: w[k].HWS.mx } : null,
    }));
    await write('data/insight_weather.json', JSON.stringify({ location: 'Elysium Planitia (InSight lander, 4.5N 135.6E)', sols }, null, 1));
    prov({ id: 'data/insight_weather.json', kind: 'Mars surface weather (real, archived)', source: 'https://api.nasa.gov/insight_weather/',
      notes: 'InSight TWINS/PS measurements for the final reported sols (2020). Measured at Elysium Planitia, ~600 km from Gale crater.' });
    console.log(`INSIGHT: ${sols.length} sols`);
  } catch (e) { console.warn('InSight weather failed:', e.message); }

  try {
    const a = await get(`https://api.nasa.gov/planetary/apod?api_key=${API_KEY}`, { type: 'json' });
    await write('data/apod_fallback.json', JSON.stringify({ date: a.date, title: a.title, explanation: a.explanation, url: a.url, media_type: a.media_type, copyright: a.copyright || null }, null, 1));
    if (a.media_type === 'image') {
      const img = await get(a.url);
      await write('textures/apod_fallback.jpg', await sharp(img).resize(1280, 720, { fit: 'cover' }).jpeg({ quality: 78 }).toBuffer());
    }
    prov({ id: 'data/apod_fallback.json', kind: 'Astronomy Picture of the Day', source: 'https://api.nasa.gov/planetary/apod',
      notes: a.copyright ? `Image copyright: ${a.copyright}` : 'Public domain (NASA)' });
    console.log('APOD:', a.title);
  } catch (e) { console.warn('APOD failed:', e.message); }

  try {
    const list = await get(`https://epic.gsfc.nasa.gov/api/natural`, { type: "json" });
    const e = list[0];
    const [Y, M, D] = e.date.slice(0, 10).split('-');
    const url = `https://epic.gsfc.nasa.gov/archive/natural/${Y}/${M}/${D}/png/${e.image}.png`;
    const img = await get(url);
    await write('textures/earth_epic.jpg', await sharp(img).resize(1024, 1024).jpeg({ quality: 85 }).toBuffer());
    prov({ id: 'textures/earth_epic.jpg', kind: 'Earth full-disk photograph (real, DSCOVR EPIC)', source: url,
      notes: `Taken ${e.date} by NASA's EPIC camera on NOAA's DSCOVR spacecraft.` });
    console.log('EPIC:', e.date);
  } catch (e) { console.warn('EPIC failed:', e.message); }
}

// ---------- PDS & data.nasa.gov metadata for attribution ----------
async function catalogs() {
  const pds = [];
  // PDS4 context products (missions/instruments whose archived data underlie the Trek layers used in the game)
  for (const lid of [
    'urn:nasa:pds:context:instrument:lro.lola',
    'urn:nasa:pds:context:instrument:lro.lroc',
    'urn:nasa:pds:context:investigation:mission.lunar_reconnaissance_orbiter',
    'urn:nasa:pds:context:investigation:mission.mars_science_laboratory',
    'urn:nasa:pds:context:instrument:mro.hirise',
    'urn:nasa:pds:context:investigation:mission.mars_reconnaissance_orbiter',
    'urn:nasa:pds:context:investigation:mission.apollo_15',
  ]) {
    try {
      const d = await get(`https://pds.nasa.gov/api/search/1/products/${lid}`, { type: 'json', tries: 2 });
      const desc = d.properties?.['pds:Investigation.pds:description'] || d.properties?.['pds:Instrument.pds:description'] || d.properties?.['pds:Citation_Information.pds:description'] || [];
      pds.push({ lid, title: d.title, description: (Array.isArray(desc) ? desc[0] : desc || '').toString().replace(/\s+/g, ' ').slice(0, 600) || null });
    } catch (e) { pds.push({ lid, error: e.message }); }
  }
  await write('data/pds_products.json', JSON.stringify(pds, null, 1));
  prov({ id: 'data/pds_products.json', kind: 'PDS product identifiers', source: 'https://pds.nasa.gov/api/search/1/products' });

  try {
    const d = await get('https://data.nasa.gov/api/3/action/package_show?id=apollo-15-lunar-sample-information-catalog', { type: 'json' });
    const r = d.result;
    await write('data/datanasa_apollo15_catalog.json', JSON.stringify({ title: r.title, notes: (r.notes || '').slice(0, 800), resources: r.resources.map(x => ({ format: x.format, url: x.url })) }, null, 1));
    prov({ id: 'data/datanasa_apollo15_catalog.json', kind: 'data.nasa.gov catalog record', source: 'https://data.nasa.gov/dataset/apollo-15-lunar-sample-information-catalog' });
  } catch (e) { console.warn('data.nasa.gov failed:', e.message); }
  console.log('PDS products:', pds.length);
}

// =====================================================================
async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const only = process.argv[2];

  // ---------------- MOON: Apollo 15, Hadley-Apennine ----------------
  // Game origin = between the LM descent stage (3.634E, 26.132N, Trek Apollo15_waypoints) and Hadley Rille.
  const MOON0 = [3.62, 26.09];
  const moonCore = bboxAround(MOON0[0], MOON0[1], 3000, MOON_R);   // 6 km x 6 km playable area
  const moonFar = bboxAround(MOON0[0], MOON0[1], 30000, MOON_R);   // 60 km backdrop (Apennine Mountains)
  if (!only || only === 'moon') {
    const hMC = await exportDEM({ body: 'moon', service: 'LRO_NAC_DEM_26N004E_150cmp', bbox: moonCore, size: 769, outName: 'moon_a15_core', R: MOON_R,
      title: 'LRO LROC NAC DEM, Apollo 15 (1.5 m/px), resampled to ~7.8 m', notes: 'LROC NAC stereo DTM (PDS LROC archive) served by Moon Trek.' });
    const hMF = await exportDEM({ body: 'moon', service: 'LRO_LOLA_DEM_Global_256ppd_v06', bbox: moonFar, size: 385, outName: 'moon_a15_far', R: MOON_R,
      title: 'LRO LOLA global DEM 256 ppd (~118 m/px)', notes: 'LOLA gridded topography (PDS Geosciences) served by Moon Trek.' });
    await stitchWMTS({ body: 'Moon', layer: 'LRO_NAC_Mosaic_26N004E_50cmp', ext: 'png', z: 13, bbox: hb(hMC), outSize: 2048, outName: 'moon_a15_core',
      title: 'LRO LROC NAC Image Mosaic, Apollo 15 (50 cm/px)' });
    await stitchWMTS({ body: 'Moon', layer: 'LRO_WAC_Mosaic_Global_303ppd_v02', ext: 'jpg', z: 8, bbox: hb(hMF), outSize: 1024, outName: 'moon_a15_far',
      title: 'LRO LROC WAC Global Mosaic 303 ppd' });
    await waypointSet({ body: 'moon', service: 'Apollo15_waypoints', outName: 'apollo15_waypoints', bodyLabel: 'Apollo 15', templateBase: 'https://trek.nasa.gov' });
    await waypointSet({ body: 'moon', service: 'Apollo11_waypoints', outName: 'apollo11_waypoints', bodyLabel: 'Apollo 11', templateBase: 'https://trek.nasa.gov' });
    await pathSet({ body: 'moon', service: 'Apollo15_path', outName: 'apollo15_path', attrs: ['name'] });

    // Real science values sampled at the Apollo 15 LM site
    const lm = [3.634, 26.13224];
    const sci = {};
    for (const [key, service, label, unit] of [
      ['feo', 'Lunar_Kaguya_MIMap_MineralDeconv_FeOWeightPercent_50N50S', 'FeO abundance (Kaguya Multiband Imager)', 'wt%'],
      ['plagioclase', 'Lunar_Kaguya_MIMap_MineralDeconv_PlagioclasePercent_50N50S', 'Plagioclase (Kaguya MI)', 'vol%'],
      ['clinopyroxene', 'Lunar_Kaguya_MIMap_MineralDeconv_ClinopyroxenePercent_50N50S', 'Clinopyroxene (Kaguya MI)', 'vol%'],
      ['olivine', 'Lunar_Kaguya_MIMap_MineralDeconv_OlivinePercent_50N50S', 'Olivine (Kaguya MI)', 'vol%'],
      ['omat', 'Lunar_Kaguya_MIMap_MineralDeconv_OpticalMaturityIndex_50N50S', 'Optical maturity index (Kaguya MI)', ''],
      ['thorium', 'LP_GRS_Th_Global_2ppd', 'Thorium (Lunar Prospector GRS, 2 ppd)', 'ppm'],
    ]) {
      const s = await samplePoint('moon', service, lm[0], lm[1]);
      sci[key] = { label, unit, value: s.value, source: s.url };
      console.log(`  sample ${key}: ${s.value}`);
    }
    await write('data/moon_a15_science.json', JSON.stringify({ location: { lon: lm[0], lat: lm[1], name: 'Apollo 15 LM site' }, values: sci }, null, 1));
    prov({ id: 'data/moon_a15_science.json', kind: 'orbital remote-sensing values at the Apollo 15 site (real)', source: 'Moon Trek ImageServer identify',
      notes: 'Null values mean the layer has no coverage or did not answer; the game hides those.' });
  }

  // ---------------- MARS: Gale crater, Bradbury Landing ----------------
  const MARS0 = [137.44, -4.60];
  const marsCore = bboxAround(MARS0[0], MARS0[1], 3000, MARS_R);
  const marsFar = bboxAround(MARS0[0], MARS0[1], 45000, MARS_R);   // 90 km backdrop incl. Mount Sharp foothills & crater rim
  if (!only || only === 'mars') {
    const hRC = await exportDEM({ body: 'mars', service: 'Gale_DEM_SMG_1m', bbox: marsCore, size: 769, outName: 'mars_gale_core', R: MARS_R,
      title: 'MRO HiRISE/CTX Gale Crater DEM (1 m/px), resampled to ~7.8 m', notes: 'Gale DEM served by Mars Trek.' });
    const hRF = await exportDEM({ body: 'mars', service: 'Mars_MOLA_blend200ppx_HRSC_DEM_clon0dd_200mpp_lzw', bbox: marsFar, size: 385, outName: 'mars_gale_far', R: MARS_R,
      title: 'MGS MOLA + Mars Express HRSC blended DEM (200 m/px)', notes: 'Served by Mars Trek.' });
    await exportImage({ body: 'mars', service: 'curiosity_hirise_mosaic', bbox: hb(hRC), size: 2048, outName: 'mars_gale_core',
      title: 'MRO HiRISE mosaic of the Curiosity landing area (grayscale)', notes: 'Grayscale HiRISE. The game tints it with the real Viking colour mosaic.' });
    await stitchWMTS({ body: 'Mars', layer: 'Mars_Viking_MDIM21_ClrMosaic_global_232m', ext: 'jpg', z: 7, bbox: hb(hRF), outSize: 1024, outName: 'mars_gale_far',
      title: 'Viking MDIM 2.1 colour mosaic (232 m/px)' });
    await stitchWMTS({ body: 'Mars', layer: 'Mars_Viking_MDIM21_ClrMosaic_global_232m', ext: 'jpg', z: 8, bbox: hb(hRC), outSize: 256, outName: 'mars_gale_core_color',
      title: 'Viking MDIM 2.1 colour mosaic, core area (for tinting HiRISE)' });
    await waypointSet({ body: 'mars', service: 'curiosity_waypoints', outName: 'curiosity_waypoints', bodyLabel: 'Curiosity (MSL)', templateBase: 'https://trek.nasa.gov/mars' });
    await pathSet({ body: 'mars', service: 'curiosity_path', outName: 'curiosity_path' });
  }

  // ---------------- Globes for the space-travel scenes ----------------
  if (!only || only === 'globes') {
    await stitchWMTS({ body: 'Moon', layer: 'LRO_WAC_Mosaic_Global_303ppd_v02', ext: 'jpg', z: 2, bbox: [-180, -90, 180, 90], outName: 'moon_globe', outW: 2048, outH: 1024,
      title: 'LRO WAC global mosaic (globe texture)' });
    await stitchWMTS({ body: 'Mars', layer: 'Mars_Viking_MDIM21_ClrMosaic_global_232m', ext: 'jpg', z: 2, bbox: [-180, -90, 180, 90], outName: 'mars_globe', outW: 2048, outH: 1024,
      title: 'Viking MDIM 2.1 colour global mosaic (globe texture)' });
  }

  if (!only || only === 'models') await fetchModels();
  if (!only || only === 'api') { await apiSnapshots(); await catalogs(); }

  // merge provenance with any existing file (so partial runs keep earlier entries)
  const pPath = path.join(OUT, 'provenance.json');
  let existing = [];
  try { existing = JSON.parse(await fs.readFile(pPath, 'utf8')).items || []; } catch { }
  const ids = new Set(provenance.map(p => p.id));
  const merged = [...existing.filter(e => !ids.has(e.id)), ...provenance];
  await fs.writeFile(pPath, JSON.stringify({ generated: today, license: 'NASA content is generally not subject to copyright in the United States (NASA Media Usage Guidelines). Credit: NASA and the missions listed. Use of NASA data does not imply NASA endorsement.', items: merged }, null, 1));
  console.log(`provenance: ${merged.length} items`);
}

main().catch(e => { console.error(e); process.exit(1); });
