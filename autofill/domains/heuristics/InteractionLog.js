/**
 * InteractionLog {Module
 * 
 * Implements Chrome-style heuristic pattern matching for intelligent caching
 * of non-text form field selections (radio, checkbox, select).
 * 
 * Key Features:
 * - Semantic field classification using regex patterns
 * - Fuzzy matching across similar field labels
 * - chrome.storage.local for persistent caching
 * - Automatic learning of new field variants
 */

// ============================================================================
// FIELD NORMALIZATION
// ============================================================================

/**
 * Normalize a field name/label by removing special characters and standardizing format
 * @param {string} str - Field name, ID, placeholder, or label
 * @returns {string} Normalized string
 */
function normalizeFieldName(str) {
    if (!str) return '';

    return str
        .toLowerCase()
        .replace(/[_-]/g, ' ')      // Normalize separators
        .replace(/\s+/g, ' ')        // Collapse whitespace
        .replace(/[?.!,;:]/g, '')    // Remove punctuation
        .trim();
}

/**
 * Generate a field signature by combining all field attributes
 * Similar to Chrome's FormSignature approach
 * @param {HTMLElement} field - Form field element
 * @param {string} label - Field label from getFieldLabel()
 * @returns {string} Combined normalized signature
 */
function generateFieldSignature(field, label) {
    const name = normalizeFieldName(field.name || '');
    const id = normalizeFieldName(field.id || '');
    const placeholder = normalizeFieldName(field.placeholder || '');
    const normalizedLabel = normalizeFieldName(label || '');

    // Combine all attributes (order doesn't matter for regex matching)
    const signature = [name, id, placeholder, normalizedLabel]
        .filter(v => v)
        .join(' | ');

    return signature;
}

// ============================================================================
// REGEX PATTERN LIBRARY (Chrome-style heuristics)
// ============================================================================

/**
 * Regex patterns for common form field types
 * Based on Chrome's autofill heuristics
 */
const FIELD_PATTERNS = {
    // Skills & Competencies
    skills: /skill|competenc|technical.*skill|programming|technolog|proficien/i,

    // Employment & Work
    relocate: /relocat(e|ion)|willing.*(move|transfer)|relocation/i,
    visa: /visa|sponsor(ship)?|work.*(author|permit|eligibility)|authorized.*work/i,
    veteran: /veteran|military|armed.?forces|service.?member/i,

    // Personal Information
    gender: /\b(gender|sex)\b/i,
    ethnicity: /race|ethnic|ethnicity/i,
    disability: /disab(le|ility)|handicap|accommodation/i,

    // Experience & Skills
    experience: /\b(experience|yrs?|years?)\b.*\b(experience|yrs?|years?)\b|\bexperience\b|\bseniority\b/i,
    experience_level: /(experience|skill).*(level|tier)|level.*(experience|skill)|seniority/i,

    // Education
    education_degree: /(education|degree).*(level|type)|highest.*degree|education.*level/i,
    education_year: /graduat(e|ion).*(year|date)|year.*graduat/i,
    education_institution: /school|university|institution|college/i,

    // Employment Status
    employment_status: /employment.*status|currently.*employed/i,
    notice_period: /notice.?period|availability|start.*date/i,

    // Availability
    availability: /when.*available|start.*date|available.*(to.?start|date)/i,
    remote: /remote|work.?from.?home|wfh|location.*preference/i,

    // References
    references: /reference|referral|how.*hear/i,

    // Legal
    background_check: /background.?check|criminal.*record/i,
    drug_test: /drug.*(test|screen)/i,
    legal_age: /age.*(18|eighteen)|(18|eighteen).*year.*old|over.*18/i,
    citizenship: /citizen|national|resident|legal/i,

    // Location & Office
    current_location: /current.*location|are.*you.*located|live.*in|reside/i,
    office_preference: /willing.*to.*work.*(office|site|hybrid)|commute|office.*location/i,

    // Generic catchalls (lower priority)
    yes_no: /\b(yes|no)\b/i,
};

/**
 * Classify a field based on its signature using regex pattern matching
 * @param {string} signature - Normalized field signature
 * @returns {string|null} Semantic field type or null if no match
 */
function classifyFieldType(signature) {
    // Try each pattern in order of specificity
    for (const [type, pattern] of Object.entries(FIELD_PATTERNS)) {
        if (pattern.test(signature)) {
            return type;
        }
    }

    return null; // No semantic match found
}

// ============================================================================
// CACHE STORAGE (chrome.storage.local)
// ============================================================================

const CACHE_KEY = 'selectionCache';
const METADATA_KEY = 'selectionCacheMetadata';

