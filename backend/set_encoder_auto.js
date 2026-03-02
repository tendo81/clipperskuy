const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'clipperskuy.db'));

// Reset to auto so encoder detection runs fresh with h264_mf fallback
const toSet = [
    { key: 'encoder', value: 'auto' },
    { key: 'hw_accel', value: 'auto' },
    { key: 'output_resolution', value: '1080p' }
];

for (const s of toSet) {
    const exists = db.prepare("SELECT key FROM settings WHERE key=?").get(s.key);
    if (exists) {
        db.prepare("UPDATE settings SET value=? WHERE key=?").run(s.value, s.key);
    } else {
        db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run(s.key, s.value);
    }
    console.log(`SET ${s.key} = ${s.value}`);
}

db.close();
console.log('\nDone! Auto-detect akan pilih h264_mf (GPU AMD via MediaFoundation)');
