// API Configuration
const API_BASE_URL = 'http://localhost:8000';

// DOM Elements
let messageInput;
let sendButton;
let chatMessages;
let typingIndicator;

// State
let pageContext = null;
// We keep history in memory for the session to pass to the stateless backend
// We also load/save to storage to persist across popup re-opens
let chatHistoryState = [];
const CHAT_HISTORY_KEY = 'nova_chat_history';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Get DOM elements
    messageInput = document.getElementById('message-input');
    sendButton = document.getElementById('send-button');
    chatMessages = document.getElementById('chat-messages');
    typingIndicator = document.getElementById('typing-indicator');

    // Add event listeners
    sendButton.addEventListener('click', handleSendMessage);
    messageInput.addEventListener('input', handleInputChange);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    // Auto-resize textarea
    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
    });

    // Focus input
    messageInput.focus();

    // Start Chat Flow
    await initChat();
});

// Handle input change
function handleInputChange() {
    const hasText = messageInput.value.trim().length > 0;
    sendButton.disabled = !hasText;
}

// Initialize Chat Session
async function initChat() {
    try {
        // ALWAYS START FRESH (User Request)
        console.log('Starting fresh chat session...');
        chatHistoryState = [];
        await chrome.storage.local.remove([CHAT_HISTORY_KEY]);

        // Clear UI (keep typing indicator)
        Array.from(chatMessages.children).forEach(child => {
            if (!child.classList.contains('typing-indicator')) {
                child.remove();
            }
        });

        showTypingIndicator();

        // Get current tab info
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0) {
            const tabId = tabs[0].id;

            // Request context from content script
            // We use a timeout to prevent hanging if content script isn't ready
            const contextPromise = new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTEXT' }, (response) => {
                    if (chrome.runtime.lastError) {
                        // If content script missing (e.g. chrome:// page), ignore
                        resolve(null);
                    } else {
                        resolve(response);
                    }
                });
                setTimeout(() => resolve(null), 2000);
            });

            const contextData = await contextPromise;

            if (contextData) {
                await initializeWithServer(contextData);
            } else {
                // Fallback
                addMessageToUI("How can I help you today?", true);
                hideTypingIndicator(); // Ensure indicator is hidden on fallback
            }
        } else {
            addMessageToUI("How can I help you today?", true);
            hideTypingIndicator();
        }

    } catch (error) {
        console.error("Init failed:", error);
        hideTypingIndicator();
        addMessageToUI("Hi! I'm Nova. How can I help?", true);
    }
}

async function initializeWithServer(contextData) {
    try {
        const { token } = await chrome.storage.local.get(['token']);
        // If not logged in, just show generic welcome
        if (!token) {
            addMessageToUI("Please log in to SmartHireX to use the AI assistant.", true);
            hideTypingIndicator();
            return;
        }

        const response = await fetch(`${API_BASE_URL}/extension/init`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: contextData.url || '',
                page_content: (contextData.selectedText ? `[USER SELECTED TEXT]:\n${contextData.selectedText}\n\n[FULL PAGE CONTENT]:\n` : '') + (contextData.content || '')
            })
        });

        if (!response.ok) throw new Error("Init API failed");

        const data = await response.json();

        // Save context for future messages
        pageContext = data.context;

        hideTypingIndicator();

        // Show Greeting
        addMessageToUI(data.message, true);
        saveMessageToState(data.message, true); // Save initial greeting to history

        // Show Actions
        if (data.actions && data.actions.length > 0) {
            addActionChips(data.actions);
        }

    } catch (e) {
        console.error(e);
        hideTypingIndicator();
        addMessageToUI("How can I help you with this page?", true);
    }
}

