const db = require('better-sqlite3')('data/clipperskuy.db');
const clips = db.prepare(`
    SELECT c.id, c.clip_number, c.title, c.hook_text, c.hook_settings, c.status
    FROM clips c JOIN projects p ON c.project_id = p.id
    WHERE p.name LIKE '%MAMAT%' OR p.name LIKE '%Frimawan%'
    ORDER BY c.clip_number
`).all();

console.log('=== Hook Settings per Clip ===');
clips.forEach(c => {
    let hs = {};
    try { hs = c.hook_settings ? JSON.parse(c.hook_settings) : {}; } catch (e) { }
    console.log(`\nClip #${c.clip_number}: ${c.title} [${c.status}]`);
    console.log('  hook_text:', c.hook_text || '(none)');
    console.log('  hook_settings:', JSON.stringify(hs));
});
db.close();
