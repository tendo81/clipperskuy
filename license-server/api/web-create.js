/**
 * POST /api/web-create
 * Create Pakasir QRIS payment — fee lebih rendah, tidak perlu login ulang
 */
const { getSupabase } = require('../lib/supabase');
const { handleCors, parseBody } = require('../lib/helpers');

const PAKASIR_SLUG = process.env.PAKASIR_SLUG;    // 'clipp'
const PAKASIR_API_KEY = process.env.PAKASIR_API_KEY;

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

    if (!PAKASIR_SLUG || !PAKASIR_API_KEY) {
        return res.status(500).json({ error: 'Payment gateway not configured. Contact admin.' });
    }

    const body = await parseBody(req);
    const { product_id, name, email, promo_code } = body;

    const product = PRODUCTS[product_id];
    if (!product) {
        return res.status(400).json({ error: 'Invalid product. Choose: pro_30, pro_90, or pro_365' });
    }

    const customerName = (name || 'Customer').substring(0, 50).trim() || 'Customer';
    const customerEmail = (email || '').substring(0, 100).trim().toLowerCase() || null;
    const promoCode = promo_code ? promo_code.toUpperCase().trim() : null;
    const orderId = generateOrderId();
    const db = getSupabase();

    // Validasi & hitung diskon promo code
    let finalPrice = product.price;
    let discountAmount = 0;
    let promoData = null;
    if (promoCode) {
        const { data: promo } = await db
            .from('promo_codes')
            .select('*')
            .eq('code', promoCode)
            .eq('active', true)
            .single();
        if (promo && !(promo.expires_at && new Date(promo.expires_at) < new Date())
            && !(promo.max_uses !== null && promo.used_count >= promo.max_uses)
            && !(promo.product_ids?.length && !promo.product_ids.includes(product_id))) {
            if (promo.discount_type === 'percent') {
                discountAmount = Math.round(product.price * promo.discount_value / 100);
            } else {
                discountAmount = promo.discount_value;
            }
            finalPrice = Math.max(1000, product.price - discountAmount);
            promoData = promo;
        }
    }

    try {
        // Buat QRIS via Pakasir
        const pakasirRes = await fetch('https://app.pakasir.com/api/transactioncreate/qris', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: PAKASIR_API_KEY,
                project: PAKASIR_SLUG,
                amount: finalPrice,   // harga setelah diskon
                order_id: orderId
            })
        });

        const pakasirData = await pakasirRes.json();
        console.log(`[web-create] Pakasir response: ${JSON.stringify(pakasirData).substring(0, 300)}`);

        if (!pakasirData.payment) {
            console.error('[web-create] Pakasir error:', pakasirData);
            return res.status(502).json({ error: 'Gagal membuat pembayaran. Coba lagi.' });
        }

        const payment = pakasirData.payment;
        // total_payment = harga + fee (kode unik)
        const finalAmount = payment.total_payment || product.price;
        const uniqueCode = payment.fee || (finalAmount - product.price);
        // QRIS string → generate QR image via qrserver
        const qrisString = payment.payment_number || null;
        const qrImage = qrisString
            ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&format=png&qzone=2&data=${encodeURIComponent(qrisString)}`
            : null;
        const expiresAt = payment.expired_at || null;

        console.log(`[web-create] Pakasir QRIS — orderId:${orderId}, basePrice:${product.price}, finalPrice:${finalPrice}, discount:${discountAmount}, promo:${promoCode || 'none'}`);

        // Increment promo used_count
        if (promoData) {
            await db.from('promo_codes').update({ used_count: (promoData.used_count || 0) + 1 }).eq('id', promoData.id);
        }

        // Simpan ke audit log
        await db.from('license_audit_log').insert({
            license_key_id: null,
            action: 'web_order',
            machine_id: orderId,   // Pakasir pakai order_id kita sendiri
            ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown',
            details: {
                order_id: orderId,
                invoice_id: orderId,
                payment_method: 'pakasir',
                product_id,
                tier: product.tier,
                duration_days: product.duration,
                price: product.price,
                discount_amount: discountAmount,
                promo_code: promoCode || null,
                final_price: finalPrice,
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
            invoice_id: orderId,
            qr_image: qrImage,
            qris_string: qrisString,
            amount: finalAmount,
            base_price: product.price,
            final_price: finalPrice,
            discount_amount: discountAmount,
            promo_code: promoCode || null,
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
