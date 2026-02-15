# 🎬 ClipperSkuy — Video Clipping Engine
## Complete Development Roadmap

> **Tujuan**: Membangun aplikasi desktop profesional mirip Opus.pro yang bisa didistribusikan ke client sebagai produk komersial.

---

## 📌 Arsitektur Aplikasi

```
┌─────────────────────────────────────────────────────────┐
│                    ELECTRON SHELL                        │
│  ┌───────────────────────┐  ┌────────────────────────┐  │
│  │     FRONTEND (React)  │  │   BACKEND (Express)    │  │
│  │                       │  │                        │  │
│  │  • Upload Page        │  │  • Video Processor     │  │
│  │  • Project Dashboard  │◄─►  • AI Engine           │  │
│  │  • Clip Editor        │  │  • FFmpeg Pipeline     │  │
│  │  • Export Manager     │  │  • Database (SQLite)   │  │
│  │  • Settings           │  │  • WebSocket Server    │  │
│  │  • License Manager    │  │  • License Validator   │  │
│  └───────────────────────┘  └────────────────────────┘  │
│                                                         │
│  ┌────────────────────────────────────────────────────┐  │
│  │              EXTERNAL DEPENDENCIES                 │  │
│  │  • FFmpeg (bundled)    • Python (face tracking)    │  │
│  │  • Groq API            • Gemini API               │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer       | Technology                | Alasan                                    |
|-------------|---------------------------|-------------------------------------------|
| Desktop     | Electron + electron-builder | Distribusi .exe, auto-update              |
| Frontend    | React 18 + Vite + Tailwind | Fast dev, modern UI                       |
| Backend     | Express.js + Socket.io     | REST API + real-time progress             |
| Database    | SQLite (better-sqlite3)    | Portable, no setup needed                 |
| AI          | Groq (primary) + Gemini    | Fast transcription + multimodal fallback  |
| Video       | FFmpeg (fluent-ffmpeg)     | Industry standard video processing        |
| Installer   | electron-builder (NSIS)    | Professional Windows installer            |

---

## 🗺️ PHASE 1 — Foundation & Core UI ✅ COMPLETED
**⏱️ Estimasi: Sesi 1-2**
**🎯 Goal: App bisa dibuka, navigasi berfungsi, tampilan profesional**

### 1.1 Project Setup
- [x] Inisialisasi project structure (monorepo)
- [x] Setup Vite + React 18 + CSS
- [x] Setup Express.js backend
- [x] Setup SQLite database schema
- [ ] Setup Electron shell (main process)
- [x] Konfigurasi environment variables

### 1.2 Design System
- [x] Color palette (dark theme professional)
  - Background: `#0a0a0f` → `#12121a` → `#1a1a2e`
  - Accent: `#7c3aed` (purple) / `#06b6d4` (cyan)
  - Success/Error/Warning colors
- [x] Typography system (Inter/Outfit font)
- [x] Component library dasar:
  - Button (primary, secondary, ghost, danger)
  - Input, Select, Textarea
  - Card, Modal, Tooltip
  - Progress Bar, Spinner
  - Toast notifications

### 1.3 Layout & Navigation
- [x] Sidebar navigation (collapsible)
  - 🏠 Dashboard
  - 📤 Upload / New Project
  - 📁 Projects (history)
  - ⚙️ Settings
  - 🔑 License
- [ ] Top bar (app title, minimize/maximize/close for Electron)
- [x] Responsive content area

### 1.4 Halaman Dashboard
- [x] Welcome section dengan statistik
  - Total projects
  - Total clips generated
  - Total processing time saved
- [x] Recent projects list (card view)
- [x] Quick action buttons ("New Project", "Import Video")
- [x] Empty state (untuk user baru)

**✅ Deliverable Phase 1**: Aplikasi bisa dibuka, tampilan premium, navigasi smooth.

---

## 🗺️ PHASE 2 — Video Upload & Project Management ✅ COMPLETED
**⏱️ Estimasi: Sesi 2-3**
**🎯 Goal: User bisa upload video dan manage projects**

