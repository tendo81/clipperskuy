// Reset stuck rendering clips back to detected
const db = require('better-sqlite3')('data/clipperskuy.db');
const clips = db.prepare(`
    SELECT c.id, c.clip_number, c.title, c.status
    FROM clips c JOIN projects p ON c.project_id = p.id
    WHERE (p.name LIKE '%MAMAT%' OR p.name LIKE '%Frimawan%')
    AND c.status = 'rendering'
`).all();

console.log(`Resetting ${clips.length} stuck rendering clips...`);
clips.forEach(c => {
    db.prepare("UPDATE clips SET status='detected' WHERE id=?").run(c.id);
    console.log(`  ✓ Reset #${c.clip_number} ${c.title}`);
});
db.close();
