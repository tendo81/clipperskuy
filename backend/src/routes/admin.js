/**
 * ClipperSkuy — Admin Routes (Online Mode)
 * Proxies license key management to the online Supabase license server.
 * Local admin password is still used for app access control.
 */
const express = require('express');
const router = express.Router();
const { get, run, all } = require('../database');

const LICENSE_SERVER_URL = process.env.LICENSE_SERVER_URL || '';
const ONLINE_ADMIN_KEY = process.env.ADMIN_API_KEY || '';

// ===== Admin Password (local — for app access control only) =====
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
    if (req.path === '/verify' || req.path === '/change-password') return next();
    const password = req.headers['x-admin-password'];
    if (password !== getAdminPassword()) {
        return res.status(401).json({ error: 'Admin authentication required' });
    }
    next();
});

// ===== Helper: Proxy request to online license server (with cache + timeout) =====
const _cache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key) {
    const entry = _cache[key];
    if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
    return null;
}
function setCache(key, data) {
    _cache[key] = { data, ts: Date.now() };
}
function clearCache() {
    Object.keys(_cache).forEach(k => delete _cache[k]);
}

async function onlineRequest(path, method = 'GET', body = null) {
    if (!LICENSE_SERVER_URL) {
        throw new Error('LICENSE_SERVER_URL not configured. Set it in .env');
    }

    const url = `${LICENSE_SERVER_URL}${path}`;
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'x-admin-key': ONLINE_ADMIN_KEY,
        },
        signal: AbortSignal.timeout(5000), // 5 second timeout
    };
    if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
        const err = new Error(data.error || `Server responded ${response.status}`);
        err.status = response.status;
        throw err;
    }
    return data;
}

// ===== GET /api/admin/licenses — List all keys (from online server, cached) =====
router.get('/licenses', async (req, res) => {
    // Return cached data immediately if available
    const cached = getCached('licenses');
    if (cached) {
        res.json(cached);
        // Refresh cache in background silently
        onlineRequest('/api/admin/keys')
            .then(data => setCache('licenses', { keys: data.keys || [] }))
            .catch(() => {});
        return;
    }

    // No cache — return local data INSTANTLY, then fetch online in background
    let localKeys = [];
    try { localKeys = all('SELECT * FROM license_keys ORDER BY created_at DESC') || []; } catch (e) {}
    res.json({ keys: localKeys, _source: 'local_instant' });

    // Fetch online in background and update cache (client can refresh to get online data)
    onlineRequest('/api/admin/keys')
        .then(data => {
            const result = { keys: data.keys || [] };
            setCache('licenses', result);
        })
        .catch(err => console.warn('[Admin] Online keys fetch failed:', err.message));
});

// ===== POST /api/admin/licenses/generate — Generate new key(s) (online) =====
router.post('/licenses/generate', async (req, res) => {
    try {
        const data = await onlineRequest('/api/admin/keys', 'POST', req.body);
        clearCache(); // Invalidate cache after write
        res.json(data);
    } catch (err) {
        console.error('[Admin] Online generate failed:', err.message);
        res.status(err.status || 500).json({ error: err.message });
    }
});