### 2.1 Upload System
- [x] Drag & drop upload zone (dengan animasi)
- [x] Upload from file browser
- [x] YouTube URL import (yt-dlp integration)
- [x] Upload progress bar (real-time via Socket.io)
- [x] File validation:
  - Format support: MP4, MOV, AVI, MKV, WebM
  - Max file size check
  - Duration detection
- [x] Video thumbnail generation (FFmpeg)

### 2.2 Project Configuration (Pre-processing)
- [x] Platform target selector:
  ```
  ┌──────────┐ ┌──────────┐ ┌──────────┐
  │  TikTok  │ │Instagram │ │ YouTube  │
  │   9:16   │ │   1:1    │ │  16:9    │
  │  Shorts  │ │  Reels   │ │  Shorts  │
  └──────────┘ └──────────┘ └──────────┘
  ```
- [x] Reframing mode selector:
  - 🎯 Auto Center
  - 👤 Face Track (AI)
  - 📱 Split Screen (speaker + content)
  - 🔲 Fit (letterbox/pillarbox)
- [x] AI Provider selection (Groq / Gemini)
- [x] Language selector for transcription
- [x] Clip duration preferences (min/max)

### 2.3 Project Database
- [x] Projects table:
  ```sql
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT,
    source_path TEXT,
    source_url TEXT,
    thumbnail_path TEXT,
    duration REAL,
    status TEXT, -- 'uploaded','processing','completed','failed'
    platform TEXT, -- 'tiktok','instagram','youtube'
    aspect_ratio TEXT, -- '9:16','1:1','16:9'
    reframing_mode TEXT,
    ai_provider TEXT,
    language TEXT,
    created_at DATETIME,
    updated_at DATETIME
  );
  ```
- [x] Clips table:
  ```sql
  CREATE TABLE clips (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    title TEXT,
    start_time REAL,
    end_time REAL,
    duration REAL,
    virality_score INTEGER, -- 0-100
    hook_text TEXT,
    transcript TEXT,
    output_path TEXT,
    status TEXT, -- 'pending','processing','completed','failed'
    created_at DATETIME,
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );
  ```
- [x] Settings table (app-wide config)

### 2.4 Project List Page
- [x] Grid/List view toggle
- [x] Sort by: date, name, status
- [x] Filter by: status, platform
- [x] Delete project (with confirmation)
- [x] Project status badges (processing, completed, failed)

**✅ Deliverable Phase 2**: User bisa upload video, konfigurasi project, dan lihat daftar project.

---

## 🗺️ PHASE 3 — AI Processing Pipeline ✅ COMPLETED
**⏱️ Estimasi: Sesi 3-5**
**🎯 Goal: Video diproses AI, clip otomatis ditemukan**

### 3.1 Transcription Engine
- [x] Groq Whisper API integration (primary)
  - Audio extraction dari video (FFmpeg → WAV/MP3)
  - Chunking for large files (split per 25MB)
  - Word-level timestamps
  - Retry logic dengan exponential backoff
- [x] Gemini API integration (fallback)
  - Multimodal analysis (video + audio)
  - Structured JSON output
- [x] YouTube captions import (yt-dlp)
- [x] Manual transcript upload (SRT/VTT/TXT)
- [x] Transcript viewer/editor UI

### 3.2 AI Content Analysis
- [x] Clip detection algorithm:
  ```
  Input: Full transcript with timestamps
  ↓
  AI Prompt: "Analyze this transcript. Find the top 10 most 
  engaging segments for short-form video. Consider:"
  - Hook strength (does it grab attention in first 3 seconds?)
  - Emotional peaks (laughter, surprise, insight)
  - Self-contained stories (has beginning, middle, end)
  - Quotable moments
  - Controversial/hot takes
  ↓
  Output: Array of {start_time, end_time, title, hook, score}
  ```
