// Content script - runs on all web pages
console.log('SmartHireX local extension loaded');

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
        const formCount = detectForms();
        sendResponse({ formCount });
        return true;
    }

    // 3. Start Local Processing (Triggered by Popup)
    if (message.type === 'START_LOCAL_PROCESSING') {
        processPageFormLocal();
        return false; // Async work happens but we don't keep the channel open for this simple trigger
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

// ============ PAGE PROCESSING WORKFLOW ============

async function processPageFormLocal() {
    try {
        console.log('✨ Starting 🚀 Two-Phase Fill with Smart Memory...');

        // --- PHASE 1: INSTANT HEURISIC FILL ---
        showProcessingWidget('Instant Match...', 1);

        // 1. Get Resume & Smart Memory (Parallel)
        const [resumeData, smartMemory] = await Promise.all([
            window.ResumeManager.getResumeData(),
            getSmartMemoryCache()
        ]);

        // 2. Extract Fields Locally (Fast)
        const formHTML = extractFormHTML();
        if (!formHTML) throw new Error('No form found');
        const fields = window.FormAnalyzer.extractFieldsFromDOM(formHTML);

        if (!resumeData) throw new Error('Resume data missing');

        // 3. Heuristic Map
        let { mappings: heuristicMappings, unmapped } = window.FormAnalyzer.mapFieldsHeuristically(fields, resumeData);

        // --- SMART MEMORY CHECK (Phase 1.5) ---
        if (unmapped.length > 0) {
            // Log raw status
            const memorySize = smartMemory ? Object.keys(smartMemory).length : 0;
            console.log(`🧠 Smart Memory Check. Cache Size: ${memorySize}`);
            if (memorySize > 0) {
                console.log('🧠 FULL SMART MEMORY CACHE:', smartMemory); // REQUESTED LOG
            }

            if (memorySize > 0) {
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
                        // Fallback
                        fieldLabel = field.label || '';
                    }

                    fieldLabel = normalizeSmartMemoryKey(fieldLabel); // Robust Key
                    console.log(`🧠 Checking Field: "${fieldLabel}" against cache...`);

                    if (fieldLabel.length > 2) {
                        for (const [cachedLabel, cachedData] of Object.entries(smartMemory)) {
                            // 1. Exact Match
                            if (cachedLabel === fieldLabel) {
                                console.log(`🧠 MATCH (Exact): "${fieldLabel}"`);
                                foundAnswer = cachedData.answer;
                                break;
                            }

                            // 2. Substring Match (High Confidence if one contains other)
                            if (cachedLabel.includes(fieldLabel) || fieldLabel.includes(cachedLabel)) {
                                // Length ratio check to avoid matching "Name" with "First Name" (too broad)
                                // But "Work Authorization" vs "Are you authorized to work...?" is good.
                                // Actually, for "Same Form", exact match is expected. Substring helps for variations.
                                const lenRatio = Math.min(cachedLabel.length, fieldLabel.length) / Math.max(cachedLabel.length, fieldLabel.length);
                                if (lenRatio > 0.5) { // At least 50% similar length structure
                                    console.log(`🧠 MATCH (Substring): "${fieldLabel}" ~= "${cachedLabel}"`);
                                    foundAnswer = cachedData.answer;
                                    break;
                                }
                            }

                            // 3. Fuzzy Match (Jaccard > 0.6) - Significantly Relaxed
                            const score = calculateUsingJaccardSimilarity(cachedLabel, fieldLabel);
                            if (score > 0.6) {
                                console.log(`🧠 MATCH (Fuzzy ${Math.round(score * 100)}%): "${fieldLabel}" ~= "${cachedLabel}"`);
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
            } else {
                console.log('🧠 Smart Memory is empty.');
            }
        }

        console.log(`⚡ Phase 1: ${Object.keys(heuristicMappings).length} fields mapped instantly.`);

        const hasPhase2 = unmapped.length > 0;
        let cumulativeMappings = { ...heuristicMappings };

        // 4. EXECUTE PHASE 1 FILL (Non-Blocking Visuals)
        if (Object.keys(heuristicMappings).length > 0) {
            await executeInstantFill({
                mappings: heuristicMappings,
                analysis: { fields },
                allFields: fields
            }, {
                resetHistory: true,
                cumulativeMappings,
                isFinal: !hasPhase2 // Only final if no phase 2
            });
        } else {
            // New session start
            activeFormUndoHistory = [];
        }

        // --- PHASE 2: AI REASONING (If needed) ---
        if (unmapped.length > 0) {
            console.log(`⚡ Phase 2: AI Needed for ${unmapped.length} complex fields:`, unmapped.map(f => f.name || f.id));

            showProcessingWidget('Thinking...', 2);

            // Use global FormAnalyzer but inject local context
            const originalCallAI = window.AIClient.callAI;

            // 4. Extract Page Context (Robust Multi-Tier Strategy)
            const pageContext = getJobContext();
            console.log('🧠 Scraped Job Context:', pageContext.substring(0, 150) + '...');

            console.log('🧠 Invoking AI for Contextual Filling...');

            // 5. Call AI (Robust with Retry)
            window.AIClient.callAI = async (prompt, sys, opts) => {
                const maxRetries = 3;
                let attempt = 0;

                while (attempt < maxRetries) {
                    try {
                        const result = await new Promise(resolve => {
                            chrome.runtime.sendMessage({
                                type: 'ANALYZE_WITH_AI',
                                payload: { prompt, system: sys, ...opts }
                            }, response => {
                                resolve(response);
                            });
                        });

                        // Check for success
                        if (result && result.success) return result.data;

                        // Check for Rate Limit explicitly
                        const errorMsg = (result?.error || '').toLowerCase();
                        if (errorMsg.includes('rate limit') || errorMsg.includes('quota')) {
                            console.warn(`⚡ AI Rate Limit Hit (Attempt ${attempt + 1}/${maxRetries}). Waiting...`);
                            showProcessingWidget(`Rate Limit... Waiting (${attempt + 1})`, 2);
                            const waitTime = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s
                            await new Promise(r => setTimeout(r, waitTime));
                            attempt++;
                            continue; // Retry
                        }

                        console.error('AI Error (No Retry):', result?.error || 'Unknown error');
                        return { success: false, error: result?.error || 'AI request failed' };

                    } catch (e) {
                        console.error('AI Comms Error:', e);
                        return { success: false, error: `Communication error: ${e.message}` };
                    }
                }
                showErrorToast('AI is busy (Rate Limit). Please try again in a minute.');
                return { success: false, error: 'Rate limit exceeded after retries' };
            };

            const aiResult = await window.FormAnalyzer.mapResumeToFields(unmapped, resumeData, pageContext);
            window.AIClient.callAI = originalCallAI; // Restore

            if (aiResult.success && aiResult.mappings) {
                console.log(`🧠 Phase 2: AI mapped ${Object.keys(aiResult.mappings).length} complex fields.`, aiResult.mappings);

                // Merge mappings
                cumulativeMappings = { ...cumulativeMappings, ...aiResult.mappings };

                // 6. EXECUTE PHASE 2 FILL
                showProcessingWidget('Finalizing...', 3);
                await executeInstantFill({
                    mappings: aiResult.mappings, // Only fill the NEW ones
                    analysis: { fields },
                    allFields: fields
                }, {
                    resetHistory: false, // Append to history
                    cumulativeMappings,
                    isFinal: true // This is the end
                });

                // --- SMART MEMORY SAVE ---
                console.log('🧠 Starting Smart Memory Save (Text-Only Mode)...');
                const newCacheEntries = {};

                // Allowed types for caching (High-value, low-noise)
                const ALLOWED_CACHE_TYPES = new Set(['text', 'textarea', 'email', 'tel', 'url', 'search']);

                Object.entries(aiResult.mappings).forEach(([selector, data]) => {
                    if (data.value && String(data.value).length < 500) {
                        const el = document.querySelector(selector);

                        // TEXT-ONLY FILTER: Prevents caching "Yes/No" radios or file inputs
                        if (el && ALLOWED_CACHE_TYPES.has(el.type || 'text')) {
                            const label = getFieldLabel(el);
                            if (label && label.length > 2) {
                                const key = normalizeSmartMemoryKey(label); // Robust Key
                                console.log(`🧠 Learning New Answer: "${key}" -> "${data.value.substring(0, 20)}..."`);
                                newCacheEntries[key] = {
                                    answer: data.value,
                                    timestamp: Date.now()
                                };
                            } else {
                                console.log(`🧠 Skipped Learning (Weak Label): Selector ${selector}, Label "${label}"`);
                            }
                        } else if (el) {
                            console.log(`🧠 Skipped Learning (Ignored Type): ${el.type}`);
                        }
                    }
                });

                if (Object.keys(newCacheEntries).length > 0) {
                    updateSmartMemoryCache(newCacheEntries);
                } else {
                    console.log('🧠 No valid entries to save to Smart Memory.');
                }

            } else {
                console.warn('⚡ Phase 2: AI returned no mappings.', aiResult);
            }
        } else {
            console.log('⚡ Phase 2 Skipped: All fields mapped locally.');
        }

        // Finalize
        showProcessingWidget('Done!', 4);
        setTimeout(() => removeProcessingWidget(), 800);

        // ENTERPRISE UPGRADE: Enable Global Learning on ALL fields (filled or skipped)
        activateSmartMemoryLearning();

        chrome.runtime.sendMessage({ type: 'FILL_COMPLETE' });

    } catch (error) {
        console.error('Processing failed:', error);
        showProcessingWidget('Error', -1);
        setTimeout(() => removeProcessingWidget(), 2000);
        showErrorToast(error.message);
    }
}


// ============ JOB CONTEXT EXTRACTION (Robust Multi-Tier) ============

let cachedJobContext = null;
let cachedUrl = null;

/**
 * Extract job context using intelligent multi-tier strategy
 * Priority: JSON-LD > Platform Selectors > Semantic Fallback
 */
function getJobContext() {
    // Cache per URL
    if (cachedUrl === window.location.href && cachedJobContext) {
        console.log('🧠 Using cached job context');
        return cachedJobContext;
    }

    let context = '';

    // Helper: Validate extracted content
    const isValid = (text) => text && text.trim().length > 20;

    // Helper: Clean and deduplicate text
    const cleanText = (text) => {
        return text
            .replace(/\s+/g, ' ') // Collapse whitespace
            .replace(/(.{50,}?)\1+/g, '$1') // Remove duplicates (rough heuristic)
            .trim();
    };

    // TIER 1: JSON-LD Structured Data (LinkedIn, Indeed, Glassdoor)
    try {
        const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of jsonLdScripts) {
            try {
                const data = JSON.parse(script.textContent);
                const jobData = data['@type'] === 'JobPosting' ? data : data.jobPosting;

                if (jobData && jobData.title) {
                    context = `Title: ${jobData.title || ''}\n`;
                    context += `Company: ${jobData.hiringOrganization?.name || ''}\n`;
                    context += `Location: ${jobData.jobLocation?.address?.addressLocality || ''}\n`;
                    context += `Description: ${cleanText(jobData.description || '')}`;

                    if (isValid(context)) {
                        console.log('🧠 ✅ Extracted from JSON-LD');
                        cachedJobContext = context;
                        cachedUrl = window.location.href;
                        return context;
                    }
                }
            } catch (e) {
                console.warn('🧠 JSON-LD parse error:', e.message);
            }
        }
    } catch (e) {
        console.warn('🧠 JSON-LD extraction failed:', e.message);
    }

    // TIER 2: Platform-Specific Selectors
    try {
        const hostname = window.location.hostname;

        // Greenhouse
        if (hostname.includes('greenhouse') || hostname.includes('boards')) {
            try {
                const title = document.querySelector('.app-title, h1.app-title')?.innerText || '';
                const company = document.querySelector('.company-name')?.innerText || '';
                const desc = document.querySelector('#content .section-wrapper')?.innerText || '';
                if (isValid(title + desc)) {
                    context = `Title: ${title}\nCompany: ${company}\nDescription: ${cleanText(desc.substring(0, 2000))}`;
                    console.log('🧠 ✅ Extracted from Greenhouse selectors');
                }
            } catch (e) {
                console.warn('🧠 Greenhouse extraction error:', e.message);
            }
        }
        // Lever
        else if (hostname.includes('lever.co') || hostname.includes('jobs.lever')) {
            try {
                const title = document.querySelector('.posting-headline h2')?.innerText || '';
                const company = document.querySelector('.main-header-text-logo')?.innerText || '';
                const desc = document.querySelector('.section-wrapper')?.innerText || '';
                if (isValid(title + desc)) {
                    context = `Title: ${title}\nCompany: ${company}\nDescription: ${cleanText(desc.substring(0, 2000))}`;
                    console.log('🧠 ✅ Extracted from Lever selectors');
                }
            } catch (e) {
                console.warn('🧠 Lever extraction error:', e.message);
            }
        }
        // Workday
        else if (hostname.includes('myworkday') || hostname.includes('wd')) {
            try {
                const title = document.querySelector('h2[data-automation-id="jobPostingHeader"]')?.innerText ||
                    document.querySelector('h3.css-12b42k6')?.innerText || '';
                const company = document.querySelector('[data-automation-id="company"]')?.innerText || '';
                const desc = document.querySelector('[data-automation-id="jobPostingDescription"]')?.innerText || '';
                if (isValid(title + desc)) {
                    context = `Title: ${title}\nCompany: ${company}\nDescription: ${cleanText(desc.substring(0, 2000))}`;
                    console.log('🧠 ✅ Extracted from Workday selectors');
                }
            } catch (e) {
                console.warn('🧠 Workday extraction error:', e.message);
            }
        }

        // If we got valid context from platform selectors, return it
        if (isValid(context)) {
            cachedJobContext = context;
            cachedUrl = window.location.href;
            return context;
        }
    } catch (e) {
        console.warn('🧠 Platform selector extraction failed:', e.message);
    }

    // TIER 3: Semantic Fallback (if nothing worked above)
    try {
        const title = document.title;
        const h1 = document.querySelector('h1')?.innerText || '';
        const h2 = document.querySelector('h2')?.innerText || '';
        const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
        const bodyText = document.body.innerText.substring(0, 2000);

        context = `Page Title: ${title}\nHeader: ${h1} | ${h2}\nMeta: ${metaDesc}\nContent: ${cleanText(bodyText)}`;
        console.log('🧠 ⚠️ Extracted from semantic fallback');
    } catch (e) {
        console.error('🧠 ❌ All context extraction methods failed:', e.message);
        context = 'Context extraction failed. Using resume data only.';
    }

    // Cache result
    cachedJobContext = context;
    cachedUrl = window.location.href;
    return context;
}


// ============ FORM UTILITIES ============

function detectForms() {
    return document.querySelectorAll('form, input, select, textarea').length > 0 ? 1 : 0;
}

// Self-Correction Logic: Learn from user edits
function attachSelfCorrectionTrigger(element) {
    if (!element) return;

    // Only text inputs (Filter noise)
    const ALLOWED_CACHE_TYPES = new Set(['text', 'textarea', 'email', 'tel', 'url', 'search']);
    if (!ALLOWED_CACHE_TYPES.has(element.type || 'text')) return;

    // Remove old listener to avoid dupes 
    if (element.dataset.hasSmartListener) return;

    element.addEventListener('change', (e) => {
        const newVal = e.target.value;
        if (newVal && newVal.trim().length > 0) {
            const label = getFieldLabel(e.target);
            if (label && label.length > 2) {
                const key = normalizeSmartMemoryKey(label);

                // Prevent learning "Profile Data" keys (heuristic check)
                // e.g. if key is "first name", "email", "phone" -> Ignore
                const IGNORED_KEYS = new Set(['first name', 'last name', 'email', 'phone', 'phone number', 'zip', 'city']);
                if (IGNORED_KEYS.has(key)) return;

                console.log(`🧠 Self-Correction: Updating "${key}" -> "${newVal.substring(0, 15)}..."`);

                const update = {};
                update[key] = { answer: newVal, timestamp: Date.now() };
                updateSmartMemoryCache(update);

                // Visual Feedback (Enterprise Polish)
                showSuccessToast('Smart Memory Learned 🧠');
                element.style.transition = 'box-shadow 0.3s';
                const originalShadow = element.style.boxShadow;
                element.style.boxShadow = '0 0 0 2px #10b981'; // Green flash
                setTimeout(() => element.style.boxShadow = originalShadow, 1000);
            }
        }
    });
    element.dataset.hasSmartListener = 'true';
}

function activateSmartMemoryLearning() {
    console.log('🧠 Activating Global Smart Learning...');
    const allInputs = document.querySelectorAll('input, textarea');
    allInputs.forEach(el => attachSelfCorrectionTrigger(el));
}

function extractFormHTML() {
    // Return outerHTML for analysis
    const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.querySelector('#content');
    return (main || document.body).outerHTML;
}

// ============ FILL LOGIC (Reused/Refined) ============

let activeFormUndoHistory = [];

/**
 * Execute Fill with support for Phases
 * @param {Object} data - Contains mappings to fill NOW
 * @param {Object} options - { resetHistory: boolean, cumulativeMappings: object, isFinal: boolean }
 */
async function executeInstantFill(data, options = { resetHistory: true, cumulativeMappings: null, isFinal: true }) {
    try {
        console.log('🚀 Executing Fill Batch...');

        if (options.resetHistory) {
            activeFormUndoHistory = [];
        }

        const mappingsToFill = data.mappings;
        const cumulativeState = options.cumulativeMappings || mappingsToFill; // Fallback if single phase
        const isFinal = options.isFinal !== false; // Default true

        // 1. Fill fields in this batch
        const totalFillCount = Object.keys(mappingsToFill).length;

        if (totalFillCount > 0) {
            // Iterate sequentially for Ghost Typer effect
            for (const [selector, fieldData] of Object.entries(mappingsToFill)) {
                // ... (Selector logic same as before)
                let element = null;
                try {
                    element = document.querySelector(selector);
                } catch (e) {
                    if (selector.startsWith('#')) {
                        try { element = document.querySelector('#' + CSS.escape(selector.substring(1))); }
                        catch (err) { element = document.getElementById(selector.substring(1)); }
                    } else if (selector.includes('#')) {
                        const parts = selector.split('#');
                        if (parts.length === 2) element = document.getElementById(parts[1]);
                    }
                }

                if (element && isFieldVisible(element)) {
                    captureFieldState(element);
                    element.scrollIntoView({ behavior: 'auto', block: 'center' }); // Minimal scroll

                    const confidence = fieldData.confidence || 0;
                    if (fieldData.value && !fieldData.skipped) {
                        await simulateTyping(element, fieldData.value, confidence);

                        // NEW: Attach Self-Correction Listener
                        attachSelfCorrectionTrigger(element);

                    } else {
                        highlightField(element, confidence);
                    }
                }
            }
        }


        // 2. Sidebar & Celebration -> ONLY if isFinal
        if (isFinal) {
            if (Object.keys(cumulativeState).length > 0) {
                triggerConfetti();
                updateSidebarWithState(cumulativeState);
            } else {
                showErrorToast('Analysis complete, but no matching fields were found.');
            }
        }

    } catch (error) {
        console.error('Fill error:', error);
        showErrorToast('Error during filling: ' + error.message);
    }
}

// Helper to render sidebar from a state object
function updateSidebarWithState(allMappings) {
    const highConfArray = [];
    const lowConfArray = [];

    Object.entries(allMappings).forEach(([selector, data]) => {
        const item = { selector, fieldData: data, confidence: data.confidence || 0 };
        if (data.confidence >= 0.9 && !data.skipped) highConfArray.push(item);
        else if (!data.skipped || data.isFileUpload) lowConfArray.push(item); // Include file uploads in low/review check? Or separate?
        // Sidebar logic separates files, let's just pass raw arrays and let showAccordionSidebar sort it
        // Wait, showAccordionSidebar expects specific separate arrays. 
        // Let's reuse showAccordionSidebar logic but pass processed lists.
    });

    // We can just call showAccordionSidebar, but wait, showAccordionSidebar expects "highConfidenceFields" and "lowConfidenceFields" 
    // where they are simple arrays of objects.

    // We need to wait a beat for animations to finish? No, immediate update is fine.
    // Debounce slightly to avoid flicker if phases are super fast?
    setTimeout(() => {
        showAccordionSidebar(highConfArray, lowConfArray);
    }, 500);
}

function captureFieldState(element) {
    try {
        let originalValue = element.value;
        const type = element.type;
        const isCheckbox = type === 'checkbox' || type === 'radio';

        if (isCheckbox) {
            originalValue = element.checked;
        }

        activeFormUndoHistory.push({
            element: element,
            value: originalValue,
            type: type,
            isCheckbox: isCheckbox,
            // Capture original inline styles to restore later
            originalStyles: {
                border: element.style.border,
                borderColor: element.style.borderColor,
                borderWidth: element.style.borderWidth,
                borderStyle: element.style.borderStyle,
                boxShadow: element.style.boxShadow,
                backgroundColor: element.style.backgroundColor,
                transition: element.style.transition
            }
        });
    } catch (e) {
        console.warn('Failed to capture state for', element);
    }
}

// ============ ENTERPRISE HELPERS (Setters, Animation, Validation) ============

function isFieldVisible(element) {
    if (!element) return false;
    try {
        const style = window.getComputedStyle(element);
        return (
            element.type !== 'hidden' &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            element.offsetWidth > 0 &&
            element.offsetHeight > 0
        );
    } catch { return false; }
}

// Helper: Universal Setter for React/Angular compatibility
function setNativeValue(element, value) {
    const lastValue = element.value;
    element.value = value;
    const event = new Event('input', { bubbles: true });
    // React 15/16 hack
    const tracker = element._valueTracker;
    if (tracker) {
        tracker.setValue(lastValue);
    }
    // Generic hack
    let descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    // Keep trying prototypes if not found (for some custom elements)
    if (!descriptor && window.HTMLTextAreaElement) {
        descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    }

    if (descriptor && descriptor.set) {
        descriptor.set.call(element, value);
    }

    element.dispatchEvent(event);
}

async function simulateTyping(element, value, confidence = 1.0) {
    if (!element || !value) return;

    // Add visual state
    element.classList.add('smarthirex-typing');
    element.focus();

    // Check if text input
    const isText = (element.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'color', 'file', 'date', 'time'].includes(element.type)) || element.tagName === 'TEXTAREA';

    if (isText) {
        // Use Native Setter for robust filling
        setNativeValue(element, '');

        const chars = String(value).split('');
        for (const char of chars) {
            const currentVal = element.value;
            setNativeValue(element, currentVal + char);

            // Random delay 10-20ms (Human-like but fast)
            await new Promise(r => setTimeout(r, Math.random() * 15 + 5));
        }
    } else {
        await new Promise(r => setTimeout(r, 100));
        setFieldValue(element, value);
    }

    element.classList.remove('smarthirex-typing');
    highlightField(element, confidence);
    dispatchChangeEvents(element);
    await new Promise(r => setTimeout(r, 50));
}

function setFieldValue(element, value) {
    const tagName = element.tagName;
    const type = element.type?.toLowerCase();

    if (tagName === 'INPUT') {
        if (type === 'radio') setRadioValue(element, value);
        else if (type === 'checkbox') setCheckboxValue(element, value);
        else if (['date', 'time', 'datetime-local'].includes(type)) setDateTimeValue(element, value);
        else if (type === 'file') highlightFileField(element);
        else setNativeValue(element, value); // React Safe
    } else if (tagName === 'TEXTAREA') {
        setNativeValue(element, value); // React Safe
    } else if (tagName === 'SELECT') {
        setSelectValue(element, value);
    }
    dispatchChangeEvents(element);
}

function setRadioValue(element, value) {
    const name = element.name;
    if (!name) {
        element.checked = (element.value == value || value === true || value === 'true');
        return;
    }
    const group = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
    let matched = false;
    group.forEach(r => {
        if (r.value.toLowerCase() === String(value).toLowerCase()) { r.checked = true; matched = true; }
    });
    // Fallback label match
    if (!matched) {
        group.forEach(r => {
            const l = findLabelText(r);
            if (l && l.toLowerCase().includes(String(value).toLowerCase())) { r.checked = true; matched = true; }
        });
    }
}

function setCheckboxValue(element, value) {
    const truthy = [true, 'true', 'yes', '1', 'on', 'checked'];
    element.checked = truthy.includes(String(value).toLowerCase());
}

function setDateTimeValue(element, value) {
    try {
        let val = value;
        const d = new Date(value);
        if (!isNaN(d.getTime())) {
            if (element.type === 'date') val = d.toISOString().split('T')[0];
            if (element.type === 'datetime-local') val = d.toISOString().slice(0, 16);
        }
        element.value = val;
    } catch (e) { element.value = value; }
}

function setTextValue(element, value) {
    // Bypass React tracker if possible
    try {
        const proto = element.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(element, value);
    } catch (e) { element.value = value; }
}

function setSelectValue(element, value) {
    element.value = value;
    if (element.value !== value) {
        // Try text match
        for (let i = 0; i < element.options.length; i++) {
            if (element.options[i].text.toLowerCase().includes(String(value).toLowerCase())) {
                element.selectedIndex = i; break;
            }
        }
    }
}

function dispatchChangeEvents(element) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    if (element.type === 'radio' || element.type === 'checkbox') element.click();
}

