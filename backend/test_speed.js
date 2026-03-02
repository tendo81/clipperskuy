// Test kecepatan frame extraction dengan -skip_frame noref
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

const ffmpeg = process.env.FFMPEG_PATH || 'C:\\ffmpeg\\bin\\ffmpeg.exe';
const videoPath = 'C:\\Users\\kuyka\\Music\\opus 1\\backend\\data\\uploads\\2f6b9620-b64e-4cd7-8d7c-f1879a021cca.mp4';
const outDir = 'C:\\Users\\kuyka\\AppData\\Local\\Temp\\ft_speedtest_' + Date.now();
const startTime = 1749; // 29 menit

fs.ensureDirSync(outDir);

const cmd = `"${ffmpeg}" -skip_frame noref -ss ${startTime} -i "${videoPath}" -t 8 -vf "fps=0.5,scale=480:-2" -q:v 6 -y "${path.join(outDir, 'frame_%04d.jpg')}"`;
console.log('Testing fast frame extraction at t=1749s (29min)...');
console.log('Command:', cmd.substring(0, 120) + '...');

const t0 = Date.now();
exec(cmd, { timeout: 60000 }, (err, stdout, stderr) => {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    if (err) console.error('Error:', err.message.substring(0, 100));
    const files = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter(f => f.endsWith('.jpg')) : [];
    console.log(`\n✅ Done in ${elapsed}s! Got ${files.length} frames`);
    console.log('Frames:', files);
    files.forEach(f => {
        const sz = fs.statSync(path.join(outDir, f)).size;
        console.log(`  ${f}: ${sz} bytes`);
    });
});
