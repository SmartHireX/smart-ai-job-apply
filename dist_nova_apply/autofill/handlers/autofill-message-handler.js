/**
 * form-handler.js
 * Handles DETECT_FORMS and START_LOCAL_PROCESSING messages
 */


/**
 * Form Handler
 * Handles form detection and processing requests
 */
class FormHandler {
    /**
     * Handle form-related messages
     * @param {Object} message - Message object
     * @param {Object} sender - Sender information
     * @param {Function} sendResponse - Response callback
     * @returns {boolean} True if async response
     */
    static handle(message, sender, sendResponse) {
        // Safe access to message types
        const TYPES = window.NovaConstants ? window.NovaConstants.MESSAGE_TYPES : (window.MESSAGE_TYPES || {});

        // Handle DETECT_FORMS
        if (message.type === TYPES.DETECT_FORMS || message.type === 'DETECT_FORMS') {
            return this.handleDetectForms(message, sender, sendResponse);
        }

        // Handle START_LOCAL_PROCESSING
        if (message.type === TYPES.START_LOCAL_PROCESSING || message.type === 'START_LOCAL_PROCESSING') {
            return this.handleStartProcessing(message, sender, sendResponse);
        }

        return false;
    }

    /**
     * Handle DETECT_FORMS message
     * @param {Object} message - Message object
     * @param {Object} sender - Sender information
     * @param {Function} sendResponse - Response callback
     * @returns {boolean} True if async response
     */
    static handleDetectForms(message, sender, sendResponse) {
        // Detect forms (async or sync)
        const result = this.detectForms();

        // Handle Promise (Async Detection)
        if (result && typeof result.then === 'function') {
            result.then(forms => {
                const count = Array.isArray(forms) ? forms.length : (forms ? 1 : 0);
                sendResponse({ formCount: count });
            }).catch(err => {
                console.error('Detection failed:', err);
                sendResponse({ formCount: 0 });
            });
            return true; // Keep channel open
        }

        // Handle Synchronous Result (Legacy)
        const count = Array.isArray(result) ? result.length : 0;
        sendResponse({ formCount: count });
        return true; // Keep channel open for consistency? No, sync returning true is fine if we sendResponse immediately.
        // Actually, for sync we can just return true and sendResponse.
    }

    /**
     * Handle START_LOCAL_PROCESSING message
     * @param {Object} message - Message object
     * @param {Object} sender - Sender information
     * @param {Function} sendResponse - Response callback
     * @returns {boolean} False (no async response)
     */
    static handleStartProcessing(message, sender, sendResponse) {
        // Trigger form processing (will be wired to FormProcessor)
        if (window.FormProcessor && window.FormProcessor.process) {
            window.FormProcessor.process();
        } else if (typeof window.processPageFormLocal === 'function') {
            // Fallback to legacy function
            window.processPageFormLocal();
        } else {
            console.error('❌ Form processor not available');
        }

        return true;
    }

    /**
     * Detect forms on the page
     * @returns {Array<HTMLFormElement>} Array of form elements
     */
    static detectForms() {
        if (typeof window.detectForms === 'function') {
            return window.detectForms();
        }

        // Fallback: basic form detection
        return Array.from(document.querySelectorAll('form'));
    }

    /**
     * Get form count
     * @returns {number} Number of forms on page
     */
    static getFormCount() {
        const forms = this.detectForms();
        return forms.length;
    }

    /**
     * Check if page has forms
     * @returns {boolean} True if forms exist
     */
    static hasForms() {
        return this.getFormCount() > 0;
    }
}

// Global export for backward compatibility
window.FormHandler = FormHandler;
FormHandler;