function findLabelText(element) {
    if (element.labels && element.labels[0]) return element.labels[0].textContent;
    if (element.id) {
        const l = document.querySelector(`label[for="${element.id}"]`);
        if (l) return l.textContent;
    }
    return '';
}

function highlightFileField(element) {
    element.style.outline = '3px solid #F59E0B';
    element.style.outlineOffset = '2px';
}

function highlightField(element, confidence = 1.0) {
    // Add classes (CSS injected by addAccordionStyles)
    let cls = 'smarthirex-filled-high';
    if (confidence <= 0.5) cls = 'smarthirex-filled-low';
    else if (confidence <= 0.9) cls = 'smarthirex-filled-medium';

    element.classList.add(cls);

    // Add Ripple Effect
    try {
        const rect = element.getBoundingClientRect();
        const ripple = document.createElement('div');
        ripple.className = 'smarthirex-ripple';
        // Use fixed positioning relative to viewport (matches getBoundingClientRect)
        ripple.style.position = 'fixed';
        ripple.style.left = rect.left + 'px';
        ripple.style.top = rect.top + 'px';
        ripple.style.width = rect.width + 'px';
        ripple.style.height = rect.height + 'px';
        ripple.style.borderRadius = window.getComputedStyle(element).borderRadius;

        document.body.appendChild(ripple);

        // Remove after animation
        setTimeout(() => ripple.remove(), 800);
    } catch (e) { console.error('Ripple error', e); }

    // Inline fallback if CSS fails
    if (!document.getElementById('smarthirex-accordion-styles')) {
        const c = String(cls).includes('high') ? '#10b981' : (String(cls).includes('medium') ? '#3b82f6' : '#ef4444');
        element.style.border = `2px solid ${c}`;
        element.style.backgroundColor = `${c}0d`;
    }
}

