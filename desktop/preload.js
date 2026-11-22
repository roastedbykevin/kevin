// The only bridge between the page and the app: now-playing updates in, the one consent switch out. Nothing else.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kevinDesktop', {
  onMedia: cb => ipcRenderer.on('media', (_e, m) => cb(m)),
  consent: () => ipcRenderer.invoke('consent:get'),
  setConsent: v => ipcRenderer.invoke('consent:set', !!v)
});
