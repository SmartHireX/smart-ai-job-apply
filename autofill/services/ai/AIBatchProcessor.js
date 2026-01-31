/**
 * Batch Processor for Smart AI Job Apply Extension
 * 
 * Handles batched AI question processing with:
 * - Smart context window management (full vs condensed)
 * - Background prefetching for next batches
 * - Streaming UI updates with callbacks
 * - Robust error handling and retry logic
 * 
 * PURE AI VERSION: 
 * Stripped of all local caching, history hydration, and deduplication logic.
 * This processor assumes all local strategies have already been exhausted.
 */

const BATCH_SIZE_MIN = 5;
const BATCH_SIZE_MAX = 10;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
/** Predictive abort: stop all AI batches after N consecutive persistent key errors (Invalid Key / Unauthorized) */
const CONSECUTIVE_KEY_FAILURES_ABORT = 2;
const PERSISTENT_KEY_ERROR_CODES = ['INVALID_KEY', 'UNAUTHORIZED'];

// ... (constants remain, BATCH_SIZE removed)

/**
 * Smart Batching: Group fields by Logical Unit (Type + Index)
 * Constraints: Min 5, Max 10 per batch (unless total remaining is small)
 * @param {Array} fields - Sorted list of fields
 * @returns {Array<Array>} Array of batches
 */
function createSmartBatches(fields) {
    const batches = [];
    let currentBatch = [];

    // Helper to check if we should break the batch
    const shouldBreakBatch = (field, nextField) => {
        // Hard limit
        if (currentBatch.length >= BATCH_SIZE_MAX) return true;

        // Min limit not met? Keep adding.
        if (currentBatch.length < BATCH_SIZE_MIN) return false;

        // At this point, we are betwen 5 and 10.
        // Check for logical breaks.

        // 1. Type Break (User Request: "same type of input... in one group")
        if (field.type !== nextField.type) return true;

        // 2. Virtual Index Break (Don't split "Employer 1" in half if we can avoid it)
        // Only break if we have enough fields, otherwise we might leave stragglers.
        const idxA = field.virtualIndex ?? extractFieldIndex(field);
        const idxB = nextField.virtualIndex ?? extractFieldIndex(nextField);
        if (idxA !== idxB) return true;

        return false;
    };

    for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
        currentBatch.push(field);

        const nextField = fields[i + 1];

        // If last field, close batch
        if (!nextField) {
            batches.push(currentBatch);
            break;
        }

        // Check break condition
        if (shouldBreakBatch(field, nextField)) {
            batches.push(currentBatch);
            currentBatch = [];
        }
    }

    return batches;
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
        if (window.RuleEngine?.calculateTotalExperience) {
            totalYears = window.RuleEngine.calculateTotalExperience(jobs);
        } else {
            totalYears = jobs.length * 1.5; // Rough estimate
        }
    } catch (e) {
        totalYears = jobs.length * 1.5;
    }

    // Get top 5 skills across all categories
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
 * Process a single batch with retry logic
 * @param {Array} batch - Array of field objects (max 5)
 * @param {Object} resumeData - Resume data
 * @param {string} pageContext - Job context
 * @param {Object} context - Smart context object
 * @returns {Promise<Object>} Mappings for this batch
 */
/**
 * @returns {{ mappings: Object, errorCode?: string }}
 */
