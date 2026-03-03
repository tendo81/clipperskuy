/**
 * POST /api/web-create
 * Create a payment for web checkout
 * Body: { product_id, name }
 * Returns: { order_id, invoice_id, payment_url, amount, unique_code, qr_string, expires_at }
 */
const { getSupabase } = require('./_lib/supabase');
const { handleCors, parseBody } = require('./_lib/helpers');

const BAYARGG_BASE_URL = 'https://api.bayar.gg/v1';
const BAYARGG_API_KEY = process.env.BAYARGG_API_KEY;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const LICENSE_SERVER = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://clipperskuy-license.vercel.app';

const PRODUCTS = {
    pro_30: { name: '⚡ ClipperSkuy Pro — 30 Hari', tier: 'pro', duration: 30, price: 69000 },
    pro_90: { name: '⚡ ClipperSkuy Pro — 90 Hari', tier: 'pro', duration: 90, price: 129000 },
    pro_365: { name: '⚡ ClipperSkuy Pro — 365 Hari', tier: 'pro', duration: 365, price: 250000 },
};

function generateOrderId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = 'WEB-';
    for (let i = 0; i < 10; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
}

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if (!BAYARGG_API_KEY) {
        return res.status(500).json({ error: 'Payment gateway not configured. Contact admin.' });
    }

    const body = await parseBody(req);
    const { product_id, name } = body;

    const product = PRODUCTS[product_id];
    if (!product) {
        return res.status(400).json({ error: 'Invalid product. Choose: pro_30, pro_90, or pro_365' });
    }

    const customerName = (name || 'Customer').substring(0, 50).trim() || 'Customer';
    const orderId = generateOrderId();
    const db = getSupabase();

    try {
        // Create payment via bayar.gg
        const payRes = await fetch(`${BAYARGG_BASE_URL}/payment/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${BAYARGG_API_KEY}`
            },
            body: JSON.stringify({
                external_id: orderId,
                amount: product.price,
                payment_method: 'QRIS',
                customer_name: customerName,
                customer_email: 'buyer@clipperskuy.com',
                description: `${product.name} - ClipperSkuy`,
                expired_time: 30 // 30 minutes
            })
        });

        const payData = await payRes.json();

        if (!payData.success && !payData.invoice_id) {
            console.error('[web-create] bayar.gg error:', payData);
            return res.status(502).json({ error: 'Gagal membuat pembayaran. Coba lagi.' });
        }

        const invoiceId = payData.invoice_id;
        const finalAmount = payData.final_amount || product.price;
        const uniqueCode = payData.unique_code || 0;
        const paymentUrl = payData.payment_url || null;
        const qrString = payData.qr_string || null;
        const qrImage = payData.qr_image || null;
        const expiresAt = payData.expires_at || null;

        // Store order in audit log with action 'web_order'
        await db.from('license_audit_log').insert({
            license_key_id: null,
            action: 'web_order',
            machine_id: invoiceId,
            ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown',
            details: {
                order_id: orderId,
                invoice_id: invoiceId,
                product_id,
                tier: product.tier,
                duration_days: product.duration,
                price: product.price,
                final_amount: finalAmount,
                customer_name: customerName,
                status: 'pending',
                license_key: null,
                created_at: new Date().toISOString()
            }
        });

        return res.json({
            success: true,
            order_id: orderId,
            invoice_id: invoiceId,
            payment_url: paymentUrl,
            qr_string: qrString,
            qr_image: qrImage,
            amount: finalAmount,
            unique_code: uniqueCode,
            expires_at: expiresAt,
            product: product.name
        });

    } catch (err) {
        console.error('[web-create] error:', err);
        return res.status(500).json({ error: 'Server error. Coba lagi.' });
    }
};
