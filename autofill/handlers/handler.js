/**
 * Base Handler Class
 * Interface for all field handlers
 */
class Handler {
    constructor(name) {
        this.name = name;
    }

    /**
     * Check if this handler can process the given field
     * @param {Object} field 
     * @returns {Boolean}
     */
    canHandle(field) {
        return false;
    }

    /**
     * Process a batch of fields
     * @param {Array} fields 
     * @param {Object} context (resume, memory, etc.)
     * @returns {Promise<Object>} { selector: { value, confidence, source } }
     */
    async handle(fields, context) {
        throw new Error('handle() must be implemented');
    }
}

// Export
if (typeof window !== 'undefined') {
    window.Handler = Handler;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Handler;
}
