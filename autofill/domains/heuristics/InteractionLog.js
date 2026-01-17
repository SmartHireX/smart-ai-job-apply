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

// ============================================================================
// CACHE STORAGE (3-Tier Architecture)
// ============================================================================

const CACHE_KEYS = {
    ATOMIC_SINGLE: 'ATOMIC_SINGLE',     // Scalar Values (Email, Phone)
    ATOMIC_MULTI: 'ATOMIC_MULTI',       // Sets (Skills, Interests)
    SECTIONAL_MULTI: 'SECTIONAL_MULTI'  // Row-Based Arrays (Jobs, Edu)
};

const METADATA_KEY = 'selectionCacheMetadata';

// Helper: Determine target cache bucket based on Field Type
function determineCacheStrategy(semanticKey, field = null) {
    // 0. EXPLICIT ROUTING (Architecture V2)
    if (field && field.instance_type) {
        if (field.instance_type === 'ATOMIC_MULTI') return CACHE_KEYS.ATOMIC_MULTI;
        if (field.instance_type === 'SECTIONAL_MULTI') return CACHE_KEYS.SECTIONAL_MULTI;
        if (field.instance_type === 'ATOMIC_SINGLE') return CACHE_KEYS.ATOMIC_SINGLE;
    }

    // 1. FALLBACK INFERENCE (Legacy/Heuristic)
    // Check for Sectional Keywords
    if (/job|employer|institution|degree|education|work|school|title|position/.test(semanticKey)) {
        return CACHE_KEYS.SECTIONAL_MULTI;
    }

    // Check for Atomic Multi Keywords
    if (/skill|interest|technolog|language/.test(semanticKey)) {
        return CACHE_KEYS.ATOMIC_MULTI;
    }

    // Default to Single
    return CACHE_KEYS.ATOMIC_SINGLE;
}

