// Reset satu clip yang stuck dari rendering ke detected
const db = require('better-sqlite3')('data/clipperskuy.db');

// Cari semua clip yang statusnya masih rendering tapi tidak ada FFmpeg berjalan
const stuckClips = db.prepare("SELECT id, clip_number, title FROM clips WHERE status = 'rendering'").all();
console.log('Clips stuck in rendering:', stuckClips.length);

stuckClips.forEach(c => {
    db.prepare("UPDATE clips SET status = 'detected' WHERE id = ?").run(c.id);
    console.log('  ✅ Reset Clip#' + c.clip_number + ': ' + (c.title || 'untitled') + ' → detected');
});

db.close();
console.log('\nDone. You can now re-render these clips from the UI.');
