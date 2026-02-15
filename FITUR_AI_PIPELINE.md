# 🧠 AI Processing Pipeline — Detail Lengkap

> Otak dari aplikasi ini. AI yang menentukan kualitas clip yang dihasilkan.

---

## 📌 Arsitektur AI

```
┌──────────────────────────────────────────────────────────┐
│                    AI PIPELINE                            │
│                                                           │
│  VIDEO INPUT                                              │
│       ↓                                                   │
│  ┌─────────────┐     ┌──────────────┐                    │
│  │ 1. EXTRACT  │────→│ audio.wav    │                    │
│  │    AUDIO    │     └──────┬───────┘                    │
│  └─────────────┘            ↓                            │
│                    ┌────────────────┐                     │
│                    │ 2. TRANSCRIBE  │                     │
│                    │                │                     │
│                    │  ┌──────────┐  │                     │
│                    │  │  GROQ    │←─── Primary (cepat)   │
│                    │  │ Whisper  │  │                     │
│                    │  └────┬─────┘  │                     │
│                    │       │ fail?  │                     │
│                    │       ↓        │                     │
│                    │  ┌──────────┐  │                     │
│                    │  │ GEMINI   │←─── Fallback          │
│                    │  │ Flash    │  │                     │
│                    │  └────┬─────┘  │                     │
│                    └───────┼────────┘                     │
│                            ↓                             │
│                    ┌────────────────┐                     │
│                    │  transcript    │                     │
│                    │  + timestamps  │                     │
│                    └───────┬────────┘                     │
│                            ↓                             │
│                    ┌────────────────┐                     │
│                    │ 3. AI ANALYZE  │                     │
│                    │                │                     │
│                    │ • Find clips   │                     │
│                    │ • Score viral  │                     │
│                    │ • Generate     │                     │
│                    │   titles       │                     │
│                    │ • Find hooks   │                     │
│                    │ • Detect       │                     │
│                    │   filler words │                     │
│                    └───────┬────────┘                     │
│                            ↓                             │
│                    ┌────────────────┐                     │
│                    │  clips[]       │                     │
│                    │  + metadata    │                     │
│                    └────────────────┘                     │
└──────────────────────────────────────────────────────────┘
```

---

## Step 1: Audio Extraction (FFmpeg)

```javascript
// Extract audio dari video untuk transcription
ffmpeg -i input.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 output.wav

// Untuk file besar (>25MB), split per chunk:
// Chunk 1: 0:00 - 10:00
// Chunk 2: 10:00 - 20:00 (dengan 5 detik overlap)
// ...dst
```

**Settings:**
| Parameter | Value | Alasan |
|-----------|-------|--------|
| Sample Rate | 16000 Hz | Optimal untuk speech recognition |
| Channels | Mono | AI tidak butuh stereo |
| Format | WAV / MP3 | WAV untuk akurasi, MP3 untuk speed |
| Max Chunk | 25 MB | Limit API Groq |
| Overlap | 5 detik | Agar kata di boundary tidak terpotong |

---

## Step 2: Transcription

### Provider A: Groq Whisper (Primary)

**Kenapa Primary:**
- ⚡ 10x lebih cepat dari OpenAI Whisper
- 💰 Murah (free tier generous)
- 🎯 Akurasi tinggi (98%+)
- 🕐 Word-level timestamps

```javascript
// API Call
const response = await groq.audio.transcriptions.create({
  file: audioFile,
  model: "whisper-large-v3-turbo",
  response_format: "verbose_json",  // Dapat word timestamps
  timestamp_granularities: ["word", "segment"],
  language: "id"  // atau "en", "ar", dll
});

// Response format:
{
  "text": "Halo semuanya hari ini kita akan membahas...",
  "segments": [
    {
      "start": 0.0,
      "end": 2.5,
      "text": "Halo semuanya hari ini",
      "words": [
        { "word": "Halo", "start": 0.0, "end": 0.35 },
        { "word": "semuanya", "start": 0.40, "end": 0.89 },
        { "word": "hari", "start": 0.95, "end": 1.15 },
        { "word": "ini", "start": 1.18, "end": 1.35 }
      ]
    }
  ]
}
```

