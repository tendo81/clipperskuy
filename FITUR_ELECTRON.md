# 📦 Electron Packaging & Distribution — Detail Lengkap

> Cara bundle aplikasi menjadi installer .exe yang siap distribusi.

---

## 📌 Arsitektur Electron

```
┌─────────────────────────────────────────────────┐
│                 ELECTRON APP                     │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │          MAIN PROCESS (Node.js)          │   │
│  │                                          │   │
│  │  • Window management                     │   │
│  │  • System tray                           │   │
│  │  • Native file dialogs                   │   │
│  │  • Start Express server (embedded)       │   │
│  │  • Auto-updater                          │   │
│  │  • License validation                    │   │
│  └──────────────────┬───────────────────────┘   │
│                     │ IPC Bridge                 │
│  ┌──────────────────┴───────────────────────┐   │
│  │        RENDERER PROCESS (Chromium)        │   │
│  │                                          │   │
│  │  React Frontend (Vite build)             │   │
│  │  → All UI pages                          │   │
│  │  → Communicates with backend via HTTP    │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │           BUNDLED BINARIES                │   │
│  │                                          │   │
│  │  • ffmpeg.exe (video processing)         │   │
│  │  • ffprobe.exe (video info)              │   │
│  │  • yt-dlp.exe (YouTube download)         │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

---

## 🔧 Main Process (electron/main.js)

```javascript
// Key responsibilities:
const { app, BrowserWindow, Tray, dialog, ipcMain } = require('electron');

// 1. Create window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    frame: false, // custom title bar
    icon: 'resources/icon.ico',
    webPreferences: {
      preload: 'preload.js',
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  
  // Load frontend
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173'); // Vite dev
  } else {
    mainWindow.loadFile('frontend/dist/index.html'); // Production
  }
}

// 2. Start backend server (embedded)
function startBackend() {
  require('./backend/src/server.js'); // Express pada port 5000
}

// 3. Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// 4. System tray
function createTray() {
  tray = new Tray('resources/tray-icon.png');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open OpusFlow', click: () => mainWindow.show() },
    { label: 'Quit', click: () => app.quit() }
  ]));
}

// 5. IPC handlers (bridge antara frontend & system)
ipcMain.handle('select-file', async () => {
  return dialog.showOpenDialog({
    filters: [{ name: 'Videos', extensions: ['mp4','mov','avi','mkv'] }]
  });
});

ipcMain.handle('select-folder', async () => {
  return dialog.showOpenDialog({ properties: ['openDirectory'] });
});
```

---

## 📦 Build Configuration (electron-builder.yml)

```yaml
appId: com.opusflow.app
productName: OpusFlow
copyright: Copyright © 2026

directories:
  output: dist
  buildResources: resources

files:
  - electron/**/*
  - frontend/dist/**/*
  - backend/**/*
  - "!backend/node_modules"
  - "!backend/uploads/**"
  - "!backend/outputs/**"

extraResources:
  - from: binaries/ffmpeg.exe
    to: ffmpeg.exe
  - from: binaries/ffprobe.exe
    to: ffprobe.exe
  - from: binaries/yt-dlp.exe
    to: yt-dlp.exe

win:
  target:
    - target: nsis
      arch: [x64]
  icon: resources/icon.ico
  artifactName: "OpusFlow-Setup-${version}.exe"

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  installerIcon: resources/installer-icon.ico
  uninstallerIcon: resources/uninstaller-icon.ico
  installerSidebar: resources/installer-sidebar.bmp
  license: LICENSE.txt

publish:
  provider: github  # atau server sendiri
  owner: your-github
  repo: opusflow-releases
```

---

## 🔄 Auto-Updater

```javascript
const { autoUpdater } = require('electron-updater');

// Check for updates on app start
app.on('ready', () => {
  autoUpdater.checkForUpdatesAndNotify();
});

// Events
autoUpdater.on('update-available', (info) => {
  // Notify user: "Update v1.1.0 available!"
  mainWindow.webContents.send('update-available', info);
});

autoUpdater.on('download-progress', (progress) => {
  // Show download progress
  mainWindow.webContents.send('update-progress', progress.percent);
});

autoUpdater.on('update-downloaded', () => {
  // Ask user to restart
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: 'Restart to install update?',
    buttons: ['Restart', 'Later']
  }).then(({ response }) => {
    if (response === 0) autoUpdater.quitAndInstall();
  });
});
```

---

## 📁 Final Installer Structure

```
OpusFlow-Setup-1.0.0.exe (~200MB)
  ├── OpusFlow.exe (Electron app)
  ├── resources/
  │   ├── ffmpeg.exe (~90MB)
  │   ├── ffprobe.exe (~90MB)
  │   ├── yt-dlp.exe (~10MB)
  │   └── icon.ico
  ├── frontend/ (React build, ~5MB)
  ├── backend/ (Express, ~2MB)
  └── locales/ (Electron locales)

Install location: C:\Program Files\OpusFlow\
Data location: C:\Users\{user}\AppData\Roaming\OpusFlow\
  ├── database.sqlite
  ├── uploads/
  ├── outputs/
  ├── brandkits/
  └── settings.json
```

---

## 🚀 Build & Release Workflow

```
1. Developer: npm run build
   ├── Frontend: vite build → frontend/dist/
   ├── Backend: copy to package
   └── Electron: electron-builder → dist/OpusFlow-Setup-1.0.0.exe

2. Test installer on clean Windows machine

3. Upload to GitHub Releases (or your server)

4. Users get auto-update notification

5. User clicks "Update" → download → restart → done
```

---

## ✅ Ringkasan

| Aspek | Detail |
|-------|--------|
| Framework | Electron 28+ |
| Installer | NSIS (Windows) |
| Size | ~200MB installer |
| Auto-update | electron-updater via GitHub |
| Bundled | FFmpeg, FFprobe, yt-dlp |
| Data | AppData/Roaming/OpusFlow |
| Single instance | Yes (prevent double open) |
| System tray | Yes |
| Custom titlebar | Yes (frameless window) |
