// Debug: check what filter_complex is being built for clip #1 podcast mode
// Simulate the relevant parts of clipRenderer logic

const db = require('better-sqlite3')('data/clipperskuy.db');
const clip = db.prepare('SELECT * FROM clips WHERE id=?').get('64f0e012-249d-4154-a2f3-0125386ec4f7');
const project = db.prepare('SELECT * FROM projects WHERE id=?').get(clip.project_id);
db.close();

console.log('Clip #1:', clip.title);
console.log('Project mode:', project.reframing_mode);
console.log('Hook text:', clip.hook_text?.substring(0, 50));
console.log('Hook settings:', clip.hook_settings?.substring(0, 100));
console.log('Start time:', clip.start_time, 'End time:', clip.end_time);
