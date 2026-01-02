/**
 * Chat Interface Logic for Smart AI Job Apply
 * 
 * Runs inside the chat iframe (extension page context).
 * Uses local AIClient for responses.
 */

// DOM Elements
const chatOutput = document.getElementById('chat-output');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const typingIndicator = document.getElementById('typing-indicator');

// Chat State
let chatHistory = [];
let isProcessing = false;
let pageContext = null; // Store classified page context

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Show typing indicator while initializing
    startTyping();

    // Initialize chat with page context
    await initChat();

    // Bind events
    sendBtn.addEventListener('click', handleSendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    // Auto-focus input
    chatInput.focus();
});

/**
 * Initialize chat with contextual greeting
 */
async function initChat() {
    try {
        // Get page context from parent page via content script
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length === 0) {
            addMessage('bot', "Hello! I'm Nova, your AI career assistant. How can I help you today?");
            stopTyping();
            return;
        }

        const tabId = tabs[0].id;

        // Request page context with timeout
        const contextPromise = new Promise((resolve) => {
            chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTEXT' }, (response) => {
                if (chrome.runtime.lastError) {
                    resolve(null);
                } else {
                    resolve(response);
                }
            });
            setTimeout(() => resolve(null), 2000);
        });

        const contextData = await contextPromise;

        if (contextData) {
            // Classify the page using AI
            const classification = await window.ContextClassifier.classifyPageContext(contextData);

            // Store context for future messages
            pageContext = {
                ...classification,
                url: contextData.url,
                title: contextData.title
            };

            stopTyping();

            // Show contextual greeting
            addMessage('bot', classification.greeting);

            // Show action chips if available
            if (classification.actions && classification.actions.length > 0) {
                addActionChips(classification.actions);
            }
        } else {
            // Fallback for non-web pages or when content script isn't available
            stopTyping();
            addMessage('bot', "Hello! I'm Nova, your AI career assistant. How can I help you today?");
        }

        // Check if resume is available
        const resume = await window.ResumeManager.getResumeData();
        if (!resume) {
            addMessage('system', "📝 Tip: Configure your resume in settings for better assistance.");
        }

    } catch (error) {
        console.error('Init chat error:', error);
        stopTyping();
        addMessage('bot', "Hello! I'm Nova, your AI career assistant. How can I help you today?");
    }
}

async function handleSendMessage() {
    if (isProcessing) return;

    const text = chatInput.value.trim();
    if (!text) return;

    // Clear input
    chatInput.value = '';

    // Add user message
    addMessage('user', text);

    // Show typing
    startTyping();
    isProcessing = true;

    try {
        // Prepare context
        let systemPrompt = await window.FormAnalyzer.getChatSystemPrompt();

        // Add page context if available
        if (pageContext) {
            systemPrompt += `\n\nCURRENT PAGE CONTEXT:\n`;
            systemPrompt += `Page Type: ${pageContext.pageType}\n`;
            systemPrompt += `URL: ${pageContext.url}\n`;
            systemPrompt += `Title: ${pageContext.title}\n`;
            if (pageContext.context?.jobTitle) {
                systemPrompt += `Job Title: ${pageContext.context.jobTitle}\n`;
            }
            if (pageContext.context?.company) {
                systemPrompt += `Company: ${pageContext.context.company}\n`;
            }
        }

        // Build conversation history for context (last 10 messages)
        let conversationText = `\n\nRecent conversation:\n`;
        chatHistory.slice(-5).forEach(msg => {
            conversationText += `${msg.role === 'user' ? 'User' : 'Nova'}: ${msg.content}\n`;
        });
        conversationText += `User: ${text}\nNova:`;

        const fullPrompt = systemPrompt + conversationText;

        // Call AI
        const result = await window.AIClient.callAI(fullPrompt, '', {
            maxTokens: 1024,
            temperature: 0.7
        });

        stopTyping();

        if (result.success) {
            addMessage('bot', result.text);
        } else {
            addMessage('error', `Sorry, I encountered an issue: ${result.error}`);
        }

    } catch (error) {
        stopTyping();
        addMessage('error', `Error: ${error.message}`);
    } finally {
        isProcessing = false;
        scrollToBottom();
    }
}

/**
 * Add action chips for suggested actions
 */
function addActionChips(actions) {
    const chipsContainer = document.createElement('div');
    chipsContainer.className = 'action-chips-container';
    chipsContainer.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 12px 0 16px 0;
        padding: 0 12px;
    `;

    actions.forEach(action => {
        const chip = document.createElement('button');
        chip.textContent = action;
        chip.className = 'action-chip';
        chip.style.cssText = `
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border: none;
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
        `;

        chip.onmouseover = () => {
            chip.style.transform = 'translateY(-2px)';
            chip.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.5)';
        };

        chip.onmouseout = () => {
            chip.style.transform = 'translateY(0)';
            chip.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.3)';
        };

        chip.onclick = () => {
            chatInput.value = action;
            chip.disabled = true;
            chip.style.opacity = '0.6';
            handleSendMessage();
        };

        chipsContainer.appendChild(chip);
    });

    // Insert before typing indicator
    chatOutput.insertBefore(chipsContainer, typingIndicator);
    scrollToBottom();
}

function addMessage(role, content) {
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${role}-message`;

    // Avatar
    const avatar = document.createElement('div');
    avatar.className = `message-avatar ${role}-avatar`;

    if (role === 'bot') {
        avatar.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" />
                <path d="M2 17L12 22L22 17" />
                <path d="M2 12L12 17L22 12" />
            </svg>`;
    } else {
        avatar.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>`;
    }

    wrapper.appendChild(avatar);

    // Content
    const msgContent = document.createElement('div');
    msgContent.className = `message-content ${role}-content`;

    if (role === 'system' || role === 'error') {
        msgContent.innerHTML = `<div class="message-text">${content}</div>`;
        if (role === 'error') msgContent.style.color = '#ef4444';
    } else {
        // Parse markdown-like syntax
        let formatted = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');

        msgContent.innerHTML = `<div class="message-text">${formatted}</div>`;
    }

    wrapper.appendChild(msgContent);
    chatOutput.appendChild(wrapper);

    // Add to history if valid role
    if (role === 'user' || role === 'bot') {
        chatHistory.push({ role, content });
    }

    scrollToBottom();
}

function startTyping() {
    // Move indicator to the bottom
    chatOutput.appendChild(typingIndicator);
    typingIndicator.classList.remove('hidden');
    scrollToBottom();
}

function stopTyping() {
    typingIndicator.classList.add('hidden');
}

function scrollToBottom() {
    chatOutput.scrollTop = chatOutput.scrollHeight;
}
