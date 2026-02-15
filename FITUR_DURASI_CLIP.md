# ⏱️ Model Durasi Clip — Detail Lengkap

> Durasi clip sangat mempengaruhi performa di platform.
> Terlalu pendek = cerita tidak lengkap. Terlalu panjang = penonton skip.

---

## 📌 3 Mode Durasi Clip

### Mode 1: 🎯 Platform-Based (Otomatis)
User pilih platform target, AI otomatis sesuaikan durasi optimal.

```
┌──────────────────────────────────────────────────────────┐
│  Pilih Platform Target:                                   │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  📱 TikTok   │  │  📸 Reels    │  │  ▶️ YT Shorts │   │
│  │              │  │              │  │              │   │
│  │  15-60 detik │  │  15-90 detik │  │  30-60 detik │   │
│  │  Sweet: 30s  │  │  Sweet: 30s  │  │  Sweet: 45s  │   │
│  │  9:16        │  │  9:16        │  │  9:16        │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  🔵 Facebook │  │  💼 LinkedIn │  │  🐦 X/Twitter│   │
│  │              │  │              │  │              │   │
│  │  30-90 detik │  │  30-120 dtk  │  │  15-45 detik │   │
│  │  Sweet: 60s  │  │  Sweet: 60s  │  │  Sweet: 30s  │   │
│  │  1:1 / 9:16  │  │  1:1 / 16:9  │  │  16:9 / 9:16 │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                           │
│  ┌──────────────┐                                        │
│  │  🌐 All      │  ← Generate semua ukuran sekaligus     │
│  │  Platforms   │                                        │
│  │  15-90 detik │                                        │
│  └──────────────┘                                        │
└──────────────────────────────────────────────────────────┘
```

**Data durasi optimal per platform (berdasarkan riset 2025):**

| Platform | Min | Max | Sweet Spot | Alasan |
|----------|-----|-----|------------|--------|
| TikTok | 15s | 60s | **21-34s** | Algoritma push video < 60s, completion rate paling tinggi di 30s |
| Instagram Reels | 15s | 90s | **25-35s** | Similar ke TikTok, tapi bisa sedikit lebih panjang |
| YouTube Shorts | 15s | 60s | **40-55s** | Audience YouTube lebih sabar, gunakan max allowance |
| Facebook Reels | 15s | 90s | **30-60s** | Older demographic, lebih toleran durasi panjang |
| LinkedIn | 30s | 120s | **45-90s** | Professional content, butuh lebih detail |
| X/Twitter | 15s | 140s | **20-45s** | Fast-paced feed, harus punchy |

---

### Mode 2: ⚙️ Custom Range (Manual)
User set sendiri durasi minimum dan maximum.

```
┌──────────────────────────────────────────────────────┐
│  Custom Clip Duration                                 │
│                                                       │
│  Minimum: [====●===========] 15 detik                │
│  Maximum: [==========●=====] 60 detik                │
│                                                       │
│  ── Quick Presets ──                                 │
│  [🔥 Ultra Short: 10-20s]  Untuk hooks & teasers     │
│  [⚡ Short: 15-45s]        Standard short-form       │
│  [📹 Medium: 30-90s]       Story-driven content      │
│  [🎬 Long: 60-180s]        Mini episodes             │
│  [📺 Extended: 120-300s]   Deep dives (5 min max)    │
│                                                       │
│  ── Advanced ──                                      │
│  ☑️ Allow AI to exceed max if content is too good     │
│  ☑️ Allow AI to go below min for perfect moments      │
│  ☐ Strict mode (never exceed range)                  │
└──────────────────────────────────────────────────────┘
```

---

### Mode 3: 🧠 AI Smart Duration (Rekomendasi)
AI menentukan durasi terbaik per clip berdasarkan konten. TIDAK ada range fixed.

