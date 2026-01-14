/**
 * phase2-ai-processing.js
 * Phase 2: AI Batched Processing Workflow
 * Handles complex fields that need AI reasoning
 */


/**
 * Phase 2: AI Processing
 * Handles unmapped fields using AI with batched processing
 */
class Phase2AIProcessing {
    /**
     * Run Phase 2 AI processing
     * @param {Array} unmapped - Unmapped fields
     * @param {Object} resumeData - User resume data
     * @param {string} pageContext - Job page context
     * @param {Object} cumulativeMappings - Existing mappings
     * @param {Array} allFields - All fields for sidebar
     * @returns {Promise<Object>} AI mappings
     */
    static async run(unmapped, resumeData, pageContext, cumulativeMappings, allFields) {
        if (unmapped.length === 0) {
            // console.log('⚡ No unmapped fields, skipping Phase 2');
            this.ensureAllFieldsInMappings(allFields, cumulativeMappings);
            return {};
        }

        // console.log(`⚡ [Phase 2] AI Needed for ${unmapped.length} complex fields`);
        // console.log(`🚀 Starting BATCHED Processing...`);

        // Setup AI with retry logic
        const originalCallAI = window.AIClient.callAI;
        this.setupAIRetryLogic();

        try {
            // Process fields in batches
            const allAIMappings = await this.processBatches(
                unmapped,
                resumeData,
                pageContext,
                cumulativeMappings,
                allFields
            );

            // Restore original AI client
            window.AIClient.callAI = originalCallAI;

            // Cache AI results
            if (Object.keys(allAIMappings).length > 0) {
                // console.log(`🧠 [Phase 2] AI mapped ${Object.keys(allAIMappings).length} fields`);
                await this.cacheAIResults(allAIMappings);
            } else {
                console.warn('⚡ [Phase 2] Batched processing returned no mappings');
                this.ensureAllFieldsInMappings(allFields, cumulativeMappings);
                this.showFinalResults(cumulativeMappings);
            }

            return allAIMappings;

        } catch (error) {
            console.error('[Phase 2] Processing failed:', error);
            window.AIClient.callAI = originalCallAI;
            throw error;
        }
    }

    /**
     * Setup AI retry logic for rate limiting
     */
    static setupAIRetryLogic() {
        window.AIClient.callAI = async (prompt, sys, opts) => {
            try {
                const result = await new Promise(resolve => {
                    chrome.runtime.sendMessage({
                        type: 'AI_REQUEST',
                        prompt,
                        systemInstruction: sys,
                        options: opts
                    }, resolve);
                });

                if (result && result.success) return result;

                const errorMsg = (result?.error || '').toLowerCase();
                if (errorMsg.includes('rate limit') || errorMsg.includes('quota')) {
                    console.warn('⚡ AI Rate Limit hit. Exiting immediately.');
                    if (typeof window.showErrorToast === 'function') {
                        window.showErrorToast('AI Rate Limit exceeded.');
                    }
                    return { success: false, error: 'Rate limit' };
                }
                return { success: false, error: result?.error || 'AI request failed' };
            } catch (e) {
                return { success: false, error: e.message };
            }
        };
    }

    /**
     * Process fields in batches
     */
    static async processBatches(unmapped, resumeData, pageContext, cumulativeMappings, allFields) {
        const callbacks = {
            onBatchStart: (idx, total, labels) => {
                // console.log(`[Batch ${idx}/${total}] Processing: ${labels.join(', ')}`);
                if (typeof window.showProcessingWidget === 'function') {
                    window.showProcessingWidget('AI Processing...', 2, {
                        currentBatch: idx,
                        totalBatches: total
                    });
                }
            },
            onFieldAnswered: (selector, value, confidence) => {
                const element = document.querySelector(selector);
                if (element && FieldUtils.isFieldVisible(element)) {
                    if (typeof window.showGhostingAnimation === 'function') {
                        window.showGhostingAnimation(element, value, confidence);
                    }
                }
            },
            onBatchComplete: (batchMappings, isBackground) => {
                if (!isBackground) {
                    // console.log(`✅ Foreground batch complete: ${Object.keys(batchMappings).length} fields`);
                    Object.assign(cumulativeMappings, batchMappings);
                } else {
                    // console.log(`📦 Background batch cached: ${Object.keys(batchMappings).length} fields`);
                }
            },
            onAllComplete: (finalMappings) => {
                // console.log(`🎉 All batches complete: ${Object.keys(finalMappings).length} total fields`);

                // Ensure all fields are in cumulative mappings
                this.ensureAllFieldsInMappings(allFields, cumulativeMappings);

                // Show final results
                this.showFinalResults(cumulativeMappings);
            }
        };

        return await window.BatchProcessor.processFieldsInBatches(
            unmapped,
            resumeData,
            pageContext,
            callbacks
        );
    }

