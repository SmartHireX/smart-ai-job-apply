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
        // We do this BEFORE value check because file inputs often have no value passed from memory
        // but we still want to Highlight/Flash them to prompt the user.
        if (element.type === 'file') {
            console.log(`📂 [ExecutionEngine] File Input Detected: "${element.id || element.name}". Highlighting for user manual upload.`);
            this.flashField(element, 1.0); // Flash green/yellow to draw attention

            // Scroll into view so user sees it
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Return TRUE to signal "Handled" to the Pipeline (suppresses "Execution Failure" noise)
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
            // console.log('[ExecutionEngine] Skipping empty value for:', selectorOrElement);
            return true; // Return true to signify "Successful Skip" (prevents Pipeline "Failure" logs)
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

        // Capture State for Undo (CRITICAL FIX)
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
            element.focus({ preventScroll: true }); // Prevent jumping for hidden elements
        } catch (e) {
            // Use FieldUtils visibility check if available, otherwise assume it's hidden/radio
            // console.warn('[ExecutionEngine] Focus failed (likely hidden element)', e);
        }

        // 3. Set Value (Visual / Human Speed)
        if (window.showGhostingAnimation) {
            // Use the "Human Speed" animation requested by the user
            // This function handles typing simulation, focus, and visual feedback internally
            await window.showGhostingAnimation(element, value, confidence);
        } else {
            // Fallback to instant fill if visual module is missing
            await this.setValueRobust(element, value);
            this.dispatchEvents(element);
        }

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

    // Helper to extract text from a specific option input (Sync with sidebar-components.js)
    getOptionLabelText(input) {
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
        // Ashby Style: Input followed immediately by Label
        if (input.nextElementSibling && input.nextElementSibling.tagName === 'LABEL') {
            return input.nextElementSibling.innerText.trim();
        }
        return null;
    }

    _handleUserEdit(element, fieldMetadata) {
        if (!fieldMetadata) return;

        // FIXED: Correctly capture value vs boolean state
        let newValue;
        const type = (element.type || '').toLowerCase();

        if (type === 'checkbox') {
            // Validate "True" Value: If checked, use the value attribute (e.g. "Java"), else "true" if value is missing/on
            if (element.checked) {
                // If value is generic "on" or empty, treat as boolean true, else use the semantic value
                const rawVal = element.value;
                if (!rawVal || rawVal === 'on') {
                    newValue = true;
                } else {
                    newValue = rawVal;
                }
            } else {
                // Unchecked = null/false (usually we don't cache unchecked, but for updates we might need to remove)
                // For now, let's just ignore unchecked triggers unless it's a forced "false"
                return;
            }
        } else if (type === 'radio') {
            if (!element.checked) return; // Only cache the selected radio
            const rawVal = element.value;
            // If value is generic "on" or "true", try to find a label
            // Also handle dynamic IDs like '27794634'
            const isGeneric = !rawVal || rawVal === 'on' || rawVal === 'true';
            const isDynamic = /^[0-9]+$/.test(rawVal) || (rawVal.length > 8 && /[0-9]/.test(rawVal) && !rawVal.includes(' '));

            if (isGeneric || isDynamic) {
                const text = this.getOptionLabelText(element);
                newValue = text || "true";
            } else {
                newValue = rawVal;
            }
        } else {
            // Text / Select / Etc
            newValue = element.value;
        }

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



        // Read instance_type if missing (from DOM or NovaCache)
        if (!fieldMetadata.instance_type && element) {
            fieldMetadata.instance_type = element.getAttribute('instance_type');
        }

        const isAtomicSingle = fieldMetadata.instance_type === 'ATOMIC_SINGLE';

        if ((isStructuredInput || isAtomicSingle) && window.InteractionLog) {
            // Structured inputs AND Atomic Single text fields go to SelectionCache (InteractionLog)
            // This ensures "Cover Letter" (ATOMIC_SINGLE) is stored in the primary cache.
            window.InteractionLog.cacheSelection(fieldMetadata, fieldMetadata.label, newValue);
        } else if (isMultiCacheEligible && window.InteractionLog) {
            // MultiCache-eligible text fields go to InteractionLog (which routes to multiCache)
            window.InteractionLog.cacheSelection(fieldMetadata, fieldMetadata.label, newValue);
        } else if (window.GlobalMemory) {
            // Generic text fields (fallback) go to SmartMemory using cache_label
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
        console.log('in select value robust')
        const tagName = element.tagName.toLowerCase();
        const type = (element.type || '').toLowerCase();

        // Debug Entry
        console.log(`🛠️ [SetValueRobust] Tag: "${tagName}", Type: "${type}", Target: "${value}"`);

        // Special Radio Button Handling (Group-Aware)
        if (type === 'radio') {
            let targetRadio = element;

            // 0. Group Lookup: If current element isn't a clear match, scan the group
            if (element.name) {
                const group = document.querySelectorAll(`input[name="${CSS.escape(element.name)}"]`);
                let bestMatch = null;
                let maxSim = 0;

                const calculateSim = (s1, s2) => {
                    if (!s1 || !s2) return 0;
                    const t1 = String(s1).toLowerCase().trim();
                    const t2 = String(s2).toLowerCase().trim();
                    if (t1 === t2) return 1.0;
                    if (t1.includes(t2) || t2.includes(t1)) return 0.8;
                    if (window.calculateUsingJaccardSimilarity) {
                        return window.calculateUsingJaccardSimilarity(s1, s2);
                    }
                    return 0;
                };

                group.forEach(r => {
                    const label = this.getOptionLabelText(r) || "";
                    const val = r.value || "";
                    const sim = Math.max(calculateSim(label, value), calculateSim(val, value));
                    if (sim > maxSim) {
                        maxSim = sim;
                        bestMatch = r;
                    }
                });

                if (bestMatch && maxSim > 0.4) {
                    targetRadio = bestMatch;
                    console.log(`🎯 [ExecutionEngine] Radio Targeted: "${value}" -> Option: "${this.getOptionLabelText(targetRadio)}" (sim: ${maxSim.toFixed(2)})`);
                }
            }

            // STRATEGY: Progressive Escalation on the BEST match
            const radioNode = targetRadio;

            // 1. Try Simple Click
            try {
                if (!radioNode.checked) {
                    console.log(`[ExecutionEngine] Clicking radio...`);
                    radioNode.click();
                }
            } catch (e) {
                console.error(`[ExecutionEngine] Radio click failed`, e);
            }

            // 2. Fallback: Label Click (If Input Click Failed)
            if (!radioNode.checked) {
                const label = radioNode.labels?.[0] ||
                    document.querySelector(`label[for="${CSS.escape(radioNode.id || '')}"]`) ||
                    (radioNode.parentElement && radioNode.parentElement.nextElementSibling?.tagName === 'LABEL' ? radioNode.parentElement.nextElementSibling : null);

                if (label) {
                    try {
                        console.log(`[ExecutionEngine] Fallback: Clicking label...`);
                        label.click();
                    } catch (e) { }
                }
            }

            // 3. Last Resort: Native Setter
            if (!radioNode.checked) {
                try {
                    const nativeLast = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')?.set;
                    if (nativeLast) { nativeLast.call(radioNode, true); }
                } catch (e) { }
            }

            this.dispatchEvents(radioNode);
            return;
        }

        // Checkbox Handling (Group-Aware)
        if (type === 'checkbox') {
            let targetValues = value;
            if (typeof value === 'string' && value.includes(',')) {
                targetValues = value.split(',').map(v => v.trim());
            }
            const valuesArray = Array.isArray(targetValues) ? targetValues : [targetValues];
            const isSingleBoolean = valuesArray.length === 1 && (valuesArray[0] === true || valuesArray[0] === 'true' || valuesArray[0] === 'on');

            if (element.name) {
                const group = document.querySelectorAll(`input[name="${CSS.escape(element.name)}"]`);
                group.forEach(cb => {
                    const label = this.getOptionLabelText(cb) || "";
                    const val = cb.value || "";

                    const isMatch = valuesArray.some(tv => {
                        const targetStr = String(tv).toLowerCase().trim();
                        if (val.toLowerCase().trim() === targetStr) return true;
                        if (label.toLowerCase().trim() === targetStr) return true;
                        if (window.calculateUsingJaccardSimilarity) {
                            return window.calculateUsingJaccardSimilarity(label, tv) > 0.6;
                        }
                        return false;
                    });

                    const shouldBeChecked = isMatch || (isSingleBoolean && (val === element.value || val === 'on'));

                    if (cb.checked !== shouldBeChecked) {
                        console.log(`🎯 [ExecutionEngine] Checkbox Toggled: "${label}" -> ${shouldBeChecked}`);
                        cb.click();
                        this.dispatchEvents(cb);
                    }
                });
            } else {
                // Single checkbox without name
                const shouldBeChecked = valuesArray.some(tv => tv === true || tv === 'true' || tv === element.value);
                if (element.checked !== shouldBeChecked) {
                    element.click();
                    this.dispatchEvents(element);
                }
            }
            return;
        }

        // Date Format Handling (ENHANCED)
        // Detect expected format from placeholder/pattern and format accordingly
        const isDateType = type === 'date' || type === 'month';
        const hasDatePlaceholder = element.placeholder && /[md]{2}[\/-][md]{2}|yyyy|dd|mm/i.test(element.placeholder);

        if (isDateType || hasDatePlaceholder) {
            let parsedDate = null;
            let formattedValue = String(value).trim();

            // Parse date from various input formats
            if (/^\d{4}-\d{2}-\d{2}$/.test(formattedValue)) {
                // Already in yyyy-MM-dd format
                parsedDate = new Date(formattedValue + 'T00:00:00');
            } else if (/^\d{4}-\d{2}$/.test(formattedValue)) {
                // yyyy-MM format -> add day 01
                parsedDate = new Date(formattedValue + '-01T00:00:00');
            } else if (/^\d{4}$/.test(formattedValue)) {
                // yyyy format -> January 1st
                parsedDate = new Date(`${formattedValue}-01-01T00:00:00`);
            } else if (/^\d{2}[-\/]\d{2}[-\/]\d{4}$/.test(formattedValue)) {
                // MM/DD/YYYY or DD/MM/YYYY - ambiguous, assume MM/DD/YYYY (US format)
                const parts = formattedValue.split(/[-\/]/);
                parsedDate = new Date(`${parts[2]}-${parts[0]}-${parts[1]}T00:00:00`);
            } else if (/^[A-Za-z]+ \d{4}$/.test(formattedValue)) {
                // "July 2025" format
                parsedDate = new Date(formattedValue);
            } else if (/^[A-Za-z]+ \d{1,2},? \d{4}$/.test(formattedValue)) {
                // "July 15, 2025" or "July 15 2025"
                parsedDate = new Date(formattedValue);
            } else {
                // Try generic parsing
                parsedDate = new Date(formattedValue);
            }

            // If we have a valid date, format based on target expectations
            if (parsedDate && !isNaN(parsedDate.getTime())) {
                const year = parsedDate.getFullYear();
                const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
                const day = String(parsedDate.getDate()).padStart(2, '0');

                if (type === 'date') {
                    // Native date input always uses yyyy-MM-dd
                    value = `${year}-${month}-${day}`;
                } else if (type === 'month') {
                    // Native month input uses yyyy-MM
                    value = `${year}-${month}`;
                } else if (hasDatePlaceholder) {
                    // Text input - detect expected format from placeholder
                    const ph = element.placeholder.toLowerCase();

                    if (ph.includes('mm/dd/yyyy') || ph.includes('mm-dd-yyyy')) {
                        value = `${month}/${day}/${year}`;
                    } else if (ph.includes('dd/mm/yyyy') || ph.includes('dd-mm-yyyy')) {
                        value = `${day}/${month}/${year}`;
                    } else if (ph.includes('yyyy-mm-dd')) {
                        value = `${year}-${month}-${day}`;
                    } else if (ph.includes('mm/dd') || ph.includes('mm-dd')) {
                        value = `${month}/${day}/${year}`;
                    } else if (ph.includes('dd/mm') || ph.includes('dd-mm')) {
                        value = `${day}/${month}/${year}`;
                    } else {
                        // Default to ISO format
                        value = `${year}-${month}-${day}`;
                    }
                    console.log(`📅 [DateFormat] Placeholder: "${element.placeholder}" -> Output: "${value}"`);
                }
            } else {
                console.warn(`⚠️ [DateFormat] Could not parse date: "${formattedValue}"`);
            }
        }

        // Standard Value Setting
        // Usage of Native Setter allows bypassing React's "controlled component" logic
        if (tagName === 'input' && this.nativeValueSetter) {
            // Safety check for file inputs - they are read-only
            if (type === 'file') {
                console.log(`📂 [ExecutionEngine] File Input Detected: "${element.id || element.name}". Highlighting for user manual upload.`);
                this.flashField(element, 1.0); // Flash green/yellow to draw attention
                // Return TRUE to signal "Handled" to the Pipeline (suppresses "Execution Failure" noise)
                return true;
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
        if (element.value === targetValue) {
            console.log(`✅ [SmartSelect] Direct Set Success: "${targetValue}"`);
            return;
        }

        console.log(`🔍 [SmartSelect] Target (Fuzzy Search): "${targetValue}"`);

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

            console.log(`🔍 [SmartSelect] Option: "${option.text}" (Val: ${option.value}) vs Target: "${targetValue}" -> Score: ${score}`);

            if (score > maxScore) {
                maxScore = score;
                bestMatch = option.value;
            }
        }

        if (bestMatch !== null && maxScore >= 70) {
            console.log(`🎯 [SmartSelect] WINNER: "${bestMatch}" (Score: ${maxScore}) for Target: "${targetValue}"`);
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
        const opts = { bubbles: true, cancelable: true, view: window };

        // Correct order for React Hook Form / Angular Forms compatibility
        // Order: keydown → input → keyup → change
        element.dispatchEvent(new KeyboardEvent('keydown', opts));
        element.dispatchEvent(new InputEvent('input', {
            ...opts,
            inputType: 'insertText',
            data: element.value
        }));
        element.dispatchEvent(new KeyboardEvent('keyup', opts));
        element.dispatchEvent(new Event('change', opts));
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
