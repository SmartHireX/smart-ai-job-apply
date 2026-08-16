/**
 * Nova Popup — Chat + Form Fill
 * Two-tab popup: AI chat companion (with page summarization) + existing form fill
 */

// ─── Shared core ─────────────────────────────────────────────────────────────
const Core = window.NovaChatCore;
if (!Core) console.error('[Nova popup] nova-chat-core.js not loaded');
const { fmt: _fmtCore, esc: escCore, getChipsForPage, resolveKnownUrl,
        buildClassifierPrompt,
        JT_STATUSES, JT_LABELS, jtLoad, jtSave } = Core || {};

// ─── State ──────────────────────────────────────────────────────────────────
let isReady = false;
let activeTab = 'chat';
let isThinking = false;
let chatHistory = [];
let currentPageContent = '';
let currentPageTitle = '';
let currentPageUrl = '';
let activeProvider = localStorage.getItem('nova_provider') || 'gemini';

const HISTORY_KEY = 'nova_chat_history';
const MAX_HISTORY  = 40; // messages to persist

function saveHistory() {
    try { chrome.storage.local.set({ [HISTORY_KEY]: chatHistory.slice(-MAX_HISTORY) }); } catch {}
}
function loadHistory() {
    return new Promise(resolve => {
        try {
            chrome.storage.local.get([HISTORY_KEY], result => {
                resolve(result[HISTORY_KEY] || []);
            });
        } catch { resolve([]); }
    });
}

// ─── DOM refs ────────────────────────────────────────────────────────────────
let setupSection, tabBar, chatSection, fillSection, progressSection;
let fillBtn, undoBtn, refreshBtn, settingsBtn, openSettingsBtn;
let formStatus, statusIcon, progressFill, progressTitle, progressText;
let messagesEl, chatInput, sendBtn, pageTitleText, quickChips;

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    setupSection    = document.getElementById('setup-section');
    tabBar          = document.getElementById('tab-bar');
    chatSection     = document.getElementById('chat-section');
    fillSection     = document.getElementById('fill-section');
    progressSection = document.getElementById('progress-section');

    fillBtn         = document.getElementById('fill-btn');
    undoBtn         = document.getElementById('undo-btn');
    refreshBtn      = document.getElementById('refresh-btn');
    settingsBtn     = document.getElementById('settings-btn');
    openSettingsBtn = document.getElementById('open-settings-btn');

    formStatus      = document.getElementById('form-status');
    statusIcon      = document.getElementById('status-icon');
    progressFill    = document.getElementById('progress-fill');
    progressTitle   = document.getElementById('progress-title');
    progressText    = document.getElementById('progress-text');

    messagesEl      = document.getElementById('messages');
    chatInput       = document.getElementById('chat-input');
    sendBtn         = document.getElementById('send-btn');
    pageTitleText   = document.getElementById('page-title-text');
    quickChips      = document.getElementById('quick-chips');

    bindEvents();
    await checkSetup();
});

// ─── Event Binding ───────────────────────────────────────────────────────────
function bindEvents() {
    // tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // settings
    settingsBtn.addEventListener('click', openSettings);
    openSettingsBtn.addEventListener('click', openSettings);

    // fill
    fillBtn.addEventListener('click', handleFillForm);
    undoBtn.addEventListener('click', handleUndo);
    refreshBtn.addEventListener('click', async () => {
        const svg = refreshBtn.querySelector('svg');
        if (svg) {
            svg.style.transition = 'transform 0.5s ease';
            svg.style.transform = 'rotate(360deg)';
            setTimeout(() => svg.style.transform = '', 500);
        }
        await detectForms();
    });

    // Provider toggle
    const geminiBtn = document.getElementById('use-gemini');
    const groqBtn   = document.getElementById('use-groq');
    function setProvider(p) {
        activeProvider = p;
        localStorage.setItem('nova_provider', p);
        geminiBtn?.classList.toggle('active', p === 'gemini');
        groqBtn?.classList.toggle('active', p === 'groq');
    }
    setProvider(activeProvider);
    geminiBtn?.addEventListener('click', () => setProvider('gemini'));
    groqBtn?.addEventListener('click',   () => setProvider('groq'));

    // floating chat widget on the page
    document.getElementById('open-widget-btn').addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
                showToast('Cannot open on this page', 'warning');
                return;
            }
            // Inject history into the page's window BEFORE the widget loads
            const historyToPass = chatHistory.slice(-40);
            const provider = activeProvider;
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (history, prov) => {
                    window.__novaHistory  = history;
                    window.__novaProvider = prov;
                },
                args: [historyToPass, provider]
            });
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['shared/utils/nova-chat-core.js']
            });
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['autofill/ui/chat/chat-widget.js']
            });
            setTimeout(() => window.close(), 150);
        } catch (e) {
            showToast('Could not open chat widget', 'warning');
        }
    });

    // chat input — auto resize + enable send
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 96) + 'px';
        sendBtn.disabled = chatInput.value.trim().length === 0;
    });

    chatInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!sendBtn.disabled) handleSend();
        }
    });

    sendBtn.addEventListener('click', handleSend);

    // dynamic domain-aware chips — rendered after page context loads
    renderPopupChips();
}

