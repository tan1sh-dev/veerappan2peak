// Thin wrapper over the Electron preload API, with a browser (localStorage) fallback for dev/testing.
const api = typeof window !== 'undefined' ? window.veerappan : undefined;
const LS_SAVE = 'veerappan.save', LS_CFG = 'veerappan.config';

function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } }

export const Bridge = {
  isElectron: !!(api && api.isElectron),
  async readSave() { return api ? api.readSave() : lsGet(LS_SAVE); },
  async writeSave(d) { if (api) return api.writeSave(d); lsSet(LS_SAVE, d); return true; },
  async deleteSave() { if (api) return api.deleteSave(); try { localStorage.removeItem(LS_SAVE); } catch { } return true; },
  async getConfig() {
    if (api) return api.getConfig();
    const c = lsGet(LS_CFG) || {};
    return { hasApiKey: !!c.nasaApiKey, settings: c.settings || null };
  },
  async setSettings(s) {
    if (api) return api.setSettings(s);
    const c = lsGet(LS_CFG) || {}; c.settings = s; lsSet(LS_CFG, c); return true;
  },
  async setApiKey(k) {
    if (api) return api.setApiKey(k);
    const key = String(k || '').trim();
    if (key && !/^[A-Za-z0-9]{20,64}$/.test(key)) return { ok: false, error: 'That does not look like an api.nasa.gov key.' };
    const c = lsGet(LS_CFG) || {}; if (key) c.nasaApiKey = key; else delete c.nasaApiKey; lsSet(LS_CFG, c);
    return { ok: true };
  },
  async nasaFetch(which) {
    if (api) return api.nasaFetch(which);
    const key = (lsGet(LS_CFG) || {}).nasaApiKey || 'DEMO_KEY';
    const base = { apod: 'https://api.nasa.gov/planetary/apod', insight: 'https://api.nasa.gov/insight_weather/' }[which];
    if (!base) return { ok: false, error: 'unknown endpoint' };
    try {
      const r = await fetch(`${base}?api_key=${encodeURIComponent(key)}${which === 'insight' ? '&feedtype=json&ver=1.0' : ''}`);
      if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
      return { ok: true, data: await r.json(), usedDemoKey: key === 'DEMO_KEY' };
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
  },
};
