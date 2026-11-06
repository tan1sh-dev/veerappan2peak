// Mission definitions + a small event-driven mission engine (pure logic, unit tested).
// Objectives complete on game events, e.g. 'talk:rao', 'scan:a15_lmds', 'reach:base', 'landed:moon'.
import { BODIES, SOURCES } from '../data/catalog.js';

export const MISSIONS = [
  {
    id: 'm1', name: 'FIRST LANDING', site: 'moon', start: 'earth', rocket: 'saturn_v',
    summary: 'Launch from Earth, fly to the Moon and land at Hadley–Apennine, the region Apollo 15 explored in 1971. Then step outside and explore.',
    equipment: ['EVA suit (15 min O2)', 'Saturn V launch vehicle (NASA model)', 'VX-1 crew lander (game model)', 'Handheld scanner'],
    resources: 'Lander propellant: 3,000 kg (approx). Suit O2: 15 min (game-compressed).',
    environment: [
      { label: 'Surface gravity', value: '1.62 m/s² (16.5% of Earth)', data: 'nasa', source: SOURCES.factsheet },
      { label: 'Temperature', value: BODIES.moon.surfaceTemp, data: 'nasa', source: SOURCES.factsheet },
      { label: 'Atmosphere', value: 'None. No sound carries, so radio is your only voice.', data: 'nasa', source: SOURCES.factsheet },
      { label: 'Terrain', value: 'Real LRO elevation & imagery of Hadley Rille', data: 'nasa', source: SOURCES.trek },
    ],
    objectives: [
      { id: 'brief', text: 'Get the flight briefing from Commander Rao', event: 'talk:rao', target: 'npc:rao' },
      { id: 'board', text: 'Take the crew access arm elevator and board', event: 'boarded', after: ['brief'], target: 'board' },
      { id: 'preflight', text: 'Complete the cockpit pre-launch checklist', event: 'preflight', after: ['board'] },
      { id: 'orbit', text: 'Fly the ascent and reach Earth orbit', event: 'orbit', after: ['preflight'] },
      { id: 'tli', text: 'Burn for trans-lunar injection', event: 'departure', after: ['orbit'] },
      { id: 'mcc', text: 'Perform the mid-course correction', event: 'mcc', after: ['tli'] },
      { id: 'land', text: 'Land near Hadley Base (touchdown under 3 m/s)', event: 'landed:moon', after: ['mcc'] },
      { id: 'capcom', text: 'Report to CAPCOM (press R for radio)', event: 'talk:mitchell', after: ['land'] },
      { id: 'base', text: 'Walk to Hadley Base', event: 'reach:base', after: ['capcom'], target: 'base' },
      { id: 'okafor', text: 'Meet Dr. Okafor at the base', event: 'talk:okafor', after: ['base'], target: 'npc:okafor' },
      { id: 'rim', text: 'Reach the rille rim (Apollo 15 Station 9A)', event: 'reach:wp:9A', after: ['okafor'], target: 'wp:9A' },
      { id: 'scanrim', text: 'Scan the regolith at the rim (Q, hold on ground)', event: 'scanGround', after: ['rim'] },
      { id: 'sample', text: 'Optional: collect a rock sample (E on a glowing rock)', event: 'sample', after: ['okafor'], optional: true },
    ],
    rewards: { research: 100, unlock: ['m2'], locations: ['moon'] },
  },
  {
    id: 'm2', name: 'LOST EQUIPMENT', site: 'moon', start: 'moon',
    summary: 'Find and inspect equipment left on the surface: the real Apollo 15 hardware, still where the astronauts left it, and debris from a failed robotic scout.',
    equipment: ['LRV-2 rover (game model)', 'Handheld scanner'],
    resources: 'Rover battery 100% (approx 25 min of driving).',
    environment: [
      { label: 'Hardware positions', value: 'Apollo 15 LM, LRV and ALSEP at their real coordinates', data: 'nasa', source: SOURCES.trek },
      { label: 'Heritage rule', value: 'Historic sites may be scanned but not disturbed', data: 'approx', source: 'Inspired by NASA\'s 2011 recommendations for protecting U.S. lunar artefacts' },
    ],
    objectives: [
      { id: 'eng', text: 'Talk to Engineer Lindqvist about the rover', event: 'talk:lindqvist', target: 'npc:lindqvist' },
      { id: 'rover', text: 'Get in the LRV-2 rover (E)', event: 'enterRover', after: ['eng'], target: 'rover' },
      { id: 'lm', text: 'Scan the Apollo 15 LM descent stage "Falcon"', event: 'scan:a15_lmds', after: ['rover'], target: 'equip:a15_lmds' },
      { id: 'lrv', text: 'Scan the Apollo 15 Lunar Roving Vehicle', event: 'scan:a15_lrv', after: ['rover'], target: 'equip:a15_lrv' },
      { id: 'alsep', text: 'Scan the ALSEP science station', event: 'scan:a15_alsep', after: ['rover'], target: 'equip:a15_alsep' },
      { id: 'lrrr', text: 'Optional: scan the laser retroreflector', event: 'scan:a15_lrrr', after: ['rover'], optional: true, target: 'equip:a15_lrrr' },
      { id: 'debris', text: 'Scan 3 pieces of Pathfinder-H debris', event: 'scanDebris', count: 3, after: ['rover'] },
      { id: 'return', text: 'Return to Hadley Base', event: 'reach:base', after: ['lm', 'lrv', 'alsep', 'debris'], target: 'base' },
      { id: 'report', text: 'Report your findings to Dr. Okafor', event: 'talk:okafor', after: ['return'], target: 'npc:okafor' },
    ],
    rewards: { research: 150, unlock: ['m3'] },
  },
  {
    id: 'm3', name: 'RECOVERY OPERATION', site: 'moon', start: 'moon', timeLimit: 900,
    summary: 'A solar particle event is forecast. Before it arrives, recover the reusable scout debris and recycle it at Hadley Base.',
    equipment: ['LRV-2 rover', 'Scanner', 'Recycler at Hadley Base'],
    resources: 'Inventory capacity: 12 objects.',
    environment: [
      { label: 'Radiation', value: 'Solar particle events are real hazards for crews outside Earth\'s magnetic field. NASA tracks them with the DONKI service (api.nasa.gov).', data: 'nasa', source: 'NASA DONKI (api.nasa.gov)' },
      { label: 'This storm', value: 'The 15-minute warning is fictional (gameplay)', data: 'approx', source: 'Game' },
    ],
    objectives: [
      { id: 'brief', text: 'Get the recovery plan from Engineer Lindqvist', event: 'talk:lindqvist', target: 'npc:lindqvist' },
      { id: 'collect', text: 'Recover 4 pieces of scout debris (scan, then E)', event: 'collect', count: 4, after: ['brief'] },
      { id: 'recycle', text: 'Recycle them at the base recycler', event: 'recycle', after: ['collect'], target: 'recycler' },
      { id: 'shelter', text: 'Shelter inside the habitat airlock', event: 'reach:airlock', after: ['recycle'], target: 'airlock' },
    ],
    rewards: { research: 150, materials: { aluminium: 2 }, unlock: ['m4'] },
  },
  {
    id: 'm4', name: 'ROVER EXPLORATION', site: 'moon', start: 'moon',
    summary: 'Drive across the rough mare and up the flank of Hadley Delta to the real Apollo 15 geology stations, and collect samples for the lab.',
    equipment: ['LRV-2 rover', 'Sample bags'],
    resources: 'Rover battery: about 25 min of driving (approx). Recharge at base.',
    environment: [
      { label: 'Stations', value: 'Apollo 15 Stations 1, 2 and Elbow Crater at their real positions', data: 'nasa', source: SOURCES.trek },
      { label: 'Real LRV', value: 'The Apollo 15 rover covered ~28 km over three EVAs', data: 'nasa', source: 'NASA Apollo 15 mission records' },
    ],
    objectives: [
      { id: 'rover', text: 'Board the LRV-2', event: 'enterRover', target: 'rover' },
      { id: 'elbow', text: 'Drive to Elbow Crater', event: 'reach:wp:Elbow Crater', after: ['rover'], target: 'wp:Elbow Crater' },
      { id: 's1', text: 'Reach Apollo 15 Station 1', event: 'reach:wp:1', after: ['rover'], target: 'wp:1' },
      { id: 's2', text: 'Climb to Station 2 on the flank of Hadley Delta', event: 'reach:wp:2', after: ['rover'], target: 'wp:2' },
      { id: 'samples', text: 'Collect 3 rock samples near the stations', event: 'sample', count: 3, after: ['rover'] },
      { id: 'home', text: 'Bring the samples back to Hadley Base', event: 'reach:base', after: ['elbow', 's1', 's2', 'samples'], target: 'base' },
      { id: 'lab', text: 'Hand the samples to Dr. Okafor', event: 'talk:okafor', after: ['home'], target: 'npc:okafor' },
    ],
    rewards: { research: 250, unlock: ['m5'], spacecraft: ['vx_heavy'], locations: ['mars'] },
  },
  {
    id: 'm5', name: 'MARS EXPEDITION', site: 'mars', start: 'earth', rocket: 'vx_heavy',
    summary: 'Launch on the VX-Heavy, cross interplanetary space, survive entry, descent and landing in Gale Crater near Curiosity\'s landing site, and set up the first outpost.',
    equipment: ['VX-Heavy (game rocket)', 'Entry capsule with heat shield & parachute (game model)', 'Outpost kit (habitat + solar array materials)'],
    resources: 'Outpost kit delivered with you: aluminium 6, polymers 2, solar cells 4 (enough for the Habitat and Solar Array).',
    environment: [
      { label: 'Surface gravity', value: '3.71 m/s² (38% of Earth)', data: 'nasa', source: SOURCES.factsheet },
      { label: 'Atmosphere', value: BODIES.mars.atmosphere, data: 'nasa', source: SOURCES.factsheet },
      { label: 'Weather', value: 'Live/archived InSight readings shown in the Scanner', data: 'nasa', source: SOURCES.insight },
      { label: 'Cruise time', value: 'Curiosity took 254 days (launch 26 Nov 2011, landing 6 Aug 2012). Compressed here.', data: 'nasa', source: SOURCES.msl },
    ],
    objectives: [
      { id: 'brief', text: 'Get the Mars briefing from Commander Rao', event: 'talk:rao', target: 'npc:rao' },
      { id: 'board', text: 'Board the VX-Heavy', event: 'boarded', after: ['brief'], target: 'board' },
      { id: 'preflight', text: 'Complete the pre-launch checklist', event: 'preflight', after: ['board'] },
      { id: 'orbit', text: 'Reach Earth orbit', event: 'orbit', after: ['preflight'] },
      { id: 'tmi', text: 'Burn for trans-Mars injection', event: 'departure', after: ['orbit'] },
      { id: 'mcc', text: 'Perform the mid-course correction', event: 'mcc', after: ['tmi'] },
      { id: 'chute', text: 'Deploy the parachute in the safe window', event: 'chute', after: ['mcc'] },
      { id: 'land', text: 'Land safely in Gale Crater', event: 'landed:mars', after: ['chute'] },
      { id: 'chen', text: 'Meet Flight Engineer Chen at the outpost site', event: 'talk:chen', after: ['land'], target: 'npc:chen' },
      { id: 'hab', text: 'Build the Habitat Module (B at the build pad)', event: 'build:habitat', after: ['chen'], target: 'buildpad' },
      { id: 'solar', text: 'Build the Solar Array', event: 'build:solar', after: ['chen'], target: 'buildpad' },
      { id: 'heat', text: 'Scan Curiosity\'s discarded heat shield', event: 'scan:msl_heatshield', after: ['chen'], target: 'equip:msl_heatshield', optional: true },
      { id: 'weather', text: 'Scan the ground for the weather report', event: 'scanGround', after: ['chen'] },
    ],
    rewards: { research: 300, unlock: ['m6'] },
    grantOnLanding: { aluminium: 6, polymers: 2, solarCells: 4 },
  },
  {
    id: 'm6', name: 'BUILD THE FUTURE', site: 'mars', start: 'mars',
    summary: 'Turn the outpost into a working research station by recovering old hardware, recycling it and building the remaining modules.',
    equipment: ['Pressurised rover (game model)', 'Recycler', 'Construction drones'],
    resources: 'Everything you recover and recycle.',
    environment: [
      { label: 'Oxygen from CO2', value: 'NASA\'s MOXIE on Perseverance made oxygen from Martian air (2021–2023)', data: 'nasa', source: 'NASA Mars 2020 mission' },
      { label: 'Yields', value: 'Recycling yields are game approximations', data: 'approx', source: 'Game' },
    ],
    objectives: [
      { id: 'plan', text: 'Review the station plan with Engineer Lindqvist', event: 'talk:lindqvist', target: 'npc:lindqvist' },
      { id: 'collect', text: 'Recover 4 pieces of debris', event: 'collect', count: 4, after: ['plan'] },
      { id: 'recycle', text: 'Recycle at the outpost', event: 'recycle', after: ['collect'], target: 'recycler' },
      { id: 'samples', text: 'Collect 2 geology samples for research', event: 'sample', count: 2, after: ['plan'] },
      { id: 'comms', text: 'Build the Comms Tower', event: 'build:comms', after: ['plan'], target: 'buildpad' },
      { id: 'lab', text: 'Build the Science Lab', event: 'build:lab', after: ['plan'], target: 'buildpad' },
      { id: 'isru', text: 'Build the Oxygen Plant (ISRU)', event: 'build:isru', after: ['plan'], target: 'buildpad' },
      { id: 'final', text: 'Report the station operational to Commander Rao', event: 'talk:rao', after: ['comms', 'lab', 'isru'], target: 'npc:rao' },
    ],
    rewards: { research: 500, unlock: [] },
  },
];

