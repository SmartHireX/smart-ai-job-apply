/**
 * phase1-instant-fill.js  
 * Phase 1: Instant Fill Workflow
 * Heuristic mapping, Smart Memory, Selection Cache, Local Matcher
 */


/**
 * Phase 1: Instant Fill
 * Combines heuristics, smart memory, selection cache, and local matcher
 */
class Phase1InstantFill {
    /**
     * Run Phase 1 instant fill
     * @param {Array} fields - Classified fields
     * @param {Object} resumeData - User resume data
     * @param {Object} smartMemory - Smart memory cache
     * @returns {Object} { mappings, unmapped }
     */
    static async run(fields, resumeData, smartMemory) {
        // console.log('⚡ [Phase 1] Starting Instant Fill...');

        // Step 1: Heuristic Mapping
        let { mappings, unmapped } = this.runHeuristicMapping(fields, resumeData);

        // Step 2: Smart Memory Check
        if (unmapped.length > 0 && smartMemory && Object.keys(smartMemory).length > 0) {
            const result = await this.runSmartMemory(unmapped, smartMemory, mappings);
            mappings = { ...mappings, ...result.memoryHits };
            unmapped = result.stillUnmapped;
        }

        // Step 3: Selection Cache
        if (unmapped.length > 0 && window.SelectionCache) {
            const result = await this.runSelectionCache(unmapped);
            mappings = { ...mappings, ...result.cacheHits };
            unmapped = result.cacheMisses;
        }

        // Step 4: Local Semantic Matcher
        if (unmapped.length > 0 && window.LocalMatcher) {
            const result = this.runLocalMatcher(unmapped, resumeData);
            mappings = { ...mappings, ...result.localMappings };
            unmapped = result.finalUnmapped;
        }

        // console.log(`⚡ [Phase 1] Complete: ${Object.keys(mappings).length} fields mapped instantly.`);

        return { mappings, unmapped };
    }

    /**
     * Step 1: Heuristic Mapping
     */
    static runHeuristicMapping(fields, resumeData) {
        // console.log('📊 Running Heuristic Mapping...');

        const { mappings, unmapped } = window.FormAnalyzer.mapFieldsHeuristically(fields, resumeData);

        // console.log(`📊 Heuristic: ${Object.keys(mappings).length} mapped, ${unmapped.length} unmapped`);

        return { mappings, unmapped };
    }

    /**
     * Step 2: Smart Memory Check
     */
    static async runSmartMemory(unmapped, smartMemory, heuristicMappings) {
        // console.log(`🧠 Smart Memory Check. Cache Size: ${Object.keys(smartMemory).length}`);

        const memoryHits = {};
        const stillUnmapped = [];

        for (const field of unmapped) {
            let foundAnswer = null;

            // CENTRALIZED KEY: Use the pre-calculated cache_label from PipelineOrchestrator
            // This is THE ONLY source of truth for cache keys.
            let fieldLabel = field.cache_label;

            // Fallback: If cache_label was not set (e.g., field without ml_prediction),
            // generate a basic key. This should be rare.
            if (!fieldLabel) {
                fieldLabel = this.extractFieldLabel(field);
                fieldLabel = window.GlobalMemory ? window.GlobalMemory.normalizeKey(fieldLabel) : fieldLabel;
                console.warn(`⚠️ [SmartMemory] Field missing cache_label, using fallback: "${fieldLabel}"`);
            }

            // console.log(`🔍 [SmartMemory] Lookup Key: "${fieldLabel}"`);

            // Store calculated key on field for downstream use
            field.search_field_name = fieldLabel;

            // HISTORY GUARD: Skip Smart Memory for history fields
            const prediction = field.ml_prediction || { label: 'unknown', confidence: 0 };
            const isHistoryField = HISTORY_LABELS.includes(prediction.label) && prediction.confidence > CONFIDENCE.NEURAL_MATCH;
            const isSafeOverride = SAFE_OVERRIDE_PATTERN.test(fieldLabel);

            if (isHistoryField && !isSafeOverride) {
                // console.log(`🛡️ History Guard: Skipping Smart Memory lookup for "${fieldLabel}" (Neural: ${prediction.label})`);
                stillUnmapped.push(field);
                continue;
            }

            // Search cache
            if (fieldLabel.length > 2) {
                if (window.SelectionCache && window.SelectionCache.getCachedValue) {
                    try {
                        const cachedResult = window.SelectionCache.getCachedValue(
                            field,
                            fieldLabel,
                            smartMemory,
                            heuristicMappings
                        );
                        if (cachedResult) {
                            foundAnswer = cachedResult.value;
                        }
                    } catch (err) {
                        console.warn('Cache lookup failed:', err);
                    }
                } else {
                    // Fallback: Direct lookup
                    for (const [cachedLabel, cachedData] of Object.entries(smartMemory)) {
                        if (cachedLabel === fieldLabel) {
                            foundAnswer = cachedData.answer;
                            break;
                        }
                    }
                }
            }

            if (foundAnswer) {
                const selector = field.selector || (field.id ? `#${CSS.escape(field.id)}` : `[name="${CSS.escape(field.name)}"]`);
                memoryHits[selector] = {
                    value: foundAnswer,
                    confidence: CONFIDENCE.HIGH,
                    source: 'smart-memory'
                };
            } else {
                stillUnmapped.push(field);
            }
        }

        if (Object.keys(memoryHits).length > 0) {
            // console.log(`🧠 Smart Memory rescued ${Object.keys(memoryHits).length} fields!`);
        }

        return { memoryHits, stillUnmapped };
    }

