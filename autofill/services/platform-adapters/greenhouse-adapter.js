/**
 * Greenhouse Adapter
 *
 * Specialized adapter for Greenhouse ATS platform (18% market share)
 *
 * ADVANTAGES:
 * - Best-structured ATS platform
 * - Uses semantic HTML with proper label[for] associations
 * - Consistent naming conventions
 * - Standard form field classes (.field, .field--text, etc.)
 * - jQuery-based but works with standard DOM events
 *
 * DOM PATTERNS:
 * - Containers: .field.field--{type}
 * - Labels: <label for="field_id">
 * - Inputs: Standard semantic HTML with predictable IDs
 * - Radio groups: .radio-options with wrapped labels
 * - Custom fields: [data-field-type="custom"]
 *
 * @version 1.0.0
 */

class GreenhouseAdapter {

    static VERSION = '1.0.0';
    static DEBUG = false;

    // Platform detection patterns
    static DETECTION_PATTERNS = {
        hostname: /greenhouse|boards\.|grnh\.se/i,
        selectors: [
            '.field[class*="field--"]',
            'input[name^="job_application"]',
            '#application_form',
            '.application-form'
        ]
    };

    /**
     * Detect if current page is Greenhouse
     * @returns {boolean} True if Greenhouse is detected
     */
    static detect() {
        // Check hostname
        if (this.DETECTION_PATTERNS.hostname.test(window.location.hostname)) {
            this._log('Detected via hostname');
            return true;
        }

        // Check for Greenhouse-specific DOM patterns
        for (const selector of this.DETECTION_PATTERNS.selectors) {
            if (document.querySelector(selector)) {
                this._log(`Detected via selector: ${selector}`);
                return true;
            }
        }

        return false;
    }

    /**
     * Extract label for Greenhouse field
     * @param {HTMLElement} element - Form field element
     * @returns {string|null} Extracted label or null
     */
    static extractLabel(element) {
        if (!element) return null;

        // STRATEGY 1: Native label[for="id"] (Greenhouse's standard approach)
        if (element.id) {
            const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
            if (label) {
                const text = this._cleanText(label.textContent);
                if (this._isValidLabel(text)) {
                    this._log(`Label via for="${element.id}": "${text}"`);
                    return text;
                }
            }
        }

        // STRATEGY 2: element.labels API (works with wrapped labels)
        if (element.labels && element.labels.length > 0) {
            const text = this._cleanText(element.labels[0].textContent);
            if (this._isValidLabel(text)) {
                this._log(`Label via element.labels: "${text}"`);
                return text;
            }
        }

        // STRATEGY 3: Parent .field container label
        const fieldContainer = element.closest('.field, [class*="field--"]');
        if (fieldContainer) {
            const label = fieldContainer.querySelector('label');
            if (label && !label.contains(element)) {
                const text = this._cleanText(label.textContent);
                if (this._isValidLabel(text)) {
                    this._log(`Label via .field container: "${text}"`);
                    return text;
                }
            }
        }

        // STRATEGY 4: Radio/checkbox group label
        if (element.type === 'radio' || element.type === 'checkbox') {
            // First, check if the input is wrapped in a label (option label)
            const optionLabel = element.closest('label');

            // Look for the group question label (should be first child of parent container)
            const radioGroup = element.closest('.radio-options, .checkbox-options, .field--radio, .field--checkbox, .field');
            if (radioGroup) {
                // Find the first label that doesn't contain an input (this is the question)
                const labels = radioGroup.querySelectorAll('label');
                for (const label of labels) {
                    if (!label.querySelector('input')) {
                        const text = this._cleanText(label.textContent);
                        if (this._isValidLabel(text)) {
                            this._log(`Label via radio group: "${text}"`);
                            return text;
                        }
                    }
                }

                // Alternative: look for direct text before radio-options
                const questionLabel = radioGroup.querySelector('label:first-child');
                if (questionLabel && !questionLabel.querySelector('input')) {
                    const text = this._cleanText(questionLabel.textContent);
                    if (this._isValidLabel(text)) {
                        this._log(`Label via group question: "${text}"`);
                        return text;
                    }
                }
            }
        }

        // STRATEGY 5: aria-label or aria-labelledby
        if (element.hasAttribute('aria-labelledby')) {
            const id = element.getAttribute('aria-labelledby');
            const labelEl = document.getElementById(id);
            if (labelEl) {
                const text = this._cleanText(labelEl.textContent);
                if (this._isValidLabel(text)) {
                    this._log(`Label via aria-labelledby: "${text}"`);
                    return text;
                }
            }
        }

        if (element.hasAttribute('aria-label')) {
            const text = this._cleanText(element.getAttribute('aria-label'));
            if (this._isValidLabel(text)) {
                this._log(`Label via aria-label: "${text}"`);
                return text;
            }
        }

        return null;
    }

