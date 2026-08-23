const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pickerApi', {
  select: (id) => ipcRenderer.send('screen-share-select', id),
  cancel: () => ipcRenderer.send('screen-share-cancel'),
})
