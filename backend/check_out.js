const db = require('better-sqlite3')('data/clipperskuy.db');
const fs = require('fs');
const c = db.prepare('SELECT * FROM clips WHERE id=?').get('64f0e012-249d-4154-a2f3-0125386ec4f7');
db.close();
console.log('Status:', c.status);
console.log('Output:', c.output_path);
console.log('Error:', c.error_message);

// Look for partial output files
const glob = require('fs');
const dir = 'C:\\Users\\kuyka\\Music\\opus 1\\backend\\data\\renders\\acdf5ff0-cbec-4c32-8f14-c219f5520513';
if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    files.forEach(f => {
        const fp = require('path').join(dir, f);
        const st = fs.statSync(fp);
        console.log(f, '-', (st.size / 1024 / 1024).toFixed(1) + 'MB', '-', new Date(st.mtime).toLocaleTimeString());
    });
}
