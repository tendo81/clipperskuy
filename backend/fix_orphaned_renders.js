// Fix: Reset clips yang statusnya 'rendered' tapi file output-nya tidak ada di disk
// Ini terjadi ketika file dihapus manual/di-copy tapi DB tidak diupdate

const db = require('better-sqlite3')('data/clipperskuy.db');
const fs = require('fs');

const renderedClips = db.prepare(
    "SELECT c.id, c.clip_number, c.title, c.output_path, p.name as proj FROM clips c JOIN projects p ON c.project_id = p.id WHERE c.status = 'rendered' AND c.output_path IS NOT NULL"
).all();

console.log('Checking', renderedClips.length, 'rendered clips...\n');

let fixed = 0;
renderedClips.forEach(c => {
    if (!fs.existsSync(c.output_path)) {
        db.prepare("UPDATE clips SET status = 'detected', output_path = NULL WHERE id = ?").run(c.id);
        console.log('  ✅ Fixed Clip#' + c.clip_number + ' [' + c.proj.substring(0,25) + '] → detected');
        fixed++;
    }
});

if (fixed === 0) {
    console.log('✅ No orphaned renders found. All good!');
} else {
    console.log('\n' + fixed + ' orphaned render(s) fixed → status reset to "detected". Re-render from UI.');
}

db.close();
