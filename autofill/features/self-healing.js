/**
 * self-healing.js
 * Watches for SPA re-renders and automatically re-fills detached fields
 */


/**
 * Self-Healing Observer
 * Monitors DOM mutations and re-fills fields that get detached by SPA re-renders
 */
class SelfHealing {
    static observer = null;
    static healedFields = new Set();
    static isActive = false;

    /**
     * Start the self-healing observer
     */
    static start() {
        if (this.isActive) {
            console.warn('⚠️ Self-Healing already active');
            return;
        }

        // console.log('🛡️ Starting Self-Healing Observer...');

        this.observer = new MutationObserver((mutations) => {
            this.handleMutations(mutations);
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        this.isActive = true;
    }

    /**
     * Handle DOM mutations
     * @param {Array<MutationRecord>} mutations - Array of mutations
     */
    static handleMutations(mutations) {
        // Debounce to avoid excessive processing
        if (this.observer.timeout) {
            clearTimeout(this.observer.timeout);
        }

        this.observer.timeout = setTimeout(() => {
            this.checkAndHealFields();
        }, BATCH_CONFIG.MUTATION_DEBOUNCE_MS);
    }

    /**
     * Check history for detached fields and attempt to heal them
     */
    static checkAndHealFields() {
        const history = UndoManager.getHistory();

        history.forEach((historyItem, index) => {
            // Check if original element is still connected
            if (FieldUtils.isConnected(historyItem.element)) {
                return; // Still there, all good
            }

            // Element is gone! Try to find its replacement
            const newElement = this.findReplacement(historyItem.element);

            if (newElement && FieldUtils.isFieldVisible(newElement)) {
                this.healField(newElement, historyItem);

                // Update history to point to new element
                historyItem.element = newElement;
            }
        });
    }

    /**
     * Find a replacement element for a detached field
     * @param {HTMLElement} originalElement - Original detached element
     * @returns {HTMLElement|null} Replacement element or null
     */
    static findReplacement(originalElement) {
        let newElement = null;

        // Try ID match
        if (originalElement.id) {
            newElement = document.getElementById(originalElement.id);
        }

        // Try name match
        if (!newElement && originalElement.name) {
            try {
                newElement = document.querySelector(
                    `[name="${CSS.escape(originalElement.name)}"]`
                );
            } catch (error) {
                console.warn('Name selector failed:', error);
            }
        }

        return newElement;
    }

    /**
     * Heal a field by re-applying its value
     * @param {HTMLElement} element - New element
     * @param {Object} historyItem - Original field state
     */
    static healField(element, historyItem) {
        // Check if we should heal (don't over-heal)
        const currentValue = historyItem.isCheckbox ? element.checked : element.value;

        if (currentValue === historyItem.value) {
            return; // Already has correct value
        }

        // console.log(`❤️‍🩹 Self-Healing: Re-filling ${element.name || element.id}`);

        // Re-apply value
        if (historyItem.isCheckbox) {
            element.checked = historyItem.value;
        } else {
            FieldUtils.setNativeValue(element, historyItem.value);
        }

        // Trigger change events
        FieldUtils.dispatchChangeEvents(element);

        // Re-attach self-correction listener if available
        if (typeof window.attachSelfCorrectionTrigger === 'function') {
            window.attachSelfCorrectionTrigger(element);
        }

        // Track healed fields
        const healKey = element.id || element.name || 'unknown';
        this.healedFields.add(healKey);
    }

    /**
     * Stop the self-healing observer
     */
    static stop() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
            this.isActive = false;
            // console.log('🛡️ Self-Healing Observer stopped');
        }
    }

    /**
     * Check if self-healing is active
     * @returns {boolean} True if active
     */
    static isRunning() {
        return this.isActive;
    }

    /**
     * Get statistics
     * @returns {Object} Stats object
     */
    static getStats() {
        return {
            isActive: this.isActive,
            healedCount: this.healedFields.size,
            healedFields: Array.from(this.healedFields)
        };
    }

    /**
     * Reset statistics
     */
    static resetStats() {
        this.healedFields.clear();
    }
}

// Global export for backward compatibility
window.attachSelfHealingObserver = SelfHealing.start.bind(SelfHealing);

// Export for module usage
const {
    start,
    stop,
    isRunning,
    getStats,
    resetStats
} = SelfHealing;
