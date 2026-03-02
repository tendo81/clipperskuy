const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'clipperskuy.db'));

const proj = db.prepare("SELECT duration FROM projects WHERE id='acdf5ff0-cbec-4c32-8f14-c219f5520513'").get();
const clip6 = db.prepare("SELECT id, title, start_time, end_time FROM clips WHERE project_id='acdf5ff0-cbec-4c32-8f14-c219f5520513' AND clip_number=6").get();

console.log('Video duration:', proj.duration.toFixed(1), 's (' + Math.floor(proj.duration / 60) + ':' + String(Math.round(proj.duration % 60)).padStart(2, '0') + ')');
console.log('Clip #6:', clip6.title);
console.log('  start:', clip6.start_time, 's (' + Math.floor(clip6.start_time / 60) + ':' + String(Math.round(clip6.start_time % 60)).padStart(2, '0') + ')');
console.log('  end:', clip6.end_time, 's (' + Math.floor(clip6.end_time / 60) + ':' + String(Math.round(clip6.end_time % 60)).padStart(2, '0') + ')');
console.log('  Available:', Math.max(0, proj.duration - clip6.start_time).toFixed(1), 's');

// Fix: cap end_time to video duration
if (clip6.end_time > proj.duration) {
    const newEnd = Math.floor(proj.duration);
    console.log('\nFixing end_time:', clip6.end_time, '->', newEnd);
    db.prepare("UPDATE clips SET end_time=? WHERE id=?").run(newEnd, clip6.id);
    console.log('Fixed!');
}

db.close();
