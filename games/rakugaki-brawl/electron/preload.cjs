const { contextBridge, ipcRenderer } = require('electron');

// Minimal, explicit surface: the page can only ask for the idle strip window.
contextBridge.exposeInMainWorld('rakugakiDesktop', {
  openIdle: () => ipcRenderer.send('rakugaki:open-idle'),
  closeIdle: () => ipcRenderer.send('rakugaki:close-idle'),
  steam: {
    status: () => ipcRenderer.invoke('rakugaki:steam-status'),
    achieve: (id) => ipcRenderer.invoke('rakugaki:steam-achieve', String(id)),
  },
});
