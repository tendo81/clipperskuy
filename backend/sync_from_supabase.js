/**
 * sync_from_supabase.js
 * Import semua license data dari Supabase → local SQLite
 * Run: node sync_from_supabase.js
 */

const Database = require('better-sqlite3');
const https = require('https');

const SUPABASE_URL = 'https://ioujmwlrsogwckclucpo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvdWptd2xyc29nd2NrY2x1Y3BvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY0ODk3NywiZXhwIjoyMDg3MjI0OTc3fQ.nGYH1_G0wvWyANLzFL0dkC12aKkUEM-md7MTXgOaqa8';

function supabaseGet(table, query = '') {
    return new Promise((resolve, reject) => {
        const url = new URL(`${SUPABASE_URL}/rest/v1/${table}?select=*${query}`);
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('Invalid JSON: ' + data)); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function sync() {
    console.log('🔄 Syncing license data from Supabase...\n');

    const db = new Database('data/clipperskuy.db');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    try {
        // ===== 1. Fetch license_keys from Supabase =====
        console.log('📥 Fetching license_keys...');
        const keys = await supabaseGet('license_keys', '&order=created_at.asc');

        if (!Array.isArray(keys)) {
            console.error('❌ Error fetching keys:', keys);
            return;
        }
        console.log(`   Found ${keys.length} license keys`);

        // ===== 2. Fetch activations =====
        console.log('📥 Fetching license_activations...');
        const activations = await supabaseGet('license_activations', '&order=activated_at.asc');
        console.log(`   Found ${activations.length} activations`);

        // ===== 3. Fetch audit log =====
        console.log('📥 Fetching audit log...');
        const auditLogs = await supabaseGet('license_audit_log', '&order=created_at.desc&limit=500');
        console.log(`   Found ${auditLogs.length} audit entries`);

        // ===== 4. Insert license keys into local DB =====
        console.log('\n💾 Writing to local database...');

        const insertKey = db.prepare(`
      INSERT OR REPLACE INTO license_keys 
        (id, license_key, tier, status, duration_days, expires_at, max_activations, 
         max_transfers, deactivation_count, notes, created_at, activated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

        const insertMany = db.transaction((keys) => {
            for (const k of keys) {
                insertKey.run(
                    k.id,
                    k.license_key,
                    k.tier || 'pro',
                    k.status || 'active',
                    k.duration_days || 0,
                    k.expires_at || null,
                    k.max_activations || 1,
                    k.max_transfers || 2,
                    k.deactivation_count || 0,
                    k.notes || null,
                    k.created_at || null,
                    k.updated_at || null   // use updated_at as activated_at proxy
                );
            }
        });
        insertMany(keys);
        console.log(`   ✅ ${keys.length} license keys synced`);

        // ===== 5. Insert activations & update machine_id on license_keys =====
        const insertAct = db.prepare(`
      INSERT OR IGNORE INTO license_activations (license_key_id, machine_id, activated_at)
      VALUES (?, ?, ?)
    `);
        const updateMachine = db.prepare(`
      UPDATE license_keys SET machine_id = ?, activated_at = ? WHERE id = ? AND machine_id IS NULL
    `);

        const insertActs = db.transaction((acts) => {
            for (const a of acts) {
                if (!a.deactivated_at) {
                    insertAct.run(a.license_key_id, a.machine_id, a.activated_at);
                    updateMachine.run(a.machine_id, a.activated_at, a.license_key_id);
                }
            }
        });
        insertActs(activations);
        console.log(`   ✅ ${activations.length} activations synced`);

        // ===== 6. Insert audit logs =====
        const insertLog = db.prepare(`
      INSERT OR IGNORE INTO admin_audit_log (action, license_key_id, machine_id, ip_address, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
        const insertLogs = db.transaction((logs) => {
            for (const l of logs) {
                insertLog.run(
                    l.action,
                    l.license_key_id || null,
                    l.machine_id || null,
                    l.ip_address || null,
                    l.details ? JSON.stringify(l.details) : null,
                    l.created_at || null
                );
            }
        });
        insertLogs(auditLogs);
        console.log(`   ✅ ${auditLogs.length} audit logs synced`);

        // ===== 7. Summary =====
        const total = db.prepare('SELECT COUNT(*) as c FROM license_keys').get();
        const active = db.prepare("SELECT COUNT(*) as c FROM license_keys WHERE status='active'").get();
        const used = db.prepare("SELECT COUNT(*) as c FROM license_keys WHERE status='used'").get();
        const revoked = db.prepare("SELECT COUNT(*) as c FROM license_keys WHERE status='revoked'").get();

        console.log('\n🎉 Sync complete!');
        console.log('─────────────────────');
        console.log(`Total Keys : ${total.c}`);
        console.log(`Active     : ${active.c}`);
        console.log(`Used       : ${used.c}`);
        console.log(`Revoked    : ${revoked.c}`);
        console.log('─────────────────────');
        console.log('✅ Refresh Admin Panel di browser untuk melihat data.');

    } catch (err) {
        console.error('❌ Sync failed:', err.message);
    } finally {
        db.close();
    }
}

sync();
