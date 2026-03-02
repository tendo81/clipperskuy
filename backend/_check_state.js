const db = require('better-sqlite3')('data/clipperskuy.db');
const settings = db.prepare('SELECT key, value FROM settings').all();
console.log('=== Settings ===');
settings.forEach(s => console.log(` ${s.key}: ${s.value || '(empty)'}`));
const licenses = db.prepare('SELECT license_key, tier, status, machine_id FROM license_keys').all();
console.log('\n=== License Keys ===');
licenses.forEach(l => console.log(` ${l.license_key} | ${l.tier} | ${l.status} | machine: ${l.machine_id || 'none'}`));
db.close();
