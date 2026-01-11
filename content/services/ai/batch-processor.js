/**
 * Batch Processor for Smart AI Job Apply Extension
 * 
 * Handles batched AI question processing with:
 * - Smart context window management (full vs condensed)
 * - Background prefetching for next batches
 * - Streaming UI updates with callbacks
 * - Question deduplication and optimization
 * - Robust error handling and retry logic
 */

const BATCH_SIZE = 5; // Research-backed optimal size
const MAX_RETRIES = 2; // Retries per batch on failure
const RETRY_DELAY_MS = 1000; // Base delay between retries

/**
 * Get the current value of a form field
 * @param {HTMLElement} element - Form field element
 * @returns {string} Current value or empty string
 */
function getFieldCurrentValue(element) {
    if (!element) return '';

    try {
        const tagName = element.tagName.toLowerCase();
        const type = (element.type || '').toLowerCase();

        if (tagName === 'select') {
            return element.value || '';
        } else if (type === 'checkbox') {
            // For checkboxes, check if any in group are checked
            const name = element.name;
            if (name) {
                const checked = document.querySelectorAll(`input[name="${CSS.escape(name)}"]:checked`);
                return checked.length > 0 ? 'checked' : '';
            }
            return element.checked ? 'checked' : '';
        } else if (type === 'radio') {
            // For radios, check if any in group is selected
            const name = element.name;
            if (name) {
                const selected = document.querySelector(`input[name="${CSS.escape(name)}"]:checked`);
                return selected ? selected.value : '';
            }
            return element.checked ? element.value : '';
        } else {
            // Text, textarea, etc.
            return element.value || '';
        }
    } catch (e) {
        return '';
    }
}

/**
 * Group fields by type for sequential processing
 * @param {Array} fields - Unmapped field objects
 * @returns {Object} Grouped fields by type
 */
function groupFieldsByType(fields) {
    if (!Array.isArray(fields)) {
        console.warn('[BatchProcessor] groupFieldsByType received non-array, returning empty groups');
        return { text: [], textarea: [], select: [], radio: [], checkbox: [] };
    }

    const groups = {
        text: [],      // text, email, tel, url, search
        textarea: [],  // textarea fields
        select: [],    // select dropdowns
        radio: [],     // radio button groups
        checkbox: []   // checkbox groups
    };

    fields.forEach(field => {
        if (!field) return; // Skip null/undefined fields

        const type = (field.type || 'text').toLowerCase();

        if (type === 'textarea') {
            groups.textarea.push(field);
        } else if (type === 'select' || type === 'select-one' || type === 'select-multiple') {
            groups.select.push(field);
        } else if (type === 'radio') {
            groups.radio.push(field);
        } else if (type === 'checkbox') {
            groups.checkbox.push(field);
        } else {
            // text, email, tel, url, search, etc.
            groups.text.push(field);
        }
    });

    return groups;
}

/**
 * Build smart context for AI prompts
 * First batch gets full context, subsequent batches get condensed
 * @param {Object} resumeData - Full resume data
 * @param {boolean} isFirstBatch - Whether this is the first batch
 * @param {Array} previousQA - Previous question-answer pairs from earlier batches
 * @returns {Object} Context object with profile and previous answers
 */
function buildSmartContext(resumeData, isFirstBatch = true, previousQA = []) {
    // Validate resumeData
    if (!resumeData || typeof resumeData !== 'object') {
        console.warn('[BatchProcessor] Invalid resumeData, using empty object');
        resumeData = {};
    }

    if (isFirstBatch) {
        // Full context for first batch (~2000 tokens)
        return {
            type: 'full',
            resumeData: resumeData,
            previousQA: []
        };
    }

    // Condensed context for subsequent batches (~500 tokens)
    const personal = resumeData.personal || {};
    const jobs = Array.isArray(resumeData.experience) ? resumeData.experience : [];
    const currentJob = jobs.find(j => j && j.current) || jobs[0] || {};
    const skills = resumeData.skills || {};
    const education = Array.isArray(resumeData.education) ? resumeData.education : [];

    // Calculate total experience
    let totalYears = 0;
    try {
        if (window.LocalMatcher?.calculateTotalExperience) {
            totalYears = window.LocalMatcher.calculateTotalExperience(jobs);
        } else {
            totalYears = jobs.length * 1.5; // Rough estimate
        }
    } catch (e) {
        totalYears = jobs.length * 1.5;
    }

    // Get top 5 skills across all categories (increased from 3)
    const allSkills = [];
    try {
        Object.values(skills).forEach(skillArray => {
            if (Array.isArray(skillArray)) allSkills.push(...skillArray);
        });
    } catch (e) {
        console.warn('[BatchProcessor] Error extracting skills:', e);
    }
    const topSkills = allSkills.slice(0, 5);

    // Get latest education safely
    let latestEducation = 'N/A';
    if (education[0]) {
        const edu = education[0];
        latestEducation = `${edu.degree || ''} ${edu.field ? 'in ' + edu.field : ''}`.trim() || 'N/A';
    }

    return {
        type: 'condensed',
        profile: {
            name: `${personal.firstName || ''} ${personal.lastName || ''}`.trim() || 'Candidate',
            currentRole: currentJob.title || 'Professional',
            yearsExp: totalYears,
            topSkills: topSkills,
            latestEducation: latestEducation,
            email: personal.email || '',
            phone: personal.phone || '',
            location: personal.location || ''
        },
        previousQA: Array.isArray(previousQA) ? previousQA.slice(-10) : [] // Limit to last 10 Q&A pairs
    };
}

