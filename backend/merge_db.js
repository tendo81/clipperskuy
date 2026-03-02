const Database = require('better-sqlite3');
const path = require('path');

const srcPath = path.join(__dirname, 'data', 'opusflow.db');
const dstPath = path.join(__dirname, 'data', 'clipperskuy.db');

const src = new Database(srcPath, { readonly: true });
const dst = new Database(dstPath);

// Get tables from source
const tables = src.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('Source tables:', tables.map(t => t.name).join(', '));

// Get existing project IDs to avoid duplicates
const existingProjects = dst.prepare('SELECT id FROM projects').all().map(p => p.id);
console.log('Existing projects in dst:', existingProjects.length);

// Copy projects
const srcProjects = src.prepare('SELECT * FROM projects').all();
console.log('Source projects:', srcProjects.length);

let addedProjects = 0;
for (const p of srcProjects) {
    if (existingProjects.includes(p.id)) {
        console.log('  SKIP (exists):', p.name);
        continue;
    }
    try {
        const cols = Object.keys(p);
        // Only use columns that exist in destination
        const dstCols = dst.prepare('PRAGMA table_info(projects)').all().map(c => c.name);
        const validCols = cols.filter(c => dstCols.includes(c));
        const placeholders = validCols.map(() => '?').join(',');
        const values = validCols.map(c => p[c]);
        dst.prepare(`INSERT INTO projects (${validCols.join(',')}) VALUES (${placeholders})`).run(...values);
        console.log('  ADDED:', p.name);
        addedProjects++;
    } catch (e) {
        console.error('  ERROR adding project:', p.name, e.message);
    }
}

// Copy clips
const existingClips = dst.prepare('SELECT id FROM clips').all().map(c => c.id);
const srcClips = src.prepare('SELECT * FROM clips').all();
console.log('\nSource clips:', srcClips.length);

let addedClips = 0;
for (const c of srcClips) {
    if (existingClips.includes(c.id)) continue;
    try {
        const cols = Object.keys(c);
        const dstCols = dst.prepare('PRAGMA table_info(clips)').all().map(col => col.name);
        const validCols = cols.filter(col => dstCols.includes(col));
        const placeholders = validCols.map(() => '?').join(',');
        const values = validCols.map(col => c[col]);
        dst.prepare(`INSERT INTO clips (${validCols.join(',')}) VALUES (${placeholders})`).run(...values);
        addedClips++;
    } catch (e) {
        console.error('  ERROR adding clip:', c.id, e.message);
    }
}
console.log('Added clips:', addedClips);

// Copy transcripts
try {
    const existingTranscripts = dst.prepare('SELECT id FROM transcripts').all().map(t => t.id);
    const srcTranscripts = src.prepare('SELECT * FROM transcripts').all();
    console.log('\nSource transcripts:', srcTranscripts.length);

    let addedTranscripts = 0;
    for (const t of srcTranscripts) {
        if (existingTranscripts.includes(t.id)) continue;
        try {
            const cols = Object.keys(t);
            const dstCols = dst.prepare('PRAGMA table_info(transcripts)').all().map(col => col.name);
            const validCols = cols.filter(col => dstCols.includes(col));
            const placeholders = validCols.map(() => '?').join(',');
            const values = validCols.map(col => t[col]);
            dst.prepare(`INSERT INTO transcripts (${validCols.join(',')}) VALUES (${placeholders})`).run(...values);
            addedTranscripts++;
        } catch (e) {
            console.error('  ERROR adding transcript:', t.id, e.message);
        }
    }
    console.log('Added transcripts:', addedTranscripts);
} catch (e) {
    console.log('No transcripts table or error:', e.message);
}

console.log('\n=== DONE ===');
console.log('Projects added:', addedProjects);
console.log('Clips added:', addedClips);

// Verify
const finalProjects = dst.prepare('SELECT id, name, reframing_mode FROM projects ORDER BY created_at').all();
console.log('\nFinal projects in clipperskuy.db:', finalProjects.length);
finalProjects.forEach(p => console.log('  ', p.reframing_mode, '|', p.name));

src.close();
dst.close();
