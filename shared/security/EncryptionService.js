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
    STORAGE_KEY: 'nova_master_manager',
    STATS_KEY: 'nova_crypto_stats'
};

/**
 * Centralized AAD Construction
 */
const AAD = {
    entity: (store) => `nova:entity:${store}:v1`,
    cache: (name) => `nova:cache:${name}:v1`,
    aiKey: () => `nova:ai:gemini_api_key_item:v1`,
    internal: () => `nova:internal:test:v1`
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

                // Load key into WebCrypto
                this.masterKey = await crypto.subtle.importKey(
                    'jwk',
                    activeKeyData.jwk,
                    { name: CONFIG.ALGORITHM, length: CONFIG.KEY_LENGTH },
                    false, // Not exportable after load
                    ['encrypt', 'decrypt']
                );

                // Integrity Self-Test
                await this._runSelfTest();

                this.isReady = true;
                return true;
            } catch (error) {
                console.error('❌ [EncryptionService] FAST-FAIL: Initialization aborted.', error);
                throw error; // Fail closed
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
     * Check if string is encrypted
     */
    isEncrypted(val) {
        return typeof val === 'string' && val.startsWith(CONFIG.PREFIX);
    }

    // --- INTERNAL ---

    async _bootstrapManager() {
        const key = await crypto.subtle.generateKey(
            { name: CONFIG.ALGORITHM, length: CONFIG.KEY_LENGTH },
            true, // Exportable for storage
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

        const vault = globalThis.StorageVault || (typeof StorageVault !== 'undefined' ? StorageVault : null);
        if (vault) {
            await vault.bucket('system').set('master_manager', manager, false);
        } else {
            await chrome.storage.local.set({ 'nova_master_manager_legacy': manager });
        }
        return manager;
    }

    async _getManagerFromStorage() {
        const vault = globalThis.StorageVault || (typeof StorageVault !== 'undefined' ? StorageVault : null);
        if (vault) {
            return await vault.bucket('system').get('master_manager');
        }
        const res = await chrome.storage.local.get(CONFIG.STORAGE_KEY);
        return res[CONFIG.STORAGE_KEY];
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

        await window.StorageVault.bucket('system').update('stats', async (current) => {
            const stats = current || { aadMismatchCount: 0, corruptionCount: 0, oversizedCount: 0 };
            stats[key] = (stats[key] || 0) + 1;
            return stats;
        }, false);
    }

    /**
     * Run a global migration of all sensitive stores
     * This forces a Read -> Encrypt -> Save cycle for legacy data.
     */
    async runGlobalMigration() {
        if (!this.isReady) await this.init();

        const marker = await chrome.storage.local.get('nova_encryption_migrated');
        if (marker.nova_encryption_migrated) return;

        console.log('🛡️ [EncryptionService] Starting One-Time Global Migration...');

        try {
            // 1. Resume Manager (resumeData)
            if (window.ResumeManager && window.ResumeManager.getResumeData) {
                const resume = await window.ResumeManager.getResumeData();
                if (resume) await window.ResumeManager.saveResumeData(resume);
            }

            // 2. Entity Store (smart_history_profile)
            if (window.EntityStore && window.EntityStore.init) {
                // EntityStore.init() already has migration logic that calls save()
                const store = new window.EntityStore();
                await store.init();
            }

            // 3. AI Client (gemini_api_keys)
            if (window.AIClient && window.AIClient.getApiKeys) {
                const keys = await window.AIClient.getApiKeys();
                if (keys.length > 0) {
                    const model = await window.AIClient.getStoredModel();
                    await window.AIClient.saveApiKeys(keys, model);
                }
            }

            // 4. Global Memory (ATOMIC_SINGLE)
            const memory = globalThis.GlobalMemory || (typeof GlobalMemory !== 'undefined' ? GlobalMemory : null);
            if (memory && memory.getCache) {
                const cache = await memory.getCache();
                if (Object.keys(cache).length > 0) {
                    await memory.updateCache({}); // Empty update triggers re-save of current
                }
            }

            // Set Marker
            await chrome.storage.local.set({ 'nova_encryption_migrated': true });
            console.log('✅ [EncryptionService] Global Migration Complete.');

        } catch (err) {
            console.error('❌ [EncryptionService] Global Migration FAILED:', err);
        }
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
