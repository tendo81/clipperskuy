/**
 * GET /api/web-status?invoice_id=WEB-xxx
 * Check Pakasir payment status and return license key when paid
 */
const { getSupabase } = require('../lib/supabase');
const { handleCors } = require('../lib/helpers');

const PAKASIR_API_KEY = process.env.PAKASIR_API_KEY;
const PAKASIR_SLUG = process.env.PAKASIR_SLUG || 'clipp';
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
        // Find order in audit log (machine_id = orderId = invoice_id dari frontend)
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

        // Cek via Pakasir — sama seperti bot Telegram
        if (!PAKASIR_API_KEY) {
            return res.status(500).json({ error: 'Payment gateway not configured' });
        }

        const orderId = order.order_id || invoice_id;
        // Pakasir pakai total_payment (amount + fee) untuk query transaction detail
        const amount = order.final_amount || order.price;

        const pakasirUrl = `https://app.pakasir.com/api/transactiondetail?project=${PAKASIR_SLUG}&amount=${amount}&order_id=${orderId}&api_key=${PAKASIR_API_KEY}`;
        const statusRes = await fetch(pakasirUrl);
        const statusData = await statusRes.json();

        const status = statusData.transaction?.status || statusData.status || 'pending';
        console.log(`[web-status] Pakasir ${orderId} → ${status} | raw: ${JSON.stringify(statusData).substring(0, 200)}`);

        const isPaid = (status === 'completed');

        if (!isPaid) {
            return res.json({ paid: false, status });
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
                notes: `Web checkout - ${order.order_id} - Pakasir`
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
        if (order.customer_email && order.customer_email !== 'buyer@clipperskuy.com') {
            try {
                await fetch(`${LICENSE_SERVER_SELF}/api/web-notify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: order.customer_email,
                        name: order.customer_name || 'Pengguna',
                        license_key: licenseKey,
                        invoice_id: orderId,
                        product_name: order.product_id?.replace('_', ' ')
                    })
                });
                console.log(`[web-status] Email sent to ${order.customer_email}`);
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
