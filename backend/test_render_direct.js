// Direct render test for Kesehatan Gigi clip - capture all errors
process.env.CLIPPERSKUY_DATA = require('path').join(__dirname, 'data');

const { renderClip } = require('./src/services/clipRenderer');
const Database = require('better-sqlite3');
const path = require('path');

const DATA_DIR = process.env.CLIPPERSKUY_DATA;
const db = new Database(path.join(DATA_DIR, 'clipperskuy.db'));

const clip = db.prepare("SELECT * FROM clips WHERE id=?").get('cb2a7460-c4dc-45df-8549-4437a7dc3f66');
const project = db.prepare("SELECT * FROM projects WHERE id=?").get(clip.project_id);
db.close();

console.log('Rendering clip:', clip.title, '| duration:', (clip.end_time - clip.start_time), 's');
console.log('Source exists:', require('fs').existsSync(project.source_path));

const emit = (pct, msg) => console.log(`  [${pct}%] ${msg}`);

renderClip(clip.id, project, null, emit)
    .then(r => console.log('\n✅ SUCCESS:', r))
    .catch(e => console.error('\n❌ ERROR:', e.message, '\nStack:', e.stack?.substring(0, 500)));
