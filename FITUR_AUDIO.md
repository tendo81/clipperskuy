# 🎤 Audio Enhancement & Filler Removal — Detail Lengkap

> Audio yang jernih = retention rate naik.
> 85% penonton skip video dengan audio buruk.

---

## 📌 3 Fitur Audio Utama

### 1. 🔇 Noise Reduction
Hilangkan background noise: AC, kipas, traffic, hujan, dll.

```
Input:  "Halo semua~~ [BZZZ AC] hari ini [FAN NOISE] kita bahas"
Output: "Halo semuanya, hari ini kita bahas"
         ↑ Audio bersih, suara speaker jernih

FFmpeg filter:
  afftdn=nf=-25         → frequency domain noise reduction
  highpass=f=80          → remove low rumble
  lowpass=f=12000        → remove high hiss

Levels:
  ○ Light  (nf=-20)  — Kurangi noise sedikit, natural
  ● Medium (nf=-25)  — Balanced (default)
  ○ Heavy  (nf=-35)  — Agresif, bisa artifact
```

### 2. 🔊 Loudness Normalization
Seragamkan volume agar tidak ada yang terlalu pelan atau keras.

```
Masalah: Speaker A volume 100%, Speaker B volume 40%
Solusi:  Normalize semua ke -14 LUFS (standard streaming)

FFmpeg filter:
  loudnorm=I=-14:TP=-1.5:LRA=11

Hasil:
  • Semua clip punya volume yang sama
  • Tidak ada bagian yang terlalu keras (clipping)
  • Enak didengar di semua device
```

### 3. 🧹 Filler Word & Silence Removal

```
Detected fillers (ditandai di timeline):
  ┌────────────────────────────────────────────┐
  │ Audio: ▁▃▅▇▅▃ [um] ▅▇▅ [ehh] ▃▅▇█▇▅▃▁   │
  │                 ↑           ↑              │
  │              kuning      kuning            │
  └────────────────────────────────────────────┘

Options:
  ☑️ Remove filler words (um, uh, eh, anu, gitu)
  ☑️ Remove silence gaps > 1.5 seconds
  ☐ Remove coughs/breaths
  
  Crossfade: [0.05s ▼]  (smooth audio join)

Filler database per bahasa:
  ID: "um","ehm","eh","anu","kan","gitu","ya kan","nah","jadi gini"
  EN: "um","uh","like","you know","basically","literally","so"
```

---

## 🎛️ Audio Panel UI

```
┌─────────────────────────────────────────────┐
│  🎤 AUDIO ENHANCEMENT                       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                              │
│  Master Volume: [========●==] 90%           │
│                                              │
│  ── Enhancement ──                          │
│  Noise Reduction: [● On]  Level: [Medium ▼] │
│  Normalize:       [● On]  Target: [-14 LUFS]│
│  Voice Clarity:   [● On]                    │
│                                              │
│  ── Filler Removal ──                       │
│  Auto-remove:     [● On]                    │
│  Found: 12 fillers, 4 silence gaps          │
│  Crossfade:       [0.05s]                   │
│  [👁️ Show in timeline]                      │
│  [🧹 Remove All Now]                        │
│                                              │
│  ── Background Music ──                     │
│  Track: [None ▼]  [📤 Upload] [🎵 Browse]  │
│  Volume: [===●=======] 15%                  │
│  Fade in: [1.0s]  Fade out: [2.0s]         │
│  Duck during speech: [● On]                 │
│                                              │
│  [▶ Preview Audio]  [🔄 Reset]              │
│                                              │
└─────────────────────────────────────────────┘
```

### Audio Ducking
Background music otomatis pelan saat speaker bicara:
```
Speaker bicara:  🗣️ ████████████
Music volume:    🎵 ▁▁▁▁▁▁▁▁▁▁▁▁  (15% → 5%)

Speaker diam:    🗣️ 
Music volume:    🎵 ████████████  (5% → 15%)
```

---

## ✅ Ringkasan Audio

| Fitur | Deskripsi | Priority |
|-------|-----------|----------|
| 🔇 Noise Reduction | Hilangkan background noise | 🔴 Wajib |
| 🔊 Normalize | Seragamkan volume -14 LUFS | 🔴 Wajib |
| 🧹 Filler Removal | Hapus um/eh/jeda otomatis | 🔴 Wajib |
| 🎵 Background Music | Add music + ducking | 🟡 Penting |
| 🔈 Voice Clarity | EQ boost untuk suara | 🟡 Penting |
