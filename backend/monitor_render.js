const db = require('better-sqlite3')('data/clipperskuy.db');
const clips = db.prepare(`
    SELECT c.title, c.status, c.output_path
    FROM clips c JOIN projects p ON c.project_id = p.id
    WHERE p.name LIKE '%MAMAT%' OR p.name LIKE '%Frimawan%'
    ORDER BY c.clip_number
`).all();

let allDone = true;
clips.forEach(c => {
    const done = c.status === 'rendered';
    if (!done) allDone = false;
    console.log(`[${done ? '✓' : '...'}] ${c.status.padEnd(10)} ${c.title}`);
});

console.log('\n' + (allDone ? '🎉 SEMUA SELESAI!' : '⏳ Masih rendering...'));
db.close();
