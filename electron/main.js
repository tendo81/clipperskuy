// ClipperSkuy — Electron Main Process
const { app, BrowserWindow, Tray, Menu, dialog, ipcMain, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// ===== CONFIG =====
let isDev;
const FRONTEND_PORT = 5173;

let mainWindow = null;
let tray = null;
let userDataPath, stateFile;

// ===== AUTO-UPDATER (production only) =====
let autoUpdater = null;
function setupAutoUpdater() {
    if (isDev) return;
    try {
        const { autoUpdater: updater } = require('electron-updater');
        autoUpdater = updater;

        autoUpdater.autoDownload = false;
        autoUpdater.autoInstallOnAppQuit = true;

        autoUpdater.on('checking-for-update', () => {
            console.log('[Updater] Checking for updates...');
        });

        autoUpdater.on('update-available', (info) => {
            console.log('[Updater] Update available:', info.version);
            if (mainWindow) {
                const pkg = require('../package.json');
                const pub = pkg.build && pkg.build.publish;
                const ghOwner = (pub && pub.owner) || 'YOUR_GITHUB_USERNAME';
                const ghRepo = (pub && pub.repo) || 'clipperskuy';
                mainWindow.webContents.send('update-available', {
                    version: info.version,
                    releaseDate: info.releaseDate,
                    releaseNotes: info.releaseNotes,
                    releaseNotesUrl: `https://github.com/${ghOwner}/${ghRepo}/releases/tag/v${info.version}`
                });
            }
        });

        autoUpdater.on('update-not-available', () => {
            console.log('[Updater] App is up to date');
        });

        autoUpdater.on('download-progress', (progress) => {
            if (mainWindow) {
                mainWindow.webContents.send('update-progress', Math.round(progress.percent));
            }
        });

        autoUpdater.on('update-downloaded', () => {
            console.log('[Updater] Update downloaded, ready to install');
            if (mainWindow) {
                mainWindow.webContents.send('update-ready');
            }
        });

        autoUpdater.on('error', (err) => {
            console.log('[Updater] Error:', err.message);
        });

        // Check for updates after a short delay
        setTimeout(() => {
            autoUpdater.checkForUpdates().catch(() => { });
        }, 5000);

    } catch (err) {
        console.log('[Updater] electron-updater not available (dev mode):', err.message);
    }
}

// ===== WINDOW STATE PERSISTENCE =====
function loadWindowState() {
    try {
        if (stateFile && fs.existsSync(stateFile))
            return JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    } catch (e) { /* */ }
    return { width: 1400, height: 900, x: undefined, y: undefined, isMaximized: false };
}

function saveWindowState() {
    if (!mainWindow || !stateFile) return;
    try {
        const b = mainWindow.getBounds();
        fs.writeFileSync(stateFile, JSON.stringify({
            width: b.width, height: b.height, x: b.x, y: b.y,
            isMaximized: mainWindow.isMaximized()
        }, null, 2));
    } catch (e) { /* */ }
}

// ===== SINGLE INSTANCE LOCK =====
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

// ===== START BACKEND =====
function startBackend() {
    return new Promise((resolve) => {
        try {
            if (!isDev) {
                const rp = process.resourcesPath;
                process.env.FFMPEG_PATH = path.join(rp, 'ffmpeg.exe');
                process.env.FFPROBE_PATH = path.join(rp, 'ffprobe.exe');
                process.env.YTDLP_PATH = path.join(rp, 'yt-dlp.exe');
                process.env.CLIPPERSKUY_DATA = path.join(userDataPath, 'data');
            }
            const bp = path.join(__dirname, '..', 'backend', 'src', 'server.js');
            console.log('[Electron] Starting backend:', bp);
            require(bp);
            setTimeout(resolve, 1500);
        } catch (err) {
            console.error('[Electron] Backend error:', err.message);
            resolve();
        }
    });
}

// ===== FIRST RUN DETECTION =====
function checkFirstRun() {
    const firstRunFile = path.join(userDataPath, '.first-run-done');
    if (!fs.existsSync(firstRunFile)) {
        console.log('[Electron] First run detected — triggering hardware detection');
        // Signal frontend to run hardware detection
        if (mainWindow) {
            mainWindow.webContents.once('did-finish-load', () => {
                mainWindow.webContents.send('first-run', true);
            });
        }
        try {
            fs.writeFileSync(firstRunFile, new Date().toISOString());
        } catch (e) { /* */ }
    }
}

// ===== CREATE WINDOW =====
function createWindow() {
    const state = loadWindowState();
    mainWindow = new BrowserWindow({
        width: state.width,
        height: state.height,
        x: state.x,
        y: state.y,
        minWidth: 1024,
        minHeight: 700,
        icon: path.join(__dirname, 'resources', 'icon.ico'),
        backgroundColor: '#0a0a0f',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true
        }
    });

    if (state.isMaximized) mainWindow.maximize();

    if (isDev) {
        mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`);
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
    }

    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.on('close', saveWindowState);
    mainWindow.on('resize', saveWindowState);
    mainWindow.on('move', saveWindowState);
    mainWindow.on('closed', () => { mainWindow = null; });
}

// ===== SYSTEM TRAY =====
function createTray() {
    try {
        const iconPath = path.join(__dirname, 'resources', 'tray-icon.png');
        const icon = fs.existsSync(iconPath)
            ? nativeImage.createFromPath(iconPath)
            : nativeImage.createEmpty();
        tray = new Tray(icon);
        tray.setToolTip('ClipperSkuy');
        tray.setContextMenu(Menu.buildFromTemplate([
            {
                label: 'Open ClipperSkuy',
                click: () => {
                    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
                }
            },
            { type: 'separator' },
            { label: 'Quit', click: () => app.quit() }
        ]));
        tray.on('double-click', () => {
            if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        });
    } catch (e) {
        console.warn('[Electron] Tray skipped:', e.message);
    }
}

// ===== IPC HANDLERS =====
function setupIPC() {
    // Native file dialog — select video file
    ipcMain.handle('select-file', async (event, options = {}) => {
        const filters = options.filters || [
            { name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] },
            { name: 'All Files', extensions: ['*'] }
        ];
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters
        });
        return result.canceled ? null : result.filePaths[0];
    });

    // Native folder dialog
    ipcMain.handle('select-folder', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });
        return result.canceled ? null : result.filePaths[0];
    });

    // Open folder in explorer
    ipcMain.handle('open-folder', async (event, folderPath) => {
        if (folderPath && fs.existsSync(folderPath)) {
            shell.openPath(folderPath);
            return true;
        }
        return false;
    });

    // Open file in default app
    ipcMain.handle('open-file', async (event, filePath) => {
        if (filePath && fs.existsSync(filePath)) {
            shell.openPath(filePath);
            return true;
        }
        return false;
    });

    // App info
    ipcMain.handle('get-app-version', () => app.getVersion());
    ipcMain.handle('get-app-paths', () => ({
        userData: userDataPath,
        temp: app.getPath('temp'),
        desktop: app.getPath('desktop'),
        documents: app.getPath('documents'),
        videos: app.getPath('videos')
    }));

    // Window controls (for custom titlebar if needed)
    ipcMain.handle('window-minimize', () => mainWindow?.minimize());
    ipcMain.handle('window-maximize', () => {
        if (mainWindow?.isMaximized()) mainWindow.unmaximize();
        else mainWindow?.maximize();
    });
    ipcMain.handle('window-close', () => mainWindow?.close());
    ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized());

    // Auto-updater controls
    ipcMain.handle('check-for-updates', () => {
        if (autoUpdater) {
            autoUpdater.checkForUpdates().catch(() => { });
            return true;
        }
        return false;
    });
    ipcMain.handle('download-update', () => {
        if (autoUpdater) {
            autoUpdater.downloadUpdate().catch(() => { });
            return true;
        }
        return false;
    });
    ipcMain.handle('install-update', () => {
        if (autoUpdater) {
            autoUpdater.quitAndInstall();
            return true;
        }
        return false;
    });
}

// ===== APP LIFECYCLE =====
app.on('ready', async () => {
    isDev = !app.isPackaged;
    userDataPath = app.getPath('userData');
    stateFile = path.join(userDataPath, 'window-state.json');

    console.log('[Electron] App ready');
    console.log('[Electron] Dev mode:', isDev);
    console.log('[Electron] User data:', userDataPath);

    setupIPC();

    if (!isDev) {
        await startBackend();
    }

    createWindow();
    createTray();
    checkFirstRun();
    setupAutoUpdater();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => saveWindowState());
