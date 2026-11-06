import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { MISSIONS, MissionRun, applyRewards, missionById } from '../src/gameplay/missions.js';
import { newGameState, validateState } from '../src/core/SaveSystem.js';
import { recordScan, collectItem, recycleAll, buildModule, canAfford, addSample, INVENTORY_CAPACITY } from '../src/gameplay/economy.js';
import { EQUIPMENT, MODULES, SAMPLE_TYPES, BODIES } from '../src/data/catalog.js';
import { makeSuit, tickSuit, impactDamage } from '../src/sim/suit.js';
import { makeLander, stepLander, LANDER } from '../src/sim/lander.js';
import { makeAscent, stepAscent, guidancePitch, canStage, doStage, inOrbit, stageDeltaV, DEPARTURE_DV, burnPrograde } from '../src/sim/ascent.js';
import { TerrainSite } from '../src/world/Heightfield.js';
import { getDialogue } from '../src/gameplay/dialogues.js';

const loadHF = n => ({ ...JSON.parse(fs.readFileSync(`public/assets/terrain/${n}.json`)), data: new Float32Array(fs.readFileSync(`public/assets/terrain/${n}.bin`).buffer.slice(0)) });

describe('real NASA terrain', () => {
  it('Apollo 15 DEM decodes with plausible elevations and the real hardware lies inside it', () => {
    const c = loadHF('moon_a15_core');
    expect(c.data.length).toBe(c.width * c.height);
    expect(c.min).toBeGreaterThan(-2400); expect(c.max).toBeLessThan(-1500);  // LROC NAC DEM range at Hadley
    const site = new TerrainSite(c, loadHF('moon_a15_far'));
    const wps = JSON.parse(fs.readFileSync('public/assets/data/apollo15_waypoints.json'));
    const lm = wps.find(w => w.name === 'Lunar Module Descent Stage');
    const [x, z] = site.toWorld(lm.lon, lm.lat);
    expect(site.inCore(x, z)).toBe(true);
    // Hadley Rille: ~300 m deep west of the LM
    let lo = Infinity; for (let xx = -2900; xx < -1500; xx += 50) lo = Math.min(lo, site.height(xx, z));
    expect(lo).toBeLessThan(-200);
    // round trip lon/lat
    const [lon, lat] = site.toLonLat(x, z);
    expect(lon).toBeCloseTo(lm.lon, 5); expect(lat).toBeCloseTo(lm.lat, 5);
  });
  it('Gale DEM decodes and Bradbury Landing is inside the core', () => {
    const site = new TerrainSite(loadHF('mars_gale_core'), loadHF('mars_gale_far'));
    const wps = JSON.parse(fs.readFileSync('public/assets/data/curiosity_waypoints.json'));
    const b = wps.find(w => w.name === 'Bradbury Landing');
    const [x, z] = site.toWorld(b.lon, b.lat);
    expect(site.inCore(x, z)).toBe(true);
    expect(Math.abs(site.height(x, z))).toBeLessThan(200);
    // continuity across the core/far border (no cliff seams)
    const e = site.core.widthM / 2;
    expect(Math.abs(site.height(e - 1, 0) - site.height(e + 1, 0))).toBeLessThan(25);
  });
  it('every data file referenced in provenance exists', () => {
    const prov = JSON.parse(fs.readFileSync('public/assets/provenance.json'));
    expect(prov.items.length).toBeGreaterThan(20);
    for (const p of prov.items) {
      const f = p.id.includes('.') ? p.id : p.id + '.bin';
      expect(fs.existsSync('public/assets/' + f) || fs.existsSync('data-src/' + f), p.id).toBe(true);
    }
  });
});

describe('mission engine', () => {
  it('completes M1 when all required events fire in order', () => {
    const def = missionById('m1'); const run = new MissionRun(def);
    for (const ev of ['talk:rao', 'boarded', 'preflight', 'orbit', 'departure', 'mcc', 'landed:moon', 'talk:mitchell', 'reach:base', 'talk:okafor', 'reach:wp:9A', 'scanGround']) run.event(ev);
    expect(run.complete).toBe(true);
  });
  it('respects objective dependencies', () => {
    const run = new MissionRun(missionById('m1'));
    run.event('boarded');               // before the briefing: ignored
    expect(run.done.has('board')).toBe(false);
  });
  it('counts objectives and times out', () => {
    const run = new MissionRun(missionById('m3'));
    run.event('talk:lindqvist'); run.event('collect'); run.event('collect');
    expect(run.progress.collect).toBe(2); expect(run.done.has('collect')).toBe(false);
    run.tick(10000); expect(run.failed).toBeTruthy();
  });
  it('applies rewards and unlocks the next mission', () => {
    const st = newGameState(); const def = missionById('m4'); const run = new MissionRun(def);
    applyRewards(st, def, run);
    expect(st.missions.unlocked).toContain('m5'); expect(st.spacecraft).toContain('vx_heavy'); expect(st.locations.unlocked).toContain('mars');
  });
  it('every mission is reachable through the unlock chain', () => {
    const reach = new Set(['m1']);
    for (const m of MISSIONS) if (reach.has(m.id)) (m.rewards.unlock || []).forEach(u => reach.add(u));
    expect(reach.size).toBe(MISSIONS.length);
  });
  it('every NPC objective has a dialogue that fires its event', () => {
    for (const m of MISSIONS) for (const o of m.objectives) {
      if (!o.event.startsWith('talk:')) continue;
      const npc = o.event.slice(5);
      const done = new Set(m.objectives.filter(x => x !== o && (o.after || []).includes(x.id)).map(x => x.id));
      // mark everything except this and later objectives as done
      const idx = m.objectives.indexOf(o);
      m.objectives.slice(0, idx).forEach(x => done.add(x.id));
      const tree = getDialogue(npc, { mission: m.id, done: id => done.has(id), flag: () => false, site: m.site });
      const events = Object.values(tree.nodes).flatMap(n => n.choices.map(c => c.effects?.event)).filter(Boolean);
      expect(events, `${m.id}:${o.id}`).toContain(o.event);
    }
  });
});

