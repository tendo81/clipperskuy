# 🎬 Fitur Subtitle / Caption — Detail Lengkap

> Subtitle adalah salah satu fitur PALING PENTING di short-form video.
> 85% pengguna TikTok & Instagram menonton video tanpa suara.
> Caption yang bagus = retention rate naik 40%+

---

## 📌 Fitur Subtitle yang Harus Ada

### 1. 🤖 Auto-Generate Caption (AI Transcription)
Otomatis generate subtitle dari audio video.

**Capabilities:**
- Word-level timestamps (per kata, bukan per kalimat)
- Akurasi 95%+ via Groq Whisper / Gemini
- Support bahasa:
  - 🇮🇩 Indonesia
  - 🇬🇧 English
  - 🇸🇦 Arabic
  - 🇲🇾 Malay
  - 🇯🇵 Japanese
  - 🇰🇷 Korean
  - 🇨🇳 Chinese
  - 🇹🇭 Thai
  - Dan 20+ bahasa lainnya
- Auto-detect bahasa jika user tidak memilih

---

### 2. 🎨 Caption Style Templates (10+ Styles)

```
┌─────────────────────────────────────────────────────────────┐
│                    CAPTION STYLE GALLERY                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐        │
│  │  HORMOZI    │  │  KARAOKE    │  │  MINIMAL     │        │
│  │  ─────────  │  │  ─────────  │  │  ──────────  │        │
│  │  Kuning     │  │  Rainbow    │  │  Putih tipis │        │
│  │  word-by-   │  │  kata per   │  │  lowercase   │        │
│  │  word POP   │  │  kata GLOW  │  │  clean fade  │        │
│  │  highlight  │  │  bounce     │  │              │        │
│  └─────────────┘  └─────────────┘  └──────────────┘        │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐        │
│  │  ALI ABDAAL │  │  GAMING     │  │  NEWS        │        │
│  │  ─────────  │  │  ─────────  │  │  ──────────  │        │
│  │  Putih bold │  │  Neon glow  │  │  Lower third │        │
│  │  1-2 kata   │  │  impact     │  │  bar + text  │        │
│  │  center     │  │  shake on   │  │  gradient bg │        │
│  │  highlight  │  │  emphasis   │  │              │        │
│  └─────────────┘  └─────────────┘  └──────────────┘        │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐        │
│  │  PODCAST    │  │  CINEMA     │  │  TIKTOK OG   │        │
│  │  ─────────  │  │  ─────────  │  │  ──────────  │        │
│  │  2 baris    │  │  Italic     │  │  Putih bold  │        │
│  │  speaker    │  │  cinematic  │  │  outline     │        │
│  │  name tag   │  │  bottom bar │  │  shadow drop │        │
│  │  color code │  │  serif font │  │  center mid  │        │
│  └─────────────┘  └─────────────┘  └──────────────┘        │
│                                                              │
│  ┌─────────────┐                                            │
│  │  CUSTOM ✏️  │  ← User bikin style sendiri               │
│  │  ─────────  │                                            │
│  │  Full       │                                            │
│  │  control    │                                            │
│  │  over all   │                                            │
│  │  settings   │                                            │
│  └─────────────┘                                            │
└─────────────────────────────────────────────────────────────┘
```

---

### 3. ✏️ Caption Customization (Full Control)

Setiap aspek caption bisa di-customize:

#### 🔤 Typography
| Setting | Options | Default |
|---------|---------|---------|
| Font Family | Inter, Montserrat, Poppins, Impact, Bebas Neue, Custom | Montserrat |
| Font Size | 16px - 72px (slider) | 36px |
| Font Weight | Light, Regular, Bold, Extra Bold | Bold |
| Text Case | Normal, UPPERCASE, lowercase | UPPERCASE |
| Letter Spacing | -2px to +5px | 0px |
| Line Height | 0.8 - 2.0 | 1.2 |

#### 🎨 Colors & Effects
| Setting | Options | Default |
|---------|---------|---------|
| Text Color | Color picker + presets | #FFFFFF |
| Highlight Color | Color yang muncul saat kata diucapkan | #FFD700 (kuning) |
| Outline/Stroke | 0px - 5px, color picker | 2px #000000 |
| Shadow | X, Y, Blur, Color | 2px 2px 4px rgba(0,0,0,0.8) |
| Background Box | None / Solid / Gradient / Blur | None |
| Background Color | Color picker + opacity slider | rgba(0,0,0,0.5) |
| Background Radius | 0px - 20px | 8px |

#### 📐 Position & Layout
| Setting | Options | Default |
|---------|---------|---------|
| Vertical Position | Top / Center / Bottom / Custom % | Bottom 15% |
| Horizontal Align | Left / Center / Right | Center |
| Max Width | 50% - 100% of screen | 85% |
| Words Per Line | 1 - 8 kata per baris | 3 |
| Max Lines | 1 - 4 baris | 2 |
| Margin/Padding | Custom sides | 16px all |

