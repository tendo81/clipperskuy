/**
 * SFX Library Routes
 * Manages sound effects for clips
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { getDb, saveDatabase, all, get, run } = require('../database');

const DATA_DIR = process.env.CLIPPERSKUY_DATA || path.join(__dirname, '..', '..', 'data');
const SFX_DIR = path.join(DATA_DIR, 'sfx');
fs.ensureDirSync(SFX_DIR);

// Multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, SFX_DIR),
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
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB max for SFX
});

// GET /api/sfx — List all SFX
router.get('/', (req, res) => {
    try {
        const tracks = all('SELECT * FROM sfx_tracks ORDER BY category, name');
        res.json(tracks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/sfx/:id/stream — Stream SFX file
router.get('/:id/stream', (req, res) => {
    try {
        const track = get('SELECT * FROM sfx_tracks WHERE id = ?', [req.params.id]);
        if (!track) return res.status(404).json({ error: 'SFX not found' });
        if (!fs.existsSync(track.file_path)) return res.status(404).json({ error: 'File not found' });

        const stat = fs.statSync(track.file_path);
        res.writeHead(200, {
            'Content-Type': 'audio/mpeg',
            'Content-Length': stat.size
        });
        fs.createReadStream(track.file_path).pipe(res);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sfx — Upload new SFX
router.post('/', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const id = uuidv4();
        const { name, category } = req.body;
        const filePath = req.file.path;

        // Get duration
        let duration = 0;
        try {
            const { execSync } = require('child_process');
            const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
            const result = execSync(
                `"${ffprobe}" -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
                { encoding: 'utf-8', timeout: 10000 }
            ).trim();
            duration = parseFloat(result) || 0;
        } catch (e) { /* ignore */ }

        run(
            `INSERT INTO sfx_tracks (id, name, file_path, file_name, category, duration, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, name || path.parse(req.file.originalname).name, filePath, req.file.originalname,
                category || 'general', duration, req.file.size]
        );

        const track = get('SELECT * FROM sfx_tracks WHERE id = ?', [id]);
        res.json(track);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/sfx/:id
router.delete('/:id', (req, res) => {
    try {
        const track = get('SELECT file_path FROM sfx_tracks WHERE id = ?', [req.params.id]);
        if (track && track.file_path && fs.existsSync(track.file_path)) {
            fs.removeSync(track.file_path);
        }
        run('DELETE FROM clip_sfx WHERE sfx_track_id = ?', [req.params.id]);
        run('DELETE FROM sfx_tracks WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/sfx/clip/:clipId — Get SFX placed on a clip
router.get('/clip/:clipId', (req, res) => {
    try {
        const sfxList = all(
            `SELECT cs.*, st.name, st.category, st.duration, st.file_path
             FROM clip_sfx cs JOIN sfx_tracks st ON cs.sfx_track_id = st.id
             WHERE cs.clip_id = ? ORDER BY cs.position`,
            [req.params.clipId]
        );
        res.json(sfxList);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sfx/clip/:clipId — Add SFX to a clip
router.post('/clip/:clipId', (req, res) => {
    try {
        const { sfx_track_id, position, volume } = req.body;
        if (!sfx_track_id) return res.status(400).json({ error: 'sfx_track_id required' });

        const id = uuidv4();
        run(
            `INSERT INTO clip_sfx (id, clip_id, sfx_track_id, position, volume) VALUES (?, ?, ?, ?, ?)`,
            [id, req.params.clipId, sfx_track_id, position || 0, volume || 80]
        );

        const placed = get(
            `SELECT cs.*, st.name, st.category, st.duration
             FROM clip_sfx cs JOIN sfx_tracks st ON cs.sfx_track_id = st.id
             WHERE cs.id = ?`, [id]
        );
        res.json(placed);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/sfx/clip-sfx/:id — Update position/volume of placed SFX
router.put('/clip-sfx/:id', (req, res) => {
    try {
        const { position, volume } = req.body;
        if (position !== undefined) run('UPDATE clip_sfx SET position = ? WHERE id = ?', [position, req.params.id]);
        if (volume !== undefined) run('UPDATE clip_sfx SET volume = ? WHERE id = ?', [volume, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/sfx/clip-sfx/:id — Remove SFX from clip
router.delete('/clip-sfx/:id', (req, res) => {
    try {
        run('DELETE FROM clip_sfx WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
