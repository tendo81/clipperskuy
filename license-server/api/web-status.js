/**
 * GET /api/web-status?invoice_id=BAYAR-xxx
 * Check bayar.gg payment status and return license key when paid
 */
const { getSupabase } = require('../lib/supabase');
const { handleCors } = require('../lib/helpers');

const BAYARGG_API_KEY = process.env.BAYARGG_API_KEY;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const LICENSE_SERVER_SELF = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://license-server-nine-dun.vercel.app';

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { invoice_id } = req.query;
    if (!invoice_id) return res.status(400).json({ error: 'Missing invoice_id' });

    const db = getSupabase();

    try {
        // Find order — machine_id = bayar.gg invoice_id
        const { data: logs } = await db
            .from('license_audit_log')
            .select('*')
            .eq('action', 'web_order')
            .eq('machine_id', invoice_id)
            .order('created_at', { ascending: false })
            .limit(1);

        if (!logs || logs.length === 0) {
            return res.status(404).json({ error: 'Order not found', invoice_id });
        }

        const log = logs[0];
        const order = log.details;

        // Kalau sudah delivered, langsung return
        if (order.license_key) {
            return res.json({
                paid: true,
                key: order.license_key,
                product: order.product_id,
                order_id: order.order_id
            });
        }

        // Cek status via bayar.gg
        if (!BAYARGG_API_KEY) {
            return res.status(500).json({ error: 'Payment gateway not configured' });
        }

        const statusRes = await fetch(`https://www.bayar.gg/api/check-payment?invoice=${invoice_id}`, {
            headers: { 'X-API-Key': BAYARGG_API_KEY }
        });
        const statusData = await statusRes.json();

        // bayar.gg bisa return nested: { status } atau { data: { status } }
        const status = statusData.status || statusData.data?.status || 'pending';
        console.log(`[web-status] bayar.gg ${invoice_id} → ${status}`);

        const isPaid = ['paid', 'settlement', 'success', 'completed'].includes(status?.toLowerCase());

        if (!isPaid) {
            return res.json({ paid: false, status });
        }

        // PAID! Generate license key
        const keyRes = await fetch(`${LICENSE_SERVER_SELF}/api/admin`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-key': ADMIN_API_KEY
            },
            body: JSON.stringify({
                tier: order.tier || 'pro',
                count: 1,
                duration_days: order.duration_days || 30,
                notes: `Web checkout - ${order.order_id} - bayar.gg`
            })
        });

        const keyData = await keyRes.json();
        const licenseKey = keyData.keys?.[0]?.key;

        if (!licenseKey) {
            console.error('[web-status] Key generation failed:', keyData);
            return res.status(500).json({ error: 'Gagal generate key. Hubungi admin.' });
        }

        // Simpan license key ke audit log
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

        // Kirim email notifikasi
        if (order.customer_email && !order.customer_email.includes('test')) {
            try {
                await fetch(`${LICENSE_SERVER_SELF}/api/web-notify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: order.customer_email,
                        name: order.customer_name || 'Pengguna',
                        license_key: licenseKey,
                        invoice_id: invoice_id,
                        product_name: order.product_id
                    })
                });
            } catch (emailErr) {
                console.error('[web-status] Email failed (non-fatal):', emailErr.message);
            }
        }

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