    /**
     * Extract options for Greenhouse fields
     * @param {HTMLElement} element - Form field element
     * @returns {Array} Array of {value, text, element} objects
     */
    static extractOptions(element) {
        const options = [];

        try {
            // CASE 1: Radio/Checkbox in options container
            if (element.type === 'radio' || element.type === 'checkbox') {
                const container = element.closest('.radio-options, .checkbox-options, .field');
                if (container) {
                    const inputs = container.querySelectorAll(
                        `input[type="${element.type}"][name="${CSS.escape(element.name)}"]`
                    );

                    inputs.forEach(input => {
                        const label = input.closest('label');
                        if (label) {
                            // Clone and remove input to get just the text
                            const clone = label.cloneNode(true);
                            clone.querySelector('input')?.remove();
                            const text = this._cleanText(clone.textContent);

                            options.push({
                                value: input.value || text,
                                text: text,
                                element: input
                            });
                        }
                    });
                }
            }

            // CASE 2: Native select dropdown
            else if (element.tagName === 'SELECT') {
                element.querySelectorAll('option').forEach(opt => {
                    // Skip empty "Select..." options
                    if (opt.value && opt.value.trim() !== '') {
                        options.push({
                            value: opt.value,
                            text: this._cleanText(opt.textContent),
                            element: opt
                        });
                    }
                });
            }
        } catch (error) {
            console.warn('[GreenhouseAdapter] extractOptions failed:', error);
        }

        return options;
    }

