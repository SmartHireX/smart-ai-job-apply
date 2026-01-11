/**
 * ActionQueue
 * Manages DOM interactions to ensure smooth, human-like cadence
 * and prevents race conditions during parallel execution.
 */

class ActionQueue {
    constructor() {
        // Queue items: { id, fn, selector, priority }
        this.queue = [];
        this.isProcessing = false;
        this.paused = false;

        // Configurable timings (ms)
        this.delays = {
            base: 50,      // Minimum gap between actions
            variance: 30,  // Random jitter
            typing: 10     // Delay per keystroke (simulated)
        };

        this.stateManager = null;
    }

    /**
     * Initialize with StateManager reference
     */
    init(stateManager) {
        this.stateManager = stateManager;
    }

    /**
     * Add an action to the queue
     * @param {Function} actionFn - Async function to execute
     * @param {string} selector - Target field selector
     * @param {number} priority - Higher runs first (default 1)
     */
    enqueue(actionFn, selector, priority = 1) {
        this.queue.push({
            id: Date.now() + Math.random(),
            fn: actionFn,
            selector: selector,
            priority: priority,
            addedAt: Date.now()
        });

        // Update state to QUEUED
        if (this.stateManager && selector) {
            this.stateManager.updateState(selector, 'queued');
        }

        // Sort by Priority (Desc) -> Then by Time (FIFO)
        this.queue.sort((a, b) => {
            if (b.priority !== a.priority) return b.priority - a.priority;
            return a.addedAt - b.addedAt;
        });

        if (!this.isProcessing) {
            this.process();
        }
    }

    /**
     * Main processing loop
     */
    async process() {
        if (this.isProcessing || this.paused) return;
        this.isProcessing = true;

        while (this.queue.length > 0 && !this.paused) {
            const item = this.queue.shift();
            const { fn, selector } = item;

            try {
                // Update State -> FILLING
                if (this.stateManager && selector) {
                    this.stateManager.updateState(selector, 'filling');
                }

                // Execute Action
                await fn();

                // Update State -> VERIFYING (Or Completed if verification skipped)
                // Note: The actionFn itself might update state to COMPLETED.
                // But generally Orchestrator handles completion logic. 
                // We'll let the caller verify.

            } catch (error) {
                console.error(`[ActionQueue] Action failed for ${selector}:`, error);
                if (this.stateManager && selector) {
                    this.stateManager.updateState(selector, 'failed', { error: error.message });
                }
            }

            // Human-like Delay
            const delay = this.delays.base + Math.random() * this.delays.variance;
            await new Promise(r => setTimeout(r, delay));
        }

        this.isProcessing = false;
    }

    /**
     * Clear all pending actions
     */
    clear() {
        this.queue = [];
        this.isProcessing = false;
    }
}

// Export
if (typeof window !== 'undefined') {
    window.ActionQueue = ActionQueue;
}