- [x] Virality scoring (0-100):
  - Hook strength: 30%
  - Content value: 25%
  - Emotional impact: 20%
  - Shareability: 15%
  - Trend relevance: 10%
- [x] Hook text generation (caption untuk 3 detik pertama)
- [x] Auto-title generation per clip

### 3.3 Processing Queue & Progress
- [x] Queue system untuk batch processing
- [x] Real-time progress via WebSocket:
  ```
  📤 Uploading video...          ████████░░ 80%
  🔊 Extracting audio...         ██████████ 100%
  🎤 Transcribing (Groq)...      ████░░░░░░ 40%
  🧠 Analyzing content...        ░░░░░░░░░░ 0%
  ✂️ Generating clips...          ░░░░░░░░░░ 0%
  ```
- [x] Processing log terminal (scrollable, real-time)
- [x] Cancel/retry processing
- [x] Error handling & recovery:
  - API rate limit → auto retry
  - API fail → switch provider
  - FFmpeg error → detailed error message

**✅ Deliverable Phase 3**: Video di-transcribe, AI menemukan clips terbaik, progress real-time.

---

## 🗺️ PHASE 4 — Clip Editor & Preview
**⏱️ Estimasi: Sesi 4-6**
**🎯 Goal: User bisa review, edit, dan preview clips**

### 4.1 Results Dashboard
- [x] Clip cards grid:
  ```
  ┌──────────────────────┐
  │  ▶ Thumbnail         │
  │  ━━━━━━━━━━━━━━━━━━  │
  │  "Best Clip Title"   │
  │  ⭐ Virality: 92/100 │
  │  ⏱️ 0:45 duration    │
  │  [Preview] [Export]  │
  └──────────────────────┘
  ```
- [x] Sort clips by virality score
- [x] Bulk select for batch export
- [x] Delete/regenerate individual clips

### 4.2 Clip Preview Player
- [x] Custom video player:
  - Play/Pause/Seek
  - Volume control
  - Playback speed (0.5x, 1x, 1.5x, 2x)
  - Fullscreen toggle
- [x] Aspect ratio preview:
  - Show how clip looks in 9:16, 1:1, 16:9
  - Phone/tablet frame mockup overlay
- [x] Subtitle preview overlay
  - Animated captions (word-by-word highlight)
  - Multiple caption styles/templates (10 styles)

### 4.3 Clip Trimming
- [x] Timeline scrubber (visual timeline)
- [x] Adjust start/end time with handles
- [x] Frame-accurate trimming
- [x] Split clip into multiple segments
- [x] Merge adjacent clips

### 4.4 Caption/Subtitle System
- [x] Caption style templates:
  ```
  Style 1: "BOLD IMPACT"     — White text, black outline, bottom center
  Style 2: "Hormozi Style"   — Yellow highlight word-by-word, top third
  Style 3: "Minimal Clean"   — Thin white text, subtle shadow
  Style 4: "Karaoke Pop"     — Bouncing colorful text
  Style 5: "News Ticker"     — Lower third with background bar
  + Ali Abdaal, Gaming, Podcast, Cinema, TikTok OG
  ```
- [x] Customize: font, size, color, position, animation
- [x] Word-level timing editor
- [x] Manual caption editing

**✅ Deliverable Phase 4**: User bisa preview, edit, trim clips dan customize subtitles.

---

## 🗺️ PHASE 5 — Export & Video Rendering ✅
**⏱️ Estimasi: Sesi 5-7**
**🎯 Goal: Clips bisa di-export sebagai video final berkualitas tinggi**

### 5.1 FFmpeg Rendering Pipeline
- [x] Auto-reframing engine: ✅
  - **Center crop**: Simple center-based crop ✅
  - **Face tracking**: Python OpenCV face detection → dynamic crop coordinates
  - **Split screen**: Speaker cam + presentation content ✅
  - **Fit mode**: Blur background + centered video ✅
- [x] Hardware acceleration: ✅
  ```
  NVIDIA GPU  → h264_nvenc / hevc_nvenc
  AMD GPU     → h264_amf
  Intel iGPU  → h264_qsv
  CPU only    → libx264 (fallback)
  ```
