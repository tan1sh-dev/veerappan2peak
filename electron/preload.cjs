const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('veerappan', {
  isElectron: true,
  readSave: () => ipcRenderer.invoke('save:read'),
  writeSave: (d) => ipcRenderer.invoke('save:write', d),
  deleteSave: () => ipcRenderer.invoke('save:delete'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setApiKey: (k) => ipcRenderer.invoke('config:setApiKey', k),
  setSettings: (s) => ipcRenderer.invoke('config:setSettings', s),
  nasaFetch: (which) => ipcRenderer.invoke('nasa:fetch', which),
});
