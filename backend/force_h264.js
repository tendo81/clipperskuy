const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'clipperskuy.db'));

// Check current encoder settings
const settings = db.prepare("SELECT key, value FROM settings WHERE key IN ('encoder','hw_accel','output_resolution')").all();
console.log('Current settings:');
settings.forEach(s => console.log(`  ${s.key} = ${s.value}`));

// Force libx264 encoder (H.264 CPU — compatible with ALL platforms)
const toSet = [
    { key: 'encoder', value: 'libx264' },
    { key: 'hw_accel', value: 'none' },
    { key: 'output_resolution', value: '1080p' }
];

for (const s of toSet) {
    const exists = db.prepare("SELECT key FROM settings WHERE key=?").get(s.key);
    if (exists) {
        db.prepare("UPDATE settings SET value=? WHERE key=?").run(s.value, s.key);
    } else {
        db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run(s.key, s.value);
    }
    console.log(`  SET ${s.key} = ${s.value}`);
}

console.log('\nDone! Encoder forced to H.264 (libx264)');
db.close();
