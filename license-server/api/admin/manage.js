/**
 * Admin: Manage individual key
 * PUT /api/admin/manage?id=xxx&action=revoke|activate|reset|delete
 */
const { getSupabase } = require('../_lib/supabase');
const { handleCors, verifyAdmin, parseBody } = require('../_lib/helpers');

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;
    if (!verifyAdmin(req, res)) return;
    if (req.method !== 'PUT' && req.method !== 'DELETE') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { id, action } = req.query || {};
    if (!id || !action) {
        return res.status(400).json({ error: 'Missing id or action parameter' });
    }

    const db = getSupabase();

    try {
        // Find key
        const { data: key } = await db
            .from('license_keys')
            .select('*')
            .eq('id', id)
            .single();

        if (!key) return res.status(404).json({ error: 'Key not found' });

        switch (action) {
            case 'revoke':
                await db.from('license_keys')
                    .update({ status: 'revoked' })
                    .eq('id', id);
                await db.from('license_audit_log').insert({
                    license_key_id: id, action: 'admin_revoke',
                    details: { previous_status: key.status }
                });
                return res.json({ message: `Key ${key.license_key} revoked` });

            case 'activate':
                await db.from('license_keys')
                    .update({ status: 'active' })
                    .eq('id', id);
                return res.json({ message: `Key ${key.license_key} re-activated` });

            case 'reset':
                // Clear all activations
                await db.from('license_activations')
                    .update({ deactivated_at: new Date().toISOString() })
                    .eq('license_key_id', id)
                    .is('deactivated_at', null);
                await db.from('license_keys')
                    .update({ status: 'active' })
                    .eq('id', id);
                await db.from('license_audit_log').insert({
                    license_key_id: id, action: 'admin_reset'
                });
                return res.json({ message: `Key ${key.license_key} activations reset` });

            case 'delete':
                await db.from('license_activations').delete().eq('license_key_id', id);
                await db.from('license_audit_log').delete().eq('license_key_id', id);
                await db.from('license_keys').delete().eq('id', id);
                return res.json({ message: `Key ${key.license_key} deleted` });

            case 'upgrade':
            case 'downgrade': {
                const body = await parseBody(req);
                const newTier = body.tier;
                const newDuration = body.duration_days !== undefined ? parseInt(body.duration_days) : undefined;
                const newMaxAct = body.max_activations !== undefined ? parseInt(body.max_activations) : undefined;

                if (!newTier || !['pro', 'enterprise'].includes(newTier)) {
                    return res.status(400).json({ error: 'Provide valid tier: "pro" or "enterprise"' });
                }

                const updates = { tier: newTier };
                if (newDuration !== undefined) updates.duration_days = newDuration;
                if (newMaxAct !== undefined) updates.max_activations = newMaxAct;

                // If upgrading duration, recalculate expiry based on original activation
                if (newDuration !== undefined && newDuration > 0) {
                    const { data: activation } = await db
                        .from('license_activations')
                        .select('activated_at')
                        .eq('license_key_id', id)
                        .is('deactivated_at', null)
                        .order('activated_at', { ascending: true })
                        .limit(1)
                        .single();

                    if (activation) {
                        const activatedAt = new Date(activation.activated_at);
                        updates.expires_at = new Date(activatedAt.getTime() + newDuration * 24 * 60 * 60 * 1000).toISOString();
                    } else {
                        updates.expires_at = new Date(Date.now() + newDuration * 24 * 60 * 60 * 1000).toISOString();
                    }
                } else if (newDuration === 0) {
                    updates.expires_at = null; // Lifetime
                    updates.duration_days = 0;
                }

                await db.from('license_keys').update(updates).eq('id', id);
                await db.from('license_audit_log').insert({
                    license_key_id: id, action: `admin_${action}`,
                    details: { previous_tier: key.tier, new_tier: newTier, changes: updates }
                });
                return res.json({
                    message: `Key ${key.license_key} ${action}d: ${key.tier} → ${newTier}`,
                    previous: { tier: key.tier, duration_days: key.duration_days, max_activations: key.max_activations },
                    current: updates
                });
            }

            case 'unbind': {
                // Admin unbind: remove machine binding so key can be used on a new machine
                const { data: activeActivation } = await db
                    .from('license_activations')
                    .select('*')
                    .eq('license_key_id', id)
                    .is('deactivated_at', null)
                    .single();

                if (!activeActivation) {
                    return res.json({ message: `Key ${key.license_key} is not bound to any machine` });
                }

                // Deactivate current binding
                await db.from('license_activations')
                    .update({ deactivated_at: new Date().toISOString() })
                    .eq('id', activeActivation.id);

                // Reset key status to active
                await db.from('license_keys')
                    .update({ status: 'active' })
                    .eq('id', id);

                // Audit log
                await db.from('license_audit_log').insert({
                    license_key_id: id,
                    action: 'admin_unbind',
                    machine_id: activeActivation.machine_id,
                    details: {
                        unbound_machine: activeActivation.machine_name || activeActivation.machine_id,
                        previous_status: key.status
                    }
                });

                return res.json({
                    message: `Key ${key.license_key} berhasil di-unbind dari ${activeActivation.machine_name || activeActivation.machine_id}. Key bisa dipakai di perangkat baru.`,
                    unbound_machine: activeActivation.machine_id
                });
            }

            default:
                return res.status(400).json({ error: 'Invalid action. Use: revoke, activate, reset, unbind, delete, upgrade, downgrade' });
        }
    } catch (err) {
        console.error('Manage key error:', err);
        return res.status(500).json({ error: err.message });
    }
};
