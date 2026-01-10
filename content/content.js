/**
 * content.js
 * Main orchestrator for the Smart AI Job Apply extension.
 * Logic is split into:
 * - memory-utils.js: Smart memory and similarity utilities
 * - form-detection.js: Page analysis and field discovery
 * - visuals.js: Animations and visual feedback
 * - drag-resize.js: UI interactivity
 * - ui-components.js: UI construction and element manipulation
 */

console.log('Nova AI Extension Loaded');

// ============ GLOBAL STATE ============
let activeFormUndoHistory = [];

// ============ MESSAGE LISTENERS ============

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 1. Get Page Context (for Chat Interface)
    if (message.type === 'GET_PAGE_CONTEXT') {
        const text = document.body.innerText || "";
        const selection = window.getSelection().toString();
        sendResponse({
            content: text,
            selectedText: selection,
            url: window.location.href,
            title: document.title
        });
        return true;
    }

    // 2. Detect Forms
    if (message.type === 'DETECT_FORMS') {
        const forms = detectForms();
        sendResponse({ formCount: forms.length || 0 });
        return true;
    }

    // 3. Start Local Processing (Triggered by Popup)
    if (message.type === 'START_LOCAL_PROCESSING') {
        processPageFormLocal();
        return false;
    }

    // 4. Undo Fill
    if (message.type === 'UNDO_FILL') {
        const result = undoFormFill();
        sendResponse(result);
        return true;
    }

    // 5. Toggle Chat
    if (message.type === 'TOGGLE_CHAT') {
        console.log('Received TOGGLE_CHAT command');
        toggleChatInterface();
        sendResponse({ success: true });
        return false;
    }
});

// ============ PAGE PROCESSING WORKFLOW ============

/**
 * Main form processing workflow with Two-Phase fill and Smart Memory
 */
