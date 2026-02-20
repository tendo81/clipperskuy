const express = require('express');
const router = express.Router();
const { all, get, run } = require('../database');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');

const DATA_DIR = process.env.CLIPPERSKUY_DATA || path.join(__dirname, '..', '..', 'data');
const BRANDKITS_DIR = path.join(DATA_DIR, 'brandkits');

fs.ensureDirSync(BRANDKITS_DIR);

// File upload config for brand kit assets
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const kitId = req.params.id || req.body.kitId || 'temp';
        const kitDir = path.join(BRANDKITS_DIR, kitId);
        fs.ensureDirSync(kitDir);
        cb(null, kitDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const prefix = file.fieldname; // logo, intro, outro, sound
        cb(null, `${prefix}_${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: (req, file, cb) => {
        const imageExts = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif'];
        const videoExts = ['.mp4', '.mov', '.webm'];
        const audioExts = ['.mp3', '.wav', '.ogg', '.m4a'];
        const ext = path.extname(file.originalname).toLowerCase();

        if (file.fieldname === 'logo' && imageExts.includes(ext)) cb(null, true);
        else if ((file.fieldname === 'intro' || file.fieldname === 'outro') && [...imageExts, ...videoExts].includes(ext)) cb(null, true);
        else if (file.fieldname === 'sound' && audioExts.includes(ext)) cb(null, true);
        else cb(new Error(`File type ${ext} not supported for ${file.fieldname}`));
    }
});

// GET /api/brandkits — List all brand kits
router.get('/', (req, res) => {
    try {
        const kits = all('SELECT * FROM brand_kits ORDER BY is_default DESC, created_at DESC');
        res.json({ brandKits: kits });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/brandkits/:id — Get single brand kit
router.get('/:id', (req, res) => {
    try {
        const kit = get('SELECT * FROM brand_kits WHERE id = ?', [req.params.id]);
        if (!kit) return res.status(404).json({ error: 'Brand kit not found' });
        res.json({ brandKit: kit });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/brandkits — Create new brand kit
router.post('/', (req, res) => {
    try {
        const id = uuidv4();
        const {
            name = 'My Brand',
            logo_position = 'top-right',
            logo_size = 15,
            logo_opacity = 80,
            logo_margin = 16,
            logo_animation = 'fade',
            logo_show_mode = 'always',
            intro_type = 'none',
            intro_duration = 2.0,
            outro_type = 'none',
            outro_duration = 3.0,
            color_primary = '#7c3aed',
            color_secondary = '#1a1a2e',
            color_accent = '#2dd4bf',
            color_text = '#ffffff',
            font_heading = 'Montserrat',
            font_caption = 'Inter',
            font_body = 'Inter',
            social_tiktok = '',
            social_instagram = '',
            social_youtube = '',
            social_twitter = '',
            social_linkedin = '',
            social_display_mode = 'outro',
            lower_third_name = '',
            lower_third_title = '',
            lower_third_duration = 5,
            lower_third_position = 'bottom-left',
            sound_logo_volume = 70,
            sound_play_intro = 1,
            sound_play_outro = 1
        } = req.body;

        // If no brand kits exist, make this one default
        const existing = all('SELECT COUNT(*) as count FROM brand_kits');
        const isDefault = (existing[0]?.count || 0) === 0 ? 1 : 0;

        const kitDir = path.join(BRANDKITS_DIR, id);
        fs.ensureDirSync(kitDir);

        run(`
            INSERT INTO brand_kits (
                id, name, logo_position, logo_size, logo_opacity, logo_margin, logo_animation, logo_show_mode,
                intro_type, intro_duration, outro_type, outro_duration,
                color_primary, color_secondary, color_accent, color_text,
                font_heading, font_caption, font_body,
                social_tiktok, social_instagram, social_youtube, social_twitter, social_linkedin, social_display_mode,
                lower_third_name, lower_third_title, lower_third_duration, lower_third_position,
                sound_logo_volume, sound_play_intro, sound_play_outro, is_default
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id, name, logo_position, logo_size, logo_opacity, logo_margin, logo_animation, logo_show_mode,
            intro_type, intro_duration, outro_type, outro_duration,
            color_primary, color_secondary, color_accent, color_text,
            font_heading, font_caption, font_body,
            social_tiktok, social_instagram, social_youtube, social_twitter, social_linkedin, social_display_mode,
            lower_third_name, lower_third_title, lower_third_duration, lower_third_position,
            sound_logo_volume, sound_play_intro, sound_play_outro, isDefault
        ]);

        const kit = get('SELECT * FROM brand_kits WHERE id = ?', [id]);
        console.log(`[BrandKit] Created: ${name} (${id})`);
        res.json({ brandKit: kit });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/brandkits/:id — Update brand kit settings
router.put('/:id', (req, res) => {
    try {
        const kit = get('SELECT * FROM brand_kits WHERE id = ?', [req.params.id]);
        if (!kit) return res.status(404).json({ error: 'Brand kit not found' });

        const allowed = [
            'name', 'logo_position', 'logo_size', 'logo_opacity', 'logo_margin',
            'logo_animation', 'logo_show_mode', 'intro_type', 'intro_duration',
            'outro_type', 'outro_duration', 'color_primary', 'color_secondary',
            'color_accent', 'color_text', 'font_heading', 'font_caption', 'font_body',
            'social_tiktok', 'social_instagram', 'social_youtube', 'social_twitter',
            'social_linkedin', 'social_display_mode', 'lower_third_name', 'lower_third_title',
            'lower_third_duration', 'lower_third_position', 'sound_logo_volume',
            'sound_play_intro', 'sound_play_outro'
        ];

        const fields = req.body;
        for (const [key, value] of Object.entries(fields)) {
            if (allowed.includes(key)) {
                run(`UPDATE brand_kits SET ${key} = ?, updated_at = datetime('now') WHERE id = ?`, [value, req.params.id]);
            }
        }

        const updated = get('SELECT * FROM brand_kits WHERE id = ?', [req.params.id]);
        res.json({ brandKit: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/brandkits/:id/upload — Upload logo/intro/outro/sound files
router.post('/:id/upload', upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'intro', maxCount: 1 },
    { name: 'outro', maxCount: 1 },
    { name: 'sound', maxCount: 1 }
]), (req, res) => {
    try {
        const kit = get('SELECT * FROM brand_kits WHERE id = ?', [req.params.id]);
        if (!kit) return res.status(404).json({ error: 'Brand kit not found' });

        const updates = {};
        if (req.files?.logo?.[0]) {
            // Delete old logo
            if (kit.logo_path) {
                const oldPath = path.join(DATA_DIR, kit.logo_path);
                if (fs.existsSync(oldPath)) fs.removeSync(oldPath);
            }
            updates.logo_path = path.relative(DATA_DIR, req.files.logo[0].path).replace(/\\/g, '/');
        }
        if (req.files?.intro?.[0]) {
            if (kit.intro_path) {
                const oldPath = path.join(DATA_DIR, kit.intro_path);
                if (fs.existsSync(oldPath)) fs.removeSync(oldPath);
            }
            updates.intro_path = path.relative(DATA_DIR, req.files.intro[0].path).replace(/\\/g, '/');
            if (!req.body.intro_type || req.body.intro_type === 'none') {
                updates.intro_type = 'custom';
            }
        }
        if (req.files?.outro?.[0]) {
            if (kit.outro_path) {
                const oldPath = path.join(DATA_DIR, kit.outro_path);
                if (fs.existsSync(oldPath)) fs.removeSync(oldPath);
            }
            updates.outro_path = path.relative(DATA_DIR, req.files.outro[0].path).replace(/\\/g, '/');
            if (!req.body.outro_type || req.body.outro_type === 'none') {
                updates.outro_type = 'custom';
            }
        }
        if (req.files?.sound?.[0]) {
            if (kit.sound_logo_path) {
                const oldPath = path.join(DATA_DIR, kit.sound_logo_path);
                if (fs.existsSync(oldPath)) fs.removeSync(oldPath);
            }
            updates.sound_logo_path = path.relative(DATA_DIR, req.files.sound[0].path).replace(/\\/g, '/');
        }

        for (const [key, value] of Object.entries(updates)) {
            run(`UPDATE brand_kits SET ${key} = ?, updated_at = datetime('now') WHERE id = ?`, [value, req.params.id]);
        }

        const updated = get('SELECT * FROM brand_kits WHERE id = ?', [req.params.id]);
        console.log(`[BrandKit] Files uploaded for: ${updated.name}`);
        res.json({ brandKit: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/brandkits/:id/file/:type — Delete specific file (logo, intro, outro, sound)
router.delete('/:id/file/:type', (req, res) => {
    try {
        const kit = get('SELECT * FROM brand_kits WHERE id = ?', [req.params.id]);
        if (!kit) return res.status(404).json({ error: 'Brand kit not found' });

        const fileType = req.params.type;
        const pathMap = {
            logo: 'logo_path',
            intro: 'intro_path',
            outro: 'outro_path',
            sound: 'sound_logo_path'
        };

        const column = pathMap[fileType];
        if (!column) return res.status(400).json({ error: 'Invalid file type' });

        if (kit[column]) {
            const fullPath = path.join(DATA_DIR, kit[column]);
            if (fs.existsSync(fullPath)) fs.removeSync(fullPath);
            run(`UPDATE brand_kits SET ${column} = NULL, updated_at = datetime('now') WHERE id = ?`, [req.params.id]);

            // Reset type to 'none' if intro/outro
            if (fileType === 'intro') run("UPDATE brand_kits SET intro_type = 'none' WHERE id = ?", [req.params.id]);
            if (fileType === 'outro') run("UPDATE brand_kits SET outro_type = 'none' WHERE id = ?", [req.params.id]);
        }

        const updated = get('SELECT * FROM brand_kits WHERE id = ?', [req.params.id]);
        res.json({ brandKit: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/brandkits/:id/default — Set as default brand kit
router.put('/:id/default', (req, res) => {
    try {
        const kit = get('SELECT * FROM brand_kits WHERE id = ?', [req.params.id]);
        if (!kit) return res.status(404).json({ error: 'Brand kit not found' });

        // Unset all defaults
        run('UPDATE brand_kits SET is_default = 0');
        // Set this as default
        run('UPDATE brand_kits SET is_default = 1 WHERE id = ?', [req.params.id]);

        const updated = get('SELECT * FROM brand_kits WHERE id = ?', [req.params.id]);
        console.log(`[BrandKit] Default set: ${updated.name}`);
        res.json({ brandKit: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/brandkits/:id — Delete brand kit and all files
router.delete('/:id', (req, res) => {
    try {
        const kit = get('SELECT * FROM brand_kits WHERE id = ?', [req.params.id]);
        if (!kit) return res.status(404).json({ error: 'Brand kit not found' });

        // Delete kit directory
        const kitDir = path.join(BRANDKITS_DIR, req.params.id);
        if (fs.existsSync(kitDir)) fs.removeSync(kitDir);

        run('DELETE FROM brand_kits WHERE id = ?', [req.params.id]);

        // If this was default, make the first remaining kit default
        if (kit.is_default) {
            const remaining = get('SELECT id FROM brand_kits ORDER BY created_at ASC LIMIT 1');
            if (remaining) {
                run('UPDATE brand_kits SET is_default = 1 WHERE id = ?', [remaining.id]);
            }
        }

        console.log(`[BrandKit] Deleted: ${kit.name}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
