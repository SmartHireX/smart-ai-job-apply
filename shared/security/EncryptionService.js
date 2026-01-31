/**
 * EncryptionService.js (v3 - Enterprise Hardened)
 * 
 * Secure storage subsystem for the Smart AI Extension.
 * Handles AES-256-GCM encryption with AAD binding and versioned key management.
 */

// --- CUSTOM ERROR TYPES ---
class EncryptionError extends Error { constructor(msg) { super(msg); this.name = 'EncryptionError'; } }
class EncryptedDataCorruptionError extends EncryptionError { constructor(msg) { super(msg || 'Malformed encrypted payload structure'); this.name = 'EncryptedDataCorruptionError'; } }
class AADMismatchError extends EncryptionError { constructor(msg) { super(msg || 'AAD binding mismatch - possible swap attack or corruption'); this.name = 'AADMismatchError'; } }
class EncryptedPayloadTooLargeError extends EncryptionError { constructor(msg) { super(msg || 'Payload exceeds safety limits'); this.name = 'EncryptedPayloadTooLargeError'; } }

const CONFIG = {
    ALGORITHM: 'AES-GCM',
    KEY_LENGTH: 256,
    IV_LENGTH: 12,
    PREFIX: 'enc:v1:',
    MAX_SIZE: 5 * 1024 * 1024, // 5MB safety cap
    STATS_KEY: 'nova_crypto_stats'
};

/**
 * Centralized AAD Construction
 */
const AAD = {
    entity: (store) => `nova:vault:identity:${store}:v1`,
    cache: (name) => `nova:vault:memory:${name}:v1`,
    aiKey: () => `nova:vault:ai:keys:v1`,
    internal: () => `nova:vault:system:test:v1`,

    // Legacy Support (pre-v4)
    legacy: {
        entity: (store) => `nova:entity:${store}:v1`,
        cache: (name) => `nova:cache:${name}:v1`,
        aiKey: () => `nova:ai:gemini_api_key_item:v1`
    }
};

class EncryptionService {
    constructor() {
        this.masterKey = null; // Decrypted CryptoKey
        this.activeKeyId = null;
        this.isReady = false;
        this.initPromise = null;
    }