/**
 * Check if a question was already answered in smart memory
 * Helps with deduplication to save tokens
 * @param {Object} field - Field object
 * @param {Object} smartMemory - Smart memory cache
 * @returns {Promise<string|null>} Cached answer or null
 */
async function checkSmartMemoryForAnswer(field, smartMemory) {
    if (!smartMemory || typeof smartMemory !== 'object' || Object.keys(smartMemory).length === 0) {
        return null;
    }
    if (!field || !field.selector) return null;

    try {
        let element = null;
        try {
            element = document.querySelector(field.selector);
        } catch (e) {
            // Invalid selector
            return null;
        }

        if (!element && field.id) {
            try {
                element = document.getElementById(field.id);
            } catch (e) { }
        }
        if (!element && field.name) {
            try {
                element = document.querySelector(`[name="${CSS.escape(field.name)}"]`);
            } catch (e) { }
        }

        if (!element) return null;

        const fieldLabel = window.getFieldLabel ? window.getFieldLabel(element) : field.label;
        if (!fieldLabel || fieldLabel.length <= 2) return null;

        const normalizedLabel = window.normalizeSmartMemoryKey ?
            window.normalizeSmartMemoryKey(fieldLabel) :
            fieldLabel.toLowerCase().trim();

        // HISTORY GUARD: Skip Smart Memory lookup for History fields
        // This forces them to go to the batch loop where HistoryManager handles them properly
        const isHistoryField = /employer|company|job[_\s]?title|position|school|university|college|degree|major|gpa|start[_\s]?date|end[_\s]?date/i.test(normalizedLabel);
        const isSafeOverride = /available|notice|relocat/i.test(normalizedLabel);

        if (isHistoryField && !isSafeOverride) {
            return null;
        }

        // Check for exact match first
        if (smartMemory[normalizedLabel]) {
            return smartMemory[normalizedLabel].answer;
        }

        // Fuzzy match if available
        if (window.calculateUsingJaccardSimilarity) {
            for (const [cachedLabel, cachedData] of Object.entries(smartMemory)) {
                try {
                    const similarity = window.calculateUsingJaccardSimilarity(cachedLabel, normalizedLabel);
                    if (similarity >= 0.6) { // Lowered to 0.6 to catch "First Name" vs "Candidate First Name" (0.66)
                        return cachedData.answer;
                    }
                } catch (e) { }
            }
        }

        // --- UNIFIED CACHING FALLBACK ---
        // If Smart Memory (Text) fails, check Selection Cache (Dropdowns/Radios)
        // Scenario: User cached "Gender: Male" from a dropdown. Now encounters "Gender" text input.
        if (window.SelectionCache && window.SelectionCache.getCachedValue) {
            const selectionHit = await window.SelectionCache.getCachedValue(element, fieldLabel);
            if (selectionHit && selectionHit.value) {
                // Extract value. If it's an array (checkboxes), join it? Text inputs usually want single string.
                let val = selectionHit.value;
                if (Array.isArray(val)) val = val.join(', ');

                console.log(`🧠 [UnifiedCache] Rescued specific text field "${fieldLabel}" using SelectionCache data!`);
                return val;
            }
        }
    } catch (e) {
        console.warn('[BatchProcessor] Smart memory check failed:', e.message);
    }

    return null;
}

/**
 * Process a single batch with retry logic
 * @param {Array} batch - Array of field objects (max 5)
 * @param {Object} resumeData - Resume data
 * @param {string} pageContext - Job context
 * @param {Object} context - Smart context object
 * @returns {Promise<Object>} Mappings for this batch
 */
