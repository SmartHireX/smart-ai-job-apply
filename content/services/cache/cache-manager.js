/**
 * UnifiedCacheManager
 * Consolidates all caching mechanisms into a single interface
 * Priority: HistoryManager (structured) → SmartMemory (key-value) → SelectionCache (selections)
 */

class UnifiedCacheManager {
    constructor() {
        // Priority order (highest to lowest)
        this.historyManager = window.HistoryManager || null;
        this.smartMemory = null; // Will be injected
        this.selectionCache = window.SelectionCache || null;

        this.stats = {
            hits: { history: 0, memory: 0, selection: 0 },
            misses: 0,
            sets: 0
        };
    }

    /**
     * Initialize all cache sources
     */
    async init(smartMemory) {
        this.smartMemory = smartMemory;

        if (this.historyManager && !this.historyManager.isInitialized) {
            await this.historyManager.init();
        }

        console.log('[UnifiedCache] Initialized with sources:', {
            history: !!this.historyManager,
            memory: !!this.smartMemory,
            selection: !!this.selectionCache
        });
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
        }

        // Priority 2: SmartMemory (for general text/values)
        if (this.smartMemory) {
            const memoryValue = this.smartMemory[fieldKey];
            if (memoryValue) {
                this.stats.hits.memory++;
                return {
                    value: memoryValue,
                    source: 'smart-memory',
                    confidence: 0.95,
                    cached: true
                };
            }
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
     * Store value in appropriate cache(s)
     * @param {Object} field - Field object
     * @param {*} value - Value to cache
     * @param {String} source - Where value came from ('ai', 'history', 'matcher')
     */
    async set(field, value, source = 'unknown') {
        const fieldKey = this.normalizeKey(field);
        this.stats.sets++;

        // Always store in SmartMemory (universal cache)
        if (this.smartMemory) {
            this.smartMemory[fieldKey] = value;
        }

        // Store in SelectionCache if applicable
        if (this.selectionCache && this.isSelectionField(field)) {
            try {
                await this.selectionCache.cacheResponse(field, value);
            } catch (error) {
                console.warn('[UnifiedCache] SelectionCache set error:', error);
            }
        }

        // Store in HistoryManager if applicable (learns from AI/user edits)
        if (this.historyManager && this.isHistoryField(field) && source === 'ai') {
            // HistoryManager learns from batches, not individual fields
            // This will be handled by the history handler
        }

        console.log(`[UnifiedCache] Cached "${field.label}" → ${source}`);
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
        if (this.smartMemory) {
            Object.keys(this.smartMemory).forEach(key => delete this.smartMemory[key]);
        }

        // SelectionCache and HistoryManager have their own persistence
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
