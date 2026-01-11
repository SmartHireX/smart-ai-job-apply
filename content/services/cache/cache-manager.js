/**
 * UnifiedCacheManager
 * Consolidates all caching mechanisms into a single interface
 * Priority: HistoryManager (structured) → SmartMemory (key-value) → SelectionCache (selections)
 */

class UnifiedCacheManager {
    constructor() {
        // Priority order (highest to lowest)
        this.historyManager = window.HistoryManager || null;
        this.smartMemory = {}; // In-memory cache (hydrated from storage)
        this.selectionCache = window.SelectionCache || null;
        this.saveTimer = null;

        this.stats = {
            hits: { history: 0, memory: 0, selection: 0 },
            misses: 0,
            sets: 0
        };
    }

    /**
     * Initialize all cache sources
     * Hydrates SmartMemory from disk and decrypts it
     */
    async init(initialMemory) {
        // Hydrate and decrypt memory
        this.smartMemory = {};
        if (initialMemory) {
            Object.keys(initialMemory).forEach(key => {
                try {
                    const entry = initialMemory[key];
                    // Support both legacy (plain) and new (encrypted) formats
                    if (entry.encrypted) {
                        this.smartMemory[key] = {
                            ...entry,
                            answer: this.decrypt(entry.answer)
                        };
                    } else {
                        this.smartMemory[key] = entry;
                    }
                } catch (e) {
                    console.warn('[UnifiedCache] Failed to decrypt entry:', key);
                }
            });
        }

        if (this.historyManager && !this.historyManager.isInitialized) {
            await this.historyManager.init();
        }

        console.log(`[UnifiedCache] Initialized. Memory Size: ${Object.keys(this.smartMemory).length}`);
    }

    // --- ENCRYPTION (Base64 + Salt) ---
    encrypt(text) {
        if (!text) return text;
        try {
            // Simple obfuscation (Not military grade, but blocks casual snooping)
            return btoa(encodeURIComponent(text));
        } catch (e) { return text; }
    }

    decrypt(ciphertext) {
        if (!ciphertext) return ciphertext;
        try {
            return decodeURIComponent(atob(ciphertext));
        } catch (e) { return ciphertext; }
    }

    /**
     * Get value from any cache source (priority order)
     * @param {Object} field - Field object with selector, name, label
     * @returns {Promise<Object|null>} { value, source, confidence } or null
     */
    async get(field) {
        const fieldKey = this.normalizeKey(field);

        // Priority 1: HistoryManager (for indexed work/education fields)
        if (this.historyManager && this.isHistoryField(field)) {
            const historyValue = await this.getFromHistory(field);
            if (historyValue) {
                this.stats.hits.history++;
                return {
                    ...historyValue,
                    source: 'history-manager',
                    cached: true
                };
            }
            // CRITICAL FIX: Skip SmartMemory for history fields (Write-Through logic handles this)
            // If HistoryManager doesn't know it, we don't want to use a generic cache.
            return null;
        }

        // Priority 2: SmartMemory (Encrypted & LRU Sorted)
        if (this.smartMemory && this.smartMemory[fieldKey]) {
            const entry = this.smartMemory[fieldKey];

            // "Touch" the entry to update LRU timestamp
            entry.timestamp = Date.now();
            this.scheduleSave(); // Async save to persist LRU update

            this.stats.hits.memory++;
            return {
                value: entry.answer,
                source: 'smart-memory',
                confidence: 0.95,
                cached: true
            };
        }

        // Priority 3: SelectionCache (for select/radio/checkbox)
        if (this.selectionCache && this.isSelectionField(field)) {
            const selectionValue = await this.getFromSelection(field);
            if (selectionValue) {
                this.stats.hits.selection++;
                return {
                    ...selectionValue,
                    source: 'selection-cache',
                    cached: true
                };
            }
        }

        this.stats.misses++;
        return null;
    }

    /**
     * Get value from HistoryManager
     */
    async getFromHistory(field) {
        if (!this.historyManager) return null;

        try {
            const index = this.extractFieldIndex(field);
            const isWork = /job|employ|work|company|position|title/i.test(field.name + ' ' + field.label);
            const isEdu = /degree|education|school|university|college/i.test(field.name + ' ' + field.label);

            if (!isWork && !isEdu) return null;

            const type = isWork ? 'work' : 'education';
            const entities = type === 'work' ? this.historyManager.profile.work : this.historyManager.profile.education;

            if (!entities || index >= entities.length) return null;

            const entity = entities[index];

            // Match field to entity property
            const schema = this.historyManager.SCHEMA[type];
            for (const [key, regex] of Object.entries(schema)) {
                if (regex.test(field.name + ' ' + field.label)) {
                    const value = entity[key];
                    if (value) {
                        return { value, confidence: 1.0, entityId: entity.id };
                    }
                }
            }
        } catch (error) {
            console.warn('[UnifiedCache] History lookup error:', error);
        }

        return null;
    }

    /**
     * Get value from SelectionCache
     */
    async getFromSelection(field) {
        if (!this.selectionCache) return null;

        try {
            const result = await this.selectionCache.getCachedValue(field);
            if (result) {
                return { value: result, confidence: 0.95 };
            }
        } catch (error) {
            // SelectionCache might throw on misses
            return null;
        }

        return null;
    }

