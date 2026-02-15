const express = require('express');
const router = express.Router();
const { all, get, run } = require('../database');

// GET /api/settings — Get all settings
router.get('/', (req, res) => {
    try {
        const rows = all('SELECT * FROM settings');
        const settings = {};
        rows.forEach(row => {
            settings[row.key] = row.value;
        });
        res.json({ settings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/settings — Update settings
router.put('/', (req, res) => {
    try {
        for (const [key, value] of Object.entries(req.body)) {
            run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime("now"))', [key, String(value)]);
        }

        const rows = all('SELECT * FROM settings');
        const settings = {};
        rows.forEach(row => { settings[row.key] = row.value; });
        res.json({ settings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/settings/validate-key — Validate AI API key
router.post('/validate-key', async (req, res) => {
    const { provider, apiKey } = req.body;

    try {
        if (provider === 'groq') {
            const response = await fetch('https://api.groq.com/openai/v1/models', {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            const valid = response.ok;
            res.json({ valid, provider, message: valid ? 'Groq API key is valid!' : 'Invalid Groq API key' });
        } else if (provider === 'gemini') {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            const valid = response.ok;
            res.json({ valid, provider, message: valid ? 'Gemini API key is valid!' : 'Invalid Gemini API key' });
        } else {
            res.status(400).json({ error: 'Unknown provider' });
        }
    } catch (err) {
        res.json({ valid: false, provider, message: `Connection error: ${err.message}` });
    }
});

// POST /api/settings/reset — Reset all settings to default
router.post('/reset', (req, res) => {
    try {
        run('DELETE FROM settings');
        res.json({ success: true, message: 'All settings reset to default' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/settings/hardware-detect — Auto-detect hardware capabilities
router.post('/hardware-detect', async (req, res) => {
    const { execSync } = require('child_process');
    const info = {
        cpu: { cores: require('os').cpus().length, model: require('os').cpus()[0]?.model || 'Unknown' },
        memory: { total: Math.round(require('os').totalmem() / 1024 / 1024 / 1024) + ' GB' },
        gpu: null,
        encoders: [],
        ffmpeg: false
    };

    // Detect FFmpeg
    try {
        const ver = execSync('ffmpeg -version', { timeout: 5000 }).toString().split('\n')[0];
        info.ffmpeg = ver;
    } catch (e) {
        info.ffmpeg = false;
    }

    // Detect GPU encoders
    try {
        const encoders = execSync('ffmpeg -encoders 2>&1', { timeout: 5000 }).toString();
        if (encoders.includes('h264_nvenc')) info.encoders.push('h264_nvenc (NVIDIA)');
        if (encoders.includes('hevc_nvenc')) info.encoders.push('hevc_nvenc (NVIDIA)');
        if (encoders.includes('h264_amf')) info.encoders.push('h264_amf (AMD)');
        if (encoders.includes('h264_qsv')) info.encoders.push('h264_qsv (Intel)');
        if (encoders.includes('libx264')) info.encoders.push('libx264 (CPU)');
    } catch (e) { /* */ }

    // Detect GPU via WMIC (Windows)
    try {
        const gpu = execSync('wmic path win32_VideoController get name /value', { timeout: 5000 })
            .toString().match(/Name=(.+)/);
        if (gpu) info.gpu = gpu[1].trim();
    } catch (e) { /* */ }

    // Auto-recommend encoder based on ACTUAL GPU, not just FFmpeg availability
    let recommended = 'libx264';
    const gpuName = (info.gpu || '').toLowerCase();

    if (gpuName.includes('nvidia') || gpuName.includes('geforce') || gpuName.includes('rtx') || gpuName.includes('gtx')) {
        // NVIDIA GPU detected — use NVENC if available
        if (info.encoders.some(e => e.includes('NVIDIA'))) recommended = 'h264_nvenc';
    } else if (gpuName.includes('amd') || gpuName.includes('radeon') || gpuName.includes('rx ')) {
        // AMD GPU detected — use AMF if available
        if (info.encoders.some(e => e.includes('AMD'))) recommended = 'h264_amf';
    } else if (gpuName.includes('intel') || gpuName.includes('uhd') || gpuName.includes('iris')) {
        // Intel iGPU detected — use QSV if available
        if (info.encoders.some(e => e.includes('Intel'))) recommended = 'h264_qsv';
    }
    info.recommended_encoder = recommended;

    res.json({ success: true, hardware: info });
});

module.exports = router;
