/**
 * Admin: License Key Management
 * GET  /api/admin/keys   — List all keys with activation details
 * POST /api/admin/keys   — Generate new key(s)
 */
const { getSupabase } = require('../_lib/supabase');
const { generateKey } = require('../_lib/crypto');
const { handleCors, verifyAdmin, parseBody } = require('../_lib/helpers');

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;
    if (!verifyAdmin(req, res)) return;

    const db = getSupabase();

    // === GET: List all keys ===
    if (req.method === 'GET') {
        try {
            const { data: keys, error } = await db
                .from('license_keys')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Get activation counts for each key
            const enriched = [];
            for (const key of keys || []) {
                const { count } = await db
                    .from('license_activations')
                    .select('*', { count: 'exact', head: true })
                    .eq('license_key_id', key.id)
                    .is('deactivated_at', null);

                // Get last seen machine
                const { data: lastActivation } = await db
                    .from('license_activations')
                    .select('machine_id, machine_name, ip_address, last_seen_at, activated_at')
                    .eq('license_key_id', key.id)
                    .is('deactivated_at', null)
                    .order('last_seen_at', { ascending: false })
                    .limit(1)
                    .single();

                enriched.push({
                    ...key,
                    activation_count: count || 0,
                    last_machine: lastActivation || null
                });
            }

            return res.json({ keys: enriched });
        } catch (err) {
            console.error('List keys error:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    // === POST: Generate new key(s) ===
    if (req.method === 'POST') {
        try {
            const body = await parseBody(req);
            const {
                tier = 'pro',
                count = 1,
                duration_days = 0,
                max_activations = 1,
                notes = ''
            } = body;

            if (!['pro', 'enterprise'].includes(tier)) {
                return res.status(400).json({ error: 'Tier must be "pro" or "enterprise"' });
            }

            const numKeys = Math.min(parseInt(count) || 1, 50);
            const durDays = parseInt(duration_days) || 0;
            const maxAct = Math.max(1, parseInt(max_activations) || 1);
            const generated = [];

            for (let i = 0; i < numKeys; i++) {
                const licenseKey = generateKey(tier, durDays);

                let expiresAt = null;
                if (durDays > 0) {
                    expiresAt = new Date(Date.now() + durDays * 24 * 60 * 60 * 1000).toISOString();
                }

                const { data, error } = await db
                    .from('license_keys')
                    .insert({
                        license_key: licenseKey,
                        tier,
                        status: 'active',
                        duration_days: durDays,
                        expires_at: expiresAt,
                        max_activations: maxAct,
                        notes
                    })
                    .select()
                    .single();

                if (error) {
                    console.error('Generate key error:', error);
                    return res.status(500).json({ error: 'DB insert failed', detail: error.message, code: error.code });
                }

                generated.push({
                    id: data.id,
                    key: data.license_key,
                    tier,
                    status: 'active',
                    duration_days: durDays,
                    expires_at: expiresAt,
                    max_activations: maxAct
                });
            }

            return res.json({
                message: `Generated ${generated.length} key(s)${durDays > 0 ? ` (${durDays} days)` : ' (lifetime)'}`,
                keys: generated
            });
        } catch (err) {
            console.error('Generate error:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
