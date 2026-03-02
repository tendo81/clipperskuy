// Temporarily switch project to center crop for quick hook test
const db = require('better-sqlite3')('data/clipperskuy.db');
const proj = db.prepare("SELECT id FROM projects WHERE name LIKE '%MAMAT%' OR name LIKE '%Frimawan%' ORDER BY created_at DESC LIMIT 1").get();
console.log('Project:', proj?.id);
// Save original mode and switch to center
db.prepare("UPDATE projects SET reframing_mode='center' WHERE id=?").run(proj.id);
// Reset clips
db.prepare(`
    UPDATE clips SET status='detected', output_path=NULL
    WHERE project_id=? AND status IN ('rendering','rendered')
`).run(proj.id);
const clips = db.prepare("SELECT clip_number, title, status FROM clips WHERE project_id=? ORDER BY clip_number").all(proj.id);
clips.forEach(c => console.log(`  #${c.clip_number} ${c.title}: ${c.status}`));
db.close();
console.log('\nProject switched to CENTER CROP for hook test');
console.log('Restore after: UPDATE projects SET reframing_mode=\'podcast\' WHERE id=\'' + proj.id + '\'');
