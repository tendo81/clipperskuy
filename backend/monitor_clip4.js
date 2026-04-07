// Monitor render kecepatan Clip#4 (PWK) - start=2093s, duration=71s
const db = require('better-sqlite3')('data/clipperskuy.db');
const { exec } = require('child_process');

const clipId = '600da154-25af-4b4e-b036-76ba060a4dc7';
const t0 = Date.now();
let checkCount = 0;

console.log('📊 Monitoring render: Clip#4 PWK (71s clip at minute 34)');
console.log('   Watching FFmpeg speed + DB status...\n');

const interval = setInterval(() => {
    const elapsed = Math.round((Date.now() - t0) / 1000);
    checkCount++;

    // Check DB status
    try {
        const c = db.prepare('SELECT status, output_path FROM clips WHERE id = ?').get(clipId);
        const status = c ? c.status : 'NOT FOUND';
        const hasOutput = c && c.output_path ? '✅ has file' : '❌ no file';

        // Check FFmpeg
        exec('tasklist /FI "IMAGENAME eq ffmpeg.exe" /FO CSV /NH', (err, stdout) => {
            const ffmpegRunning = stdout && stdout.includes('ffmpeg.exe');
            const ffmpegStr = ffmpegRunning ? '⚡ FFmpeg ACTIVE' : '— no FFmpeg';
            
            process.stdout.write(`[${elapsed}s] Status: ${status} | ${hasOutput} | ${ffmpegStr}\r\n`);

            if (status === 'rendered') {
                console.log(`\n✅ RENDER COMPLETE in ${elapsed}s! Output: ${c.output_path}`);
                clearInterval(interval);
                db.close();
                process.exit(0);
            }
            if (status === 'detected') {
                console.log(`\n⚠️ Render failed or reset back to 'detected' after ${elapsed}s`);
                clearInterval(interval);
                db.close();
                process.exit(1);
            }
            if (elapsed > 300) {
                console.log('\n⏱️ Timeout after 5 minutes');
                clearInterval(interval);
                db.close();
                process.exit(1);
            }
        });
    } catch (e) {
        console.error('DB error:', e.message);
    }
}, 5000);
