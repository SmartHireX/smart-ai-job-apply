/**
 * Workday Adapter
 *
 * Specialized adapter for Workday ATS platform (28% market share)
 *
 * CHALLENGES:
 * - Heavy use of data-automation-id instead of semantic HTML
 * - Date pickers with ARIA spinbuttons and generic labels
 * - Custom React widgets with nested shadow DOM
 * - Radio/checkbox groups wrapped in complex fieldsets
 * - Button-based dropdowns instead of native <select>
 *
 * DOM PATTERNS:
 * - Labels: [data-automation-id="richText"] inside <legend> or <label>
 * - Inputs: [data-automation-id] with predictable naming
 * - Groups: <fieldset> with <legend> containing question
 * - Dates: role="spinbutton" with aria-label="Month/Day/Year"
 * - Dropdowns: <button aria-haspopup="listbox"> + <ul role="listbox">
 *
 * EXTRACTION STRATEGIES (9 total):
 * 0. Direct automation-id label lookup (automationId + '-label')
 * 1. richText in parent label container
 * 2. Fieldset legend with richText
 * 3. Custom dropdown button widgets
 * 4. aria-labelledby (filtered for generic dates)
 * 5. aria-describedby with richText
 * 6. Previous siblings with label/prompt patterns
 * 7. Walk up DOM tree for richText (5 levels)
 * 8. Date spinbutton group labels
 * 9. Parent container label elements
 *
 * @version 1.1.0
 */

class WorkdayAdapter {

    static VERSION = '1.1.0';
    static DEBUG = false;

    // Platform detection patterns
    static DETECTION_PATTERNS = {
        hostname: /myworkday|workday\.com|wd[0-9]/i,
        attributes: ['data-automation-id', 'data-uxi-widget-type'],
        selectors: ['[data-automation-id="richText"]', 'fieldset legend']
    };

    /**
     * Detect if current page is Workday
     * @returns {boolean} True if Workday is detected
     */
    static detect() {
        // Check hostname
        if (this.DETECTION_PATTERNS.hostname.test(window.location.hostname)) {
            this._log('Detected via hostname');
            return true;
        }

        // Check for Workday-specific attributes
        if (document.querySelector('[data-automation-id]')) {
            const hasRichText = document.querySelector('[data-automation-id="richText"]') !== null;
            const hasWidgetType = document.querySelector('[data-uxi-widget-type]') !== null;

            if (hasRichText || hasWidgetType) {
                this._log('Detected via DOM attributes');
                return true;
            }
        }

        return false;
    }

