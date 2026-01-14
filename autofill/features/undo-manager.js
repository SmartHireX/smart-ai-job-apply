/**
 * undo-manager.js
 * Manages undo/redo state and operations for form fills
 */


/**
 * Undo Manager
 * Handles form fill history and undo operations
 */
class UndoManager {
    static history = [];

    /**
     * Capture field state and add to history
     * @param {HTMLElement} element - Field element
     */
    static capture(element) {
        const state = FieldUtils.captureFieldState(element);
        this.history.push(state);
    }

    /**
     * Capture multiple fields
     * @param {Array<HTMLElement>} elements - Array of field elements
     */
    static captureMultiple(elements) {
        elements.forEach(element => this.capture(element));
    }

    /**
     * Undo all form fills
     * @returns {Object} Result object with success status
     */
    static undo() {
        if (this.history.length === 0) {
            return {
                success: false,
                message: 'No history to undo'
            };
        }

        // console.log(`🔄 Reverting ${this.history.length} fields...`);

        this.history.forEach(state => {
            FieldUtils.restoreFieldState(state);
        });

        this.clear();

        // Show toast notification (if available)
        if (typeof window.showUndoToast === 'function') {
            window.showUndoToast();
        }

        return {
            success: true,
            message: `Reverted ${this.history.length} fields`
        };
    }

    /**
     * Clear undo history
     */
    static clear() {
        this.history = [];
        // console.log('🗑️ Undo history cleared');
    }

    /**
     * Check if undo is available
     * @returns {boolean} True if history exists
     */
    static hasHistory() {
        return this.history.length > 0;
    }

    /**
     * Get history count
     * @returns {number} Number of captured states
     */
    static getHistoryCount() {
        return this.history.length;
    }

    /**
     * Get history snapshot
     * @returns {Array} Copy of history array
     */
    static getHistory() {
        return [...this.history];
    }

    /**
     * Reset to a specific state
     * @param {Array} newHistory - New history array
     */
    static setHistory(newHistory) {
        this.history = newHistory || [];
    }
}

// Global export for backward compatibility
window.UndoManager = UndoManager;
window.undoFormFill = UndoManager.undo.bind(UndoManager);
window.activeFormUndoHistory = UndoManager.history;

// Export for module usage
const {
    capture,
    captureMultiple,
    undo,
    clear,
    hasHistory,
    getHistoryCount
} = UndoManager;
