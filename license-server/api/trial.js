/**
 * Trial Management API — Anti-abuse trial tracking
 * 
 * GET  /api/trial?machine_id=xxx  — Check if machine already had a trial
 * POST /api/trial                 — Register a new trial for a machine
 * 
 * Trial is tied to machine_id. Even after reinstall, same machine = same trial.
 */

const { getSupabase } = require('../lib/supabase');
const { handleCors, getClientIP, parseBody } = require('../lib/helpers');

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;

    const supabase = getSupabase();

    try {
        // ===== GET: Check trial status for a machine =====
        if (req.method === 'GET') {
            const { machine_id } = req.query;
            if (!machine_id) {
                return res.status(400).json({ error: 'machine_id is required' });
            }

            const { data, error } = await supabase
                .from('trial_records')
                .select('*')
                .eq('machine_id', machine_id)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('Trial check error:', error);
                return res.status(500).json({ error: 'Database error' });
            }

            if (!data) {
                return res.json({
                    has_trial: false,
                    message: 'No trial record for this machine'
                });
            }

            // Calculate trial status
            const startedAt = new Date(data.started_at);
            const now = new Date();
            const elapsed = Math.floor((now - startedAt) / (1000 * 60 * 60 * 24));
            const remaining = Math.max(0, data.trial_days - elapsed);

            return res.json({
                has_trial: true,
                started_at: data.started_at,
                trial_days: data.trial_days,
                days_elapsed: elapsed,
                days_remaining: remaining,
                expired: remaining <= 0
            });
        }

        // ===== POST: Register a new trial =====
        if (req.method === 'POST') {
            const body = await parseBody(req);
            const { machine_id, machine_name } = body;
            if (!machine_id) {
                return res.status(400).json({ error: 'machine_id is required' });
            }

            // Check if already exists
            const { data: existing } = await supabase
                .from('trial_records')
                .select('*')
                .eq('machine_id', machine_id)
                .single();

            if (existing) {
                // Already had a trial — return existing data (no reset!)
                const startedAt = new Date(existing.started_at);
                const now = new Date();
                const elapsed = Math.floor((now - startedAt) / (1000 * 60 * 60 * 24));
                const remaining = Math.max(0, existing.trial_days - elapsed);

                return res.json({
                    has_trial: true,
                    already_registered: true,
                    started_at: existing.started_at,
                    trial_days: existing.trial_days,
                    days_elapsed: elapsed,
                    days_remaining: remaining,
                    expired: remaining <= 0,
                    message: 'Trial already registered for this machine'
                });
            }

            // Register new trial
            const ip = getClientIP(req);
            const { data, error } = await supabase
                .from('trial_records')
                .insert({
                    machine_id,
                    machine_name: machine_name || 'Unknown',
                    ip_address: ip,
                    trial_days: 7
                })
                .select()
                .single();

            if (error) {
                console.error('Trial register error:', error);
                return res.status(500).json({ error: 'Failed to register trial' });
            }

            return res.json({
                has_trial: true,
                already_registered: false,
                started_at: data.started_at,
                trial_days: data.trial_days,
                days_remaining: 7,
                days_elapsed: 0,
                expired: false,
                message: 'Trial registered successfully'
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        console.error('Trial API error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
