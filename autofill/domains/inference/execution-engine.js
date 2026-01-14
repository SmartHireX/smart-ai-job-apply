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

        // Attach ML prediction to DOM element for sidebar cache access
        if (fieldMetadata && fieldMetadata.ml_prediction) {
            element.__ml_prediction = fieldMetadata.ml_prediction;
        }

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
        if (!fieldMetadata) return;

        const newValue = element.type === 'checkbox' ? element.checked : element.value;
        const fieldType = (fieldMetadata.type || element.type || '').toLowerCase();
        const isStructuredInput = ['radio', 'checkbox', 'select', 'select-one', 'select-multiple'].includes(fieldType);

        // Check if this is a multiCache-eligible field (job/education/skills)
        const fieldContext = [fieldMetadata.label, fieldMetadata.name, fieldMetadata.parentContext].filter(Boolean).join(' ').toLowerCase();
        const isMultiCacheEligible = /job|work|employ|education|school|degree|skill/.test(fieldContext);

        // console.log(`[ExecutionEngine] 📝 User Edit Detected: "${fieldMetadata.label}" -> "${newValue}" (Type: ${fieldType}, MultiCache: ${isMultiCacheEligible})`);

        if (isStructuredInput && window.InteractionLog) {
            // Structured inputs go to SelectionCache
            window.InteractionLog.cacheSelection(fieldMetadata, fieldMetadata.label, newValue);
        } else if (isMultiCacheEligible && window.InteractionLog) {
            // MultiCache-eligible text fields go to InteractionLog (which routes to multiCache)
            window.InteractionLog.cacheSelection(fieldMetadata, fieldMetadata.label, newValue);
        } else if (!isStructuredInput && !isMultiCacheEligible && window.GlobalMemory) {
            // Generic text fields go to SmartMemory
            const key = window.GlobalMemory.normalizeKey ? window.GlobalMemory.normalizeKey(fieldMetadata.label) : fieldMetadata.label;
            window.GlobalMemory.updateCache({
                [key]: { answer: newValue, timestamp: Date.now() }
            });
        }
    }

    /**
     * Robust Value Setter (Bypasses Virtual DOM locking)
     */
    async setValueRobust(element, value) {
        const tagName = element.tagName.toLowerCase();
        const type = (element.type || '').toLowerCase();

        // Special Radio Button Handling
        // For radio groups, we need to find the specific radio button matching the value
        if (type === 'radio') {
            const name = element.name;
            if (name) {
                // Find all radio buttons in the group
                const group = document.querySelectorAll(`input[name="${CSS.escape(name)}"]`);
                let targetRadio = null;

                // Find the radio button with the matching value (case-insensitive)
                const targetValue = String(value).toLowerCase().trim();
                for (const radio of group) {
                    const radioValue = String(radio.value).toLowerCase().trim();
                    if (radioValue === targetValue) {
                        targetRadio = radio;
                        break;
                    }
                }

                // If no exact match, try matching by label text
                if (!targetRadio) {
                    for (const radio of group) {
                        const label = radio.labels?.[0]?.textContent?.toLowerCase().trim() || '';
                        if (label === targetValue || label.includes(targetValue)) {
                            targetRadio = radio;
                            break;
                        }
                    }
                }

                if (targetRadio && !targetRadio.checked) {
                    // console.log(`[ExecutionEngine] 📻 Selecting radio: "${targetRadio.value}" in group "${name}"`);
                    targetRadio.click();
                    this.dispatchEvents(targetRadio);
                }
            }
            return;
        }

        // Checkbox Handling
        if (type === 'checkbox') {
            const shouldBeChecked = value === true || value === 'true' || value === element.value;
            if (element.checked !== shouldBeChecked) {
                element.click();
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
