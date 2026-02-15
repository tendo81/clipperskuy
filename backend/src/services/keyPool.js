/**
 * API Key Pool Manager
 * Manages multiple API keys with automatic rotation on rate limits
 */

class KeyPool {
    constructor() {
        // Track current key index for each provider
        this.currentIndex = {
            groq: 0,
            gemini: 0
        };
        // Track failed keys to skip them temporarily
        this.cooldowns = new Map(); // key -> timestamp when cooldown expires
    }

    /**
     * Parse comma-separated keys from settings
     */
    parseKeys(keyString) {
        if (!keyString) return [];
        return keyString
            .split(',')
            .map(k => k.trim())
            .filter(k => k.length > 0);
    }

    /**
     * Get the next available key for a provider
     * Skips keys that are in cooldown
     */
    getKey(provider, keyString) {
        const keys = this.parseKeys(keyString);
        if (keys.length === 0) return null;

        const now = Date.now();

        // Try each key starting from current index
        for (let attempt = 0; attempt < keys.length; attempt++) {
            const idx = (this.currentIndex[provider] + attempt) % keys.length;
            const key = keys[idx];

            // Check if key is in cooldown
            const cooldownUntil = this.cooldowns.get(key);
            if (cooldownUntil && now < cooldownUntil) {
                continue; // Skip this key, still in cooldown
            }

            // This key is available
            this.currentIndex[provider] = idx;
            return { key, index: idx, total: keys.length };
        }

        // All keys in cooldown — return the first one anyway (will retry later)
        const idx = this.currentIndex[provider] % keys.length;
        return { key: keys[idx], index: idx, total: keys.length };
    }

    /**
     * Mark a key as rate-limited (put on cooldown)
     * @param {string} key - The API key that was rate limited
     * @param {number} cooldownMs - How long to cooldown (default 60s)
     */
    markRateLimited(provider, key, cooldownMs = 60000) {
        this.cooldowns.set(key, Date.now() + cooldownMs);

        // Move to next key
        const keyString = this._lastKeyString?.[provider];
        if (keyString) {
            const keys = this.parseKeys(keyString);
            const currentIdx = keys.indexOf(key);
            if (currentIdx >= 0) {
                this.currentIndex[provider] = (currentIdx + 1) % keys.length;
            }
        }

        console.log(`[KeyPool] ${provider} key #${this.currentIndex[provider] + 1} rate limited, rotating to next key`);
    }

    /**
     * Mark a key as successful (clear cooldown)
     */
    markSuccess(key) {
        this.cooldowns.delete(key);
    }

    /**
     * Get all available keys for a provider with status
     */
    getKeyStatus(provider, keyString) {
        const keys = this.parseKeys(keyString);
        const now = Date.now();

        return keys.map((key, idx) => {
            const cooldownUntil = this.cooldowns.get(key);
            const inCooldown = cooldownUntil && now < cooldownUntil;
            const maskedKey = key.substring(0, 8) + '...' + key.substring(key.length - 4);

            return {
                index: idx + 1,
                maskedKey,
                active: idx === this.currentIndex[provider],
                inCooldown,
                cooldownRemaining: inCooldown ? Math.ceil((cooldownUntil - now) / 1000) : 0
            };
        });
    }

    /**
     * Store key string for rotation reference
     */
    setKeyString(provider, keyString) {
        if (!this._lastKeyString) this._lastKeyString = {};
        this._lastKeyString[provider] = keyString;
    }
}

// Singleton instance
const keyPool = new KeyPool();

module.exports = { keyPool };
