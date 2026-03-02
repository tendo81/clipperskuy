const db = require('better-sqlite3')('data/clipperskuy.db');

const projId = 'acdf5ff0-cbec-4c32-8f14-c219f5520513'; // Mamat project

// 1. Restore podcast mode
db.prepare("UPDATE projects SET reframing_mode='podcast' WHERE id=?").run(projId);

// 2. Reset all non-failed clips to detected + clear output
db.prepare(`
    UPDATE clips SET status='detected', output_path=NULL
    WHERE project_id=? AND status != 'failed'
`).run(projId);

// 3. Set default hook settings for all clips
const hookSettings = JSON.stringify({
    duration: 5,
    position: 'top',
    fontSize: 48,
    textColor: '#000000',
    bgColor: '#00E5FF',
    bgOpacity: '1.0',
    hookStyle: 'neon',
    borderColor: '#FFFFFF'
});
db.prepare(`
    UPDATE clips SET hook_settings=?
    WHERE project_id=?
`).run(hookSettings, projId);

// 4. Verify
const clips = db.prepare('SELECT c.clip_number, c.title, c.status FROM clips c WHERE c.project_id=? ORDER BY c.clip_number').all(projId);
const proj = db.prepare('SELECT reframing_mode FROM projects WHERE id=?').get(projId);
console.log('Project mode:', proj.reframing_mode);
console.log('Clips ready:');
clips.forEach(c => console.log(`  #${c.clip_number} ${c.title}: ${c.status}`));
db.close();
