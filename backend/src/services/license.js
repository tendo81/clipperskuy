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

const TRIAL_DAYS = 7;
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
        faceTrackBlur: false,
        podcast: false,
        audioEnhancement: false,
        maxClipsPerProject: 5,
        maxSourceDurationMin: 30,
        maxDailyExports: 3
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
        faceTrackBlur: false,
        podcast: true,
        audioEnhancement: true,
        maxClipsPerProject: Infinity,
        maxSourceDurationMin: Infinity,
        maxDailyExports: Infinity
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
        faceTrackBlur: true,
        podcast: true,
        audioEnhancement: true,
        maxClipsPerProject: Infinity,
        maxSourceDurationMin: Infinity,
        maxDailyExports: Infinity
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
        faceTrackBlur: true,
        podcast: true,
        audioEnhancement: true,
        maxClipsPerProject: Infinity,
        maxSourceDurationMin: Infinity,
        maxDailyExports: Infinity
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
 * Get trial info — manual activation version
 * Does NOT auto-start trial. User must call startTrial() explicitly.
 * If trial was never started, returns { started: false, expired: true }
 * 
 * On first call after install, checks online server for existing trial
 * (prevents reinstall abuse)
 */
let _trialSyncDone = false;

function getTrialInfo() {
    let trialRow = get('SELECT value FROM settings WHERE key = ?', ['trial_started_at']);

    // On first call, check online server for existing trial (anti-abuse)
    if (!trialRow && !_trialSyncDone) {
        // Fire background sync — if server has a trial for this machine,
        // it will be written to local DB for next call
        syncTrialOnline().catch(e => console.warn('[License] Trial online sync failed:', e.message));
        _trialSyncDone = true;

        // No trial started yet
        return {
            started: false,
            startedAt: null,
            daysElapsed: 0,
            daysRemaining: 0,
            totalDays: TRIAL_DAYS,
            expired: true  // treat as expired so tier stays 'free'
        };
    }

    if (!trialRow) {
        return {
            started: false,
            startedAt: null,
            daysElapsed: 0,
            daysRemaining: 0,
            totalDays: TRIAL_DAYS,
            expired: true
        };
    }

    const startedAt = new Date(trialRow.value);
    const now = new Date();
    const elapsed = Math.floor((now - startedAt) / (1000 * 60 * 60 * 24));
    const remaining = Math.max(0, TRIAL_DAYS - elapsed);

    return {
        started: true,
        startedAt: trialRow.value,
        daysElapsed: elapsed,
        daysRemaining: remaining,
        totalDays: TRIAL_DAYS,
        expired: remaining <= 0
    };
}

/**
 * Manually start trial — called when user clicks "Start Trial" button
 * Registers on online server first (anti-abuse), then saves locally
 * Returns { success, trial } or { success: false, reason }
 */
async function startTrial() {
    const machineId = getMachineId();
    const machineName = os.hostname();

    // Check if trial already started locally
    const existing = get('SELECT value FROM settings WHERE key = ?', ['trial_started_at']);
    if (existing) {
        const info = getTrialInfo();
        return { success: false, reason: 'Trial sudah pernah diaktifkan', ...info };
    }

    // Check online server
    if (LICENSE_SERVER_URL) {
        try {
            const checkUrl = `${LICENSE_SERVER_URL}/api/trial?machine_id=${machineId}`;
            const checkRes = await fetch(checkUrl, { signal: AbortSignal.timeout(8000) });
            if (checkRes.ok) {
                const checkData = await checkRes.json();
                if (checkData.has_trial) {
                    // Server says this machine already had a trial!
                    // Save server's start date locally (so it shows as expired)
                    run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('trial_started_at', ?, CURRENT_TIMESTAMP)", [checkData.started_at]);
                    console.log(`[License] Trial already used on this machine (server record: ${checkData.started_at})`);

                    return {
                        success: false,
                        reason: checkData.expired
                            ? 'Trial 7 hari sudah habis di perangkat ini. Upgrade ke Pro untuk fitur lengkap!'
                            : 'Trial sudah aktif di perangkat ini',
                        startedAt: checkData.started_at,
                        daysElapsed: checkData.days_elapsed,
                        daysRemaining: checkData.days_remaining,
                        totalDays: checkData.trial_days,
                        expired: checkData.expired,
                        notStarted: false
                    };
                }
            }
        } catch (e) {
            console.warn('[License] Online trial check failed, proceeding locally:', e.message);
        }
    }

    // No existing trial — start new one
    const now = new Date().toISOString();
    run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('trial_started_at', ?, CURRENT_TIMESTAMP)", [now]);
    console.log(`[License] ✅ Trial started: ${TRIAL_DAYS} days from ${now}`);

    // Register on server (non-blocking)
    if (LICENSE_SERVER_URL) {
        fetch(`${LICENSE_SERVER_URL}/api/trial`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ machine_id: machineId, machine_name: machineName }),
            signal: AbortSignal.timeout(5000)
        }).then(r => r.json())
            .then(d => console.log(`[License] Trial registered on server: ${d.started_at}`))
            .catch(e => console.warn('[License] Failed to register trial online:', e.message));
    }

    return {
        success: true,
        message: `Trial ${TRIAL_DAYS} hari dimulai! Nikmati semua fitur premium.`,
        startedAt: now,
        daysElapsed: 0,
        daysRemaining: TRIAL_DAYS,
        totalDays: TRIAL_DAYS,
        expired: false,
        notStarted: false
    };
}