async function processBatchWithRetry(batch, resumeData, pageContext, context) {
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`[BatchProcessor] Retry attempt ${attempt} for batch...`);
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
            }

            // Verify FormAnalyzer is available
            if (!window.FormAnalyzer?.mapFieldsBatch) {
                throw new Error('FormAnalyzer.mapFieldsBatch not available');
            }

            const result = await window.FormAnalyzer.mapFieldsBatch(
                batch,
                context,
                pageContext
            );

            if (result && result.success && result.mappings) {
                return result.mappings;
            }

            lastError = result?.error || 'Unknown AI error';

            // Don't retry on certain errors
            if (lastError.includes('API key') || lastError.includes('unauthorized')) {
                break;
            }
        } catch (e) {
            lastError = e.message;
            console.error(`[BatchProcessor] Batch attempt ${attempt} failed:`, e.message);
        }
    }

    console.error(`[BatchProcessor] Batch failed after ${MAX_RETRIES + 1} attempts:`, lastError);
    // CRITICAL: Notify user if batch fails completely (e.g. Rate Limit)
    if (typeof window.showErrorToast === 'function') {
        window.showErrorToast(`AI Batch Failed: ${lastError}`);
    }
    return {};
}

/**
 * Process a single batch with streaming UI updates (foreground)
 * @param {Array} batch - Array of field objects (max 5)
 * @param {Object} resumeData - Resume data
 * @param {string} pageContext - Job context
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Mappings for this batch
 */