/**
 * Get the entire selection cache
 * @returns {Promise<Object>} Cache object
 */
async function getCache() {
    try {
        const result = await chrome.storage.local.get(CACHE_KEY);
        return result[CACHE_KEY] || {};
    } catch (error) {
        console.error('[SelectionCache] Error loading cache:', error);
        return {};
    }
}

/**
 * Save the entire cache
 * @param {Object} cache - Cache object to save
 */
async function saveCache(cache) {
    try {
        await chrome.storage.local.set({ [CACHE_KEY]: cache });
        console.log('[SelectionCache] Cache saved successfully');
    } catch (error) {
        console.error('[SelectionCache] Error saving cache:', error);
    }
}

/**
 * Get cache metadata
 * @returns {Promise<Object>} Metadata object
 */
async function getMetadata() {
    try {
        const result = await chrome.storage.local.get(METADATA_KEY);
        return result[METADATA_KEY] || {
            version: 1,
            lastCleanup: Date.now(),
            totalEntries: 0
        };
    } catch (error) {
        console.error('[SelectionCache] Error loading metadata:', error);
        return { version: 1, lastCleanup: Date.now(), totalEntries: 0 };
    }
}

/**
 * Save cache metadata
 * @param {Object} metadata - Metadata to save
 */
async function saveMetadata(metadata) {
    try {
        await chrome.storage.local.set({ [METADATA_KEY]: metadata });
    } catch (error) {
        console.error('[SelectionCache] Error saving metadata:', error);
    }
}

// ============================================================================
// CACHE OPERATIONS
// ============================================================================

// Mutex to prevent race conditions
let _cacheLock = Promise.resolve();

// SESSION STATE: Track used values to prevent duplicates on the SAME page (e.g. School 1 vs School 2)
// Map<SemanticType, Set<Value>>
const _sessionUsedValues = new Map();

/**
 * Get cached value for a field
 * @param {HTMLElement} field - Form field element
 * @param {string} label - Field label
 * @returns {Promise<Object|null>} Cached selection or null
 */
