/**
 * ClipperSkuy Telegram Sales Bot
 * ========================================
 * Bot otomatis untuk jualan lisensi ClipperSkuy via Telegram.
 * - Katalog produk (Pro / Enterprise)
 * - Generate QRIS payment via Tokopay
 * - Auto-generate license key setelah bayar
 * - Auto-delivery license key ke buyer
 * - Admin panel untuk manage pesanan & stok
 * - Log transaksi ke channel
 * 
 * Integrasi langsung ke License Server ClipperSkuy.
 */

require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fetch = require('node-fetch');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ============ CONFIG ============
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim());
const LICENSE_SERVER = process.env.LICENSE_SERVER_URL || 'http://localhost:3000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const LOG_CHANNEL = process.env.LOG_CHANNEL_ID ? parseInt(process.env.LOG_CHANNEL_ID) : null;
const PAKASIR_SLUG = process.env.PAKASIR_SLUG || '';
const PAKASIR_API_KEY = process.env.PAKASIR_API_KEY || '';
const BAYARGG_API_KEY = process.env.BAYARGG_API_KEY || '';
// BAYARGG_METHOD: gopay_qris | qris_user | qris (default: gopay_qris)
const BAYARGG_METHOD = process.env.BAYARGG_METHOD || 'gopay_qris';
// Gunakan bayar.gg jika ada API key-nya, fallback ke Pakasir
const USE_BAYARGG = !!BAYARGG_API_KEY;
const SUPPORT_GROUP = process.env.SUPPORT_GROUP_LINK || 'https://t.me/+GANTI_DENGAN_LINK_GRUP';

// ============ DATABASE (JSON file) ============
const DB_FILE = path.join(__dirname, 'data', 'db.json');

function loadDB() {
    try {
        if (fs.existsSync(DB_FILE)) {
            return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
        }
    } catch (e) { console.error('DB load error:', e); }
    return { users: {}, orders: [], stats: { total_orders: 0, total_revenue: 0 }, discounts: {} };
}

function saveDB(db) {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

let db = loadDB();

// ============ PRODUCTS ============
const PRODUCTS = {
    pro_30: {
        id: 'pro_30', name: '⚡ ClipperSkuy Pro',
        desc: '30 Hari', tier: 'pro', duration: 30,
        price: parseInt(process.env.PRICE_PRO_30) || 69000,
        originalPrice: 80000,
        emoji: '⚡', features: [
            '✅ Unlimited Project & Export',
            '✅ 1080p Full HD',
            '✅ Face Tracking AI',
            '✅ Audio Enhancement',
            '✅ Batch Export',
            '✅ GPU Acceleration'
        ]
    },
    pro_90: {
        id: 'pro_90', name: '⚡ ClipperSkuy Pro',
        desc: '90 Hari (3 Bulan)', tier: 'pro', duration: 90,
        price: parseInt(process.env.PRICE_PRO_90) || 150000,
        originalPrice: 179000,
        emoji: '⚡', badge: '💰 HEMAT 16%'
    },
    pro_365: {
        id: 'pro_365', name: '⚡ ClipperSkuy Pro',
        desc: '365 Hari (1 Tahun)', tier: 'pro', duration: 365,
        price: parseInt(process.env.PRICE_PRO_365) || 250000,
        originalPrice: 599000,
        emoji: '⚡', badge: '🔥 HEMAT 58%'
    },
    enterprise_30: {
        id: 'enterprise_30', name: '👑 ClipperSkuy Enterprise',
        desc: '30 Hari', tier: 'enterprise', duration: 30,
        price: parseInt(process.env.PRICE_ENTERPRISE_30) || 150000,
        emoji: '👑'
    },
    enterprise_lifetime: {
        id: 'enterprise_lifetime', name: '👑 ClipperSkuy Enterprise',
        desc: 'Lifetime (Selamanya)', tier: 'enterprise', duration: 0,
        price: parseInt(process.env.PRICE_ENTERPRISE_LIFETIME) || 999000,
        emoji: '👑', badge: '♾️ LIFETIME'
    }
};

// ============ HELPERS ============
function isAdmin(userId) {
    return ADMIN_IDS.includes(String(userId));
}

// ============ DISCOUNT ============
// Returns the discount object if valid, or { error: 'reason' } if not
// Optional: pass productId to check product restriction
function getDiscount(code, productId = null) {
    if (!code || !db.discounts) return { error: 'tidak_valid' };
    const d = db.discounts[code.toUpperCase()];
    if (!d || !d.active) return { error: 'tidak_valid' };
    if (d.quota !== null && d.used >= d.quota) return { error: 'quota_habis', code, percent: d.percent };
    if (d.expires_at && new Date() > new Date(d.expires_at)) return { error: 'expired' };
    // Check product restriction
    if (productId && d.products && d.products.length > 0) {
        if (!d.products.includes(productId)) return { error: 'produk_tidak_sesuai', products: d.products };
    }
    return d; // valid discount
}

function isDiscountValid(result) {
    return result && !result.error;
}

function getDiscountErrorMsg(result, code) {
    if (!result || result.error === 'tidak_valid') return `❌ Kode promo <code>${code}</code> tidak ditemukan atau sudah tidak aktif.`;
    if (result.error === 'quota_habis') return `😔 <b>Maaf, kuota promo <code>${code}</code> sudah habis.</b>\n\nPromo ini sudah digunakan oleh semua yang berhak. Pantau terus promo berikutnya!`;
    if (result.error === 'expired') return `⏰ Kode promo <code>${code}</code> sudah expired.`;
    if (result.error === 'produk_tidak_sesuai') {
        const productNames = (result.products || []).map(pid => {
            const p = PRODUCTS[pid];
            return p ? `${p.name} (${p.desc})` : pid;
        }).join(', ');
        return `❌ Maaf, kode promo <code>${code}</code> <b>hanya berlaku untuk produk tertentu.</b>\n\n📦 Produk yang bisa pakai promo ini:\n<b>${productNames}</b>`;
    }
    return `❌ Kode promo <code>${code}</code> tidak valid.`;
}

function applyDiscount(price, code, productId = null) {
    const d = getDiscount(code, productId);
    if (!isDiscountValid(d)) return { finalPrice: price, discount: null, discountError: d };
    let discountAmount;
    if (d.type === 'amount') {
        // Flat rupiah — jangan sampai lebih dari harga
        discountAmount = Math.min(d.amount, price);
    } else {
        // Percent (default)
        discountAmount = Math.floor(price * d.percent / 100);
    }
    const finalPrice = Math.max(0, price - discountAmount);
    return { finalPrice, discount: d, discountAmount, discountError: null };
}

function useDiscount(code) {
    const d = db.discounts[code.toUpperCase()];
    if (d) { d.used++; saveDB(db); }
}

function formatPrice(price) {
    return 'Rp ' + price.toLocaleString('id-ID');
}

function generateOrderId() {
    return 'CS-' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();
}

async function generateLicenseKey(tier, durationDays) {
    try {
        const res = await fetch(`${LICENSE_SERVER}/api/admin/keys`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-key': ADMIN_API_KEY
            },
            body: JSON.stringify({
                tier,
                count: 1,
                duration_days: durationDays,
                notes: `Generated by Telebot`
            })
        });

        const data = await res.json();
        if (data.keys && data.keys.length > 0) {
            return data.keys[0].key;
        }
        return null;
    } catch (err) {
        console.error('Generate key error:', err);
        return null;
    }
}

async function sendLog(bot, text) {
    if (!LOG_CHANNEL) return;
    try {
        await bot.telegram.sendMessage(LOG_CHANNEL, text, { parse_mode: 'HTML' });
    } catch (e) { console.error('Log send error:', e.message); }
}

// ============ PAYMENT (bayar.gg) ============
async function createBayarGGPayment(orderId, amount, customerName) {
    if (!BAYARGG_API_KEY) return null;
    try {
        const body = {
            amount,
            description: `ClipperSkuy License - Order ${orderId}`,
            customer_name: customerName || 'Customer',
            payment_method: BAYARGG_METHOD
        };
        const res = await fetch('https://www.bayar.gg/api/create-payment.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': BAYARGG_API_KEY },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        console.log('bayar.gg create response:', JSON.stringify(data));
        if (data.success && data.data) {
            return {
                invoice_id: data.data.invoice_id,
                payment_url: data.data.payment_url,
                final_amount: data.data.final_amount,
                unique_code: data.data.unique_code,
                expires_at: data.data.expires_at
            };
        }
        console.log('bayar.gg failed:', JSON.stringify(data));
        return null;
    } catch (err) {
        console.error('bayar.gg create error:', err.message);
        return null;
    }
}

