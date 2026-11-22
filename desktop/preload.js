// The only bridge between the page and the app: now-playing updates in; the consent switch, arming the mic for one
// press of the talk button, and the mic's on/off state out. Nothing else.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kevinDesktop', {
  onMedia: cb => ipcRenderer.on('media', (_e, m) => cb(m)),
  consent: () => ipcRenderer.invoke('consent:get'),
  setConsent: v => ipcRenderer.invoke('consent:set', !!v),
  micArm: () => ipcRenderer.invoke('mic:arm'),
  micState: on => ipcRenderer.send('mic:state', !!on)
});
