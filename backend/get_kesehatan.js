const db = require('better-sqlite3')('data/clipperskuy.db');
const c = db.prepare(`SELECT c.id FROM clips c JOIN projects p ON c.project_id=p.id WHERE c.title='Kesehatan Gigi' AND (p.name LIKE '%MAMAT%' OR p.name LIKE '%Frimawan%')`).get();
console.log(c?.id);
db.close();
