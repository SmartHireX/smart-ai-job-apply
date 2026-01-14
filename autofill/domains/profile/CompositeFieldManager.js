/**
 * MultiValueHandler
 * 
 * Advanced Field Resolver & Filler.
 * Handles Multi-Selects, Jobs, Education grouping, and Fallback Logic.
 * 
 * Pipeline:
 * 1. Cache (SelectionCache)
 * 2. Profile Data (HistoryManager)
 * 3. AI (BatchProcessor - delegation)
 */
class CompositeFieldManager {

    constructor() {
        this.cache = window.InteractionLog;
        this.store = window.EntityStore;
        this.indexer = window.IndexingService;
    }

    /**
     * Group Processing: Handles atomic filling of entire sections (e.g. "Job 1")
     * Ensures consistency: All fields in a job block get data from the SAME source.
     * @param {Array} fields - Mixed array of fields
     * @returns {Object} { filled: [], pending: [] }
     */
    async processGroup(fields, context) {
        const groups = this.groupFieldsBySection(fields);
        const results = { filled: [], pending: [] };
        const resumeData = context?.resumeData || {};

        for (const [key, group] of Object.entries(groups)) {
            // key is "work_0", "education_1", or "skills_0"
            const [type, indexStr] = key.split('_');
            const index = parseInt(indexStr, 10);

            // console.log(`[CompositeManager] Processing Group: ${key} (${group.length} fields)`);

            // 1. Fetch Source Data ONCE for the group
            let profileEntity = null;
            if (type === 'work' || type === 'education') {
                profileEntity = this.store ? this.store.getByIndex(type, index) : null;
            }

            // Special Handling for Skills (User Data Fallback)
            let matchedSkills = [];
            if (type === 'skills' && window.RuleEngine && resumeData.skills) {
                // Get all option values from the group (assuming checkboxes)
                const options = group.map(f => f.value || f.label);
                matchedSkills = window.RuleEngine.matchSkills(options, resumeData.skills);
                // console.log(`[CompositeManager] Matched ${matchedSkills.length} skills from User Data.`);
            }

            for (const field of group) {
                // Attach strict index
                field.field_index = index;

                // 2. Resolve (pass matchedSkills if applicable)
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
     * Helper: Clusters fields by Type + Index
     */
    groupFieldsBySection(fields) {
        const groups = {};
        fields.forEach(field => {
            // Use prediction or heuristics to determine type
            // Note: prediction must be present.
            const type = this.determineType(field);
            // Calculate Index here if not present?
            const index = this.indexer.getIndex(field, type);

            const key = `${type}_${index}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(field);
        });
        return groups;
    }

    determineType(field) {
        // Fallback if prediction missing (should use FieldRouter logic)
        const label = (field.label || '').toLowerCase();
        if (/school|degree|major|education/i.test(label)) return 'education';
        if (/skill/i.test(label)) return 'skills';
        return 'work'; // Default
    }

    /**
     * Main Entry Point: Resolve value for a field and fill it
     * @param {Object} field - The field object
     * @param {string} type - 'work', 'education'
     * @param {Object|null} groupEntity - Pre-fetched profile entity for this group (Optimization)
     */
    async resolveAndFill(field, type, groupEntity = null, matchedSkills = []) {
        if (!field || !field.element) return { filled: false, source: 'error' };

        // 1. Calculate Index
        const index = field.index !== undefined ? field.index : this.indexer.getIndex(field, type);
        field.field_index = index;

        // console.log(`[CompositeManager] Resolving "${field.label}" (${type}) @ Index ${index}`);

        // STRATEGY CHAIN

        // A. Site Cache (Priority)
        if (this.cache) {
            // FIX: Pass FULL field object so InteractionLog can use index/label for MultiCache resolution
            // Previously only passed selector, which lost the index context
            const cached = await this.cache.getCachedValue(field);
            if (cached && cached.value) {
                if (this.fill(field.element, cached.value)) return { filled: true, source: 'cache', value: cached.value };
            }
        }

        // B. Skills Logic (User Data Fallback)
        if (type === 'skills' && matchedSkills.length > 0) {
            // Provide all matched skills to the field. 
            // The 'fill' logic will handle checking the specific one if it's a checkbox, 
            // or joining them if it's a text input.
            if (this.fill(field.element, matchedSkills)) {
                // AUTO-CACHE: Save the matched skills list
                if (this.cache) this.cache.cacheSelection(field, field.label, matchedSkills);
                return { filled: true, source: 'user_skills', value: matchedSkills };
            }
        }

        // C. User Profile (EntityStore for Jobs/Edu)
        if (this.store && (type === 'work' || type === 'education')) {
            const data = groupEntity || this.store.getByIndex(type, index);
            if (data) {
                const valueToFill = this.extractValueFromEntity(data, field);
                if (valueToFill) {
                    if (this.fill(field.element, valueToFill)) {
                        // AUTO-CACHE: Save this successful profile fill to site cache for next time
                        if (this.cache) this.cache.cacheSelection(field, field.label, valueToFill);
                        return { filled: true, source: 'profile', value: valueToFill };
                    }
                }
            }
        }

        // D. Global Memory (Last Resort)
        if (window.GlobalMemory) {
            const memRes = await window.GlobalMemory.resolveField(field);
            if (memRes && memRes.value) {
                if (this.fill(field.element, memRes.value)) return { filled: true, source: 'global_memory', value: memRes.value };
            }
        }

        return { filled: false, source: 'ai_pending' };
    }

    extractValueFromEntity(data, field) {
        if (typeof data !== 'object') return data; // Primitive skill

        const key = field.ml_prediction?.label || field.short_label;
        if (key && data[key]) return data[key];

        return null;
    }

    /**
     * Universal Fill Function
     * Handles Array vs Single, Checkbox vs Text
     */
    fill(element, value) {
        if (value === undefined || value === null) return false;

        // Normalize to Array for multi-select logic
        const values = Array.isArray(value) ? value : [value];
        const isMultiInput = element.type === 'checkbox' || (element.tagName === 'SELECT' && element.multiple);

        if (isMultiInput) {
            // Use Array Logic
            const type = (element.type || '').toLowerCase();
            if (type === 'checkbox') return this.fillCheckboxGroup(element, values);
            if (element.tagName === 'SELECT') return this.fillMultiSelect(element, values);
        } else {
            // Single Value Logic
            // If we have [A, B] but simple text input -> Join them? "A, B"
            // If we have [A] -> Just "A"
            if (values.length > 1) {
                return this.fillJoinedText(element, values);
            } else {
                return this.fillSingleValue(element, values[0]);
            }
        }
        return false;
    }

    // --- DOM Manipulators (imported from previous iteration but refined) ---

    fillSingleValue(element, value) {
        element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    fillCheckboxGroup(triggerElement, values) {
        const name = triggerElement.name;
        if (!name) return false;
        const checkboxes = document.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(name)}"]`);
        let filled = 0;
        checkboxes.forEach(box => {
            if (values.some(v => this.fuzzyMatch(box.value, v) || this.fuzzyMatch(this.getLabelFor(box), v))) {
                if (!box.checked) { box.click(); filled++; }
            }
        });
        return filled > 0;
    }

    fillMultiSelect(select, values) {
        let filled = 0;
        Array.from(select.options).forEach(opt => {
            if (values.some(v => this.fuzzyMatch(opt.value, v) || this.fuzzyMatch(opt.text, v))) {
                opt.selected = true; filled++;
            }
        });
        if (filled) select.dispatchEvent(new Event('change', { bubbles: true }));
        return filled > 0;
    }

    fillJoinedText(element, values) {
        // Smart Join Strategy
        // - Textarea: Newlines (better for ATS parsing)
        // - Input: Comma separated
        const tagName = (element.tagName || '').toLowerCase();
        const separator = tagName === 'textarea' ? '\n' : ', ';

        element.value = values.join(separator);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }

    getLabelFor(el) {
        if (el.labels?.length) return el.labels[0].innerText;
        return el.closest('label')?.innerText || '';
    }

    /**
     * Accurate Fuzzy Match
     * Uses Token Overlap for "React.js" == "React" accuracy
     */
    fuzzyMatch(a, b) {
        if (!a || !b) return false;
        const strA = String(a).toLowerCase();
        const strB = String(b).toLowerCase();

        // 1. Direct Include
        if (strA.includes(strB) || strB.includes(strA)) return true;

        // 2. Token Jaccard (for multi-word skills like "Machine Learning" vs "ML")
        const tokensA = new Set(strA.split(/[\s,._-]+/));
        const tokensB = new Set(strB.split(/[\s,._-]+/));

        let intersect = 0;
        tokensA.forEach(t => { if (tokensB.has(t)) intersect++; });

        // High threshold for safety
        return (intersect / Math.min(tokensA.size, tokensB.size)) > 0.75;
    }
}

if (typeof window !== 'undefined') window.CompositeFieldManager = new CompositeFieldManager();
if (typeof module !== 'undefined') module.exports = CompositeFieldManager;