    /**
     * Step 3: Selection Cache
     */
    static async runSelectionCache(unmapped) {
        // console.log('💾 [Phase 1.7] Checking Selection Cache...');

        const cacheHits = {};
        const cacheMisses = [];
        const processedGroups = new Set();

        for (const item of unmapped) {
            const element = document.querySelector(item.selector);
            if (!element) {
                cacheMisses.push(item);
                continue;
            }

            const fieldType = item.fieldData?.field_type || element.type || element.tagName?.toLowerCase();
            const isNonTextInput = fieldType === 'radio' || fieldType === 'checkbox' ||
                fieldType === 'select' || fieldType === 'select-one' ||
                fieldType === 'select-multiple' || element.tagName === 'SELECT';

            if (!isNonTextInput) {
                cacheMisses.push(item);
                continue;
            }

            // CENTRALIZED KEY: Use field.cache_label as the lookup key
            const cacheKey = item.cache_label || item.fieldData?.cache_label;
            const label = cacheKey || item.fieldData?.label || element.placeholder || element.name || '';

            // console.log(`🔍 [SelectionCache] Lookup Key: "${label}"`);
            const cached = await window.SelectionCache.getCachedValue(element, label);

            if (cached) {
                const result = this.processSelectionCache(element, item, cached, fieldType, label, processedGroups);
                if (result) {
                    Object.assign(cacheHits, result);
                }
            } else {
                cacheMisses.push(item);
            }
        }

        if (Object.keys(cacheHits).length > 0) {
            // console.log(`✅ [SelectionCache] Resolved ${Object.keys(cacheHits).length} fields from cache.`);
        }

        return { cacheHits, cacheMisses };
    }

    /**
     * Process selection cache result
     */
    static processSelectionCache(element, item, cached, fieldType, label, processedGroups) {
        const isCheckboxArray = fieldType === 'checkbox' && (
            Array.isArray(cached.value) ||
            (typeof cached.value === 'string' && cached.value.includes(','))
        );

        if (isCheckboxArray) {
            const groupKey = element.name || label;
            if (processedGroups.has(groupKey)) return null;
            processedGroups.add(groupKey);

            const valuesArray = Array.isArray(cached.value)
                ? cached.value
                : cached.value.split(',').map(v => v.trim());

            // console.log(`💾 [SelectionCache] HIT: "${label}" → ${JSON.stringify(valuesArray)}`);

            return {
                [item.selector]: {
                    value: valuesArray,
                    confidence: cached.confidence,
                    source: cached.source,
                    field_type: 'checkbox'
                }
            };
        } else if (fieldType === 'radio') {
            const groupKey = element.name || label;
            if (processedGroups.has(groupKey)) return null;
            processedGroups.add(groupKey);

            const matchedRadio = this.findMatchingRadio(element, cached);
            if (matchedRadio) {
                const radioSelector = matchedRadio.id
                    ? `#${CSS.escape(matchedRadio.id)}`
                    : `input[name="${CSS.escape(matchedRadio.name)}"][value="${CSS.escape(matchedRadio.value)}"]`;

                // console.log(`💾 [SelectionCache] HIT: "${label}" → ${cached.value}`);

                return {
                    [radioSelector]: {
                        value: matchedRadio.value,
                        confidence: cached.confidence,
                        source: cached.source,
                        field_type: 'radio'
                    }
                };
            }
        } else {
            // Select field
            // console.log(`💾 [SelectionCache] HIT: "${label}" → ${cached.value}`);

            return {
                [item.selector]: {
                    value: cached.value,
                    confidence: cached.confidence,
                    source: cached.source,
                    field_type: fieldType
                }
            };
        }

        return null;
    }

