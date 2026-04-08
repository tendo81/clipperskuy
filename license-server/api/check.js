/**
 * POST /api/check
 * Check license key status (for bot) — no machine_id required
 * Body: { key }
 * Returns: { valid, tier, activated, expiresAt, daysRemaining, activatedAt }
 */
const { getSupabase } = require('../lib/supabase');
const { handleCors, parseBody } = require('../lib/helpers');
const { isValidKeyFormat, verifyKeySignature } = require('../lib/crypto');

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = await parseBody(req);
    const { key } = body;

    if (!key) {
        return res.status(400).json({ valid: false, reason: 'Missing key' });
    }

    const upperKey = key.toUpperCase().trim();
    if (!isValidKeyFormat(upperKey)) {
        return res.status(400).json({ valid: false, reason: 'Invalid key format' });
    }

    const db = getSupabase();

    try {
        // Find key in DB
        const { data: dbKey } = await db
            .from('license_keys')
            .select('*')
            .eq('license_key', upperKey)
            .single();

        // Key not in DB — check signature validity
        if (!dbKey) {
            const sig = verifyKeySignature(upperKey);
            if (!sig.valid) {
                return res.json({ valid: false, reason: 'Invalid license key' });
            }
            // Key is valid but never activated
            return res.json({
                valid: true,
                tier: sig.tier,
                activated: false,
                expiresAt: null,
                daysRemaining: -1,
                activatedAt: null,
                message: 'Key valid, belum pernah diaktivasi'
            });
        }

        // Key exists in DB
        if (dbKey.status === 'revoked') {
            return res.json({ valid: false, reason: 'Key has been revoked', revoked: true });
        }

        // Check if there's an active activation
        const { data: activation } = await db
            .from('license_activations')
            .select('*')
            .eq('license_key_id', dbKey.id)
            .is('deactivated_at', null)
            .order('activated_at', { ascending: false })
            .limit(1)
            .single();

        if (!activation) {
            // Key in DB but no active activation
            return res.json({
                valid: true,
                tier: dbKey.tier,
                activated: false,
                expiresAt: null,
                daysRemaining: -1,
                activatedAt: null,
                message: 'Key valid, belum diaktivasi di perangkat manapun'
            });
        }

        // Has active activation — calculate expiry
        const durationDays = dbKey.duration_days || 0;
        let expiresAt = null;
        let daysRemaining = -1; // lifetime

        if (durationDays > 0 && activation.activated_at) {
            const activatedAt = new Date(activation.activated_at);
            expiresAt = new Date(activatedAt.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();
            daysRemaining = Math.ceil((new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24));

            if (daysRemaining <= 0) {
                return res.json({
                    valid: false,
                    tier: dbKey.tier,
                    activated: true,
                    expiresAt,
                    daysRemaining: 0,
                    activatedAt: activation.activated_at,
                    expired: true,
                    reason: 'License expired'
                });
            }
        }

        return res.json({
            valid: true,
            tier: dbKey.tier,
            activated: true,
            expiresAt,
            daysRemaining,
            activatedAt: activation.activated_at,
            machineName: activation.machine_name
        });

    } catch (err) {
        console.error('Check error:', err);
        return res.status(500).json({ valid: false, reason: 'Server error' });
    }
};