    /**
     * Extract label for Workday field
     * @param {HTMLElement} element - Form field element
     * @returns {string|null} Extracted label or null
     */
    static extractLabel(element) {
        if (!element) return null;

        // STRATEGY 0: Check for direct data-automation-id based label
        // Workday often uses formField-{fieldName} pattern
        if (element.hasAttribute('data-automation-id')) {
            const automationId = element.getAttribute('data-automation-id');
            // Try to find matching label with -label suffix
            const labelId = automationId + '-label';
            const labelEl = document.querySelector(`[data-automation-id="${labelId}"]`);
            if (labelEl) {
                const richText = labelEl.querySelector('[data-automation-id="richText"]');
                if (richText) {
                    const text = this._cleanText(richText.innerText);
                    if (this._isValidLabel(text)) {
                        this._log(`Label via automation-id-label: "${text}"`);
                        return text;
                    }
                }
                // Try label element directly
                const text = this._cleanText(labelEl.innerText);
                if (this._isValidLabel(text)) {
                    this._log(`Label via automation-id direct: "${text}"`);
                    return text;
                }
            }

            // Try formField pattern - look for parent formField container
            const formField = element.closest(`[data-automation-id*="formField"]`);
            if (formField) {
                const richText = formField.querySelector('[data-automation-id="richText"]');
                if (richText && !richText.contains(element)) {
                    const text = this._cleanText(richText.innerText);
                    if (this._isValidLabel(text)) {
                        this._log(`Label via formField richText: "${text}"`);
                        return text;
                    }
                }
            }
        }

        // STRATEGY 1: Check for richText in parent label container
        const labelContainer = element.closest('[data-automation-id*="label"]');
        if (labelContainer) {
            const richText = labelContainer.querySelector('[data-automation-id="richText"]');
            if (richText) {
                const text = this._cleanText(richText.innerText);
                if (this._isValidLabel(text)) {
                    this._log(`Label via richText (parent): "${text}"`);
                    return text;
                }
            }
        }

        // STRATEGY 2: Fieldset legend for groups (radio/checkbox/date pickers)
        const fieldset = element.closest('fieldset');
        if (fieldset) {
            const legend = fieldset.querySelector('legend');
            if (legend) {
                // Workday often nests richText inside legend
                const richText = legend.querySelector('[data-automation-id="richText"]');
                if (richText) {
                    const text = this._cleanText(richText.innerText);
                    if (this._isValidLabel(text)) {
                        this._log(`Label via richText (legend): "${text}"`);
                        return text;
                    }
                }

                // Fallback: use legend text directly
                const text = this._cleanText(legend.innerText);
                if (this._isValidLabel(text)) {
                    this._log(`Label via legend text: "${text}"`);
                    return text;
                }
            }
        }

        // STRATEGY 3: Custom dropdown button widgets
        if (element.tagName === 'BUTTON' && element.hasAttribute('data-automation-id')) {
            const automationId = element.getAttribute('data-automation-id');

            // Try to find associated label
            // Pattern: {automationId}-label or replace 'promptOption' with 'label'
            const labelPatterns = [
                automationId.replace('promptOption', 'label'),
                automationId.replace('input', 'label'),
                `${automationId}-label`
            ];

            for (const pattern of labelPatterns) {
                const label = document.querySelector(`[data-automation-id="${pattern}"]`);
                if (label) {
                    const text = this._cleanText(label.innerText);
                    if (this._isValidLabel(text)) {
                        this._log(`Label via automation-id pattern: "${text}"`);
                        return text;
                    }
                }
            }

            // Check previous sibling for label
            let prev = element.previousElementSibling;
            if (prev && prev.hasAttribute('data-automation-id') &&
                prev.getAttribute('data-automation-id').includes('label')) {
                const text = this._cleanText(prev.innerText);
                if (this._isValidLabel(text)) {
                    this._log(`Label via previous sibling: "${text}"`);
                    return text;
                }
            }
        }

        // STRATEGY 4: aria-labelledby (but filter generic date labels)
        if (element.hasAttribute('aria-labelledby')) {
            const ids = element.getAttribute('aria-labelledby').split(/\s+/);
            for (const id of ids) {
                const labelEl = document.getElementById(id);
                if (labelEl) {
                    const text = this._cleanText(labelEl.innerText);
                    // Reject generic date component labels
                    if (this._isValidLabel(text) && !this._isGenericDateLabel(text)) {
                        this._log(`Label via aria-labelledby: "${text}"`);
                        return text;
                    }
                }
            }
        }

        // STRATEGY 5: Check aria-describedby (additional context)
        if (element.hasAttribute('aria-describedby')) {
            const ids = element.getAttribute('aria-describedby').split(/\s+/);
            for (const id of ids) {
                const descEl = document.getElementById(id);
                if (descEl) {
                    const richText = descEl.querySelector('[data-automation-id="richText"]');
                    if (richText) {
                        const text = this._cleanText(richText.innerText);
                        if (this._isValidLabel(text)) {
                            this._log(`Label via aria-describedby richText: "${text}"`);
                            return text;
                        }
                    }
                    const text = this._cleanText(descEl.innerText);
                    if (this._isValidLabel(text)) {
                        this._log(`Label via aria-describedby: "${text}"`);
                        return text;
                    }
                }
            }
        }

        // STRATEGY 6: Check previous siblings for label patterns
        let sibling = element.previousElementSibling;
        let siblingCount = 0;
        while (sibling && siblingCount < 3) {
            // Look for richText in sibling
            if (sibling.hasAttribute('data-automation-id')) {
                const siblingId = sibling.getAttribute('data-automation-id');
                if (siblingId.includes('label') || siblingId.includes('prompt')) {
                    const richText = sibling.querySelector('[data-automation-id="richText"]');
                    if (richText) {
                        const text = this._cleanText(richText.innerText);
                        if (this._isValidLabel(text)) {
                            this._log(`Label via sibling richText: "${text}"`);
                            return text;
                        }
                    }
                    const text = this._cleanText(sibling.innerText);
                    if (this._isValidLabel(text) && text.length < 200) {
                        this._log(`Label via sibling: "${text}"`);
                        return text;
                    }
                }
            }
            sibling = sibling.previousElementSibling;
            siblingCount++;
        }

        // STRATEGY 7: Walk up DOM to find richText (max 5 levels)
        let current = element.parentElement;
        for (let depth = 0; depth < 5; depth++) {
            if (!current) break;

            // Find richText that is NOT inside our element
            const richTexts = current.querySelectorAll('[data-automation-id="richText"]');
            for (const richText of richTexts) {
                if (!richText.contains(element) && richText !== element) {
                    // Ensure richText is BEFORE our input in document order
                    const position = richText.compareDocumentPosition(element);
                    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
                        const text = this._cleanText(richText.innerText);
                        if (this._isValidLabel(text)) {
                            this._log(`Label via richText (ancestor L${depth}): "${text}"`);
                            return text;
                        }
                    }
                }
            }

            current = current.parentElement;
        }