// ─── Setup Check ─────────────────────────────────────────────────────────────
async function checkSetup() {
    try {
        const status = await window.AIClient.checkSetupStatus();
        updateChecklist('check-api', status.hasApiKey);
        updateChecklist('check-resume', status.hasResume);

        if (status.ready) {
            isReady = true;
            showReadyUI();
            restoreHistory();
            await Promise.all([loadPageContext(), detectForms()]);
        } else {
            showSetupUI(status);
        }
    } catch (e) {
        console.error('Setup check failed:', e);
        showSetupUI({ hasApiKey: false, hasResume: false });
    }
}

function updateChecklist(id, complete) {
    const item = document.getElementById(id);
    const icon = item.querySelector('.check-icon');
    if (complete) {
        item.classList.add('complete');
        icon.textContent = '✓';
    } else {
        item.classList.remove('complete');
        icon.textContent = '○';
    }
}

function showSetupUI(status) {
    setupSection.classList.remove('hidden');
    tabBar.classList.add('hidden');
    chatSection.classList.add('hidden');
    fillSection.classList.add('hidden');
    progressSection.classList.add('hidden');

    const msg = document.getElementById('setup-message');
    if (!status.hasApiKey && !status.hasResume) {
        msg.textContent = 'Configure your API key and profile to unlock all AI features.';
    } else if (!status.hasApiKey) {
        msg.textContent = 'Add your Gemini API key to enable AI features.';
    } else {
        msg.textContent = 'Add your profile data to enable auto-fill.';
    }
}

function showReadyUI() {
    setupSection.classList.add('hidden');
    tabBar.classList.remove('hidden');
    switchTab('chat');
}

// ─── Restore persisted chat history ──────────────────────────────────────────
async function restoreHistory() {
    const saved = await loadHistory();
    if (!saved.length) return;
    chatHistory = saved;
    // Hide welcome message if there's real history
    const welcome = document.getElementById('welcome-msg');
    if (welcome) welcome.style.display = 'none';
    quickChips.style.display = 'none';
    saved.forEach(m => appendMessage(m.role, m.text, true)); // instant — no ghost typing for history
    // Scroll to bottom
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ─── Tab Switching ────────────────────────────────────────────────────────────
function switchTab(tab) {
    activeTab = tab;

    document.querySelectorAll('.tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });

    chatSection.classList.toggle('hidden', tab !== 'chat');
    fillSection.classList.toggle('hidden', tab !== 'fill');
    progressSection.classList.add('hidden');
}

// ─── Page Context ─────────────────────────────────────────────────────────────
async function loadPageContext() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || tab.url.startsWith('chrome://')) {
            pageTitleText.textContent = 'Browser page (no content access)';
            return;
        }

        currentPageTitle = tab.title || tab.url;
        currentPageUrl   = tab.url || '';
        pageTitleText.textContent = currentPageTitle;

        // Extract page text for chat context
        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const body = document.body.cloneNode(true);
                // Remove scripts, styles, navs for cleaner text
                ['script', 'style', 'nav', 'footer', 'header'].forEach(tag => {
                    body.querySelectorAll(tag).forEach(el => el.remove());
                });
                return (body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 8000);
            }
        });

        currentPageContent = result?.[0]?.result || '';
    } catch (e) {
        pageTitleText.textContent = 'Could not access page content';
    }
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
function renderPopupChips() {
    if (!Core) return;
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        const hostname = tab?.url ? new URL(tab.url).hostname : '';
        const chips = getChipsForPage(hostname);
        quickChips.innerHTML = '';
        chips.forEach(({ label, prompt }) => {
            const btn = document.createElement('button');
            btn.className = 'chip';
            btn.textContent = label;
            btn.addEventListener('click', () => {
                chatInput.value = prompt;
                chatInput.dispatchEvent(new Event('input'));
                handleSend();
            });
            quickChips.appendChild(btn);
        });
    });
}

