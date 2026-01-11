/**
 * StateManager
 * Tracks the lifecycle processing state of every form field.
 * Prevents race conditions and double-filling.
 */

class StateManager {
    constructor() {
        // Map<selector, { state, value, source, timestamp, error }>
        this.fieldStates = new Map();
        this.listeners = new Set();

        // Enum for field states
        this.STATES = {
            IDLE: 'idle',           // Detected, not processed
            ANALYZING: 'analyzing', // Being classified/routed
            QUEUED: 'queued',       // In ActionQueue waiting to be filled
            FILLING: 'filling',     // Currently typing/selecting
            VERIFYING: 'verifying', // Checking if fill stuck
            COMPLETED: 'completed', // Successfully filled
            FAILED: 'failed',       // Error encountered
            SKIPPED: 'skipped'      // Intentional skip
        };
    }

    /**
     * Initialize/Reset for a new page load
     */
    reset() {
        this.fieldStates.clear();
        this.notify('RESET', null);
    }

    /**
     * Register a field or update its state
     * @param {string} selector 
     * @param {string} state - One of this.STATES
     * @param {object} meta - Optional metadata { value, source, error }
     */
    updateState(selector, state, meta = {}) {
        if (!Object.values(this.STATES).includes(state)) {
            console.error(`[StateManager] Invalid state "${state}" for ${selector}`);
            return;
        }

        const current = this.fieldStates.get(selector) || {};
        const newState = {
            selector,
            state,
            timestamp: Date.now(),
            value: meta.value !== undefined ? meta.value : current.value,
            source: meta.source || current.source,
            error: meta.error || null
        };

        this.fieldStates.set(selector, newState);

        // Emit event
        this.notify(state, newState);

        // Debug Log
        if (state === this.STATES.FAILED) {
            console.warn(`[StateManager] ❌ ${selector} -> FAILED:`, meta.error);
        } else if (state === this.STATES.COMPLETED) {
            // console.log(`[StateManager] ✅ ${selector} -> COMPLETED`);
        }
    }

    /**
     * Get current state of a field
     */
    getState(selector) {
        return this.fieldStates.get(selector) || { state: this.STATES.IDLE };
    }

    /**
     * Check if field is busy (processing)
     */
    isBusy(selector) {
        const s = this.getState(selector).state;
        return [this.STATES.ANALYZING, this.STATES.QUEUED, this.STATES.FILLING, this.STATES.VERIFYING].includes(s);
    }

    /**
     * Subscribe to state changes
     */
    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    notify(event, data) {
        for (const listener of this.listeners) {
            try {
                listener(event, data);
            } catch (e) {
                console.error('[StateManager] Listener error:', e);
            }
        }
    }

    /**
     * Get all fields in a specific state
     */
    getFieldsByState(state) {
        const result = [];
        for (const [sel, data] of this.fieldStates.entries()) {
            if (data.state === state) result.push(data);
        }
        return result;
    }
}

// Export
if (typeof window !== 'undefined') {
    window.StateManager = StateManager;
}
