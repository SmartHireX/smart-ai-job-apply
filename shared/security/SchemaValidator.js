/**
 * SchemaValidator.js
 * 
 * Lightweight schema validation for specific data types.
 * Designed to be used by VaultMiddleware to reject malformed data.
 */

const SchemaValidator = {
    /**
     * Validate Resume Data Structure
     * @param {Object} data 
     * @returns {{valid: boolean, error?: string}}
     */
    validateResume(data) {
        if (!data || typeof data !== 'object') {
            return { valid: false, error: 'Resume data must be an object' };
        }

        // 1. Personal Info Validation
        if (data.personal) {
            if (data.personal.email && !this._isValidEmail(data.personal.email)) {
                return { valid: false, error: 'Invalid email format' };
            }
            // Add more constraints as needed
        }

        // 2. Experience Validation
        if (Array.isArray(data.experience)) {
            for (let i = 0; i < data.experience.length; i++) {
                const exp = data.experience[i];
                if (!exp.company || typeof exp.company !== 'string') {
                    return { valid: false, error: `Experience item ${i}: Missing company name` };
                }
                if (exp.startDate && !this._isValidDateString(exp.startDate)) {
                    return { valid: false, error: `Experience item ${i}: Invalid start date format (YYYY-MM)` };
                }
            }
        }

        return { valid: true };
    },

    /**
     * Helper: Simple Regex Email Validation
     */
    _isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    },

    /**
     * Helper: Validate YYYY or YYYY-MM
     */
    _isValidDateString(dateStr) {
        // Allow empty string as "not set"
        if (!dateStr) return true;
        // YYYY or YYYY-MM
        return /^\d{4}(-\d{2})?$/.test(dateStr);
    }
};

// Global Export
if (typeof window !== 'undefined') {
    window.SchemaValidator = SchemaValidator;
}
