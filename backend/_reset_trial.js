const Database = require('better-sqlite3');
const db = new Database('data/clipperskuy.db');
db.prepare("DELETE FROM settings WHERE key='trial_started_at'").run();
console.log('Result:', db.prepare("SELECT value FROM settings WHERE key='trial_started_at'").get() || 'Deleted');
db.close();
