/**
 * field-utils.js
 * Field manipulation and helper utilities
 */


/**
 * Field Utilities
 * Helper functions for field manipulation, state capture, and DOM operations
 */
class FieldUtils {
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
     * Dispatch change events to trigger framework reactivity
     * @param {HTMLElement} element - Input element
     */
    static dispatchChangeEvents(element) {
        const events = [
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
        const parsed = parseFloat(str.replace(/[^0-9.-]/g, ''));
        return isNaN(parsed) ? null : parsed;
    }
    /**
     * Enhanced Value Setter for all field types (Radio, Checkbox, Date, Select)
     * Derived from ExecutionEngine and sidebar-components logic.
     */
    static setFieldValue(element, value) {
        if (!element) return;
        const tagName = element.tagName.toLowerCase();
        const type = (element.type || '').toLowerCase();

        // 1. Radio Buttons (Complex Group Handling)
        if (type === 'radio') {
            const name = element.name;
            if (name) {
                const group = document.querySelectorAll(`input[name="${CSS.escape(name)}"]`);
                const targetValue = String(value).toLowerCase().trim();
                let bestMatch = null;

                // Priority 1: Exact Value Match
                for (const radio of group) {
                    if (radio.value.toLowerCase().trim() === targetValue) {
                        bestMatch = radio;
                        break;
                    }
                }

                // Priority 2: Label Match (Fuzzy)
                if (!bestMatch) {
                    for (const radio of group) {
                        const label = this.getFieldLabel(radio).toLowerCase();
                        if (label === targetValue || label.includes(targetValue) || targetValue.includes(label)) {
                            bestMatch = radio;
                            break;
                        }
                    }
                }

                if (bestMatch) {
                    // Always prefer clicking the label for radio buttons
                    // This handles both hidden inputs (Ashby) and standard visible ones safely
                    const label = bestMatch.labels?.[0] || document.querySelector(`label[for="${CSS.escape(bestMatch.id)}"]`);

                    if (label) {
                        label.click();
                    } else {
                        bestMatch.click();
                    }
                    this.dispatchChangeEvents(bestMatch);
                }
            }
            return;
        }

        // 2. Checkboxes
        if (type === 'checkbox') {
            const shouldBeChecked = value === true || value === 'true' || String(value).toLowerCase() === 'yes' || value === element.value;
            if (element.checked !== shouldBeChecked) {
                element.click();
                this.dispatchChangeEvents(element);
            }
            return;
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
            return;
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
            return;
        }

        // 5. Standard Text/Number Inputs
        // CRITICAL: File inputs are read-only for security. Setting value throws InvalidStateError.
        if (type === 'file') {
            // console.warn('Skipping value set for file input (security restriction).');
            return;
        }

        this.setNativeValue(element, value);
        this.dispatchChangeEvents(element);
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
window.FieldUtils = FieldUtils;