        // STRATEGY 8: For date spinbuttons, try to get the overall date question
        if (element.getAttribute('role') === 'spinbutton') {
            const dateGroup = element.closest('[role="group"]');
            if (dateGroup) {
                const groupFieldset = dateGroup.closest('fieldset');
                if (groupFieldset) {
                    const legend = groupFieldset.querySelector('legend [data-automation-id="richText"]');
                    if (legend) {
                        const text = this._cleanText(legend.innerText);
                        if (this._isValidLabel(text)) {
                            // Append component label (Month/Day/Year)
                            const componentLabel = element.getAttribute('aria-label');
                            const fullLabel = componentLabel ?
                                `${text} - ${componentLabel}` : text;
                            this._log(`Label via date group: "${fullLabel}"`);
                            return fullLabel;
                        }
                    }
                }
            }
        }

        // STRATEGY 9: Check for label element with nested richText in parent container
        const parentContainer = element.closest('div[data-automation-id]');
        if (parentContainer) {
            const label = parentContainer.querySelector('label[data-automation-id]');
            if (label) {
                const richText = label.querySelector('[data-automation-id="richText"]');
                if (richText) {
                    const text = this._cleanText(richText.innerText);
                    if (this._isValidLabel(text)) {
                        this._log(`Label via parent container label: "${text}"`);
                        return text;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Extract options for Workday fields
     * @param {HTMLElement} element - Form field element
     * @returns {Array} Array of {value, text, element} objects
     */
    static extractOptions(element) {
        const options = [];

        try {
            // CASE 1: Radio/Checkbox group
            if (element.type === 'radio' || element.type === 'checkbox') {
                const group = element.closest('[role="radiogroup"], [role="group"], fieldset');
                if (group) {
                    const inputs = group.querySelectorAll(
                        `input[type="${element.type}"][name="${element.name}"]`
                    );

                    inputs.forEach(input => {
                        const label = input.closest('label');
                        if (label) {
                            // Clone and remove input to get just the text
                            const clone = label.cloneNode(true);
                            clone.querySelector('input')?.remove();
                            const text = this._cleanText(clone.innerText);

                            options.push({
                                value: input.value || text,
                                text: text,
                                element: input
                            });
                        }
                    });
                }
            }

            // CASE 2: Custom dropdown (button widget)
            else if (element.tagName === 'BUTTON' && element.hasAttribute('aria-haspopup')) {
                const listboxId = element.getAttribute('aria-controls');
                if (listboxId) {
                    const listbox = document.getElementById(listboxId);
                    if (listbox) {
                        const items = listbox.querySelectorAll('[role="option"]');
                        items.forEach(item => {
                            const value = item.getAttribute('data-value') || this._cleanText(item.innerText);
                            const text = this._cleanText(item.innerText);

                            if (value && text) {
                                options.push({
                                    value: value,
                                    text: text,
                                    element: item
                                });
                            }
                        });
                    }
                } else {
                    // Listbox might not be present yet (lazy loaded)
                    // We'll need to click to reveal options
                    this._log('Custom dropdown detected but listbox not found - may need click to reveal');
                }
            }

            // CASE 3: Native select (rare in Workday but possible)
            else if (element.tagName === 'SELECT') {
                element.querySelectorAll('option').forEach(opt => {
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
            console.warn('[WorkdayAdapter] extractOptions failed:', error);
        }

        return options;
    }

    /**
     * Fill a Workday field
     * @param {HTMLElement} element - Form field element
     * @param {string|number|boolean} value - Value to fill
     * @returns {Promise<void>}
     */
    static async fillField(element, value) {
        const tagName = element.tagName;
        const type = element.type;
        const role = element.getAttribute('role');

        try {
            // TEXT INPUT: Standard React-style filling
            if (tagName === 'INPUT' && (type === 'text' || type === 'email' || type === 'tel')) {
                this._fillTextInput(element, value);
            }

            // DATE SPINBUTTON: Special handling for Workday date widgets
            else if (role === 'spinbutton') {
                this._fillSpinbutton(element, value);
            }

            // RADIO/CHECKBOX: Click the input
            else if (type === 'radio' || type === 'checkbox') {
                await this._fillRadioCheckbox(element, value);
            }

            // CUSTOM DROPDOWN: Click button, wait, then select option
            else if (tagName === 'BUTTON' && element.hasAttribute('aria-haspopup')) {
                await this._fillCustomDropdown(element, value);
            }

            // TEXTAREA
            else if (tagName === 'TEXTAREA') {
                this._fillTextInput(element, value);
            }

            // NATIVE SELECT (fallback)
            else if (tagName === 'SELECT') {
                element.value = value;
                element.dispatchEvent(new Event('change', { bubbles: true }));
            }

            else {
                // Unknown field type, try generic fill
                this._fillTextInput(element, value);
            }
        } catch (error) {
            console.warn('[WorkdayAdapter] fillField failed:', error);
            throw error;
        }
    }

    // ========================================================================
    // PRIVATE HELPER METHODS
    // ========================================================================

    /**
     * Fill text input (React-compatible)
     * @private
     */
    static _fillTextInput(element, value) {
        // Bypass React's value tracking
        const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
        ).set;
        nativeSetter.call(element, value);

        // Trigger React/framework events
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    /**
     * Fill date spinbutton (Workday-specific)
     * @private
     */
    static _fillSpinbutton(element, value) {
        element.value = value;
        element.setAttribute('aria-valuenow', value);

        // Trigger input event with data
        element.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            data: String(value)
        }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    /**
     * Fill radio/checkbox by finding matching option
     * @private
     */
    static async _fillRadioCheckbox(element, value) {
        const group = element.closest('[role="radiogroup"], [role="group"], fieldset');
        if (!group) {
            // Just click the element if no group found
            element.click();
            return;
        }

        // Find all options in the group
        const inputs = group.querySelectorAll(
            `input[type="${element.type}"][name="${element.name}"]`
        );

        const targetValue = String(value).toLowerCase();

        // Try to match by value or label text
        for (const input of inputs) {
            const inputValue = (input.value || '').toLowerCase();
            const label = input.closest('label');
            const labelText = label ? this._cleanText(label.innerText).toLowerCase() : '';

            if (inputValue === targetValue ||
                labelText === targetValue ||
                labelText.includes(targetValue) ||
                (targetValue === 'yes' && (inputValue === 'true' || labelText === 'yes')) ||
                (targetValue === 'no' && (inputValue === 'false' || labelText === 'no'))) {

                input.click();
                this._log(`Clicked radio/checkbox: ${labelText || inputValue}`);
                return;
            }
        }

        // No match found, click first option as fallback
        if (inputs[0]) {
            inputs[0].click();
            this._log('No match found, clicked first option');
        }
    }

    /**
     * Fill custom dropdown (Workday button widget)
     * @private
     */
    static async _fillCustomDropdown(button, value) {
        // Step 1: Click button to open dropdown
        button.click();
        this._log('Clicked dropdown button');

        // Step 2: Wait for listbox to appear
        await this._sleep(500);

        // Step 3: Find listbox
        const listboxId = button.getAttribute('aria-controls');
        if (!listboxId) {
            console.warn('[WorkdayAdapter] No aria-controls found on dropdown button');
            return;
        }

        const listbox = document.getElementById(listboxId);
        if (!listbox) {
            console.warn('[WorkdayAdapter] Listbox not found:', listboxId);
            return;
        }

        // Step 4: Find matching option
        const items = listbox.querySelectorAll('[role="option"]');
        const targetValue = String(value).toLowerCase();

        for (const item of items) {
            const itemText = this._cleanText(item.innerText).toLowerCase();
            const itemValue = (item.getAttribute('data-value') || '').toLowerCase();

            if (itemText === targetValue ||
                itemValue === targetValue ||
                itemText.includes(targetValue) ||
                itemValue.includes(targetValue)) {

                item.click();
                this._log(`Selected option: ${itemText}`);
                return;
            }
        }

        // No match found, select first option
        if (items[0]) {
            items[0].click();
            this._log('No match found, selected first option');
        }
    }

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
     * Check if label is generic date component label
     * @private
     */
    static _isGenericDateLabel(text) {
        return /^(month|day|year|mm|dd|yyyy|date)$/i.test(text);
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
     * Sleep utility
     * @private
     */
    static _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Debug logging
     * @private
     */
    static _log(message) {
        if (this.DEBUG) {
            console.log(`[WorkdayAdapter] ${message}`);
        }
    }
}

// Export for browser
if (typeof window !== 'undefined') {
    window.WorkdayAdapter = WorkdayAdapter;
    console.log('[WorkdayAdapter] Loaded successfully');
}

// Export for Node.js (testing)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorkdayAdapter;
}
