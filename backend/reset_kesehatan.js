const db = require('better-sqlite3')('data/clipperskuy.db');
// Get correct project ID for Mamat project
const proj = db.prepare("SELECT id FROM projects WHERE name LIKE '%MAMAT%' OR name LIKE '%Frimawan%' ORDER BY created_at DESC LIMIT 1").get();
console.log('Mamat project ID:', proj?.id);

// Reset clip
db.prepare("UPDATE clips SET status='detected', output_path=NULL WHERE id=?").run('cb2a7460-c4dc-45df-8549-4437a7dc3f66');
const c = db.prepare("SELECT id,title,status,project_id FROM clips WHERE id=?").get('cb2a7460-c4dc-45df-8549-4437a7dc3f66');
console.log('Clip after reset:', c);
console.log('Same project?', c.project_id === proj?.id);
db.close();
