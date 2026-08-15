/**
 * Nova Floating Chat Widget
 * Draggable + resizable chat window injected into any page.
 */
(function () {
    const WIDGET_ID = 'nova-chat-widget';

    // Toggle visibility if already injected
    if (document.getElementById(WIDGET_ID)) {
        const w = document.getElementById(WIDGET_ID);
        w.style.display = w.style.display === 'none' ? 'flex' : 'none';
        return;
    }

    // ── Default size / position ───────────────────────────────────────────────
    const DEFAULT = { w: 380, h: 520, x: window.innerWidth - 400, y: window.innerHeight - 540 };
    const MIN_W = 300, MIN_H = 360, MAX_W = 800, MAX_H = 900;

    let state = { ...DEFAULT };
    let chatHistory = [], isThinking = false, pageContent = '';

    // Restore saved position/size
    try {
        const saved = JSON.parse(localStorage.getItem('nova_widget_state') || '{}');
        if (saved.w) state = { ...state, ...saved };
        // clamp to viewport
        state.x = Math.max(0, Math.min(state.x, window.innerWidth  - state.w));
        state.y = Math.max(0, Math.min(state.y, window.innerHeight - state.h));
    } catch (e) {}

    // ── Styles ────────────────────────────────────────────────────────────────
    const styleEl = document.createElement('style');
    styleEl.id = 'nova-chat-widget-styles';
    styleEl.textContent = `
        #nova-chat-widget {
            position: fixed;
            z-index: 2147483647;
            display: flex;
            flex-direction: column;
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 14px;
            box-shadow: 0 8px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            -webkit-font-smoothing: antialiased;
            overflow: hidden;
            user-select: none;
        }
        /* ── Resize handles ── */
        .nw-handle {
            position: absolute;
            z-index: 10;
        }
        /* edges */
        .nw-handle.n  { top: 0;    left: 6px;  right: 6px; height: 5px; cursor: ns-resize; }
        .nw-handle.s  { bottom: 0; left: 6px;  right: 6px; height: 5px; cursor: ns-resize; }
        .nw-handle.e  { top: 6px;  right: 0;   bottom: 6px; width: 5px; cursor: ew-resize; }
        .nw-handle.w  { top: 6px;  left: 0;    bottom: 6px; width: 5px; cursor: ew-resize; }
        /* corners */
        .nw-handle.nw { top: 0;    left: 0;  width: 12px; height: 12px; cursor: nw-resize; }
        .nw-handle.ne { top: 0;    right: 0; width: 12px; height: 12px; cursor: ne-resize; }
        .nw-handle.sw { bottom: 0; left: 0;  width: 12px; height: 12px; cursor: sw-resize; }
        .nw-handle.se { bottom: 0; right: 0; width: 12px; height: 12px; cursor: se-resize; }
        /* ── Header (drag handle) ── */
        .nw-header {
            display: flex; align-items: center; gap: 10px;
            padding: 0 14px; height: 50px;
            border-bottom: 1px solid #e5e7eb;
            background: #fff;
            flex-shrink: 0;
            cursor: grab;
        }
        .nw-header:active { cursor: grabbing; }
        .nw-logo {
            width: 28px; height: 28px; background: #6366f1;
            border-radius: 7px; display: flex; align-items: center;
            justify-content: center; color: white; font-size: 12px;
            font-weight: 800; flex-shrink: 0;
        }
        .nw-title { flex: 1; font-size: 14px; font-weight: 700; color: #111827; letter-spacing: -0.2px; }
        .nw-title span {
            font-size: 9px; font-weight: 600; background: #eef2ff;
            color: #6366f1; padding: 2px 6px; border-radius: 999px; margin-left: 5px;
        }
        .nw-actions { display: flex; gap: 5px; }
        .nw-btn {
            width: 28px; height: 28px; border: 1px solid #e5e7eb;
            border-radius: 7px; background: #fff; color: #6b7280;
            cursor: pointer; display: flex; align-items: center;
            justify-content: center; transition: all 0.15s; flex-shrink: 0;
        }
        .nw-btn:hover { background: #f3f4f6; color: #111827; border-color: #d1d5db; }
        .nw-btn.close:hover { background: #fee2e2; color: #ef4444; border-color: #fca5a5; }
        /* ── Context bar ── */
        .nw-context {
            display: flex; align-items: center; gap: 6px;
            padding: 6px 14px; background: #f9fafb;
            border-bottom: 1px solid #f3f4f6; flex-shrink: 0;
        }
        .nw-context-dot { width: 6px; height: 6px; border-radius: 50%; background: #10b981; flex-shrink: 0; }
        .nw-context-text { font-size: 11px; color: #9ca3af; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        /* ── Messages ── */
        .nw-messages {
            flex: 1; overflow-y: auto;
            padding: 14px 14px 8px;
            display: flex; flex-direction: column; gap: 12px;
            scroll-behavior: smooth;
            user-select: text;
        }
        .nw-messages::-webkit-scrollbar { width: 4px; }
        .nw-messages::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 2px; }
        .nw-msg { display: flex; gap: 8px; align-items: flex-start; }
        .nw-msg.user { flex-direction: row-reverse; }
        .nw-avatar {
            width: 26px; height: 26px; border-radius: 7px;
            background: #6366f1; color: white; font-size: 11px; font-weight: 800;
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0; margin-top: 1px;
        }
        .nw-bubble {
            max-width: 75%; padding: 9px 12px;
            font-size: 13px; line-height: 1.55;
            border-radius: 4px 12px 12px 12px; word-break: break-word;
        }
        .nw-msg.ai .nw-bubble { background: #f3f4f6; color: #111827; }
        .nw-msg.user .nw-bubble { background: #6366f1; color: white; border-radius: 12px 4px 12px 12px; }
        .nw-bubble strong { font-weight: 600; }
        .nw-bubble code { background: rgba(0,0,0,0.08); padding: 1px 4px; border-radius: 4px; font-family: monospace; font-size: 12px; }
        .nw-msg.user .nw-bubble code { background: rgba(255,255,255,0.2); }
        .nw-bubble ul { padding-left: 16px; margin-top: 4px; display: flex; flex-direction: column; gap: 2px; }
        .nw-time { font-size: 10px; color: #9ca3af; margin-top: 3px; padding: 0 2px; align-self: flex-end; }
        /* ── Thinking ── */
        .nw-thinking { background: #f3f4f6; padding: 9px 13px; border-radius: 4px 12px 12px 12px; display: flex; gap: 4px; align-items: center; }
        .nw-dot { width: 6px; height: 6px; border-radius: 50%; background: #9ca3af; animation: nw-bounce 1.2s ease-in-out infinite; }
        .nw-dot:nth-child(2) { animation-delay: 0.2s; }
        .nw-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes nw-bounce { 0%,80%,100% { transform: scale(0.7); opacity: 0.5; } 40% { transform: scale(1); opacity: 1; } }
        /* ── Chips ── */
        .nw-chips { display: flex; gap: 6px; padding: 7px 14px; overflow-x: auto; border-top: 1px solid #f3f4f6; flex-shrink: 0; }
        .nw-chips::-webkit-scrollbar { display: none; }
        .nw-chip {
            display: inline-flex; align-items: center; gap: 5px;
            padding: 5px 10px; background: #f9fafb; border: 1px solid #e5e7eb;
            border-radius: 999px; font-size: 11px; font-weight: 500; color: #6b7280;
            cursor: pointer; white-space: nowrap; font-family: inherit;
            transition: all 0.15s; flex-shrink: 0;
        }
        .nw-chip:hover { background: #eef2ff; border-color: #6366f1; color: #6366f1; }
        /* ── Input ── */
        .nw-input-area { padding: 10px 12px; border-top: 1px solid #e5e7eb; background: #fff; flex-shrink: 0; }
        .nw-input-row {
            display: flex; align-items: flex-end; gap: 8px;
            background: #f9fafb; border: 1.5px solid #e5e7eb;
            border-radius: 12px; padding: 7px 9px 7px 13px; transition: border-color 0.15s;
        }
        .nw-input-row:focus-within { border-color: #6366f1; background: #fff; }
        .nw-textarea { flex: 1; border: none; background: transparent; font-family: inherit; font-size: 13px; color: #111827; resize: none; outline: none; line-height: 1.4; max-height: 96px; min-height: 20px; overflow-y: auto; }
        .nw-textarea::placeholder { color: #9ca3af; }
        .nw-send { width: 30px; height: 30px; border-radius: 7px; border: none; background: #6366f1; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.15s; }
        .nw-send:hover:not(:disabled) { background: #4f46e5; transform: scale(1.05); }
        .nw-send:disabled { background: #e5e7eb; color: #9ca3af; cursor: not-allowed; }
    `;
    document.head.appendChild(styleEl);

    // ── Build DOM ─────────────────────────────────────────────────────────────
    const widget = document.createElement('div');
    widget.id = WIDGET_ID;
    widget.innerHTML = `
        <div class="nw-handle n"  data-dir="n"></div>
        <div class="nw-handle s"  data-dir="s"></div>
        <div class="nw-handle e"  data-dir="e"></div>
        <div class="nw-handle w"  data-dir="w"></div>
        <div class="nw-handle nw" data-dir="nw"></div>
        <div class="nw-handle ne" data-dir="ne"></div>
        <div class="nw-handle sw" data-dir="sw"></div>
        <div class="nw-handle se" data-dir="se"></div>

        <div class="nw-header" id="nw-header">
            <div class="nw-logo">N</div>
            <div class="nw-title">Nova <span>AI</span></div>
            <div class="nw-actions">
                <button class="nw-btn close" id="nw-close" title="Close">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        </div>

        <div class="nw-context">
            <div class="nw-context-dot"></div>
            <div class="nw-context-text" id="nw-page-title">Loading...</div>
        </div>

        <div class="nw-messages" id="nw-messages">
            <div class="nw-msg ai">
                <div class="nw-avatar">N</div>
                <div><div class="nw-bubble">Hi! I can summarize this page, extract info, or answer any question. What do you need?</div></div>
            </div>
        </div>

        <div class="nw-chips" id="nw-chips">
            <button class="nw-chip" data-action="summarize">📄 Summarize</button>
            <button class="nw-chip" data-action="keypoints">✦ Key points</button>
            <button class="nw-chip" data-action="extract">⊞ Extract data</button>
            <button class="nw-chip" data-action="translate">⊕ Translate</button>
        </div>

        <div class="nw-input-area">
            <div class="nw-input-row">
                <textarea class="nw-textarea" id="nw-input" placeholder="Ask anything about this page..." rows="1" maxlength="2000"></textarea>
                <button class="nw-send" id="nw-send" disabled>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(widget);

    // ── Apply initial size / position ─────────────────────────────────────────
    function applyState() {
        widget.style.left   = state.x + 'px';
        widget.style.top    = state.y + 'px';
        widget.style.width  = state.w + 'px';
        widget.style.height = state.h + 'px';
    }
    applyState();

    function saveState() {
        try { localStorage.setItem('nova_widget_state', JSON.stringify(state)); } catch (e) {}
    }

    // ── Page content ──────────────────────────────────────────────────────────
    try {
        const clone = document.body.cloneNode(true);
        clone.querySelectorAll(`script, style, #${WIDGET_ID}`).forEach(el => el.remove());
        pageContent = (clone.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 8000);
        document.getElementById('nw-page-title').textContent = document.title || location.hostname;
    } catch (e) {
        document.getElementById('nw-page-title').textContent = location.hostname;
    }

    // ── Drag ──────────────────────────────────────────────────────────────────
    const header = document.getElementById('nw-header');
    let dragging = false, dragStartX = 0, dragStartY = 0, dragOriginX = 0, dragOriginY = 0;

    header.addEventListener('mousedown', e => {
        if (e.target.closest('.nw-btn')) return;
        dragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragOriginX = state.x;
        dragOriginY = state.y;
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    // ── Resize ────────────────────────────────────────────────────────────────
    let resizing = false, resizeDir = '', resizeStart = {};

    widget.querySelectorAll('.nw-handle').forEach(handle => {
        handle.addEventListener('mousedown', e => {
            resizing = true;
            resizeDir = handle.dataset.dir;
            resizeStart = { x: e.clientX, y: e.clientY, ...state };
            document.body.style.userSelect = 'none';
            e.stopPropagation();
            e.preventDefault();
        });
    });

    // ── Unified mousemove ─────────────────────────────────────────────────────
    document.addEventListener('mousemove', e => {
        if (dragging) {
            state.x = Math.max(0, Math.min(dragOriginX + e.clientX - dragStartX, window.innerWidth  - state.w));
            state.y = Math.max(0, Math.min(dragOriginY + e.clientY - dragStartY, window.innerHeight - state.h));
            widget.style.left = state.x + 'px';
            widget.style.top  = state.y + 'px';
            return;
        }

        if (!resizing) return;
        const dx = e.clientX - resizeStart.x;
        const dy = e.clientY - resizeStart.y;
        const d  = resizeDir;

        let { x, y, w, h } = resizeStart;

        if (d.includes('e')) w = Math.min(MAX_W, Math.max(MIN_W, w + dx));
        if (d.includes('s')) h = Math.min(MAX_H, Math.max(MIN_H, h + dy));
        if (d.includes('w')) {
            const nw = Math.min(MAX_W, Math.max(MIN_W, w - dx));
            x = x + (w - nw);
            w = nw;
        }
        if (d.includes('n')) {
            const nh = Math.min(MAX_H, Math.max(MIN_H, h - dy));
            y = y + (h - nh);
            h = nh;
        }

        state = { x, y, w, h };
        applyState();
    });

    document.addEventListener('mouseup', () => {
        if (dragging || resizing) saveState();
        dragging = false;
        resizing = false;
        document.body.style.userSelect = '';
    });

    // ── Close ─────────────────────────────────────────────────────────────────
    document.getElementById('nw-close').addEventListener('click', () => {
        widget.style.display = 'none';
    });

    // ── Input ─────────────────────────────────────────────────────────────────
    const inputEl   = document.getElementById('nw-input');
    const sendBtn   = document.getElementById('nw-send');
    const chipsEl   = document.getElementById('nw-chips');
    const messagesEl = document.getElementById('nw-messages');

    inputEl.addEventListener('input', () => {
        inputEl.style.height = 'auto';
        inputEl.style.height = Math.min(inputEl.scrollHeight, 96) + 'px';
        sendBtn.disabled = inputEl.value.trim().length === 0;
    });

    inputEl.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!sendBtn.disabled) doSend(); }
    });

    sendBtn.addEventListener('click', doSend);

    chipsEl.querySelectorAll('.nw-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const prompts = {
                summarize: 'Please summarize this page for me.',
                keypoints: 'What are the most important key points on this page?',
                extract:   'Extract the key data and facts from this page into a structured list.',
                translate: 'Translate the main content of this page to English.'
            };
            inputEl.value = prompts[chip.dataset.action] || '';
            inputEl.dispatchEvent(new Event('input'));
            doSend();
        });
    });

    // ── Send ──────────────────────────────────────────────────────────────────
    async function doSend() {
        const text = inputEl.value.trim();
        if (!text || isThinking) return;

        chipsEl.style.display = 'none';
        appendMsg('user', text);
        chatHistory.push({ role: 'user', text });
        inputEl.value = '';
        inputEl.style.height = 'auto';
        sendBtn.disabled = true;

        const thinkId = showThinking();
        isThinking = true;
        try {
            const answer = await askAI(text);
            removeThinking(thinkId);
            appendMsg('ai', answer);
            chatHistory.push({ role: 'ai', text: answer });
        } catch (err) {
            removeThinking(thinkId);
            appendMsg('ai', 'Something went wrong. Please check your Gemini API key in Settings.');
        } finally {
            isThinking = false;
        }
    }

    async function askAI(userMessage) {
        const systemPrompt = `You are Nova, a helpful AI assistant embedded in a browser extension.
Help users understand web pages, summarize content, extract information, and answer questions.
Keep responses concise and well-structured. Use bullet points for lists when helpful.
Current page: "${document.title}" (${location.hostname}).`;

        let prompt = '';
        const isSelectionQuery = userMessage.startsWith('"') && userMessage.includes('\n\n');
        if (isSelectionQuery) {
            // Selection-based query — only pass the selection itself as context, not the full page
        } else if (pageContent && /summarize|summary|page|this|extract|what|key|point|content|tell|explain|describe|find|show|list/i.test(userMessage)) {
            prompt += `Page content:\n${pageContent}\n\n`;
        }
        chatHistory.slice(-4).forEach(m => {
            prompt += `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}\n`;
        });
        prompt += `User: ${userMessage}`;

        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'AI_REQUEST',
                prompt,
                systemInstruction: systemPrompt,
                options: { maxTokens: 1024, temperature: 0.7 }
            }, result => {
                if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                if (result?.success && result.text) return resolve(result.text.trim());
                reject(new Error(result?.error || 'AI request failed'));
            });
        });
    }

    // ── Render helpers ────────────────────────────────────────────────────────
    function appendMsg(role, text) {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const wrap = document.createElement('div');
        wrap.className = `nw-msg ${role}`;
        if (role === 'ai') {
            wrap.innerHTML = `<div class="nw-avatar">N</div><div><div class="nw-bubble">${fmt(text)}</div><div class="nw-time">${time}</div></div>`;
        } else {
            wrap.innerHTML = `<div><div class="nw-bubble">${esc(text)}</div><div class="nw-time">${time}</div></div>`;
        }
        messagesEl.appendChild(wrap);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function fmt(text) {
        return esc(text)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/^[•\-\*] (.+)$/gm, '<li>$1</li>')
            .replace(/(<li>.*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
            .replace(/\n/g, '<br>');
    }

    function esc(t) {
        return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function showThinking() {
        const id = 'nw-think-' + Date.now();
        const wrap = document.createElement('div');
        wrap.className = 'nw-msg ai'; wrap.id = id;
        wrap.innerHTML = `<div class="nw-avatar">N</div><div class="nw-thinking"><div class="nw-dot"></div><div class="nw-dot"></div><div class="nw-dot"></div></div>`;
        messagesEl.appendChild(wrap);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return id;
    }

    function removeThinking(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    // ── Listen for selected-text from context menu ────────────────────────────
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type !== 'NOVA_SELECTION' || !message.text) return;

        // Make sure widget is visible
        widget.style.display = 'flex';

        // Build the question with the selection as inline context
        const question = `"${message.text}"\n\nExplain this to me.`;
        inputEl.value = question;
        inputEl.dispatchEvent(new Event('input'));
        // Auto-send after a brief moment so the user sees what's being asked
        setTimeout(doSend, 120);
    });

    // ── Entrance pop animation ────────────────────────────────────────────────
    widget.style.opacity = '0';
    widget.style.transform = 'scale(0.92)';
    widget.style.transition = 'opacity 0.2s ease, transform 0.2s cubic-bezier(0.34,1.56,0.64,1)';
    requestAnimationFrame(() => {
        widget.style.opacity = '1';
        widget.style.transform = 'scale(1)';
    });

})();
