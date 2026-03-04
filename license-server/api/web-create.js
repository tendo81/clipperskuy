/**
 * POST /api/web-create
 * Create a payment for web checkout
 * Body: { product_id, name, email }
 * Returns: { order_id, invoice_id, payment_url, qr_image, amount, unique_code, use_qris_converter, expires_at }
 */
const { getSupabase } = require('./_lib/supabase');
const { handleCors, parseBody } = require('./_lib/helpers');

const BAYARGG_CREATE_URL = 'https://www.bayar.gg/api/create-payment.php';
const BAYARGG_API_KEY = process.env.BAYARGG_API_KEY;
const BAYARGG_QRIS_STRING = process.env.BAYARGG_QRIS_STRING || null;
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
        // Gunakan 'gopay_qris' — sama persis kayak bot Telegram
        // bayar.gg monitor pembayaran & kirim webhook → terdeteksi otomatis ✅
        // Nominal unik (final_amount + unique_code) ditampilkan sebagai teks di frontend
        const payBody = {
            amount: product.price,
            description: `ClipperSkuy License - Order ${orderId}`,
            customer_name: customerName,
            payment_method: 'gopay_qris'
        };

        const payRes = await fetch(BAYARGG_CREATE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': BAYARGG_API_KEY
            },
            body: JSON.stringify(payBody)
        });

        const payData = await payRes.json();
        console.log('[web-create] bayar.gg response:', JSON.stringify(payData));

        if (!payData.success || !payData.data) {
            console.error('[web-create] bayar.gg error:', payData);
            return res.status(502).json({ error: 'Gagal membuat pembayaran. Coba lagi.' });
        }

        const d = payData.data;
        const invoiceId = d.invoice_id;
        const paymentUrl = d.payment_url || null;
        const expiresAt = d.expires_at || null;
        const uniqueCode = d.unique_code || 0;
        const finalAmount = d.final_amount || product.price;

        // QR dari payment_url bayar.gg → scan dengan kamera HP → buka halaman bayar
        // Nominal unik final_amount ditampilkan sebagai teks (kayak bot Telegram)
        const qrImage = paymentUrl
            ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&format=png&qzone=2&data=${encodeURIComponent(paymentUrl)}`
            : null;

        console.log(`[web-create] gopay_qris — finalAmount: ${finalAmount}, uniqueCode: ${uniqueCode}, paymentUrl: ${paymentUrl}`);


        // Simpan order ke audit log
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
            amount: finalAmount,       // final_amount termasuk kode unik
            base_price: product.price, // harga dasar sebelum kode unik
            unique_code: uniqueCode,   // kode unik yang ditambahkan
            payment_url: paymentUrl,   // link bayar.gg — untuk tombol GoPay
            qr_image: qrImage,         // QR dari payment_url — untuk scan via kamera
            expires_at: expiresAt,
            product: product.name
        });

    } catch (err) {
        console.error('[web-create] error:', err);
        return res.status(500).json({ error: 'Server error. Coba lagi.' });
    }
};
