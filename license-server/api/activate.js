/**
 * POST /api/activate
 * Activate a license key on a machine
 * 1 License = 1 Machine ID (permanently bound)
 * Only admin can unbind via /api/admin/manage?action=unbind
 * 
 * Body: { key, machine_id, machine_name, app_version }
 */
const { getSupabase } = require('./_lib/supabase');
const { verifyKeySignature, isValidKeyFormat } = require('./_lib/crypto');
const { handleCors, getClientIP, parseBody } = require('./_lib/helpers');

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = await parseBody(req);
    const { key, machine_id, machine_name, app_version } = body;

    if (!key || !machine_id) {
        return res.status(400).json({ valid: false, reason: 'Missing key or machine_id' });
    }

    const upperKey = key.toUpperCase().trim();
    if (!isValidKeyFormat(upperKey)) {
        return res.status(400).json({ valid: false, reason: 'Invalid key format' });
    }

    const db = getSupabase();
    const ip = getClientIP(req);

    try {
        // 1. Find or create key in DB
        let { data: dbKey } = await db
            .from('license_keys')
            .select('*')
            .eq('license_key', upperKey)
            .single();

        // Key not in DB — verify signature and auto-insert
        if (!dbKey) {
            const sig = verifyKeySignature(upperKey);
            if (!sig.valid) {
                return res.json({ valid: false, reason: 'Invalid license key' });
            }

            const { data: newKey, error: insertErr } = await db
                .from('license_keys')
                .insert({
                    license_key: upperKey,
                    tier: sig.tier,
                    status: 'active',
                    duration_days: sig.duration_days,
                    max_activations: 1
                })
                .select()
                .single();

            if (insertErr) {
                console.error('Insert error:', insertErr);
                return res.status(500).json({ valid: false, reason: 'Server error' });
            }

            dbKey = newKey;
        }

        // 2. Check key status
        if (dbKey.status === 'revoked') {
            return res.json({ valid: false, reason: 'License key telah di-revoke. Hubungi admin.' });
        }

        if (dbKey.status === 'expired') {
            return res.json({ valid: false, reason: 'License key sudah expired.' });
        }

        // 3. Check existing activation — is this key already bound to a machine?
        const { data: existingActivation } = await db
            .from('license_activations')
            .select('*')
            .eq('license_key_id', dbKey.id)
            .is('deactivated_at', null)
            .single();

        if (existingActivation) {
            // Key is already bound to a machine
            if (existingActivation.machine_id === machine_id) {
                // Same machine — re-activation (OK, update last_seen)
                await db.from('license_activations')
                    .update({
                        last_seen_at: new Date().toISOString(),
                        machine_name: machine_name || existingActivation.machine_name,
                        app_version: app_version || existingActivation.app_version,
                        ip_address: ip
                    })
                    .eq('id', existingActivation.id);

                // Calculate expiry
                const { expiresAt, daysRemaining } = calculateExpiry(dbKey, existingActivation);

                return res.json({
                    valid: true,
                    tier: dbKey.tier,
                    expiresAt,
                    daysRemaining,
                    activatedAt: existingActivation.activated_at,
                    machineId: machine_id,
                    bound: true
                });
            } else {
                // DIFFERENT machine — REJECT! Key is bound to another machine.
                return res.json({
                    valid: false,
                    reason: `License ini sudah terikat ke perangkat lain (${existingActivation.machine_name || existingActivation.machine_id.substring(0, 8) + '...'}). 1 license = 1 perangkat. Hubungi admin untuk unbind.`,
                    bound_to: existingActivation.machine_id.substring(0, 8) + '...',
                    contact_admin: true
                });
            }
        }

        // 4. No existing activation — bind this key to this machine
        const { error: actErr } = await db.from('license_activations')
            .insert({
                license_key_id: dbKey.id,
                machine_id,
                machine_name: machine_name || 'Unknown',
                ip_address: ip,
                app_version: app_version || 'Unknown'
            });

        if (actErr) {
            console.error('Activation insert error:', actErr);
            return res.status(500).json({ valid: false, reason: 'Server error' });
        }

        // Update key status to 'used'
        await db.from('license_keys')
            .update({ status: 'used' })
            .eq('id', dbKey.id);

        // Audit log
        await db.from('license_audit_log').insert({
            license_key_id: dbKey.id,
            action: 'activate',
            machine_id,
            ip_address: ip,
            details: { machine_name, app_version, tier: dbKey.tier }
        });

        // Calculate expiry
        const { expiresAt, daysRemaining } = calculateExpiry(dbKey, { activated_at: new Date().toISOString() });

        return res.json({
            valid: true,
            tier: dbKey.tier,
            expiresAt,
            daysRemaining,
            activatedAt: new Date().toISOString(),
            machineId: machine_id,
            bound: true,
            message: 'License aktif! Key ini sekarang terikat ke perangkat ini.'
        });

    } catch (err) {
        console.error('Activate error:', err);
        return res.status(500).json({ valid: false, reason: 'Server error' });
    }
};

/**
 * Calculate expiry based on duration_days and activation date
 */
function calculateExpiry(dbKey, activation) {
    const durationDays = dbKey.duration_days || 0;
    let expiresAt = null;
    let daysRemaining = -1; // -1 = lifetime

    if (durationDays > 0 && activation.activated_at) {
        const activatedAt = new Date(activation.activated_at);
        expiresAt = new Date(activatedAt.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();
        daysRemaining = Math.ceil((new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
    }

    return { expiresAt, daysRemaining };
}
