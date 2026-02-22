# 🔐 ClipperSkuy License Server

Online license server untuk ClipperSkuy — deployed di **Vercel** (gratis) + **Supabase** (gratis).

## 🚀 Quick Setup (15 menit)

### Step 1: Setup Supabase Database

1. Buka [supabase.com](https://supabase.com) → Sign up (pakai GitHub)
2. Create new project → Pilih region Singapore (terdekat)
3. Copy **Project URL** dan **Service Role Key** dari Settings → API
4. Buka **SQL Editor** → Paste isi file `supabase-schema.sql` → Run

### Step 2: Deploy ke Vercel

1. Push folder `license-server/` ke GitHub repository
2. Buka [vercel.com](https://vercel.com) → Sign up (pakai GitHub)
3. Import repository → Pilih folder `license-server/` sebagai root directory
4. Set Environment Variables:

| Variable | Value | Deskripsi |
|---|---|---|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | Dari Supabase dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` | Dari Supabase Settings → API |
| `LICENSE_SECRET` | `ClipperSkuy-2026-LicenseKey-Secret` | WAJIB SAMA dengan app |
| `ADMIN_API_KEY` | `your-secret-admin-key-here` | Buat sendiri, minimal 32 karakter |

5. Deploy!

### Step 3: Update ClipperSkuy App

Set di `.env` backend:
```
LICENSE_SERVER_URL=https://your-project.vercel.app
ADMIN_API_KEY=your-secret-admin-key-here
```

## 📋 API Endpoints

### User Endpoints (no auth needed)
| Method | Path | Body | Deskripsi |
|---|---|---|---|
| POST | `/api/activate` | `{ key, machine_id, machine_name }` | Aktivasi key |
| POST | `/api/validate` | `{ key, machine_id }` | Cek key masih valid |
| POST | `/api/deactivate` | `{ key, machine_id }` | Deaktivasi key |

### Admin Endpoints (header: `x-admin-key`)
| Method | Path | Body/Params | Deskripsi |
|---|---|---|---|
| GET | `/api/admin/keys` | - | List semua key |
| POST | `/api/admin/keys` | `{ tier, duration_days, max_activations, count }` | Generate key |
| PUT | `/api/admin/manage?id=xxx&action=revoke` | - | Revoke key |
| PUT | `/api/admin/manage?id=xxx&action=activate` | - | Re-activate key |
| PUT | `/api/admin/manage?id=xxx&action=reset` | - | Reset activations |
| DELETE | `/api/admin/manage?id=xxx&action=delete` | - | Delete key |
| GET | `/api/admin/stats` | - | Dashboard stats |

## 🔒 Security

- ✅ HMAC-SHA256 key signature (anti-forgery)
- ✅ Admin API key authentication
- ✅ Supabase Row Level Security
- ✅ Audit log semua aktivitas
- ✅ IP tracking
- ✅ HTTPS (otomatis dari Vercel)
- ✅ Machine binding (1 key = N machines)

## 💰 Biaya

**Rp 0/bulan** — 100% gratis di free tier Vercel + Supabase.