#### ✨ Animation
| Setting | Options | Default |
|---------|---------|---------|
| Word Animation | None / Pop / Fade / Slide / Bounce / Scale | Pop |
| Highlight Mode | None / Color Change / Background / Underline / Scale | Color Change |
| Transition In | Fade / Slide Up / Scale / Typewriter | Fade |
| Transition Out | Fade / Slide Down / Scale | Fade |
| Animation Speed | Slow / Normal / Fast | Normal |
| Emphasis Effect | None / Shake / Glow / Bold Pulse | None |

---

### 4. 🔤 Word-by-Word Highlight Animation
Kata muncul dan di-highlight satu per satu mengikuti timing audio.

**Mode highlight:**
```
Mode 1 — Color Change:
  "Hari ini" → "HARI ini" → "hari INI" → "hari ini KITA"
  (kata aktif berubah warna kuning, lainnya tetap putih)

Mode 2 — Pop/Scale:  
  "hari" [normal] → "INI" [membesar 120%] → "kita" [normal]
  (kata aktif membesar lalu kembali normal)

Mode 3 — Background Highlight:
  "hari |INI| kita"
  (kata aktif punya background box berwarna)

Mode 4 — Underline Sweep:
  "hari ini kita"
        ═══
  (garis bawah bergerak mengikuti kata aktif)

Mode 5 — Karaoke Fill:
  "h̶a̶r̶i̶ ̶i̶n̶i̶ ki|ta"
  (teks terisi warna dari kiri ke kanan seperti karaoke)
```

---

### 5. 🗣️ Speaker Detection & Color Coding
Untuk video dengan 2+ pembicara (podcast, interview):

```
┌─────────────────────────┐
│                         │
│      [Video Frame]      │
│                         │
│  ┌───────────────────┐  │
│  │ 🟡 HOST:          │  │
│  │ "Jadi menurut     │  │
│  │  kamu gimana?"    │  │
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │ 🔵 GUEST:         │  │ 
│  │ "Menurut saya     │  │
│  │  AI itu penting"  │  │
│  └───────────────────┘  │
└─────────────────────────┘
```

**Fitur:**
- Auto-detect jumlah pembicara dari audio
- Assign warna berbeda per speaker
- Label nama speaker (editable)
- Posisi caption bisa beda per speaker (kiri/kanan)

---

### 6. 🌍 Multi-Language Subtitle (Translation)
Generate subtitle dalam beberapa bahasa sekaligus:

```
┌─────────────────────────────────┐
│  Original (Indonesian):         │
│  "Hari ini kita bahas tentang"  │
│                                 │
│  ┌─ Generated Translations ──┐  │
│  │ 🇬🇧 EN: "Today we discuss"│  │
│  │ 🇸🇦 AR: "اليوم نناقش"      │  │
│  │ 🇯🇵 JP: "今日は議論します"    │  │
│  │ 🇰🇷 KR: "오늘 우리는 논의"    │  │
│  └────────────────────────────┘  │
│                                 │
│  Mode tampilan:                 │
│  ○ Single language              │
│  ○ Dual language (original +    │
│    translation di bawahnya)     │
│  ○ Export per bahasa (batch)    │
└─────────────────────────────────┘
```

---

### 7. ✂️ Manual Caption Editor
User bisa edit teks caption yang sudah di-generate:

```
┌─────────────────────────────────────────────────┐
│  CAPTION EDITOR                                  │
├─────────────────────────────────────────────────┤
│                                                  │
│  ⏱️ 00:00.00 - 00:01.23                          │
│  ┌─────────────────────────────────────────┐     │
│  │ Halo semuanya                           │ ✏️  │
│  └─────────────────────────────────────────┘     │
│                                                  │
│  ⏱️ 00:01.23 - 00:03.45                          │
│  ┌─────────────────────────────────────────┐     │
│  │ Hari ini kita akan membahas             │ ✏️  │
│  └─────────────────────────────────────────┘     │
│                                                  │
│  ⏱️ 00:03.45 - 00:05.67                          │
│  ┌─────────────────────────────────────────┐     │
│  │ tentang cara membuat aplikasi           │ ✏️  │
│  └─────────────────────────────────────────┘     │
│                                                  │
│  [+ Add Caption]  [Merge]  [Split]  [Delete]     │
│                                                  │
│  Timeline: ──●────────●────────●───────── ►      │
│             00:00    00:03    00:05               │
└─────────────────────────────────────────────────┘
```

**Fitur editor:**
- Edit teks langsung (inline)
- Adjust timing start/end per kata atau kalimat
- Split satu caption jadi dua
- Merge dua caption jadi satu
- Drag-drop di timeline untuk geser timing
- Shortcut keyboard (J/K/L untuk navigasi, Space untuk play/pause)

---

### 8. 😀 Emoji & Keyword Emphasis
AI otomatis tambahkan emoji relevan dan efek khusus pada kata-kata penting:

