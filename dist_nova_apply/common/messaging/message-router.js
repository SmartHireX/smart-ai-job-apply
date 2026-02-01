/**
 * message-router.js
 * Central message dispatcher with handler registration
 */


/**
 * Message Router
 * Routes incoming messages to appropriate handlers
 */
class MessageRouter {
    static handlers = [];
    static isRegistered = false;

    /**
     * Register all message handlers
     */
    static registerHandlers() {
        if (this.isRegistered) {
            console.warn('⚠️ Message handlers already registered');
            return;
        }

        // Register handlers in priority order
        this.handlers = [
            FormHandler,
            UndoHandler
        ];

        // Setup chrome message listener
        chrome.runtime.onMessage.addListener(this.routeMessage.bind(this));

        this.isRegistered = true;
        // // console.log('✅ Message router registered');
    }

    /**
     * Route message to appropriate handler
     * @param {Object} message - Incoming message
     * @param {Object} sender - Sender information
     * @param {Function} sendResponse - Response callback
     * @returns {boolean} True if async response expected
     */
    static routeMessage(message, sender, sendResponse) {
        if (!message || !message.type) {
            console.warn('⚠️ Invalid message received:', message);
            return false;
        }

        // // console.log(`📨 Routing message: ${message.type}`);

        // Try each handler in order
        for (const handler of this.handlers) {
            try {
                const handled = handler.handle(message, sender, sendResponse);

                if (handled) {
                    // // console.log(`✅ Message handled by ${handler.name}`);
                    return handled;
                }
            } catch (error) {
                console.error(`❌ Handler ${handler.name} error:`, error);
            }
        }

        console.warn(`⚠️ No handler found for message type: ${message.type}`);
        return false;
    }

    /**
     * Add a custom handler
     * @param {Object} handler - Handler object with handle() method
     */
    static addHandler(handler) {
        if (!handler || typeof handler.handle !== 'function') {
            console.error('❌ Invalid handler:', handler);
            return;
        }

        this.handlers.push(handler);
        // // console.log(`✅ Added custom handler: ${handler.name || 'Anonymous'}`);
    }

    /**
     * Remove a handler
     * @param {Object} handler - Handler to remove
     */
    static removeHandler(handler) {
        const index = this.handlers.indexOf(handler);
        if (index > -1) {
            this.handlers.splice(index, 1);
            // // console.log(`✅ Removed handler: ${handler.name || 'Anonymous'}`);
        }
    }

    /**
     * Clear all handlers
     */
    static clearHandlers() {
        this.handlers = [];
        // // console.log('🗑️ All handlers cleared');
    }

    /**
     * Get registered handlers
     * @returns {Array} Array of handler objects
     */
    static getHandlers() {
        return [...this.handlers];
    }

    /**
     * Check if router is registered
     * @returns {boolean} True if registered
     */
    static isActive() {
        return this.isRegistered;
    }
}

// Global export for backward compatibility
window.MessageRouter = MessageRouter;

// Export for module usage
MessageRouter;
