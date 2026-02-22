// ClipperSkuy — Electron Main Process
// IMPORTANT: concurrently sets ELECTRON_RUN_AS_NODE=1 which breaks Electron modules
// Must delete BEFORE require('electron')
delete process.env.ELECTRON_RUN_AS_NODE;
console.log('[ClipperSkuy] Loading main process...');
const { app, BrowserWindow, Tray, Menu, dialog, ipcMain, shell, nativeImage, Notification } = require('electron');
console.log('[ClipperSkuy] Electron modules loaded, app exists:', !!app);
const path = require('path');
const fs = require('fs');
const os = require('os');

// ===== EARLY CRASH LOG (before everything) =====
const CRASH_LOG = path.join(process.env.APPDATA || process.env.HOME || '.', 'clipperskuy', 'crash.log');
try { fs.mkdirSync(path.dirname(CRASH_LOG), { recursive: true }); } catch (e) { console.error('[ClipperSkuy] Failed to create crash log dir:', e.message); }
try {
    fs.writeFileSync(CRASH_LOG, `[${new Date().toISOString()}] App starting... __dirname=${__dirname}\nElectron: ${process.versions.electron || 'N/A'}\nNode: ${process.versions.node}\napp exists: ${!!app}\n`);
    console.log('[ClipperSkuy] Crash log written to:', CRASH_LOG);
} catch (e) { console.error('[ClipperSkuy] Failed to write crash log:', e.message); }

process.on('uncaughtException', (err) => {
    console.error('[ClipperSkuy] UNCAUGHT:', err.message);
    try { fs.appendFileSync(CRASH_LOG, `[${new Date().toISOString()}] CRASH: ${err.message}\n${err.stack}\n`); } catch (e) { }
});
process.on('unhandledRejection', (reason) => {
    console.error('[ClipperSkuy] UNHANDLED REJECTION:', reason);
    try { fs.appendFileSync(CRASH_LOG, `[${new Date().toISOString()}] UNHANDLED: ${reason}\n`); } catch (e) { }
});

// ===== GPU FIX (must be before app.on('ready')) =====
// Disable hardware acceleration to prevent GPU hangs on some systems (especially AMD)
try {
    app.disableHardwareAcceleration();
    console.log('[ClipperSkuy] Hardware acceleration disabled');
    fs.appendFileSync(CRASH_LOG, `[${new Date().toISOString()}] GPU hardware acceleration disabled\n`);
} catch (e) {
    console.error('[ClipperSkuy] Failed to disable HW accel:', e.message);
}

// ===== CONFIG =====
let isDev;
const FRONTEND_PORT = 5173;
const BACKEND_PORT = 5000;
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB max log size
const TEMP_MAX_AGE_DAYS = 7;
const BACKEND_MAX_RESTARTS = 3;

let mainWindow = null;
let splashWindow = null;
let tray = null;
let userDataPath, stateFile;
let backendRestartCount = 0;

// ===== SECURE TOKEN MANAGEMENT =====
function getGitHubToken() {
    // Priority: 1) env var, 2) token file in userData, 3) null
    if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
    try {
        const tokenFile = path.join(app.getPath('userData'), 'github-token.txt');
        if (fs.existsSync(tokenFile)) {
            return fs.readFileSync(tokenFile, 'utf-8').trim();
        }
    } catch (e) { /* */ }
    return null;
}

