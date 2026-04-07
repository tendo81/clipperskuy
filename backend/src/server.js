const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs-extra');
const { initDatabase, startAutoSave } = require('./database');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Ensure data directories exist
const DATA_DIR = process.env.CLIPPERSKUY_DATA || path.join(__dirname, '..', 'data');
const dirs = ['uploads', 'outputs', 'thumbnails', 'temp', 'brandkits', 'music', 'sfx'];
dirs.forEach(dir => {
  fs.ensureDirSync(path.join(DATA_DIR, dir));
});

// Static file serving
app.use('/data', express.static(DATA_DIR));

// Make io accessible to routes
app.set('io', io);

// Socket.io connection
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// Health check (available before DB init)
const PKG_VERSION = require('../package.json').version || '1.0.0';
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: PKG_VERSION, timestamp: new Date().toISOString() });
});

// Start server after DB is ready
async function start() {
  try {
    await initDatabase();
    startAutoSave();
    console.log('[DB] Database ready (auto-save enabled)');

    // ─── Startup cleanup: reset ALL stuck states from previous crashed session ──
    try {
      const { run, all } = require('./database');

      // 1. Reset stuck PROJECTS (transcribing/analyzing/clipping with no active worker)
      const stuckProjects = all(
        "SELECT id, name, status FROM projects WHERE status IN ('transcribing', 'analyzing', 'clipping')"
      );
      if (stuckProjects.length > 0) {
        console.log(`[Startup] Resetting ${stuckProjects.length} stuck project(s) to 'failed':`);
        for (const p of stuckProjects) {
          run(
            "UPDATE projects SET status = 'failed', error_message = 'Processing interrupted (server restarted)', updated_at = datetime('now') WHERE id = ?",
            [p.id]
          );
          console.log(`  → Reset project: "${p.name}" — was ${p.status}`);
        }
      }

      // 2. Reset stuck CLIPS (status='rendering' but no FFmpeg running after server restart)
      // On startup, no renders are active — any clip still marked 'rendering' is an orphan.
      const stuckClips = all(
        "SELECT c.id, c.clip_number, c.title, p.name as proj_name FROM clips c JOIN projects p ON c.project_id = p.id WHERE c.status = 'rendering'"
      );
      if (stuckClips.length > 0) {
        console.log(`[Startup] Resetting ${stuckClips.length} orphaned render(s) → 'detected':`);
        for (const c of stuckClips) {
          run("UPDATE clips SET status = 'detected', output_path = NULL WHERE id = ?", [c.id]);
          console.log(`  → Reset clip #${c.clip_number} "${c.title}" in "${c.proj_name}"`);
        }
      }

      // 3. Fix 'rendered' clips whose output file is missing from disk
      // This can happen if files are deleted manually or moved to another drive.
      const { existsSync } = require('fs');
      const renderedWithPath = all(
        "SELECT id, clip_number, title FROM clips WHERE status = 'rendered' AND output_path IS NOT NULL"
      );
      let orphanFixed = 0;
      for (const c of renderedWithPath) {
        const row = all("SELECT output_path FROM clips WHERE id = ?", [c.id])[0];
        if (row && !existsSync(row.output_path)) {
          run("UPDATE clips SET status = 'detected', output_path = NULL WHERE id = ?", [c.id]);
          orphanFixed++;
        }
      }
      if (orphanFixed > 0) {
        console.log(`[Startup] Fixed ${orphanFixed} clip(s) with missing output files → 'detected'`);
      }
    } catch (e) {
      console.warn('[Startup] Could not reset stuck states:', e.message);
    }


    // ─── Render Watchdog: periodically detect truly stuck renders ─────────────
    // A render is "stuck" if its DB status is 'rendering' but FFmpeg process
    // is NOT running. This catches crashes that happen mid-render without cleanup.
    // Runs every 10 minutes. Only resets if BOTH conditions are true:
    //   1. clip.status === 'rendering'
    //   2. no 'ffmpeg' process is currently running on the system
    const { execSync } = require('child_process');
    const WATCHDOG_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
    setInterval(() => {
      try {
        const { run: wRun, all: wAll } = require('./database');
        const renderingClips = wAll("SELECT id, clip_number, title FROM clips WHERE status = 'rendering'");
        if (renderingClips.length === 0) return;

        // Check if FFmpeg is actually running
        let ffmpegRunning = false;
        try {
          const taskList = execSync('tasklist /FI "IMAGENAME eq ffmpeg.exe" /NH /FO CSV', { timeout: 5000 }).toString();
          ffmpegRunning = taskList.includes('ffmpeg.exe');
        } catch (e) { /* tasklist failed — assume FFmpeg may be running, skip reset */ return; }

        if (!ffmpegRunning) {
          console.log(`[Watchdog] ${renderingClips.length} stuck render(s) detected — no FFmpeg process running. Resetting...`);
          for (const c of renderingClips) {
            wRun("UPDATE clips SET status = 'detected', output_path = NULL WHERE id = ?", [c.id]);
            console.log(`  [Watchdog] Reset clip #${c.clip_number} "${c.title || ''}" → detected`);
          }
        }
      } catch (e) {
        console.warn('[Watchdog] Error during render watchdog check:', e.message);
      }
    }, WATCHDOG_INTERVAL_MS);
    console.log('[Startup] Render watchdog active (checks every 10 minutes)');

    // Routes (loaded after DB init)
    const projectRoutes = require('./routes/projects');
    const settingsRoutes = require('./routes/settings');
    const brandkitRoutes = require('./routes/brandkits');
    const brandingRoutes = require('./routes/branding');
    const licenseRoutes = require('./routes/license');
    const adminRoutes = require('./routes/admin');
    const musicRoutes = require('./routes/music');
    const sfxRoutes = require('./routes/sfx');
    app.use('/api/projects', projectRoutes);
    app.use('/api/settings', settingsRoutes);
    app.use('/api/brandkits', brandkitRoutes);
    app.use('/api/branding', brandingRoutes);
    app.use('/api/license', licenseRoutes);
    app.use('/api/admin', adminRoutes);
    app.use('/api/music', musicRoutes);
    app.use('/api/sfx', sfxRoutes);

    // Serve frontend (for web browser access / admin panel)
    const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
    if (fs.existsSync(frontendDist)) {
      app.use(express.static(frontendDist));
      // SPA fallback — all non-API routes serve index.html
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/') || req.path.startsWith('/data/')) return next();
        res.sendFile(path.join(frontendDist, 'index.html'));
      });
    }

    // Error handler
    app.use((err, req, res, next) => {
      console.error('[Error]', err.message);
      res.status(err.status || 500).json({
        error: true,
        message: err.message || 'Internal Server Error'
      });
    });

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`\n⚡ ClipperSkuy Backend running on http://localhost:${PORT}`);
      console.log(`📁 Data directory: ${DATA_DIR}\n`);

      // Start license heartbeat (online validation every 6 hours)
      try {
        const { startHeartbeat } = require('./services/license');
        startHeartbeat();
      } catch (e) { /* ignore if license module fails */ }
    });
  } catch (err) {
    console.error('[Fatal] Failed to start:', err);
    process.exit(1);
  }
}

start();

// ─── Global error guards — prevent backend from dying on unhandled errors ────
// Without these, ANY unhandled promise rejection (e.g. FFmpeg crash, DB error)
// kills the entire backend process silently.

process.on('uncaughtException', (err) => {
  console.error('\n[FATAL] Uncaught Exception — backend WILL keep running:');
  console.error('  ', err.message);
  console.error(err.stack);
  // Don't call process.exit() — let the server keep running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n[ERROR] Unhandled Promise Rejection — backend stays up:');
  console.error('  Reason:', reason instanceof Error ? reason.message : reason);
  if (reason instanceof Error && reason.stack) {
    console.error(reason.stack);
  }
  // Don't crash — just log it
});

module.exports = { app, io };