/**
 * Sync trial with online server (anti-abuse)
 * - If server has trial record for this machine → use server's start date (prevents reinstall reset)
 * - If server has NO record → register this machine's trial on server
 */
async function syncTrialOnline() {
    if (!LICENSE_SERVER_URL) return;
    const machineId = getMachineId();
    const machineName = os.hostname();

    try {
        // Check if server already has a trial for this machine
        const checkUrl = `${LICENSE_SERVER_URL}/api/trial?machine_id=${machineId}`;
        const checkRes = await fetch(checkUrl, {
            signal: AbortSignal.timeout(5000)
        });

        if (!checkRes.ok) throw new Error(`Server returned ${checkRes.status}`);
        const checkData = await checkRes.json();

        if (checkData.has_trial) {
            // Server already has a trial record — use SERVER's start date
            // This prevents reinstall abuse: even after deleting local DB, server remembers
            const serverStartDate = checkData.started_at;
            const localRow = get('SELECT value FROM settings WHERE key = ?', ['trial_started_at']);

            if (!localRow || localRow.value !== serverStartDate) {
                run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('trial_started_at', ?, CURRENT_TIMESTAMP)", [serverStartDate]);
                console.log(`[License] Trial synced from server: started ${serverStartDate} (${checkData.days_remaining} days remaining)`);

                if (checkData.expired) {
                    console.log('[License] ⚠ Trial already expired (server record)');
                }
            }
        } else {
            // No server record — register this trial on the server
            const regRes = await fetch(`${LICENSE_SERVER_URL}/api/trial`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ machine_id: machineId, machine_name: machineName }),
                signal: AbortSignal.timeout(5000)
            });

            if (regRes.ok) {
                const regData = await regRes.json();
                console.log(`[License] Trial registered on server: ${regData.started_at}`);
                // Use server's timestamp for consistency
                if (regData.started_at) {
                    run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('trial_started_at', ?, CURRENT_TIMESTAMP)", [regData.started_at]);
                }
            }
        }

        _trialSyncDone = true;
    } catch (e) {
        console.warn('[License] Trial online sync failed (will retry next launch):', e.message);
        // Offline = use local data, less secure but functional
    }
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

    // Trial check: if no license and trial has started but not expired, use trial tier
    if (tier === 'free' && trial.started && !trial.expired) {
        tier = 'trial';
        status = 'trial';
        daysRemaining = trial.daysRemaining;
        const trialEnd = new Date(trial.startedAt);
        trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);
        expiresAt = trialEnd.toISOString();
    }

    const rawLimits = TIER_LIMITS[tier] || TIER_LIMITS.free;
    // Convert Infinity to -1 for JSON-safe serialization
    const safeLimits = Object.fromEntries(
        Object.entries(rawLimits).map(([k, v]) => [k, v === Infinity ? -1 : v])
    );

    return {
        status,          // 'free' | 'trial' | 'licensed'
        tier,            // 'free' | 'trial' | 'pro' | 'enterprise'
        licenseKey: licenseKey?.value || null,
        activatedAt: licenseActivatedAt?.value || null,
        expiresAt,       // null = lifetime or no license
        daysRemaining,   // -1 = lifetime, null = no license, number = days left
        trial,
        machineId,
        limits: safeLimits
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

    // Satu-satunya sumber kebenaran: database lokal (sudah dikonfirmasi server)
    // Signature-based validation DIHAPUS — mencegah key tidak resmi lolos
    const dbKey = get('SELECT * FROM license_keys WHERE license_key = ?', [upperKey]);

    if (dbKey) {
        if (dbKey.status === 'revoked') {
            return { valid: false, reason: 'License key ini telah dicabut (revoked).' };
        }
        if (dbKey.status === 'expired' || (dbKey.expires_at && new Date() > new Date(dbKey.expires_at))) {
            // Key sudah expired — TOLAK, jangan auto-renew
            run("UPDATE license_keys SET status = 'expired' WHERE id = ?", [dbKey.id]);
            return { valid: false, reason: 'License key sudah expired. Hubungi admin untuk perpanjang.' };
        }
        return { valid: true, tier: dbKey.tier || 'pro', source: 'database', expires_at: dbKey.expires_at || null, duration_days: dbKey.duration_days || 0 };
    }

    // Key tidak ada di DB lokal → harus validasi online dulu (dilakukan saat aktivasi)
    return { valid: false, reason: 'License key tidak ditemukan. Pastikan key yang dimasukkan benar atau belum pernah diaktifkan di perangkat ini.', needsOnlineCheck: true };
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
async function activateLicense(key) {
    const upperKey = key.toUpperCase().trim();
    const localValidation = validateLicenseKey(upperKey);

    // Jika sudah ada di DB lokal dan valid → izinkan (sudah pernah dikonfirmasi server)
    if (localValidation.valid && localValidation.source === 'database') {
        console.log(`[License] Key ditemukan di DB lokal: ${upperKey.substring(0, 9)}...`);
        return _finishActivation(upperKey, localValidation);
    }

    // Jika tidak ada di DB lokal → WAJIB konfirmasi online server
    // Ini blokir key lama yang tidak terdaftar (diberikan gratis, dll)
    if (!LICENSE_SERVER_URL) {
        return { valid: false, reason: 'License server tidak terkonfigurasi. Hubungi admin.' };
    }

    console.log(`[License] Key tidak di DB lokal, cek ke server: ${upperKey.substring(0, 9)}...`);
    let serverResult = null;
    try {
        serverResult = await serverRequest('activate', 'POST', {
            key: upperKey,
            machine_id: getMachineId(),
            machine_name: os.hostname(),
            app_version: require('../../package.json').version || '1.0.0'
        });
    } catch (e) {
        console.warn('[License] Server request failed:', e.message);
    }

    if (!serverResult) {
        return { valid: false, reason: 'Tidak dapat terhubung ke server lisensi. Periksa koneksi internet dan coba lagi.' };
    }

    // Server harus konfirmasi key valid
    const serverValid = serverResult.valid === true || serverResult.success === true
        || serverResult.status === 'active' || serverResult.activated === true;

    if (!serverValid) {
        const reason = serverResult.reason || serverResult.error || serverResult.message || 'License key tidak terdaftar di server.';
        console.log(`[License] Server menolak key: ${reason}`);
        return { valid: false, reason };
    }

    // Server konfirmasi valid — simpan ke DB lokal untuk penggunaan offline
    const serverValidation = {
        valid: true,
        tier: serverResult.tier || 'pro',
        source: 'server',
        expires_at: serverResult.expires_at || null,
        duration_days: serverResult.duration_days || serverResult.durationDays || 0
    };

    // Insert ke local DB
    const keyId = require('crypto').randomUUID();
    const durationDays = serverValidation.duration_days || 0;
    let keyExpiresAt = serverValidation.expires_at;
    if (!keyExpiresAt && durationDays > 0) {
        keyExpiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
    }
    run(`INSERT OR IGNORE INTO license_keys (id, license_key, tier, status, duration_days, expires_at, max_activations, created_at)
         VALUES (?, ?, ?, 'active', ?, ?, 1, CURRENT_TIMESTAMP)`,
        [keyId, upperKey, serverValidation.tier, durationDays, keyExpiresAt]);

    console.log(`[License] ✅ Key dikonfirmasi server dan disimpan ke DB: ${upperKey.substring(0, 9)}...`);
    return _finishActivation(upperKey, serverValidation);
}

/**
 * Internal: Simpan aktivasi ke settings DB
 */
function _finishActivation(upperKey, validation) {
    const machineId = getMachineId();
    const now = new Date().toISOString();
    const dbKey = get('SELECT * FROM license_keys WHERE license_key = ?', [upperKey]);

    if (dbKey) {
        run('INSERT OR IGNORE INTO license_activations (license_key_id, machine_id, activated_at) VALUES (?, ?, ?)',
            [dbKey.id, machineId, now]);
        run(`UPDATE license_keys SET machine_id = ?, activated_at = ?, activated_by = ?, status = 'active' WHERE license_key = ?`,
            [machineId, now, os.hostname(), upperKey]);
    }

    let expiresAt = validation.expires_at || null;
    const durationDays = validation.duration_days || 0;
    if (!expiresAt && durationDays > 0) {
        expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
    }

    run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', ['license_key', upperKey]);
    run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', ['license_tier', validation.tier]);
    run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', ['license_activated_at', now]);
    run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', ['license_machine_id', machineId]);
    if (expiresAt) {
        run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', ['license_expires_at', expiresAt]);
    } else {
        run('DELETE FROM settings WHERE key = ?', ['license_expires_at']);
    }
    run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', ['license_duration_days', String(durationDays)]);

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
    if (status.limits.maxProjects === -1 || status.limits.maxProjects === Infinity) return { allowed: true };

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
    run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('total_projects_created', ?, CURRENT_TIMESTAMP)",
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

    // Helper: convert Infinity to -1 for JSON-safe serialization
    // (JSON.stringify(Infinity) === 'null' which breaks frontend checks)
    const toJsonSafe = (v) => (v === Infinity ? -1 : (v || 0));

    return {
        tier: effectiveTier,
        maxResolution: limits.maxExportResolution || 720,
        watermarkRequired: limits.watermarkRequired !== false,
        batchExportAllowed: limits.batchExport === true,
        gpuAllowed: limits.gpuAccel === true,
        faceTrackAllowed: limits.faceTrack === true,
        faceTrackBlurAllowed: limits.faceTrackBlur === true,
        podcastAllowed: limits.podcast === true,
        audioEnhancementAllowed: limits.audioEnhancement === true,
        // -1 means unlimited (Infinity cannot be JSON-serialized)
        maxClipsPerProject: toJsonSafe(limits.maxClipsPerProject) || 5,
        maxSourceDurationMin: toJsonSafe(limits.maxSourceDurationMin) || 30,
        maxDailyExports: toJsonSafe(limits.maxDailyExports) || 3
    };
}

/**
 * Check if user can still export today (daily limit for free tier)
 * Returns { allowed, used, max, message }
 */
function checkDailyExportLimit() {
    const status = getLicenseStatus();
    const previewFree = get('SELECT value FROM settings WHERE key = ?', ['preview_free_tier']);
    const effectiveTier = (previewFree?.value === 'true') ? 'free' : status.tier;
    const limits = TIER_LIMITS[effectiveTier] || TIER_LIMITS.free;
    const maxDaily = limits.maxDailyExports || 3;

    if (maxDaily === Infinity) return { allowed: true, used: 0, max: -1 };

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const counterRow = get('SELECT value FROM settings WHERE key = ?', ['daily_export_counter']);
    const dateRow = get('SELECT value FROM settings WHERE key = ?', ['daily_export_date']);

    let used = 0;
    if (dateRow?.value === today && counterRow?.value) {
        used = parseInt(counterRow.value, 10) || 0;
    }

    return {
        allowed: used < maxDaily,
        used,
        max: maxDaily,
        message: used >= maxDaily
            ? `Batas export harian tercapai (${maxDaily}/hari). Upgrade ke Pro untuk unlimited!`
            : null
    };
}

/**
 * Increment daily export counter (call after successful render)
 */
function incrementDailyExport() {
    const today = new Date().toISOString().split('T')[0];
    const dateRow = get('SELECT value FROM settings WHERE key = ?', ['daily_export_date']);

    if (dateRow?.value !== today) {
        // New day — reset counter
        run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('daily_export_date', ?, CURRENT_TIMESTAMP)", [today]);
        run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('daily_export_counter', '1', CURRENT_TIMESTAMP)");
    } else {
        const counterRow = get('SELECT value FROM settings WHERE key = ?', ['daily_export_counter']);
        const current = counterRow ? parseInt(counterRow.value, 10) : 0;
        run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('daily_export_counter', ?, CURRENT_TIMESTAMP)",
            [String(current + 1)]);
    }
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
    startTrial,
    getLicenseStatus,
    validateLicenseKey,
    activateLicense,
    deactivateLicense,
    isFeatureAllowed,
    canCreateProject,
    incrementProjectCount,
    getRenderLimits,
    checkDailyExportLimit,
    incrementDailyExport,
    validateOnline,
    startHeartbeat,
    serverRequest,
    TIER_LIMITS
};
