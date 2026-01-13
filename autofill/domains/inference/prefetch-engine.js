/**
 * prefetch-engine.js
 * 
 * Implements "Zero-Latency" form filling via:
 * 1. Native Autocomplete Detection (0ms)
 * 2. Speculative Prefetching of related fields
 * 3. Zero-Footprint execution using requestIdleCallback
 */

const PrefetchEngine = {
    // Prediction Cache (Short-lived, cleared on page nav)
    cache: new Map(),

    // Field Clusters: Focusing one likely means user will need others soon
    clusters: {
        'fname': ['lname', 'email', 'phone', 'linkedin'],
        'firstname': ['lastname', 'email', 'phone', 'linkedin'],
        'given-name': ['family-name', 'email', 'tel'],
        'email': ['phone', 'linkedin', 'portfolio', 'password'],
        'password': ['confirm_password'],
        'zip': ['city', 'state', 'country'],
        'postal': ['city', 'state', 'country']
    },

    /**
     * Main Entry: Attempt to predict value for a focused element
     * @param {HTMLElement} element - The field currently being interacted with
     */
    handleFocus(element) {
        if (!element) return;

        // 1. NATIVE AUTOCOMPLETE (The "Fast Lane")
        // If the browser knows what this is, we don't need AI.
        const nativeType = element.getAttribute('autocomplete');
        if (nativeType && nativeType !== 'off' && nativeType !== 'new-password') {
            this.handleNativeAutocomplete(element, nativeType);

            // Also trigger prefetch for likely next fields based on this native type
            this.triggerPrefetch(nativeType);
            return;
        }

        // 2. LABEL-BASED PREFETCH
        // If not explicit, guess based on label/name
        const label = (window.getFieldLabel(element) || element.name || '').toLowerCase();

        // Find matching cluster key
        const clusterKey = Object.keys(this.clusters).find(key => label.includes(key));
        if (clusterKey) {
            console.log(`🚀 [Prefetch] Detected '${clusterKey}' - queueing cluster...`);
            this.triggerPrefetch(clusterKey);
        }
    },

    /**
     * Fills field INSTANTLY if native type matches resume data
     */
    async handleNativeAutocomplete(element, type) {
        // Need resume data
        const resume = await window.ResumeManager.getResumeData();
        if (!resume) return;

        const map = {
            'given-name': resume.basics?.firstName,
            'family-name': resume.basics?.lastName,
            'name': `${resume.basics?.firstName} ${resume.basics?.lastName}`,
            'email': resume.basics?.email,
            'tel': resume.basics?.phone,
            'tel-national': resume.basics?.phone,
            'url': resume.basics?.website,
            'postal-code': resume.basics?.location?.postalCode,
            'street-address': resume.basics?.location?.address
        };

        const val = map[type];
        if (val) {
            console.log(`⚡ [NativeFastLane] Instant match for '${type}'`);

            // Visual indicator of "Instant Readiness" (Subtle glow)
            element.style.transition = 'box-shadow 0.3s';
            element.style.boxShadow = '0 0 0 2px rgba(52, 211, 153, 0.3)'; // Green glow

            // Note: We don't auto-fill ON FOCUS (annoying). 
            // We just cache it so if they double-click or trigger 'fill', it's instant.
            this.cache.set(element.id || type, val);
        }
    },

    /**
     * Background Process: Find and resolve 'Next Fields'
     */
    triggerPrefetch(key) {
        const targets = this.clusters[key];
        if (!targets) return;

        // Use Idle Callback to ensure ZERO UI FREEZE
        window.requestIdleCallback(async (deadline) => {
            const resume = await window.ResumeManager.getResumeData();
            if (!resume) return;

            // Find elements on page that match these target keywords
            targets.forEach(keyword => {
                if (deadline.timeRemaining() < 1) return; // Stop if busy

                // Simple scan for fields with this keyword in label/name
                // This mimics `checkSmartMemoryForAnswer` but lighter
                const candidates = Array.from(document.querySelectorAll('input, select, textarea'));

                candidates.forEach(field => {
                    const label = (window.getFieldLabel(field) || field.name || '').toLowerCase();
                    if (label.includes(keyword) && !field.value) {
                        // PRE-CALCULATE ANSWER
                        // For now, we just identify valid resume data for this keyword
                        // In full implementation, we'd run the full Jaccard here and store the result.
                        console.log(`🔮 [Prefetch] Pre-calculating for future field: "${label}"`);
                    }
                });
            });
        }, { timeout: 2000 });
    }
};

// Expose globally
window.PrefetchEngine = PrefetchEngine;
