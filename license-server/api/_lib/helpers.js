/**
 * Common helpers for API routes
 */

/** CORS preflight handler */
function handleCors(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-key');
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return true;
    }
    return false;
}

/** Verify admin API key */
function verifyAdmin(req, res) {
    const adminKey = req.headers['x-admin-key'];
    const expectedKey = process.env.ADMIN_API_KEY;
    if (!expectedKey) {
        res.status(500).json({ error: 'ADMIN_API_KEY not configured on server' });
        return false;
    }
    if (adminKey !== expectedKey) {
        res.status(401).json({ error: 'Unauthorized — invalid admin key' });
        return false;
    }
    return true;
}

/** Get client IP */
function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.headers['x-real-ip']
        || req.connection?.remoteAddress
        || 'unknown';
}

/** Parse JSON body */
async function parseBody(req) {
    if (req.body) return req.body;
    return new Promise((resolve) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(data)); }
            catch { resolve({}); }
        });
    });
}

module.exports = { handleCors, verifyAdmin, getClientIP, parseBody };
