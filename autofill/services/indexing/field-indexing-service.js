/**
 * IndexingService
 * 
 * Determines the "Index" (0, 1, 2...) of a field to support multi-entry filling.
 * Combines "Linguistic Ranking" (Keywords) with "Sequential Fallback".
 * 
 * Strategy:
 * 1. Explicit: "Previous Employer" -> Index 1
 * 2. Implicit: Second occurrences of "Company Name" -> Index 1
 */

class IndexingService {
    constructor() {
        this.reset();

        // Keywords for Explicit Ranking
        this.RANK_PATTERNS = {
            0: /primary|first|1st|current|latest|present|most\s?recent|main/i,
            1: /secondary|second|2nd|previous|former|prior|past/i,
            2: /tertiary|third|3rd/i
        };

        // Fields that signal the START of a new section (Sequential Logic)
        this.SECTION_START_FIELDS = {
            work: ['company', 'employer', 'organization'], // When we see ANY of these...
            education: ['school', 'university', 'college', 'institution'],
            reference: ['name', 'full_name'], // For references
        };
    }

    /**
     * Reset counters for a new form processing session
     */
    reset() {
        this.counters = {
            work: 0,
            education: 0,
            reference: 0,
            generic: 0
        };
        this.seenSections = new Set(); // Track unique section identifiers if possible
    }

    /**
     * Determine the index for a field
     * @param {Object} field - The field object
     * @param {string} type - 'work', 'education', etc.
     * @returns {number} The calculated index (0-based)
     */
    getIndex(field, type) {
        if (!type) return 0;

        // 1. Attribute Check (Strongest Signal)
        // e.g. "edu_school_1" -> Index 1
        const attrIndex = this.detectIndexFromAttribute(field);
        if (attrIndex !== null) return attrIndex;

        // 2. Linguistic Ranking (Explicit Override)
        // If the label says "Previous", we MUST use Index 1, regardless of sequence.
        const explicitIndex = this.detectIndexFromLabel(field.label);
        if (explicitIndex !== null) {
            return explicitIndex;
        }

        // 3. Sequential Tracking (Implicit)
        // This relies on the Caller (FieldRouter) to tell us when to increment.
        // OR we can try to be smart here.
        // For now, return current counter.
        return this.counters[type] || 0;
    }

    /**
     * Detect index from name/id attributes like "job_title_1"
     * Anchored and UUID-Safe (V3)
     */
    detectIndexFromAttribute(field) {
        const str = (field.name || field.id || '');
        if (!str) return null;

        // 1. UUID PROTECTION
        // Framework IDs (Ashby, Lever, Greenhouse) often contain numeric segments or end in framework-assigned -0/-1
        // If the string looks like a long UUID, we ignore segments unless they are clearly structural.
        const isLongIdentifier = str.length > 25;
        const reflectsUUID = /^[0-9a-f-]{30,}/i.test(str) || /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i.test(str);

        // 2. ANCHORED INDEX DETECTION
        // We only match indices that are preceded by a separator AND either at the end 
        // OR follow a specific structural keyword like "employer_0_name"
        const patterns = [
            /[\b_.-](\d+)$/,              // Suffix: -0, _1, .2
            /[\[](\d+)[\]]/,               // Array: [0], [1]
            /[\b_.-](\d+)[\b_.-]/          // Infix: _0_, -1-
        ];

        for (const pattern of patterns) {
            const match = str.match(pattern);
            if (match) {
                const val = parseInt(match[1], 10);

                // If it's a UUID, only accept small indices (< 20) that are CLEARLY suffixes.
                // Random segments like 4538 inside a UUID must be rejected.
                if (reflectsUUID || isLongIdentifier) {
                    const isSuffix = str.endsWith(match[0]);
                    if (isSuffix && val < 20) return val;
                    continue; // Ignore random infix numbers in UUIDs
                }

                return val;
            }
        }

        return null;
    }

    /**
     * Detect index based on label keywords
     * @param {string} label 
     * @returns {number|null}
     */
    detectIndexFromLabel(label) {
        if (!label) return null;
        const text = label.toLowerCase();

        // Check patterns
        for (const [index, regex] of Object.entries(this.RANK_PATTERNS)) {
            if (regex.test(text)) {
                return parseInt(index, 10);
            }
        }

        // Check for "Employer 2" or "Job 3" patterns
        const numberMatch = text.match(/(?:no\.|#|num|number)\s?(\d+)/);
        if (numberMatch) {
            return Math.max(0, parseInt(numberMatch[1], 10) - 1); // "Job 1" -> Index 0
        }

        return null;
    }

    /**
     * Increment the sequential counter for a type
     * Should be called when a "Start Field" (e.g. New Company Name) is encountered.
     */
    incrementCounter(type) {
        if (this.counters[type] !== undefined) {
            this.counters[type]++;
            // console.log(`[IndexingService] Incremented ${type} index to ${this.counters[type]}`);
        }
    }
}

// Export for usage
if (typeof window !== 'undefined') {
    window.IndexingService = new IndexingService();
}
if (typeof module !== 'undefined') {
    module.exports = IndexingService;
}
