/**
 * ClipperSkuy — Trial & License Service
 * Tracks trial period, enforces feature limits per tier, validates license keys.
 */

const { get, run, all } = require('../database');
const crypto = require('crypto');
const os = require('os');
const http = require('http');
const https = require('https');

// Online license server URL (set in .env)
const LICENSE_SERVER_URL = process.env.LICENSE_SERVER_URL || '';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

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
        apiAccess: false,
        faceTrack: false,
        audioEnhancement: false,
        maxClipsPerProject: 5,
        maxSourceDurationMin: 30
    },
    trial: {
        maxProjects: Infinity,
        maxExportResolution: 1080,
        watermarkRequired: false,
        batchExport: true,
        gpuAccel: true,
        customBranding: false,
        apiAccess: false,
        faceTrack: true,
        audioEnhancement: true,
        maxClipsPerProject: Infinity,
        maxSourceDurationMin: Infinity
    },
    pro: {
        maxProjects: Infinity,
        maxExportResolution: 1080,
        watermarkRequired: false,
        batchExport: true,
        gpuAccel: true,
        customBranding: true,
        apiAccess: false,
        faceTrack: true,
        audioEnhancement: true,
        maxClipsPerProject: Infinity,
        maxSourceDurationMin: Infinity
    },
    enterprise: {
        maxProjects: Infinity,
        maxExportResolution: 1080,
        watermarkRequired: false,
        batchExport: true,
        gpuAccel: true,
        customBranding: true,
        apiAccess: true,
        faceTrack: true,
        audioEnhancement: true,
        maxClipsPerProject: Infinity,
        maxSourceDurationMin: Infinity
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
 * Get trial info (trial system disabled — always returns expired)
 */
function getTrialInfo() {
    return {
        startedAt: null,
        daysElapsed: 0,
        daysRemaining: 0,
        totalDays: 0,
        expired: true
    };
}

/**
 * Get current license status (with expiration check)
 */
function getLicenseStatus() {
    const licenseKey = get('SELECT value FROM settings WHERE key = ?', ['license_key']);
    const licenseTier = get('SELECT value FROM settings WHERE key = ?', ['license_tier']);
    const licenseActivatedAt = get('SELECT value FROM settings WHERE key = ?', ['license_activated_at']);
    const licenseExpiresAt = get('SELECT value FROM settings WHERE key = ?', ['license_expires_at']);
    const licenseDurationDays = get('SELECT value FROM settings WHERE key = ?', ['license_duration_days']);

    const trial = getTrialInfo();
    const machineId = getMachineId();

    // Determine effective tier
    let tier = 'free';
    let status = 'free';
    let expiresAt = null;
    let daysRemaining = null;

    if (licenseKey?.value && licenseTier?.value && licenseTier.value !== 'free') {
        // Check expiry from local settings (calculated from activation date)
        if (licenseExpiresAt?.value) {
            const now = new Date();
            const expiry = new Date(licenseExpiresAt.value);

            if (now > expiry) {
                // License expired! Clear settings
                ['license_key', 'license_tier', 'license_activated_at', 'license_machine_id', 'license_expires_at', 'license_duration_days']
                    .forEach(k => run('DELETE FROM settings WHERE key = ?', [k]));
                // Also update DB if key exists
                const dbKey = get('SELECT * FROM license_keys WHERE license_key = ?', [licenseKey.value]);
                if (dbKey) run("UPDATE license_keys SET status = 'expired' WHERE id = ?", [dbKey.id]);
                // Fall through to free
            } else {
                tier = licenseTier.value;
                status = 'licensed';
                expiresAt = licenseExpiresAt.value;
                daysRemaining = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
            }
        } else {
            // No expiration = lifetime key
            tier = licenseTier.value;
            status = 'licensed';
            daysRemaining = -1; // -1 = lifetime
        }
    }

    // No trial system — users stay on free tier until they activate a license key

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
 * Validate a license key against the database OR via embedded signature
 * Keys can be validated on ANY computer without needing the admin database,
 * using a cryptographic signature embedded in the key itself.
 */
function validateLicenseKey(key) {
    if (!key) return { valid: false, reason: 'No key provided' };

    const upperKey = key.toUpperCase().trim();
    const pattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    if (!pattern.test(upperKey)) {
        return { valid: false, reason: 'Invalid key format. Expected: XXXX-XXXX-XXXX-XXXX' };
    }

    // Method 1: Check local database first (for keys generated on this machine)
    const dbKey = get('SELECT * FROM license_keys WHERE license_key = ?', [upperKey]);

    if (dbKey) {
        if (dbKey.status === 'revoked') {
            return { valid: false, reason: 'This license key has been revoked' };
        }
        // Expired keys CAN be re-activated (renewed) — recalculate expiry from new activation date
        if (dbKey.status === 'expired' || (dbKey.expires_at && new Date() > new Date(dbKey.expires_at))) {
            // Reset status to 'active' so activateLicense() can proceed
            run("UPDATE license_keys SET status = 'active' WHERE id = ?", [dbKey.id]);
            // Recalculate expiry from NOW (renewal)
            const durationDays = dbKey.duration_days || 0;
            let newExpiresAt = null;
            if (durationDays > 0) {
                newExpiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
                run("UPDATE license_keys SET expires_at = ? WHERE id = ?", [newExpiresAt, dbKey.id]);
            }
            console.log(`[License] Key renewed: ${upperKey}, new expiry: ${newExpiresAt || 'lifetime'}`);
            return {
                valid: true,
                tier: dbKey.tier || 'pro',
                source: 'database',
                expires_at: newExpiresAt,
                duration_days: durationDays,
                renewed: true
            };
        }
        return {
            valid: true,
            tier: dbKey.tier || 'pro',
            source: 'database',
            expires_at: dbKey.expires_at || null,
            duration_days: dbKey.duration_days || 0
        };
    }

    // Method 2: Verify key using embedded signature (works on ANY computer)
    const signatureResult = verifyKeySignature(upperKey);
    if (signatureResult.valid) {
        return signatureResult;
    }

    // Key not found and signature invalid
    return { valid: false, reason: 'Invalid license key. Please check and try again.' };
}

/**
 * Secret used for key signing — MUST match between admin (generator) and client (validator)
 * This is embedded in the app binary, so it's the same everywhere.
 */
const LICENSE_SECRET = 'ClipperSkuy-2026-LicenseKey-Secret';

/**
 * Tier encoding: first char of 3rd group encodes the tier
 * P = Pro, E = Enterprise
 */
const TIER_MAP = { 'P': 'pro', 'E': 'enterprise' };

/**
 * Duration encoding: second char of 3rd group
 * L = Lifetime, 1 = 30 days, 3 = 90 days, 6 = 180 days, Y = 365 days
 */
const DURATION_MAP = { 'L': 0, 'D': 3, 'W': 7, 'F': 14, '1': 30, '3': 90, '6': 180, 'Y': 365 };

/**
 * Verify a key's embedded HMAC signature
 * Key format: AAAA-BBBB-TCDD-SSSS
 *   AAAA-BBBB = random payload
 *   T = tier (P=pro, E=enterprise)
 *   C = creation month (A=Jan..L=Dec)  
 *   DD = duration + random
 *   SSSS = HMAC signature of first 3 groups
 */
function verifyKeySignature(key) {
    const parts = key.split('-');
    if (parts.length !== 4) return { valid: false };

    const payload = `${parts[0]}-${parts[1]}-${parts[2]}`;
    const signature = parts[3];

    // Generate expected signature
    const hmac = crypto.createHmac('sha256', LICENSE_SECRET).update(payload).digest('hex');
    const expectedSig = hmac.substring(0, 4).toUpperCase();

    if (signature !== expectedSig) {
        return { valid: false, reason: 'Invalid license key signature' };
    }

    // Decode tier from first char of 3rd group
    const tierChar = parts[2][0];
    const tier = TIER_MAP[tierChar];
    if (!tier) {
        return { valid: false, reason: 'Invalid license key tier' };
    }

    // Decode duration from second char of 3rd group
    const durationChar = parts[2][1];
    const durationDays = DURATION_MAP[durationChar];

    // Don't calculate expiry here — expiry is calculated from ACTIVATION date
    // This ensures users get the full duration regardless of when they activate
    return {
        valid: true,
        tier,
        source: 'signature',
        expires_at: null, // Will be set during activation
        duration_days: durationDays || 0
    };
}
/**
 * Activate a license key
 * Transfer protection is enforced by the ONLINE server (single source of truth).
 * Local DB is only used for offline fallback validation.
 */
function activateLicense(key) {
    const validation = validateLicenseKey(key);
    if (!validation.valid) return validation;

    const machineId = getMachineId();
    const now = new Date().toISOString();

    // Track in local DB for offline reference
    let dbKey = get('SELECT * FROM license_keys WHERE license_key = ?', [key.toUpperCase()]);

    if (!dbKey && validation.source === 'signature') {
        const keyId = require('crypto').randomUUID();
        const durationDays = validation.duration_days || 0;
        let keyExpiresAt = null;
        if (durationDays > 0) {
            keyExpiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
        }
        run(`INSERT INTO license_keys (id, license_key, tier, status, duration_days, expires_at, max_activations, created_at) 
             VALUES (?, ?, ?, 'active', ?, ?, 1, datetime('now'))`,
            [keyId, key.toUpperCase(), validation.tier, durationDays, keyExpiresAt]);
        dbKey = get('SELECT * FROM license_keys WHERE license_key = ?', [key.toUpperCase()]);
    }

    if (dbKey) {
        // Record activation locally
        run('INSERT OR IGNORE INTO license_activations (license_key_id, machine_id, activated_at) VALUES (?, ?, ?)',
            [dbKey.id, machineId, now]);

        run(`UPDATE license_keys SET machine_id = ?, activated_at = ?, activated_by = ?, status = 'active' WHERE license_key = ?`,
            [machineId, now, require('os').hostname(), key.toUpperCase()]);
    }

    // Calculate expiry from ACTIVATION date
    let expiresAt = null;
    const durationDays = validation.duration_days || 0;
    if (durationDays > 0) {
        const expiryDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
        expiresAt = expiryDate.toISOString();
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
    if (expiresAt) {
        run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime("now"))',
            ['license_expires_at', expiresAt]);
    } else {
        run('DELETE FROM settings WHERE key = ?', ['license_expires_at']);
    }
    run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime("now"))',
        ['license_duration_days', String(durationDays)]);

    // Sync to online server — server enforces transfer limits, cooldown, max activations
    syncActivationOnline(key.toUpperCase(), machineId);

    return {
        valid: true,
        tier: validation.tier,
        machineId,
        activatedAt: now,
        expiresAt,
        durationDays,
        max_activations: dbKey?.max_activations || 1
    };
}

