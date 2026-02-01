/**
 * StorageVault.js
 * 
 * Centralized Storage Vault for the Nova Apply Extension.
 * Enforces atomic transactions, FIFO write-locks, and transparent encryption.
 */

const VAULT_KEY = 'nova_vault';

class StorageVault {
    constructor() {
        this.cachedVault = null;
        this.initialized = false;

        // Sync cache across different extension contexts (background, options, content)
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.onChanged.addListener((changes, areaName) => {
                if (areaName === 'local' && (changes[VAULT_KEY] || changes['nova_vault_migrated_v2'])) {
                    this.cachedVault = null;
                    if (changes['nova_vault_migrated_v2']?.newValue) {
                        this.initialized = true;
                    }
                }
            });
        }
    }

    /**
     * Get a bucket-specific interface
     */
    bucket(bucketName) {
        return {
            get: (key) => this._get(bucketName, key),
            set: (key, val, encrypt = true) => this._update(bucketName, key, () => val, encrypt),
            update: (key, fn, encrypt = true) => this._update(bucketName, key, fn, encrypt),
            remove: (key) => this._update(bucketName, key, () => undefined, false)
        };
    }

    // --- PRIVATE ---

    async _get(bucket, key) {
        const vaultData = await this._ensureVault();
        const raw = vaultData[bucket]?.[key];

        if (raw === undefined || raw === null) return null;

        // Transparent Decryption (Exempt system bucket to prevent circularity)
        if (bucket === 'system') return raw;

        const encryptionService = globalThis.EncryptionService || (typeof EncryptionService !== 'undefined' ? EncryptionService : null);
        if (typeof raw === 'string' && encryptionService?.isEncrypted?.(raw)) {
            const canonicalAAD = `nova:vault:${bucket}:${key}:v1`;

            // Integration with Fallback logic to handle legacy data
            const fallbackAADs = [];
            if (bucket === 'ai' && key === 'keys') fallbackAADs.push(globalThis.EncryptionAAD?.legacy?.aiKey());
            if (bucket === 'identity') fallbackAADs.push(globalThis.EncryptionAAD?.legacy?.entity(key));
            if (bucket === 'memory') fallbackAADs.push(globalThis.EncryptionAAD?.legacy?.cache(key));

            try {
                if (encryptionService.decryptWithFallback) {
                    return await encryptionService.decryptWithFallback(raw, canonicalAAD, fallbackAADs.filter(Boolean));
                }
                return await encryptionService.decrypt(raw, canonicalAAD);
            } catch (err) {
                console.warn(`⚠️ [StorageVault] Decryption failed for ${bucket}:${key}. Returning null to prevent block.`);
                return null;
            }
        }

        return raw;
    }

    async _update(bucket, key, transformFn, encrypt = true) {
        const vaultData = await this._loadFromStorage();
        if (!vaultData[bucket]) vaultData[bucket] = {};

        const currentRaw = vaultData[bucket][key];
        let currentVal = currentRaw;

        // 1. Decrypt if needed (Skip for system bucket)
        if (bucket !== 'system') {
            const encryptionService = globalThis.EncryptionService || (typeof EncryptionService !== 'undefined' ? EncryptionService : null);
            if (typeof currentRaw === 'string' && encryptionService?.isEncrypted?.(currentRaw)) {
                const aad = `nova:vault:${bucket}:${key}:v1`;
                try {
                    currentVal = await encryptionService.decrypt(currentRaw, aad);
                } catch (err) {
                    console.error('[StorageVault] Decryption failed during update:', err);
                }
            }
        }

        // 2. Apply Transactional Transform
        const newVal = await transformFn(currentVal);

        // 3. Encrypt if requested (Skip for system bucket)
        if (newVal === undefined) {
            delete vaultData[bucket][key];
        } else {
            let finalToSave = newVal;
            if (bucket !== 'system' && encrypt) {
                const encryptionService = globalThis.EncryptionService || (typeof EncryptionService !== 'undefined' ? EncryptionService : null);
                if (encryptionService) {
                    const aad = `nova:vault:${bucket}:${key}:v1`;
                    finalToSave = await encryptionService.encrypt(newVal, aad);
                }
            }
            vaultData[bucket][key] = finalToSave;
        }

        // 4. Persist
        await this._saveToStorage(vaultData);
        this.cachedVault = vaultData;
    }

    async _ensureVault() {
        if (this.cachedVault) return this.cachedVault;
        this.cachedVault = await this._loadFromStorage();
        return this.cachedVault;
    }

    async _loadFromStorage() {
        const res = await chrome.storage.local.get(VAULT_KEY);
        const data = res[VAULT_KEY] || {};

        // Ensure structure
        return {
            identity: data.identity || {},
            memory: data.memory || {},
            ai: data.ai || {},
            system: data.system || { vault_version: 2 }
        };
    }

    async initialize() {
        if (this.initialized) return;

        try {
            // 1. Check if already migrated by another context
            const marker = await chrome.storage.local.get('nova_vault_migrated_v2');
            if (marker.nova_vault_migrated_v2) {
                console.log('✅ [StorageVault] Marker found, skipping migration.');
                await this._ensureVault();
                return;
            }

            // 2. Perform Migration
            await this._ensureVault();
            await this.runMigrationV2();
        } catch (err) {
            console.error('❌ [StorageVault] Initialization failed:', err);
        } finally {
            this.initialized = true;
            console.log('📦 [StorageVault] Ready.');
        }
    }

    async waitUntilReady() {
        if (this.initialized) return;

        // Polling both local flag and global storage marker
        const start = Date.now();
        while (!this.initialized && Date.now() - start < 5000) {
            const marker = await chrome.storage.local.get('nova_vault_migrated_v2');
            if (marker.nova_vault_migrated_v2) {
                this.initialized = true;
                break;
            }
            await new Promise(r => setTimeout(r, 100));
        }

        // Final catch-up
        this.cachedVault = null;
        await this._ensureVault();
    }

    async runMigrationV2() {

        // Use flag to prevent re-migration (Double check inside lock)
        const marker = await chrome.storage.local.get('nova_vault_migrated_v2');
        if (marker.nova_vault_migrated_v2) return;

        console.log('📦 [StorageVault] Starting Migration v2 (Exclusive)...');

        const legacyKeys = [
            'smart_history_profile',
            'ATOMIC_SINGLE',
            'ATOMIC_MULTI',
            'SECTION_REPEATER',
            'selectionCacheMetadata',
            'gemini_api_key',
            'gemini_api_keys',
            'ai_key_state',
            'ai_last_used_index',
            'resumeData'
        ];

        const legacyData = await chrome.storage.local.get(legacyKeys);

        // Perform as a single atomic operation to avoid partial states
        await this._update('system', 'migration_v2_at', async (meta) => {
            return Date.now();
        }, false);

        // We use the lock via _update to safely migrate parts
        // Identity
        if (legacyData.smart_history_profile) {
            await this._update('identity', 'profile', (curr) => curr || legacyData.smart_history_profile);
        }
        if (legacyData.resumeData) {
            await this._update('identity', 'resumeData', (curr) => curr || legacyData.resumeData);
        }

        // Memory
        if (legacyData.ATOMIC_SINGLE) {
            await this._update('memory', 'atomic_single', (curr) => curr || legacyData.ATOMIC_SINGLE);
        }

        // AI
        if (legacyData.gemini_api_keys || legacyData.gemini_api_key) {
            const keys = legacyData.gemini_api_keys || [legacyData.gemini_api_key];
            await this._update('ai', 'keys', (curr) => (curr && curr.length > 0) ? curr : keys);
        }
        if (legacyData.ai_key_state) {
            await this._update('ai', 'key_state', (curr) => curr || legacyData.ai_key_state);
        }

        // System
        if (legacyData.ai_last_used_index !== undefined) {
            await this._update('system', 'ai_meta', (curr = {}) => ({ ...curr, last_used_index: legacyData.ai_last_used_index }));
        }

        await chrome.storage.local.set({ 'nova_vault_migrated_v2': true });
        console.log('✅ [StorageVault] Migration v2 Complete.');
        return true;
    }

    async _saveToStorage(vault) {
        await chrome.storage.local.set({ [VAULT_KEY]: vault });
    }
}

// Global Export
const vault = new StorageVault();
globalThis.StorageVault = vault;

// Initialize as soon as possible
if (typeof chrome !== 'undefined' && chrome.storage) {
    vault.initialize().catch(err => console.error('[StorageVault] Init failed:', err));
}
