/**
 * CompositeFieldManager
 * 
 * Enterprise-Grade Field Resolver & Filler.
 * Specialized in handling complex, multi-value field groups such as:
 * - Repeated Sections (Jobs, Education) via SectionController delegation reference
 * - Multi-Select Groups (Skills, Interests)
 * - Checkbox/Radio Groups
 * 
 * Architecture:
 * 1. Cache Priority: Checks InteractionLog for historical user choices.
 * 2. Profile Fallback: Checks EntityStore (User Profile) for structured data.
 * 3. AI Delegation: Flags unresolved fields for the AI Batch Processor.
 * 
 * @class
 */
class CompositeFieldManager {

    constructor() {
        this.cache = window.InteractionLog;
        this.store = window.EntityStore;
        this.indexer = window.IndexingService;
    }

    /**
     * Process a group of fields that belong to the same logical section.
     * Ensures transactional consistency: all fields in a group are resolved against the same entity index.
     * 
     * @param {Array<Object>} fields - Array of field objects to process.
     * @param {Object} context - Execution context containing resumeData.
     * @returns {Promise<Object>} Result object { filled: [], pending: [] }
     */
    async processGroup(fields, context) {
        const groups = this.groupFieldsBySection(fields);
        const results = { filled: [], pending: [] };
        const resumeData = context?.resumeData || {};

        for (const [key, group] of Object.entries(groups)) {
            // key format: "{type}_{index}" e.g., "work_0", "skills_0"
            const [type, indexStr] = key.split('_');
            const index = parseInt(indexStr, 10);

            // 1. Fetch Source Data ONCE for the group (Performance Optimization)
            let profileEntity = null;
            if (type === 'work' || type === 'education') {
                profileEntity = this.store ? this.store.getByIndex(type, index) : null;
            }

            // 2. Prepare User Data Fallback for Skills
            let matchedSkills = [];
            if (type === 'skills' && window.RuleEngine && resumeData.skills) {
                // Extract all potential options from the UI to match against user profile
                const options = group.map(f => f.value || f.label || '').filter(Boolean);
                matchedSkills = window.RuleEngine.matchSkills(options, resumeData.skills);
            }

            // 3. Process each field in the group
            for (const field of group) {
                field.field_index = index; // Enforce strict indexing

                const result = await this.resolveAndFill(field, type, profileEntity, matchedSkills);

                if (result.filled) {
                    results.filled.push({ ...field, source: result.source });
                } else {
                    results.pending.push(field);
                }
            }
        }
        return results;
    }