```
Cara kerja:

Video Input (2 jam podcast)
    ↓
AI Analisis:
    ↓
┌────────────────────────────────────────┐
│  Clip 1: "Cerita Lucu tentang Gagal"  │
│  AI Duration: 47 detik                 │
│  Alasan: Butuh setup + punchline,      │
│  tidak bisa lebih pendek tanpa         │
│  kehilangan konteks                    │
├────────────────────────────────────────┤
│  Clip 2: "Hot Take tentang AI"        │
│  AI Duration: 23 detik                 │
│  Alasan: Statement kuat & punchy,      │
│  langsung ke point                     │
├────────────────────────────────────────┤
│  Clip 3: "Tutorial Step-by-Step"      │
│  AI Duration: 85 detik                 │
│  Alasan: Konten edukatif butuh         │
│  penjelasan lengkap, potong = rusak    │
├────────────────────────────────────────┤
│  Clip 4: "Quote Motivasi Keren"       │
│  AI Duration: 12 detik                 │
│  Alasan: Satu kalimat powerful,        │
│  perfect untuk hook/teaser             │
└────────────────────────────────────────┘
```

**AI mempertimbangkan:**
- 🎯 Apakah cerita/ide complete? (ada opening, isi, closing)
- 🪝 Seberapa kuat hook di 3 detik pertama?
- 📈 Dimana titik drop-off penonton biasanya?
- 🗣️ Apakah speaker selesai bicara atau terpotong?
- 😮 Apakah ada emotional peak yang harus di-include?
- 🎬 Apakah ada visual transition natural (scene change)?

---

## 📊 Durasi vs Tipe Konten

AI juga harus mempertimbangkan tipe konten:

| Tipe Konten | Durasi Ideal | Alasan |
|-------------|-------------|--------|
| 🪝 Hook / Teaser | 8-15s | Pendek, bikin penasaran, CTA "full video in bio" |
| 😂 Momen Lucu | 15-30s | Setup + punchline + reaksi, jangan terlalu lama |
| 💡 Tips / Insight | 20-45s | Cukup untuk 1 insight, tidak bertele-tele |
| 📖 Storytelling | 30-90s | Butuh beginning-middle-end |
| 🎓 Tutorial | 45-180s | Step-by-step butuh waktu, jangan terburu |
| 🔥 Hot Take / Opinion | 15-30s | Punchy statement, langsung ke point |
| 💬 Quote / Motivasi | 8-20s | Satu kalimat powerful |
| 🎤 Interview Highlight | 30-60s | Q&A butuh konteks pertanyaan + jawaban |
| 🆚 Debate / Argument | 30-90s | Butuh kedua sisi argumen |
| 📊 Data / Statistik | 20-40s | Present data + insight, visual heavy |

---

## 🎛️ UI Clip Duration Control

```
┌─────────────────────────────────────────────────────────┐
│  ⏱️ CLIP DURATION SETTINGS                              │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                          │
│  Duration Mode:                                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│  │ 🎯 Platform  │ │ ⚙️ Custom    │ │ 🧠 AI Smart  │     │
│  │   Based      │ │   Range      │ │   Duration   │     │
│  │  ▀▀▀▀▀▀▀▀▀▀ │ │              │ │              │     │
│  └──────────────┘ └──────────────┘ └──────────────┘     │
│                                                          │
│  ── Platform Selected: TikTok ──                        │
│  Optimal range: 15s — 60s                               │
│  Sweet spot: ~30 detik                                  │
│                                                          │
│  Target Jumlah Clips:                                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│  │  📦 Few      │ │  📦📦 Medium │ │  📦📦📦 Many │     │
│  │  Top 3-5     │ │  Top 8-12    │ │  All 15-25+  │     │
│  │  Best only   │ │  Balanced    │ │  Everything  │     │
│  │  ▀▀▀▀▀▀▀▀▀▀ │ │              │ │              │     │
│  └──────────────┘ └──────────────┘ └──────────────┘     │
│                                                          │
│  ── Advanced Settings ──                                │
│  Minimum virality score:  [====●=====]  60/100          │
│  Include "okay" clips:    [OFF ●     ]  No              │
│  Allow overlap between clips: [ON  ●  ]  Yes            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 🔄 Clip Overlap & Deduplication

Saat AI menemukan clips, beberapa mungkin overlap:

```
Timeline video:
0:00 ─────────────────────────────────────── 1:00:00

