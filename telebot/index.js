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
// Pakasir lebih murah (1% vs bayar.gg 2% + Rp50k/bulan) dan tidak perlu login ulang
// Set USE_BAYARGG = false untuk selalu pakai Pakasir
const USE_BAYARGG = false; // was: !!BAYARGG_API_KEY
const SUPPORT_GROUP = process.env.SUPPORT_GROUP_LINK || 'https://t.me/+GANTI_DENGAN_LINK_GRUP';

// ============ DATABASE (Redis + JSON fallback) ============
const DB_FILE = path.join(__dirname, 'data', 'db.json');

// Upstash Redis — optional persistent storage (set in .env / Render env vars)
// Get free at: https://upstash.com → create Redis DB → copy REST URL & Token
const UPSTASH_URL = (process.env.UPSTASH_REDIS_URL || '').replace(/\/$/, '');
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_TOKEN || '';
const REDIS_KEY = 'clipperskuy_db';
const USE_REDIS = !!(UPSTASH_URL && UPSTASH_TOKEN);

async function redisGet(key) {
    const res = await fetch(`${UPSTASH_URL}/get/${key}`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    });
    const data = await res.json();
    return data.result || null;
}

async function redisSet(key, value) {
    await fetch(`${UPSTASH_URL}/set/${key}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${UPSTASH_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(value)   // Upstash REST: body is the raw value
    });
}

const EMPTY_DB = () => ({ users: {}, orders: [], stats: { total_orders: 0, total_revenue: 0 }, discounts: {} });

async function loadDBFromRedis() {
    if (!USE_REDIS) return null;
    try {
        const raw = await redisGet(REDIS_KEY);
        if (raw) {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            console.log(`[Redis] ✅ DB loaded: ${parsed.orders?.length || 0} orders`);
            return parsed;
        }
    } catch (e) {
        console.warn('[Redis] Load failed:', e.message);
    }
    return null;
}

function loadDB() {
    try {
        if (fs.existsSync(DB_FILE)) {
            return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
        }
    } catch (e) { console.error('[DB] Load error:', e); }
    return EMPTY_DB();
}

function saveDB(db) {
    // Save to local file (always)
    try {
        const dir = path.dirname(DB_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    } catch (e) { console.error('[DB] File save error:', e); }

    // Sync to Redis async (non-blocking)
    if (USE_REDIS) {
        const payload = JSON.stringify(db);
        fetch(`${UPSTASH_URL}/set/${REDIS_KEY}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${UPSTASH_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        }).catch(e => console.warn('[Redis] Sync failed:', e.message));
    }
}

// Load DB: Redis first, fallback to local file
let db = loadDB(); // sync init from file

// Pastikan semua field DB selalu ada — prevent TypeError undefined
function ensureDBFields(dbObj) {
    if (!dbObj || typeof dbObj !== 'object') return EMPTY_DB();
    if (!Array.isArray(dbObj.orders)) dbObj.orders = [];
    if (!dbObj.users) dbObj.users = {};
    if (!dbObj.stats) dbObj.stats = { total_orders: 0, total_revenue: 0 };
    if (!dbObj.discounts) dbObj.discounts = {};
    if (!dbObj.tickets) dbObj.tickets = [];
    if (!dbObj.blocked_users) dbObj.blocked_users = {};
    if (!dbObj.blacklisted_keys) dbObj.blacklisted_keys = {};
    return dbObj;
}

db = ensureDBFields(db); // init fields on local load

// Then async upgrade from Redis if available
if (USE_REDIS) {
    console.log('[Redis] Configured ✅ — will load persistent DB on startup');
    loadDBFromRedis().then(redisDb => {
        if (redisDb) {
            db = ensureDBFields(redisDb); // ← ensure fields after Redis overwrite
            // Also sync back to local file for offline use
            saveDB(db);
            console.log('[Redis] DB synced to local file');
        } else {
            // Redis empty → push local to Redis
            console.log('[Redis] No data in Redis, pushing local DB...');
            saveDB(db);
        }
    }).catch(e => console.warn('[Redis] Init failed:', e.message));
} else {
    console.log('[Redis] Not configured — using local db.json only (data may be lost on restart!)');
    console.log('[Redis] Set UPSTASH_REDIS_URL + UPSTASH_REDIS_TOKEN to enable persistence.');
}

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
        price: parseInt(process.env.PRICE_PRO_90) || 129000,
        originalPrice: 179000,
        emoji: '⚡', badge: '💰 HEMAT 28%'
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
    if (!db.users) db.users = {};
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

    // Cek apakah punya license aktif
    const myPaidOrders = (db.orders || []).filter(o => o.user_id === userId && o.status === 'paid');
    const hasLicense = myPaidOrders.length > 0;

    const text =
        `╔══════════════════════╗
     ⚡ <b>CLIPPERSKUY</b> ⚡
     <i>AI Video Clip Generator</i>
╚══════════════════════╝

Hai <b>${name}</b>! 👋🏻

Ubah video panjang jadi konten <b>viral</b> untuk
TikTok · Reels · YouTube Shorts
<i>100% offline di PC kamu</i>

┌─── 💎 <b>PAKET TERSEDIA</b> ───┐
│                                                          │
│  ⚡ <b>Pro</b>  ·  mulai <b>Rp 69rb</b>/bln           │
│  🎯 Face Tracking · 🔊 Audio AI          │
│  📺 1080p · ∞ Unlimited Export           │
│                                                          │
│  👑 <b>Enterprise</b>  ·  Hubungi Admin     │
│  🔌 API · 🏷 Branding · ♾ Lifetime       │
│                                                          │
└──────────────────────┘

${hasLicense ? '✅ <b>License aktif terdeteksi!</b>' : '👇 <i>Pilih menu untuk mulai:</i>'}`;

    const hasTrial = db.users[userId]?.trial_used;
    const buttons = [
        [Markup.button.callback('🛒  Beli License', 'catalog'),
        Markup.button.callback('⬇️  Download', 'download_action')],
        [Markup.button.callback('🔑  License Saya', 'my_license'),
        Markup.button.callback('📋  Riwayat', 'my_orders')],
        [Markup.button.callback('🎁  Referral', 'referral_info'),
        Markup.button.callback('❓  FAQ', 'help')],
        [Markup.button.callback('🎫  Tiket Support', 'open_ticket'),
        Markup.button.callback('💬  Admin', 'contact')],
    ];
    // Show trial button for users who haven't used it and don't have a license
    if (!hasTrial && !hasLicense) {
        buttons.splice(1, 0, [Markup.button.callback('🎮  Coba GRATIS 1 Hari', 'start_trial')]);
    }
    await ctx.replyWithHTML(text, Markup.inlineKeyboard(buttons));
});

// ============ TRIAL GRATIS 1 HARI ============
bot.action('start_trial', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = String(ctx.from.id);
    const name = ctx.from.first_name || 'User';

    // Cek apakah sudah pernah trial
    if (!db.users[userId]) db.users[userId] = { name, username: ctx.from.username || '', joined: new Date().toISOString() };
    if (db.users[userId].trial_used) {
        return ctx.replyWithHTML(
            '❌ <b>Kamu sudah pernah menggunakan trial.</b>\n\nSetiap akun hanya bisa trial 1x.\nBeli license untuk akses penuh!',
            Markup.inlineKeyboard([
                [Markup.button.callback('🛒 Beli License', 'catalog')],
                [Markup.button.callback('◀️ Kembali', 'back_start')]
            ])
        );
    }

    // Generate trial key (1 hari)
    try {
        const trialKey = await generateLicenseKey('pro', 1);
        if (!trialKey) {
            return ctx.replyWithHTML('⚠️ Gagal generate trial key. Coba lagi nanti atau hubungi admin.');
        }

        // Mark as used
        db.users[userId].trial_used = true;
        db.users[userId].trial_key = trialKey;
        db.users[userId].trial_at = new Date().toISOString();
        saveDB(db);

        await ctx.replyWithHTML(
            `\n🎮 <b>TRIAL GRATIS AKTIF!</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
            `Selamat <b>${name}</b>! 🎉\nKamu dapat akses ClipperSkuy Pro selama <b>1 hari</b>.\n\n` +
            `┌──────────────────────┐\n` +
            `│                                                            │\n` +
            `│  🔑  <b>TRIAL LICENSE KEY</b>                    │\n` +
            `│                                                            │\n` +
            `│  <code>${trialKey}</code>                       │\n` +
            `│                                                            │\n` +
            `│  📦  ClipperSkuy Pro                            │\n` +
            `│  ⏱  1 Hari (24 jam)                              │\n` +
            `│  🎯  Face Tracking + Audio AI           │\n` +
            `│                                                            │\n` +
            `└──────────────────────┘\n\n` +
            `📋 <b>Cara Aktivasi:</b>\n` +
            `  1 ▸  Buka ClipperSkuy di PC\n` +
            `  2 ▸  <b>Settings</b>  →  <b>License</b>\n` +
            `  3 ▸  Paste key di atas\n` +
            `  4 ▸  Klik <b>"Activate"</b>\n\n` +
            `⚠️  <i>Trial hanya 1x per akun.\nSuka? Beli license untuk akses penuh!</i>`,
            Markup.inlineKeyboard([
                [Markup.button.callback('🛒  Upgrade ke Pro', 'catalog')],
                [Markup.button.callback('⬇️  Download App', 'download_action')],
                [Markup.button.callback('◀️  Menu Utama', 'back_start')]
            ])
        );

        // Log ke admin
        await sendLog(bot, `🎮 <b>TRIAL BARU</b>\n👤 ${name} (@${ctx.from.username || '-'}) [<code>${userId}</code>]\n🔑 Key: <code>${trialKey}</code>`);

    } catch (e) {
        console.error('Trial error:', e.message);
        await ctx.replyWithHTML('⚠️ Terjadi kesalahan. Coba lagi nanti.');
    }
});

// Quick action: cek license dari start menu
bot.action('my_license', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = String(ctx.from.id);
    const paidOrders = (db.orders || []).filter(o => o.user_id === userId && o.status === 'paid' && o.license_key);
    if (paidOrders.length === 0) {
        return ctx.replyWithHTML(
            '❌ <b>Kamu belum punya license aktif.</b>\n\nBeli sekarang untuk akses semua fitur ClipperSkuy!',
            Markup.inlineKeyboard([
                [Markup.button.callback('🛒 Beli License', 'catalog')],
                [Markup.button.callback('⬅️ Kembali', 'back_start')]
            ])
        );
    }
    let text = `🔑 <b>License Aktif Kamu</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
    for (const o of paidOrders) {
        const paidAt = new Date(o.paid_at);
        const expireAt = o.duration > 0 ? new Date(paidAt.getTime() + o.duration * 86400000) : null;
        const now = new Date();
        const isExpired = expireAt && expireAt < now;
        const daysLeft = expireAt ? Math.ceil((expireAt - now) / 86400000) : -1;
        const statusIcon = o.duration === 0 ? '♾️ Lifetime' : isExpired ? '❌ Expired' : `✅ Aktif (${daysLeft} hari lagi)`;
        text += `📦 <b>${o.product_name}</b>\n` +
            `🔑 <code>${o.license_key}</code>\n` +
            `📅 Beli: ${paidAt.toLocaleDateString('id-ID')}\n` +
            `${expireAt ? `⏱ Expired: ${expireAt.toLocaleDateString('id-ID')}\n` : ''}` +
            `📊 Status: ${statusIcon}\n\n`;
    }
    await ctx.replyWithHTML(text, Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Perpanjang License', 'renewal_menu')],
        [Markup.button.callback('⬅️ Kembali', 'back_start')]
    ]));
});

// Quick action: download dari start menu
bot.action('download_action', async (ctx) => {
    await ctx.answerCbQuery();
    const hasDownloadUrl = !!process.env.DOWNLOAD_URL;
    if (hasDownloadUrl) {
        await ctx.replyWithHTML(
            `📥 <b>Download ClipperSkuy</b>\n━━━━━━━━━━━━━━━━━━\n\n` +
            `🖥 <b>Windows (64-bit)</b> — versi terbaru tersedia!\n\n` +
            `<i>Setelah download, aktifkan license di Settings → License</i>`,
            Markup.inlineKeyboard([
                [Markup.button.url('⬇️ Download App', process.env.DOWNLOAD_URL)],
                [Markup.button.url('📖 Grup Support & Tutorial', SUPPORT_GROUP)],
                [Markup.button.callback('⬅️ Kembali', 'back_start')]
            ])
        );
    } else {
        await ctx.replyWithHTML(
            `🕒 <b>Download Coming Soon!</b>\n━━━━━━━━━━━━━━━━━━\n\n` +
            `🛠 ClipperSkuy sedang dalam tahap pengembangan akhir.\n` +
            `Kami sedang memperbaiki beberapa bug sebelum rilis resmi.\n\n` +
            `📣 <b>Ingin tahu duluan saat rilis?</b>\n` +
            `Gabung grup kami dan aktifkan notifikasi ↓`,
            Markup.inlineKeyboard([
                [Markup.button.url('📢 Gabung Grup & Dapat Notif Rilis', SUPPORT_GROUP)],
                [Markup.button.callback('⬅️ Kembali', 'back_start')]
            ])
        );
    }
});

// Quick action: referral dari start menu
bot.action('referral_info', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = String(ctx.from.id);
    const code = getUserReferralCode ? getUserReferralCode(userId) : 'REF' + userId.slice(-6);
    const referralCount = (db.orders || []).filter(o => o.referral_by === userId && o.status === 'paid').length;

    // PENTING: Daftarkan kode ke db.discounts agar bisa dipakai /promo
    if (!db.discounts) db.discounts = {};
    if (!db.discounts[code]) {
        db.discounts[code] = {
            active: true, percent: 10, type: 'percent',
            quota: null, used: 0, expires_at: null,
            owner_id: userId, products: []
        };
        saveDB(db);
    }

    // Progress bar referral
    const MILESTONES = [3, 5, 10];
    const nextMilestone = MILESTONES.find(m => m > referralCount) || 10;
    const progress = Math.min(referralCount, nextMilestone);
    const progressBar = '█'.repeat(Math.floor((progress / nextMilestone) * 8)) + '░'.repeat(8 - Math.floor((progress / nextMilestone) * 8));
    let rewardText = '';
    if (referralCount < 3) rewardText = `🎯 Next: <b>3 referral</b> → Diskon 15%`;
    else if (referralCount < 5) rewardText = `🎯 Next: <b>5 referral</b> → Diskon 25%`;
    else if (referralCount < 10) rewardText = `🎯 Next: <b>10 referral</b> → Free License!`;
    else rewardText = `🏆 <b>Semua reward sudah diraih!</b>`;

    await ctx.replyWithHTML(
        `\n🎁 <b>REFERRAL & DISKON</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
        `┌──────────────────┐\n` +
        `│  🎟  <b>Kode Referral Kamu:</b>              │\n` +
        `│  <code>${code}</code>                                       │\n` +
        `└──────────────────┘\n\n` +
        `📲 <b>Cara Share ke Teman:</b>\n` +
        `Kirim pesan ini:\n\n` +
        `<i>"Beli ClipperSkuy pakai kode <code>${code}</code>\ndapet diskon 10%! Beli di @Skuy_bot"</i>\n\n` +
        `┌─── 🏅 <b>REWARD KAMU</b> ───┐\n` +
        `│                                                            │\n` +
        `│  📊 Referral: <b>${referralCount}</b>/${nextMilestone}              │\n` +
        `│  ${progressBar}                            │\n` +
        `│                                                            │\n` +
        `│  3 ref → 🎁 Diskon 15%  ${referralCount >= 3 ? '✅' : '⬜'}       │\n` +
        `│  5 ref → 🎁 Diskon 25%  ${referralCount >= 5 ? '✅' : '⬜'}       │\n` +
        `│  10 ref → 🔑 Free License ${referralCount >= 10 ? '✅' : '⬜'}  │\n` +
        `│                                                            │\n` +
        `│  ${rewardText}                            │\n` +
        `│                                                            │\n` +
        `└──────────────────────┘`,
        Markup.inlineKeyboard([
            [Markup.button.callback('🛒  Beli Sekarang', 'catalog')],
            [Markup.button.callback('◀️  Kembali', 'back_start')]
        ])
    );
});

// Quick action: buat tiket dari start menu
bot.action('open_ticket', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.replyWithHTML(
        `\n🎫 <b>TIKET SUPPORT</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
        `Ketik pesan tiket kamu:\n\n` +
        `<code>/tiket PERTANYAAN_KAMU</code>\n\n` +
        `┌─── 💡 <b>CONTOH</b> ───┐\n` +
        `│                                                             │\n` +
        `│  <code>/tiket License tidak bisa aktif</code>     │\n` +
        `│  <code>/tiket Sudah bayar, key belum datang</code>│\n` +
        `│                                                             │\n` +
        `└───────────────────────┘\n\n` +
        `⏱  <i>Admin akan membalas dalam 1×24 jam</i>`,
        Markup.inlineKeyboard([
            [Markup.button.callback('💬  Hubungi Admin Langsung', 'contact')],
            [Markup.button.callback('◀️  Kembali', 'back_start')]
        ])
    );
});


