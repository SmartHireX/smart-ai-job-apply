/**
 * FormExtractor
 * Pure field extraction from DOM - no analysis, no enrichment, no AI prompting
 * Single Responsibility: Extract raw field data
 */

class FormExtractor {
    constructor() {
        this.fieldCounter = 0;
    }

    /**
     * Extract all form fields from HTML
     * @param {String|Element} formHTML - HTML string or DOM element
     * @returns {Array} Array of field objects
     */
    extract(formHTML) {
        this.fieldCounter = 0;

        // Convert to DOM if string
        const container = typeof formHTML === 'string'
            ? this.htmlToDOM(formHTML)
            : formHTML;

        if (!container) {
            console.error('[FormExtractor] Invalid input');
            return [];
        }

        const fields = [];

        // Extract all input types
        fields.push(...this.extractInputs(container));
        fields.push(...this.extractSelects(container));
        fields.push(...this.extractTextareas(container));

        // console.log(`[FormExtractor] Extracted ${fields.length} fields`);

        return fields;
    }

    /**
     * Extract input fields (text, email, tel, date, radio, checkbox, etc.)
     */
    extractInputs(container) {
        const inputs = container.querySelectorAll('input');
        const fields = [];
        const processedGroups = new Set();

        inputs.forEach(input => {
            // Skip hidden, submit, button
            if (['hidden', 'submit', 'button', 'image', 'reset'].includes(input.type)) {
                return;
            }

            // Deduplicate radio/checkbox groups
            if (['radio', 'checkbox'].includes(input.type) && input.name) {
                if (processedGroups.has(input.name)) return;
                processedGroups.add(input.name);
            }

            const field = this.buildFieldObject(input, container);
            if (field) fields.push(field);
        });

        return fields;
    }

    /**
     * Extract select dropdowns
     */
    extractSelects(container) {
        const selects = container.querySelectorAll('select');
        const fields = [];

        selects.forEach(select => {
            const field = this.buildFieldObject(select, container);
            if (field) fields.push(field);
        });

        return fields;
    }

    /**
     * Extract textareas
     */
    extractTextareas(container) {
        const textareas = container.querySelectorAll('textarea');
        const fields = [];

        textareas.forEach(textarea => {
            const field = this.buildFieldObject(textarea, container);
            if (field) fields.push(field);
        });

        return fields;
    }

    /**
     * Build field object from DOM element
     */
    buildFieldObject(element, container) {
        const type = element.type || element.tagName.toLowerCase();
        const name = element.name || element.id || `field_${this.fieldCounter++}`;
        const id = element.id || '';

        // Generate selector
        let selector = '';
        if (element.id) {
            selector = `#${element.id}`;
        } else if (element.name) {
            selector = `[name="${element.name}"]`;
        } else if (element.className) {
            selector = `.${element.className.split(' ')[0]}`;
        } else {
            selector = element.tagName.toLowerCase();
        }

        // Special handling for radio/checkbox groups
        if (['radio', 'checkbox'].includes(type) && element.name) {
            selector = `input[name="${element.name}"]`;
        }

        // Extract label
        const label = this.extractLabel(element, container);

        // Base field object
        const field = {
            selector,
            name,
            id,
            type,
            label: label || name,
            placeholder: element.placeholder || '',
            value: element.value || '',
            required: element.required || element.hasAttribute('required'),
            element: element // Keep reference for later enrichment
        };

        // Add options for select/radio/checkbox
        if (type === 'select' || type === 'select-one' || type === 'select-multiple') {
            field.options = this.extractOptions(element);
        } else if (type === 'radio' || type === 'checkbox') {
            field.options = this.extractRadioCheckboxOptions(element, container);
        }

        // Add attributes
        field.attributes = this.extractAttributes(element);

        return field;
    }

