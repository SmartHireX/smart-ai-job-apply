/**
 * InteractionLog {Module
 * 
 * Implements Chrome-style heuristic pattern matching for intelligent caching
 * of non-text form field selections (radio, checkbox, select).
 * 
 * Key Features:
 * - Semantic field classification using regex patterns
 * - Fuzzy matching across similar field labels
 * - ARRAY-BASED Storage for Repeating Sections & Skills (Stored in 'multiCache')
 * - chrome.storage.local for persistent caching
 */

// ============================================================================
// FIELD NORMALIZATION
// ============================================================================

function normalizeFieldName(str) {
    if (!str) return '';
    return str.toLowerCase()
        .replace(/[_-]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[?.!,;:]/g, '')
        .trim();
}

function generateFieldSignature(field, label) {
    const name = normalizeFieldName(field.name || '');
    const id = normalizeFieldName(field.id || '');
    const placeholder = normalizeFieldName(field.placeholder || '');
    const normalizedLabel = normalizeFieldName(label || '');

    return [name, id, placeholder, normalizedLabel].filter(v => v).join(' | ');
}

// ============================================================================
// REGEX PATTERN LIBRARY
// ============================================================================

const FIELD_PATTERNS = {
    skills: /skill|competenc|technical.*skill|programming|technolog|proficien/i,
    relocate: /relocat(e|ion)|willing.*(move|transfer)|relocation/i,
    visa: /visa|sponsor(ship)?|work.*(author|permit|eligibility)|authorized.*work/i,
    veteran: /veteran|military|armed.?forces|service.?member/i,
    gender: /\b(gender|sex)\b/i,
    ethnicity: /race|ethnic|ethnicity/i,
    disability: /disab(le|ility)|handicap|accommodation/i,
    experience: /\b(experience|yrs?|years?)\b.*\b(experience|yrs?|years?)\b|\bexperience\b|\bseniority\b/i,
    experience_level: /(experience|skill).*(level|tier)|level.*(experience|skill)|seniority/i,
    education_degree: /(education|degree).*(level|type)|highest.*degree|education.*level/i,
    education_year: /graduat(e|ion).*(year|date)|year.*graduat/i,
    education_institution: /school|university|institution|college/i,
    employment_status: /employment.*status|currently.*employed/i,
    notice_period: /notice.?period|availability|start.*date/i,
    availability: /when.*available|start.*date|available.*(to.?start|date)/i,
    remote: /remote|work.?from.?home|wfh|location.*preference/i,
    references: /reference|referral|how.*hear/i,
    background_check: /background.?check|criminal.*record/i,
    drug_test: /drug.*(test|screen)/i,
    legal_age: /age.*(18|eighteen)|(18|eighteen).*year.*old|over.*18/i,
    citizenship: /citizen|national|resident|legal/i,
    current_location: /current.*location|are.*you.*located|live.*in|reside/i,
    office_preference: /willing.*to.*work.*(office|site|hybrid)|commute|office.*location/i,

    // Explicit Section Fields (Array Types)
    employer_name: /employer|company|organization/i,
    job_title: /job.*title|role|position/i,

    yes_no: /\b(yes|no)\b/i,
};

function classifyFieldType(signature) {
    for (const [type, pattern] of Object.entries(FIELD_PATTERNS)) {
        if (pattern.test(signature)) return type;
    }
    return null;
}

// ============================================================================
// CACHE STORAGE (Dual-Store Strategy)
// ============================================================================

const SELECTION_CACHE_KEY = 'selectionCache'; // Standard Values
const MULTI_CACHE_KEY = 'multiCache';         // Arrays (Skills, Jobs, Edu)
const METADATA_KEY = 'selectionCacheMetadata';

// Helper: Determine if field belongs to MultiCache
// Priority: ML Label > Field Label/Context
function isMultiCacheType(semanticKey, field = null) {
    // 1. If we have field with high-confidence ML prediction, use that
    if (field && field.ml_prediction && field.ml_prediction.confidence > 0.9) {
        const mlLabel = field.ml_prediction.label.toLowerCase();
        // Check if ML label indicates a section field
        if (/job|employer|institution|degree|education|work|school/.test(mlLabel)) {
            return true;
        }
        // Skills are also multi
        if (/skill/.test(mlLabel)) {
            return true;
        }
    }

    // 2. If we have field, check its label and parent context for section keywords
    if (field) {
        const context = [field.label, field.parentContext, field.section_type, field.name].filter(Boolean).join(' ').toLowerCase();
        if (/work|employ|job|education|school|university|degree|edu_|work_/.test(context)) {
            return true;
        }
    }

    // 3. Fallback: Check the semantic key itself (includes shortened prefixes)
    // Matches: edu_0_school, work_1_employer, job_title, etc.
    const isSection = /job|employer|institution|degree|education|work|school|edu_|work_/.test(semanticKey);
    const isMultiSelect = /skill/.test(semanticKey);

    return isSection || isMultiSelect;
}

