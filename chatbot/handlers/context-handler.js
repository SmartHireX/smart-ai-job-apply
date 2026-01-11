/**
 * context-handler.js
 * Handles GET_PAGE_CONTEXT messages for chat interface
 */


/**
 * Context Handler
 * Provides page context information to the chat interface
 */
class ContextHandler {
    /**
     * Handle GET_PAGE_CONTEXT message
     * @param {Object} message - Message object
     * @param {Object} sender - Sender information
     * @param {Function} sendResponse - Response callback
     * @returns {boolean} True if async response
     */
    static handle(message, sender, sendResponse) {
        if (message.type !== MESSAGE_TYPES.GET_PAGE_CONTEXT) {
            return false;
        }

        const context = this.getPageContext();
        sendResponse(context);

        return true;
    }

    /**
     * Get current page context
     * @returns {Object} Page context data
     */
    static getPageContext() {
        const text = document.body.innerText || '';
        const selection = window.getSelection().toString();

        return {
            content: text,
            selectedText: selection,
            url: window.location.href,
            title: document.title
        };
    }

    /**
     * Get selected text only
     * @returns {string} Selected text
     */
    static getSelectedText() {
        return window.getSelection().toString();
    }

    /**
     * Get page metadata
     * @returns {Object} Page metadata
     */
    static getMetadata() {
        return {
            url: window.location.href,
            title: document.title,
            domain: window.location.hostname,
            pathname: window.location.pathname
        };
    }
}

ContextHandler;
