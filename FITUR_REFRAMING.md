# 📐 Video Reframing — Detail Lengkap

> Mengubah video landscape (16:9) menjadi portrait (9:16) atau square (1:1)
> sambil memastikan subjek utama tetap terlihat.

---

## 📌 5 Mode Reframing

### Mode 1: 🎯 Center Crop (Paling Simpel)

Potong dari tengah. Tidak ada AI, murni crop geometris.

```
Input (16:9 landscape):
┌──────────────────────────────────────┐
│           ┌──────────┐               │
│           │ Di-ambil │               │
│           │ bagian   │               │
│           │ tengah   │               │
│           └──────────┘               │
└──────────────────────────────────────┘

Output (9:16 portrait):
┌──────────┐
│          │
│  Bagian  │
│  tengah  │
│  saja    │
│          │
└──────────┘
```

**FFmpeg Command:**
```bash
# 1080x1920 portrait dari 1920x1080 landscape
ffmpeg -i input.mp4 \
  -vf "crop=608:1080:656:0,scale=1080:1920" \
  output_916.mp4
```

**Kelebihan:** Cepat, tidak butuh AI
**Kekurangan:** Speaker bisa terpotong kalau tidak di tengah

---

### Mode 2: 👤 AI Face Tracking (Paling Canggih)

AI mendeteksi wajah speaker → auto crop mengikuti posisi wajah.

```
Frame 1: Speaker di kiri
┌──────────────────────────────────────┐
│  ┌──────────┐                        │
│  │ 😀       │   ←── AI detect wajah │
│  │ Speaker  │                        │
│  └──────────┘                        │
└──────────────────────────────────────┘
     ↑ Crop di sini

Frame 2: Speaker bergerak ke kanan
┌──────────────────────────────────────┐
│                   ┌──────────┐       │
│                   │ 😀       │       │
│                   │ Speaker  │       │
│                   └──────────┘       │
└──────────────────────────────────────┘
                     ↑ Crop ikut geser (smooth)

Output: Wajah SELALU di tengah frame
┌──────────┐
│          │
│    😀    │  ← Wajah selalu centered
│ Speaker  │
│          │
│          │
└──────────┘
```

**Implementasi Teknis:**
```
1. FFmpeg extract frames (1 fps atau 5 fps)
2. OpenCV / MediaPipe face detection per frame
3. Generate koordinat crop per frame
4. Smooth coordinates (agar tidak jumpy)
5. FFmpeg apply dynamic crop

Alternative: Menggunakan AI model langsung
- MediaPipe Face Detection (offline, cepat)
- atau Gemini Vision API (online, akurat)
```

**Smoothing Algorithm:**
```
Masalah: Tanpa smoothing, crop lompat-lompat tiap frame
Solusi: Exponential Moving Average (EMA)

smoothed_x = α × current_x + (1 - α) × previous_smoothed_x
α = 0.1 (lambat, smooth) sampai 0.5 (cepat, responsive)

Atur berdasarkan:
- Talking head → α rendah (smooth, stabil)
- Action/movement → α tinggi (responsive)
```

---

### Mode 3: 📱 Split Screen (Speaker + Content)

Untuk video tutorial/presentasi dimana ada speaker + screen share.

```
Input: Speaker + Presentasi
┌──────────────────────────────────────┐
│  ┌─────┐  ┌─────────────────────┐   │
│  │ 😀  │  │  SLIDE / SCREEN    │   │
│  │     │  │  SHARE CONTENT     │   │
│  └─────┘  └─────────────────────┘   │
└──────────────────────────────────────┘

Output (9:16): Split vertikal
┌──────────┐
│ ┌──────┐ │
│ │SCREEN│ │  ← Konten di atas (60%)
│ │SHARE │ │
│ └──────┘ │
│ ┌──────┐ │
│ │  😀  │ │  ← Speaker di bawah (40%)
│ │      │ │
│ └──────┘ │
└──────────┘

Variasi layout:
┌──────────┐  ┌──────────┐  ┌──────────┐
│ ┌──────┐ │  │ ┌──┐┌──┐ │  │ ┌──────┐ │
│ │SCREEN│ │  │ │SC││😀│ │  │ │  😀  │ │
│ │      │ │  │ │RE││  │ │  │ │      │ │
│ └──────┘ │  │ │EN││  │ │  │ └──────┘ │
│ ┌──────┐ │  │ │  ││  │ │  │ ┌──────┐ │
│ │  😀  │ │  │ └──┘└──┘ │  │ │SCREEN│ │
│ └──────┘ │  │ Side by   │  │ │      │ │
│ Top-Bot  │  │ Side      │  │ Bot-Top│ │
└──────────┘  └──────────┘  └──────────┘
```

