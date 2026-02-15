/**
 * ClipperSkuy — Trial & License Service
 * Tracks trial period, enforces feature limits per tier, validates license keys.
 */

const { get, run, all } = require('../database');
const crypto = require('crypto');
const os = require('os');

const TRIAL_DAYS = 14;
const MAX_FREE_PROJECTS = 3;

// Feature limits per tier
const TIER_LIMITS = {
    free: {
        maxProjects: MAX_FREE_PROJECTS,
        maxExportResolution: 720,
        watermarkRequired: true,
        batchExport: false,
        gpuAccel: false,
        customBranding: false,
        apiAccess: false
    },
    trial: {
        maxProjects: Infinity,
        maxExportResolution: 1080,
        watermarkRequired: false,
        batchExport: true,
        gpuAccel: true,
        customBranding: false,
        apiAccess: false
    },
    pro: {
        maxProjects: Infinity,
        maxExportResolution: 1080,
        watermarkRequired: false,
        batchExport: true,
        gpuAccel: true,
        customBranding: true,
        apiAccess: false
    },
    enterprise: {
        maxProjects: Infinity,
        maxExportResolution: 2160,
        watermarkRequired: false,
        batchExport: true,
        gpuAccel: true,
        customBranding: true,
        apiAccess: true
    }
};

/**
 * Generate a machine fingerprint for license binding
 */
function getMachineId() {
    const interfaces = os.networkInterfaces();
    const macs = [];
    for (const name in interfaces) {
        for (const iface of interfaces[name]) {
            if (!iface.internal && iface.mac !== '00:00:00:00:00:00') {
                macs.push(iface.mac);
            }
        }
    }
    const raw = `${os.hostname()}-${os.platform()}-${os.arch()}-${os.cpus()[0]?.model || ''}-${macs.sort().join(',')}`;
    return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 24);
}

/**
 * Get or initialize trial start date
 */
function getTrialInfo() {
    // Check if trial has been started
    let trialStart = null;
    const row = get('SELECT value FROM settings WHERE key = ?', ['trial_started_at']);

    if (row) {
        trialStart = new Date(row.value);
    } else {
        // Start trial now
        trialStart = new Date();
        run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime("now"))',
            ['trial_started_at', trialStart.toISOString()]);
    }

    const now = new Date();
    const elapsed = Math.floor((now - trialStart) / (1000 * 60 * 60 * 24));
    const remaining = Math.max(0, TRIAL_DAYS - elapsed);
    const expired = remaining <= 0;

    return {
        startedAt: trialStart.toISOString(),
        daysElapsed: elapsed,
        daysRemaining: remaining,
        totalDays: TRIAL_DAYS,
        expired
    };
}

/**
 * Get current license status (with expiration check)
 */
function getLicenseStatus() {
    const licenseKey = get('SELECT value FROM settings WHERE key = ?', ['license_key']);
    const licenseTier = get('SELECT value FROM settings WHERE key = ?', ['license_tier']);
    const licenseActivatedAt = get('SELECT value FROM settings WHERE key = ?', ['license_activated_at']);

    const trial = getTrialInfo();
    const machineId = getMachineId();

    // Determine effective tier
    let tier = 'free';
    let status = 'free';
    let expiresAt = null;
    let daysRemaining = null;

    if (licenseKey?.value && licenseTier?.value && licenseTier.value !== 'free') {
        // Check if the key exists in DB and has expiration
        const dbKey = get('SELECT * FROM license_keys WHERE license_key = ?', [licenseKey.value]);

        if (dbKey && dbKey.expires_at) {
            const now = new Date();
            const expiry = new Date(dbKey.expires_at);

            if (now > expiry) {
                // License expired! Auto-mark and downgrade
                run("UPDATE license_keys SET status = 'expired' WHERE id = ?", [dbKey.id]);
                // Clear the local license settings
                ['license_key', 'license_tier', 'license_activated_at', 'license_machine_id']
                    .forEach(k => run('DELETE FROM settings WHERE key = ?', [k]));

                // Fall through to trial/free check below
            } else {
                tier = licenseTier.value;
                status = 'licensed';
                expiresAt = dbKey.expires_at;
                daysRemaining = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
            }
        } else {
            // No DB record or no expiration (lifetime key)
            tier = licenseTier.value;
            status = 'licensed';
            daysRemaining = -1; // -1 = lifetime
        }
    }

    // If not licensed, check trial
    if (status === 'free' && !trial.expired) {
        tier = 'trial';
        status = 'trial';
    }

    return {
        status,          // 'free' | 'trial' | 'licensed'
        tier,            // 'free' | 'trial' | 'pro' | 'enterprise'
        licenseKey: licenseKey?.value || null,
        activatedAt: licenseActivatedAt?.value || null,
        expiresAt,       // null = lifetime or no license
        daysRemaining,   // -1 = lifetime, null = no license, number = days left
        trial,
        machineId,
        limits: TIER_LIMITS[tier] || TIER_LIMITS.free
    };
}

