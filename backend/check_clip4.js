const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'clipperskuy.db'));

const p = db.prepare("SELECT source_path, duration FROM projects WHERE id='acdf5ff0-cbec-4c32-8f14-c219f5520513'").get();
console.log('Source:', p.source_path);
console.log('Duration in DB:', p.duration, 's =', Math.floor(p.duration / 60) + ':' + String(Math.round(p.duration % 60)).padStart(2, '0'));

const clip4 = db.prepare("SELECT * FROM clips WHERE project_id='acdf5ff0-cbec-4c32-8f14-c219f5520513' AND clip_number=4").get();
console.log('\nClip #4:');
console.log('  start_time:', clip4.start_time, 's');
console.log('  end_time:', clip4.end_time, 's');
console.log('  Problem: start', clip4.start_time, '>', 'video_end', p.duration, '?', clip4.start_time > p.duration);

db.close();