async function processBatchWithRetry(batch, resumeData, pageContext, context) {
    let lastError = null;
    let lastErrorCode = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            if (attempt > 0) {
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
            }

            if (!window.FormAnalyzer?.mapFieldsBatch) {
                throw new Error('FormAnalyzer.mapFieldsBatch not available');
            }

            const result = await window.FormAnalyzer.mapFieldsBatch(
                batch,
                context,
                pageContext
            );

            if (result && result.success && result.mappings) {
                return { mappings: result.mappings };
            }

            lastError = result?.error || 'Unknown AI error';
            lastErrorCode = result?.errorCode || null;

            if (PERSISTENT_KEY_ERROR_CODES.includes(lastErrorCode) || lastError.includes('API key') || lastError.includes('unauthorized')) {
                break;
            }
            if (lastError.includes('Rate limit') || lastError.includes('429') || lastError.includes('Quota exceeded')) {
                lastError = 'Rate Limit Exceeded';
                break;
            }
        } catch (e) {
            lastError = e.message;
            console.error(`[BatchProcessor] Batch attempt ${attempt} failed:`, e.message);
        }
    }

    console.error(`[BatchProcessor] Batch failed after ${MAX_RETRIES + 1} attempts:`, lastError);

    if (lastError.includes('Rate Limit') || lastError.includes('429')) {
        throw new Error('RATE_LIMIT_EXCEEDED');
    }

    if (typeof window.showErrorToast === 'function') {
        window.showErrorToast(`AI Batch Failed: ${lastError}`);
    }
    return { mappings: {}, errorCode: lastErrorCode || undefined };
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

    // Build appropriate context
    const context = buildSmartContext(resumeData, isFirstBatch, previousQA);

    // Inject History Summary for AI Prompt
    if (filledHistorySummary) {
        context.filledHistorySummary = filledHistorySummary;
    }

    // Call AI with retry logic
    let batchResult = { mappings: {} };
    try {
        batchResult = await processBatchWithRetry(batch, resumeData, pageContext, context);
    } catch (e) {
        if (e.message === 'RATE_LIMIT_EXCEEDED') {
            throw e; // Propagate up
        }
        return {};
    }
    const mappings = batchResult.mappings || {};

    if (!mappings || Object.keys(mappings).length === 0) {
        // console.warn('[BatchProcessor] Batch returned no mappings');
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
 * @param {boolean} isFirstBatch - Whether this is the first batch (for context)
 * @returns {Promise<Object>} Mappings for this batch
 */
async function processBatchInBackground(batch, resumeData, pageContext, previousQA = [], isFirstBatch = false) {
    if (!batch || batch.length === 0) {
        return { mappings: {}, errorCode: undefined };
    }

    const context = buildSmartContext(resumeData, isFirstBatch, previousQA);
    const result = await processBatchWithRetry(batch, resumeData, pageContext, context);
    return result;
}

/**
 * Helper: Animate mappings to the UI
 * @param {Object} mappings - selector -> data
 * @param {Object} callbacks - UI callbacks
 * @returns {Promise<void>}
 */
async function animateMappings(mappings, callbacks) {
    if (!mappings || Object.keys(mappings).length === 0 || !callbacks.onFieldAnswered) return;

    const animationPromises = [];
    let delayMs = 0;

    for (const [selector, fieldData] of Object.entries(mappings)) {
        if (fieldData && fieldData.value !== null && fieldData.value !== undefined) {
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
    // Validate inputs
    if (!Array.isArray(fields) || fields.length === 0) {
        if (callbacks.onAllComplete) callbacks.onAllComplete({});
        return {};
    }

    // Group fields by type
    const groups = groupFieldsByType(fields);

    // Process order: text + textarea first, then selects, then radio/checkbox
    const processingOrder = [
        ...groups.text.sort((a, b) => (a.name || a.id || '').localeCompare(b.name || b.id || '')),
        ...groups.textarea.sort((a, b) => (a.name || a.id || '').localeCompare(b.name || b.id || '')),
        ...groups.select,
        ...groups.radio,
        ...groups.checkbox
    ].filter(f => f && f.selector);

    if (processingOrder.length === 0) {
        if (callbacks.onAllComplete) callbacks.onAllComplete({});
        return {};
    }

    // --- VIRTUAL INDEXING ---
    assignVirtualIndices(processingOrder);
    processingOrder.sort((a, b) => {
        const idxA = a.virtualIndex !== undefined ? a.virtualIndex : (extractFieldIndex(a) || 999);
        const idxB = b.virtualIndex !== undefined ? b.virtualIndex : (extractFieldIndex(b) || 999);
        return idxA - idxB;
    });

    // Smart Batching
    const batches = createSmartBatches(processingOrder);
    const allMappings = {};
    const previousQA = [];
    let consecutiveKeyFailures = 0;
    let degradationSignalled = false;

    // PIPELINE INIT: Start first batch immediately
    let currentBatchPromise = processBatchInBackground(batches[0], resumeData, pageContext, previousQA, true);

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const isLastBatch = (i === batches.length - 1);

        if (callbacks.onBatchStart) {
            try {
                const labels = batch.map(f => f.label || f.name || 'Field').slice(0, 3);
                callbacks.onBatchStart(i + 1, batches.length, labels);
            } catch (e) { }
        }

        // 1. AWAIT CURRENT
        let batchResult = { mappings: {}, errorCode: undefined };
        try {
            batchResult = await currentBatchPromise;
        } catch (e) {
            if (e.message === 'RATE_LIMIT_EXCEEDED') {
                if (!degradationSignalled && callbacks.onAIDegraded) {
                    try { callbacks.onAIDegraded('rate_limit'); } catch (err) { }
                    degradationSignalled = true;
                }
                if (typeof window.showErrorToast === 'function') {
                    window.showErrorToast('AI Rate Limit Exceeded. Stopping.');
                }
                await new Promise(r => setTimeout(r, 3000));
                break;
            }
        }

        const batchMappings = batchResult.mappings || {};
        const errorCode = batchResult.errorCode;

        // Predictive abort: N consecutive persistent key errors
        if (errorCode && PERSISTENT_KEY_ERROR_CODES.includes(errorCode)) {
            consecutiveKeyFailures++;
            if (consecutiveKeyFailures >= CONSECUTIVE_KEY_FAILURES_ABORT) {
                if (!degradationSignalled && callbacks.onAIDegraded) {
                    try { callbacks.onAIDegraded('invalid_key'); } catch (err) { }
                    degradationSignalled = true;
                }
                if (typeof window.showErrorToast === 'function') {
                    window.showErrorToast('AI keys invalid or revoked. Stopping. Check Settings.');
                }
                break;
            }
        } else {
            consecutiveKeyFailures = 0;
        }

        // 2. START NEXT (BACKGROUND)
        if (!isLastBatch) {
            Object.entries(batchMappings).forEach(([selector, data]) => {
                if (data && data.value) {
                    const field = batch.find(f => f.selector === selector);
                    if (field) {
                        previousQA.push({
                            question: field.label || field.name || 'Question',
                            answer: String(data.value).slice(0, 200)
                        });
                    }
                }
            });
            currentBatchPromise = processBatchInBackground(batches[i + 1], resumeData, pageContext, previousQA, false);
        }

        // 3. WRITE/ANIMATE
        Object.assign(allMappings, batchMappings);
        if (callbacks.onBatchComplete) {
            try { callbacks.onBatchComplete(batchMappings, false); } catch (e) { }
        }
        await animateMappings(batchMappings, callbacks);

        // 4. VISUAL PACING: Delay for effect (if needed)
        // Since we are now fetching in parallel, an explicit delay might just slow us down uselessly if the fetch is slow.
        // But if fetch is fast, we want a breather.
        if (!isLastBatch) {
            // Only delay if animation was instant/fast, to ensure 800ms "breather"
            await new Promise(r => setTimeout(r, 800));
        }
    }

    // Completion
    if (callbacks.onAllComplete) {
        try { callbacks.onAllComplete(allMappings); } catch (e) { }
    }

    return allMappings;
}


/**
 * Extract index from field name or label (e.g. "school_0" -> 0)
 * @param {Object} field 
 * @returns {number|null} Index or null if not indexed
 */
function extractFieldIndex(field) {
    // ... (implementation remains, just ensuring cleanliness)
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

// Export functions
if (typeof window !== 'undefined') {
    window.AIBatchProcessor = {
        groupFieldsByType,
        buildSmartContext,
        processBatchWithStreaming,
        processBatchInBackground,
        processFieldsInBatches,
        BATCH_SIZE_MIN,
        BATCH_SIZE_MAX,
        MAX_RETRIES
    };

    // Legacy support for CopilotClient
    window.BatchProcessor = {
        processFieldsInBatches
    };
}
