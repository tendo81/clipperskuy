const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CLIPS_DIR = 'C:\\Users\\kuyka\\Music\\opus 1\\backend\\data\\clips\\acdf5ff0-cbec-4c32-8f14-c219f5520513';
const files = fs.readdirSync(CLIPS_DIR).filter(f => f.endsWith('.mp4') && f.includes('_') && !f.includes('Gigi_Susu') && !f.includes('Dokter_Gigi_')).sort();

// Get only new files (clip1-clip9 from latest batch)
const newFiles = fs.readdirSync(CLIPS_DIR)
    .filter(f => f.endsWith('.mp4'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(CLIPS_DIR, f)).mtimeMs, size: fs.statSync(path.join(CLIPS_DIR, f)).size }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 9); // 9 latest files

console.log('=== Rendered Clips Info ===\n');
let totalSize = 0;
for (const f of newFiles) {
    const fp = path.join(CLIPS_DIR, f.name);
    let info = '';
    try {
        const probe = execSync(
            `ffprobe -v quiet -show_streams -show_format -of json "${fp}"`,
            { encoding: 'utf-8', timeout: 10000 }
        );
        const data = JSON.parse(probe);
        const vs = data.streams?.find(s => s.codec_type === 'video');
        const dur = parseFloat(data.format?.duration || 0).toFixed(1);
        const bitrate = Math.round(parseInt(data.format?.bit_rate || 0) / 1000);
        const w = vs?.width || '?';
        const h = vs?.height || '?';
        const codec = vs?.codec_name || '?';
        const fps = vs?.r_frame_rate ? eval(vs.r_frame_rate).toFixed(0) : '?';
        const sizeMB = (f.size / 1024 / 1024).toFixed(1);
        totalSize += f.size;
        console.log(`${f.name}`);
        console.log(`  Size: ${sizeMB} MB | Duration: ${dur}s | Resolution: ${w}x${h} | Bitrate: ${bitrate} kbps | Codec: ${codec} | FPS: ${fps}`);
        console.log('');
    } catch (e) {
        console.log(`${f.name}: ERROR - ${e.message.substring(0, 60)}`);
    }
}
console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