async function checkBayarGGStatus(invoiceId) {
    if (!BAYARGG_API_KEY || !invoiceId) return 'unknown';
    try {
        const res = await fetch(`https://www.bayar.gg/api/check-payment?invoice=${invoiceId}`, {
            headers: { 'X-API-Key': BAYARGG_API_KEY }
        });
        const data = await res.json();
        console.log('[BayarGG] check-payment raw response:', JSON.stringify(data));

        // bayar.gg bisa return { status: 'paid' } ATAU { data: { status: 'paid' } } ATAU { success, data: { ... } }
        const status =
            data.status ||
            data.data?.status ||
            (data.success && data.data ? data.data.status : null) ||
            'pending';

        console.log(`[BayarGG] invoice=${invoiceId} → status=${status}`);
        return status;
    } catch (err) {
        console.error('[BayarGG] status error:', err.message);
        return 'unknown';
    }
}

// ============ QRIS PAYMENT (Pakasir) — Legacy fallback ============
async function createPakasirQRIS(orderId, amount) {
    if (!PAKASIR_SLUG || !PAKASIR_API_KEY) return null;
    try {
        const res = await fetch('https://app.pakasir.com/api/transactioncreate/qris', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: PAKASIR_API_KEY,
                project: PAKASIR_SLUG,
                amount: amount,
                order_id: orderId
            })
        });
        const data = await res.json();
        console.log('Pakasir create response:', JSON.stringify(data));
        if (data.payment) return data.payment;
        return null;
    } catch (err) {
        console.error('Pakasir QRIS error:', err.message);
        return null;
    }
}