    /**
     * Initialize the service
     */
    async init() {
        if (this.isReady) return true;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            try {
                let manager = await this._getManagerFromStorage();

                if (!manager || !manager.activeKeyId) {
                    console.log('🛡️ [EncryptionService] Bootstrapping new Master Key Manager...');
                    manager = await this._bootstrapManager();
                }

                this.activeKeyId = manager.activeKeyId;
                const activeKeyData = manager.keys[this.activeKeyId];

                if (!activeKeyData) throw new EncryptionError('Active key missing from manager');

                // 4. Load key into WebCrypto
                this.masterKey = await crypto.subtle.importKey(
                    'jwk',
                    activeKeyData.jwk,
                    { name: CONFIG.ALGORITHM, length: CONFIG.KEY_LENGTH },
                    false, // Not exportable after load
                    ['encrypt', 'decrypt']
                );

                // 5. Allow recursive calls during self-test (Important to avoid deadlock)
                this.isReady = true;

                // 6. Integrity Self-Test
                try {
                    await this._runSelfTest();
                    console.log('🛡️ [EncryptionService] System ready.');
                } catch (error) {
                    this.isReady = false;
                    throw error;
                }

                return true;
            } catch (error) {
                this.initPromise = null; // Allow retry on failure
                this.isReady = false;
                console.error('❌ [EncryptionService] Initialization failed.', error);
                throw error;
            }
        })();

        return this.initPromise;
    }

    /**
     * Encrypt data with GCM + AAD
     */
    async encrypt(data, context) {
        if (!this.isReady) await this.init();
        if (!context) throw new EncryptionError('Context (AAD) is required');

        try {
            const plaintext = new TextEncoder().encode(JSON.stringify(data));
            if (plaintext.length > CONFIG.MAX_SIZE) throw new EncryptedPayloadTooLargeError();

            const iv = crypto.getRandomValues(new Uint8Array(CONFIG.IV_LENGTH));
            const aad = new TextEncoder().encode(context);

            const ciphertext = await crypto.subtle.encrypt(
                { name: CONFIG.ALGORITHM, iv, additionalData: aad },
                this.masterKey,
                plaintext
            );

            // Construct Envelope
            const envelope = {
                v: 1,
                kid: this.activeKeyId,
                iv: this._bufToBase64(iv),
                ct: this._bufToBase64(ciphertext)
            };

            const serialized = this._bufToBase64(new TextEncoder().encode(JSON.stringify(envelope)));
            return `${CONFIG.PREFIX}${serialized}`;

        } catch (e) {
            console.error('[EncryptionService] Encryption failed:', e);
            throw e;
        }
    }

    /**
     * Decrypt data with GCM + AAD validation
     */
    async decrypt(token, context) {
        if (!this.isReady) await this.init();
        if (!context) throw new EncryptionError('Context (AAD) is required');

        // 1. Structural Check
        if (!token || typeof token !== 'string' || !token.startsWith(CONFIG.PREFIX)) {
            // This might be legacy data - caller should handle migration, 
            // but if they explicitly asked for decrypt on a non-enc string, it's an error.
            throw new EncryptedDataCorruptionError('Not a valid encrypted token');
        }

        try {
            const raw = token.substring(CONFIG.PREFIX.length);
            const envelopeStr = new TextDecoder().decode(this._base64ToBuf(raw));
            const envelope = JSON.parse(envelopeStr);

            // 2. Strict Envelope Validation
            if (envelope.v !== 1 || !envelope.iv || !envelope.ct) {
                this._incrementStat('corruptionCount');
                throw new EncryptedDataCorruptionError();
            }

            const iv = this._base64ToBuf(envelope.iv);
            const ct = this._base64ToBuf(envelope.ct);
            const aad = new TextEncoder().encode(context);

            // 3. Decrypt
            const decrypted = await crypto.subtle.decrypt(
                { name: CONFIG.ALGORITHM, iv, additionalData: aad },
                this.masterKey,
                ct
            );

            return JSON.parse(new TextDecoder().decode(decrypted));

        } catch (e) {
            if (e.name === 'OperationError') {
                this._incrementStat('aadMismatchCount');
                throw new AADMismatchError();
            }
            throw e;
        }
    }

    /**
     * Recovery Helper: Attempt decryption with multiple possible AADs (for migration)
     */
    async decryptWithFallback(token, primaryContext, fallbackContexts = []) {
        try {
            return await this.decrypt(token, primaryContext);
        } catch (e) {
            if (!(e instanceof AADMismatchError)) throw e;

            for (const context of fallbackContexts) {
                try {
                    return await this.decrypt(token, context);
                } catch (err) {
                    if (!(err instanceof AADMismatchError)) throw err;
                }
            }
            throw e; // Re-throw if all failed
        }
    }

    /**
     * Check if string is encrypted
     */
    isEncrypted(val) {
        return typeof val === 'string' && val.startsWith(CONFIG.PREFIX);
    }

    // --- INTERNAL ---

    async _bootstrapManager() {
        const key = await crypto.subtle.generateKey(
            { name: CONFIG.ALGORITHM, length: CONFIG.KEY_LENGTH },
            true, // Exportable for internal recovery
            ['encrypt', 'decrypt']
        );
        const jwk = await crypto.subtle.exportKey('jwk', key);

        const manager = {
            activeKeyId: 'key-v1',
            createdAt: Date.now(),
            keys: {
                'key-v1': {
                    v: 1,
                    alg: CONFIG.ALGORITHM,
                    createdAt: Date.now(),
                    status: 'active',
                    jwk: jwk
                }
            }
        };

        // Improved Isolation: Store Master Key in a DEDICATED storage key, separate from the Vault
        await chrome.storage.local.set({ 'nova_master_lock': manager });
        return manager;
    }

    async _getManagerFromStorage() {
        // 1. Check Isolated Key (New Standard)
        const isolated = await chrome.storage.local.get('nova_master_lock');
        if (isolated.nova_master_lock) return isolated.nova_master_lock;

        // 2. Recovery: Check if it was accidentally put in the Vault system bucket
        const vault = globalThis.StorageVault || (typeof StorageVault !== 'undefined' ? StorageVault : null);
        if (vault) {
            const inVault = await vault.bucket('system').get('master_manager');
            if (inVault) {
                console.log('🛡️ [EncryptionService] Migrating Master Key from Vault to Isolated Storage...');
                await chrome.storage.local.set({ 'nova_master_lock': inVault });
                return inVault;
            }
        }

        // 2. Check Legacy Storage (Migration Path)
        const legacy = await chrome.storage.local.get(['nova_master_manager', 'master_manager']);
        const manager = legacy.nova_master_manager || legacy.master_manager;

        if (manager && manager.activeKeyId) {
            console.log('🛡️ [EncryptionService] Recovered Legacy Master Key Manager.');

            // Port to new vault immediately if possible
            if (vault) {
                await vault.bucket('system').set('master_manager', manager, false);
            }
            return manager;
        }

        return null;
    }

    async _runSelfTest() {
        const ping = `ping_${Date.now()}`;
        const aad = `nova:vault:system:ping:v1`;
        const enc = await this.encrypt(ping, aad);
        const dec = await this.decrypt(enc, aad);
        if (dec !== ping) throw new EncryptionError('Self-test integrity mismatch');
    }

    async _incrementStat(key) {
        const vault = globalThis.StorageVault || (typeof StorageVault !== 'undefined' ? StorageVault : null);
        if (!vault) return;

        await vault.bucket('system').update('stats', async (current) => {
            const stats = current || { aadMismatchCount: 0, corruptionCount: 0, oversizedCount: 0 };
            stats[key] = (stats[key] || 0) + 1;
            return stats;
        }, false);
    }

    _bufToBase64(buf) {
        return btoa(String.fromCharCode(...new Uint8Array(buf)));
    }

    _base64ToBuf(str) {
        return Uint8Array.from(atob(str), c => c.charCodeAt(0)).buffer;
    }
}

// Global Export
globalThis.EncryptionService = new EncryptionService();
globalThis.EncryptionAAD = AAD;
globalThis.EncryptedDataCorruptionError = EncryptedDataCorruptionError;
globalThis.AADMismatchError = AADMismatchError;
