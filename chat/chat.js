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

            // Store context for future messages INCLUDING FULL PAGE CONTENT
            pageContext = {
                ...classification,
                url: contextData.url,
                title: contextData.title,
                content: contextData.content,  // Store full page text for ATS analysis
                selectedText: contextData.selectedText
            };

            stopTyping();

            // Show contextual greeting FIRST
            const greetingMsg = addMessage('bot', classification.greeting);

            // THEN show action chips below the message
            if (classification.actions && classification.actions.length > 0) {
                addActionChips(classification.actions, greetingMsg);
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
        // Check if this is a Job Fit / ATS Analysis request
        const isJobFitAnalysis = /job fit|analyze.*(match|fit)|ats|match score/i.test(text);

        if (isJobFitAnalysis && pageContext && pageContext.pageType === 'job_posting') {
            // Use specialized ATS analysis prompt
            await handleATSAnalysis(text);
        } else {
            // Standard chat flow
            await handleStandardChat(text);
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
 * Handle ATS Job Fit Analysis with specialized prompt
 */
async function handleATSAnalysis(userMessage) {
    try {
        // Get resume data
        const resumeData = await window.ResumeManager.getResumeData();
        if (!resumeData) {
            stopTyping();
            addMessage('bot', "⚠️ Please configure your resume in settings first to analyze job fit.");
            return;
        }

        // Get actual job description from page content
        const jobDescription = pageContext.content || pageContext.title || 'No job description available';

        // Truncate if too long (keep first 10000 chars for better analysis)
        const truncatedJobDesc = jobDescription.length > 10000
            ? jobDescription.substring(0, 10000) + '...[truncated]'
            : jobDescription;

        // Build professional ATS analysis prompt (matching backend)
        const systemPrompt = `You are an expert ATS (Applicant Tracking System) scanner and career advisor.
Analyze the following Candidate Data (Resume) against the Job Description and provide a COMPREHENSIVE, DETAILED analysis.

**Job Description**:
${truncatedJobDesc}

**Candidate Resume**:
${JSON.stringify(resumeData, null, 2)}

**Instructions**:
1. Calculate a realistic **Match Score** (0-100%) based on how well the resume aligns with the job requirements.
2. Identify **ALL Critical Missing Keywords** (Skills, Technologies, Qualifications, Certifications, Years of Experience) that appear in the job description but are missing or not clearly demonstrated in the resume.
3. Identify **Strong Matching Points** where the candidate's experience, skills, and background align well with job requirements.
4. Provide **Detailed, Actionable Recommendations** on how to improve the match.
5. Be thorough and explain WHY each gap matters and HOW each strong point helps.

**Output Format (Markdown)**:
## 🎯 Match Score: [Score]%

[1-2 sentence overall assessment of the candidate's fit]

### ⚠️ Gap Analysis - Missing or Weak Areas
- **[Keyword/Requirement]**: [Detailed explanation of why this matters for the role and how it impacts the match]
- **[Another gap]**: [Explanation]
- ... (List ALL significant gaps)

### ✅ Strong Matching Points  
- **[Specific skill/experience]**: [How this aligns with the job requirements]
- **[Another strength]**: [Explanation]
- ... (List ALL strong points)

### 💡 Detailed Recommendations
1. **[Specific action]**: [Why this will help and how to implement it]
2. **[Another recommendation]**: [Explanation]
3. ... (Provide 3-5 actionable recommendations)

### 📝 Summary
[2-3 sentence summary of overall candidacy and likelihood of success]`;

        const prompt = `Analyze my resume fit for this job position in detail.`;

        // Call AI with moderate token limit to enable continue functionality
        const result = await window.AIClient.callAI(prompt, systemPrompt, {
            maxTokens: 1200,  // Reduced to trigger continue button
            temperature: 0.4   // Lower for more focused, factual analysis
        });

        stopTyping();

        if (result.success) {
            addMessage('bot', result.text);

            // Check if response was truncated (common indicators)
            const isTruncated = result.text.length > 2000 ||
                result.text.endsWith('...') ||
                !result.text.includes('📝 Summary') ||
                !result.text.includes('### 💡');

            if (isTruncated) {
                addContinueButton();
            }
        } else {
            addMessage('error', `Analysis failed: ${result.error}`);
        }

    } catch (error) {
        stopTyping();
        console.error('ATS Analysis error:', error);
        addMessage('error', 'Failed to analyze job fit. Please try again.');
    }
}

/**
 * Handle standard chat messages
 */
async function handleStandardChat(text) {
    // Prepare context
    let systemPrompt = await window.FormAnalyzer.getChatSystemPrompt();

    // Add page context if available
    if (pageContext) {
        systemPrompt += `\\n\\nCURRENT PAGE CONTEXT:\\n`;
        systemPrompt += `Page Type: ${pageContext.pageType}\n`;
        systemPrompt += `URL: ${pageContext.url}\n`;
        systemPrompt += `Title: ${pageContext.title}\n`;

        if (pageContext.context?.jobTitle) {
            systemPrompt += `Job Title: ${pageContext.context.jobTitle}\n`;
        }
        if (pageContext.context?.company) {
            systemPrompt += `Company: ${pageContext.context.company}\n`;
        }

        // Include actual page content for detailed answers (truncated to avoid token limits)
        if (pageContext.content) {
            const truncatedContent = pageContext.content.length > 6000
                ? pageContext.content.substring(0, 6000) + '...[content truncated]'
                : pageContext.content;
            systemPrompt += `\nPAGE CONTENT:\n${truncatedContent}\n`;
            systemPrompt += `\nIMPORTANT: Use the above page content to answer questions about this page. Provide detailed, accurate information based on what's actually on the page.\n`;
        }
    }

    // Build conversation history for context (last 5 messages)
    let conversationText = `\n\nRecent conversation:\n`;
    chatHistory.slice(-5).forEach(msg => {
        conversationText += `${msg.role === 'user' ? 'User' : 'Nova'}: ${msg.content}\n`;
    });
    conversationText += `User: ${text}\nNova:`;

    const fullPrompt = systemPrompt + conversationText;

    // Call AI
    const result = await window.AIClient.callAI(fullPrompt, '', {
        maxTokens: 800,  // Reduced to enable continue button
        temperature: 0.7
    });

    stopTyping();

    if (result.success) {
        addMessage('bot', result.text);

        // Check if response seems truncated
        const seemsTruncated = result.text.length > 900 && (
            result.text.endsWith('...') ||
            !result.text.match(/[.!?][\s]*$/) // Doesn't end with proper punctuation
        );

        if (seemsTruncated) {
            addContinueButton();
        }
    } else {
        addMessage('error', `Sorry, I encountered an issue: ${result.error}`);
    }
}

/**
 * Add suggestion chips for quick actions
 * @param {string[]} actions 
 * @param {HTMLElement} targetMessage Optional: attach chips specifically after this message
 */
function addActionChips(actions, targetMessage = null) {
    if (!actions || actions.length === 0) return;

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
            chatInput.value = action;
            handleSendMessage();
            // Optional: disable all chips after click
            chipsContainer.querySelectorAll('button').forEach(btn => btn.disabled = true);
        };
        chipsContainer.appendChild(chip);
    });

    if (targetMessage) {
        targetMessage.insertAdjacentElement('afterend', chipsContainer);
    } else {
        // Fallback: Find all message wrappers and insert chips after the last one
        const messageWrappers = chatOutput.querySelectorAll('.message-wrapper');
        if (messageWrappers.length > 0) {
            const lastMessage = messageWrappers[messageWrappers.length - 1];
            lastMessage.insertAdjacentElement('afterend', chipsContainer);
        } else {
            // Fallback: insert before typing indicator
            chatOutput.insertBefore(chipsContainer, typingIndicator);
        }
    }

    scrollToBottom();
}

