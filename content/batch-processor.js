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
        callbacks = {}
    } = options;

    if (!batch || batch.length === 0) {
        return {};
    }

    console.log(`[BatchProcessor] Processing batch (${batch.length} fields) with streaming...`);

    // Build appropriate context
    const context = buildSmartContext(resumeData, isFirstBatch, previousQA);

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
    } catch (e) {
        console.warn('[BatchProcessor] Failed to get smart memory:', e);
    }

    // Group fields by type
    const groups = groupFieldsByType(fields);

    // Process order: text + textarea first, then selects, then radio/checkbox
    const processingOrder = [
        ...groups.text,
        ...groups.textarea,
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


    // If everything was skipped (pre-filled or deduplicated), return immediately
    if (fieldsToProcess.length === 0) {
        console.log('[BatchProcessor] All fields were skipped (pre-filled or deduplicated)!');
        if (callbacks.onAllComplete) callbacks.onAllComplete(skippedMappings);
        return skippedMappings;
    }

    // Split into batches
    const batches = [];
    for (let i = 0; i < fieldsToProcess.length; i += BATCH_SIZE) {
        batches.push(fieldsToProcess.slice(i, i + BATCH_SIZE));
    }

    console.log(`[BatchProcessor] Created ${batches.length} batches from ${fieldsToProcess.length} fields`);

    const allMappings = { ...skippedMappings }; // Start with skipped mappings
    const previousQA = []; // Track Q&A for context continuity

    let backgroundPromise = null;
    let backgroundBatchIndex = -1;

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const isFirstBatch = (i === 0);
        const isLastBatch = (i === batches.length - 1);

        // Notify batch start
        if (callbacks.onBatchStart) {
            try {
                const labels = batch
                    .map(f => f.label || f.name || 'Field')
                    .slice(0, 3);
                callbacks.onBatchStart(i + 1, batches.length, labels);
            } catch (e) { }
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
                batchMappings = await processBatchWithStreaming(batch, resumeData, pageContext, {
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
            // Process current batch in foreground with streaming
            batchMappings = await processBatchWithStreaming(batch, resumeData, pageContext, {
                isFirstBatch,
                previousQA,
                callbacks
            });
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
