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

        // Capture State for Undo (CRITICAL FIX)
        if (window.UndoManager) {
            window.UndoManager.capture(element);
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

        // CENTRALIZED: Use cache_label as the authoritative key
        // Priority: fieldMetadata.cache_label > element attribute > NovaCache > fallback
        let cacheLabel = fieldMetadata.cache_label;
        if (!cacheLabel && element) {
            cacheLabel = element.getAttribute('cache_label');
        }
        if (!cacheLabel && window.NovaCache) {
            cacheLabel = window.NovaCache[element.id] || window.NovaCache[element.name];
        }

        // Check if this is a multiCache-eligible field (job/education/skills)
        const fieldContext = [fieldMetadata.label, fieldMetadata.name, fieldMetadata.parentContext].filter(Boolean).join(' ').toLowerCase();

        // Use centralized routing logic
        const isMultiCacheEligible = window.FIELD_ROUTING_PATTERNS.isMultiValueEligible(fieldContext, element.type);

        console.log(`[ExecutionEngine] 📝 User Edit: "${fieldMetadata.label}" -> "${newValue}" (cacheLabel: ${cacheLabel})`);



        if (isStructuredInput && window.InteractionLog) {
            // Structured inputs go to SelectionCache
            window.InteractionLog.cacheSelection(fieldMetadata, fieldMetadata.label, newValue);
        } else if (isMultiCacheEligible && window.InteractionLog) {
            // MultiCache-eligible text fields go to InteractionLog (which routes to multiCache)
            window.InteractionLog.cacheSelection(fieldMetadata, fieldMetadata.label, newValue);
        } else if (!isStructuredInput && !isMultiCacheEligible && window.GlobalMemory) {
            // Generic text fields go to SmartMemory using cache_label
            const key = cacheLabel || (window.GlobalMemory.normalizeKey ? window.GlobalMemory.normalizeKey(fieldMetadata.label) : fieldMetadata.label);
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

        // Date Format Handling
        // Different input types require different date formats
        // Using valueAsDate is more reliable than string-based value setting
        if (type === 'date' || type === 'month') {
            let parsedDate = null;
            let formattedValue = String(value).trim();

            // Try to parse the date from various formats
            if (/^\d{4}-\d{2}-\d{2}$/.test(formattedValue)) {
                // Already in yyyy-MM-dd format
                parsedDate = new Date(formattedValue + 'T00:00:00');
            } else if (/^\d{4}-\d{2}$/.test(formattedValue)) {
                // yyyy-MM format -> add day 01
                parsedDate = new Date(formattedValue + '-01T00:00:00');
            } else if (/^\d{4}$/.test(formattedValue)) {
                // yyyy format -> January 1st
                parsedDate = new Date(`${formattedValue}-01-01T00:00:00`);
            } else if (/^[A-Za-z]+ \d{4}$/.test(formattedValue)) {
                // "July 2025" format
                parsedDate = new Date(formattedValue);
            } else {
                // Try generic parsing
                parsedDate = new Date(formattedValue);
            }

            // If we have a valid date, format it correctly for the input type
            if (parsedDate && !isNaN(parsedDate.getTime())) {
                if (type === 'date') {
                    // Format as yyyy-MM-dd
                    const year = parsedDate.getFullYear();
                    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
                    const day = String(parsedDate.getDate()).padStart(2, '0');
                    value = `${year}-${month}-${day}`;
                } else if (type === 'month') {
                    // Format as yyyy-MM
                    const year = parsedDate.getFullYear();
                    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
                    value = `${year}-${month}`;
                }
                // console.log(`📅 [DateFormat] Type: ${type}, Original: "${formattedValue}" -> Formatted: "${value}"`);
            } else {
                console.warn(`⚠️ [DateFormat] Could not parse date: "${formattedValue}"`);
            }
        }

        // Standard Value Setting
        // Usage of Native Setter allows bypassing React's "controlled component" logic
        if (tagName === 'input' && this.nativeValueSetter) {
            // Safety check for file inputs - they are read-only
            if (type === 'file') {
                console.warn(`[ExecutionEngine] Skipping value set for file input: ${element.id || element.name}`);
                return;
            }

            // SMART NUMBER PARSING (Fix for "3-5" -> Number)
            if (type === 'number') {
                if (window.FieldUtils && window.FieldUtils.parseNumericValue) {
                    const parsed = window.FieldUtils.parseNumericValue(value);
                    if (parsed !== null) {
                        // console.log(`🔢 [SmartNumber] Converted "${value}" -> ${parsed}`);
                        value = parsed;
                    } else if (isNaN(Number(value))) {
                        console.warn(`⚠️ [SmartNumber] Failed to parse numeric value: "${value}"`);
                        // Don't set incompatible value to avoid crash
                        return;
                    }
                }
            }

            console.log(`⚙️ [SetValue] type="${type}", tagName="${tagName}", value="${value}"`);
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
        const normalize = (str) => String(str || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        const targetClean = normalize(targetValue);
        const targetNum = parseFloat(String(targetValue).replace(/[^0-9.]/g, ''));

        // Find best option
        let bestMatch = null;
        let maxScore = 0;

        for (const option of element.options) {
            // Check all possible identifiers for this option
            const candidates = [
                option.value,
                option.text,
                option.getAttribute('label'),
                option.id
            ].filter(Boolean); // Filter nulls

            let score = 0;

            for (const cand of candidates) {
                const candClean = normalize(cand);

                // A. Exact Match (Highest Priority)
                if (candClean === targetClean) {
                    score = 100;
                    break;
                }

                // B. Numeric Match (e.g. "30 days" vs "30")
                if (!isNaN(targetNum)) {
                    const candNum = parseFloat(String(cand).replace(/[^0-9.]/g, ''));
                    if (!isNaN(candNum) && candNum === targetNum) {
                        score = Math.max(score, 90);
                    }
                }

                // C. Containment Match (e.g. "United States" vs "United States of America")
                if (candClean.includes(targetClean) || targetClean.includes(candClean)) {
                    // Check if meaningful containment (at least 3 chars)
                    if (Math.min(candClean.length, targetClean.length) > 3) {
                        score = Math.max(score, 70);
                    }
                }
            }

            if (score > maxScore) {
                maxScore = score;
                bestMatch = option.value;
            }
        }

        if (bestMatch !== null && maxScore >= 70) {
            // console.log(`🎯 [SmartSelect] Fuzzy Matched "${targetValue}" -> "${bestMatch}" (Score: ${maxScore})`);
            if (this.nativeSelectSetter) {
                this.nativeSelectSetter.call(element, bestMatch);
            } else {
                element.value = bestMatch;
            }
            // For robust frameworks (React/Angular), dispatch change
            this.dispatchEvents(element);
            return;
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
