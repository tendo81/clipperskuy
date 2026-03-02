const db = require('better-sqlite3')('data/clipperskuy.db');
const { execSync } = require('child_process');
const fs = require('fs');
const ffmpeg = 'C:\\ffmpeg\\bin\\ffmpeg.exe';

const c = db.prepare("SELECT status, output_path, title FROM clips WHERE id = ?").get('2fc7ec3d-e889-4c22-b23c-807c2fb6cdaf');
db.close();

console.log('Title:', c?.title, '| Status:', c?.status);
if (c?.status === 'rendered' && c?.output_path) {
    // Extract 3 frames to see face tracking in action
    [[1, 't01'], [20, 't20'], [50, 't50'], [70, 't70']].forEach(([sec, name]) => {
        const out = `C:\\Users\\kuyka\\AppData\\Local\\Temp\\ft_${name}.jpg`;
        try {
            execSync(`"${ffmpeg}" -y -ss ${sec} -i "${c.output_path}" -vframes 1 "${out}" 2>nul`);
            console.log(`Frame@${sec}s: ${fs.existsSync(out) ? fs.statSync(out).size + 'B' : 'MISSING'}`);
        } catch (e) { console.error(`err@${sec}s:`, e.message.substring(0, 80)); }
    });
} else {
    console.log('Not rendered yet!');
}
