const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = ['state', 'command', 'toast', 'flash', 'select-region', 'cancel-region'];

contextBridge.exposeInMainWorld('rabisco', {
  setState: (partial) => ipcRenderer.send('set-state', partial),
  command: (name) => ipcRenderer.send('command', name),
  activate: () => ipcRenderer.send('overlay-active'),
  resizeToolbar: (width, height) => ipcRenderer.send('toolbar-size', { width, height }),
  regionSelected: (rect) => ipcRenderer.send('region-selected', rect),
  regionCancel: () => ipcRenderer.send('region-cancel'),
  on: (channel, fn) => {
    if (CHANNELS.includes(channel)) ipcRenderer.on(channel, (_e, ...args) => fn(...args));
  },
});