describe('economy', () => {
  it('heritage hardware can be scanned but never collected', () => {
    const st = newGameState();
    expect(recordScan(st, 'a15_lmds')).toBeGreaterThan(0);
    expect(collectItem(st, 'a15_lmds').ok).toBe(false);
  });
  it('debris must be scanned before collecting; recycling yields materials', () => {
    const st = newGameState();
    expect(collectItem(st, 'ph_solar').ok).toBe(false);
    recordScan(st, 'ph_solar');
    expect(collectItem(st, 'ph_solar').ok).toBe(true);
    const r = recycleAll(st);
    expect(r.gained.solarCells).toBe(3); expect(st.inventory.items.length).toBe(0);
  });
  it('inventory capacity is enforced', () => {
    const st = newGameState();
    for (let i = 0; i < INVENTORY_CAPACITY; i++) addSample(st, 'regolith', 'x');
    expect(addSample(st, 'regolith', 'x').ok).toBe(false);
  });
  it('the M5 outpost kit builds the Habitat and Solar Array', () => {
    const st = newGameState(); st.research = 1000;
    for (const [k, v] of Object.entries(missionById('m5').grantOnLanding)) st.inventory.materials[k] += v;
    expect(buildModule(st, 'mars', 'habitat').ok).toBe(true);
    expect(buildModule(st, 'mars', 'solar').ok).toBe(true);
  });
  it('Mars debris alone provides enough material for the M6 modules', () => {
    const st = newGameState(); st.research = 1000;
    for (const e of EQUIPMENT.filter(e => e.site === 'mars' && e.collectible)) { recordScan(st, e.id); collectItem(st, e.id); }
    recycleAll(st);
    for (const m of ['comms', 'lab', 'isru']) expect(buildModule(st, 'mars', m).ok, m).toBe(true);
  });
  it('every equipment entry has the required descriptive fields', () => {
    for (const e of EQUIPMENT) for (const k of ['name', 'purpose', 'condition', 'reuse', 'impact']) expect(e[k], `${e.id}.${k}`).toBeTruthy();
  });
  it('all sample references cite a source', () => { for (const t of Object.values(SAMPLE_TYPES)) expect(t.reference.source).toBeTruthy(); });
});

describe('save system', () => {
  it('round-trips and repairs missing fields', () => {
    const st = newGameState(); st.research = 42; delete st.station; st.inventory.materials.titanium = undefined;
    const back = validateState(JSON.parse(JSON.stringify(st)));
    expect(back.research).toBe(42); expect(back.station.moon).toEqual([]); expect(back.inventory.materials.titanium).toBe(0);
    expect(validateState({ version: 999 })).toBeNull();
  });
});

describe('physics', () => {
  it('suit drains and refills', () => {
    const s = makeSuit(); tickSuit(s, 60); expect(s.o2).toBeLessThan(100); tickSuit(s, 10, { refill: true }); expect(s.o2).toBe(100);
    expect(impactDamage(s, 3, 'moon')).toBe(0); expect(impactDamage(s, 10, 'moon')).toBeGreaterThan(0);
  });
  it('lander falls with real lunar gravity and can land softly', () => {
    const L = makeLander({ pos: { x: 0, y: 100, z: 0 }, vel: { x: 0, y: 0, z: 0 } });
    stepLander(L, { throttle: 0 }, { g: BODIES.moon.g, groundHeight: () => 0 }, 1);
    expect(L.vel.y).toBeCloseTo(-1.62, 2);
    // simple controller
    const M = makeLander({ pos: { x: 0, y: 1400, z: 0 }, vel: { x: 0, y: -28, z: 0 } });
    for (let i = 0; i < 20000 && !M.landed && !M.crashed; i++) {
      const target = -Math.max(1.2, Math.min(40, M.pos.y / 12));
      stepLander(M, { throttle: 1, fire: M.vel.y < target }, { g: BODIES.moon.g, groundHeight: () => 0 }, 1 / 30);
    }
    expect(M.landed).toBe(true); expect(M.fuel).toBeGreaterThan(0);
  });
  it('rockets reach orbit on the guidance cue with enough delta-v left for departure', () => {
    for (const [type, dest] of [['saturn_v', 'moon'], ['vx_heavy', 'mars']]) {
      const A = makeAscent(type); A.engineOn = true;
      while (A.t < 1500 && !inOrbit(A)) { A.pitch = guidancePitch(A); stepAscent(A, 0.05); if (A.fuel[A.stage] <= 0 && canStage(A)) doStage(A); }
      expect(inOrbit(A), type).toBe(true);
      expect(stageDeltaV(A)).toBeGreaterThan(DEPARTURE_DV[dest]);
      let dv = 0; while (dv < DEPARTURE_DV[dest] && A.fuel[A.stage] > 0) dv += burnPrograde(A, 0.5);
      expect(dv).toBeGreaterThanOrEqual(DEPARTURE_DV[dest]);
    }
  });
});
