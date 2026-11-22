// The ear's only bridge: tell the app it woke, hand over the one clip said after the wake, and (tests only) take a fixture.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kevinEar', {
  threshold: () => ipcRenderer.invoke('ear:threshold'),
  fixture: () => ipcRenderer.invoke('ear:fixture?'),
  onFixture: cb => ipcRenderer.on('ear:fixture', (_e, pcm) => cb(new Int16Array(pcm))),
  ready: () => ipcRenderer.send('ear:ready'),
  failed: why => ipcRenderer.send('ear:failed', String(why).slice(0, 200)),
  woke: score => ipcRenderer.send('ear:woke', Number(score)),
  heard: clip => ipcRenderer.send('ear:heard', clip)
});