async function checkPakasirStatus(orderId, amount) {
    if (!PAKASIR_SLUG || !PAKASIR_API_KEY) return 'unknown';
    try {
        const url = `https://app.pakasir.com/api/transactiondetail?project=${PAKASIR_SLUG}&amount=${amount}&order_id=${orderId}&api_key=${PAKASIR_API_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        return data.transaction?.status || 'pending';
    } catch (err) {
        return 'unknown';
    }
}

async function cancelPakasirTransaction(orderId, amount) {
    if (!PAKASIR_SLUG || !PAKASIR_API_KEY) return;
    try {
        await fetch('https://app.pakasir.com/api/transactioncancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project: PAKASIR_SLUG, order_id: orderId, amount, api_key: PAKASIR_API_KEY })
        });
    } catch (err) { console.error('Pakasir cancel error:', err.message); }
}

// Simulate payment (Sandbox mode only)
async function simulatePakasirPayment(orderId, amount) {
    if (!PAKASIR_SLUG || !PAKASIR_API_KEY) return { success: false, error: 'No Pakasir credentials' };
    try {
        const res = await fetch('https://app.pakasir.com/api/paymentsimulation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project: PAKASIR_SLUG, order_id: orderId, amount, api_key: PAKASIR_API_KEY })
        });
        const data = await res.json();
        return { success: true, data };
    } catch (err) {
        return { success: false, error: err.message };
    }
}


// ============ INIT BOT ============
if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN not set in .env');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ============ /start ============
bot.start(async (ctx) => {
    const userId = String(ctx.from.id);
    const name = ctx.from.first_name || 'User';

    // Auto register
    if (!db.users[userId]) {
        db.users[userId] = {
            id: userId,
            name,
            username: ctx.from.username || '',
            registered_at: new Date().toISOString(),
            order_count: 0,
            total_spent: 0
        };
        saveDB(db);
    }

    const text = `
🤖 <b>ClipperSkuy — License Store</b>

Halo <b>${name}</b>! 👋
Selamat datang di toko lisensi resmi ClipperSkuy.

<b>⚡ ClipperSkuy</b> adalah AI Video Clip Generator yang mengubah video panjang jadi konten viral untuk TikTok, Reels & YouTube Shorts — 100% offline di PC kamu.

━━━━━━━━━━━━━━━━━━
📦 <b>Produk Tersedia:</b>

⚡ <b>Pro</b> — Rp69rb/bulan
    Face Tracking, Audio Enhancement, 1080p, Unlimited

👑 <b>Enterprise</b> — Hubungi Admin
    Semua fitur Pro + API + Branding + Lifetime
━━━━━━━━━━━━━━━━━━

Ketuk tombol di bawah untuk melihat produk:`;

    await ctx.replyWithHTML(text, Markup.inlineKeyboard([
        [Markup.button.callback('🛒 Lihat Produk', 'catalog')],
        [Markup.button.callback('📋 Pesanan Saya', 'my_orders'), Markup.button.callback('ℹ️ Tentang App', 'about')],
        [Markup.button.callback('📞 Hubungi Admin', 'contact'), Markup.button.callback('❓ Bantuan', 'help')]
    ]));
});

// ============ CATALOG ============
bot.action('catalog', async (ctx) => {
    await ctx.answerCbQuery();
    const text = `
🛒 <b>KATALOG PRODUK</b>
━━━━━━━━━━━━━━━━━━

Pilih paket yang kamu mau:

⚡ <b>ClipperSkuy Pro</b>
AI Video Clip Generator untuk kreator serius.
Face Tracking, Audio Enhancement, 1080p, Unlimited.

👑 <b>ClipperSkuy Enterprise</b>
Untuk agensi & tim produksi.
Semua fitur Pro + API + Custom Branding.

━━━━━━━━━━━━━━━━━━
Ketuk tier untuk lihat paket durasi:`;

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('⚡ Pro Plans', 'tier_pro')],
            [Markup.button.callback('👑 Enterprise Plans', 'tier_enterprise')],
            [Markup.button.callback('⬅️ Kembali', 'back_start')]
        ])
    });
});

// ============ TIER PRO ============
bot.action('tier_pro', async (ctx) => {
    await ctx.answerCbQuery();
    const p30 = PRODUCTS.pro_30;
    const p90 = PRODUCTS.pro_90;
    const p365 = PRODUCTS.pro_365;

    const text = `
⚡ <b>ClipperSkuy Pro Plans</b>
━━━━━━━━━━━━━━━━━━

${p30.features.join('\n')}

━━━━━━━━━━━━━━━━━━

💰 <b>Pilih Durasi:</b>

1️⃣ <b>30 Hari</b> — <s>${formatPrice(p30.originalPrice)}</s> ➜ <b>${formatPrice(p30.price)}</b>
2️⃣ <b>90 Hari</b> — <s>${formatPrice(p90.originalPrice)}</s> ➜ <b>${formatPrice(p90.price)}</b> ${p90.badge || ''}
3️⃣ <b>365 Hari</b> — <s>${formatPrice(p365.originalPrice)}</s> ➜ <b>${formatPrice(p365.price)}</b> ${p365.badge || ''}

━━━━━━━━━━━━━━━━━━
🔑 License key dikirim otomatis setelah pembayaran.`;

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback(`🛒 30 Hari — ${formatPrice(p30.price)}`, 'buy_pro_30')],
            [Markup.button.callback(`🛒 90 Hari — ${formatPrice(p90.price)}`, 'buy_pro_90')],
            [Markup.button.callback(`🛒 365 Hari — ${formatPrice(p365.price)}`, 'buy_pro_365')],
            [Markup.button.callback('⬅️ Kembali', 'catalog')]
        ])
    });
});

// ============ TIER ENTERPRISE ============
bot.action('tier_enterprise', async (ctx) => {
    await ctx.answerCbQuery();

    const text = `
👑 <b>ClipperSkuy Enterprise</b>
━━━━━━━━━━━━━━━━━━

✅ Semua fitur Pro
✅ API Access
✅ Custom Branding
✅ Multi-device license
✅ White-label ready
✅ Priority Support
✅ Early access features

━━━━━━━━━━━━━━━━━━

💰 <b>Harga:</b> Hubungi Admin

Untuk paket Enterprise, silakan hubungi admin untuk konsultasi harga & kebutuhan custom.`;

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📞 Hubungi Admin', 'contact')],
            [Markup.button.url('💬 WhatsApp', 'https://wa.me/628151616315')],
            [Markup.button.callback('⬅️ Kembali', 'catalog')]
        ])
    });
});

// ============ BUY FLOW ============
async function handleBuy(ctx, productId) {
    await ctx.answerCbQuery();
    const product = PRODUCTS[productId];
    if (!product) return ctx.reply('❌ Produk tidak ditemukan.');

    const orderId = generateOrderId();
    const userId = String(ctx.from.id);
    const name = ctx.from.first_name || 'User';

    // Check if user has a pending promo code
    const pendingPromo = db.users[userId]?.pending_promo || null;
    const { finalPrice, discount, discountAmount, discountError } = applyDiscount(product.price, pendingPromo, productId);

    let promoLine = '';
    if (discount) {
        const diskonDesc = discount.type === 'amount'
            ? `potongan ${formatPrice(discountAmount)}`
            : `-${discount.percent}% = -${formatPrice(discountAmount)}`;
        promoLine = `\n🏷️ <b>Kode Promo:</b> <code>${pendingPromo.toUpperCase()}</code> (${diskonDesc})`;
    } else if (pendingPromo && discountError?.error === 'produk_tidak_sesuai') {
        promoLine = `\n⚠️ <i>Kode <code>${pendingPromo}</code> tidak berlaku untuk produk ini.</i>`;
    }

    const text = `
🧾 <b>KONFIRMASI PESANAN</b>
━━━━━━━━━━━━━━━━━━

📦 <b>Produk:</b> ${product.name}
⏱ <b>Durasi:</b> ${product.desc}
💰 <b>Harga Normal:</b> ${formatPrice(product.price)}${promoLine}
💳 <b>Total Bayar:</b> <b>${formatPrice(finalPrice)}</b>
🆔 <b>Order ID:</b> <code>${orderId}</code>

━━━━━━━━━━━━━━━━━━

Ketuk <b>"💳 Bayar Sekarang"</b> untuk mendapatkan kode QRIS pembayaran.

⚠️ Pembayaran otomatis expired dalam <b>5 menit</b>.
🔑 License key akan dikirim otomatis setelah pembayaran terverifikasi.`;

    // Save pending order
    const order = {
        id: orderId,
        user_id: userId,
        user_name: name,
        username: ctx.from.username || '',
        product_id: productId,
        product_name: `${product.name} — ${product.desc}`,
        tier: product.tier,
        duration: product.duration,
        original_price: product.price,
        price: finalPrice,
        discount_code: discount ? pendingPromo.toUpperCase() : null,
        discount_percent: discount ? discount.percent : 0,
        status: 'pending',
        license_key: null,
        created_at: new Date().toISOString(),
        paid_at: null
    };

    db.orders.push(order);
    saveDB(db);

    const buttons = [
        [Markup.button.callback('💳 Bayar Sekarang (QRIS)', `pay_${orderId}`)],
        [Markup.button.callback('🏷️ Ganti Kode Promo', `promo_change_${productId}`), Markup.button.callback('❌ Batalkan', `cancel_${orderId}`)],
        [Markup.button.callback('⬅️ Kembali', 'catalog')]
    ];

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
    });
}

// Register buy handlers
Object.keys(PRODUCTS).forEach(pid => {
    bot.action(`buy_${pid}`, (ctx) => handleBuy(ctx, pid));
});

// ============ PAYMENT (Pakasir Dynamic QRIS + Static Fallback) ============
const QRIS_IMAGE = path.join(__dirname, 'qris.jpg');

bot.action(/^pay_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('Generating QRIS...');
    const orderId = ctx.match[1];
    const order = db.orders.find(o => o.id === orderId);

    if (!order) return ctx.reply('❌ Order tidak ditemukan.');
    if (order.status === 'paid') return ctx.reply('✅ Order ini sudah dibayar.');

    const customerName = ctx.from.first_name || 'Customer';

    // ====== bayar.gg (priority) ======
    if (USE_BAYARGG) {
        const payment = await createBayarGGPayment(orderId, order.price, customerName);

        if (payment) {
            const finalAmount = payment.final_amount || order.price;
            const uniqueCode = payment.unique_code || 0;
            const expiredAt = payment.expires_at
                ? new Date(payment.expires_at).toLocaleString('id-ID')
                : '15 menit';

            const text = `
💳 <b>PEMBAYARAN GoPay</b>
━━━━━━━━━━━━━━━━━━

🆔 <b>Order:</b> <code>${orderId}</code>
📦 <b>Produk:</b> ${order.product_name}
💰 <b>Harga:</b> ${formatPrice(order.price)}
🔢 <b>Kode unik:</b> +${uniqueCode}
💳 <b>Total bayar: ${formatPrice(finalAmount)}</b>

📱 Tap <b>"Bayar Sekarang"</b> di bawah
→ Pilih <b>GoPay</b> → Nominal otomatis terisi → Konfirmasi
🔑 License key otomatis dikirim setelah bayar ✅

⏱ Expired: <b>${expiredAt}</b>`;

            await ctx.editMessageText(text, { parse_mode: 'HTML' });

            const buttons = [];
            if (payment.payment_url) {
                buttons.push([Markup.button.url('💳 Bayar Sekarang (GoPay)', payment.payment_url)]);
            }
            buttons.push([Markup.button.callback('🔄 Cek Status Bayar', `check_${orderId}`)]);
            buttons.push([Markup.button.callback('❌ Batalkan', `cancel_${orderId}`)]);

            await ctx.reply('⏳ Bot otomatis cek pembayaran tiap 15 detik.',
                Markup.inlineKeyboard(buttons)
            );

            order.status = 'waiting_payment';
            order.payment_method = 'bayargg';
            order.bayargg_invoice = payment.invoice_id;
            order.final_amount = finalAmount;
            saveDB(db);
            startPaymentPolling(ctx, orderId);
            return;
        }
    }

    // ====== Pakasir (fallback) ======
    const pakasir = await createPakasirQRIS(orderId, order.price);

    if (pakasir && pakasir.payment_number) {
        const totalPayment = pakasir.total_payment || order.price;
        const expiredAt = pakasir.expired_at ? new Date(pakasir.expired_at).toLocaleString('id-ID') : '15 menit';

        const text = `
💳 <b>PEMBAYARAN QRIS</b>
━━━━━━━━━━━━━━━━━━

🆔 <b>Order:</b> <code>${orderId}</code>
📦 <b>Produk:</b> ${order.product_name}
💰 <b>Total:</b> <b>${formatPrice(totalPayment)}</b>

Scan QRIS di bawah pakai e-wallet / m-banking:
(GoPay, OVO, Dana, ShopeePay, LinkAja, dll)

⏱ Expired: <b>${expiredAt}</b>
✅ Nominal sudah otomatis terisi!
🔑 License key otomatis dikirim setelah bayar.`;

        await ctx.editMessageText(text, { parse_mode: 'HTML' });

        const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(pakasir.payment_number)}`;
        await ctx.replyWithPhoto(qrImageUrl, {
            caption: `💳 Scan & Bayar <b>${formatPrice(totalPayment)}</b>\n🆔 Order: <code>${orderId}</code>\n\n✅ Nominal otomatis terisi — tinggal bayar!`,
            parse_mode: 'HTML'
        });

        await ctx.reply('⏳ Bot akan otomatis cek pembayaran...', Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Cek Status Bayar', `check_${orderId}`)],
            [Markup.button.callback('❌ Batalkan', `cancel_${orderId}`)]
        ]));

        order.status = 'waiting_payment';
        order.payment_method = 'pakasir';
        saveDB(db);
        startPaymentPolling(ctx, orderId);

    } else {
        // Fallback: static QRIS
        const text = `
💳 <b>PEMBAYARAN QRIS</b>
━━━━━━━━━━━━━━━━━━

🆔 <b>Order:</b> <code>${orderId}</code>
📦 <b>Produk:</b> ${order.product_name}
💰 <b>Total:</b> <b>${formatPrice(order.price)}</b>

━━━━━━━━━━━━━━━━━━
<b>Cara Bayar:</b>
1️⃣ Scan QRIS di bawah ini
2️⃣ Masukkan nominal <b>${formatPrice(order.price)}</b>
3️⃣ Screenshot bukti bayar
4️⃣ Kirim screenshot ke bot ini

📱 Bisa pakai: GoPay, OVO, Dana, ShopeePay, LinkAja, dll.
⚠️ <i>Pastikan nominal tepat!</i>`;

        await ctx.editMessageText(text, { parse_mode: 'HTML' });

        if (fs.existsSync(QRIS_IMAGE)) {
            await ctx.replyWithPhoto(
                { source: QRIS_IMAGE },
                {
                    caption: `💳 Scan & Bayar <b>${formatPrice(order.price)}</b>\n🆔 Order: <code>${orderId}</code>\n\n📸 Setelah bayar, kirim screenshot ke chat ini.`,
                    parse_mode: 'HTML'
                }
            );
        } else {
            await ctx.reply(`⚠️ QRIS tidak tersedia. Hubungi admin.\nOrder ID: ${orderId}`,
                Markup.inlineKeyboard([[Markup.button.callback('📞 Hubungi Admin', 'contact')]]));
            return;
        }

        order.status = 'waiting_proof';
        order.payment_method = 'static_qris';
        db.users[String(ctx.from.id)] = db.users[String(ctx.from.id)] || { id: String(ctx.from.id), name: ctx.from.first_name };
        db.users[String(ctx.from.id)].active_order = orderId;
        saveDB(db);

        await ctx.reply('📸 Kirim screenshot bukti bayar sebagai foto 👇', Markup.inlineKeyboard([
            [Markup.button.callback('❌ Batalkan Order', `cancel_${orderId}`)]
        ]));
    }
});