- [x] Subtitle burn-in (ASS/SRT via FFmpeg) ✅
- [x] Audio normalization & enhancement (loudnorm) ✅

### 5.2 Export Options
- [x] Quality presets: ✅
  - 🏆 Best Quality (1080p, high bitrate, slow encoding)
  - ⚡ Balanced (1080p, medium bitrate, fast encoding)
  - 📱 Quick Share (720p, lower bitrate, ultrafast)
- [x] Format options: MP4 (H.264) ✅
- [x] Batch export (all clips at once) ✅
- [x] Custom output directory selection ✅

### 5.3 Export Progress
- [x] Per-clip progress bars ✅
- [x] Overall batch progress ✅
- [x] Estimated time remaining (ETA) ✅
- [x] Open output folder button ✅
- [x] Share directly (copy file path) ✅

### 5.4 Watermark & Branding (untuk distribusi)
- [x] Optional watermark overlay (logo/image) ✅
- [x] Brand kit integration: ✅
  - Logo path + position selector
  - Opacity & size controls
  - 5 position options (4 corners + center)
- [ ] Remove watermark (premium/licensed feature)

**✅ Deliverable Phase 5**: Clips di-render sebagai video HD, siap upload ke platform.

---

## 🗺️ PHASE 6 — Desktop Packaging & Distribution
**⏱️ Estimasi: Sesi 6-8**
**🎯 Goal: Aplikasi siap distribusi ke client sebagai installer .exe**

### 6.1 Electron Integration
- [x] Main process setup (window management) ✅
- [x] Embed backend server di Electron main process ✅
- [x] Frontend di-serve dari Electron (production build) ✅
- [x] System tray icon ✅
- [x] Native file dialogs (IPC bridge) ✅
- [x] Window state persistence (size, position) ✅
- [x] Single instance lock (prevent multiple app opens) ✅

### 6.2 Bundling Dependencies
- [x] Bundle FFmpeg binary config (ffmpeg.exe, ffprobe.exe) ✅
- [x] Face tracking rewritten in JS (no Python needed) ✅
- [x] App icon upload via Settings UI ✅
- [x] Auto-detect hardware capabilities on first run ✅

### 6.3 Installer Builder
- [x] NSIS installer via electron-builder: ✅
  ```
  ClipperSkuy-Setup-1.0.0.exe
  ├── Install wizard (custom branding)
  ├── Desktop shortcut
  ├── Start menu entry
  ├── Uninstaller
  └── File associations (.clipperskuy project files)
  ```
- [x] Portable version config ✅
- [x] Auto-updater (electron-updater): ✅
  - Check for updates on startup ✅
  - Download & install with IPC controls ✅
  - Release notes display ✅

### 6.4 Licensing System
- [x] License key validation: ✅
  ```
  Key format: XXXX-XXXX-XXXX-XXXX
  Validation: Pattern match → save to settings (ready for online API)
  ```
- [x] License tiers UI: ✅
  - 🆓 **Free**: 3 projects, watermark, 720p max
  - 💎 **Pro**: Unlimited projects, no watermark, 1080p, all features
  - 🏢 **Enterprise**: White-label, custom branding, priority support
- [x] Trial period (14 days) ✅
- [x] Hardware fingerprint (Machine ID) ✅
- [x] Feature gating per tier (free/trial/pro/enterprise) ✅
- [x] License activation/deactivation UI ✅

### 6.5 Settings & Configuration
- [x] General: ✅
  - Output folder location ✅
  - Theme selector (Dark/Light/System) ✅
- [x] AI Configuration: ✅
  - API key input (Groq / Gemini) ✅
  - Model selection
  - Default language for transcription
- [x] Video Processing: ✅
  - Hardware acceleration toggle ✅
  - Encoder selection ✅
  - Default quality preset ✅