// ============ CATALOG ============
bot.action('catalog', async (ctx) => {
    await ctx.answerCbQuery();
    const text = `
🛍 <b>KATALOG PRODUK</b>
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬

Pilih tier yang sesuai kebutuhan kamu:

┌─── ⚡ <b>PRO</b> ───┐
│  Untuk kreator serius                │
│  🎯 Face Tracking AI                 │
│  🔊 Audio Enhancement              │
│  📺 1080p · ∞ Unlimited              │
│  ⚡ GPU Acceleration                 │
└────────────────┘

┌─── 👑 <b>ENTERPRISE</b> ───┐
│  Untuk agensi & tim produksi     │
│  ✦ Semua fitur Pro                     │
│  🔌 API · 🏷 Custom Branding     │
│  ♾ Lifetime · 🛡 Priority Support │
└─────────────────────┘

<i>Ketuk untuk lihat paket & harga:</i>`;

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('⚡  Lihat Pro Plans', 'tier_pro')],
            [Markup.button.callback('👑  Lihat Enterprise', 'tier_enterprise')],
            [Markup.button.callback('◀️  Kembali', 'back_start')]
        ])
    });
});

// ============ /myid — User lihat Telegram ID sendiri ============
bot.command('myid', async (ctx) => {
    const u = ctx.from;
    await ctx.replyWithHTML(
        `👤 <b>Info Akun Telegram Kamu</b>\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🆔 <b>User ID:</b> <code>${u.id}</code>\n` +
        `📛 <b>Nama:</b> ${u.first_name}${u.last_name ? ' ' + u.last_name : ''}\n` +
        `🔖 <b>Username:</b> ${u.username ? '@' + u.username : '—'}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `💡 <i>User ID ini dibutuhkan admin untuk kirim license key manual.</i>\n` +
        `Kirimkan ke admin jika diminta: <code>${u.id}</code>`
    );
});

bot.action('tier_pro', async (ctx) => {
    await ctx.answerCbQuery();
    const p30 = PRODUCTS.pro_30;
    const p90 = PRODUCTS.pro_90;
    const p365 = PRODUCTS.pro_365;

    const text = `
⚡ <b>CLIPPERSKUY PRO</b>
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬

${p30.features.join('\n')}

┌─── 💰 <b>PILIH DURASI</b> ───┐
│                                                │
│  1️⃣  <b>30 Hari</b>                            │
│      <s>${formatPrice(p30.originalPrice)}</s>  →  <b>${formatPrice(p30.price)}</b>              │
│                                                │
│  2️⃣  <b>90 Hari</b>  ${p90.badge || ''}                   │
│      <s>${formatPrice(p90.originalPrice)}</s>  →  <b>${formatPrice(p90.price)}</b>            │
│                                                │
│  3️⃣  <b>365 Hari</b>  ${p365.badge || ''}                 │
│      <s>${formatPrice(p365.originalPrice)}</s>  →  <b>${formatPrice(p365.price)}</b>          │
│                                                │
└────────────────────┘

🔑 <i>License key dikirim otomatis setelah bayar</i>`;

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback(`⚡ 30 Hari — ${formatPrice(p30.price)}`, 'buy_pro_30')],
            [Markup.button.callback(`💰 90 Hari — ${formatPrice(p90.price)}`, 'buy_pro_90')],
            [Markup.button.callback(`🔥 365 Hari — ${formatPrice(p365.price)}`, 'buy_pro_365')],
            [Markup.button.callback('◀️  Kembali', 'catalog')]
        ])
    });
});

// ============ TIER ENTERPRISE ============
bot.action('tier_enterprise', async (ctx) => {
    await ctx.answerCbQuery();

    const text = `
👑 <b>CLIPPERSKUY ENTERPRISE</b>
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬

┌─── ✦ <b>FITUR</b> ───┐
│                                              │
│  ✅ Semua fitur Pro                      │
│  🔌 API Access                             │
│  🏷 Custom Branding                     │
│  📱 Multi-device License              │
│  🏢 White-label Ready                 │
│  🛡 Priority Support                     │
│  🚀 Early Access Features            │
│                                              │
└──────────────────┘

💰  <b>Harga:</b>  Konsultasi dengan Admin

<i>Untuk kebutuhan agensi & tim — 
harga disesuaikan dengan skala</i>`;

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('💬  Hubungi Admin', 'contact')],
            [Markup.button.url('📱 WhatsApp', 'https://wa.me/628151616315')],
            [Markup.button.callback('◀️  Kembali', 'catalog')]
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
╔══════════════════════╗
     🧾 <b>KONFIRMASI ORDER</b>
╚══════════════════════╝

📦  <b>Produk:</b>  ${product.name}
⏱  <b>Durasi:</b>  ${product.desc}
💰  <b>Harga:</b>   ${formatPrice(product.price)}${promoLine}

┌──────────────────┐
│  💳  <b>TOTAL BAYAR</b>                      │
│  <b>${formatPrice(finalPrice)}</b>                              │
└──────────────────┘

🆔  Order:  <code>${orderId}</code>

⏱  <i>Expired dalam 5 menit</i>
🔑  <i>Key otomatis dikirim setelah bayar</i>`;

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
        referral_by: (discount && db.discounts[pendingPromo.toUpperCase()]?.owner_id) || null,
        status: 'pending',
        license_key: null,
        created_at: new Date().toISOString(),
        paid_at: null
    };

    db.orders.push(order);
    saveDB(db);

    const buttons = [
        [Markup.button.callback('💳  Bayar Sekarang (QRIS)', `pay_${orderId}`)],
        [Markup.button.callback('🏷️ Promo', `promo_change_${productId}`), Markup.button.callback('✖️ Batal', `cancel_${orderId}`)],
        [Markup.button.callback('◀️  Kembali', 'catalog')]
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
            // Validasi payment_url harus string URL yang valid (bukan angka/null)
            const isValidUrl = payment.payment_url && typeof payment.payment_url === 'string' && payment.payment_url.startsWith('http');
            if (isValidUrl) {
                buttons.push([Markup.button.url('💳 Bayar Sekarang (GoPay)', payment.payment_url)]);
            } else if (payment.qr_url && typeof payment.qr_url === 'string' && payment.qr_url.startsWith('http')) {
                buttons.push([Markup.button.url('📷 Lihat QR Code', payment.qr_url)]);
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
            notifyAdminNewOrder(bot, order);
            schedulePaymentReminder(bot, order);
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

// ============ ADMIN PANEL UTAMA ============
bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Bukan admin.');

    const totalOrders = (db.orders || []).length;
    const paidOrders = (db.orders || []).filter(o => o.status === 'paid').length;
    const pendingOrders = (db.orders || []).filter(o => ['waiting_payment', 'pending', 'pending_confirm'].includes(o.status)).length;
    const openTickets = (db.tickets || []).filter(t => t.status === 'open').length;
    const totalUsers = Object.keys(db.users || {}).length;
    const totalRev = db.stats?.total_revenue || 0;

    // Revenue hari ini (WIB)
    const nowWIB = new Date(Date.now() + 7 * 3600000);
    const todayStr = nowWIB.toISOString().substring(0, 10);
    const todayRev = (db.orders || [])
        .filter(o => o.status === 'paid' && o.paid_at)
        .filter(o => new Date(new Date(o.paid_at).getTime() + 7 * 3600000).toISOString().startsWith(todayStr))
        .reduce((s, o) => s + (o.price || 0), 0);

    await ctx.replyWithHTML(
        `🔧 <b>ADMIN PANEL — ClipperSkuy</b>\n━━━━━━━━━━━━━━━━━━\n\n` +
        `📊 <b>Ringkasan Hari Ini:</b>\n` +
        `💰 Revenue hari ini: <b>${formatPrice(todayRev)}</b>\n` +
        `✅ Total terjual: <b>${paidOrders}</b> order\n` +
        `⏳ Pending bayar: <b>${pendingOrders}</b> order\n` +
        `🎫 Tiket open: <b>${openTickets}</b>\n` +
        `👥 Total user: <b>${totalUsers}</b>\n` +
        `💳 Total revenue: <b>${formatPrice(totalRev)}</b>\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `Pilih aksi di bawah:`,
        Markup.inlineKeyboard([
            // Row 1 — Analytics
            [Markup.button.callback('📊 Stats Lengkap', 'admin_full_stats'),
            Markup.button.callback('📥 Export CSV', 'export_csv_action')],
            // Row 2 — Order management
            [Markup.button.callback('📋 Order Pending', 'admin_view_pending'),
            Markup.button.callback('🎫 Tiket Open', 'view_open_tickets')],
            // Row 3 — Key & User
            [Markup.button.callback('🔑 Kirim Key Manual', 'admin_sendkey_guide'),
            Markup.button.callback('✅ Konfirmasi Order', 'admin_konfirmasi_guide')],
            // Row 4 — Broadcast & Promo
            [Markup.button.callback('📡 Broadcast', 'admin_broadcast_guide'),
            Markup.button.callback('⚡ Flash Sale', 'admin_flashsale_guide')],
            // Row 5 — Security
            [Markup.button.callback('🚫 Blacklist Key', 'admin_blacklist_guide'),
            Markup.button.callback('🚫 Blokir User', 'admin_blockuser_guide')],
            // Row 6 — All commands
            [Markup.button.callback('📖 Semua Command Admin', 'admin_all_commands')],
        ])
    );
});

// Admin: Stats lengkap (sama dengan /stats)
bot.action('admin_full_stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Not admin');
    await ctx.answerCbQuery();
    // Reuse ctx as command context
    const now = new Date();
    const WIB = new Date(now.getTime() + 7 * 3600000);
    const todayStr = WIB.toISOString().substring(0, 10);
    const thisMonthStr = WIB.toISOString().substring(0, 7);
    const allOrders = db.orders || [];
    const paidOrders = allOrders.filter(o => o.status === 'paid');
    const todayOrders = paidOrders.filter(o => { const w = new Date(new Date(o.paid_at).getTime() + 7 * 3600000); return w.toISOString().startsWith(todayStr); });
    const monthOrders = paidOrders.filter(o => { const w = new Date(new Date(o.paid_at).getTime() + 7 * 3600000); return w.toISOString().startsWith(thisMonthStr); });
    const pendingOrders = allOrders.filter(o => ['waiting_payment', 'pending'].includes(o.status));
    const productCount = {};
    paidOrders.forEach(o => { productCount[o.product_id] = (productCount[o.product_id] || 0) + 1; });
    const topProduct = Object.entries(productCount).sort((a, b) => b[1] - a[1])[0];
    const ratedOrders = paidOrders.filter(o => o.rating);
    const avgRating = ratedOrders.length > 0 ? (ratedOrders.reduce((s, o) => s + o.rating, 0) / ratedOrders.length).toFixed(1) : '-';
    await ctx.replyWithHTML(
        `📊 <b>DASHBOARD ADMIN</b>\n━━━━━━━━━━━━━━━━━━\n\n` +
        `📅 <b>Hari ini (${todayStr}):</b>\n   ✅ ${todayOrders.length} order | 💰 ${formatPrice(todayOrders.reduce((s, o) => s + (o.price || 0), 0))}\n\n` +
        `📅 <b>Bulan (${thisMonthStr}):</b>\n   ✅ ${monthOrders.length} order | 💰 ${formatPrice(monthOrders.reduce((s, o) => s + (o.price || 0), 0))}\n\n` +
        `📈 <b>All Time:</b>\n   ✅ ${paidOrders.length} order | 💰 ${formatPrice(db.stats?.total_revenue || 0)}\n   👥 ${Object.keys(db.users || {}).length} user\n\n` +
        `⏳ <b>Pending:</b> ${pendingOrders.length} | 🎫 <b>Tiket open:</b> ${(db.tickets || []).filter(t => t.status === 'open').length}\n` +
        `🏆 <b>Terlaris:</b> ${topProduct ? `${topProduct[0]} (${topProduct[1]}x)` : '-'} | ⭐ <b>Rating:</b> ${avgRating}`,
        Markup.inlineKeyboard([
            [Markup.button.callback('📥 Export CSV', 'export_csv_action')],
            [Markup.button.callback('⬅️ Admin Panel', 'back_admin')]
        ])
    );
});

// Admin: lihat pending orders
bot.action('admin_view_pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Not admin');
    await ctx.answerCbQuery();
    const pending = (db.orders || []).filter(o => ['waiting_payment', 'pending', 'pending_confirm'].includes(o.status));
    if (pending.length === 0) return ctx.reply('✅ Tidak ada order pending.');
    let text = `📋 <b>Order Pending (${pending.length})</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
    for (const o of pending.slice(0, 10)) {
        const icon = o.status === 'pending_confirm' ? '📸' : '⏳';
        text += `${icon} <code>${o.id}</code>\n👤 ${o.user_name} | 📦 ${o.product_name}\n💰 ${formatPrice(o.price)} | ${o.status}\n`;
        if (o.status === 'pending_confirm') text += `Konfirmasi: <code>/konfirmasi ${o.id}</code>\n`;
        text += '\n';
    }
    await ctx.replyWithHTML(text, Markup.inlineKeyboard([[Markup.button.callback('⬅️ Admin Panel', 'back_admin')]]));
});

// Admin: guide sendkey
bot.action('admin_sendkey_guide', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Not admin');
    await ctx.answerCbQuery();
    await ctx.replyWithHTML(
        `🔑 <b>Kirim License Key Manual</b>\n━━━━━━━━━━━━━━━━━━\n\n` +
        `<b>Format:</b>\n<code>/sendkey USER_ID PRODUCT_ID [HARGA]</code>\n\n` +
        `<b>Contoh:</b>\n<code>/sendkey 123456789 pro_30</code>\n<code>/sendkey 123456789 pro_30 69000</code>\n\n` +
        `<b>Product ID tersedia:</b>\n` +
        Object.entries(PRODUCTS).map(([id, p]) => `• <code>${id}</code> — ${p.name} ${p.desc} (${formatPrice(p.price)})`).join('\n') + '\n\n' +
        `<i>💡 Pakai /myid untuk tahu User ID seseorang.</i>`,
        Markup.inlineKeyboard([[Markup.button.callback('⬅️ Admin Panel', 'back_admin')]])
    );
});

// Admin: guide konfirmasi
bot.action('admin_konfirmasi_guide', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Not admin');
    await ctx.answerCbQuery();
    const pendingConfirm = (db.orders || []).filter(o => o.status === 'pending_confirm' || o.status === 'waiting_payment');
    let text = `✅ <b>Konfirmasi Order Manual</b>\n━━━━━━━━━━━━━━━━━━\n\n` +
        `<b>Format:</b> <code>/konfirmasi ORDER_ID</code>\n\n`;
    if (pendingConfirm.length > 0) {
        text += `<b>Order yang perlu dikonfirmasi (${pendingConfirm.length}):</b>\n`;
        for (const o of pendingConfirm.slice(0, 8)) {
            text += `• <code>${o.id}</code> — ${o.user_name} | ${o.product_name}\n`;
        }
    } else {
        text += `<i>Tidak ada order yang perlu dikonfirmasi saat ini.</i>`;
    }
    await ctx.replyWithHTML(text, Markup.inlineKeyboard([[Markup.button.callback('⬅️ Admin Panel', 'back_admin')]]));
});

// Admin: guide broadcast
bot.action('admin_broadcast_guide', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Not admin');
    await ctx.answerCbQuery();
    const totalUsers = Object.keys(db.users || {}).length;
    await ctx.replyWithHTML(
        `📡 <b>Broadcast ke Semua User</b>\n━━━━━━━━━━━━━━━━━━\n\n` +
        `<b>Format:</b> <code>/broadcast PESAN_KAMU</code>\n\n` +
        `<b>Contoh:</b>\n<code>/broadcast 🎉 Halo! Ada update baru ClipperSkuy v2.0!</code>\n\n` +
        `📤 Akan dikirim ke <b>${totalUsers} user</b> terdaftar.\n\n` +
        `<i>⚠️ Pastikan pesan sudah benar sebelum send — tidak bisa ditarik.</i>`,
        Markup.inlineKeyboard([[Markup.button.callback('⬅️ Admin Panel', 'back_admin')]])
    );
});

