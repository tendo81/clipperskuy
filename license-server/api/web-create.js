/**
 * POST /api/web-create
 * Create a Pakasir QRIS payment for web checkout (sama persis seperti bot Telegram)
 * Body: { product_id, name, email }
 */
const { getSupabase } = require('../lib/supabase');
const { handleCors, parseBody } = require('../lib/helpers');

const PAKASIR_API_KEY = process.env.PAKASIR_API_KEY;
const PAKASIR_SLUG = process.env.PAKASIR_SLUG || 'clipp';
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

    if (!PAKASIR_API_KEY) {
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
        // Buat QRIS via Pakasir — sama persis seperti bot Telegram yang sudah berhasil ✅
        const pakasirRes = await fetch('https://app.pakasir.com/api/transactioncreate/qris', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: PAKASIR_API_KEY,
                project: PAKASIR_SLUG,
                amount: product.price,
                order_id: orderId
            })
        });

        const pakasirData = await pakasirRes.json();
        console.log('[web-create] Pakasir response:', JSON.stringify(pakasirData));

        if (!pakasirData.payment) {
            console.error('[web-create] Pakasir error:', pakasirData);
            return res.status(502).json({ error: 'Gagal membuat pembayaran. Coba lagi.' });
        }

        const payment = pakasirData.payment;
        // Pakasir: total_payment = amount + fee (unique code)
        const finalAmount = payment.total_payment || product.price;
        const uniqueCode = payment.fee || (finalAmount - product.price);
        // QR image — Pakasir memberi QRIS string (payment_number), generate QR dari sana
        const qrisString = payment.payment_number || null;
        const qrImage = qrisString
            ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&format=png&qzone=2&data=${encodeURIComponent(qrisString)}`
            : null;
        // Expired time
        const expiresAt = payment.expired_at || payment.expired_time || null;

        console.log(`[web-create] Pakasir QRIS — orderId: ${orderId}, amount: ${product.price}, finalAmount: ${finalAmount}, uniqueCode: ${uniqueCode}`);

        // Simpan order ke audit log (pakai orderId sebagai machine_id karena Pakasir pakai order_id)
        await db.from('license_audit_log').insert({
            license_key_id: null,
            action: 'web_order',
            machine_id: orderId,   // Pakasir pakai order_id untuk cek status
            ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown',
            details: {
                order_id: orderId,
                payment_method: 'pakasir',
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
            invoice_id: orderId,   // untuk polling web-status — pakai orderId
            qr_image: qrImage,
            amount: finalAmount,
            base_price: product.price,
            unique_code: uniqueCode,
            expires_at: expiresAt,
            product: product.name,
            payment_method: 'pakasir'
        });

    } catch (err) {
        console.error('[web-create] error:', err);
        return res.status(500).json({ error: 'Server error. Coba lagi.' });
    }
};
