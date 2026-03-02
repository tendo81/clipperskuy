const Database = require('./backend/node_modules/better-sqlite3');
const fs = require('fs');

function check() {
    const db = new Database('./backend/data/clipperskuy.db', { readonly: true });
    const clips = db.prepare('SELECT clip_number, title, status, output_path FROM clips ORDER BY clip_number').all();
    db.close();

    const ts = new Date().toLocaleTimeString('id-ID');
    console.log(`\n[${ts}] ===== STATUS RENDER =====`);

    let allDone = true;
    clips.forEach(c => {
        let sz = '';
        if (c.output_path && fs.existsSync(c.output_path)) {
            sz = ` [${Math.round(fs.statSync(c.output_path).size / 1024 / 1024)}MB]`;
        }
        const icon = c.status === 'rendered' ? '✅' : c.status === 'failed' ? '❌' : '⏳';
        console.log(`  ${icon} Clip#${c.clip_number} [${c.status}]${sz} ${c.title.substring(0, 45)}`);
        if (c.status !== 'rendered' && c.status !== 'failed') allDone = false;
    });

    const rendered = clips.filter(c => c.status === 'rendered').length;
    const failed = clips.filter(c => c.status === 'failed').length;
    console.log(`\n  PROGRESS: ${rendered}/${clips.length} selesai${failed > 0 ? `, ${failed} gagal` : ''}`);

    if (allDone) {
        console.log('\n  🎉 SEMUA RENDER SELESAI!\n');
        process.exit(0);
    }
}

check();
setInterval(check, 8000);
