const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs-extra');
const { initDatabase } = require('./database');

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
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

// Start server after DB is ready
async function start() {
  try {
    await initDatabase();
    console.log('[DB] Database ready');

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
    });
  } catch (err) {
    console.error('[Fatal] Failed to start:', err);
    process.exit(1);
  }
}

start();

module.exports = { app, io };
