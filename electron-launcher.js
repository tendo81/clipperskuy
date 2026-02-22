// Launcher: spawn Electron without ELECTRON_RUN_AS_NODE
// concurrently sets ELECTRON_RUN_AS_NODE=1 which makes electron.exe run as Node
// This script removes it before spawning the real Electron process
const { spawn } = require('child_process');
const path = require('path');

const electronExe = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronExe, ['.'], {
    cwd: __dirname,
    env,
    stdio: 'inherit'
});

child.on('exit', (code) => process.exit(code || 0));