function highlightSubmitButton() {
    const btns = Array.from(document.querySelectorAll('button, input[type="submit"]'));
    const sub = btns.find(b => /submit|apply|next/i.test(b.textContent || b.value));
    if (sub) {
        sub.style.boxShadow = '0 0 0 4px rgba(16, 185, 129, 0.4)';
        sub.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// Helper: Normalize keys for robust matching
function normalizeSmartMemoryKey(text) {
    if (!text) return '';
    return text.toLowerCase()
        .replace(/[^\w\s]|_/g, ' ') // Replace punctuation with space
        .replace(/\s+/g, ' ')       // Collapse spaces
        .replace(/^(please\s+|enter\s+|provide\s+|kindly\s+|input\s+)/, '') // Remove command prefixes
        .trim();
}

function getFieldLabel(element) {
    let label = '';
    const type = element.type;
    const isGroup = type === 'radio' || type === 'checkbox';

    // 0. Group Label (Legend) - Highest Priority for Radios/Checkboxes
    if (isGroup) {
        const fieldset = element.closest('fieldset');
        if (fieldset) {
            const legend = fieldset.querySelector('legend');
            if (legend && legend.innerText.trim().length > 0) {
                return legend.innerText.trim();
            }
        }
    }

    // 1. Explicit Label
    if (element.labels && element.labels[0]) {
        label = element.labels[0].textContent;
    }
    // 2. Aria Label
    if (!label && element.getAttribute('aria-label')) {
        label = element.getAttribute('aria-label');
    }
    // 3. Placeholder
    if (!label && element.placeholder) {
        label = element.placeholder;
    }
    // 4. Name/ID (secondary fallback)
    if (!label) {
        label = (element.name || element.id || '').replace(/[_-]/g, ' ');
    }

    // 5. Parent Text Fallback (Crucial for Textareas without distinct labels)
    // Same heuristic as FormAnalyzer
    if ((!label || label.length < 3) && element.parentElement) {
        // Don't do this for radios/checkboxes as they usually have "Option Label" as parent text
        if (!isGroup) {
            const parentText = element.parentElement.innerText || '';
            // Remove own value/text to avoid noise
            const cleanText = parentText.replace(element.value || '', '').trim();
            if (cleanText.length > 0 && cleanText.length < 100) {
                label = cleanText;
            }
        }
    }

    return label.trim() || 'Field';
}

function getElementSelector(element) {
    if (element.id) {
        return `#${element.id}`;
    }
    if (element.name) {
        return `input[name="${element.name}"]`;
    }
    // Fallback: use tag + nth-of-type
    const parent = element.parentElement;
    if (parent) {
        const siblings = Array.from(parent.children).filter(child =>
            child.tagName === element.tagName
        );
        const index = siblings.indexOf(element) + 1;
        return `${element.tagName.toLowerCase()}:nth-of-type(${index})`;
    }
    return element.tagName.toLowerCase();
}


// ============ UI WIDGETS ============

// ============ PREMIUM UI WIDGETS ============

function showProcessingWidget(text, step) {
    let widget = document.getElementById('smarthirex-processing-widget');

    // Calculate progress percentage
    const maxSteps = 4;
    const progress = step > 0 ? Math.min((step / maxSteps) * 100, 100) : 0;

    if (!widget) {
        widget = document.createElement('div');
        widget.id = 'smarthirex-processing-widget';
        document.body.appendChild(widget);

        // Premium Neural Glass Styles
        const style = document.createElement('style');
        style.textContent = `
            #smarthirex-processing-widget {
                position: fixed; top: 32px; left: 50%; transform: translateX(-50%);
                background: rgba(15, 23, 42, 0.8); /* Dark Slate Background */
                backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                padding: 16px 24px; border-radius: 24px;
                box-shadow: 
                    0 20px 40px -10px rgba(0, 0, 0, 0.4),
                    0 0 0 1px rgba(255, 255, 255, 0.05),
                    0 0 30px rgba(10, 102, 194, 0.2); /* Blue Glow */
                display: flex; flex-direction: column; gap: 12px;
                z-index: 2147483647; font-family: 'Inter', system-ui, sans-serif;
                min-width: 380px; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                animation: widgetSlideDown 0.6s cubic-bezier(0.16, 1, 0.3, 1);
            }
            
            #smarthirex-processing-widget:hover {
                background: rgba(15, 23, 42, 0.9);
                box-shadow: 
                    0 30px 60px -12px rgba(0, 0, 0, 0.5),
                    0 0 0 1px rgba(10, 102, 194, 0.3),
                    0 0 40px rgba(10, 102, 194, 0.3);
            }

            @keyframes widgetSlideDown { from { transform: translate(-50%, -100%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
            
            .sh-widget-header { display: flex; align-items: center; gap: 14px; }
            
            /* AI Neural Pulse Animation */
            .sh-neural-loader { position: relative; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
            .sh-neural-core { width: 8px; height: 8px; background: #38bdf8; border-radius: 50%; box-shadow: 0 0 10px #38bdf8; z-index: 2; }
            .sh-neural-ring { 
                position: absolute; inset: 0; border-radius: 50%; 
                border: 2px solid transparent; border-top-color: #0ea5e9; border-right-color: #0ea5e9;
                animation: spin 1.5s linear infinite; 
            }
            .sh-neural-ring:nth-child(2) { 
                inset: -4px; border: 2px solid transparent; border-bottom-color: #6366f1; border-left-color: #6366f1;
                animation: spinReverse 2s linear infinite; opacity: 0.7;
            }
            
            @keyframes spin { to { transform: rotate(360deg); } }
            @keyframes spinReverse { to { transform: rotate(-360deg); } }
            
            .sh-content-col { display: flex; flex-direction: column; gap: 2px; }
            .sh-main-text { 
                font-size: 14px; font-weight: 600; color: #f1f5f9; letter-spacing: -0.2px;
                text-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }
            .sh-sub-text { font-size: 11px; color: #94a3b8; font-weight: 500; letter-spacing: 0.5px; text-transform: uppercase; }
            
            /* Progress Bar */
            .sh-progress-track {
                width: 100%; height: 4px; background: rgba(255, 255, 255, 0.1); border-radius: 2px; overflow: hidden;
                position: relative;
            }
            .sh-progress-fill {
                height: 100%; background: linear-gradient(90deg, #38bdf8, #818cf8);
                border-radius: 2px; transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                box-shadow: 0 0 10px rgba(56, 189, 248, 0.5);
                position: relative;
            }
            /* Shimmer on progress bar */
            .sh-progress-fill::after {
                content: ''; position: absolute; top: 0; left: 0; bottom: 0; right: 0;
                background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
                transform: translateX(-100%); animation: shimmer 1.5s infinite;
            }
            @keyframes shimmer { 100% { transform: translateX(100%); } }
        `;
        document.head.appendChild(style);
    }

    if (step === -1) {
        widget.innerHTML = `
            <div class="sh-widget-header">
                <div style="font-size:20px">⚠️</div>
                <div class="sh-content-col">
                    <div class="sh-main-text" style="color:#fca5a5">${text}</div>
                </div>
            </div>
        `;
        return;
    }

    widget.innerHTML = `
        <div class="sh-widget-header">
            <div class="sh-neural-loader">
                <div class="sh-neural-core"></div>
                <div class="sh-neural-ring"></div>
                <div class="sh-neural-ring"></div>
            </div>
            <div class="sh-content-col">
                <div class="sh-main-text">${text}</div>
                ${step > 0 ? `<div class="sh-sub-text">STEP ${step} OF ${maxSteps}</div>` : ''}
            </div>
        </div>
        ${step > 0 ? `
            <div class="sh-progress-track">
                <div class="sh-progress-fill" style="width: ${progress}%"></div>
            </div>
        ` : ''}
    `;
}

function removeProcessingWidget() {
    const w = document.getElementById('smarthirex-processing-widget');
    if (w) {
        w.style.opacity = '0'; w.style.transform = 'translate(-50%, -20px)';
        setTimeout(() => w.remove(), 300);
    }
}

function showSuccessToast(filled, review) {
    const existing = document.getElementById('smarthirex-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'smarthirex-toast';
    toast.style.cssText = `
        position: fixed; top: 24px; left: 24px;
        background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
        border: 1px solid #e2e8f0; border-radius: 12px;
        padding: 16px 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.15);
        z-index: 999999; display: flex; gap: 12px; min-width: 300px;
        animation: slideInLeft 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    toast.innerHTML = `
        <div style="font-size:24px">${filled > 0 ? '✅' : '📋'}</div>
        <div style="flex:1">
            <div style="font-weight:700; color:#0f172a; font-size:15px; margin-bottom:4px">
                ${filled > 0 ? `Filled ${filled} fields` : 'Ready to review'}
            </div>
            ${review > 0 ? `<div style="color:#d97706; font-size:13px; font-weight:500">Action required: ${review} fields</div>` :
            `<div style="color:#059669; font-size:13px; font-weight:500">All fields filled!</div>`}
        </div>
        ${filled > 0 ? `
            <button id="smarthirex-undo-btn" style="
                background: #f1f5f9; border: none; padding: 8px 12px;
                border-radius: 8px; font-size: 13px; font-weight: 600; color: #475569;
                cursor: pointer; transition: all 0.2s; align-self: center;
                display: flex; align-items: center; gap: 4px;
            ">
                ↩️ Undo
            </button>
        ` : ''}
    `;
    document.body.appendChild(toast);

    // Add Event Listener
    const undoBtn = toast.querySelector('#smarthirex-undo-btn');
    if (undoBtn) {
        undoBtn.addEventListener('click', async () => {
            undoBtn.innerHTML = 'Thinking...';
            undoBtn.style.opacity = '0.7';
            await undoFormFill();
            toast.remove();
        });

        undoBtn.addEventListener('mouseenter', () => { undoBtn.style.background = '#e2e8f0'; });
        undoBtn.addEventListener('mouseleave', () => { undoBtn.style.background = '#f1f5f9'; });
    }

    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 8000); // Slightly longer for people to find Undo
}

function showAccordionSidebar(highConfidenceFields, lowConfidenceFields) {
    console.log('🎯 SmartHireX: Showing accordion sidebar...');
    console.log(`High-conf: ${highConfidenceFields.length}, Low-conf: ${lowConfidenceFields.length}`);

    // Remove existing sidebar if any
    const existing = document.getElementById('smarthirex-accordion-sidebar');
    if (existing) existing.remove();

    // Prepare high-confidence field info
    const autoFilledFields = highConfidenceFields.map(item => {
        const element = document.querySelector(item.selector);
        if (!element || !isFieldVisible(element)) return null;

        let label = item.fieldData.label || getFieldLabel(element);
        return {
            field: element,
            selector: item.selector,
            label,
            confidence: item.confidence,
            fieldType: item.fieldData.field_type || element.type || 'text',
            isFileUpload: false
        };
    }).filter(Boolean);

    // Prepare low-confidence field info  
    const needsReviewFields = lowConfidenceFields.map(item => {
        const element = document.querySelector(item.selector);
        if (!element || !isFieldVisible(element)) return null;

        let label = item.fieldData.label || getFieldLabel(element);
        return {
            field: element,
            selector: item.selector,
            label,
            confidence: item.confidence,
            fieldType: item.fieldData.field_type || element.type || 'text',
            isFileUpload: false
        };
    }).filter(Boolean);

    // Detect file upload fields
    const fileUploadFields = [];
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach(fileInput => {
        if (!isFieldVisible(fileInput)) return;

        let label = getFieldLabel(fileInput) || 'File Upload';

        if (!fileInput.files || fileInput.files.length === 0) {
            fileUploadFields.push({
                field: fileInput,
                selector: getElementSelector(fileInput),
                label,
                confidence: 1.0,
                fieldType: 'file',
                isFileUpload: true
            });
        }
    });

    if (autoFilledFields.length === 0 && needsReviewFields.length === 0 && fileUploadFields.length === 0) {
        console.log('No fields to show in sidebar');
        return;
    }

    // Create accordion sidebar panel
    const panel = document.createElement('div');
    panel.id = 'smarthirex-accordion-sidebar';
    panel.innerHTML = `
        <div class="sidebar-header">
            <div class="header-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                </svg>
                <span>Form Review</span>
            </div>
            <button class="close-btn" id="smarthirex-sidebar-close" aria-label="Close Sidebar" style="
                display: block !important;
                width: 24px !important;
                height: 24px !important;
                background-image: url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22white%22 stroke-width=%223%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpath d=%22M18 6L6 18M6 6l12 12%22/%3E%3C/svg%3E') !important;
                background-repeat: no-repeat !important;
                background-position: center !important;
                background-size: 16px 16px !important;
                background-color: rgba(255, 255, 255, 0.2) !important;
                border: 1px solid rgba(255, 255, 255, 0.3) !important;
                border-radius: 6px !important;
                cursor: pointer !important;
                padding: 0 !important;
                margin: 0 !important;
                min-width: 24px !important;
                color: transparent !important; /* Hide any text leak */
            ">
            </button>
        </div>
        
        <div class="sidebar-content-scroll" style="flex: 1; overflow-y: auto; overflow-x: hidden;">
            ${autoFilledFields.length > 0 ? `
                <div class="accordion-section">
                    <div class="section-header collapsed" data-section="autofilled">
                        <div class="section-title">
                            <span class="section-icon">✅</span>
                            <span class="section-label">AUTO-FILLED</span>
                            <span class="section-count">(${autoFilledFields.length})</span>
                        </div>
                        <svg class="toggle-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </div>
                    <div class="section-content" id="autofilled-content">
                        <div class="section-inner-wrapper">
                        ${autoFilledFields.map((item, i) => `
                            <div class="field-item success-field" data-field-idx="auto-${i}">
                                <div class="field-info">
                                    <div class="field-label">${item.label}</div>
                                    <div class="field-meta">
                                        <span class="field-type">${item.fieldType.toUpperCase()}</span>
                                        <span class="field-confidence medium">${Math.round(item.confidence * 100)}%</span>
                                    </div>
                                </div>
                                <svg class="field-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                    <polyline points="9 18 15 12 9 6"/>
                                </svg>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            ` : ''}
            
            ${needsReviewFields.length > 0 ? `
                <div class="accordion-section">
                    <div class="section-header expanded" data-section="needs-review">
                        <div class="section-title">
                            <span class="section-icon">⚠️</span>
                            <span class="section-label">NEEDS REVIEW</span>
                            <span class="section-count">(${needsReviewFields.length})</span>
                        </div>
                        <svg class="toggle-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </div>
                    <div class="section-content expanded" id="needsreview-content">
                        <div class="section-inner-wrapper">
                        ${needsReviewFields.map((item, i) => {
        const isTextBased = ['text', 'textarea', 'email', 'tel', 'url', 'search'].includes(item.fieldType);
        return `
                            <div class="field-item warning-field" data-field-idx="review-${i}" data-selector="${item.selector}" data-field-type="${item.fieldType}">
                                <div class="field-info">
                                    <div class="field-label">${item.label}</div>
                                    <div class="field-meta">
                                        <span class="field-type">${item.fieldType.toUpperCase()}</span>
                                        <span class="field-confidence ${item.confidence >= 0.7 ? 'medium' : 'low'}">${Math.round(item.confidence * 100)}%</span>
                                    </div>
                                </div>
                                <div class="field-actions">
                                    ${isTextBased ? `
                                        <button class="regenerate-btn" data-selector="${item.selector}" data-label="${item.label}" title="Regenerate with AI" aria-label="Regenerate field">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                                            </svg>
                                        </button>
                                    ` : ''}
                                    <svg class="field-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                        <polyline points="9 18 15 12 9 6"/>
                                    </svg>
                                </div>
                            </div>
                        `;
    }).join('')}
                    </div>
                </div>
            </div>
            ` : ''}
            
            ${fileUploadFields.length > 0 ? `
                <div class="accordion-section">
                    <div class="section-header expanded" data-section="file-uploads">
                        <div class="section-title">
                            <span class="section-icon">📎</span>
                            <span class="section-label">FILE UPLOADS</span>
                            <span class="section-count">(${fileUploadFields.length})</span>
                        </div>
                        <svg class="toggle-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </div>
                    <div class="section-content expanded" id="fileuploads-content">
                        <div class="section-inner-wrapper">
                        ${fileUploadFields.map((item, i) => `
                            <div class="field-item file-field" data-field-idx="file-${i}">
                                <div class="field-info">
                                    <div class="field-label">${item.label}</div>
                                    <div class="field-meta">
                                        <span class="field-type">FILE</span>
                                        <span class="field-badge">Required</span>
                                    </div>
                                </div>
                                <svg class="field-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                    <polyline points="9 18 15 12 9 6"/>
                                </svg>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            ` : ''}
        </div>

        <div class="sidebar-footer" style="padding: 16px 20px; border-top: 1px solid #f1f5f9; background: #fff; margin-top: auto;">
             <button id="smarthirex-sidebar-undo" style="
                width: 100%;
                padding: 10px;
                background: #fef2f2;
                border: 1px solid #fecaca;
                border-radius: 8px;
                color: #ef4444;
                font-weight: 600;
                font-size: 13px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                cursor: pointer;
                transition: all 0.2s;
            ">
                <span style="font-size: 14px;">↩️</span> Undo Fill
            </button>
        </div>
    `;

    // Add accordion styles
    addAccordionStyles();

    document.body.appendChild(panel);

    // Add close handler securely
    const sidebarCloseBtn = panel.querySelector('#smarthirex-sidebar-close');
    if (sidebarCloseBtn) {
        sidebarCloseBtn.addEventListener('click', () => {
            const sidebar = document.getElementById('smarthirex-accordion-sidebar');
            if (sidebar) sidebar.remove();
            document.querySelectorAll('.smarthirex-field-highlight').forEach(el => el.classList.remove('smarthirex-field-highlight'));
            hideConnectionBeam(); // Clean up beam
        });
    }

    // Footer Undo Handler
    const undoBtn = panel.querySelector('#smarthirex-sidebar-undo');
    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            showUndoConfirmationModal();
        });
        undoBtn.addEventListener('mouseenter', () => { undoBtn.style.background = '#fee2e2'; undoBtn.style.color = '#dc2626'; });
        undoBtn.addEventListener('mouseleave', () => { undoBtn.style.background = '#fef2f2'; undoBtn.style.color = '#ef4444'; });
    }

    // Highlight fields that need review
    needsReviewFields.forEach(item => {
        item.field.classList.add('smarthirex-field-highlight');
    });

    // Add toggle handlers for accordion sections
    const headers = panel.querySelectorAll('.section-header');
    headers.forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const isExpanded = header.classList.contains('expanded');

            if (isExpanded) {
                // Close this section
                header.classList.remove('expanded');
                header.classList.add('collapsed');
                content.classList.remove('expanded');
            } else {
                // Close all other sections first
                headers.forEach(otherHeader => {
                    const otherContent = otherHeader.nextElementSibling;
                    otherHeader.classList.remove('expanded');
                    otherHeader.classList.add('collapsed');
                    otherContent.classList.remove('expanded');
                });

                // Then open this section
                header.classList.remove('collapsed');
                header.classList.add('expanded');
                content.classList.add('expanded');
            }
        });
    });

    // Add click handlers for field items  
    const allFields = [...autoFilledFields, ...needsReviewFields, ...fileUploadFields];
    panel.querySelectorAll('.field-item').forEach((fieldItem, index) => {
        const field = allFields[Math.min(index, allFields.length - 1)];
        if (field) {
            fieldItem.addEventListener('click', () => {
                field.field.scrollIntoView({ behavior: 'smooth', block: 'center' });
                field.field.focus();
            });

            // Spotlight Hover Effect
            fieldItem.addEventListener('mouseenter', () => {
                field.field.classList.add('smarthirex-spotlight');
                // Scroll if needed, but maybe less aggressive? Keep gentle scroll.
                field.field.scrollIntoView({ behavior: 'smooth', block: 'center' });
                showConnectionBeam(fieldItem, field.field);
            });

            fieldItem.addEventListener('mouseleave', () => {
                field.field.classList.remove('smarthirex-spotlight');
                hideConnectionBeam();
            });
        }
    });
}

// Global variable to manage the animation loop
let beamAnimationFrameId = null;

function showConnectionBeam(sourceEl, targetEl) {
    hideConnectionBeam(); // Clear existing

    if (!sourceEl || !targetEl || !isFieldVisible(targetEl)) return;

    // Create SVG Overlay
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = 'smarthirex-connection-beam';
    svg.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 2147483646; /* Just below the sidebar */
        overflow: visible;
    `;

    // Create Path
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "url(#beamGradient)");
    path.setAttribute("stroke-width", "2"); // Thinner, more elegant
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-dasharray", "4, 6"); // Dotted/Dashed pattern
    path.setAttribute("filter", "url(#glow)");
    path.style.transition = "opacity 0.2s ease";

    // Continuous flowing data effect (FANG style)
    path.style.animation = "flowBeam 1s linear infinite";

    // Create Gradient Definition
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
        <linearGradient id="beamGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:0.8" />
            <stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:0.8" />
        </linearGradient>
        <filter id="glow">
            <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
            <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
            </feMerge>
        </filter>
    `;

    svg.appendChild(defs);
    svg.appendChild(path);
    document.body.appendChild(svg);

    // Add glowing dot at target
    const targetDot = document.createElement('div');
    targetDot.id = 'smarthirex-beam-target';
    targetDot.style.cssText = `
        position: fixed;
        width: 8px;
        height: 8px;
        background: #8b5cf6;
        border-radius: 50%;
        box-shadow: 0 0 8px #8b5cf6, 0 0 16px #8b5cf6;
        z-index: 2147483647;
        pointer-events: none;
        transform: scale(0);
        opacity: 0; 
        animation: popIn 0.3s cubic-bezier(0.17, 0.67, 0.83, 0.67) 0.1s forwards;
    `;
    document.body.appendChild(targetDot);

    // Animation / Tracking Loop
    function updateBeam() {
        if (!sourceEl || !targetEl || !document.getElementById('smarthirex-connection-beam')) {
            cancelAnimationFrame(beamAnimationFrameId);
            return;
        }

        const sourceRect = sourceEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();

        const startX = sourceRect.right;
        const startY = sourceRect.top + (sourceRect.height / 2);
        const endX = targetRect.left;
        const endY = targetRect.top + (targetRect.height / 2);

        // Control points
        const deltaX = endX - startX;
        const cp1x = startX + (deltaX * 0.4);
        const cp1y = startY;
        const cp2x = endX - (deltaX * 0.4);
        const cp2y = endY;

        const d = `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
        path.setAttribute("d", d);

        // Update target dot position
        targetDot.style.left = `${endX - 4}px`;
        targetDot.style.top = `${endY - 4}px`;

        // Request next frame
        beamAnimationFrameId = requestAnimationFrame(updateBeam);
    }

    // Start tracking
    updateBeam();
}

function hideConnectionBeam() {
    if (beamAnimationFrameId) {
        cancelAnimationFrame(beamAnimationFrameId);
        beamAnimationFrameId = null;
    }
    const beam = document.getElementById('smarthirex-connection-beam');
    if (beam) beam.remove();

    const dot = document.getElementById('smarthirex-beam-target');
    if (dot) dot.remove();
}

function addAccordionStyles() {
    if (document.getElementById('smarthirex-accordion-styles')) return;

    const style = document.createElement('style');
    style.id = 'smarthirex-accordion-styles';
    style.textContent = `
        #smarthirex-accordion-sidebar {
            position: fixed;
            bottom: 24px;
            left: 24px;
            width: 360px;
            max-height: 80vh;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            box-shadow: 
                0 4px 6px -1px rgba(0, 0, 0, 0.1),
                0 2px 4px -1px rgba(0, 0, 0, 0.06),
                0 0 0 1px rgba(0,0,0,0.05);
            z-index: 2147483647;
            font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            animation: slideInFromBottomLeft 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .sidebar-content-scroll::-webkit-scrollbar {
            width: 6px;
        }
        .sidebar-content-scroll::-webkit-scrollbar-track {
            background: transparent;
        }
        .sidebar-content-scroll::-webkit-scrollbar-thumb {
            background-color: #cbd5e1;
            border-radius: 3px;
        }

        @keyframes flowBeam {
            to { stroke-dashoffset: -20; }
        }
        
        @keyframes popIn {
            from { transform: scale(0); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
        }


        
        @keyframes slideInFromBottomLeft {
            from {
                opacity: 0;
                transform: translateY(40px) translateX(-20px) scale(0.95);
            }
            to {
                opacity: 1;
                transform: translateY(0) translateX(0) scale(1);
            }
        }
        
        #smarthirex-accordion-sidebar .sidebar-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            background: #0a66c2;
            color: white;
            border-radius: 8px 8px 0 0;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        
        #smarthirex-accordion-sidebar .header-title {
            display: flex;
            align-items: center;
            gap: 10px;
            font-weight: 700;
            font-size: 15px;
            color: white;
            letter-spacing: -0.01em;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }

        #smarthirex-accordion-sidebar .header-title svg {
            color: white;
            opacity: 0.9;
        }
        
        #smarthirex-accordion-sidebar .close-btn {
            background: rgba(255, 255, 255, 0.25);
            border: 1px solid rgba(255, 255, 255, 0.4);
            color: #ffffff !important;
            width: 28px;
            height: 28px;
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            backdrop-filter: blur(4px);
        }
        
        #smarthirex-accordion-sidebar .close-btn svg {
            stroke: #ffffff !important;
        }
        
        #smarthirex-accordion-sidebar .close-btn:hover {
            background: rgba(255, 255, 255, 0.25);
            color: white;
            transform: scale(1.05);
            border-color: rgba(255, 255, 255, 0.4);
        }
        
        #smarthirex-accordion-sidebar .accordion-section {
            border-bottom: 1px solid #e5e7eb;
        }
        
        #smarthirex-accordion-sidebar .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 20px 14px 17px;
            cursor: pointer;
            transition: all 0.2s;
            user-select: none;
            background: #f8fafc;
            border: 1px solid rgba(10,102,194,0.15);
            border-left: 3px solid #0a66c2;
            box-shadow: 0 1px 2px rgba(0,0,0,0.02);
        }
        
        #smarthirex-accordion-sidebar .section-header:hover {
            background: #f9fafb;
        }
        
        #smarthirex-accordion-sidebar .section-title {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 600;
            font-size: 13px;
            color: #374151;
        }
        
        #smarthirex-accordion-sidebar .section-icon {
            font-size: 16px;
        }
        
        #smarthirex-accordion-sidebar .section-count {
            color: #6b7280;
            font-weight: 500;
        }
        
        #smarthirex-accordion-sidebar .toggle-icon {
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            color: #9ca3af;
        }
        
        #smarthirex-accordion-sidebar .section-header.expanded .toggle-icon {
            transform: rotate(180deg);
        }
        
        #smarthirex-accordion-sidebar .section-content {
            display: grid;
            grid-template-rows: 0fr;
            transition: grid-template-rows 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        #smarthirex-accordion-sidebar .section-content.expanded {
            grid-template-rows: 1fr;
        }

        #smarthirex-accordion-sidebar .section-inner-wrapper {
            overflow: hidden;
            opacity: 0;
            transform: translateY(-10px);
            transition: opacity 0.3s ease, transform 0.3s ease;
        }

        #smarthirex-accordion-sidebar .section-content.expanded .section-inner-wrapper {
            opacity: 1;
            transform: translateY(0);
        }
        
        #smarthirex-accordion-sidebar .field-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 20px;
            cursor: pointer;
            transition: all 0.2s;
            border-left: 3px solid transparent;
            border-bottom: 1px solid #f3f4f6;
            background: #f9fafb;
        }
        
        #smarthirex-accordion-sidebar .field-item:hover {
            background: #eff0f3ff;
            border-left-color: #64748b;
        }
        
        #smarthirex-accordion-sidebar .field-info {
            flex: 1;
        }
        
        #smarthirex-accordion-sidebar .field-meta {
            display: flex;
            gap: 8px;
            font-size: 11px;
        }
        
        #smarthirex-accordion-sidebar .field-type {
            color: #6b7280;
            font-weight: 500;
        }
        
        #smarthirex-accordion-sidebar .field-confidence {
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
        }
        
        #smarthirex-accordion-sidebar .field-confidence.low {
            background: #fef2f2;
            color: #b91c1c;
            border: 1px solid #fecaca;
        }
        
        #smarthirex-accordion-sidebar .field-confidence.medium {
            background: #eff6ff;
            color: #0a66c2;
            border: 1px solid #dbeafe;
        }
        
        #smarthirex-accordion-sidebar .field-badge {
            color: #10b981;
            font-weight: 600;
        }
        
        #smarthirex-accordion-sidebar .field-arrow {
            color: #d1d5db;
            transition: all 0.2s;
        }
        
        #smarthirex-accordion-sidebar .field-item:hover .field-arrow {
            color: #8b5cf6;
            transform: translateX(4px);
        }
        
        .smarthirex-field-highlight {
            outline: 2px solid #f59e0b !important;
            outline-offset: 2px !important;
            animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite !important;
        }
        
        @keyframes pulse {
            0%, 100% { outline-color: #f59e0b; }
            50% { outline-color: #fbbf24; }
        }

        /* PREMIUM GHOST TYPER STYLES - "Magical Shimmer" */
        .smarthirex-typing {
            background: linear-gradient(
                90deg, 
                rgba(10, 102, 194, 0.0) 0%, 
                rgba(10, 102, 194, 0.1) 25%, 
                rgba(10, 102, 194, 0.25) 50%, 
                rgba(10, 102, 194, 0.1) 75%, 
                rgba(10, 102, 194, 0.0) 100%
            ) !important;
            background-size: 200% 100% !important;
            animation: magicalShimmer 1s infinite linear !important;
            border-color: #0a66c2 !important;
            box-shadow: 
                0 0 0 4px rgba(10, 102, 194, 0.15),
                0 0 15px rgba(10, 102, 194, 0.2) !important;
            transition: all 0.2s ease !important;
            position: relative !important;
        }

        @keyframes magicalShimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
        }
        
        .smarthirex-filled {
            background-color: rgba(16, 185, 129, 0.05) !important;
            border-color: #10b981 !important;
            transition: background-color 0.5s ease !important;
        }

        .smarthirex-filled-high {
            background-color: rgba(16, 185, 129, 0.05) !important;
            border: 2px solid #10b981 !important;
            outline: none !important;
            transition: all 0.3s ease !important;
        }
        
        .smarthirex-filled-medium {
            background-color: rgba(59, 130, 246, 0.05) !important;
            border: 2px solid #3b82f6 !important;
            outline: none !important;
            transition: all 0.3s ease !important;
        }
        
        .smarthirex-filled-low {
            background-color: rgba(239, 68, 68, 0.05) !important;
            border: 2px solid #ef4444 !important;
            outline: none !important;
            transition: all 0.3s ease !important;
        }

        .smarthirex-spotlight {
            /* box-shadow: removed as per request */
            transform: scale(1.02);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            z-index: 10000;
            position: relative;
        }

        .smarthirex-confetti {
            position: fixed;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            pointer-events: none;
            z-index: 100000;
            animation: confetti-explode 0.8s ease-out forwards;
        }

        @keyframes confetti-explode {
            0% { transform: translate(0,0) scale(1); opacity: 1; }
            100% { transform: translate(var(--tx), var(--ty)) scale(0); opacity: 0; }
        }
    `;

    document.head.appendChild(style);
}

function undoFormFill() {
    if (activeFormUndoHistory.length === 0) {
        showErrorToast('Nothing to undo.');
        return { success: false };
    }

    showProcessingWidget('Reverting changes...', 0); // 0 step basically just shows text

    console.log(`Rewinding ${activeFormUndoHistory.length} changes...`);

    // Reverse iterate to undo in reverse order
    for (let i = activeFormUndoHistory.length - 1; i >= 0; i--) {
        const item = activeFormUndoHistory[i];
        const el = item.element;

        try {
            if (item.isCheckbox) {
                el.checked = item.value;
            } else {
                el.value = item.value;
            }
            // Trigger events to notify page scripts
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));

            // Remove highlight classes
            el.classList.remove(
                'smarthirex-filled-high',
                'smarthirex-filled-medium',
                'smarthirex-filled-low',
                'smarthirex-filled',
                'smarthirex-field-highlight', // Fix: remove yellow border
                'smarthirex-spotlight',       // Fix: remove hover effect if stuck
                'smarthirex-typing'           // Fix: remove typing effect if stuck
            );

            // Restore original inline styles
            if (item.originalStyles) {
                el.style.border = item.originalStyles.border;
                el.style.borderColor = item.originalStyles.borderColor;
                el.style.borderWidth = item.originalStyles.borderWidth;
                el.style.borderStyle = item.originalStyles.borderStyle;
                el.style.boxShadow = item.originalStyles.boxShadow;
                el.style.backgroundColor = item.originalStyles.backgroundColor;
                el.style.transition = item.originalStyles.transition;
            } else {
                // Fallback if no styles captured
                el.style.border = '';
                el.style.boxShadow = '';
                el.style.backgroundColor = '';
            }

            // Fast visual feedback (blink red then revert)
            el.style.transition = 'all 0.2s';
            const originalBoxShadow = item.originalStyles?.boxShadow || '';
            el.style.boxShadow = `0 0 0 2px #ef4444, ${originalBoxShadow}`;

            setTimeout(() => {
                if (el) {
                    el.style.boxShadow = item.originalStyles?.boxShadow || '';
                    // Ensure transition is reset to original
                    if (item.originalStyles && item.originalStyles.transition) {
                        el.style.transition = item.originalStyles.transition;
                    } else {
                        el.style.transition = '';
                    }
                }
            }, 300);

        } catch (e) {
            console.error('Undo failed for element', el);
        }
    }

    activeFormUndoHistory = []; // Clear history
    removeProcessingWidget();

    // Close sidebar if open
    const sidebar = document.getElementById('smarthirex-accordion-sidebar');
    if (sidebar) sidebar.remove();

    // Ensure beam is gone
    hideConnectionBeam();

    return { success: true };
}

function showUndoConfirmationModal() {
    const existing = document.getElementById('smarthirex-undo-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'smarthirex-undo-modal-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px);
        z-index: 2147483647; display: flex; align-items: center; justify-content: center;
        animation: fadeIn 0.2s ease-out;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
    `;

    overlay.innerHTML = `
        <div id="smarthirex-undo-modal" style="
            background: white; width: 400px; max-width: 90%;
            border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            overflow: hidden; animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        ">
            <div style="padding: 24px; text-align: center;">
                <div style="
                    width: 48px; height: 48px; background: #fee2e2; color: #ef4444;
                    border-radius: 50%; font-size: 24px; display: flex; align-items: center; justify-content: center;
                    margin: 0 auto 16px auto;
                ">
                    ↩️
                </div>
                <h3 style="margin: 0 0 8px 0; color: #1e293b; font-size: 18px; font-weight: 700;">Revert AI Changes?</h3>
                <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.5;">
                    This will clear all fields filled by SmartHireX and restore the form to its original state. Are you sure?
                </p>
            </div>
            <div style="
                background: #f8fafc; padding: 16px 24px; border-top: 1px solid #e2e8f0;
                display: flex; gap: 12px; justify-content: flex-end;
            ">
                <button id="smarthirex-modal-cancel" style="
                    padding: 10px 20px; border-radius: 8px; border: 1px solid #e2e8f0;
                    background: white; color: #64748b; font-weight: 600; cursor: pointer;
                    font-size: 14px; transition: all 0.2s;
                ">Cancel</button>
                <button id="smarthirex-modal-confirm" style="
                    padding: 10px 20px; border-radius: 8px; border: none;
                    background: #ef4444; color: white; font-weight: 600; cursor: pointer;
                    font-size: 14px; transition: all 0.2s; box-shadow: 0 2px 4px rgba(239, 68, 68, 0.2);
                ">Yes, Revert</button>
            </div>
        </div>
    `;

    // Animation Styles
    if (!document.getElementById('smarthirex-modal-styles')) {
        const style = document.createElement('style');
        style.id = 'smarthirex-modal-styles';
        style.textContent = `
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
            #smarthirex-modal-cancel:hover { background: #f1f5f9; color: #475569; }
            #smarthirex-modal-confirm:hover { background: #dc2626; box-shadow: 0 4px 6px rgba(239, 68, 68, 0.3); }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(overlay);

    // Event Listeners
    const cancelBtn = overlay.querySelector('#smarthirex-modal-cancel');
    const confirmBtn = overlay.querySelector('#smarthirex-modal-confirm');

    cancelBtn.onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    confirmBtn.onclick = async () => {
        confirmBtn.innerHTML = 'Reverting...';
        confirmBtn.style.opacity = '0.8';
        await undoFormFill();
        overlay.remove();
    };
}

function triggerConfetti() {
    console.log('🎉 SmartHireX: Triggering Full-Screen Celebration!');
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];
    const particleCount = 150;

    for (let i = 0; i < particleCount; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'smarthirex-confetti';

        // Random properties
        const bg = colors[Math.floor(Math.random() * colors.length)];
        const left = Math.random() * 100; // 0% to 100% width
        const animDuration = 3 + Math.random() * 2; // 3-5s fall
        const animDelay = Math.random() * 0.5; // Stagger start

        confetti.style.cssText = `
            position: fixed;
            top: -20px;
            left: ${left}vw;
            width: 10px; height: 10px;
            background-color: ${bg};
            border-radius: 2px;
            z-index: 2147483647;
            pointer-events: none;
            opacity: 0;
            transform: rotate(${Math.random() * 360}deg);
            animation: confettiFall ${animDuration}s linear ${animDelay}s forwards;
        `;

        // Random shapes (circles and squares)
        if (Math.random() > 0.5) confetti.style.borderRadius = '50%';

        document.body.appendChild(confetti);

        // Cleanup after animation
        setTimeout(() => confetti.remove(), (animDuration + animDelay) * 1000);
    }

    // Ensure animation keyframes exist
    if (!document.getElementById('smarthirex-confetti-anim')) {
        const s = document.createElement('style');
        s.id = 'smarthirex-confetti-anim';
        s.textContent = `
            @keyframes confettiFall {
                0% { opacity: 1; top: -10vh; transform: translateX(0) rotate(0deg); }
                100% { opacity: 0; top: 110vh; transform: translateX(${Math.random() * 200 - 100}px) rotate(720deg); }
            }
        `;
        document.head.appendChild(s);
    }
}

