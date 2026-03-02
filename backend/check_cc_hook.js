const db = require('better-sqlite3')('data/clipperskuy.db');
const { execSync } = require('child_process');
const fs = require('fs');
const ffmpeg = 'C:\\ffmpeg\\bin\\ffmpeg.exe';
const c = db.prepare("SELECT output_path FROM clips WHERE id=?").get('64f0e012-249d-4154-a2f3-0125386ec4f7');
db.close();
['0.5', '1.0', '2.0', '4.0'].forEach(t => {
    const out = `C:\\Users\\kuyka\\AppData\\Local\\Temp\\cchook_t${t.replace('.', '_')}.jpg`;
    execSync(`"${ffmpeg}" -y -ss ${t} -i "${c.output_path}" -vframes 1 "${out}" 2>nul`);
    console.log(`t=${t}s: ${fs.statSync(out).size} bytes`);
});
