/**
 * GET /api/health — Health check & Supabase connectivity test
 */
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    const diagnostics = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
        env: {
            SUPABASE_URL: url || 'NOT SET',
            SUPABASE_SERVICE_ROLE_KEY: key ? `SET (${key.length} chars)` : 'NOT SET',
            LICENSE_SECRET: process.env.LICENSE_SECRET ? 'SET' : 'NOT SET',
            ADMIN_API_KEY: process.env.ADMIN_API_KEY ? 'SET' : 'NOT SET'
        },
        dnsTest: 'not tested',
        fetchTest: 'not tested',
        supabaseClient: 'not tested'
    };

    // Test 1: DNS Resolution
    try {
        const dns = require('dns').promises;
        const hostname = url.replace('https://', '').replace('http://', '').split('/')[0];
        const addresses = await dns.resolve4(hostname);
        diagnostics.dnsTest = { resolved: true, hostname, addresses };
    } catch (err) {
        diagnostics.dnsTest = { resolved: false, error: err.message, code: err.code };
    }

    // Test 2: Direct fetch
    try {
        const response = await fetch(`${url}/rest/v1/`, {
            headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
        });
        diagnostics.fetchTest = { ok: response.ok, status: response.status };
    } catch (err) {
        diagnostics.fetchTest = { ok: false, error: err.message };
    }

    // Test 3: Supabase client
    try {
        const { createClient } = require('@supabase/supabase-js');
        const db = createClient(url, key, { auth: { persistSession: false } });
        const { count, error } = await db.from('license_keys').select('*', { count: 'exact', head: true });
        if (error) {
            diagnostics.supabaseClient = { connected: false, error: error.message };
        } else {
            diagnostics.supabaseClient = { connected: true, keyCount: count };
        }
    } catch (err) {
        diagnostics.supabaseClient = { connected: false, error: err.message };
    }

    return res.json(diagnostics);
};
