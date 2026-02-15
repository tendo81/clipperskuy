const express = require('express');
const router = express.Router();
const {
    getLicenseStatus,
    activateLicense,
    deactivateLicense,
    canCreateProject,
    getMachineId
} = require('../services/license');

// GET /api/license — Get current license status (includes trial info)
router.get('/', (req, res) => {
    try {
        const status = getLicenseStatus();
        res.json({ success: true, ...status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/license/activate — Activate a license key
router.post('/activate', (req, res) => {
    try {
        const { key } = req.body;
        if (!key) return res.status(400).json({ error: 'License key is required' });

        const result = activateLicense(key);
        if (result.valid) {
            res.json({ success: true, ...result });
        } else {
            res.status(400).json({ success: false, error: result.reason });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/license/deactivate — Deactivate current license
router.post('/deactivate', (req, res) => {
    try {
        const result = deactivateLicense();
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/license/can-create-project — Check if user can create a new project
router.get('/can-create-project', (req, res) => {
    try {
        const result = canCreateProject();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/license/machine-id — Get machine fingerprint
router.get('/machine-id', (req, res) => {
    try {
        res.json({ machineId: getMachineId() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
