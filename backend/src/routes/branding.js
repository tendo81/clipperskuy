const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');

const dataDir = process.env.CLIPPERSKUY_DATA || path.join(__dirname, '..', 'data');
const brandingDir = path.join(dataDir, 'branding');
fs.ensureDirSync(brandingDir);

// Storage for branding assets (icons, logos, splash)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, brandingDir),
    filename: (req, file, cb) => {
        const type = req.params.type || 'icon'; // icon, logo, splash, favicon
        const ext = path.extname(file.originalname);
        cb(null, `${type}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowed = ['.png', '.jpg', '.jpeg', '.ico', '.svg', '.webp'];
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, allowed.includes(ext));
    }
});

// GET /api/branding — get all branding assets info
router.get('/', (req, res) => {
    try {
        const assets = {};
        const files = fs.readdirSync(brandingDir);

        files.forEach(f => {
            const name = path.parse(f).name; // icon, logo, splash, etc.
            assets[name] = {
                filename: f,
                path: `/api/branding/file/${f}`,
                size: fs.statSync(path.join(brandingDir, f)).size,
                modified: fs.statSync(path.join(brandingDir, f)).mtime
            };
        });

        res.json({ success: true, assets });
    } catch (err) {
        res.json({ success: true, assets: {} });
    }
});

// GET /api/branding/file/:filename — serve a branding asset
router.get('/file/:filename', (req, res) => {
    const filePath = path.join(brandingDir, req.params.filename);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// POST /api/branding/upload/:type — upload branding asset (icon, logo, splash, favicon)
router.post('/upload/:type', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded or invalid format' });
    }

    const type = req.params.type;
    res.json({
        success: true,
        type,
        filename: req.file.filename,
        path: `/api/branding/file/${req.file.filename}`,
        size: req.file.size
    });
});

// DELETE /api/branding/:type — remove a branding asset
router.delete('/:type', (req, res) => {
    try {
        const files = fs.readdirSync(brandingDir);
        const match = files.find(f => path.parse(f).name === req.params.type);
        if (match) {
            fs.removeSync(path.join(brandingDir, match));
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Asset not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