/**
 * Add continue button when response is truncated
 */
function addContinueButton() {
    const continueContainer = document.createElement('div');
    continueContainer.className = 'continue-button-container';
    continueContainer.style.cssText = `
        display: flex;
        justify-content: flex-start;
        margin: 8px 0 16px 0;
        padding: 0 12px 0 54px;
    `;

    const continueBtn = document.createElement('button');
    continueBtn.textContent = '↓ Continue';
    continueBtn.className = 'continue-button';
    continueBtn.style.cssText = `
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        border: none;
        color: white;
        padding: 8px 16px;
        border-radius: 12px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
        display: flex;
        align-items: center;
        gap: 4px;
    `;

    continueBtn.onmouseover = () => {
        continueBtn.style.transform = 'translateY(-2px)';
        continueBtn.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.5)';
    };

    continueBtn.onmouseout = () => {
        continueBtn.style.transform = 'translateY(0)';
        continueBtn.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.3)';
    };

    continueBtn.onclick = async () => {
        continueBtn.disabled = true;
        continueBtn.style.opacity = '0.6';
        continueBtn.textContent = 'Continuing...';

        // Remove the continue button
        continueContainer.remove();

        // Send continuation request
        chatInput.value = 'Please continue from where you left off.';
        await handleSendMessage();
    };

    continueContainer.appendChild(continueBtn);

    // Insert before typing indicator
    chatOutput.insertBefore(continueContainer, typingIndicator);
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
        // For bot messages, create empty container for streaming
        const messageText = document.createElement('div');
        messageText.className = 'message-text';
        msgContent.appendChild(messageText);

        // If it's a bot message, stream it
        if (role === 'bot') {
            // Insert before typing indicator
            wrapper.appendChild(msgContent);
            chatOutput.insertBefore(wrapper, typingIndicator);

            // Stream the text
            streamText(messageText, content);

            // Add to history after streaming starts
            chatHistory.push({ role, content });
            scrollToBottom();
            return wrapper; // Exit early for bot messages
        } else {
            // For user messages, show immediately
            messageText.textContent = content;
        }
    }

    wrapper.appendChild(msgContent);
    chatOutput.appendChild(wrapper);

    // Add to history if valid role
    if (role === 'user' || role === 'bot') {
        chatHistory.push({ role, content });
    }

    scrollToBottom();
    return wrapper;
}

/**
 * Stream text with typewriter effect
 */
function streamText(element, text, speed = 20) {
    let index = 0;
    let buffer = '';

    // Format markdown-like syntax
    const formatted = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');

    function typeNextChar() {
        if (index < formatted.length) {
            // Handle HTML tags - add them all at once
            if (formatted[index] === '<') {
                const tagEnd = formatted.indexOf('>', index);
                if (tagEnd !== -1) {
                    buffer += formatted.substring(index, tagEnd + 1);
                    index = tagEnd + 1;
                } else {
                    buffer += formatted[index];
                    index++;
                }
            } else {
                buffer += formatted[index];
                index++;
            }

            element.innerHTML = buffer + '<span class="cursor">▋</span>';
            scrollToBottom();
            setTimeout(typeNextChar, speed);
        } else {
            // Remove cursor when done
            element.innerHTML = buffer;
            scrollToBottom();
        }
    }

    typeNextChar();
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