// ============ PAYMENT POLLING (Auto-Check) ============
const activePolls = new Set(); // track active order IDs to prevent double-polling

async function startPaymentPolling(ctx, orderId) {
    if (activePolls.has(orderId)) {
        console.log(`[Poll] already polling ${orderId}, skip`);
        return;
    }
    activePolls.add(orderId);

    let attempts = 0;
    const maxAttempts = 40; // 40 x 15s = 10 menit

    const interval = setInterval(async () => {
        attempts++;
        const order = db.orders.find(o => o.id === orderId);
        if (!order || order.status === 'paid' || order.status === 'cancelled') {
            clearInterval(interval);
            activePolls.delete(orderId);
            return;
        }

        if (attempts > maxAttempts) {
            clearInterval(interval);
            activePolls.delete(orderId);
            if (order.status !== 'paid') {
                order.status = 'expired';
                saveDB(db);
                try {
                    await ctx.telegram.sendMessage(order.user_id,
                        `⏱ <b>Order ${orderId} expired.</b>\nBuat order baru.`,
                        { parse_mode: 'HTML' }
                    );
                } catch (e) { }
            }
            return;
        }

        // Cek status sesuai metode
        let isPaid = false;
        if (order.payment_method === 'bayargg' && order.bayargg_invoice) {
            const status = await checkBayarGGStatus(order.bayargg_invoice);
            // bayar.gg: paid | settlement | success semua dianggap lunas
            isPaid = ['paid', 'settlement', 'success', 'completed'].includes(status?.toLowerCase());
        } else {
            const status = await checkPakasirStatus(orderId, order.price);
            isPaid = (status === 'completed');
        }

        if (isPaid) {
            clearInterval(interval);
            activePolls.delete(orderId);
            await processSuccessfulPayment(ctx, orderId);
        }
    }, 15000);
}

// ============ POLLING RECOVERY — restart polling untuk order yang masih waiting saat bot restart ============
async function recoverPendingPolls(bot) {
    const pendingOrders = db.orders.filter(o =>
        (o.status === 'waiting_payment') &&
        o.payment_method === 'bayargg' &&
        o.bayargg_invoice
    );

    if (pendingOrders.length === 0) return;
    console.log(`[Recovery] ${pendingOrders.length} pending bayargg order(s) ditemukan, restart polling...`);

    for (const order of pendingOrders) {
        // Cek dulu statusnya — mungkin sudah bayar saat bot mati
        const status = await checkBayarGGStatus(order.bayargg_invoice);
        const isPaid = ['paid', 'settlement', 'success', 'completed'].includes(status?.toLowerCase());

        if (isPaid) {
            console.log(`[Recovery] Order ${order.id} ternyata sudah PAID! Processing...`);
            // Buat fake ctx untuk processSuccessfulPayment
            const fakeCtx = { telegram: bot.telegram };
            await processSuccessfulPayment(fakeCtx, order.id);
            // Notify user
            try {
                await bot.telegram.sendMessage(order.user_id,
                    `✅ <b>Pembayaran kamu sudah terverifikasi!</b>\n\nMaaf ada keterlambatan notifikasi — license key sudah dikirim.`,
                    { parse_mode: 'HTML' }
                );
            } catch (e) { }
        } else if (status === 'expired' || status === 'cancelled') {
            console.log(`[Recovery] Order ${order.id} expired/cancelled, update status.`);
            order.status = status;
            saveDB(db);
        } else {
            // Masih pending — restart polling
            console.log(`[Recovery] Order ${order.id} masih pending, restart polling.`);
            const fakeCtx = { telegram: bot.telegram };
            startPaymentPolling(fakeCtx, order.id);
        }
    }
}

// ============ CHECK STATUS (Manual) ============
bot.action(/^check_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('Checking...');
    const orderId = ctx.match[1];
    const order = db.orders.find(o => o.id === orderId);

    if (!order) return ctx.reply('❌ Order tidak ditemukan.');
    if (order.status === 'paid') return ctx.reply('✅ Sudah dibayar! License key sudah dikirim.');

    let isPaid = false;
    if (order.payment_method === 'bayargg' && order.bayargg_invoice) {
        const status = await checkBayarGGStatus(order.bayargg_invoice);
        isPaid = (status === 'paid');
    } else {
        const status = await checkPakasirStatus(orderId, order.price);
        isPaid = (status === 'completed');
    }

    if (isPaid) {
        await processSuccessfulPayment(ctx, orderId);
    } else {
        await ctx.reply(`⏳ Pembayaran belum terdeteksi.\n\nBot terus cek otomatis tiap 15 detik.`, Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Cek Lagi', `check_${orderId}`)],
            [Markup.button.callback('📞 Hubungi Admin', 'contact')]
        ]));
    }
});

// ============ RECEIVE PROOF (Static QRIS fallback) ============
bot.on('photo', async (ctx) => {
    const userId = String(ctx.from.id);
    const user = db.users[userId];
    if (!user || !user.active_order) return;

    const orderId = user.active_order;
    const order = db.orders.find(o => o.id === orderId);
    if (!order || order.status !== 'waiting_proof') return;

    const photo = ctx.message.photo[ctx.message.photo.length - 1];

    order.status = 'pending_confirm';
    order.proof_photo_id = photo.file_id;
    user.active_order = null;
    saveDB(db);

    await ctx.reply(
        `✅ <b>Bukti bayar diterima!</b>\n\n🆔 Order: <code>${orderId}</code>\n📦 ${order.product_name}\n💰 ${formatPrice(order.price)}\n\n⏳ Menunggu konfirmasi admin.\n<i>Biasanya 1-15 menit.</i>`,
        { parse_mode: 'HTML' }
    );

    for (const adminId of ADMIN_IDS) {
        try {
            await ctx.telegram.sendPhoto(adminId, photo.file_id, {
                caption: `🔔 <b>PEMBAYARAN MASUK!</b>\n━━━━━━━━━━━━━━━━━━\n🆔 <code>${orderId}</code>\n👤 ${order.user_name} (@${order.username || '-'})\n📦 ${order.product_name}\n💰 <b>${formatPrice(order.price)}</b>\n━━━━━━━━━━━━━━━━━━`,
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('✅ Konfirmasi & Kirim Key', `confirm_${orderId}`)],
                    [Markup.button.callback('❌ Tolak', `reject_${orderId}`)]
                ])
            });
        } catch (e) { }
    }
});

// ============ ADMIN CONFIRM ============
bot.action(/^confirm_(.+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Not admin');
    await ctx.answerCbQuery('Processing...');
    const orderId = ctx.match[1];
    const order = db.orders.find(o => o.id === orderId);
    if (!order) return ctx.reply('❌ Order tidak ditemukan.');
    if (order.status === 'paid') return ctx.reply('✅ Sudah dikonfirmasi.');
    await processSuccessfulPayment(ctx, orderId);
    await ctx.editMessageCaption(
        `✅ <b>DIKONFIRMASI</b>\n🆔 ${orderId}\n👤 ${order.user_name}\n📦 ${order.product_name}\n💰 ${formatPrice(order.price)}\n🔑 <code>${order.license_key || '-'}</code>`,
        { parse_mode: 'HTML' }
    );
});

