/**
 * ClipperSkuy — Admin Routes
 * License key management, stats, and administration
 */
const express = require('express');
const router = express.Router();
const { get, run, all } = require('../database');
const crypto = require('crypto');

// ===== Helper: Generate random license key =====
function generateKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segment = () => {
        let s = '';
        for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
        return s;
    };
    return `${segment()}-${segment()}-${segment()}-${segment()}`;
}

// ===== GET /api/admin/licenses — List all license keys =====
router.get('/licenses', (req, res) => {
    try {
        const keys = all('SELECT * FROM license_keys ORDER BY created_at DESC');
        // Add activation count to each key
        const keysWithCount = (keys || []).map(k => {
            const count = get('SELECT COUNT(*) as count FROM license_activations WHERE license_key_id = ?', [k.id]);
            return { ...k, activation_count: count?.count || (k.machine_id ? 1 : 0) };
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
            const key = (customKey && numKeys === 1) ? customKey.toUpperCase() : generateKey();

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

        res.json({
            message: `Aktivasi key ${key.license_key} direset. Key bisa dipakai di perangkat baru.`,
            key: { ...key, status: 'active', machine_id: null, activation_count: 0 }
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

module.exports = router;
