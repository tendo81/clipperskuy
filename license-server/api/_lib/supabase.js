/**
 * Supabase client for License Server
 * Uses service_role key for full database access
 */
const { createClient } = require('@supabase/supabase-js');

let supabase = null;

function getSupabase() {
    if (!supabase) {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!url || !key) {
            throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
        }

        supabase = createClient(url, key, {
            auth: { persistSession: false }
        });
    }
    return supabase;
}

module.exports = { getSupabase };
