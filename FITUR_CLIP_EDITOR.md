# ✂️ Clip & Segment Editor — Detail Lengkap

> Setelah AI generate clips, user bisa edit, trim, split, merge,
> dan customize setiap clip sebelum export.

---

## 📌 Overview Editor

```
┌─────────────────────────────────────────────────────────────────┐
│  CLIP EDITOR                                          [✕] [□]  │
├──────────┬──────────────────────────────────────────────────────┤
│          │                                                      │
│  CLIP    │              VIDEO PREVIEW                           │
│  LIST    │         ┌──────────────────┐                        │
│          │         │                  │                        │
│  ┌────┐  │         │    ▶ Preview     │                        │
│  │ 01 │◄─│         │    Player       │                        │
│  └────┘  │         │                  │                        │
│  ┌────┐  │         └──────────────────┘                        │
│  │ 02 │  │         ◄◄ ▶/⏸ ►► 🔊 ⛶  1x  0:23/0:47           │
│  └────┘  │                                                      │
│  ┌────┐  │  ─────────────────────────────────────────────────  │
│  │ 03 │  │                                                      │
│  └────┘  │              TIMELINE EDITOR                         │
│  ┌────┐  │  ┌─────────────────────────────────────────────┐    │
│  │ 04 │  │  │ 🎬 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │    │
│  └────┘  │  │ 🔊 ▁▂▃▅▇▅▃▂▁▂▃▅▇▅▃▁▂▃▅▅▃▂▁▂▃▅▇▅▃▂▁▁▂ │    │
│  ┌────┐  │  │ 💬 [Halo  ][semua ][hari ][ini  ][kita] │    │
│  │ 05 │  │  └─────────────────────────────────────────────┘    │
│  └────┘  │  ◄─────────────────●───────────────────────────►    │
│          │  00:00            00:23                      00:47   │
│  [+ New] │                                                      │
│          │  ─────────────────────────────────────────────────  │
│          │                                                      │
│          │  PROPERTIES PANEL                                    │
│          │  Caption | Reframe | Audio | Effects                 │
│          │                                                      │
└──────────┴──────────────────────────────────────────────────────┘
```

---

## 🎬 Timeline Editor (Detail)

### 3 Track di Timeline

```
Track 1 — VIDEO:
┌─────────────────────────────────────────────────────┐
│ 🎬 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
│    Thumbnail strip (frame dari video)               │
│    ◄── drag handle          drag handle ──►         │
│    (adjust start)           (adjust end)            │
└─────────────────────────────────────────────────────┘

Track 2 — AUDIO WAVEFORM:
┌─────────────────────────────────────────────────────┐
│ 🔊 ▁▂▃▅▇█▇▅▃▂▁▁▂▃▅▇▅▃▁▁▁▂▃▅▇█▇▅▃▂▁▂▃▅▇▅▃▂▁   │
│    Visual gelombang audio                           │
│    Silence gaps ditandai merah: ▁▁▁                 │
│    Filler words ditandai kuning: ▃▅▃                │
└─────────────────────────────────────────────────────┘

Track 3 — CAPTIONS:
┌─────────────────────────────────────────────────────┐
│ 💬 [Halo ][semua][nya  ][hari ][ini  ][kita ][akan]│
│    Setiap kata = satu block                         │
│    Drag untuk adjust timing                         │
│    Double-click untuk edit teks                     │
└─────────────────────────────────────────────────────┘
```

### Timeline Controls

```
┌─────────────────────────────────────────────────────────┐
│  Zoom:  [-] ════●════════ [+]    Fit: [▣]              │
│                                                          │
│  Snap:  [● On]  Grid: [0.1s ▼]  Waveform: [● Show]    │
│                                                          │
│  Playhead: ──────────|──────────                        │
│                       ↑ posisi sekarang                  │
│                                                          │
│  Keyboard shortcuts:                                    │
│  Space = Play/Pause    J/L = -5s/+5s                   │
│  K = Pause             , /. = frame sebelum/sesudah    │
│  I = Set In point      O = Set Out point               │
│  S = Split at playhead M = Add marker                  │
│  Ctrl+Z = Undo         Ctrl+Y = Redo                   │
└─────────────────────────────────────────────────────────┘
```

---

## ✂️ Editing Operations

### 1. Trim (Adjust Start/End)

```
Sebelum trim:
|◄─────────[════════ CLIP ════════]─────────►|
0:00       0:15                    0:55       1:10
           ↑ start                 ↑ end

User drag handle kanan ke kiri:
|◄─────────[════════ CLIP ════]─────────────►|
0:00       0:15                0:45           1:10
           ↑ start             ↑ new end

Cara trim:
• Drag handle di timeline
• Input timecode manual: [00:15.00] → [00:45.00]
• Tombol ◄-1s / ◄-5s / +5s► / +1s►
• Keyboard: I (in point) / O (out point)
```

