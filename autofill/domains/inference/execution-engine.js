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
     */
    async fill(selectorOrElement, value, confidence = 1.0) {
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

        return true;
    }

    /**
     * Robust Value Setter (Bypasses Virtual DOM locking)
     */
    async setValueRobust(element, value) {
        const tagName = element.tagName.toLowerCase();
        const type = (element.type || '').toLowerCase();

        // Checkbox/Radio Handling
        if (type === 'checkbox' || type === 'radio') {
            if (element.checked !== (value === true || value === 'true' || value === element.value)) {
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
        } else if (tagName === 'select' && this.nativeSelectSetter) {
            this.nativeSelectSetter.call(element, value);
        } else {
            // Fallback
            element.value = value;
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
