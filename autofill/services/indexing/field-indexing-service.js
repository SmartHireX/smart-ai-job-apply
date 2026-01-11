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
     */
    detectIndexFromAttribute(field) {
        const str = (field.name || field.id || '');
        // Matches "_0", "-0", "[0]" at end or middle
        const match = str.match(/[_\-\[](\d+)[_\-\]]?$/) || str.match(/[_\-\[](\d+)[_\-\]]?/);
        if (match) {
            return parseInt(match[1], 10);
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
            console.log(`[IndexingService] Incremented ${type} index to ${this.counters[type]}`);
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
