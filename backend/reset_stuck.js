/**
 * reset_stuck.js
 * Reset ALL clips stuck in 'rendering' state back to 'detected'
 * across ALL projects (not just specific ones).
 * 
 * Run this manually if renders get stuck:
 *   node reset_stuck.js
 */
const db = require('better-sqlite3')('data/clipperskuy.db');

const stuckClips = db.prepare(`
    SELECT c.id, c.clip_number, c.title, p.name as proj_name
    FROM clips c
    JOIN projects p ON c.project_id = p.id
    WHERE c.status = 'rendering'
    ORDER BY p.name, c.clip_number
`).all();

console.log(`Found ${stuckClips.length} stuck rendering clip(s):\n`);

if (stuckClips.length === 0) {
    console.log('✅ No stuck clips found. All good!');
} else {
    stuckClips.forEach(c => {
        db.prepare("UPDATE clips SET status = 'detected', output_path = NULL WHERE id = ?").run(c.id);
        console.log(`  ✓ Reset Clip#${c.clip_number} "${c.title || 'untitled'}" [${c.proj_name}]`);
    });
    console.log(`\n✅ Done. ${stuckClips.length} clip(s) reset to 'detected'. Re-render from the UI.`);
}

db.close();
