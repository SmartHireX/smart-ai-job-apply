/**
 * chat-handler.js
 * Handles TOGGLE_CHAT messages
 */


/**
 * Chat Handler  
 * Handles chat interface toggle requests
 */
class ChatHandler {
    /**
     * Handle TOGGLE_CHAT message
     * @param {Object} message - Message object
     * @param {Object} sender - Sender information
     * @param {Function} sendResponse - Response callback
     * @returns {boolean} False (sync response)
     */
    static handle(message, sender, sendResponse) {
        if (message.type !== MESSAGE_TYPES.TOGGLE_CHAT) {
            return false;
        }

        console.log('Received TOGGLE_CHAT command');

        this.toggleChat();
        sendResponse({ success: true });

        return false;
    }

    /**
     * Toggle chat interface
     */
    static toggleChat() {
        if (typeof window.toggleChatInterface === 'function') {
            window.toggleChatInterface();
        } else {
            console.warn('⚠️ toggleChatInterface not available');
        }
    }

    /**
     * Show chat interface
     */
    static showChat() {
        if (typeof window.showChatInterface === 'function') {
            window.showChatInterface();
        }
    }

    /**
     * Hide chat interface
     */
    static hideChat() {
        if (typeof window.hideChatInterface === 'function') {
            window.hideChatInterface();
        }
    }

    /**
     * Check if chat is visible
     * @returns {boolean} True if chat is visible
     */
    static isChatVisible() {
        if (typeof window.isChatVisible === 'function') {
            return window.isChatVisible();
        }
        return false;
    }
}

ChatHandler;