async function processBatchWithStreaming(batch, resumeData, pageContext, options = {}) {
    const {
        isFirstBatch = false,
        previousQA = [],
        callbacks = {},
        filledHistorySummary = null
    } = options;

    if (!batch || batch.length === 0) {
        return {};
    }

    console.log(`[BatchProcessor] Processing batch (${batch.length} fields) with streaming...`);

    // Build appropriate context
    const context = buildSmartContext(resumeData, isFirstBatch, previousQA);

    // Inject History Summary for AI Prompt
    if (filledHistorySummary) {
        context.filledHistorySummary = filledHistorySummary;
    }

    // Call AI with retry logic
    const mappings = await processBatchWithRetry(batch, resumeData, pageContext, context);

    if (!mappings || Object.keys(mappings).length === 0) {
        console.warn('[BatchProcessor] Batch returned no mappings');
        return {};
    }

    // Stream results with UI callbacks
    // Collect all animations and run them
    const animationPromises = [];
    let delayMs = 0;

    for (const [selector, fieldData] of Object.entries(mappings)) {
        if (callbacks.onFieldAnswered && fieldData && fieldData.value !== null && fieldData.value !== undefined) {
            const currentDelay = delayMs;

            // Create animation promise
            const animPromise = new Promise(resolve => {
                setTimeout(() => {
                    try {
                        callbacks.onFieldAnswered(selector, fieldData.value, fieldData.confidence || 0.8);
                    } catch (e) {
                        console.warn('[BatchProcessor] Animation callback failed:', e);
                    }
                    resolve();
                }, currentDelay);
            });
            animationPromises.push(animPromise);

            // Calculate realistic animation time based on value length
            const valueLength = String(fieldData.value || '').length;
            const typingTime = Math.min(valueLength * 15, 2000); // Cap at 2 seconds

            // Add scroll and focus time (300ms) + small gap between fields (200ms)
            delayMs += typingTime + 500;
        }
    }

    // Wait for all animations to complete
    if (animationPromises.length > 0) {
        await Promise.all(animationPromises);
        // Add extra buffer for animation completion
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    return mappings;
}

/**
 * Process a batch in background (silent, no UI updates)
 * @param {Array} batch - Array of field objects
 * @param {Object} resumeData - Resume data  
 * @param {string} pageContext - Job context
 * @param {Array} previousQA - Previous Q&A pairs
 * @returns {Promise<Object>} Mappings for this batch
 */
async function processBatchInBackground(batch, resumeData, pageContext, previousQA = []) {
    if (!batch || batch.length === 0) {
        return {};
    }

    console.log(`[BatchProcessor] Pre-fetching batch in background (${batch.length} fields)...`);

    const context = buildSmartContext(resumeData, false, previousQA);
    const mappings = await processBatchWithRetry(batch, resumeData, pageContext, context);

    console.log(`[BatchProcessor] Background batch complete: ${Object.keys(mappings).length} fields`);
    return mappings;
}

/**
 * Main orchestrator: Process all fields in batches with background prefetching
 * @param {Array} fields - All unmapped fields
 * @param {Object} resumeData - Resume data
 * @param {string} pageContext - Job context
 * @param {Object} callbacks - UI callback functions
 * @returns {Promise<Object>} All mappings combined
 */
async function processFieldsInBatches(fields, resumeData, pageContext, callbacks = {}) {
    console.log('[BatchProcessor] Starting batched processing...');

    // Validate inputs
    if (!Array.isArray(fields) || fields.length === 0) {
        console.log('[BatchProcessor] No fields to process');
        if (callbacks.onAllComplete) callbacks.onAllComplete({});
        return {};
    }

    if (!resumeData || typeof resumeData !== 'object') {
        console.error('[BatchProcessor] Invalid resumeData');
        if (callbacks.onAllComplete) callbacks.onAllComplete({});
        return {};
    }

    // Get smart memory for deduplication (with timeout)
    let smartMemory = {};
    try {
        if (window.getSmartMemoryCache) {
            const memoryPromise = window.getSmartMemoryCache();
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({}), 2000));
            smartMemory = await Promise.race([memoryPromise, timeoutPromise]) || {};
        }

        // INIT FIX: Ensure HistoryManager is ready
        if (window.HistoryManager && !window.HistoryManager.isInitialized) {
            await window.HistoryManager.init();
        }
    } catch (e) {
        console.warn('[BatchProcessor] Failed to get smart memory/history:', e);
    }

    // Group fields by type
    const groups = groupFieldsByType(fields);

    // Process order: text + textarea first, then selects, then radio/checkbox
    // Process order: text + textarea first, then selects, then radio/checkbox
    // CLUSTER FIX: Sort by name/id to keep related fields (employer_0, employer_1) adjacent
    // This ensures they likely land in the same batch or consecutive batches.
    const processingOrder = [
        ...groups.text.sort((a, b) => (a.name || a.id || '').localeCompare(b.name || b.id || '')),
        ...groups.textarea.sort((a, b) => (a.name || a.id || '').localeCompare(b.name || b.id || '')),
        ...groups.select,
        ...groups.radio,
        ...groups.checkbox
    ].filter(f => f && f.selector); // Filter out invalid fields

    if (processingOrder.length === 0) {
        console.log('[BatchProcessor] No valid fields after filtering');
        if (callbacks.onAllComplete) callbacks.onAllComplete({});
        return {};
    }

    // Deduplicate against smart memory AND skip already-filled fields
    const fieldsToProcess = [];
    const alreadyAnswered = {};
    const alreadyFilled = {};

    for (const field of processingOrder) {
        try {
            // NEW: Skip fields that already have values
            let element = null;
            try {
                element = document.querySelector(field.selector);
            } catch (e) { }

            if (element) {
                const existingValue = getFieldCurrentValue(element);
                if (existingValue && existingValue.trim() !== '') {
                    console.log(`[BatchProcessor] Skip (already filled): "${field.label || field.name}" = "${existingValue.slice(0, 30)}..."`);
                    alreadyFilled[field.selector] = {
                        value: existingValue,
                        confidence: 1.0,
                        source: 'pre-filled',
                        field_type: field.type,
                        label: field.label,
                        skipped: true
                    };
                    continue;
                }
            }

            // Check smart memory for cached answer
            const cachedAnswer = await checkSmartMemoryForAnswer(field, smartMemory);
            if (cachedAnswer) {
                console.log(`[BatchProcessor] Deduplication: "${field.label || field.name}" from smart memory`);
                alreadyAnswered[field.selector] = {
                    value: cachedAnswer,
                    confidence: 0.95,
                    source: 'smart-memory-dedup',
                    field_type: field.type,
                    label: field.label
                };
            } else {
                fieldsToProcess.push(field);
            }
        } catch (e) {
            // On error, just add to process queue
            fieldsToProcess.push(field);
        }
    }

    // Merge pre-filled and deduplicated
    const skippedMappings = { ...alreadyFilled, ...alreadyAnswered };

    console.log(`[BatchProcessor] Skipped ${Object.keys(alreadyFilled).length} pre-filled, ${Object.keys(alreadyAnswered).length} deduplicated`);

    // Animate deduplicated fields (fill them into the form)
    if (callbacks.onFieldAnswered && Object.keys(alreadyAnswered).length > 0) {
        console.log(`[BatchProcessor] Filling ${Object.keys(alreadyAnswered).length} deduplicated fields...`);
        for (const [selector, data] of Object.entries(alreadyAnswered)) {
            callbacks.onFieldAnswered(selector, data.value, data.confidence || 0.95);
        }
        // Wait for animation
        await new Promise(r => setTimeout(r, Object.keys(alreadyAnswered).length * 300));
    }


    // If everything was skipped (pre-filled or deduplicated), return immediately
    if (fieldsToProcess.length === 0) {
        console.log('[BatchProcessor] All fields were skipped (pre-filled or deduplicated)!');
        if (callbacks.onAllComplete) callbacks.onAllComplete(skippedMappings);
        return skippedMappings;
    }

    // --- VIRTUAL INDEXING: Handle Unnumbered Fields ---
    // 1. Assign 0, 1, 2... based on occurrence count (DOM order)
    assignVirtualIndices(fieldsToProcess);

    // 2. RE-SORT by Index to force related fields clusters (e.g. School #0 + Degree #0)
    fieldsToProcess.sort((a, b) => {
        const idxA = a.virtualIndex !== undefined ? a.virtualIndex : (extractFieldIndex(a) || 999);
        const idxB = b.virtualIndex !== undefined ? b.virtualIndex : (extractFieldIndex(b) || 999);
        return idxA - idxB;
    });

    // Split into batches using Smart Batching (Atomic Groups)
    const batches = createSmartBatches(fieldsToProcess);

    console.log(`[BatchProcessor] Created ${batches.length} batches from ${fieldsToProcess.length} fields`);

    const allMappings = { ...skippedMappings }; // Start with skipped mappings
    const previousQA = []; // Track Q&A for context continuity

    let backgroundPromise = null;
    let backgroundBatchIndex = -1;

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        let activeBatch = [...batch]; // Mutable batch for partial filling
        const isFirstBatch = (i === 0);
        const isLastBatch = (i === batches.length - 1);

        // --- HISTORY GUARD: Prevent Hallucination for Extra Fields ---
        if (checkHistoryBounds(batch, resumeData)) {
            console.log('[BatchProcessor] History Guard triggered. Auto-filling blanks.');
            const blankMappings = {};

            // Resolve all fields as blank
            batch.forEach(f => {
                if (f.selector) {
                    blankMappings[f.selector] = { value: '', confidence: 1.0, source: 'history-guard' };
                    // Notify UI immediately
                    if (callbacks.onFieldAnswered) callbacks.onFieldAnswered(f.selector, '', 1.0);
                }
            });

            Object.assign(allMappings, blankMappings);
            continue; // SKIP AI CALL
        }

        // Notify batch start
        if (callbacks.onBatchStart) {
            try {
                const labels = batch
                    .map(f => f.label || f.name || 'Field')
                    .slice(0, 3);
                callbacks.onBatchStart(i + 1, batches.length, labels);
            } catch (e) { }
        }

        // --- STRUCTURED CACHE: Match Resume Item -> History Entity ---
        // If we know this is "Job #1", look up what Job #1 corresponds to in Resume, then find in History Cache.
        if (window.HistoryManager) {
            try {
                // 1. Determine resume context (e.g. School #0)
                const index = batch[0].virtualIndex !== undefined ? batch[0].virtualIndex : (extractFieldIndex(batch[0]) ?? 0);
                const isEdu = batch.some(f => /school|education|degree|university|college/i.test((f.name || '') + ' ' + (f.label || '')));
                const isWork = batch.some(f => /job|work|employ|company|position/i.test((f.name || '') + ' ' + (f.label || '')));

                let candidateName = null;
                // Look up in Resume Data by Index
                if (isEdu && resumeData.education && resumeData.education[index]) {
                    candidateName = resumeData.education[index].institution || resumeData.education[index].schoolName || resumeData.education[index].school;
                } else if (isWork && resumeData.experience && resumeData.experience[index]) {
                    candidateName = resumeData.experience[index].company || resumeData.experience[index].employer || resumeData.experience[index].name;
                }

                if (candidateName) {
                    // Find in Structured Cache
                    const entity = window.HistoryManager.findEntity(candidateName);

                    // Call hydrateBatch with resume fallback (works even if entity is null)
                    const structMappings = window.HistoryManager.hydrateBatch(batch, entity, resumeData, index);
                    const hitCount = Object.keys(structMappings).length;

                    // If we have any hits, use them (Partial Filling Allowed)
                    if (hitCount > 0) {
                        const source = entity ? 'cache' : 'resume';
                        console.log(`[BatchProcessor] HistoryManager filled ${hitCount} fields from ${source} (index ${index})`);
                        Object.assign(allMappings, structMappings);

                        // Animate filled fields
                        if (callbacks.onFieldAnswered) {
                            Object.entries(structMappings).forEach(([sel, data]) => {
                                callbacks.onFieldAnswered(sel, data.value, data.confidence || 0.95);
                            });
                        }
                    } else if (!entity) {
                        console.log(`[BatchProcessor] No cache or resume data for index ${index}`);
                    }

                    // Remove filled fields from activeBatch so AI doesn't redo them
                    activeBatch = activeBatch.filter(f => !structMappings[f.selector]);

                    // Learn from this usage (refresh timestamp) - only if entity exists
                    if (entity) {
                        window.HistoryManager.upsertEntity(isWork ? 'work' : 'education', entity);
                    }

                    // If everything filled, skip AI
                    if (activeBatch.length === 0) {
                        await new Promise(r => setTimeout(r, hitCount * 300));
                        continue;
                    }
                }
            } catch (e) {
                console.warn('[BatchProcessor] HistoryManager error:', e);
            }
        }

        // --- CACHE EXPANSION: All-or-Nothing Cache Logic ---
        let cacheHits = {};
        let hitCount = 0;

        try {
            for (const field of activeBatch) {
                const cachedVal = await checkSmartMemoryForAnswer(field, smartMemory);
                if (cachedVal) {
                    cacheHits[field.selector] = {
                        value: cachedVal,
                        confidence: 0.95,
                        source: 'cache-expansion',
                        field_type: field.type,
                        label: field.label
                    };
                    hitCount++;
                }
            }
        } catch (e) { console.warn('[BatchProcessor] Cache check error:', e); }

        if (hitCount > 0 && hitCount >= activeBatch.length * 0.5) {
            console.log(`[BatchProcessor] Cache Expansion: ${hitCount}/${activeBatch.length} fields cached. Skipping AI.`);
            Object.assign(allMappings, cacheHits);

            // Animate results
            if (callbacks.onFieldAnswered) {
                Object.entries(cacheHits).forEach(([sel, data]) => {
                    callbacks.onFieldAnswered(sel, data.value, 0.95);
                });
            }
            // Wait for animation simulation
            await new Promise(r => setTimeout(r, hitCount * 300));
            continue; // SKIP AI CALL
        }

        // Check if we have prefetched results for this batch
        let batchMappings = {};

        if (backgroundPromise && backgroundBatchIndex === i) {
            // Use prefetched results
            console.log(`[BatchProcessor] Using prefetched results for batch ${i + 1}`);
            try {
                batchMappings = await backgroundPromise;
            } catch (e) {
                console.warn('[BatchProcessor] Prefetch failed, processing normally');
                batchMappings = await processBatchWithStreaming(activeBatch, resumeData, pageContext, {
                    isFirstBatch,
                    previousQA,
                    callbacks
                });
            }
            backgroundPromise = null;
            backgroundBatchIndex = -1;

            // Still need to animate the prefetched results
            if (Object.keys(batchMappings).length > 0 && callbacks.onFieldAnswered) {
                let delayMs = 0;
                for (const [selector, fieldData] of Object.entries(batchMappings)) {
                    if (fieldData && fieldData.value !== null && fieldData.value !== undefined) {
                        const currentDelay = delayMs;
                        setTimeout(() => {
                            try {
                                callbacks.onFieldAnswered(selector, fieldData.value, fieldData.confidence || 0.8);
                            } catch (e) { }
                        }, currentDelay);

                        const valueLength = String(fieldData.value || '').length;
                        const typingTime = Math.min(valueLength * 5, 200); // Super fast typing
                        delayMs += typingTime + 50;
                    }
                }
                if (delayMs > 0) {
                    await new Promise(resolve => setTimeout(resolve, delayMs + 300));
                }
            }
        } else {
            // --- CONTEXT INJECTION & DATE GUARD ---
            let filledHistorySummary = null;
            let batchForAI = activeBatch;

            try {
                const isEduBatch = activeBatch.some(f => /school|education|degree|university|college|major/i.test((f.name || '') + ' ' + (f.label || '')));
                const isJobBatch = activeBatch.some(f => /job|employ|work|position|company/i.test((f.name || '') + ' ' + (f.label || '')));

                // 1. Context Injection
                if (isEduBatch || isJobBatch) {
                    const usedEntities = new Set();
                    [allMappings, alreadyFilled, alreadyAnswered].forEach(source => {
                        Object.values(source).forEach(item => {
                            const val = String(item.value || '').trim();
                            if (val.length < 2) return;
                            if (isEduBatch && /school|university|college/i.test(item.label || '')) usedEntities.add(`Used School: "${val}"`);
                            if (isJobBatch && /employer|company|organization/i.test(item.label || '')) usedEntities.add(`Used Employer: "${val}"`);
                        });
                    });
                    if (usedEntities.size > 0) filledHistorySummary = Array.from(usedEntities).join('\n');


                }
            } catch (e) { console.warn('[BatchProcessor] Context/Filter failed:', e); }

            // Process filtered batch
            if (batchForAI.length > 0) {
                batchMappings = await processBatchWithStreaming(batchForAI, resumeData, pageContext, {
                    isFirstBatch,
                    previousQA,
                    callbacks,
                    filledHistorySummary
                });
            } else {
                batchMappings = {};
            }
        }

        // --- LEARN: Capture AI Result to Structured History ---
        if (window.HistoryManager && Object.keys(batchMappings).length > 0) {
            try {
                const learnedId = await window.HistoryManager.learnFromBatch(batch, batchMappings);
                if (learnedId) {
                    console.log(`[BatchProcessor] Learned entity ${learnedId} from batch.`);
                    attachHistoryListeners(batch, learnedId);
                }
            } catch (e) { console.warn('[BatchProcessor] Learning failed:', e); }
        }

        // Merge results
        Object.assign(allMappings, batchMappings);

        // Update previous Q&A for next batch context
        Object.entries(batchMappings).forEach(([selector, data]) => {
            if (data && data.value) {
                const field = batch.find(f => f.selector === selector);
                if (field) {
                    previousQA.push({
                        question: field.label || field.name || 'Question',
                        answer: String(data.value).slice(0, 200) // Limit answer length for context
                    });
                }
            }
        });

        // Trigger batch complete callback
        if (callbacks.onBatchComplete) {
            try {
                callbacks.onBatchComplete(batchMappings, false);
            } catch (e) { }
        }

        // Start prefetching next batch (if not last)
        if (!isLastBatch && i + 1 < batches.length) {
            const nextBatch = batches[i + 1];
            backgroundBatchIndex = i + 1;
            backgroundPromise = processBatchInBackground(
                nextBatch,
                resumeData,
                pageContext,
                previousQA
            ).catch(e => {
                console.warn('[BatchProcessor] Background prefetch failed:', e);
                return {};
            });
        }
    }

    console.log(`[BatchProcessor] All batches complete. Total fields: ${Object.keys(allMappings).length}`);

    // Call completion callback
    if (callbacks.onAllComplete) {
        try {
            callbacks.onAllComplete(allMappings);
        } catch (e) {
            console.error('[BatchProcessor] onAllComplete callback failed:', e);
        }
    }

    return allMappings;
}