async function handleSend() {
    const text = chatInput.value.trim();
    if (!text || isThinking) return;

    // Hide chips after first message
    quickChips.style.display = 'none';

    // Add user message
    appendMessage('user', text);
    chatHistory.push({ role: 'user', text });
    saveHistory();

    // Clear input
    chatInput.value = '';
    chatInput.style.height = 'auto';
    sendBtn.disabled = true;

    // Show thinking
    const thinkingId = showThinking();
    isThinking = true;

    try {
        const response = await callChatAI(text);
        removeThinking(thinkingId);
        appendMessage('ai', response);
        chatHistory.push({ role: 'ai', text: response });
        saveHistory();
    } catch (e) {
        removeThinking(thinkingId);
        appendMessage('ai', 'Something went wrong. Please check your API key and try again.');
    } finally {
        isThinking = false;
    }
}

async function callChatAI(userMessage) {
    const systemPrompt = buildSystemPrompt();
    const fullPrompt = buildFullPrompt(userMessage);

    const result = await window.AIClient.callAI(fullPrompt, systemPrompt, {
        maxTokens: 1024,
        temperature: 0.7,
        provider: activeProvider
    });

    if (!result.success || !result.text) {
        throw new Error(result.error || 'AI call failed');
    }

    return result.text.trim();
}

function buildSystemPrompt() {
    return Core
        ? Core.buildSystemPrompt(currentPageTitle, currentPageUrl || '')
        : `You are Nova, a helpful AI assistant. Current page: "${currentPageTitle}".`;
}