/**
 * Deactivate a license — BLOCKED for users.
 * 1 License = 1 Machine ID. Only admin can unbind.
 */
function deactivateLicense() {
    return {
        success: false,
        message: 'License tidak bisa di-deactivate sendiri. 1 license = 1 perangkat (terikat ke Machine ID). Hubungi admin jika perlu pindah ke perangkat lain.'
    };
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
 * Tracks TOTAL projects ever created (not just active) to prevent delete+recreate bypass
 */
function canCreateProject() {
    const status = getLicenseStatus();
    if (status.limits.maxProjects === Infinity) return { allowed: true };

    // Track total projects ever created via a counter in settings
    const totalCreatedRow = get("SELECT value FROM settings WHERE key = 'total_projects_created'");
    const totalCreated = totalCreatedRow ? parseInt(totalCreatedRow.value, 10) : 0;

    // Also count current active projects
    const activeCount = get('SELECT COUNT(*) as count FROM projects')?.count || 0;

    // Use the HIGHER of both counts (prevents gaming)
    const effectiveCount = Math.max(totalCreated, activeCount);

    return {
        allowed: effectiveCount < status.limits.maxProjects,
        current: effectiveCount,
        max: status.limits.maxProjects,
        message: effectiveCount >= status.limits.maxProjects
            ? `Free tier: batas ${status.limits.maxProjects} project tercapai. Upgrade ke Pro untuk unlimited.`
            : null
    };
}

/**
 * Increment the total projects created counter
 * Call this when a new project is created
 */
function incrementProjectCount() {
    const row = get("SELECT value FROM settings WHERE key = 'total_projects_created'");
    const current = row ? parseInt(row.value, 10) : 0;
    run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('total_projects_created', ?, datetime('now'))",
        [String(current + 1)]);
}

