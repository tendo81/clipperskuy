/**
 * Crypto utilities for license key generation & validation
 * HMAC signature ensures keys can't be forged
 */
const crypto = require('crypto');

const LICENSE_SECRET = process.env.LICENSE_SECRET || 'ClipperSkuy-2026-LicenseKey-Secret';

const TIER_CHAR = { 'pro': 'P', 'enterprise': 'E' };
const TIER_MAP = { 'P': 'pro', 'E': 'enterprise' };

const DURATION_CHAR = { 0: 'L', 3: 'D', 7: 'W', 14: 'F', 30: '1', 90: '3', 180: '6', 365: 'Y' };
const DURATION_MAP = { 'L': 0, 'D': 3, 'W': 7, 'F': 14, '1': 30, '3': 90, '6': 180, 'Y': 365 };

/**
 * Generate a signed license key
 * Format: AAAA-BBBB-TCMD-SSSS
 */
function generateKey(tier = 'pro', durationDays = 0) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const randChar = () => chars[Math.floor(Math.random() * chars.length)];
    const segment = () => { let s = ''; for (let i = 0; i < 4; i++) s += randChar(); return s; };

    const g1 = segment();
    const g2 = segment();

    const tChar = TIER_CHAR[tier] || 'P';
    let closestDur = 0;
    if (durationDays > 0) {
        const durKeys = Object.keys(DURATION_CHAR).map(Number).filter(d => d > 0).sort((a, b) => a - b);
        closestDur = durKeys[0];
        for (const d of durKeys) {
            if (durationDays >= d) closestDur = d;
        }
    }
    const dChar = DURATION_CHAR[closestDur] || 'L';
    const monthChar = String.fromCharCode('A'.charCodeAt(0) + new Date().getMonth());
    const g3 = `${tChar}${dChar}${monthChar}${randChar()}`;

    const payload = `${g1}-${g2}-${g3}`;
    const hmac = crypto.createHmac('sha256', LICENSE_SECRET).update(payload).digest('hex');
    const g4 = hmac.substring(0, 4).toUpperCase();

    return `${g1}-${g2}-${g3}-${g4}`;
}

/**
 * Verify a key's HMAC signature and decode tier/duration
 */
function verifyKeySignature(key) {
    const parts = key.split('-');
    if (parts.length !== 4) return { valid: false };

    const payload = `${parts[0]}-${parts[1]}-${parts[2]}`;
    const signature = parts[3];

    const hmac = crypto.createHmac('sha256', LICENSE_SECRET).update(payload).digest('hex');
    const expectedSig = hmac.substring(0, 4).toUpperCase();

    if (signature !== expectedSig) {
        return { valid: false, reason: 'Invalid license key signature' };
    }

    const tierChar = parts[2][0];
    const tier = TIER_MAP[tierChar];
    if (!tier) return { valid: false, reason: 'Invalid tier' };

    const durationChar = parts[2][1];
    const durationDays = DURATION_MAP[durationChar];

    return { valid: true, tier, duration_days: durationDays || 0 };
}

/**
 * Validate key format
 */
function isValidKeyFormat(key) {
    return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key);
}

module.exports = { generateKey, verifyKeySignature, isValidKeyFormat };
