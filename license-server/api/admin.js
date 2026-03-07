/**
 * Admin: License Key Management (merged)
 * GET  /api/admin   — List all keys
 * POST /api/admin   — Generate new key(s)
 * PUT  /api/admin?id=xxx&action=revoke|activate|reset|delete|upgrade|downgrade|unbind
 */
const { getSupabase } = require('../lib/supabase');
const { generateKey } = require('../lib/crypto');
const { handleCors, verifyAdmin, parseBody } = require('../lib/helpers');

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;
    if (!verifyAdmin(req, res)) return;

    const db = getSupabase();

    // === GET: List all keys ===
    if (req.method === 'GET') {
        const { action } = req.query || {};

        // GET ?action=stats — Dashboard stats
        if (action === 'stats') {
            try {
                const { count: total } = await db.from('license_keys').select('*', { count: 'exact', head: true });
                const { count: active } = await db.from('license_keys').select('*', { count: 'exact', head: true }).eq('status', 'active');
                const { count: used } = await db.from('license_keys').select('*', { count: 'exact', head: true }).not('machine_id', 'is', null);
                const { count: revoked } = await db.from('license_keys').select('*', { count: 'exact', head: true }).eq('status', 'revoked');
                const { count: pro } = await db.from('license_keys').select('*', { count: 'exact', head: true }).eq('tier', 'pro');
                const { count: enterprise } = await db.from('license_keys').select('*', { count: 'exact', head: true }).eq('tier', 'enterprise');
                return res.json({ total, active, used, revoked, pro, enterprise, tiers: { pro, enterprise } });
            } catch (err) {
                return res.status(500).json({ error: err.message });
            }
        }

        // GET ?action=logs — Audit log
        if (action === 'logs') {
            try {
                const limit = parseInt(req.query.limit) || 50;
                const actionFilter = req.query.filter_action;
                let query = db.from('license_audit_log').select('*').order('created_at', { ascending: false }).limit(limit);
                if (actionFilter) query = query.eq('action', actionFilter);
                const { data: logs, error } = await query;
                if (error) throw error;
                return res.json({ count: logs?.length || 0, logs: logs || [] });
            } catch (err) {
                return res.status(500).json({ error: err.message });
            }
        }

        // GET (no action) — List all keys
        try {
            const { data: keys, error } = await db
                .from('license_keys')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;

            // Ambil SEMUA activations sekaligus (1 query, bukan N queries)
            const { data: allActivations } = await db
                .from('license_activations')
                .select('license_key_id, machine_id, machine_name, ip_address, last_seen_at, activated_at')
                .is('deactivated_at', null)
                .order('last_seen_at', { ascending: false });

            // Gabungkan di memory (O(n) — sangat cepat)
            const activationMap = {};
            const countMap = {};
            for (const act of allActivations || []) {
                const kid = act.license_key_id;
                countMap[kid] = (countMap[kid] || 0) + 1;
                if (!activationMap[kid]) activationMap[kid] = act; // ambil yang terbaru
            }

            const enriched = (keys || []).map(key => ({
                ...key,
                activation_count: countMap[key.id] || 0,
                last_machine: activationMap[key.id] || null
            }));

            return res.json({ keys: enriched });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    // === POST: Generate new key(s) ===
    if (req.method === 'POST') {
        try {
            const body = await parseBody(req);
            const { tier = 'pro', count = 1, duration_days = 0, max_activations = 1, notes = '' } = body;
            if (!['pro', 'enterprise'].includes(tier))
                return res.status(400).json({ error: 'Tier must be "pro" or "enterprise"' });
            const numKeys = Math.min(parseInt(count) || 1, 50);
            const durDays = parseInt(duration_days) || 0;
            const maxAct = Math.max(1, parseInt(max_activations) || 1);
            const generated = [];
            for (let i = 0; i < numKeys; i++) {
                const licenseKey = generateKey(tier, durDays);
                // expires_at = null saat dibuat — expiry mulai saat key PERTAMA DIAKTIFKAN
                const { data, error } = await db
                    .from('license_keys')
                    .insert({ license_key: licenseKey, tier, status: 'active', duration_days: durDays, expires_at: null, max_activations: maxAct, notes })
                    .select().single();
                if (error) return res.status(500).json({ error: 'DB insert failed', detail: error.message });
                generated.push({ id: data.id, key: data.license_key, tier, status: 'active', duration_days: durDays, expires_at: null, max_activations: maxAct });
            }
            return res.json({ message: `Generated ${generated.length} key(s)`, keys: generated });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    // === PUT/DELETE: Manage individual key ===
    if (req.method === 'PUT' || req.method === 'DELETE') {
        const { id, action } = req.query || {};
        if (!id || !action) return res.status(400).json({ error: 'Missing id or action' });
        try {
            const { data: key } = await db.from('license_keys').select('*').eq('id', id).single();
            if (!key) return res.status(404).json({ error: 'Key not found' });
            switch (action) {
                case 'revoke':
                    await db.from('license_keys').update({ status: 'revoked' }).eq('id', id);
                    return res.json({ message: `Key ${key.license_key} revoked` });
                case 'activate':
                    await db.from('license_keys').update({ status: 'active' }).eq('id', id);
                    return res.json({ message: `Key ${key.license_key} re-activated` });
                case 'reset':
                    await db.from('license_activations').update({ deactivated_at: new Date().toISOString() }).eq('license_key_id', id).is('deactivated_at', null);
                    await db.from('license_keys').update({ status: 'active' }).eq('id', id);
                    return res.json({ message: `Key ${key.license_key} reset` });
                case 'delete':
                    await db.from('license_activations').delete().eq('license_key_id', id);
                    await db.from('license_audit_log').delete().eq('license_key_id', id);
                    await db.from('license_keys').delete().eq('id', id);
                    return res.json({ message: `Key ${key.license_key} deleted` });
                case 'unbind': {
                    const { data: act } = await db.from('license_activations').select('*').eq('license_key_id', id).is('deactivated_at', null).single();
                    if (!act) return res.json({ message: `Key not bound to any machine` });
                    await db.from('license_activations').update({ deactivated_at: new Date().toISOString() }).eq('id', act.id);
                    await db.from('license_keys').update({ status: 'active' }).eq('id', id);
                    return res.json({ message: `Key ${key.license_key} unbound`, unbound_machine: act.machine_id });
                }
                case 'upgrade':
                case 'downgrade': {
                    const body = await parseBody(req);
                    const { tier: newTier, duration_days: nd, max_activations: nm } = body;
                    if (!newTier || !['pro', 'enterprise'].includes(newTier))
                        return res.status(400).json({ error: 'Provide valid tier' });
                    const updates = { tier: newTier };
                    if (nd !== undefined) { updates.duration_days = parseInt(nd); updates.expires_at = nd > 0 ? new Date(Date.now() + nd * 86400000).toISOString() : null; }
                    if (nm !== undefined) updates.max_activations = parseInt(nm);
                    await db.from('license_keys').update(updates).eq('id', id);
                    return res.json({ message: `Key updated`, current: updates });
                }
                default:
                    return res.status(400).json({ error: 'Invalid action' });
            }
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
