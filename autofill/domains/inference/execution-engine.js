/**
 * ExecutionEngine
 * "The Hands" of the operation.
 * Handles precise, stealthy DOM manipulation to ensure values stick.
 * 
 * Features:
 * - React/Angular "Native Value Setter" Hack
 * - Event Simulation Chain (Focus -> Input -> Change -> Blur)
 * - Shadow DOM traversal (if needed, though FieldRouter usually provides element)
 * - Visual Feedback (Highlighting)
 */

class ExecutionEngine {
    constructor() {
        this.nativeValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        this.nativeTextAreaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        this.nativeSelectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    }

    /**
     * Fill a field with "Stealth" sequence
     * @param {string|HTMLElement} selectorOrElement 
     * @param {string} value 
     * @param {number} confidence 
     * @param {Object} fieldMetadata - Optional field object for caching
     */
    async fill(selectorOrElement, value, confidence = 1.0, fieldMetadata = null) {
        let element = selectorOrElement;
        if (typeof selectorOrElement === 'string') {
            try {
                element = document.querySelector(selectorOrElement);
            } catch (e) {
                // If querySelector failed, it might be an unescaped ID
                if (selectorOrElement.startsWith('#')) {
                    element = document.getElementById(selectorOrElement.substring(1));
                }
            }
        }

        if (!element) return false;

        // Visual Feedback (Flash)
        this.flashField(element, confidence);

        // 1. Scroll into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // 2. Focus
        element.dispatchEvent(new Event('focus', { bubbles: true }));
        element.focus();

        // 3. Set Value (React Hack)
        await this.setValueRobust(element, value);

        // 4. Dispatch Input/Change Events
        this.dispatchEvents(element);

        // 5. Blur
        element.blur();
        element.dispatchEvent(new Event('blur', { bubbles: true }));

        // 6. Attach Manual Edit Listener (Auto-Cache User Changes)
        this.attachChangeListener(element, fieldMetadata);

        return true;
    }

    /**
     * Attach a listener to save manual user edits to cache
     */
    attachChangeListener(element, fieldMetadata) {
        if (!element || element._novaEditListenerAttached) return; // Prevent double attach

        // For radio/checkbox groups, we want to listen to ALL inputs in the group
        if (element.name && (element.type === 'radio' || element.type === 'checkbox')) {
            const group = document.querySelectorAll(`input[name="${CSS.escape(element.name)}"]`);
            group.forEach(input => {
                if (input._novaEditListenerAttached) return;
                input._novaEditListenerAttached = true;
                input.addEventListener('change', () => this._handleUserEdit(input, fieldMetadata));
            });
        } else {
            element._novaEditListenerAttached = true;
            element.addEventListener('change', () => this._handleUserEdit(element, fieldMetadata));
        }
    }

    _handleUserEdit(element, fieldMetadata) {
        if (window.InteractionLog && fieldMetadata) {
            const newValue = element.type === 'checkbox' ? element.checked : element.value;
            console.log(`[ExecutionEngine] 📝 User Edit Detected: "${fieldMetadata.label}" -> "${newValue}"`);
            window.InteractionLog.cacheSelection(fieldMetadata, fieldMetadata.label, newValue);
        }
    }

    /**
     * Robust Value Setter (Bypasses Virtual DOM locking)
     */
    async setValueRobust(element, value) {
        const tagName = element.tagName.toLowerCase();
        const type = (element.type || '').toLowerCase();

        // Checkbox/Radio Handling
        if (type === 'checkbox' || type === 'radio') {
            const isChecked = (value === true || value === 'true' || value === element.value);

            if (type === 'radio' && !isChecked && element.name) {
                // If it's a radio and this one isn't the match, find the one that IS
                const group = document.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`);
                const match = Array.from(group).find(r => r.value === String(value));
                if (match) {
                    if (!match.checked) match.click();
                    return;
                }
            }

            if (element.checked !== isChecked) {
                element.click(); // Click is best for checkboxes/radios to trigger events
            }
            return;
        }

        // Standard Value Setting
        // Usage of Native Setter allows bypassing React's "controlled component" logic
        if (tagName === 'input' && this.nativeValueSetter) {
            this.nativeValueSetter.call(element, value);
        } else if (tagName === 'textarea' && this.nativeTextAreaSetter) {
            this.nativeTextAreaSetter.call(element, value);
        } else if (tagName === 'select') {
            // Smart Select Logic
            this.setSelectValue(element, value);
        } else {
            // Fallback
            element.value = value;
        }
    }

    setSelectValue(element, targetValue) {
        // 1. Try Direct Set
        if (this.nativeSelectSetter) {
            this.nativeSelectSetter.call(element, targetValue);
        } else {
            element.value = targetValue;
        }

        // 2. Verify
        if (element.value === targetValue) return;

        // 3. Smart Fuzzy Match (Text, Value, Label, ID)
        const normalize = (str) => String(str || '').toLowerCase().trim();
        const target = normalize(targetValue);

        // Find best option
        let bestMatch = null;
        for (const option of element.options) {
            // Check all possible identifiers for this option
            const candidates = [
                option.value,
                option.text,
                option.getAttribute('label'),
                option.id
            ];

            // If ANY candidate matches the target
            if (candidates.some(c => normalize(c) === target)) {
                bestMatch = option.value;
                break;
            }
        }

        if (bestMatch !== null) {
            if (this.nativeSelectSetter) {
                this.nativeSelectSetter.call(element, bestMatch);
            } else {
                element.value = bestMatch;
            }
            // For robust frameworks (React/Angular), dispatch change
            this.dispatchEvents(element);
        }
    }


    dispatchEvents(element) {
        const bubbles = { bubbles: true, cancelable: true, view: window };
        element.dispatchEvent(new Event('input', bubbles));
        element.dispatchEvent(new Event('change', bubbles));

        // Simulating key events for completeness
        element.dispatchEvent(new KeyboardEvent('keydown', bubbles));
        element.dispatchEvent(new KeyboardEvent('keyup', bubbles));
    }

    flashField(element, confidence) {
        // "Magic Effect"
        const color = confidence > 0.9 ? 'rgba(74, 222, 128, 0.5)' : 'rgba(250, 204, 21, 0.5)'; // Green or Yellow
        const originalTransition = element.style.transition;
        const originalBg = element.style.backgroundColor;

        element.style.transition = 'background-color 0.5s ease';
        element.style.backgroundColor = color;

        setTimeout(() => {
            element.style.backgroundColor = originalBg;
            setTimeout(() => {
                element.style.transition = originalTransition;
            }, 500);
        }, 800);
    }
}

if (typeof window !== 'undefined') {
    window.ExecutionEngine = ExecutionEngine;
}
