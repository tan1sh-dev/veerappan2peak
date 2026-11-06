// Rocket ascent in a 2-D vertical plane (altitude / downrange) over a round Earth.
// Uses real g and Earth radius. Stage data are GAMEPLAY APPROXIMATIONS scaled so a launch to orbit
// takes a few minutes; the game also offers time warp.
export const EARTH = { R: 6371000, mu: 3.986004418e14, g0: 9.80665, rho0: 1.225, H: 8500 };

export const ROCKETS = {
  saturn_v: {
    name: 'Saturn V', payloadMass: 30000,
    stages: [
      { name: 'S-IC (stage 1)', dry: 130000, fuel: 2100000, thrust: 35100000, isp: 263 },
      { name: 'S-II (stage 2)', dry: 40000, fuel: 450000, thrust: 9000000, isp: 421 },
      { name: 'S-IVB (stage 3)', dry: 13000, fuel: 125000, thrust: 2000000, isp: 421 },
    ],
    // Real Saturn V: ~35 MN lift-off thrust (S-IC, five F-1 engines), ~111 m tall. Masses above are rounded approximations.
    cdA: 80,
  },
  vx_heavy: {
    name: 'VX-Heavy (game rocket)', payloadMass: 40000,
    stages: [
      { name: 'Core + boosters', dry: 150000, fuel: 2300000, thrust: 40000000, isp: 300 },
      { name: 'Upper stage', dry: 30000, fuel: 450000, thrust: 9000000, isp: 440 },
      { name: 'Transfer stage', dry: 15000, fuel: 200000, thrust: 2200000, isp: 450 },
    ],
    cdA: 90,
  },
};

export function makeAscent(type = 'saturn_v') {
  const r = ROCKETS[type];
  return {
    type, t: 0, stage: 0, fuel: r.stages.map(s => s.fuel),
    // polar coordinates: r (m from Earth centre), theta (rad downrange), vr, vt (m/s)
    r: EARTH.R, theta: 0, vr: 0, vt: 0,
    pitch: 90,        // degrees above local horizon
    throttle: 1, engineOn: false, staged: [], maxQ: 0,
  };
}

export function totalMass(A) {
  const r = ROCKETS[A.type];
  let m = r.payloadMass;
  for (let i = A.stage; i < r.stages.length; i++) m += r.stages[i].dry + A.fuel[i];
  return m;
}

export function altitude(A) { return A.r - EARTH.R; }
export function speed(A) { return Math.hypot(A.vr, A.vt); }

/** Apoapsis & periapsis altitude (m) from the current state vector. */
export function orbit(A) {
  const v2 = A.vr * A.vr + A.vt * A.vt;
  const energy = v2 / 2 - EARTH.mu / A.r;
  const h = A.r * A.vt;
  if (energy >= 0) return { apo: Infinity, peri: null, escape: true };
  const a = -EARTH.mu / (2 * energy);
  const e = Math.sqrt(Math.max(0, 1 + 2 * energy * h * h / (EARTH.mu * EARTH.mu)));
  return { apo: a * (1 + e) - EARTH.R, peri: a * (1 - e) - EARTH.R, escape: false };
}

/** Recommended pitch (guidance cue, degrees above horizon) for the current state:
 *  a gravity-turn profile low down, then closed-loop "hold altitude near the target orbit" higher up. */
export const TARGET_ORBIT = 170000;
export function guidancePitch(A) {
  const alt = altitude(A);
  if (alt < 1500) return 90;
  const profile = 90 * (1 - Math.pow(Math.min(1, (alt - 1500) / 160000), 0.42));
  if (alt < 70000) return profile;
  const R = ROCKETS[A.type], st = R.stages[A.stage];
  const m = totalMass(A);
  const aThr = A.fuel[A.stage] > 0 ? st.thrust / m : 0;
  if (aThr <= 0) return profile;
  const g = EARTH.mu / (A.r * A.r), geff = g - (A.vt * A.vt) / A.r;
  const vrTarget = Math.max(-80, Math.min(400, (TARGET_ORBIT - alt) / 35));
  const aR = geff + (vrTarget - A.vr) * 0.15;
  const sinp = Math.max(-0.4, Math.min(1, aR / aThr));
  return Math.asin(sinp) * 180 / Math.PI;
}

/** True once the vehicle is in a stable orbit (periapsis above 140 km). */
export function inOrbit(A) { const o = orbit(A); return !o.escape && o.peri > 140000; }

export function canStage(A) { return A.stage < ROCKETS[A.type].stages.length - 1; }

export function doStage(A) {
  if (!canStage(A)) return false;
  A.staged.push({ stage: A.stage, t: A.t, alt: altitude(A) });
  A.stage++;
  return true;
}

export function stepAscent(A, dt) {
  const R = ROCKETS[A.type];
  const st = R.stages[A.stage];
  const m = totalMass(A);
  const alt = altitude(A);
  const g = EARTH.mu / (A.r * A.r);
  let thrust = 0;
  if (A.engineOn && A.fuel[A.stage] > 0 && A.throttle > 0) {
    thrust = st.thrust * A.throttle;
    A.fuel[A.stage] = Math.max(0, A.fuel[A.stage] - thrust / (st.isp * EARTH.g0) * dt);
  }
  const p = A.pitch * Math.PI / 180;
  // atmosphere (exponential) drag opposite to velocity relative to the surface
  const rho = alt < 150000 ? EARTH.rho0 * Math.exp(-alt / EARTH.H) : 0;
  const v = speed(A);
  const q = 0.5 * rho * v * v;
  A.maxQ = Math.max(A.maxQ, q);
  const drag = q * R.cdA;
  const dr = v > 0 ? drag * A.vr / v : 0, dtn = v > 0 ? drag * A.vt / v : 0;
  // accelerations in polar frame (including centrifugal / Coriolis terms)
  const ar = (thrust * Math.sin(p) - dr) / m - g + (A.vt * A.vt) / A.r;
  const at = (thrust * Math.cos(p) - dtn) / m - (A.vr * A.vt) / A.r;
  A.vr += ar * dt; A.vt += at * dt;
  A.r += A.vr * dt; A.theta += (A.vt / A.r) * dt;
  if (A.r < EARTH.R) { A.r = EARTH.R; A.vr = Math.max(0, A.vr); if (!A.engineOn || thrust / m < g) A.vt = 0; }
  A.t += dt;
  A.accelG = (thrust / m) / EARTH.g0;
  return A;
}

// Departure burns. Real values: trans-lunar injection ~3.1 km/s, trans-Mars injection ~3.6 km/s from low Earth orbit.
export const DEPARTURE_DV = { moon: 3100, mars: 3600 };

/** Remaining delta-v (m/s) of the current stage, Tsiolkovsky. */
export function stageDeltaV(A) {
  const st = ROCKETS[A.type].stages[A.stage];
  const m0 = totalMass(A), m1 = m0 - A.fuel[A.stage];
  return st.isp * EARTH.g0 * Math.log(m0 / m1);
}

/** Burn prograde in orbit (vacuum) for dt seconds. Returns delta-v gained. */
export function burnPrograde(A, dt) {
  const st = ROCKETS[A.type].stages[A.stage];
  if (A.fuel[A.stage] <= 0) return 0;
  const m = totalMass(A);
  const dm = Math.min(A.fuel[A.stage], st.thrust / (st.isp * EARTH.g0) * dt);
  const dv = st.isp * EARTH.g0 * Math.log(m / (m - dm));
  A.fuel[A.stage] -= dm;
  return dv;
}