// Admin: guide flashsale
bot.action('admin_flashsale_guide', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Not admin');
    await ctx.answerCbQuery();
    await ctx.replyWithHTML(
        `\n⚡ <b>FLASH SALE</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
        `┌─── 📊 <b>FORMAT PERSEN</b> ───┐\n` +
        `│                                                                 │\n` +
        `│  <code>/flashsale PRODUCT DISKON% MENIT PESAN</code>  │\n` +
        `│                                                                 │\n` +
        `│  Contoh:                                                    │\n` +
        `│  <code>/flashsale pro_30 30 60 Promo!</code>           │\n` +
        `│  → Rp 69.000 diskon 30% = <b>Rp 48.300</b>  │\n` +
        `│                                                                 │\n` +
        `└─────────────────────────┘\n\n` +
        `┌─── 💰 <b>FORMAT RUPIAH</b> ───┐\n` +
        `│                                                                 │\n` +
        `│  <code>/flashsale PRODUCT rpJUMLAH MENIT PESAN</code>│\n` +
        `│                                                                 │\n` +
        `│  Contoh:                                                    │\n` +
        `│  <code>/flashsale pro_30 rp20000 60 Diskon!</code>  │\n` +
        `│  → Rp 69.000 - Rp 20.000 = <b>Rp 49.000</b> │\n` +
        `│                                                                 │\n` +
        `└─────────────────────────┘\n\n` +
        `<b>📦 Product ID:</b>\n` +
        Object.entries(PRODUCTS).map(([id, p]) => `  ▸ <code>${id}</code> — ${p.name} (${p.desc})`).join('\n') + '\n\n' +
        `<i>Bot otomatis broadcast ke semua user\n+ generate kode diskon + kuota 50 user.</i>`,
        Markup.inlineKeyboard([[Markup.button.callback('◀️  Admin Panel', 'back_admin')]])
    );
});

// Admin: guide blacklist
bot.action('admin_blacklist_guide', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Not admin');
    await ctx.answerCbQuery();
    const blacklistCount = Object.keys(db.blacklisted_keys || {}).length;
    await ctx.replyWithHTML(
        `🚫 <b>Blacklist License Key</b>\n━━━━━━━━━━━━━━━━━━\n\n` +
        `<b>Blacklist:</b> <code>/blacklist LICENSE_KEY ALASAN</code>\n` +
        `<b>Hapus blacklist:</b> <code>/unblacklist LICENSE_KEY</code>\n\n` +
        `<b>Contoh:</b>\n<code>/blacklist CS-KEY123 Dishare ilegal</code>\n\n` +
        `🚫 Total blacklisted: <b>${blacklistCount}</b> key`,
        Markup.inlineKeyboard([[Markup.button.callback('⬅️ Admin Panel', 'back_admin')]])
    );
});

// Admin: guide blockuser
bot.action('admin_blockuser_guide', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Not admin');
    await ctx.answerCbQuery();
    const blockedCount = Object.keys(db.blocked_users || {}).length;
    await ctx.replyWithHTML(
        `🚫 <b>Blokir/Unblokir User</b>\n━━━━━━━━━━━━━━━━━━\n\n` +
        `<b>Blokir:</b> <code>/blockuser USER_ID ALASAN</code>\n` +
        `<b>Unblokir:</b> <code>/unblockuser USER_ID</code>\n\n` +
        `<b>Contoh:</b>\n<code>/blockuser 123456789 Spam bot</code>\n\n` +
        `🚫 Total diblokir: <b>${blockedCount}</b> user`,
        Markup.inlineKeyboard([[Markup.button.callback('⬅️ Admin Panel', 'back_admin')]])
    );
});

// Admin: semua command
bot.action('admin_all_commands', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Not admin');
    await ctx.answerCbQuery();
    await ctx.replyWithHTML(
        `📖 <b>SEMUA COMMAND ADMIN</b>\n━━━━━━━━━━━━━━━━━━\n\n` +
        `<b>📊 Analitik:</b>\n` +
        `• /admin — Panel utama\n• /stats — Dashboard lengkap\n• /exportcsv — Export data CSV\n\n` +
        `<b>✅ Order & Key:</b>\n` +
        `• /konfirmasi ORDER_ID — Konfirmasi manual\n• /sendkey USER_ID PRODUCT_ID — Kirim key\n\n` +
        `<b>📡 Komunikasi:</b>\n` +
        `• /broadcast PESAN — Kirim ke semua user\n• /reply TICKET_ID JAWABAN — Balas tiket\n• /flashsale PRODUCT DISKON% MENIT PESAN\n\n` +
        `<b>🛡 Keamanan:</b>\n` +
        `• /blacklist KEY ALASAN — Blacklist license\n• /unblacklist KEY\n• /blockuser USER_ID ALASAN — Blokir user\n• /unblockuser USER_ID\n\n` +
        `<b>🔑 Diskon:</b>\n` +
        `• /newdiskon — Buat kode diskon\n• /hapusdiskon — Hapus kode diskon\n`,
        Markup.inlineKeyboard([[Markup.button.callback('⬅️ Admin Panel', 'back_admin')]])
    );
});

// Back to admin panel
bot.action('back_admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Not admin');
    await ctx.answerCbQuery();
    await ctx.reply('Ketik /admin untuk buka panel admin.');
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

// ============ ADMIN SEND KEY (kirim key langsung tanpa order) ============
// Format: /sendkey USER_ID PRODUCT_ID [HARGA]
// Contoh: /sendkey 123456789 pro_30 69000
// Digunakan untuk: transfer manual, order hilang, kompensasi, testing
bot.command('sendkey', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Bukan admin.');
    const parts = ctx.message.text.split(' ');
    if (parts.length < 3) {
        return ctx.replyWithHTML(
            `❌ <b>Format:</b> <code>/sendkey USER_ID PRODUCT_ID [HARGA]</code>\n\n` +
            `📌 Contoh:\n<code>/sendkey 123456789 pro_30</code>\n<code>/sendkey 123456789 pro_30 69000</code>\n\n` +
            `📦 <b>Product ID yang tersedia:</b>\n` +
            Object.entries(PRODUCTS).map(([id, p]) => `• <code>${id}</code> — ${p.name} ${p.desc}`).join('\n')
        );
    }

    const targetUserId = parts[1].trim();
    const productId = parts[2].trim();
    const customPrice = parts[3] ? parseInt(parts[3]) : null;

    const product = PRODUCTS[productId];
    if (!product) {
        return ctx.replyWithHTML(
            `❌ Product ID <code>${productId}</code> tidak ditemukan.\n\n📦 Yang tersedia:\n` +
            Object.keys(PRODUCTS).map(id => `• <code>${id}</code>`).join('\n')
        );
    }

    await ctx.reply(`⏳ Generating license key untuk ${productId}...`);

    // Generate key
    const licenseKey = await generateLicenseKey(product.tier, product.duration);
    if (!licenseKey) {
        return ctx.reply('❌ Gagal generate license key! Cek License Server.');
    }

    // Buat order record
    const orderId = generateOrderId();
    const finalPrice = customPrice || product.price;
    const order = {
        id: orderId,
        user_id: targetUserId,
        user_name: `User ${targetUserId}`,
        username: '',
        product_id: productId,
        product_name: `${product.name} — ${product.desc}`,
        tier: product.tier,
        duration: product.duration,
        original_price: finalPrice,
        price: finalPrice,
        discount_code: null,
        discount_percent: 0,
        status: 'paid',
        license_key: licenseKey,
        payment_method: 'admin_manual',
        created_at: new Date().toISOString(),
        paid_at: new Date().toISOString()
    };

    db.orders.push(order);
    if (!db.stats) db.stats = { total_orders: 0, total_revenue: 0 };
    db.stats.total_orders = (db.stats.total_orders || 0) + 1;
    db.stats.total_revenue = (db.stats.total_revenue || 0) + finalPrice;
    saveDB(db);

    // Kirim key ke user
    const userMsg = `
🎉 <b>License Key ClipperSkuy</b>
━━━━━━━━━━━━━━━━━━

📦 <b>Produk:</b> ${product.name}
⏱ <b>Durasi:</b> ${product.desc}
💳 <b>Pembayaran:</b> Dikonfirmasi Admin

━━━━━━━━━━━━━━━━━━
🔑 <b>License Key kamu:</b>

<code>${licenseKey}</code>

━━━━━━━━━━━━━━━━━━
📖 <b>Cara Aktivasi:</b>
1. Buka ClipperSkuy
2. Klik menu License/Settings
3. Masukkan key di atas
4. Klik Activate

Selamat menikmati ClipperSkuy! 🚀
Butuh bantuan? /help`;

    let sent = true;
    try {
        await ctx.telegram.sendMessage(targetUserId, userMsg, { parse_mode: 'HTML' });
    } catch (e) {
        sent = false;
        console.error('sendkey error:', e.message);
    }

    // Report ke admin
    await ctx.replyWithHTML(
        `✅ <b>KEY TERKIRIM${sent ? '' : ' (GAGAL KIRIM)'}</b>\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `👤 User ID: <code>${targetUserId}</code>\n` +
        `📦 Produk: ${product.name} — ${product.desc}\n` +
        `💰 Harga: ${formatPrice(finalPrice)}\n` +
        `🆔 Order: <code>${orderId}</code>\n` +
        `🔑 Key: <code>${licenseKey}</code>\n` +
        `${sent ? '✅ Pesan berhasil dikirim ke user' : '⚠️ Gagal kirim ke user — cek User ID'}`
    );

    // Log ke channel
    await sendLog(ctx, `💳 <b>SENDKEY MANUAL</b>\n👤 User: <code>${targetUserId}</code>\n📦 ${product.name} ${product.desc}\n💰 ${formatPrice(finalPrice)}\n🔑 <code>${licenseKey}</code>`);
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

    // ── REFERRAL REWARD SYSTEM ──
    if (order.referral_by) {
        const referrerId = order.referral_by;
        const referralCount = db.orders.filter(o => o.referral_by === referrerId && o.status === 'paid').length;
        const REWARDS = [
            { milestone: 3, type: 'discount', percent: 15, label: '🎁 Diskon 15%' },
            { milestone: 5, type: 'discount', percent: 25, label: '🎁 Diskon 25%' },
            { milestone: 10, type: 'free_key', label: '🏆 Free Pro 30 Hari' }
        ];
        const reward = REWARDS.find(r => r.milestone === referralCount);
        if (reward) {
            try {
                if (reward.type === 'discount') {
                    const rewardCode = 'REWARD' + referralCount + '_' + Date.now().toString(36).toUpperCase().slice(-4);
                    if (!db.discounts) db.discounts = {};
                    db.discounts[rewardCode] = {
                        active: true, percent: reward.percent, type: 'percent',
                        quota: 1, used: 0, expires_at: null, owner_id: referrerId, products: []
                    };
                    saveDB(db);
                    await ctx.telegram.sendMessage(referrerId,
                        `\n🎉 <b>REWARD REFERRAL!</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
                        `Selamat! Kamu sudah mengajak <b>${referralCount} teman</b> berbelanja! 🥳\n\n` +
                        `┌──────────────────────┐\n` +
                        `│                                                            │\n` +
                        `│  ${reward.label}                                    │\n` +
                        `│  Kode: <code>${rewardCode}</code>                    │\n` +
                        `│  Berlaku 1x pakai                                │\n` +
                        `│                                                            │\n` +
                        `└──────────────────────┘\n\n` +
                        `💡 Ketik <code>/promo ${rewardCode}</code> saat beli`,
                        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🛒  Pakai Sekarang', 'catalog')]]) }
                    );
                } else if (reward.type === 'free_key') {
                    const freeKey = await generateLicenseKey('pro', 30);
                    if (freeKey) {
                        await ctx.telegram.sendMessage(referrerId,
                            `\n🏆 <b>REWARD SPESIAL!</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
                            `Luar biasa! Kamu sudah mengajak <b>${referralCount} teman!</b> 🎊\n\n` +
                            `┌──────────────────────┐\n` +
                            `│                                                            │\n` +
                            `│  🔑  <b>FREE LICENSE KEY</b>                  │\n` +
                            `│  ClipperSkuy Pro — 30 Hari           │\n` +
                            `│                                                            │\n` +
                            `│  <code>${freeKey}</code>                       │\n` +
                            `│                                                            │\n` +
                            `└──────────────────────┘\n\n` +
                            `Terima kasih atas kontribusimu! 🙏🏻`,
                            { parse_mode: 'HTML' }
                        );
                    }
                }
                await sendLog(bot, `🎁 <b>REFERRAL REWARD</b>\n👤 ${referrerId} → Milestone ${referralCount} → ${reward.label}`);
            } catch (e) { console.error('Referral reward error:', e.message); }
        }
    }

    // ── VIP TIER SYSTEM ──
    if (user && user.order_count >= 2 && !user.vip) {
        user.vip = true;
        user.vip_since = new Date().toISOString();
        // Generate permanent VIP discount code
        const vipCode = 'VIP' + order.user_id.slice(-4) + '_5';
        if (!db.discounts) db.discounts = {};
        if (!db.discounts[vipCode]) {
            db.discounts[vipCode] = {
                active: true, percent: 5, type: 'percent',
                quota: null, used: 0, expires_at: null,
                owner_id: order.user_id, products: []
            };
        }
        user.vip_code = vipCode;
        saveDB(db);

        try {
            await ctx.telegram.sendMessage(order.user_id,
                `\n👑 <b>SELAMAT! KAMU SEKARANG VIP!</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
                `Terima kasih sudah menjadi pelanggan setia! 🎉\n\n` +
                `┌──────────────────────┐\n` +
                `│                                                            │\n` +
                `│  👑  <b>VIP MEMBER</b>                                │\n` +
                `│                                                            │\n` +
                `│  🎁  Diskon <b>5%</b> SELAMANYA               │\n` +
                `│  🎟  Kode: <code>${vipCode}</code>                    │\n` +
                `│  ♾  Bisa dipakai berkali-kali             │\n` +
                `│  ⚡  Priority support                          │\n` +
                `│                                                            │\n` +
                `└──────────────────────┘\n\n` +
                `💡 Ketik <code>/promo ${vipCode}</code> setiap kali beli!`,
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([[Markup.button.callback('🛒  Belanja Lagi', 'catalog')]])
                }
            );
        } catch (e) { }
        await sendLog(bot, `👑 <b>VIP BARU</b>\n👤 ${order.user_name} (@${order.username || '-'})\n📊 Total order: ${user.order_count}`);
    }

    // Update global stats
    db.stats.total_orders++;
    db.stats.total_revenue += order.price;
    saveDB(db);

    // Send license key to user
    const successMsg = `
╔══════════════════════╗
     🎉 <b>PEMBAYARAN BERHASIL</b> 🎉
╚══════════════════════╝

📦  ${order.product_name}
🆔  <code>${orderId}</code>
💰  ${formatPrice(order.price)}

┌──────────────────────┐
│                                                            │
│  🔑  <b>LICENSE KEY KAMU</b>                       │
│                                                            │
│  <code>${licenseKey}</code>               │
│                                                            │
└──────────────────────┘

📋 <b>Cara Aktivasi:</b>
  1 ▸  Buka ClipperSkuy di PC
  2 ▸  <b>Settings</b>  →  <b>License</b>
  3 ▸  Paste key di atas
  4 ▸  Klik <b>"Activate"</b>
  5 ▸  Done! Semua fitur aktif 🚀

⚠️  <i>1 key = 1 PC · Simpan baik-baik</i>

Terima kasih! 🙏🏻

▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
👥 <b>Join Grup Support Premium:</b>
${SUPPORT_GROUP}`;

    try {
        await ctx.telegram.sendMessage(order.user_id, successMsg, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.url('👥  Gabung Grup Support', SUPPORT_GROUP)],
                [Markup.button.callback('🛒  Beli Lagi', 'catalog')]
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
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬

⚡ <b>ClipperSkuy</b> — AI Video Clip Generator

<i>Ubah video panjang jadi konten viral
untuk TikTok, Reels & YouTube Shorts</i>

┌─── ✨ <b>FITUR UNGGULAN</b> ───┐
│                                                           │
│  🧠 AI Clip Detection + Viral Score   │
│  💬 Auto Subtitle (Whisper AI)          │
│  🎯 Face Tracking & Reframing      │
│  🎙️ Podcast Mode (Split Screen)  │
│  🔊 Audio Enhancement                   │
│  📊 Progress Bar & Hook Text        │
│  🎬 Auto B-Roll (Pexels)                  │
│  📱 Multi-Platform Export                │
│  🖥️ 100% Offline & Private             │
│                                                           │
└──────────────────────┘

🔗  <b>Website:</b>  clipperskuy.my.id
📖  <b>Panduan:</b>  clipperskuy.my.id/guide

💡 <i>Trial 7 hari gratis — download sekarang!</i>`;

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🛒  Lihat Produk', 'catalog')],
            [Markup.button.callback('◀️  Menu Utama', 'back_start')]
        ])
    });
});