    /**
     * Fill a Greenhouse field
     * @param {HTMLElement} element - Form field element
     * @param {string|number|boolean} value - Value to fill
     * @returns {Promise<void>}
     */
    static async fillField(element, value) {
        const tagName = element.tagName;
        const type = element.type;

        try {
            // TEXT INPUT or TEXTAREA
            if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
                element.value = value;

                // Trigger standard DOM events
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.dispatchEvent(new Event('blur', { bubbles: true }));

                // Also trigger jQuery events if jQuery is available (Greenhouse uses jQuery)
                if (typeof jQuery !== 'undefined') {
                    jQuery(element).trigger('input').trigger('change').trigger('blur');
                    this._log('Triggered jQuery events');
                }
            }

            // SELECT dropdown
            else if (tagName === 'SELECT') {
                const targetValue = String(value).toLowerCase();

                // Try to find matching option
                for (const option of element.options) {
                    const optionText = this._cleanText(option.textContent).toLowerCase();
                    const optionValue = (option.value || '').toLowerCase();

                    if (optionText === targetValue ||
                        optionValue === targetValue ||
                        optionText.includes(targetValue) ||
                        optionValue.includes(targetValue)) {

                        element.value = option.value;
                        element.dispatchEvent(new Event('change', { bubbles: true }));

                        if (typeof jQuery !== 'undefined') {
                            jQuery(element).trigger('change');
                        }

                        this._log(`Selected option: ${option.textContent}`);
                        return;
                    }
                }

                // No match found, log warning
                console.warn('[GreenhouseAdapter] No matching option found for value:', value);
            }

            // RADIO or CHECKBOX
            else if (type === 'radio' || type === 'checkbox') {
                element.checked = true;
                element.dispatchEvent(new Event('change', { bubbles: true }));

                if (typeof jQuery !== 'undefined') {
                    jQuery(element).trigger('change');
                }

                this._log('Checked radio/checkbox');
            }

            // FILE upload
            else if (type === 'file') {
                // File inputs can't be programmatically set for security reasons
                console.warn('[GreenhouseAdapter] File input cannot be filled programmatically');
            }

            // Unknown type
            else {
                console.warn('[GreenhouseAdapter] Unknown field type:', tagName, type);
            }
        } catch (error) {
            console.warn('[GreenhouseAdapter] fillField failed:', error);
            throw error;
        }
    }

    /**
     * Check if field is a custom Greenhouse question
     * @param {HTMLElement} element - Form field element
     * @returns {boolean} True if custom field
     */
    static isCustomField(element) {
        if (!element) return false;

        // Custom fields have names like: job_application[custom_fields][123]
        const name = element.name || '';
        if (/custom_field|custom_question/i.test(name)) {
            return true;
        }

        // Check for data-field-type attribute
        const container = element.closest('.field');
        if (container && container.hasAttribute('data-field-type')) {
            return container.getAttribute('data-field-type') === 'custom';
        }

        return false;
    }

    /**
     * Get application stage (for multi-step forms)
     * @returns {string} Current stage name or 'single_page'
     */
    static getApplicationStage() {
        // Check for progress indicator
        const stageIndicator = document.querySelector('.application-stage, .progress-bar, .wizard-steps');
        if (stageIndicator) {
            const currentStep = stageIndicator.querySelector('.active, .current, .selected');
            if (currentStep) {
                return this._cleanText(currentStep.textContent);
            }
        }

        // Check for step numbers in page
        const stepHeader = document.querySelector('h2.step-title, .step-header');
        if (stepHeader) {
            return this._cleanText(stepHeader.textContent);
        }

        return 'single_page';
    }

    /**
     * Get all required fields
     * @returns {Array<HTMLElement>} Array of required field elements
     */
    static getRequiredFields() {
        const requiredFields = [];

        // Greenhouse marks required fields with asterisks in labels or required attribute
        const fields = document.querySelectorAll('input, select, textarea');

        fields.forEach(field => {
            // Check required attribute
            if (field.hasAttribute('required') || field.required) {
                requiredFields.push(field);
                return;
            }

            // Check for asterisk in associated label
            const label = field.labels?.[0] || document.querySelector(`label[for="${field.id}"]`);
            if (label && label.textContent.includes('*')) {
                requiredFields.push(field);
            }
        });

        return requiredFields;
    }

    // ========================================================================
    // PRIVATE HELPER METHODS
    // ========================================================================

    /**
     * Validate if text is a good label
     * @private
     */
    static _isValidLabel(text) {
        if (!text || text.length < 2 || text.length > 500) return false;
        if (/^[0-9]+$/.test(text)) return false;
        if (/^(select|choose|option|required|optional|placeholder)$/i.test(text)) return false;
        return true;
    }

    /**
     * Clean text (remove extra whitespace, asterisks)
     * @private
     */
    static _cleanText(text) {
        if (!text) return '';
        return text.replace(/\s+/g, ' ').replace(/\*/g, '').trim();
    }

    /**
     * Debug logging
     * @private
     */
    static _log(message) {
        if (this.DEBUG) {
            console.log(`[GreenhouseAdapter] ${message}`);
        }
    }
}

// Export for browser
if (typeof window !== 'undefined') {
    window.GreenhouseAdapter = GreenhouseAdapter;
    console.log('[GreenhouseAdapter] Loaded successfully');
}

// Export for Node.js (testing)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GreenhouseAdapter;
}
