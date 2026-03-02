const db = require('better-sqlite3')('data/clipperskuy.db');
const { execSync } = require('child_process');
const fs = require('fs');
const ffmpeg = 'C:\\ffmpeg\\bin\\ffmpeg.exe';

const c = db.prepare("SELECT status, output_path, title FROM clips WHERE id = ?").get('2fc7ec3d-e889-4c22-b23c-807c2fb6cdaf');
db.close();

console.log('Title:', c?.title);
console.log('Status:', c?.status);
console.log('Output path:', c?.output_path);

if (c?.output_path && c.status === 'rendered') {
    const stat = fs.statSync(c.output_path);
    console.log('File size:', (stat.size / 1024 / 1024).toFixed(1), 'MB');
    console.log('Modified:', stat.mtime);

    // Extract frames from the CORRECT output path
    [[1, 'ft2_t01'], [20, 'ft2_t20'], [50, 'ft2_t50']].forEach(([sec, name]) => {
        const out = `C:\\Users\\kuyka\\AppData\\Local\\Temp\\${name}.jpg`;
        try {
            execSync(`"${ffmpeg}" -y -ss ${sec} -i "${c.output_path}" -vframes 1 "${out}" 2>nul`);
            console.log(`Saved frame@${sec}s → ${out}`);
        } catch (e) { console.error(`err:`, e.message.substring(0, 80)); }
    });
}