**Error Handling:**
```
Request ke Groq
  ↓
Gagal? (rate limit, server error, timeout)
  ↓
Retry 1 (wait 2 detik)
  ↓
Gagal lagi?
  ↓
Retry 2 (wait 5 detik)
  ↓
Gagal lagi?
  ↓
Switch ke Gemini (fallback) ←─── Otomatis!
```

### Provider B: Gemini (Fallback)

**Kenapa Fallback:**
- 🧠 Multimodal (bisa analisis video + audio sekaligus)
- 🌍 Support bahasa lebih banyak
- 📊 Bisa analisis visual context
- ⏱️ Lebih lambat dari Groq

```javascript
// Gemini API Call (audio transcription)
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const result = await model.generateContent([
  {
    inlineData: {
      mimeType: "audio/wav",
      data: audioBase64
    }
  },
  `Transcribe this audio in the original language.
   Return JSON with word-level timestamps:
   {
     "language": "detected language",
     "segments": [
       {
         "text": "sentence text",
         "start": 0.0,
         "end": 2.5,
         "words": [
           { "word": "kata", "start": 0.0, "end": 0.3 }
         ]
       }
     ]
   }`
]);
```

### Provider C: YouTube Captions (Shortcut)

Jika video diimport dari YouTube, langsung ambil caption yang sudah ada:

```javascript
// Pakai yt-dlp untuk download captions
yt-dlp --write-auto-sub --sub-lang id,en --skip-download URL

// Output: subtitle.id.vtt atau subtitle.en.vtt
// Parse VTT → internal timestamp format
```

### Provider D: Manual Upload

User upload file `.srt` / `.vtt` sendiri → parse ke internal format.

---

## Step 3: AI Content Analysis (Clip Detection)

### Prompt Engineering — Clip Finder

```
SYSTEM PROMPT:

Kamu adalah AI Content Analyst expert untuk short-form video.
Tugasmu: Menganalisis transcript dari video panjang dan menemukan 
momen-momen terbaik yang bisa dijadikan clip viral.

ATURAN:
1. Setiap clip harus SELF-CONTAINED (bisa dipahami tanpa konteks video penuh)
2. Setiap clip harus punya HOOK kuat di 3 detik pertama
3. Clip harus punya arc: opening → content → natural ending
4. Jangan potong di tengah kalimat atau di tengah ide
5. Prioritaskan momen dengan emosi tinggi, insight unik, atau kontroversi

SCORING (0-100):
- Hook Strength (30%): Seberapa kuat kalimat pembuka menarik perhatian?
- Content Value (25%): Apakah ada insight/informasi/hiburan yang berharga?
- Emotional Impact (20%): Apakah memicu emosi (lucu, terkejut, termotivasi)?
- Shareability (15%): Apakah orang akan share ini ke teman?
- Completeness (10%): Apakah cerita/ide selesai dengan baik?

OUTPUT FORMAT (JSON):
{
  "clips": [
    {
      "title": "Judul clip yang catchy",
      "hook": "Kalimat pertama yang muncul (untuk caption hook)",
      "start_time": 125.5,
      "end_time": 168.3,
      "duration": 42.8,
      "content_type": "story|insight|humor|hottake|tutorial|quote",
      "virality_score": 87,
      "score_breakdown": {
        "hook_strength": 90,
        "content_value": 85,
        "emotional_impact": 80,
        "shareability": 92,
        "completeness": 88
      },
      "summary": "Speaker cerita tentang kegagalan pertama yang mengajarkan...",
      "suggested_hashtags": ["#motivation", "#storytime", "#entrepreneur"],
      "improvement_tips": "Bisa mulai 2 detik lebih awal untuk konteks yang lebih baik"
    }
  ],
  "filler_words": [
    { "word": "um", "start": 45.2, "end": 45.5 },
    { "word": "ehh", "start": 67.1, "end": 67.8 }
  ],
  "silence_gaps": [
    { "start": 89.0, "end": 91.5, "duration": 2.5 }
  ]
}
```