function showErrorToast(message) {
    const existing = document.getElementById('smarthirex-error-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'smarthirex-error-toast';
    toast.style.cssText = `
        position: fixed; top: 24px; left: 50%; transform: translateX(-50%);
        background: #ef4444; color: white;
        padding: 16px 24px; border-radius: 12px;
        box-shadow: 0 10px 30px rgba(239, 68, 68, 0.4);
        z-index: 2147483647; display: flex; align-items: center; gap: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        font-weight: 600; font-size: 14px;
        animation: slideDownFade 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        min-width: 320px; justify-content: center;
    `;

    toast.innerHTML = `
        <span style="font-size: 18px; background: rgba(255,255,255,0.2); width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 50%;">✕</span>
        <span>${message}</span>
    `;

    // Inject animation
    if (!document.getElementById('smarthirex-error-anim')) {
        const s = document.createElement('style');
        s.id = 'smarthirex-error-anim';
        s.textContent = `@keyframes slideDownFade { from { opacity:0; transform:translate(-50%, -20px); } to { opacity:1; transform:translate(-50%, 0); } }`;
        document.head.appendChild(s);
    }

    document.body.appendChild(toast);

    // 5 seconds timeout as requested
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, -20px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }
    }, 5000);
}


// ============ CHAT INTERFACE ============