---

### 2. Split (Potong Jadi 2)

```
Sebelum split:
[════════════════ CLIP ════════════════]
0:15                                   0:55

Playhead di 0:35, tekan "S" atau tombol Split:

[════════ CLIP A ════════][════════ CLIP B ════════]
0:15                0:35  0:35                 0:55

Hasilnya: 2 clip terpisah yang bisa di-edit/export sendiri
```

---

### 3. Merge (Gabungkan 2 Clip)

```
Sebelum merge:
[════ CLIP A ════]     [════ CLIP B ════]
0:15         0:35      0:40         0:55
                  ↑ gap 5 detik

Select kedua clip → klik "Merge":

[════════════ MERGED CLIP ════════════]
0:15                                  0:55
(gap 5 detik bisa include atau skip)

Options:
○ Include gap (keep video yang ada di gap)
● Skip gap (langsung sambung, potong gap)
○ Crossfade (transisi smooth antara A dan B)
```

---

### 4. Delete Segment (Hapus Bagian Tengah)

```
User select area di tengah clip:

[════════[████ HAPUS ████]════════]
0:15     0:25            0:35     0:55

Setelah delete:

[════════]                [════════]
0:15   0:25              0:35   0:55
    ↓ otomatis jadi
[════════════════]
0:15            0:45  (durasi berkurang 10s)

Audio crossfade otomatis di titik potong agar smooth
```

---

### 5. Reorder (Susun Ulang Segmen)

```
User bisa drag & drop segment untuk ubah urutan:

Sebelum:
[Segment A: Intro] → [Segment B: Cerita] → [Segment C: Punchline]

Drag Segment C ke depan:
[Segment C: Punchline] → [Segment A: Intro] → [Segment B: Cerita]

Use case: Mulai video dengan punchline sebagai hook!
```

---

### 6. Extend to Scene (AI-assisted)

```
AI deteksi natural scene boundaries:

Original clip:
[════════ CLIP ════════]
0:15                   0:45

AI detect: "Ada kalimat bagus yang dimulai di 0:12"

Extend ke scene boundary:
[═══════════ CLIP ═════════════]
0:12                           0:48
  ↑ extended 3s              ↑ extended 3s

AI sarankan extend berdasarkan:
• Awal kalimat terdekat
• Akhir kalimat terdekat  
• Scene change terdekat
• Jeda natural (nafas/pause)
```

---

## 📝 Text-Based Editing

Edit video dengan mengedit teks transcript:

```
┌─────────────────────────────────────────────────────────┐
│  TEXT-BASED EDITOR                                       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                          │
│  Halo semuanya, hari ini kita akan membahas tentang     │
│  artificial intelligence. ▌Jadi [um] sebenarnya [eh]    │
│  AI itu sangat penting untuk masa depan kita semua.     │
│  Dan [jeda 3 detik] menurut saya, setiap orang harus   │
│  belajar tentang hal ini.                                │
│                                                          │
│  ── Legend ──                                           │
│  [um] [eh] = Filler words (kuning, strikethrough)       │
│  [jeda 3s] = Silence gap (abu-abu)                      │
│  ████████ = User highlight untuk delete                  │
│  ▌ = Cursor / playhead position                         │
│                                                          │
│  Actions:                                                │
│  • Select text → Delete = hapus bagian itu di video     │
│  • Click kata → video jump ke timestamp kata itu        │
│  • Click filler → toggle delete/keep                    │
│  • Edit kata → update caption (tidak ubah audio)        │
│                                                          │
│  [🧹 Remove All Fillers] [🔇 Remove All Silence]       │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Contoh alur:**
```
1. User lihat transcript:
   "Jadi um sebenarnya eh AI itu sangat penting"

2. User select "um sebenarnya eh":
   "Jadi [██████████████████] AI itu sangat penting"

3. Klik Delete:
   "Jadi AI itu sangat penting"
   Video otomatis di-trim, audio crossfade smooth

4. Atau klik "Remove All Fillers":
   Semua "um", "eh", "anu" terhapus otomatis
