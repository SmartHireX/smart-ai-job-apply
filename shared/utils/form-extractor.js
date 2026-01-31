/**
 * FormExtractor
 * Pure field extraction from DOM - no analysis, no enrichment, no AI prompting.
 * Supports Shadow DOM piercing and dynamic stability checks.
 */

class FormExtractor {
    constructor() {
        this.fieldCounter = 0;
    }

    /**
     * Main Entry Point (Stable & Deep)
     */
    async extract(root = document.body) {
        this.fieldCounter = 0;
        return this.extractWithStability(root);
    }

    /**
     * Two-Pass Stability Check (React Guard)
     * Ensures we didn't catch the DOM in the middle of a re-render.
     */
    async extractWithStability(root) {
        if (!root) return [];

        // Pass 1: Wait for initial stability
        await this.waitForDomStability({ root, idleMs: 200, timeoutMs: 2000 });
        const pass1 = this.collectDeepFields(root);

        // Pass 2: Verification Verify (React Guard)
        // Short sleep to catch immediate re-renders/unmounts
        await new Promise(r => setTimeout(r, 150));
        const pass2 = this.collectDeepFields(root);

        // Intersect & Deduplicate by Semantic Fingerprint
        return this.intersectAndDedupeFields(pass1, pass2, root);
    }

    /**
     * Recursive DOM Walker that pierces Shadow Roots and same-origin Iframes.
     */
    collectDeepFields(root, types = ['input', 'select', 'textarea', 'button']) {
        const WALKER_BUDGET = { MAX_NODES: 200000, MAX_TIME: 10000 };
        const ctx = { count: 0, start: performance.now() };
        const visited = new WeakSet();
        const processedNodes = new Set();
        const wantsInputs = types.includes('input');

        const walk = (node, depth) => {
            if (!node || visited.has(node) || depth > 20) return [];
            visited.add(node);

            const fields = [];
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT, null, false);
            let curr = walker.currentNode;

            while (curr) {
                ctx.count++;

                // Budget Check
                if (ctx.count > WALKER_BUDGET.MAX_NODES || (performance.now() - ctx.start > WALKER_BUDGET.MAX_TIME)) {
                    console.warn('[FormExtractor] Budget Exceeded');
                    return fields;
                }

                const tag = curr.tagName ? curr.tagName.toLowerCase() : '';

                if (processedNodes.has(curr)) {
                    curr = walker.nextNode();
                    continue;
                }

                let collected = false;

                // 1. Direct Type Match
                if (types.includes(tag)) {
                    if (this.isUsableField(curr)) collected = true;
                }
                // 2. ContentEditable
                else if (wantsInputs && (curr.isContentEditable || curr.getAttribute?.('contenteditable') === 'true')) {
                    if (this.isUsableField(curr)) collected = true;
                }
                // 3. Proxy Fallback (Virtual Input)
                else if (wantsInputs && (tag === 'div' || tag === 'span')) {
                    if (curr.getAttribute?.('role') === 'textbox' && !curr.querySelector('input, textarea, select')) {
                        if (this.isUsableField(curr)) collected = true;
                    }
                }

                if (collected) {
                    fields.push(curr);
                    processedNodes.add(curr);
                }

                // Piercing Layer
                if (curr.shadowRoot) {
                    fields.push(...walk(curr.shadowRoot, depth + 1));
                }
                if (tag === 'iframe') {
                    try {
                        const doc = curr.contentDocument || curr.contentWindow?.document;
                        if (doc && doc.body) fields.push(...walk(doc.body, depth + 1));
                    } catch (e) { /* cross-origin */ }
                }

                curr = walker.nextNode();
            }
            return fields;
        };