async function getCachedValue(field, label) {
    const signature = generateFieldSignature(field, label);
    const semanticType = classifyFieldType(signature);

    if (!semanticType) return null;

    const cache = await getCache();
    const cached = cache[semanticType];

    if (cached) {
        // --- COLLISION CHECK (New) ---
        // For "List Items" (Education/Experience), don't return the same value twice on one page
        const isListType = semanticType.includes('education') || semanticType.includes('employer') || semanticType.includes('relocate') === false;
        // Note: 'relocate' is essentially unique, but strict lists are education/jobs. 
        // Let's be specific: education_institution, education_degree.
        const strictListTypes = ['education_institution', 'education_degree', 'employer', 'job_title'];

        if (strictListTypes.includes(semanticType)) {
            const usedSet = _sessionUsedValues.get(semanticType) || new Set();
            if (usedSet.has(cached.value)) {
                console.warn(`[SelectionCache] 🛡️ Collision Block (Session): "${cached.value}" already used. Skipping.`);
                return null;
            }

            // NEW: DOM-Based Deduplication (Check against page state)
            // This prevents duplicating values that were filled by LocalMatcher or User
            // EXCEPTION: Allow Index 0 (Latest) to duplicate other fields (e.g. "Current Employer" = "History Row 0")
            let isIndexZero = false;
            const nameId = (field.name || field.id || '').toLowerCase();
            const labelLower = (label || '').toLowerCase();

            // Check for "0" or "current" or "latest"
            if (labelLower.includes('latest') || labelLower.includes('current') || nameId.match(/[_\-\[]0[_\-\]]?/) || labelLower.match(/#\s*1\b/)) {
                isIndexZero = true;
            }

            if (!isIndexZero) {
                const duplicates = Array.from(document.querySelectorAll('input[type="text"], input[type="email"], select'))
                    .filter(el => {
                        const val = (el.value || '').trim().toLowerCase();
                        const cachedVal = (cached.value || '').trim().toLowerCase();
                        return val === cachedVal && el !== field && isFieldVisible(el);
                    });

                if (duplicates.length > 0) {
                    console.warn(`[SelectionCache] 🛡️ Collision Block (DOM): "${cached.value}" found in another field. Skipping since not Index 0.`);

                    // Add to session set to be efficient next time
                    usedSet.add(cached.value);
                    _sessionUsedValues.set(semanticType, usedSet);

                    return null;
                }

                // NEW: External Mappings Check (Prevent Race Condition with Heuristics)
                // If heuristicMappings already claimed this value for another field, block it here.
                if (externalMappings && typeof externalMappings === 'object') {
                    const pendingValues = Object.values(externalMappings).map(m => (m.value || '').toString().trim().toLowerCase());
                    const cachedVal = (cached.value || '').toString().trim().toLowerCase();
                    if (pendingValues.includes(cachedVal)) {
                        console.warn(`[SelectionCache] 🛡️ Collision Block (Pending Heuristic): "${cached.value}" already claimed. Skipping.`);
                        return null;
                    }
                }
            }
        }

        // VALIDATION: Check if cached value exists in current options
        if (field && field.tagName && (field.tagName.toLowerCase() === 'select' || field.getAttribute('role') === 'listbox')) {
            const isValid = validateOption(field, cached.value);
            if (!isValid) {
                console.warn(`[InteractionLog] ⚠️ Cached value "${cached.value}" not found in current options for "${label}". Cache Miss forced.`);
                return null;
            }
        }

        console.log(`[InteractionLog] ✅ Cache HIT for "${label}" → type: ${semanticType}, value: ${cached.value}`);

        // Mark as USED for this session
        if (strictListTypes.includes(semanticType)) {
            const usedSet = _sessionUsedValues.get(semanticType) || new Set();
            usedSet.add(cached.value);
            _sessionUsedValues.set(semanticType, usedSet);
        }

        // Update usage stats
        cached.lastUsed = Date.now();
        cached.useCount = (cached.useCount || 0) + 1;

        // Learn this variant
        if (!cached.variants) cached.variants = [];
        const variantsSet = new Set(cached.variants);
        variantsSet.add(normalizeFieldName(label));
        cached.variants = Array.from(variantsSet);

        await saveCache(cache);

        return {
            value: cached.value,
            confidence: Math.min(0.95, 0.75 + (cached.useCount * 0.02)),
            source: 'selection_cache',
            semanticType: semanticType
        };
    }

    console.log(`[SelectionCache] ❌ Cache MISS for "${label}" (type: ${semanticType})`);
    return null;
}

/**
 * Validate if a value exists in a select field's options
 * @param {HTMLElement} field - The select element
 * @param {string} targetValue - The value to check
 * @returns {boolean} True if valid option exists
 */
function validateOption(field, targetValue) {
    if (!targetValue) return false;

    let valuesToCheck = targetValue;

    // Handle stringified array (e.g. "python,java") -> Convert to Array
    if (typeof targetValue === 'string' && targetValue.includes(',')) {
        valuesToCheck = targetValue.split(',').map(v => v.trim());
    }

    // Handle Array (Multi-select / Checkbox Group)
    if (Array.isArray(valuesToCheck)) {
        // If ANY validity is enough (some old options might be missing, but we want to fill the valid ones)
        // Strictly enforcing 'every' might block partial valid fills.
        // Let's use 'some' valid or 'every'? The user wants to fill valid skills.
        // But getCachedValue returns NULL if validation fails.
        // So we must return TRUE if at least one option is valid to allow partial fill?
        // OR better: Filter the value? (Can't change value here).
        // Let's stick to: If >50% of skills are valid, it's a valid cache hit.
        // Or simpler: If at least one matches, return true.
        return valuesToCheck.some(val => validateSingleOption(field, val));
    }

    return validateSingleOption(field, valuesToCheck);
}

/**
 * Validate a single value against field options
 */
function validateSingleOption(field, singleValue) {
    if (!singleValue) return false;

    // 1. Get all options
    // Handle standard <select>
    let options = [];
    if (field.options) {
        options = Array.from(field.options).map(o => ({ text: o.text, value: o.value }));
    }
    // Handle Radio/Checkbox NodeList if passed as "field" context?
    // Usually validateOption is called on a specific element.
    // If it's a select, it has options.
    // If it's a radio/checkbox, we might need to look up the group?
    // Currently getCachedValue checks: if (field.tagName === 'SELECT' ...
    // So validation is primarily for SELECTs. Checkboxes/Radios might not hit this path in getCachedValue.
    // But good to be safe.

    if (options.length === 0) return true; // Safe fallback

    const targetLower = String(singleValue).toLowerCase().trim();

    // 2. Check for Exact or Fuzzy Match
    return options.some(opt => {
        const val = (opt.value || '').toLowerCase().trim();
        const text = (opt.text || '').toLowerCase().trim();

        if (val === targetLower) return true;
        if (text === targetLower) return true;
        if (val.includes(targetLower) || targetLower.includes(val)) return true;
        if (text.includes(targetLower) || targetLower.includes(text)) return true;

        return false;
    });
}

/**
 * Cache a field selection
 * @param {HTMLElement} field - Form field element
 * @param {string} label - Field label
 * @param {string} value - Selected value
 */
async function cacheSelection(field, label, value) {
    // Chain this operation to the lock
    const currentOp = _cacheLock.then(async () => {
        const signature = generateFieldSignature(field, label);
        const semanticType = classifyFieldType(signature);

        if (!semanticType) {
            console.log('[SelectionCache] Cannot cache - no semantic type for:', label);
            return;
        }

        const cache = await getCache();

        // Create or update cache entry
        let newValue = value;

        // Special Handling for Skills/Checkboxes (Array Accumulation)
        const isMultiSelect = field.type === 'checkbox' || semanticType === 'skills' || field.multiple;

        if (isMultiSelect) {
            // 1. Normalize Input: Parse comma-separated strings into Array
            let inputPayload = value;
            if (typeof value === 'string' && value.includes(',')) {
                inputPayload = value.split(',').map(s => s.trim()).filter(s => s);
            }

            // 2. Decide: Overwrite or Append?
            if (Array.isArray(inputPayload)) {
                // If input is a full list (from AI or parsed string) -> Overwrite
                newValue = inputPayload;
            } else {
                // If input is a single item (Manual Check) -> Append
                const existing = cache[semanticType] ? cache[semanticType].value : [];

                // Ensure existing cache is an Array
                let existingArray = [];
                if (Array.isArray(existing)) {
                    existingArray = existing;
                } else if (typeof existing === 'string') {
                    // Legacy Fix: If existing cache is "a,b", parse it too
                    existingArray = existing.includes(',') ?
                        existing.split(',').map(s => s.trim()) :
                        [existing];
                }

                // Append unique
                const set = new Set(existingArray);
                if (inputPayload) set.add(inputPayload);
                newValue = Array.from(set);
            }
        }

        if (!cache[semanticType]) {
            cache[semanticType] = {
                value: newValue,
                variants: [normalizeFieldName(label)],
                fieldType: field.type || field.tagName.toLowerCase(),
                lastUsed: Date.now(),
                useCount: 1,
                confidence: 0.75
            };
        } else {
            // Update existing entry
            cache[semanticType].value = newValue;
            cache[semanticType].lastUsed = Date.now();
            cache[semanticType].useCount++;

            // Add variant
            if (!cache[semanticType].variants) cache[semanticType].variants = [];
            if (!cache[semanticType].variants.includes(normalizeFieldName(label))) {
                cache[semanticType].variants.push(normalizeFieldName(label));
            }
        }

        await saveCache(cache);

        // Update metadata
        const metadata = await getMetadata();
        metadata.totalEntries = Object.keys(cache).length;
        await saveMetadata(metadata);

        console.log(`[SelectionCache] 💾 Cached "${label}" → ${semanticType}: ${JSON.stringify(newValue)}`);
    }).catch(err => {
        console.error('[SelectionCache] Critical Error in cacheSelection:', err);
    });

    // Update the lock
    _cacheLock = currentOp;
    await currentOp;
}

/**
 * Clear old cache entries (TTL: 90 days)
 */
async function cleanupCache() {
    const cache = await getCache();
    const TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
    const now = Date.now();

    let cleaned = 0;

    for (const [type, entry] of Object.entries(cache)) {
        if (now - entry.lastUsed > TTL_MS) {
            delete cache[type];
            cleaned++;
        }
    }

    if (cleaned > 0) {
        await saveCache(cache);
        console.log(`[SelectionCache] 🧹 Cleaned ${cleaned} stale entries`);
    }

    // Update metadata
    const metadata = await getMetadata();
    metadata.lastCleanup = now;
    metadata.totalEntries = Object.keys(cache).length;
    await saveMetadata(metadata);
}

/**
 * Get cache statistics
 * @returns {Promise<Object>} Cache stats
 */
async function getCacheStats() {
    const cache = await getCache();
    const metadata = await getMetadata();

    return {
        totalEntries: Object.keys(cache).length,
        lastCleanup: new Date(metadata.lastCleanup).toLocaleDateString(),
        entries: Object.entries(cache).map(([type, data]) => ({
            type,
            value: data.value,
            useCount: data.useCount,
            variants: data.variants || [],
            lastUsed: new Date(data.lastUsed).toLocaleDateString()
        }))
    };
}

/**
 * Clear all cache
 */
async function clearCache() {
    await chrome.storage.local.remove([CACHE_KEY, METADATA_KEY]);
    console.log('[SelectionCache] 🗑️ Cache cleared');
}

// ============================================================================
// EXPORTS
// ============================================================================

window.SelectionCache = {
    getCachedValue,
    cacheSelection,
    cleanupCache,
    getCacheStats,
    clearCache,
    classifyFieldType,  // For debugging
    generateFieldSignature  // For debugging
};

console.log('[SelectionCache] Module loaded successfully');
