const db = require('better-sqlite3')('data/clipperskuy.db');
const { execSync } = require('child_process');

const clips = db.prepare(`
    SELECT c.id, c.clip_number, c.title
    FROM clips c JOIN projects p ON c.project_id = p.id
    WHERE (p.name LIKE '%MAMAT%' OR p.name LIKE '%Frimawan%')
    AND c.status = 'detected'
    ORDER BY c.clip_number
`).all();
db.close();

console.log(`Starting render for ${clips.length} clips...`);
clips.forEach(c => {
    try {
        const result = execSync(`curl -s -X POST http://localhost:5000/api/projects/clips/${c.id}/render`, { encoding: 'utf-8' });
        console.log(`  ✓ Clip #${c.clip_number} ${c.title}: ${result.trim()}`);
        // Jeda 500ms antar request agar tidak flood
        execSync('ping -n 1 127.0.0.1 > nul');
    } catch (e) { console.error(`  ✗ Clip #${c.clip_number}: ${e.message.substring(0, 60)}`); }
});
console.log('\nAll render requests sent!');
