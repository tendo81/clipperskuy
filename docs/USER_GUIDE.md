# 📖 ClipperSkuy — Panduan Pengguna

> **AI-Powered Video Clipping Engine**  
> Ubah video panjang menjadi viral short clips secara otomatis menggunakan AI.

---

## 📋 Daftar Isi

1. [Instalasi](#-instalasi)
2. [Tampilan Utama](#-tampilan-utama)
3. [Setting API Key (WAJIB)](#-setting-api-key-wajib)
4. [Membuat Proyek Baru](#-membuat-proyek-baru)
5. [Proses Video](#-proses-video)
6. [Mengelola Clip](#-mengelola-clip)
7. [Pengaturan Lainnya](#-pengaturan-lainnya)
8. [Auto-Update](#-auto-update)
9. [Troubleshooting](#-troubleshooting)
10. [FAQ](#-faq)

---

## 📥 Instalasi

### Persyaratan Sistem
| Komponen | Minimum | Disarankan |
|----------|---------|------------|
| **OS** | Windows 10 (64-bit) | Windows 11 |
| **RAM** | 4 GB | 8 GB+ |
| **Storage** | 500 MB + ruang video | SSD 10 GB+ |
| **Internet** | Diperlukan | Stabil/cepat |
| **GPU** | Tidak wajib | NVIDIA/AMD/Intel (untuk render cepat) |

### Cara Install
1. Download file **`ClipperSkuy-Setup-x.x.x.exe`**
2. Double-click file installer
3. Pilih lokasi instalasi (default: `C:\Program Files\ClipperSkuy`)
4. Klik **Install**
5. Tunggu sampai selesai
6. Buka dari **Desktop** atau **Start Menu**

<!-- 📸 Screenshot: tampilan installer -->

### ⚠️ PENTING — Setelah Install
Sebelum bisa menggunakan fitur AI, kamu **WAJIB** setting API Key dulu. Lihat bagian [Setting API Key](#-setting-api-key-wajib) di bawah.

---

## 🖥️ Tampilan Utama

Saat pertama kali dibuka, kamu akan melihat tampilan seperti ini:

<!-- 📸 Screenshot: tampilan dashboard utama -->

### Navigasi Sidebar (Menu Kiri)

| No | Menu | Ikon | Fungsi |
|----|------|------|--------|
| 1 | **Dashboard** | 🏠 | Halaman utama, ringkasan semua proyek |
| 2 | **New Project** | ➕ | Buat proyek baru (upload video / YouTube) |
| 3 | **Projects** | 📁 | Daftar semua proyek |
| 4 | **Settings** | ⚙️ | Pengaturan API key, encoder, dll |

Di bagian bawah sidebar ada **nomor versi** aplikasi (contoh: v1.1.0).

---

## 🔑 Setting API Key (WAJIB)

> ⚠️ **INI LANGKAH PALING PENTING!**  
> Tanpa API key, aplikasi **TIDAK BISA** melakukan transkripsi dan deteksi clip.  
> Kamu butuh minimal **1 API key** dari Groq ATAU Gemini.

### Apa itu API Key?
API Key adalah "kunci akses" untuk menggunakan layanan AI. Seperti password untuk masuk ke layanan AI. **Gratis** untuk penggunaan normal.

---

### 🅰️ Cara Mendapatkan API Key GROQ (Gratis & Cepat)

**Groq** adalah layanan AI yang sangat cepat dan **gratis unlimited**. Disarankan untuk dipakai utama.

#### Langkah 1: Buka Website Groq
- Buka browser (Chrome/Edge)
- Ketik di address bar: **`console.groq.com`**
- Atau klik link ini: [https://console.groq.com](https://console.groq.com)

<!-- 📸 Screenshot: halaman utama console.groq.com -->

#### Langkah 2: Buat Akun / Login
- Klik **"Sign Up"** (kalau belum punya akun)
- Bisa daftar pakai:
  - ✉️ Email
  - 🔵 Google Account (paling gampang)
  - 🐙 GitHub
- Atau klik **"Log In"** kalau sudah punya akun

<!-- 📸 Screenshot: halaman sign up groq -->

#### Langkah 3: Masuk ke Halaman API Keys
- Setelah login, klik menu **"API Keys"** di sidebar kiri
- Atau langsung buka: [https://console.groq.com/keys](https://console.groq.com/keys)

<!-- 📸 Screenshot: halaman API Keys groq -->

#### Langkah 4: Buat API Key Baru
1. Klik tombol **"Create API Key"**
2. Beri nama key (contoh: `clipperskuy`)
3. Klik **"Submit"**
4. **PENTING:** Key akan muncul **SEKALI SAJA**. Langsung copy!
5. Key berbentuk seperti: `gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxx`

<!-- 📸 Screenshot: popup create API key + key yang muncul -->

#### Langkah 5: Paste ke ClipperSkuy
1. Buka **ClipperSkuy**
2. Klik **Settings** di sidebar kiri
3. Scroll ke bagian **"AI API Keys"**
4. Paste key di field **"Groq API Key"**
5. Klik tombol **"Validate"** → harus muncul ✅ hijau
6. Klik **"💾 Save Settings"** di bawah

<!-- 📸 Screenshot: settings page dengan groq key yang sudah diisi -->

> ✅ **Selesai!** Groq API key sudah siap dipakai.

---

### 🅱️ Cara Mendapatkan API Key GEMINI (Gratis, Ada Batas Harian)

**Gemini** adalah AI dari Google. Gratis tapi ada batas penggunaan harian. Bisa dipakai sebagai **cadangan** kalau Groq bermasalah.

#### Langkah 1: Buka Google AI Studio
- Buka browser
- Ketik: **`aistudio.google.com`**
- Atau klik: [https://aistudio.google.com](https://aistudio.google.com)

<!-- 📸 Screenshot: halaman utama AI Studio -->

#### Langkah 2: Login dengan Google
- Login pakai **akun Google** kamu (Gmail)
- Kalau belum punya, buat dulu di [accounts.google.com](https://accounts.google.com)

#### Langkah 3: Buat API Key
1. Klik **"Get API Key"** di sidebar kiri
2. Atau langsung buka: [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)
3. Klik **"Create API Key"**
4. Pilih project (atau buat baru, klik "Create API key in new project")
5. Key akan muncul. Langsung **copy**!
6. Key berbentuk seperti: `AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxx`

<!-- 📸 Screenshot: halaman Get API Key di AI Studio -->

#### Langkah 4: Paste ke ClipperSkuy
1. Buka **ClipperSkuy** → **Settings**
2. Paste key di field **"Gemini API Key"**
3. Klik **"Validate"** → harus muncul ✅ hijau
4. Klik **"💾 Save Settings"**

<!-- 📸 Screenshot: settings page dengan gemini key -->

> ✅ **Selesai!** Gemini API key sudah siap.

---

### 💡 Tips API Key

| Tips | Penjelasan |
|------|------------|
| **Pakai keduanya** | Isi Groq DAN Gemini. Kalau satu error, otomatis pakai yang lain |
| **Multi key** | Klik tombol **"+"** untuk menambah key lebih dari 1 per provider |
| **Validate dulu** | Selalu klik "Validate" sebelum save untuk memastikan key valid |
| **Key gratis** | Kedua layanan gratis. Tidak perlu kartu kredit |
| **Jangan share** | Jangan berikan key kamu ke orang lain |

---

## ➕ Membuat Proyek Baru

Setelah API key siap, kamu bisa mulai membuat proyek.

### Cara Buka
Klik **"New Project"** di sidebar kiri.

<!-- 📸 Screenshot: halaman New Project -->

---

### Opsi 1: Upload File Video

1. **Drag & drop** file video ke area upload  
   ATAU klik area upload untuk **browse** file
2. Format yang didukung: **MP4, MKV, AVI, MOV, WEBM**
3. Tidak ada batas ukuran file

<!-- 📸 Screenshot: area upload dengan file yang sudah di-drag -->

---

### Opsi 2: YouTube URL

1. Klik tab **"YouTube URL"**
2. Paste link YouTube ke field yang tersedia
3. Contoh link yang valid:
   - `https://www.youtube.com/watch?v=xxxxx`
   - `https://youtu.be/xxxxx`
4. Video akan otomatis di-download

<!-- 📸 Screenshot: tab YouTube URL dengan link yang diisi -->

---

### Konfigurasi Proyek

Setelah memilih video, atur opsi berikut:

#### 📱 Target Platform
Pilih mau upload ke platform mana:

| Platform | Rasio | Durasi Optimal |
|----------|-------|----------------|
| **TikTok** | 9:16 (vertikal) | 15-60 detik |
| **Reels** | 9:16 (vertikal) | 15-60 detik |
| **YT Shorts** | 9:16 (vertikal) | 15-60 detik |
| **All Platforms** | 9:16 (vertikal) | Kompatibel semua |

<!-- 📸 Screenshot: pilihan platform -->

#### 🖼️ Mode Reframing
Cara video landscape diubah ke vertikal:

| Mode | Tampilan | Cocok Untuk |
|------|----------|-------------|
| **Center Crop** | Crop bagian tengah | Video biasa |
| **Face Track** | AI ikuti wajah | Podcast, vlog, interview |
| **Split Screen** | Wajah atas + konten bawah | Tutorial, gaming |
| **Fit (Blur)** | Video penuh + blur samping | Semua jenis video |

<!-- 📸 Screenshot: pilihan reframing mode -->

> 💡 **Rekomendasi:** Untuk podcast/vlog, pakai **Face Track**. Untuk tutorial, pakai **Split Screen**.

#### ⏱️ Durasi Clip
| Mode | Fungsi |
|------|--------|
| **Platform** | Otomatis sesuai platform (15-60 detik) |
| **Custom** | Kamu tentukan min & max durasi |
| **AI Smart** | AI pilihkan durasi terbaik |

#### 📦 Jumlah Clip
| Opsi | Jumlah |
|------|--------|
| **Few** | 3-5 clip |
| **Medium** | 6-10 clip |
| **Many** | 10+ clip |

### Mulai Proses
Klik tombol **"🚀 Create Project"** untuk memulai!

---

## ⚙️ Proses Video

Setelah proyek dibuat, video akan diproses dalam **4 tahap otomatis**:

```
📤 Upload/Download  →  🎤 Transkripsi  →  🧠 Analisis AI  →  🎬 Rendering
```

### Tahap 1: Upload / Download
- File video di-upload ke server lokal
- Atau video YouTube di-download otomatis
- Progress bar menunjukkan progress

### Tahap 2: Transkripsi
- Audio diekstrak dari video
- AI (Groq/Gemini) mengubah suara → teks
- Mendukung **Bahasa Indonesia**, **English**, dan banyak bahasa lain

### Tahap 3: Analisis AI
- AI membaca transkrip dan menemukan **momen viral**
- Setiap momen diberi skor:
  - 🎯 **Virality** — Potensi viral
  - 💬 **Engagement** — Seberapa menarik
  - 🔄 **Shareability** — Kemungkinan di-share

### Tahap 4: Rendering Clip
- Video dipotong sesuai momen terpilih
- Di-reframe ke format vertikal 9:16
- Pakai GPU jika tersedia (jauh lebih cepat)

<!-- 📸 Screenshot: halaman project detail saat proses berjalan, tampilkan progress bar dan log -->

### Membatalkan Proses
Kalau mau batal, klik tombol **"Cancel"** kapan saja.

---

## 🎬 Mengelola Clip

Setelah proses selesai, semua clip muncul di halaman **Project Detail**.

<!-- 📸 Screenshot: halaman project detail setelah selesai, menampilkan clip-clip yang dihasilkan -->

### Melihat Clip
- Setiap clip ditampilkan sebagai **card**
- Ada informasi: judul, durasi, skor virality
- Klik clip untuk **preview**

### Aksi pada Setiap Clip

| Tombol | Fungsi |
|--------|--------|
| ▶️ **Play** | Preview clip |
| 📥 **Download** | Download clip ke komputer |
| 📂 **Open Folder** | Buka folder output |
| 📋 **Copy Path** | Copy lokasi file clip |
| 💬 **Generate Caption** | AI buatkan caption untuk sosmed |
| 🗑️ **Delete** | Hapus clip |

### Render Ulang / Pilih Clip
1. Centang ☑️ clip yang diinginkan
2. Klik **"Select All"** untuk pilih semua, atau **"Select None"** untuk batalkan
3. Klik **"Render Selected"** untuk render hanya yang dipilih

### Edit Transcript
Kalau transkrip kurang akurat:
1. Klik tombol **"Edit Transcript"**
2. Edit teks langsung di text area
3. Klik **"Save"**

Atau import dari sumber lain:
- **"Import File"** — Upload file .txt, .srt, .vtt
- **"Import YouTube Captions"** — Ambil subtitle langsung dari YouTube
- **"Paste"** — Paste teks dari clipboard

---

## 🎛️ Pengaturan Lainnya

Selain API key, ada pengaturan lain di halaman **Settings**:

### 🎥 Video Encoder

| Encoder | Kecepatan | Kualitas | GPU Yang Dibutuhkan |
|---------|-----------|----------|---------------------|
| **Auto** | Otomatis | Terbaik | Deteksi otomatis |
| **NVENC** | ⚡⚡⚡ Sangat cepat | Bagus | NVIDIA GeForce/RTX |
| **AMF** | ⚡⚡⚡ Sangat cepat | Bagus | AMD Radeon |
| **QSV** | ⚡⚡ Cepat | Bagus | Intel HD/UHD/Iris |
| **libx264** | 🐌 Lambat | Terbaik | Tidak perlu GPU |

> 💡 Kalau punya GPU NVIDIA, pilih **NVENC** untuk render 5-10x lebih cepat!

### 🍪 Cookie Browser (untuk YouTube)
Jika download YouTube gagal:
1. Di Settings, cari **"Cookie Browser"**
2. Pilih browser yang **sudah login YouTube** (Chrome/Edge/Firefox)
3. Save Settings
4. Coba download lagi

### 🎨 Branding Assets
Upload aset untuk ditambahkan ke clip:
- **Intro** — Video pembuka
- **Outro** — Video penutup
- **Watermark** — Logo/watermark

---

## 🔄 Auto-Update

Aplikasi otomatis cek update saat dibuka.

### Saat Ada Update Baru
1. Muncul notifikasi **"Update Available v.x.x.x"**
2. Klik **"Download Update"**
3. Tunggu progress download selesai (100%)
4. Klik **"Install & Restart"**
5. Aplikasi restart dengan versi terbaru

### Cek Update Manual
1. Klik nama app **"ClipperSkuy"** di sidebar → masuk halaman About
2. Scroll ke bagian **"Software Update"**
3. Klik **"Check Again"**

<!-- 📸 Screenshot: halaman About dengan Software Update section -->

---

## 🔧 Troubleshooting

### ❌ "Backend Offline" / Tidak bisa konek server
**Gejala:** Semua fitur error, data tidak muncul

**Solusi:**
1. Tutup aplikasi
2. Tunggu 5 detik
3. Buka lagi
4. Kalau masih gagal: restart komputer

### ❌ "YouTube download failed"
**Gejala:** Gagal download video dari YouTube

**Solusi:**
1. Pastikan koneksi internet stabil
2. Buka **Settings** → pilih **Cookie Browser** yang login YouTube
3. Coba lagi
4. Kalau masih gagal:
   - Install extension **"Get cookies.txt LOCALLY"** di Chrome
   - Buka YouTube.com (pastikan login)
   - Klik extension → Export
   - Simpan file `cookies.txt` di folder `backend/data/`

### ❌ "Transcription failed" / Transkripsi gagal
**Gejala:** Video tidak bisa di-transkrip

**Solusi:**
1. Cek API key di **Settings** → klik **Validate**
2. Kalau invalid, buat key baru (lihat [Setting API Key](#-setting-api-key-wajib))
3. Cek koneksi internet
4. Tambahkan API key cadangan (key kedua)

### ❌ Rendering sangat lambat
**Gejala:** Proses render clip sangat lama

**Solusi:**
1. Buka **Settings** → ubah encoder ke **NVENC** (NVIDIA) atau **AMF** (AMD)
2. Update driver GPU ke versi terbaru
3. Tutup aplikasi berat lainnya saat rendering

### ❌ Aplikasi tidak bisa dibuka
**Gejala:** Klik shortcut tapi tidak terjadi apa-apa

**Solusi:**
1. Klik kanan → **Run as Administrator**
2. Kalau tidak bisa:
   - Buka File Explorer
   - Ketik `%APPDATA%` di address bar
   - Hapus folder `clipperskuy`
   - Buka aplikasi lagi
3. Kalau masih gagal: download & install ulang

### ❌ "Update check failed"
**Gejala:** Gagal cek update di halaman About

**Solusi:**
- Pastikan koneksi internet aktif
- Coba lagi setelah beberapa menit
- Kalau terus gagal, download installer terbaru secara manual

---

## ❓ FAQ

### Q: Apakah harus pakai internet?
**A:** Ya, internet diperlukan untuk:
- ✅ Transkripsi AI (Groq/Gemini)
- ✅ Deteksi clip AI
- ✅ Download YouTube
- ✅ Cek auto-update

### Q: Berapa lama proses 1 video?
**A:** Tergantung durasi video:

| Durasi Video | Estimasi Waktu |
|-------------|----------------|
| 10 menit | 2-5 menit |
| 30 menit | 5-10 menit |
| 1 jam | 10-20 menit |
| 2 jam | 20-40 menit |

Dengan GPU encoder (NVENC/AMF), rendering bisa **5-10x lebih cepat**.

### Q: Format output clip apa?
**A:** MP4 (H.264), resolusi **1080x1920** (format vertikal 9:16), siap upload ke TikTok/Reels/Shorts.

### Q: Bisa upload video berapa GB?
**A:** Tidak ada batas. Tergantung storage komputer kamu.

### Q: Dimana file clip disimpan?
**A:** Di folder proyek masing-masing. Klik tombol **"📂 Open Folder"** di halaman proyek untuk langsung buka foldernya.

### Q: Apakah API key gratis?
**A:** Ya!
- **Groq** → Gratis unlimited ([console.groq.com](https://console.groq.com))
- **Gemini** → Gratis dengan batas harian ([aistudio.google.com](https://aistudio.google.com))
- Tidak perlu kartu kredit

### Q: Bisa pakai bahasa apa saja?
**A:** AI mendukung banyak bahasa termasuk:
- 🇮🇩 Bahasa Indonesia
- 🇺🇸 English
- 🇯🇵 日本語
- 🇰🇷 한국어
- Dan banyak lagi

### Q: Bagaimana kalau API key kena rate limit?
**A:** Tambahkan **lebih dari 1 key** per provider di Settings. Kalau satu kena limit, otomatis pakai yang lain.

---

## 🎯 Tips & Trik Pro

| # | Tips | Detail |
|---|------|--------|
| 1 | **Multi API Key** | Tambahkan 2-3 key per provider. Klik tombol **"+"** di Settings |
| 2 | **YouTube Captions** | Kalau video YouTube punya subtitle, import langsung → lebih cepat & akurat |
| 3 | **Face Track** | Pakai untuk podcast/interview → wajah speaker selalu di tengah |
| 4 | **GPU Encoder** | Selalu pakai GPU encoder kalau punya → render 5-10x lebih cepat |
| 5 | **AI Smart Duration** | Biarkan AI tentukan durasi → hasil paling optimal |
| 6 | **Batch Render** | Pilih clip terbaik saja → hemat waktu render |
| 7 | **Groq Utama** | Pakai Groq sebagai AI utama (lebih cepat), Gemini sebagai cadangan |

---

## 📸 Cara Menambahkan Screenshot ke Panduan Ini

Untuk menambahkan screenshot:
1. Buka halaman yang ingin di-screenshot
2. Tekan **Win + Shift + S** untuk screenshot
3. Simpan gambar di folder `docs/images/`
4. Ganti komentar `<!-- 📸 Screenshot: ... -->` dengan:
   ```markdown
   ![deskripsi gambar](images/nama_file.png)
   ```

Daftar screenshot yang dibutuhkan:
- [ ] `dashboard.png` — Tampilan Dashboard utama
- [ ] `new_project.png` — Halaman New Project
- [ ] `upload_area.png` — Area upload file
- [ ] `youtube_url.png` — Tab YouTube URL
- [ ] `platform_select.png` — Pilihan platform
- [ ] `reframing_modes.png` — Pilihan reframing
- [ ] `processing.png` — Tampilan saat proses berjalan
- [ ] `clips_result.png` — Hasil clip setelah selesai
- [ ] `settings_page.png` — Halaman Settings
- [ ] `settings_apikey.png` — Field API key di Settings
- [ ] `about_update.png` — Halaman About & Software Update
- [ ] `groq_signup.png` — Halaman sign up Groq
- [ ] `groq_create_key.png` — Halaman create API key Groq
- [ ] `gemini_get_key.png` — Halaman Get API Key Gemini

---

*ClipperSkuy v1.1.0 — AI-Powered Video Clip Engine*  
*© 2026 ClipperSkuy. All rights reserved.*
