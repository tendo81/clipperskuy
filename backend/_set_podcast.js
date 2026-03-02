const Database = require('better-sqlite3');
const db = new Database('./data/clipperskuy.db');
db.prepare("UPDATE projects SET reframing_mode = 'podcast' WHERE name LIKE '%CANTIK%'").run();
const p = db.prepare('SELECT id, name, reframing_mode FROM projects').all();
p.forEach(x => console.log(x.reframing_mode, '|', x.name));
db.close();
console.log('Done!');