function buildFullPrompt(userMessage) {
    let prompt = '';

    // Include page content if relevant
    if (currentPageContent && isPageRelatedQuery(userMessage)) {
        prompt += `Page content:\n${currentPageContent}\n\n`;
    }

    // Include recent conversation history (last 4 turns)
    const recentHistory = chatHistory.slice(-4);
    if (recentHistory.length > 0) {
        recentHistory.forEach(msg => {
            prompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.text}\n`;
        });
        prompt += '\n';
    }

    prompt += `User: ${userMessage}`;
    return prompt;
}

function isPageRelatedQuery(message) {
    const pageKeywords = /summarize|summary|page|this|extract|what|key|point|content|tell me|explain|describe|find|show|list/i;
    return pageKeywords.test(message);
}

// ─── Message Rendering ────────────────────────────────────────────────────────
function appendMessage(role, text, instant = false) {
    const wrapper = document.createElement('div');
    wrapper.className = `message ${role === 'ai' ? 'ai-message' : 'user-message'}`;

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (role === 'ai') {
        wrapper.innerHTML = `
            <div class="ai-avatar">N</div>
            <div>
                <div class="message-bubble"></div>
                <div class="msg-time">${time}</div>
            </div>`;
        messagesEl.appendChild(wrapper);
        const bubble = wrapper.querySelector('.message-bubble');
        if (instant) {
            bubble.innerHTML = formatAIText(text);
        } else {
            ghostTypePopup(bubble, text);
        }
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return;
    } else {
        wrapper.innerHTML = `
            <div class="user-avatar" style="width:26px;height:26px;border-radius:7px;background:#e5e7eb;color:#6b7280;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">U</div>
            <div>
                <div class="message-bubble">${escapeHtml(text)}</div>
                <div class="msg-time">${time}</div>
            </div>`;
    }

    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function ghostTypePopup(bubble, text) {
    const SPEED_MS = 18;
    let typed = '';
    for (const ch of text.split('')) {
        typed += ch;
        bubble.textContent = typed;
        messagesEl.scrollTop = messagesEl.scrollHeight;
        await new Promise(r => setTimeout(r, SPEED_MS));
    }
    bubble.innerHTML = formatAIText(text);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

// formatAIText and escapeHtml — delegate to NovaChatCore so popup stays in sync with widget
function formatAIText(text) {
    return Core ? _fmtCore(text) : text;
}
function escapeHtml(text) {
    return Core ? escCore(text) : text;
}

function showThinking() {
    const id = 'thinking-' + Date.now();
    const wrapper = document.createElement('div');
    wrapper.className = 'message ai-message';
    wrapper.id = id;
    wrapper.innerHTML = `
        <div class="ai-avatar">N</div>
        <div class="thinking-bubble">
            <div class="thinking-dot"></div>
            <div class="thinking-dot"></div>
            <div class="thinking-dot"></div>
        </div>`;
    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return id;
}

function removeThinking(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

// ─── Form Fill (existing logic, unchanged) ────────────────────────────────────
async function detectForms() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) { formStatus.textContent = 'No active page'; return; }

        if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
            formStatus.textContent = 'Cannot access this page';
            setStatusIcon('warning', '⚠');
            return;
        }

        const response = await chrome.tabs.sendMessage(tab.id, { type: 'DETECT_FORMS' });

        if (response && response.formCount > 0) {
            formStatus.textContent = `${response.formCount} form${response.formCount > 1 ? 's' : ''} detected`;
            setStatusIcon('success', '✓');
            fillBtn.disabled = false;
            refreshBtn.style.display = 'none';
        } else {
            formStatus.textContent = 'No forms found on this page';
            setStatusIcon('neutral', '○');
            fillBtn.disabled = true;
            refreshBtn.style.display = 'flex';
        }
    } catch (e) {
        const msg = e.message || '';
        formStatus.textContent = msg.includes('Receiving end') || msg.includes('Could not establish')
            ? 'Please refresh the page'
            : 'Could not detect forms';
        setStatusIcon('danger', '!');
        fillBtn.disabled = true;
    }
}

function setStatusIcon(state, symbol) {
    const colors = {
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        neutral: 'var(--text-muted)'
    };
    statusIcon.style.background = colors[state] || colors.neutral;
    // Replace inner SVG with symbol text when needed for warnings
    if (state !== 'success') {
        statusIcon.innerHTML = `<span style="font-size:16px;font-weight:700;color:white">${symbol}</span>`;
    }
}

async function handleFillForm() {
    if (!isReady) { showSetupUI({ hasApiKey: false, hasResume: false }); return; }

    try {
        fillBtn.disabled = true;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;

        formStatus.textContent = 'Loading AI engine...';

        const activation = await chrome.tabs.sendMessage(tab.id, { type: 'ACTIVATE_EXTENSION' });
        if (!activation?.loaded) {
            showFillError('Failed to load. Please refresh the page.');
            fillBtn.disabled = false;
            return;
        }

        formStatus.textContent = 'Processing form...';
        chrome.tabs.sendMessage(tab.id, { type: 'START_LOCAL_PROCESSING' });
        window.close();
    } catch (e) {
        console.error('Fill failed:', e);
        fillBtn.disabled = false;
        showFillError('Failed to start. Please try again.');
    }
}

async function handleUndo() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;
        const result = await chrome.tabs.sendMessage(tab.id, { type: 'UNDO_FILL' });
        if (result?.success) {
            undoBtn.classList.add('hidden');
            showToast('Form fill undone');
        } else {
            showToast('Nothing to undo', 'warning');
        }
    } catch (e) {
        console.error('Undo failed:', e);
    }
}

function showFillError(message) {
    formStatus.textContent = message;
    formStatus.style.color = 'var(--danger)';
    setStatusIcon('danger', '!');
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function openSettings() {
    chrome.runtime.openOptionsPage();
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('visible'), 10);
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ─── Messages from content script ────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'FILL_COMPLETE') {
        undoBtn.classList.remove('hidden');
        fillBtn.disabled = false;
    }
    if (message.type === 'FILL_ERROR') {
        showFillError(message.error);
        fillBtn.disabled = false;
    }
});