    /**
     * Resolve value for a single field using the Strategy Chain.
     * 
     * @param {Object} field - The target field.
     * @param {string} type - Section type ('work', 'education', 'skills').
     * @param {Object|null} groupEntity - Pre-fetched structured entity (optimization).
     * @param {Array<string>} matchedSkills - Pre-calculated skill matches.
     * @returns {Promise<Object>} { filled: boolean, source: string, value: any }
     */
    async resolveAndFill(field, type, groupEntity = null, matchedSkills = []) {
        if (!field || !field.element) return { filled: false, source: 'error' };

        // Ensure index is set
        const index = field.index !== undefined ? field.index : this.indexer.getIndex(field, type);
        field.field_index = index;

        // STRATEGY A: Site Cache (Interaction History)
        if (this.cache) {
            let cached = null;

            // Special Routing for ATOMIC_MULTI / Grouped Fields
            if (field.instance_type === 'ATOMIC_MULTI') {
                const lookupKey = field.cache_label || type || 'skills';


                cached = await this.cache.getCachedValue({
                    label: lookupKey,
                    name: lookupKey,
                    instance_type: 'ATOMIC_MULTI',
                    parentContext: lookupKey,
                    cache_label: lookupKey
                });

                //// console.log(`[CompositeFieldManager] 📦 Cache Result for "${lookupKey}":`, cached);
            } else {
                // Standard Field Lookup
                cached = await this.cache.getCachedValue(field);
            }

            if (cached && cached.value) {
                // DEFENSIVE: Filter out boolean "true" which comes from bugged checkbox captures
                let cleanValue = cached.value;
                if (Array.isArray(cleanValue)) {
                    cleanValue = cleanValue.filter(v => v !== true && v !== 'true');
                    if (cleanValue.length === 0) cleanValue = null;
                } else if (cleanValue === true || cleanValue === 'true') {
                    cleanValue = null;
                }

                if (cleanValue) {
                    //// console.log(`[CompositeFieldManager] ✅ Found Value:`, cleanValue);
                    if (await this.fill(field.element, cleanValue, field)) {
                        return { filled: true, source: 'cache', value: cleanValue };
                    }
                } else {
                    //// console.log(`[CompositeFieldManager] ⚠️ Cache contained only invalid values (e.g. 'true'). Ignored.`);
                }
            } else {
                //// console.log(`[CompositeFieldManager] ❌ No Cache Found/Value Empty`);
            }
        }



        // STRATEGY B: Skill Matching (User Resume Data)
        if (type === 'skills' && matchedSkills.length > 0) {
            if (await this.fill(field.element, matchedSkills, field)) {
                // Auto-Cache successful user data mapping for future speed
                if (this.cache) this.cache.cacheSelection(field, field.label, matchedSkills);
                return { filled: true, source: 'user_skills', value: matchedSkills };
            }
        }

        // STRATEGY C: Profile Entity (Work/Education)
        if (this.store && (type === 'work' || type === 'education')) {
            const data = groupEntity || this.store.getByIndex(type, index);
            if (data) {
                const valueToFill = this.extractValueFromEntity(data, field);
                if (valueToFill) {
                    if (await this.fill(field.element, valueToFill, field)) {
                        if (this.cache) this.cache.cacheSelection(field, field.label, valueToFill);
                        return { filled: true, source: 'profile', value: valueToFill };
                    }
                }
            }
        }

        return { filled: false, source: 'pending_ai' };
    }

    /**
     * Map Entity Property to Field
     * @private
     */
    extractValueFromEntity(data, field) {
        if (typeof data !== 'object' || data === null) return data;

        // Use ML Label or Fallback
        const key = field.ml_prediction?.label || field.short_label;
        if (key && data[key] !== undefined) return data[key];

        return null;
    }

    /**
     * Universal Fill Method.
     * Smartly handles various input types and value formats (Single vs Array).
     * 
     * @param {HTMLElement} element 
     * @param {any} value - String or Array of Strings
     * @returns {Promise<boolean>} Success status
     */
    async fill(element, value, field = null) {
        if (value === undefined || value === null) return false;

        // Normalize value to Array for consistent processing
        const values = Array.isArray(value) ? value : [value];
        const type = (element.type || '').toLowerCase();
        const tagName = element.tagName;

        // VISUALS: Trigger Ghost Animation (if available)
        // This ensures multi-select fields get the same premium treatment as atomic fields
        if (window.showGhostingAnimation) {
            // Pass the raw value (or joined array) to let showGhostingAnimation handle group pulsing
            const displayValue = values.join(', ');
            await window.showGhostingAnimation(element, displayValue, 0.9, field);
        }

        // 1. Checkbox Group (Robust Delegation)
        // Use Global FieldUtils to ensure "Progressive Escalation" strategy
        if (type === 'checkbox') {
            if (window.setFieldValue) {
                // Pass field metadata (which contains .options) to generic utility
                window.setFieldValue(element, values, field);
                return true;
            }
            // Fallback if FieldUtils missing (unlikely)
            return this.fillCheckboxGroup(element, values);
        }

        // 2. Multi-Select Dropdown
        if (tagName === 'SELECT' && element.multiple) {
            return this.fillMultiSelect(element, values);
        }

        // 3. Single Text Input / Textarea
        if (values.length > 0) {
            // If multiple values map to a single text input, join them.
            // e.g., "Skills" text box -> "Java, Python, React"
            return this.fillJoinedText(element, values);
        }

        return false;
    }

    // ============================================
    // 🔧 DOM MANIPULATION & MATCHING UTILITIES
    // ============================================

