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

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Load initial welcome
    addMessage('bot', "Hello! I'm Nova, your AI career assistant. I have access to your resume. How can I help you today?");

    // Check if resume is available
    const resume = await window.ResumeManager.getResumeData();
    if (!resume) {
        addMessage('system', "No resume found. Please configure your resume in settings.");
    }

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
        const systemPrompt = await window.FormAnalyzer.getChatSystemPrompt();

        // Build conversation history for context (last 10 messages)
        // Note: Gemini API maintains context if using chat session, but for REST simple call we append manually
        // Or we can use just the system prompt + user message if stateless
        // Efficient way: Append history to prompt

        let conversationText = `\n\nRecent conversation:\n`;
        chatHistory.slice(-5).forEach(msg => {
            conversationText += `${msg.role === 'user' ? 'User' : 'Nova'}: ${msg.content}\n`;
        });
        conversationText += `User: ${text}\nNova:`;

        const fullPrompt = systemPrompt + conversationText;

        // Call AI
        // Chat iframe is an extension page, so fetch works without CORS blocking usually
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

function addMessage(role, content) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message message-${role}`;

    if (role === 'system' || role === 'error') {
        msgDiv.innerHTML = `<div class="message-content">${content}</div>`;
    } else {
        // Markdown parsing could go here (e.g. bold, lists)
        // Basic formatting: newlines
        const formatted = content.replace(/\n/g, '<br>');
        msgDiv.innerHTML = `<div class="message-content">${formatted}</div>`;
    }

    chatOutput.appendChild(msgDiv);

    // Add to history if valid role
    if (role === 'user' || role === 'bot') {
        chatHistory.push({ role, content });
    }

    scrollToBottom();
}

function startTyping() {
    typingIndicator.classList.remove('hidden');
    scrollToBottom();
}

function stopTyping() {
    typingIndicator.classList.add('hidden');
}

function scrollToBottom() {
    chatOutput.scrollTop = chatOutput.scrollHeight;
}
