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
        // ROBUST SCRAPER UPGRADE: Use DeepDomWalker instead of querySelectorAll
        // This ensures we find inputs inside Shadow Roots (Workday/Salesforce)
        const inputs = this.collectDeepFields(container, ['input']);

        const fields = [];
        const processedGroups = new Set(); // Stores group keys (name or wrapper index)

        inputs.forEach(input => {
            // Skip hidden, submit, button
            if (['hidden', 'submit', 'button', 'image', 'reset'].includes(input.type)) {
                return;
            }

            const type = (input.type || '').toLowerCase();
            const isStructured = ['radio', 'checkbox'].includes(type);

            if (isStructured) {
                const wrapper = input.closest('.form-group, fieldset, tr, .radio-group, .checkbox-group, div[role="group"]');
                let groupKey = '';

                // A. Check for shared name in this container/wrapper
                const name = input.name;
                const siblingsInWrapper = wrapper ? Array.from(wrapper.querySelectorAll(`input[type="${type}"]`)) : [];
                const hasSharedName = name && siblingsInWrapper.every(s => s.name === name);

                if (hasSharedName) {
                    groupKey = `name:${name}`;
                } else if (wrapper) {
                    // B. Anonymous Group (Unique or missing names)
                    // Use the wrapper's index or unique ID as the key
                    // Note: In Shadow DOM, getting "allNodes" from container might be expensive/wrong.
                    // We stick to wrapper reference if possible, or skip unknown grouping.
                    if (wrapper.id) groupKey = `wrapper:${wrapper.id}`;
                    else groupKey = `name:${name || 'unknown'}`;
                } else if (name) {
                    // C. Fallback to name if no wrapper found
                    groupKey = `name:${name}`;
                } else {
                    // D. Individual field (no name, no wrapper) - Weak ID
                    groupKey = `element:${input.id || Math.random()}`;
                }

                if (processedGroups.has(groupKey)) return;
                processedGroups.add(groupKey);
            }

            const field = this.buildFieldObject(input, container);
            if (field) fields.push(field);
        });

        return fields;
    }

    /**
     * Extract textareas
     */
    extractTextareas(container) {
        // ROBUST SCRAPER UPGRADE: Deep Scan
        const textareas = this.collectDeepFields(container, ['textarea']);
        const fields = [];

        textareas.forEach(textarea => {
            const field = this.buildFieldObject(textarea, container);
            if (field) fields.push(field);
        });
        return fields;
    }

    /**
     * EXTRACT (Main Entry Point)
     */
    extract(root) {
        // Single Pass Extraction (Optimized)
        // Instead of calling collectDeepFields 3 times, we call it once and filter results.
        const allFields = this.collectDeepFields(root, ['input', 'select', 'textarea']);

        // Convert to Normalized Field Objects
        const processedFields = [];

        allFields.forEach(el => {
            const field = this.buildFieldObject(el, root); // Pass container for context
            if (field) processedFields.push(field);
        });

        return processedFields;
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
        if (['radio', 'checkbox'].includes(type)) {
            if (element.name) {
                selector = `input[name="${CSS.escape(element.name)}"]`;
            } else {
                // Anonymous Group (Shared Wrapper)
                const wrapper = element.closest('.form-group, fieldset, tr, .radio-group, .checkbox-group, div[role="group"]');
                if (wrapper) {
                    // Use the wrapper as a scope or a data-id if possible
                    selector = `input[type="${type}"]`; // FieldUtils will scope this to the wrapper
                }
            }
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
            const { options, groupElements } = this.extractStructuredGroupData(element, container);
            field.options = options;
            field.groupElements = groupElements; // Capture ALL elements in the group
        }

        // Add attributes
        field.attributes = this.extractAttributes(element);

        return field;
    }

    /**
     * Extract options AND elements for radio/checkbox groups
     */
    extractStructuredGroupData(element, container = document) {
        const type = element.type;
        const name = element.name;

        let group = [];

        // Strategy A: Name-based group (Standard)
        if (name) {
            group = Array.from(container.querySelectorAll(`input[type="${type}"][name="${CSS.escape(name)}"]`));
        }

        // Strategy B: Context-based group (for unique names or missing names)
        if (group.length <= 1) {
            const wrapper = element.closest('.form-group, fieldset, tr, .radio-group, .checkbox-group, div[role="group"]');
            if (wrapper) {
                group = Array.from(wrapper.querySelectorAll(`input[type="${type}"]`));
            }
        }

        const options = [];
        const groupElements = [];

        group.forEach(input => {
            const label = this.extractOptionLabel(input, container);
            let val = input.value;
            if (val === 'on' || val === 'true') val = label || val;

            const optionSelector = input.id ? `#${CSS.escape(input.id)}` : (input.name && input.value ? `input[name="${CSS.escape(input.name)}"][value="${CSS.escape(input.value)}"]` : `input[name="${CSS.escape(input.name || '')}"]`);

            options.push({ value: val, text: label || input.value, selector: optionSelector });
            groupElements.push(input);
        });

        return { options, groupElements };
    }

    /**
     * Extract label for field
     */
    extractLabel(element, container = document) {
        // Generic labels to ignore (often from aria-label or title attributes)
        const INVALID_LABELS = new Set([
            'indicates a required field',
            'required field',
            'required',
            'optional',
            'current value is',
            '*',
            ''
        ]);

        // Helper to validate label quality
        const isValid = (text) => {
            if (!text || typeof text !== 'string') return false;
            const normalized = text.toLowerCase().trim();
            // Check exact matches
            if (INVALID_LABELS.has(normalized)) return false;
            // Check partial matches for "current value is..."
            if (normalized.startsWith('current value is')) return false;
            return true;
        };

        // Method 0: Centralized FANG Logic (Priority Override)
        if (typeof window.getFieldLabel === 'function') {
            //console.log(`[FormExtractor] Calling window.getFieldLabel for element:`, element);
            const visualLabel = window.getFieldLabel(element);
            if (visualLabel && visualLabel !== 'Unknown Field' && isValid(visualLabel)) {
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
                    if (text.toLowerCase() !== (element.value || '').toLowerCase() && isValid(text)) {
                        return text;
                    }
                }

                // Fallback: If no label inside wrapper, look at previous sibling of wrapper
                const prev = wrapper.previousElementSibling;
                if (prev && (prev.tagName === 'LABEL' || prev.tagName.match(/^H[1-6]$/))) {
                    if (isValid(prev.textContent.trim())) {
                        return prev.textContent.trim();
                    }
                }
            }
        }

        // Method 2: <label for="id">
        if (element.id) {
            const label = container.querySelector(`label[for="${element.id}"]`);
            if (label && isValid(label.textContent.trim())) return label.textContent.trim();
        }

        // Method 3: Wrapped in <label>
        const parentLabel = element.closest('label');
        if (parentLabel) {
            const text = parentLabel.textContent.replace(element.value || '', '').trim();
            if (isValid(text)) return text;
        }

        // Method 4: aria-label (Low priority if it's generic)
        if (element.getAttribute('aria-label')) {
            const label = element.getAttribute('aria-label');
            // Only accept if it's NOT in our invalid list
            if (isValid(label)) return label;
        }

        // Method 5: Previous sibling
        let prev = element.previousElementSibling;
        while (prev && prev.tagName !== 'LABEL') {
            if (prev.textContent && prev.textContent.trim().length < 100) {
                if (isValid(prev.textContent.trim())) return prev.textContent.trim();
            }
            prev = prev.previousElementSibling;
        }
        if (prev && prev.tagName === 'LABEL') {
            if (isValid(prev.textContent.trim())) return prev.textContent.trim();
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
                    if (isValid(headerRow.cells[cellIndex].textContent.trim())) {
                        return headerRow.cells[cellIndex].textContent.trim();
                    }
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
     * Extract specific label for an option (skipping group context)
     */
    extractOptionLabel(element, container = document) {
        // Method 1: <label for="id">
        if (element.id) {
            const label = container.querySelector(`label[for="${element.id}"]`);
            if (label) return label.textContent.trim();
        }

        // Method 2: Wrapped in <label>
        const parentLabel = element.closest('label');
        if (parentLabel) {
            return parentLabel.textContent.replace(element.value || '', '').trim();
        }

        // Method 3: aria-label
        if (element.getAttribute('aria-label')) {
            return element.getAttribute('aria-label');
        }

        // Method 4: Next Sibling Label (Ashby style)
        // <input> <label>Option</label>
        if (element.nextElementSibling && element.nextElementSibling.tagName === 'LABEL') {
            return element.nextElementSibling.textContent.trim();
        }

        // Method 5: Parent's Next Sibling (Ashby Nested style)
        // <span><input></span> <label>Option</label>
        if (element.parentElement && element.parentElement.nextElementSibling?.tagName === 'LABEL') {
            return element.parentElement.nextElementSibling.textContent.trim();
        }

        return '';
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

    // ==========================================
    // ROBUST SCRAPER UPGRADES (Enterprise Grade)
    // ==========================================

    /**
     * Entry Point: Extract with Stability Check and Two-Pass Verification
     * @param {Element} root 
     */
    async extractWithStability(root) {
        if (!root) return [];

        // Pass 1: Wait for stability
        await this.waitForDomStability({ root, idleMs: 200, timeoutMs: 2000 });
        const pass1 = this.collectDeepFields(root);

        // Pass 2: Verification (React Guard)
        // Short sleep to catch immediate re-renders/unmounts
        await new Promise(r => setTimeout(r, 150));
        const pass2 = this.collectDeepFields(root);

        // Intersect & Deduplicate
        return this.intersectAndDedupeFields(pass1, pass2);
    }

    /**
     * Intersect two passes and deduplicate by Semantic Fingerprint
     */
    intersectAndDedupeFields(pass1, pass2) {
        const map2 = new Map();
        pass2.forEach(el => map2.set(this.getSemanticFingerprint(el), el));

        const resultNodes = [];
        const seen = new Set();

        pass1.forEach(el => {
            const fingerprint = this.getSemanticFingerprint(el);

            // 1. Stability Check: Must exist in Pass 2
            if (map2.has(fingerprint)) {
                const stableNode = map2.get(fingerprint); // Prefer the later node (Pass 2)

                // 2. Dedup Check
                if (!seen.has(fingerprint)) {
                    seen.add(fingerprint);

                    // 3. Usability Filter (Visibility)
                    if (this.isUsableField(stableNode)) {
                        resultNodes.push(stableNode);
                    }
                }
            }
        });

        // Convert Nodes to Field Objects
        const fields = [];
        resultNodes.forEach(node => {
            const field = this.buildFieldObject(node, document); // Assuming document context for now
            if (field) fields.push(field);
        });

        return fields;
    }

    /**
     * Generate Enterprise-Grade Fingerprint
     * Combines Semantics (Label/Name) + Structure (DOM Path Anchor)
     */
    getSemanticFingerprint(el) {
        // Label normalization
        const label = this.extractLabel(el) || '';
        const normLabel = label.toLowerCase().replace(/[^a-z0-9]/g, '');

        // Structural Anchor (Ancestor ID or Path)
        // We limit path depth to avoid brittleness, but enough to distinguish repeated sections
        const domPath = this.getStableDomPath(el, 3);

        return `${normLabel}|${el.name || ''}|${el.id || ''}|${domPath}`;
    }

    /**
     * Get stable DOM path (ancestors)
     */
    getStableDomPath(el, depth) {
        let path = '';
        let current = el.parentElement;
        let d = 0;
        while (current && d < depth && current.tagName !== 'BODY') {
            let seg = current.tagName.toLowerCase();
            if (current.id) seg += `#${current.id}`;
            else if (current.getAttribute('data-automation-id')) seg += `[data-automation-id="${current.getAttribute('data-automation-id')}"]`;
            else {
                // Positional index (fragile but necessary for arrays)
                const index = Array.from(current.parentElement?.children || []).indexOf(current);
                seg += `:nth-child(${index + 1})`;
            }
            path = `/${seg}${path}`;
            current = current.parentElement;
            d++;
        }
        return path;
    }

    /**
     * Check if field is usable (Visible, Enabled, Sized)
     */
    isUsableField(el) {
        if (!el.isConnected || el.disabled || el.readOnly) return false;

        // Computed style check
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;

        // Geometry check
        const rect = el.getBoundingClientRect();
        // Relaxed size check for Workday
        // If it has 0 size but HAS CONTENT, we treat it as a data field and keep it.
        // This handles cases where Workday hides "value" inputs behind styled divs.
        if (rect.width === 0 || rect.height === 0) {
            if (el.value && el.value.trim().length > 0) return true;
            return false;
        }

        return true;
    }

    /**
     * Robust Deep DOM Walker (Budgeted & Scoped)
     */
    collectDeepFields(root, types = ['input', 'select', 'textarea']) {
        console.log('[FormExtractor] Starting Deep Walk...');

        // MASSIVE BUDGET for Workday (Infinite Scroll / Huge DOMs)
        const WALKER_BUDGET = { MAX_NODES: 200000, MAX_TIME: 10000 };
        const ctx = { count: 0, start: performance.now() };
        const visited = new WeakSet();

        // NUCLEAR DEDUPLICATION: Track specific Nodes we've already collected
        const processedNodes = new Set();

        // Helper booleans for specialized types
        const wantsInputs = types.includes('input');

        // Helper for recursion
        const walk = (node, depth) => {
            if (!node || visited.has(node)) return [];
            if (depth > 20) return []; // Increased depth

            visited.add(node);

            // Note: ctx.count is now incremented in the loop for granularity

            const fields = [];
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT, null, false);

            let curr = walker.currentNode;
            while (curr) {
                ctx.count++; // Correctly count every visited node

                // Periodically log progress
                if (ctx.count % 5000 === 0) {
                    console.log(`[FormExtractor] Scanned ${ctx.count} nodes...`);
                }

                // Budget Check inside loop
                if (ctx.count > WALKER_BUDGET.MAX_NODES) {
                    console.warn('[FormExtractor] Budget Exceeded! Stopping scan.');
                    return fields;
                }
                if (performance.now() - ctx.start > WALKER_BUDGET.MAX_TIME) {
                    console.warn('[FormExtractor] Time Budget Exceeded! Stopping scan.');
                    return fields;
                }

                // BUG FIX: ShadowRoot has no tagName
                const tag = curr.tagName ? curr.tagName.toLowerCase() : '';

                // --- NUCLEAR DEDUPLICATION ---
                if (processedNodes.has(curr)) {
                    curr = walker.nextNode();
                    continue;
                }

                let collected = false;
                let candidate = false;

                // 1. Direct Type Match (Input/Select/Textarea)
                if (types.includes(tag)) {
                    candidate = true;
                    if (this.isUsableField(curr)) collected = true;
                    else console.log(`[FormExtractor] Skipped Hidden/Disabled: ${curr.id || curr.name || tag}`);
                }
                // 2. ContentEditable (Treat as Input)
                else if (wantsInputs && (curr.isContentEditable || curr.getAttribute?.('contenteditable') === 'true')) {
                    candidate = true;
                    if (this.isUsableField(curr)) collected = true;
                    else console.log(`[FormExtractor] Skipped Hidden ContentEditable`);
                }
                // 3. Proxy Fallback (Treat as Input)
                else if (wantsInputs && (tag === 'div' || tag === 'span')) {
                    if (curr.shadowRoot === null && curr.getAttribute?.('role') === 'textbox') {
                        // Ensure not a container
                        if (!curr.querySelector('input, textarea, select')) {
                            candidate = true;
                            if (this.isUsableField(curr)) collected = true;
                            else console.log(`[FormExtractor] Skipped Hidden Proxy`);
                        }
                    }
                }

                if (collected) {
                    fields.push(curr);
                    processedNodes.add(curr);
                }

                // B. Traversal Logic

                // Shadow DOM
                if (curr.shadowRoot) {
                    // Two-Tier: Fast Scan
                    if (curr.shadowRoot.querySelector('input, textarea, select')) {
                        fields.push(...walk(curr.shadowRoot, depth + 1));
                    } else {
                        fields.push(...walk(curr.shadowRoot, depth + 1));
                    }
                }

                // Iframes (Same Origin)
                if (tag === 'iframe') {
                    try {
                        const doc = curr.contentDocument;
                        if (doc && doc.body) fields.push(...walk(doc.body, depth + 1));
                    } catch (e) { }
                }

                curr = walker.nextNode();
            }
            return fields;
        };

        const results = walk(root, 0);
        console.log(`[FormExtractor] Walk complete. Scanned ${ctx.count} nodes. Found ${results.length} fields.`);
        return results;
    }

    /**
     * Wait for DOM Stability (Meaningful Mutations)
     */
    waitForDomStability({ root, idleMs, timeoutMs }) {
        return new Promise(resolve => {
            let timer;
            const observer = new MutationObserver((mutations) => {
                // Filter noise (class changes, style changes) - only care about structure
                const isMeaningful = mutations.some(m => m.addedNodes.length > 0 || m.removedNodes.length > 0);

                if (isMeaningful) {
                    clearTimeout(timer);
                    timer = setTimeout(done, idleMs);
                }
            });

            observer.observe(root, { childList: true, subtree: true, attributes: false });

            // Hard timeout
            const maxTimer = setTimeout(done, timeoutMs);

            function done() {
                observer.disconnect();
                clearTimeout(timer);
                clearTimeout(maxTimer);
                resolve();
            }

            // Start initial timer in case of no mutations
            timer = setTimeout(done, idleMs);
        });
    }

}

// Export
if (typeof window !== 'undefined') {
    window.FormExtractor = FormExtractor;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FormExtractor;
}
