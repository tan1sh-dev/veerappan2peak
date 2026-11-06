// Inventory, recycling and station construction rules (pure logic, unit tested).
import { EQUIPMENT, MODULES, SAMPLE_TYPES } from '../data/catalog.js';

export const INVENTORY_CAPACITY = 12; // items + samples carried before returning to base

export function equipmentById(id) { return EQUIPMENT.find(e => e.id === id); }

export function carriedCount(state) { return state.inventory.items.length + state.inventory.samples.length; }

/** Record a scan. Returns research gained (0 if already scanned). */
export function recordScan(state, id, bonus = 1) {
  if (state.discoveries.includes(id)) return 0;
  const e = equipmentById(id);
  state.discoveries.push(id);
  const r = Math.round((e ? e.research : 10) * bonus);
  state.research += r;
  return r;
}

/** Try to collect an equipment item. Heritage items are protected. */
export function collectItem(state, id) {
  const e = equipmentById(id);
  if (!e) return { ok: false, reason: 'Unknown object.' };
  if (e.heritage) return { ok: false, reason: 'Protected heritage site: you can scan it but not remove it.' };
  if (!e.collectible) return { ok: false, reason: 'This object cannot be collected.' };
  if (!state.discoveries.includes(id)) return { ok: false, reason: 'Scan it first to check that it is safe to handle.' };
  if (state.inventory.items.includes(id) || (state.flags.recycled || []).includes(id)) return { ok: false, reason: 'Already recovered.' };
  if (carriedCount(state) >= INVENTORY_CAPACITY) return { ok: false, reason: 'Inventory full: recycle at a base first.' };
  state.inventory.items.push(id);
  return { ok: true };
}

export function addSample(state, type, where) {
  if (carriedCount(state) >= INVENTORY_CAPACITY) return { ok: false, reason: 'Inventory full: return to base.' };
  const t = SAMPLE_TYPES[type];
  if (!t) return { ok: false, reason: 'Unknown sample.' };
  state.inventory.samples.push({ type, where, t: Date.now() });
  return { ok: true, sample: t };
}

/** Recycling yields (GAME APPROXIMATION). Returns materials gained. */
export function recycleAll(state, hasLab = false) {
  const gained = {};
  for (const id of state.inventory.items) {
    const e = equipmentById(id);
    for (const [m, n] of Object.entries(e.yields || {})) {
      state.inventory.materials[m] = (state.inventory.materials[m] || 0) + n;
      gained[m] = (gained[m] || 0) + n;
    }
  }
  state.flags.recycled = [...(state.flags.recycled || []), ...state.inventory.items];
  state.inventory.items = [];
  // samples are analysed for research and a little regolith feedstock
  let research = 0;
  for (const s of state.inventory.samples) {
    research += Math.round((SAMPLE_TYPES[s.type]?.research || 10) * (hasLab ? 1.5 : 1));
    state.inventory.materials.regolith = (state.inventory.materials.regolith || 0) + 1;
    gained.regolith = (gained.regolith || 0) + 1;
  }
  state.flags.samplesAnalysed = (state.flags.samplesAnalysed || 0) + state.inventory.samples.length;
  state.inventory.samples = [];
  state.research += research;
  return { gained, research };
}

export function canAfford(state, moduleId) {
  const m = MODULES[moduleId];
  if (!m) return false;
  if (state.research < (m.research || 0)) return false;
  return Object.entries(m.cost).every(([k, v]) => (state.inventory.materials[k] || 0) >= v);
}

export function missingFor(state, moduleId) {
  const m = MODULES[moduleId], out = [];
  for (const [k, v] of Object.entries(m.cost)) { const have = state.inventory.materials[k] || 0; if (have < v) out.push(`${v - have} ${k}`); }
  if (state.research < (m.research || 0)) out.push(`${m.research - state.research} research`);
  return out;
}

export function buildModule(state, site, moduleId) {
  if (!canAfford(state, moduleId)) return { ok: false, reason: 'Missing: ' + missingFor(state, moduleId).join(', ') };
  if (state.station[site].includes(moduleId)) return { ok: false, reason: 'Already built here.' };
  const m = MODULES[moduleId];
  for (const [k, v] of Object.entries(m.cost)) state.inventory.materials[k] -= v;
  state.station[site].push(moduleId);
  return { ok: true };
}

export function scanBonus(state, site) { return state.station[site]?.includes('comms') ? 1.25 : 1; }