async function processPageFormLocal() {
    try {
        console.log('✨ Starting 🚀 Two-Phase Fill with Smart Memory...');

        // --- PHASE 1: INSTANT HEURISTIC FILL ---
        showProcessingWidget('Instant Match...', 1);

        // 1. Get Resume & Smart Memory (Parallel)
        const [resumeData, smartMemory] = await Promise.all([
            window.ResumeManager.getResumeData(),
            getSmartMemoryCache()
        ]);

        if (!resumeData) throw new Error('Resume data missing');

        // 2. Extract Fields Locally (Fast)
        const formHTML = extractFormHTML();
        if (!formHTML) throw new Error('No form found');
        const fields = window.FormAnalyzer.extractFieldsFromDOM(formHTML);

        // 3. Heuristic Map
        let { mappings: heuristicMappings, unmapped } = window.FormAnalyzer.mapFieldsHeuristically(fields, resumeData);

        // --- SMART MEMORY CHECK (Phase 1.5) ---
        if (unmapped.length > 0 && smartMemory && Object.keys(smartMemory).length > 0) {
            console.log(`🧠 Smart Memory Check. Cache Size: ${Object.keys(smartMemory).length}`);
            console.log('📋 Current Cache Contents:', Object.entries(smartMemory).map(([label, data]) => `"${label}" => "${data.answer}"`).join('\n  '));

            const memoryHits = {};
            const stillUnmapped = [];

            unmapped.forEach(field => {
                let foundAnswer = null;
                let fieldLabel = '';

                try {
                    let liveEl = null;
                    if (field.selector) liveEl = document.querySelector(field.selector);
                    else if (field.id) liveEl = document.getElementById(field.id);
                    else if (field.name) liveEl = document.querySelector(`[name="${CSS.escape(field.name)}"]`);

                    if (liveEl) {
                        fieldLabel = getFieldLabel(liveEl);
                    } else {
                        fieldLabel = field.label || field.name || field.id || '';
                    }
                } catch (e) {
                    fieldLabel = field.label || '';
                }

                fieldLabel = normalizeSmartMemoryKey(fieldLabel);

                console.log(`🔍 Searching cache for field: "${fieldLabel}"`);
                if (fieldLabel.length > 2) {
                    for (const [cachedLabel, cachedData] of Object.entries(smartMemory)) {
                        // 1. Exact Match
                        if (cachedLabel === fieldLabel) {
                            foundAnswer = cachedData.answer;
                            break;
                        }

                        // 2. Substring Match with length ratio check
                        if (cachedLabel.includes(fieldLabel) || fieldLabel.includes(cachedLabel)) {
                            const lenRatio = Math.min(cachedLabel.length, fieldLabel.length) / Math.max(cachedLabel.length, fieldLabel.length);
                            if (lenRatio > 0.5) {
                                foundAnswer = cachedData.answer;
                                break;
                            }
                        }

                        // 3. Fuzzy Match (Jaccard Similarity)
                        const score = calculateUsingJaccardSimilarity(cachedLabel, fieldLabel);
                        if (score > 0.7) { // 70% similarity required (stricter)
                            foundAnswer = cachedData.answer;
                            break;
                        }
                    }
                }

                if (foundAnswer) {
                    const selector = field.selector || (field.id ? `#${CSS.escape(field.id)}` : `[name="${CSS.escape(field.name)}"]`);
                    memoryHits[selector] = {
                        value: foundAnswer,
                        confidence: 0.99,
                        source: 'smart-memory'
                    };
                } else {
                    stillUnmapped.push(field);
                }
            });

            if (Object.keys(memoryHits).length > 0) {
                console.log(`🧠 Smart Memory rescued ${Object.keys(memoryHits).length} fields!`);
                heuristicMappings = { ...heuristicMappings, ...memoryHits };
                unmapped = stillUnmapped;
            }
        }

        // --- PHASE 1.7: SELECTION CACHE (NEW) ---
        // Check selection cache for radio/checkbox/select fields before LocalMatcher
        // This gives instant fills for previously selected values
        if (unmapped.length > 0 && window.SelectionCache) {
            console.log('💾 Phase 1.7: Checking Selection Cache...');
            const cacheHits = {};
            const cacheMisses = [];
            const processedGroups = new Set(); // Track processed checkbox groups

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

                if (isNonTextInput) {
                    const label = item.fieldData?.label || element.placeholder || element.name || '';
                    const cached = await window.SelectionCache.getCachedValue(element, label);

                    if (cached) {
                        // Handle checkbox arrays specially
                        // Value might be an array or comma-separated string
                        const isCheckboxArray = fieldType === 'checkbox' && (
                            Array.isArray(cached.value) ||
                            (typeof cached.value === 'string' && cached.value.includes(','))
                        );

                        if (isCheckboxArray) {
                            const groupKey = element.name || label;

                            // Skip if we've already processed this checkbox group
                            if (processedGroups.has(groupKey)) {
                                continue;
                            }
                            processedGroups.add(groupKey);

                            // Convert to array if it's a string
                            const valuesArray = Array.isArray(cached.value)
                                ? cached.value
                                : cached.value.split(',').map(v => v.trim());

                            // DELEGATE TO UI-COMPONENTS:
                            // Instead of strictly matching values here, we pass the FULL ARRAY to the primary field.
                            // setCheckboxValue in ui-components.js has robust fuzzy matching (Label vs Value).
                            cacheHits[item.selector] = {
                                value: valuesArray,
                                confidence: cached.confidence,
                                source: cached.source,
                                field_type: 'checkbox'
                            };

                            console.log(`💾 [SelectionCache] HIT: "${label}" → ${JSON.stringify(valuesArray)} (${cached.semanticType})`);
                        } else if (fieldType === 'radio') {
                            // Radio groups - process only once per group
                            const groupKey = element.name || label;

                            // Skip if we've already processed this radio group
                            if (processedGroups.has(groupKey)) {
                                continue;
                            }
                            processedGroups.add(groupKey);

                            // Find matching radio in group (Value Match OR Label Match)
                            // This handles dynamic IDs (Hibob) where we cached the label 'Yes' instead of ID '12345'
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

                            if (matchedRadio) {
                                const radioSelector = matchedRadio.id
                                    ? `#${CSS.escape(matchedRadio.id)}`
                                    : `input[name="${CSS.escape(matchedRadio.name)}"][value="${CSS.escape(matchedRadio.value)}"]`;

                                cacheHits[radioSelector] = {
                                    value: matchedRadio.value, // Use actual ID so autofill works
                                    confidence: cached.confidence,
                                    source: cached.source,
                                    field_type: 'radio'
                                };
                                console.log(`💾 [SelectionCache] HIT: "${label}" → ${cached.value} (${cached.semanticType})`);
                            }
                        } else {
                            // Select - single value (use item selector directly)
                            cacheHits[item.selector] = {
                                value: cached.value,
                                confidence: cached.confidence,
                                source: cached.source,
                                field_type: fieldType
                            };
                            console.log(`💾 [SelectionCache] HIT: "${label}" → ${cached.value} (${cached.semanticType})`);
                        }
                    } else {
                        cacheMisses.push(item);
                    }
                } else {
                    // Not a selection field - skip cache
                    cacheMisses.push(item);
                }
            }

            if (Object.keys(cacheHits).length > 0) {
                console.log(`✅ [SelectionCache] Resolved ${Object.keys(cacheHits).length} fields from cache.`);
                heuristicMappings = { ...heuristicMappings, ...cacheHits };
                unmapped = cacheMisses;
            }
        }

        // --- PHASE 1.8: LOCAL SEMANTIC MATCHER ---
        // Resolve structured fields (Radio/Checkbox/Select) using deterministic logic
        // This runs BEFORE Phase 1 ends, so these are filled instantly.
        if (unmapped.length > 0 && window.LocalMatcher) {
            console.log('⚡ Phase 1.8: Running Local Semantic Matcher...');
            const { defined: localMappings, remaining: finalUnmapped } = window.LocalMatcher.resolveFields(unmapped, resumeData);

            if (Object.keys(localMappings).length > 0) {
                console.log(`✅ [LocalMatcher] Resolved ${Object.keys(localMappings).length} fields without AI.`);
                heuristicMappings = { ...heuristicMappings, ...localMappings };
                unmapped = finalUnmapped;
            }
        }

        console.log(`⚡ Phase 1: ${Object.keys(heuristicMappings).length} fields mapped instantly.`);

        const hasPhase2 = unmapped.length > 0;
        let cumulativeMappings = { ...heuristicMappings };

        // 4. EXECUTE PHASE 1 FILL (but don't show sidebar if AI will run)
        if (Object.keys(heuristicMappings).length > 0) {
            await executeInstantFill({
                mappings: heuristicMappings,
                analysis: { fields },
                allFields: fields
            }, {
                resetHistory: true,
                cumulativeMappings,
                isFinal: !hasPhase2,
                skipSidebar: hasPhase2  // NEW: Skip sidebar if AI batches will run
            });
        } else {
            activeFormUndoHistory = [];
        }

        // --- PHASE 2: AI REASONING (BATCHED) ---
        if (unmapped.length > 0) {
            console.log(`⚡ Phase 2: AI Needed for ${unmapped.length} complex fields`);
            console.log(`🚀 Starting BATCHED Processing with background prefetching...`);

            const pageContext = getJobContext();

            // Temporary AI Request Override for retry logic
            const originalCallAI = window.AIClient.callAI;
            window.AIClient.callAI = async (prompt, sys, opts) => {
                const maxRetries = 3;
                let attempt = 0;
                while (attempt < maxRetries) {
                    try {
                        const result = await new Promise(resolve => {
                            chrome.runtime.sendMessage({
                                type: 'AI_REQUEST',
                                prompt, systemInstruction: sys, options: opts
                            }, resolve);
                        });

                        if (result && result.success) return result;

                        const errorMsg = (result?.error || '').toLowerCase();
                        if (errorMsg.includes('rate limit') || errorMsg.includes('quota')) {
                            console.warn(`⚡ AI Rate Limit Wait (Attempt ${attempt + 1})`);
                            updateProcessingWidget(`Rate Limit... Waiting (${attempt + 1})`);
                            await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
                            attempt++;
                            continue;
                        }
                        return { success: false, error: result?.error || 'AI request failed' };
                    } catch (e) {
                        return { success: false, error: e.message };
                    }
                }
                showErrorToast('AI Rate Limit exceeded. Please try again shortly.');
                return { success: false, error: 'Rate limit' };
            };

            // Use batched processor with callbacks
            const allAIMappings = await window.BatchProcessor.processFieldsInBatches(
                unmapped,
                resumeData,
                pageContext,
                {
                    onBatchStart: (idx, total, labels) => {
                        console.log(`[Batch ${idx}/${total}] Processing: ${labels.join(', ')}`);
                        // Use enhanced widget with batch info
                        showProcessingWidget('AI Processing...', 2, {
                            currentBatch: idx,
                            totalBatches: total
                        });
                    },
                    onFieldAnswered: (selector, value, confidence) => {
                        const element = document.querySelector(selector);
                        if (element && isFieldVisible(element)) {
                            // Show ghosting animation for all foreground batch fields
                            showGhostingAnimation(element, value, confidence);
                        }
                    },
                    onBatchComplete: (batchMappings, isBackground) => {
                        if (!isBackground) {
                            console.log(`✅ Foreground batch complete: ${Object.keys(batchMappings).length} fields`);
                            // Just merge into cumulative, don't update sidebar yet
                            Object.assign(cumulativeMappings, batchMappings);
                        } else {
                            console.log(`📦 Background batch cached: ${Object.keys(batchMappings).length} fields`);
                        }
                    },
                    onAllComplete: (finalMappings) => {
                        console.log(`🎉 All batches complete: ${Object.keys(finalMappings).length} total fields`);

                        // Now update sidebar with ALL fields after batches complete
                        // Ensure ALL original fields are in cumulativeMappings
                        fields.forEach(field => {
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

                        // Show final sidebar with all fields
                        triggerConfetti();
                        updateSidebarWithState(cumulativeMappings);
                    }
                }
            );

            window.AIClient.callAI = originalCallAI;

            if (Object.keys(allAIMappings).length > 0) {
                console.log(`🧠 Phase 2: AI mapped ${Object.keys(allAIMappings).length} fields via batched processing.`);

                // Save entries to smart memory
                const newCacheEntries = {};
                const ALLOWED_CACHE_TYPES = new Set(['text', 'textarea', 'email', 'tel', 'url', 'search']);

                console.log(`💾 Attempting to cache ${Object.keys(allAIMappings).length} Phase 2 fields...`);

                for (const [selector, data] of Object.entries(allAIMappings)) {
                    if (!data.value || String(data.value).length >= 500) {
                        continue;
                    }

                    const el = document.querySelector(selector);
                    if (!el) continue;

                    const fieldType = (el.type || 'text').toLowerCase();
                    const tagName = el.tagName.toLowerCase();
                    const label = getFieldLabel(el);

                    // --- 1. HANDLE STRUCTURED FIELDS (Selection Cache) ---
                    if (window.SelectionCache && (fieldType === 'radio' || fieldType === 'checkbox' || tagName === 'select')) {
                        if (label && label.length > 2) {
                            try {
                                await window.SelectionCache.cacheSelection(el, label, data.value);
                                console.log(`💾 [SelectionCache] AI Learned: "${label}" → ${JSON.stringify(data.value)}`);
                            } catch (err) {
                                console.warn('[SelectionCache] Failed to cache AI result:', err);
                            }
                        }
                        continue;
                    }

                    // --- 2. HANDLE TEXT FIELDS (Smart Memory) ---
                    if (!ALLOWED_CACHE_TYPES.has(fieldType)) continue;
                    if (!label || label.length <= 2) continue;

                    const normalizedLabel = normalizeSmartMemoryKey(label);

                    // Quality validation
                    const isGeneric = /^(yes|no|ok|submit|cancel|true|false)$/i.test(normalizedLabel);
                    const isSingleWord = !normalizedLabel.includes(' ');
                    const isNumberHeavy = (normalizedLabel.match(/\d/g) || []).length > normalizedLabel.length / 3;

                    if (isGeneric || (isSingleWord && normalizedLabel.length < 4) || isNumberHeavy) {
                        continue;
                    }

                    newCacheEntries[normalizedLabel] = {
                        answer: data.value,
                        timestamp: Date.now()
                    };
                    console.log(`✅ Cached: "${normalizedLabel}" => "${data.value}"`);
                }

                if (Object.keys(newCacheEntries).length > 0) {
                    console.log(`💾 Saving ${Object.keys(newCacheEntries).length} entries to smart memory...`);
                    updateSmartMemoryCache(newCacheEntries);
                } else {
                    console.log(`⚠️ No Phase 2 text fields were cached.`);
                }
            } else {
                console.warn('⚡ Phase 2: Batched processing returned no mappings');
                // Still ensure all fields are in cumulativeMappings and show sidebar
                fields.forEach(field => {
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
                triggerConfetti();
                updateSidebarWithState(cumulativeMappings);
            }
        } else {
            // No Phase 2 needed - still ensure all fields are in mappings for sidebar
            console.log('⚡ No unmapped fields, skipping Phase 2');
            fields.forEach(field => {
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

        showProcessingWidget('Done!', 4);
        setTimeout(() => removeProcessingWidget(), 800);
        activateSmartMemoryLearning();
        chrome.runtime.sendMessage({ type: 'FILL_COMPLETE' });

    } catch (error) {
        console.error('Processing failed:', error);
        showProcessingWidget('Error', -1);
        showErrorToast(error.message);
    }
}

/**
 * Executes a batch of fills and handles visual feedback
 */
async function executeInstantFill(data, options = { resetHistory: true, cumulativeMappings: null, isFinal: true }) {
    try {
        if (options.resetHistory) activeFormUndoHistory = [];

        const mappingsToFill = data.mappings;
        const cumulativeState = options.cumulativeMappings || mappingsToFill;
        const isFinal = options.isFinal !== false;

        for (const [selector, fieldData] of Object.entries(mappingsToFill)) {
            let element = null;
            try {
                element = document.querySelector(selector);
                if (!element && selector.startsWith('#')) {
                    element = document.getElementById(selector.substring(1));
                }
            } catch (e) { }

            if (element && isFieldVisible(element)) {
                activeFormUndoHistory.push(captureFieldState(element));
                element.scrollIntoView({ behavior: 'auto', block: 'center' });

                const confidence = fieldData.confidence || 0;
                if (fieldData.value && !fieldData.skipped) {
                    await simulateTyping(element, fieldData.value, confidence);
                } else {
                    highlightField(element, confidence);
                }

                // Active Learning: Listen for manual input/correction on ALL fields
                // This allows Smart Memory to learn even from fields AI left blank
                attachSelfCorrectionTrigger(element);
            }
        }

        if (isFinal && !options.skipSidebar) {
            if (Object.keys(cumulativeState).length > 0) {
                triggerConfetti();
                updateSidebarWithState(cumulativeState);
            } else {
                showErrorToast('No matching fields found.');
            }
        }
    } catch (error) {
        console.error('Fill error:', error);
        showErrorToast('Error during fill: ' + error.message);
    }
}

/**
 * Reverts the form to its pre-fill state
 */
function undoFormFill() {
    if (activeFormUndoHistory.length === 0) {
        return { success: false, message: 'No history to undo' };
    }

    console.log(`Reverting ${activeFormUndoHistory.length} fields...`);

    activeFormUndoHistory.forEach(state => {
        try {
            if (state.isCheckbox) {
                state.element.checked = state.value;
            } else {
                state.element.value = state.value;
            }

            // Restore Styles
            if (state.originalStyles) {
                Object.assign(state.element.style, state.originalStyles);
            }

            state.element.classList.remove(
                'smarthirex-filled', 'smarthirex-filled-high',
                'smarthirex-filled-medium', 'smarthirex-filled-low',
                'smarthirex-field-highlight', 'smarthirex-typing'
            );

            dispatchChangeEvents(state.element);
        } catch (e) {
            console.warn('Undo failed for field', state.element);
        }
    });

    activeFormUndoHistory = [];
    showUndoToast();
    return { success: true };
}

/**
 * Global bridge for AI regeneration
 */
async function regenerateFieldWithAI(selector, label, customInstruction = '') {
    const element = document.querySelector(selector);
    if (!element) return showErrorToast('Field not found');

    showProcessingWidget('AI Generating...', 1);

    try {
        const jobContext = getJobContext();
        let prompt = `You are filling a job application form field.
Field Label: "${label}"
Job Context: ${jobContext.substring(0, 500)}
Generate an appropriate, professional answer for this field.`;

        if (customInstruction) prompt += `\n\nCustom Instructions: ${customInstruction}`;
        prompt += `\n\nProvide ONLY the answer text, nothing else.`;

        const result = await window.AIClient.callAI(prompt, '', { maxTokens: 500, temperature: 0.7 });

        if (!result || !result.success || !result.text) throw new Error('AI generation failed');

        const newValue = result.text.trim();
        setNativeValue(element, newValue);
        dispatchChangeEvents(element);

        // Only cache text fields to SmartMemory (non-text fields use SelectionCache)
        const fieldType = (element.type || 'text').toLowerCase();
        const isTextType = ['text', 'textarea', 'email', 'tel', 'url', 'search'].includes(fieldType) ||
            element.tagName === 'TEXTAREA';

        if (isTextType) {
            updateSmartMemoryCache({
                [normalizeSmartMemoryKey(label)]: { answer: newValue, timestamp: Date.now() }
            });
            console.log(`🧠 [SmartMemory] Cached regenerated value for "${label}"`);
        }

        element.classList.add('smarthirex-typing');
        setTimeout(() => element.classList.remove('smarthirex-typing'), 1000);

        showSuccessToast('Field regenerated! 🎉');
        removeProcessingWidget();

    } catch (error) {
        console.error('Regeneration error:', error);
        showErrorToast(`Regeneration failed: ${error.message}`);
        removeProcessingWidget();
    }
}
