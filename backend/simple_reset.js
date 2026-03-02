const db = require('better-sqlite3')('data/clipperskuy.db');
db.prepare("UPDATE clips SET status='detected',output_path=NULL WHERE id=?").run('cb2a7460-c4dc-45df-8549-4437a7dc3f66');
db.close();
console.log('Reset done');