- [x] App Customization (Admin): ✅
  - App display name override ✅
  - Branding assets upload (icon/logo/splash/favicon) ✅
  - Accent color picker (10 presets + custom) ✅
  - Theme switcher (Dark/Light/System) ✅
  - Data management (clear cache, reset settings) ✅
- [x] About page: ✅
  - Version info ✅
  - Feature highlights ✅
  - Tech stack ✅
  - System info (CPU, memory, screen, runtime) ✅
  - Backend status check ✅
  - Credits ✅

**✅ Deliverable Phase 6**: Installer `.exe` siap distribusi, sistem lisensi aktif.

---

## 🔄 POST-LAUNCH — Future Enhancements

### v1.1 — Social Integration
- [ ] Direct upload ke TikTok, YouTube, Instagram
- [ ] Scheduling publish
- [ ] Analytics dashboard (views, engagement)

### v1.2 — Advanced Editing
- [ ] B-roll auto-insert (stock footage)
- [ ] Background music library
- [ ] Sound effects library
- [ ] Transition effects between scenes

### v1.3 — Team Features
- [ ] Multi-user support
- [ ] Project sharing
- [ ] Cloud sync

### v1.4 — AI Enhancements
- [ ] GPT-powered title/description generator
- [ ] Hashtag suggestions
- [ ] Trend analysis
- [ ] A/B thumbnail generator

---

## 📁 Project Structure (Target)

```
opus 1/
├── electron/
│   ├── main.js              # Electron main process
│   ├── preload.js           # Preload script (IPC bridge)
│   └── resources/           # Icons, splash screen
├── frontend/
│   ├── index.html
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── assets/          # Images, fonts
│   │   ├── components/      # Reusable UI components
│   │   │   ├── ui/          # Button, Input, Card, etc.
│   │   │   ├── layout/      # Sidebar, TopBar, etc.
│   │   │   ├── player/      # Video player components
│   │   │   └── editor/      # Timeline, captions, etc.
│   │   ├── pages/           # Route pages
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Upload.jsx
│   │   │   ├── Processing.jsx
│   │   │   ├── Results.jsx
│   │   │   ├── ClipEditor.jsx
│   │   │   ├── Export.jsx
│   │   │   ├── Settings.jsx
│   │   │   └── License.jsx
│   │   ├── hooks/           # Custom React hooks
│   │   ├── context/         # React Context providers
│   │   ├── services/        # API client, socket client
│   │   └── utils/           # Helper functions
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
├── backend/
│   ├── src/
│   │   ├── server.js        # Express + Socket.io server
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   │   ├── ai/          # Groq, Gemini integrations
│   │   │   ├── video/       # FFmpeg, reframing, encoding
│   │   │   ├── database.js  # SQLite operations
│   │   │   └── license.js   # License validation
│   │   └── utils/           # Helpers
│   └── package.json
├── scripts/                  # Build & deployment scripts
├── package.json              # Root workspace config
├── electron-builder.yml      # Installer configuration
├── ROADMAP.md               # ← This file
└── README.md
```

---

## 🚀 Development Order (Rekomendasi)

```
Phase 1 ████████░░░░░░░░░░░░ Foundation & Core UI
Phase 2 ░░░░████████░░░░░░░░ Upload & Project Management  
Phase 3 ░░░░░░░░████████░░░░ AI Processing Pipeline
Phase 4 ░░░░░░░░░░░░████░░░░ Clip Editor & Preview
Phase 5 ░░░░░░░░░░░░░░████░░ Export & Rendering
Phase 6 ░░░░░░░░░░░░░░░░████ Packaging & Distribution
```

> **💡 Setiap phase menghasilkan aplikasi yang bisa digunakan.**
> Phase 1-3 = MVP (Minimum Viable Product) yang sudah fungsional.
> Phase 4-6 = Polish dan siap distribusi komersial.

---

## ⚡ Siap Mulai?

Kalau roadmap ini sudah OK, kita bisa langsung mulai dari **Phase 1: Foundation & Core UI**.
Saya akan setup project structure, design system, dan halaman-halaman dasar.
