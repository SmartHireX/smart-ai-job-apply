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

                        // 3. Fuzzy Match
                        const score = calculateUsingJaccardSimilarity(cachedLabel, fieldLabel);
                        if (score > 0.6) {
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

        console.log(`⚡ Phase 1: ${Object.keys(heuristicMappings).length} fields mapped instantly.`);

        const hasPhase2 = unmapped.length > 0;
        let cumulativeMappings = { ...heuristicMappings };

        // 4. EXECUTE PHASE 1 FILL
        if (Object.keys(heuristicMappings).length > 0) {
            await executeInstantFill({
                mappings: heuristicMappings,
                analysis: { fields },
                allFields: fields
            }, {
                resetHistory: true,
                cumulativeMappings,
                isFinal: !hasPhase2
            });
        } else {
            activeFormUndoHistory = [];
        }

        // --- PHASE 2: AI REASONING ---
        if (unmapped.length > 0) {
            console.log(`⚡ Phase 2: AI Needed for ${unmapped.length} complex fields`);
            showProcessingWidget('Thinking...', 2);

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

                        if (result && result.success) return result; // FIX: return result, not result.data

                        const errorMsg = (result?.error || '').toLowerCase();
                        if (errorMsg.includes('rate limit') || errorMsg.includes('quota')) {
                            console.warn(`⚡ AI Rate Limit Wait (Attempt ${attempt + 1})`);
                            showProcessingWidget(`Rate Limit... Waiting (${attempt + 1})`, 2);
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

            const aiResult = await window.FormAnalyzer.mapResumeToFields(unmapped, resumeData, pageContext);
            window.AIClient.callAI = originalCallAI;

            if (aiResult.success && aiResult.mappings) {
                console.log(`🧠 Phase 2: AI mapped ${Object.keys(aiResult.mappings).length} fields.`);
                cumulativeMappings = { ...cumulativeMappings, ...aiResult.mappings };

                showProcessingWidget('Finalizing...', 3);
                await executeInstantFill({
                    mappings: aiResult.mappings,
                    analysis: { fields },
                    allFields: fields
                }, {
                    resetHistory: false,
                    cumulativeMappings,
                    isFinal: true
                });

                // Save entries to smart memory
                const newCacheEntries = {};
                const ALLOWED_CACHE_TYPES = new Set(['text', 'textarea', 'email', 'tel', 'url', 'search']);

                Object.entries(aiResult.mappings).forEach(([selector, data]) => {
                    if (data.value && String(data.value).length < 500) {
                        const el = document.querySelector(selector);
                        if (el && ALLOWED_CACHE_TYPES.has(el.type || 'text')) {
                            const label = getFieldLabel(el);
                            if (label && label.length > 2) {
                                newCacheEntries[normalizeSmartMemoryKey(label)] = {
                                    answer: data.value,
                                    timestamp: Date.now()
                                };
                            }
                        }
                    }
                });

                if (Object.keys(newCacheEntries).length > 0) {
                    updateSmartMemoryCache(newCacheEntries);
                }
            } else {
                const errorMsg = aiResult?.error || 'Unknown error';
                console.error('⚡ Phase 2: AI failed.', errorMsg);
                console.error('Full AI Result:', aiResult);
                showErrorToast(`AI Processing Error: ${errorMsg}`);
                if (Object.keys(heuristicMappings).length > 0) {
                    triggerConfetti();
                    updateSidebarWithState(heuristicMappings);
                }
            }
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
                    attachSelfCorrectionTrigger(element);
                } else {
                    highlightField(element, confidence);
                }
            }
        }

        if (isFinal) {
            if (Object.keys(cumulativeState).length > 0) {
                triggerConfetti();
                setTimeout(() => updateSidebarWithState(cumulativeState), 500);
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
    showSuccessToast('Undo complete', 0);
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

        updateSmartMemoryCache({
            [normalizeSmartMemoryKey(label)]: { answer: newValue, timestamp: Date.now() }
        });

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
