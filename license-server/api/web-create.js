/**
 * POST /api/web-create
 * Create a bayar.gg gopay_qris payment for web checkout
 * Money goes directly to merchant's account via bayar.gg detection
 */
const { getSupabase } = require('../lib/supabase');
const { handleCors, parseBody } = require('../lib/helpers');

const BAYARGG_API_KEY = process.env.BAYARGG_API_KEY;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

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
    const { product_id, name, email } = body;

    const product = PRODUCTS[product_id];
    if (!product) {
        return res.status(400).json({ error: 'Invalid product. Choose: pro_30, pro_90, or pro_365' });
    }

    const customerName = (name || 'Customer').substring(0, 50).trim() || 'Customer';
    const customerEmail = (email || '').substring(0, 100).trim().toLowerCase() || null;
    const orderId = generateOrderId();
    const db = getSupabase();

    try {
        // Callback URL — bayar.gg akan POST ke sini saat pembayaran terdeteksi
        // Ini tidak tergantung koneksi GoPay aktif atau polling frontend
        const callbackUrl = `https://license-server-nine-dun.vercel.app/api/web-callback`;

        // Buat invoice via bayar.gg — gopay_qris
        const payRes = await fetch('https://www.bayar.gg/api/create-payment.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': BAYARGG_API_KEY
            },
            body: JSON.stringify({
                amount: product.price,
                description: `ClipperSkuy License - Order ${orderId}`,
                customer_name: customerName,
                payment_method: 'gopay_qris',
                callback_url: callbackUrl,
                expired_time: 30
            })
        });

        const payData = await payRes.json();
        console.log('[web-create] bayar.gg response:', JSON.stringify(payData));

        if (!payData.success || !payData.data) {
            console.error('[web-create] bayar.gg error:', payData);
            return res.status(502).json({ error: 'Gagal membuat pembayaran. Coba lagi.' });
        }

        const d = payData.data;
        const invoiceId = d.invoice_id;
        const paymentUrl = d.payment_url;
        const expiresAt = d.expires_at;
        const uniqueCode = d.unique_code || 0;
        const finalAmount = d.final_amount || product.price;

        // QR code dari payment_url bayar.gg
        // User scan dengan kamera HP → buka halaman bayar.gg → bayar disana → terdeteksi otomatis
        const qrImage = paymentUrl
            ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&format=png&qzone=2&data=${encodeURIComponent(paymentUrl)}`
            : null;

        console.log(`[web-create] bayar.gg — orderId:${orderId}, invoice:${invoiceId}, amount:${finalAmount}, unique:${uniqueCode}`);

        // Simpan order ke audit log (machine_id = invoice_id untuk polling web-status)
        await db.from('license_audit_log').insert({
            license_key_id: null,
            action: 'web_order',
            machine_id: invoiceId,
            ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown',
            details: {
                order_id: orderId,
                invoice_id: invoiceId,
                payment_method: 'bayargg',
                payment_url: paymentUrl,
                product_id,
                tier: product.tier,
                duration_days: product.duration,
                price: product.price,
                final_amount: finalAmount,
                unique_code: uniqueCode,
                customer_name: customerName,
                customer_email: customerEmail,
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
            qr_image: qrImage,
            amount: finalAmount,
            base_price: product.price,
            unique_code: uniqueCode,
            expires_at: expiresAt,
            product: product.name,
            payment_method: 'bayargg'
        });

    } catch (err) {
        console.error('[web-create] error:', err);
        return res.status(500).json({ error: 'Server error. Coba lagi.' });
    }
};
