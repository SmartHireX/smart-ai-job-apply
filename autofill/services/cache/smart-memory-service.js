/**
 * memory-utils.js
 * Smart Memory operations and key normalization utilities
 */


/**
 * Smart Memory Utilities
 * Handles smart memory caching, retrieval, and key normalization
 */
class MemoryUtils {
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
            console.log(`💾 [SmartMemory] Updated cache with ${Object.keys(newEntries).length} entries`);
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
            console.log('🗑️ Smart Memory cache cleared');
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
            console.log('✅ Smart Memory imported successfully');
        } catch (error) {
            console.error('❌ Failed to import smart memory:', error);
            throw error;
        }
    }
}

// Legacy compatibility - expose globally
window.updateSmartMemoryCache = MemoryUtils.updateCache.bind(MemoryUtils);
window.normalizeSmartMemoryKey = MemoryUtils.normalizeKey.bind(MemoryUtils);

// Export class to global scope
window.MemoryUtils = MemoryUtils;
