# 🎬 Export & Rendering Pipeline — Detail Lengkap

## 📌 Rendering Pipeline

```
CLIP DATA → Cut → Reframe → Captions → Intro → Outro → Logo → Audio → Encode → Save
```

---

## ⚙️ Hardware Acceleration

| GPU | Encoder | Speed | Command |
|-----|---------|-------|---------|
| NVIDIA | h264_nvenc | ⚡⚡⚡⚡⚡ | `-c:v h264_nvenc` |
| AMD | h264_amf | ⚡⚡⚡⚡ | `-c:v h264_amf` |
| Intel | h264_qsv | ⚡⚡⚡⚡ | `-c:v h264_qsv` |
| CPU | libx264 | ⚡⚡ | `-c:v libx264` |

Auto-detect GPU saat pertama buka app.

---

## 🎚️ Quality Presets

### 🏆 Best Quality
- Resolution: 1080p, Bitrate: 8-10 Mbps, Preset: slow
- ~60MB per menit

### ⚡ Balanced (Default)
- Resolution: 1080p, Bitrate: 5-7 Mbps, Preset: medium
- ~35MB per menit

### 📱 Quick Share
- Resolution: 720p, Bitrate: 2.5-4 Mbps, Preset: fast
- ~15MB per menit

### ⚙️ Custom
- User atur semua parameter sendiri

---

## 📦 Batch Export

Export semua clips sekaligus dengan:
- Quality preset selection
- Brand Kit selection
- Output folder selection
- File naming template
- Per-clip progress bars
- Overall progress + ETA
- Pause / Cancel support
- "Open Folder" setelah selesai

---

## 🔊 Audio Post-Processing

```bash
FFmpeg Audio Chain:
1. Noise Reduction (afftdn) → kurangi background noise
2. High Pass Filter (80Hz) → remove rumble
3. Compression → seragamkan volume
4. Loudness Normalization → -14 LUFS (standard streaming)
```

---

## ✅ Ringkasan Export Steps

| Step | Proses | Tool |
|------|--------|------|
| 1 | Cut segment | FFmpeg `-ss -to` |
| 2 | Reframe | FFmpeg crop + face tracking data |
| 3 | Burn captions | FFmpeg ASS filter |
| 4 | Add intro | FFmpeg concat |
| 5 | Add outro | FFmpeg concat |
| 6 | Overlay logo | FFmpeg overlay filter |
| 7 | Audio enhance | FFmpeg audio filters |
| 8 | Encode | Hardware-accelerated encoder |
| 9 | Save | Write to output folder |