Clip 1: ████████████                          (2:00 - 3:15)
Clip 2:      ████████████                     (2:30 - 3:45)  ← overlap!
Clip 3:                    ████████           (5:00 - 5:40)
Clip 4:                              ████████ (8:00 - 8:55)
```

**Opsi handling overlap:**
| Mode | Deskripsi |
|------|-----------|
| **Keep Both** | Biarkan overlap, user pilih mana yang lebih baik |
| **Merge** | Gabungkan clip yang overlap jadi satu clip panjang |
| **Best Only** | Pilih clip dengan virality score tertinggi, buang yang lain |
| **Trim** | Otomatis trim boundaries agar tidak overlap |

---

## 📋 Post-Processing: Clip Adjustment

Setelah AI generate clips, user bisa adjust di Results page:

```
┌─────────────────────────────────────────────────────────┐
│  CLIP: "Cerita Lucu tentang AI"           ⭐ Score: 87  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                          │
│  Duration: 47s  |  Original: 2:15 - 3:02                │
│                                                          │
│    ◄ -5s │ Start: [02:15.00] │ +5s ►                    │
│    ◄ -5s │ End:   [03:02.00] │ +5s ►                    │
│                                                          │
│  Timeline:                                               │
│  ... ──[◄|━━━━━━━━━━━━━━━━━━━|►]── ...                  │
│      2:10  2:15            3:02  3:07                    │
│            ↑ drag          ↑ drag                        │
│                                                          │
│  [🔄 Reset] [✂️ Split] [↔️ Extend to Scene] [✅ Confirm] │
│                                                          │
│  💡 AI Suggestion:                                       │
│  "Coba mulai 2 detik lebih awal untuk hook yang lebih   │
│   kuat — ada kalimat bagus di 02:13"                    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 Output Summary

Setelah semua clip ditentukan, tampilkan ringkasan:

```
┌─────────────────────────────────────────────────────────┐
│  📊 CLIP GENERATION SUMMARY                             │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                          │
│  Source: "Podcast Episode 45.mp4"                        │
│  Source Duration: 1:32:15                                │
│  Platform: TikTok (9:16)                                │
│                                                          │
│  ── Results ──                                          │
│  Total Clips Generated:  12                              │
│  Average Duration:       38s                             │
│  Shortest Clip:          15s ("Quick Quote")             │
│  Longest Clip:           58s ("Full Story Arc")          │
│  Total Content:          7:36 from 1:32:15 (8.3%)       │
│                                                          │
│  ── Duration Distribution ──                            │
│  10-20s:  ██░░░░░░░░  2 clips  (hooks/quotes)          │
│  20-40s:  ████████░░  5 clips  (insights/tips)          │
│  40-60s:  ██████░░░░  4 clips  (stories)                │
│  60s+:    ██░░░░░░░░  1 clip   (tutorial)               │
│                                                          │
│  ── Quality ──                                          │
│  ⭐ 90+:   ███░░░░░░░  3 clips  (🔥 Viral potential)   │
│  ⭐ 70-89: ██████░░░░  6 clips  (👍 Good)               │
│  ⭐ 50-69: ███░░░░░░░  3 clips  (📝 Decent)             │
│                                                          │
│  [▶️ Preview All]  [📦 Export All]  [✏️ Edit Clips]      │
└─────────────────────────────────────────────────────────┘
```

---

## ✅ Ringkasan Model Durasi

| Komponen | Detail |
|----------|--------|
| **3 Mode** | Platform-Based, Custom Range, AI Smart |
| **Platform Data** | 6 platform dengan sweet spot masing-masing |
| **Tipe Konten** | 10 tipe konten dengan durasi ideal |
| **Jumlah Clips** | Few (3-5), Medium (8-12), Many (15-25+) |
| **Overlap** | Keep Both, Merge, Best Only, Trim |
| **Adjustment** | Drag timeline, ±5s buttons, split, extend |
| **AI Suggestions** | AI sarankan adjustment untuk hook lebih baik |
