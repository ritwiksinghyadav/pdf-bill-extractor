const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder:    ()          => ipcRenderer.invoke('dialog:openFolder'),
  scanPdfs:        (folderPath) => ipcRenderer.invoke('fs:scanPdfs', folderPath),
  extractPdfData:  (filePaths)  => ipcRenderer.invoke('pdf:extractData', filePaths),
});
