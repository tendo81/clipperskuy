/**
 * POST /api/web-callback
 * Menerima notifikasi dari bayar.gg saat pembayaran terdeteksi
 * Langsung generate & kirim license key tanpa tunggu polling
 */
const { getSupabase } = require('../lib/supabase');
const { handleCors } = require('../lib/helpers');
const { generateKey } = require('../lib/crypto');

const BAYARGG_API_KEY = process.env.BAYARGG_API_KEY;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASS = process.env.GMAIL_APP_PASSWORD;

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;

    // bayar.gg kirim GET atau POST tergantung config
    const query = req.query || {};
    const body = req.body || {};
    const all = { ...query, ...body };

    // Pakasir kirim: { order_id, amount, project, status, ... }
    // bayar.gg kirim: { invoice, status, ... }
    const invoice_id = all.order_id || all.invoice || all.invoice_id || all.id;
    const status = (all.status || '').toLowerCase();

    console.log(`[web-callback] Received: ${JSON.stringify(all)}`);

    if (!invoice_id) {
        return res.status(400).json({ error: 'Missing invoice' });
    }

    const isPaid = ['paid', 'success', 'settlement', 'completed'].includes(status);
    if (!isPaid) {
        // Abaikan notif pending/expired
        console.log(`[web-callback] Ignoring status=${status} for ${invoice_id}`);
        return res.json({ ok: true, message: 'Ignored' });
    }

    const db = getSupabase();

    // Cari order
    const { data: logs } = await db
        .from('license_audit_log')
        .select('*')
        .eq('action', 'web_order')
        .eq('machine_id', invoice_id)
        .limit(1);

    if (!logs || logs.length === 0) {
        console.log(`[web-callback] Order not found: ${invoice_id}`);
        return res.json({ ok: true }); // jangan error, bayar.gg bisa retry
    }

    const log = logs[0];
    const order = log.details;

    // Sudah diproses?
    if (order.license_key && order.status === 'paid') {
        console.log(`[web-callback] Already processed: ${invoice_id}`);
        return res.json({ ok: true });
    }

    // Generate key
    const tier = order.tier || 'pro';
    const durationDays = order.duration_days || 30;
    const licenseKey = generateKey(tier, durationDays);
    const expiresAt = durationDays > 0
        ? new Date(Date.now() + durationDays * 86400000).toISOString()
        : null;

    const { data: keyRow, error: keyErr } = await db
        .from('license_keys')
        .insert({
            license_key: licenseKey,
            tier,
            status: 'active',
            duration_days: durationDays,
            expires_at: expiresAt,
            max_activations: 1,
            notes: `Web checkout (callback) - ${order.order_id}`
        })
        .select()
        .single();

    if (keyErr) {
        console.error('[web-callback] DB error:', keyErr);
        return res.status(500).json({ error: 'DB error' });
    }

    await db.from('license_audit_log')
        .update({
            license_key_id: keyRow.id,
            details: { ...order, status: 'paid', license_key: licenseKey, paid_at: new Date().toISOString() }
        })
        .eq('id', log.id);

    console.log(`[web-callback] Key generated via callback: ${licenseKey} for ${invoice_id}`);

    // Kirim email
    const email = order.customer_email;
    if (email && !email.includes('test') && GMAIL_USER && GMAIL_APP_PASS) {
        try {
            const nodemailer = require('nodemailer');
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: GMAIL_USER, pass: GMAIL_APP_PASS }
            });
            await transporter.sendMail({
                from: `"ClipperSkuy" <${GMAIL_USER}>`,
                to: email,
                subject: '🎉 License Key ClipperSkuy kamu sudah siap!',
                html: `
                    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;background:#0f0f13;color:#e2e8f0;border-radius:12px">
                        <h2 style="color:#7c3aed">🎉 Pembayaran Berhasil!</h2>
                        <p>Hai <strong>${order.customer_name || 'Pengguna'}</strong>,</p>
                        <p>License key <strong>ClipperSkuy Pro (${durationDays} hari)</strong> kamu:</p>
                        <div style="background:#1a1a2e;padding:16px;border-radius:8px;text-align:center;font-size:22px;font-weight:bold;letter-spacing:4px;color:#22d3ee;font-family:monospace">
                            ${licenseKey}
                        </div>
                        <p style="margin-top:16px;font-size:13px;color:#94a3b8">
                            Masukkan di aplikasi ClipperSkuy → Settings → License.<br>
                            Order ID: ${order.order_id}
                        </p>
                    </div>
                `
            });
            console.log(`[web-callback] Email sent to ${email}`);
        } catch (e) {
            console.error('[web-callback] Email error:', e.message);
        }
    }

    return res.json({ ok: true, key: licenseKey });
};
