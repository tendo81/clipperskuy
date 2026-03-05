/**
 * GET /api/web-status?invoice_id=BAYAR-xxx
 * Check bayar.gg payment status and return license key when paid
 */
const { getSupabase } = require('../lib/supabase');
const { handleCors } = require('../lib/helpers');
const { generateKey } = require('../lib/crypto');

const BAYARGG_API_KEY = process.env.BAYARGG_API_KEY;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASS = process.env.GMAIL_APP_PASSWORD;

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { invoice_id } = req.query;
    if (!invoice_id) return res.status(400).json({ error: 'Missing invoice_id' });

    const db = getSupabase();

    try {
        // Find order
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

        // Sudah pernah diproses → langsung return
        if (order.license_key && order.status === 'paid') {
            return res.json({
                paid: true,
                key: order.license_key,
                product: order.product_id,
                order_id: order.order_id
            });
        }

        // Cek status via bayar.gg
        if (!BAYARGG_API_KEY) {
            return res.status(500).json({ error: 'Payment gateway not configured' });
        }

        const statusRes = await fetch(`https://www.bayar.gg/api/check-payment?invoice=${invoice_id}`, {
            headers: { 'X-API-Key': BAYARGG_API_KEY }
        });
        const statusData = await statusRes.json();

        const status = statusData.status || statusData.data?.status || 'pending';
        console.log(`[web-status] bayar.gg ${invoice_id} → ${status} | data: ${JSON.stringify(statusData).substring(0, 150)}`);

        const isPaid = ['paid', 'settlement', 'success', 'completed'].includes(status?.toLowerCase());

        if (!isPaid) {
            return res.json({ paid: false, status });
        }

        // === PAID! Generate license key LANGSUNG (tanpa self HTTP call) ===
        const tier = order.tier || 'pro';
        const durationDays = order.duration_days || 30;
        const licenseKey = generateKey(tier, durationDays);
        const expiresAt = durationDays > 0
            ? new Date(Date.now() + durationDays * 86400000).toISOString()
            : null;

        // Simpan ke license_keys table
        const { data: keyRow, error: keyErr } = await db
            .from('license_keys')
            .insert({
                license_key: licenseKey,
                tier,
                status: 'active',
                duration_days: durationDays,
                expires_at: expiresAt,
                max_activations: 1,
                notes: `Web checkout - ${order.order_id} - bayar.gg`
            })
            .select()
            .single();

        if (keyErr) {
            console.error('[web-status] DB insert key error:', keyErr);
            return res.status(500).json({ error: 'Gagal simpan key. Hubungi admin.' });
        }

        console.log(`[web-status] Key generated: ${licenseKey} for ${invoice_id}`);

        // Update audit log
        await db.from('license_audit_log')
            .update({
                license_key_id: keyRow.id,
                details: {
                    ...order,
                    status: 'paid',
                    license_key: licenseKey,
                    paid_at: new Date().toISOString()
                }
            })
            .eq('id', log.id);

        // Kirim email via Nodemailer (Supabase-compatible inline)
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
                            <p>Terima kasih sudah membeli <strong>ClipperSkuy Pro (${durationDays} hari)</strong>.</p>
                            <p>License key kamu:</p>
                            <div style="background:#1a1a2e;padding:16px;border-radius:8px;text-align:center;font-size:22px;font-weight:bold;letter-spacing:4px;color:#22d3ee;font-family:monospace">
                                ${licenseKey}
                            </div>
                            <p style="margin-top:16px;font-size:13px;color:#94a3b8">
                                Masukkan key ini di aplikasi ClipperSkuy → Settings → License.<br>
                                Order ID: ${order.order_id}
                            </p>
                            <p style="font-size:12px;color:#64748b">Butuh bantuan? Hubungi kami di Telegram.</p>
                        </div>
                    `
                });
                console.log(`[web-status] Email sent to ${email}`);
            } catch (emailErr) {
                console.error('[web-status] Email error (non-fatal):', emailErr.message);
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
        return res.status(500).json({ error: 'Server error: ' + err.message });
    }
};