function toggleChatInterface() {
    const existingChat = document.getElementById('smarthirex-chat-container');

    if (existingChat) {
        // Toggle visibility if it exists
        if (existingChat.style.display === 'none') {
            existingChat.style.display = 'block';
            existingChat.classList.add('slide-in');
        } else {
            existingChat.style.display = 'none';
        }
        return;
    }

    // Create container
    const container = document.createElement('div');
    container.id = 'smarthirex-chat-container';

    // Initial styles - Bottom right position
    container.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 400px;
        height: 600px;
        max-width: 90vw;
        max-height: 90vh;
        min-width: 300px;
        min-height: 200px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        z-index: 2147483647;
        overflow: visible; /* Changed to visible for resize handles */
        border: 1px solid rgba(0,0,0,0.1);
        transition: transform 0.1s ease-out;
        animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    // Add drag handle at the top (covering the header area)
    const dragHandle = document.createElement('div');
    dragHandle.title = "Click and drag to move";
    dragHandle.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 30px; /* Leave space for close button */
        height: 60px; /* Cover the approximate header height */
        cursor: move;
        z-index: 100;
        background: transparent;
    `;
    container.appendChild(dragHandle);

    // Add close button (extra overlay control)
    const closeBtn = document.createElement('div');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
        position: absolute;
        top: 10px;
        right: 12px;
        width: 24px;
        height: 24px;
        line-height: 24px;
        text-align: center;
        cursor: pointer;
        z-index: 101;
        color: white;
        font-weight: bold;
        font-family: sans-serif;
        font-size: 20px;
        opacity: 0.8;
        text-shadow: 0 1px 2px rgba(0,0,0,0.2);
    `;
    closeBtn.onclick = () => {
        container.style.display = 'none';
    };
    closeBtn.onmouseenter = () => closeBtn.style.opacity = '1';
    closeBtn.onmouseleave = () => closeBtn.style.opacity = '0.8';
    container.appendChild(closeBtn);

    // Create Iframe
    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('chat/chat.html');
    iframe.style.cssText = `
        width: 100%;
        height: 100%;
        border: none;
        background: white;
        border-radius: 12px; /* Inner radius for iframe */
    `;

    container.appendChild(iframe);

    // ============================================
    // CUSTOM RESIZERS (4 CORNERS)
    // ============================================
    const resizerSize = 15;
    const resizerStyles = `
        position: absolute;
        width: ${resizerSize}px;
        height: ${resizerSize}px;
        background: transparent;
        z-index: 200;
    `;

    // 1. Top-Left (NW)
    const resizerNW = document.createElement('div');
    resizerNW.style.cssText = `${resizerStyles} top: -5px; left: -5px; cursor: nw-resize; z-index: 210;`;
    container.appendChild(resizerNW);

    // 2. Top-Right (NE)
    const resizerNE = document.createElement('div');
    resizerNE.style.cssText = `${resizerStyles} top: -5px; right: -5px; cursor: ne-resize; z-index: 210;`;
    container.appendChild(resizerNE);

    // 3. Bottom-Left (SW)
    const resizerSW = document.createElement('div');
    resizerSW.style.cssText = `${resizerStyles} bottom: -5px; left: -5px; cursor: sw-resize; z-index: 210;`;
    container.appendChild(resizerSW);

    // 4. Bottom-Right (SE)
    const resizerSE = document.createElement('div');
    resizerSE.style.cssText = `${resizerStyles} bottom: -5px; right: -5px; cursor: se-resize; z-index: 210;`;
    container.appendChild(resizerSE);

    // 5. Top (N)
    const resizerN = document.createElement('div');
    resizerN.style.cssText = `${resizerStyles} top: -5px; left: 0; width: 100%; cursor: n-resize;`;
    container.appendChild(resizerN);

    // 6. Bottom (S)
    const resizerS = document.createElement('div');
    resizerS.style.cssText = `${resizerStyles} bottom: -5px; left: 0; width: 100%; cursor: s-resize;`;
    container.appendChild(resizerS);

    // 7. Left (W)
    const resizerW = document.createElement('div');
    resizerW.style.cssText = `${resizerStyles} top: 0; left: -5px; height: 100%; cursor: w-resize;`;
    container.appendChild(resizerW);

    // 8. Right (E)
    const resizerE = document.createElement('div');
    resizerE.style.cssText = `${resizerStyles} top: 0; right: -5px; height: 100%; cursor: e-resize;`;
    container.appendChild(resizerE);

    // Resize Logic
    setupResizer(resizerNW, 'nw');
    setupResizer(resizerNE, 'ne');
    setupResizer(resizerSW, 'sw');
    setupResizer(resizerSE, 'se');
    setupResizer(resizerN, 'n');
    setupResizer(resizerS, 's');
    setupResizer(resizerW, 'w');
    setupResizer(resizerE, 'e');

    function setupResizer(resizer, direction) {
        let startX, startY, startWidth, startHeight, startRight, startBottom, aspectRatio;

        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Stop drag event from propagating to container drag

            startX = e.clientX;
            startY = e.clientY;

            const rect = container.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;
            aspectRatio = startWidth / startHeight;

            // Get computed styles for right/bottom because we might need to modify them for E/S resize
            const computedStyle = window.getComputedStyle(container);
            startRight = parseFloat(computedStyle.right);
            startBottom = parseFloat(computedStyle.bottom);

            // Disable iframe interactions during resize for smoothness
            iframe.style.pointerEvents = 'none';
            container.style.transition = 'none';

            function onMouseMove(e) {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;

                // CORNER RESIZING (PROPORTIONAL)

                // NW: Drag Left/Up -> Increase Width/Height (Anchored Right/Bottom)
                if (direction === 'nw') {
                    const newWidth = startWidth - deltaX;
                    const newHeight = newWidth / aspectRatio;
                    container.style.width = `${newWidth}px`;
                    container.style.height = `${newHeight}px`;
                }

                // NE: Drag Right/Up -> Increase Width -> Adjust Height proportionally
                if (direction === 'ne') {
                    const newWidth = startWidth + deltaX;
                    const newHeight = newWidth / aspectRatio;
                    container.style.width = `${newWidth}px`;
                    container.style.height = `${newHeight}px`;

                    // Adjust Right to grow outward to the right
                    container.style.right = `${startRight - (newWidth - startWidth)}px`;
                }

                // SW: Drag Left/Down -> Increase Width -> Adjust Height proportionally
                if (direction === 'sw') {
                    const newWidth = startWidth - deltaX;
                    const newHeight = newWidth / aspectRatio;
                    container.style.width = `${newWidth}px`;
                    container.style.height = `${newHeight}px`;

                    // Adjust Bottom to grow outward to the bottom
                    container.style.bottom = `${startBottom - (newHeight - startHeight)}px`;
                }

                // SE: Drag Right/Down -> Increase Width -> Adjust Height proportionally
                if (direction === 'se') {
                    const newWidth = startWidth + deltaX;
                    const newHeight = newWidth / aspectRatio;
                    container.style.width = `${newWidth}px`;
                    container.style.height = `${newHeight}px`;

                    container.style.right = `${startRight - (newWidth - startWidth)}px`;
                    container.style.bottom = `${startBottom - (newHeight - startHeight)}px`;
                }

                // SIDE RESIZING (FREE FORM)

                // N: Drag Up -> Increase Height
                if (direction === 'n') {
                    container.style.height = `${startHeight - deltaY}px`;
                }

                // S: Drag Down -> Increase Height (and shift bottom)
                if (direction === 's') {
                    container.style.height = `${startHeight + deltaY}px`;
                    container.style.bottom = `${startBottom - deltaY}px`;
                }

                // W: Drag Left -> Increase Width
                if (direction === 'w') {
                    container.style.width = `${startWidth - deltaX}px`;
                }

                // E: Drag Right -> Increase Width (and shift right)
                if (direction === 'e') {
                    container.style.width = `${startWidth + deltaX}px`;
                    container.style.right = `${startRight - deltaX}px`;
                }
            }

            function onMouseUp() {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                // Re-enable iframe interactions
                iframe.style.pointerEvents = 'auto';
                container.style.transition = 'transform 0.1s ease-out';
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    document.body.appendChild(container);

    // Draggable functionality
    let isDragging = false;
    let dragStartX;
    let dragStartY;
    let initialRight;
    let initialBottom;

    dragHandle.addEventListener("mousedown", dragStart);
    document.addEventListener("mouseup", dragEnd);
    document.addEventListener("mousemove", drag);

    function dragStart(e) {
        if (e.target === dragHandle) {
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;

            // Get current styles
            const rect = container.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            // Calculate initial right/bottom values
            initialRight = viewportWidth - rect.right;
            initialBottom = viewportHeight - rect.bottom;

            // Disable transition during drag
            container.style.transition = 'none';
        }
    }

    function dragEnd(e) {
        if (isDragging) {
            isDragging = false;
            // Re-enable transition
            container.style.transition = 'transform 0.3s ease';
        }
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();

            const deltaX = dragStartX - e.clientX; // Moving left increases right value
            const deltaY = dragStartY - e.clientY; // Moving up increases bottom value

            container.style.right = `${initialRight + deltaX}px`;
            container.style.bottom = `${initialBottom + deltaY}px`;

            // Reset transform if it was used
            container.style.transform = 'none';
        }
    }

    // Inject keyframe animation if not present
    if (!document.getElementById('smarthirex-animations')) {
        const style = document.createElement('style');
        style.id = 'smarthirex-animations';
        style.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100px); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
}
// ============ SMART MEMORY UTILS ============

async function getSmartMemoryCache() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['smart_memory_cache'], (result) => {
            resolve(result.smart_memory_cache || {});
        });
    });
}

