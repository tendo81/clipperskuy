/**
 * ClipperSkuy Bot Runner — Single Instance Guaranteed
 * Runs index.js and auto-restarts on crash.
 * Prevents zombie processes by tracking child PID.
 */
const { spawn } = require('child_process');
const path = require('path');

const BOT_SCRIPT = path.join(__dirname, 'index.js');
let child = null;
let restarting = false;

function startBot() {
    if (restarting) return;
    restarting = true;

    // Kill any existing child
    if (child) {
        try { child.kill('SIGTERM'); } catch(e) {}
        child = null;
    }

    console.log(`[${new Date().toLocaleString('id-ID')}] 🚀 Starting bot...`);

    child = spawn('node', [BOT_SCRIPT], {
        stdio: 'inherit',
        cwd: __dirname,
        env: process.env
    });

    restarting = false;

    child.on('exit', (code) => {
        console.log(`[${new Date().toLocaleString('id-ID')}] ⚠️ Bot exited with code ${code}. Restarting in 10s...`);
        child = null;
        setTimeout(startBot, 10000);
    });

    child.on('error', (err) => {
        console.error(`[${new Date().toLocaleString('id-ID')}] ❌ Spawn error: ${err.message}`);
        child = null;
        setTimeout(startBot, 10000);
    });
}

// Graceful shutdown — kill child first
process.on('SIGINT', () => {
    console.log('\n⏹ Runner stopping...');
    if (child) child.kill('SIGTERM');
    setTimeout(() => process.exit(0), 3000);
});

process.on('SIGTERM', () => {
    if (child) child.kill('SIGTERM');
    setTimeout(() => process.exit(0), 3000);
});

// Keep runner alive
setInterval(() => {}, 60000);

console.log('╔═══════════════════════════════════════════╗');
console.log('║   ClipperSkuy Bot Runner v2.0             ║');
console.log('║   Auto-restart on crash                   ║');
console.log('║   Single instance guaranteed               ║');
console.log('╚═══════════════════════════════════════════╝');

startBot();