// Legacy Alias for backward compatibility (if needed by other modules)
function isMultiCacheType(semanticKey, field) {
    const strategy = determineCacheStrategy(semanticKey, field);
    return strategy !== CACHE_KEYS.ATOMIC_SINGLE;
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

// ============================================================================
// ADVANCED KEY MATCHER (Global Method)
// ============================================================================

// --- 1. SYNONYM MAPPING ---
const SYNONYM_MAP = {
    // Location
    'zip': ['postal', 'zipcode', 'postcode', 'pincode'],
    'city': ['town', 'locality', 'municipality'],
    'state': ['province', 'region'],
    'country': ['nation'],
    'address': ['location', 'street'],

    // Contact
    'phone': ['tel', 'mobile', 'cell', 'telephone', 'contact'],
    'email': ['mail', 'e-mail', 'emailaddress'],

    // Name
    'first': ['given', 'fname', 'firstname'],
    'last': ['family', 'surname', 'lname', 'lastname'],
    'name': ['fullname'],

    // Work
    'employer': ['company', 'organization', 'firm', 'workplace'],
    'job': ['position', 'role', 'occupation', 'employment'],
    'title': ['designation', 'jobtitle'],
    'salary': ['compensation', 'remuneration', 'pay', 'ctc', 'wage'],

    // Education
    'school': ['university', 'college', 'institution', 'academy'],
    'degree': ['qualification', 'certification'],

    // Demographics
    'gender': ['sex'],
    'veteran': ['military', 'service'],
    'citizenship': ['nationality', 'citizen'],
    'visa': ['sponsorship', 'workpermit'],
    'authorization': ['auth', 'authorisation', 'authorized']
};

// --- 5. ALIAS REGISTRY (Exact known mappings) ---
const ALIAS_REGISTRY = {
    'zip_code': ['postal_code', 'zipcode', 'postcode', 'pin_code', 'pincode'],
    'first_name': ['firstname', 'fname', 'given_name', 'givenname'],
    'last_name': ['lastname', 'lname', 'surname', 'family_name', 'familyname'],
    'phone': ['phone_number', 'phonenumber', 'mobile', 'telephone', 'tel'],
    'email': ['email_address', 'emailaddress', 'e_mail'],
    'employer_name': ['company_name', 'companyname', 'organization', 'employer'],
    'job_title': ['jobtitle', 'position', 'role', 'designation'],
    'institution_name': ['school_name', 'university', 'college', 'school'],
    'degree_type': ['degree', 'qualification', 'education_level'],
    'salary_current': ['current_salary', 'currentsalary', 'current_ctc', 'ctc'],
    'salary_expected': ['expected_salary', 'expectedsalary', 'expected_ctc'],
    'linkedin': ['linkedin_url', 'linkedinurl', 'linkedin_profile']
};

// --- 3. WEIGHTED TOKENS (Higher = More Important) ---
const TOKEN_WEIGHTS = {
    // Core identifiers (High weight)
    'zip': 3, 'postal': 3, 'phone': 3, 'email': 3, 'salary': 3,
    'first': 3, 'last': 3, 'name': 2.5,
    'employer': 3, 'job': 2.5, 'title': 2.5, 'institution': 3, 'school': 3,
    'degree': 3, 'linkedin': 3, 'city': 2.5, 'state': 2.5,

    // Modifiers (Medium weight)
    'current': 1.5, 'expected': 1.5, 'start': 1.5, 'end': 1.5,
    'type': 1.5, 'level': 1.5,

    // Generic (Low weight - often noise)
    'primary': 0.5, 'secondary': 0.5, 'your': 0.3, 'the': 0.2,
    'please': 0.2, 'enter': 0.2, 'select': 0.2, 'what': 0.3, 'is': 0.2
};

// --- 2. TOKEN STEMMING ---
const STEM_MAP = {
    'employer': 'employ', 'employment': 'employ', 'employed': 'employ',
    'education': 'educat', 'educational': 'educat',
    'institution': 'institut', 'institutional': 'institut',
    'authorization': 'author', 'authorized': 'author', 'authorisation': 'author',
    'citizenship': 'citizen',
    'compensation': 'compens', 'compensate': 'compens',
    'experience': 'exper', 'experienced': 'exper',
    'qualification': 'qualif', 'qualified': 'qualif'
};

/**
 * Apply stemming to a token
 */
function stemToken(token) {
    return STEM_MAP[token] || token;
}

/**
 * Expand a token to include its synonyms
 */
function expandWithSynonyms(token) {
    const expanded = new Set([token]);

    // Check if this token is a key in synonym map
    if (SYNONYM_MAP[token]) {
        SYNONYM_MAP[token].forEach(syn => expanded.add(syn));
    }

    // Check if this token is a value in synonym map
    for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
        if (synonyms.includes(token)) {
            expanded.add(key);
            synonyms.forEach(syn => expanded.add(syn));
        }
    }

    return expanded;
}

/**
 * Get weight for a token
 */
function getTokenWeight(token) {
    return TOKEN_WEIGHTS[token] || 1.0;
}

/**
 * Compute Weighted Jaccard Similarity between two sets of tokens.
 * @param {Set} setA - First set of tokens
 * @param {Set} setB - Second set of tokens
 * @returns {number} Similarity score between 0 and 1
 */
function weightedJaccardSimilarity(setA, setB) {
    if (setA.size === 0 && setB.size === 0) return 1;
    if (setA.size === 0 || setB.size === 0) return 0;

    // Stem and expand both sets
    const expandedA = new Set();
    const expandedB = new Set();

    setA.forEach(t => {
        const stemmed = stemToken(t);
        expandWithSynonyms(stemmed).forEach(s => expandedA.add(s));
    });

    setB.forEach(t => {
        const stemmed = stemToken(t);
        expandWithSynonyms(stemmed).forEach(s => expandedB.add(s));
    });

    // Calculate weighted intersection and union
    let intersectionWeight = 0;
    let unionWeight = 0;

    const allTokens = new Set([...expandedA, ...expandedB]);

    allTokens.forEach(token => {
        const weight = getTokenWeight(token);
        const inA = expandedA.has(token);
        const inB = expandedB.has(token);

        if (inA && inB) {
            intersectionWeight += weight;
        }
        unionWeight += weight;
    });

    return unionWeight > 0 ? intersectionWeight / unionWeight : 0;
}

