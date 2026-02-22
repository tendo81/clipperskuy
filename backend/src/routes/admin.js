/**
 * ClipperSkuy — Admin Routes
 * License key management, stats, and administration
 * Protected by admin password
 */
const express = require('express');
const router = express.Router();
const { get, run, all } = require('../database');
const crypto = require('crypto');

// ===== Admin Password =====
const DEFAULT_ADMIN_PASSWORD = 'clipperskuy-admin-2026';

function getAdminPassword() {
    const row = get('SELECT value FROM settings WHERE key = ?', ['admin_password']);
    return row?.value || DEFAULT_ADMIN_PASSWORD;
}

// Verify password endpoint (not protected by middleware)
router.post('/verify', (req, res) => {
    const { password } = req.body;
    if (password === getAdminPassword()) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, error: 'Wrong admin password' });
    }
});

// Change password endpoint
router.post('/change-password', (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (currentPassword !== getAdminPassword()) {
        return res.status(401).json({ success: false, error: 'Current password is wrong' });
    }
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, error: 'New password must be at least 6 characters' });
    }
    run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime("now"))',
        ['admin_password', newPassword]);
    res.json({ success: true });
});

// ===== Middleware: check admin password on all other routes =====
router.use((req, res, next) => {
    // Skip verify & change-password (already handled above)
    if (req.path === '/verify' || req.path === '/change-password') return next();

    const password = req.headers['x-admin-password'];
    if (password !== getAdminPassword()) {
        return res.status(401).json({ error: 'Admin authentication required' });
    }
    next();
});

// ===== Signed License Key Generator =====
// Key format: AAAA-BBBB-TCMD-SSSS
//   AAAA-BBBB = random payload
//   T = tier (P=pro, E=enterprise)
//   C = duration (L=lifetime, 1=30d, 3=90d, 6=180d, Y=365d)
//   M = creation month (A=Jan..L=Dec)
//   D = random char
//   SSSS = HMAC-SHA256 signature of first 3 groups
const LICENSE_SECRET = 'ClipperSkuy-2026-LicenseKey-Secret';

const TIER_CHAR = { 'pro': 'P', 'enterprise': 'E' };
const DURATION_CHAR = { 0: 'L', 3: 'D', 7: 'W', 14: 'F', 30: '1', 90: '3', 180: '6', 365: 'Y' };

function generateKey(tier = 'pro', durationDays = 0) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const randChar = () => chars[Math.floor(Math.random() * chars.length)];
    const segment = () => { let s = ''; for (let i = 0; i < 4; i++) s += randChar(); return s; };

    // Build first 2 random groups
    const g1 = segment();
    const g2 = segment();

    // Build 3rd group with encoded data
    const tChar = TIER_CHAR[tier] || 'P';
    // Find the closest matching duration (Lifetime only if explicitly 0)
    let closestDur = 0;
    if (durationDays > 0) {
        const durKeys = Object.keys(DURATION_CHAR).map(Number).filter(d => d > 0).sort((a, b) => a - b);
        closestDur = durKeys[0]; // default to smallest non-zero
        for (const d of durKeys) {
            if (durationDays >= d) closestDur = d;
        }
    }
    const dChar = DURATION_CHAR[closestDur] || 'L';
    const monthChar = String.fromCharCode('A'.charCodeAt(0) + new Date().getMonth()); // A=Jan..L=Dec
    const g3 = `${tChar}${dChar}${monthChar}${randChar()}`;

    // Build signature (4th group)
    const payload = `${g1}-${g2}-${g3}`;
    const hmac = crypto.createHmac('sha256', LICENSE_SECRET).update(payload).digest('hex');
    const g4 = hmac.substring(0, 4).toUpperCase();

    return `${g1}-${g2}-${g3}-${g4}`;
}