    /**
     * Cache AI results to smart memory and selection cache
     */
    static async cacheAIResults(allAIMappings) {
        // console.log(`💾 Attempting to cache ${Object.keys(allAIMappings).length} Phase 2 fields...`);

        const newCacheEntries = {};

        for (const [selector, data] of Object.entries(allAIMappings)) {
            if (!data.value || String(data.value).length >= CACHE_LIMITS.MAX_VALUE_LENGTH) {
                continue;
            }

            const el = document.querySelector(selector);
            if (!el) continue;

            const fieldType = (el.type || 'text').toLowerCase();
            const tagName = el.tagName.toLowerCase();
            const label = FieldUtils.getFieldLabel(el);

            // Handle structured fields (Selection Cache)
            if (window.SelectionCache && (fieldType === 'radio' || fieldType === 'checkbox' || tagName === 'select')) {
                await this.cacheToSelectionCache(el, label, data.value);
                continue;
            }

            // Handle text fields (Smart Memory)
            if (TEXT_FIELD_TYPES.has(fieldType) || tagName === 'textarea') {
                const cacheEntry = this.createSmartMemoryCacheEntry(label, data.value);
                if (cacheEntry) {
                    Object.assign(newCacheEntries, cacheEntry);
                }
            }
        }

        // Save to smart memory
        if (Object.keys(newCacheEntries).length > 0) {
            // console.log(`💾 Saving ${Object.keys(newCacheEntries).length} entries to smart memory...`);
            if (window.GlobalMemory) await window.GlobalMemory.updateCache(newCacheEntries);
        } else {
            // console.log(`⚠️ No Phase 2 text fields were cached.`);
        }
    }

    /**
     * Cache to selection cache
     */
    static async cacheToSelectionCache(element, label, value) {
        if (!label || label.length <= CACHE_LIMITS.MIN_LABEL_LENGTH) return;

        try {
            await window.SelectionCache.cacheSelection(element, label, value);
            // console.log(`💾 [SelectionCache] AI Learned: "${label}" → ${JSON.stringify(value)}`);
        } catch (err) {
            console.warn('[SelectionCache] Failed to cache AI result:', err);
        }
    }

    /**
     * Create smart memory cache entry
     */
    static createSmartMemoryCacheEntry(label, value) {
        if (!label || label.length <= CACHE_LIMITS.MIN_LABEL_LENGTH) return null;

        const normalizedLabel = window.GlobalMemory ? window.GlobalMemory.normalizeKey(label) : label;

        // History Guard: Prevent saving structured history fields
        const savePrediction = window.neuralClassifier
            ? window.neuralClassifier.predict({ name: normalizedLabel, label: normalizedLabel })
            : { label: 'unknown' };

        const isHistoryField = HISTORY_LABELS_FOR_SAVE.includes(savePrediction.label);

        if (isHistoryField && !SAFE_OVERRIDE_PATTERN.test(normalizedLabel)) {
            // console.log(`🛡️ History Guard: Skipping Smart Memory save for "${normalizedLabel}"`);
            return null;
        }

        // Quality validation
        if (window.GlobalMemory && !window.GlobalMemory.isCacheable(normalizedLabel)) {
            return null;
        }

        // console.log(`✅ Cached: "${normalizedLabel}" => "${value}"`);

        return {
            [normalizedLabel]: window.GlobalMemory ? window.GlobalMemory.createCacheEntry(value) : { answer: value, timestamp: Date.now() }
        };
    }

    /**
     * Ensure all fields are in cumulative mappings
     */
    static ensureAllFieldsInMappings(allFields, cumulativeMappings) {
        allFields.forEach(field => {
            if (!cumulativeMappings[field.selector]) {
                cumulativeMappings[field.selector] = {
                    value: null,
                    confidence: 0,
                    source: 'manual',
                    field_type: field.type,
                    label: field.label
                };
            }
        });
    }

    /**
     * Show final results (confetti + sidebar)
     */
    static showFinalResults(cumulativeMappings) {
        if (typeof window.triggerConfetti === 'function') {
            window.triggerConfetti();
        }
        if (typeof window.updateSidebarWithState === 'function') {
            window.updateSidebarWithState(cumulativeMappings);
        }
    }
}

// Global export
window.Phase2AIProcessing = Phase2AIProcessing;

Phase2AIProcessing;