// ============ CONTACT ============
bot.action('contact', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
        `\n💬 <b>HUBUNGI ADMIN</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
        `Hubungi admin untuk:\n\n` +
        `  ▸  Custom order / Enterprise\n` +
        `  ▸  Kendala pembayaran\n` +
        `  ▸  Bantuan teknis\n` +
        `  ▸  Reset aktivasi license\n\n` +
        `┌──────────────────┐\n` +
        `│  📱  <b>WhatsApp</b>  wa.me/628151616315  │\n` +
        `│  💬  <b>Telegram</b>  @skuysdazen              │\n` +
        `└──────────────────┘\n\n` +
        `<i>Respon max 1×24 jam (biasanya lebih cepat)</i>`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.url('📱  WhatsApp', 'https://wa.me/628151616315')],
                [Markup.button.callback('◀️  Menu Utama', 'back_start')]
            ])
        }
    );
});

// ============ HELP ============
bot.action('help', async (ctx) => {
    await ctx.answerCbQuery();
    const text = `
❓ <b>BANTUAN & FAQ</b>
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬

┌─── 🛒 <b>CARA ORDER</b> ───┐
│  1 ▸  Ketuk "Beli License"                  │
│  2 ▸  Pilih tier (Pro / Enterprise)      │
│  3 ▸  Pilih durasi                                  │
│  4 ▸  Ketuk "Bayar Sekarang"            │
│  5 ▸  Scan QRIS & bayar                     │
│  6 ▸  Key otomatis dikirim! 🎉          │
└──────────────────────┘

┌─── 🔑 <b>CARA AKTIVASI</b> ───┐
│  1 ▸  Buka ClipperSkuy di PC             │
│  2 ▸  Settings → License                     │
│  3 ▸  Paste key                                       │
│  4 ▸  Klik "Activate"                              │
└──────────────────────┘

<b>📋 Command:</b>
  /start · /catalog · /myorders · /help

<b>❓ FAQ:</b>
  ▸  1 key = 1 PC (terikat Machine ID)
  ▸  Pindah PC? Hubungi admin
  ▸  Key expired? Beli key baru
  ▸  Refund? Hubungi admin`;

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🛒  Beli License', 'catalog')],
            [Markup.button.callback('◀️  Menu Utama', 'back_start')]
        ])
    });
});

// ============ BACK TO START ============
bot.action('back_start', async (ctx) => {
    await ctx.answerCbQuery();
    const name = ctx.from.first_name || 'User';
    const text = `
╔══════════════════════╗
     ⚡ <b>CLIPPERSKUY</b> ⚡
╚══════════════════════╝

Hai <b>${name}</b>! 👋🏻
<i>Pilih menu di bawah:</i>`;

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🛒  Beli License', 'catalog'),
            Markup.button.callback('⬇️  Download', 'download_action')],
            [Markup.button.callback('📋  Riwayat', 'my_orders'),
            Markup.button.callback('ℹ️  Tentang', 'about')],
            [Markup.button.callback('💬  Admin', 'contact'),
            Markup.button.callback('❓  FAQ', 'help')]
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
bot.on('text', async (ctx, next) => {
    // PENTING: skip jika ini adalah command (/download, /referral, dll)
    if (ctx.message.text.startsWith('/')) return next();

    const userId = String(ctx.from.id);
    const user = db.users[userId];
    // Jika user tidak sedang input promo, lanjut ke handler berikutnya
    if (!user?.waiting_promo_for) return next();

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


// ============================================================
// FITUR #1 — CEK STATUS LICENSE
// ============================================================
bot.command('ceklicense', async (ctx) => {
    const userId = String(ctx.from.id);
    const paidOrders = db.orders.filter(o => o.user_id === userId && o.status === 'paid' && o.license_key);
    if (paidOrders.length === 0) {
        return ctx.replyWithHTML('❌ Kamu belum punya license aktif.\n\nGunakan /start untuk beli.');
    }
    let text = `🔑 <b>License Kamu</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
    for (const o of paidOrders) {
        const paidAt = new Date(o.paid_at);
        const expireAt = o.duration > 0 ? new Date(paidAt.getTime() + o.duration * 86400000) : null;
        const now = new Date();
        const isExpired = expireAt && expireAt < now;
        const daysLeft = expireAt ? Math.ceil((expireAt - now) / 86400000) : -1;
        const statusIcon = o.duration === 0 ? '♾️ Lifetime' : isExpired ? '❌ Expired' : `✅ Aktif (${daysLeft} hari lagi)`;
        text += `📦 <b>${o.product_name}</b>\n` +
            `🔑 <code>${o.license_key}</code>\n` +
            `📅 Beli: ${paidAt.toLocaleDateString('id-ID')}\n` +
            `${expireAt ? `⏱ Expired: ${expireAt.toLocaleDateString('id-ID')}\n` : ''}` +
            `📊 Status: ${statusIcon}\n\n`;
    }
    await ctx.replyWithHTML(text, Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Perpanjang License', 'renewal_menu')],
        [Markup.button.callback('⬅️ Menu Utama', 'back_start')]
    ]));
});

// ============================================================
// FITUR #5 — RENEWAL CEPAT
// ============================================================
bot.action('renewal_menu', async (ctx) => {
    await ctx.answerCbQuery();
    const p30 = PRODUCTS.pro_30;
    const p90 = PRODUCTS.pro_90;
    const p365 = PRODUCTS.pro_365;
    await ctx.replyWithHTML(
        `🔄 <b>PERPANJANG LICENSE</b>\n━━━━━━━━━━━━━━━━━━\nPilih durasi perpanjangan:\n\n` +
        `1️⃣ 30 Hari — <b>${formatPrice(p30.price)}</b>\n` +
        `2️⃣ 90 Hari — <b>${formatPrice(p90.price)}</b> 💰 HEMAT 16%\n` +
        `3️⃣ 365 Hari — <b>${formatPrice(p365.price)}</b> 🔥 HEMAT 58%`,
        Markup.inlineKeyboard([
            [Markup.button.callback(`🔄 Perpanjang 30 Hari — ${formatPrice(p30.price)}`, 'buy_pro_30')],
            [Markup.button.callback(`🔄 Perpanjang 90 Hari — ${formatPrice(p90.price)}`, 'buy_pro_90')],
            [Markup.button.callback(`🔄 Perpanjang 365 Hari — ${formatPrice(p365.price)}`, 'buy_pro_365')],
        ])
    );
});

// ============================================================
// FITUR #2 — BROADCAST (Admin)
// Format: /broadcast PESAN KAMU DI SINI
// ============================================================
bot.command('broadcast', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Bukan admin.');
    const text = ctx.message.text.replace('/broadcast', '').trim();
    if (!text) return ctx.reply('❌ Format: /broadcast PESAN\nContoh: /broadcast 🎉 Promo 50% hari ini saja!');

    const allUserIds = Object.keys(db.users);
    let success = 0, failed = 0;
    await ctx.reply(`📡 Mengirim broadcast ke ${allUserIds.length} user...`);

    for (const uid of allUserIds) {
        try {
            await ctx.telegram.sendMessage(uid,
                `📢 <b>Pesan dari ClipperSkuy</b>\n━━━━━━━━━━━━━━━━━━\n\n${text}`,
                { parse_mode: 'HTML' }
            );
            success++;
            await new Promise(r => setTimeout(r, 50)); // Rate limit protection
        } catch (e) { failed++; }
    }
    await ctx.reply(`✅ Broadcast selesai!\n📤 Terkirim: ${success}\n❌ Gagal: ${failed}`);
});

// ============================================================
// FITUR #7 — FAQ / HELP
// ============================================================
bot.action('help', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.replyWithHTML(
        `❓ <b>BANTUAN & SEMUA FITUR</b>\n━━━━━━━━━━━━━━━━━━\n\n` +
        `<b>📦 Produk & Pembelian</b>\n` +
        `🛒 Beli license → klik tombol di bawah\n` +
        `📋 Riwayat semua transaksi → klik tombol\n\n` +
        `<b>🔑 License Saya</b>\n` +
        `🔑 Cek status & expiry → klik tombol\n` +
        `🔄 Perpanjang license → dari menu Cek License\n\n` +
        `<b>⬇️ Download & Aktivasi</b>\n` +
        `⬇️ Download app → klik tombol di bawah\n` +
        `🔑 Aktivasi: ClipperSkuy → Settings → License → Activate\n\n` +
        `<b>🎁 Referral & Promo</b>\n` +
        `🎁 Program referral & kode diskon → klik tombol\n` +
        `🎫 Punya kode promo? Masukkan saat checkout\n\n` +
        `<b>📞 Support & Bantuan</b>\n` +
        `🎫 Buat tiket support → klik tombol / ketik /tiket\n` +
        `👤 Cek ID Telegram kamu → ketik /myid\n` +
        `📞 Hubungi admin langsung → klik tombol\n\n` +
        `<i>⏱ Pembayaran otomatis terdeteksi. Key dikirim dalam 30 detik.</i>`,
        Markup.inlineKeyboard([
            [Markup.button.callback('🛒 Beli License', 'catalog'),
            Markup.button.callback('🔑 Cek License', 'my_license')],
            [Markup.button.callback('⬇️ Download App', 'download_action'),
            Markup.button.callback('📋 Riwayat Beli', 'my_orders')],
            [Markup.button.callback('🎁 Referral & Diskon', 'referral_info'),
            Markup.button.callback('🎫 Buat Tiket', 'open_ticket')],
            [Markup.button.callback('📞 Hubungi Admin', 'contact'),
            Markup.button.callback('⬅️ Menu Utama', 'back_start')],
        ])
    );
});

bot.command('help', async (ctx) => {
    await ctx.replyWithHTML(
        `❓ <b>BANTUAN & SEMUA FITUR ClipperSkuy</b>\n━━━━━━━━━━━━━━━━━━\n\n` +
        `<b>👤 Command untuk Semua User:</b>\n` +
        `🛍 /start — Menu utama (semua fitur dari sini)\n` +
        `🔑 /ceklicense — Cek status & expiry license\n` +
        `📋 /riwayat — Histori semua pembelian kamu\n` +
        `⬇️ /download — Link download app terbaru\n` +
        `🎁 /referral — Kode referral & program diskon\n` +
        `🎫 /tiket PERTANYAAN — Buat tiket support\n` +
        `🔍 /cektiket ID — Cek status tiket kamu\n` +
        `👤 /myid — Lihat Telegram ID kamu\n\n` +
        `<b>⏱ Cara Bayar:</b>\n` +
        `/start → Beli License → Pilih produk → Bayar → Key otomatis dikirim\n\n` +
        `<b>⏱ Cara Aktivasi Key:</b>\n` +
        `Buka ClipperSkuy → Settings → License → Paste key → Activate\n\n` +
        `<i>Butuh bantuan lain? Hubungi admin atau buat tiket.</i>`,
        Markup.inlineKeyboard([
            [Markup.button.callback('🛒 Beli License', 'catalog'),
            Markup.button.callback('🔑 Cek License', 'my_license')],
            [Markup.button.callback('🎫 Buat Tiket', 'open_ticket'),
            Markup.button.callback('📞 Hubungi Admin', 'contact')],
            [Markup.button.callback('⬅️ Menu Utama', 'back_start')]
        ])
    );
});

