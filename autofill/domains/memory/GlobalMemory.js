/**
 * memory-utils.js
 * Smart Memory operations and key normalization utilities
 */


/**
 * Smart Memory Utilities
 * Handles smart memory caching, retrieval, and key normalization
 */
class GlobalMemory {
    /**
     * Normalize a label for Smart Memory key
     * @param {string} label - Raw label text
     * @returns {string} Normalized key
     */
    static normalizeKey(label) {
        if (!label) return '';

        return label
            .toLowerCase()
            .replace(/[^a-z0-9 ]/g, '')  // Remove special chars
            .trim()
            .replace(/\s+/g, '_');        // Space to underscore
    }

    /**
     * Generate a robust fallback search key
     * Combines Label + Name + Parent Context
     * @param {Object} field - Field object
     * @returns {string} Fallback key
     */
    static generateFallbackKey(field) {
        const rawString = [
            field.label || '',
            field.name || '',
            field.parentContext || ''
        ].join(' ');

        return this.normalizeKey(rawString);
    }

    /**
     * Resolve a single field against Global Memory
     */
    static async resolveField(field) {
        const cache = await this.getCache();

        // CENTRALIZED KEY: Use field.cache_label as the primary lookup key
        // This is THE source of truth set by PipelineOrchestrator
        const primaryKey = field.cache_label || this.normalizeKey(field.label || field.name);
        const fallbackKey = this.generateFallbackKey(field);

        console.log(`🔍 [GlobalMemory] Lookup: "${primaryKey}" (fallback: "${fallbackKey}")`);

        // 1. EXACT MATCH on primary key
        if (cache[primaryKey]) {
            console.log(`✅ [GlobalMemory] HIT (Primary): "${primaryKey}"`);
            return { value: cache[primaryKey].answer, confidence: 0.9 };
        }

        // 2. EXACT MATCH on fallback key
        if (cache[fallbackKey]) {
            console.log(`✅ [GlobalMemory] HIT (Fallback): "${fallbackKey}"`);
            return { value: cache[fallbackKey].answer, confidence: 0.7 };
        }

        // 3. JACCARD SIMILARITY FALLBACK (using KeyMatcher)
        if (window.KeyMatcher && window.KeyMatcher.findBestKeyMatch) {
            const match = window.KeyMatcher.findBestKeyMatch(primaryKey, cache, 0.6);
            if (match && match.value && match.value.answer) {
                return { value: match.value.answer, confidence: match.similarity * 0.8 };
            }
        }

        return null;
    }

    /**
     * Batch Resolution for Core Pipeline
     */
    static async resolveBatch(fields) {
        const cache = await this.getCache();
        const results = {};

        for (const field of fields) {
            const res = await this.resolveField(field);
            if (res) {
                // Return format expected by PipelineOrchestrator
                results[field.selector] = {
                    value: res.value,
                    confidence: res.confidence,
                    source: 'global_memory'
                };
            }
        }
        return results;
    }

    /**
     * Fetch Smart Memory cache
     * @returns {Promise<Object>} Smart memory cache
     */
    static async getCache() {
        try {
            const result = await chrome.storage.local.get('smartMemory');
            return result.smartMemory || {};
        } catch (error) {
            console.warn('Failed to load smart memory:', error);
            return {};
        }
    }

    /**
     * Update Smart Memory cache with new entries
     * @param {Object} newEntries - New cache entries to add
     * @returns {Promise<void>}
     */
    static async updateCache(newEntries) {
        try {
            const result = await chrome.storage.local.get('smartMemory');
            const currentMemory = result.smartMemory || {};
            const updatedMemory = { ...currentMemory, ...newEntries };

            await chrome.storage.local.set({ smartMemory: updatedMemory });
            // console.log(`💾 [SmartMemory] Updated cache keys:`, Object.keys(newEntries));
            // console.log(`💾 [SmartMemory] Updated cache keys:`, newEntries);
        } catch (error) {
            console.warn('Failed to update smart memory:', error);
        }
    }

