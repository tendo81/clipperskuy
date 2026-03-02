const db = require('better-sqlite3')('data/clipperskuy.db');
const { execSync } = require('child_process');
const fs = require('fs');
const ffmpeg = 'C:\\ffmpeg\\bin\\ffmpeg.exe';

const clips = db.prepare(
    "SELECT id, title, status, output_path FROM clips WHERE id IN (?,?)"
).all('2fc7ec3d-e889-4c22-b23c-807c2fb6cdaf', 'b93b9559-2867-4be4-88ff-585153a9dcc8');

clips.forEach((c, i) => {
    console.log(`\n[${i + 1}] ${c.title} → status: ${c.status}`);
    if (c.status === 'rendered' && c.output_path) {
        const out1 = `C:\\Users\\kuyka\\AppData\\Local\\Temp\\test_clip${i + 1}_t1.jpg`;
        const out7 = `C:\\Users\\kuyka\\AppData\\Local\\Temp\\test_clip${i + 1}_t7.jpg`;
        try {
            execSync(`"${ffmpeg}" -y -ss 1 -i "${c.output_path}" -vframes 1 "${out1}" 2>nul`);
            execSync(`"${ffmpeg}" -y -ss 7 -i "${c.output_path}" -vframes 1 "${out7}" 2>nul`);
            console.log(`  Frame@1s: ${out1} (${fs.existsSync(out1) ? fs.statSync(out1).size + 'B' : 'MISSING'})`);
            console.log(`  Frame@7s: ${out7} (${fs.existsSync(out7) ? fs.statSync(out7).size + 'B' : 'MISSING'})`);
        } catch (e) { console.error('  Error:', e.message.substring(0, 100)); }
    } else {
        console.log('  NOT rendered yet');
    }
});
db.close();
