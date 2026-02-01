/**
 * undo-handler.js
 * Handles UNDO_FILL messages
 */


/**
 * Undo Handler
 * Handles form fill undo requests
 */
class UndoHandler {
    /**
     * Handle UNDO_FILL message
     * @param {Object} message - Message object
     * @param {Object} sender - Sender information
     * @param {Function} sendResponse - Response callback
     * @returns {boolean} True if async response
     */
    static handle(message, sender, sendResponse) {
        if (message.type !== MESSAGE_TYPES.UNDO_FILL) {
            return false;
        }

        const result = UndoManager.undo();
        sendResponse(result);

        return true;
    }

    /**
     * Check if undo is available
     * @returns {boolean} True if undo history exists
     */
    static isUndoAvailable() {
        return UndoManager.hasHistory();
    }

    /**
     * Get undo history count
     * @returns {number} Number of fields in history
     */
    static getUndoCount() {
        return UndoManager.getHistoryCount();
    }
}

UndoHandler;
