const db = require('better-sqlite3')('data/clipperskuy.db');
const clips = db.prepare("SELECT id, title, status FROM clips WHERE status = 'detected'").all();
console.log('Unrendered clips:');
clips.forEach(c => console.log(` - [${c.id}] ${c.title} (${c.status})`));
db.close();