// ===== GET /api/admin/licenses — List all license keys =====
router.get('/licenses', (req, res) => {
    try {
        const keys = all('SELECT * FROM license_keys ORDER BY created_at DESC');
        // Add activation count to each key
        const keysWithCount = (keys || []).map(k => {
            const count = get('SELECT COUNT(*) as count FROM license_activations WHERE license_key_id = ?', [k.id]);
            let activationCount = count?.count || 0;
            // If key was manually marked as used but no local activations, show max
            if (k.status === 'used' && activationCount === 0) {
                activationCount = k.max_activations || 1;
            }
            return { ...k, activation_count: activationCount || (k.machine_id ? 1 : 0) };
        });
        res.json({ keys: keysWithCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== POST /api/admin/licenses/generate — Generate new license key(s) =====
router.post('/licenses/generate', (req, res) => {
    try {
        const { tier = 'pro', count = 1, notes = '', customKey, duration_days = 0, max_activations = 1 } = req.body;

        if (!['pro', 'enterprise'].includes(tier)) {
            return res.status(400).json({ error: 'Tier must be "pro" or "enterprise"' });
        }

        const generated = [];
        const numKeys = Math.min(parseInt(count) || 1, 50); // Max 50 at once
        const durDays = parseInt(duration_days) || 0; // 0 = lifetime
        const maxAct = Math.max(1, parseInt(max_activations) || 1);

        for (let i = 0; i < numKeys; i++) {
            const id = crypto.randomUUID();
            const key = (customKey && numKeys === 1) ? customKey.toUpperCase() : generateKey(tier, durDays);

            // Check for duplicate
            const existing = get('SELECT id FROM license_keys WHERE license_key = ?', [key]);
            if (existing) {
                if (customKey) {
                    return res.status(400).json({ error: `Key ${key} already exists` });
                }
                continue; // Skip duplicates for random keys
            }

            // Calculate expiration date (null = lifetime)
            let expiresAt = null;
            if (durDays > 0) {
                const expDate = new Date();
                expDate.setDate(expDate.getDate() + durDays);
                expiresAt = expDate.toISOString();
            }

            run(`INSERT INTO license_keys (id, license_key, tier, status, duration_days, expires_at, max_activations, notes, created_at)
                 VALUES (?, ?, ?, 'active', ?, ?, ?, ?, datetime('now'))`,
                [id, key, tier, durDays, expiresAt, maxAct, notes]);

            generated.push({ id, key, tier, status: 'active', duration_days: durDays, expires_at: expiresAt, max_activations: maxAct });
        }

        res.json({
            message: `Generated ${generated.length} license key(s)${durDays > 0 ? ` (${durDays} days)` : ' (lifetime)'}`,
            keys: generated
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== PUT /api/admin/licenses/:id/revoke — Revoke a license key =====
router.put('/licenses/:id/revoke', (req, res) => {
    try {
        const key = get('SELECT * FROM license_keys WHERE id = ?', [req.params.id]);
        if (!key) return res.status(404).json({ error: 'License key not found' });

        run(`UPDATE license_keys SET status = 'revoked', revoked_at = datetime('now') WHERE id = ?`,
            [req.params.id]);

        // Audit log
        run(`INSERT INTO admin_audit_log (action, license_key_id, machine_id, details) VALUES (?, ?, ?, ?)`,
            ['admin_revoke', key.id, key.machine_id, JSON.stringify({ key: key.license_key, previous_status: key.status })]);

        res.json({ message: `Key ${key.license_key} revoked`, key: { ...key, status: 'revoked' } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== PUT /api/admin/licenses/:id/activate — Re-activate a revoked key =====
router.put('/licenses/:id/activate', (req, res) => {
    try {
        const key = get('SELECT * FROM license_keys WHERE id = ?', [req.params.id]);
        if (!key) return res.status(404).json({ error: 'License key not found' });

        run(`UPDATE license_keys SET status = 'active', revoked_at = NULL WHERE id = ?`,
            [req.params.id]);

        // Audit log
        run(`INSERT INTO admin_audit_log (action, license_key_id, machine_id, details) VALUES (?, ?, ?, ?)`,
            ['reactivate', key.id, key.machine_id, JSON.stringify({ key: key.license_key, previous_status: key.status })]);

        res.json({ message: `Key ${key.license_key} re-activated`, key: { ...key, status: 'active' } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== PUT /api/admin/licenses/:id/reset — Reset activations (unbind all machines) =====
router.put('/licenses/:id/reset', (req, res) => {
    try {
        const key = get('SELECT * FROM license_keys WHERE id = ?', [req.params.id]);
        if (!key) return res.status(404).json({ error: 'License key not found' });

        // Clear all activations for this key
        run('DELETE FROM license_activations WHERE license_key_id = ?', [key.id]);

        // Reset machine binding and status
        run(`UPDATE license_keys SET machine_id = NULL, activated_at = NULL, activated_by = NULL, status = 'active' WHERE id = ?`,
            [key.id]);

        // Audit log
        run(`INSERT INTO admin_audit_log (action, license_key_id, machine_id, details) VALUES (?, ?, ?, ?)`,
            ['admin_unbind', key.id, key.machine_id, JSON.stringify({ key: key.license_key, unbound_machine: key.machine_id })]);

        res.json({
            message: `Aktivasi key ${key.license_key} direset. Key bisa dipakai di perangkat baru.`,
            key: { ...key, status: 'active', machine_id: null, activation_count: 0 }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== PUT /api/admin/licenses/:id/mark-used — Manually mark key as used =====
router.put('/licenses/:id/mark-used', (req, res) => {
    try {
        const key = get('SELECT * FROM license_keys WHERE id = ?', [req.params.id]);
        if (!key) return res.status(404).json({ error: 'License key not found' });

        const now = new Date().toISOString();
        const { machine_name } = req.body || {};

        run(`UPDATE license_keys SET status = 'used', activated_at = ?, activated_by = ? WHERE id = ?`,
            [now, machine_name || 'Manual (remote)', req.params.id]);

        const updated = get('SELECT * FROM license_keys WHERE id = ?', [req.params.id]);

        // Audit log
        run(`INSERT INTO admin_audit_log (action, license_key_id, details) VALUES (?, ?, ?)`,
            ['mark_used', key.id, JSON.stringify({ key: key.license_key })]);

        res.json({
            message: `Key ${key.license_key} ditandai sudah digunakan`,
            key: updated
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== DELETE /api/admin/licenses/:id — Delete a license key =====
router.delete('/licenses/:id', (req, res) => {
    try {
        const key = get('SELECT * FROM license_keys WHERE id = ?', [req.params.id]);
        if (!key) return res.status(404).json({ error: 'License key not found' });

        run('DELETE FROM license_keys WHERE id = ?', [req.params.id]);

        // Audit log
        run(`INSERT INTO admin_audit_log (action, license_key_id, machine_id, details) VALUES (?, ?, ?, ?)`,
            ['delete', key.id, key.machine_id, JSON.stringify({ key: key.license_key, tier: key.tier })]);

        res.json({ message: `Key ${key.license_key} deleted` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== PUT /api/admin/licenses/:id — Update key details =====
router.put('/licenses/:id', (req, res) => {
    try {
        const key = get('SELECT * FROM license_keys WHERE id = ?', [req.params.id]);
        if (!key) return res.status(404).json({ error: 'License key not found' });

        const { tier, notes } = req.body;
        if (tier) run('UPDATE license_keys SET tier = ? WHERE id = ?', [tier, req.params.id]);
        if (notes !== undefined) run('UPDATE license_keys SET notes = ? WHERE id = ?', [notes, req.params.id]);

        const updated = get('SELECT * FROM license_keys WHERE id = ?', [req.params.id]);
        res.json({ message: 'Key updated', key: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== PUT /api/admin/licenses/:id/upgrade — Upgrade tier/duration of existing key =====
router.put('/licenses/:id/upgrade', (req, res) => {
    try {
        const oldKey = get('SELECT * FROM license_keys WHERE id = ?', [req.params.id]);
        if (!oldKey) return res.status(404).json({ error: 'License key not found' });

        const { tier, duration_days } = req.body;
        const newTier = tier || oldKey.tier;
        const newDuration = parseInt(duration_days) ?? oldKey.duration_days ?? 0;

        // Generate a NEW signed key with the updated tier/duration
        const newLicenseKey = generateKey(newTier, newDuration);

        // Calculate new expiry from NOW
        let newExpiresAt = null;
        if (newDuration > 0) {
            newExpiresAt = new Date(Date.now() + newDuration * 24 * 60 * 60 * 1000).toISOString();
        }

        // Update the key record
        run(`UPDATE license_keys SET 
            license_key = ?, tier = ?, duration_days = ?, expires_at = ?, 
            status = 'active', notes = COALESCE(notes, '') || ? 
            WHERE id = ?`, [
            newLicenseKey, newTier, newDuration, newExpiresAt,
            `\n[Upgraded ${new Date().toISOString()}] ${oldKey.tier}→${newTier}, ${oldKey.duration_days || 0}d→${newDuration}d`,
            req.params.id
        ]);

        // If this key was already activated on a machine, update local settings too
        if (oldKey.machine_id) {
            // Update settings for the activated instance (will take effect on next app restart)
            const settingsKey = get("SELECT value FROM settings WHERE key = 'license_key'");
            if (settingsKey && settingsKey.value === oldKey.license_key) {
                run("UPDATE settings SET value = ? WHERE key = 'license_key'", [newLicenseKey]);
                run("UPDATE settings SET value = ? WHERE key = 'license_tier'", [newTier]);
                if (newExpiresAt) {
                    run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('license_expires_at', ?, datetime('now'))", [newExpiresAt]);
                } else {
                    run("DELETE FROM settings WHERE key = 'license_expires_at'");
                }
                run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('license_duration_days', ?, datetime('now'))", [String(newDuration)]);
            }
        }

        const updated = get('SELECT * FROM license_keys WHERE id = ?', [req.params.id]);
        res.json({
            message: `Key upgraded: ${oldKey.tier}→${newTier}, ${newDuration > 0 ? newDuration + ' days' : 'Lifetime'}`,
            oldKey: oldKey.license_key,
            newKey: newLicenseKey,
            key: updated
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== GET /api/admin/stats — Dashboard stats =====
router.get('/stats', (req, res) => {
    try {
        const totalKeys = get('SELECT COUNT(*) as count FROM license_keys')?.count || 0;
        const activeKeys = get("SELECT COUNT(*) as count FROM license_keys WHERE status = 'active'")?.count || 0;
        const usedKeys = get("SELECT COUNT(*) as count FROM license_keys WHERE machine_id IS NOT NULL")?.count || 0;
        const revokedKeys = get("SELECT COUNT(*) as count FROM license_keys WHERE status = 'revoked'")?.count || 0;
        const expiredKeys = get("SELECT COUNT(*) as count FROM license_keys WHERE status = 'expired'")?.count || 0;
        const proKeys = get("SELECT COUNT(*) as count FROM license_keys WHERE tier = 'pro'")?.count || 0;
        const enterpriseKeys = get("SELECT COUNT(*) as count FROM license_keys WHERE tier = 'enterprise'")?.count || 0;
        const lifetimeKeys = get("SELECT COUNT(*) as count FROM license_keys WHERE duration_days = 0 OR duration_days IS NULL")?.count || 0;
        const totalProjects = get('SELECT COUNT(*) as count FROM projects')?.count || 0;

        res.json({
            licenses: { total: totalKeys, active: activeKeys, used: usedKeys, revoked: revokedKeys, expired: expiredKeys, lifetime: lifetimeKeys },
            tiers: { pro: proKeys, enterprise: enterpriseKeys },
            projects: totalProjects
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== GET /api/admin/logs — Audit log =====
router.get('/logs', (req, res) => {
    try {
        const { action, limit = 100 } = req.query;
        const maxLimit = Math.min(parseInt(limit) || 100, 500);

        let logs;
        if (action) {
            logs = all(
                `SELECT al.*, lk.license_key, lk.tier 
                 FROM admin_audit_log al 
                 LEFT JOIN license_keys lk ON al.license_key_id = lk.id 
                 WHERE al.action = ? 
                 ORDER BY al.created_at DESC LIMIT ?`,
                [action, maxLimit]
            );
        } else {
            logs = all(
                `SELECT al.*, lk.license_key, lk.tier 
                 FROM admin_audit_log al 
                 LEFT JOIN license_keys lk ON al.license_key_id = lk.id 
                 ORDER BY al.created_at DESC LIMIT ?`,
                [maxLimit]
            );
        }

        res.json({
            count: (logs || []).length,
            logs: (logs || []).map(log => ({
                id: log.id,
                action: log.action,
                licenseKey: log.license_key || null,
                tier: log.tier || null,
                machineId: log.machine_id || null,
                ipAddress: log.ip_address || null,
                details: log.details ? (() => { try { return JSON.parse(log.details); } catch { return log.details; } })() : null,
                createdAt: log.created_at
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
