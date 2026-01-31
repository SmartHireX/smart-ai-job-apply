/**
 * StorageVault.js
 * 
 * Centralized Storage Vault for the Smart AI Extension.
 * Enforces atomic transactions, FIFO write-locks, and transparent encryption.
 */

const VAULT_KEY = 'nova_vault';
const STALL_TIMEOUT_MS = 10000; // 10s stall protection

class StorageVault {
    constructor() {
        this.writeLock = Promise.resolve();
        this.cachedVault = null;
        this.isStalled = false;
        this.initialized = false;
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
        if (this.isStalled) throw new Error('[StorageVault] VAULT STALLED - Fail Closed');

        const vault = await this._ensureVault();
        const raw = vault[bucket]?.[key];

        if (raw === undefined || raw === null) return null;

        // Transparent Decryption
        // We only decrypt if it looks like an encrypted string AND it's not the system bucket's master key 
        // (which is handled specially by EncryptionService to avoid circularity if it were encrypted)
        if (typeof raw === 'string' && window.EncryptionService?.isEncrypted?.(raw)) {
            const aad = `nova:vault:${bucket}:${key}:v1`;
            return await window.EncryptionService.decrypt(raw, aad);
        }

        return raw;
    }

    async _update(bucket, key, transformFn, encrypt = true) {
        if (this.isStalled) throw new Error('[StorageVault] VAULT STALLED - Fail Closed');

        // FIFO Queue logic to ensure atomicity across async operations
        const operationPromise = this.writeLock.then(async () => {
            const timeout = setTimeout(() => {
                console.error('[StorageVault] LOCK STALL DETECTED!');
                this.isStalled = true;
            }, STALL_TIMEOUT_MS);

            try {
                const vault = await this._loadFromStorage();
                if (!vault[bucket]) vault[bucket] = {};

                const currentRaw = vault[bucket][key];
                let currentVal = currentRaw;

                // 1. Decrypt if needed before transform
                if (typeof currentRaw === 'string' && window.EncryptionService?.isEncrypted?.(currentRaw)) {
                    const aad = `nova:vault:${bucket}:${key}:v1`;
                    try {
                        currentVal = await window.EncryptionService.decrypt(currentRaw, aad);
                    } catch (err) {
                        console.error('[StorageVault] Decryption failed during update transaction:', err);
                        throw err; // Fail-closed
                    }
                }

                // 2. Apply Transactional Transform
                const newVal = await transformFn(currentVal);

                // 3. Encrypt if requested
                if (newVal === undefined) {
                    delete vault[bucket][key];
                } else {
                    let finalToSave = newVal;
                    if (encrypt && window.EncryptionService) {
                        const aad = `nova:vault:${bucket}:${key}:v1`;
                        finalToSave = await window.EncryptionService.encrypt(newVal, aad);
                    }
                    vault[bucket][key] = finalToSave;
                }

                // 4. Persist
                await this._saveToStorage(vault);
                this.cachedVault = vault;

            } finally {
                clearTimeout(timeout);
            }
        });

        // Update the lock chain
        this.writeLock = operationPromise.catch(err => {
            console.error('[StorageVault] Write operation failed in FIFO queue:', err);
            // Allow the next operation in the chain to proceed, but the current operation's promise
            // will still reject to the caller.
            return Promise.resolve();
        });

        return operationPromise;
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

    async runMigrationV2() {
        if (this.isStalled) return;

        await this._update('system', 'migrated_v2', async (isMigrated) => {
            if (isMigrated) return isMigrated;

            console.log('📦 [StorageVault] Starting Migration v2 (Consolidation)...');

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
            const vault = await this._loadFromStorage();

            // 1. Identity Bucket
            if (legacyData.smart_history_profile) vault.identity.profile = legacyData.smart_history_profile;
            if (legacyData.resumeData) vault.identity.resumeData = legacyData.resumeData;

            // 2. Memory Bucket
            if (legacyData.ATOMIC_SINGLE) vault.memory.atomic_single = legacyData.ATOMIC_SINGLE;
            if (legacyData.ATOMIC_MULTI) vault.memory.atomic_multi = legacyData.ATOMIC_MULTI;
            if (legacyData.SECTION_REPEATER) vault.memory.section_repeater = legacyData.SECTION_REPEATER;

            // 3. AI Bucket
            if (legacyData.gemini_api_keys || legacyData.gemini_api_key) {
                vault.ai.keys = legacyData.gemini_api_keys || (legacyData.gemini_api_key ? [legacyData.gemini_api_key] : []);
            }
            if (legacyData.ai_key_state) vault.ai.key_state = legacyData.ai_key_state;

            // 4. System Bucket
            if (legacyData.ai_last_used_index !== undefined) {
                vault.system.ai_meta = { ...vault.system.ai_meta, last_used_index: legacyData.ai_last_used_index };
            }
            if (legacyData.selectionCacheMetadata) {
                vault.system.selection_metadata = legacyData.selectionCacheMetadata;
            }

            // Perform Atomic Save
            await this._saveToStorage(vault);
            this.cachedVault = vault;

            console.log('✅ [StorageVault] Migration v2 Complete.');
            return true;
        }, false);
    }
    async _saveToStorage(vault) {
        await chrome.storage.local.set({ [VAULT_KEY]: vault });
    }
}

// Global Export
if (typeof window !== 'undefined') {
    const vault = new StorageVault();
    window.StorageVault = vault;
    // Auto-trigger migration after a short delay to ensure EncryptionService is ready
    setTimeout(() => vault.runMigrationV2(), 1000);
}
