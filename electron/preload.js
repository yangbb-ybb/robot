const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  getAlwaysOnTop: () => ipcRenderer.invoke('window:get-always-on-top'),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('window:set-always-on-top', Boolean(value)),
  getMode: () => ipcRenderer.invoke('window:get-mode'),
  setMode: (value) => ipcRenderer.invoke('window:set-mode', Boolean(value)),
  onModeChanged: (callback) => ipcRenderer.on('window:mode-changed', (_event, mode) => callback(mode))
});