// ===== AUTO-UPDATER (production only) =====
let autoUpdater = null;
function setupAutoUpdater() {
    if (isDev) return;
    try {
        const { autoUpdater: updater } = require('electron-updater');
        autoUpdater = updater;

        autoUpdater.autoDownload = false;
        autoUpdater.autoInstallOnAppQuit = true;

        // Use secure token
        const ghToken = getGitHubToken();
        if (ghToken) {
            autoUpdater.requestHeaders = { Authorization: `token ${ghToken}` };
            process.env.GH_TOKEN = ghToken;
            logToFile('[Updater] GitHub token configured');
        } else {
            logToFile('[Updater] No GitHub token found — update check may fail for private repos');
        }

        autoUpdater.on('checking-for-update', () => {
            logToFile('[Updater] Checking for updates...');
        });

        autoUpdater.on('update-available', (info) => {
            logToFile(`[Updater] Update available: ${info.version}`);
            if (mainWindow) {
                const pkg = require('../package.json');
                const pub = pkg.build && pkg.build.publish;
                const ghOwner = (pub && pub.owner) || 'tendo81';
                const ghRepo = (pub && pub.repo) || 'clipperskuy';
                mainWindow.webContents.send('update-available', {
                    version: info.version,
                    releaseDate: info.releaseDate,
                    releaseNotes: info.releaseNotes,
                    releaseNotesUrl: `https://github.com/${ghOwner}/${ghRepo}/releases/tag/v${info.version}`
                });
            }
            // Native notification
            showNotification('Update Available', `ClipperSkuy v${info.version} is available!`);
        });

        autoUpdater.on('update-not-available', (info) => {
            logToFile(`[Updater] Up to date: ${info?.version}`);
            if (mainWindow) {
                mainWindow.webContents.send('update-not-available', { version: info?.version });
            }
        });

        autoUpdater.on('download-progress', (progress) => {
            if (mainWindow) {
                mainWindow.webContents.send('update-progress', Math.round(progress.percent));
            }
        });

        autoUpdater.on('update-downloaded', () => {
            logToFile('[Updater] Update downloaded, ready to install');
            if (mainWindow) {
                mainWindow.webContents.send('update-ready');
            }
            showNotification('Update Ready', 'Restart ClipperSkuy to install the update.');
        });

        autoUpdater.on('error', (err) => {
            logToFile(`[Updater] Error: ${err.message}`);
            if (mainWindow) {
                mainWindow.webContents.send('update-error', { message: err.message });
            }
        });

        // Check for updates after a short delay
        setTimeout(() => {
            autoUpdater.checkForUpdates().catch(() => { });
        }, 8000);

    } catch (err) {
        logToFile(`[Updater] Not available: ${err.message}`);
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
console.log('[ClipperSkuy] Setting up single instance lock...');
try {
    if (app && typeof app.requestSingleInstanceLock === 'function') {
        const gotLock = app.requestSingleInstanceLock();
        console.log('[ClipperSkuy] Single instance lock:', gotLock ? 'acquired' : 'FAILED');
        if (!gotLock) {
            try { fs.appendFileSync(CRASH_LOG, `[${new Date().toISOString()}] SingleInstance lock FAILED — quitting\n`); } catch (e) { }
            app.quit();
        } else {
            app.on('second-instance', () => {
                if (mainWindow) {
                    if (mainWindow.isMinimized()) mainWindow.restore();
                    mainWindow.focus();
                }
            });
        }
    } else {
        console.log('[ClipperSkuy] app.requestSingleInstanceLock not available, skipping');
        fs.appendFileSync(CRASH_LOG, `[${new Date().toISOString()}] app.requestSingleInstanceLock not available\n`);
    }
} catch (e) {
    console.error('[ClipperSkuy] SingleInstance error:', e.message);
    try { fs.appendFileSync(CRASH_LOG, `[${new Date().toISOString()}] SingleInstance error: ${e.message}\n`); } catch (e2) { }
}

// ===== ENHANCED LOGGING =====
function logToFile(msg) {
    try {
        let logDir;
        try { logDir = app.getPath('userData'); } catch (e) { logDir = path.join(process.env.APPDATA || os.homedir(), 'ClipperSkuy'); }
        const logPath = path.join(logDir, 'debug.log');
        fs.mkdirSync(logDir, { recursive: true });
        // Rotate log if too large
        if (fs.existsSync(logPath)) {
            const stat = fs.statSync(logPath);
            if (stat.size > MAX_LOG_SIZE) {
                const oldPath = logPath + '.old';
                try { fs.unlinkSync(oldPath); } catch (e) { }
                fs.renameSync(logPath, oldPath);
            }
        }
        const line = `[${new Date().toISOString()}] ${msg}\n`;
        fs.appendFileSync(logPath, line);
        console.log(msg);
    } catch (e) { /* ignore */ }
}

// ===== NATIVE NOTIFICATIONS =====
function showNotification(title, body) {
    try {
        if (Notification.isSupported()) {
            const notif = new Notification({ title, body, icon: path.join(__dirname, 'resources', 'icon.png') });
            notif.show();
        }
    } catch (e) { /* */ }
}

// ===== SPLASH SCREEN =====
function createSplashScreen() {
    splashWindow = new BrowserWindow({
        width: 420,
        height: 320,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: true,
        icon: path.join(__dirname, 'resources', 'icon.ico'),
        webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    const splashHTML = `data:text/html;charset=utf-8,${encodeURIComponent(`
<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: transparent;
    display: flex; justify-content: center; align-items: center;
    height: 100vh; font-family: 'Segoe UI', sans-serif;
    -webkit-app-region: drag; user-select: none;
  }
  .card {
    background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%);
    border-radius: 20px; padding: 48px 40px;
    text-align: center; width: 400px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(167,139,250,0.1);
    border: 1px solid rgba(167,139,250,0.15);
  }
  .logo { font-size: 42px; margin-bottom: 8px; }
  h1 {
    font-size: 24px; font-weight: 800;
    background: linear-gradient(135deg, #a78bfa, #818cf8, #6366f1);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    margin-bottom: 6px;
  }
  .version { font-size: 12px; color: #6b7280; margin-bottom: 28px; }
  .loader {
    width: 200px; height: 3px; background: rgba(255,255,255,0.08);
    border-radius: 4px; margin: 0 auto 16px; overflow: hidden;
  }
  .loader-bar {
    height: 100%; width: 40%; border-radius: 4px;
    background: linear-gradient(90deg, #a78bfa, #6366f1, #a78bfa);
    background-size: 200% 100%;
    animation: loading 1.5s ease-in-out infinite, shimmer 2s linear infinite;
  }
  @keyframes loading {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
  }
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  .status {
    font-size: 13px; color: #9ca3af;
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
</style>
</head>
<body>
  <div class="card">
    <div class="logo">🎬</div>
    <h1>ClipperSkuy</h1>
    <div class="version">AI-Powered Video Clip Engine</div>
    <div class="loader"><div class="loader-bar"></div></div>
    <div class="status">Initializing engine...</div>
  </div>
</body>
</html>`)}`;

    splashWindow.loadURL(splashHTML);
    splashWindow.center();
}

function closeSplashScreen() {
    if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
    }
}

// ===== START BACKEND =====
let backendProcess = null;
let backendHealthCheck = null;

function startBackend() {
    return new Promise(async (resolve) => {
        try {
            if (!isDev) {
                const rp = process.resourcesPath;
                process.env.FFMPEG_PATH = path.join(rp, 'ffmpeg.exe');
                process.env.FFPROBE_PATH = path.join(rp, 'ffprobe.exe');
                process.env.YTDLP_PATH = path.join(rp, 'yt-dlp.exe');
                // Add bundled deno to PATH
                const denoDir = path.join(rp, 'deno');
                if (fs.existsSync(denoDir)) {
                    process.env.PATH = `${denoDir};${process.env.PATH}`;
                }
            }

            // Always set data directory to AppData (both dev & production)
            if (!process.env.CLIPPERSKUY_DATA) {
                process.env.CLIPPERSKUY_DATA = path.join(userDataPath, 'data');
            }

            // Also check user's deno installation
            const userDenoDir = path.join(os.homedir(), '.deno', 'bin');
            if (fs.existsSync(userDenoDir)) {
                process.env.PATH = `${userDenoDir};${process.env.PATH}`;
            }

            // Kill any process using port 5000 before starting
            try {
                const { execSync } = require('child_process');
                const netstat = execSync('netstat -ano | findstr ":5000" | findstr "LISTENING"', { encoding: 'utf-8', timeout: 5000 });
                const lines = netstat.trim().split('\n');
                for (const line of lines) {
                    const pid = line.trim().split(/\s+/).pop();
                    if (pid && pid !== '0') {
                        logToFile(`Killing existing process on port 5000: PID ${pid}`);
                        try { execSync(`taskkill /F /PID ${pid}`, { timeout: 5000 }); } catch (e) { /* ok */ }
                    }
                }
            } catch (e) { /* no process on port 5000, good */ }

            const bp = path.join(__dirname, '..', 'backend', 'src', 'server.js');
            logToFile(`Starting backend: ${bp}`);
            logToFile(`File exists: ${fs.existsSync(bp)}`);

            require(bp);
            logToFile('Backend started OK');
            backendRestartCount = 0;

            // Start health check
            startBackendHealthCheck();

            setTimeout(resolve, 1500);
        } catch (err) {
            logToFile(`Backend FAILED: ${err.message}\n${err.stack}`);
            resolve(); // Still open window
        }
    });
}

// ===== BACKEND HEALTH CHECK & CRASH RECOVERY =====
function startBackendHealthCheck() {
    if (backendHealthCheck) clearInterval(backendHealthCheck);

    backendHealthCheck = setInterval(async () => {
        try {
            const http = require('http');
            const check = new Promise((resolve, reject) => {
                const req = http.get(`http://localhost:${BACKEND_PORT}/api/projects/stats/overview`, (res) => {
                    resolve(res.statusCode);
                });
                req.on('error', reject);
                req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
            });
            await check;
        } catch (err) {
            logToFile(`[HealthCheck] Backend unreachable: ${err.message}`);
            if (backendRestartCount < BACKEND_MAX_RESTARTS) {
                backendRestartCount++;
                logToFile(`[HealthCheck] Attempting restart ${backendRestartCount}/${BACKEND_MAX_RESTARTS}...`);
                try {
                    const bp = path.join(__dirname, '..', 'backend', 'src', 'server.js');
                    // Clear require cache to allow re-require
                    delete require.cache[require.resolve(bp)];
                    require(bp);
                    logToFile('[HealthCheck] Backend restarted OK');
                    if (mainWindow) {
                        mainWindow.webContents.send('backend-restarted');
                    }
                    showNotification('Backend Recovered', 'The processing engine has been automatically restarted.');
                } catch (e) {
                    logToFile(`[HealthCheck] Restart FAILED: ${e.message}`);
                }
            } else {
                logToFile('[HealthCheck] Max restarts reached. Manual intervention needed.');
                clearInterval(backendHealthCheck);
                if (mainWindow) {
                    mainWindow.webContents.send('backend-crashed');
                }
                showNotification('Engine Error', 'The processing engine has stopped. Please restart ClipperSkuy.');
            }
        }
    }, 30000); // Check every 30 seconds
}

// ===== TEMP FILE CLEANUP =====
function cleanupTempFiles() {
    try {
        const dataDir = process.env.CLIPPERSKUY_DATA || path.join(userDataPath, 'data');
        const tempDirs = [
            path.join(dataDir, 'temp'),
            path.join(dataDir, 'frames'),
        ];

        const maxAge = TEMP_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
        const now = Date.now();
        let cleaned = 0;

        for (const dir of tempDirs) {
            if (!fs.existsSync(dir)) continue;
            const files = fs.readdirSync(dir);
            for (const file of files) {
                try {
                    const filePath = path.join(dir, file);
                    const stat = fs.statSync(filePath);
                    if (now - stat.mtimeMs > maxAge) {
                        if (stat.isDirectory()) {
                            fs.rmSync(filePath, { recursive: true, force: true });
                        } else {
                            fs.unlinkSync(filePath);
                        }
                        cleaned++;
                    }
                } catch (e) { /* skip locked files */ }
            }
        }

        if (cleaned > 0) {
            logToFile(`[Cleanup] Removed ${cleaned} temp files older than ${TEMP_MAX_AGE_DAYS} days`);
        }
    } catch (e) {
        logToFile(`[Cleanup] Error: ${e.message}`);
    }
}

// ===== FIRST RUN DETECTION =====
function checkFirstRun() {
    const firstRunFile = path.join(userDataPath, '.first-run-done');
    if (!fs.existsSync(firstRunFile)) {
        console.log('[Electron] First run detected — triggering hardware detection');
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
            webSecurity: !isDev, // Only disable in dev for localhost CORS
            allowRunningInsecureContent: false,
            sandbox: true
        }
    });

    // Set Content-Security-Policy
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        const csp = isDev
            ? "default-src 'self' http://localhost:* ws://localhost:*; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: http://localhost:*; media-src 'self' blob: http://localhost:* file:; connect-src 'self' http://localhost:* ws://localhost:* https://*.groq.com https://generativelanguage.googleapis.com"
            : "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: http://localhost:5000; media-src 'self' blob: http://localhost:5000 file:; connect-src 'self' http://localhost:5000 ws://localhost:5000 https://*.groq.com https://generativelanguage.googleapis.com";
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [csp]
            }
        });
    });

    if (state.isMaximized) mainWindow.maximize();

    // Log any renderer errors
    mainWindow.webContents.on('render-process-gone', (event, details) => {
        logToFile(`[Renderer] Crashed: ${details.reason}`);
    });
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        logToFile(`[Renderer] Failed to load: ${errorCode} ${errorDescription} ${validatedURL}`);
    });

    if (isDev) {
        mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`);
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        const indexPath = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
        logToFile(`Loading frontend: ${indexPath} (exists: ${fs.existsSync(indexPath)})`);
        mainWindow.loadFile(indexPath);
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        closeSplashScreen();
    });
    mainWindow.on('close', saveWindowState);
    mainWindow.on('resize', saveWindowState);
    mainWindow.on('move', saveWindowState);
    mainWindow.on('closed', () => { mainWindow = null; });
}

// ===== ABOUT WINDOW =====
function showAboutWindow() {
    const pkg = require('../package.json');
    const aboutHTML = `
        <div style="font-family: 'Segoe UI', sans-serif; background: #0f0f1a; color: #e5e7eb; padding: 32px; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 8px;">🎬</div>
            <h1 style="font-size: 22px; font-weight: 800; background: linear-gradient(135deg, #a78bfa, #6366f1); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">ClipperSkuy</h1>
            <p style="font-size: 12px; color: #6b7280; margin-bottom: 16px;">AI-Powered Video Clip Engine</p>
            <table style="margin: 0 auto; text-align: left; font-size: 13px; border-collapse: collapse;">
                <tr><td style="color: #9ca3af; padding: 2px 12px 2px 0;">Version</td><td style="font-weight: 600;">${pkg.version}</td></tr>
                <tr><td style="color: #9ca3af; padding: 2px 12px 2px 0;">Electron</td><td>${process.versions.electron}</td></tr>
                <tr><td style="color: #9ca3af; padding: 2px 12px 2px 0;">Node.js</td><td>${process.versions.node}</td></tr>
                <tr><td style="color: #9ca3af; padding: 2px 12px 2px 0;">Platform</td><td>${process.platform} ${process.arch}</td></tr>
                <tr><td style="color: #9ca3af; padding: 2px 12px 2px 0;">Data</td><td style="word-break: break-all; max-width: 220px;">${userDataPath}</td></tr>
            </table>
            <p style="font-size: 11px; color: #4b5563; margin-top: 16px;">© 2026 ClipperSkuy. All rights reserved.</p>
        </div>
    `;

    const aboutWin = new BrowserWindow({
        width: 380,
        height: 340,
        resizable: false,
        minimizable: false,
        maximizable: false,
        parent: mainWindow,
        modal: true,
        icon: path.join(__dirname, 'resources', 'icon.ico'),
        backgroundColor: '#0f0f1a',
        webPreferences: { nodeIntegration: false, contextIsolation: true }
    });
    aboutWin.setMenuBarVisibility(false);
    aboutWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(aboutHTML)}`);
}

