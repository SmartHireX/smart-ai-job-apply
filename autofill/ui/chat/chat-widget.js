/**
 * Nova Floating Chat Widget
 * Draggable + resizable chat window injected into any page.
 */
(function () {
    const WIDGET_ID = 'nova-chat-widget';
    const WIDGET_VERSION = '3.0';

    console.log('[Nova] widget loading version', WIDGET_VERSION);

    // Always destroy and recreate — guarantees fresh code runs every time
    const existing = document.getElementById(WIDGET_ID);
    if (existing) {
        existing.remove();
        document.getElementById('nova-chat-widget-styles')?.remove();
    }

    // ── Default size / position ───────────────────────────────────────────────
    const DEFAULT = { w: 380, h: 520, x: window.innerWidth - 400, y: window.innerHeight - 540 };
    const MIN_W = 300, MIN_H = 360, MAX_W = 800, MAX_H = 900;

    let state = { ...DEFAULT };
    let isThinking = false, pageContent = '';
    let activeProvider = localStorage.getItem('nova_provider') || 'gemini';

    // History is passed from popup via window.__novaHistory before script injection
    // Widget saves to it in memory; popup reads it back via window.__novaHistory on next open
    const _seed = (window.__novaHistory && Array.isArray(window.__novaHistory))
        ? window.__novaHistory
        : [];
    window.__novaHistory = _seed; // keep reference live so popup can read it back

    if (window.__novaProvider) {
        activeProvider = window.__novaProvider;
    }

    const chatHistory = new Proxy(_seed, {
        get(target, prop) {
            if (prop === 'push') {
                return (...args) => {
                    const result = Array.prototype.push.apply(target, args);
                    // Keep window.__novaHistory in sync so popup can read it on re-open
                    window.__novaHistory = target.slice(-40);
                    return result;
                };
            }
            const val = target[prop];
            return typeof val === 'function' ? val.bind(target) : val;
        }
    });

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
        .nw-actions { display: flex; gap: 5px; align-items: center; }
        .nw-provider-toggle {
            display: flex; border: 1px solid #e5e7eb; border-radius: 7px; overflow: hidden; flex-shrink: 0;
        }
        .nw-provider-btn {
            padding: 3px 8px; font-size: 10px; font-weight: 600; border: none; background: #f9fafb;
            color: #6b7280; cursor: pointer; transition: all 0.15s; font-family: inherit; line-height: 1.4;
        }
        .nw-provider-btn.active { background: #6366f1; color: white; }
        .nw-provider-btn:first-child { border-right: 1px solid #e5e7eb; }
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
    widget.dataset.version = WIDGET_VERSION;
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
                <div class="nw-provider-toggle">
                    <button class="nw-provider-btn active" id="nw-use-gemini" title="Use Google Gemini">Gemini</button>
                    <button class="nw-provider-btn" id="nw-use-groq" title="Use Groq (faster)">Groq</button>
                </div>
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

    // ── Restore chat history passed from popup ────────────────────────────────
    const messagesEl = document.getElementById('nw-messages');
    if (_seed.length) {
        messagesEl.innerHTML = ''; // remove default welcome message
        _seed.forEach(m => renderMsg(m.role, m.text));
        document.getElementById('nw-chips').style.display = 'none';
        messagesEl.scrollTop = messagesEl.scrollHeight;
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

    // ── Provider toggle ───────────────────────────────────────────────────────
    const geminiBtn = document.getElementById('nw-use-gemini');
    const groqBtn   = document.getElementById('nw-use-groq');

    function setProvider(p) {
        activeProvider = p;
        localStorage.setItem('nova_provider', p);
        geminiBtn.classList.toggle('active', p === 'gemini');
        groqBtn.classList.toggle('active', p === 'groq');
    }

    // Restore saved provider
    setProvider(activeProvider);

    geminiBtn.addEventListener('click', () => setProvider('gemini'));
    groqBtn.addEventListener('click',   () => setProvider('groq'));

    // ── Input ─────────────────────────────────────────────────────────────────
    const inputEl   = document.getElementById('nw-input');
    const sendBtn   = document.getElementById('nw-send');
    const chipsEl   = document.getElementById('nw-chips');

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


    // ─────────────────────────────────────────────────────────────────────────
    // INTENT ENGINE  (two-step, fully AI-driven)
    //
    // Step 1 — classifyIntent(): one fast AI call, returns JSON with intent type
    //          + enough metadata to know what to do next. No action taken here.
    //
    // Step 2 — resolveAction(): per-intent AI call that does the actual work:
    //          navigate → resolves the URL
    //          search   → builds query + picks engine
    //          chat/summarize/explain/write/extract/translate → generates content
    //          scroll/copy/fill → no AI needed, executed directly
    // ─────────────────────────────────────────────────────────────────────────

    // ── Step 1: Classify intent ───────────────────────────────────────────────
    async function classifyIntent(userText) {
        const history = chatHistory.slice(-2)
            .map(m => `${m.role === 'user' ? 'User' : 'Nova'}: ${m.text}`)
            .join('\n') || 'none';

        // Keep prompt SHORT — long prompts cause models to add explanation text
        const prompt =
`You are an intent classifier. Return ONLY a JSON object, nothing else.

Page: ${location.href}
History: ${history}
User: "${userText}"

Possible outputs:
{"intent":"navigate","destination":"<plain words, e.g. my LinkedIn profile>"}
{"intent":"search","query":"<terms>","engine":"google|youtube|linkedin|twitter|github"}
{"intent":"summarize"}
{"intent":"explain","topic":"<topic>"}
{"intent":"extract","what":"<what>"}
{"intent":"translate","language":"<lang>"}
{"intent":"write","type":"email|message|post|other","about":"<desc>"}
{"intent":"scroll","direction":"up|down|top|bottom"}
{"intent":"copy","what":"url|title|text"}
{"intent":"fill","fields":"<fields or all>"}
{"intent":"multi","intents":[<obj>,<obj>]}
{"intent":"chat"}

JSON:`;

        return new Promise(resolve => {
            chrome.runtime.sendMessage({
                type: 'AI_REQUEST',
                prompt,
                systemInstruction: 'Return ONLY a valid JSON object. No markdown. No explanation. No other text.',
                options: { maxTokens: 200, temperature: 0, provider: activeProvider }
            }, result => {
                if (chrome.runtime.lastError || !result?.success) {
                    console.warn('[Nova] classifyIntent call failed:', chrome.runtime.lastError?.message);
                    return resolve({ intent: 'chat' });
                }
                const raw = (result.text || '').trim();
                console.log('[Nova] classify raw:', raw);
                try {
                    // Extract first complete JSON object — handles any prefix/suffix text
                    const match = raw.match(/\{[\s\S]*\}/);
                    if (!match) throw new Error('no JSON block found');
                    const json = JSON.parse(match[0]);
                    console.log('[Nova] intent:', json);
                    resolve(json);
                } catch (e) {
                    console.warn('[Nova] intent parse failed:', e.message, '| raw:', raw);
                    resolve({ intent: 'chat' });
                }
            });
        });
    }

    // ── Step 2: Resolve action per intent ────────────────────────────────────

    // For navigate: AI resolves destination + visible page links → full {intent, url, label}
    async function resolveUrl(destination) {
        // Collect anchor hrefs visible on page for SPA / internal nav context
        const pageLinks = Array.from(document.querySelectorAll('a[href]'))
            .map(a => a.href)
            .filter(h => h.startsWith('http'))
            .slice(0, 40) // cap at 40 to stay within token budget
            .join('\n');

        return new Promise(resolve => {
            chrome.runtime.sendMessage({
                type: 'AI_REQUEST',
                prompt: `Current page URL: ${location.href}
User wants to open: "${destination}"
${pageLinks ? `\nVisible page links (use these to match internal navigation):\n${pageLinks}` : ''}

Return JSON: {"intent":"navigate","url":"<full absolute URL>","label":"<short label>"}
Prefer matching a visible link if relevant. Otherwise use your knowledge of this site's URL structure.`,
                systemInstruction: 'URL resolver. Return only JSON: {"intent":"navigate","url":"https://...","label":"..."}. No markdown, no explanation.',
                options: { maxTokens: 150, temperature: 0, provider: activeProvider }
            }, result => {
                console.log('[Nova] resolveUrl raw:', result?.text);
                if (chrome.runtime.lastError || !result?.success) return resolve(null);
                try {
                    const raw = (result.text || '').trim();
                    // Try JSON first
                    const match = raw.match(/\{[\s\S]*?\}/);
                    if (match) {
                        const json = JSON.parse(match[0]);
                        if (json.url?.startsWith('http')) return resolve(json);
                    }
                    // Fallback: bare URL anywhere in the response
                    const urlMatch = raw.match(/https?:\/\/[^\s"'<>]+/);
                    if (urlMatch) return resolve({ intent: 'navigate', url: urlMatch[0], label: destination });
                    resolve(null);
                } catch {
                    const urlMatch = (result.text || '').match(/https?:\/\/[^\s"'<>]+/);
                    resolve(urlMatch ? { intent: 'navigate', url: urlMatch[0], label: destination } : null);
                }
            });
        });
    }

    // For fill: AI maps natural language field mentions to DOM form fields
    async function resolveFill(fields) {
        const formFields = Array.from(document.querySelectorAll('input,textarea,select'))
            .filter(el => el.offsetParent !== null) // visible only
            .map(el => ({
                tag: el.tagName.toLowerCase(),
                type: el.type || '',
                name: el.name || '',
                id: el.id || '',
                placeholder: el.placeholder || '',
                label: document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() || ''
            }))
            .slice(0, 30);

        if (!formFields.length) return { intent: 'fill', action: 'no_form' };

        return new Promise(resolve => {
            chrome.runtime.sendMessage({
                type: 'AI_REQUEST',
                prompt: `User wants to fill: "${fields}"
Visible form fields on page:
${JSON.stringify(formFields, null, 2)}

Return JSON: {"intent":"fill","action":"trigger","matchedFields":["<field name or id>",...],"message":"<brief confirmation>"}
If "all" or no specific fields mentioned, set matchedFields to ["all"].`,
                systemInstruction: 'Form field resolver. Return only JSON. No markdown.',
                options: { maxTokens: 200, temperature: 0, provider: activeProvider }
            }, result => {
                if (chrome.runtime.lastError || !result?.success) return resolve({ intent: 'fill', action: 'trigger' });
                try {
                    const match = (result.text || '').match(/\{[\s\S]*?\}/);
                    resolve(JSON.parse(match[0]));
                } catch {
                    resolve({ intent: 'fill', action: 'trigger' });
                }
            });
        });
    }

    // For content intents: AI generates the actual response
    async function resolveContent(intent, userText) {
        const ctx = pageContent
            ? `--- Page content ---\n${pageContent.slice(0, 6000)}\n---\n\n`
            : '';
        const history = chatHistory.slice(-4)
            .map(m => `${m.role === 'user' ? 'User' : 'Nova'}: ${m.text}`)
            .join('\n');

        let prompt;
        if (intent.intent === 'summarize') {
            prompt = `${ctx}Summarize this page:\n• 2-3 sentence overview\n• Key points (max 5 bullets)\n• What the user might want to do next`;
        } else if (intent.intent === 'explain') {
            prompt = `Explain "${intent.topic}":\n• What it is (one sentence)\n• Why it matters\n• One concrete example`;
        } else if (intent.intent === 'extract') {
            prompt = `${ctx}Extract ${intent.what} from this page as a clean structured list. If nothing found, say so.`;
        } else if (intent.intent === 'translate') {
            prompt = `${ctx}Translate the main content of this page to ${intent.language}. Keep formatting intact.`;
        } else if (intent.intent === 'write') {
            prompt = `Write a ${intent.type} about: "${intent.about}".\nContext: currently on ${document.title} (${location.href}).\nMake it professional, ready to use, no placeholder brackets.`;
        } else {
            // chat
            const needsPage = pageContent && /\b(page|this|here|content|article|post|job|profile)\b/i.test(userText);
            prompt = `${needsPage ? ctx : ''}${history ? history + '\n' : ''}User: ${userText}`;
        }

        return callAI(prompt, NOVA_SYSTEM);
    }

    // ── Action handlers ───────────────────────────────────────────────────────

    function navigate(url, label) {
        const safeUrl = /^https?:\/\//.test(url) ? url : 'https://' + url;
        const displayLabel = label || safeUrl;
        // Show clickable button — user can click it manually too
        appendMsgRaw('ai',
            `Opening <strong>${esc(displayLabel)}</strong><br>` +
            `<a href="${safeUrl}" target="_blank" rel="noopener" ` +
            `style="display:inline-flex;align-items:center;gap:5px;margin-top:6px;padding:6px 14px;` +
            `background:#6366f1;color:white;border-radius:8px;font-size:12px;font-weight:600;` +
            `text-decoration:none;cursor:pointer;">` +
            `↗ Open ${esc(displayLabel)}</a>`
        );
        // Also navigate the tab
        try { chrome.runtime.sendMessage({ type: 'NAVIGATE', url: safeUrl }); }
        catch { window.open(safeUrl, '_blank'); }
    }

    function search(query, engine = 'google') {
        const labels = { google: 'Google', youtube: 'YouTube', linkedin: 'LinkedIn', twitter: 'Twitter', github: 'GitHub' };
        const urls = {
            google:   `https://www.google.com/search?q=${encodeURIComponent(query)}`,
            youtube:  `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
            linkedin: `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(query)}`,
            twitter:  `https://twitter.com/search?q=${encodeURIComponent(query)}`,
            github:   `https://github.com/search?q=${encodeURIComponent(query)}`,
        };
        const url = urls[engine] || urls.google;
        appendMsgRaw('ai', `🔍 Searching <strong>${esc(query)}</strong> on ${labels[engine] || 'Google'} <a href="${url}" target="_blank" rel="noopener" style="color:#6366f1;font-weight:600;">↗ Open results</a>`);
        try { chrome.runtime.sendMessage({ type: 'NAVIGATE', url }); }
        catch { window.location.href = url; }
    }

    function scrollPage(direction) {
        const actions = {
            top:    () => window.scrollTo({ top: 0, behavior: 'smooth' }),
            bottom: () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }),
            down:   () => window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' }),
            up:     () => window.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' }),
        };
        (actions[direction] || actions.down)();
        appendMsgRaw('ai', `✓ Scrolled ${direction}.`);
    }

    function copyToClipboard(what) {
        const values = {
            url:   location.href,
            title: document.title,
            text:  window.getSelection()?.toString() || document.title,
        };
        navigator.clipboard.writeText(values[what] || values.url).then(() => {
            appendMsgRaw('ai', `✓ Copied <strong>${esc(what)}</strong> to clipboard.`);
        }).catch(() => {
            appendMsgRaw('ai', `Couldn't copy automatically — try selecting and copying manually.`);
        });
    }

    // ── Dispatcher: executes one intent object ────────────────────────────────
    async function dispatchIntent(intent, originalText, thinkId) {
        switch (intent.intent) {

            case 'navigate': {
                // thinkId stays on while resolveUrl runs — user sees "thinking"
                const resolved = await resolveUrl(intent.destination || originalText);
                if (resolved?.url) {
                    navigate(resolved.url, resolved.label);
                    chatHistory.push({ role: 'ai', text: `Navigating to ${resolved.label || resolved.url}` });
                } else {
                    // Fallback — show a clickable google search so user isn't stuck
                    const q = encodeURIComponent((intent.destination || originalText) + ' site:' + location.hostname);
                    const searchUrl = `https://www.google.com/search?q=${q}`;
                    appendMsgRaw('ai',
                        `Couldn't resolve that URL automatically. Try one of these:<br>` +
                        `<a href="${searchUrl}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:5px;margin-top:6px;padding:6px 14px;background:#6366f1;color:white;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none;">🔍 Search on Google</a>`
                    );
                }
                break;
            }

            case 'search': {
                search(intent.query || originalText, intent.engine);
                chatHistory.push({ role: 'ai', text: `Searching: ${intent.query}` });
                break;
            }

            case 'scroll': {
                scrollPage(intent.direction || 'down');
                chatHistory.push({ role: 'ai', text: `Scrolled ${intent.direction || 'down'}` });
                break;
            }

            case 'copy': {
                copyToClipboard(intent.what || 'url');
                chatHistory.push({ role: 'ai', text: `Copied ${intent.what || 'url'}` });
                break;
            }

            case 'fill': {
                const fillResult = await resolveFill(intent.fields || 'all');
                if (fillResult.action === 'no_form') {
                    appendMsg('ai', 'No form detected on this page.');
                } else {
                    try { chrome.runtime.sendMessage({ type: 'START_LOCAL_PROCESSING' }); } catch {}
                    const msg = fillResult.message || `Auto-filling form...`;
                    appendMsg('ai', `**${msg}**`);
                    chatHistory.push({ role: 'ai', text: msg });
                }
                break;
            }

            default: {
                // summarize / explain / extract / translate / write / chat
                const answer = await resolveContent(intent, originalText);
                appendMsg('ai', answer);
                chatHistory.push({ role: 'ai', text: answer });
                break;
            }
        }
    }

    // Single AI call function used for all AI-generated responses
    async function callAI(prompt, systemInstruction) {
        return new Promise((resolve, reject) => {
            try {
                chrome.runtime.sendMessage({
                    type: 'AI_REQUEST',
                    prompt,
                    systemInstruction,
                    options: { maxTokens: 1024, temperature: 0.7, provider: activeProvider }
                }, result => {
                    const err = chrome.runtime.lastError;
                    if (err) {
                        const msg = err.message || '';
                        if (msg.includes('Extension context invalidated') || msg.includes('invalid')) {
                            return reject(new Error('__CONTEXT_INVALID__'));
                        }
                        return reject(new Error(msg));
                    }
                    if (result?.success && result.text) return resolve(result.text.trim());
                    reject(new Error(result?.error || 'AI request failed'));
                });
            } catch (e) {
                reject(new Error('__CONTEXT_INVALID__'));
            }
        });
    }

    const NOVA_SYSTEM = `You are Nova, a smart AI assistant built into a browser extension for job seekers.
You help users navigate the web, understand pages, write content, and find jobs.
Format your responses clearly: use **bold** for key terms, bullet points for lists, and keep answers concise.
Never say "I can't open links" or "I can't navigate" — Nova CAN take actions on the browser.
Current page: "${document.title}" at ${location.href}.`;

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
            const NAV_PATTERN = /\b(open|go to|take me to|navigate to|visit|show me|bring me to|launch)\b|\bmy (profile|account|settings|dashboard|inbox|messages|notifications|jobs|feed|network|connections|page|resume)\b/i;
            const isNav = NAV_PATTERN.test(text);
            console.log(`[Nova v${WIDGET_VERSION}] doSend: "${text}" | navPattern=${isNav}`);

            if (isNav) {
                const resolved = await resolveUrl(text);
                removeThinking(thinkId);
                if (resolved?.url) {
                    navigate(resolved.url, resolved.label);
                    chatHistory.push({ role: 'ai', text: `Navigating to ${resolved.label || resolved.url}` });
                } else {
                    const q = encodeURIComponent(text + ' ' + location.hostname);
                    const searchUrl = `https://www.google.com/search?q=${q}`;
                    appendMsgRaw('ai',
                        `Couldn't resolve that URL automatically. Try:<br>` +
                        `<a href="${searchUrl}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:5px;margin-top:6px;padding:6px 14px;background:#6366f1;color:white;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none;">🔍 Search on Google</a>`
                    );
                }
                isThinking = false; return;
            }

            // ── Step 1: classify intent (AI) ─────────────────────────────
            const intent = await classifyIntent(text);

            // ── Step 2: dispatch ──────────────────────────────────────────
            if (intent.intent === 'multi' && Array.isArray(intent.intents)) {
                for (const sub of intent.intents) {
                    await dispatchIntent(sub, text, thinkId);
                }
                removeThinking(thinkId);
                isThinking = false; return;
            }

            await dispatchIntent(intent, text, thinkId);
            removeThinking(thinkId);
        } catch (err) {
            removeThinking(thinkId);
            const msg = err.message || '';
            if (msg === '__CONTEXT_INVALID__') {
                appendMsg('ai', '⚠️ Extension was reloaded. Please refresh this page, then re-open the widget.');
            } else if (msg.includes('API key not valid') || msg.includes('invalid') || msg.includes('API_KEY')) {
                appendMsg('ai', '❌ Your Gemini API key is invalid or revoked. Please go to Nova Settings and save a new key.');
            } else if (msg.includes('quota') || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
                appendMsg('ai', '⏳ API quota exceeded. Please wait a minute and try again, or add another API key in Settings.');
            } else if (msg.includes('No working Gemini model') || msg.includes('404') || msg.includes('MODEL_NOT_FOUND')) {
                appendMsg('ai', '❌ No working Gemini model found. Your API key may not have access to any Gemini models. Check aistudio.google.com and re-save your key in Settings.');
            } else {
                appendMsg('ai', `❌ Error: ${msg || 'Unknown error. Check your API key in Settings.'}`);
            }
            console.error('[Nova widget] AI error:', msg);
        } finally {
            isThinking = false;
        }
    }

    async function askAI(userMessage) {
        let prompt = '';
        const isSelectionQuery = userMessage.startsWith('"') && userMessage.includes('\n\n');
        if (!isSelectionQuery && pageContent && /\b(summarize|summary|page|this|here|extract|what|key|point|content|tell|explain|describe|find|show|list)\b/i.test(userMessage)) {
            prompt += `--- Page content ---\n${pageContent.slice(0, 6000)}\n--- End ---\n\n`;
        }
        chatHistory.slice(-4).forEach(m => {
            prompt += `${m.role === 'user' ? 'User' : 'Nova'}: ${m.text}\n`;
        });
        prompt += `User: ${userMessage}`;
        return callAI(prompt, NOVA_SYSTEM);
    }

    // ── Render helpers ────────────────────────────────────────────────────────
    // Render a message without side-effects (used when restoring history)
    function renderMsg(role, text) {
        appendMsg(role, text);
    }

    function appendMsgRaw(role, html) {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const wrap = document.createElement('div');
        wrap.className = `nw-msg ${role}`;
        wrap.innerHTML = `<div class="nw-avatar">N</div><div><div class="nw-bubble">${html}</div><div class="nw-time">${time}</div></div>`;
        messagesEl.appendChild(wrap);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

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
        // Execute any NAVIGATE tags the AI returned
        const navMatch = text.match(/\[NAVIGATE:\s*(https?:\/\/[^\]]+)\]/i);
        if (navMatch) {
            const url = navMatch[1].trim();
            setTimeout(() => {
                try {
                    chrome.runtime.sendMessage({ type: 'NAVIGATE', url });
                } catch (e) {
                    window.location.href = url;
                }
            }, 600);
        }

        return esc(text)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/^[•\-\*] (.+)$/gm, '<li>$1</li>')
            .replace(/(<li>.*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
            // Render NAVIGATE tag as a visible open button
            .replace(/\[NAVIGATE:\s*(https?:\/\/[^\]]+)\]/gi, (_, url) =>
                `<a href="${esc(url)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;margin-top:6px;padding:5px 11px;background:#6366f1;color:white;border-radius:7px;font-size:12px;font-weight:600;text-decoration:none;">↗ Opening…</a>`)
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
