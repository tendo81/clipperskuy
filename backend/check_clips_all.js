const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'clipperskuy.db'));

const PROJECT_ID = 'acdf5ff0-cbec-4c32-8f14-c219f5520513';
const clips = db.prepare(`SELECT clip_number, title, status, start_time, end_time FROM clips WHERE project_id=? ORDER BY clip_number`).all(PROJECT_ID);
const proj = db.prepare(`SELECT status, min_duration, max_duration FROM projects WHERE id=?`).get(PROJECT_ID);

console.log(`Project status: ${proj.status}  Duration range: ${proj.min_duration}s-${proj.max_duration}s\n`);
console.log('Clips:');
clips.forEach(c => {
    const dur = (c.end_time - c.start_time).toFixed(0);
    const m1 = Math.floor(c.start_time / 60) + ':' + String(Math.round(c.start_time % 60)).padStart(2, '0');
    const m2 = Math.floor(c.end_time / 60) + ':' + String(Math.round(c.end_time % 60)).padStart(2, '0');
    console.log(`  #${c.clip_number} [${c.status}] "${c.title}" ${m1}-${m2} = ${dur}s`);
});
db.close();