        return walk(root, 0);
    }

    /**
     * Intersect two passes and deduplicate by Semantic Fingerprint.
     */
    intersectAndDedupeFields(pass1, pass2, root) {
        const map2 = new Map();
        pass2.forEach(el => map2.set(this.getSemanticFingerprint(el), el));

        const resultNodes = [];
        const seen = new Set();

        pass1.forEach(el => {
            const fingerprint = this.getSemanticFingerprint(el);
            if (map2.has(fingerprint) && !seen.has(fingerprint)) {
                seen.add(fingerprint);
                resultNodes.push(map2.get(fingerprint));
            }
        });

        // Convert to Normalized Field Objects
        const fields = [];
        const processedGroups = new Set();

        resultNodes.forEach(node => {
            let type = node.type || node.tagName.toLowerCase();
            // Workday Custom Widget Type Promotion
            if (node.tagName === 'BUTTON' && node.getAttribute('aria-haspopup') === 'listbox') {
                type = 'select';
            }

            // Deduplication for Radio/Checkbox Groups
            if (['radio', 'checkbox'].includes(type)) {
                const groupKey = this.getGroupKey(node);
                if (processedGroups.has(groupKey)) return;
                processedGroups.add(groupKey);
            }

            const field = this.buildFieldObject(node, root);
            if (field) fields.push(field);
        });

        return fields;
    }

    buildFieldObject(element, container) {
        let type = (element.type || element.tagName).toLowerCase();
        // Workday Custom Widget Type Promotion
        if (element.tagName === 'BUTTON' && element.getAttribute('aria-haspopup') === 'listbox') {
            type = 'select';
        }
        const id = element.id || '';
        const name = element.name || id || `field_${this.fieldCounter++}`;

        // Selector Generation
        let selector = id ? `#${CSS.escape(id)}` : (element.name ? `[name="${CSS.escape(element.name)}"]` : `.${element.className.split(' ')[0] || element.tagName.toLowerCase()}`);
        if (['radio', 'checkbox'].includes(type) && element.name) {
            selector = `input[name="${CSS.escape(element.name)}"]`;
        }

        const field = {
            selector,
            name,
            id,
            type,
            label: this.extractLabel(element, container) || name,
            placeholder: element.placeholder || '',
            value: element.value || '',
            required: element.required || element.hasAttribute?.('required'),
            element: element
        };

        if (['select', 'select-one', 'select-multiple'].includes(type)) {
            field.options = this.extractOptions(element);
        } else if (['radio', 'checkbox'].includes(type)) {
            const { options, groupElements } = this.extractStructuredGroupData(element, container);
            field.options = options;
            field.groupElements = groupElements;
        }

        return field;
    }

    getSemanticFingerprint(el) {
        const label = this.extractLabel(el) || '';
        const normLabel = label.toLowerCase().replace(/[^a-z0-9]/g, '');
        const domPath = this.getStableDomPath(el, 3);
        return `${normLabel}|${el.name || ''}|${el.id || ''}|${domPath}`;
    }

    getStableDomPath(el, depth) {
        let path = '';
        let current = el.parentElement;
        let d = 0;
        while (current && d < depth && current.tagName !== 'BODY') {
            let seg = current.tagName.toLowerCase();
            if (current.id) seg += `#${current.id}`;
            else if (current.getAttribute('data-automation-id')) seg += `[data-automation-id="${current.getAttribute('data-automation-id')}"]`;
            else {
                const index = Array.from(current.parentElement?.children || []).indexOf(current);
                seg += `:nth-child(${index + 1})`;
            }
            path = `/${seg}${path}`;
            current = current.parentElement;
            d++;
        }
        return path;
    }

    getGroupKey(input) {
        if (input.name) return `name:${input.name}`;
        const wrapper = input.closest('.form-group, fieldset, tr, .radio-group, .checkbox-group, div[role="group"]');
        if (wrapper?.id) return `wrapper:${wrapper.id}`;
        return `element:${input.id || Math.random()}`;
    }

    isUsableField(el) {
        if (!el.isConnected) return false;

        // Buttons must have ARIA popup attributes to be considered fields
        if (el.tagName === 'BUTTON') {
            const isPopup = el.getAttribute('aria-haspopup') === 'listbox' || el.hasAttribute('aria-expanded');
            if (!isPopup) return false;
        }

        if (el.disabled || el.readOnly) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            if (el.value && el.value.trim().length > 0) return true;
            return false;
        }
        return true;
    }

    extractLabel(element, container = document) {
        if (typeof window.getFieldLabel === 'function') {
            const label = window.getFieldLabel(element);
            if (label && label !== 'Unknown Field' && label.length > 1) return label;
        }

        // Standard Label Search
        if (element.id) {
            const label = container.querySelector(`label[for="${element.id}"]`);
            if (label) return label.textContent.trim();
        }
        const parentLabel = element.closest('label');
        if (parentLabel) return parentLabel.textContent.trim();
        if (element.getAttribute('aria-label')) return element.getAttribute('aria-label');

        return element.placeholder || '';
    }

    extractOptions(selectElement) {
        return Array.from(selectElement.querySelectorAll('option'))
            .filter(opt => opt.value !== '' || !opt.textContent.match(/select|choose/i))
            .map(opt => ({ value: opt.value, text: opt.textContent.trim() }));
    }

    extractStructuredGroupData(element, container = document) {
        const type = element.type;
        const name = element.name;
        let group = [];
        if (name) group = Array.from(container.querySelectorAll(`input[type="${type}"][name="${CSS.escape(name)}"]`));
        if (group.length <= 1) {
            const wrapper = element.closest('.form-group, fieldset, tr, .radio-group, .checkbox-group, div[role="group"]');
            if (wrapper) group = Array.from(wrapper.querySelectorAll(`input[type="${type}"]`));
        }

        const options = [];
        const groupElements = [];
        group.forEach(input => {
            const label = this.extractOptionLabel(input, container);
            options.push({ value: input.value, text: label || input.value, selector: input.id ? `#${CSS.escape(input.id)}` : `input[value="${CSS.escape(input.value)}"]` });
            groupElements.push(input);
        });
        return { options, groupElements };
    }

    extractOptionLabel(input, container = document) {
        if (input.id) {
            const label = container.querySelector(`label[for="${input.id}"]`);
            if (label) return label.textContent.trim();
        }
        const parentLabel = input.closest('label');
        if (parentLabel) return parentLabel.textContent.trim();
        if (input.nextElementSibling?.tagName === 'LABEL') return input.nextElementSibling.textContent.trim();
        return '';
    }

    waitForDomStability({ root, idleMs, timeoutMs }) {
        return new Promise(resolve => {
            let timer;
            const observer = new MutationObserver((mutations) => {
                const isMeaningful = mutations.some(m => m.addedNodes.length > 0 || m.removedNodes.length > 0);
                if (isMeaningful) {
                    clearTimeout(timer);
                    timer = setTimeout(done, idleMs);
                }
            });
            observer.observe(root, { childList: true, subtree: true });
            const maxTimer = setTimeout(done, timeoutMs);
            function done() {
                observer.disconnect();
                clearTimeout(timer);
                clearTimeout(maxTimer);
                resolve();
            }
            timer = setTimeout(done, idleMs);
        });
    }
}

// Export
if (typeof window !== 'undefined') window.FormExtractor = FormExtractor;
if (typeof module !== 'undefined' && module.exports) module.exports = FormExtractor;
