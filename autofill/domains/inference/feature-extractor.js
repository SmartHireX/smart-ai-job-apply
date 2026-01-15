/**
 * FeatureExtractor
 * 
 * Converts raw form fields into numerical vectors for the Neural Classifier.
 * Enterprise-grade implementation with advanced text normalization and hashing.
 * 
 * Features (59 dimensions):
 *   1. Structural Features (5): Input type one-hot encoding
 *   2. Heuristic Features (4): Label presence, placeholder, visual weight, role
 *   3. Textual Features (50): Hashed Bag of Words for various text sources
 * 
 * Optimizations:
 *   - Improved text normalization (handles typos, international chars)
 *   - Feature scaling to [0, 1] range
 *   - Better hash distribution (FNV-1a based)
 *   - TF-IDF inspired weighting
 * 
 * @module FeatureExtractor
 * @version 2.0.0
 * @author SmartHireX AI Team
 */

class FeatureExtractor {

    // ========================================================================
    // STATIC CONFIGURATION
    // ========================================================================

    /** @type {number} Vocabulary size for bag of words */
    static VOCAB_SIZE = 100;

    /** @type {number} Feature vector dimension (must match neural network) */
    static FEATURE_DIM = 79;

    /** @type {boolean} Enable debug logging */
    static DEBUG = false;

    // Common typos and synonyms for normalization
    static TYPO_MAP = {
        'fisrt': 'first',
        'frist': 'first',
        'firsr': 'first',
        'lname': 'last_name',
        'fname': 'first_name',
        'emial': 'email',
        'emal': 'email',
        'phoen': 'phone',
        'telepone': 'phone',
        'adress': 'address',
        'addres': 'address',
        'citiy': 'city',
        'contry': 'country',
        'cmpany': 'company',
        'compny': 'company',
        'organiztion': 'organization',
        'univeristy': 'university',
        'univesity': 'university',
        'institue': 'institute',
        'experiance': 'experience',
        'expirience': 'experience',
        'educaton': 'education',
        'edcuation': 'education',
        'emploer': 'employer',
        'emplyer': 'employer',
        'positon': 'position',
        'tittle': 'title',
        'dergee': 'degree',
        'degre': 'degree',
        'statr': 'start',
        'sart': 'start',
        'ened': 'end'
    };