/**
 * Check alias registry for exact known mappings
 */
function checkAliasRegistry(fieldKey, cache) {
    const normalizedKey = fieldKey.toLowerCase();

    // Check if fieldKey is a primary key with aliases
    if (ALIAS_REGISTRY[normalizedKey]) {
        for (const alias of ALIAS_REGISTRY[normalizedKey]) {
            if (cache[alias]) {
                return { matchedKey: alias, similarity: 0.95, value: cache[alias], source: 'alias' };
            }
        }
    }

    // Check if fieldKey is an alias pointing to a primary key
    for (const [primary, aliases] of Object.entries(ALIAS_REGISTRY)) {
        if (aliases.includes(normalizedKey) && cache[primary]) {
            return { matchedKey: primary, similarity: 0.95, value: cache[primary], source: 'alias' };
        }
    }

    return null;
}

/**
 * Find the best matching cache key using advanced matching.
 * @param {string} fieldKey - The field's cache_label to match
 * @param {Object} cache - The cache object to search in
 * @param {number} threshold - Minimum similarity threshold (default: 0.7)
 * @param {Object} context - Optional context for confidence-based selection
 * @returns {Object|null} { matchedKey, similarity, value, source } or null
 */
function findBestKeyMatch(fieldKey, cache, threshold = 0.7, context = {}) {
    if (!fieldKey || !cache || Object.keys(cache).length === 0) return null;

    // 1. EXACT MATCH (Fastest - 100% confidence)
    if (cache[fieldKey]) {
        return { matchedKey: fieldKey, similarity: 1.0, value: cache[fieldKey], source: 'exact' };
    }

    // 2. ALIAS REGISTRY (Known mappings - 95% confidence)
    const aliasMatch = checkAliasRegistry(fieldKey, cache);
    if (aliasMatch) {
        // console.log(`🔗 [KeyMatcher] Alias Match: "${fieldKey}" → "${aliasMatch.matchedKey}"`);
        return aliasMatch;
    }

    // 3. WEIGHTED JACCARD SIMILARITY (Fuzzy Match with Synonyms & Stemming)
    const fieldTokens = new Set(fieldKey.toLowerCase().split('_').filter(t => t.length > 0));

    const candidates = [];

    for (const cacheKey of Object.keys(cache)) {
        const cacheTokens = new Set(cacheKey.toLowerCase().split('_').filter(t => t.length > 0));
        const similarity = weightedJaccardSimilarity(fieldTokens, cacheTokens);

        if (similarity >= threshold) {
            candidates.push({
                matchedKey: cacheKey,
                similarity,
                value: cache[cacheKey],
                source: 'jaccard'
            });
        }
    }

    // 4. CONFIDENCE-BASED SELECTION (Pick best from candidates)
    if (candidates.length === 0) return null;

    // Sort by similarity (highest first)
    candidates.sort((a, b) => b.similarity - a.similarity);

    // If we have context, use it to break ties
    if (context.mlLabel && candidates.length > 1) {
        // Prefer candidate that contains the ML label
        const mlMatch = candidates.find(c =>
            c.matchedKey.includes(context.mlLabel) || context.mlLabel.includes(c.matchedKey)
        );
        if (mlMatch && mlMatch.similarity >= candidates[0].similarity * 0.95) {
            mlMatch.source = 'jaccard+ml';
            // console.log(`🤖 [KeyMatcher] ML-Boosted Match: "${fieldKey}" ~ "${mlMatch.matchedKey}" (${(mlMatch.similarity * 100).toFixed(1)}%)`);
            return mlMatch;
        }
    }

    // Return the best match
    const best = candidates[0];
    // console.log(`🔍 [KeyMatcher] Weighted Jaccard: "${fieldKey}" ~ "${best.matchedKey}" (${(best.similarity * 100).toFixed(1)}%)`);
    return best;
}

// Legacy function for backward compatibility
function jaccardSimilarity(setA, setB) {
    if (setA.size === 0 && setB.size === 0) return 1;
    if (setA.size === 0 || setB.size === 0) return 0;

    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    return intersection.size / union.size;
}

