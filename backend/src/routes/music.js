/**
 * Music Library Routes
 * Manages background music tracks for clips
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { getDb, saveDatabase } = require('../database');

const DATA_DIR = process.env.CLIPPERSKUY_DATA || path.join(__dirname, '..', '..', 'data');
const MUSIC_DIR = path.join(DATA_DIR, 'music');
fs.ensureDirSync(MUSIC_DIR);

// Multer storage for music uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, MUSIC_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${uuidv4()}${ext}`);
    }
});
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowed = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, allowed.includes(ext));
    },
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
});

// GET /api/music — List all music tracks
router.get('/', (req, res) => {
    try {
        const db = getDb();
        const stmt = db.prepare('SELECT * FROM music_tracks ORDER BY category, name');
        const tracks = [];
        while (stmt.step()) tracks.push(stmt.getAsObject());
        stmt.free();
        res.json(tracks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/music/:id/stream — Stream music file
router.get('/:id/stream', (req, res) => {
    try {
        const db = getDb();
        const stmt = db.prepare('SELECT * FROM music_tracks WHERE id = ?');
        stmt.bind([req.params.id]);
        if (!stmt.step()) {
            stmt.free();
            return res.status(404).json({ error: 'Track not found' });
        }
        const track = stmt.getAsObject();
        stmt.free();

        const filePath = track.file_path;
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        const stat = fs.statSync(filePath);
        res.writeHead(200, {
            'Content-Type': 'audio/mpeg',
            'Content-Length': stat.size,
            'Accept-Ranges': 'bytes'
        });
        fs.createReadStream(filePath).pipe(res);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/music — Upload new music track
router.post('/', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const db = getDb();
        const id = uuidv4();
        const { name, category, mood, bpm } = req.body;

        // Get audio duration using ffprobe
        const filePath = req.file.path;
        let duration = 0;
        try {
            const { execSync } = require('child_process');
            const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
            const result = execSync(
                `"${ffprobe}" -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
                { encoding: 'utf-8', timeout: 10000 }
            ).trim();
            duration = parseFloat(result) || 0;
        } catch (e) {
            console.warn('[Music] Could not detect duration:', e.message);
        }

        db.run(
            `INSERT INTO music_tracks (id, name, file_path, file_name, category, mood, bpm, duration, file_size)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, name || path.parse(req.file.originalname).name, filePath, req.file.originalname,
                category || 'general', mood || 'neutral', parseInt(bpm) || 0, duration, req.file.size]
        );
        saveDatabase();

        const stmt = db.prepare('SELECT * FROM music_tracks WHERE id = ?');
        stmt.bind([id]);
        stmt.step();
        const track = stmt.getAsObject();
        stmt.free();

        res.json(track);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/music/:id — Update track metadata
router.put('/:id', (req, res) => {
    try {
        const db = getDb();
        const { name, category, mood, bpm } = req.body;
        db.run(
            `UPDATE music_tracks SET name = ?, category = ?, mood = ?, bpm = ? WHERE id = ?`,
            [name, category, mood, parseInt(bpm) || 0, req.params.id]
        );
        saveDatabase();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/music/:id — Delete music track
router.delete('/:id', (req, res) => {
    try {
        const db = getDb();
        const stmt = db.prepare('SELECT file_path FROM music_tracks WHERE id = ?');
        stmt.bind([req.params.id]);
        if (stmt.step()) {
            const track = stmt.getAsObject();
            if (track.file_path && fs.existsSync(track.file_path)) {
                fs.removeSync(track.file_path);
            }
        }
        stmt.free();

        db.run('DELETE FROM music_tracks WHERE id = ?', [req.params.id]);
        saveDatabase();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