async function getCache(cacheKey) {
    try {
        const result = await chrome.storage.local.get(cacheKey);
        return result[cacheKey] || {};
    } catch (error) {
        console.error(`[InteractionLog] Error loading ${cacheKey}:`, error);
        return {};
    }
}

async function saveCache(cacheKey, cacheData) {
    try {
        await chrome.storage.local.set({ [cacheKey]: cacheData });
    } catch (error) {
        console.error(`[InteractionLog] Error saving ${cacheKey}:`, error);
    }
}

async function getMetadata() {
    try {
        const result = await chrome.storage.local.get(METADATA_KEY);
        return result[METADATA_KEY] || { version: 1, lastCleanup: Date.now(), totalEntries: 0 };
    } catch (e) { return { version: 1, lastCleanup: Date.now(), totalEntries: 0 }; }
}

async function saveMetadata(metadata) {
    try { await chrome.storage.local.set({ [METADATA_KEY]: metadata }); } catch (e) { }
}

// ============================================================================
// CACHE OPERATIONS
// ============================================================================

let _cacheLock = Promise.resolve();

/**
 * Determine the "Index" of the field (0, 1, 2)
 */
function getFieldIndex(field, label) {
    if (field && typeof field.field_index === 'number') return field.field_index;
    if (window.IndexingService) {
        const attrIndex = window.IndexingService.detectIndexFromAttribute ? window.IndexingService.detectIndexFromAttribute(field) : null;
        if (attrIndex !== null) return attrIndex;
        const labelIndex = window.IndexingService.detectIndexFromLabel ? window.IndexingService.detectIndexFromLabel(label) : null;
        if (labelIndex !== null) return labelIndex;
    }
    return 0;
}

/**
 * Get cached value (Dual-Store Aware)
 */
// ============================================================================
// KEY GENERATION LOGIC (Centralized)
// ============================================================================

/**
 * Generates a robust semantic key for caching.
 * Priority 1: High-Confidence ML Prediction (>0.90)
 * Priority 2: Deterministic Fallback (Label + Context -> Normalized -> Sorted)
 */
function generateSemanticKey(fieldOrElement, label) {
    // Normalize field/element
    let field = fieldOrElement;
    if (typeof HTMLElement !== 'undefined' && fieldOrElement instanceof HTMLElement) {
        field = {
            name: fieldOrElement.name,
            id: fieldOrElement.id,
            type: fieldOrElement.type || fieldOrElement.tagName.toLowerCase(),
            ml_prediction: fieldOrElement.__ml_prediction // Check for attached data
        };
    }

    // 0. Pre-process Label: Avoid "Generic Labels" (Yes/No/Male/Female)
    let targetLabel = label || '';
    const isGeneric = /^(yes|no|male|female|other|m|f|true|false)$/i.test(targetLabel.trim());

    if (isGeneric && field && field.label && !/^(yes|no|male|female|other|m|f|true|false)$/i.test(field.label.trim())) {
        targetLabel = field.label;
    }

    // B. Stable Fallback Key
    // Priority: field.name (most stable) > simplified label > parentContext
    // Use ONLY the field name as the primary key for consistency
    let fallbackKey = '';

    if (field.name) {
        // Normalize the name (e.g., "age_check" -> "age_check", "security_clearance" -> "security_clearance")
        fallbackKey = field.name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    }

    // If no name, fall back to a simplified version of the label
    if (!fallbackKey && targetLabel) {
        const labelWords = targetLabel.toLowerCase()
            .replace(/[^a-z0-9]/g, ' ')
            .trim()
            .split(/\s+/)
            .filter(w => w.length > 2 && !/the|and|for|of|are|you|have|over|enter|your|please|select|choose/.test(w))
            .slice(0, 3) // Take only first 3 significant words
            .sort();
        fallbackKey = labelWords.join('_');
    }

    fallbackKey = fallbackKey || normalizeFieldName(field.id) || 'unknown_field';

    // A. ML Prediction (High Confidence)
    if (field.ml_prediction && field.ml_prediction.confidence > 0.90) {
        return { key: field.ml_prediction.label, isML: true, fallbackKey: fallbackKey };
    }

    return { key: fallbackKey, isML: false, fallbackKey: fallbackKey };
}