    fillSingleValue(element, value) {
        try {
            element.value = value;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('blur', { bubbles: true })); // Ensure validation trigger
            return true;
        } catch (e) {
            return false;
        }
    }

    fillCheckboxGroup(triggerElement, values) {
        // Legacy fallback only. In V4, we delegate to FieldUtils.
        const name = triggerElement.name;

        // Robust query: If name is missing, only target the element itself.
        const checkboxes = name
            ? document.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(name)}"]`)
            : [triggerElement];

        let filledCount = 0;

        checkboxes.forEach(box => {
            const label = this.getLabelFor(box);
            const boxVal = box.value;

            // Fuzzy Match: Check against both the underlying value and user-visible label
            const isMatch = values.some(target =>
                this.fuzzyMatch(boxVal, target) || this.fuzzyMatch(label, target)
            );

            if (isMatch) {
                if (!box.checked) {
                    box.click();
                    // Fallback force check if JS blocked click or framework state is stubborn
                    if (!box.checked) box.checked = true;
                    // Trigger change to notify React/Vue/Angular
                    box.dispatchEvent(new Event('change', { bubbles: true }));
                    box.dispatchEvent(new Event('input', { bubbles: true }));
                    filledCount++;
                }
            }
        });

        return filledCount > 0;
    }

    fillMultiSelect(select, values) {
        let filledCount = 0;
        // Keep track of first match to scroll to
        let firstMatchOption = null;

        Array.from(select.options).forEach(opt => {
            const isMatch = values.some(target =>
                this.fuzzyMatch(opt.value, target) || this.fuzzyMatch(opt.text, target)
            );

            if (isMatch && !opt.selected) {
                // 1. Property Set
                opt.selected = true;
                // 2. Attribute Set (Force DOM update)
                opt.setAttribute('selected', 'selected');

                if (!firstMatchOption) firstMatchOption = opt;
                filledCount++;
            }
        });

        if (filledCount > 0) {
            // Force redraw/focus potentially
            try {
                // select.focus();
                // select.blur();

                // 3. Scroll to first match (Forces layout calc)
                if (firstMatchOption) {
                    select.scrollTop = firstMatchOption.offsetTop;
                }
            } catch (e) {
                // ignore
            }

            select.dispatchEvent(new Event('change', { bubbles: true }));
            // Some frameworks need 'input' too
            select.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return filledCount > 0;
    }

    fillJoinedText(element, values) {
        const tagName = (element.tagName || '').toLowerCase();
        // Use newlines for Textareas, commas for standard inputs
        const separator = tagName === 'textarea' ? '\n' : ', ';

        // Deduplicate values before joining
        const uniqueValues = [...new Set(values)];

        element.value = uniqueValues.join(separator);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    getLabelFor(el) {
        // 1. Explicit <label for="id">
        if (el.labels && el.labels.length > 0) return el.labels[0].innerText;

        // 2. Parent <label> wrapper
        const parentLabel = el.closest('label');
        if (parentLabel) return parentLabel.innerText;

        // 3. Aria-Label
        const aria = el.getAttribute('aria-label');
        if (aria) return aria;

        // 4. Title attribute
        return el.title || '';
    }

    /**
     * Advanced Fuzzy Matching Algorithm.
     * Uses Tokenization + Jaccard Index + Levenshtein Distance (for short words).
     * 
     * @param {string} a - Candidate string (from DOM)
     * @param {string} b - Target string (from Cache/Profile)
     * @returns {boolean} True if match is confident
     */
    fuzzyMatch(a, b) {
        if (!a || !b) return false;
        const strA = String(a).toLowerCase().trim();
        const strB = String(b).toLowerCase().trim();

        if (strA === strB) return true;

        // 1. Direct Substring Match (High Confidence)
        // e.g. "Reaction" vs "React" -> careful here, maybe too aggressive? 
        // "Javascript" vs "script" is bad. "Javascript" vs "Java" is bad.
        // Better: Word boundary check.

        // 2. Token Jaccard (Robust for multi-word)
        const normalize = (s) => s.replace(/[^\w\s+.]/g, '').split(/[\s,._-]+/).filter(Boolean);
        const tokensA = new Set(normalize(strA));
        const tokensB = new Set(normalize(strB));

        if (tokensA.size === 0 || tokensB.size === 0) return false;

        let intersection = 0;
        tokensA.forEach(t => {
            // Check exact token match OR Levenshtein for typos
            if ([...tokensB].some(bt => bt === t || this.levenshteinDistance(t, bt) <= 1)) {
                intersection++;
            }
        });

        const union = new Set([...tokensA, ...tokensB]).size;
        const jaccard = intersection / union;

        // Threshold: 0.6 means vast majority of words match
        if (jaccard >= 0.6) return true;

        // 3. Fallback for Single Short Words (e.g. "Node" vs "Nodejs")
        if (tokensA.size === 1 && tokensB.size === 1) {
            const tA = [...tokensA][0];
            const tB = [...tokensB][0];

            // GENDER SAFETY: Avoid "man" matching "woman"
            if ((tA === 'man' && tB === 'woman') || (tA === 'woman' && tB === 'man')) {
                return false;
            }

            if (tA.includes(tB) || tB.includes(tA)) return true;
        }

        return false;
    }

    /**
     * Calculate Levenshtein Distance for typo tolerance
     */
    levenshteinDistance(a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;

        const matrix = [];

        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        Math.min(
                            matrix[i][j - 1] + 1, // insertion
                            matrix[i - 1][j] + 1  // deletion
                        )
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    }

    /**
     * Determine Field Type from Metadata
     */
    groupFieldsBySection(fields) {
        const groups = {};
        fields.forEach(field => {
            const type = this.determineType(field);
            // Default index 0 if not present, but usually IndexingService provides it.
            const index = this.indexer.getIndex(field, type);

            const key = `${type}_${index}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(field);
        });
        return groups;
    }

    determineType(field) {
        // Priority 1: Architecture V2 Route Flags (The Source of Truth)
        if (field.instance_type === 'ATOMIC_MULTI') {
            // Use Cache Label if available (e.g. "interests")
            if (field.cache_label && !field.cache_label.includes('unknown')) return field.cache_label;

            // Or infer from name/label
            const label = (field.label || field.name || '').toLowerCase();
            if (label.includes('interest')) return 'interests';

            return 'skills';
        }
        if (field.instance_type === 'SECTION_REPEATER') {
            // Distinguish Work vs Edu based on label keywords
            // This is a sub-classification within the sectional type
            const label = (field.label || '').toLowerCase();
            if (/school|degree|major|education|university|college|gpa|institution/.test(label)) return 'education';
            return 'work';
        }

        // Priority 2: ML Prediction (High Accuracy)
        if (field.ml_prediction) {
            const label = field.ml_prediction.label;

            // Check centralized FieldTypes if available
            if (window.FieldTypes && typeof window.FieldTypes.getCategoryForField === 'function') {
                const category = window.FieldTypes.getCategoryForField(label);
                if (category === 'work_experience') return 'work';
                if (category === 'education') return 'education';
                if (category === 'skills') return 'skills';
            }

            // Implicit Label Mapping
            if (['job_title', 'company_name', 'job_description', 'employer_name'].includes(label)) return 'work';
            if (['institution_name', 'degree_type', 'major', 'gpa', 'school_name'].includes(label)) return 'education';
            if (label === 'skills') return 'skills';
        }

        // Priority 3: Heuristic Keyword Analysis (Fallback)
        const label = (field.label || '').toLowerCase();
        if (/skill|technology|programming|language|framework/.test(label)) return 'skills';
        if (/school|degree|major|education|university/.test(label)) return 'education';
        if (/employer|company|job title|work experience/.test(label)) return 'work';

        // Default to 'work' if ambiguous but grouped? No, safer to return 'misc' or null.
        return 'misc';
    }
}

// Export for Global Usage
if (typeof window !== 'undefined') window.CompositeFieldManager = new CompositeFieldManager();
if (typeof module !== 'undefined') module.exports = CompositeFieldManager;
