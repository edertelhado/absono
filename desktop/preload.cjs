const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('absonoDesktop', {
  copyText: (text) => ipcRenderer.invoke('clipboard-write', String(text ?? '')),
})
