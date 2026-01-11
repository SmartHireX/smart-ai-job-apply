/**
 * CacheHandler
 * Handles fields that have cached values in UnifiedCacheManager
 */
class CacheHandler {
    constructor() {
        this.name = 'cache';
    }

    async handle(fields) {
        const results = {};

        // Fields routed here already have cached values confirmed by FieldRouter
        // We just need to format them for the response

        for (const field of fields) {
            // Re-fetch from cache to get full metadata (or rely on what Router passed? Router passed cacheResult)
            // Ideally Router should have passed the value, but if not re-fetch.
            // For now, we assume UnifiedCacheManager is the source of truth.

            if (window.NovaAI && window.NovaAI.cacheManager) {
                const cached = await window.NovaAI.cacheManager.get(field);
                if (cached) {
                    results[field.selector] = {
                        value: cached.value,
                        confidence: cached.confidence || 1.0,
                        source: cached.source || 'cache'
                    };
                }
            }
        }

        console.log(`[CacheHandler] Resolved ${Object.keys(results).length} fields`);
        return results;
    }
}

if (typeof window !== 'undefined') {
    window.CacheHandler = CacheHandler;
}
