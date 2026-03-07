/**
 * Promo Code API
 * 
 * PUBLIC:
 *   GET  /api/promo?code=HEMAT10&product_id=pro_30  → validasi kode & hitung diskon
 *
 * ADMIN (butuh x-admin-key):
 *   GET  /api/promo?admin=1         → list semua kode
 *   POST /api/promo                 → buat kode baru
 *   DELETE /api/promo?code=HEMAT10  → hapus kode
 */
const { getSupabase } = require('../lib/supabase');
const { handleCors, verifyAdmin, parseBody } = require('../lib/helpers');

const PRODUCTS = {
    pro_30: { name: 'Pro 30 Hari', price: 69000 },
    pro_90: { name: 'Pro 90 Hari', price: 129000 },
    pro_365: { name: 'Pro 365 Hari', price: 250000 },
};

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;

    const db = getSupabase();
    const query = req.query || {};

    // =============================================
    // ADMIN: List semua kode
    // =============================================
    if (req.method === 'GET' && query.admin === '1') {
        if (!verifyAdmin(req, res)) return;
        const { data, error } = await db
            .from('promo_codes')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ promos: data });
    }

    // =============================================
    // PUBLIC: Validasi kode
    // =============================================
    if (req.method === 'GET') {
        const { code, product_id } = query;
        if (!code) return res.status(400).json({ error: 'Missing code' });

        const { data: promo } = await db
            .from('promo_codes')
            .select('*')
            .eq('code', code.toUpperCase().trim())
            .single();

        if (!promo) return res.status(404).json({ valid: false, error: 'Kode promo tidak ditemukan' });
        if (!promo.active) return res.status(400).json({ valid: false, error: 'Kode promo sudah tidak aktif' });

        // Cek expired
        if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
            return res.status(400).json({ valid: false, error: 'Kode promo sudah expired' });
        }

        // Cek quota
        if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
            return res.status(400).json({ valid: false, error: 'Kuota kode promo sudah habis' });
        }

        // Cek product restriction
        if (promo.product_ids && promo.product_ids.length > 0 && product_id) {
            if (!promo.product_ids.includes(product_id)) {
                const allowed = promo.product_ids.map(p => PRODUCTS[p]?.name || p).join(', ');
                return res.status(400).json({ valid: false, error: `Kode hanya berlaku untuk: ${allowed}` });
            }
        }

        // Hitung diskon
        const product = PRODUCTS[product_id];
        let originalPrice = product?.price || 0;
        let discountAmount = 0;
        let finalPrice = originalPrice;

        if (promo.discount_type === 'percent') {
            discountAmount = Math.round(originalPrice * promo.discount_value / 100);
        } else {
            // flat
            discountAmount = promo.discount_value;
        }
        finalPrice = Math.max(1000, originalPrice - discountAmount); // min Rp1.000

        return res.json({
            valid: true,
            code: promo.code,
            description: promo.description,
            discount_type: promo.discount_type,   // 'percent' | 'flat'
            discount_value: promo.discount_value,
            discount_amount: discountAmount,
            original_price: originalPrice,
            final_price: finalPrice,
            uses_left: promo.max_uses !== null ? (promo.max_uses - promo.used_count) : null,
        });
    }

    // =============================================
    // ADMIN: Buat kode baru
    // =============================================
    if (req.method === 'POST') {
        if (!verifyAdmin(req, res)) return;
        const body = await parseBody(req);
        const {
            code,
            description = '',
            discount_type = 'percent',  // 'percent' | 'flat'
            discount_value,
            max_uses = null,
            expires_at = null,
            product_ids = null,  // null = semua produk, atau ['pro_30', 'pro_90']
        } = body;

        if (!code) return res.status(400).json({ error: 'code wajib diisi' });
        if (!discount_value || discount_value <= 0) return res.status(400).json({ error: 'discount_value harus > 0' });
        if (!['percent', 'flat'].includes(discount_type)) return res.status(400).json({ error: 'discount_type harus percent atau flat' });

        const cleanCode = code.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
        if (!cleanCode) return res.status(400).json({ error: 'Kode tidak valid' });

        const { data, error } = await db
            .from('promo_codes')
            .insert({
                code: cleanCode,
                description,
                discount_type,
                discount_value: parseFloat(discount_value),
                max_uses: max_uses ? parseInt(max_uses) : null,
                used_count: 0,
                expires_at: expires_at || null,
                product_ids: product_ids || null,
                active: true,
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') return res.status(409).json({ error: 'Kode sudah ada' });
            return res.status(500).json({ error: error.message });
        }

        return res.status(201).json({ message: 'Promo berhasil dibuat', promo: data });
    }

    // =============================================
    // ADMIN: Hapus / nonaktifkan kode
    // =============================================
    if (req.method === 'DELETE') {
        if (!verifyAdmin(req, res)) return;
        const { code, action } = query;
        if (!code) return res.status(400).json({ error: 'Missing code' });

        if (action === 'deactivate') {
            await db.from('promo_codes').update({ active: false }).eq('code', code.toUpperCase());
            return res.json({ message: `Promo ${code} dinonaktifkan` });
        }

        await db.from('promo_codes').delete().eq('code', code.toUpperCase());
        return res.json({ message: `Promo ${code} dihapus` });
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