    // Stop words to filter out (low information content)
    static STOP_WORDS = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
        'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'this',
        'that', 'these', 'those', 'your', 'you', 'our', 'my', 'please',
        'enter', 'input', 'type', 'field', 'required', 'optional', 'here'
    ]);

    // High-value keywords that should boost hash weight
    static BOOST_WORDS = new Set([
        'name', 'first', 'last', 'email', 'phone', 'address', 'city', 'state',
        'zip', 'country', 'linkedin', 'github', 'portfolio', 'resume', 'cv',
        'education', 'school', 'university', 'degree', 'gpa', 'major', 'study',
        'work', 'experience', 'job', 'employer', 'company', 'title', 'position',
        'salary', 'compensation', 'gender', 'race', 'veteran', 'disability',
        'authorization', 'sponsor', 'visa', 'citizen', 'legal', 'referral'
    ]);

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

    constructor() {
        this.VOCAB_SIZE = FeatureExtractor.VOCAB_SIZE;
    }

    // ========================================================================
    // MAIN API
    // ========================================================================

    /**
     * Vectorize a field object into an array of numbers
     * @param {Object} field - The field object constructed by FormExtractor
     * @returns {Array<number>} Input vector for the model (59 dimensions)
     */
    extract(field) {
        // Safety check: Return zero vector for null/undefined
        if (!field) {
            return new Array(FeatureExtractor.FEATURE_DIM).fill(0);
        }

        // Helper to safely get attribute
        const getAttr = (attr) => {
            if (field.getAttribute && typeof field.getAttribute === 'function') {
                return field.getAttribute(attr);
            }
            return field[attr] || null;
        };

        // Compute accessible label (what screen reader sees)
        const computedLabel = this.getComputedLabel(field);
        const computedRole = getAttr('role') ||
            (field.tagName ? field.tagName.toLowerCase() : (field.type || 'text'));

        // ============ BUILD FEATURE VECTOR ============
        const features = [
            // 1. Structural Features (5 dims) - One-Hot Input Type
            this._isType(field, 'text'),
            this._isType(field, 'number'),
            this._isType(field, 'email'),
            this._isType(field, 'password'),
            this._isType(field, 'tel'),

            // 2. Heuristic Features (4 dims)
            computedLabel ? 1 : 0,                                          // Has accessible label?
            field.placeholder ? 1 : 0,                                      // Has placeholder?
            this._calculateVisualWeight(field),                             // Visual prominence [0-1]
            (computedRole === 'combobox' || computedRole === 'listbox') ? 1 : 0,  // Is complex select?

            // 3. Textual Features (50 dims) - Hashed Bag of Words
            ...this._hashTextEnhanced(computedLabel || '', 20),             // Label (20 slots)
            ...this._hashTextEnhanced((field.name || '') + ' ' + (field.id || '') + ' ' + (getAttr('data-automation-id') || field.automationId || ''), 20), // Name/ID/Automation (20 slots)
            ...this._hashTextEnhanced(field.placeholder || '', 5),          // Placeholder (5 slots)
            ...this._hashTextEnhanced(getAttr('context') || field.context || '', 5),  // Section (5 slots)
            ...this._hashTextEnhanced(field.parentContext || '', 10),       // Parent heading (10 slots)
            ...this._hashTextEnhanced(field.siblingContext || '', 10)       // Neighbors (10 slots)
        ];

        // Scale all features to [0, 1] range for better training
        return this._scaleFeatures(features);
    }

    // ========================================================================
    // ACCESSIBILITY TREE HELPER
    // ========================================================================

    /**
     * Get the computed accessible label for a field
     * Precedence: aria-labelledby > aria-label > <label for=""> > placeholder > title
     * @param {Object} field - Form field
     * @returns {string} Computed label
     */
    getComputedLabel(field) {
        const isDOM = typeof field.hasAttribute === 'function';

        // 1. aria-labelledby (Points to another element)
        if (isDOM && field.hasAttribute('aria-labelledby')) {
            const id = field.getAttribute('aria-labelledby');
            const labelEl = document.getElementById(id);
            if (labelEl) return labelEl.innerText.trim();
        }

        // 2. aria-label (Direct override)
        if (isDOM && field.hasAttribute('aria-label')) {
            return field.getAttribute('aria-label').trim();
        }

        // 3. Explicit <label for="id">
        if (field.labels && field.labels.length > 0) {
            return Array.from(field.labels).map(l => l.innerText).join(' ').trim();
        }

        // 4. Fallback to passed label from Scanner
        if (field.label) return field.label;

        // 5. Placeholder / Title (Weakest signals)
        const placeholder = field.placeholder || (isDOM ? field.getAttribute('placeholder') : '');
        const title = field.title || (isDOM ? field.getAttribute('title') : '');

        return placeholder || title || '';
    }

    // ========================================================================
    // TEXT PROCESSING
    // ========================================================================

    /**
     * Enhanced text normalization
     * - Lowercase
     * - Remove special characters
     * - Fix common typos
     * - Filter stop words
     * @private
     * @param {string} text - Raw text input
     * @returns {string[]} Cleaned tokens
     */
    _normalizeText(text) {
        if (!text) return [];

        // 1. Lowercase and remove digits (treats "job_1" same as "job_2")
        let cleaned = text.toLowerCase().replace(/\d+/g, '');

        // 2. Replace underscores and camelCase with spaces
        cleaned = cleaned
            .replace(/_/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .toLowerCase();

        // 3. Remove special characters, keep only letters and spaces
        cleaned = cleaned.replace(/[^a-z\s]/g, ' ');

        // 4. Split into words (min length 2)
        let words = cleaned.split(/\s+/).filter(w => w.length >= 2);

        // 5. Fix common typos
        words = words.map(w => FeatureExtractor.TYPO_MAP[w] || w);

        // 6. Filter stop words
        words = words.filter(w => !FeatureExtractor.STOP_WORDS.has(w));

        return words;
    }

    /**
     * Enhanced hashing with FNV-1a algorithm and TF-IDF-like weighting
     * @private
     * @param {string} text - Input text
     * @param {number} slots - Number of hash slots
     * @returns {number[]} Feature vector
     */
    _hashTextEnhanced(text, slots) {
        const vector = new Array(slots).fill(0);

        const words = this._normalizeText(text);
        if (words.length === 0) return vector;

        // Word frequency map for TF weighting
        const wordFreq = {};
        words.forEach(word => {
            wordFreq[word] = (wordFreq[word] || 0) + 1;
        });

        // Hash each unique word with weighting
        Object.entries(wordFreq).forEach(([word, count]) => {
            // FNV-1a hash (better distribution than simple hash)
            const index = this._fnv1aHash(word) % slots;

            // TF-IDF inspired weight
            let weight = Math.log(1 + count);  // Term frequency (log dampening)

            // Boost important words
            if (FeatureExtractor.BOOST_WORDS.has(word)) {
                weight *= 1.5;
            }

            // Accumulate (allows multiple words to contribute to same slot)
            vector[index] += weight;
        });

        // Normalize to [0, 1] range
        const maxVal = Math.max(...vector, 1);
        return vector.map(v => v / maxVal);
    }

    /**
     * FNV-1a hash - Better distribution than simple hash
     * @private
     * @param {string} string - Input string
     * @returns {number} 32-bit hash value
     */
    _fnv1aHash(string) {
        let hash = 2166136261;  // FNV offset basis
        for (let i = 0; i < string.length; i++) {
            hash ^= string.charCodeAt(i);
            hash = (hash * 16777619) >>> 0;  // FNV prime, keep as uint32
        }
        return hash >>> 0;
    }

    /**
     * Legacy hashText for backward compatibility
     * @deprecated Use _hashTextEnhanced instead
     */
    hashText(text, slots) {
        return this._hashTextEnhanced(text, slots);
    }

    // ========================================================================
    // FEATURE SCALING
    // ========================================================================

    /**
     * Scale features to [0, 1] range
     * Ensures all features are normalized for stable training
     * @private
     * @param {number[]} features - Raw feature vector
     * @returns {number[]} Scaled feature vector
     */
    _scaleFeatures(features) {
        return features.map(f => {
            // Clamp to [0, 1] - most features are already in this range
            return Math.max(0, Math.min(1, f));
        });
    }

    // ========================================================================
    // GEOMETRIC HEURISTICS
    // ========================================================================

    /**
     * Calculate visual weight/prominence of a field
     * @private
     * @param {Object} field - Form field
     * @returns {number} Visual weight [0-1]
     */
    _calculateVisualWeight(field) {
        // Mock for non-DOM environments
        if (typeof field.getBoundingClientRect !== 'function') {
            return 0.5;
        }

        const rect = field.getBoundingClientRect();

        // 1. Visibility Check
        if (rect.width === 0 || rect.height === 0 || field.style?.display === 'none') {
            return 0.0;  // Invisible/honeypot fields
        }

        // 2. Prominence (Bigger = more important)
        const area = rect.width * rect.height;
        const screenArea = window.innerWidth * window.innerHeight;
        const relativeSize = Math.min(area / (screenArea * 0.05), 1.0);

        // 3. Position (Top of form = usually Name/Email)
        const relativeY = Math.min(rect.top / window.innerHeight, 1.0);
        const positionScore = 1.0 - relativeY;

        // Combined: Size (30%) + Position (70%)
        return (relativeSize * 0.3) + (positionScore * 0.7);
    }

    /**
     * Legacy method compatibility
     */
    calculateVisualWeight(field) {
        return this._calculateVisualWeight(field);
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    /**
     * Check if field is of a specific input type
     * @private
     */
    _isType(field, type) {
        const t = (field.type || '').toLowerCase();
        return t === type ? 1.0 : 0.0;
    }

    /**
     * Legacy method compatibility
     */
    isType(field, type) {
        return this._isType(field, type);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof window !== 'undefined') {
    window.FeatureExtractor = FeatureExtractor;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FeatureExtractor;
}
