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
    async fill(selectorOrElement, value, confidence = 1.0, fieldMetadata = null, source = null) {
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

        // Special Handling for File Inputs (Security Restricted)
        if (element.type === 'file') {
            console.log(`📂 [ExecutionEngine] File Input Detected: "${element.id || element.name}". Highlighting for user manual upload.`);
            this.flashField(element, 1.0); // Flash green/yellow to draw attention
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return true;
        }

        // Normalize value: extract string from cache objects
        if (value && typeof value === 'object') {
            if ('value' in value) {
                value = value.value;
            } else if (Array.isArray(value)) {
                value = value.map(v => typeof v === 'object' && v.value ? v.value : v).filter(Boolean).join(', ');
            }
        }

        // Skip if value is empty/null/undefined
        if (value === null || value === undefined || value === '') {
            return true;
        }

        // Ensure value is a string
        value = String(value);

        // Attach ML prediction to DOM element for sidebar cache access
        if (fieldMetadata && fieldMetadata.ml_prediction) {
            element.__ml_prediction = fieldMetadata.ml_prediction;
        }

        // Stamp Source for Sidebar/UI tracking
        if (source) {
            element.setAttribute('data-autofill-source', source);
        }

        // Capture State for Undo
        if (window.UndoManager) {
            window.UndoManager.capture(element);
        }

        // Visual Feedback (Flash)
        this.flashField(element, confidence);

        // 1. Scroll into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // 2. Focus (Safely)
        try {
            element.dispatchEvent(new Event('focus', { bubbles: true }));
            element.focus({ preventScroll: true });
        } catch (e) { }

        // 3. Set Value (Visual / Human Speed)
        if (window.showGhostingAnimation) {
            await window.showGhostingAnimation(element, value, confidence);
        } else {
            await this.setValueRobust(element, value, fieldMetadata);
            this.dispatchEvents(element);
        }

        // 5. Blur
        element.blur();
        element.dispatchEvent(new Event('blur', { bubbles: true }));

        // 6. Attach Manual Edit Listener
        this.attachChangeListener(element, fieldMetadata);

        return true;
    }

    /**
     * Attach a listener to save manual user edits to cache
     */
    attachChangeListener(element, fieldMetadata) {
        if (!element || element._novaEditListenerAttached) return;

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

    // Helper to extract text from a specific option input
    getOptionLabelText(input) {
        if (window.FieldUtils && typeof window.FieldUtils.getOptionLabelText === 'function') {
            return window.FieldUtils.getOptionLabelText(input);
        }
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
        if (input.nextElementSibling && input.nextElementSibling.tagName === 'LABEL') {
            return input.nextElementSibling.innerText.trim();
        }
        return null;
    }

    _handleUserEdit(element, fieldMetadata) {
        console.log("_handleUserEdit", element, fieldMetadata);
        if (!fieldMetadata) return;

        let newValue;
        const type = (element.type || '').toLowerCase();

        if (type === 'checkbox') {
            const rawVal = element.value;
            // Try to resolve a meaningful value (label) if value is generic 'on'
            if (!rawVal || rawVal === 'on') {
                const text = this.getOptionLabelText(element);
                newValue = text || true;
            } else {
                newValue = rawVal;
            }

            // NEW: Support for deselecting items in multi-select arrays
            if (window.InteractionLog && window.InteractionLog.updateMultiSelection) {
                window.InteractionLog.updateMultiSelection(fieldMetadata, fieldMetadata.label, newValue, element.checked);
                return;
            }

            if (!element.checked) return;

        } else if (type === 'radio') {
            if (!element.checked) return;
            const rawVal = element.value;
            const isGeneric = !rawVal || rawVal === 'on' || rawVal === 'true';
            const isDynamic = /^[0-9]+$/.test(rawVal) || (rawVal.length > 8 && /[0-9]/.test(rawVal) && !rawVal.includes(' '));

            if (isGeneric || isDynamic) {
                const text = this.getOptionLabelText(element);
                newValue = text || "true";
            } else {
                newValue = rawVal;
            }
        } else {
            newValue = element.value;
        }

        let cacheLabel = fieldMetadata.cache_label || element.getAttribute('cache_label');
        if (!cacheLabel && window.NovaCache) {
            cacheLabel = window.NovaCache[element.id] || window.NovaCache[element.name];
        }

        const fieldContext = [fieldMetadata.label, fieldMetadata.name, fieldMetadata.parentContext].filter(Boolean).join(' ').toLowerCase();
        const isMultiCacheEligible = window.FIELD_ROUTING_PATTERNS ? window.FIELD_ROUTING_PATTERNS.isMultiValueEligible(fieldContext, element.type) : false;

        console.log(`[ExecutionEngine] 📝 User Edit: "${fieldMetadata.label}" -> "${newValue}" (cacheLabel: ${cacheLabel})`);

        if (!fieldMetadata.instance_type && element) {
            fieldMetadata.instance_type = element.getAttribute('instance_type');
        }

        const isStructuredInput = ['radio', 'checkbox', 'select', 'select-one', 'select-multiple'].includes(type);
        const isAtomicSingle = fieldMetadata.instance_type === 'ATOMIC_SINGLE';

        if ((isStructuredInput || isAtomicSingle || isMultiCacheEligible) && window.InteractionLog) {
            window.InteractionLog.cacheSelection(fieldMetadata, fieldMetadata.label, newValue);
        } else if (window.GlobalMemory) {
            const key = cacheLabel || (window.GlobalMemory.normalizeKey ? window.GlobalMemory.normalizeKey(fieldMetadata.label) : fieldMetadata.label);
            window.GlobalMemory.updateCache({
                [key]: { answer: newValue, timestamp: Date.now() }
            });
        }
    }

    /**
     * Robust Value Setter (Bypasses Virtual DOM locking)
     */
    async setValueRobust(element, value, fieldMetadata = null) {
        const tagName = element.tagName.toLowerCase();
        const type = (element.type || '').toLowerCase();

        // 1. Delegate to shared FieldUtils for Radio/Checkbox (Robust Group Handling)
        if (type === 'radio' || type === 'checkbox') {
            if (window.FieldUtils && typeof window.FieldUtils.setFieldValue === 'function') {
                window.FieldUtils.setFieldValue(element, value, fieldMetadata);
            } else if (typeof window.setFieldValue === 'function') {
                window.setFieldValue(element, value);
            } else {
                element.checked = (value === true || value === 'true' || value === element.value);
            }
            return;
        }

        // 2. Delegate to shared FieldUtils for Select (Fuzzy Matching)
        if (tagName === 'select') {
            if (window.FieldUtils && typeof window.FieldUtils.setFieldValue === 'function') {
                window.FieldUtils.setFieldValue(element, value);
            } else {
                this.setSelectValue(element, value);
            }
            return;
        }

        // 3. Delegate to shared FieldUtils for Dates (Format Correction)
        const hasDatePlaceholder = element.placeholder && /[md]{2}[\/-][md]{2}|yyyy|dd|mm/i.test(element.placeholder);
        if (type === 'date' || type === 'month' || hasDatePlaceholder) {
            if (window.FieldUtils && typeof window.FieldUtils.setFieldValue === 'function') {
                window.FieldUtils.setFieldValue(element, value);
                return;
            }
        }

        // 4. Standard Value Setting (Input/Textarea)
        if (tagName === 'input' && this.nativeValueSetter) {
            if (type === 'number' && window.FieldUtils && window.FieldUtils.parseNumericValue) {
                const parsed = window.FieldUtils.parseNumericValue(value);
                if (parsed !== null) value = parsed;
            }
            this.nativeValueSetter.call(element, value);
        } else if (tagName === 'textarea' && this.nativeTextAreaSetter) {
            this.nativeTextAreaSetter.call(element, value);
        } else {
            element.value = value;
        }
    }

    setSelectValue(element, targetValue) {
        if (this.nativeSelectSetter) {
            this.nativeSelectSetter.call(element, targetValue);
        } else {
            element.value = targetValue;
        }

        if (element.value !== String(targetValue) && element.options) {
            const targetClean = String(targetValue).toLowerCase().trim();
            const option = Array.from(element.options).find(opt =>
                opt.text.toLowerCase().trim() === targetClean ||
                opt.value.toLowerCase().trim() === targetClean ||
                opt.text.toLowerCase().includes(targetClean)
            );
            if (option) {
                if (this.nativeSelectSetter) {
                    this.nativeSelectSetter.call(element, option.value);
                } else {
                    element.value = option.value;
                }
            }
        }
        this.dispatchEvents(element);
    }

    dispatchEvents(element) {
        if (!element) return;
        if (window.FieldUtils && typeof window.FieldUtils.dispatchChangeEvents === 'function') {
            window.FieldUtils.dispatchChangeEvents(element);
            return;
        }
        const opts = { bubbles: true, cancelable: true, view: window };
        element.dispatchEvent(new KeyboardEvent('keydown', opts));
        element.dispatchEvent(new InputEvent('input', { ...opts, inputType: 'insertText', data: element.value }));
        element.dispatchEvent(new KeyboardEvent('keyup', opts));
        element.dispatchEvent(new Event('change', opts));
    }

    flashField(element, confidence) {
        const color = confidence > 0.9 ? 'rgba(74, 222, 128, 0.4)' : 'rgba(250, 204, 21, 0.4)';
        const originalTransition = element.style.transition;
        const originalBg = element.style.backgroundColor;

        element.style.transition = 'background-color 0.5s ease';
        element.style.backgroundColor = color;

        setTimeout(() => {
            element.style.backgroundColor = originalBg;
            setTimeout(() => { element.style.transition = originalTransition; }, 500);
        }, 800);
    }
}

if (typeof window !== 'undefined') {
    window.ExecutionEngine = ExecutionEngine;
}
