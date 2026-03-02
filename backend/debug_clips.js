const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.CLIPPERSKUY_DATA || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'clipperskuy.db');

console.log('DB path:', DB_PATH, '| exists:', fs.existsSync(DB_PATH));

const db = new Database(DB_PATH, { readonly: true });

const clips = db.prepare('SELECT id, title, hook_text, hook_settings, status FROM clips LIMIT 5').all();
console.log('\n=== CLIPS ===');
clips.forEach(c => {
    console.log('\nClip:', c.title?.substring(0, 50));
    console.log('  status:', c.status);
    console.log('  hook_text:', c.hook_text);
    console.log('  hook_settings:', c.hook_settings);
});

const proj = db.prepare('SELECT id, name, reframing_mode, status FROM projects').all();
console.log('\n=== PROJECTS ===');
proj.forEach(p => console.log(' -', p.name?.substring(0, 40), '| mode:', p.reframing_mode, '| status:', p.status));

db.close();