/**
 * Get render limits based on current license tier
 * Used by clipRenderer to enforce resolution, watermark, GPU restrictions
 */
function getRenderLimits() {
    const status = getLicenseStatus();

    // Check if preview free tier mode is active (dev testing)
    const previewFree = get('SELECT value FROM settings WHERE key = ?', ['preview_free_tier']);
    const effectiveTier = (previewFree?.value === 'true') ? 'free' : status.tier;
    const limits = TIER_LIMITS[effectiveTier] || TIER_LIMITS.free;

    return {
        tier: effectiveTier,
        maxResolution: limits.maxExportResolution || 720,
        watermarkRequired: limits.watermarkRequired !== false,
        batchExportAllowed: limits.batchExport === true,
        gpuAllowed: limits.gpuAccel === true,
        faceTrackAllowed: limits.faceTrack === true,
        audioEnhancementAllowed: limits.audioEnhancement === true,
        maxClipsPerProject: limits.maxClipsPerProject || 5,
        maxSourceDurationMin: limits.maxSourceDurationMin || 30
    };
}

// ============================================================
// Online License Server Sync
// ============================================================

/**
 * Send request to online license server (fire-and-forget for sync, await for critical)
 */
function serverRequest(path, method = 'POST', body = null, isAdmin = false) {
    if (!LICENSE_SERVER_URL) return Promise.resolve(null);

    return new Promise((resolve) => {
        try {
            const url = new URL('/api/' + path, LICENSE_SERVER_URL);
            const isHttps = url.protocol === 'https:';
            const lib = isHttps ? https : http;

            const headers = { 'Content-Type': 'application/json' };
            if (isAdmin && ADMIN_API_KEY) headers['x-admin-key'] = ADMIN_API_KEY;

            const req = lib.request({
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method,
                headers,
                timeout: 10000
            }, (res) => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); }
                    catch { resolve(null); }
                });
            });

            req.on('error', (err) => {
                console.warn(`[License] Online sync failed (${path}): ${err.message}`);
                resolve(null);
            });
            req.on('timeout', () => { req.destroy(); resolve(null); });

            if (body) req.write(JSON.stringify(body));
            req.end();
        } catch (err) {
            console.warn(`[License] Online sync error: ${err.message}`);
            resolve(null);
        }
    });
}

