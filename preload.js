const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('DesktopDB', {
  read: () => ipcRenderer.invoke('read-database'),
  write: (data) => ipcRenderer.invoke('write-database', data),
  purge: () => ipcRenderer.invoke('purge-database')
});