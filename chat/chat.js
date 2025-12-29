// API Configuration
const API_BASE_URL = 'http://localhost:8000';

// DOM Elements
let messageInput;
let sendButton;
let chatMessages;
let typingIndicator;

// Chat history storage key
const CHAT_HISTORY_KEY = 'nova_chat_history';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Get DOM elements
    messageInput = document.getElementById('message-input');
    sendButton = document.getElementById('send-button');
    chatMessages = document.getElementById('chat-messages');
    typingIndicator = document.getElementById('typing-indicator');

    // Load chat history
    await loadChatHistory();

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
});

// Handle input change
function handleInputChange() {
    const hasText = messageInput.value.trim().length > 0;
    sendButton.disabled = !hasText;
}

// Load chat history from storage
async function loadChatHistory() {
    try {
        const result = await chrome.storage.local.get([CHAT_HISTORY_KEY]);
        const history = result[CHAT_HISTORY_KEY] || [];

        // Clear existing messages except welcome
        const welcomeMessage = chatMessages.querySelector('.message-wrapper');
        chatMessages.innerHTML = '';

        // Re-add welcome if no history
        if (history.length === 0) {
            chatMessages.appendChild(welcomeMessage);
        } else {
            // Display history
            history.forEach(msg => {
                addMessageToUI(msg.text, msg.sender === 'bot');
            });
        }

        // Scroll to bottom
        scrollToBottom();
    } catch (error) {
        console.error('Failed to load chat history:', error);
    }
}

// Save chat history to storage
async function saveChatHistory(message, isBot) {
    try {
        const result = await chrome.storage.local.get([CHAT_HISTORY_KEY]);
        const history = result[CHAT_HISTORY_KEY] || [];

        history.push({
            sender: isBot ? 'bot' : 'user',
            text: message,
            timestamp: Date.now()
        });

        // Keep only last 50 messages
        if (history.length > 50) {
            history.shift();
        }

        await chrome.storage.local.set({ [CHAT_HISTORY_KEY]: history });
    } catch (error) {
        console.error('Failed to save chat history:', error);
    }
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
    await saveChatHistory(message, false);

    // Clear input
    messageInput.value = '';
    messageInput.style.height = 'auto';

    // Show typing indicator
    showTypingIndicator();

    try {
        // Get token
        const { token } = await chrome.storage.local.get(['token']);

        if (!token) {
            throw new Error('Not authenticated. Please log in to the extension.');
        }

        // Send message to backend
        const response = await fetch(`${API_BASE_URL}/chatbot/chat`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message
            })
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Session expired. Please log in again.');
            }
            throw new Error('Failed to get response from AI');
        }

        const data = await response.json();

        // Hide typing indicator
        hideTypingIndicator();

        // Add bot response
        const botMessage = data.response || 'Sorry, I could not generate a response.';
        addMessageToUI(botMessage, true);
        await saveChatHistory(botMessage, true);

    } catch (error) {
        console.error('Chat error:', error);
        hideTypingIndicator();

        // Show error message
        const errorMessage = `⚠️ ${error.message}`;
        addMessageToUI(errorMessage, true);
        await saveChatHistory(errorMessage, true);
    } finally {
        // Re-enable input
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

    // Remove typing indicator from DOM temporarily
    const typingInMessages = chatMessages.querySelector('.typing-indicator');
    if (typingInMessages) {
        typingInMessages.remove();
    }

    chatMessages.appendChild(messageWrapper);
    scrollToBottom();
}

// Basic markdown formatting
function formatMarkdown(text) {
    // Convert **bold** to <strong>
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Convert *italic* to <em>
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Convert `code` to <code>
    text = text.replace(/`(.+?)`/g, '<code>$1</code>');

    // Convert newlines to <br>
    text = text.replace(/\n/g, '<br>');

    // Convert bullet points
    text = text.replace(/^- (.+)$/gm, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    return text;
}

// Show typing indicator
function showTypingIndicator() {
    typingIndicator.classList.remove('hidden');
    scrollToBottom();
}

// Hide typing indicator
function hideTypingIndicator() {
    typingIndicator.classList.add('hidden');
}

// Scroll to bottom
function scrollToBottom() {
    setTimeout(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 100);
}
