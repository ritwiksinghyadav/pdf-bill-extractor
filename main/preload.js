const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder:    ()            => ipcRenderer.invoke('dialog:openFolder'),
  scanPdfs:        (folderPath)   => ipcRenderer.invoke('fs:scanPdfs', folderPath),
  extractPdfData:  (filePaths)    => ipcRenderer.invoke('pdf:extractData', filePaths),
  
  // Storage & Config
  getSettings:     ()            => ipcRenderer.invoke('storage:getSettings'),
  saveSettings:    (settings)    => ipcRenderer.invoke('storage:saveSettings', settings),
  getHistory:      ()            => ipcRenderer.invoke('storage:getHistory'),
  saveHistory:     (history)     => ipcRenderer.invoke('storage:saveHistory', history),
  clearHistory:    ()            => ipcRenderer.invoke('storage:clearHistory'),

  // Services
  uploadthingUpload: (params)    => ipcRenderer.invoke('uploadthing:uploadFile', params),
  aisensySend:       (params)    => ipcRenderer.invoke('aisensy:sendMessage', params),
});

