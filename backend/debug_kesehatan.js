// Reset failed and check what happens with clip 4 (Kesehatan Gigi)
const db = require('better-sqlite3')('data/clipperskuy.db');
const c = db.prepare(`
    SELECT c.id, c.clip_number, c.title, c.start_time, c.end_time, c.status,
           p.source_path, p.reframing_mode
    FROM clips c JOIN projects p ON c.project_id = p.id
    WHERE c.title = 'Kesehatan Gigi'
`).get();

console.log('Clip:', c);
const duration = c.end_time - c.start_time;
console.log('Duration:', duration, 'seconds');

db.close();
