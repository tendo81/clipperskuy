/**
 * GET /api/web-status?invoice_id=BAYAR-xxx
 * Check payment status and return license key when paid
 */
const { getSupabase } = require('./_lib/supabase');
const { handleCors } = require('./_lib/helpers');

const BAYARGG_BASE_URL = 'https://api.bayar.gg/v1';
const BAYARGG_API_KEY = process.env.BAYARGG_API_KEY;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const LICENSE_SERVER_SELF = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://clipperskuy-license.vercel.app';

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { invoice_id } = req.query;
    if (!invoice_id) return res.status(400).json({ error: 'Missing invoice_id' });

    const db = getSupabase();

    try {
        // Find order in audit log
        const { data: logs } = await db
            .from('license_audit_log')
            .select('*')
            .eq('action', 'web_order')
            .eq('machine_id', invoice_id)
            .order('created_at', { ascending: false })
            .limit(1);

        if (!logs || logs.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const log = logs[0];
        const order = log.details;

        // Already delivered?
        if (order.license_key) {
            return res.json({
                paid: true,
                key: order.license_key,
                product: order.product_id,
                order_id: order.order_id
            });
        }

        // Check bayar.gg payment status
        if (!BAYARGG_API_KEY) {
            return res.status(500).json({ error: 'Payment gateway not configured' });
        }

        const statusRes = await fetch(`${BAYARGG_BASE_URL}/payment/status`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${BAYARGG_API_KEY}`
            },
            body: JSON.stringify({ invoice_id })
        });

        const statusData = await statusRes.json();
        console.log(`[web-status] ${invoice_id} → ${statusData.status}`);

        if (statusData.status !== 'paid') {
            return res.json({
                paid: false,
                status: statusData.status || 'pending',
                expires_at: statusData.expires_at
            });
        }

        // PAID! Generate license key
        const keyRes = await fetch(`${LICENSE_SERVER_SELF}/api/admin/keys`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-key': ADMIN_API_KEY
            },
            body: JSON.stringify({
                tier: order.tier || 'pro',
                count: 1,
                duration_days: order.duration_days || 30,
                notes: `Web checkout - ${order.order_id} - ${invoice_id}`
            })
        });

        const keyData = await keyRes.json();
        const licenseKey = keyData.keys?.[0]?.key;

        if (!licenseKey) {
            console.error('[web-status] Key generation failed:', keyData);
            return res.status(500).json({ error: 'Gagal generate key. Hubungi admin.' });
        }

        // Mark order as delivered in audit log
        await db.from('license_audit_log')
            .update({
                details: {
                    ...order,
                    status: 'paid',
                    license_key: licenseKey,
                    paid_at: new Date().toISOString()
                }
            })
            .eq('id', log.id);

        return res.json({
            paid: true,
            key: licenseKey,
            product: order.product_id,
            order_id: order.order_id
        });

    } catch (err) {
        console.error('[web-status] error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
};