// Export for global access
if (typeof window !== 'undefined') {
    window.KeyMatcher = {
        jaccardSimilarity,
        weightedJaccardSimilarity,
        findBestKeyMatch,
        checkAliasRegistry,
        expandWithSynonyms,
        stemToken,
        getTokenWeight,
        // Expose registries for debugging/extension
        SYNONYM_MAP,
        ALIAS_REGISTRY,
        TOKEN_WEIGHTS,
        STEM_MAP
    };
}

/**
 * Get cached value (Dual-Store Aware)
 */
// ============================================================================
// KEY GENERATION LOGIC (Centralized)
// ============================================================================

/**
 * Generates a robust semantic key for caching.
 * Priority 1: Pre-calculated cache_label (authoritative)
 * Priority 2: ML Prediction (>80% confidence)
 * Priority 3: Robust Tokenization (synonyms, stemming, priority tokens)
 */
function generateSemanticKey(fieldOrElement, label) {
    // Normalize field/element
    let field = fieldOrElement;
    if (typeof HTMLElement !== 'undefined' && fieldOrElement instanceof HTMLElement) {
        field = {
            name: fieldOrElement.name,
            id: fieldOrElement.id,
            type: fieldOrElement.type || fieldOrElement.tagName.toLowerCase(),
            ml_prediction: fieldOrElement.__ml_prediction,
            cache_label: fieldOrElement.getAttribute('cache_label')
        };
    }

    // 0. Pre-process Label: Avoid "Generic Labels" (Yes/No/Male/Female)
    let targetLabel = label || '';
    const isGeneric = /^(yes|no|male|female|other|m|f|true|false)$/i.test(targetLabel.trim());

    if (isGeneric && field && field.label && !/^(yes|no|male|female|other|m|f|true|false)$/i.test(field.label.trim())) {
        targetLabel = field.label;
    }

    // A. CENTRALIZED: Pre-Calculated Cache Key (from Pipeline/GlobalStore)
    let preCalculatedKey = null;
    if (typeof HTMLElement !== 'undefined' && fieldOrElement instanceof HTMLElement) {
        preCalculatedKey = fieldOrElement.getAttribute('cache_label');
        if (!preCalculatedKey && window.NovaCache) {
            preCalculatedKey = window.NovaCache[fieldOrElement.id] || window.NovaCache[fieldOrElement.name];
        }
    } else if (field) {
        preCalculatedKey = field.cache_label;
        if (!preCalculatedKey && window.NovaCache && (field.id || field.name)) {
            preCalculatedKey = window.NovaCache[field.id] || window.NovaCache[field.name];
        }
    }

    if (preCalculatedKey) {
        return { key: preCalculatedKey, isML: true, fallbackKey: preCalculatedKey };
    }

    // B. ML Prediction (High Confidence >= 80%)
    if (field.ml_prediction && field.ml_prediction.confidence > 0.80) {
        return { key: field.ml_prediction.label, isML: true, fallbackKey: field.ml_prediction.label };
    }

    // C. ROBUST TOKENIZED KEY GENERATION (Enterprise Grade)
    let fallbackKey = '';

    if (window.KeyGenerator) {
        fallbackKey = window.KeyGenerator.generateEnterpriseCacheKey(field);
    } else {
        // Fallback if KeyGenerator is missing (shouldn't happen)
        const rawInput = [field.name, field.label, field.parentContext].filter(Boolean).join(' ') || targetLabel || '';
        fallbackKey = rawInput.toLowerCase().replace(/[^a-z0-9]/g, '_');
    }

    fallbackKey = fallbackKey || normalizeFieldName(field.id) || 'unknown_field';

    // D. SCOPE ISOLATION (SECTION KEYS)
    // We only want to namespace ATOMIC_SINGLE fields that appear inside a section (e.g. "Did you manage a team?" in Job 1).
    // ATOMIC_MULTI (Skills) should remain global/flat (`skills`).
    // SECTIONAL_MULTI (Job Title) use the raw key (`job_title`) and rely on Array Storage in multiCache.
    if (field.scope === 'SECTION' && field.instance_type === 'ATOMIC_SINGLE') {
        const sectionType = field.section_type || 'section'; // e.g. 'work'
        const index = field.field_index || 0;

        // Key Format: SECTION:work_0:did_you_manage_team
        const scopedKey = `SECTION:${sectionType}_${index}:${fallbackKey}`;
        // console.log(`[InteractionLog] Generated Scoped Key: ${scopedKey}`);
        return { key: scopedKey, isML: false, fallbackKey: scopedKey };
    }
    // console.log(`[InteractionLog] Generated Standard Key: ${fallbackKey}`);
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

    // console.log(`🔍 [InteractionLog] Lookup Key: "${semanticType}" (isML: ${isML}, fallback: "${fallbackKey}")`);

    // ... (rest of function logic)

    // 2. Select Cache Bucket
    const targetBucket = determineCacheStrategy(semanticType, field);
    let cache = await getCache(targetBucket);
    let cached = null;

    // A. SECTIONAL LOOKUP
    if (targetBucket === CACHE_KEYS.SECTIONAL_MULTI) {
        const parentSection = getSectionMapping(semanticType);
        if (parentSection && cache[parentSection]) {
            const index = getFieldIndex(field, label);
            const sectionEntry = cache[parentSection];

            if (Array.isArray(sectionEntry.value) && sectionEntry.value[index]) {
                const rowValue = sectionEntry.value[index][semanticType];
                if (rowValue !== undefined) {
                    return {
                        value: rowValue,
                        confidence: 0.95,
                        source: 'section_row_cache',
                        semanticType: semanticType
                    };
                }
            }
        }
    }

    // B. DIRECT HIT (in primary bucket)
    if (cache[semanticType]) {
        cached = cache[semanticType];
    }

    // C. CROSS-BUCKET FALLBACK (If miss in primary, try Atomic Single/legacy)
    if (!cached && targetBucket !== CACHE_KEYS.ATOMIC_SINGLE) {
        const singleCache = await getCache(CACHE_KEYS.ATOMIC_SINGLE);
        if (singleCache[semanticType]) {
            cached = singleCache[semanticType];
            // console.log(`[InteractionLog] 🔄 Fallback Hit in ATOMIC_SINGLE: ${semanticType}`);
        }
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
                    // console.log(`[InteractionLog] 🔍 Fuzzy Hit in ${targetCacheKey}: ${term} ~ [${type}]`);
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
            // console.log(`[InteractionLog] 🔍 MultiCache Read: Key=${semanticType} Index=${index} Array=${JSON.stringify(resultValue)}`);
            if (Array.isArray(resultValue)) {
                resultValue = resultValue[index];
                // console.log(`[InteractionLog] 🔍 Extracted Value: "${resultValue}"`);
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

// Helper: Map semantic key to parent section
function getSectionMapping(key) {
    if (/job|work|employer|company|title|position/.test(key)) return 'work_experience';
    if (/school|university|degree|education|institution|gpa|major/.test(key)) return 'education';
    return null;
}

/**
 * Cache a field selection
 */
async function cacheSelection(field, label, value) {
    const currentOp = _cacheLock.then(async () => {
        // 1. Generate Key
        const { key: semanticType, isML } = generateSemanticKey(field, label);
        if (!semanticType) return;

        // 2. Determine Storage Strategy
        const targetCacheKey = determineCacheStrategy(semanticType, field);
        const cache = await getCache(targetCacheKey);

        // A. SECTIONAL_MULTI: Row-Based Storage (Array of Hashes)
        if (targetCacheKey === CACHE_KEYS.SECTIONAL_MULTI) {
            const index = getFieldIndex(field, label);
            const parentSection = getSectionMapping(semanticType);

            if (parentSection) {
                // Initialize Parent Section if missing (e.g. cache['education'])
                if (!cache[parentSection]) {
                    cache[parentSection] = {
                        value: [],
                        fieldType: 'section',
                        lastUsed: Date.now(),
                        useCount: 0,
                        confidence: 1.0,
                        variants: []
                    };
                }
                const entry = cache[parentSection];
                if (!Array.isArray(entry.value)) entry.value = [];

                // Initialize Row at Index
                if (!entry.value[index]) entry.value[index] = {};

                // Write Value
                entry.value[index][semanticType] = value;
                entry.lastUsed = Date.now();

                // Update variants (on parent)
                const normLabel = normalizeFieldName(label);
                if (normLabel && entry.variants && !entry.variants.includes(normLabel)) {
                    entry.variants.push(normLabel);
                }
            } else {
                // Fallback: Legacy Column-Based
                if (!cache[semanticType]) cache[semanticType] = { value: [], useCount: 0, confidence: 0.75, variants: [] };
                const entry = cache[semanticType];
                if (!Array.isArray(entry.value)) entry.value = entry.value ? [entry.value] : [];
                entry.value[index] = value;
                entry.lastUsed = Date.now();
            }
        }
        // B. ATOMIC_MULTI: Merged Sets (Skills, Interests)
        else if (targetCacheKey === CACHE_KEYS.ATOMIC_MULTI) {
            if (!cache[semanticType]) cache[semanticType] = { value: [], useCount: 0, confidence: 0.75, variants: [] };
            const entry = cache[semanticType];

            let inputPayload = value;
            if (typeof value === 'string' && value.includes(',')) {
                inputPayload = value.split(',').map(s => s.trim()).filter(s => s);
            }

            let existingArray = [];
            if (Array.isArray(entry.value)) existingArray = entry.value;
            else if (typeof entry.value === 'string' && entry.value) existingArray = [entry.value];

            const set = new Set(existingArray);
            if (Array.isArray(inputPayload)) inputPayload.forEach(i => set.add(i));
            else if (inputPayload) set.add(inputPayload);

            entry.value = Array.from(set);
            entry.lastUsed = Date.now();

            const normLabel = normalizeFieldName(label);
            if (normLabel && !entry.variants.includes(normLabel)) entry.variants.push(normLabel);
        }
        // C. ATOMIC_SINGLE: Scalar Values
        else {
            if (!cache[semanticType]) cache[semanticType] = { value: null, useCount: 0, confidence: 0.75, variants: [] };
            const entry = cache[semanticType];
            entry.value = value;
            entry.lastUsed = Date.now();

            const normLabel = normalizeFieldName(label);
            if (normLabel && !entry.variants.includes(normLabel)) entry.variants.push(normLabel);
        }

        await saveCache(targetCacheKey, cache);

        // Meta update
        const meta = await getMetadata();
        meta.totalEntries = (await getCache(CACHE_KEYS.ATOMIC_SINGLE)).length + (await getCache(CACHE_KEYS.ATOMIC_MULTI)).length; // Approx
        await saveMetadata(meta);

    }).catch(err => console.error('[InteractionLog] Error in cacheSelection:', err));

    _cacheLock = currentOp;
    await currentOp;
}

async function cleanupCache() {
    // Cleanup all buckets
    const caches = Object.values(CACHE_KEYS);
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
    const single = await getCache(CACHE_KEYS.ATOMIC_SINGLE);
    const multiSet = await getCache(CACHE_KEYS.ATOMIC_MULTI);
    const multiSec = await getCache(CACHE_KEYS.SECTIONAL_MULTI);

    // Merge for display
    const merged = { ...single, ...multiSet, ...multiSec };

    return {
        totalEntries: Object.keys(merged).length,
        entries: Object.entries(merged).map(([type, data]) => ({
            type,
            bucket: determineCacheStrategy(type),
            value: data.value,
            useCount: data.useCount
        }))
    };
}

async function clearCache() {
    // Clears: All 3 buckets + Metadata + SmartMemory
    const keysToRemove = [...Object.values(CACHE_KEYS), METADATA_KEY, 'smartMemory'];
    await chrome.storage.local.remove(keysToRemove);
    // console.log('[InteractionLog] 🗑️ All Caches Cleared');
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

if (typeof module !== 'undefined' && module.exports) module.exports = window.InteractionLog;

window.SelectionCache = window.InteractionLog;
// console.log('[InteractionLog] Module loaded with Dual-Store Support');
