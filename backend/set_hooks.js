const db = require('better-sqlite3')('data/clipperskuy.db');

// Default hook style — neon cyan (sama seperti project lain)
const defaultHookSettings = JSON.stringify({
    duration: 5,
    position: 'top',
    fontSize: 48,
    textColor: '#000000',
    bgColor: '#00E5FF',
    bgOpacity: '1.0',
    hookStyle: 'neon',
    borderColor: '#FFFFFF'
});

// Get all clips from Mamat project
const clips = db.prepare(`
    SELECT c.id, c.clip_number, c.title, c.status
    FROM clips c JOIN projects p ON c.project_id = p.id
    WHERE (p.name LIKE '%MAMAT%' OR p.name LIKE '%Frimawan%')
    AND c.status != 'failed'
    ORDER BY c.clip_number
`).all();

console.log(`Setting hook_settings for ${clips.length} clips...`);

clips.forEach(c => {
    db.prepare("UPDATE clips SET hook_settings = ?, status = 'detected', output_path = NULL WHERE id = ?")
        .run(defaultHookSettings, c.id);
    console.log(`  ✓ Clip #${c.clip_number} ${c.title} → hook set, reset to detected`);
});

// Verify
const verify = db.prepare(`
    SELECT c.clip_number, c.title, c.status, c.hook_settings
    FROM clips c JOIN projects p ON c.project_id = p.id
    WHERE (p.name LIKE '%MAMAT%' OR p.name LIKE '%Frimawan%')
    AND c.status = 'detected'
    ORDER BY c.clip_number
`).all();

console.log(`\n${verify.length} clips ready to render with hook`);
db.close();
