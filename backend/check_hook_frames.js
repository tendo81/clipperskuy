const db = require('better-sqlite3')('data/clipperskuy.db');
const { execSync } = require('child_process');
const fs = require('fs');
const ffmpeg = 'C:\\ffmpeg\\bin\\ffmpeg.exe';

const clips = db.prepare(`
    SELECT c.clip_number, c.title, c.status, c.output_path
    FROM clips c JOIN projects p ON c.project_id = p.id
    WHERE (p.name LIKE '%MAMAT%' OR p.name LIKE '%Frimawan%')
    AND c.status = 'rendered'
    ORDER BY c.clip_number
`).all();
db.close();

console.log(`Extracting frames for ${clips.length} rendered clips...`);
clips.forEach(c => {
    // Frame at t=1s (hook area) and t=8s (no hook)
    ['1', '8'].forEach(t => {
        const out = `C:\\Users\\kuyka\\AppData\\Local\\Temp\\hook_clip${c.clip_number}_t${t}.jpg`;
        try {
            execSync(`"${ffmpeg}" -y -ss ${t} -i "${c.output_path}" -vframes 1 "${out}" 2>nul`);
            const sz = fs.existsSync(out) ? (fs.statSync(out).size / 1024).toFixed(0) + 'KB' : 'MISSING';
            console.log(`  Clip#${c.clip_number}@t=${t}s: ${sz}`);
        } catch (e) { console.error(`  ERROR clip#${c.clip_number}@t=${t}s`); }
    });
});
console.log('Done!');
