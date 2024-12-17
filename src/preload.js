
    const { contextBridge, ipcRenderer } = require('electron');

    contextBridge.exposeInMainWorld('api', {
        updateConfig: (credentials) => ipcRenderer.send('update-config', credentials),
        onUpdateSuccess: (callback) => ipcRenderer.on('update-config-success', callback),
        onUpdateFailure: (callback) => ipcRenderer.on('update-config-failure', callback)
    });
