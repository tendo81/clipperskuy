/**
 * POST /api/validate
 * Validate that a key is still active on a machine (heartbeat)
 * Body: { key, machine_id }
 */
const { getSupabase } = require('./_lib/supabase');
const { handleCors, getClientIP, parseBody } = require('./_lib/helpers');

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = await parseBody(req);
    const { key, machine_id } = body;

    if (!key || !machine_id) {
        return res.status(400).json({ valid: false, reason: 'Missing key or machine_id' });
    }

    const upperKey = key.toUpperCase().trim();
    const db = getSupabase();

    try {
        // Find key
        const { data: dbKey } = await db
            .from('license_keys')
            .select('*')
            .eq('license_key', upperKey)
            .single();

        if (!dbKey) {
            return res.json({ valid: false, reason: 'Key not found' });
        }

        if (dbKey.status === 'revoked') {
            return res.json({ valid: false, reason: 'Key has been revoked', revoked: true });
        }

        // Check if this machine has an active activation
        const { data: activation } = await db
            .from('license_activations')
            .select('*')
            .eq('license_key_id', dbKey.id)
            .eq('machine_id', machine_id)
            .is('deactivated_at', null)
            .single();

        if (!activation) {
            return res.json({ valid: false, reason: 'Key not activated on this machine' });
        }

        // Check expiry
        const durationDays = dbKey.duration_days || 0;
        let expiresAt = null;
        let daysRemaining = -1; // lifetime

        if (durationDays > 0 && activation.activated_at) {
            const activatedAt = new Date(activation.activated_at);
            expiresAt = new Date(activatedAt.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();
            daysRemaining = Math.ceil((new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24));

            if (daysRemaining <= 0) {
                // Expired
                await db.from('license_keys').update({ status: 'expired' }).eq('id', dbKey.id);
                return res.json({ valid: false, reason: 'License expired', expired: true });
            }
        }

        // Update last_seen_at
        await db.from('license_activations')
            .update({ last_seen_at: new Date().toISOString(), ip_address: getClientIP(req) })
            .eq('id', activation.id);

        return res.json({
            valid: true,
            tier: dbKey.tier,
            expiresAt,
            daysRemaining,
            activatedAt: activation.activated_at
        });

    } catch (err) {
        console.error('Validate error:', err);
        return res.status(500).json({ valid: false, reason: 'Server error' });
    }
};
