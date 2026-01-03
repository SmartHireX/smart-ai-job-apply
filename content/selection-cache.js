/**
 * Selection Cache Module
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

/**
 * Get cached value for a field
 * @param {HTMLElement} field - Form field element
 * @param {string} label - Field label
 * @returns {Promise<Object|null>} Cached selection or null
 */
async function getCachedValue(field, label) {
    const signature = generateFieldSignature(field, label);
    const semanticType = classifyFieldType(signature);

    if (!semanticType) {
        console.log('[SelectionCache] No semantic type match for:', label);
        return null;
    }

    const cache = await getCache();
    const cached = cache[semanticType];

    if (cached) {
        console.log(`[SelectionCache] ✅ Cache HIT for "${label}" → type: ${semanticType}, value: ${cached.value}`);

        // Update usage stats
        cached.lastUsed = Date.now();
        cached.useCount = (cached.useCount || 0) + 1;

        // Learn this variant (variants is stored as Array, convert to Set temporarily)
        if (!cached.variants) cached.variants = [];
        const variantsSet = new Set(cached.variants);
        variantsSet.add(normalizeFieldName(label));
        cached.variants = Array.from(variantsSet);


        await saveCache(cache);

        return {
            value: cached.value,
            confidence: Math.min(0.95, 0.75 + (cached.useCount * 0.02)), // Confidence increases with use
            source: 'selection_cache',
            semanticType: semanticType
        };
    }

    console.log(`[SelectionCache] ❌ Cache MISS for "${label}" (type: ${semanticType})`);
    return null;
}

/**
 * Cache a field selection
 * @param {HTMLElement} field - Form field element
 * @param {string} label - Field label
 * @param {string} value - Selected value
 */
async function cacheSelection(field, label, value) {
    const signature = generateFieldSignature(field, label);
    const semanticType = classifyFieldType(signature);

    if (!semanticType) {
        console.log('[SelectionCache] Cannot cache - no semantic type for:', label);
        return;
    }

    const cache = await getCache();

    // Create or update cache entry
    if (!cache[semanticType]) {
        cache[semanticType] = {
            value: value,
            variants: [normalizeFieldName(label)],
            fieldType: field.type || field.tagName.toLowerCase(),
            lastUsed: Date.now(),
            useCount: 1,
            confidence: 0.75
        };
    } else {
        // Update existing entry
        cache[semanticType].value = value;
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

    console.log(`[SelectionCache] 💾 Cached "${label}" → ${semanticType}: ${value}`);
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
