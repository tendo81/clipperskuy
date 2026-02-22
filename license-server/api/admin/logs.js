/**
 * GET /api/admin/logs
 * View license audit log with filtering
 * Query params:
 *   ?key_id=xxx     — filter by license key ID
 *   ?action=activate — filter by action type
 *   ?limit=50       — max results (default 50)
 */
const { getSupabase } = require('../_lib/supabase');
const { handleCors, verifyAdmin } = require('../_lib/helpers');

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;
    if (!verifyAdmin(req, res)) return;
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const db = getSupabase();
    const { key_id, action, limit = 50 } = req.query || {};

    try {
        let query = db
            .from('license_audit_log')
            .select('*, license_keys(license_key, tier, status)')
            .order('created_at', { ascending: false })
            .limit(Math.min(parseInt(limit) || 50, 200));

        if (key_id) query = query.eq('license_key_id', key_id);
        if (action) query = query.eq('action', action);

        const { data: logs, error } = await query;

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        return res.json({
            count: logs.length,
            logs: logs.map(log => ({
                id: log.id,
                action: log.action,
                licenseKey: log.license_keys?.license_key || null,
                tier: log.license_keys?.tier || null,
                keyStatus: log.license_keys?.status || null,
                machineId: log.machine_id,
                ipAddress: log.ip_address,
                details: log.details,
                createdAt: log.created_at
            }))
        });
    } catch (err) {
        console.error('Logs error:', err);
        return res.status(500).json({ error: err.message });
    }
};
