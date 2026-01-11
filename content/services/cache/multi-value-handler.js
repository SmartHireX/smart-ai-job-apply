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

class MultiValueHandler {

    constructor() {
        this.cache = window.SelectionCache;
        this.history = window.HistoryManager;
        this.indexer = window.IndexingService;
    }

    /**
     * Group Processing: Handles atomic filling of entire sections (e.g. "Job 1")
     * Ensures consistency: All fields in a job block get data from the SAME source.
     * @param {Array} fields - Mixed array of fields
     * @returns {Object} { filled: [], pending: [] }
     */
    async processGroup(fields) {
        const groups = this.groupFieldsBySection(fields);
        const results = { filled: [], pending: [] };

        for (const [key, group] of Object.entries(groups)) {
            // key is "work_0", "education_1", or "skills_0"
            const [type, indexStr] = key.split('_');
            const index = parseInt(indexStr, 10);

            console.log(`[MultiValueHandler] Processing Group: ${key} (${group.length} fields)`);

            // 1. Fetch Source Data ONCE for the group
            let sourceData = null;
            let sourceOrigin = 'none';

            // A. Try Cache (If we have a "Job Object" cached? Unlikely. Cache is usually field-level.)
            // Actually, for consistency, if we have Profile Data, we should prefer that for WHOLE sections 
            // to avoid mixing valid profile data with potentially stale partial cache?
            // User said: "fill with first entry from cache ... if not then user data"
            // But Cache stores atomic values.
            // Let's stick to field-level resolution BUT sharing the "Profile Entity" if cache misses.

            // Actually, best strategy for "Job 1":
            // Get "Job 1" from HistoryManager.
            // For each field, if Cache exists, use Cache (User override).
            // If Cache MISSES, use the "Job 1" object we fetched.

            const profileEntity = this.history ? this.history.getByIndex(type, index) : null;

            for (const field of group) {
                // Attach strict index
                field.field_index = index;

                // 2. Field-Level Resolution with Group Context
                const result = await this.resolveAndFill(field, type, profileEntity);

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
    async resolveAndFill(field, type, groupEntity = null) {
        if (!field || !field.element) return { filled: false, source: 'error' };

        // 1. Calculate Index (Smart Indexing)
        // If index is already attached by Router, use it. Otherwise calculate.
        const index = field.index !== undefined ? field.index : this.indexer.getIndex(field, type);
        field.field_index = index; // Store for debugging/reference

        console.log(`[MultiValueHandler] Resolving "${field.label}" (${type}) @ Index ${index}`);

        // 2. Strategy 1: Check Selection Cache (User's past interactions)
        // We check the specific selector + index combination if possible.
        // Cache usually keyed by Selector.
        if (this.cache) {
            const cached = this.cache.getCachedValue(field.selector || field.xpath);
            if (cached && cached.value) {
                // If it's a multi-select array or single value
                const success = this.fill(field.element, cached.value);
                if (success) return { filled: true, source: 'cache', value: cached.value };
            }
        }

        // 3. Strategy 2: Check Profile Data (HistoryManager)
        if (this.history) {
            // Use the Group Entity provided, or fetch if missing
            let data = groupEntity || this.history.getByIndex(type, index);

            if (data) {
                // Formatting Logic:
                // If data is an Object (Job), extract the specific field (e.g. "Company Name")
                // If data is a String (Skill), use it directly.
                let valueToFill = null;

                if (typeof data === 'object') {
                    // Map field label to property (e.g. "Employer" -> data.company)
                    // This requires a Mini-Mapper or relying on Neural Label
                    const key = field.ml_prediction?.label || field.short_label;
                    // We need a robust mapping here. 
                    // Neural Label is usually 'company', 'job_title', etc. 
                    // HistoryManager Schema uses 'company', 'title'.
                    if (key && data[key]) {
                        valueToFill = data[key];
                    }
                } else {
                    // It's a primitive (e.g. "Java" from skills array)
                    valueToFill = data;
                }

                if (valueToFill) {
                    // If the field is multi-select but we got a single string, wrap it?
                    // Or if we got an Array (Skills) and field is multi-select.
                    const success = this.fill(field.element, valueToFill);
                    if (success) return { filled: true, source: 'profile', value: valueToFill };
                }
            }
        }

        // 4. Strategy 3: AI (Deferred)
        // We report failure here, so the BatchProcessor can pick it up.
        console.log(`[MultiValueHandler] No data for "${field.label}". Delegating to AI.`);
        return { filled: false, source: 'ai_pending' };
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

    fuzzyMatch(a, b) {
        return String(a).toLowerCase().includes(String(b).toLowerCase());
    }
}

if (typeof window !== 'undefined') window.MultiValueHandler = new MultiValueHandler();
if (typeof module !== 'undefined') module.exports = MultiValueHandler;
