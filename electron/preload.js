const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // File dialogs
    selectFile: (options) => ipcRenderer.invoke('select-file', options),
    selectFolder: () => ipcRenderer.invoke('select-folder'),

    // Shell operations
    openFolder: (path) => ipcRenderer.invoke('open-folder', path),
    openFile: (path) => ipcRenderer.invoke('open-file', path),

    // App info
    getVersion: () => ipcRenderer.invoke('get-app-version'),
    getPaths: () => ipcRenderer.invoke('get-app-paths'),

    // Window controls (for custom titlebar)
    minimize: () => ipcRenderer.invoke('window-minimize'),
    maximize: () => ipcRenderer.invoke('window-maximize'),
    close: () => ipcRenderer.invoke('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),

    // Check if running in Electron
    isElectron: true,

    // Auto-updater controls
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    installUpdate: () => ipcRenderer.invoke('install-update'),

    // Listen for events from main process
    onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_, info) => callback(info)),
    onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (_, percent) => callback(percent)),
    onUpdateReady: (callback) => ipcRenderer.on('update-ready', () => callback()),
    onFirstRun: (callback) => ipcRenderer.on('first-run', (_, isFirst) => callback(isFirst)),
});
