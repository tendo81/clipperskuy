const db = require('better-sqlite3')('data/clipperskuy.db');
const { execSync } = require('child_process');
const fs = require('fs');
const ffmpeg = 'C:\\ffmpeg\\bin\\ffmpeg.exe';

// Get clip 1 output path
const c = db.prepare(`
    SELECT c.clip_number, c.output_path, c.hook_text, c.hook_settings
    FROM clips c JOIN projects p ON c.project_id = p.id
    WHERE (p.name LIKE '%MAMAT%' OR p.name LIKE '%Frimawan%')
    AND c.clip_number = 1 AND c.status = 'rendered'
`).get();
db.close();

console.log('Hook text:', c.hook_text);
console.log('Hook settings:', c.hook_settings);

// Extract frame at t=0.5s (very early - hook should be visible)
['0.5', '1.0', '2.0', '3.0'].forEach(t => {
    const out = `C:\\Users\\kuyka\\AppData\\Local\\Temp\\hooktest_t${t.replace('.', '_')}.jpg`;
    try {
        execSync(`"${ffmpeg}" -y -ss ${t} -i "${c.output_path}" -vframes 1 "${out}" 2>nul`);
        const sz = fs.existsSync(out) ? (fs.statSync(out).size / 1024).toFixed(0) + 'KB' : 'MISSING';
        console.log(`t=${t}s: ${sz} → ${out}`);
    } catch (e) { console.error('err:', e.message.substring(0, 80)); }
});
