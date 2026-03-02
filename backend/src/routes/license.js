const express = require('express');
const router = express.Router();
const {
    getLicenseStatus,
    activateLicense,
    deactivateLicense,
    canCreateProject,
    getMachineId,
    checkDailyExportLimit,
    getRenderLimits,
    startTrial
} = require('../services/license');

// POST /api/license/trial — Manually start 7-day trial
router.post('/trial', async (req, res) => {
    try {
        const result = await startTrial();
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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
router.post('/activate', async (req, res) => {
    try {
        const { key } = req.body;
        if (!key) return res.status(400).json({ error: 'License key is required' });

        const result = await activateLicense(key);
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

// GET /api/license/export-limit — Check daily export limit
router.get('/export-limit', (req, res) => {
    try {
        const limit = checkDailyExportLimit();
        const renderLimits = getRenderLimits();
        res.json({
            ...limit,
            tier: renderLimits.tier,
            qualityLocked: renderLimits.tier === 'free' // free = fast only
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