    /**
     * Extract label for field
     */
    extractLabel(element, container = document) {
        // Method 0: Centralized FANG Logic (Priority Override)
        if (typeof window.getFieldLabel === 'function') {
            //console.log(`[FormExtractor] Calling window.getFieldLabel for element:`, element);
            const visualLabel = window.getFieldLabel(element);
            if (visualLabel && visualLabel !== 'Unknown Field') {
                return visualLabel;
            }
        } else {
            console.warn(`[FormExtractor] window.getFieldLabel is NOT a function! (Type: ${typeof window.getFieldLabel})`);
        }

        // Method 1: Group Context (Specifically for Radios/Checkboxes) - HIGH PRIORITY
        // We want "Are you over 18?" instead of "Yes"
        if (['radio', 'checkbox'].includes(element.type) && element.name) {
            // Find a descriptive question nearby (e.g. in a div.form-group or similar)
            const wrapper = element.closest('.form-group, fieldset, tr, .radio-group, .checkbox-group, div[role="group"]');
            if (wrapper) {
                // Look for labels, legends, or descriptive text that isn't the option text
                // We look for labels without 'for' or legends first
                const groupLabel = wrapper.querySelector('legend, label:not([for]), .form-label, h3, h4, p');
                if (groupLabel && groupLabel.textContent.trim().length > 3) {
                    const text = groupLabel.textContent.trim();
                    // If the found text is just the option text (e.g. "Yes"), keep searching
                    if (text.toLowerCase() !== (element.value || '').toLowerCase()) {
                        return text;
                    }
                }

                // Fallback: If no label inside wrapper, look at previous sibling of wrapper
                const prev = wrapper.previousElementSibling;
                if (prev && (prev.tagName === 'LABEL' || prev.tagName.match(/^H[1-6]$/))) {
                    return prev.textContent.trim();
                }
            }
        }

        // Method 2: <label for="id">
        if (element.id) {
            const label = container.querySelector(`label[for="${element.id}"]`);
            if (label) return label.textContent.trim();
        }

        // Method 3: Wrapped in <label>
        const parentLabel = element.closest('label');
        if (parentLabel) {
            return parentLabel.textContent.replace(element.value || '', '').trim();
        }

        // Method 4: aria-label
        if (element.getAttribute('aria-label')) {
            return element.getAttribute('aria-label');
        }

        // Method 5: Previous sibling
        let prev = element.previousElementSibling;
        while (prev && prev.tagName !== 'LABEL') {
            if (prev.textContent && prev.textContent.trim().length < 100) {
                return prev.textContent.trim();
            }
            prev = prev.previousElementSibling;
        }
        if (prev && prev.tagName === 'LABEL') {
            return prev.textContent.trim();
        }

        // Method 6: Table header (for table-based forms)
        const td = element.closest('td');
        if (td) {
            const tr = td.closest('tr');
            const table = tr?.closest('table');
            if (table) {
                const cellIndex = Array.from(tr.cells).indexOf(td);
                const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
                if (headerRow && headerRow.cells[cellIndex]) {
                    return headerRow.cells[cellIndex].textContent.trim();
                }
            }
        }

        return '';
    }

    /**
     * Extract options from select element
     */
    extractOptions(selectElement) {
        const options = [];
        selectElement.querySelectorAll('option').forEach(opt => {
            if (opt.value === '' && opt.textContent.match(/select|choose|pick/i)) {
                return; // Skip placeholder options
            }
            options.push({
                value: opt.value,
                text: opt.textContent.trim()
            });
        });
        return options;
    }

    /**
     * Extract options for radio/checkbox groups
     */
    extractRadioCheckboxOptions(element, container = document) {
        const name = element.name;
        if (!name) return [];

        const group = container.querySelectorAll(`input[name="${name}"]`);
        const options = [];

        group.forEach(input => {
            const label = this.extractLabel(input, container);
            options.push({
                value: input.value,
                text: label || input.value
            });
        });

        return options;
    }

    /**
     * Extract relevant attributes
     */
    extractAttributes(element) {
        const attrs = {};
        const relevantAttrs = ['autocomplete', 'pattern', 'min', 'max', 'step', 'maxlength', 'minlength'];

        relevantAttrs.forEach(attr => {
            if (element.hasAttribute(attr)) {
                attrs[attr] = element.getAttribute(attr);
            }
        });

        return attrs;
    }

    /**
     * Convert HTML string to DOM
     */
    htmlToDOM(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div;
    }
}

// Export
if (typeof window !== 'undefined') {
    window.FormExtractor = FormExtractor;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FormExtractor;
}