// ============================================================
// FITUR — LEADERBOARD REFERRAL
// ============================================================
bot.command('leaderboard', async (ctx) => {
    // Hitung referral per user
    const referralMap = {};
    (db.orders || []).filter(o => o.referral_by && o.status === 'paid').forEach(o => {
        referralMap[o.referral_by] = (referralMap[o.referral_by] || 0) + 1;
    });

    const sorted = Object.entries(referralMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    if (sorted.length === 0) {
        return ctx.replyWithHTML(
            `🏆 <b>LEADERBOARD REFERRAL</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n<i>Belum ada referral. Jadi yang pertama!</i>`,
            Markup.inlineKeyboard([[Markup.button.callback('🎁 Lihat Kode Referral', 'referral_info')]])
        );
    }

    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    let board = '';
    for (let i = 0; i < sorted.length; i++) {
        const [uid, count] = sorted[i];
        const user = db.users[uid];
        const name = user?.name || uid.slice(-6);
        const vipBadge = user?.vip ? ' 👑' : '';
        board += `${medals[i]}  <b>${name}</b>${vipBadge}  —  ${count} referral\n`;
    }

    const myId = String(ctx.from.id);
    const myCount = referralMap[myId] || 0;
    const myRank = sorted.findIndex(s => s[0] === myId) + 1;

    await ctx.replyWithHTML(
        `\n🏆 <b>LEADERBOARD REFERRAL</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
        `┌──────────────────────┐\n` +
        `│                                                            │\n` +
        board.split('\n').filter(l => l).map(l => `│  ${l}               │`).join('\n') + `\n` +
        `│                                                            │\n` +
        `└──────────────────────┘\n\n` +
        `📊 <b>Posisimu:</b> ${myRank > 0 ? `#${myRank}` : 'Belum masuk'} (${myCount} referral)\n\n` +
        `<i>Top referrer bulan ini dapat bonus reward! 🎁\nShare kode referralmu untuk naik peringkat.</i>`,
        Markup.inlineKeyboard([
            [Markup.button.callback('🎁 Lihat Kode Referral', 'referral_info')],
            [Markup.button.callback('◀️ Menu Utama', 'back_start')]
        ])
    );
});

// ============================================================
// FITUR — CEK STATUS VIP
// ============================================================
bot.command('vip', async (ctx) => {
    const userId = String(ctx.from.id);
    const user = db.users[userId];

    if (!user || !user.vip) {
        const orderCount = user?.order_count || 0;
        const remaining = Math.max(0, 2 - orderCount);
        return ctx.replyWithHTML(
            `\n👑 <b>VIP MEMBERSHIP</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
            `Status: <b>Belum VIP</b>\n\n` +
            `┌──────────────────────┐\n` +
            `│                                                            │\n` +
            `│  📊  Order kamu: <b>${orderCount}</b>/2                     │\n` +
            `│  🎯  Butuh <b>${remaining}</b> order lagi              │\n` +
            `│                                                            │\n` +
            `│  ✨  <b>Keuntungan VIP:</b>                        │\n` +
            `│  🎁  Diskon 5% selamanya                   │\n` +
            `│  ♾  Unlimited pakai kode VIP              │\n` +
            `│  ⚡  Priority support                          │\n` +
            `│                                                            │\n` +
            `└──────────────────────┘`,
            Markup.inlineKeyboard([
                [Markup.button.callback('🛒 Beli Sekarang', 'catalog')],
                [Markup.button.callback('◀️ Menu Utama', 'back_start')]
            ])
        );
    }

    const vipSince = new Date(user.vip_since).toLocaleDateString('id-ID');
    await ctx.replyWithHTML(
        `\n👑 <b>VIP MEMBERSHIP</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
        `┌──────────────────────┐\n` +
        `│                                                            │\n` +
        `│  👑  <b>VIP MEMBER AKTIF</b>                      │\n` +
        `│                                                            │\n` +
        `│  📅  Sejak: ${vipSince}                          │\n` +
        `│  📊  Total order: <b>${user.order_count}</b>                  │\n` +
        `│  💰  Total belanja: <b>${formatPrice(user.total_spent || 0)}</b>  │\n` +
        `│                                                            │\n` +
        `│  🎁  Diskon <b>5%</b> selamanya                   │\n` +
        `│  🎟  Kode: <code>${user.vip_code}</code>                    │\n` +
        `│                                                            │\n` +
        `└──────────────────────┘\n\n` +
        `💡 Pakai <code>/promo ${user.vip_code}</code> setiap beli!`,
        Markup.inlineKeyboard([
            [Markup.button.callback('🛒 Belanja Lagi', 'catalog')],
            [Markup.button.callback('◀️ Menu Utama', 'back_start')]
        ])
    );
});

// ============================================================
// FITUR #8 — DOWNLOAD LINKS
// ============================================================
const DOWNLOAD_URL = process.env.DOWNLOAD_URL || 'https://github.com/tendo81/clipperskuy/releases';
const DOCS_URL = process.env.DOCS_URL || 'https://t.me/+GANTI_DENGAN_LINK_GRUP';

bot.command('download', async (ctx) => {
    const hasDownloadUrl = !!process.env.DOWNLOAD_URL;
    if (hasDownloadUrl) {
        await ctx.replyWithHTML(
            `📥 <b>Download ClipperSkuy</b>\n━━━━━━━━━━━━━━━━━━\n\n` +
            `🖥 <b>Windows (64-bit)</b> — versi terbaru tersedia!\n\n` +
            `<i>Setelah download, aktifkan license di Settings → License</i>`,
            Markup.inlineKeyboard([
                [Markup.button.url('⬇️ Download App', process.env.DOWNLOAD_URL)],
                [Markup.button.url('📖 Grup Support', SUPPORT_GROUP)],
            ])
        );
    } else {
        await ctx.replyWithHTML(
            `🕒 <b>Download Coming Soon!</b>\n━━━━━━━━━━━━━━━━━━\n\n` +
            `🛠 ClipperSkuy sedang dalam tahap pengembangan akhir.\n` +
            `Kami sedang memperbaiki beberapa bug sebelum rilis resmi.\n\n` +
            `📣 <b>Ingin tahu duluan saat rilis?</b>\n` +
            `Gabung grup kami dan aktifkan notifikasi!`,
            Markup.inlineKeyboard([
                [Markup.button.url('📢 Gabung Grup & Dapat Notif Rilis', SUPPORT_GROUP)],
            ])
        );
    }
});

// ============================================================
// FITUR #6 — REFERRAL CODE
// Setiap user dapat referral code unik, diskon 10% untuk pembeli
// User referrer dapat notif + kredit (dicatat di DB)
// ============================================================
function getUserReferralCode(userId) {
    return 'REF' + Buffer.from(String(userId)).toString('base64').replace(/[^A-Z0-9]/gi, '').substring(0, 6).toUpperCase();
}

bot.command('referral', async (ctx) => {
    const userId = String(ctx.from.id);
    const code = getUserReferralCode(userId);
    const referralCount = (db.orders || []).filter(o => o.referral_by === userId && o.status === 'paid').length;

    // Register discount code di db jika belum ada
    if (!db.discounts) db.discounts = {};
    if (!db.discounts[code]) {
        db.discounts[code] = {
            active: true, percent: 10, type: 'percent',
            quota: null, used: 0, expires_at: null,
            owner_id: userId, products: []
        };
        saveDB(db);
    }

    await ctx.replyWithHTML(
        `🎁 <b>Program Referral ClipperSkuy</b>\n━━━━━━━━━━━━━━━━━━\n\n` +
        `<b>🎁 Kode Referral Kamu:</b>\n` +
        `<code>${code}</code>\n\n` +
        `<b>📲 Cara Share ke Teman:</b>\n` +
        `Kirim kode ini ke temanmu — mereka tinggal:\n\n` +
        `<b>✅ Langkah untuk Teman yang Mau Pakai Kode:</b>\n` +
        `1️⃣ Buka @Skuy_bot di Telegram\n` +
        `2️⃣ Ketik perintah: <code>/promo ${code}</code>\n` +
        `3️⃣ Lanjut pilih produk dan bayar\n` +
        `🎉 Diskon 10% otomatis diterapkan!\n\n` +
        `<b>📊 Stats Referral Kamu:</b>\n` +
        `👥 Total referral berhasil: <b>${referralCount}</b>\n\n` +
        `<i>Semakin banyak teman pakai kodemu, semakin banyak kredit kamu!</i>`,
        Markup.inlineKeyboard([
            [Markup.button.callback('🛒 Beli Sekarang', 'catalog')],
            [Markup.button.callback('🏠 Menu Utama', 'back_start')]
        ])
    );
});

// (Referral code sudah otomatis bekerja via sistem diskon yang sudah ada)

// ============================================================
// FITUR #3 & #4 — AUTO NOTIF EXPIRED + LAPORAN HARIAN
// Cron-like: jalankan cek setiap jam
// ============================================================
async function runDailyTasks(botInstance) {
    const now = new Date();
    const WIB = new Date(now.getTime() + 7 * 3600000); // UTC+7
    const hour = WIB.getUTCHours();
    const minute = WIB.getUTCMinutes();

    // ---- NOTIF EXPIRED (cek setiap jam 09:00 WIB) ----
    if (hour === 9 && minute < 60) {
        const paidOrders = (db.orders || []).filter(o => o.status === 'paid' && o.license_key && o.duration > 0 && o.paid_at);
        for (const order of paidOrders) {
            const expireAt = new Date(new Date(order.paid_at).getTime() + order.duration * 86400000);
            const daysLeft = Math.ceil((expireAt - now) / 86400000);
            if (daysLeft === 3 || daysLeft === 1) {
                const alreadySentKey = `notif_${order.id}_d${daysLeft}`;
                if (db.users[order.user_id]?.[alreadySentKey]) continue;
                const renewDiscount = daysLeft === 1 ? 15 : 10;
                const renewCode = 'RENEW' + Date.now().toString(36).toUpperCase().slice(-4);
                if (!db.discounts) db.discounts = {};
                db.discounts[renewCode] = {
                    active: true, percent: renewDiscount, type: 'percent',
                    quota: 1, used: 0, expires_at: expireAt.toISOString(),
                    owner_id: order.user_id, products: []
                };
                try {
                    await botInstance.telegram.sendMessage(order.user_id,
                        `\n⏰ <b>LICENSE SEGERA HABIS!</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
                        `┌──────────────────────┐\n` +
                        `│                                                            │\n` +
                        `│  📦  ${order.product_name}         │\n` +
                        `│  ⏱  Sisa: <b>${daysLeft} hari lagi</b>               │\n` +
                        `│  📅  Expired: ${expireAt.toLocaleDateString('id-ID')}    │\n` +
                        `│                                                            │\n` +
                        `│  🎁  Perpanjang sekarang dapat       │\n` +
                        `│  <b>DISKON ${renewDiscount}%!</b>                            │\n` +
                        `│  Kode: <code>${renewCode}</code>                      │\n` +
                        `│                                                            │\n` +
                        `└──────────────────────┘\n\n` +
                        `💡 Ketik <code>/promo ${renewCode}</code> lalu beli!`,
                        {
                            parse_mode: 'HTML',
                            ...Markup.inlineKeyboard([
                                [Markup.button.callback('🔄  Perpanjang Sekarang', 'catalog')],
                                [Markup.button.callback('📋  Cek License', 'my_license')]
                            ])
                        }
                    );
                    if (!db.users) db.users = {};
                    if (!db.users[order.user_id]) db.users[order.user_id] = {};
                    db.users[order.user_id][alreadySentKey] = true;
                    saveDB(db);
                    console.log(`[Notif] Sent ${daysLeft}d expiry reminder + ${renewDiscount}% code to ${order.user_id}`);
                } catch (e) { console.warn('[Notif] Failed:', e.message); }
            }
        }
    }

    // ---- FOLLOW-UP: belum bayar 30 menit ----
    const pendingOrders = (db.orders || []).filter(o =>
        ['pending', 'waiting_payment', 'waiting_proof'].includes(o.status) &&
        o.created_at && !o.followup_sent
    );
    for (const order of pendingOrders) {
        const minutesSince = Math.floor((now - new Date(order.created_at)) / 60000);
        if (minutesSince >= 30 && minutesSince < 120) {
            try {
                await botInstance.telegram.sendMessage(order.user_id,
                    `\n💭 <b>Hei ${order.user_name || ''}!</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
                    `Kamu punya order yang belum selesai:\n\n` +
                    `┌──────────────────────┐\n` +
                    `│  📦  ${order.product_name}         │\n` +
                    `│  💰  ${formatPrice(order.price)}                              │\n` +
                    `│  🆔  <code>${order.id}</code>                     │\n` +
                    `└──────────────────────┘\n\n` +
                    `⏱ Selesaikan pembayaran sekarang\nsebelum order expired!`,
                    {
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('💳  Bayar Sekarang', `pay_${order.id}`)],
                            [Markup.button.callback('❌  Batalkan Order', `cancel_${order.id}`)]
                        ])
                    }
                );
                order.followup_sent = true;
                saveDB(db);
                console.log(`[FollowUp] Sent reminder for order ${order.id}`);
            } catch (e) { console.warn('[FollowUp] Failed:', e.message); }
        }
    }

    // ---- LAPORAN HARIAN (kirim jam 23:00 WIB ke semua admin) ----
    if (hour === 23 && minute < 60) {
        const today = WIB.toISOString().substring(0, 10); // YYYY-MM-DD
        const reportKey = `daily_report_${today}`;
        if (db[reportKey]) return; // already sent today
        db[reportKey] = true;
        saveDB(db);

        const todayOrders = (db.orders || []).filter(o => {
            if (!o.paid_at) return false;
            const orderWIB = new Date(new Date(o.paid_at).getTime() + 7 * 3600000);
            return o.status === 'paid' && orderWIB.toISOString().substring(0, 10) === today;
        });
        const totalRevenue = todayOrders.reduce((s, o) => s + (o.price || 0), 0);
        const totalAllTime = (db.stats?.total_revenue || 0);

        const report =
            `📊 <b>LAPORAN HARIAN — ${today}</b>\n━━━━━━━━━━━━━━━━━━\n\n` +
            `✅ Order hari ini: <b>${todayOrders.length}</b>\n` +
            `💰 Revenue hari ini: <b>${formatPrice(totalRevenue)}</b>\n` +
            `📈 Total revenue all-time: <b>${formatPrice(totalAllTime)}</b>\n` +
            `👥 Total user: <b>${Object.keys(db.users).length}</b>\n\n` +
            (todayOrders.length > 0
                ? `<b>Detail order hari ini:</b>\n` + todayOrders.map(o =>
                    `• ${o.product_name} — ${formatPrice(o.price)} (${o.user_name || o.user_id})`
                ).join('\n')
                : `<i>Tidak ada order hari ini.</i>`);

        for (const adminId of ADMIN_IDS) {
            try { await botInstance.telegram.sendMessage(adminId, report, { parse_mode: 'HTML' }); } catch (e) { }
        }
        if (LOG_CHANNEL) {
            try { await botInstance.telegram.sendMessage(LOG_CHANNEL, report, { parse_mode: 'HTML' }); } catch (e) { }
        }
        console.log(`[Report] Daily report sent for ${today}`);
    }

    // ---- RATING REQUEST (H+7 setelah beli) ----
    const paidOrders = (db.orders || []).filter(o => o.status === 'paid' && o.paid_at && !o.rating_requested);
    for (const order of paidOrders) {
        const daysSincePaid = Math.floor((now - new Date(order.paid_at)) / 86400000);
        if (daysSincePaid >= 7) {
            try {
                await botInstance.telegram.sendMessage(order.user_id,
                    `⭐ <b>Hei ${order.user_name || ''}!</b>\n\n` +
                    `Sudah 1 minggu kamu pakai ClipperSkuy. Gimana pengalamannya?\n\n` +
                    `Feedback kamu sangat berarti untuk kami berkembang! 🙏`,
                    {
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard([
                            [
                                Markup.button.callback('😍 Keren banget!', `rate_5_${order.id}`),
                                Markup.button.callback('👍 Bagus', `rate_4_${order.id}`)
                            ],
                            [
                                Markup.button.callback('😐 Biasa', `rate_3_${order.id}`),
                                Markup.button.callback('👎 Kurang', `rate_2_${order.id}`)
                            ]
                        ])
                    }
                );
                order.rating_requested = true;
                saveDB(db);
            } catch (e) { }
        }
    }
}

// Handle rating callbacks
bot.action(/^rate_(\d)_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('Terima kasih! ⭐');
    const rating = ctx.match[1];
    const orderId = ctx.match[2];
    const order = db.orders.find(o => o.id === orderId);
    if (order) { order.rating = parseInt(rating); saveDB(db); }
    const stars = '⭐'.repeat(parseInt(rating));
    await ctx.editMessageText(
        `${stars} <b>Rating diterima!</b>\n\nTerima kasih atas feedback-mu ${rating}/5!\nSampai jumpa di update berikutnya 🚀`,
        { parse_mode: 'HTML' }
    );
    // Log ke admin
    if (order) {
        await sendLog({ telegram: ctx.telegram },
            `⭐ <b>RATING BARU</b>\n👤 ${order.user_name}\n📦 ${order.product_name}\n⭐ ${rating}/5 ${stars}`
        );
    }
});

// Jalankan daily tasks setiap 5 menit (cron-like pattern)
function startDailyTaskScheduler(botInstance) {
    console.log('[Scheduler] Daily task scheduler started');
    setInterval(() => {
        runDailyTasks(botInstance).catch(e => console.warn('[Scheduler] Error:', e.message));
    }, 5 * 60 * 1000); // setiap 5 menit
    // Langsung run sekali saat startup
    setTimeout(() => runDailyTasks(botInstance).catch(() => { }), 10000);
}


// ═══════════════════════════════════════════════════════════════
// FITUR #1 — TIKET SUPPORT
// User: /tiket PERTANYAAN — Admin: reply via /reply TICKET_ID JAWABAN
// ═══════════════════════════════════════════════════════════════
bot.command('tiket', async (ctx) => {
    const userId = String(ctx.from.id);
    const text = ctx.message.text.replace('/tiket', '').trim();
    if (!text) return ctx.replyWithHTML('❌ Format: <code>/tiket PERTANYAAN KAMU</code>\nContoh: <code>/tiket Kenapa license saya tidak aktif?</code>');

    if (!db.tickets) db.tickets = [];
    const ticketId = 'TKT-' + Date.now().toString(36).toUpperCase();
    const ticket = {
        id: ticketId, user_id: userId,
        user_name: ctx.from.first_name, username: ctx.from.username || '',
        message: text, status: 'open',
        created_at: new Date().toISOString(), replied_at: null, reply: null
    };
    db.tickets.push(ticket);
    saveDB(db);

    await ctx.replyWithHTML(
        `✅ <b>Tiket Support Dibuat!</b>\n━━━━━━━━━━━━━━━━━━\n` +
        `🎫 ID Tiket: <code>${ticketId}</code>\n` +
        `📝 Pertanyaan: ${text}\n\n` +
        `⏳ Admin akan membalas dalam 1×24 jam.\nSimpan ID tiket untuk cek status: <code>/cektiket ${ticketId}</code>`
    );
    for (const adminId of ADMIN_IDS) {
        try {
            await ctx.telegram.sendMessage(adminId,
                `🎫 <b>TIKET BARU!</b>\n━━━━━━━━━━━━━━━━━━\n` +
                `🆔 ID: <code>${ticketId}</code>\n` +
                `👤 ${ticket.user_name} (@${ticket.username || '-'}) | ID: <code>${userId}</code>\n` +
                `📝 ${text}\n\n` +
                `Balas dengan: <code>/reply ${ticketId} JAWABAN_KAMU</code>`,
                { parse_mode: 'HTML' }
            );
        } catch (e) { }
    }
});

bot.command('cektiket', async (ctx) => {
    const ticketId = ctx.message.text.split(' ')[1]?.trim();
    if (!ticketId) return ctx.reply('❌ Format: /cektiket TICKET_ID');
    const ticket = (db.tickets || []).find(t => t.id === ticketId);
    if (!ticket) return ctx.reply('❌ Tiket tidak ditemukan.');
    const statusIcon = ticket.status === 'closed' ? '✅ Selesai' : ticket.status === 'replied' ? '💬 Sudah dibalas' : '⏳ Menunggu';
    await ctx.replyWithHTML(
        `🎫 <b>Status Tiket ${ticketId}</b>\n━━━━━━━━━━━━━━━━━━\n` +
        `📝 Pertanyaan: ${ticket.message}\n` +
        `📊 Status: ${statusIcon}\n` +
        (ticket.reply ? `\n💬 <b>Balasan Admin:</b>\n${ticket.reply}` : '')
    );
});

bot.command('reply', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Bukan admin.');
    const parts = ctx.message.text.split(' ');
    if (parts.length < 3) return ctx.reply('❌ Format: /reply TICKET_ID JAWABAN\nContoh: /reply TKT-ABC123 License sudah diaktifkan ya!');
    const ticketId = parts[1].trim();
    const replyText = parts.slice(2).join(' ');
    const ticket = (db.tickets || []).find(t => t.id === ticketId);
    if (!ticket) return ctx.reply('❌ Tiket tidak ditemukan.');
    ticket.status = 'replied'; ticket.reply = replyText; ticket.replied_at = new Date().toISOString();
    saveDB(db);
    try {
        await ctx.telegram.sendMessage(ticket.user_id,
            `✅ <b>Tiket kamu sudah dibalas!</b>\n━━━━━━━━━━━━━━━━━━\n` +
            `🎫 ID: <code>${ticketId}</code>\n📝 Pertanyaanmu: ${ticket.message}\n\n💬 <b>Balasan:</b>\n${replyText}`,
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📞 Tanya Lagi', 'contact')]]) }
        );
        await ctx.reply(`✅ Balasan terkirim ke user ${ticket.user_name}!`);
    } catch (e) { await ctx.reply(`⚠️ Gagal kirim ke user: ${e.message}`); }
});
// ═══════════════════════════════════════════════════════════════
// FITUR: ADMIN DM — Kirim pesan langsung ke user
// /dm USER_ID PESAN
// ═══════════════════════════════════════════════════════════════
bot.command('dm', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Bukan admin.');
    const parts = ctx.message.text.split(' ');
    if (parts.length < 3) {
        return ctx.replyWithHTML(
            `\n💬 <b>KIRIM PESAN KE USER</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
            `<b>Format:</b>\n<code>/dm USER_ID PESAN</code>\n\n` +
            `┌─── 💡 <b>CONTOH</b> ───┐\n` +
            `│                                                         │\n` +
            `│  <code>/dm 123456 Halo, ada update!</code>  │\n` +
            `│  <code>/dm 123456 Key kamu sudah</code>      │\n` +
            `│  <code>di-reset, silakan coba lagi</code>    │\n` +
            `│                                                         │\n` +
            `└─────────────────────┘\n\n` +
            `💡 <i>Gunakan /users untuk lihat daftar user</i>`
        );
    }

    const targetUserId = parts[1].trim();
    const message = parts.slice(2).join(' ');

    // Cari info user
    const userInfo = db.users[targetUserId];
    const userName = userInfo?.name || `User ${targetUserId}`;

    try {
        await ctx.telegram.sendMessage(targetUserId,
            `\n📩 <b>PESAN DARI ADMIN</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
            `${message}\n\n` +
            `<i>Balas pesan ini dengan /tiket jika butuh bantuan</i>`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('💬  Balas Admin', 'open_ticket')],
                    [Markup.button.callback('🏠  Menu Utama', 'back_start')]
                ])
            }
        );

        await ctx.replyWithHTML(
            `✅ <b>Pesan terkirim!</b>\n\n` +
            `👤  <b>User:</b> ${userName} (<code>${targetUserId}</code>)\n` +
            `💬  <b>Pesan:</b> ${message}`
        );

        // Log
        await sendLog(bot, `📩 <b>ADMIN DM</b>\n👤 ${userName} (<code>${targetUserId}</code>)\n💬 ${message}`);
    } catch (e) {
        await ctx.replyWithHTML(
            `❌ <b>Gagal kirim pesan</b>\n\n` +
            `User ID <code>${targetUserId}</code> mungkin:\n` +
            `  ▸  Belum pernah /start di bot\n` +
            `  ▸  Sudah blokir bot\n` +
            `  ▸  ID salah\n\n` +
            `<i>Error: ${e.message}</i>`
        );
    }
});

// ═══════════════════════════════════════════════════════════════
// FITUR: LIST USERS — Lihat semua user terdaftar
// /users [cari]
// ═══════════════════════════════════════════════════════════════
bot.command('users', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Bukan admin.');
    
    const searchTerm = ctx.message.text.split(' ').slice(1).join(' ').toLowerCase().trim();
    const allUsers = Object.values(db.users || {});
    
    let filteredUsers = allUsers;
    if (searchTerm) {
        filteredUsers = allUsers.filter(u => 
            (u.name || '').toLowerCase().includes(searchTerm) ||
            (u.username || '').toLowerCase().includes(searchTerm) ||
            (u.id || '').includes(searchTerm)
        );
    }

    if (filteredUsers.length === 0) {
        return ctx.replyWithHTML(
            searchTerm
                ? `❌ Tidak ada user yang cocok dengan "<b>${searchTerm}</b>"`
                : '📋 Belum ada user terdaftar.'
        );
    }

    // Tampilkan max 15 user
    const shown = filteredUsers.slice(0, 15);
    const totalPaid = (db.orders || []).filter(o => o.status === 'paid');
    
    let text = `\n👥 <b>DAFTAR USER</b>${searchTerm ? ` — "${searchTerm}"` : ''}\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n`;
    text += `📊 Total: <b>${filteredUsers.length}</b> user${searchTerm ? ` (dari ${allUsers.length})` : ''}\n\n`;

    for (const u of shown) {
        const userOrders = totalPaid.filter(o => o.user_id === u.id);
        const spent = userOrders.reduce((s, o) => s + (o.price || 0), 0);
        const hasLicense = userOrders.length > 0;
        const statusIcon = hasLicense ? '✅' : '⬜';
        
        text += `${statusIcon} <b>${u.name || 'Unknown'}</b>`;
        if (u.username) text += ` @${u.username}`;
        text += `\n`;
        text += `     ID: <code>${u.id}</code>`;
        if (spent > 0) text += ` · ${formatPrice(spent)}`;
        text += `\n`;
    }

    if (filteredUsers.length > 15) {
        text += `\n<i>... dan ${filteredUsers.length - 15} user lainnya</i>\n`;
    }

    text += `\n💡 <i>Kirim pesan: <code>/dm USER_ID pesan</code></i>`;
    text += `\n🔍 <i>Cari user: <code>/users nama</code></i>`;

    await ctx.replyWithHTML(text);
});

// ═══════════════════════════════════════════════════════════════
// FITUR #2 — FLASH SALE / PROMO TIMER
// Admin: /flashsale PRODUCT_ID DISKON% DURASI_MENIT PESAN
// Contoh: /flashsale pro_30 30 60 Flash Sale 1 Jam!
// ═══════════════════════════════════════════════════════════════
let activeFlashSale = null;

bot.command('flashsale', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Bukan admin.');
    const parts = ctx.message.text.split(' ');
    if (parts.length < 4) {
        return ctx.replyWithHTML(
            `\n💥 <b>FLASH SALE COMMAND</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
            `<b>Format Persen:</b>\n<code>/flashsale PRODUCT_ID DISKON% MENIT PESAN</code>\n` +
            `Contoh: <code>/flashsale pro_30 30 60 Promo Akhir Pekan!</code>\n\n` +
            `<b>Format Potongan Rupiah:</b>\n<code>/flashsale PRODUCT_ID rpJUMLAH MENIT PESAN</code>\n` +
            `Contoh: <code>/flashsale pro_30 rp20000 60 Diskon 20rb!</code>\n\n` +
            `<b>Product ID:</b> ` + Object.keys(PRODUCTS).map(id => `<code>${id}</code>`).join(', ')
        );
    }
    const [, productId, discountStr, durationStr, ...msgParts] = parts;
    const product = PRODUCTS[productId];
    if (!product) return ctx.reply('❌ Product tidak ditemukan.');
    
    // Detect discount type: "rp20000" = flat amount, "30" = percentage
    const isFlat = discountStr.toLowerCase().startsWith('rp');
    let discountAmount = 0;
    let discountPercent = 0;
    let flashPrice = 0;
    let discountLabel = '';

    if (isFlat) {
        discountAmount = parseInt(discountStr.toLowerCase().replace('rp', ''));
        if (isNaN(discountAmount) || discountAmount <= 0) return ctx.reply('❌ Jumlah potongan tidak valid.');
        if (discountAmount >= product.price) return ctx.reply('❌ Potongan tidak boleh >= harga produk.');
        flashPrice = product.price - discountAmount;
        discountPercent = Math.round((discountAmount / product.price) * 100);
        discountLabel = `-${formatPrice(discountAmount)}`;
    } else {
        discountPercent = parseInt(discountStr);
        if (isNaN(discountPercent) || discountPercent <= 0 || discountPercent >= 100) return ctx.reply('❌ Diskon harus 1-99%.');
        flashPrice = Math.floor(product.price * (100 - discountPercent) / 100);
        discountAmount = product.price - flashPrice;
        discountLabel = `-${discountPercent}%`;
    }

    const durationMin = parseInt(durationStr);
    const customMsg = msgParts.join(' ') || 'Flash Sale!';
    const endTime = new Date(Date.now() + durationMin * 60000);
    const flashCode = 'FLASH' + Date.now().toString(36).toUpperCase().slice(-4);

    // Register diskon code
    if (!db.discounts) db.discounts = {};
    if (isFlat) {
        db.discounts[flashCode] = {
            active: true, amount: discountAmount, type: 'amount',
            quota: 50, used: 0, expires_at: endTime.toISOString(), products: [productId]
        };
    } else {
        db.discounts[flashCode] = {
            active: true, percent: discountPercent, type: 'percent',
            quota: 50, used: 0, expires_at: endTime.toISOString(), products: [productId]
        };
    }
    saveDB(db);
    activeFlashSale = { productId, discountPercent, discountAmount, endTime, flashCode };

    // Broadcast ke semua user
    const saleMsg =
        `\n⚡⚡⚡ <b>FLASH SALE</b> ⚡⚡⚡\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
        `🏷 <b>${customMsg}</b>\n\n` +
        `┌──────────────────────┐\n` +
        `│                                                            │\n` +
        `│  📦  <b>${product.name}</b>                         │\n` +
        `│  ⏱  ${product.desc}                                       │\n` +
        `│                                                            │\n` +
        `│  💰  <s>${formatPrice(product.price)}</s>                               │\n` +
        `│  🔥  <b>${formatPrice(flashPrice)}</b>  (${discountLabel})       │\n` +
        `│  💸  Hemat <b>${formatPrice(discountAmount)}</b>                    │\n` +
        `│                                                            │\n` +
        `└──────────────────────┘\n\n` +
        `⏱  Berakhir: <b>${endTime.toLocaleString('id-ID')}</b>\n` +
        `🎟  Kode: <code>${flashCode}</code>\n` +
        `🎯  Kuota: <b>50 user</b> pertama\n\n` +
        `┌─── ✅ <b>CARA PAKAI</b> ───┐\n` +
        `│  1 ▸  Ketik: <code>/promo ${flashCode}</code>       │\n` +
        `│  2 ▸  Pilih produk & bayar                     │\n` +
        `│  3 ▸  Diskon otomatis! 🎉                     │\n` +
        `└──────────────────────┘`;

    const allUserIds = Object.keys(db.users);
    let sent = 0;
    await ctx.reply(`📡 Broadcasting flash sale ke ${allUserIds.length} user...`);
    for (const uid of allUserIds) {
        try {
            await ctx.telegram.sendMessage(uid, saleMsg, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([[Markup.button.callback('🛒 Beli Sekarang', `buy_${productId}`)]])
            });
            sent++;
            await new Promise(r => setTimeout(r, 50));
        } catch (e) { }
    }
    await ctx.reply(`✅ Flash sale aktif!\n📤 Broadcast ke ${sent} user\n🎟 Kode: ${flashCode}\n⏱ Berakhir: ${endTime.toLocaleString('id-ID')}`);

    // Auto-nonaktifkan setelah waktu habis
    setTimeout(() => {
        if (db.discounts[flashCode]) { db.discounts[flashCode].active = false; saveDB(db); }
        activeFlashSale = null;
        console.log(`[FlashSale] ${flashCode} expired`);
    }, durationMin * 60000);
});

// ═══════════════════════════════════════════════════════════════
// FITUR #3 — BLACKLIST LICENSE
// Admin: /blacklist LICENSE_KEY ALASAN
// ═══════════════════════════════════════════════════════════════
bot.command('blacklist', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Bukan admin.');
    const parts = ctx.message.text.split(' ');
    if (parts.length < 2) return ctx.reply('❌ Format: /blacklist LICENSE_KEY [ALASAN]');
    const licenseKey = parts[1].trim();
    const reason = parts.slice(2).join(' ') || 'Pelanggaran TOS';

    if (!db.blacklisted_keys) db.blacklisted_keys = {};
    db.blacklisted_keys[licenseKey] = { reason, blacklisted_at: new Date().toISOString() };
    saveDB(db);

    // Cari order dengan key ini dan notify user
    const order = db.orders.find(o => o.license_key === licenseKey);
    if (order) {
        try {
            await ctx.telegram.sendMessage(order.user_id,
                `⚠️ <b>License Kamu Dinonaktifkan</b>\n\nLicense key kamu telah dinonaktifkan karena: <i>${reason}</i>\n\nHubungi admin untuk info lebih lanjut.`,
                { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📞 Hubungi Admin', 'contact')]]) }
            );
        } catch (e) { }
    }
    await ctx.replyWithHTML(`🚫 License <code>${licenseKey}</code> diblacklist.\nAlasan: ${reason}${order ? `\n👤 User: ${order.user_name} (${order.user_id}) sudah dinotifikasi.` : ''}`);
});

bot.command('unblacklist', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Bukan admin.');
    const licenseKey = ctx.message.text.split(' ')[1]?.trim();
    if (!licenseKey) return ctx.reply('❌ Format: /unblacklist LICENSE_KEY');
    if (db.blacklisted_keys?.[licenseKey]) {
        delete db.blacklisted_keys[licenseKey]; saveDB(db);
        await ctx.replyWithHTML(`✅ License <code>${licenseKey}</code> dihapus dari blacklist.`);
    } else { await ctx.reply('⚠️ Key tidak ada di blacklist.'); }
});

// ═══════════════════════════════════════════════════════════════
// FITUR #4 — BLOCK / UNBLOCK USER (Anti-abuse)
// Admin: /blockuser USER_ID  |  /unblockuser USER_ID
// ═══════════════════════════════════════════════════════════════
if (!db.blocked_users) db.blocked_users = {};

// Middleware: cek block di setiap request
bot.use(async (ctx, next) => {
    const userId = String(ctx.from?.id || '');
    if (userId && db.blocked_users?.[userId]) {
        return ctx.reply('🚫 Akun kamu telah diblokir. Hubungi admin jika ada kesalahan.');
    }
    return next();
});

bot.command('blockuser', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Bukan admin.');
    const parts = ctx.message.text.split(' ');
    const targetId = parts[1]?.trim();
    const reason = parts.slice(2).join(' ') || 'Abuse/spam';
    if (!targetId) return ctx.reply('❌ Format: /blockuser USER_ID [ALASAN]');
    if (!db.blocked_users) db.blocked_users = {};
    db.blocked_users[targetId] = { reason, blocked_at: new Date().toISOString() };
    saveDB(db);
    await ctx.replyWithHTML(`🚫 User <code>${targetId}</code> diblokir.\nAlasan: ${reason}`);
});

bot.command('unblockuser', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Bukan admin.');
    const targetId = ctx.message.text.split(' ')[1]?.trim();
    if (!targetId) return ctx.reply('❌ Format: /unblockuser USER_ID');
    if (db.blocked_users?.[targetId]) {
        delete db.blocked_users[targetId]; saveDB(db);
        await ctx.replyWithHTML(`✅ User <code>${targetId}</code> diunblokir.`);
    } else { await ctx.reply('⚠️ User tidak diblokir.'); }
});

// ═══════════════════════════════════════════════════════════════
// FITUR #5 — RIWAYAT PEMBELIAN USER
// ═══════════════════════════════════════════════════════════════
bot.command('riwayat', async (ctx) => {
    const userId = String(ctx.from.id);
    const myOrders = db.orders.filter(o => o.user_id === userId).slice(-10).reverse();
    if (myOrders.length === 0) return ctx.reply('📋 Kamu belum punya histori pembelian.\n\nGunakan /start untuk beli.');
    let text = `📋 <b>Riwayat Pembelian</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
    for (const o of myOrders) {
        const icon = o.status === 'paid' ? '✅' : o.status === 'cancelled' ? '❌' : o.status === 'expired' ? '⏱' : '⏳';
        text += `${icon} <b>${o.product_name}</b>\n` +
            `💰 ${formatPrice(o.price)} | 📅 ${new Date(o.created_at).toLocaleDateString('id-ID')}\n` +
            `🆔 <code>${o.id}</code>\n\n`;
    }
    await ctx.replyWithHTML(text);
});

