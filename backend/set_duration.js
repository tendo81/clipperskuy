const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'clipperskuy.db'));

const PROJECT_ID = 'acdf5ff0-cbec-4c32-8f14-c219f5520513';

// Check current settings
const before = db.prepare('SELECT min_duration, max_duration FROM projects WHERE id=?').get(PROJECT_ID);
console.log('BEFORE:', before);

// Update to 60-90 seconds
db.prepare('UPDATE projects SET min_duration=60, max_duration=90 WHERE id=?').run(PROJECT_ID);

const after = db.prepare('SELECT min_duration, max_duration FROM projects WHERE id=?').get(PROJECT_ID);
console.log('AFTER:', after);

db.close();
console.log('Done! Now re-process via API...');
