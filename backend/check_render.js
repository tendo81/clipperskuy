const db = require('better-sqlite3')('data/clipperskuy.db');
const c = db.prepare("SELECT status, output_path FROM clips WHERE id = ?").get('5458ac64-fe90-4bbe-8a59-ff00c5be74ff');
console.log('Status:', c?.status);
console.log('Output:', c?.output_path);
db.close();

if (c?.output_path && c.status === 'rendered') {
    const { execSync } = require('child_process');
    const ffmpeg = process.env.FFMPEG_PATH || 'C:\\ffmpeg\\bin\\ffmpeg.exe';

    // Frame at 1s (hook SHOULD be visible)
    try {
        execSync(`"${ffmpeg}" -y -ss 1 -i "${c.output_path}" -vframes 1 "C:\\Users\\kuyka\\AppData\\Local\\Temp\\hook_t1.jpg" 2>nul`);
        console.log('Frame@1s saved');
    } catch (e) { console.error('Frame@1s err:', e.message.substring(0, 100)); }

    // Frame at 7s (hook SHOULD be gone if duration=5)
    try {
        execSync(`"${ffmpeg}" -y -ss 7 -i "${c.output_path}" -vframes 1 "C:\\Users\\kuyka\\AppData\\Local\\Temp\\hook_t7.jpg" 2>nul`);
        console.log('Frame@7s saved');
    } catch (e) { console.error('Frame@7s err:', e.message.substring(0, 100)); }
}
