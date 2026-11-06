// Pure height-sampling logic for the real NASA DEMs (no three.js dependency so it can be unit tested).
// World axes: x = east (m), z = south (m), y = up (m). The site origin is the centre of the core DEM,
// and heights are relative to the core DEM's elevation at the origin.

export class Heightfield {
  /**
   * @param {object} hf header + data from Assets.heightfield()
   * @param {number} cx metres east of the site origin of this DEM's centre
   * @param {number} cz metres south of the site origin of this DEM's centre
   */
  constructor(hf, cx = 0, cz = 0) {
    Object.assign(this, hf);
    this.cx = cx; this.cz = cz;
    this.x0 = cx - hf.widthM / 2; this.z0 = cz - hf.heightM / 2;
    this.dx = hf.widthM / (hf.width - 1); this.dz = hf.heightM / (hf.height - 1);
    this.bias = 0; // added to every sample (aligns datums between DEMs)
  }
  contains(x, z, margin = 0) {
    return x >= this.x0 + margin && x <= this.x0 + this.widthM - margin && z >= this.z0 + margin && z <= this.z0 + this.heightM - margin;
  }
  /** Raw elevation (m, DEM datum) with bilinear interpolation, clamped at the edges. */
  raw(x, z) {
    const W = this.width, H = this.height;
    let u = (x - this.x0) / this.dx, v = (z - this.z0) / this.dz;
    u = Math.min(Math.max(u, 0), W - 1.0001); v = Math.min(Math.max(v, 0), H - 1.0001);
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const d = this.data, k = j * W + i;
    const a = d[k], b = d[k + 1], c = d[k + W], e = d[k + W + 1];
    return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + e * fu) * fv + this.bias;
  }
  /** Geographic coordinate of a world position. */
  lonLat(x, z) {
    const lon = this.lonMin + (x - this.x0) / this.widthM * (this.lonMax - this.lonMin);
    const lat = this.latMax - (z - this.z0) / this.heightM * (this.latMax - this.latMin);
    return [lon, lat];
  }
}

/** Combines a detailed core DEM with a wide, coarse backdrop DEM into one continuous ground. */
export class TerrainSite {
  constructor(coreHf, farHf, blendCells = 24) {
    const lat0 = (coreHf.latMin + coreHf.latMax) / 2;
    const R = coreHf.bodyRadius;
    this.mPerDegLat = Math.PI / 180 * R;
    this.mPerDegLon = this.mPerDegLat * Math.cos(lat0 * Math.PI / 180);
    this.lon0 = (coreHf.lonMin + coreHf.lonMax) / 2;
    this.lat0 = lat0;
    this.core = new Heightfield(coreHf, 0, 0);
    const fLon = (farHf.lonMin + farHf.lonMax) / 2, fLat = (farHf.latMin + farHf.latMax) / 2;
    this.far = new Heightfield(farHf, (fLon - this.lon0) * this.mPerDegLon, -(fLat - this.lat0) * this.mPerDegLat);
    // Height reference: core elevation at the origin
    this.originElevation = this.core.raw(0, 0);
    this.core.bias = -this.originElevation;
    // Align far DEM datum to the core along the core border
    let diff = 0, n = 0;
    const hw = this.core.widthM / 2 - 5, hh = this.core.heightM / 2 - 5;
    for (let t = -1; t <= 1; t += 0.05) {
      for (const [x, z] of [[t * hw, -hh], [t * hw, hh], [-hw, t * hh], [hw, t * hh]]) {
        diff += this.core.raw(x, z) - (this.far.raw(x, z) - this.originElevation); n++;
      }
    }
    this.far.bias = -this.originElevation + diff / n;
    this.blendM = blendCells * this.core.dx;
  }
  /** World x/z (m) of a geographic coordinate. */
  toWorld(lon, lat) { return [(lon - this.lon0) * this.mPerDegLon, -(lat - this.lat0) * this.mPerDegLat]; }
  toLonLat(x, z) { return [this.lon0 + x / this.mPerDegLon, this.lat0 - z / this.mPerDegLat]; }
  /** Ground height (m) at world x/z. */
  height(x, z) {
    const c = this.core;
    if (!c.contains(x, z)) return this.far.raw(x, z);
    const edge = Math.min(x - c.x0, c.x0 + c.widthM - x, z - c.z0, c.z0 + c.heightM - z);
    const hc = c.raw(x, z);
    if (edge >= this.blendM) return hc;
    const t = edge / this.blendM, s = t * t * (3 - 2 * t);
    return hc * s + this.far.raw(x, z) * (1 - s);
  }
  /** Unit normal [nx, ny, nz] from central differences. */
  normal(x, z, e = 2) {
    const hx = this.height(x + e, z) - this.height(x - e, z);
    const hz = this.height(x, z + e) - this.height(x, z - e);
    const nx = -hx, ny = 2 * e, nz = -hz;
    const l = Math.hypot(nx, ny, nz);
    return [nx / l, ny / l, nz / l];
  }
  /** Slope in degrees. */
  slope(x, z) { const n = this.normal(x, z); return Math.acos(Math.min(1, n[1])) * 180 / Math.PI; }
  inCore(x, z, margin = 30) { return this.core.contains(x, z, margin); }
}