// ===== PUT /api/admin/licenses/:id/revoke — Revoke key (online) =====
router.put('/licenses/:id/revoke', async (req, res) => {
    try {
        const data = await onlineRequest(`/api/admin/manage?id=${req.params.id}&action=revoke`, 'PUT');
        clearCache();
        res.json(data);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

// ===== PUT /api/admin/licenses/:id/activate — Re-activate key (online) =====
router.put('/licenses/:id/activate', async (req, res) => {
    try {
        const data = await onlineRequest(`/api/admin/manage?id=${req.params.id}&action=activate`, 'PUT');
        clearCache();
        res.json(data);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

// ===== PUT /api/admin/licenses/:id/reset — Reset activations (online) =====
router.put('/licenses/:id/reset', async (req, res) => {
    try {
        const data = await onlineRequest(`/api/admin/manage?id=${req.params.id}&action=reset`, 'PUT');
        clearCache();
        res.json(data);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

// ===== PUT /api/admin/licenses/:id/mark-used — Mark key as used (online) =====
router.put('/licenses/:id/mark-used', async (req, res) => {
    try {
        // Online doesn't have mark-used, just update status
        const data = await onlineRequest(`/api/admin/manage?id=${req.params.id}&action=revoke`, 'PUT');
        // Re-label message
        res.json({ message: data.message?.replace('revoked', 'marked as used') || 'Key marked as used' });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

// ===== DELETE /api/admin/licenses/:id — Delete key (online) =====
router.delete('/licenses/:id', async (req, res) => {
    try {
        const data = await onlineRequest(`/api/admin/manage?id=${req.params.id}&action=delete`, 'DELETE');
        clearCache();
        res.json(data);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

// ===== PUT /api/admin/licenses/:id — Update key details (online) =====
router.put('/licenses/:id', async (req, res) => {
    try {
        const { tier, notes } = req.body;
        const body = {};
        if (tier) body.tier = tier;
        // Online manage uses upgrade action for tier changes
        if (tier) {
            const data = await onlineRequest(`/api/admin/manage?id=${req.params.id}&action=upgrade`, 'PUT', body);
            clearCache();
            res.json({ message: data.message || 'Key updated' });
        } else {
            res.json({ message: 'Nothing to update' });
        }
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

// ===== PUT /api/admin/licenses/:id/upgrade — Upgrade tier/duration (online) =====
router.put('/licenses/:id/upgrade', async (req, res) => {
    try {
        const data = await onlineRequest(`/api/admin/manage?id=${req.params.id}&action=upgrade`, 'PUT', req.body);
        clearCache();
        res.json(data);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

// ===== GET /api/admin/stats — Dashboard stats (online, cached) =====
router.get('/stats', async (req, res) => {
    const cached = getCached('stats');
    if (cached) {
        res.json(cached);
        // Refresh cache silently in background
        onlineRequest('/api/admin/stats')
            .then(data => setCache('stats', normalizeStats(data)))
            .catch(() => {});
        return;
    }

    // No cache — return local stats INSTANTLY
    const localStats = getLocalStats();
    res.json(localStats);

    // Fetch online in background and cache for next request
    onlineRequest('/api/admin/stats')
        .then(data => setCache('stats', normalizeStats(data)))
        .catch(err => console.warn('[Admin] Online stats fetch failed:', err.message));
});

function normalizeStats(data) {
    return {
        licenses: {
            total: data.total || data.licenses?.total || 0,
            active: data.active || data.licenses?.active || 0,
            used: data.used || data.licenses?.used || 0,
            revoked: data.revoked || data.licenses?.revoked || 0,
            expired: data.expired || data.licenses?.expired || 0,
            lifetime: data.lifetime || data.licenses?.lifetime || 0,
        },
        tiers: data.tiers || { pro: 0, enterprise: 0 },
        projects: data.projects || 0,
    };
}

function getLocalStats() {
    try {
        const totalKeys = get('SELECT COUNT(*) as count FROM license_keys')?.count || 0;
        const activeKeys = get("SELECT COUNT(*) as count FROM license_keys WHERE status = 'active'")?.count || 0;
        const usedKeys = get("SELECT COUNT(*) as count FROM license_keys WHERE machine_id IS NOT NULL")?.count || 0;
        const revokedKeys = get("SELECT COUNT(*) as count FROM license_keys WHERE status = 'revoked'")?.count || 0;
        const totalProjects = get('SELECT COUNT(*) as count FROM projects')?.count || 0;
        return {
            licenses: { total: totalKeys, active: activeKeys, used: usedKeys, revoked: revokedKeys, expired: 0, lifetime: 0 },
            tiers: { pro: 0, enterprise: 0 },
            projects: totalProjects,
            _source: 'local_instant'
        };
    } catch (e) {
        return { licenses: { total: 0, active: 0, used: 0, revoked: 0, expired: 0, lifetime: 0 }, tiers: {}, projects: 0 };
    }
}

// ===== GET /api/admin/logs — Audit log (online) =====
router.get('/logs', async (req, res) => {
    try {
        const { action, limit } = req.query;
        let path = '/api/admin/logs';
        const params = [];
        if (action) params.push(`action=${action}`);
        if (limit) params.push(`limit=${limit}`);
        if (params.length) path += `?${params.join('&')}`;

        const data = await onlineRequest(path);
        res.json(data);
    } catch (err) {
        console.error('[Admin] Online logs failed:', err.message);
        res.json({ count: 0, logs: [], _source: 'local_fallback' });
    }
});

module.exports = router;