    /**
     * Clear Smart Memory cache
     * @returns {Promise<void>}
     */
    static async clearCache() {
        try {
            await chrome.storage.local.remove('smartMemory');
            // console.log('🗑️ Smart Memory cache cleared');
        } catch (error) {
            console.warn('Failed to clear smart memory:', error);
        }
    }

    /**
     * Check if a label should be cached
     * Validates quality and prevents caching of low-quality labels
     * @param {string} label - Normalized label
     * @returns {boolean} True if label is cacheable
     */
    static isCacheable(label) {
        if (!label || label.length <= window.NovaConstants.CACHE_LIMITS.MIN_LABEL_LENGTH) {
            return false;
        }

        // Check for generic values
        if (window.NovaConstants.VALIDATION.GENERIC_VALUES.test(label)) {
            return false;
        }

        // Check single-word quality
        const isSingleWord = !label.includes(' ');
        if (isSingleWord && label.length < window.NovaConstants.VALIDATION.SINGLE_WORD_MIN_LENGTH) {
            return false;
        }

        // Check number-heavy labels
        const numberCount = (label.match(/\d/g) || []).length;
        const isNumberHeavy = numberCount > label.length * window.NovaConstants.CACHE_LIMITS.MAX_NUMBER_RATIO;
        if (isNumberHeavy) {
            return false;
        }

        return true;
    }

    /**
     * Check if a field is a history field that should skip smart memory
     * @param {string} normalizedLabel - Normalized label
     * @param {Object} prediction - Neural prediction
     * @param {Array<string>} historyLabels - List of history labels
     * @returns {boolean} True if field should skip smart memory
     */
    static isHistoryField(normalizedLabel, prediction, historyLabels) {
        const isHistoryType = historyLabels.includes(prediction?.label);
        const isSafeOverride = window.NovaConstants.SAFE_OVERRIDE_PATTERN.test(normalizedLabel);

        return isHistoryType && !isSafeOverride;
    }

    /**
     * Create a cache entry
     * @param {string} answer - Answer value
     * @returns {Object} Cache entry object
     */
    static createCacheEntry(answer) {
        return {
            answer: answer,
            timestamp: Date.now()
        };
    }

    /**
     * Get cache statistics
     * @returns {Promise<Object>} Cache stats
     */
    static async getStats() {
        const cache = await this.getCache();
        const entries = Object.entries(cache);

        return {
            totalEntries: entries.length,
            oldestEntry: entries.length > 0
                ? Math.min(...entries.map(([_, v]) => v.timestamp))
                : null,
            newestEntry: entries.length > 0
                ? Math.max(...entries.map(([_, v]) => v.timestamp))
                : null,
            sizeEstimate: JSON.stringify(cache).length
        };
    }

    /**
     * Export cache for debugging
     * @returns {Promise<string>} JSON string of cache
     */
    static async export() {
        const cache = await this.getCache();
        return JSON.stringify(cache, null, 2);
    }

    /**
     * Import cache from JSON
     * @param {string} jsonString - JSON cache data
     * @returns {Promise<void>}
     */
    static async import(jsonString) {
        try {
            const cache = JSON.parse(jsonString);
            await chrome.storage.local.set({ smartMemory: cache });
            // console.log('✅ Smart Memory imported successfully');
        } catch (error) {
            console.error('❌ Failed to import smart memory:', error);
            throw error;
        }
    }
}

// Legacy compatibility - expose globally
window.updateSmartMemoryCache = GlobalMemory.updateCache.bind(GlobalMemory);
window.normalizeSmartMemoryKey = GlobalMemory.normalizeKey.bind(GlobalMemory);

// Export for use
if (typeof window !== 'undefined') {
    window.GlobalMemory = GlobalMemory;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GlobalMemory;
}