// ============ ADMIN MANUAL KONFIRMASI ============
bot.command('konfirmasi', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Bukan admin.');
    const parts = ctx.message.text.split(' ');
    if (parts.length < 2) return ctx.reply('❌ Format: /konfirmasi ORDER_ID\nContoh: /konfirmasi CS-MM97SULU9542');

    const orderId = parts[1].trim();
    const order = db.orders.find(o => o.id === orderId);
    if (!order) return ctx.reply(`❌ Order <code>${orderId}</code> tidak ditemukan.`, { parse_mode: 'HTML' });
    if (order.status === 'paid') return ctx.reply(`✅ Order <code>${orderId}</code> sudah dikonfirmasi sebelumnya.`, { parse_mode: 'HTML' });

    await processSuccessfulPayment(ctx, orderId);
    await ctx.reply(
        `✅ <b>DIKONFIRMASI MANUAL</b>\n🆔 ${orderId}\n👤 ${order.user_name}\n📦 ${order.product_name}\n💰 ${formatPrice(order.price)}\n🔑 <code>${order.license_key || '-'}</code>`,
        { parse_mode: 'HTML' }
    );
});

// ============ ADMIN REJECT ============
bot.action(/^reject_(.+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Not admin');
    await ctx.answerCbQuery('Rejected');
    const orderId = ctx.match[1];
    const order = db.orders.find(o => o.id === orderId);
    if (!order) return;
    order.status = 'rejected';
    saveDB(db);
    try {
        await ctx.telegram.sendMessage(order.user_id,
            `❌ <b>Pembayaran Ditolak</b>\n🆔 <code>${orderId}</code>\nHubungi admin jika ada kesalahan.`,
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📞 Hubungi Admin', 'contact')]]) }
        );
    } catch (e) { }
    await ctx.editMessageCaption(`❌ <b>DITOLAK</b> | ${orderId} | ${order.user_name}`, { parse_mode: 'HTML' });
});









// ============ SUCCESSFUL PAYMENT ============
async function processSuccessfulPayment(ctx, orderId) {
    const order = db.orders.find(o => o.id === orderId);
    if (!order || order.status === 'paid') return;

    // Generate license key via License Server
    const licenseKey = await generateLicenseKey(order.tier, order.duration);

    if (!licenseKey) {
        await ctx.telegram.sendMessage(order.user_id,
            `⚠️ Pembayaran diterima untuk order <code>${orderId}</code>, tapi license key gagal digenerate. Admin akan segera memproses manual.\n\nMohon tunggu atau hubungi admin.`,
            { parse_mode: 'HTML' }
        );
        // Notify admin
        for (const adminId of ADMIN_IDS) {
            try {
                await ctx.telegram.sendMessage(adminId,
                    `🚨 <b>ALERT: License key generation failed!</b>\nOrder: ${orderId}\nUser: ${order.user_name} (@${order.username})\nProduk: ${order.product_name}\nHarga: ${formatPrice(order.price)}\n\n⚠️ Manual key generation required!`,
                    { parse_mode: 'HTML' }
                );
            } catch (e) { }
        }
        return;
    }

    // Update order
    order.status = 'paid';
    order.license_key = licenseKey;
    order.paid_at = new Date().toISOString();

    // Update user stats
    const user = db.users[order.user_id];
    if (user) {
        user.order_count = (user.order_count || 0) + 1;
        user.total_spent = (user.total_spent || 0) + order.price;
        user.pending_promo = null; // Clear promo after used
    }

    // Reduce discount quota
    if (order.discount_code) {
        useDiscount(order.discount_code);
    }

    // Update global stats
    db.stats.total_orders++;
    db.stats.total_revenue += order.price;
    saveDB(db);

    // Send license key to user
    const successMsg = `
🎉 <b>PEMBAYARAN BERHASIL!</b>
━━━━━━━━━━━━━━━━━━

📦 <b>Produk:</b> ${order.product_name}
🆔 <b>Order:</b> <code>${orderId}</code>
💰 <b>Dibayar:</b> ${formatPrice(order.price)}

━━━━━━━━━━━━━━━━━━
🔑 <b>LICENSE KEY KAMU:</b>

<code>${licenseKey}</code>

━━━━━━━━━━━━━━━━━━

📋 <b>Cara Aktivasi:</b>
1. Buka ClipperSkuy di PC
2. Buka menu <b>Settings → License</b>
3. Paste license key di atas
4. Klik <b>"Activate License"</b>
5. Selesai! Semua fitur premium aktif 🎉

⚠️ <i>1 key = 1 PC. Simpan baik-baik, jangan dibagikan.</i>

Terimakasih sudah berbelanja! 🙏

━━━━━━━━━━━━━━━━━━
👥 <b>Join Grup Support Premium:</b>
${SUPPORT_GROUP}

Dapatkan bantuan, tips & update eksklusif!`;

    try {
        await ctx.telegram.sendMessage(order.user_id, successMsg, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.url('👥 Join Grup Support', SUPPORT_GROUP)],
                [Markup.button.callback('🛒 Beli Lagi', 'catalog')]
            ])
        });
    } catch (e) { console.error('Send key error:', e); }

    // Send log
    await sendLog(bot, `
💰 <b>TRANSAKSI BERHASIL</b>
━━━━━━━━━━━
🆔 Order: <code>${orderId}</code>
👤 User: ${order.user_name} (@${order.username || '-'}) [<code>${order.user_id}</code>]
📦 Produk: ${order.product_name}
💰 Harga: ${formatPrice(order.price)}
🔑 Key: <code>${licenseKey}</code>
🕐 Waktu: ${new Date().toLocaleString('id-ID')}
━━━━━━━━━━━`);
}

// ============ CANCEL ============
bot.action(/^cancel_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('Dibatalkan');
    const orderId = ctx.match[1];
    const order = db.orders.find(o => o.id === orderId);
    if (order && ['pending', 'waiting_payment', 'waiting_proof'].includes(order.status)) {
        // Cancel on Pakasir if it was a dynamic QRIS payment
        if (order.payment_method === 'pakasir') {
            await cancelPakasirTransaction(orderId, order.price);
        }
        order.status = 'cancelled';
        saveDB(db);
    }
    await ctx.editMessageText(`❌ Order <code>${orderId}</code> dibatalkan.`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🛒 Lihat Produk', 'catalog')],
            [Markup.button.callback('⬅️ Menu Utama', 'back_start')]
        ])
    });
});

// ============ MY ORDERS ============
bot.action('my_orders', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = String(ctx.from.id);
    const userOrders = db.orders.filter(o => o.user_id === userId && o.status === 'paid').slice(-5);

    if (userOrders.length === 0) {
        await ctx.editMessageText(
            '📋 <b>Pesanan Saya</b>\n\nBelum ada pesanan. Yuk beli lisensi pertama kamu! 🛒',
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🛒 Lihat Produk', 'catalog')]]) }
        );
        return;
    }

    let text = '📋 <b>PESANAN SAYA</b> (5 terakhir)\n━━━━━━━━━━━━━━━━━━\n\n';
    for (const o of userOrders) {
        text += `🆔 <code>${o.id}</code>\n`;
        text += `📦 ${o.product_name}\n`;
        text += `💰 ${formatPrice(o.price)}\n`;
        text += `🔑 <code>${o.license_key}</code>\n`;
        text += `🕐 ${new Date(o.paid_at).toLocaleDateString('id-ID')}\n\n`;
    }

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🛒 Beli Lagi', 'catalog')],
            [Markup.button.callback('⬅️ Menu Utama', 'back_start')]
        ])
    });
});

// ============ ABOUT ============
bot.action('about', async (ctx) => {
    await ctx.answerCbQuery();
    const text = `
ℹ️ <b>TENTANG CLIPPERSKUY</b>
━━━━━━━━━━━━━━━━━━

<b>⚡ ClipperSkuy</b> — AI Video Clip Generator

Ubah video panjang jadi konten viral untuk TikTok, Reels & YouTube Shorts — otomatis dengan AI! 

🧠 AI Clip Detection + Viral Score
💬 Auto Subtitle (Whisper AI)
🎯 Face Tracking & Reframing
🎙️ Podcast Mode (Split Screen)
🔇 Audio Enhancement
📊 Progress Bar & Hook Text
🎬 Auto B-Roll (Pexels)
📱 Multi-Platform Export
🖥️ 100% Offline & Private

━━━━━━━━━━━━━━━━━━
🔗 <b>Website:</b> clipperskuy.my.id
📖 <b>Panduan:</b> clipperskuy.my.id/guide

💡 <i>Trial 7 hari gratis — download sekarang!</i>`;

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🛒 Lihat Produk', 'catalog')],
            [Markup.button.callback('⬅️ Menu Utama', 'back_start')]
        ])
    });
});