export function missionById(id) { return MISSIONS.find(m => m.id === id); }

export class MissionRun {
  constructor(def) {
    this.def = def;
    this.progress = {};      // objective id -> count
    this.done = new Set();
    this.failed = null;
    this.complete = false;
    this.elapsed = 0;
    this.revealed = new Set();
  }
  isActive(o) { return !this.done.has(o.id) && (o.after || []).every(a => this.done.has(a)); }
  active() { return this.def.objectives.filter(o => this.isActive(o) && (!o.hidden || this.revealed.has(o.id))); }
  required() { return this.def.objectives.filter(o => !o.optional); }
  /** Feed a game event; returns list of objectives completed by it. */
  event(name, n = 1) {
    if (this.complete || this.failed) return [];
    const doneNow = [];
    for (const o of this.def.objectives) {
      if (!this.isActive(o) || o.event !== name) continue;
      const need = o.count || 1;
      this.progress[o.id] = (this.progress[o.id] || 0) + n;
      if (this.progress[o.id] >= need) { this.done.add(o.id); doneNow.push(o); }
    }
    if (this.required().every(o => this.done.has(o.id))) this.complete = true;
    return doneNow;
  }
  tick(dt) {
    if (this.complete || this.failed) return;
    this.elapsed += dt;
    if (this.def.timeLimit && this.elapsed >= this.def.timeLimit) this.fail('Time ran out: the solar particle event arrived before you were done.');
  }
  timeLeft() { return this.def.timeLimit ? Math.max(0, this.def.timeLimit - this.elapsed) : null; }
  fail(reason) { if (!this.complete) this.failed = reason; }
  /** Mark objectives as done (used when resuming a mission at a later stage, e.g. after a skipped transit). */
  forceDone(ids) { ids.forEach(id => this.done.add(id)); }
}

/** Applies rewards & unlocks to the save state. Returns a summary. */
export function applyRewards(state, def, run) {
  const r = def.rewards || {};
  const firstTime = !state.missions.completed[def.id];
  const research = firstTime ? (r.research || 0) : Math.round((r.research || 0) * 0.25);
  state.research += research;
  for (const [k, v] of Object.entries(r.materials || {})) state.inventory.materials[k] = (state.inventory.materials[k] || 0) + v;
  for (const m of r.unlock || []) if (!state.missions.unlocked.includes(m)) state.missions.unlocked.push(m);
  for (const l of r.locations || []) if (!state.locations.unlocked.includes(l)) state.locations.unlocked.push(l);
  for (const s of r.spacecraft || []) if (!state.spacecraft.includes(s)) state.spacecraft.push(s);
  const best = state.missions.completed[def.id];
  state.missions.completed[def.id] = { time: Math.round(run.elapsed), best: best ? Math.min(best.best || 1e9, Math.round(run.elapsed)) : Math.round(run.elapsed), optional: def.objectives.filter(o => o.optional && run.done.has(o.id)).length };
  return { research, firstTime, unlocked: r.unlock || [], locations: r.locations || [], spacecraft: r.spacecraft || [] };
}
