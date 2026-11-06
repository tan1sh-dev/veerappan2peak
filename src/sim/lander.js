// Powered-descent lander physics — simplified, but uses real surface gravity.
// Engine/mass values are GAMEPLAY APPROXIMATIONS inspired by the Apollo LM descent engine (~45 kN max thrust).
export const LANDER = {
  dryMass: 7000,            // kg (approx)
  fuelMass: 3000,           // kg (approx, reduced for a short game descent)
  maxThrust: 45000,         // N  (Apollo LM descent engine was ~45 kN)
  isp: 311,                 // s  (Apollo LM descent engine specific impulse)
  rcsAccel: 1.2,            // m/s^2 lateral translation
  rcsFuelPerSec: 1.5,       // kg/s
  safe: { vSpeed: 3.0, hSpeed: 1.5, slope: 12 },
};
const G0 = 9.80665;

export function makeLander(opts = {}) {
  return {
    pos: { x: 0, y: 1200, z: 0 }, vel: { x: 0, y: -25, z: 0 },
    fuel: LANDER.fuelMass, throttle: 0, firing: false, landed: false, crashed: false, ...opts,
  };
}

/**
 * Step the lander. input: {throttle 0..1, fire bool, rx, rz (-1..1 RCS translation)}.
 * env: {g, groundHeight(x,z), drag (Mars thin-atmosphere linear drag coefficient)}
 */
export function stepLander(L, input, env, dt) {
  if (L.landed || L.crashed) return L;
  const mass = LANDER.dryMass + L.fuel;
  let ay = -env.g, ax = 0, az = 0;
  L.throttle = Math.max(0, Math.min(1, input.throttle ?? L.throttle));
  L.firing = !!input.fire && L.fuel > 0 && L.throttle > 0;
  if (L.firing) {
    const thrust = LANDER.maxThrust * L.throttle;
    ay += thrust / mass;
    L.fuel = Math.max(0, L.fuel - thrust / (LANDER.isp * G0) * dt);
  }
  if ((input.rx || input.rz) && L.fuel > 0) {
    ax += (input.rx || 0) * LANDER.rcsAccel; az += (input.rz || 0) * LANDER.rcsAccel;
    L.fuel = Math.max(0, L.fuel - LANDER.rcsFuelPerSec * dt * Math.min(1, Math.abs(input.rx || 0) + Math.abs(input.rz || 0)));
  }
  if (env.drag) { ax -= L.vel.x * env.drag; ay -= L.vel.y * env.drag; az -= L.vel.z * env.drag; }
  L.vel.x += ax * dt; L.vel.y += ay * dt; L.vel.z += az * dt;
  L.pos.x += L.vel.x * dt; L.pos.y += L.vel.y * dt; L.pos.z += L.vel.z * dt;
  const gh = env.groundHeight(L.pos.x, L.pos.z);
  if (L.pos.y <= gh) {
    L.pos.y = gh;
    const vs = -L.vel.y, hs = Math.hypot(L.vel.x, L.vel.z);
    const slope = env.slope ? env.slope(L.pos.x, L.pos.z) : 0;
    L.touchdown = { vSpeed: vs, hSpeed: hs, slope };
    if (vs <= LANDER.safe.vSpeed && hs <= LANDER.safe.hSpeed && slope <= LANDER.safe.slope) L.landed = true;
    else L.crashed = true;
    L.vel = { x: 0, y: 0, z: 0 }; L.firing = false;
  }
  return L;
}

/** Thrust-to-weight ratio at full throttle for the current mass. */
export function twr(L, g) { return LANDER.maxThrust / ((LANDER.dryMass + L.fuel) * g); }