// Export functions
if (typeof window !== 'undefined') {
    window.BatchProcessor = {
        groupFieldsByType,
        buildSmartContext,
        processBatchWithStreaming,
        processBatchInBackground,
        processFieldsInBatches,
        BATCH_SIZE,
        MAX_RETRIES
    };
}

/**
 * Extract index from field name or label (e.g. "school_0" -> 0)
 * @param {Object} field 
 * @returns {number|null} Index or null if not indexed
 */
function extractFieldIndex(field) {
    const text = (field.name || '') + ' ' + (field.label || '') + ' ' + (field.placeholder || '');
    const patterns = [
        /[_\-\[](\d+)[_\-\]]?/,  // school_0, school[0], school-0
        /Job[\s\-_]*(\d+)/i,     // Job 1
        /Employer[\s\-_]*(\d+)/i, // Employer 1
        /School[\s\-_]*(\d+)/i    // School 1
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return parseInt(match[1], 10);
    }
    return null;
}


/**
 * Smart Batching: Group fields atomically to keep related items together
 * @param {Array} fields - Sorted list of fields
 * @returns {Array<Array>} Array of batches
 */
function createSmartBatches(fields) {
    const batches = [];
    const groups = [];
    let currentGroup = [];
    let lastIndex = -1;

    // Step 1: Group by Index Suffiix (or Virtual Index)
    for (const field of fields) {
        // Prioritize Virtual Index (from assignVirtualIndices) -> Explicit Regex
        let index = field.virtualIndex;
        if (index === undefined || index === null) {
            index = extractFieldIndex(field);
        }

        // If index changes, start new group
        if (index !== null && index !== lastIndex) {
            if (currentGroup.length > 0) groups.push(currentGroup);
            currentGroup = [field];
            lastIndex = index;
        }
        // If duplicate index or non-indexed, just add to current stream or separate?
        // Actually, non-indexed fields should treat as separate "singles"
        else if (index === null) {
            if (currentGroup.length > 0) groups.push(currentGroup);
            currentGroup = [];
            groups.push([field]); // Single field group
            lastIndex = -1;
        } else {
            // Same index, add to group
            currentGroup.push(field);
        }
    }
    if (currentGroup.length > 0) groups.push(currentGroup);

    // Step 2: Bin Packing into Batches
    let currentBatch = [];
    const MAX_STRETCH = 7; // Allow batch to go up to 7 to keep group together

    for (const group of groups) {
        if (currentBatch.length + group.length <= BATCH_SIZE) {
            // Fits perfectly
            currentBatch.push(...group);
        } else if (currentBatch.length === 0) {
            // Group is bigger than batch size, force split or take as is?
            // If group < MAX_STRETCH, take it all in one supersized batch
            if (group.length <= MAX_STRETCH) {
                batches.push([...group]);
            } else {
                // Huge group, must split. 
                // Allow first chunk to take BATCH_SIZE, rest flows to next
                batches.push(group.slice(0, BATCH_SIZE));
                let remaining = group.slice(BATCH_SIZE);
                while (remaining.length > 0) {
                    batches.push(remaining.slice(0, BATCH_SIZE));
                    remaining = remaining.slice(BATCH_SIZE);
                }
            }
        } else if (currentBatch.length + group.length <= MAX_STRETCH) {
            // Fits if we stretch a bit
            currentBatch.push(...group);
            // Close batch since we stretched
            batches.push(currentBatch);
            currentBatch = [];
        } else {
            // Doesn't fit. Close current batch.
            batches.push(currentBatch);
            currentBatch = [];
            // Re-evaluate group for new batch
            if (group.length <= MAX_STRETCH) {
                currentBatch.push(...group);
            } else {
                // Huge group logic again
                batches.push(group.slice(0, BATCH_SIZE));
                let remaining = group.slice(BATCH_SIZE);
                while (remaining.length > 0) {
                    if (remaining.length <= BATCH_SIZE) {
                        currentBatch = remaining;
                        remaining = [];
                    } else {
                        batches.push(remaining.slice(0, BATCH_SIZE));
                        remaining = remaining.slice(BATCH_SIZE);
                    }
                }
            }
        }
    }
    if (currentBatch.length > 0) batches.push(currentBatch);

    return batches;
}

