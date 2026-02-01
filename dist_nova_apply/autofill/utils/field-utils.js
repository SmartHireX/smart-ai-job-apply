/**
 * field-utils.js
 * Field manipulation and helper utilities
 */


/**
 * Field Utilities
 * Helper functions for field manipulation, state capture, and DOM operations
 */
class FieldUtils {
    static CATEGORICAL_FIELDS = /\b(gender|sex|race|ethnicity|pronouns|veteran|disability|identity)\b/i;

    /**
     * Check if a field is categorical and needs strict matching
     * @param {string} label - Field label or name
     * @returns {boolean}
     */
    static isStrictMatchNeeded(label) {
        return label && this.CATEGORICAL_FIELDS.test(label);
    }

    /**
     * Check if a field is visible
     * @param {HTMLElement} element - Field element
     * @returns {boolean} True if visible
     */
    static isFieldVisible(element) {
        if (!element) return false;

        // Check display and visibility
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') {
            return false;
        }

        // Check opacity
        if (parseFloat(style.opacity) === 0) {
            return false;
        }

        // Check if element is in viewport (basic check)
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            return false;
        }

        return true;
    }

    /**
     * Get field label from various sources
     * @param {HTMLElement} element - Field element
     * @returns {string} Field label
     */
    static getFieldLabel(element) {
        if (!element) return '';

        // Try associated label
        if (element.labels && element.labels.length > 0) {
            return element.labels[0].innerText.trim();
        }

        // Try label[for] attribute
        if (element.id) {
            const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
            if (label) return label.innerText.trim();
        }

        // Try parent label
        const parentLabel = element.closest('label');
        if (parentLabel) {
            return parentLabel.innerText.replace(element.value || '', '').trim();
        }

        // Try sibling label (common in styled radios like Ashby)
        if (element.parentElement && element.parentElement.nextElementSibling) {
            const next = element.parentElement.nextElementSibling;
            if (next.tagName === 'LABEL') {
                return next.innerText.trim();
            }
        }

        // Try aria-label
        if (element.getAttribute('aria-label')) {
            return element.getAttribute('aria-label').trim();
        }

        // Try placeholder
        if (element.placeholder) {
            return element.placeholder.trim();
        }

        // Try name attribute
        if (element.name) {
            return element.name.replace(/_/g, ' ').trim();
        }

        // Try id attribute
        if (element.id) {
            return element.id.replace(/_/g, ' ').trim();
        }

        return '';
    }

    /**
     * Get specific label for a radio/checkbox option (robust)
     * @param {HTMLElement} input - Radio or Checkbox element
     * @returns {string|null} Option label text
     */
    static getOptionLabelText(input) {
        if (!input) return null;
        if (input.labels && input.labels.length > 0) return input.labels[0].innerText.trim();
        if (input.id) {
            const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
            if (label) return label.innerText.trim();
        }
        const parent = input.closest('label');
        if (parent) {
            const clone = parent.cloneNode(true);
            const inputInClone = clone.querySelector('input');
            if (inputInClone) inputInClone.remove();
            return clone.innerText.trim();
        }
        // Ashby Style: Input followed immediately by Label
        if (input.nextElementSibling && input.nextElementSibling.tagName === 'LABEL') {
            return input.nextElementSibling.innerText.trim();
        }
        return null;
    }

    /**
     * Capture current field state for undo functionality
     * @param {HTMLElement} element - Field element
     * @returns {Object} Field state snapshot
     */
    static captureFieldState(element) {
        const isCheckbox = element.type === 'checkbox' || element.type === 'radio';

        return {
            element: element,
            value: isCheckbox ? element.checked : element.value,
            isCheckbox: isCheckbox,
            originalStyles: {
                border: element.style.border,
                backgroundColor: element.style.backgroundColor,
                boxShadow: element.style.boxShadow
            }
        };
    }

    /**
     * Set native input value (triggers React/Vue change detection)
     * @param {HTMLElement} element - Input element
     * @param {string} value - Value to set
     */
    static setNativeValue(element, value) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
        ).set;

        const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            'value'
        ).set;

        try {
            if (element.tagName === 'TEXTAREA') {
                nativeTextAreaValueSetter.call(element, value);
            } else {
                nativeInputValueSetter.call(element, value);
            }
        } catch (error) {
            // Fallback for proxies, shadow DOM, or non-standard inputs
            // console.warn('Native setter failed, falling back to direct assignment:', error);
            element.value = value;
        }
    }

    /**
     * Set native checked state (triggers React/Vue change detection)
     * @param {HTMLElement} element - Checkbox/Radio element
     * @param {boolean} checked - Checked state to set
     */
    static setNativeChecked(element, checked) {
        const nativeCheckedSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'checked'
        ).set;

        try {
            nativeCheckedSetter.call(element, checked);
        } catch (error) {
            // console.warn('Native checked setter failed, falling back to direct assignment:', error);
            element.checked = checked;
        }
    }

    /**
     * Dispatch change events to trigger framework reactivity
     * @param {HTMLElement} element - Input element
     */
    static dispatchChangeEvents(element) {
        if (!element) return;

        // Sequence: MouseDown -> MouseUp -> Focus -> Input -> Change -> Blur
        const events = [
            new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
            new MouseEvent('mouseup', { bubbles: true, cancelable: true }),
            new Event('input', { bubbles: true, cancelable: true }),
            new Event('change', { bubbles: true, cancelable: true }),
            new Event('blur', { bubbles: true, cancelable: true })
        ];

        events.forEach(event => {
            try {
                element.dispatchEvent(event);
            } catch (error) {
                console.warn('Event dispatch failed:', error);
            }
        });
    }

    /**
     * Calculate Jaccard Similarity between two strings
     */
    static calculateJaccardSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;
        const set1 = new Set(String(str1).toLowerCase().split(/\W+/));
        const set2 = new Set(String(str2).toLowerCase().split(/\W+/));
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        if (union.size === 0) return 0;
        return intersection.size / union.size;
    }

    /**
     * Remove all highlight classes from an element
     * @param {HTMLElement} element - Field element
     */
    static removeHighlightClasses(element) {
        if (!element) return;

        element.classList.remove(
            window.NovaConstants.CSS_CLASSES.FILLED,
            window.NovaConstants.CSS_CLASSES.FILLED_HIGH,
            window.NovaConstants.CSS_CLASSES.FILLED_MEDIUM,
            window.NovaConstants.CSS_CLASSES.FILLED_LOW,
            window.NovaConstants.CSS_CLASSES.FIELD_HIGHLIGHT,
            window.NovaConstants.CSS_CLASSES.TYPING
        );
    }

    /**
     * Add highlight class based on confidence
     * @param {HTMLElement} element - Field element
     * @param {number} confidence - Confidence score (0-1)
     */
    static addHighlightClass(element, confidence) {
        if (!element) return;

        // Remove existing classes first
        this.removeHighlightClasses(element);

        // Add appropriate class
        element.classList.add(window.NovaConstants.CSS_CLASSES.FILLED);

        if (confidence >= 0.9) {
            element.classList.add(window.NovaConstants.CSS_CLASSES.FILLED_HIGH);
        } else if (confidence >= 0.7) {
            element.classList.add(window.NovaConstants.CSS_CLASSES.FILLED_MEDIUM);
        } else {
            element.classList.add(window.NovaConstants.CSS_CLASSES.FILLED_LOW);
        }
    }

    /**
     * Restore field to original state
     * @param {Object} state - Field state from captureFieldState
     */
    static restoreFieldState(state) {
        if (!state || !state.element) return;

        try {
            const element = state.element;

            // Restore value
            if (state.isCheckbox) {
                element.checked = state.value;
            } else {
                element.value = state.value;
            }

            // Restore styles
            if (state.originalStyles) {
                Object.assign(element.style, state.originalStyles);
            }

            // Remove highlight classes
            this.removeHighlightClasses(element);

            // Dispatch change events
            this.dispatchChangeEvents(element);

        } catch (error) {
            console.warn('Failed to restore field state:', error);
        }
    }

    /**
     * Scroll element into view smoothly
     * @param {HTMLElement} element - Element to scroll to
     * @param {string} behavior - Scroll behavior ('auto' or 'smooth')
     */
    static scrollIntoView(element, behavior = 'auto') {
        if (!element) return;

        try {
            element.scrollIntoView({
                behavior: behavior,
                block: 'center',
                inline: 'nearest'
            });
        } catch (error) {
            // Fallback for older browsers
            element.scrollIntoView(true);
        }
    }

    /**
     * Get field type (normalized)
     * @param {HTMLElement} element - Field element
     * @returns {string} Field type
     */
    static getFieldType(element) {
        if (!element) return 'text';

        if (element.tagName === 'SELECT') {
            return 'select';
        }

        if (element.tagName === 'TEXTAREA') {
            return 'textarea';
        }

        return (element.type || 'text').toLowerCase();
    }

    /**
     * Check if element is connected to DOM
     * @param {HTMLElement} element - Element to check
     * @returns {boolean} True if connected
     */
    static isConnected(element) {
        return element && element.isConnected;
    }

    /**
     * Find element by selector with fallback strategies
     * @param {string} selector - CSS selector
     * @param {string} id - Element ID (fallback)
     * @param {string} name - Element name (fallback)
     * @returns {HTMLElement|null} Found element or null
     */
    static findElement(selector, id = null, name = null) {
        // Try primary selector
        if (selector) {
            try {
                const element = document.querySelector(selector);
                if (element) return element;
            } catch (error) {
                console.warn('Invalid selector:', selector);
            }
        }

        // Try ID
        if (id) {
            const element = document.getElementById(id);
            if (element) return element;
        }

        // Try name
        if (name) {
            try {
                const element = document.querySelector(`[name="${CSS.escape(name)}"]`);
                if (element) return element;
            } catch (error) {
                console.warn('Name lookup failed:', name);
            }
        }

        return null;
    }
    /**
     * Parse a numeric value from a string (handles ranges like "3-5", "5+", etc.)
     * @param {string|number} value - Input value
     * @returns {number|null} Parsed number or null
     */
    static parseNumericValue(value) {
        if (value === null || value === undefined || value === '') return null;
        if (typeof value === 'number') return value;

        const str = String(value).trim();

        // 1. Check for Range "3-5"
        const rangeMatch = str.match(/^(\d+)\s*-\s*(\d+)$/);
        if (rangeMatch) {
            const min = parseInt(rangeMatch[1], 10);
            const max = parseInt(rangeMatch[2], 10);
            return Math.round((min + max) / 2); // Return Average
        }

        // 2. Check for "5+" or "10 plus" or ">5"
        const plusMatch = str.match(/^(\d+)\s*(\+|plus|more)|^[><]\s*=?\s*(\d+)$/i);
        if (plusMatch) {
            return parseInt(plusMatch[1] || plusMatch[3], 10);
        }

        // 3. Check for specific text cases
        if (/less than|under/i.test(str)) return 0;

        // 4. Try parsing standard float
        // Use a more restrictive regex for standard numbers to avoid stripping digits from phone-like strings
        const numericStr = str.replace(/[^0-9.-]/g, '');
        if (!numericStr) return null;

        const parsed = parseFloat(numericStr);
        return isNaN(parsed) ? null : parsed;
    }

    /**
     * Parse a phone number value (strips formatting but preserves full digit sequence)
     * @param {string|number} value - Input value
     * @returns {string|null} Sanitized phone string or null
     */
    static parsePhoneValue(value) {
        if (value === null || value === undefined || value === '') return null;

        const str = String(value).trim();

        // Preserve leading '+' for international numbers, then strip all non-digits
        const hasPlus = str.startsWith('+');
        const digits = str.replace(/\D/g, '');

        if (!digits) return null;

        return hasPlus ? `+${digits}` : digits;
    }
    /**
     * Enhanced Value Setter for all field types (Radio, Checkbox, Date, Select)
     * Derived from ExecutionEngine and sidebar-components logic.
     */
    static setFieldValue(element, value, fieldMetadata = null) {
        if (!element) return;
        const tagName = element.tagName.toLowerCase();
        const type = (element.type || '').toLowerCase();

        //// console.log(`[FieldUtils] setFieldValue called for ${tagName} (type: ${type}) with value: ${value}`);

        // 1. Radio Buttons (Complex Group Handling)
        if (type === 'radio') {
            let targetRadio = element;

            // 0. Metadata-based lookup (Priority)
            if (fieldMetadata && fieldMetadata.options) {
                const targetOption = fieldMetadata.options.find(opt => opt.value === value || opt.text === value);
                if (targetOption && targetOption.selector) {
                    const found = document.querySelector(targetOption.selector);
                    if (found) targetRadio = found;
                }
            }

            // Group Lookup: Scan nearby context for the correct option
            if (targetRadio === element && element.name) {
                const container = element.closest('form') || element.closest('.form-group') || element.closest('fieldset') || document;
                const group = container.querySelectorAll(`input[name="${CSS.escape(element.name)}"]`);
                let bestMatch = null;
                let maxSim = 0;

                const isStrict = this.isStrictMatchNeeded(fieldMetadata?.label || element.name || element.id);

                const calculateSim = (s1, s2) => {
                    if (!s1 || !s2) return 0;
                    const t1 = String(s1).toLowerCase().trim();
                    const t2 = String(s2).toLowerCase().trim();

                    // 1. Direct Equality (Highest Priority)
                    if (t1 === t2) return 1.0;

                    // 2. Cleaned Equality
                    const c1 = t1.replace(/[^a-z0-9]/g, '');
                    const c2 = t2.replace(/[^a-z0-9]/g, '');
                    if (c1 === c2) return 0.95;

                    // 3. Strict Boundary Match for Categories
                    if (isStrict) {
                        // For categorical data, strings must either be equal OR 
                        // one must be a distinct word within the other (not just a substring like 'man' in 'woman')
                        const words1 = new Set(t1.split(/\W+/));
                        const words2 = new Set(t2.split(/\W+/));

                        const hasWordMatch = words1.has(t2) || words2.has(t1);
                        if (hasWordMatch) return 0.85;

                        // Reject partial Inclusion (e.g., "woman".includes("man"))
                        if (t1.includes(t2) || t2.includes(t1)) {
                            // Only allow if it's a full word match (already covered above)
                            // otherwise, it's a dangerous collision for Gender
                            return 0;
                        }
                    } else {
                        // Standard Inclusion (Safe for generic fields)
                        if (c1.includes(c2) || c2.includes(c1)) return 0.8;
                    }

                    return this.calculateJaccardSimilarity(s1, s2);
                };

                group.forEach(r => {
                    const label = this.getOptionLabelText(r) || "";
                    const val = r.value || "";
                    const sim = Math.max(calculateSim(label, value), calculateSim(val, value));
                    if (sim > maxSim) {
                        maxSim = sim;
                        bestMatch = r;
                    }
                });

                if (bestMatch && maxSim > 0.4) {
                    targetRadio = bestMatch;
                    // console.log(`🎯 [FieldUtils] Radio Group Match: "${value}" -> "${this.getOptionLabelText(targetRadio)}" (sim: ${maxSim.toFixed(2)})`);
                }
            }

            // STRATEGY: Progressive Escalation on the BEST match
            const radioNode = targetRadio;

            // 1. Try Natural Click
            try {
                if (!radioNode.checked) {
                    radioNode.click();
                }
            } catch (e) { }

            // 2. Fallback: Label Click (Common for styled radios)
            if (!radioNode.checked) {
                const label = radioNode.labels?.[0] ||
                    document.querySelector(`label[for="${CSS.escape(radioNode.id || '')}"]`) ||
                    (radioNode.parentElement && radioNode.parentElement.nextElementSibling?.tagName === 'LABEL' ? radioNode.parentElement.nextElementSibling : null) ||
                    radioNode.closest('label');

                if (label) {
                    try {
                        label.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                        label.click();
                        label.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                        // Also try dispatching click if .click() is ignored
                        label.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                    } catch (e) { }
                }
            }

            // 3. Last Resort: Forced State (Bypass Virtual DOM)
            if (!radioNode.checked) {
                this.setNativeChecked(radioNode, true);
            }

            this.dispatchChangeEvents(radioNode);
            return radioNode;
        }

        // 2. Checkboxes (Group-Aware)
        if (type === 'checkbox') {
            let targetValues = value;
            if (typeof value === 'string' && value.includes(',')) {
                targetValues = value.split(',').map(v => v.trim());
            }
            const valuesArray = Array.isArray(targetValues) ? targetValues : [targetValues];
            const isSingleBoolean = valuesArray.length === 1 && (valuesArray[0] === true || valuesArray[0] === 'true' || valuesArray[0] === 'on');
            // 0. Metadata-based toggle (Highest Priority for logical groups)
            if (fieldMetadata && fieldMetadata.options) {
                fieldMetadata.options.forEach(opt => {
                    const cb = document.querySelector(opt.selector);
                    if (!cb) return;

                    const isMatch = valuesArray.some(tv => {
                        const targetStr = String(tv).toLowerCase().trim();
                        return (opt.value || '').toLowerCase().trim() === targetStr ||
                            (opt.text || '').toLowerCase().trim() === targetStr ||
                            this.calculateJaccardSimilarity(opt.text, tv) > 0.6;
                    });

                    const shouldBeChecked = isMatch || (isSingleBoolean && opt.selector.includes(element.id));

                    if (cb.checked !== shouldBeChecked) {
                        try {
                            // STRATEGY: Progressive Escalation (Parity with Radio)

                            // 1. Try Natural Click
                            cb.click();

                            // 2. Fallback: Label Click (if state didn't change)
                            if (cb.checked !== shouldBeChecked) {
                                const label = cb.labels?.[0] ||
                                    document.querySelector(`label[for="${CSS.escape(cb.id || '')}"]`) ||
                                    cb.closest('label');
                                if (label) {
                                    label.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                                    label.click();
                                    label.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                                }
                            }

                            // 3. Last Resort: Forced State
                            if (cb.checked !== shouldBeChecked) {
                                this.setNativeChecked(cb, shouldBeChecked);
                            }

                            this.dispatchChangeEvents(cb);
                        } catch (e) {
                            // Fallback for hidden elements
                            this.setNativeChecked(cb, shouldBeChecked);
                            this.dispatchChangeEvents(cb);
                        }
                    }
                });
                return element;
            }

            // 1. Name-based fallback (Legacy/Standard)
            if (element.name) {
                const group = document.querySelectorAll(`input[name="${CSS.escape(element.name)}"]`);
                group.forEach(cb => {
                    const label = this.getOptionLabelText(cb) || "";
                    const val = cb.value || "";

                    // Normalize for comparison
                    const normalize = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
                    const nLabel = normalize(label);
                    const nVal = normalize(val);

                    const isMatch = valuesArray.some(tv => {
                        const targetStr = String(tv).toLowerCase().trim();
                        // 1. Direct Match
                        if (val.toLowerCase().trim() === targetStr) return true;
                        if (label.toLowerCase().trim() === targetStr) return true;

                        // 2. Normalized Match
                        const nTarget = normalize(tv);
                        if (nVal === nTarget && nVal.length > 0) return true;
                        if (nLabel === nTarget && nLabel.length > 0) return true;

                        // 3. Fuzzy Match
                        const simLabel = this.calculateJaccardSimilarity(label, tv);
                        const simVal = this.calculateJaccardSimilarity(val, tv);
                        const maxSim = Math.max(simLabel, simVal);

                        if (this.isStrictMatchNeeded(fieldMetadata?.label || element.name || element.id)) {
                            // Strict Categorical matching: If tokens overlap but labels don't match exactly,
                            // we must be CAREFUL. "Woman" includes "Man" in Jaccard token sets if sanitized.
                            // But split(/\W+/) handles "woman" and "man" as distinct tokens.
                            // The real threat is "Man (cis)" vs "Woman (cis)".
                            if (maxSim > 0.8) return true;
                            return false;
                        }

                        return maxSim > 0.6;
                    });

                    const shouldBeChecked = isMatch || (isSingleBoolean && (val === element.value || val === 'on'));

                    if (cb.checked !== shouldBeChecked) {
                        try {
                            // STRATEGY: Progressive Escalation
                            cb.click();

                            if (cb.checked !== shouldBeChecked) {
                                const label = cb.labels?.[0] ||
                                    document.querySelector(`label[for="${CSS.escape(cb.id || '')}"]`) ||
                                    cb.closest('label');
                                if (label) {
                                    label.click();
                                }
                            }

                            if (cb.checked !== shouldBeChecked) {
                                this.setNativeChecked(cb, shouldBeChecked);
                            }

                            this.dispatchChangeEvents(cb);
                        } catch (e) {
                            this.setNativeChecked(cb, shouldBeChecked);
                            this.dispatchChangeEvents(cb);
                        }
                    }
                });
            } else {
                // Single checkbox without name
                const shouldBeChecked = valuesArray.some(tv => tv === true || tv === 'true' || tv === element.value);
                if (element.checked !== shouldBeChecked) {
                    try {
                        element.click();
                        if (element.checked !== shouldBeChecked) {
                            this.setNativeChecked(element, shouldBeChecked);
                        }
                        this.dispatchChangeEvents(element);
                    } catch (e) {
                        this.setNativeChecked(element, shouldBeChecked);
                        this.dispatchChangeEvents(element);
                    }
                }
            }
            return element;
        }

        // 3. Dates (Smart Parsing)
        if (type === 'date' || type === 'month') {
            // Simplified date logic re-used from ExecutionEngine
            let formattedValue = String(value).trim();
            // Simple ISO check or pass-through
            if (!/^\d{4}-\d{2}/.test(formattedValue)) {
                const date = new Date(formattedValue);
                if (!isNaN(date.getTime())) {
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    formattedValue = type === 'month' ? `${year}-${month}` : `${year}-${month}-${day}`;
                }
            }
            this.setNativeValue(element, formattedValue);
            this.dispatchChangeEvents(element);
            return element;
        }

        // 4. Select Dropdowns (Native Setter + Fuzzy Match)
        if (tagName === 'select') {
            // Try setting directly first
            this.setNativeValue(element, value);

            // Verify if it stuck (if value was text instead of ID)
            if (!element.value || element.value === '') {
                // Try Text Match
                const targetText = String(value).toLowerCase().trim();
                let bestOption = Array.from(element.options).find(opt =>
                    opt.text.toLowerCase().trim() === targetText
                );

                // Fuzzy Fallback
                if (!bestOption) {
                    bestOption = Array.from(element.options).find(opt =>
                        opt.text.toLowerCase().includes(targetText)
                    );
                }

                if (bestOption) {
                    this.setNativeValue(element, bestOption.value);
                }
            }
            this.dispatchChangeEvents(element);
            return element;
        }

        // 5. Standard Text/Number Inputs
        // CRITICAL: File inputs are read-only for security. Setting value throws InvalidStateError.
        if (type === 'file') {
            // console.warn('Skipping value set for file input (security restriction).');
            return;
        }

        this.setNativeValue(element, value);
        this.dispatchChangeEvents(element);
        return element;
    }
}

// Legacy compatibility - expose globally
window.isFieldVisible = FieldUtils.isFieldVisible.bind(FieldUtils);
if (!window.getFieldLabel) {
    window.getFieldLabel = FieldUtils.getFieldLabel.bind(FieldUtils);
}
window.captureFieldState = FieldUtils.captureFieldState.bind(FieldUtils);
window.setNativeValue = FieldUtils.setNativeValue.bind(FieldUtils);
window.setFieldValue = FieldUtils.setFieldValue.bind(FieldUtils); // Global Export
window.dispatchChangeEvents = FieldUtils.dispatchChangeEvents.bind(FieldUtils);

// Export class to global scope
window.getOptionLabelText = FieldUtils.getOptionLabelText.bind(FieldUtils);
window.FieldUtils = FieldUtils;
