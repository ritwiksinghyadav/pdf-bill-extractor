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
  testUploadthingToken: (token)  => ipcRenderer.invoke('uploadthing:testToken', token),
  aisensySend:       (params)    => ipcRenderer.invoke('aisensy:sendMessage', params),
  testAiSensyKey:    (params)    => ipcRenderer.invoke('aisensy:testKey', params),

  // Daily Logging
  getTodayLogs:      ()          => ipcRenderer.invoke('logs:getToday'),
  openLogsFolder:    ()          => ipcRenderer.invoke('logs:openFolder'),

  // Auto-Updater
  onUpdateAvailable:  (cb)       => ipcRenderer.on('updater:available', (_, info) => cb(info)),
  onUpdateDownloaded: (cb)       => ipcRenderer.on('updater:downloaded', (_, info) => cb(info)),
  installUpdate:      ()         => ipcRenderer.invoke('updater:installNow'),
  checkForUpdates:    ()         => ipcRenderer.invoke('updater:checkForUpdates'),
});


