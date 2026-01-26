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

        // Map raw attribute IDs to logical indices per type
        // e.g. work: { "7": 0, "12": 1 }
        this.sectionIndexMap = {};
    }

    /**
     * Determine the index for a field
     * Returns object with confidence score for router consumption.
     * @param {Object} field - The field object
     * @param {string} type - 'work', 'education', etc.
     * @returns {Object} { index: number|null, confidence: number }
     */
    getIndex(field, type) {
        // Atomic Guard: Prevent ATOMIC_MULTI (e.g. Survey Checkboxes) from being hijacked by sectional logic
        // If it's already classified as ATOMIC_MULTI by the Regex/Override layer, we respect that.
        if (field.instance_type === 'ATOMIC_MULTI') {
            return { index: null, confidence: -1 };
        }

        // 1. Attribute Check (Strongest Signal - Type Independent)
        // e.g. "workExperience-7--companyName" -> Index 7 (Confidence 3)
        // This MUST happen before type check because Attribute Detection is self-sufficient.
        const attrResult = this.detectIndexFromAttribute(field);
        if (attrResult) {
            // NORMALIZE: Map random IDs (7, 12, 99) to logical 0-based sequence (0, 1, 2)
            // This fixes "workExperience-7" being treated as Index 7 when it's just the first item.

            // ROGUE ID SUPPRESSION (User Fix):
            // If the Attribute ID is "High/Random" (> 10) AND we are visually still in the same group 
            // (no section start seen), we FORCE merge this ID into the current logical group.
            // This prevents "School-0" and "Year-28" from splitting into two entries.
            const typeKey = type || 'generic';
            const currentCounter = this.counters[typeKey] || 0;
            const isRandomId = attrResult.index > 10;

            // Check if we should override the mapping BEFORE asking for logical index
            if (isRandomId && !this.hasSeenSectionStart(field, typeKey)) {
                this.forceMapRawIndex(typeKey, attrResult.index, currentCounter);
            }

            const logicalIndex = this.getLogicalIndex(typeKey, attrResult.index);
            return { index: logicalIndex, confidence: attrResult.tier };
        }

        if (!type) return { index: null, confidence: 0 };

        // 2. Linguistic Ranking (Explicit Override)
        // If the label says "Previous", we MUST use Index 1, regardless of sequence.
        const explicitIndex = this.detectIndexFromLabel(field.label);
        if (explicitIndex !== null) {
            return { index: explicitIndex, confidence: 1 };
        }

        // 3. Sequential Tracking (Implicit Fallback)
        // Phantom Guard: Only return an index if we have actually seen a Section Start (header) for this type.
        // This prevents random fields from picking up "Index 0" just because the counter exists.
        if (this.hasSeenSectionStart(field, type)) {
            return { index: this.counters[type] || 0, confidence: 0 };
        }

        return { index: null, confidence: 0 };
    }

    /**
     * Map a raw discovered index (e.g. 7, 1023, "abc") to a sequential logical index (0, 1, 2)
     * Scope is per-section-type.
     */
    getLogicalIndex(type, rawId) {
        if (!this.sectionIndexMap[type]) {
            this.sectionIndexMap[type] = {
                map: new Map(),
                next: 0
            };
        }

        const section = this.sectionIndexMap[type];

        // Return existing mapping
        if (section.map.has(rawId)) {
            return section.map.get(rawId);
        }

        // Assign new sequential index
        const newIndex = section.next++;
        section.map.set(rawId, newIndex);
        return newIndex;
    }

    /**
     * Force a raw ID to map to a specific logical index.
     * Used for merging "Rogue IDs" (like education-28) into the current group.
     */
    forceMapRawIndex(type, rawId, targetIndex) {
        if (!this.sectionIndexMap[type]) {
            this.sectionIndexMap[type] = { map: new Map(), next: 0 };
        }
        // Only set if not already set (or overwrite? Overwrite is safer for correction)
        this.sectionIndexMap[type].map.set(rawId, targetIndex);

        // Ensure 'next' is generally ahead of this to avoid collisions, 
        // though strictly 'next' tracks *generated* indices.
        if (targetIndex >= this.sectionIndexMap[type].next) {
            this.sectionIndexMap[type].next = targetIndex + 1;
        }
    }

    /**
     * Detect index from name/id attributes like "job_title_1"
     * Anchored and UUID-Safe (V3)
     * Returns { index, tier } or null
     */
    detectIndexFromAttribute(field) {
        // Prioritize ID because frameworks often put structural info there (e.g. work-0-job),
        // while 'name' might just be 'jobTitle' to match the backend.
        // But we check both to be safe.
        const candidates = [field.id, field.name].filter(Boolean);

        for (const str of candidates) {
            // 1. UUID PROTECTION (Relaxed)
            const isVeryLongIdentifier = str.length > 50;
            const reflectsUUID = /^[0-9a-f-]{30,}/i.test(str) || /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i.test(str);

            // 2. EXPLICIT REPEATER SIGNATURE (Confidence 3)
            // Double Dash Infix (BEM/Ashby style): word-0--word
            const explicitPattern = /[-_](\d+)[-_]{2,}/;
            const explicitMatch = str.match(explicitPattern);
            if (explicitMatch) {
                return { index: parseInt(explicitMatch[1], 10), tier: 3 };
            }

            // 3. STANDARD PATTERNS (Confidence 2)
            const standardPatterns = [
                /[\b_.-](\d+)$/,              // Suffix: -0, _1, .2
                /[\[](\d+)[\]]/,               // Array: [0], [1]
                /[\b_.-](\d+)[\b_.-]/          // Infix: _0_, -1-
            ];

            for (const pattern of standardPatterns) {
                const match = str.match(pattern);
                if (match) {
                    const val = parseInt(match[1], 10);

                    // UUID Suffix Check
                    if (reflectsUUID || isVeryLongIdentifier) {
                        const isSuffix = str.endsWith(match[0]);
                        if (isSuffix && val < 20) return { index: val, tier: 2 };
                        continue;
                    }

                    return { index: val, tier: 2 };
                }
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
     * Generate a Stable UID for Repeater Instances (Ant-Drift)
     * Strategy: hash(container_path + anchor_text + base_key)
     * @param {Object} field
     * @param {string} sectionType
     */
    getStableUID(field, sectionType) {
        if (!field || !field.element) return null;

        // 1. Get Nearest Stable Header (Anchor)
        let headerText = '';
        if (window.SectionDetector && window.SectionDetector.getNearestHeadingText) {
            headerText = window.SectionDetector.getNearestHeadingText(field.element) || '';
        }

        // 2. Get Container Fingerprint (Path ignoring high-volatility attributes)
        // We use a simplified path to avoid brittleness
        const getParentTag = (el) => el.parentElement ? el.parentElement.tagName : 'ROOT';
        const containerPath = `${getParentTag(field.element)}>${field.element.tagName}`;

        // 3. Base Key (Name without numbers)
        const baseKey = this.getBaseKey ? this.getBaseKey(field) : (field.name || '').replace(/\d+/g, '');

        // 4. Combine
        // Note: If headerText is unique (e.g. "Google", "Job 1"), this is very stable.
        // If headerText is generic ("Work Experience"), we rely on sequential mapping,
        // effectively falling back to index, but we hashed it so it Looks stable :)
        // To be truly drift-proof requires reading values, which we can't do if empty.
        const seed = `${sectionType}|${headerText}|${containerPath}|${baseKey}`;

        return this.computeHash(seed);
    }

    /**
     * Simple string hash (DJB2 variant) for UIDs
     */
    computeHash(str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = (hash * 33) ^ str.charCodeAt(i);
        }
        return (hash >>> 0).toString(16);
    }

    /**
     * Check if we have encountered a structural start for this section type.
     * This acts as the "Phantom Guard" against sequential indexing.
     */
    hasSeenSectionStart(field, type) {
        // Check explicit seenSections set first (populated by extractors/detectors if available)
        // Or fallback to checking if counters > 0 (meaning we've incremented at least once)
        if (this.counters[type] > 0) return true;

        // Or check if THIS field itself is a start field
        const label = (field.label || '').toLowerCase();
        const startKeywords = this.SECTION_START_FIELDS[type] || [];
        if (startKeywords.some(k => label.includes(k))) return true;

        return false;
    }

    /**
     * Get Normalized Base Key for Grouping
     * Strips UUID prefixes and index segments to create a stable group key.
     * e.g. "99f-work-0--job" -> "work--job"
     */
    getBaseKey(field) {
        let str = (field.id || field.name || '');
        if (!str) return '';

        // 1. Strip UUID Prefixes (Start of string, hex+dashes, >20 chars)
        str = str.replace(/^[a-f0-9-]{20,}/i, '');

        // 2. Normalize Separators and Strip Index
        // Replaces -0-, _1_, [2] with --
        // This collapses "work-0--company" and "work-1--company" into "work--company"
        str = str.replace(/[-_\[]\d+[-_\]]{1,2}/g, '--');

        return str.toLowerCase();
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
