// Suit consumables model — GAMEPLAY APPROXIMATION.
// Real EVA suits (e.g. the Apollo A7LB PLSS) supported ~7–8 hours; the game compresses this so missions stay short.
export const SUIT_RATES = {
  o2PerSec: 100 / 900,        // full tank lasts 15 minutes of game time at rest
  o2SprintFactor: 1.8,
  powerPerSec: 100 / 1200,
  flashlightPower: 0.05,
  scannerPower: 0.2,
  integrityFallDamagePerMs: 6, // damage per m/s of impact speed above the threshold
  fallThreshold: { moon: 5.0, mars: 4.0, earth: 3.5 },
};

export function makeSuit() { return { o2: 100, power: 100, integrity: 100 }; }

/** Advance consumables. flags: {sprint, flashlight, scanning, refill} */
export function tickSuit(s, dt, flags = {}) {
  if (flags.refill) {
    s.o2 = Math.min(100, s.o2 + 25 * dt); s.power = Math.min(100, s.power + 20 * dt);
    return s;
  }
  let o2 = SUIT_RATES.o2PerSec * (flags.sprint ? SUIT_RATES.o2SprintFactor : 1);
  if (s.integrity < 50) o2 *= 1 + (50 - s.integrity) / 50; // leaks
  s.o2 = Math.max(0, s.o2 - o2 * dt);
  let p = SUIT_RATES.powerPerSec + (flags.flashlight ? SUIT_RATES.flashlightPower : 0) + (flags.scanning ? SUIT_RATES.scannerPower : 0);
  s.power = Math.max(0, s.power - p * dt);
  return s;
}

/** Apply landing impact. Returns damage dealt. */
export function impactDamage(s, impactSpeed, body) {
  const th = SUIT_RATES.fallThreshold[body] ?? 4;
  if (impactSpeed <= th) return 0;
  const dmg = (impactSpeed - th) * SUIT_RATES.integrityFallDamagePerMs;
  s.integrity = Math.max(0, s.integrity - dmg);
  return dmg;
}