/**
 * Sync activation to online server (background, non-blocking)
 */
function syncActivationOnline(key, machineId) {
    if (!LICENSE_SERVER_URL) return;
    serverRequest('activate', 'POST', {
        key,
        machine_id: machineId,
        machine_name: os.hostname(),
        app_version: require('../../package.json').version || '1.0.0'
    }).then(result => {
        if (result) {
            console.log(`[License] Online sync: activation reported for ${key.substring(0, 9)}...`);
        }
    }).catch(() => { });
}

/**
 * Sync deactivation to online server (background)
 */
function syncDeactivationOnline(key, machineId) {
    if (!LICENSE_SERVER_URL) return;
    serverRequest('deactivate', 'POST', {
        key,
        machine_id: machineId
    }).then(result => {
        if (result) {
            console.log(`[License] Online sync: deactivation reported`);
        }
    }).catch(() => { });
}

/**
 * Validate license against online server (heartbeat)
 * Called periodically to check for revocation / expiry updates
 * @returns {object|null} server response or null if offline
 */
async function validateOnline() {
    if (!LICENSE_SERVER_URL) return null;

    const licenseKey = get('SELECT value FROM settings WHERE key = ?', ['license_key']);
    if (!licenseKey?.value) return null;

    const machineId = getMachineId();
    const result = await serverRequest('validate', 'POST', {
        key: licenseKey.value,
        machine_id: machineId
    });

    if (!result) {
        console.log('[License] Online validation: server unreachable (offline mode)');
        return null;
    }

    if (result.valid === false) {
        // Key revoked or expired on server — deactivate locally
        if (result.revoked || result.expired) {
            console.warn(`[License] Online: key ${result.revoked ? 'REVOKED' : 'EXPIRED'} — deactivating locally`);
            deactivateLicense();
            return { valid: false, reason: result.reason };
        }
    }

    if (result.valid === true) {
        console.log(`[License] Online validation: OK (${result.tier}, ${result.daysRemaining === -1 ? 'lifetime' : result.daysRemaining + 'd remaining'})`);
    }

    return result;
}

/**
 * Start periodic online validation (every 6 hours)
 */
let heartbeatInterval = null;
function startHeartbeat() {
    if (!LICENSE_SERVER_URL || heartbeatInterval) return;

    // Initial check after 30 seconds
    setTimeout(() => validateOnline(), 30000);

    // Then every 6 hours
    heartbeatInterval = setInterval(() => validateOnline(), 6 * 60 * 60 * 1000);
    console.log('[License] Heartbeat started (every 6 hours)');
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
    incrementProjectCount,
    getRenderLimits,
    validateOnline,
    startHeartbeat,
    serverRequest,
    TIER_LIMITS
};
