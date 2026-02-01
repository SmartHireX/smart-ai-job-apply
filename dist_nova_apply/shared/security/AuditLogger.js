/**
 * AuditLogger.js
 * 
 * Enterprise-grade, tamper-evident audit logging for the StorageVault.
 * Implements a ring buffer with cryptographic hash chaining to prove integrity.
 */

const LOG_CONFIG = {
    MAX_EVENTS: 50,
    BUCKET: 'audit_log',
    KEY: 'events'
};

class AuditLogger {
    constructor(vault) {
        this.vault = vault;
    }

    /**
     * Log a security-critical event
     * @param {string} eventType - e.g., 'KEY_ADDED', 'RESUME_UPDATED'
     * @param {Object} metadata - Context (e.g., keyID, section changed)
     * @param {string} [severity='INFO'] - 'INFO' | 'WARNING' | 'ALERT'
     */
    async log(eventType, metadata = {}, severity = 'INFO') {
        const bucket = this.vault.bucket(LOG_CONFIG.BUCKET);
        const logData = await bucket.get(LOG_CONFIG.KEY) || { events: [], lastHash: null };

        const timestamp = new Date().toISOString();
        const prevHash = logData.lastHash || 'GENESIS_HASH';

        // Construct payload for hashing
        const payload = JSON.stringify({
            timestamp,
            eventType,
            metadata,
            prevHash
        });

        // Compute SHA-256 hash (simulated here using WebCrypto if available, or simple hash for sync context)
        // In a real extension, we use crypto.subtle.digest
        const hash = await this._computeHash(payload);

        const newEntry = {
            id: this._generateId(),
            timestamp,
            eventType,
            severity,
            metadata,
            hash,
            prevHash
        };

        // Ring Buffer: Append and Rotate
        logData.events.push(newEntry);
        if (logData.events.length > LOG_CONFIG.MAX_EVENTS) {
            logData.events.shift(); // Remove oldest
        }

        logData.lastHash = hash;

        await bucket.set(LOG_CONFIG.KEY, logData);

        if (severity === 'ALERT') {
            console.error('[SECURITY ALERT]', eventType, metadata);
        }
    }

    async _computeHash(message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    _generateId() {
        return Math.random().toString(36).substring(2, 15);
    }

    /**
     * Verify the integrity of the audit log
     * @returns {Promise<boolean>}
     */
    async verifyIntegrity() {
        const bucket = this.vault.bucket(LOG_CONFIG.BUCKET);
        const logData = await bucket.get(LOG_CONFIG.KEY);

        if (!logData || logData.events.length === 0) return true;

        let prevHash = 'GENESIS_HASH';

        // If ring buffer has rotated, we might not have the true genesis of the *current* chain 
        // in memory unless we stored the hash of the evicted item. 
        // For strict chaining, we'd need to store the 'anchor hash' of the start of the buffer.
        // For this V1 implementation, we verify internal consistency of the visible buffer.

        if (logData.events.length > 0) {
            prevHash = logData.events[0].prevHash;
        }

        for (const entry of logData.events) {
            if (entry.prevHash !== prevHash) {
                console.error(`[Audit Failure] Broken chain at ${entry.id}. Expected ${prevHash}, got ${entry.prevHash}`);
                return false;
            }

            const payload = JSON.stringify({
                timestamp: entry.timestamp,
                eventType: entry.eventType,
                metadata: entry.metadata,
                prevHash: entry.prevHash
            });

            const computedHash = await this._computeHash(payload);
            if (computedHash !== entry.hash) {
                console.error(`[Audit Failure] Hash mismatch at ${entry.id}`);
                return false;
            }

            prevHash = entry.hash;
        }

        return true;
    }
}

// Global Export
if (typeof window !== 'undefined') {
    window.AuditLogger = AuditLogger;
}