**AI Detection:**
```
AI harus deteksi:
1. Dimana speaker? (face detection)
2. Dimana konten/screen share? (area non-speaker terbesar)
3. Apakah konten berubah? (slide change detection)
4. Kapan speaker saja vs speaker+konten?
```

---

### Mode 4: 🔲 Fit / Letterbox (Blur Background)

Video tetap utuh, background diisi dengan blur dari video itu sendiri.

```
Input (16:9):
┌──────────────────────────────────────┐
│                                      │
│         Original Video               │
│                                      │
└──────────────────────────────────────┘

Output (9:16): Video utuh + blur background
┌──────────────────┐
│ ░░░░░░░░░░░░░░░░ │  ← Blur dari area atas video
│ ░░░░░░░░░░░░░░░░ │
│ ┌──────────────┐ │
│ │              │ │
│ │ Original     │ │  ← Video utuh (tidak dipotong)
│ │ Video        │ │
│ └──────────────┘ │
│ ░░░░░░░░░░░░░░░░ │  ← Blur dari area bawah video
│ ░░░░░░░░░░░░░░░░ │
└──────────────────┘
```

**FFmpeg Command:**
```bash
ffmpeg -i input.mp4 \
  -filter_complex "
    [0:v]scale=1080:1920:force_original_aspect_ratio=decrease,
    pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black[fg];
    [0:v]scale=1080:1920,boxblur=20:20[bg];
    [bg][fg]overlay=(W-w)/2:(H-h)/2
  " output_fit.mp4
```

**Variasi background:**
| Background | Deskripsi |
|-----------|-----------|
| Blur | Blur dari video sendiri (paling umum) |
| Solid Color | Warna solid (hitam, brand color) |
| Gradient | Gradient dari brand colors |
| Pattern | Pattern/texture |
| Image | Custom background image |

---

### Mode 5: 🎨 Custom Crop (Manual)

User drag area crop sendiri di preview.

```
┌──────────────────────────────────────┐
│         ┌──────────┐                 │
│         │ ╔════════╗│                │
│         │ ║ USER   ║│  ← User drag  │
│         │ ║ SELECTS║│    area crop   │
│         │ ╚════════╝│                │
│         └──────────┘                 │
└──────────────────────────────────────┘

Controls:
• Drag rectangle to select crop area
• Maintain aspect ratio lock (9:16 / 1:1 / 16:9)
• Keyframe crop positions (crop bisa bergerak di timeline)
```

---

## 🎯 Aspect Ratio Support

| Ratio | Pixel Size | Platform | Penggunaan |
|-------|-----------|----------|-----------|
| 9:16 | 1080×1920 | TikTok, Reels, YT Shorts | Portrait/vertical |
| 1:1 | 1080×1080 | Instagram Feed, Facebook | Square |
| 16:9 | 1920×1080 | YouTube, Website | Landscape |
| 4:5 | 1080×1350 | Instagram Feed (tall) | Near-portrait |
| 4:3 | 1440×1080 | Facebook, older format | Classic |

---

## 🔄 Smart Auto-Select

AI otomatis memilih mode reframing terbaik:

```
AI Analisis Video:
  ↓
Talking head saja? → Face Tracking
  ↓
Speaker + Screen share? → Split Screen
  ↓  
Multiple speakers jauh? → Center Crop
  ↓
Banyak movement/action? → Fit (blur bg)
  ↓
User prefer control? → Custom Crop
```

---

## ✅ Ringkasan Reframing

| Mode | Kecepatan | Kualitas | Use Case |
|------|----------|---------|----------|
| 🎯 Center Crop | ⚡⚡⚡ Sangat cepat | ⭐⭐ OK | Quick & simple |
| 👤 Face Track | ⚡ Lambat | ⭐⭐⭐⭐⭐ Terbaik | Talking head, podcast |
| 📱 Split Screen | ⚡⚡ Medium | ⭐⭐⭐⭐ Bagus | Tutorial, presentasi |
| 🔲 Fit/Blur BG | ⚡⚡⚡ Cepat | ⭐⭐⭐ OK | Preserve semua konten |
| 🎨 Custom Crop | Manual | ⭐⭐⭐⭐ Bagus | Full kontrol user |
