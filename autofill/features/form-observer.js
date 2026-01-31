/**
 * form-observer.js
 * Listens for manual user interactions and updates the cache (Auto-Learning).
 */

class FormObserver {
    constructor() {
        this.handleChange = this.handleChange.bind(this);
        this.handleInputDebounced = this.handleInputDebounced.bind(this); // Fix: Bind once
        this.isListening = false;
        this.isPaused = false;
    }

    start() {
        if (this.isListening) return;
        document.addEventListener('change', this.handleChange, true);
        document.addEventListener('input', this.handleInputDebounced, true);
        this.isListening = true;
        this.isPaused = false;
    }

    pause() {
        this.isPaused = true;
        // console.log('⏸️ [FormObserver] Paused');
    }

    resume() {
        this.isPaused = false;
        // console.log('▶️ [FormObserver] Resumed');
    }

    async handleChange(event) {
        if (this.isPaused) return; // Respect pause state
        const target = event.target;
        if (!this.isValidTarget(target)) return;

        // console.log('📝 [FormObserver] User changed field:', target.name || target.id);

        await this.updateCache(target);
    }

    // Debounce input events to avoid thrashing cache on every keystroke
    handleInputDebounced(event) {
        if (this.isPaused) return; // Respect pause state
        const target = event.target;
        if (!this.isValidTarget(target)) return;

        if (target._debounceTimer) clearTimeout(target._debounceTimer);
        target._debounceTimer = setTimeout(() => {
            if (this.isPaused) return; // Double check in case paused during wait
            this.handleChange(event);
        }, 1000);
    }

    isValidTarget(element) {
        if (!element) return false;
        const tag = element.tagName.toLowerCase();
        const type = (element.type || '').toLowerCase();

        // Filter out irrelevant elements
        if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') return false;
        if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'password') return false;

        return true;
    }

    async updateCache(element) {
        if (!window.InteractionLog) return;

        let val = element.value;
        const type = (element.type || '').toLowerCase();

        // NORMALIZATION: If value is generic 'on', try to find a label
        if (type === 'radio' || type === 'checkbox') {
            if (val === 'on' || val === 'true') {
                if (window.getOptionLabelText) {
                    val = window.getOptionLabelText(element) || val;
                }
            }
        }

        // Construct a field-like object for the logger
        const field = {
            element: element,
            name: element.name,
            id: element.id,
            type: type,
            label: this.getLabel(element),
            value: val,
            // Try to recover attributes set by Pipeline
            cache_label: element.getAttribute('cache_label'),
            instance_type: element.getAttribute('instance_type'),
            field_index: this.getFieldIndex(element)
        };

        // If IndexingService is available, let it refine the index
        if (field.field_index === null && window.IndexingService) {
            // Re-detect index if missing
            // This happens if the user interacts with a field that wasn't processed by the pipeline yet?
            // Or if we are relying on fresh detection.
        }

        // Send to InteractionLog
        // console.log('💾 [FormObserver] Caching manual entry:', field.cache_label || field.name, field.value);
        await window.InteractionLog.cacheSelection(field, field.label, field.value);
    }

    getLabel(element) {
        if (window.getFieldLabel) return window.getFieldLabel(element);

        // Fallback checks
        if (element.labels && element.labels.length > 0) return element.labels[0].innerText;
        return element.getAttribute('aria-label') || element.name;
    }

    getFieldIndex(element) {
        // Pipeline might have stored it? No, we don't store index on DOM usually.
        // We rely on IndexingService or Parsing.
        if (window.IndexingService) {
            // We can try to re-parse the name
            return window.IndexingService.detectIndexFromAttribute({ name: element.name, id: element.id });
        }
        return null; // Let InteractionLog handle fallback
    }
}

// Global Export
if (typeof window !== 'undefined') {
    window.FormObserver = new FormObserver();
    console.log('👁️ [FormObserver] Instance created and exposed to window');
}