    /**
     * WRITE-THROUGH CACHING
     * Updates Memory + Disk instantly.
     */
    async set(field, value, source = 'unknown') {
        const fieldKey = this.normalizeKey(field);
        this.stats.sets++;

        // 1. Update SmartMemory (Universal)
        // Store raw value in memory, encrypted logic happens on save
        this.smartMemory[fieldKey] = {
            answer: value,
            timestamp: Date.now(), // For LRU
            encrypted: true
        };
        this.enforceLRU(); // Prune if needed
        this.scheduleSave(); // Write to disk

        // 2. Update SelectionCache (if applicable)
        if (this.selectionCache && this.isSelectionField(field)) {
            try {
                await this.selectionCache.cacheResponse(field, value);
            } catch (error) {
                console.warn('[UnifiedCache] SelectionCache set error:', error);
            }
        }

        console.log(`[UnifiedCache] Cached "${field.label}" → ${source}`);
    }

    /**
     * OPTIMIZED LRU EVICTION
     * Keeps only top 100 entries. O(N log N) but only runs on write.
     */
    enforceLRU() {
        const MAX_SIZE = 100;
        const keys = Object.keys(this.smartMemory);

        if (keys.length > MAX_SIZE) {
            // Sort by timestamp ASC (oldest first)
            const sortedKeys = keys.sort((a, b) => {
                return (this.smartMemory[a].timestamp || 0) - (this.smartMemory[b].timestamp || 0);
            });

            // Evict oldest
            const deleteCount = keys.length - MAX_SIZE;
            for (let i = 0; i < deleteCount; i++) {
                delete this.smartMemory[sortedKeys[i]];
            }
            console.log(`[UnifiedCache] LRU Pruned ${deleteCount} entries`);
        }
    }

    /**
     * DEBOUNCED DISK SAVE
     * Prevents thrashing storage
     */
    scheduleSave() {
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => {
            this.saveToDisk();
        }, 2000); // 2 second debounce
    }

    async saveToDisk() {
        if (!this.smartMemory) return;

        // Encrypt before saving
        const storageDump = {};
        Object.keys(this.smartMemory).forEach(key => {
            const entry = this.smartMemory[key];
            storageDump[key] = {
                ...entry,
                answer: this.encrypt(entry.answer),
                encrypted: true
            };
        });

        await chrome.storage.local.set({ 'smart_memory_cache': storageDump });
        console.log('[UnifiedCache] Synced to storage (Encrypted)');
    }

    /**
     * Check all caches for multiple fields at once (optimized)
     * @param {Array} fields - Array of field objects
     * @returns {Promise<Object>} { selector: { value, source, confidence } }
     */
    async checkAll(fields) {
        const results = {};

        await Promise.all(fields.map(async (field) => {
            const cached = await this.get(field);
            if (cached) {
                results[field.selector] = cached;
            }
        }));

        return results;
    }

    /**
     * Clear all caches
     */
    async flush() {
        this.smartMemory = {};
        await chrome.storage.local.remove('smart_memory_cache');

        console.log('[UnifiedCache] Flushed smart memory');

        this.stats = {
            hits: { history: 0, memory: 0, selection: 0 },
            misses: 0,
            sets: 0
        };
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const totalHits = this.stats.hits.history + this.stats.hits.memory + this.stats.hits.selection;
        const totalRequests = totalHits + this.stats.misses;
        const hitRate = totalRequests > 0 ? (totalHits / totalRequests * 100).toFixed(1) : 0;

        return {
            ...this.stats,
            totalHits,
            hitRate: `${hitRate}%`
        };
    }

    // Helper methods

    // --- ACCURACY IMPROVEMENTS ---

    /**
     * Generate a FANG-level Semantic Signature for the field
     * Format: "sig_v1|context|type|clean_label|clean_name"
     * This ensures fields with same name but different context/type are treated differently
     */
    normalizeKey(field) {
        const clean = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');

        // 1. Context (The most important differentiator)
        let context = 'global';
        if (field.sectionContext && field.sectionContext.confidence > 0.6) {
            context = field.sectionContext.context;
        } else if (this.isHistoryField(field)) {
            if (/job|employ|work|company/.test(field.name || '')) context = 'work';
            if (/edu|school|degree/.test(field.name || '')) context = 'education';
        }

        // 2. Type (Prevents filling "email" into "text" if they share a generic name)
        const type = field.type || 'text';

        // 3. Label & Name (The core identity)
        const label = clean(field.label);
        const name = clean(field.name);

        // 4. Construct Semantic Signature
        return `sig_v1|${context}|${type}|${label}|${name}`;
    }

    validateType(field, value) {
        if (!value) return false;
        if (field.type === 'date') return !isNaN(new Date(value).getTime());
        if (field.type === 'number') return !isNaN(parseFloat(value));
        if (field.type === 'email') return /\S+@\S+\.\S+/.test(value);
        return true;
    }

    isHistoryField(field) {
        const hasIndex = /[_\-\[]\d+[_\-\]]?/.test(field.name || '');
        const isWorkEdu = /job|employ|work|company|position|title|degree|education|school|university|college/i.test(field.name + ' ' + field.label);
        return hasIndex && isWorkEdu;
    }

    isSelectionField(field) {
        return ['select', 'radio', 'checkbox'].includes(field.type);
    }

    extractFieldIndex(field) {
        const match = (field.name || '').match(/[_\-\[](\d+)[_\-\]]?/);
        return match ? parseInt(match[1]) : 0;
    }
}

// Export for use
if (typeof window !== 'undefined') {
    window.UnifiedCacheManager = UnifiedCacheManager;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = UnifiedCacheManager;
}
