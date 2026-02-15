# 🗄️ Database Schema — Detail Lengkap

## Tables

### 1. projects
```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_path TEXT,
  source_url TEXT,
  thumbnail_path TEXT,
  duration REAL,
  width INTEGER,
  height INTEGER,
  fps REAL,
  file_size INTEGER,
  status TEXT DEFAULT 'uploaded',
  -- 'uploaded','transcribing','analyzing','clipping','completed','failed'
  platform TEXT DEFAULT 'tiktok',
  aspect_ratio TEXT DEFAULT '9:16',
  reframing_mode TEXT DEFAULT 'center',
  ai_provider TEXT DEFAULT 'groq',
  language TEXT DEFAULT 'auto',
  clip_count_target TEXT DEFAULT 'medium',
  min_duration INTEGER DEFAULT 15,
  max_duration INTEGER DEFAULT 60,
  brand_kit_id TEXT,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (brand_kit_id) REFERENCES brand_kits(id)
);
```

### 2. clips
```sql
CREATE TABLE clips (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  clip_number INTEGER,
  title TEXT,
  hook_text TEXT,
  summary TEXT,
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  duration REAL,
  content_type TEXT,
  -- 'story','insight','humor','hottake','tutorial','quote'
  virality_score INTEGER DEFAULT 0,
  score_hook INTEGER DEFAULT 0,
  score_content INTEGER DEFAULT 0,
  score_emotion INTEGER DEFAULT 0,
  score_share INTEGER DEFAULT 0,
  score_complete INTEGER DEFAULT 0,
  improvement_tips TEXT,
  hashtags TEXT, -- JSON array
  transcript TEXT,
  caption_style_id TEXT,
  output_path TEXT,
  thumbnail_path TEXT,
  status TEXT DEFAULT 'pending',
  -- 'pending','processing','completed','failed'
  is_selected INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (caption_style_id) REFERENCES caption_styles(id)
);
```

### 3. transcripts
```sql
CREATE TABLE transcripts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  full_text TEXT,
  language TEXT,
  provider TEXT, -- 'groq','gemini','youtube','manual'
  word_data TEXT, -- JSON: [{word, start, end}]
  segment_data TEXT, -- JSON: [{text, start, end, speaker}]
  filler_words TEXT, -- JSON: [{word, start, end}]
  silence_gaps TEXT, -- JSON: [{start, end, duration}]
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

### 4. brand_kits
```sql
CREATE TABLE brand_kits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  logo_path TEXT,
  logo_position TEXT DEFAULT 'top-right',
  logo_size INTEGER DEFAULT 15,
  logo_opacity INTEGER DEFAULT 80,
  logo_margin INTEGER DEFAULT 16,
  intro_path TEXT,
  intro_duration REAL,
  outro_path TEXT,
  outro_duration REAL,
  color_primary TEXT DEFAULT '#FF6B00',
  color_secondary TEXT DEFAULT '#1A1A2E',
  color_accent TEXT DEFAULT '#FFD700',
  color_text TEXT DEFAULT '#FFFFFF',
  font_heading TEXT DEFAULT 'Montserrat',
  font_caption TEXT DEFAULT 'Inter',
  social_tiktok TEXT,
  social_instagram TEXT,
  social_youtube TEXT,
  social_twitter TEXT,
  social_linkedin TEXT,
  social_display_mode TEXT DEFAULT 'outro_only',
  sound_logo_path TEXT,
  sound_logo_volume INTEGER DEFAULT 70,
  is_default INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 5. caption_styles
```sql
CREATE TABLE caption_styles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_preset INTEGER DEFAULT 0,
  font_family TEXT DEFAULT 'Montserrat',
  font_size INTEGER DEFAULT 36,
  font_weight INTEGER DEFAULT 700,
  text_case TEXT DEFAULT 'uppercase',
  letter_spacing REAL DEFAULT 0,
  line_height REAL DEFAULT 1.2,
  text_color TEXT DEFAULT '#FFFFFF',
  highlight_color TEXT DEFAULT '#FFD700',
  outline_width INTEGER DEFAULT 2,
  outline_color TEXT DEFAULT '#000000',
  shadow_x INTEGER DEFAULT 2,
  shadow_y INTEGER DEFAULT 2,
  shadow_blur INTEGER DEFAULT 4,
  shadow_color TEXT DEFAULT 'rgba(0,0,0,0.8)',
  bg_type TEXT DEFAULT 'none', -- 'none','solid','gradient','blur'
  bg_color TEXT,
  bg_opacity REAL DEFAULT 0.5,
  bg_radius INTEGER DEFAULT 8,
  position_vertical TEXT DEFAULT 'bottom',
  position_offset INTEGER DEFAULT 15,
  align TEXT DEFAULT 'center',
  max_width INTEGER DEFAULT 85,
  words_per_line INTEGER DEFAULT 3,
  max_lines INTEGER DEFAULT 2,
  animation_word TEXT DEFAULT 'pop',
  animation_highlight TEXT DEFAULT 'colorChange',
  animation_in TEXT DEFAULT 'fade',
  animation_out TEXT DEFAULT 'fade',
  animation_speed TEXT DEFAULT 'normal',
  emoji_enabled INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 6. settings
```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Default settings:
INSERT INTO settings VALUES
  ('output_dir', 'C:\Users\{user}\Videos\OpusFlow', ...),
  ('groq_api_key', '', ...),
  ('gemini_api_key', '', ...),
  ('ai_provider_primary', 'groq', ...),
  ('ai_provider_fallback', 'gemini', ...),
  ('hw_accel', 'auto', ...),
  ('encoder', 'auto', ...),
  ('quality_preset', 'balanced', ...),
  ('default_platform', 'tiktok', ...),
  ('default_language', 'auto', ...),
  ('thread_count', '0', ...), -- 0 = auto
  ('license_key', '', ...),
  ('license_tier', 'free', ...),
  ('theme', 'dark', ...);
```

### 7. license
```sql
CREATE TABLE license (
  id TEXT PRIMARY KEY,
  license_key TEXT,
  tier TEXT DEFAULT 'free', -- 'free','pro','enterprise'
  activated_at DATETIME,
  expires_at DATETIME,
  hardware_id TEXT,
  is_active INTEGER DEFAULT 0,
  last_validated DATETIME
);
```

---

## Relationships

```
projects ──1:N──→ clips
projects ──1:1──→ transcripts
projects ──N:1──→ brand_kits
clips    ──N:1──→ caption_styles
```