/**
 * Get cached value (Dual-Store Aware)
 */
async function getCachedValue(fieldOrSelector, labelArg) {
    let field = fieldOrSelector;
    let label = labelArg;

    if (typeof fieldOrSelector === 'string') {
        field = { name: '', id: '', placeholder: '', selector: fieldOrSelector };
    } else {
        label = labelArg || field.label || '';
    }

    // 1. Generate Semantic Key
    let { key: semanticType, isML, fallbackKey } = generateSemanticKey(field, label);

    if (isML) console.log(`[InteractionLog] 🔑 Lookup using ML Key: ${semanticType} (Fallback: ${fallbackKey})`);
    else console.log(`[InteractionLog] 🔑 Lookup using Fallback Key: ${semanticType}`);

    // ... (rest of function logic)

    // 2. Select Cache
    let targetCacheKey = SELECTION_CACHE_KEY;
    if (semanticType && isMultiCacheType(semanticType, field)) {
        targetCacheKey = MULTI_CACHE_KEY;
    }

    const cache = await getCache(targetCacheKey);
    let cached = null;

    console.log(`[InteractionLog] 🔎 Cache Keys in ${targetCacheKey}: [${Object.keys(cache).join(', ')}]`);

    // A. Direct Hit (try ML key first, then fallback key)
    if (cache[semanticType]) {
        cached = cache[semanticType];
        console.log(`[InteractionLog] 🎯 Direct Hit in ${targetCacheKey}: ${semanticType}`);
    } else if (isML && fallbackKey && cache[fallbackKey]) {
        // ML key missed, try the fallback key
        semanticType = fallbackKey;
        cached = cache[fallbackKey];
        console.log(`[InteractionLog] 🎯 Fallback Hit in ${targetCacheKey}: ${fallbackKey}`);
    }
    // B. Fuzzy Search (Secondary)
    else {
        // ... (existing fuzzy logic) ...
        const searchTerms = [label, field.name, field.id].filter(Boolean).map(t => normalizeFieldName(t));
        for (const term of searchTerms) {
            for (const [type, entry] of Object.entries(cache)) {
                if (entry.variants && entry.variants.some(v => v.includes(term) || term.includes(v))) {
                    semanticType = type;
                    cached = entry;
                    console.log(`[InteractionLog] 🔍 Fuzzy Hit in ${targetCacheKey}: ${term} ~ [${type}]`);
                    break;
                }
            }
            if (cached) break;
        }
    }

    if (!cached) return null;

    let resultValue = cached.value;
    // ... (rest of array unpacking logic) ...
    if (isMultiCacheType(semanticType, field)) {
        const isRepeating = /job|work|education|employer|school|degree/.test(semanticType);
        if (isRepeating) {
            const index = getFieldIndex(field, label);
            console.log(`[InteractionLog] 🔍 MultiCache Read: Key=${semanticType} Index=${index} Array=${JSON.stringify(resultValue)}`);
            if (Array.isArray(resultValue)) {
                resultValue = resultValue[index];
                console.log(`[InteractionLog] 🔍 Extracted Value: "${resultValue}"`);
            } else if (index > 0) {
                resultValue = null;
            }
        }
    }

    if (!resultValue) return null;

    if (field && field.tagName && (field.tagName.toLowerCase() === 'select' || field.getAttribute('role') === 'listbox')) {
        const isValid = validateOption(field, resultValue);
        if (!isValid) return null;
    }

    return {
        value: resultValue,
        confidence: Math.min(0.95, 0.75 + (cached.useCount * 0.02)),
        source: 'selection_cache',
        semanticType: semanticType
    };
}

// ... (validateOption helpers) ... 
function validateOption(field, targetValue) {
    if (!targetValue) return false;
    let valuesToCheck = targetValue;
    if (typeof targetValue === 'string' && targetValue.includes(',')) {
        valuesToCheck = targetValue.split(',').map(v => v.trim());
    }
    if (Array.isArray(valuesToCheck)) return valuesToCheck.some(val => validateSingleOption(field, val));
    return validateSingleOption(field, valuesToCheck);
}

function validateSingleOption(field, singleValue) {
    if (!singleValue) return false;
    let options = [];
    if (field.options) options = Array.from(field.options).map(o => ({ text: o.text, value: o.value }));
    if (options.length === 0) return true;

    const targetLower = String(singleValue).toLowerCase().trim();
    return options.some(opt => {
        const val = (opt.value || '').toLowerCase().trim();
        const text = (opt.text || '').toLowerCase().trim();
        return val === targetLower || text === targetLower || val.includes(targetLower) || text.includes(targetLower);
    });
}

