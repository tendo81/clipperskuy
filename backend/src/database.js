const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs-extra');

const dataDir = process.env.CLIPPERSKUY_DATA || path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'clipperskuy.db');
fs.ensureDirSync(dataDir);

let db = null;

async function initDatabase() {
  db = new Database(dbPath);

  // WAL mode: faster writes, better concurrency, safer on crash
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS clips (
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
      virality_score INTEGER DEFAULT 0,
      score_hook INTEGER DEFAULT 0,
      score_content INTEGER DEFAULT 0,
      score_emotion INTEGER DEFAULT 0,
      score_share INTEGER DEFAULT 0,
      score_complete INTEGER DEFAULT 0,
      improvement_tips TEXT,
      hashtags TEXT,
      transcript TEXT,
      platform_descriptions TEXT,
      caption_style TEXT DEFAULT 'hormozi',
      caption_settings TEXT,
      output_path TEXT,
      thumbnail_path TEXT,
      status TEXT DEFAULT 'pending',
      is_selected INTEGER DEFAULT 1,
      music_track_id TEXT,
      music_volume INTEGER DEFAULT 20,
      social_copy TEXT,
      hook_settings TEXT,
      hook_style TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS transcripts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      full_text TEXT,
      language TEXT,
      provider TEXT,
      word_data TEXT,
      segment_data TEXT,
      filler_words TEXT,
      silence_gaps TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS brand_kits (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'My Brand',
      logo_path TEXT,
      logo_position TEXT DEFAULT 'top-right',
      logo_size INTEGER DEFAULT 15,
      logo_opacity INTEGER DEFAULT 80,
      logo_margin INTEGER DEFAULT 16,
      logo_animation TEXT DEFAULT 'fade',
      logo_show_mode TEXT DEFAULT 'always',
      intro_path TEXT,
      intro_type TEXT DEFAULT 'none',
      intro_duration REAL DEFAULT 2.0,
      outro_path TEXT,
      outro_type TEXT DEFAULT 'none',
      outro_duration REAL DEFAULT 3.0,
      color_primary TEXT DEFAULT '#7c3aed',
      color_secondary TEXT DEFAULT '#1a1a2e',
      color_accent TEXT DEFAULT '#2dd4bf',
      color_text TEXT DEFAULT '#ffffff',
      font_heading TEXT DEFAULT 'Montserrat',
      font_caption TEXT DEFAULT 'Inter',
      font_body TEXT DEFAULT 'Inter',
      custom_font_path TEXT,
      social_tiktok TEXT,
      social_instagram TEXT,
      social_youtube TEXT,
      social_twitter TEXT,
      social_linkedin TEXT,
      social_display_mode TEXT DEFAULT 'outro',
      lower_third_name TEXT,
      lower_third_title TEXT,
      lower_third_duration INTEGER DEFAULT 5,
      lower_third_position TEXT DEFAULT 'bottom-left',
      sound_logo_path TEXT,
      sound_logo_volume INTEGER DEFAULT 70,
      sound_play_intro INTEGER DEFAULT 1,
      sound_play_outro INTEGER DEFAULT 1,
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS license_keys (
      id TEXT PRIMARY KEY,
      license_key TEXT UNIQUE NOT NULL,
      tier TEXT DEFAULT 'pro',
      status TEXT DEFAULT 'active',
      duration_days INTEGER DEFAULT 0,
      expires_at DATETIME,
      max_activations INTEGER DEFAULT 1,
      deactivation_count INTEGER DEFAULT 0,
      max_transfers INTEGER DEFAULT 2,
      machine_id TEXT,
      activated_by TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      activated_at DATETIME,
      revoked_at DATETIME
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS license_activations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_key_id TEXT NOT NULL,
      machine_id TEXT NOT NULL,
      activated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (license_key_id) REFERENCES license_keys(id),
      UNIQUE(license_key_id, machine_id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS license_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_key TEXT NOT NULL,
      from_machine_id TEXT,
      to_machine_id TEXT,
      action TEXT NOT NULL,
      transferred_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      license_key_id TEXT,
      machine_id TEXT,
      ip_address TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS music_tracks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_name TEXT,
      category TEXT DEFAULT 'general',
      mood TEXT DEFAULT 'neutral',
      bpm INTEGER DEFAULT 0,
      duration REAL DEFAULT 0,
      file_size INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sfx_tracks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_name TEXT,
      category TEXT DEFAULT 'general',
      duration REAL DEFAULT 0,
      file_size INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS clip_sfx (
      id TEXT PRIMARY KEY,
      clip_id TEXT NOT NULL,
      sfx_track_id TEXT NOT NULL,
      position REAL DEFAULT 0,
      volume INTEGER DEFAULT 80,
      FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE,
      FOREIGN KEY (sfx_track_id) REFERENCES sfx_tracks(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS render_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT DEFAULT '🎨',
      settings TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert default settings
  const defaults = {
    'output_dir': '',
    'groq_api_key': '',
    'gemini_api_key': '',
    'ai_provider_primary': 'groq',
    'ai_provider_fallback': 'gemini',
    'hw_accel': 'auto',
    'encoder': 'auto',
    'quality_preset': 'balanced',
    'default_platform': 'tiktok',
    'default_language': 'auto',
    'theme': 'dark',
    'yt_cookie_browser': 'auto',
    'export_filename_template': '{number}_{title}'
  };

  const insertDefault = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaults)) {
    insertDefault.run(key, value);
  }

  console.log('[DB] Database initialized at', dbPath);
  return db;
}

// No-op: kept for compatibility (better-sqlite3 writes directly to disk)
function saveDatabase() { }

function getDb() {
  return db;
}

// No-op: kept for compatibility (no auto-save needed)
function startAutoSave() {
  console.log('[DB] Database ready (WAL mode — writes directly to disk)');
}

// Helper functions — same API as before
function all(sql, params = []) {
  return db.prepare(sql).all(...params);
}

function get(sql, params = []) {
  return db.prepare(sql).get(...params);
}

function run(sql, params = []) {
  return db.prepare(sql).run(...params);
}

module.exports = { initDatabase, getDb, saveDatabase, all, get, run, startAutoSave };
