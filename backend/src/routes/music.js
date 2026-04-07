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
const { all, get, run } = require('../database');

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
        const tracks = all('SELECT * FROM music_tracks ORDER BY category, name');
        res.json(tracks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/music/:id/stream — Stream music file
router.get('/:id/stream', (req, res) => {
    try {
        const track = get('SELECT * FROM music_tracks WHERE id = ?', [req.params.id]);
        if (!track) return res.status(404).json({ error: 'Track not found' });

        if (!fs.existsSync(track.file_path)) {
            return res.status(404).json({ error: 'File not found' });
        }

        const stat = fs.statSync(track.file_path);
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
            const chunkSize = end - start + 1;
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': 'audio/mpeg',
            });
            fs.createReadStream(track.file_path, { start, end }).pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Type': 'audio/mpeg',
                'Content-Length': stat.size,
                'Accept-Ranges': 'bytes'
            });
            fs.createReadStream(track.file_path).pipe(res);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/music — Upload new music track
router.post('/', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const id = uuidv4();
        const { name, category, mood, bpm } = req.body;
        const filePath = req.file.path;

        // Get audio duration using ffprobe
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

        run(
            `INSERT INTO music_tracks (id, name, file_path, file_name, category, mood, bpm, duration, file_size)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, name || path.parse(req.file.originalname).name, filePath, req.file.originalname,
                category || 'general', mood || 'neutral', parseInt(bpm) || 0, duration, req.file.size]
        );

        const track = get('SELECT * FROM music_tracks WHERE id = ?', [id]);
        res.json(track);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/music/:id — Update track metadata
router.put('/:id', (req, res) => {
    try {
        const track = get('SELECT * FROM music_tracks WHERE id = ?', [req.params.id]);
        if (!track) return res.status(404).json({ error: 'Track not found' });

        const { name, category, mood, bpm } = req.body;
        run(
            `UPDATE music_tracks SET name = ?, category = ?, mood = ?, bpm = ? WHERE id = ?`,
            [name || track.name, category || track.category, mood || track.mood, parseInt(bpm) || track.bpm, req.params.id]
        );
        const updated = get('SELECT * FROM music_tracks WHERE id = ?', [req.params.id]);
        res.json({ success: true, track: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/music/:id — Delete music track
router.delete('/:id', (req, res) => {
    try {
        const track = get('SELECT file_path FROM music_tracks WHERE id = ?', [req.params.id]);
        if (track && track.file_path && fs.existsSync(track.file_path)) {
            fs.removeSync(track.file_path);
        }
        run('DELETE FROM music_tracks WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
