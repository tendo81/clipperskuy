const { execSync } = require('child_process');
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'clipperskuy.db'));

// Get all clips for the Mamat Alkatiri project, ordered by clip_number
const PROJECT_ID = 'acdf5ff0-cbec-4c32-8f14-c219f5520513';
const clips = db.prepare(`SELECT id, clip_number, title, status FROM clips WHERE project_id=? ORDER BY clip_number`).all(PROJECT_ID);
db.close();

console.log('Clips ditemukan:');
clips.forEach(c => console.log(`  #${c.clip_number} [${c.status}] "${c.title}" → ${c.id}`));

function sleep(ms) { execSync(`ping -n ${Math.ceil(ms / 1000)} 127.0.0.1 > nul`); }
function getStatus(id) {
    const db2 = new Database(path.join(__dirname, 'data', 'clipperskuy.db'));
    const c = db2.prepare('SELECT status FROM clips WHERE id=?').get(id);
    db2.close();
    return c?.status;
}

console.log('\nRendering clips ONE BY ONE...\n');

for (const clip of clips) {
    // Skip already rendered
    if (clip.status === 'rendered') {
        console.log(`\n✓ Clip #${clip.clip_number} "${clip.title}" sudah rendered, skip`);
        continue;
    }

    console.log(`\n▶ Rendering Clip #${clip.clip_number}: ${clip.title}`);
    execSync(`curl -s -X POST http://localhost:5000/api/projects/clips/${clip.id}/render > nul 2>&1`);

    // Poll until done (max 6 minutes per clip)
    let tries = 0;
    while (tries < 72) {
        sleep(5000);
        const status = getStatus(clip.id);
        process.stdout.write(`  [${tries * 5}s] status: ${status || '?'}  \r`);
        if (status === 'rendered' || status === 'failed') {
            console.log(`\n  ${status === 'rendered' ? '✅' : '❌'} Done: ${status}`);
            break;
        }
        tries++;
    }
    if (tries >= 72) console.log('\n  ⚠️ Timeout!');

    sleep(2000);
}

console.log('\n=== ALL DONE ===');
const db3 = new Database(path.join(__dirname, 'data', 'clipperskuy.db'));
const final = db3.prepare(`SELECT clip_number, title, status FROM clips WHERE project_id=? ORDER BY clip_number`).all(PROJECT_ID);
db3.close();
final.forEach(c => console.log(`  ${c.status === 'rendered' ? '✓' : '✗'} #${c.clip_number} ${c.title}: ${c.status}`));