```
Biasa:   "Hari ini kita bahas tentang uang dan investasi"

Enhanced: "Hari ini kita bahas tentang 💰 UANG dan 📈 INVESTASI"
                                         ^^^^          ^^^^^^^^^^
                                      (kuning, bold)  (hijau, scale up)
```

**Rules:**
- Keyword penting → Bold + warna berbeda
- Angka/statistik → Warna highlight + scale effect
- Emoji matching → AI pilih emoji yang cocok
- User bisa on/off dan edit

---

### 9. 📥 Import & Export Format

**Import (user punya subtitle sendiri):**
- `.srt` — SubRip (paling umum)
- `.vtt` — WebVTT
- `.ass` / `.ssa` — Advanced SubStation Alpha (styled)
- `.txt` — Plain text (tanpa timing, AI auto-timing)
- `.json` — Custom format

**Export:**
- Burn-in ke video (hardcoded — rendered jadi bagian video)
- `.srt` file terpisah
- `.vtt` file terpisah  
- `.ass` file terpisah (untuk styled subs)
- Embed ke MP4 sebagai soft-sub (bisa on/off di player)

---

### 10. 🎯 Smart Caption Breaking
AI otomatis break caption di titik yang natural:

```
❌ BURUK (break di tengah frasa):
  Baris 1: "Hari ini kita akan"
  Baris 2: "membahas tentang AI"

✅ BAGUS (break di boundary natural):
  Baris 1: "Hari ini"  
  Baris 2: "kita akan membahas"
  Baris 3: "tentang AI"
```

**Rules:**
- Jangan break di tengah frasa/noun phrase
- Break setelah koma, titik, atau boundary kalimat
- Max 3-5 kata per baris (configurable)
- Sesuaikan reading speed (WPM) 
- Pertimbangkan screen real estate (jangan terlalu panjang)

---

### 11. ♿ Accessibility Features

| Fitur | Deskripsi |
|-------|-----------|
| High Contrast Mode | Caption dengan kontras tinggi untuk low vision |
| Large Text Preset | Preset ukuran besar (48px+) |
| Background Always On | Background box selalu tampil agar mudah dibaca |
| Sans-Serif Only | Hanya font yang mudah dibaca |
| Reading Speed Control | Adjust berapa lama tiap caption tampil |
| Color Blind Safe | Palette warna yang aman untuk color blind |

---

## 🏗️ Implementasi Teknis (High Level)

### Caption Rendering Pipeline:
```
Audio → AI Transcription (Groq/Gemini)
  ↓
Word-level timestamps JSON
  ↓
Caption Breaking Algorithm (smart line breaks)
  ↓
Style Template Applied (font, color, animation)
  ↓
Preview Renderer (HTML Canvas atau CSS animation)
  ↓
Export: FFmpeg ASS filter (burn-in) atau SRT file
```

### Data Format (Internal):
```json
{
  "captions": [
    {
      "id": "cap_001",
      "text": "Hari ini kita bahas",
      "startTime": 0.0,
      "endTime": 1.23,
      "speaker": "host",
      "words": [
        { "word": "Hari", "start": 0.0, "end": 0.25 },
        { "word": "ini", "start": 0.28, "end": 0.45 },
        { "word": "kita", "start": 0.50, "end": 0.72 },
        { "word": "bahas", "start": 0.75, "end": 1.23 }
      ],
      "translation": {
        "en": "Today we discuss",
        "ar": "اليوم نناقش"
      },
      "emphasis": [
        { "word": "bahas", "effect": "highlight", "emoji": "💬" }
      ]
    }
  ],
  "style": {
    "template": "hormozi",
    "font": "Montserrat",
    "fontSize": 36,
    "fontWeight": 800,
    "textColor": "#FFFFFF",
    "highlightColor": "#FFD700",
    "outline": { "width": 2, "color": "#000000" },
    "position": { "vertical": "bottom", "offset": 15 },
    "animation": { "type": "pop", "highlight": "colorChange" },
    "wordsPerLine": 3,
    "maxLines": 2
  }
}
```

---

## ✅ Ringkasan — Fitur Subtitle untuk V1

| # | Fitur | Priority |
|---|-------|----------|
| 1 | Auto-Generate Caption (AI) | 🔴 Wajib |
| 2 | 10+ Caption Style Templates | 🔴 Wajib |
| 3 | Word-by-Word Highlight | 🔴 Wajib |
| 4 | Full Customization Panel | 🔴 Wajib |
| 5 | Manual Caption Editor | 🔴 Wajib |
| 6 | Smart Caption Breaking | 🔴 Wajib |
| 7 | Import SRT/VTT | 🟡 Penting |
| 8 | Export SRT/VTT + Burn-in | 🟡 Penting |
| 9 | Speaker Detection | 🟡 Penting |
| 10 | Multi-Language Translation | 🟡 Penting |
| 11 | Emoji & Keyword Emphasis | 🟢 Nice to have |
| 12 | Accessibility Features | 🟢 Nice to have |