// ═══════════════════════════════════════════════════════════════
// FITUR #6 — AUTO REPLY KEYWORD
// ═══════════════════════════════════════════════════════════════
const AUTO_REPLIES = {
    'harga': `💰 <b>Harga ClipperSkuy:</b>\n⚡ Pro 30 Hari — <b>Rp69.000</b>\n⚡ Pro 90 Hari — <b>Rp150.000</b>\n⚡ Pro 365 Hari — <b>Rp250.000</b>\n\nGunakan /start untuk beli!`,
    'berapa': `💰 <b>Harga ClipperSkuy:</b>\n⚡ Pro 30 Hari — <b>Rp69.000</b>\n⚡ Pro 90 Hari — <b>Rp150.000</b>\n⚡ Pro 365 Hari — <b>Rp250.000</b>\n\nGunakan /start untuk beli!`,
    'cara bayar': `💳 <b>Cara Bayar:</b>\n1. Ketuk /start\n2. Pilih produk\n3. Klik "Bayar"\n4. Scan QRIS atau bayar via GoPay\n5. Key otomatis dikirim!`,
    'cara aktivasi': `🔑 <b>Cara Aktivasi:</b>\n1. Buka ClipperSkuy\n2. Klik Settings\n3. Pilih menu License\n4. Paste license key\n5. Klik Activate`,
    'cara install': `📥 <b>Cara Install:</b>\n1. Download via /download\n2. Extract file ZIP\n3. Jalankan ClipperSkuy.exe\n4. Login dengan license key\n\nBelum punya key? Beli via /start!`,
    'cara pakai': `📖 <b>Cara Pakai:</b>\n1. Import video panjang\n2. AI otomatis deteksi momen viral\n3. Pilih clip yang mau di-export\n4. Export ke 9:16 untuk TikTok/Reels!`,
    'download': `📥 Gunakan /download untuk link download terbaru.`,
    'expired': `⏱ Cek status license kamu dengan /ceklicense\nUntuk perpanjang, klik tombol Perpanjang di sana.`,
    'habis': `⏱ Cek status license kamu dengan /ceklicense\nUntuk perpanjang, klik tombol Perpanjang di sana.`,
    'gagal': `❌ Ada masalah? Buat tiket: /tiket MASALAH_KAMU\nAtau hubungi admin langsung.`,
    'error': `❌ Ada error? Buat tiket: /tiket DESKRIPSI_ERROR\nSertakan screenshot kalau bisa.`,
    'tidak bisa': `❌ Ada masalah? Gunakan /tiket DESKRIPSI_MASALAH untuk buat laporan ke admin.`,
    'refund': `🔁 Kebijakan refund: Lisensi yang sudah diaktivasi tidak dapat di-refund.\nHubungi admin jika ada masalah teknis.`,
    'free': `✅ Ada trial gratis 1 hari! Gunakan /start dan pilih "Coba GRATIS 1 Hari".`,
    'trial': `✅ Ada trial gratis 1 hari! Gunakan /start dan pilih "Coba GRATIS 1 Hari".`,
    'gratis': `✅ Mau coba gratis? Gunakan /start → klik "Coba GRATIS 1 Hari" (1x per akun).`,
    'diskon': `🏷 Punya kode promo? Masukkan saat checkout.\nAtau gunakan /referral untuk dapat kode diskon!`,
    'promo': `🔥 Cek promo terbaru dengan /start — atau minta kode dari teman yang sudah beli via /referral!`,
    'spin': `🎰 Coba keberuntunganmu! Ketik /spin untuk putar roda hadiah harian.`,
    'update': `📋 Cek update terbaru dengan /changelog`,
    'fitur': `📋 Cek fitur terbaru dengan /changelog — atau /start untuk melihat semua menu.`,
    'admin': `💬 Hubungi admin langsung via /start → Admin`,
    'bantuan': `❓ Ketik /help untuk daftar semua fitur dan panduan lengkap.`
};

