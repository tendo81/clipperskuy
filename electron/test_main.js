const fs = require('fs');
const path = require('path');

const LOG = path.join(process.env.APPDATA || '.', 'clipperskuy', 'test2.log');
try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); } catch (e) { }

const electron = require('electron');
const lines = [
    `electron type: ${typeof electron}`,
    `electron keys: ${Object.keys(electron).join(', ')}`,
    `app: ${electron.app}`,
    `app type: ${typeof electron.app}`,
    `BrowserWindow: ${typeof electron.BrowserWindow}`,
    `default: ${typeof electron.default}`,
    `electron.app?.getName: ${typeof electron.app?.getName}`,
];

// Also check if electron is the default export
if (electron.default) {
    lines.push(`default.app: ${typeof electron.default.app}`);
}

// Check if electron itself has app as a getter (Electron 28+ uses ES modules internally)
const desc = Object.getOwnPropertyDescriptor(electron, 'app');
if (desc) {
    lines.push(`app descriptor: ${JSON.stringify({ configurable: desc.configurable, enumerable: desc.enumerable, hasGet: !!desc.get, hasValue: !!desc.value })}`);
} else {
    lines.push(`app descriptor: null (not own property)`);
    // check prototype
    const proto = Object.getPrototypeOf(electron);
    if (proto) {
        lines.push(`proto keys: ${Object.keys(proto).join(', ')}`);
    }
}

fs.writeFileSync(LOG, lines.join('\n') + '\n');

if (electron.app) {
    electron.app.whenReady().then(() => {
        fs.appendFileSync(LOG, 'ready!\n');
        const win = new electron.BrowserWindow({ width: 400, height: 300 });
        win.loadURL('data:text/html,<h1>Works!</h1>');
    });
} else {
    fs.appendFileSync(LOG, 'NO APP\n');
    process.exit(1);
}
