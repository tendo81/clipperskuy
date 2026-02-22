/**
 * GET /api/admin/stats
 * Dashboard statistics for admin panel
 */
const { getSupabase } = require('../_lib/supabase');
const { handleCors, verifyAdmin } = require('../_lib/helpers');

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;
    if (!verifyAdmin(req, res)) return;
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const db = getSupabase();

    try {
        const count = async (table, filters = {}) => {
            let q = db.from(table).select('*', { count: 'exact', head: true });
            for (const [k, v] of Object.entries(filters)) {
                q = q.eq(k, v);
            }
            const { count: c } = await q;
            return c || 0;
        };

        const totalKeys = await count('license_keys');
        const activeKeys = await count('license_keys', { status: 'active' });
        const usedKeys = await count('license_keys', { status: 'used' });
        const revokedKeys = await count('license_keys', { status: 'revoked' });
        const expiredKeys = await count('license_keys', { status: 'expired' });
        const proKeys = await count('license_keys', { tier: 'pro' });
        const enterpriseKeys = await count('license_keys', { tier: 'enterprise' });

        // Active activations (machines currently using a license)
        const { count: activeActivations } = await db
            .from('license_activations')
            .select('*', { count: 'exact', head: true })
            .is('deactivated_at', null);

        // Recent activity (last 10 events)
        const { data: recentActivity } = await db
            .from('license_audit_log')
            .select('*, license_keys(license_key, tier)')
            .order('created_at', { ascending: false })
            .limit(10);

        return res.json({
            licenses: {
                total: totalKeys,
                active: activeKeys,
                used: usedKeys,
                revoked: revokedKeys,
                expired: expiredKeys
            },
            tiers: { pro: proKeys, enterprise: enterpriseKeys },
            activeMachines: activeActivations || 0,
            recentActivity: recentActivity || []
        });
    } catch (err) {
        console.error('Stats error:', err);
        return res.status(500).json({ error: err.message });
    }
};