    /**
     * Find matching radio button in group
     */
    static findMatchingRadio(element, cached) {
        const allRadios = document.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`);
        let matchedRadio = null;

        allRadios.forEach(radio => {
            const val = radio.value;
            if (val === cached.value) {
                matchedRadio = radio;
            } else {
                // Try label match
                let radioLabel = '';
                if (radio.labels && radio.labels.length > 0) radioLabel = radio.labels[0].innerText;
                else if (radio.id) {
                    const l = document.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
                    if (l) radioLabel = l.innerText;
                }
                if (!radioLabel && radio.closest('label')) radioLabel = radio.closest('label').innerText.replace(val, '');

                if (radioLabel && String(radioLabel).trim().toLowerCase() === String(cached.value).trim().toLowerCase()) {
                    matchedRadio = radio;
                }
            }
        });

        return matchedRadio;
    }

    /**
     * Step 4: Local Semantic Matcher
     */
    static runLocalMatcher(unmapped, resumeData) {
        // console.log('⚡ [Phase 1.8] Running Local Semantic Matcher...');

        const { defined: localMappings, remaining: finalUnmapped } = window.LocalMatcher.resolveFields(unmapped, resumeData);

        if (Object.keys(localMappings).length > 0) {
            // console.log(`✅ [LocalMatcher] Resolved ${Object.keys(localMappings).length} fields without AI.`);
        }

        return { localMappings, finalUnmapped };
    }

    /**
     * Extract field label from field object
     */
    static extractFieldLabel(field) {
        try {
            let liveEl = null;
            if (field.selector) liveEl = document.querySelector(field.selector);
            else if (field.id) liveEl = document.getElementById(field.id);
            else if (field.name) liveEl = document.querySelector(`[name="${CSS.escape(field.name)}"]`);

            if (liveEl) {
                return FieldUtils.getFieldLabel(liveEl);
            } else {
                return field.label || field.name || field.id || '';
            }
        } catch (e) {
            return field.label || '';
        }
    }

    /**
     * Execute the instant fill
     */
    static async execute(mappings, fields, options = {}) {
        const {
            resetHistory = true,
            cumulativeMappings = null,
            isFinal = true,
            skipSidebar = false
        } = options;

        try {
            if (resetHistory) {
                UndoManager.clear();
            }

            const mappingsToFill = mappings;
            const cumulativeState = cumulativeMappings || mappingsToFill;

            // Fill each field
            for (const [selector, fieldData] of Object.entries(mappingsToFill)) {
                let element = null;
                try {
                    element = document.querySelector(selector);
                    if (!element && selector.startsWith('#')) {
                        element = document.getElementById(selector.substring(1));
                    }
                } catch (e) { }

                if (element && FieldUtils.isFieldVisible(element)) {
                    // Capture for undo
                    UndoManager.capture(element);

                    // Scroll into view
                    FieldUtils.scrollIntoView(element);

                    const confidence = fieldData.confidence || 0;

                    // Fill or highlight
                    if (fieldData.value && !fieldData.skipped) {
                        await this.simulateTyping(element, fieldData.value, confidence);
                    } else {
                        this.highlightField(element, confidence);
                    }

                    // Active Learning: Listen for manual corrections
                    if (typeof window.attachSelfCorrectionTrigger === 'function') {
                        window.attachSelfCorrectionTrigger(element);
                    }
                }
            }

            // Show sidebar if final
            if (isFinal && !skipSidebar) {
                if (Object.keys(cumulativeState).length > 0) {
                    if (typeof window.triggerConfetti === 'function') window.triggerConfetti();
                    if (typeof window.updateSidebarWithState === 'function') {
                        window.updateSidebarWithState(cumulativeState);
                    }
                } else {
                    if (typeof window.showErrorToast === 'function') {
                        window.showErrorToast('No matching fields found.');
                    }
                }
            }

            // Start self-healing
            SelfHealing.start();

        } catch (error) {
            console.error('Fill error:', error);
            if (typeof window.showErrorToast === 'function') {
                window.showErrorToast('Error during fill: ' + error.message);
            }
        }
    }

    /**
     * Simulate typing for a field
     */
    static async simulateTyping(element, value, confidence) {
        if (typeof window.simulateTyping === 'function') {
            await window.simulateTyping(element, value, confidence);
        } else {
            // Fallback
            FieldUtils.setNativeValue(element, value);
            FieldUtils.dispatchChangeEvents(element);
            FieldUtils.addHighlightClass(element, confidence);
        }
    }

    /**
     * Highlight a field
     */
    static highlightField(element, confidence) {
        if (typeof window.highlightField === 'function') {
            window.highlightField(element, confidence);
        } else {
            // Fallback
            FieldUtils.addHighlightClass(element, confidence);
        }
    }
}

// Global export
window.Phase1InstantFill = Phase1InstantFill;

Phase1InstantFill;