// ===== SYSTEM TRAY (ENHANCED) =====
function createTray() {
    try {
        const iconPath = path.join(__dirname, 'resources', 'tray-icon.png');
        const icon = fs.existsSync(iconPath)
            ? nativeImage.createFromPath(iconPath)
            : nativeImage.createEmpty();
        tray = new Tray(icon);
        tray.setToolTip('ClipperSkuy — AI Video Clip Engine');
        tray.setContextMenu(Menu.buildFromTemplate([
            {
                label: 'Open ClipperSkuy',
                click: () => {
                    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
                }
            },
            { type: 'separator' },
            {
                label: 'About',
                click: () => showAboutWindow()
            },
            {
                label: 'Open Log File',
                click: () => {
                    const logPath = path.join(app.getPath('userData'), 'debug.log');
                    if (fs.existsSync(logPath)) shell.openPath(logPath);
                }
            },
            {
                label: 'Open Data Folder',
                click: () => {
                    const dataDir = process.env.CLIPPERSKUY_DATA || path.join(userDataPath, 'data');
                    if (fs.existsSync(dataDir)) shell.openPath(dataDir);
                    else shell.openPath(userDataPath);
                }
            },
            { type: 'separator' },
            {
                label: 'Check for Updates',
                click: () => {
                    if (autoUpdater) autoUpdater.checkForUpdates().catch(() => { });
                    else showNotification('Updates', 'Auto-updater not available in dev mode.');
                }
            },
            { type: 'separator' },
            { label: 'Quit', click: () => app.quit() }
        ]));
        tray.on('double-click', () => {
            if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        });
    } catch (e) {
        logToFile(`[Tray] Skipped: ${e.message}`);
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

    // Window controls
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

    // === NEW IPC: Notifications ===
    ipcMain.handle('show-notification', (event, { title, body }) => {
        showNotification(title, body);
        return true;
    });

    // === NEW IPC: About window ===
    ipcMain.handle('show-about', () => {
        showAboutWindow();
        return true;
    });

    // === NEW IPC: Open log file ===
    ipcMain.handle('open-log-file', () => {
        const logPath = path.join(app.getPath('userData'), 'debug.log');
        if (fs.existsSync(logPath)) {
            shell.openPath(logPath);
            return true;
        }
        return false;
    });

    // === NEW IPC: Get system info ===
    ipcMain.handle('get-system-info', () => ({
        platform: process.platform,
        arch: process.arch,
        cpus: os.cpus().length,
        memory: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
        freeMemory: Math.round(os.freemem() / (1024 * 1024 * 1024)),
        electron: process.versions.electron,
        node: process.versions.node,
        backendRestarts: backendRestartCount
    }));
}

// ===== APP LIFECYCLE =====
console.log('[ClipperSkuy] Registering app.on(ready)...');
try { fs.appendFileSync(CRASH_LOG, `[${new Date().toISOString()}] Registering app.on(ready)...\n`); } catch (e) { }

app.on('ready', async () => {
    try { fs.appendFileSync(CRASH_LOG, `[${new Date().toISOString()}] app.on(ready) FIRED\n`); } catch (e) { }
    console.log('[ClipperSkuy] App ready event fired!');

    // app.isPackaged is false when asar is disabled, so check directory instead
    isDev = !app.isPackaged && !__dirname.includes('Program Files') && !__dirname.includes('AppData');
    userDataPath = app.getPath('userData');
    stateFile = path.join(userDataPath, 'window-state.json');

    logToFile('=== App starting ===');
    logToFile(`Dev mode: ${isDev}`);
    logToFile(`User data: ${userDataPath}`);
    logToFile(`Platform: ${process.platform} ${process.arch}`);
    logToFile(`Memory: ${Math.round(os.totalmem() / (1024 * 1024 * 1024))}GB`);
    logToFile(`Electron: ${process.versions.electron}`);
    logToFile(`Node: ${process.versions.node}`);
    logToFile(`__dirname: ${__dirname}`);

    setupIPC();

    if (!isDev) {
        // Show splash screen while backend loads
        logToFile('Creating splash screen...');
        createSplashScreen();
        logToFile('Starting backend...');
        await startBackend();
        logToFile('Backend start completed');
    } else {
        logToFile('Dev mode — skipping backend start');
    }

    logToFile('Creating main window...');
    createWindow();
    createTray();
    checkFirstRun();
    setupAutoUpdater();

    // Cleanup old temp files (delayed, non-blocking)
    setTimeout(() => cleanupTempFiles(), 15000);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
    saveWindowState();
    if (backendHealthCheck) clearInterval(backendHealthCheck);
    logToFile('=== App quitting ===');
});