// ============ CONTACT ============
bot.action('contact', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
        `📞 <b>HUBUNGI ADMIN</b>\n━━━━━━━━━━━━━━━━━━\n\nHubungi admin untuk:\n• Custom order / Enterprise\n• Kendala pembayaran\n• Bantuan teknis\n• Reset aktivasi license\n\n💬 <b>WhatsApp:</b> wa.me/628151616315\n📱 <b>Telegram:</b> @skuysdazen\n\n<i>Respon dalam max 1x24 jam (biasanya lebih cepat).</i>`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.url('💬 WhatsApp', 'https://wa.me/628151616315')],
                [Markup.button.callback('⬅️ Menu Utama', 'back_start')]
            ])
        }
    );
});

// ============ HELP ============
bot.action('help', async (ctx) => {
    await ctx.answerCbQuery();
    const text = `
❓ <b>BANTUAN</b>
━━━━━━━━━━━━━━━━━━

<b>Cara Order:</b>
1. Ketuk "🛒 Lihat Produk"
2. Pilih tier (Pro / Enterprise)
3. Pilih durasi
4. Ketuk "💳 Bayar Sekarang"
5. Scan QRIS & bayar
6. License key otomatis dikirim! 🎉

<b>Cara Aktivasi Key:</b>
1. Buka ClipperSkuy di PC
2. Menu Settings → License
3. Paste license key
4. Klik "Activate License"

<b>Command:</b>
/start — Menu utama
/catalog — Lihat produk
/myorders — Pesanan saya
/help — Bantuan

<b>FAQ:</b>
• 1 key = 1 PC (terikat Machine ID)
• Mau pindah PC? Hubungi admin
• Key expired? Beli key baru
• Refund? Hubungi admin`;

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Menu Utama', 'back_start')]])
    });
});

// ============ BACK TO START ============
bot.action('back_start', async (ctx) => {
    await ctx.answerCbQuery();
    const name = ctx.from.first_name || 'User';
    const text = `
🤖 <b>ClipperSkuy — License Store</b>

Halo <b>${name}</b>! 👋
Ketuk tombol di bawah:`;

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🛒 Lihat Produk', 'catalog')],
            [Markup.button.callback('📋 Pesanan Saya', 'my_orders'), Markup.button.callback('ℹ️ Tentang App', 'about')],
            [Markup.button.callback('📞 Hubungi Admin', 'contact'), Markup.button.callback('❓ Bantuan', 'help')]
        ])
    });
});

// ============ SHORTCUT COMMANDS ============
bot.command('catalog', (ctx) => {
    ctx.reply('🛒 <b>Pilih Kategori:</b>', {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('⚡ Pro Plans', 'tier_pro')],
            [Markup.button.callback('👑 Enterprise Plans', 'tier_enterprise')]
        ])
    });
});

bot.command('myorders', (ctx) => {
    const userId = String(ctx.from.id);
    const userOrders = db.orders.filter(o => o.user_id === userId && o.status === 'paid').slice(-5);
    if (userOrders.length === 0) {
        return ctx.reply('📋 Belum ada pesanan.');
    }
    let text = '📋 <b>PESANAN SAYA</b>\n\n';
    for (const o of userOrders) {
        text += `🆔 <code>${o.id}</code> — ${o.product_name}\n🔑 <code>${o.license_key}</code>\n\n`;
    }
    ctx.replyWithHTML(text);
});

bot.command('help', (ctx) => {
    ctx.reply('❓ Ketuk bantuan:', Markup.inlineKeyboard([
        [Markup.button.callback('❓ Bantuan', 'help')]
    ]));
});

// ============ ADMIN COMMANDS ============

// /admin — Admin Panel
bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const totalOrders = db.orders.filter(o => o.status === 'paid').length;
    const pendingOrders = db.orders.filter(o => o.status === 'pending').length;
    const totalRevenue = db.orders.filter(o => o.status === 'paid').reduce((s, o) => s + o.price, 0);
    const totalUsers = Object.keys(db.users).length;

    const text = `
🔧 <b>ADMIN PANEL</b>
━━━━━━━━━━━━━━━━━━

📊 <b>Statistik:</b>
👥 Total Users: <b>${totalUsers}</b>
🛒 Total Orders: <b>${totalOrders}</b>
⏳ Pending: <b>${pendingOrders}</b>
💰 Revenue: <b>${formatPrice(totalRevenue)}</b>

━━━━━━━━━━━━━━━━━━`;

    await ctx.replyWithHTML(text, Markup.inlineKeyboard([
        [Markup.button.callback('📊 Stats Detail', 'admin_stats')],
        [Markup.button.callback('📋 Recent Orders', 'admin_orders')],
        [Markup.button.callback('🔑 Generate Key Manual', 'admin_genkey')],
        [Markup.button.callback('📢 Broadcast', 'admin_broadcast')],
        [Markup.button.callback('👥 List Users', 'admin_users')]
    ]));
});

// Admin: Stats
bot.action('admin_stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Not admin');
    await ctx.answerCbQuery();

    const paid = db.orders.filter(o => o.status === 'paid');
    const today = new Date().toISOString().split('T')[0];
    const todayOrders = paid.filter(o => o.paid_at && o.paid_at.startsWith(today));
    const todayRevenue = todayOrders.reduce((s, o) => s + o.price, 0);
    const proCount = paid.filter(o => o.tier === 'pro').length;
    const entCount = paid.filter(o => o.tier === 'enterprise').length;

    const text = `
📊 <b>STATISTIK DETAIL</b>
━━━━━━━━━━━━━━━━━━

📅 <b>Hari Ini (${today}):</b>
🛒 Orders: ${todayOrders.length}
💰 Revenue: ${formatPrice(todayRevenue)}

📈 <b>Total:</b>
🛒 Total Orders: ${paid.length}
💰 Total Revenue: ${formatPrice(paid.reduce((s, o) => s + o.price, 0))}
⚡ Pro Sold: ${proCount}
👑 Enterprise Sold: ${entCount}
👥 Total Users: ${Object.keys(db.users).length}`;

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Admin Panel', 'admin_back')]])
    });
});

// Admin: Recent Orders
bot.action('admin_orders', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Not admin');
    await ctx.answerCbQuery();

    const recent = db.orders.filter(o => o.status === 'paid').slice(-10).reverse();
    let text = '📋 <b>RECENT ORDERS</b> (10 terakhir)\n━━━━━━━━━━━━━━━━━━\n\n';

    if (recent.length === 0) {
        text += 'Belum ada order.';
    } else {
        for (const o of recent) {
            text += `🆔 <code>${o.id}</code>\n`;
            text += `👤 ${o.user_name} | 📦 ${o.product_name}\n`;
            text += `💰 ${formatPrice(o.price)} | 🔑 <code>${o.license_key}</code>\n\n`;
        }
    }

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Admin Panel', 'admin_back')]])
    });
});

// Admin: Generate Key
bot.action('admin_genkey', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Not admin');
    await ctx.answerCbQuery();

    await ctx.editMessageText(
        '🔑 <b>Generate Key Manual</b>\n\nPilih tier dan durasi:',
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('⚡ Pro 30 Hari', 'gen_pro_30'), Markup.button.callback('⚡ Pro 90 Hari', 'gen_pro_90')],
                [Markup.button.callback('⚡ Pro 365 Hari', 'gen_pro_365'), Markup.button.callback('⚡ Pro Lifetime', 'gen_pro_0')],
                [Markup.button.callback('👑 Ent 30 Hari', 'gen_enterprise_30'), Markup.button.callback('👑 Ent Lifetime', 'gen_enterprise_0')],
                [Markup.button.callback('⬅️ Admin Panel', 'admin_back')]
            ])
        }
    );
});

// Admin: Gen Key handlers
bot.action(/^gen_(.+)_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Not admin');
    await ctx.answerCbQuery('Generating...');

    const tier = ctx.match[1];
    const duration = parseInt(ctx.match[2]);

    const key = await generateLicenseKey(tier, duration);
    if (key) {
        await ctx.editMessageText(
            `✅ <b>Key Generated!</b>\n\n🔑 <code>${key}</code>\n\nTier: ${tier}\nDurasi: ${duration === 0 ? 'Lifetime' : duration + ' hari'}`,
            {
                parse_mode: 'HTML', ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔑 Generate Lagi', 'admin_genkey')],
                    [Markup.button.callback('⬅️ Admin Panel', 'admin_back')]
                ])
            }
        );
    } else {
        await ctx.editMessageText('❌ Gagal generate key. Cek koneksi ke License Server.', {
            ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Admin Panel', 'admin_back')]])
        });
    }
});

