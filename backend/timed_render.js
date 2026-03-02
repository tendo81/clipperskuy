const start = Date.now();
const { execSync } = require('child_process');
const t0 = new Date().toLocaleTimeString('id-ID', { hour12: false });
console.log(`[${t0}] Mulai render semua clips...\n`);

try {
    execSync('node render_sequential.js', {
        stdio: 'inherit',
        cwd: __dirname
    });
} catch (e) { }

const elapsed = ((Date.now() - start) / 1000).toFixed(0);
const mins = Math.floor(elapsed / 60);
const secs = elapsed % 60;
const t1 = new Date().toLocaleTimeString('id-ID', { hour12: false });
console.log(`\n[${t1}] SELESAI! Total waktu: ${mins} menit ${secs} detik`);
