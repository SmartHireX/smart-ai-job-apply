/**
 * Nova Floating Chat Widget
 * Draggable + resizable chat window injected into any page.
 * Shared logic lives in shared/utils/nova-chat-core.js (NovaChatCore).
 */
(function () {
    const WIDGET_ID = 'nova-chat-widget';
    const WIDGET_VERSION = '3.0';

    function init() {

    // ── Alias shared core ─────────────────────────────────────────────────────
    const Core = window.NovaChatCore;
    if (!Core) { console.error('[Nova] nova-chat-core.js not loaded'); return; }
    const { esc, fmt: _fmt, getChipsForPage, resolveKnownUrl,
            buildSystemPrompt, buildClassifierPrompt,
            JT_STATUSES, JT_LABELS, jtLoad, jtSave,
            spLoad, spSave } = Core;
    // fmt needs onNavigate wired to chrome messaging — wrap it here
    const fmt = (text) => _fmt(text, url => {
        try { chrome.runtime.sendMessage({ type: 'NAVIGATE', url }); }
        catch { window.location.href = url; }
    });

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

    if (window.__novaProvider) {
        activeProvider = window.__novaProvider;
    }

    // chatHistory is filled synchronously from window.__novaHistory (popup pass-through),
    // or async from chrome.storage.local after render (auto-restore path).
    const _seed = (window.__novaHistory && Array.isArray(window.__novaHistory) && window.__novaHistory.length)
        ? window.__novaHistory
        : [];

    const chatHistory = new Proxy(_seed, {
        get(target, prop) {
            if (prop === 'push') {
                return (...args) => {
                    const result = Array.prototype.push.apply(target, args);
                    const slice = target.slice(-40);
                    // Keep window.__novaHistory in sync so popup can read it on re-open
                    window.__novaHistory = slice;
                    // Persist to chrome.storage.local — shared with popup
                    try { chrome.storage.local.set({ nova_chat_history: slice }); } catch {}
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
        /* ── Header menu dropdown ── */
        .nw-menu-wrap { position: relative; }
        .nw-menu {
            position: absolute; top: calc(100% + 6px); right: 0;
            background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.12); min-width: 170px;
            z-index: 10; overflow: hidden;
            opacity: 0; transform: translateY(-6px) scale(0.97);
            transition: opacity 0.15s, transform 0.15s;
            pointer-events: none;
        }
        .nw-menu.open { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
        .nw-menu-item {
            display: flex; align-items: center; gap: 9px;
            padding: 9px 14px; font-size: 12px; font-weight: 500;
            color: #374151; cursor: pointer; transition: background 0.1s;
            border: none; background: none; width: 100%; text-align: left; font-family: inherit;
        }
        .nw-menu-item:hover { background: #f9fafb; }
        .nw-menu-item.danger:hover { background: #fef2f2; color: #dc2626; }
        .nw-menu-item svg { flex-shrink: 0; }
        .nw-menu-sep { height: 1px; background: #f3f4f6; margin: 3px 0; }
        .nw-menu-sub {
            padding: 6px 14px 10px; border-top: 1px solid #f3f4f6;
        }
        .nw-menu-sub-label { font-size: 10px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
        .nw-menu-provider {
            display: flex; border: 1px solid #e5e7eb; border-radius: 7px; overflow: hidden;
        }
        .nw-menu-provider .nw-provider-btn { flex: 1; text-align: center; }
        /* ── Saved pages panel ── */
        .nw-sp-panel {
            position: absolute; inset: 0; background: #fff; z-index: 5;
            display: flex; flex-direction: column;
            transform: translateX(100%);
            transition: transform 0.22s cubic-bezier(0.4,0,0.2,1);
        }
        .nw-sp-panel.open { transform: translateX(0); }
        .nw-sp-panel-header {
            display: flex; align-items: center; gap: 10px;
            padding: 0 14px; height: 50px;
            border-bottom: 1px solid #e5e7eb; flex-shrink: 0;
        }
        .nw-sp-panel-back {
            width: 28px; height: 28px; border: 1px solid #e5e7eb;
            border-radius: 7px; background: #fff; color: #6b7280;
            cursor: pointer; display: flex; align-items: center;
            justify-content: center; transition: all 0.15s; flex-shrink: 0;
        }
        .nw-sp-panel-back:hover { background: #f3f4f6; color: #111827; }
        .nw-sp-panel-title { flex: 1; font-size: 13px; font-weight: 700; color: #111827; }
        .nw-sp-panel-count { font-size: 11px; color: #9ca3af; }
        .nw-sp-list {
            flex: 1; overflow-y: auto; padding: 10px 12px;
            display: flex; flex-direction: column; gap: 8px;
        }
        .nw-sp-list::-webkit-scrollbar { width: 4px; }
        .nw-sp-list::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 2px; }
        .nw-sp-empty { font-size: 12px; color: #9ca3af; text-align: center; padding: 32px 0; line-height: 1.6; }
        /* ── Save toast (header badge) ── */
        .nw-save-toast {
            position: absolute; top: 52px; left: 50%; transform: translateX(-50%);
            background: #111827; color: #fff; font-size: 11px; font-weight: 500;
            padding: 5px 12px; border-radius: 999px;
            white-space: nowrap; pointer-events: none; z-index: 20;
            opacity: 0; transition: opacity 0.2s;
        }
        .nw-save-toast.show { opacity: 1; }
        /* ── Context bar ── */
        .nw-context {
            display: flex; align-items: center; gap: 6px;
            padding: 5px 10px 5px 14px; background: #f9fafb;
            border-bottom: 1px solid #f3f4f6; flex-shrink: 0;
        }
        .nw-bookmark-btn {
            margin-left: auto; flex-shrink: 0;
            width: 24px; height: 24px; border-radius: 6px;
            border: 1px solid #e5e7eb; background: #fff;
            color: #9ca3af; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.15s;
        }
        .nw-bookmark-btn:hover { background: #eef2ff; border-color: #6366f1; color: #6366f1; }
        .nw-bookmark-btn.saved { background: #eef2ff; border-color: #6366f1; color: #6366f1; }
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
        .nw-msg.ai  > div:not(.nw-avatar) { max-width: 75%; }
        .nw-msg.user > div:not(.nw-avatar) { max-width: 75%; display: flex; flex-direction: column; align-items: flex-end; }
        .nw-avatar {
            width: 26px; height: 26px; border-radius: 7px;
            background: #6366f1; color: white; font-size: 11px; font-weight: 800;
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0; margin-top: 1px;
        }
        .nw-bubble {
            padding: 9px 12px;
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
        /* ── Copy button on AI bubbles ── */
        .nw-msg-wrap { position: relative; }
        .nw-copy-btn {
            position: absolute; top: 4px;
            width: 22px; height: 22px; border-radius: 5px;
            border: 1px solid #e5e7eb; background: #fff;
            color: #9ca3af; cursor: pointer; font-size: 11px;
            display: flex; align-items: center; justify-content: center;
            opacity: 0; transition: opacity 0.15s, color 0.15s;
        }
        .nw-msg.ai .nw-copy-btn { right: 0; }
        .nw-msg.ai:hover .nw-copy-btn { opacity: 1; }
        .nw-copy-btn:hover { color: #6366f1; border-color: #6366f1; }
        .nw-copy-btn.copied { color: #10b981; border-color: #10b981; }
        /* ── Edit button on user messages ── */
        .nw-edit-btn {
            width: 20px; height: 20px; border-radius: 5px;
            border: 1px solid #e5e7eb; background: #fff;
            color: #9ca3af; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            opacity: 0; transition: opacity 0.15s, color 0.15s;
            flex-shrink: 0; align-self: flex-end; margin-bottom: 18px;
        }
        .nw-msg.user:hover .nw-edit-btn { opacity: 1; }
        .nw-edit-btn:hover { color: #6366f1; border-color: #6366f1; }
        /* ── Code blocks ── */
        .nw-bubble pre {
            background: #1e1e2e; color: #cdd6f4;
            border-radius: 8px; padding: 10px 12px;
            font-size: 11.5px; font-family: 'Fira Mono', 'Consolas', monospace;
            overflow-x: auto; margin: 6px 0 2px; line-height: 1.5;
            white-space: pre-wrap; word-break: break-all;
        }
        .nw-bubble pre code { background: none; padding: 0; font-size: inherit; }
        /* ── Ordered lists ── */
        .nw-bubble ol { padding-left: 18px; margin-top: 4px; display: flex; flex-direction: column; gap: 2px; }
        /* ── Minimize bubble ── */
        #nw-bubble-btn {
            position: fixed; z-index: 2147483646;
            width: 46px; height: 46px; border-radius: 50%;
            background: #6366f1; color: white;
            border: none; cursor: pointer;
            display: none; align-items: center; justify-content: center;
            box-shadow: 0 4px 20px rgba(99,102,241,0.4);
            font-size: 16px; font-weight: 800;
            transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.15s;
        }
        #nw-bubble-btn:hover { transform: scale(1.1); box-shadow: 0 6px 24px rgba(99,102,241,0.5); }
        /* ── Char counter ── */
        .nw-char-count { font-size: 10px; color: #d1d5db; align-self: flex-end; padding-bottom: 2px; flex-shrink: 0; transition: color 0.15s; }
        .nw-char-count.warn { color: #f59e0b; }
        .nw-char-count.danger { color: #ef4444; }
        /* ── Job tracker ── */
        .nw-jt-header { font-size: 13px; font-weight: 700; color: #111827; margin-bottom: 10px; }
        .nw-jt-empty { font-size: 12px; color: #9ca3af; text-align: center; padding: 12px 0; }
        .nw-job-card {
            background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
            padding: 10px 12px; margin-bottom: 8px; display: flex; flex-direction: column; gap: 5px;
        }
        .nw-job-card:last-child { margin-bottom: 0; }
        .nw-job-title { font-size: 12px; font-weight: 700; color: #111827; line-height: 1.3; }
        .nw-job-meta { font-size: 11px; color: #6b7280; }
        .nw-job-actions { display: flex; align-items: center; gap: 6px; margin-top: 2px; flex-wrap: wrap; }
        .nw-status-badge {
            padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600;
            border: none; cursor: pointer; font-family: inherit; transition: all 0.15s;
        }
        .nw-status-badge.saved     { background: #eef2ff; color: #6366f1; }
        .nw-status-badge.applied   { background: #eff6ff; color: #3b82f6; }
        .nw-status-badge.interview { background: #fffbeb; color: #d97706; }
        .nw-status-badge.offer     { background: #f0fdf4; color: #16a34a; }
        .nw-status-badge.rejected  { background: #fef2f2; color: #dc2626; }
        .nw-job-link {
            font-size: 10px; font-weight: 600; color: #6366f1; text-decoration: none;
            padding: 2px 6px; border: 1px solid #e5e7eb; border-radius: 5px;
            transition: all 0.15s;
        }
        .nw-job-link:hover { background: #eef2ff; border-color: #6366f1; }
        .nw-job-remove {
            margin-left: auto; font-size: 10px; color: #9ca3af; background: none;
            border: none; cursor: pointer; padding: 2px 4px; border-radius: 4px;
            font-family: inherit; transition: color 0.15s;
        }
        .nw-job-remove:hover { color: #ef4444; }
        /* ── Saved pages ── */
        .nw-sp-card {
            background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
            padding: 10px 12px; margin-bottom: 8px; display: flex; flex-direction: column; gap: 4px;
        }
        .nw-sp-card:last-child { margin-bottom: 0; }
        .nw-sp-title { font-size: 12px; font-weight: 700; color: #111827; line-height: 1.3; }
        .nw-sp-url {
            font-size: 10px; color: #9ca3af; white-space: nowrap;
            overflow: hidden; text-overflow: ellipsis;
        }
        .nw-sp-actions { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
        .nw-sp-open {
            font-size: 10px; font-weight: 600; color: #6366f1; text-decoration: none;
            padding: 2px 6px; border: 1px solid #e5e7eb; border-radius: 5px; transition: all 0.15s;
        }
        .nw-sp-open:hover { background: #eef2ff; border-color: #6366f1; }
        .nw-sp-date { font-size: 10px; color: #9ca3af; }
        .nw-sp-remove {
            margin-left: auto; font-size: 10px; color: #9ca3af; background: none;
            border: none; cursor: pointer; padding: 2px 4px; border-radius: 4px;
            font-family: inherit; transition: color 0.15s;
        }
        .nw-sp-remove:hover { color: #ef4444; }
        .nw-sp-tag {
            display: inline-block; padding: 1px 6px; border-radius: 999px;
            font-size: 9px; font-weight: 600; background: #f3f4f6; color: #6b7280;
        }
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
                <div class="nw-menu-wrap">
                    <button class="nw-btn" id="nw-menu-btn" title="Menu">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <circle cx="12" cy="5" r="1.2" fill="currentColor" stroke="none"/>
                            <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
                            <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none"/>
                        </svg>
                    </button>
                    <div class="nw-menu" id="nw-menu">
                        <button class="nw-menu-item" id="nw-menu-pages">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                            Saved Pages
                        </button>
                        <button class="nw-menu-item" id="nw-menu-fill">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            Fill Form
                        </button>
                        <button class="nw-menu-item" id="nw-menu-clear">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                            Clear chat
                        </button>
                        <div class="nw-menu-sep"></div>
                        <div class="nw-menu-sub">
                            <div class="nw-menu-sub-label">AI Provider</div>
                            <div class="nw-menu-provider nw-provider-toggle">
                                <button class="nw-provider-btn active" id="nw-use-gemini">Gemini</button>
                                <button class="nw-provider-btn" id="nw-use-groq">Groq</button>
                            </div>
                        </div>
                        <div class="nw-menu-sep"></div>
                        <button class="nw-menu-item danger" id="nw-menu-close">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            Close chat
                        </button>
                    </div>
                </div>
            </div>
        </div>
        <!-- Saved pages panel (slides over chat) -->
        <div class="nw-sp-panel" id="nw-sp-panel">
            <div class="nw-sp-panel-header">
                <button class="nw-sp-panel-back" id="nw-sp-back">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <div class="nw-sp-panel-title">🔖 Saved Pages</div>
                <div class="nw-sp-panel-count" id="nw-sp-count"></div>
            </div>
            <div class="nw-sp-list" id="nw-sp-list"></div>
        </div>
        <div class="nw-save-toast" id="nw-save-toast"></div>

        <div class="nw-context">
            <div class="nw-context-dot"></div>
            <div class="nw-context-text" id="nw-page-title">Loading...</div>
            <button class="nw-bookmark-btn" id="nw-bookmark-btn" title="Save this page">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            </button>
        </div>

        <div class="nw-messages" id="nw-messages">
            <div class="nw-msg ai">
                <div class="nw-avatar">N</div>
                <div><div class="nw-bubble">Hi! I can summarize this page, extract info, or answer any question. What do you need?</div></div>
            </div>
        </div>

        <div class="nw-chips" id="nw-chips"></div>

        <div class="nw-input-area">
            <div class="nw-input-row">
                <textarea class="nw-textarea" id="nw-input" placeholder="Ask anything about this page..." rows="1" maxlength="2000"></textarea>
                <span class="nw-char-count" id="nw-char-count"></span>
                <button class="nw-send" id="nw-send" disabled>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(widget);

    // ── Minimize bubble (lives outside widget so it survives widget.style.display = 'none') ──
    const bubbleBtn = document.createElement('button');
    bubbleBtn.id = 'nw-bubble-btn';
    bubbleBtn.textContent = 'N';
    bubbleBtn.title = 'Open Nova';
    document.body.appendChild(bubbleBtn);

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

    // ── Restore chat history ──────────────────────────────────────────────────
    const messagesEl = document.getElementById('nw-messages');
    if (_seed.length) {
        // History was passed directly from popup — render immediately
        messagesEl.innerHTML = '';
        _seed.forEach(m => renderMsg(m.role, m.text));
        document.getElementById('nw-chips').style.display = 'none';
        messagesEl.scrollTop = messagesEl.scrollHeight;
    } else {
        // Auto-restore after navigation — load from shared chrome.storage.local
        try {
            chrome.storage.local.get(['nova_chat_history'], result => {
                const saved = result.nova_chat_history;
                if (!Array.isArray(saved) || !saved.length) return;
                // Splice into backing array so chatHistory is authoritative
                _seed.push(...saved);
                window.__novaHistory = _seed;
                messagesEl.innerHTML = '';
                saved.forEach(m => renderMsg(m.role, m.text));
                document.getElementById('nw-chips').style.display = 'none';
                messagesEl.scrollTop = messagesEl.scrollHeight;
            });
        } catch {}
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

    // ── Minimize / restore ────────────────────────────────────────────────────
    function positionBubble() {
        bubbleBtn.style.right = '20px';
        bubbleBtn.style.bottom = '20px';
    }
    positionBubble();

    function minimize() {
        widget.style.display = 'none';
        bubbleBtn.style.display = 'flex';
        try { localStorage.removeItem('nova_widget_open'); } catch {}
    }

    function restore() {
        bubbleBtn.style.display = 'none';
        widget.style.display = 'flex';
        messagesEl.scrollTop = messagesEl.scrollHeight;
        try { localStorage.setItem('nova_widget_open', '1'); } catch {}
    }

    // Mark widget as open on first load (it starts visible)
    try { localStorage.setItem('nova_widget_open', '1'); } catch {}

    bubbleBtn.addEventListener('click', restore);

    // ── Provider toggle ───────────────────────────────────────────────────────
    const geminiBtn = document.getElementById('nw-use-gemini');
    const groqBtn   = document.getElementById('nw-use-groq');

    function setProvider(p) {
        activeProvider = p;
        localStorage.setItem('nova_provider', p);
        geminiBtn.classList.toggle('active', p === 'gemini');
        groqBtn.classList.toggle('active', p === 'groq');
    }
    setProvider(activeProvider);
    geminiBtn.addEventListener('click', () => { setProvider('gemini'); closeMenu(); });
    groqBtn.addEventListener('click',   () => { setProvider('groq');   closeMenu(); });

    // ── Header menu ───────────────────────────────────────────────────────────
    const menuBtn  = document.getElementById('nw-menu-btn');
    const menuEl   = document.getElementById('nw-menu');

    function openMenu()  { menuEl.classList.add('open'); }
    function closeMenu() { menuEl.classList.remove('open'); }
    function toggleMenu() { menuEl.classList.contains('open') ? closeMenu() : openMenu(); }

    menuBtn.addEventListener('click', e => { e.stopPropagation(); toggleMenu(); });
    document.addEventListener('click', e => {
        if (!menuEl.contains(e.target) && e.target !== menuBtn) closeMenu();
    });

    document.getElementById('nw-menu-close').addEventListener('click', () => { closeMenu(); minimize(); });

    document.getElementById('nw-menu-fill').addEventListener('click', () => {
        closeMenu();
        chrome.runtime.sendMessage({ type: 'OPEN_POPUP_FILL' });
    });

    document.getElementById('nw-menu-clear').addEventListener('click', () => {
        closeMenu();
        chatHistory.length = 0;
        window.__novaHistory = [];
        try { chrome.storage.local.remove('nova_chat_history'); } catch {}
        messagesEl.innerHTML = `
            <div class="nw-msg ai">
                <div class="nw-avatar">N</div>
                <div><div class="nw-bubble">Chat cleared. How can I help?</div></div>
            </div>`;
        chipsEl.style.display = 'flex';
        renderChips();
    });

    // ── Saved pages panel ─────────────────────────────────────────────────────
    const spPanel    = document.getElementById('nw-sp-panel');
    const spList     = document.getElementById('nw-sp-list');
    const spCount    = document.getElementById('nw-sp-count');
    const saveToast  = document.getElementById('nw-save-toast');
    let toastTimer   = null;

    function showSaveToast(msg) {
        saveToast.textContent = msg;
        saveToast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => saveToast.classList.remove('show'), 2500);
    }

    function buildSpList() {
        const pages = spLoad();
        spCount.textContent = `${pages.length} saved`;
        spList.innerHTML = '';
        if (!pages.length) {
            spList.innerHTML = `<div class="nw-sp-empty">No saved pages yet.<br>Say <strong>"save this page"</strong> or use the chip on any page.</div>`;
            return;
        }
        pages.forEach(page => {
            const card = document.createElement('div');
            card.className = 'nw-sp-card';
            card.innerHTML = `
                <div class="nw-sp-title">${esc(page.title)}</div>
                <div class="nw-sp-url">${esc(page.url)}</div>
                <div class="nw-sp-actions">
                    <a class="nw-sp-open" href="${esc(page.url)}" target="_blank" rel="noopener">↗ Open</a>
                    <span class="nw-sp-tag">${esc(page.host)}</span>
                    <span class="nw-sp-date">${esc(page.date)}</span>
                    <button class="nw-sp-remove" title="Remove">✕</button>
                </div>`;
            card.querySelector('.nw-sp-remove').addEventListener('click', () => {
                const updated = spLoad().filter(p => p.id !== page.id);
                spSave(updated);
                card.remove();
                spCount.textContent = `${updated.length} saved`;
                if (!updated.length) spList.innerHTML = `<div class="nw-sp-empty">No saved pages yet.<br>Say <strong>"save this page"</strong> or use the chip on any page.</div>`;
            });
            spList.appendChild(card);
        });
    }

    function openSpPanel() {
        closeMenu();
        buildSpList();
        spPanel.classList.add('open');
    }

    function closeSpPanel() { spPanel.classList.remove('open'); }

    document.getElementById('nw-menu-pages').addEventListener('click', openSpPanel);
    document.getElementById('nw-sp-back').addEventListener('click', closeSpPanel);

    // ── Bookmark button in context bar ────────────────────────────────────────
    const bookmarkBtn = document.getElementById('nw-bookmark-btn');

    function syncBookmarkBtn() {
        const already = spLoad().some(p => p.url === location.href);
        bookmarkBtn.classList.toggle('saved', already);
        bookmarkBtn.title = already ? 'Already saved' : 'Save this page';
        bookmarkBtn.querySelector('svg').setAttribute('fill', already ? 'currentColor' : 'none');
    }
    syncBookmarkBtn();

    bookmarkBtn.addEventListener('click', () => {
        const result = saveCurrentPage();
        if (result === '__PAGE_EXISTS__') {
            showSaveToast('Already saved');
        } else {
            const page = JSON.parse(result.slice('__PAGE_SAVED__:'.length));
            showSaveToast(`🔖 Saved: ${page.title.slice(0, 40)}${page.title.length > 40 ? '…' : ''}`);
            if (spPanel.classList.contains('open')) buildSpList();
        }
        syncBookmarkBtn();
    });

    // ── Input ─────────────────────────────────────────────────────────────────
    const inputEl    = document.getElementById('nw-input');
    const sendBtn    = document.getElementById('nw-send');
    const chipsEl    = document.getElementById('nw-chips');
    const charCount  = document.getElementById('nw-char-count');
    const MAX_CHARS  = 2000;

    inputEl.addEventListener('input', () => {
        inputEl.style.height = 'auto';
        inputEl.style.height = Math.min(inputEl.scrollHeight, 96) + 'px';
        const len = inputEl.value.length;
        sendBtn.disabled = inputEl.value.trim().length === 0;
        if (len > 1600) {
            charCount.textContent = `${len}/${MAX_CHARS}`;
            charCount.className = 'nw-char-count ' + (len > 1900 ? 'danger' : 'warn');
        } else {
            charCount.textContent = '';
            charCount.className = 'nw-char-count';
        }
    });

    inputEl.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!sendBtn.disabled) doSend(); }
    });

    sendBtn.addEventListener('click', doSend);

    // ── Escape to minimize ────────────────────────────────────────────────────
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && widget.style.display !== 'none') minimize();
    });

    // ── Domain-aware chips (data from Core) ──────────────────────────────────
    function renderChips() {
        chipsEl.innerHTML = '';
        getChipsForPage(location.hostname).forEach(({ label, prompt }) => {
            const btn = document.createElement('button');
            btn.className = 'nw-chip';
            btn.textContent = label;
            btn.addEventListener('click', () => {
                inputEl.value = prompt;
                inputEl.dispatchEvent(new Event('input'));
                doSend();
            });
            chipsEl.appendChild(btn);
        });
    }

    renderChips();


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
        const historyLines = chatHistory.slice(-2)
            .map(m => `${m.role === 'user' ? 'User' : 'Nova'}: ${m.text}`);
        const prompt = buildClassifierPrompt(userText, historyLines, location.href);

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
        // Try known-URL table first — zero latency, no API call
        const known = resolveKnownUrl(destination, location.hostname);
        if (known) return known;

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

    // For compatibility: fetches stored resume, sends job + resume to AI for fit analysis
    async function resolveCompatibility() {
        if (!pageContent) {
            return 'I couldn\'t read the job description on this page. Make sure you\'re on a job posting and try again.';
        }

        // Fetch resume text from storage via background
        const resumeText = await new Promise(resolve => {
            chrome.runtime.sendMessage({ type: 'GET_RESUME_TEXT' }, result => {
                if (chrome.runtime.lastError || !result?.success || !result.text) return resolve(null);
                resolve(result.text.trim());
            });
        });

        if (!resumeText) {
            return '⚠️ No resume found. Please go to **Settings** and add your profile/resume first, then try again.';
        }

        const prompt =
`You are a professional career advisor. A job seeker wants to know how well they match a job posting.

--- JOB POSTING ---
${pageContent.slice(0, 5000)}

--- CANDIDATE RESUME ---
${resumeText.slice(0, 3000)}

Provide a structured compatibility analysis:

**Overall Match Score: X/10**

**Matching Strengths**
• List 3-5 skills or experiences from the resume that directly match the job requirements

**Gaps / Missing Requirements**
• List 2-4 requirements in the job that are missing or weak in the resume

**Verdict**
One sentence: should they apply, and what should they emphasise or address?`;

        return callAI(prompt, 'You are a career advisor. Be honest, specific, and concise. Use the exact format requested.');
    }

    // ── Job Tracker (storage from Core) ──────────────────────────────────────

    function extractJobInfo() {
        const title   = document.title.replace(/\s*[\|\-–—].*$/, '').trim() || 'Untitled Job';
        const host    = location.hostname.replace(/^www\./, '');
        // Try to extract company from common meta tags
        const ogSite  = document.querySelector('meta[property="og:site_name"]')?.content?.trim();
        const company = ogSite || host;
        return { title, company };
    }

    function saveCurrentJob() {
        const jobs   = jtLoad();
        const url    = location.href;
        const exists = jobs.find(j => j.url === url);
        if (exists) {
            return `**Already saved!** "${exists.title}" is already in your job tracker. Say **"show my saved jobs"** to view it.`;
        }
        const { title, company } = extractJobInfo();
        const job = {
            id:      Date.now(),
            title,
            company,
            url,
            date:    new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            status:  'saved'
        };
        jobs.unshift(job);
        jtSave(jobs);
        return `__JOB_SAVED__:${JSON.stringify(job)}`;
    }

    function renderJobSavedCard(job) {
        const wrap = document.createElement('div');
        wrap.className = 'nw-msg ai';
        wrap.innerHTML = `
            <div class="nw-avatar">N</div>
            <div class="nw-msg-wrap">
                <div class="nw-bubble">
                    <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:8px;">✓ Job saved to tracker</div>
                    <div class="nw-job-card">
                        <div class="nw-job-title">${esc(job.title)}</div>
                        <div class="nw-job-meta">${esc(job.company)} · ${esc(job.date)}</div>
                        <div class="nw-job-actions">
                            <span class="nw-status-badge saved">${JT_LABELS.saved}</span>
                            <a class="nw-job-link" href="${esc(job.url)}" target="_blank" rel="noopener">↗ Open</a>
                        </div>
                    </div>
                    <div style="font-size:11px;color:#9ca3af;margin-top:4px;">Say <strong>"show my saved jobs"</strong> to view all tracked jobs.</div>
                </div>
            </div>`;
        wrap.querySelector('.nw-msg-wrap').appendChild(makeTimeEl(Date.now()));
        messagesEl.appendChild(wrap);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function renderJobTracker() {
        const jobs = jtLoad();
        const wrap = document.createElement('div');
        wrap.className = 'nw-msg ai';

        const ts = Date.now();

        if (!jobs.length) {
            wrap.innerHTML = `
                <div class="nw-avatar">N</div>
                <div class="nw-msg-wrap">
                    <div class="nw-bubble">
                        <div class="nw-jt-header">📋 Job Tracker (0 jobs)</div>
                        <div class="nw-jt-empty">No jobs saved yet.<br>Browse a job posting and say <strong>"save this job"</strong>.</div>
                    </div>
                </div>`;
            wrap.querySelector('.nw-msg-wrap').appendChild(makeTimeEl(ts));
            messagesEl.appendChild(wrap);
            messagesEl.scrollTop = messagesEl.scrollHeight;
            return;
        }

        const bubble = document.createElement('div');
        bubble.className = 'nw-bubble';
        bubble.innerHTML = `<div class="nw-jt-header">📋 Job Tracker (${jobs.length} job${jobs.length !== 1 ? 's' : ''})</div>`;

        jobs.forEach(job => {
            const card = document.createElement('div');
            card.className = 'nw-job-card';
            card.dataset.id = job.id;

            // Status cycle button
            const statusBtn = document.createElement('button');
            statusBtn.className = `nw-status-badge ${job.status}`;
            statusBtn.textContent = JT_LABELS[job.status] || job.status;
            statusBtn.title = 'Click to update status';
            statusBtn.addEventListener('click', () => {
                const all   = jtLoad();
                const entry = all.find(j => j.id === job.id);
                if (!entry) return;
                const idx    = JT_STATUSES.indexOf(entry.status);
                entry.status = JT_STATUSES[(idx + 1) % JT_STATUSES.length];
                jtSave(all);
                statusBtn.className = `nw-status-badge ${entry.status}`;
                statusBtn.textContent = JT_LABELS[entry.status];
                job.status = entry.status;
            });

            const removeBtn = document.createElement('button');
            removeBtn.className = 'nw-job-remove';
            removeBtn.textContent = '✕ Remove';
            removeBtn.addEventListener('click', () => {
                const all = jtLoad().filter(j => j.id !== job.id);
                jtSave(all);
                card.style.opacity = '0';
                card.style.transition = 'opacity 0.2s';
                setTimeout(() => {
                    card.remove();
                    const header = bubble.querySelector('.nw-jt-header');
                    const remaining = bubble.querySelectorAll('.nw-job-card').length;
                    if (header) header.textContent = `📋 Job Tracker (${remaining} job${remaining !== 1 ? 's' : ''})`;
                    if (remaining === 0) {
                        bubble.innerHTML = `<div class="nw-jt-header">📋 Job Tracker (0 jobs)</div><div class="nw-jt-empty">No jobs saved yet.<br>Browse a job posting and say <strong>"save this job"</strong>.</div>`;
                    }
                }, 200);
            });

            card.innerHTML = `
                <div class="nw-job-title">${esc(job.title)}</div>
                <div class="nw-job-meta">${esc(job.company)} · ${esc(job.date)}</div>
                <div class="nw-job-actions"></div>`;
            const actions = card.querySelector('.nw-job-actions');
            actions.appendChild(statusBtn);
            actions.insertAdjacentHTML('beforeend', `<a class="nw-job-link" href="${esc(job.url)}" target="_blank" rel="noopener">↗ Open</a>`);
            actions.appendChild(removeBtn);
            bubble.appendChild(card);
        });

        const msgWrap = document.createElement('div');
        msgWrap.className = 'nw-msg-wrap';
        msgWrap.appendChild(bubble);
        msgWrap.appendChild(makeTimeEl(ts));

        const avatarEl = document.createElement('div');
        avatarEl.className = 'nw-avatar';
        avatarEl.textContent = 'N';

        wrap.appendChild(avatarEl);
        wrap.appendChild(msgWrap);
        messagesEl.appendChild(wrap);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    // ── Saved Pages ───────────────────────────────────────────────────────────

    function saveCurrentPage() {
        const pages = spLoad();
        const url   = location.href;
        if (pages.find(p => p.url === url)) {
            return `__PAGE_EXISTS__`;
        }
        const title = document.title.trim() || url;
        const host  = location.hostname.replace(/^www\./, '');
        const page  = {
            id:    Date.now(),
            title,
            host,
            url,
            date:  new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        };
        pages.unshift(page);
        spSave(pages);
        return `__PAGE_SAVED__:${JSON.stringify(page)}`;
    }

    function renderPageSavedCard(page) {
        showSaveToast(`🔖 Saved: ${page.title.slice(0, 40)}${page.title.length > 40 ? '…' : ''}`);
        if (spPanel.classList.contains('open')) buildSpList();
        syncBookmarkBtn();
    }

    function renderSavedPages() {
        // Open the dedicated panel instead of adding to chat
        openSpPanel();
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
        appendMsgRaw('ai', `Opening <strong>${esc(displayLabel)}</strong>…`);
        try { chrome.runtime.sendMessage({ type: 'NAVIGATE', url: safeUrl }); }
        catch { window.location.href = safeUrl; }
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
        appendMsgRaw('ai', `🔍 Searching <strong>${esc(query)}</strong> on ${labels[engine] || 'Google'}…`);
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
                    const q = encodeURIComponent((intent.destination || originalText) + ' site:' + location.hostname);
                    const searchUrl = `https://www.google.com/search?q=${q}`;
                    const wrap = appendMsgRaw('ai', `Couldn't resolve that URL automatically.`);
                    const btn = Object.assign(document.createElement('button'), {
                        textContent: '🔍 Search on Google',
                        style: 'display:inline-flex;align-items:center;gap:5px;margin-top:8px;padding:6px 14px;background:#6366f1;color:white;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;'
                    });
                    btn.addEventListener('click', () => {
                        try { chrome.runtime.sendMessage({ type: 'NAVIGATE', url: searchUrl }); }
                        catch { window.location.href = searchUrl; }
                    });
                    wrap?.querySelector('.nw-bubble')?.appendChild(btn);
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

            case 'compatibility': {
                const report = await resolveCompatibility();
                appendMsg('ai', report);
                chatHistory.push({ role: 'ai', text: report });
                break;
            }

            case 'save_job': {
                const result = saveCurrentJob();
                if (result.startsWith('__JOB_SAVED__:')) {
                    const job = JSON.parse(result.slice('__JOB_SAVED__:'.length));
                    renderJobSavedCard(job);
                    chatHistory.push({ role: 'ai', text: `Saved "${job.title}" to job tracker.` });
                } else {
                    appendMsg('ai', result);
                    chatHistory.push({ role: 'ai', text: result });
                }
                break;
            }

            case 'list_jobs': {
                renderJobTracker();
                const jobs = jtLoad();
                chatHistory.push({ role: 'ai', text: `Showing job tracker (${jobs.length} jobs).` });
                break;
            }

            case 'save_page': {
                const result = saveCurrentPage();
                if (result === '__PAGE_EXISTS__') {
                    appendMsg('ai', '**Already saved!** This page is already in your saved pages. Open the menu → **Saved Pages** to view it.');
                    chatHistory.push({ role: 'ai', text: 'Page already saved.' });
                } else {
                    const page = JSON.parse(result.slice('__PAGE_SAVED__:'.length));
                    renderPageSavedCard(page); // shows toast + refreshes panel if open
                    appendMsgRaw('ai', `🔖 <strong>${esc(page.title)}</strong> saved. Open the menu → <strong>Saved Pages</strong> to view all.`);
                    chatHistory.push({ role: 'ai', text: `Saved page: "${page.title}"` });
                }
                break;
            }

            case 'list_pages': {
                renderSavedPages(); // opens the panel
                chatHistory.push({ role: 'ai', text: 'Opened saved pages panel.' });
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

    const NOVA_SYSTEM = buildSystemPrompt(document.title, location.href);

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
                    const wrap2 = appendMsgRaw('ai', `Couldn't resolve that URL automatically.`);
                    const btn2 = Object.assign(document.createElement('button'), {
                        textContent: '🔍 Search on Google',
                        style: 'display:inline-flex;align-items:center;gap:5px;margin-top:8px;padding:6px 14px;background:#6366f1;color:white;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;'
                    });
                    btn2.addEventListener('click', () => {
                        try { chrome.runtime.sendMessage({ type: 'NAVIGATE', url: searchUrl }); }
                        catch { window.location.href = searchUrl; }
                    });
                    wrap2?.querySelector('.nw-bubble')?.appendChild(btn2);
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

    // ── Render helpers ────────────────────────────────────────────────────────
    // Render a message without side-effects (used when restoring history)
    function renderMsg(role, text) {
        appendMsg(role, text, true); // instant — no ghost typing for history restore
    }

    function appendMsgRaw(role, html) {
        const ts = Date.now();
        const wrap = document.createElement('div');
        wrap.className = `nw-msg ${role}`;
        const avatar = document.createElement('div');
        avatar.className = 'nw-avatar';
        avatar.textContent = 'N';
        const body = document.createElement('div');
        const bubble = document.createElement('div');
        bubble.className = 'nw-bubble';
        bubble.innerHTML = html;
        body.appendChild(bubble);
        body.appendChild(makeTimeEl(ts));
        wrap.appendChild(avatar);
        wrap.appendChild(body);
        messagesEl.appendChild(wrap);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return wrap;
    }

    function appendMsg(role, text, instant = false) {
        const ts = Date.now();
        const wrap = document.createElement('div');
        wrap.className = `nw-msg ${role}`;
        if (role === 'ai') {
            wrap.innerHTML = `
                <div class="nw-avatar">N</div>
                <div class="nw-msg-wrap">
                    <div class="nw-bubble"></div>
                    <button class="nw-copy-btn" title="Copy">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                    </button>
                </div>`;
            wrap.querySelector('.nw-msg-wrap').insertBefore(makeTimeEl(ts), wrap.querySelector('.nw-copy-btn'));
            const bubble = wrap.querySelector('.nw-bubble');
            const copyBtn = wrap.querySelector('.nw-copy-btn');
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(text).then(() => {
                    copyBtn.classList.add('copied');
                    copyBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
                    setTimeout(() => {
                        copyBtn.classList.remove('copied');
                        copyBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
                    }, 2000);
                }).catch(() => {});
            });
            messagesEl.appendChild(wrap);
            if (instant) {
                bubble.innerHTML = fmt(text);
            } else {
                ghostTypeAI(bubble, text);
            }
            messagesEl.scrollTop = messagesEl.scrollHeight;
            return;
        } else {
            wrap.innerHTML = `
                <div class="nw-avatar" style="background:#e5e7eb;color:#6b7280;">U</div>
                <div>
                    <div class="nw-bubble">${esc(text)}</div>
                </div>
                <button class="nw-edit-btn" title="Edit message">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>`;
            wrap.querySelector('div').appendChild(makeTimeEl(ts));
            wrap.querySelector('.nw-edit-btn').addEventListener('click', () => {
                editMessageFrom(wrap, text);
            });
        }
        messagesEl.appendChild(wrap);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function editMessageFrom(msgNode, originalText) {
        if (isThinking) return;
        // Find index of this user message in chatHistory
        const allNodes = Array.from(messagesEl.querySelectorAll('.nw-msg'));
        const nodeIdx = allNodes.indexOf(msgNode);

        // Remove this node and everything after it from the DOM
        for (let i = allNodes.length - 1; i >= nodeIdx; i--) {
            allNodes[i].remove();
        }

        // Count user messages up to (not including) this one to find history index
        // chatHistory is pairs: user/ai interleaved. Find the matching user entry.
        // Walk backwards from end of chatHistory to find the matching user text.
        let histIdx = -1;
        for (let i = chatHistory.length - 1; i >= 0; i--) {
            if (chatHistory[i].role === 'user' && chatHistory[i].text === originalText) {
                histIdx = i;
                break;
            }
        }
        if (histIdx !== -1) {
            chatHistory.splice(histIdx); // remove from that user message onward
        }

        // Restore text into input and focus
        inputEl.value = originalText;
        inputEl.dispatchEvent(new Event('input'));
        inputEl.focus();
        // Move cursor to end
        inputEl.selectionStart = inputEl.selectionEnd = originalText.length;
    }

    async function ghostTypeAI(bubble, text) {
        const chars = text.split('');
        const SPEED_MS = 18;
        const RENDER_EVERY = 4; // re-render formatted HTML every N chars
        let typed = '';
        let i = 0;
        for (const ch of chars) {
            typed += ch;
            i++;
            if (i % RENDER_EVERY === 0) {
                bubble.innerHTML = fmt(typed);
                messagesEl.scrollTop = messagesEl.scrollHeight;
            }
            await new Promise(r => setTimeout(r, SPEED_MS));
        }
        // Final render — always fully formatted
        bubble.innerHTML = fmt(text);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    // ── Relative timestamps ───────────────────────────────────────────────────
    function relativeTime(ts) {
        const diff = Math.floor((Date.now() - ts) / 1000);
        if (diff < 10)  return 'just now';
        if (diff < 60)  return `${diff}s ago`;
        if (diff < 120) return '1m ago';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        const d = new Date(ts);
        const now = new Date();
        if (d.toDateString() === now.toDateString()) {
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
        if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    // Refresh all visible timestamps every 30s so "just now" → "2m ago" etc.
    setInterval(() => {
        messagesEl.querySelectorAll('.nw-time[data-ts]').forEach(el => {
            el.textContent = relativeTime(+el.dataset.ts);
        });
    }, 30000);

    function makeTimeEl(ts) {
        const el = document.createElement('div');
        el.className = 'nw-time';
        el.dataset.ts = ts;
        el.textContent = relativeTime(ts);
        return el;
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

    } // end init()

    if (document.body) {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    }

})();