/**
 * Assign "Virtual Indices" to unnumbered repeating fields based on DOM order
 * @param {Array} fields 
 */
function assignVirtualIndices(fields) {
    const labelCounts = {};

    fields.forEach(f => {
        // Skip if explicit index exists
        if (extractFieldIndex(f) !== null) return;

        // Generate key from simplified label (e.g. "schoolname", "employer")
        const key = ((f.name || '') + (f.label || '')).toLowerCase().replace(/[^a-z]/g, '');
        if (key.length < 3) return; // Ignore tiny keys

        // Increment count
        if (labelCounts[key] === undefined) labelCounts[key] = 0;
        else labelCounts[key]++;

        f.virtualIndex = labelCounts[key];
    });
}

/**
 * Guard Strategy: Check if batch index exceeds resume history length
 * @param {Array} batch - Fields in batch
 * @param {Object} resumeData - Resume data
 * @returns {boolean} True if batch should be skipped (hallucination risk)
 */
function checkHistoryBounds(batch, resumeData) {
    // 1. Determine batch "Topic" (Work vs Education)
    let isWork = false;
    let isEdu = false;
    let maxIndex = -1;

    for (const field of batch) {
        const text = (field.name || '') + ' ' + (field.label || '');
        if (/job|employ|work|position|company/i.test(text)) isWork = true;
        if (/school|education|degree|university|college|major/i.test(text)) isEdu = true;

        // Use Virtual Index if assigned, otherwise extract
        const idx = field.virtualIndex !== undefined ? field.virtualIndex : extractFieldIndex(field);
        if (idx !== null && idx !== undefined && idx > maxIndex) maxIndex = idx;
    }

    if (maxIndex === -1) return false; // No index, safe to process

    // 2. Check Bounds
    // Indices are 0-based. If asking for Index 2 (3rd job), length must be > 2.
    if (isWork) {
        const experiences = resumeData.experience || resumeData.work || [];
        if (maxIndex >= experiences.length) {
            console.warn(`[BatchProcessor] History Guard: Skipping Index ${maxIndex} (Resume has ${experiences.length} jobs)`);
            return true;
        }
    }

    if (isEdu) {
        const educations = resumeData.education || resumeData.schools || [];
        if (maxIndex >= educations.length) {
            console.warn(`[BatchProcessor] History Guard: Skipping Index ${maxIndex} (Resume has ${educations.length} schools)`);
            return true;
        }
    }

    return false;
}

/**
 * Attach listeners to fields to learn from user edits
 * @param {Array} batch - Field objects
 * @param {string} entityId - The ID of the structural entity (Job/School)
 */
function attachHistoryListeners(batch, entityId) {
    if (!window.HistoryManager || !entityId) return;

    batch.forEach(field => {
        try {
            const element = document.querySelector(field.selector);
            if (!element) return;

            // Mark for debugging/visuals
            element.dataset.smartEntityId = entityId;

            const handler = (e) => {
                const newVal = e.target.value;
                if (!newVal) return;

                // Update History Manager
                // Debounce could be handled inside HistoryManager or here
                // For now, direct call (HistoryManager saves async)
                window.HistoryManager.updateFromUserEdit(entityId, field, newVal);
            };

            // Use 'change' for robust final value capture (less spam than input)
            // But 'input' is better for "typing" feedback if we had it. 
            // 'change' is safer for persistence.
            element.addEventListener('change', handler);
            element.addEventListener('blur', handler);

        } catch (e) {
            console.warn('[BatchProcessor] Failed to attach listener', e);
        }
    });
}
