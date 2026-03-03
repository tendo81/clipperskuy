/**
 * POST /api/web-notify
 * Kirim email berisi license key setelah pembayaran berhasil
 * Body: { email, name, license_key, invoice_id, product_name }
 * Internal use: dipanggil setelah payment confirmed
 */
const nodemailer = require('nodemailer');
const { handleCors, parseBody } = require('./_lib/helpers');

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

function createTransporter() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: GMAIL_USER,
            pass: GMAIL_APP_PASSWORD
        }
    });
}

function buildEmailHTML(name, licenseKey, invoiceId, productName) {
    return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>License Key ClipperSkuy</title>
</head>
<body style="margin:0;padding:0;background:#09090f;font-family:'Segoe UI',Arial,sans-serif;color:#f0f0f5;">
<div style="max-width:560px;margin:0 auto;padding:40px 24px;">

  <!-- Header -->
  <div style="text-align:center;margin-bottom:32px;">
    <div style="font-size:32px;font-weight:900;background:linear-gradient(135deg,#7c3aed,#22d3ee);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">
      ⚡ ClipperSkuy
    </div>
    <div style="font-size:14px;color:rgba(255,255,255,0.5);margin-top:6px;">AI Video Clip Generator</div>
  </div>

  <!-- Success banner -->
  <div style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:16px;padding:24px;text-align:center;margin-bottom:24px;">
    <div style="font-size:36px;margin-bottom:8px;">🎉</div>
    <div style="font-size:20px;font-weight:700;color:#22c55e;">Pembayaran Berhasil!</div>
    <div style="font-size:14px;color:rgba(255,255,255,0.6);margin-top:4px;">Halo ${name}, license kamu siap digunakan!</div>
  </div>

  <!-- Product -->
  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:20px;margin-bottom:20px;">
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,0.35);margin-bottom:6px;">Produk</div>
    <div style="font-size:16px;font-weight:700;">⚡ ${productName}</div>
  </div>

  <!-- License key -->
  <div style="background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.3);border-radius:14px;padding:24px;margin-bottom:20px;text-align:center;">
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,0.4);margin-bottom:12px;">🔑 License Key Kamu</div>
    <div style="font-family:monospace;font-size:20px;font-weight:700;color:#a78bfa;letter-spacing:2px;word-break:break-all;padding:12px;background:rgba(0,0,0,0.3);border-radius:10px;">
      ${licenseKey}
    </div>
    <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:10px;">Klik copy dan paste di aplikasi ClipperSkuy</div>
  </div>

  <!-- Invoice ID -->
  <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;margin-bottom:24px;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,0.3);margin-bottom:6px;">📄 Invoice ID (simpan ini!)</div>
    <div style="font-family:monospace;font-size:13px;color:#7c3aed;">${invoiceId}</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px;">Lupa copy key? Kunjungi clipperskuy.my.id/beli.html → masukkan Invoice ID ini untuk ambil key kamu lagi kapanpun.</div>
  </div>

  <!-- Cara aktivasi -->
  <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:20px;margin-bottom:24px;">
    <div style="font-size:14px;font-weight:700;margin-bottom:14px;">📋 Cara Aktivasi</div>
    <ol style="padding-left:18px;color:rgba(255,255,255,0.7);font-size:14px;line-height:1.8;margin:0;">
      <li>Buka ClipperSkuy di PC kamu</li>
      <li>Buka menu <b style="color:#fff;">Settings → License</b></li>
      <li>Paste license key di atas</li>
      <li>Klik <b style="color:#fff;">"Activate License"</b></li>
      <li>Selesai! Semua fitur premium aktif 🎊</li>
    </ol>
  </div>

  <!-- Warning -->
  <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:12px;padding:14px 18px;margin-bottom:24px;font-size:13px;color:rgba(255,255,255,0.7);">
    ⚠️ <b style="color:#f59e0b;">1 key = 1 PC.</b> Simpan email ini baik-baik. Jangan bagikan license key ke orang lain.
  </div>

  <!-- Support -->
  <div style="text-align:center;padding-top:20px;border-top:1px solid rgba(255,255,255,0.06);">
    <div style="font-size:13px;color:rgba(255,255,255,0.4);">Ada kendala? Hubungi support kami</div>
    <a href="https://t.me/Skuy_bot" style="display:inline-block;margin-top:10px;padding:10px 24px;background:linear-gradient(135deg,#7c3aed,#22d3ee);color:#fff;border-radius:50px;text-decoration:none;font-size:14px;font-weight:700;">
      💬 Hubungi @Skuy_bot
    </a>
    <div style="font-size:11px;color:rgba(255,255,255,0.25);margin-top:20px;">
      © 2025 ClipperSkuy · clipperskuy.my.id
    </div>
  </div>

</div>
</body>
</html>`;
}

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
        return res.status(500).json({ error: 'Email not configured' });
    }

    const body = await parseBody(req);
    const { email, name, license_key, invoice_id, product_name } = body;

    if (!email || !license_key || !invoice_id) {
        return res.status(400).json({ error: 'Missing required fields: email, license_key, invoice_id' });
    }

    try {
        const transporter = createTransporter();
        await transporter.sendMail({
            from: `"ClipperSkuy" <${GMAIL_USER}>`,
            to: email,
            subject: `🔑 License Key ClipperSkuy Kamu — ${invoice_id}`,
            html: buildEmailHTML(name || 'Pengguna', license_key, invoice_id, product_name || 'ClipperSkuy Pro'),
            text: `License Key: ${license_key}\nInvoice ID: ${invoice_id}\n\nLupa key? Kunjungi clipperskuy.my.id/beli.html dan masukkan Invoice ID di atas.`
        });

        console.log(`[web-notify] Email sent to ${email} for invoice ${invoice_id}`);
        return res.json({ success: true });

    } catch (err) {
        console.error('[web-notify] Email error:', err.message);
        return res.status(500).json({ error: 'Gagal kirim email: ' + err.message });
    }
};