/**
 * Cache a field selection
 */
async function cacheSelection(field, label, value) {
    const currentOp = _cacheLock.then(async () => {
        // 1. Generate Key
        const { key: semanticType, isML } = generateSemanticKey(field, label);

        if (isML) console.log(`[InteractionLog] � Saving using ML Key: ${semanticType}`);
        else console.log(`[InteractionLog] � Saving using Fallback Key: ${semanticType}`);

        if (!semanticType) return;

        // ... (rest of saving logic) ...
        const targetCacheKey = isMultiCacheType(semanticType, field) ? MULTI_CACHE_KEY : SELECTION_CACHE_KEY;
        const cache = await getCache(targetCacheKey);

        if (!cache[semanticType]) {
            cache[semanticType] = {
                value: null,
                variants: [],
                fieldType: field.type || field.tagName.toLowerCase(),
                lastUsed: Date.now(),
                useCount: 0,
                confidence: 0.75
            };
        }

        const entry = cache[semanticType];
        // ... (Array vs Scalar Logic) ...
        const isRepeating = /job|work|education|employer|school|degree/.test(semanticType);

        if (isRepeating) {
            const index = getFieldIndex(field, label);
            if (!Array.isArray(entry.value)) {
                entry.value = entry.value ? [entry.value] : [];
            }
            entry.value[index] = value;
        } else if (semanticType === 'skills' || field.multiple || field.type === 'checkbox') {
            let inputPayload = value;
            if (typeof value === 'string' && value.includes(',')) {
                inputPayload = value.split(',').map(s => s.trim()).filter(s => s);
            }
            let existingArray = [];
            if (Array.isArray(entry.value)) existingArray = entry.value;
            else if (typeof entry.value === 'string') existingArray = [entry.value];

            const set = new Set(existingArray);
            if (Array.isArray(inputPayload)) inputPayload.forEach(i => set.add(i));
            else set.add(inputPayload);
            entry.value = Array.from(set);
        } else {
            entry.value = value;
        }

        entry.lastUsed = Date.now();
        entry.useCount++;
        const normLabel = normalizeFieldName(label);
        if (!entry.variants) entry.variants = [];
        if (normLabel && !entry.variants.includes(normLabel)) {
            entry.variants.push(normLabel);
        }

        await saveCache(targetCacheKey, cache);

        // Meta update
        const meta = await getMetadata();
        meta.totalEntries = Object.keys(cache).length;
        await saveMetadata(meta);

    }).catch(err => console.error('[InteractionLog] Error in cacheSelection:', err));

    _cacheLock = currentOp;
    await currentOp;
}

async function cleanupCache() {
    // Cleanup both
    const caches = [SELECTION_CACHE_KEY, MULTI_CACHE_KEY];
    const TTL_MS = 90 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let cleaned = 0;

    for (const key of caches) {
        const cache = await getCache(key);
        let modified = false;
        for (const [type, entry] of Object.entries(cache)) {
            if (now - entry.lastUsed > TTL_MS) {
                delete cache[type];
                cleaned++;
                modified = true;
            }
        }
        if (modified) await saveCache(key, cache);
    }
    if (cleaned > 0) console.log(`[InteractionLog] Cleaned ${cleaned} entries.`);
}

async function getCacheStats() {
    const sel = await getCache(SELECTION_CACHE_KEY);
    const multi = await getCache(MULTI_CACHE_KEY);

    // Merge for display
    const merged = { ...sel, ...multi };

    return {
        totalEntries: Object.keys(merged).length,
        entries: Object.entries(merged).map(([type, data]) => ({
            type,
            storage: isMultiCacheType(type) ? 'multiCache' : 'selectionCache',
            value: data.value,
            useCount: data.useCount
        }))
    };
}

async function clearCache() {
    // Clears: Selection (Standard), Multi (Arrays), and Smart Memory (Global Fallback)
    await chrome.storage.local.remove([SELECTION_CACHE_KEY, MULTI_CACHE_KEY, METADATA_KEY, 'smartMemory']);
    console.log('[InteractionLog] 🗑️ All Caches Cleared: Selection, Multi, and SmartMemory');
}

// Export
window.InteractionLog = {
    getCachedValue,
    cacheSelection,
    cleanupCache,
    getCacheStats,
    clearCache,
    classifyFieldType
};
window.SelectionCache = window.InteractionLog;
console.log('[InteractionLog] Module loaded with Dual-Store Support');
