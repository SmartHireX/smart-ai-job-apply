/**
 * VaultMiddleware.js
 * 
 * Interceptor layer for StorageVault.
 * Connects StorageVault operations to AuditLogger and SchemaValidator.
 */

class VaultMiddleware {
    constructor(vault) {
        this.vault = vault;
        this.auditLogger = new AuditLogger(vault);
        this.validators = new Map(); // bucket -> validatorFn
    }

    /**
     * Register a schema validator for a specific bucket
     * @param {string} bucket 
     * @param {Function} validatorFn - (data) => { valid: true } or { valid: false, error: '...' }
     */
    registerValidator(bucket, validatorFn) {
        this.validators.set(bucket, validatorFn);
    }

    /**
     * Intercept a WRITE operation
     * @param {string} bucket 
     * @param {string} key 
     * @param {any} value 
     * @returns {Promise<any>} The value to be saved (possibly transformed)
     */
    async onBeforeWrite(bucket, key, value) {
        // 1. Schema Validation
        if (this.validators.has(bucket)) {
            const result = this.validators.get(bucket)(value);
            if (!result.valid) {
                await this.auditLogger.log('SCHEMA_VIOLATION', { bucket, key, error: result.error }, 'WARNING');
                throw new Error(`[Schema Violation] ${bucket}:${key} - ${result.error}`);
            }
        }

        // 2. Audit Logging (Specific Triggers)
        if (bucket === 'ai' && key === 'keys') {
            await this.auditLogger.log('KEY_ADDED', { count: Array.isArray(value) ? value.length : 1 }, 'INFO');
        }

        if (bucket === 'identity' && key === 'resumeData') {
            // Basic heuristic to detect significant updates
            await this.auditLogger.log('RESUME_UPDATED', { size: JSON.stringify(value).length }, 'INFO');
        }

        return value;
    }
}

if (typeof window !== 'undefined') {
    window.VaultMiddleware = VaultMiddleware;
}