bot.on('text', async (ctx, next) => {
    // Skip kalau command
    if (ctx.message.text.startsWith('/')) return next();
    const textLower = ctx.message.text.toLowerCase();
    for (const [keyword, reply] of Object.entries(AUTO_REPLIES)) {
        if (textLower.includes(keyword)) {
            await ctx.replyWithHTML(reply);
            return; // hanya reply 1 keyword
        }
    }
    return next();
});

// ════════════════════════════════════════════════════════════════
// FITUR — SPIN WHEEL (Hadiah Harian)
// ════════════════════════════════════════════════════════════════
const SPIN_PRIZES = [
    { emoji: '🎁', name: 'Diskon 5%', weight: 25, type: 'discount', percent: 5 },
    { emoji: '🎉', name: 'Diskon 10%', weight: 15, type: 'discount', percent: 10 },
    { emoji: '🔥', name: 'Diskon 15%', weight: 8, type: 'discount', percent: 15 },
    { emoji: '💎', name: 'Diskon 25%', weight: 2, type: 'discount', percent: 25 },
    { emoji: '😅', name: 'Zonk! Coba lagi besok', weight: 30, type: 'zonk' },
    { emoji: '🍀', name: 'Bonus 1 Referral', weight: 10, type: 'bonus_ref' },
    { emoji: '⭐', name: 'Stiker Eksklusif', weight: 10, type: 'sticker' },
];

function weightedRandom(prizes) {
    const totalWeight = prizes.reduce((s, p) => s + p.weight, 0);
    let random = Math.random() * totalWeight;
    for (const prize of prizes) {
        random -= prize.weight;
        if (random <= 0) return prize;
    }
    return prizes[prizes.length - 1];
}

bot.command('spin', async (ctx) => {
    const userId = String(ctx.from.id);
    if (!db.users[userId]) db.users[userId] = { name: ctx.from.first_name, joined: new Date().toISOString() };

    // Cek cooldown (1x per hari)
    const today = new Date().toISOString().substring(0, 10);
    if (db.users[userId].last_spin === today) {
        return ctx.replyWithHTML(
            `⏳ <b>Kamu sudah spin hari ini!</b>\n\nCoba lagi besok ya. Setiap hari dapat 1 spin gratis! 🎰`,
            Markup.inlineKeyboard([[Markup.button.callback('◀️ Menu Utama', 'back_start')]])
        );
    }

    const prize = weightedRandom(SPIN_PRIZES);
    db.users[userId].last_spin = today;

    // Animasi spin
    const spinFrames = ['🎰 Spinning...  ▫️▫️▫️', '🎰 Spinning...  🔴▫️▫️', '🎰 Spinning...  🔴🟡▫️', '🎰 Spinning...  🔴🟡🟢'];
    const msg = await ctx.reply(spinFrames[0]);
    for (let i = 1; i < spinFrames.length; i++) {
        await new Promise(r => setTimeout(r, 600));
        try { await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, spinFrames[i]); } catch(e) {}
    }
    await new Promise(r => setTimeout(r, 800));

    let resultMsg = '';
    const buttons = [[Markup.button.callback('◀️ Menu Utama', 'back_start')]];

    if (prize.type === 'discount') {
        const spinCode = 'SPIN' + prize.percent + '_' + Date.now().toString(36).toUpperCase().slice(-4);
        if (!db.discounts) db.discounts = {};
        db.discounts[spinCode] = {
            active: true, percent: prize.percent, type: 'percent',
            quota: 1, used: 0, owner_id: userId, products: [],
            expires_at: new Date(Date.now() + 3 * 86400000).toISOString() // 3 hari
        };
        saveDB(db);
        resultMsg =
            `\n🎰 <b>SPIN RESULT!</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
            `${prize.emoji}  <b>${prize.name}</b>\n\n` +
            `┌──────────────────────┐\n` +
            `│                                                            │\n` +
            `│  🎟  Kode: <code>${spinCode}</code>                    │\n` +
            `│  ⏱  Berlaku 3 hari                                │\n` +
            `│  🔢  1x pakai                                        │\n` +
            `│                                                            │\n` +
            `└──────────────────────┘\n\n` +
            `💡 Ketik <code>/promo ${spinCode}</code> saat beli!`;
        buttons.unshift([Markup.button.callback('🛒 Pakai Sekarang', 'catalog')]);
    } else if (prize.type === 'bonus_ref') {
        if (!db.users[userId].bonus_refs) db.users[userId].bonus_refs = 0;
        db.users[userId].bonus_refs++;
        saveDB(db);
        resultMsg =
            `\n🎰 <b>SPIN RESULT!</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
            `${prize.emoji}  <b>${prize.name}</b>\n\n` +
            `+1 bonus referral ditambahkan ke akunmu!\nTotal bonus: ${db.users[userId].bonus_refs}`;
    } else if (prize.type === 'sticker') {
        saveDB(db);
        resultMsg =
            `\n🎰 <b>SPIN RESULT!</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
            `${prize.emoji}  <b>${prize.name}</b>\n\n` +
            `Kamu dapat stiker eksklusif ClipperSkuy! 🌟\nTerima kasih sudah main!`;
    } else {
        saveDB(db);
        resultMsg =
            `\n🎰 <b>SPIN RESULT!</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
            `${prize.emoji}  <b>${prize.name}</b>\n\n` +
            `Jangan menyerah! Coba lagi besok.\nSetiap hari punya kesempatan menang! 🍀`;
    }

    try {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, resultMsg, {
            parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons)
        });
    } catch(e) {
        await ctx.replyWithHTML(resultMsg, Markup.inlineKeyboard(buttons));
    }

    await sendLog(bot, `🎰 <b>SPIN</b>\n👤 ${ctx.from.first_name} [${userId}]\n🎁 ${prize.emoji} ${prize.name}`);
});