function addActionChips(actions) {
    const chipsContainer = document.createElement('div');
    chipsContainer.className = 'action-chips-container';
    chipsContainer.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 8px 0 16px 0;
        padding: 0 12px;
    `;

    actions.forEach(action => {
        const chip = document.createElement('button');
        chip.textContent = action;
        chip.style.cssText = `
            background: #f0f4ff;
            border: 1px solid #e0e7ff;
            color: #4f46e5;
            padding: 6px 12px;
            border-radius: 16px;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s;
        `;
        chip.onmouseover = () => { chip.style.background = '#e0e7ff'; };
        chip.onmouseout = () => { chip.style.background = '#f0f4ff'; };
        chip.onclick = () => {
            messageInput.value = action;
            handleSendMessage();
            chip.disabled = true;
        };
        chipsContainer.appendChild(chip);
    });

    // Insert before typing indicator
    chatMessages.insertBefore(chipsContainer, typingIndicator);
    scrollToBottom();
}


// Load chat history from storage
async function loadChatHistoryFromStorage() {
    const result = await chrome.storage.local.get([CHAT_HISTORY_KEY]);
    chatHistoryState = result[CHAT_HISTORY_KEY] || [];

    // Clear existing (except typing indicator)
    Array.from(chatMessages.children).forEach(child => {
        if (!child.classList.contains('typing-indicator')) {
            child.remove();
        }
    });

    chatHistoryState.forEach(msg => {
        addMessageToUI(msg.message, msg.role === 'model' || msg.role === 'bot');
    });

    scrollToBottom();
}

function saveMessageToState(text, isBot) {
    chatHistoryState.push({
        role: isBot ? 'model' : 'user',
        message: text,
        timestamp: Date.now()
    });

    // Keep last 50
    if (chatHistoryState.length > 50) chatHistoryState.shift();

    chrome.storage.local.set({ [CHAT_HISTORY_KEY]: chatHistoryState });
}


// Handle send message
async function handleSendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    // Disable input
    sendButton.disabled = true;
    messageInput.disabled = true;

    // Add user message to UI
    addMessageToUI(message, false);
    saveMessageToState(message, false);

    // Clear input
    messageInput.value = '';
    messageInput.style.height = 'auto';

    // Show typing indicator
    showTypingIndicator();

    try {
        const { token } = await chrome.storage.local.get(['token']);

        if (!token) {
            throw new Error('Not authenticated.');
        }

        // Send message to backend
        // We pass the full history and context here
        // Map history to simple format: [{role: 'user', message: '...'}, ...]
        const historyForApi = chatHistoryState.map(h => ({
            role: h.role === 'bot' ? 'model' : h.role, // normalize 'bot' to 'model' if needed, or keep consistent
            message: h.message
        }));

        const response = await fetch(`${API_BASE_URL}/extension/chat`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                context: pageContext,
                history: historyForApi
            })
        });

        if (!response.ok) {
            if (response.status === 401) throw new Error('Session expired.');
            throw new Error('Failed to get response.');
        }

        const data = await response.json();

        hideTypingIndicator();

        // Add bot response
        let botMessage = data.message || data.response; // Handle both formats just in case
        if (typeof botMessage === 'object') botMessage = JSON.stringify(botMessage);

        addMessageToUI(botMessage, true);
        saveMessageToState(botMessage, true);

    } catch (error) {
        console.error('Chat error:', error);
        hideTypingIndicator();
        const errorMessage = `⚠️ ${error.message}`;
        addMessageToUI(errorMessage, true);
        saveMessageToState(errorMessage, true);
    } finally {
        messageInput.disabled = false;
        messageInput.focus();
    }
}

// Add message to UI
function addMessageToUI(text, isBot) {
    const messageWrapper = document.createElement('div');
    messageWrapper.className = `message-wrapper ${isBot ? 'bot-message' : 'user-message'}`;

    const avatar = document.createElement('div');
    avatar.className = `message-avatar ${isBot ? 'bot-avatar' : 'user-avatar'}`;

    if (isBot) {
        avatar.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" />
                <path d="M2 17L12 22L22 17" />
                <path d="M2 12L12 17L22 12" />
            </svg>
        `;
    } else {
        avatar.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>
        `;
    }

    const messageContent = document.createElement('div');
    messageContent.className = `message-content ${isBot ? 'bot-content' : 'user-content'}`;

    const messageText = document.createElement('div');
    messageText.className = 'message-text';

    // Basic markdown support for bot messages
    if (isBot) {
        messageText.innerHTML = formatMarkdown(text);
    } else {
        messageText.textContent = text;
    }

    messageContent.appendChild(messageText);
    messageWrapper.appendChild(avatar);
    messageWrapper.appendChild(messageContent);

    // Safely remove chips if they exist at the very bottom? No, keep chips.

    // Insert before typing indicator
    chatMessages.insertBefore(messageWrapper, typingIndicator);
    scrollToBottom();
}

// Basic markdown formatting
function formatMarkdown(text) {
    if (typeof text !== 'string') return '';
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    text = text.replace(/`(.+?)`/g, '<code>$1</code>');
    text = text.replace(/\n/g, '<br>');
    text = text.replace(/^- (.+)$/gm, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    return text;
}

// Show typing indicator
function showTypingIndicator() {
    typingIndicator.classList.remove('hidden');
    // Move to bottom
    chatMessages.appendChild(typingIndicator);
    scrollToBottom();
}

function hideTypingIndicator() {
    typingIndicator.classList.add('hidden');
}

function scrollToBottom() {
    setTimeout(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 50);
}
