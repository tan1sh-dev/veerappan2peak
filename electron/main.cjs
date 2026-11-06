// Electron main process: window, save files, settings and NASA API calls.
// The NASA API key is stored only in the user's own config file (userData), never in the game bundle.
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const userDir = () => app.getPath('userData');
const savePath = () => path.join(userDir(), 'savegame.json');
const configPath = () => path.join(userDir(), 'config.json');

function readJSON(p, fallback) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } }
function writeJSON(p, data) { fs.mkdirSync(path.dirname(p), { recursive: true }); const tmp = p + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data, null, 1)); fs.renameSync(tmp, p); }

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 720, minWidth: 960, minHeight: 540,
    backgroundColor: '#05070c', title: 'VEERAPPAN — Space Explorer', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.setMenuBarVisibility(false);
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl); else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
}

ipcMain.handle('save:read', () => readJSON(savePath(), null));
ipcMain.handle('save:write', (_e, data) => { writeJSON(savePath(), data); return true; });
ipcMain.handle('save:delete', () => { try { fs.unlinkSync(savePath()); } catch { } return true; });
ipcMain.handle('config:get', () => { const c = readJSON(configPath(), {}); return { hasApiKey: !!c.nasaApiKey, settings: c.settings || null }; });
ipcMain.handle('config:setApiKey', (_e, key) => {
  const c = readJSON(configPath(), {});
  const k = String(key || '').trim();
  if (k && !/^[A-Za-z0-9]{20,64}$/.test(k)) return { ok: false, error: 'That does not look like an api.nasa.gov key (letters and digits only).' };
  if (k) c.nasaApiKey = k; else delete c.nasaApiKey;
  writeJSON(configPath(), c); return { ok: true };
});
ipcMain.handle('config:setSettings', (_e, s) => { const c = readJSON(configPath(), {}); c.settings = s; writeJSON(configPath(), c); return true; });

// Only these NASA endpoints can be requested through the bridge.
const ALLOWED = { apod: 'https://api.nasa.gov/planetary/apod', insight: 'https://api.nasa.gov/insight_weather/' };
ipcMain.handle('nasa:fetch', async (_e, which) => {
  if (!ALLOWED[which]) return { ok: false, error: 'unknown endpoint' };
  const key = readJSON(configPath(), {}).nasaApiKey || 'DEMO_KEY';
  const url = `${ALLOWED[which]}?api_key=${encodeURIComponent(key)}` + (which === 'insight' ? '&feedtype=json&ver=1.0' : '');
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, { signal: ctrl.signal }); clearTimeout(t);
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}`, usedDemoKey: key === 'DEMO_KEY' };
    return { ok: true, data: await r.json(), usedDemoKey: key === 'DEMO_KEY' };
  } catch (err) { return { ok: false, error: String(err.message || err) }; }
});

app.whenReady().then(() => { createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
