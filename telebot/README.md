# 🤖 ClipperSkuy Telebot

Bot Telegram otomatis untuk penjualan lisensi ClipperSkuy.

## Fitur

### 👤 User
- `/start` — Menu utama + katalog
- 🛒 **Katalog Produk** — Pro & Enterprise plans
- 💳 **QRIS Payment** — Auto generate & polling via Tokopay
- 🔑 **Auto Delivery** — License key dikirim otomatis setelah bayar
- 📋 **Riwayat Order** — Lihat history pembelian
- ℹ️ **Tentang App** — Info ClipperSkuy
- 📞 **Hubungi Admin** — Link WhatsApp & Telegram

### 🔧 Admin
- `/admin` — Admin panel (stats, orders, users)
- `/sendkey <userId> <tier> <duration>` — Kirim key manual ke user
- `/broadcast <pesan>` — Broadcast ke semua user
- 🔑 **Generate Key** — Generate key langsung dari bot
- 📊 **Stats** — Revenue, orders, users
- 📋 **Recent Orders** — 10 order terakhir

## Setup

### 1. Buat Bot Telegram
- Chat [@BotFather](https://t.me/BotFather)
- Ketik `/newbot`
- Copy token bot

### 2. Install Dependencies
```bash
cd telebot
npm install
```

### 3. Konfigurasi
Copy `.env.example` ke `.env` dan isi:

```env
BOT_TOKEN=your_telegram_bot_token
ADMIN_IDS=your_telegram_user_id
LICENSE_SERVER_URL=https://your-license-server.vercel.app
ADMIN_API_KEY=your_admin_api_key
TOKOPAY_MERCHANT_ID=your_merchant_id
TOKOPAY_API_KEY=your_api_key
LOG_CHANNEL_ID=-100123456789
```

### 4. Jalankan Bot
```bash
npm start
```

## Alur Order

```
User /start
  → 🛒 Lihat Produk
  → ⚡ Pro Plans / 👑 Enterprise Plans
  → Pilih durasi
  → 💳 Bayar Sekarang (QRIS)
  → Scan & Bayar
  → Bot auto-validate pembayaran
  → 🔑 License key dikirim otomatis!
```

## Struktur

```
telebot/
├── index.js          ← Bot utama
├── .env              ← Konfigurasi (buat dari .env.example)
├── .env.example      ← Template konfigurasi
├── package.json
├── data/
│   └── db.json       ← Database (auto-generated)
└── README.md
```

## Integrasi

Bot ini terintegrasi langsung dengan:
- **License Server** (`/api/admin/keys`) — Generate license key
- **Tokopay** — Generate QRIS & cek status pembayaran

## Produk

| Tier | Durasi | Harga |
|------|--------|-------|
| ⚡ Pro | 30 Hari | Rp69.000 |
| ⚡ Pro | 90 Hari | Rp179.000 |
| ⚡ Pro | 365 Hari | Rp599.000 |
| 👑 Enterprise | 30 Hari | Rp150.000 |
| 👑 Enterprise | Lifetime | Rp999.000 |
