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
    SECTION_REPEATER: 'SECTION_REPEATER'  // Row-Based Arrays (Jobs, Edu)
};

const METADATA_KEY = 'selectionCacheMetadata';

// Helper: Determine target cache bucket based on Field Type
function determineCacheStrategy(semanticKey, field = null) {
    // 0. EXPLICIT ROUTING (Architecture V2)
    if (field && field.instance_type) {
        if (field.instance_type === 'ATOMIC_MULTI') return CACHE_KEYS.ATOMIC_MULTI;
        if (field.instance_type === 'SECTION_REPEATER' || field.instance_type === 'SECTION_CANDIDATE') return CACHE_KEYS.SECTION_REPEATER;
        if (field.instance_type === 'ATOMIC_SINGLE') return CACHE_KEYS.ATOMIC_SINGLE;
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
    try {
        metadata.checksum_version = 1; // Infrastructure Versioning
        await chrome.storage.local.set({ [METADATA_KEY]: metadata });
    } catch (e) { }
}

// ============================================================================
// CACHE OPERATIONS
// ============================================================================

let _cacheLock = Promise.resolve();
const _keyLocks = {}; // Per-bucket locks for granular concurrency control

/**
 * Determine the "Index" of the field (0, 1, 2)
 * Bucket-Aware (V4): Returns null for atomic/global fields
 */
function getFieldIndex(field, label) {
    // 1. ARCHITECTURAL OVERRIDE (High Priority)
    // If we know this field is ATOMIC, it has no index.
    const isSectional = field?.instance_type === 'SECTION_REPEATER' || field?.instance_type === 'SECTION_CANDIDATE';
    if (field && field.instance_type && !isSectional) {
        return null;
    }

    if (field && typeof field.field_index === 'number') return field.field_index;

    // 2. DOM RECOVERY (Layer 3)
    const element = field?.element;
    if (element && typeof element.getAttribute === 'function') {
        const attrIdx = element.getAttribute('field_index');
        if (attrIdx !== null) return parseInt(attrIdx);
    }

    // 3. CANDIDATE DEFAULT (Layer 4)
    // If it's a candidate and we have no index, it's almost certainly the first instance (index 0).
    if (field?.instance_type === 'SECTION_CANDIDATE') return 0;



    if (window.IndexingService) {
        const attrIndex = window.IndexingService.detectIndexFromAttribute ? window.IndexingService.detectIndexFromAttribute(field) : null;
        if (attrIndex !== null) return attrIndex;

        const labelIndex = window.IndexingService.detectIndexFromLabel ? window.IndexingService.detectIndexFromLabel(label) : null;
        if (labelIndex !== null) return labelIndex;
    }

    // Default to null instead of 0 to prevent noisy global metadata
    return null;
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
    'linkedin': ['linkedin_url', 'linkedinurl', 'linkedin_profile'],
    'notice_period_in_days': ['notice_period', 'notice_period_days', 'notice_period_select', 'availability_date', 'days_notice', 'notice_days'],
    'field_of_study': ['major', 'concentration', 'discipline', 'education_major', 'study_field'],
    'gpa': ['gpa_score', 'grade_point_average', 'score', 'grade'],
    'work_description': ['description', 'summary', 'job_description', 'responsibilities'],
    'start_date': ['job_start_date', 'education_start_date', 'start_year', 'from', 'date_start', 'datestart'],
    'end_date': ['job_end_date', 'education_end_date', 'end_year', 'to', 'date_end', 'dateend']
};

// --- 3. WEIGHTED TOKENS (Higher = More Important) ---
const TOKEN_WEIGHTS = {
    // Core identifiers (High weight)
    'zip': 3, 'postal': 3, 'phone': 3, 'email': 3, 'salary': 3,
    'first': 3, 'last': 3, 'name': 2.5,
    'employer': 3, 'job': 2.5, 'title': 2.5, 'institution': 3, 'school': 3,
    'degree': 3, 'linkedin': 3, 'city': 2.5, 'state': 2.5,

    // Modifiers (High weight to prevent collisions like current vs expected)
    'current': 2.5, 'expected': 2.5, 'start': 2.5, 'end': 2.5,
    'type': 2.5, 'level': 2.5,

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

    // 1.5 STRICT LABEL MATCH (User Suggestion)
    // Sometimes the generated key is complex, but the simple label strictly matches a cache key.
    // e.g. Label="Notice Period" -> Key="notice_period"
    if (context.label) {
        const simpleLabelKey = context.label.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
        if (cache[simpleLabelKey]) {
            return { matchedKey: simpleLabelKey, similarity: 0.99, value: cache[simpleLabelKey], source: 'exact_label' };
        }
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
            cache_label: fieldOrElement.getAttribute('cache_label'),
            instance_type: fieldOrElement.getAttribute('instance_type'),
            scope: fieldOrElement.getAttribute('scope'),
            field_index: fieldOrElement.getAttribute('field_index') ? parseInt(fieldOrElement.getAttribute('field_index')) : null,
            section_type: fieldOrElement.getAttribute('section_type')
        };
    }

    // FIX: Respect explicit cache_label on POJO (passed from CompositeFieldManager)
    if (field.cache_label) {
        return { key: field.cache_label, isML: true, fallbackKey: field.cache_label };
    }

    // 0. Pre-process Label: Avoid "Generic Labels" (Yes/No/Male/Female)
    let targetLabel = label || '';
    const isGeneric = /^(yes|no|male|female|other|m|f|true|false)$/i.test(targetLabel.trim());

    if (isGeneric && field && field.label && !/^(yes|no|male|female|other|m|f|true|false)$/i.test(field.label.trim())) {
        targetLabel = field.label;
    }

    // A. CENTRALIZED: Pre-Calculated Cache Key (from Pipeline/GlobalStore)
    let preCalculatedKey = null;
    let cachedMeta = null;

    if (typeof HTMLElement !== 'undefined' && fieldOrElement instanceof HTMLElement) {
        // Always attempt metadata enrichment from NovaCache
        if (window.NovaCache && (field.id || field.name)) {
            const entry = window.NovaCache[field.id] || window.NovaCache[field.name];
            if (entry && typeof entry === 'object') {
                preCalculatedKey = preCalculatedKey || entry.label;
                cachedMeta = entry;
            } else if (entry && !preCalculatedKey) {
                preCalculatedKey = entry;
            }
        }

        // Recover from DOM if POJO is missing metadata but has element
        if (field.element && typeof field.element.getAttribute === 'function') {
            field.instance_type = field.instance_type || field.element.getAttribute('instance_type');
            field.scope = field.scope || field.element.getAttribute('scope');
            if (field.field_index === undefined || field.field_index === null) {
                const attrIdx = field.element.getAttribute('field_index');
                if (attrIdx !== null) field.field_index = parseInt(attrIdx);
            }
            field.section_type = field.section_type || field.element.getAttribute('section_type');
        }
    }

    // ENHANCEMENT: Inject cached metadata into field object if missing
    if (cachedMeta && field) {
        field.instance_type = field.instance_type || cachedMeta.instance_type || cachedMeta.type;
        field.scope = field.scope || cachedMeta.scope;
        if (field.field_index === null || field.field_index === undefined) {
            field.field_index = cachedMeta.field_index;
        }
        field.section_type = field.section_type || cachedMeta.section_type;
        // console.log(`[InteractionLog] 🧠 Injected Metadata from NovaCache:`, cachedMeta);
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
        // C. ROBUST TOKENIZED KEY GENERATION (Enterprise Grade)
        // 1. CONDITIONAL ID STRIPPING
        // - Atomic (Single/Multi): STRIP ALL IDs (Globals like "email", "phone" are unique)
        // - Sectional: PRESERVE section+instance, strip internal noise
        const isSectional = field.instance_type === 'SECTION_REPEATER' || field.instance_type === 'SECTION_CANDIDATE';
        const stripPattern = isSectional ? /workExperience-\d+--/ : /\d+/g; // Example pattern

        const cleanName = (field.name || '').replace(stripPattern, '');
        const cleanId = (field.id || '').replace(stripPattern, '');

        // 2. Detect Sub-Field Context via DateHandler (if available)
        let subContext = '';
        // ... preserved logic ...
        const lowerName = (field.name || '').toLowerCase();
        const lowerId = (field.id || '').toLowerCase();
        if (lowerName.includes('month') || lowerId.includes('month')) subContext = 'month';
        else if (lowerName.includes('year') || lowerId.includes('year')) subContext = 'year';
        else if (lowerName.includes('day') || lowerId.includes('day')) subContext = 'day';

        const rawInput = [cleanName, field.label, field.parentContext].filter(Boolean).join(' ') || targetLabel || '';
        fallbackKey = rawInput.toLowerCase().replace(/[^a-z0-9]/g, '_');

        // 3. Append sub-context for uniqueness (e.g. from_year vs from_month)
        if (subContext && !fallbackKey.includes(subContext)) {
            fallbackKey += `_${subContext}`;
        }
    }

    fallbackKey = (fallbackKey || '').replace(/\d+/g, '') || 'unknown_field';

    // D. SCOPE ISOLATION (SECTION KEYS)
    // We only want to namespace ATOMIC_SINGLE fields that appear inside a section (e.g. "Did you manage a team?" in Job 1).
    // ATOMIC_MULTI (Skills) should remain global/flat (`skills`).

    // EXCEPTION: Certain fields are ALWAYS Global Facts, even if they appear inside a section context.
    // e.g. "Notice Period", "Visa Status", "Education Level", "Years of Experience".
    const GLOBAL_OVERRIDE_KEYS = [
        'notice_period', 'notice_period_in_days', 'availability_date',
        'years_experience', 'total_experience', 'experience_years',
        'education_level', 'highest_degree', 'degree_type',
        'visa', 'sponsorship', 'work_authorization', 'clearance',
        'gender', 'race', 'veteran', 'disability', 'citizenship'
    ];

    const isGlobalOverride = GLOBAL_OVERRIDE_KEYS.some(k => fallbackKey.includes(k));

    const isSectionalType = field.instance_type === 'ATOMIC_SINGLE' || field.instance_type === 'SECTION_CANDIDATE';
    if (!isGlobalOverride && field.scope === 'SECTION' && isSectionalType) {
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
    if (targetBucket === CACHE_KEYS.SECTION_REPEATER) {
        const parentSection = getSectionMapping(semanticType, field);

        if (parentSection && cache[parentSection]) {
            const index = getFieldIndex(field, label);
            const sectionEntry = cache[parentSection];

            if (Array.isArray(sectionEntry.value) && sectionEntry.value[index]) {
                const canonicalKey = getCanonicalKey(semanticType);
                const rowValue = sectionEntry.value[index][canonicalKey];

                // Row Integrity Guard: If field has a container_uid, we would ideally verify it here.
                // For now, we enforce that sectional fields NEVER leak into global single-cache.

                if (rowValue !== undefined) {
                    return {
                        value: rowValue,
                        confidence: 0.95,
                        source: 'section_row_cache',
                        semanticType: canonicalKey
                    };
                }

                // Check un-normalized key as backup (for legacy data)
                if (sectionEntry.value[index][semanticType] !== undefined) {
                    return {
                        value: sectionEntry.value[index][semanticType],
                        confidence: 0.95,
                        source: 'section_row_cache_legacy',
                        semanticType: semanticType
                    };
                }

                // Internal Row Fuzzy Match (e.g. "start_date" vs "job_start_date")
                const rowKeys = Object.keys(sectionEntry.value[index]);
                const fuzzyMatch = rowKeys.find(k => {
                    const canonicalK = getCanonicalKey(k);
                    return canonicalK === canonicalKey ||
                        k.includes(semanticType) ||
                        semanticType.includes(k) ||
                        (canonicalKey && (k.includes(canonicalKey) || canonicalKey.includes(k)));
                });

                if (fuzzyMatch && sectionEntry.value[index][fuzzyMatch] !== undefined) {
                    return {
                        value: sectionEntry.value[index][fuzzyMatch],
                        confidence: 0.85,
                        source: 'section_row_cache_fuzzy',
                        semanticType: fuzzyMatch
                    };
                }
            }
        }

        // SECTIONAL GUARD: If we are here, we are a sectional field but didn't find a match in the row.
        // We MUST NOT fall through to generic matchers which might return the entire row object.
        return null;
    }

    const match = findBestKeyMatch(semanticType, cache, 0.8, { mlLabel: isML ? semanticType : null, label });

    if (match) {
        return {
            value: match.value.answer || match.value.value || match.value,
            confidence: match.similarity,
            source: 'selection_cache',
            semanticType: match.matchedKey
        };
    }

    // B. DIRECT HIT (in primary bucket)
    if (cache[semanticType]) {
        cached = cache[semanticType];
    }

    // C. CROSS-BUCKET FALLBACK (Safe for ATOMIC only)
    if (!cached && targetBucket === CACHE_KEYS.ATOMIC_SINGLE) {
        const multiCache = await getCache(CACHE_KEYS.ATOMIC_MULTI);
        if (multiCache[semanticType]) {
            cached = multiCache[semanticType];
        }
    }
    // B. Fuzzy Search (Secondary)
    else {
        // ... (existing fuzzy logic) ...
        const searchTerms = [label, field.name, field.id].filter(Boolean).map(t => normalizeFieldName(t));
        for (const term of searchTerms) {
            for (const [type, entry] of Object.entries(cache)) {
                // STRICTOR: Use Word Boundary Matching for Variants
                if (entry.variants && entry.variants.some(v => {
                    const pattern = new RegExp(`\\b${v}\\b`, 'i');
                    return pattern.test(term) || (new RegExp(`\\b${term}\\b`, 'i')).test(v);
                })) {
                    semanticType = type;
                    cached = entry;
                    // console.log(`[InteractionLog] 🔍 Fuzzy Hit in ${targetCacheKey}: ${term} ~ [${type}]`);
                    break;
                }
            }
            if (cached) break;
        }
    }

    if (!cached) {
        // D. GLOBAL MEMORY FALLBACK (REMOVED)
        // Unified Architecture: We strictly use ATOMIC_SINGLE bucket within InteractionLog.
        /*
        if (targetBucket === CACHE_KEYS.ATOMIC_SINGLE && window.GlobalMemory) {
            const memoryResult = await window.GlobalMemory.resolveField(field);
            if (memoryResult) {
                console.log(`🔍 [InteractionLog] Delegated to GlobalMemory -> Found: "${(memoryResult.value || '').substring(0, 20)}..."`);
                return {
                    value: memoryResult.value,
                    confidence: memoryResult.confidence,
                    source: 'global_memory_fallback',
                    semanticType: semanticType
                };
            }
        }
        */

        return null;
    }

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
function getSectionMapping(key, field = null) {
    // 1. Priority: Explicit Section Type or Context
    const sectionType = field?.section_type || field?.parentContext ||
        (key.includes('work') ? 'work' : key.includes('edu') ? 'education' : null);

    if (sectionType === 'work' || sectionType === 'work_experience') return 'work_experience';
    if (sectionType === 'education' || sectionType === 'edu') return 'education';

    // 2. Fallback: Keyword Mapping for legacy/implicit keys
    const normalizedKey = key.toLowerCase();

    // Work Keywords (inclusive of 'employ', 'job', 'position', 'experience', 'description', 'start', 'end')
    if (/(job|work|employ|company|title|position|responsibilit|description|experience)/.test(normalizedKey)) {
        return 'work_experience';
    }

    // Education Keywords (inclusive of 'school', 'university', 'degree', 'major', 'gpa', 'study')
    if (/(school|university|degree|educat|institut|gpa|major|field_of_study|score|grade|study)/.test(normalizedKey)) {
        return 'education';
    }

    // 3. Ambiguous Date Handling (Default to Work if context is unclear but it's a repeater)
    if (/(date|start|end|year|month)/.test(normalizedKey)) {
        // If we made it here, it's a repeater field but we don't know the type.
        // We favor work_experience as the most common repeater.
        return 'work_experience';
    }

    return null;
}

// Helper: Normalize key to canonical form (e.g. company_name -> employer_name)
function getCanonicalKey(key) {
    const normalized = key.toLowerCase();
    // 1. Check if it's already a primary key
    if (ALIAS_REGISTRY[normalized]) return normalized;

    // 2. Check if it's an alias
    for (const [primary, aliases] of Object.entries(ALIAS_REGISTRY)) {
        if (aliases.includes(normalized)) return primary;
    }

    return normalized;
}

/**
 * Cache a field selection
 */
/**
 * Explicitly update a multi-value selection (Add/Remove)
 * @param {Object} field - Field metadata
 * @param {string} label - Field label
 * @param {string} value - Value to add/remove
 * @param {boolean} isSelected - True to add, False to remove
 */
async function updateMultiSelection(field, label, value, isSelected) {
    // 1. Direct Retrieval using Metadata
    // Priority: field.cache_label -> generateSemanticKey
    let storageKey = field.cache_label;
    let semanticType = field.cache_label;

    if (!storageKey) {
        const keyData = generateSemanticKey(field, label);
        storageKey = keyData.key;
        semanticType = keyData.key;
    }

    if (!storageKey) return; // Should not happen with new sidebar logic

    // 2. Determine Strategy based on Instance Type
    // Priority: field.instance_type -> determineCacheStrategy
    let targetCacheKey = null;
    if (field.instance_type === 'ATOMIC_MULTI') {
        targetCacheKey = CACHE_KEYS.ATOMIC_MULTI;
    } else if (field.instance_type === 'ATOMIC_SINGLE') {
        targetCacheKey = CACHE_KEYS.ATOMIC_SINGLE;
    } else if (field.instance_type === 'SECTION_REPEATER') {
        targetCacheKey = CACHE_KEYS.SECTION_REPEATER;
    } else {
        targetCacheKey = determineCacheStrategy(semanticType, field);
    }

    // 3. Routing Logic
    if (targetCacheKey !== CACHE_KEYS.ATOMIC_MULTI) {
        // For non-multi fields, we only care about selection (overwrite)
        if (isSelected) {
            return cacheSelection(field, label, value);
        }
        return;
    }

    // GLOBAL LOCK: Strictly serialize all updates to prevent race conditions
    const currentOp = _cacheLock.then(async () => {
        const cache = await getCache(targetCacheKey);

        // Canonicalize key for storage consistency
        // Uses simple normalization to avoid subtle mismatches
        const canonicalKey = storageKey ? storageKey.toLowerCase().trim() : '';

        // 4. Initialize if missing
        if (!cache[canonicalKey]) {
            cache[canonicalKey] = {
                value: [],
                useCount: 0,
                confidence: 0.75,
                variants: [],
                type: 'ATOMIC_MULTI',
                scope: field.scope || 'GLOBAL'
            };
        }
        const entry = cache[canonicalKey];

        // Ensure metadata sync
        if (field.instance_type) entry.type = field.instance_type;
        if (field.scope) entry.scope = field.scope;

        // 5. Array Update Logic (Add/Remove)

        // Normalize Input
        let inputPayload = value;
        if (typeof value === 'string' && value.includes(',')) {
            inputPayload = value.split(',').map(s => s.trim()).filter(s => s);
        }
        const valuesToProcess = Array.isArray(inputPayload) ? inputPayload : [inputPayload];
        console.log("entry", entry);
        // Normalize Existing
        let existingArray = [];
        if (Array.isArray(entry.value)) existingArray = entry.value;
        else if (typeof entry.value === 'string' && entry.value) existingArray = [entry.value];

        // Use a Set for unique values
        const set = new Set(existingArray);

        valuesToProcess.forEach(val => {
            if (isSelected) {
                set.add(val);
            } else {
                set.delete(val);
            }
        });
        entry.value = Array.from(set);
        entry.lastUsed = Date.now();

        const normLabel = normalizeFieldName(label);
        if (normLabel && !entry.variants.includes(normLabel)) entry.variants.push(normLabel);

        await saveCache(targetCacheKey, cache);

        // Meta update
        const meta = await getMetadata();
        const single = await getCache(CACHE_KEYS.ATOMIC_SINGLE);
        const multi = await getCache(CACHE_KEYS.ATOMIC_MULTI);
        meta.totalEntries = Object.keys(single).length + Object.keys(multi).length;
        await saveMetadata(meta);

    }).catch(err => console.error('[InteractionLog] Error in updateMultiSelection:', err));

    // Update global lock
    _cacheLock = currentOp;
    await currentOp;
}

/**
 * Cache a field selection
 */
/**
 * Cache a field selection
 */
async function cacheSelection(field, label, value) {
    // 1. Generate Key
    const { key: semanticType, isML } = generateSemanticKey(field, label);
    if (!semanticType) return;

    // 2. Determine Storage Strategy
    const targetCacheKey = determineCacheStrategy(semanticType, field);
    // console.log(`[InteractionLog] 💾 Caching: Key="${semanticType}" Bucket=${targetCacheKey} Type=${field?.instance_type || 'N/A'}`);

    const currentOp = _cacheLock.then(async () => {
        const cache = await getCache(targetCacheKey);

        // SAFETY: Final normalization check for generic radio/checkbox values
        // If value is 'on' or 'true', try to recover semantic label from field/DOM if possible
        if (value === 'on' || value === 'true' || value === true) {
            if (field && (field.type === 'radio' || field.type === 'checkbox')) {
                // Handle both raw HTMLElement and POJO wrapping an element (e.g. from FormObserver)
                const element = (typeof HTMLElement !== 'undefined' && field instanceof HTMLElement) ? field : field.element;

                // If it's a DOM element, try to get label
                if (typeof HTMLElement !== 'undefined' && element instanceof HTMLElement) {
                    if (window.getOptionLabelText) {
                        value = window.getOptionLabelText(element) || value;
                    } else if (window.FieldUtils && window.FieldUtils.getOptionLabelText) {
                        value = window.FieldUtils.getOptionLabelText(element) || value;
                    }
                }
            }
        }

        // A. SECTION_REPEATER: Row-Based Storage (Array of Hashes)
        if (targetCacheKey === CACHE_KEYS.SECTION_REPEATER) {
            const index = getFieldIndex(field, label);
            const parentSection = getSectionMapping(semanticType, field);


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

                // Write Value (Normalized Key)
                const storageKey = getCanonicalKey(semanticType);
                entry.value[index][storageKey] = value;
                entry.lastUsed = Date.now();
                console.log(`[InteractionLog] ✅ Saved to SECTION_REPEATER: [${parentSection}][${index}][${storageKey}] = "${value}"`);


                // Update variants (on parent)
                const normLabel = normalizeFieldName(label);
                if (normLabel && entry.variants && !entry.variants.includes(normLabel)) {
                    entry.variants.push(normLabel);
                }
            } else {
                // Fallback: Legacy Column-Based
                const storageKey = getCanonicalKey(semanticType);
                if (!cache[storageKey]) cache[storageKey] = { value: [], useCount: 0, confidence: 0.75, variants: [] };
                const entry = cache[storageKey];
                if (!Array.isArray(entry.value)) entry.value = entry.value ? [entry.value] : [];
                entry.value[index] = value;
                entry.lastUsed = Date.now();
            }
        } else {
            // B. ATOMIC Logic (Single or Multi)

            // Canonicalize key
            const storageKey = semanticType; // generateSemanticKey returns usage key
            const canonicalKey = getCanonicalKey(storageKey);

            if (!cache[canonicalKey]) {
                cache[canonicalKey] = {
                    value: targetCacheKey === CACHE_KEYS.ATOMIC_MULTI ? [] : null,
                    useCount: 0,
                    confidence: 0.75,
                    variants: [],
                    type: targetCacheKey // Store type
                };
            }
            const entry = cache[canonicalKey];

            // ATOMIC_MULTI: BLOCK LEGACY UPDATES
            // We strictly enforce that all multi-select updates must go through updateMultiSelection
            // cacheSelection is only for "overwrite" values (Single, Sectional Row)
            if (targetCacheKey === CACHE_KEYS.ATOMIC_MULTI) {
                // console.log(`[InteractionLog] 🚫 Skipping ATOMIC_MULTI in cacheSelection (Delegated to updateMultiSelection): ${canonicalKey}`);
                // return; // We simply do nothing here
            } else {
                // ATOMIC_SINGLE: Overwrite
                entry.value = value;
            }

            entry.useCount++;
            entry.lastUsed = Date.now();

            const normLabel = normalizeFieldName(label);
            if (normLabel && !entry.variants.includes(normLabel)) entry.variants.push(normLabel);
        }

        await saveCache(targetCacheKey, cache);

        // Meta update
        const meta = await getMetadata();
        const single = await getCache(CACHE_KEYS.ATOMIC_SINGLE);
        const multi = await getCache(CACHE_KEYS.ATOMIC_MULTI);
        meta.totalEntries = Object.keys(single).length + Object.keys(multi).length;
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
    const multiSec = await getCache(CACHE_KEYS.SECTION_REPEATER);

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
    updateMultiSelection,
    cleanupCache,
    getCacheStats,
    clearCache,
    classifyFieldType
};

if (typeof module !== 'undefined' && module.exports) module.exports = window.InteractionLog;

window.SelectionCache = window.InteractionLog;
// console.log('[InteractionLog] Module loaded with Dual-Store Support');
