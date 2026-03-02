const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'clipperskuy.db'));

const PROJECT_ID = 'acdf5ff0-cbec-4c32-8f14-c219f5520513';
const p = db.prepare('SELECT reframing_mode, aspect_ratio, platform, language FROM projects WHERE id=?').get(PROJECT_ID);

console.log('=== Project Settings ===');
console.log('Reframing Mode :', p.reframing_mode);
console.log('Aspect Ratio   :', p.aspect_ratio);
console.log('Platform       :', p.platform);
console.log('Language       :', p.language);

// Check hook & subtitle settings on first clip
const clip = db.prepare('SELECT hook_settings, hook_style, caption_style, caption_settings FROM clips WHERE project_id=? LIMIT 1').get(PROJECT_ID);
console.log('\n=== Clip Settings (sample) ===');
console.log('Hook Style     :', clip.hook_style);
console.log('Caption Style  :', clip.caption_style);
try { console.log('Caption Settings:', JSON.parse(clip.caption_settings || '{}')); } catch (e) { }
try { console.log('Hook Settings:', JSON.parse(clip.hook_settings || '{}')); } catch (e) { }

db.close();
