import { Bridge } from './Bridge.js';

export const SAVE_VERSION = 1;

export function newGameState() {
  return {
    version: SAVE_VERSION,
    created: Date.now(),
    updated: Date.now(),
    missions: { unlocked: ['m1'], completed: {}, current: null },
    locations: { unlocked: ['earth'] },
    inventory: {
      items: [],        // collected equipment ids
      samples: [],      // geology samples
      materials: { aluminium: 0, titanium: 0, electronics: 0, solarCells: 0, polymers: 0, regolith: 0 },
    },
    discoveries: [],    // ids of scanned objects
    research: 0,
    station: { moon: [], mars: [] },
    spacecraft: ['saturn_v'],
    stats: { distanceWalked: 0, distanceDriven: 0, landings: 0, playTime: 0 },
    flags: {},
  };
}

/** Returns a usable state or null. Fills any branches added in later versions. */
export function validateState(s) {
  if (!s || typeof s !== 'object' || s.version !== SAVE_VERSION) return null;
  const base = newGameState();
  for (const k of Object.keys(base)) if (s[k] === undefined || s[k] === null) s[k] = base[k];
  for (const k of Object.keys(base.inventory)) if (!s.inventory[k]) s.inventory[k] = base.inventory[k];
  for (const k of Object.keys(base.inventory.materials)) if (typeof s.inventory.materials[k] !== 'number') s.inventory.materials[k] = 0;
  for (const k of Object.keys(base.station)) if (!Array.isArray(s.station[k])) s.station[k] = [];
  return s;
}

export const SaveSystem = {
  async load() { return validateState(await Bridge.readSave()); },
  async save(state) { state.updated = Date.now(); return Bridge.writeSave(JSON.parse(JSON.stringify(state))); },
  async wipe() { return Bridge.deleteSave(); },
};
