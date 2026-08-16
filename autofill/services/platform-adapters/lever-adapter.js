/**
 * Lever Adapter
 *
 * Specialized adapter for Lever ATS platform (15% market share)
 *
 * CHARACTERISTICS:
 * - React-based with good semantic structure
 * - Card-based question layout (.application-question)
 * - Labels separated from inputs by container divs
 * - Required markers need filtering
 * - Section headers with h4[data-qa="card-name"]
 * - Some dynamic form elements
 *
 * DOM PATTERNS:
 * - Questions: <li class="application-question">
 * - Labels: .application-label > .text
 * - Inputs: .application-field > input/select/textarea
 * - Sections: .posting-card > h4[data-qa="card-name"]
 * - Required markers: <span class="required">*</span>
 *
 * @version 1.0.0
 */

class LeverAdapter {

    static VERSION = '1.0.0';
    static DEBUG = false;

    // Platform detection patterns
    static DETECTION_PATTERNS = {
        hostname: /lever\.co|jobs\.lever|lever-app/i,
        selectors: [
            '.application-question',
            '.posting-card',
            '.application-label',
            'input[name^="cards"]'
        ]
    };

    /**
     * Detect if current page is Lever
     * @returns {boolean} True if Lever is detected
     */
    static detect() {
        // Check hostname
        if (this.DETECTION_PATTERNS.hostname.test(window.location.hostname)) {
            this._log('Detected via hostname');
            return true;
        }

        // Check for Lever-specific DOM patterns
        for (const selector of this.DETECTION_PATTERNS.selectors) {
            if (document.querySelector(selector)) {
                this._log(`Detected via selector: ${selector}`);
                return true;
            }
        }

        return false;
    }

    /**
     * Extract label for Lever field
     * @param {HTMLElement} element - Form field element
     * @returns {string|null} Extracted label or null
     */
    static extractLabel(element) {
        if (!element) return null;

        // STRATEGY 1: Find parent .application-question container
        const questionCard = element.closest('li.application-question, .application-question');
        if (questionCard) {
            const labelDiv = questionCard.querySelector('.application-label .text, .application-label');
            if (labelDiv) {
                // Clone and remove required markers
                const clone = labelDiv.cloneNode(true);
                clone.querySelectorAll('.required, span.required, .asterisk').forEach(span => span.remove());

                const text = this._cleanText(clone.textContent);
                if (this._isValidLabel(text)) {
                    this._log(`Label via .application-question: "${text}"`);
                    return text;
                }
            }
        }

        // STRATEGY 2: For radio/checkbox, check if label wraps the input
        // This is the option label ("Yes"/"No"), not the question
        // We should have already caught the question in STRATEGY 1
        if (element.type === 'radio' || element.type === 'checkbox') {
            const wrapperLabel = element.closest('label');
            if (wrapperLabel && questionCard) {
                // We already extracted the question above, so skip this
                // This prevents returning "Yes" instead of "Are you authorized to work?"
                return null;
            }
        }

        // STRATEGY 3: Check section header for context (use sparingly)
        const cardSection = element.closest('.posting-card, [class*="card"]');
        if (cardSection) {
            const cardName = cardSection.querySelector('h4[data-qa="card-name"], h4.card-name, h4');
            if (cardName) {
                const sectionText = this._cleanText(cardName.textContent);

                // Only use section header if:
                // 1. It's specific enough (not just "Personal Information")
                // 2. No better label was found
                // 3. It's not a generic section title
                if (this._isSpecificSectionTitle(sectionText)) {
                    // Try to find more specific label first
                    const fieldContainer = element.closest('.application-field');
                    if (fieldContainer) {
                        const prevLabel = fieldContainer.previousElementSibling;
                        if (prevLabel && prevLabel.classList.contains('application-label')) {
                            const text = this._cleanText(prevLabel.textContent);
                            if (this._isValidLabel(text)) {
                                this._log(`Label via adjacent container: "${text}"`);
                                return text;
                            }
                        }
                    }

                    // Use section title as fallback
                    this._log(`Label via section header: "${sectionText}"`);
                    return sectionText;
                }
            }
        }

        // STRATEGY 4: Standard label[for] (Lever sometimes uses this)
        if (element.id) {
            const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
            if (label) {
                const text = this._cleanText(label.textContent);
                if (this._isValidLabel(text)) {
                    this._log(`Label via label[for]: "${text}"`);
                    return text;
                }
            }
        }

        // STRATEGY 5: element.labels API
        if (element.labels && element.labels.length > 0) {
            const text = this._cleanText(element.labels[0].textContent);
            if (this._isValidLabel(text)) {
                this._log(`Label via element.labels: "${text}"`);
                return text;
            }
        }

        // STRATEGY 6: placeholder as last resort (Lever uses good placeholders)
        if (element.placeholder) {
            const text = this._cleanText(element.placeholder);
            if (this._isValidLabel(text) && text.length > 5) {
                this._log(`Label via placeholder: "${text}"`);
                return text;
            }
        }

        return null;
    }