```
USER PROMPT:

Berikut transcript video berdurasi {duration} menit.
Platform target: {platform} ({aspect_ratio})
Durasi clip yang diinginkan: {min_duration}s - {max_duration}s
Jumlah clip yang diminta: {clip_count} (few/medium/many)
Bahasa: {language}

TRANSCRIPT:
{full_transcript_with_timestamps}

Temukan clip terbaik dan berikan scoring detail.
```

### Chunking untuk Video Panjang

Video > 30 menit → transcript terlalu panjang untuk 1 API call:

```
Strategy: Sliding Window dengan Overlap

Video 2 jam → Transcript dipecah:

Chunk 1: [00:00 - 30:00] → Kirim ke AI → Dapat clips
Chunk 2: [25:00 - 55:00] → Kirim ke AI → Dapat clips (5 min overlap)
Chunk 3: [50:00 - 80:00] → Kirim ke AI → Dapat clips
Chunk 4: [75:00 - 105:00] → Kirim ke AI → Dapat clips
Chunk 5: [100:00 - 120:00] → Kirim ke AI → Dapat clips

↓ Merge results
↓ Deduplicate overlapping clips
↓ Re-rank semua clips
↓ Return top N clips
```

---

## Step 4: Filler Word Detection

AI juga mendeteksi filler words saat analisis:

```
Filler Words Database:
├── Bahasa Indonesia: "ehm", "eh", "uhh", "hmm", "anu", "kan",
│                     "gitu", "ya kan", "tuh", "nah", "jadi gini"
├── English: "um", "uh", "like", "you know", "basically",
│            "literally", "actually", "so", "right"
└── Universal: [jeda >2 detik], [batuk], [nafas berat]

Tindakan:
├── Mark: Tandai di timeline (user review)
├── Auto-remove: Hapus otomatis + seamless audio join
└── Keep: Biarkan (untuk konten casual/authentic)
```

---

## 🔑 API Key Management

```
┌─────────────────────────────────────────────────────────┐
│  AI CONFIGURATION                                        │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                          │
│  ── Groq (Primary) ──                                   │
│  API Key: [gsk_xxxxxxxxxxxxxxxxxxxx     ] [👁️] [✅ Valid]│
│  Model:   [whisper-large-v3-turbo ▼]                    │
│  Status:  🟢 Connected (Rate: 45/60 remaining)          │
│                                                          │
│  ── Gemini (Fallback) ──                                │
│  API Key: [AIzaxxxxxxxxxxxxxxxxxx       ] [👁️] [✅ Valid]│
│  Model:   [gemini-2.0-flash ▼]                          │
│  Status:  🟢 Connected                                  │
│                                                          │
│  ── Provider Priority ──                                │
│  1st: [Groq ▼]     ← Coba ini dulu                     │
│  2nd: [Gemini ▼]   ← Kalau gagal, pakai ini            │
│                                                          │
│  ☑️ Auto-switch on failure                              │
│  ☑️ Notify when switching providers                     │
│  ☐ Always use both and compare results                  │
│                                                          │
│  [🔄 Test Connection]  [💾 Save]                        │
└─────────────────────────────────────────────────────────┘
```

---

## ✅ Ringkasan AI Pipeline

| Step | Proses | Provider | Output |
|------|--------|----------|--------|
| 1 | Extract Audio | FFmpeg | audio.wav |
| 2 | Transcribe | Groq → Gemini (fallback) | transcript + word timestamps |
| 3 | Analyze Content | Groq/Gemini LLM | clips[] + virality scores |
| 4 | Detect Fillers | AI + rule-based | filler_words[] + silence_gaps[] |
| 5 | Generate Metadata | AI | titles, hooks, hashtags, tips |
