/**
 * key-generator.js
 * 
 * Enterprise-Grade Cache Key Generation Utility.
 * Implements advanced tokenization, normalization, and semantic processing strategies
 * to produce high-quality, deterministic cache keys for form fields.
 * 
 * Standards:
 * - CamelCase/PascalCase Splitting (e.g., "firstName" -> "first", "name")
 * - Synonym Canonicalization (e.g., "cell" -> "phone")
 * - Suffix Stemming (e.g., "required" -> "requir" -> dropped if stop word)
 * - Priority Token Retention (e.g., "zip", "id")
 * - Noise Reduction (Stop Words)
 */

(function (global) {

    // --- CONSTANTS ---

    // 1. Expanded stop-words (High-frequency form noise)
    const STOP_WORDS = new Set([
        'the', 'and', 'for', 'of', 'are', 'you', 'have', 'over', 'enter', 'your',
        'please', 'select', 'choose', 'this', 'that', 'with', 'from', 'will',
        'what', 'how', 'when', 'where', 'why', 'can', 'could', 'would', 'should',
        'here', 'there', 'about', 'into', 'through', 'during', 'before', 'after',
        'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once',
        'only', 'just', 'more', 'most', 'other', 'some', 'such', 'our', 'us',
        'field', 'input', 'required', 'optional', 'provide', 'information', 'details',
        'valid', 'invalid', 'format', 'example', 'type'
    ]);

    // 2. Synonym normalization (Map to Canonical Forms)
    const SYNONYM_TO_CANONICAL = {
        'postal': 'zip', 'zipcode': 'zip', 'postcode': 'zip', 'pincode': 'zip',
        'tel': 'phone', 'mobile': 'phone', 'cell': 'phone', 'telephone': 'phone', 'contact': 'phone',
        'mail': 'email', 'e-mail': 'email', 'emailaddress': 'email',
        'given': 'first', 'fname': 'first', 'firstname': 'first',
        'family': 'last', 'surname': 'last', 'lname': 'last', 'lastname': 'last',
        'company': 'employer', 'organization': 'employer', 'firm': 'employer', 'business': 'employer',
        'position': 'job', 'role': 'job', 'occupation': 'job', 'designation': 'job',
        'university': 'school', 'college': 'school', 'institution': 'school', 'academy': 'school',
        'qualification': 'degree', 'certification': 'degree', 'credential': 'degree',
        'compensation': 'salary', 'remuneration': 'salary', 'pay': 'salary', 'ctc': 'salary', 'income': 'salary',
        'loc': 'location', 'region': 'state', 'province': 'state',
        'linked': 'linkedin', 'git': 'github', 'web': 'website', 'url': 'website', 'site': 'website'
    };

    // 3. Basic stemming rules (Suffix Stripping)
    const STEM_RULES = [
        [/ation$/, ''], [/ment$/, ''], [/ness$/, ''], [/ity$/, ''], [/ance$/, ''], [/ence$/, ''],
        [/ing$/, ''], [/ed$/, ''], [/er$/, ''], [/est$/, ''],
        [/ly$/, ''], [/ful$/, ''], [/less$/, ''], [/able$/, ''], [/ible$/, ''],
        [/ies$/, 'y'], [/s$/, ''] // Pluralization handling
    ];

    // 4. Priority tokens (Always retain these signals)
    const PRIORITY_TOKENS = new Set([
        'zip', 'phone', 'email', 'name', 'first', 'last', 'city', 'state', 'country',
        'job', 'work', 'employer', 'title', 'school', 'degree', 'date', 'month', 'year',
        'start', 'end', 'salary', 'linkedin', 'github', 'website', 'gender', 'veteran', 'visa',
        'race', 'ethnicity', 'disability', 'cover', 'letter', 'resume', 'cv'
    ]);

    // --- HELPER FUNCTIONS ---

    /**
     * Splits CamelCase and PascalCase strings into separate words.
     * e.g. "firstName" -> "first Name", "PDFLoader" -> "PDF Loader"
     */
    function splitCamelCase(str) {
        if (!str) return '';
        return str
            .replace(/([a-z])([A-Z])/g, '$1 $2') // lowerUpper -> lower Upper
            .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2'); // UpperUpperLower -> Upper UpperLower
    }

    /**
     * Generates a robust cache key from a field object.
     * @param {Object} field - Field object or element (must have name/label/id/parentContext)
     * @returns {string} - The generated cache label (or empty string if input invalid)
     */
    function generateEnterpriseCacheKey(field) {
        if (!field) return '';

        // 1. Gather Signals (Score: Name > Label > ID > Context)
        const name = splitCamelCase(field.name || '');
        const label = field.label || '';
        const id = splitCamelCase(field.id || ''); // IDs often use camelCase
        const parentContext = field.parentContext || '';
        const placeholder = field.placeholder || '';

        // Combine all raw inputs into a single "Soup"
        const rawSoup = [name, label, id, placeholder, parentContext].filter(Boolean).join(' ');

        if (!rawSoup.trim()) return '';

        // 2. Tokenize & Clean
        // - Lowercase
        // - Replace non-alphanumeric with space
        // - Split by whitespace
        let tokens = rawSoup.toLowerCase()
            .replace(/[^a-z0-9]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 1); // Discard single chars (unless priority, checked later)

        // 3. Normalize & Transform
        tokens = tokens.map(token => {
            // A. Synonym Mapping
            if (SYNONYM_TO_CANONICAL[token]) {
                return SYNONYM_TO_CANONICAL[token];
            }

            // B. Stemming (only longer words)
            if (token.length > 5) {
                for (const [pattern, replacement] of STEM_RULES) {
                    if (pattern.test(token)) {
                        const stemmed = token.replace(pattern, replacement);
                        // Ensure stem is valid length
                        if (stemmed.length >= 3) {
                            return stemmed;
                        }
                        break; // Apply only one stem rule
                    }
                }
            }
            return token;
        });

        // 4. Filter & Prioritize
        const validTokens = new Set();

        tokens.forEach(token => {
            // Keep if Priority Token
            if (PRIORITY_TOKENS.has(token)) {
                validTokens.add(token);
                return;
            }

            // Keep if significant length and NOT a stop word
            if (token.length > 2 && !STOP_WORDS.has(token)) {
                validTokens.add(token);
            }
        });

        // 5. Final Assembly
        // Sort for determinism (e.g. "Name First" vs "First Name" -> "first_name")
        const sortedTokens = Array.from(validTokens).sort();

        // 6. Fallback
        if (sortedTokens.length === 0) {
            // If all tokens were filtered out (extremely rare), fallback to a safe sanitized original name/id
            return (field.name || field.id || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '_');
        }

        return sortedTokens.join('_');
    }

    // Export globally
    global.KeyGenerator = {
        generateEnterpriseCacheKey
    };

})(typeof window !== 'undefined' ? window : this);
