/**
 * Base Handler Class
 * Interface for all field handlers in the Pipeline Architecture
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
     * Process a batch of fields execution
     * @param {Array} fields 
     * @param {Object} context (resume, memory, etc.)
     * @returns {Promise<Object>} Map of { selector: { value, confidence, source, trace } }
     */
    async handle(fields, context) {
        throw new Error('handle() must be implemented');
    }

    /**
     * Create a standardized success trace
     */
    createTrace(step, confidence, meta = {}) {
        return {
            handler: this.name,
            step: step,
            confidence: confidence,
            timestamp: Date.now(),
            ...meta
        };
    }
}

// Export
if (typeof window !== 'undefined') {
    window.Handler = Handler;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Handler;
}