```

---

## 🎨 Properties Panel

### Tab 1: Caption Properties
```
┌─────────────────────────────────────────┐
│  CAPTION                                 │
│                                          │
│  Style: [Hormozi ▼]  [✏️ Customize]     │
│                                          │
│  Preview: "HARI INI KITA BAHAS"         │
│           (word-by-word highlight)       │
│                                          │
│  Edit caption text:                      │
│  ┌───────────────────────────────┐      │
│  │ Hari ini kita bahas          │ ✏️   │
│  └───────────────────────────────┘      │
│                                          │
│  Timing: Auto-sync with audio           │
│  [🔄 Re-sync]  [✏️ Manual timing]      │
│                                          │
└─────────────────────────────────────────┘
```

### Tab 2: Reframe Properties
```
┌─────────────────────────────────────────┐
│  REFRAME                                 │
│                                          │
│  Mode: [👤 Face Track ▼]                │
│                                          │
│  ┌────────────────────────────┐         │
│  │  Preview with crop area    │         │
│  │  ╔══════╗                  │         │
│  │  ║ CROP ║  ← drag to move │         │
│  │  ╚══════╝                  │         │
│  └────────────────────────────┘         │
│                                          │
│  Smoothing: [====●=====] 0.3            │
│  Aspect: [9:16 ▼]                       │
│                                          │
│  [🔄 Re-detect faces]                   │
│  [📌 Pin crop position] (no tracking)   │
│                                          │
└─────────────────────────────────────────┘
```

### Tab 3: Audio Properties
```
┌─────────────────────────────────────────┐
│  AUDIO                                   │
│                                          │
│  Volume:     [========●==] 90%          │
│  Noise Gate: [===●=======] -30dB        │
│  Enhance:    [● On]                      │
│                                          │
│  Filler removal: [● On]                 │
│  Found: 5 fillers, 2 silence gaps       │
│  [👁️ Show in timeline]                  │
│                                          │
│  Background Music:                       │
│  [None ▼]  [📤 Upload]  [🎵 Library]   │
│  Volume: [===●=======] 15%              │
│  Fade in: [1.0s]  Fade out: [2.0s]     │
│                                          │
└─────────────────────────────────────────┘
```

### Tab 4: Effects
```
┌─────────────────────────────────────────┐
│  EFFECTS                                 │
│                                          │
│  Transition In:  [Fade ▼]  [0.5s]      │
│  Transition Out: [Fade ▼]  [0.5s]      │
│                                          │
│  Speed: [========●==] 1.0x              │
│  Options: 0.5x  0.75x  1.0x  1.25x  2x │
│                                          │
│  Filters:                                │
│  ○ None  ○ Brighten  ○ Contrast         │
│  ○ Warm  ○ Cool      ○ Cinematic        │
│                                          │
│  Zoom effect:                            │
│  ☐ Slow zoom in (Ken Burns)             │
│  ☐ Zoom on emphasis words               │
│                                          │
└─────────────────────────────────────────┘
```

---

## 🔄 Undo/Redo System

Setiap edit action bisa di-undo:

```
Edit History:
  1. ✏️ Trimmed end -5s
  2. ✂️ Split at 0:23
  3. 🗑️ Deleted segment 0:12-0:15
  4. 📝 Edited caption "helo" → "halo"   ← Current
  
  [↩️ Undo (Ctrl+Z)]  [↪️ Redo (Ctrl+Y)]
  
Max history: 50 actions
```

---

## 📋 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `J` | Mundur 5 detik |
| `K` | Pause |
| `L` | Maju 5 detik |
| `,` | Frame sebelumnya |
| `.` | Frame berikutnya |
| `I` | Set In point (start) |
| `O` | Set Out point (end) |
| `S` | Split di playhead |
| `Delete` | Hapus segment terpilih |
| `M` | Tambah marker |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+S` | Save project |
| `Ctrl+E` | Export clip |
| `+` / `-` | Zoom timeline |
| `Home` | Ke awal clip |
| `End` | Ke akhir clip |

---

## ✅ Ringkasan Clip Editor

| Fitur | Deskripsi | Priority |
|-------|-----------|----------|
| ✂️ Trim | Adjust start/end dengan drag atau input | 🔴 Wajib |
| ✂️ Split | Potong jadi 2 clip di playhead | 🔴 Wajib |
| 🔗 Merge | Gabungkan 2 clip | 🟡 Penting |
| 🗑️ Delete segment | Hapus bagian tengah | 🔴 Wajib |
| 📝 Text-based edit | Edit video lewat teks | 🔴 Wajib |
| 🔄 Reorder | Drag & drop urutan | 🟡 Penting |
| 🎯 Extend to scene | AI sarankan boundary | 🟡 Penting |
| 🎨 Caption editor | Edit style & text | 🔴 Wajib |
| 📐 Reframe adjust | Adjust crop area | 🟡 Penting |
| 🔊 Audio controls | Volume, enhance, BG music | 🟡 Penting |
| ✨ Effects | Speed, filter, zoom, transitions | 🟢 Nice |
| ⌨️ Keyboard shortcuts | Pro editing workflow | 🟡 Penting |
| ↩️ Undo/Redo | 50-step history | 🔴 Wajib |
