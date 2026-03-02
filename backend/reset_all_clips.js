const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'clipperskuy.db'));

const PROJECT_ID = 'acdf5ff0-cbec-4c32-8f14-c219f5520513';
const clips = db.prepare(`SELECT id, clip_number, title, start_time, end_time, status FROM clips WHERE project_id=? ORDER BY clip_number`).all(PROJECT_ID);

console.log('Current clip statuses:');
clips.forEach(c => {
    const dur = c.end_time - c.start_time;
    console.log(`  #${c.clip_number} [${c.status}] "${c.title}" ${c.start_time}s-${c.end_time}s (${dur}s)`);
});

// Reset all to 'detected' so they can be re-rendered
db.prepare(`UPDATE clips SET status='detected' WHERE project_id=?`).run(PROJECT_ID);
console.log('\nReset all clips to detected.');
db.close();
