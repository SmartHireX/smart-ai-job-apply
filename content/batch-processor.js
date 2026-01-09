/**
 * Batch Processor for Smart AI Job Apply Extension
 * 
 * Handles batched AI question processing with:
 * - Smart context window management (full vs condensed)
 * - Background prefetching for next batches
 * - Streaming UI updates with callbacks
 * - Question deduplication and optimization
 */

const BATCH_SIZE = 5; // Research-backed optimal size

/**
 * Group fields by type for sequential processing
 * @param {Array} fields - Unmapped field objects
 * @returns {Object} Grouped fields by type
 */
function groupFieldsByType(fields) {
    const groups = {
        text: [],      // text, email, tel, url, search
        textarea: [],  // textarea fields
        select: [],    // select dropdowns
        radio: [],     // radio button groups
        checkbox: []   // checkbox groups
    };

    fields.forEach(field => {
        const type = field.type?.toLowerCase() || 'text';

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
    const jobs = resumeData.experience || [];
    const currentJob = jobs.find(j => j.current) || jobs[0] || {};
    const skills = resumeData.skills || {};
    const education = resumeData.education || [];

    // Calculate total experience
    let totalYears = 0;
    if (window.LocalMatcher?.calculateTotalExperience) {
        totalYears = window.LocalMatcher.calculateTotalExperience(jobs);
    } else {
        totalYears = jobs.length * 1.5; // Rough estimate
    }

    // Get top 3 skills across all categories
    const allSkills = [];
    Object.values(skills).forEach(skillArray => {
        if (Array.isArray(skillArray)) allSkills.push(...skillArray);
    });
    const topSkills = allSkills.slice(0, 3);

    return {
        type: 'condensed',
        profile: {
            name: `${personal.firstName || ''} ${personal.lastName || ''}`.trim(),
            currentRole: currentJob.title || 'Candidate',
            yearsExp: totalYears,
            topSkills: topSkills,
            latestEducation: education[0] ? `${education[0].degree} in ${education[0].field}` : 'N/A',
            email: personal.email,
            phone: personal.phone,
            location: personal.location
        },
        previousQA: previousQA // Include Q&A from previous batches for context continuity
    };
}

/**
 * Check if a question was already answered in smart memory
 * Helps with deduplication to save tokens
 * @param {Object} field - Field object
 * @param {Object} smartMemory - Smart memory cache
 * @returns {string|null} Cached answer or null
 */
async function checkSmartMemoryForAnswer(field, smartMemory) {
    if (!smartMemory || Object.keys(smartMemory).length === 0) return null;

    try {
        let element = null;
        if (field.selector) element = document.querySelector(field.selector);
        else if (field.id) element = document.getElementById(field.id);
        else if (field.name) element = document.querySelector(`[name="${CSS.escape(field.name)}"]`);

        if (!element) return null;

        const fieldLabel = window.getFieldLabel ? window.getFieldLabel(element) : field.label;
        if (!fieldLabel || fieldLabel.length <= 2) return null;

        const normalizedLabel = window.normalizeSmartMemoryKey ?
            window.normalizeSmartMemoryKey(fieldLabel) :
            fieldLabel.toLowerCase().trim();

        // Check for exact or fuzzy match
        for (const [cachedLabel, cachedData] of Object.entries(smartMemory)) {
            if (cachedLabel === normalizedLabel) {
                return cachedData.answer;
            }

            // Fuzzy match if available
            if (window.calculateUsingJaccardSimilarity) {
                const similarity = window.calculateUsingJaccardSimilarity(cachedLabel, normalizedLabel);
                if (similarity > 0.7) {
                    return cachedData.answer;
                }
            }
        }
    } catch (e) {
        console.warn('[BatchProcessor] Smart memory check failed:', e);
    }

    return null;
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

    console.log(`[BatchProcessor] Processing batch (${batch.length} fields) with streaming...`);

    // Build appropriate context
    const context = buildSmartContext(resumeData, isFirstBatch, previousQA);

    // Call AI with batch
    const result = await window.FormAnalyzer.mapFieldsBatch(
        batch,
        context,
        pageContext
    );

    if (!result || !result.success || !result.mappings) {
        console.error('[BatchProcessor] Batch processing failed:', result?.error);
        return {};
    }


    // Stream results with UI callbacks
    const mappings = result.mappings;

    // Animate fields sequentially with small delays for visibility
    let delayMs = 0;
    for (const [selector, fieldData] of Object.entries(mappings)) {
        if (callbacks.onFieldAnswered) {
            // Schedule animation with delay
            setTimeout(() => {
                callbacks.onFieldAnswered(selector, fieldData.value, fieldData.confidence || 0.8);
            }, delayMs);

            // Calculate realistic animation time based on value length
            // Using 10-20ms per character (average 15ms) to match heuristic fills
            const valueLength = String(fieldData.value || '').length;
            const typingTime = valueLength * 15; // 15ms per character average

            // Add scroll and focus time (300ms) + small gap between fields (200ms)
            delayMs += typingTime + 500;
        }
    }

    // Wait for all animations to complete before returning
    if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
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
    console.log(`[BatchProcessor] Pre-fetching batch in background (${batch.length} fields)...`);

    const context = buildSmartContext(resumeData, false, previousQA);

    const result = await window.FormAnalyzer.mapFieldsBatch(
        batch,
        context,
        pageContext
    );

    if (!result || !result.success) {
        console.warn('[BatchProcessor] Background batch failed:', result?.error);
        return {};
    }

    console.log(`[BatchProcessor] Background batch complete, cached ${Object.keys(result.mappings || {}).length} fields`);
    return result.mappings || {};
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

    // Get smart memory for deduplication
    const smartMemory = window.getSmartMemoryCache ? await window.getSmartMemoryCache() : {};

    // Group fields by type
    const groups = groupFieldsByType(fields);

    // Process order: text + textarea first, then selects, then radio/checkbox
    const processingOrder = [
        ...groups.text,
        ...groups.textarea,
        ...groups.select,
        ...groups.radio,
        ...groups.checkbox
    ];

    // Deduplicate against smart memory
    const fieldsToProcess = [];
    const alreadyAnswered = {};

    for (const field of processingOrder) {
        const cachedAnswer = await checkSmartMemoryForAnswer(field, smartMemory);
        if (cachedAnswer) {
            console.log(`[BatchProcessor] Deduplication: "${field.label}" already in smart memory`);
            alreadyAnswered[field.selector] = {
                value: cachedAnswer,
                confidence: 0.99,
                source: 'smart-memory-dedup'
            };
        } else {
            fieldsToProcess.push(field);
        }
    }

    // If everything was deduplicated, return immediately
    if (fieldsToProcess.length === 0) {
        console.log('[BatchProcessor] All fields were deduplicated from smart memory!');
        if (callbacks.onAllComplete) callbacks.onAllComplete(alreadyAnswered);
        return alreadyAnswered;
    }

    // Split into batches
    const batches = [];
    for (let i = 0; i < fieldsToProcess.length; i += BATCH_SIZE) {
        batches.push(fieldsToProcess.slice(i, i + BATCH_SIZE));
    }

    console.log(`[BatchProcessor] Created ${batches.length} batches from ${fieldsToProcess.length} fields`);

    const allMappings = { ...alreadyAnswered };
    const previousQA = []; // Track Q&A for context continuity

    let backgroundPromise = null;

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const isFirstBatch = (i === 0);
        const isLastBatch = (i === batches.length - 1);

        if (callbacks.onBatchStart) {
            const labels = batch.map(f => f.label || f.name || 'Unlabeled').slice(0, 3);
            callbacks.onBatchStart(i + 1, batches.length, labels);
        }

        // Start next batch in background (if exists)
        if (!isLastBatch) {
            const nextBatch = batches[i + 1];
            backgroundPromise = processBatchInBackground(
                nextBatch,
                resumeData,
                pageContext,
                previousQA
            );
        }

        // Process current batch in foreground with streaming
        const batchMappings = await processBatchWithStreaming(batch, resumeData, pageContext, {
            isFirstBatch,
            previousQA,
            callbacks
        });

        // Merge results
        Object.assign(allMappings, batchMappings);

        // Update previous Q&A for next batch context
        Object.entries(batchMappings).forEach(([selector, data]) => {
            const field = batch.find(f => f.selector === selector);
            if (field && data.value) {
                previousQA.push({
                    question: field.label || field.name,
                    answer: data.value
                });
            }
        });

        // Trigger batch complete callback
        if (callbacks.onBatchComplete) {
            callbacks.onBatchComplete(batchMappings, false); // false = foreground
        }

        // Wait for background batch to finish before proceeding
        if (backgroundPromise) {
            const bgResults = await backgroundPromise;

            // Notify that background batch is ready (cached)
            if (callbacks.onBatchComplete && Object.keys(bgResults).length > 0) {
                callbacks.onBatchComplete(bgResults, true); // true = background
            }

            backgroundPromise = null;
        }
    }

    console.log(`[BatchProcessor] All batches complete. Total fields: ${Object.keys(allMappings).length}`);

    if (callbacks.onAllComplete) {
        callbacks.onAllComplete(allMappings);
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
        BATCH_SIZE
    };
}