/**
 * Validate a license key against the database (with expiration check)
 */
function validateLicenseKey(key) {
    if (!key) return { valid: false, reason: 'No key provided' };

    const pattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    if (!pattern.test(key.toUpperCase())) {
        return { valid: false, reason: 'Invalid key format. Expected: XXXX-XXXX-XXXX-XXXX' };
    }

    // Check against license_keys database table
    const dbKey = get('SELECT * FROM license_keys WHERE license_key = ?', [key.toUpperCase()]);

    if (dbKey) {
        if (dbKey.status === 'revoked') {
            return { valid: false, reason: 'This license key has been revoked' };
        }
        // Check expiration
        if (dbKey.expires_at) {
            const now = new Date();
            const expiry = new Date(dbKey.expires_at);
            if (now > expiry) {
                // Auto-mark as expired
                run("UPDATE license_keys SET status = 'expired' WHERE id = ?", [dbKey.id]);
                return { valid: false, reason: `This license key expired on ${expiry.toLocaleDateString()}` };
            }
        }
        if (dbKey.status === 'expired') {
            return { valid: false, reason: 'This license key has expired' };
        }
        return {
            valid: true,
            tier: dbKey.tier || 'pro',
            source: 'database',
            expires_at: dbKey.expires_at || null,
            duration_days: dbKey.duration_days || 0
        };
    }

    // If not in DB, still accept for backward compatibility (dev mode)
    return { valid: true, tier: 'pro', source: 'format_only' };
}

/**
 * Activate a license key (with multi-activation support)
 */
function activateLicense(key) {
    const validation = validateLicenseKey(key);
    if (!validation.valid) return validation;

    const machineId = getMachineId();
    const now = new Date().toISOString();

    // Check max activations limit
    const dbKey = get('SELECT * FROM license_keys WHERE license_key = ?', [key.toUpperCase()]);
    if (dbKey) {
        const maxAct = dbKey.max_activations || 1;
        const currentCount = get('SELECT COUNT(*) as count FROM license_activations WHERE license_key_id = ?', [dbKey.id])?.count || 0;

        // Check if this machine is already activated
        const alreadyActivated = get('SELECT * FROM license_activations WHERE license_key_id = ? AND machine_id = ?', [dbKey.id, machineId]);

        if (!alreadyActivated && currentCount >= maxAct) {
            return {
                valid: false,
                reason: `License key sudah dipakai di ${currentCount}/${maxAct} perangkat. Batas aktivasi tercapai.`
            };
        }

        // Record activation
        if (!alreadyActivated) {
            run('INSERT OR IGNORE INTO license_activations (license_key_id, machine_id, activated_at) VALUES (?, ?, ?)',
                [dbKey.id, machineId, now]);
        }

        // Update the license_keys record
        const newStatus = (currentCount + (alreadyActivated ? 0 : 1)) >= maxAct ? 'used' : 'active';
        run(`UPDATE license_keys SET machine_id = ?, activated_at = ?, activated_by = ?, status = ? WHERE license_key = ?`,
            [machineId, now, require('os').hostname(), newStatus, key.toUpperCase()]);
    }

    // Save to local settings
    run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime("now"))',
        ['license_key', key.toUpperCase()]);
    run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime("now"))',
        ['license_tier', validation.tier]);
    run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime("now"))',
        ['license_activated_at', now]);
    run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime("now"))',
        ['license_machine_id', machineId]);

    return {
        valid: true,
        tier: validation.tier,
        machineId,
        activatedAt: now,
        max_activations: dbKey?.max_activations || 1
    };
}

/**
 * Deactivate a license
 */
function deactivateLicense() {
    ['license_key', 'license_tier', 'license_activated_at', 'license_machine_id']
        .forEach(k => {
            run('DELETE FROM settings WHERE key = ?', [k]);
        });
    return { success: true };
}

/**
 * Check if a specific feature is allowed under current license
 */
function isFeatureAllowed(feature) {
    const status = getLicenseStatus();
    return status.limits[feature] !== undefined ? status.limits[feature] : true;
}

/**
 * Check if the user can create more projects
 */
function canCreateProject() {
    const status = getLicenseStatus();
    if (status.limits.maxProjects === Infinity) return { allowed: true };

    const count = get('SELECT COUNT(*) as count FROM projects');
    const current = count?.count || 0;

    return {
        allowed: current < status.limits.maxProjects,
        current,
        max: status.limits.maxProjects,
        message: current >= status.limits.maxProjects
            ? `Free tier limited to ${status.limits.maxProjects} projects. Upgrade to Pro for unlimited.`
            : null
    };
}

module.exports = {
    getMachineId,
    getTrialInfo,
    getLicenseStatus,
    validateLicenseKey,
    activateLicense,
    deactivateLicense,
    isFeatureAllowed,
    canCreateProject,
    TIER_LIMITS
};
