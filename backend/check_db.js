const Database = require('better-sqlite3');

// Cek opusflow.db (database lama)
console.log('\n=== opusflow.db ===');
try {
    const old = new Database('data/opusflow.db', { readonly: true });
    const tables = old.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('Tables:', tables.map(t => t.name).join(', '));

    // Cek license_keys
    if (tables.find(t => t.name === 'license_keys')) {
        const keys = old.prepare('SELECT * FROM license_keys').all();
        console.log('\nLicense Keys:', JSON.stringify(keys, null, 2));
        console.log('Total license keys:', keys.length);
    }

    // Cek projects
    if (tables.find(t => t.name === 'projects')) {
        const projects = old.prepare('SELECT id, name, status FROM projects').all();
        console.log('\nProjects:', projects.length);
        projects.forEach(p => console.log(' -', p.name, '|', p.status));
    }
    old.close();
} catch (e) {
    console.log('Error:', e.message);
}

// Cek backups
const fs = require('fs-extra');
const path = require('path');
const backupDir = 'data/backups';
if (fs.existsSync(backupDir)) {
    const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
    console.log('\n=== Backups available ===');
    for (const b of backups) {
        try {
            const bdb = new Database(path.join(backupDir, b), { readonly: true });
            const tables = bdb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
            if (tables.find(t => t.name === 'license_keys')) {
                const count = bdb.prepare('SELECT COUNT(*) as c FROM license_keys').get();
                console.log(b, '→ license_keys:', count.c);
            }
            bdb.close();
        } catch (e) { console.log(b, '→ Error:', e.message); }
    }
}
