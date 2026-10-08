const { contextBridge, ipcRenderer } = require('electron');

// Minimal, explicit surface: the page can only ask for the idle strip window.
contextBridge.exposeInMainWorld('rakugakiDesktop', {
  openIdle: () => ipcRenderer.send('rakugaki:open-idle'),
  closeIdle: () => ipcRenderer.send('rakugaki:close-idle'),
});
