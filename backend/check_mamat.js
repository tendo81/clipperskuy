const db = require('better-sqlite3')('data/clipperskuy.db');
const { execSync } = require('child_process');
const fs = require('fs');
const ffmpeg = 'C:\\ffmpeg\\bin\\ffmpeg.exe';

// Get all rendered clips from Mamat project
const clips = db.prepare(`
    SELECT c.id, c.clip_number, c.title, c.status, c.output_path
    FROM clips c JOIN projects p ON c.project_id = p.id
    WHERE (p.name LIKE '%MAMAT%' OR p.name LIKE '%Frimawan%')
    ORDER BY c.clip_number
`).all();

// Find and reset failed clip
const failedClip = clips.find(c => c.status === 'failed');
if (failedClip) {
    db.prepare("UPDATE clips SET status='detected' WHERE id=?").run(failedClip.id);
    console.log('Reset failed clip:', failedClip.title, '→ detected');
}

// Extract frames from rendered clips for visual check
const rendered = clips.filter(c => c.status === 'rendered');
console.log(`\nRendered: ${rendered.length}/${clips.length} clips`);

rendered.forEach((c, i) => {
    const out = `C:\\Users\\kuyka\\AppData\\Local\\Temp\\mamat_clip${c.clip_number}_t3.jpg`;
    try {
        execSync(`"${ffmpeg}" -y -ss 3 -i "${c.output_path}" -vframes 1 "${out}" 2>nul`);
        const sz = fs.existsSync(out) ? (fs.statSync(out).size / 1024).toFixed(0) + 'KB' : 'FAIL';
        console.log(`  Clip#${c.clip_number} ${c.title}: ${sz} → ${out}`);
    } catch (e) { console.error(`  Clip#${c.clip_number} error:`, e.message.substring(0, 60)); }
});

db.close();