    /**
     * Extract options for Lever fields
     * @param {HTMLElement} element - Form field element
     * @returns {Array} Array of {value, text, element} objects
     */
    static extractOptions(element) {
        const options = [];

        try {
            // CASE 1: Radio/Checkbox in application-field
            if (element.type === 'radio' || element.type === 'checkbox') {
                const fieldContainer = element.closest('.application-field, .application-question');
                if (fieldContainer) {
                    const inputs = fieldContainer.querySelectorAll(
                        `input[type="${element.type}"][name="${CSS.escape(element.name)}"]`
                    );

                    inputs.forEach(input => {
                        const label = input.closest('label');
                        if (label) {
                            // Get the span text (Lever wraps option text in <span>)
                            const span = label.querySelector('span');
                            const text = this._cleanText(span ? span.innerText : label.innerText);

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
                    // Skip empty "Select one..." options
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
            console.warn('[LeverAdapter] extractOptions failed:', error);
        }

        return options;
    }

    /**
     * Fill a Lever field
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
                // Lever uses React, need to bypass React's value setter
                const prototype = tagName === 'TEXTAREA'
                    ? window.HTMLTextAreaElement.prototype
                    : window.HTMLInputElement.prototype;

                const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
                nativeSetter.call(element, value);

                // Trigger React events
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.dispatchEvent(new Event('blur', { bubbles: true }));

                this._log('Filled text input');
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

                        this._log(`Selected option: ${option.textContent}`);
                        return;
                    }
                }

                console.warn('[LeverAdapter] No matching option found for value:', value);
            }

            // RADIO or CHECKBOX
            else if (type === 'radio' || type === 'checkbox') {
                element.checked = true;
                element.click(); // Lever needs actual click for some forms
                element.dispatchEvent(new Event('change', { bubbles: true }));

                this._log('Checked radio/checkbox');
            }

            // FILE upload
            else if (type === 'file') {
                console.warn('[LeverAdapter] File input cannot be filled programmatically');
            }

            // Unknown type
            else {
                console.warn('[LeverAdapter] Unknown field type:', tagName, type);
            }
        } catch (error) {
            console.warn('[LeverAdapter] fillField failed:', error);
            throw error;
        }
    }

    /**
     * Detect repeating sections (Work Experience, Education)
     * @returns {Array} Array of section objects
     */
    static detectRepeatingSections() {
        const sections = [];

        try {
            // Lever uses .posting-card for major sections
            const cards = document.querySelectorAll('.posting-card');

            cards.forEach(card => {
                const cardName = card.querySelector('h4[data-qa="card-name"], h4.card-name, h4');
                if (cardName) {
                    const sectionTitle = this._cleanText(cardName.textContent);
                    const questions = card.querySelectorAll('.application-question');

                    sections.push({
                        title: sectionTitle,
                        element: card,
                        fieldCount: questions.length,
                        isRepeating: this._isRepeatingSection(sectionTitle)
                    });
                }
            });
        } catch (error) {
            console.warn('[LeverAdapter] detectRepeatingSections failed:', error);
        }

        return sections;
    }

    /**
     * Get all questions in a section
     * @param {HTMLElement} sectionElement - Section container element
     * @returns {Array<HTMLElement>} Array of question elements
     */
    static getQuestionsInSection(sectionElement) {
        if (!sectionElement) return [];
        return Array.from(sectionElement.querySelectorAll('.application-question'));
    }

    // ========================================================================
    // PRIVATE HELPER METHODS
    // ========================================================================

    /**
     * Check if section title is specific enough to use as label
     * @private
     */
    static _isSpecificSectionTitle(text) {
        if (!text) return false;

        // Generic section titles we should NOT use as labels
        const genericTitles = [
            'personal information',
            'contact information',
            'basic information',
            'additional information',
            'application',
            'resume',
            'details',
            'information',
            'questions'
        ];

        const lowerText = text.toLowerCase();

        // Too generic
        if (genericTitles.includes(lowerText)) {
            return false;
        }

        // Too short or too long
        if (text.length < 3 || text.length > 100) {
            return false;
        }

        return true;
    }

    /**
     * Check if section is a repeating section (multiple instances)
     * @private
     */
    static _isRepeatingSection(title) {
        const repeatingPatterns = [
            /work\s+(experience|history)/i,
            /employment\s+(experience|history)/i,
            /education/i,
            /job\s+history/i,
            /previous\s+(jobs|roles|positions)/i,
            /school/i,
            /university/i,
            /degree/i
        ];

        return repeatingPatterns.some(pattern => pattern.test(title));
    }

    /**
     * Validate if text is a good label
     * @private
     */
    static _isValidLabel(text) {
        if (!text || text.length < 2 || text.length > 500) return false;
        if (/^[0-9]+$/.test(text)) return false;
        if (/^(select|choose|option|required|optional|placeholder|yes|no)$/i.test(text)) return false;
        return true;
    }

    /**
     * Clean text (remove extra whitespace, asterisks, required markers)
     * @private
     */
    static _cleanText(text) {
        if (!text) return '';
        return text
            .replace(/\s+/g, ' ')
            .replace(/\*/g, '')
            .replace(/\(required\)/gi, '')
            .replace(/\(optional\)/gi, '')
            .trim();
    }

    /**
     * Debug logging
     * @private
     */
    static _log(message) {
        if (this.DEBUG) {
            console.log(`[LeverAdapter] ${message}`);
        }
    }
}

// Export for browser
if (typeof window !== 'undefined') {
    window.LeverAdapter = LeverAdapter;
    console.log('[LeverAdapter] Loaded successfully');
}

// Export for Node.js (testing)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LeverAdapter;
}