// ════════════════════════════════════════════════════════════════
// FITUR — CHANGELOG (What's New)
// ════════════════════════════════════════════════════════════════
if (!db.changelog) db.changelog = {
    version: 'v2.0.0',
    date: new Date().toISOString().substring(0, 10),
    changes: [
        '🎮 Trial gratis 1 hari untuk user baru',
        '👑 VIP Tier — diskon 5% selamanya setelah 2x beli',
        '🏆 Leaderboard Referral',
        '🎰 Spin Wheel — hadiah harian',
        '⏰ Reminder expired + diskon perpanjangan',
        '💭 Follow-up otomatis order belum bayar',
        '⭐ Rating request setelah 7 hari',
        '📊 Laporan harian ke admin',
    ]
};

bot.command('changelog', async (ctx) => {
    const cl = db.changelog || { version: '-', date: '-', changes: ['Belum ada update.'] };
    const changeList = cl.changes.map(c => `  •  ${c}`).join('\n');
    await ctx.replyWithHTML(
        `\n📋 <b>WHAT'S NEW</b>\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n\n` +
        `┌──────────────────────┐\n` +
        `│                                                            │\n` +
        `│  📦  Versi: <b>${cl.version}</b>                       │\n` +
        `│  📅  Tanggal: ${cl.date}                         │\n` +
        `│                                                            │\n` +
        `└──────────────────────┘\n\n` +
        `<b>✨ Fitur Terbaru:</b>\n${changeList}\n\n` +
        `<i>Update otomatis, tidak perlu download ulang app.</i>`,
        Markup.inlineKeyboard([
            [Markup.button.callback('🛒 Beli License', 'catalog')],
            [Markup.button.callback('◀️ Menu Utama', 'back_start')]
        ])
    );
});

// Admin: update changelog
bot.command('setchangelog', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Bukan admin.');
    const text = ctx.message.text.replace('/setchangelog', '').trim();
    if (!text) return ctx.replyWithHTML(
        `❌ Format:\n<code>/setchangelog v2.1.0 | Fitur 1 | Fitur 2 | Fitur 3</code>\n\nPisahkan versi dan fitur dengan <code>|</code>`
    );
    const parts = text.split('|').map(s => s.trim());
    const version = parts[0] || 'v2.0.0';
    const changes = parts.slice(1).filter(c => c);
    if (changes.length === 0) return ctx.reply('❌ Minimal 1 fitur baru.');

    db.changelog = {
        version,
        date: new Date().toISOString().substring(0, 10),
        changes
    };
    saveDB(db);
    await ctx.replyWithHTML(
        `✅ <b>Changelog diupdate!</b>\n\n📦 Versi: ${version}\n` +
        changes.map(c => `  • ${c}`).join('\n') +
        `\n\nBroadcast ke semua user? Gunakan /broadcast`
    );
});

// ═══════════════════════════════════════════════════════════════
// FITUR #8 — REMINDER BELUM BAYAR (10 menit setelah order)
// ═══════════════════════════════════════════════════════════════
function schedulePaymentReminder(botInstance, order) {
    setTimeout(async () => {
        const freshOrder = db.orders.find(o => o.id === order.id);
        if (!freshOrder || freshOrder.status === 'paid' || freshOrder.status === 'cancelled') return;
        try {
            await botInstance.telegram.sendMessage(freshOrder.user_id,
                `⏰ <b>Jangan lupa bayar!</b>\n\n` +
                `🆔 Order <code>${freshOrder.id}</code> kamu belum selesai.\n` +
                `📦 ${freshOrder.product_name} — ${formatPrice(freshOrder.price)}\n\n` +
                `Selesaikan pembayaran sekarang sebelum expired! ⚡`,
                {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('💳 Lanjut Bayar', `pay_${freshOrder.id}`)],
                        [Markup.button.callback('❌ Batalkan', `cancel_${freshOrder.id}`)]
                    ])
                }
            );
        } catch (e) { }
    }, 10 * 60 * 1000); // 10 menit
}

// ═══════════════════════════════════════════════════════════════
// FITUR #9 — DASHBOARD ADMIN /stats
// ═══════════════════════════════════════════════════════════════
bot.command('stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Bukan admin.');
    const now = new Date();
    const WIB = new Date(now.getTime() + 7 * 3600000);
    const todayStr = WIB.toISOString().substring(0, 10);
    const thisMonthStr = WIB.toISOString().substring(0, 7);

    const allOrders = db.orders || [];
    const paidOrders = allOrders.filter(o => o.status === 'paid');
    const todayOrders = paidOrders.filter(o => o.paid_at?.startsWith(todayStr) || new Date(new Date(o.paid_at).getTime() + 7 * 3600000).toISOString().startsWith(todayStr));
    const monthOrders = paidOrders.filter(o => { const wib = new Date(new Date(o.paid_at).getTime() + 7 * 3600000); return wib.toISOString().startsWith(thisMonthStr); });
    const pendingOrders = allOrders.filter(o => ['waiting_payment', 'pending'].includes(o.status));

    const todayRev = todayOrders.reduce((s, o) => s + (o.price || 0), 0);
    const monthRev = monthOrders.reduce((s, o) => s + (o.price || 0), 0);
    const totalRev = db.stats?.total_revenue || paidOrders.reduce((s, o) => s + (o.price || 0), 0);

    // Produk terlaris
    const productCount = {};
    paidOrders.forEach(o => { productCount[o.product_id] = (productCount[o.product_id] || 0) + 1; });
    const topProduct = Object.entries(productCount).sort((a, b) => b[1] - a[1])[0];

    // Rating stats
    const ratedOrders = paidOrders.filter(o => o.rating);
    const avgRating = ratedOrders.length > 0 ? (ratedOrders.reduce((s, o) => s + o.rating, 0) / ratedOrders.length).toFixed(1) : '-';

    const report =
        `📊 <b>DASHBOARD ADMIN</b>\n━━━━━━━━━━━━━━━━━━\n\n` +
        `📅 <b>Hari ini (${todayStr}):</b>\n` +
        `   ✅ Order: ${todayOrders.length} | 💰 ${formatPrice(todayRev)}\n\n` +
        `📅 <b>Bulan ini (${thisMonthStr}):</b>\n` +
        `   ✅ Order: ${monthOrders.length} | 💰 ${formatPrice(monthRev)}\n\n` +
        `📈 <b>All Time:</b>\n` +
        `   ✅ Total order: ${paidOrders.length}\n` +
        `   💰 Total revenue: ${formatPrice(totalRev)}\n` +
        `   👥 Total user: ${Object.keys(db.users || {}).length}\n\n` +
        `⏳ <b>Pending bayar:</b> ${pendingOrders.length} order\n` +
        `🎫 <b>Tiket open:</b> ${(db.tickets || []).filter(t => t.status === 'open').length}\n` +
        `🚫 <b>User diblokir:</b> ${Object.keys(db.blocked_users || {}).length}\n\n` +
        `🏆 <b>Produk terlaris:</b> ${topProduct ? `${topProduct[0]} (${topProduct[1]}x)` : '-'}\n` +
        `⭐ <b>Rating rata-rata:</b> ${avgRating}${ratedOrders.length > 0 ? ` (${ratedOrders.length} review)` : ''}\n\n` +
        `<i>Update: ${now.toLocaleString('id-ID')}</i>`;

    await ctx.replyWithHTML(report, Markup.inlineKeyboard([
        [Markup.button.callback('📥 Export CSV', 'export_csv_action')],
        [Markup.button.callback('🎫 Lihat Tiket Open', 'view_open_tickets')]
    ]));
});

// ═══════════════════════════════════════════════════════════════
// FITUR #10 — EXPORT CSV
// ═══════════════════════════════════════════════════════════════
bot.command('exportcsv', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Bukan admin.');
    await generateAndSendCSV(ctx);
});

bot.action('export_csv_action', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Not admin');
    await ctx.answerCbQuery('Generating CSV...');
    await generateAndSendCSV(ctx);
});

async function generateAndSendCSV(ctx) {
    const orders = db.orders || [];
    if (orders.length === 0) return ctx.reply('❌ Tidak ada data order.');
    const header = 'Order ID,Status,Produk,Harga,User ID,Nama,Username,License Key,Tanggal Beli,Tanggal Bayar\n';
    const rows = orders.map(o =>
        `"${o.id}","${o.status}","${o.product_name}","${o.price}","${o.user_id}","${o.user_name}","${o.username || ''}","${o.license_key || ''}","${o.created_at?.substring(0, 10) || ''}","${o.paid_at?.substring(0, 10) || ''}"`
    ).join('\n');
    const csvContent = header + rows;
    const filename = `orders_${new Date().toISOString().substring(0, 10)}.csv`;
    const tmpPath = path.join(__dirname, 'data', filename);
    fs.writeFileSync(tmpPath, csvContent, 'utf-8');
    try {
        await ctx.replyWithDocument({ source: tmpPath, filename }, { caption: `📊 Export ${orders.length} orders — ${filename}` });
    } finally { try { fs.unlinkSync(tmpPath); } catch (e) { } }
}

// Admin: lihat tiket open
bot.action('view_open_tickets', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ Not admin');
    await ctx.answerCbQuery();
    const openTickets = (db.tickets || []).filter(t => t.status === 'open');
    if (openTickets.length === 0) return ctx.reply('✅ Tidak ada tiket open.');
    let text = `🎫 <b>Tiket Open (${openTickets.length})</b>\n━━━━━━━━━━━━━━━━━━\n\n`;
    for (const t of openTickets.slice(0, 10)) {
        text += `🆔 <code>${t.id}</code> — ${t.user_name}: ${t.message.substring(0, 60)}...\n` +
            `Balas: <code>/reply ${t.id} JAWABAN</code>\n\n`;
    }
    await ctx.replyWithHTML(text);
});

// ═══════════════════════════════════════════════════════════════
// FITUR #7 — NOTIF ORDER BARU KE ADMIN (REALTIME)
// Sudah ada sendLog tapi tambah notif langsung ke semua admin
// ═══════════════════════════════════════════════════════════════
async function notifyAdminNewOrder(botInstance, order) {
    for (const adminId of ADMIN_IDS) {
        try {
            await botInstance.telegram.sendMessage(adminId,
                `🛒 <b>ORDER BARU!</b>\n━━━━━━━━━━━━━━━━━━\n` +
                `🆔 <code>${order.id}</code>\n` +
                `👤 ${order.user_name} (@${order.username || '-'})\n` +
                `📦 ${order.product_name}\n` +
                `💰 ${formatPrice(order.price)}\n` +
                `⏰ ${new Date().toLocaleString('id-ID')}\n\n` +
                `⏳ Menunggu pembayaran...`,
                { parse_mode: 'HTML' }
            );
        } catch (e) { }
    }
}

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

        // Jalankan scheduler: notif expired, laporan harian, rating request
        startDailyTaskScheduler(bot);

        // ── Daftarkan command list ke Telegram ──
        // Command untuk semua user
        const userCommands = [
            { command: 'start', description: '🏠 Menu utama — semua fitur dari sini' },
            { command: 'ceklicense', description: '🔑 Cek status & expiry license kamu' },
            { command: 'riwayat', description: '📋 Histori semua pembelian kamu' },
            { command: 'download', description: '⬇️ Link download app terbaru' },
            { command: 'referral', description: '🎁 Kode referral & program diskon 10%' },
            { command: 'leaderboard', description: '🏆 Top 5 referrer bulan ini' },
            { command: 'vip', description: '👑 Cek status VIP membership' },
            { command: 'spin', description: '🎰 Putar roda hadiah harian' },
            { command: 'changelog', description: '📋 Lihat update & fitur terbaru' },
            { command: 'tiket', description: '🎫 Buat tiket support ke admin' },
            { command: 'cektiket', description: '🔍 Cek status tiket support kamu' },
            { command: 'myid', description: '👤 Lihat Telegram User ID kamu' },
            { command: 'help', description: '❓ Bantuan & daftar semua fitur' },
        ];

        // Command tambahan khusus admin
        const adminCommands = [
            ...userCommands,
            { command: 'admin', description: '🔧 Panel admin utama' },
            { command: 'stats', description: '📊 Dashboard revenue & statistik' },
            { command: 'exportcsv', description: '📥 Export semua order ke CSV' },
            { command: 'broadcast', description: '📡 Kirim pesan ke semua user' },
            { command: 'sendkey', description: '🔑 Kirim license key manual ke user' },
            { command: 'konfirmasi', description: '✅ Konfirmasi order manual' },
            { command: 'reply', description: '💬 Balas tiket support user' },
            { command: 'flashsale', description: '⚡ Buat flash sale + broadcast' },
            { command: 'blacklist', description: '🚫 Blacklist license key' },
            { command: 'unblacklist', description: '♻️ Hapus blacklist license key' },
            { command: 'blockuser', description: '🚫 Blokir user dari bot' },
            { command: 'unblockuser', description: '✅ Unblokir user' },
            { command: 'newdiskon', description: '🏷 Buat kode diskon baru' },
            { command: 'hapusdiskon', description: '🗑 Hapus kode diskon' },
            { command: 'dm', description: '💬 Kirim pesan langsung ke user' },
            { command: 'users', description: '👥 Lihat daftar semua user' },
        ];

        // Set command untuk semua user (scope: default)
        await bot.telegram.setMyCommands(userCommands);

        // Set command khusus untuk setiap admin (scope: chat)
        for (const adminId of ADMIN_IDS) {
            try {
                await bot.telegram.setMyCommands(adminCommands, {
                    scope: { type: 'chat', chat_id: parseInt(adminId) }
                });
                console.log(`[Commands] Admin commands set for ${adminId}`);
            } catch (e) {
                console.warn(`[Commands] Failed to set admin commands for ${adminId}:`, e.message);
            }
        }
        console.log(`[Commands] ✅ User commands registered (${userCommands.length} commands)`);
    })
    .catch(err => {
        console.error('❌ Bot failed to start:', err.message);
        process.exit(1);
    });

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
