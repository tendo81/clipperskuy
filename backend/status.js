const db = require('better-sqlite3')('data/clipperskuy.db');
const clips = db.prepare(`
    SELECT c.clip_number, c.title, c.status
    FROM clips c JOIN projects p ON c.project_id = p.id
    WHERE (p.name LIKE '%MAMAT%' OR p.name LIKE '%Frimawan%')
    ORDER BY c.clip_number
`).all();

let done = 0, rendering = 0, failed = 0;
clips.forEach(c => {
    const icon = c.status === 'rendered' ? '✓' : c.status === 'failed' ? '✗' : '⏳';
    console.log(`${icon} #${c.clip_number} ${c.title}: ${c.status}`);
    if (c.status === 'rendered') done++;
    else if (c.status === 'failed') failed++;
    else rendering++;
});
console.log(`\n${done} rendered, ${rendering} still rendering, ${failed} failed`);
db.close();
