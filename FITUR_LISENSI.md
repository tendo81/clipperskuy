# 🔑 Sistem Lisensi & Distribusi — Detail Lengkap

## 📌 Model Lisensi

### 3 Tier

| Tier | Target | Harga Saran | Fitur |
|------|--------|-------------|-------|
| 🆓 **Free** | Coba-coba | Gratis | 3 project/bulan, watermark app, 720p max, 5 clips/project |
| 💎 **Pro** | Creator | Rp 1.500.000 (sekali bayar) | Unlimited, no watermark, 1080p, all features |
| 🏢 **Enterprise** | Agency | Rp 5.000.000 (sekali bayar) | White-label, multi brand kit, priority support |

### Batasan per Tier

| Fitur | Free | Pro | Enterprise |
|-------|------|-----|-----------|
| Projects per bulan | 3 | ∞ | ∞ |
| Clips per project | 5 | ∞ | ∞ |
| Max resolution | 720p | 1080p | 4K |
| App watermark | ✅ Ada | ❌ Tidak | ❌ Tidak |
| Face tracking | ❌ | ✅ | ✅ |
| Brand Kit | 1 (basic) | 3 | ∞ |
| Caption styles | 3 preset | All | All + custom |
| Multi-language | 1 bahasa | All | All |
| Batch export | ❌ | ✅ | ✅ |
| Hardware accel | ❌ | ✅ | ✅ |
| White-label | ❌ | ❌ | ✅ |
| Auto-update | ✅ | ✅ | ✅ |
| Support | Community | Email | Priority |

---

## 🔐 License Key System

### Format Key
```
XXXX-XXXX-XXXX-XXXX
Contoh: OPUS-A3F7-K9M2-X4P1

Prefix menandakan tier:
- OPFR-xxxx = Free (generated otomatis)
- OPPR-xxxx = Pro
- OPEN-xxxx = Enterprise
```

### Validation Flow
```
User input license key
       ↓
1. Format check (regex: /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
       ↓
2. Online validation (API call ke license server Anda)
   POST https://your-server.com/api/license/validate
   Body: { key, hardware_id, app_version }
       ↓
3. Server response:
   { valid: true, tier: "pro", expires: "2027-02-14", features: [...] }
       ↓
4. Store locally (encrypted) untuk offline use
       ↓
5. Re-validate setiap 7 hari (grace period jika offline)
```

### Hardware Fingerprint
```javascript
// Generate unique hardware ID
function getHardwareId() {
  const os = require('os');
  const crypto = require('crypto');
  
  const data = [
    os.hostname(),
    os.cpus()[0].model,
    os.totalmem(),
    // + disk serial number
  ].join('|');
  
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

// 1 key = 1 komputer (atau 2 untuk Pro, 5 untuk Enterprise)
```

### License UI
```
┌─────────────────────────────────────────────┐
│  🔑 LICENSE                                  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                              │
│  Current: 🆓 Free Plan                       │
│  Limits: 2/3 projects used this month       │
│                                              │
│  Enter License Key:                          │
│  [________________-____-____-____]          │
│  [🔓 Activate]                               │
│                                              │
│  ── Or ──                                   │
│  [🛒 Buy Pro License]  → buka website       │
│  [💼 Buy Enterprise]   → contact form       │
│                                              │
│  ── After Activation ──                     │
│  Status: 💎 Pro License                      │
│  Key: OPPR-A3F7-****-****                    │
│  Activated: 2026-02-14                       │
│  Device: This PC                             │
│  [🔄 Deactivate] (pindah ke PC lain)        │
│                                              │
└─────────────────────────────────────────────┘
```

---

## 📦 Distribution Method

### Installer (.exe)
```
electron-builder config:
  - Target: NSIS installer (Windows)
  - App name: OpusFlow
  - Bundle: FFmpeg binaries included
  - Size: ~150-200 MB installer
  - Shortcuts: Desktop + Start Menu
  - Uninstaller: Included
```

### Auto-Updater
```
1. App checks for updates on startup
2. Compare local version vs server version
3. If new version: show notification
4. User clicks "Update" → download in background
5. Restart app → install update → done
```

### Simple License Server
```
Anda butuh simple web server untuk:
1. Generate license keys
2. Validate license keys
3. Track activations per key
4. Manage customer database

Bisa pakai: Simple Node.js API + database
Atau: Gumroad/LemonSqueezy (payment + license built-in)
```