// Admin: Broadcast
bot.action('admin_broadcast', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Not admin');
    await ctx.answerCbQuery();
    await ctx.editMessageText(
        '📢 <b>Broadcast</b>\n\nKirim pesan broadcast ke semua user.\nReply pesan ini dengan teks yang ingin di-broadcast.\n\nGunakan command:\n<code>/broadcast Teks pesan broadcast</code>',
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Admin Panel', 'admin_back')]]) }
    );
});

bot.command('broadcast', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const msgText = ctx.message.text.replace('/broadcast ', '').trim();
    if (!msgText || msgText === '/broadcast') return ctx.reply('Usage: /broadcast <pesan>');

    const userIds = Object.keys(db.users);
    let sent = 0, failed = 0;
    await ctx.reply(`📢 Broadcasting ke ${userIds.length} users...`);

    for (const uid of userIds) {
        try {
            await ctx.telegram.sendMessage(uid, `📢 <b>Broadcast</b>\n\n${msgText}`, { parse_mode: 'HTML' });
            sent++;
        } catch (e) { failed++; }
    }

    await ctx.reply(`✅ Broadcast selesai!\n📤 Sent: ${sent}\n❌ Failed: ${failed}`);
});

// Admin: Users
bot.action('admin_users', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Not admin');
    await ctx.answerCbQuery();

    const users = Object.values(db.users).slice(-15);
    let text = `👥 <b>USERS</b> (${Object.keys(db.users).length} total)\n━━━━━━━━━━━━━━━━━━\n\n`;
    for (const u of users) {
        text += `👤 <b>${u.name}</b> @${u.username || '-'}\n`;
        text += `   ID: <code>${u.id}</code> | Orders: ${u.order_count || 0} | Spent: ${formatPrice(u.total_spent || 0)}\n\n`;
    }

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Admin Panel', 'admin_back')]])
    });
});

// ============ PROMO CODE (User) ============
bot.command('promo', async (ctx) => {
    const userId = String(ctx.from.id);
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.replyWithHTML(
            '🏷️ <b>Kode Promo</b>\n\nMasukkan kode promo kamu:\n<code>/promo KODEKAMU</code>\n\nContoh: <code>/promo HEMAT10</code>'
        );
    }
    const code = args[1].toUpperCase();
    const d = getDiscount(code);
    if (!isDiscountValid(d)) {
        return ctx.replyWithHTML(getDiscountErrorMsg(d, code));
    }
    // Save pending promo for this user
    if (!db.users[userId]) db.users[userId] = { id: userId, name: ctx.from.first_name };
    db.users[userId].pending_promo = code;
    saveDB(db);
    const sisaKuota = d.quota === null ? '∞' : (d.quota - d.used);
    const diskonDesc = d.type === 'amount' ? `Rp${d.amount.toLocaleString('id-ID')}` : `${d.percent}%`;
    await ctx.replyWithHTML(
        `✅ Kode promo <b>${code}</b> berhasil diterapkan!\n\n🎁 Diskon: <b>${diskonDesc}</b>\n📦 Sisa kuota: <b>${sisaKuota}</b>\n\nDiskon akan otomatis diterapkan saat kamu beli produk.\n\nKetuk /start untuk mulai belanja! 🛒`
    );
});

// Clear promo when changing
bot.action(/^promo_change_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const productId = ctx.match[1];
    const userId = String(ctx.from.id);
    if (db.users[userId]) { db.users[userId].pending_promo = null; saveDB(db); }
    // Remove the unconfirmed pending order for this product
    await ctx.editMessageText(
        '🏷️ <b>Masukkan Kode Promo</b>\n\nKirim kode promo kamu ke chat ini (ketik teks biasa):',
        {
            parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Batal', `buy_${productId}`)]])
        });
    // Set waiting state
    if (!db.users[userId]) db.users[userId] = { id: userId };
    db.users[userId].waiting_promo_for = productId;
    saveDB(db);
});

// Handle text input for promo code (when waiting)
bot.on('text', async (ctx) => {
    const userId = String(ctx.from.id);
    const user = db.users[userId];
    if (!user?.waiting_promo_for) return;

    const productId = user.waiting_promo_for;
    const code = ctx.message.text.trim().toUpperCase();
    user.waiting_promo_for = null;

    const d = getDiscount(code);
    if (!isDiscountValid(d)) {
        saveDB(db);
        return ctx.replyWithHTML(
            getDiscountErrorMsg(d, code) + '\n\nCoba kode lain atau lanjut tanpa promo:',
            Markup.inlineKeyboard([[Markup.button.callback('🛒 Lanjut Tanpa Promo', `buy_${productId}`)]])
        );
    }
    user.pending_promo = code;
    saveDB(db);
    const sisaKuota = d.quota === null ? '∞' : (d.quota - d.used);
    await ctx.replyWithHTML(
        `✅ Kode <b>${code}</b> diterapkan! Diskon <b>${d.percent}%</b> | Sisa kuota: ${sisaKuota}`,
        Markup.inlineKeyboard([[Markup.button.callback('🛒 Lanjut Beli', `buy_${productId}`)]])
    );
});

// ============ ADMIN: DISKON MANAGEMENT ============
bot.action('admin_discounts', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Not admin');
    await ctx.answerCbQuery();

    if (!db.discounts) db.discounts = {};
    const codes = Object.values(db.discounts);
    let text = '🏷️ <b>MANAJEMEN KODE DISKON</b>\n━━━━━━━━━━━━━━━━━━\n\n';

    if (codes.length === 0) {
        text += '<i>Belum ada kode diskon.</i>\n';
    } else {
        for (const d of codes) {
            const sisaKuota = d.quota === null ? '∞' : `${d.quota - d.used}/${d.quota}`;
            const status = d.active ? '✅' : '❌';
            const produkLabel = d.products ? d.products.join(', ') : 'semua produk';
            const diskonLabel = d.type === 'amount' ? `Rp${d.amount.toLocaleString('id-ID')}` : `${d.percent}%`;
            text += `${status} <code>${d.code}</code> — <b>${diskonLabel}</b> | Kuota: ${sisaKuota} | Produk: <i>${produkLabel}</i>\n`;
        }
    }

    text += '\n━━━━━━━━━━━━━━━━━━\nGunakan command:\n<code>/newdiskon KODE PERSEN KUOTA</code>\nContoh: <code>/newdiskon HEMAT10 10 50</code>\n\nUntuk kuota tak terbatas, isi 0:\n<code>/newdiskon PROMO5 5 0</code>';

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('⬅️ Admin Panel', 'admin_back')]
        ])
    });
});

