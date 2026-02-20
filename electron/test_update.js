// test_update.js — Auto-update checker
const { app } = require('electron');

const path = require('path');
const fs = require('fs');

const LOG = path.join(process.env.APPDATA || '.', 'clipperskuy', 'update_test.log');
function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    try { fs.appendFileSync(LOG, line); } catch (e) { }
}

try { fs.writeFileSync(LOG, ''); } catch (e) { }
log('Script loaded. process.type=' + process.type);
log('app type=' + typeof app);
log('app=' + JSON.stringify(app ? Object.keys(app).slice(0, 5) : null));

if (!app || typeof app.on !== 'function') {
    log('app not available. Electron not loaded properly.');
    log('require electron returns: ' + typeof require('electron'));
    process.exit(1);
}

log('app.getVersion=' + app.getVersion());

// No single instance lock for test
app.on('ready', async () => {
    log('App ready!');
    log('Version: ' + app.getVersion());
    log('isPackaged: ' + app.isPackaged);

    try {
        const { autoUpdater } = require('electron-updater');
        log('electron-updater loaded OK');

        const ghToken = process.env.GH_TOKEN || '';
        if (ghToken) {
            autoUpdater.requestHeaders = { Authorization: `token ${ghToken}` };
            log('GitHub token configured from env');
        } else {
            log('⚠️ No GH_TOKEN env variable set — update check may fail');
        }
        autoUpdater.autoDownload = false;
        autoUpdater.forceDevUpdateConfig = true;

        autoUpdater.on('checking-for-update', () => log('Checking for update...'));

        autoUpdater.on('update-available', (info) => {
            log('✅ UPDATE AVAILABLE: v' + info.version);
            log('🎉 AUTO-UPDATE WORKS!');
            setTimeout(() => app.quit(), 2000);
        });

        autoUpdater.on('update-not-available', (info) => {
            log('ℹ No update. Current=' + app.getVersion() + ' Latest=' + info.version);
            setTimeout(() => app.quit(), 2000);
        });

        autoUpdater.on('error', (err) => {
            log('❌ ERROR: ' + err.message);
            log('Stack: ' + err.stack);
            setTimeout(() => app.quit(), 2000);
        });

        log('Calling checkForUpdates...');
        const result = await autoUpdater.checkForUpdates();
        log('checkForUpdates returned: ' + JSON.stringify(result?.updateInfo?.version || 'null'));
    } catch (err) {
        log('FATAL: ' + err.message + '\n' + err.stack);
        setTimeout(() => app.quit(), 2000);
    }
});

setTimeout(() => { log('TIMEOUT 30s'); try { app.quit(); } catch (e) { process.exit(0); } }, 30000);
