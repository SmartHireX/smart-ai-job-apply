/**
 * New Architecture Orchestrator
 * Feature-flagged wrapper to enable new architecture while maintaining backwards compatibility
 */

(function () {
    'use strict';

    // Feature flag - set in localStorage to enable
    const USE_NEW_ARCHITECTURE = localStorage.getItem('novaai_new_arch') === 'true';

    if (!USE_NEW_ARCHITECTURE) {
        console.log('[Orchestrator] Using legacy architecture (set localStorage.novaai_new_arch = "true" to enable new)');
        return;
    }

    console.log('🚀 [Orchestrator] NEW ARCHITECTURE ENABLED');

    // Initialize new components
    let cacheManager = null;
    let fieldRouter = null;

    /**
     * New architecture flow
     */
    async function processFormNew(fields, resumeData, smartMemory, callbacks) {
        console.log('[Orchestrator] Processing with new architecture...');

        try {
            // 1. Initialize components
            if (!cacheManager) {
                cacheManager = new window.UnifiedCacheManager();
                await cacheManager.init(smartMemory);
            }

            if (!fieldRouter) {
                fieldRouter = new window.FieldRouter();
            }

            // 2. Early cache check (deduplication)
            console.log('[Orchestrator] Checking cache for all fields...');
            const cacheResults = await cacheManager.checkAll(fields);
            const cachedCount = Object.keys(cacheResults).length;

            console.log(`[Orchestrator] Cache hits: ${cachedCount}/${fields.length}`);

            // 3. Route fields
            const routing = fieldRouter.routeAll(fields, cacheResults);

            console.log('[Orchestrator] Routing complete:', {
                cache: routing.cache.length,
                history: routing.history.length,
                matcher: routing.matcher.length,
                ai: routing.ai.length
            });

            // 4. Fill cached fields immediately
            const results = {};
            for (const [selector, data] of Object.entries(cacheResults)) {
                results[selector] = data;
                if (callbacks.onFieldAnswered) {
                    callbacks.onFieldAnswered(selector, data.value, data.confidence);
                }
            }

            // Wait for cache animations
            if (cachedCount > 0) {
                await new Promise(r => setTimeout(r, cachedCount * 100));
            }

            // 5. Handle remaining fields (in parallel where possible)
            // For now, delegate to existing handlers
            // TODO: Implement parallel handler execution

            // History handler
            if (routing.history.length > 0) {
                console.log(`[Orchestrator] Processing ${routing.history.length} history fields...`);
                // Delegate to batch-processor's history logic for now
            }

            // Matcher handler  
            if (routing.matcher.length > 0) {
                console.log(`[Orchestrator] Processing ${routing.matcher.length} matcher fields...`);
                const matcher = new window.LocalMatcher();
                routing.matcher.forEach(field => {
                    const answer = matcher.resolveFields([field], resumeData);
                    if (answer && answer.length > 0) {
                        const mapping = answer[0];
                        if (mapping && mapping.value) {
                            results[field.selector] = {
                                value: mapping.value,
                                source: 'local-matcher',
                                confidence: 0.9
                            };
                            if (callbacks.onFieldAnswered) {
                                callbacks.onFieldAnswered(field.selector, mapping.value, 0.9);
                            }
                        }
                    }
                });
            }

            // AI handler (batch remaining)
            const aiFields = [...routing.ai, ...routing.history.filter(f => !results[f.selector])];
            if (aiFields.length > 0) {
                console.log(`[Orchestrator] Sending ${aiFields.length} fields to AI...`);
                // Delegate to batch processor
                const batchProcessor = window.BatchProcessor || window;
                if (batchProcessor.processFieldsInBatches) {
                    const aiResults = await batchProcessor.processFieldsInBatches(
                        aiFields,
                        resumeData,
                        smartMemory,
                        callbacks
                    );
                    Object.assign(results, aiResults);
                }
            }

            // 6. Cache results
            for (const [selector, data] of Object.entries(results)) {
                const field = fields.find(f => f.selector === selector);
                if (field && data.source !== 'cache') {
                    await cacheManager.set(field, data.value, data.source);
                }
            }

            // 7. Show stats
            const stats = cacheManager.getStats();
            console.log('[Orchestrator] Cache stats:', stats);

            return results;

        } catch (error) {
            console.error('[Orchestrator] Error in new architecture:', error);
            // Fallback to old architecture
            console.warn('[Orchestrator] Falling back to legacy processing...');
            throw error;
        }
    }

    // Expose new architecture functions
    window.NovaAI = window.NovaAI || {};
    window.NovaAI.processFormNew = processFormNew;
    window.NovaAI.cacheManager = cacheManager;
    window.NovaAI.fieldRouter = fieldRouter;

    console.log('[Orchestrator] New architecture ready. Use window.NovaAI.processFormNew()');

})();
