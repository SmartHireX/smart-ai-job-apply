/**
 * key-generator.js
 * 
 * robust "Enterprise Grade" cache key generation.
 * Uses advanced tokenization, synonym normalization, and stemming to create
 * consistent, semantic keys for fields when ML prediction is unavailable.
 */

(function (global) {

    // 1. Expanded stop-words (common form noise)
    const STOP_WORDS = new Set([
        'the', 'and', 'for', 'of', 'are', 'you', 'have', 'over', 'enter', 'your',
        'please', 'select', 'choose', 'this', 'that', 'with', 'from', 'will',
        'what', 'how', 'when', 'where', 'why', 'can', 'could', 'would', 'should',
        'here', 'there', 'about', 'into', 'through', 'during', 'before', 'after',
        'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once',
        'only', 'just', 'more', 'most', 'other', 'some', 'such', 'our', 'us',
        'field', 'input', 'required', 'optional', 'provide', 'information', 'details'
    ]);

    // 2. Synonym normalization (canonical forms)
    const SYNONYM_TO_CANONICAL = {
        'postal': 'zip', 'zipcode': 'zip', 'postcode': 'zip', 'pincode': 'zip',
        'tel': 'phone', 'mobile': 'phone', 'cell': 'phone', 'telephone': 'phone',
        'mail': 'email', 'e-mail': 'email', 'emailaddress': 'email',
        'given': 'first', 'fname': 'first', 'firstname': 'first',
        'family': 'last', 'surname': 'last', 'lname': 'last', 'lastname': 'last',
        'company': 'employer', 'organization': 'employer', 'firm': 'employer',
        'position': 'job', 'role': 'job', 'occupation': 'job',
        'university': 'school', 'college': 'school', 'institution': 'school',
        'qualification': 'degree', 'certification': 'degree',
        'compensation': 'salary', 'remuneration': 'salary', 'pay': 'salary', 'ctc': 'salary'
    };

    // 3. Basic stemming (common suffixes)
    const STEM_RULES = [
        [/ation$/, ''], [/ment$/, ''], [/ness$/, ''], [/ity$/, ''],
        [/ing$/, ''], [/ed$/, ''], [/er$/, ''], [/est$/, ''],
        [/ly$/, ''], [/ful$/, ''], [/less$/, ''], [/able$/, ''], [/ible$/, '']
    ];

    // 4. Priority tokens (field-specific, should be kept even if short)
    const PRIORITY_TOKENS = new Set([
        'zip', 'phone', 'email', 'name', 'first', 'last', 'city', 'state',
        'job', 'work', 'employer', 'title', 'school', 'degree', 'date',
        'start', 'end', 'salary', 'linkedin', 'gender', 'veteran', 'visa'
    ]);

    /**
     * Generates a robust cache key from a field object.
     * @param {Object} field - Field object or element
     * @returns {string} - The generated cache label (or empty string if input invalid)
     */
    function generateEnterpriseCacheKey(field) {
        if (!field) return '';

        const name = field.name || '';
        const label = field.label || '';
        const parentContext = field.parentContext || '';

        // Capture raw input from multiple sources
        const rawInput = [name, label, parentContext].filter(Boolean).join(' ');

        if (!rawInput.trim()) return '';

        // Process tokens
        let tokens = rawInput.toLowerCase()
            .replace(/[^a-z0-9]/g, ' ')
            .split(/\s+/)
            .filter(Boolean);

        // Apply transformations
        tokens = tokens.map(token => {
            // Synonym normalization
            if (SYNONYM_TO_CANONICAL[token]) {
                token = SYNONYM_TO_CANONICAL[token];
            }

            // Basic stemming (only for longer words)
            if (token.length > 5) {
                for (const [pattern, replacement] of STEM_RULES) {
                    if (pattern.test(token)) {
                        const stemmed = token.replace(pattern, replacement);
                        if (stemmed.length >= 3) {
                            token = stemmed;
                        }
                        break;
                    }
                }
            }

            return token;
        });

        // Filter: Keep priority tokens OR tokens > 2 chars that aren't stop words
        tokens = tokens.filter(token =>
            PRIORITY_TOKENS.has(token) || (token.length > 2 && !STOP_WORDS.has(token))
        );

        // Unique, sort, and join
        const uniqueTokens = Array.from(new Set(tokens)).sort();
        return uniqueTokens.join('_');
    }

    // Export globally
    global.KeyGenerator = {
        generateEnterpriseCacheKey
    };

})(typeof window !== 'undefined' ? window : this);