function updateSmartMemoryCache(newEntries) {
    chrome.storage.local.get(['smart_memory_cache'], (result) => {
        let cache = result.smart_memory_cache || {};

        // Add new entries
        cache = { ...cache, ...newEntries };

        // PRUNE: Keep only top 50 recently used
        const keys = Object.keys(cache);
        if (keys.length > 50) {
            // Sort by timestamp ASC (oldest first)
            const sortedKeys = keys.sort((a, b) => {
                return (cache[a].timestamp || 0) - (cache[b].timestamp || 0);
            });

            // Delete oldest until 50 left
            const deleteCount = keys.length - 50;
            for (let i = 0; i < deleteCount; i++) {
                delete cache[sortedKeys[i]];
            }
        }

        chrome.storage.local.set({ smart_memory_cache: cache });
        console.log('🧠 Smart Memory updated. Current Size:', Object.keys(cache).length);
    });
}

/**
 * Calculates Jaccard Similarity between two strings (Token Overlap)
 */
function calculateUsingJaccardSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;

    // Tokenize: Lowercase -> Remove non-alphanumeric -> Split -> Filter empty
    const tokenize = (s) => s.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '') // Keep spaces to split
        .split(/\s+/)
        .filter(w => w.length > 2); // Ignore 'a', 'is' (stop words simple filter)

    const set1 = new Set(tokenize(str1));
    const set2 = new Set(tokenize(str2));

    if (set1.size === 0 || set2.size === 0) return 0;

    // Intersection
    const intersection = new Set([...set1].filter(x => set2.has(x)));

    // Union
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
}

// Re-apply Beam Cleanup listener here if needed, but since we are at end of file,
// we rely on the implementation in setupSidebarListeners if it exists.
// Note: setupSidebarListeners is not defined in this file (it was in the deleted snippet), 
// so we should probably add it back or ensure it's called.
// Wait, setupSidebarListeners IS missing now because of the revert.
// I should add it back here or where it was.
// The previous code had `showAccordionSidebar` calling it... wait, no.
// `showAccordionSidebar` generates HTML string. It needs to attach listeners AFTER inserting into DOM.
// Let's modify `showAccordionSidebar` to call a setup function.
