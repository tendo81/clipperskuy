const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs-extra');

const dbPath = path.join(__dirname, '..', 'data', 'clipperskuy.db');
fs.ensureDirSync(path.dirname(dbPath));

let db = null;

async function initDatabase() {
  const SQL = await initSqlJs();

  // Load existing database or create new
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
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

  db.run(`
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  db.run(`
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

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
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

  db.run(`
    CREATE TABLE IF NOT EXISTS license_keys (
      id TEXT PRIMARY KEY,
      license_key TEXT UNIQUE NOT NULL,
      tier TEXT DEFAULT 'pro',
      status TEXT DEFAULT 'active',
      duration_days INTEGER DEFAULT 0,
      expires_at DATETIME,
      max_activations INTEGER DEFAULT 1,
      machine_id TEXT,
      activated_by TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      activated_at DATETIME,
      revoked_at DATETIME
    )
  `);

  // Track multiple activations per key
  db.run(`
    CREATE TABLE IF NOT EXISTS license_activations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_key_id TEXT NOT NULL,
      machine_id TEXT NOT NULL,
      activated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (license_key_id) REFERENCES license_keys(id),
      UNIQUE(license_key_id, machine_id)
    )
  `);

  // --- Migrations for existing databases ---
  // Add new columns to license_keys if missing
  try {
    const lkCols = db.exec("PRAGMA table_info(license_keys)")[0];
    const lkColNames = lkCols ? lkCols.values.map(r => r[1]) : [];
    if (!lkColNames.includes('duration_days')) {
      db.run('ALTER TABLE license_keys ADD COLUMN duration_days INTEGER DEFAULT 0');
      console.log('[DB] Migration: added duration_days to license_keys');
    }
    if (!lkColNames.includes('expires_at')) {
      db.run('ALTER TABLE license_keys ADD COLUMN expires_at DATETIME');
      console.log('[DB] Migration: added expires_at to license_keys');
    }
    if (!lkColNames.includes('max_activations')) {
      db.run('ALTER TABLE license_keys ADD COLUMN max_activations INTEGER DEFAULT 1');
      console.log('[DB] Migration: added max_activations to license_keys');
    }
  } catch (e) { /* table may not exist yet */ }

  // Add caption_settings column if missing
  try {
    const cols = db.exec("PRAGMA table_info(clips)")[0];
    const colNames = cols ? cols.values.map(r => r[1]) : [];
    if (!colNames.includes('caption_settings')) {
      db.run('ALTER TABLE clips ADD COLUMN caption_settings TEXT');
      console.log('[DB] Migration: added caption_settings column');
      saveDatabase();
    }
  } catch (e) { /* ignore */ }

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
    'yt_cookie_browser': 'auto'
  };

  for (const [key, value] of Object.entries(defaults)) {
    db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  }

  saveDatabase();
  console.log('[DB] Database initialized at', dbPath);
  return db;
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

function getDb() {
  return db;
}

// Helper functions that mimic better-sqlite3 API
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function get(sql, params = []) {
  const results = all(sql, params);
  return results.length > 0 ? results[0] : null;
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDatabase();
}

module.exports = { initDatabase, getDb, saveDatabase, all, get, run };