// Admin: Buat kode diskon baru via command
bot.command('newdiskon', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const rawArgs = ctx.message.text.split(' ');
    const args = rawArgs.slice(1); // remove /newdiskon

    if (args.length < 3) {
        const produkList = Object.keys(PRODUCTS).map(k => `<code>${k}</code>`).join(', ');
        return ctx.replyWithHTML(
            '🏷️ <b>Buat Kode Diskon</b>\n\n' +
            '<b>Diskon Persen (%):</b>\n' +
            '<code>/newdiskon KODE 10% KUOTA [product_id]</code>\n' +
            'Contoh: <code>/newdiskon HEMAT10 10% 50</code>\n\n' +
            '<b>Diskon Nominal (Rp):</b>\n' +
            '<code>/newdiskon KODE rp10000 KUOTA [product_id]</code>\n' +
            'Contoh: <code>/newdiskon DISKON10K rp10000 20</code>\n\n' +
            'Kuota 0 = tak terbatas\n\n' +
            '📦 ID Produk:\n' + produkList
        );
    }

    const code = args[0].toUpperCase();
    const discountRaw = args[1].toLowerCase(); // e.g. "10%" or "rp10000" or "10000"
    const quota = parseInt(args[2]);
    const productRestrictions = args.slice(3).map(p => p.toLowerCase()).filter(p => PRODUCTS[p]);
    const invalidProducts = args.slice(3).filter(p => !PRODUCTS[p.toLowerCase()]);

    if (isNaN(quota) || quota < 0) return ctx.reply('❌ Kuota harus angka ≥ 0 (0 = tak terbatas).');
    if (invalidProducts.length > 0) return ctx.reply(`❌ Product ID tidak dikenal: ${invalidProducts.join(', ')}\n\nYang valid: ${Object.keys(PRODUCTS).join(', ')}`);

    // Detect discount type
    let discountType, discountValue, displayText;
    if (discountRaw.startsWith('rp')) {
        // Flat rupiah: rp10000
        discountType = 'amount';
        discountValue = parseInt(discountRaw.replace('rp', '').replace(/[^0-9]/g, ''));
        if (isNaN(discountValue) || discountValue < 1000) return ctx.reply('❌ Nominal harus angka ≥ Rp1.000. Contoh: rp10000');
        displayText = `Rp${discountValue.toLocaleString('id-ID')} (flat)`;
    } else {
        // Percent: 10% atau 10
        discountType = 'percent';
        discountValue = parseInt(discountRaw.replace('%', ''));
        if (isNaN(discountValue) || discountValue < 1 || discountValue > 100) return ctx.reply('❌ Persen harus 1-100. Contoh: 10%');
        displayText = `${discountValue}%`;
    }

    if (!db.discounts) db.discounts = {};
    const discountObj = {
        code,
        type: discountType,
        quota: quota === 0 ? null : quota,
        used: 0,
        active: true,
        products: productRestrictions.length > 0 ? productRestrictions : null,
        created_at: new Date().toISOString()
    };
    if (discountType === 'amount') discountObj.amount = discountValue;
    else discountObj.percent = discountValue;

    db.discounts[code] = discountObj;
    saveDB(db);

    const quotaText = quota === 0 ? 'Tak terbatas' : `${quota}x`;
    const produkText = productRestrictions.length > 0
        ? productRestrictions.map(pid => `${PRODUCTS[pid].name} (${PRODUCTS[pid].desc})`).join(', ')
        : 'Semua produk';
    await ctx.replyWithHTML(
        `✅ <b>Kode diskon berhasil dibuat!</b>\n\n🏷️ Kode: <code>${code}</code>\n🎁 Diskon: <b>${displayText}</b>\n📦 Kuota: <b>${quotaText}</b>\n📋 Berlaku untuk: <b>${produkText}</b>\n\nUser bisa pakai:\n<code>/promo ${code}</code>`
    );
});

// Admin: Hapus/nonaktifkan kode diskon
bot.command('hapusdiskon', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 2) return ctx.reply('Format: /hapusdiskon KODE');

    const code = args[1].toUpperCase();
    if (!db.discounts?.[code]) return ctx.reply(`❌ Kode ${code} tidak ditemukan.`);

    db.discounts[code].active = false;
    saveDB(db);
    await ctx.reply(`✅ Kode diskon ${code} dinonaktifkan.`);
});

// Admin: Send key to user
bot.command('sendkey', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    // /sendkey <userId> <tier> <duration>
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply('Usage: /sendkey <userId> <tier> [duration]\nEx: /sendkey 123456789 pro 30');

    const targetUserId = args[1];
    const tier = args[2];
    const duration = parseInt(args[3]) || 0;

    const key = await generateLicenseKey(tier, duration);
    if (!key) return ctx.reply('❌ Gagal generate key.');

    // Record order
    const orderId = generateOrderId();
    db.orders.push({
        id: orderId, user_id: targetUserId, user_name: 'Admin-sent',
        product_name: `${tier} — ${duration === 0 ? 'Lifetime' : duration + ' hari'}`,
        tier, duration, price: 0, status: 'paid',
        license_key: key, created_at: new Date().toISOString(), paid_at: new Date().toISOString()
    });
    saveDB(db);

    try {
        await ctx.telegram.sendMessage(targetUserId,
            `🎁 <b>Admin mengirim license key untukmu!</b>\n\n🔑 <code>${key}</code>\n\nTier: ${tier}\nDurasi: ${duration === 0 ? 'Lifetime' : duration + ' hari'}\n\nAktivasi di Settings → License`,
            { parse_mode: 'HTML' }
        );
        await ctx.reply(`✅ Key sent to user ${targetUserId}\n🔑 ${key}`);
    } catch (e) {
        await ctx.reply(`❌ Gagal kirim ke user. Key: ${key}`);
    }
});

// Admin Back
bot.action('admin_back', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await ctx.answerCbQuery();
    // Trigger admin panel
    const totalOrders = db.orders.filter(o => o.status === 'paid').length;
    const totalRevenue = db.orders.filter(o => o.status === 'paid').reduce((s, o) => s + o.price, 0);

    await ctx.editMessageText(
        `🔧 <b>ADMIN PANEL</b>\n━━━━━━━━━━━━━━━━━━\n\n📊 Orders: ${totalOrders} | 💰 Revenue: ${formatPrice(totalRevenue)} | 👥 Users: ${Object.keys(db.users).length}`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📊 Stats', 'admin_stats'), Markup.button.callback('📋 Orders', 'admin_orders')],
                [Markup.button.callback('🔑 Gen Key', 'admin_genkey'), Markup.button.callback('📢 Broadcast', 'admin_broadcast')],
                [Markup.button.callback('👥 Users', 'admin_users'), Markup.button.callback('🏷️ Diskon', 'admin_discounts')]
            ])
        }
    );
});

// Admin: Simulate Payment (Sandbox testing)
bot.command('simulate', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');

    if (args.length < 2) {
        // Show list of active orders to simulate
        const activeOrders = db.orders.filter(o => o.status === 'waiting_payment').slice(-5);
        if (activeOrders.length === 0) {
            return ctx.reply('❌ Tidak ada order aktif yang bisa disimulasi.\n\nBuat order dulu via /start → pilih produk → bayar.');
        }
        let text = '🧪 <b>PAYMENT SIMULATION</b> (Sandbox)\n━━━━━━━━━━━━━━━━━━\n\n';
        text += 'Pilih order yang mau disimulasi bayar:\n\n';
        for (const o of activeOrders) {
            text += `🆔 <code>${o.id}</code>\n📦 ${o.product_name} | 💰 ${formatPrice(o.price)}\n\n`;
        }
        text += 'Gunakan: <code>/simulate ORDER_ID</code>';
        return ctx.replyWithHTML(text);
    }

    const orderId = args[1];
    const order = db.orders.find(o => o.id === orderId);
    if (!order) return ctx.reply(`❌ Order ${orderId} tidak ditemukan.`);
    if (order.status === 'paid') return ctx.reply('✅ Order sudah dibayar.');

    await ctx.reply(`🧪 Simulating payment for ${orderId}...`);
    const result = await simulatePakasirPayment(orderId, order.price);

    if (result.success) {
        await ctx.reply(`✅ Simulasi pembayaran terkirim!\n\n${JSON.stringify(result.data, null, 2)}\n\n⏳ Polling otomatis akan detect dalam 15 detik...`);
    } else {
        await ctx.reply(`❌ Simulasi gagal: ${result.error}\n\n⚠️ Pastikan proyek Pakasir dalam mode Sandbox.`);
    }
});

// ============ LAUNCH ============
console.log('🔄 Starting ClipperSkuy Telebot...');
console.log(`📋 Config: Token=${BOT_TOKEN.substring(0, 10)}..., Admin=${ADMIN_IDS.join(',')}`);
console.log(`🔗 License Server: ${LICENSE_SERVER}`);

bot.catch((err, ctx) => {
    console.error('❌ Bot error:', err.message);
});

bot.launch()
    .then(async () => {
        console.log('');
        console.log('╔═══════════════════════════════════════════╗');
        console.log('║   🤖 ClipperSkuy Telebot is RUNNING!     ║');
        console.log('║═══════════════════════════════════════════║');
        console.log('║   License Auto-Order Bot for Telegram     ║');
        console.log('║   Products: Pro & Enterprise              ║');
        console.log('║   Payment: QRIS (bayar.gg / Pakasir)     ║');
        console.log('║   Delivery: Auto License Key               ║');
        console.log('╚═══════════════════════════════════════════╝');
        console.log('');
        console.log(`📊 Loaded: ${Object.keys(db.users).length} users, ${db.orders.length} orders`);
        console.log(`💰 Revenue: ${formatPrice(db.stats.total_revenue || 0)}`);

        // Recover polling untuk order yang masih waiting saat bot mati/restart
        await recoverPendingPolls(bot);
    })
    .catch(err => {
        console.error('❌ Bot failed to start:', err.message);
        process.exit(1);
    });

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
