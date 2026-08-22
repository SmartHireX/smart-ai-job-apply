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
    // Populated after a scan completes or is restored — injected into chat prompts
    let _lastScanResults = null;
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
        .nw-textarea { flex: 1; border: none !important; outline: none !important; box-shadow: none !important; background: transparent; font-family: inherit; font-size: 13px; color: #111827; resize: none; line-height: 1.4; max-height: 96px; min-height: 20px; overflow-y: auto; }
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
        /* ── Job preview panel ── */
        @keyframes nw-ov-bg     { 0%,100%{opacity:.82} 50%{opacity:1} }
        @keyframes nw-ov-in     { from{opacity:0} to{opacity:1} }
        @keyframes nw-reticle   { to{transform:rotate(360deg)} }
        @keyframes nw-reticle-r { to{transform:rotate(-360deg)} }
        @keyframes nw-ping      { 0%{transform:scale(1);opacity:.6} 100%{transform:scale(2.6);opacity:0} }
        @keyframes nw-bar-run   { 0%{transform:translateX(-100%)} 100%{transform:translateX(400%)} }
        @keyframes nw-fade-up   { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
        @keyframes nw-check-pop { from{transform:scale(0) rotate(-45deg);opacity:0} to{transform:scale(1) rotate(0);opacity:1} }
        @keyframes nw-particle  { 0%{transform:translate(0,0) scale(1);opacity:.7} 100%{transform:translate(var(--dx),var(--dy)) scale(0);opacity:0} }
        @keyframes nw-shimmer   { 0%{background-position:-200% 0} 100%{background-position:200% 0} }

        #nw-job-preview {
            position:fixed; top:0; left:0; width:52%; height:100vh;
            background:#fff; box-shadow:6px 0 48px rgba(0,0,0,.22);
            z-index:2147483640; display:flex; flex-direction:column;
            transform:translateX(-100%); transition:transform .38s cubic-bezier(.4,0,.2,1);
            border-right:1.5px solid rgba(0,0,0,.08);
        }
        #nw-job-preview.nw-preview-open { transform:translateX(0); }

        #nw-preview-header {
            display:flex; align-items:center; gap:10px;
            padding:9px 14px; background:rgba(249,250,251,.97);
            border-bottom:1px solid #e5e7eb; flex-shrink:0;
        }
        #nw-preview-favicon { width:16px; height:16px; border-radius:3px; flex-shrink:0; }
        #nw-preview-title   { font-size:12px; font-weight:600; color:#111827; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        #nw-preview-badge   { font-size:10px; font-weight:700; padding:2px 8px; border-radius:10px; background:#eef2ff; color:#4f46e5; white-space:nowrap; }
        #nw-preview-close   { width:22px; height:22px; border-radius:50%; background:#f3f4f6; border:none; cursor:pointer; font-size:13px; color:#6b7280; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        #nw-preview-close:hover { background:#e5e7eb; }

        #nw-preview-body   { position:relative; flex:1; overflow:hidden; display:flex; flex-direction:column; }
        #nw-preview-iframe { position:absolute; inset:0; border:none; width:100%; height:100%; }

        /* ─── scanning overlay ─── */
        #nw-preview-scan-overlay {
            position:absolute; inset:0; z-index:10;
            display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0;
            transition:opacity .45s ease;
            animation:nw-ov-in .3s ease both;
            overflow:hidden;
        }
        #nw-preview-scan-overlay.nw-overlay-hidden { opacity:0; pointer-events:none; }

        /* full-bleed gradient bg — color-keyed by phase */
        #nw-ov-bg {
            position:absolute; inset:0; transition:background .7s ease;
            background:radial-gradient(ellipse 80% 60% at 50% 38%, rgba(99,102,241,.18) 0%, rgba(10,10,20,.88) 100%);
        }
        #nw-preview-scan-overlay::after {
            content:''; position:absolute; inset:0; pointer-events:none;
            background-image:
                linear-gradient(rgba(255,255,255,.028) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,.028) 1px, transparent 1px);
            background-size:44px 44px;
        }
        [data-phase="reading"] #nw-ov-bg  { background:radial-gradient(ellipse 80% 60% at 50% 38%, rgba(6,182,212,.2) 0%, rgba(6,14,22,.9) 100%); }
        [data-phase="scoring"] #nw-ov-bg  { background:radial-gradient(ellipse 80% 60% at 50% 38%, rgba(245,158,11,.18) 0%, rgba(20,12,4,.9) 100%); }

        /* reticle — central animated SVG ring */
        #nw-ov-reticle {
            position:relative; z-index:2;
            width:96px; height:96px; flex-shrink:0;
            display:flex; align-items:center; justify-content:center;
            margin-bottom:28px;
        }
        #nw-ov-reticle svg.ring-outer {
            position:absolute; inset:0;
            animation:nw-reticle 3s linear infinite;
        }
        #nw-ov-reticle svg.ring-inner {
            position:absolute; inset:12px;
            animation:nw-reticle-r 2s linear infinite;
        }
        /* ping ripple */
        #nw-ov-ping {
            position:absolute; inset:28px; border-radius:50%;
            border:1.5px solid currentColor;
            animation:nw-ping 1.8s ease-out infinite;
        }
        [data-phase="loading"] #nw-ov-ping { color:rgba(99,102,241,.6); }
        [data-phase="reading"] #nw-ov-ping { color:rgba(6,182,212,.6); }
        [data-phase="scoring"] #nw-ov-ping { color:rgba(245,158,11,.6); }
        /* center icon */
        #nw-ov-icon {
            width:36px; height:36px; border-radius:50%;
            display:flex; align-items:center; justify-content:center;
            font-size:15px; font-weight:800; color:#fff;
            transition:background .6s;
            position:relative; z-index:1;
        }
        [data-phase="loading"] #nw-ov-icon { background:rgba(99,102,241,.8); box-shadow:0 0 0 8px rgba(99,102,241,.12); }
        [data-phase="reading"] #nw-ov-icon { background:rgba(6,182,212,.8);  box-shadow:0 0 0 8px rgba(6,182,212,.12); }
        [data-phase="scoring"] #nw-ov-icon { background:rgba(245,158,11,.8); box-shadow:0 0 0 8px rgba(245,158,11,.12); }

        /* phase label + subtitle */
        #nw-ov-label {
            position:relative; z-index:2;
            font-size:17px; font-weight:700; color:#fff; letter-spacing:-.01em;
            text-align:center; margin-bottom:6px;
            animation:nw-fade-up .35s ease both;
        }
        #nw-ov-sub {
            position:relative; z-index:2;
            font-size:11.5px; color:rgba(255,255,255,.42); text-align:center;
            margin-bottom:36px; line-height:1.5;
        }

        /* inline shimmer progress bar */
        #nw-ov-bar-wrap {
            position:relative; z-index:2;
            width:160px; height:3px; border-radius:2px;
            background:rgba(255,255,255,.1); overflow:hidden; margin-bottom:32px;
        }
        #nw-ov-bar-fill {
            position:absolute; inset:0; width:45%; border-radius:2px;
            background:linear-gradient(90deg,transparent,currentColor,transparent);
            background-size:200% 100%;
            animation:nw-bar-run 1.4s ease-in-out infinite;
        }
        [data-phase="loading"] #nw-ov-bar-fill { color:#818cf8; }
        [data-phase="reading"] #nw-ov-bar-fill { color:#22d3ee; animation-duration:1.1s; }
        [data-phase="scoring"] #nw-ov-bar-fill { color:#fbbf24; animation-duration:.8s; }

        /* step pills at bottom */
        #nw-ov-steps {
            position:relative; z-index:2;
            display:flex; align-items:center; gap:0;
        }
        .nw-ov-step {
            display:flex; align-items:center; gap:6px;
            font-size:10.5px; font-weight:600;
            color:rgba(255,255,255,.25);
            transition:color .4s;
            padding:0 4px;
        }
        .nw-ov-step.active { color:rgba(255,255,255,.9); }
        .nw-ov-step.done   { color:rgba(52,211,153,.75); }
        .nw-ov-step-dot {
            width:6px; height:6px; border-radius:50%;
            background:rgba(255,255,255,.15); flex-shrink:0;
            transition:background .4s, box-shadow .4s;
        }
        .nw-ov-step.active .nw-ov-step-dot { background:#fff; box-shadow:0 0 0 3px rgba(255,255,255,.15); }
        .nw-ov-step.done   .nw-ov-step-dot { background:#34d399; }
        .nw-ov-step-div { width:24px; height:1px; background:rgba(255,255,255,.12); }

        /* blocked state */
        #nw-preview-blocked {
            position:absolute; inset:0; display:none; align-items:center; justify-content:center;
            flex-direction:column; gap:12px; background:rgba(8,8,16,.92);
            color:rgba(255,255,255,.5); font-size:13px; text-align:center; padding:32px; z-index:11;
        }
        #nw-preview-blocked svg { opacity:.2; stroke:rgba(255,255,255,.6); }
        #nw-preview-blocked strong { color:rgba(255,255,255,.82); display:block; margin-bottom:4px; }

        /* ── Bulk job scanner ── */
        @keyframes nw-spin        { to { transform:rotate(360deg); } }
        @keyframes nw-row-in      { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
        @keyframes nw-badge-pop   { 0%{transform:scale(0.4);opacity:0} 70%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} }
        @keyframes nw-bar-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes nw-pulse-row   { 0%,100%{box-shadow:0 0 0 0 rgba(99,102,241,0.12)} 50%{box-shadow:0 0 0 4px rgba(99,102,241,0.18)} }

        .nw-scan-header   { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
        .nw-scan-title    { font-size:13px; font-weight:700; color:#111827; line-height:1.3; }
        .nw-scan-progress { font-size:11px; color:#9ca3af; font-variant-numeric:tabular-nums; }

        /* progress bar — shimmer while running, solid green when done */
        .nw-scan-bar-wrap { height:5px; background:#f3f4f6; border-radius:3px; margin-bottom:10px; overflow:hidden; }
        .nw-scan-bar      { height:100%; border-radius:3px; transition:width 0.45s cubic-bezier(0.4,0,0.2,1), background 0.5s;
                            background:linear-gradient(90deg,#6366f1 0%,#a5b4fc 40%,#6366f1 60%,#818cf8 100%);
                            background-size:200% 100%; animation:nw-bar-shimmer 1.8s linear infinite; }
        .nw-scan-bar.done { background:#10b981; animation:none; }

        /* filter chips with counts */
        .nw-scan-filters  { display:flex; gap:5px; margin-bottom:10px; flex-wrap:wrap; }
        .nw-scan-chip     { font-size:10px; font-weight:600; padding:3px 10px; border-radius:20px; border:1.5px solid #e5e7eb;
                            background:#f9fafb; color:#6b7280; cursor:pointer; transition:all 0.15s; white-space:nowrap; }
        .nw-scan-chip:hover   { border-color:#a5b4fc; color:#4f46e5; background:#eef2ff; }
        .nw-scan-chip.active  { background:#6366f1; color:#fff; border-color:#6366f1; box-shadow:0 1px 6px rgba(99,102,241,0.28); }
        .nw-scan-chip-count   { opacity:0.7; margin-left:3px; font-weight:500; }

        /* job list */
        .nw-scan-list  { display:flex; flex-direction:column; gap:5px; }
        .nw-scan-row   { border-radius:10px; border:1.5px solid #f3f4f6; background:#f9fafb;
                         transition:border-color 0.2s, background 0.2s, box-shadow 0.2s;
                         overflow:hidden; animation:nw-row-in 0.25s ease both; }
        .nw-scan-row:hover { box-shadow:0 2px 8px rgba(0,0,0,0.06); }

        /* active (processing) row — pulsing indigo ring */
        .nw-scan-row[data-active="true"] { border-color:#a5b4fc; animation:nw-row-in 0.25s ease both, nw-pulse-row 1.6s ease-in-out infinite; }

        .nw-scan-row[data-state="opening"] .nw-scan-row-main,
        .nw-scan-row[data-state="reading"]  .nw-scan-row-main { background:rgba(238,242,255,0.7); }
        .nw-scan-row[data-state="opening"],
        .nw-scan-row[data-state="reading"]  { border-color:#c7d2fe; }
        .nw-scan-row[data-state="scoring"]  .nw-scan-row-main { background:rgba(255,251,235,0.8); }
        .nw-scan-row[data-state="scoring"]  { border-color:#fde68a; }
        .nw-scan-row[data-state="done"]     .nw-scan-row-main { background:rgba(240,253,244,0.8); }
        .nw-scan-row[data-state="done"]     { border-color:#bbf7d0; }
        .nw-scan-row[data-state="done"]:hover .nw-scan-row-main { background:rgba(220,252,231,0.9); }
        .nw-scan-row[data-state="error"]    { opacity:0.45; }

        .nw-scan-row-main { display:flex; align-items:center; gap:10px; padding:8px 10px; cursor:pointer; user-select:none; }

        /* icon slot */
        .nw-scan-icon  { flex-shrink:0; width:34px; height:34px; display:flex; align-items:center; justify-content:center; }
        .nw-scan-dot   { width:10px; height:10px; border-radius:50%; display:inline-block; }
        .nw-scan-dot.queued { background:#d1d5db; }
        .nw-scan-dot.error  { background:#f87171; }
        .nw-scan-spinner { width:18px; height:18px; border:2.5px solid #e5e7eb; border-radius:50%; flex-shrink:0; animation:nw-spin 0.75s linear infinite; }
        .nw-scan-spinner          { border-top-color:#6366f1; }
        .nw-scan-spinner.reading  { border-top-color:#6366f1; border-right-color:#a5b4fc; }
        .nw-scan-spinner.scoring  { border-top-color:#f59e0b; border-right-color:#fcd34d; }

        /* score ring badge */
        .nw-scan-score-ring { flex-shrink:0; width:34px; height:34px; animation:nw-badge-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both; }
        .nw-compat-ring { width:52px !important; height:52px !important; }
        .nw-compat-ring text { font-size:8px !important; }
        .nw-scan-score-ring circle.track { fill:none; stroke:#e5e7eb; stroke-width:3; }
        .nw-scan-score-ring circle.fill  { fill:none; stroke-width:3; stroke-linecap:round;
                                           transform:rotate(-90deg); transform-origin:50% 50%;
                                           transition:stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1); }
        .nw-scan-score-ring text { font-size:9px; font-weight:800; text-anchor:middle; dominant-baseline:central; fill:#111827; }

        /* job info */
        .nw-scan-job-info  { flex:1; min-width:0; }
        .nw-scan-job-main  { display:flex; align-items:center; gap:6px; min-width:0; }
        .nw-scan-job-name  { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:600; font-size:12px; color:#111827; flex:1; min-width:0; }
        .nw-scan-label-pill { font-size:9px; font-weight:700; padding:2px 7px; border-radius:10px; white-space:nowrap; flex-shrink:0; letter-spacing:0.03em; border:1px solid transparent; }
        .nw-scan-url       { font-size:10px; color:#9ca3af; margin-top:1px; }
        .nw-scan-status-line { font-size:11px; color:#9ca3af; margin-top:2px; font-style:italic; }
        .nw-scan-expand    { font-size:11px; color:#9ca3af; flex-shrink:0; margin-left:4px; transition:transform 0.25s cubic-bezier(0.4,0,0.2,1); padding:2px; }
        .nw-scan-row[data-open="true"] .nw-scan-expand { transform:rotate(180deg); color:#6366f1; }
        /* nav arrow — visible on hover to hint row is clickable */
        .nw-scan-row-nav { font-size:11px; color:#9ca3af; flex-shrink:0; opacity:0; transition:opacity 0.15s, color 0.15s; }
        .nw-scan-row[data-state="done"]:hover .nw-scan-row-nav { opacity:1; color:#6366f1; }

        /* expand detail — max-height slide */
        .nw-scan-detail { max-height:0; overflow:hidden; transition:max-height 0.3s cubic-bezier(0.4,0,0.2,1), padding 0.3s; padding:0 10px 0 52px; }
        .nw-scan-row[data-open="true"] .nw-scan-detail { max-height:200px; padding:0 10px 12px 52px; }

        .nw-scan-verdict  { font-size:11px; color:#374151; line-height:1.5; margin-bottom:7px; }
        .nw-scan-tags     { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:9px; }
        .nw-scan-tag      { font-size:10px; padding:2px 7px; border-radius:4px; font-weight:500; border-left:3px solid transparent; padding-left:6px; }
        .nw-scan-tag.match { background:#f0fdf4; color:#15803d; border-color:#86efac; }
        .nw-scan-tag.gap   { background:#fef2f2; color:#b91c1c; border-color:#fca5a5; }
        .nw-scan-apply-btn { display:inline-flex; align-items:center; gap:4px; padding:5px 12px;
                             background:linear-gradient(135deg,#6366f1,#4f46e5); color:#fff; border-radius:7px; font-size:11px;
                             font-weight:700; text-decoration:none; transition:opacity 0.15s, transform 0.15s;
                             box-shadow:0 1px 6px rgba(99,102,241,0.3); }
        .nw-scan-apply-btn:hover { opacity:0.9; transform:translateY(-1px); }

        /* podium summary */
        .nw-scan-podium    { display:flex; gap:5px; margin-top:10px; }
        .nw-scan-podium-card { flex:1; border-radius:10px; padding:8px 8px 8px 10px; border:1.5px solid #e5e7eb;
                               background:#fff; min-width:0; display:flex; flex-direction:column; gap:2px; }
        .nw-scan-podium-card:first-child { border-color:#fde68a; background:#fffbeb; }
        .nw-scan-podium-medal { font-size:13px; line-height:1; }
        .nw-scan-podium-name  { font-size:10px; font-weight:700; color:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px; }
        .nw-scan-podium-score { font-size:10px; font-weight:800; color:#6366f1; }
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
                        <button class="nw-menu-item" id="nw-menu-settings">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                            Settings
                        </button>
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
        _seed.forEach(m => renderMsg(m.role, m.text, m.ts, m.records || m.result));
        document.getElementById('nw-chips').style.display = 'none';
        messagesEl.scrollTop = messagesEl.scrollHeight;
    } else {
        // Auto-restore after navigation — load from shared chrome.storage.local
        try {
            chrome.storage.local.get(['nova_chat_history'], result => {
                const saved = result.nova_chat_history;
                if (Array.isArray(saved) && saved.length) {
                    _seed.push(...saved);
                    window.__novaHistory = _seed;
                    messagesEl.innerHTML = '';
                    saved.forEach(m => renderMsg(m.role, m.text, m.ts, m.records));
                    document.getElementById('nw-chips').style.display = 'none';
                    messagesEl.scrollTop = messagesEl.scrollHeight;
                }
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

    document.getElementById('nw-menu-settings').addEventListener('click', () => {
        closeMenu();
        chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
    });

    document.getElementById('nw-menu-close').addEventListener('click', () => { closeMenu(); minimize(); });

    document.getElementById('nw-menu-fill').addEventListener('click', () => {
        closeMenu();
        inputEl.value = 'fill this form';
        inputEl.dispatchEvent(new Event('input'));
        setTimeout(doSend, 80);
    });

    document.getElementById('nw-menu-clear').addEventListener('click', () => {
        closeMenu();
        chatHistory.length = 0;
        window.__novaHistory = [];
        _lastScanResults = null;
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
            .filter(el => el.offsetParent !== null && !el.closest('#nova-chat-widget'))
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
            return null;
        }

        // Fetch resume text from storage via background
        const resumeText = await new Promise(resolve => {
            chrome.runtime.sendMessage({ type: 'GET_RESUME_TEXT' }, result => {
                if (chrome.runtime.lastError || !result?.success || !result.text) return resolve(null);
                resolve(result.text.trim());
            });
        });

        if (!resumeText) {
            return null;
        }

        const prompt =
`You are a career advisor. Analyze how well this candidate matches this job.

Job URL: ${location.href}

--- JOB POSTING ---
${pageContent.slice(0, 5000)}

--- CANDIDATE RESUME ---
${resumeText.slice(0, 3000)}

Return ONLY a JSON object, nothing else:
{
  "score": <integer 1-10>,
  "verdict": "<one sentence: should they apply and what to emphasise>",
  "match": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "gap": ["<gap 1>", "<gap 2>"]
}`;

        const raw = await callAI(prompt, 'You are a career advisor. Return only valid JSON, no markdown, no explanation.');
        try {
            const json = raw.replace(/```json|```/g, '').trim();
            const start = json.indexOf('{'), end = json.lastIndexOf('}');
            return JSON.parse(json.slice(start, end + 1));
        } catch {
            return { score: null, verdict: raw, match: [], gap: [] };
        }
    }

    function renderCompatibilityCard(result) {
        const ts = Date.now();
        const score = result.score || 0;
        const lbl   = scoreLabel(score);
        const color = scoreColor(score);

        const matchTags = (result.match || []).map(m =>
            `<span class="nw-scan-tag match">✓ ${esc(m)}</span>`).join('');
        const gapTags = (result.gap || []).map(g =>
            `<span class="nw-scan-tag gap">✗ ${esc(g)}</span>`).join('');

        const wrap = document.createElement('div');
        wrap.className = 'nw-msg ai';
        wrap.innerHTML = `
            <div class="nw-avatar">N</div>
            <div class="nw-msg-wrap">
                <div class="nw-bubble" style="padding:0;overflow:hidden;min-width:260px;">
                    <div style="display:flex;align-items:center;gap:12px;padding:14px 16px 12px;border-bottom:1px solid #f3f4f6;">
                        <div style="flex-shrink:0;">${_scoreRingSVG(score, color).replace('class="nw-scan-score-ring"', 'class="nw-scan-score-ring nw-compat-ring"')}</div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:13px;font-weight:700;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(document.title.replace(/\s*[\|\-–—].*$/, '').trim() || 'This Role')}</div>
                            <div style="margin-top:4px;">
                                <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;background:${lbl.bg};color:${lbl.color};">${lbl.text}</span>
                            </div>
                        </div>
                    </div>
                    ${result.verdict ? `<div style="padding:10px 16px;font-size:12px;color:#6b7280;line-height:1.5;border-bottom:1px solid #f3f4f6;font-style:italic;">${esc(result.verdict)}</div>` : ''}
                    ${matchTags || gapTags ? `<div style="padding:10px 16px;display:flex;flex-wrap:wrap;gap:6px;">${matchTags}${gapTags}</div>` : ''}
                </div>
            </div>`;
        wrap.querySelector('.nw-msg-wrap').appendChild(makeTimeEl(ts));
        messagesEl.appendChild(wrap);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return wrap;
    }

    // ── Bulk Job Scanner ──────────────────────────────────────────────────────

    function scrapeJobLinks() {
        const seen = new Set();
        const results = [];
        const rootHost = location.hostname.split('.').slice(-2).join('.');

        // UI labels that are navigation/chrome — not job titles
        const UI_LABEL_BLOCKLIST = /^(preferences|show all|sign in|sign up|join now|see more|load more|next|previous|back|settings|notifications|jobs|messaging|home|my network|post a job|hiring|salary|companies|services|learning)$/i;

        // LinkedIn job URLs must contain /jobs/view/ — reject generic /jobs/ pages
        const LINKEDIN_JOB_URL = /linkedin\.com.*\/jobs\/view\//;

        const SELECTORS = [
            // Most specific first — platform job card selectors
            '.jobs-search__results-list a[href*="/jobs/view/"]',
            'a.job-card-list__title',
            'a.job-card-container__link',
            'a.jcs-JobTitle',
            'a[data-jk]',
            'h2.jobTitle a',
            'a[data-test="job-link"]',
            // Generic ATS patterns — only used if specifics find nothing
            'a[href*="/jobs/view/"]',
            'a[href*="job-detail"]',
        ];

        for (const sel of SELECTORS) {
            document.querySelectorAll(sel).forEach(a => {
                try {
                    const href = a.href;
                    if (!href || seen.has(href) || href.startsWith('javascript:') || href === location.href) return;
                    const url = new URL(href);
                    if (!url.hostname.includes(rootHost)) return;
                    // On LinkedIn reject anything that isn't a /jobs/view/ URL
                    if (url.hostname.includes('linkedin') && !LINKEDIN_JOB_URL.test(href)) return;
                    const label = (a.textContent || a.title || '').replace(/\s+/g, ' ').trim().slice(0, 80);
                    if (!label || label.length < 6) return;
                    if (UI_LABEL_BLOCKLIST.test(label)) return;
                    seen.add(href);
                    results.push({ url: href, title: label });
                } catch {}
            });
        }

        if (results.length === 0) {
            document.querySelectorAll('a[href]').forEach(a => {
                try {
                    const href = a.href;
                    if (!href || seen.has(href) || href === location.href) return;
                    if (new URL(href).hostname !== location.hostname) return;
                    const label = (a.textContent || '').replace(/\s+/g, ' ').trim();
                    if (label.length < 5 || label.length > 100) return;
                    if (!/engineer|developer|designer|manager|analyst|lead|senior|junior|intern|product|marketing|sales|operations|director|coordinator|specialist|architect|scientist/i.test(label)) return;
                    seen.add(href);
                    results.push({ url: href, title: label });
                } catch {}
            });
        }

        return results.slice(0, 12);
    }

    function scoreColor(s) {
        if (s >= 8) return '#10b981';
        if (s >= 6) return '#f59e0b';
        if (s >= 4) return '#f97316';
        return '#ef4444';
    }

    function scoreLabel(s) {
        if (s >= 8) return { text: 'Strong Match',  bg: '#dcfce7', color: '#15803d' };
        if (s >= 6) return { text: 'Good Match',    bg: '#fef9c3', color: '#a16207' };
        if (s >= 4) return { text: 'Partial Match', bg: '#ffedd5', color: '#c2410c' };
        return             { text: 'Weak Match',    bg: '#fee2e2', color: '#b91c1c' };
    }

    function _scoreRingSVG(score, color) {
        const r = 13, circ = 2 * Math.PI * r;
        const filled = ((score / 10) * circ).toFixed(2);
        return `<svg class="nw-scan-score-ring" viewBox="0 0 34 34">
            <circle class="track" cx="17" cy="17" r="${r}"/>
            <circle class="fill" cx="17" cy="17" r="${r}" stroke="${color}"
                stroke-dasharray="${circ.toFixed(2)}"
                stroke-dashoffset="${(circ - filled).toFixed(2)}"/>
            <text x="17" y="17">${score}</text>
        </svg>`;
    }

    // Row states: queued → opening → reading → scoring → done / error
    function setRowState(row, state, data = {}, errorMsg = '') {
        const ICONS = {
            queued:  `<span class="nw-scan-dot queued"></span>`,
            opening: `<span class="nw-scan-spinner"></span>`,
            reading: `<span class="nw-scan-spinner reading"></span>`,
            scoring: `<span class="nw-scan-spinner scoring"></span>`,
            done:    _scoreRingSVG(data.score || 0, scoreColor(data.score || 0)),
            error:   `<span class="nw-scan-dot error"></span>`,
        };
        const STATUS_TEXT = {
            queued:  'Queued',
            opening: '🌐 Opening…',
            reading: '📄 Reading…',
            scoring: '🧠 Scoring…',
            error:   errorMsg ? `⚠ ${errorMsg}` : '⚠ Could not load',
        };

        const icon       = row.querySelector('.nw-scan-icon');
        const statusLine = row.querySelector('.nw-scan-status-line');
        const labelPill  = row.querySelector('.nw-scan-label-pill');
        const detailEl   = row.querySelector('.nw-scan-detail');
        const expandEl   = row.querySelector('.nw-scan-expand');

        if (icon) icon.innerHTML = ICONS[state] || '';

        // Active pulse — only on processing states
        row.dataset.active = (state === 'opening' || state === 'reading' || state === 'scoring') ? 'true' : 'false';

        if (state === 'done' && data.score) {
            const lbl = scoreLabel(data.score);
            if (labelPill) {
                labelPill.textContent = lbl.text;
                labelPill.style.background = lbl.bg;
                labelPill.style.color = lbl.color;
                labelPill.style.borderColor = lbl.color + '44';
                labelPill.style.display = '';
            }
            if (statusLine) statusLine.textContent = '';
            if (detailEl) {
                // Split comma-separated match/gap into individual tag pills
                const matchTags = (data.match || '').split(',').map(s => s.trim()).filter(Boolean)
                    .map(s => `<span class="nw-scan-tag match">✓ ${esc(s)}</span>`).join('');
                const gapTags = (data.gap || '').toLowerCase() === 'none' ? '' :
                    (data.gap || '').split(',').map(s => s.trim()).filter(Boolean)
                        .map(s => `<span class="nw-scan-tag gap">✗ ${esc(s)}</span>`).join('');
                detailEl.innerHTML = `
                    <div class="nw-scan-verdict">${esc(data.verdict || '')}</div>
                    <div class="nw-scan-tags">${matchTags}${gapTags}</div>
                    <a href="${esc(row.dataset.url || '')}" target="_blank" class="nw-scan-apply-btn">↗ Apply Now</a>`;
            }
            if (expandEl) expandEl.style.display = '';
        } else {
            if (labelPill) labelPill.style.display = 'none';
            if (statusLine) statusLine.textContent = STATUS_TEXT[state] || '';
            if (expandEl)   expandEl.style.display = 'none';
        }

        row.dataset.state = state;
        if (data.score) row.dataset.score = data.score;
    }

    function makeJobRow(job, index) {
        const row = document.createElement('div');
        row.className = 'nw-scan-row';
        row.dataset.index = index;
        row.dataset.state = 'queued';
        row.dataset.url   = job.url;
        // Stagger entrance: each row slides in 30ms after the previous
        row.style.animationDelay = `${index * 30}ms`;

        const hostname = (() => { try { return new URL(job.url).hostname.replace('www.', ''); } catch { return job.url; } })();
        row.innerHTML = `
            <div class="nw-scan-row-main">
                <div class="nw-scan-icon"><span class="nw-scan-dot queued"></span></div>
                <div class="nw-scan-job-info">
                    <div class="nw-scan-job-main">
                        <div class="nw-scan-job-name" title="${esc(job.url)}">${esc(job.title)}</div>
                        <span class="nw-scan-label-pill" style="display:none"></span>
                    </div>
                    <div class="nw-scan-url">${esc(hostname)}</div>
                    <div class="nw-scan-status-line">Queued</div>
                </div>
                <span class="nw-scan-row-nav">↗</span>
                <span class="nw-scan-expand" style="display:none">▾</span>
            </div>
            <div class="nw-scan-detail"></div>`;

        // Click row-main: navigate to job in same tab; click expand chevron: toggle detail
        row.querySelector('.nw-scan-row-main').addEventListener('click', e => {
            if (row.dataset.state !== 'done') return;
            // Chevron click → toggle detail only
            if (e.target.closest('.nw-scan-expand')) {
                row.dataset.open = row.dataset.open === 'true' ? 'false' : 'true';
                return;
            }
            const url = row.dataset.url;
            if (!url) return;
            // Ask background to navigate the active tab — most reliable in MV3 content scripts
            chrome.runtime.sendMessage({ type: 'NAVIGATE', url });
        });

        return row;
    }

    async function scoreSingleJob(jobText, resumeText, jobUrl = '') {
        const urlLine = jobUrl ? `Job URL: ${jobUrl}\n` : '';
        const prompt =
`You are a career advisor. Score this job against the candidate's resume.
${urlLine}
--- JOB POSTING ---
${jobText.slice(0, 4000)}

--- CANDIDATE RESUME ---
${resumeText.slice(0, 2500)}

If the job posting text above is incomplete or unclear, use the Job URL to infer the role and company.

Respond in this EXACT format (no extra text):
SCORE: <number 1-10>
VERDICT: <one sentence — should they apply and why?>
MATCH: <2-3 top matching skills, comma separated>
GAP: <1-2 missing requirements, or "None" if strong match>`;

        const SYSTEM = 'You are a career advisor. Follow the exact output format. Be concise and honest.';

        // Retry once on failure — service worker may need a moment to wake after closing scrape tab
        let raw = null;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                raw = await Promise.race([
                    callAI(prompt, SYSTEM),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('score timeout')), 25000))
                ]);
                break; // success
            } catch (e) {
                if (attempt === 0) {
                    await new Promise(r => setTimeout(r, 2000)); // wait 2s before retry
                } else {
                    throw e; // both attempts failed — bubble up
                }
            }
        }

        const score   = Math.min(10, Math.max(1, parseInt((raw.match(/SCORE:\s*(\d+)/i) || [])[1]) || 0));
        const verdict = (raw.match(/VERDICT:\s*(.+)/i) || [])[1]?.trim() || '';
        const match   = (raw.match(/MATCH:\s*(.+)/i) || [])[1]?.trim() || '';
        const gap     = (raw.match(/GAP:\s*(.+)/i) || [])[1]?.trim() || '';
        return { score, verdict, match, gap };
    }

    // ── Scan card ─────────────────────────────────────────────────────────────
    const SCAN_CARD_ID  = 'nw-scan-card';
    const SCAN_STORE_KEY = 'nova_scan_results'; // persists completed results across reloads
    let   _scanCancelled = false;

    function getOrCreateScanCard(jobs, showCancel = false, ts = null) {
        let card = document.getElementById(SCAN_CARD_ID);
        if (card) return card;

        const uid = SCAN_CARD_ID;
        card = document.createElement('div');
        card.id = SCAN_CARD_ID;
        card.className = 'nw-msg ai';
        card.innerHTML = `
            <div class="nw-avatar">N</div>
            <div class="nw-msg-wrap">
                <div class="nw-bubble">
                    <div class="nw-scan-header">
                        <span class="nw-scan-title" id="${uid}-title">🔍 Found ${jobs.length} job${jobs.length !== 1 ? 's' : ''} — scanning…</span>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span class="nw-scan-progress" id="${uid}-prog">0 / ${jobs.length}</span>
                            <button id="${uid}-cancel" style="display:${showCancel ? '' : 'none'};font-size:10px;font-weight:600;padding:2px 8px;border-radius:6px;border:1px solid #fca5a5;background:#fef2f2;color:#ef4444;cursor:pointer;">✕ Cancel</button>
                        </div>
                    </div>
                    <div class="nw-scan-bar-wrap"><div class="nw-scan-bar" id="${uid}-bar" style="width:0%"></div></div>
                    <div class="nw-scan-list" id="${uid}-list"></div>
                </div>
            </div>`;
        card.querySelector('.nw-msg-wrap').appendChild(makeTimeEl(ts || Date.now()));
        messagesEl.appendChild(card);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return card;
    }

    function _wireCancelBtn(card) {
        const btn = card.querySelector(`#${SCAN_CARD_ID}-cancel`);
        if (!btn) return;
        btn.addEventListener('click', () => {
            _scanCancelled = true;
            hideJobPreviewPanel();
            btn.style.display = 'none';
            const titleEl = card.querySelector(`#${SCAN_CARD_ID}-title`);
            if (titleEl) titleEl.textContent = '🛑 Scan cancelled';
        });
    }

    function _wireFilterChips() {}

    // ── Job preview panel ─────────────────────────────────────────────────────

    function showJobPreviewPanel(url, title, index, total) {
        let panel = document.getElementById('nw-job-preview');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'nw-job-preview';
            panel.innerHTML = `
                <div id="nw-preview-header">
                    <img id="nw-preview-favicon" src="" alt="">
                    <span id="nw-preview-title"></span>
                    <span id="nw-preview-badge"></span>
                    <button id="nw-preview-close" title="Close preview">✕</button>
                </div>
                <div id="nw-preview-body">
                    <iframe id="nw-preview-iframe" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
                    <div id="nw-preview-scan-overlay" data-phase="loading">
                        <div id="nw-ov-bg"></div>
                        <div id="nw-ov-reticle">
                            <div id="nw-ov-ping"></div>
                            <svg class="ring-outer" viewBox="0 0 96 96" fill="none">
                                <circle cx="48" cy="48" r="44" stroke="rgba(255,255,255,.06)" stroke-width="1.5"/>
                                <path d="M48 4 A44 44 0 0 1 92 48" stroke="#818cf8" stroke-width="2" stroke-linecap="round" id="nw-arc-outer"/>
                                <circle cx="92" cy="48" r="3" fill="#818cf8" id="nw-dot-outer"/>
                            </svg>
                            <svg class="ring-inner" viewBox="0 0 72 72" fill="none">
                                <circle cx="36" cy="36" r="32" stroke="rgba(255,255,255,.05)" stroke-width="1.5"/>
                                <path d="M36 4 A32 32 0 0 1 68 36" stroke="rgba(129,140,248,.5)" stroke-width="1.5" stroke-linecap="round" id="nw-arc-inner"/>
                            </svg>
                            <div id="nw-ov-icon">N</div>
                        </div>
                        <div id="nw-ov-label">Opening page…</div>
                        <div id="nw-ov-sub">Waiting for page to load</div>
                        <div id="nw-ov-bar-wrap"><div id="nw-ov-bar-fill"></div></div>
                        <div id="nw-ov-steps">
                            <div class="nw-ov-step active" id="nw-step-load"><div class="nw-ov-step-dot"></div>Load</div>
                            <div class="nw-ov-step-div"></div>
                            <div class="nw-ov-step" id="nw-step-read"><div class="nw-ov-step-dot"></div>Read</div>
                            <div class="nw-ov-step-div"></div>
                            <div class="nw-ov-step" id="nw-step-score"><div class="nw-ov-step-dot"></div>Score</div>
                        </div>
                    </div>
                    <div id="nw-preview-blocked">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="3"/></svg>
                        <div><strong>Site blocks preview</strong><br><span style="font-size:11px">Reading content in background…</span></div>
                    </div>
                </div>`;
            document.body.appendChild(panel);
            document.getElementById('nw-preview-close').addEventListener('click', hideJobPreviewPanel);
        }

        const hostname = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
        document.getElementById('nw-preview-favicon').src = `https://www.google.com/s2/favicons?domain=${hostname}&sz=16`;
        document.getElementById('nw-preview-title').textContent = title;
        document.getElementById('nw-preview-badge').textContent = `${index + 1} of ${total}`;

        // Reset overlay to "loading" state
        _setPreviewState('loading');

        const iframe  = document.getElementById('nw-preview-iframe');
        const blocked = document.getElementById('nw-preview-blocked');
        iframe.style.display  = '';
        blocked.style.display = 'none';
        iframe.src = url;

        // After page loads, advance overlay to "reading" state
        iframe.onload = () => {
            _setPreviewState('reading');
        };

        // If blocked by X-Frame-Options, show blocked notice (overlay stays on top)
        iframe.onerror = () => {
            iframe.style.display  = 'none';
            blocked.style.display = 'flex';
            document.getElementById('nw-preview-scan-overlay').classList.add('nw-overlay-hidden');
        };

        requestAnimationFrame(() => panel.classList.add('nw-preview-open'));
    }

    function _setPreviewState(phase) {
        const overlay   = document.getElementById('nw-preview-scan-overlay');
        if (!overlay) return;

        overlay.classList.remove('nw-overlay-hidden');
        overlay.dataset.phase = phase;

        const COPY = {
            loading: { label: 'Opening page…',        sub: 'Waiting for page to load',                  arc: '#818cf8', arc2: 'rgba(129,140,248,.5)' },
            reading: { label: 'Reading content…',      sub: 'Extracting job requirements & description', arc: '#22d3ee', arc2: 'rgba(34,211,238,.4)' },
            scoring: { label: 'Scoring with AI…',      sub: 'Matching your resume to this role',         arc: '#fbbf24', arc2: 'rgba(251,191,36,.4)' },
        };
        const c = COPY[phase] || COPY.loading;

        const labelEl  = document.getElementById('nw-ov-label');
        const subEl    = document.getElementById('nw-ov-sub');
        const arcOuter = document.getElementById('nw-arc-outer');
        const dotOuter = document.getElementById('nw-dot-outer');
        const arcInner = document.getElementById('nw-arc-inner');
        const stepLoad = document.getElementById('nw-step-load');
        const stepRead = document.getElementById('nw-step-read');
        const stepScore= document.getElementById('nw-step-score');

        if (labelEl) { labelEl.style.animation = 'none'; labelEl.offsetHeight; labelEl.style.animation = ''; labelEl.textContent = c.label; }
        if (subEl)   subEl.textContent = c.sub;
        if (arcOuter){ arcOuter.setAttribute('stroke', c.arc); }
        if (dotOuter){ dotOuter.setAttribute('fill', c.arc); }
        if (arcInner){ arcInner.setAttribute('stroke', c.arc2); }

        const S = { loading: ['active','',''], reading: ['done','active',''], scoring: ['done','done','active'] };
        const s = S[phase] || S.loading;
        if (stepLoad)  stepLoad.className  = 'nw-ov-step ' + s[0];
        if (stepRead)  stepRead.className  = 'nw-ov-step ' + s[1];
        if (stepScore) stepScore.className = 'nw-ov-step ' + s[2];
    }

    function hideJobPreviewPanel() {
        const panel = document.getElementById('nw-job-preview');
        if (!panel) return;
        panel.classList.remove('nw-preview-open');
        const iframe = document.getElementById('nw-preview-iframe');
        if (iframe) iframe.src = 'about:blank';
        setTimeout(() => panel.remove(), 380);
    }

    // Main scan — widget stays alive the entire time.
    // For each job: background opens a popup window, loads the page (user sees it),
    // scrapes, closes the popup, returns text. Widget scores and updates row live.
    async function resolveScanJobs() {
        const jobs = scrapeJobLinks();
        if (jobs.length === 0) {
            return appendMsg('ai', "I couldn't find any job listings on this page. Try navigating to a job search results page on LinkedIn, Indeed, or a company careers page.");
        }

        const resumeText = await new Promise(resolve => {
            chrome.runtime.sendMessage({ type: 'GET_RESUME_TEXT' }, result => {
                if (chrome.runtime.lastError || !result?.success || !result.text) return resolve(null);
                resolve(result.text.trim());
            });
        });
        if (!resumeText) {
            return appendMsg('ai', '⚠️ No resume found. Please go to **Settings** and add your profile first.');
        }

        _scanCancelled = false;
        const card    = getOrCreateScanCard(jobs, true);
        const listEl  = card.querySelector(`#${SCAN_CARD_ID}-list`);
        const barEl   = card.querySelector(`#${SCAN_CARD_ID}-bar`);
        const progEl  = card.querySelector(`#${SCAN_CARD_ID}-prog`);
        const titleEl = card.querySelector(`#${SCAN_CARD_ID}-title`);

        _wireCancelBtn(card);

        const rows = jobs.map((job, i) => {
            const row = makeJobRow(job, i);
            listEl.appendChild(row);
            return row;
        });
        messagesEl.scrollTop = messagesEl.scrollHeight;
        chatHistory.push({ role: 'ai', text: `Starting job scan of ${jobs.length} jobs.`, ts: Date.now() });

        // allScanRecords tracks every job (success + error) for persist/restore
        const allScanRecords = jobs.map(j => ({ url: j.url, title: j.title, status: 'error' }));
        let doneCount = 0;

        for (let i = 0; i < jobs.length; i++) {
            if (_scanCancelled) break;

            const job = jobs[i];
            const row = rows[i];
            const rec = allScanRecords[i];

            setRowState(row, 'opening');
            titleEl.textContent = `🔍 Opening job ${i + 1} of ${jobs.length}…`;
            messagesEl.scrollTop = messagesEl.scrollHeight;

            showJobPreviewPanel(job.url, job.title, i, jobs.length);

            const scraped = await new Promise(resolve => {
                chrome.runtime.sendMessage({ type: 'SCRAPE_JOB_POPUP', url: job.url }, result => {
                    if (chrome.runtime.lastError) return resolve({ text: '', error: chrome.runtime.lastError.message });
                    resolve(result || { text: '' });
                });
            });

            // Advance overlay to "reading" phase while we check the scraped text
            _setPreviewState('reading');

            if (_scanCancelled) { hideJobPreviewPanel(); break; }

            let jobText = scraped.text;
            // Single retry if first attempt returned empty
            if (!jobText) {
                setRowState(row, 'reading');
                titleEl.textContent = `🔄 Retrying job ${i + 1} of ${jobs.length}…`;
                await new Promise(r => setTimeout(r, 5000));
                if (!_scanCancelled) {
                    const retry = await new Promise(resolve => {
                        chrome.runtime.sendMessage({ type: 'SCRAPE_JOB_POPUP', url: job.url }, result => {
                            if (chrome.runtime.lastError) return resolve({ text: '' });
                            resolve(result || { text: '' });
                        });
                    });
                    jobText = retry.text;
                }
            }

            if (!jobText) {
                hideJobPreviewPanel();
                setRowState(row, 'error', {}, 'No content scraped');
                rec.status = 'error'; rec.errorMsg = 'No content scraped';
            } else {
                // Show "Scoring" state in overlay briefly so user sees it transition
                _setPreviewState('scoring');
                setRowState(row, 'scoring');
                titleEl.textContent = `🧠 Scoring job ${i + 1} of ${jobs.length}…`;
                messagesEl.scrollTop = messagesEl.scrollHeight;

                // Hold overlay at scoring state briefly, then close
                await new Promise(r => setTimeout(r, 800));
                hideJobPreviewPanel();
                // Brief pause for background worker to settle
                await new Promise(r => setTimeout(r, 400));

                try {
                    const scored = await scoreSingleJob(jobText, resumeText, job.url);
                    const effectiveScore = scored.score > 0 ? scored.score : (scored.verdict ? 5 : 0);
                    if (effectiveScore > 0) {
                        const data = { ...scored, score: effectiveScore };
                        setRowState(row, 'done', data);
                        Object.assign(rec, { status: 'done', score: effectiveScore,
                            verdict: data.verdict, match: data.match, gap: data.gap });
                    } else {
                        setRowState(row, 'error', {}, 'Could not parse AI response');
                        rec.status = 'error'; rec.errorMsg = 'Could not parse AI response';
                    }
                } catch(e) {
                    const msg = (e?.message || '').replace('__CONTEXT_INVALID__', 'Extension reloaded — refresh page');
                    setRowState(row, 'error', {}, msg || 'AI request failed');
                    rec.status = 'error'; rec.errorMsg = msg || 'AI request failed';
                }
            }

            doneCount++;
            progEl.textContent = `${doneCount} / ${jobs.length}`;
            barEl.style.width  = Math.round((doneCount / jobs.length) * 100) + '%';
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        // Hide cancel button
        const cancelBtn = card.querySelector(`#${SCAN_CARD_ID}-cancel`);
        if (cancelBtn) cancelBtn.style.display = 'none';

        if (_scanCancelled) {
            rows.forEach(r => { if (r.dataset.state === 'queued' || r.dataset.state === 'opening') setRowState(r, 'error'); });
        }

        const scoredRecords = allScanRecords.filter(r => r.status === 'done');
        scoredRecords.sort((a, b) => b.score - a.score);

        // Update title
        titleEl.textContent = _scanCancelled
            ? `🛑 Cancelled — ${scoredRecords.length} of ${jobs.length} scored`
            : `✅ Scanned ${jobs.length} jobs — ${scoredRecords.length} scored`;
        progEl.textContent = '';

        // Sort rows by score
        Array.from(listEl.querySelectorAll('.nw-scan-row'))
            .sort((a, b) => (parseInt(b.dataset.score) || 0) - (parseInt(a.dataset.score) || 0))
            .forEach(r => listEl.appendChild(r));

        barEl.classList.add('done');
        _wireFilterChips(card, listEl, scoredRecords);
        if (scoredRecords.length) _appendPodium(listEl, scoredRecords);

        // Make results available to chat context
        if (scoredRecords.length) _lastScanResults = scoredRecords;

        // Persist scan card as a chat history entry — restores automatically with chat history
        chatHistory.push({ role: 'scan', records: allScanRecords, ts: Date.now() });
    }

    function _appendPodium(listEl, results) {
        const MEDALS = ['🥇', '🥈', '🥉'];
        const top = results.slice(0, 3);
        const podium = document.createElement('div');
        podium.className = 'nw-scan-podium';
        podium.innerHTML = top.map((j, i) => `
            <a class="nw-scan-podium-card" href="${esc(j.url)}" target="_blank" style="text-decoration:none;">
                <div class="nw-scan-podium-medal">${MEDALS[i]}</div>
                <div class="nw-scan-podium-name">${esc(j.title)}</div>
                <div class="nw-scan-podium-score">${j.score}/10</div>
            </a>`).join('');
        listEl.appendChild(podium);
    }

    // Restore a completed scan card from chrome.storage.local when the widget reinits.

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
            const scanCtx = _lastScanResults && _lastScanResults.length
                ? `--- Recent job scan results ---\n${_lastScanResults.map((j, i) =>
                    `${i + 1}. ${j.title} — ${j.score}/10\n   Match: ${j.match || 'N/A'}\n   Gap: ${j.gap || 'N/A'}\n   URL: ${j.url}`
                  ).join('\n')}\n---\n\n`
                : '';
            prompt = `${scanCtx}${needsPage ? ctx : ''}${history ? history + '\n' : ''}User: ${userText}`;
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
                const resolved = await resolveUrl(intent.destination || originalText);
                if (resolved?.url) {
                    navigate(resolved.url, resolved.label);
                    chatHistory.push({ role: 'ai', text: `Navigating to ${resolved.label || resolved.url}`, ts: Date.now() });
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
                chatHistory.push({ role: 'ai', text: `Searching: ${intent.query}`, ts: Date.now() });
                break;
            }

            case 'scroll': {
                scrollPage(intent.direction || 'down');
                chatHistory.push({ role: 'ai', text: `Scrolled ${intent.direction || 'down'}`, ts: Date.now() });
                break;
            }

            case 'copy': {
                copyToClipboard(intent.what || 'url');
                chatHistory.push({ role: 'ai', text: `Copied ${intent.what || 'url'}`, ts: Date.now() });
                break;
            }

            case 'fill': {
                const rawFields = Array.from(document.querySelectorAll('input,textarea,select'))
                    .filter(el => el.offsetParent !== null && !el.closest('#nova-chat-widget') && el.type !== 'hidden' && el.type !== 'submit' && el.type !== 'button' && el.type !== 'image' && el.type !== 'reset');

                if (!rawFields.length) {
                    appendMsg('ai', 'No form detected on this page. Navigate to a job application form and try again.');
                    chatHistory.push({ role: 'ai', text: 'No form detected.', ts: Date.now() });
                    break;
                }

                // Build field list with labels
                const fields = rawFields.slice(0, 14).map(el => ({
                    el,
                    id: el.id || el.name || '',
                    label: (document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim()
                        || el.getAttribute('aria-label') || el.placeholder || el.name || el.id || el.type)
                        .replace(/[*:]/g, '').trim()
                })).filter(f => f.label);

                const fillCardId = 'nw-fill-card-' + Date.now();
                const fillTs = Date.now();

                // Field type icon
                const _fieldIcon = (el) => {
                    const t = el.type || el.tagName.toLowerCase();
                    if (t === 'email')    return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`;
                    if (t === 'tel')      return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.14 9.81 19.79 19.79 0 0 1 1.09 4.18 2 2 0 0 1 3.07 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
                    if (t === 'url')      return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
                    if (t === 'textarea') return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 6H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
                    if (t === 'select')   return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>`;
                    return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
                };

                // Field row — used in both preview and active fill states
                const mkRows = (prefix) => fields.map(f => {
                    const rid = `${prefix}-${f.id.replace(/[^a-z0-9]/gi, '_')}`;
                    return `<div id="${rid}" style="display:flex;align-items:center;gap:10px;padding:7px 16px;border-bottom:1px solid #f1f5f9;transition:background 0.15s;">
                        <span id="${rid}-dot" style="width:7px;height:7px;border-radius:50%;background:#e2e8f0;flex-shrink:0;transition:all 0.25s;"></span>
                        <span style="color:#64748b;flex-shrink:0;display:flex;align-items:center;">${_fieldIcon(f.el)}</span>
                        <span style="font-size:12px;color:#1e293b;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;">${esc(f.label)}</span>
                        <span id="${rid}-val" style="font-size:10.5px;color:#94a3b8;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
                    </div>`;
                }).join('');

                const fillWrap = document.createElement('div');
                fillWrap.className = 'nw-msg ai';
                fillWrap.id = fillCardId;
                fillWrap.innerHTML = `
                    <style>
                        @keyframes nw-fill-shimmer {
                            0%   { background-position: -200% center; }
                            100% { background-position:  200% center; }
                        }
                        @keyframes nw-fill-pulse {
                            0%,100% { box-shadow: 0 0 0 0 rgba(99,102,241,0.4); }
                            50%     { box-shadow: 0 0 0 5px rgba(99,102,241,0); }
                        }
                        #${fillCardId}-confirm:hover { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 4px 14px rgba(99,102,241,0.4); }
                        #${fillCardId}-confirm:active { transform: translateY(0); }
                    </style>
                    <div class="nw-avatar">N</div>
                    <div class="nw-msg-wrap">
                        <div class="nw-bubble" style="padding:0;overflow:hidden;min-width:260px;width:100%;border-radius:4px 14px 14px 14px;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

                            <!-- ── Preview state ── -->
                            <div id="${fillCardId}-preview">
                                <!-- Header gradient -->
                                <div style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);padding:14px 16px 12px;position:relative;overflow:hidden;">
                                    <div style="position:absolute;top:-20px;right:-20px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.08);"></div>
                                    <div style="position:absolute;bottom:-30px;left:30px;width:60px;height:60px;border-radius:50%;background:rgba(255,255,255,0.05);"></div>
                                    <div style="display:flex;align-items:center;gap:10px;position:relative;">
                                        <div style="width:34px;height:34px;border-radius:10px;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                                        </div>
                                        <div>
                                            <div style="font-size:13px;font-weight:700;color:white;letter-spacing:-0.1px;">Application Form</div>
                                            <div style="font-size:11px;color:rgba(255,255,255,0.75);margin-top:1px;">${fields.length} field${fields.length !== 1 ? 's' : ''} detected</div>
                                        </div>
                                        <div style="margin-left:auto;background:rgba(255,255,255,0.2);padding:3px 9px;border-radius:20px;font-size:10.5px;color:white;font-weight:600;">Ready</div>
                                    </div>
                                </div>

                                <!-- Field list -->
                                <div style="padding:6px 0 4px;">${mkRows(fillCardId + '-pre')}</div>

                                <!-- CTA -->
                                <div style="padding:10px 14px 14px;">
                                    <button id="${fillCardId}-confirm" style="width:100%;padding:10px 0;background:linear-gradient(135deg,#6366f1,#8b5cf6);background-size:200% auto;color:white;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:0.02em;transition:all 0.2s;position:relative;overflow:hidden;">
                                        <span style="position:relative;z-index:1;display:flex;align-items:center;justify-content:center;gap:6px;">
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                                            Fill with my resume
                                        </span>
                                    </button>
                                </div>
                            </div>

                            <!-- ── Filling state ── -->
                            <div id="${fillCardId}-filling" style="display:none;">
                                <!-- Progress header -->
                                <div style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);padding:12px 16px;">
                                    <div style="display:flex;align-items:center;gap:10px;">
                                        <span id="${fillCardId}-icon" class="nw-scan-spinner reading" style="flex-shrink:0;border-color:rgba(255,255,255,0.3);border-top-color:white;border-right-color:rgba(255,255,255,0.6);"></span>
                                        <div style="flex:1;min-width:0;">
                                            <div id="${fillCardId}-label" style="font-size:12.5px;font-weight:700;color:white;">Matching with resume…</div>
                                            <div style="height:3px;background:rgba(255,255,255,0.2);border-radius:2px;margin-top:6px;overflow:hidden;">
                                                <div id="${fillCardId}-bar" style="height:100%;width:4%;background:white;border-radius:2px;transition:width 0.5s ease;opacity:0.9;"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Live field rows -->
                                <div id="${fillCardId}-act-rows" style="padding:6px 0 6px;">${mkRows(fillCardId + '-act')}</div>
                            </div>

                            <!-- ── Done state ── -->
                            <div id="${fillCardId}-result" style="display:none;"></div>
                        </div>
                    </div>`;
                fillWrap.querySelector('.nw-msg-wrap').appendChild(makeTimeEl(fillTs));
                messagesEl.appendChild(fillWrap);
                messagesEl.scrollTop = messagesEl.scrollHeight;

                // Mark a field row as filling / done in the active view
                const _markField = (fieldEl, state, value) => {
                    const id  = fieldEl.id || fieldEl.name || '';
                    const rid = `${fillCardId}-act-${id.replace(/[^a-z0-9]/gi, '_')}`;
                    const dot = document.getElementById(rid + '-dot');
                    const val = document.getElementById(rid + '-val');
                    if (!dot) return;
                    if (state === 'filling') {
                        dot.style.background  = '#818cf8';
                        dot.style.boxShadow   = '0 0 0 3px rgba(129,140,248,0.3)';
                        // Pulse the real field on the page
                        fieldEl.classList.add('nova-filling');
                    } else if (state === 'done') {
                        dot.style.background  = '#10b981';
                        dot.style.boxShadow   = 'none';
                        if (val && value) val.textContent = String(value).slice(0, 28);
                        fieldEl.classList.remove('nova-filling');
                        fieldEl.classList.add('nova-filled');
                        // Show badge if present on the mini-form
                        const badge = document.getElementById('badge-' + (fieldEl.id || fieldEl.name));
                        if (badge) badge.classList.add('visible');
                    } else if (state === 'skipped') {
                        dot.style.background = '#d1d5db';
                        if (val) val.textContent = 'skipped';
                    }
                };

                // Watch each field for value changes — fires when engine writes values
                const _observers = [];
                const _setupWatchers = () => {
                    fields.forEach(({ el }) => {
                        let prev = el.value;
                        _markField(el, 'idle');
                        const check = () => {
                            if (el.value !== prev && el.value.trim()) {
                                prev = el.value;
                                _markField(el, 'done', el.value);
                            }
                        };
                        // MutationObserver catches programmatic value sets
                        const obs = new MutationObserver(check);
                        obs.observe(el, { attributes: true, attributeFilter: ['value'] });
                        el.addEventListener('input', check);
                        el.addEventListener('change', check);
                        _observers.push({ obs, el, check });
                    });
                    // Poll as fallback for React/Vue controlled inputs
                    const poll = setInterval(() => {
                        _observers.forEach(({ el, check }) => check());
                    }, 300);
                    window._novaFillPoll = poll;
                };

                const _teardownWatchers = () => {
                    _observers.forEach(({ obs, el, check }) => {
                        obs.disconnect();
                        el.removeEventListener('input', check);
                        el.removeEventListener('change', check);
                    });
                    clearInterval(window._novaFillPoll);
                };

                // Confirm button
                document.getElementById(fillCardId + '-confirm').addEventListener('click', () => {
                    document.getElementById(fillCardId + '-preview').style.display = 'none';
                    document.getElementById(fillCardId + '-filling').style.display  = 'block';
                    messagesEl.scrollTop = messagesEl.scrollHeight;

                    window._novaFillCardId       = fillCardId;
                    window._novaFillStats        = null;
                    window._novaTeardownWatchers = _teardownWatchers;

                    _setupWatchers();

                    // FormProcessor calls this per field — drives instant dot updates
                    window._novaOnFieldAnswered = (selector, value) => {
                        const fieldEl = fields.find(f =>
                            f.el.matches && (f.el.matches(selector) ||
                            f.el.id === selector.replace(/^#/, '') ||
                            f.el.name === selector.replace(/^\[name="(.+)"\]$/, '$1'))
                        )?.el;
                        if (!fieldEl) return;
                        _markField(fieldEl, 'filling', null);
                        setTimeout(() => _markField(fieldEl, 'done', value), 350);
                    };

                    // Re-apply all chat overrides AFTER scripts finish loading.
                    // widget-overlay.js sets window.showProcessingWidget on load, so we
                    // must override AFTER loadAllScripts() resolves, not before.
                    const _applyOverrides = () => {
                        window._novaOrigShowWidget       = window.showProcessingWidget;
                        window._novaOrigUpdateProgress   = window.updateProcessingProgress;
                        window._novaOrigShowSidebar      = window.showAccordionSidebar;
                        window._novaOrigShowSuccessToast = window.showSuccessToast;
                        window._novaOrigTriggerConfetti  = window.triggerConfetti;

                        window.showProcessingWidget = (text, step) => {
                            const labelEl = document.getElementById(fillCardId + '-label');
                            const barEl   = document.getElementById(fillCardId + '-bar');
                            if (!labelEl) return;
                            if (step === -1) { labelEl.textContent = '⚠ Error'; labelEl.style.color = '#ef4444'; return; }
                            const LABELS = { 1: 'Matching with resume…', 2: 'Filling fields with AI…', 3: 'Applying values…', 4: 'Done!' };
                            labelEl.textContent = LABELS[step] || text;
                            if (step === 4 && barEl) barEl.style.width = '100%';
                        };
                        window.updateProcessingProgress = (percent) => {
                            const barEl = document.getElementById(fillCardId + '-bar');
                            if (barEl) barEl.style.width = Math.min(percent, 95) + '%';
                        };
                        // Suppress sidebar panel, toast, confetti — results live in chat card
                        window.showAccordionSidebar  = () => {};
                        window.showSuccessToast      = () => {};
                        window.triggerConfetti       = () => {};

                        // Direct callback — fires in-process, no message bus needed
                        window._novaOnFillComplete = () => {
                            const filledCount  = fields.filter(f => f.el.classList.contains('nova-filled')).length;
                            const skippedCount = fields.length - filledCount;

                            // Hide the live field rows, keep only the header; result section replaces them
                            const fillingEl = document.getElementById(fillCardId + '-filling');
                            if (fillingEl) {
                                // Hide the live act rows — result section has its own clean list
                                const actRows = document.getElementById(fillCardId + '-act-rows');
                                if (actRows) actRows.style.display = 'none';

                                const hdr = fillingEl.querySelector('div[style*="linear-gradient"]');
                                if (hdr) {
                                    hdr.style.background = 'linear-gradient(135deg,#059669 0%,#10b981 100%)';
                                    const iconEl  = document.getElementById(fillCardId + '-icon');
                                    const labelEl = document.getElementById(fillCardId + '-label');
                                    const barEl   = document.getElementById(fillCardId + '-bar');
                                    if (iconEl)  iconEl.outerHTML = `<span style="width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>`;
                                    if (labelEl) { labelEl.textContent = 'Form filled!'; }
                                    if (barEl)   { barEl.style.width = '100%'; barEl.style.background = 'rgba(255,255,255,0.8)'; }
                                }
                            }

                            // Collect source + value per field
                            const fieldResults = fields.map(f => {
                                const isFilled = f.el.classList.contains('nova-filled');
                                const val = f.el.value || f.el.getAttribute('data-autofill-value') || '';
                                const src = (f.el.getAttribute('data-autofill-source') || '').toLowerCase();
                                let srcLabel = null, srcColor = '#059669', srcBg = '#ecfdf5';
                                if (src.includes('ai') || src.includes('copilot') || src.includes('gen') || src.includes('inference')) {
                                    srcLabel = 'AI'; srcColor = '#6366f1'; srcBg = '#eef2ff';
                                } else if (src.includes('memory') || src.includes('cache')) {
                                    srcLabel = 'Cached'; srcColor = '#0891b2'; srcBg = '#ecfeff';
                                } else if (isFilled) {
                                    srcLabel = 'Resume';
                                }
                                return { f, isFilled, val, srcLabel, srcColor, srcBg };
                            });

                            const resultEl = document.getElementById(fillCardId + '-result');
                            if (resultEl) {
                                resultEl.style.display = 'block';

                                // ── Result card ──────────────────────────────────────
                                resultEl.innerHTML = `
                                <style>
                                    /* ── Field row ── */
                                    .nr-row { display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid #f3f4f6;background:#fff;cursor:default;transition:background 0.12s; }
                                    .nr-row:last-child { border-bottom:none; }
                                    .nr-row:hover { background:#f8f9ff; }

                                    /* Filled row icon box */
                                    .nr-icon { width:30px;height:30px;border-radius:8px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#94a3b8;transition:all 0.15s; }
                                    .nr-row:hover .nr-icon { background:#eef2ff;color:#6366f1; }

                                    /* Text */
                                    .nr-body { flex:1;min-width:0; }
                                    .nr-name { font-size:10px;font-weight:600;color:#94a3b8;letter-spacing:0.04em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px; }
                                    .nr-val  { font-size:12.5px;font-weight:500;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }

                                    /* Right side: source badge + refine */
                                    .nr-right { display:flex;align-items:center;gap:5px;flex-shrink:0; }
                                    .nr-src   { font-size:9.5px;font-weight:700;padding:2px 7px;border-radius:20px;flex-shrink:0; }
                                    .nr-src.resume { background:#dcfce7;color:#166534; }
                                    .nr-src.ai     { background:#ede9fe;color:#6d28d9; }
                                    .nr-src.cache  { background:#e0f2fe;color:#075985; }
                                    .nr-refine { width:26px;height:26px;border-radius:7px;border:1.5px solid #e0e7ff;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#6366f1;transition:all 0.15s;flex-shrink:0; }
                                    .nr-refine:hover { background:#eef2ff;border-color:#a5b4fc; }
                                    .nr-refine.open  { background:#6366f1;border-color:#6366f1;color:#fff; }

                                    /* Skipped row — same density as filled, just no value */
                                    .nr-row.nr-skip { background:#fff;cursor:pointer; }
                                    .nr-row.nr-skip .nr-name { color:#94a3b8; }
                                    .nr-row.nr-skip .nr-val  { color:#111827; }
                                    .nr-row.nr-skip .nr-icon { background:#f8fafc;color:#cbd5e1; }
                                    .nr-row.nr-skip:hover { background:#f8f9ff; }
                                    .nr-row.nr-skip:hover .nr-icon { background:#eef2ff;color:#6366f1; }

                                    /* Expand panel */
                                    .nr-expand { display:none;border-top:1px solid #eef2ff;background:#f8f7ff; }
                                    .nr-expand.open { display:block; }
                                    .nr-expand-head { padding:9px 14px 2px;font-size:11px;color:#6366f1;font-weight:600; }
                                    .nr-chips { display:flex;flex-wrap:wrap;gap:5px;padding:5px 14px 8px; }
                                    .nr-chip  { padding:4px 11px;border:1px solid #ddd6fe;border-radius:20px;font-size:11px;color:#7c3aed;background:white;cursor:pointer;transition:all 0.12s;white-space:nowrap;font-weight:500; }
                                    .nr-chip:hover { background:#ede9fe;border-color:#a78bfa; }
                                    .nr-thinking { display:none;align-items:center;gap:7px;padding:5px 14px 7px;font-size:11px;color:#94a3b8; }
                                    .nr-thinking.on { display:flex; }
                                    .nr-reply { margin:0 14px;padding:10px 12px;background:white;border:1px solid #ddd6fe;border-radius:10px;font-size:12px;color:#1e293b;line-height:1.6;display:none;white-space:pre-wrap;word-break:break-word; }
                                    .nr-reply.on { display:block; }
                                    .nr-apply-btn { display:none;margin:8px 14px 0;width:calc(100% - 28px);padding:7px 0;background:#6366f1;color:white;border:none;border-radius:8px;font-size:11.5px;font-weight:700;cursor:pointer;transition:opacity 0.15s; }
                                    .nr-apply-btn:hover { opacity:0.88; }
                                    .nr-bar { display:flex;align-items:center;gap:6px;padding:8px 14px 10px;border-top:1px solid #eef2ff;margin-top:8px; }
                                    .nr-bar-input { flex:1;border:1.5px solid #e0e7ff;border-radius:8px;padding:5px 10px;font-size:12px;color:#1e293b;outline:none;font-family:inherit;background:#fff;transition:border-color 0.15s; }
                                    .nr-bar-input:focus { border-color:#a5b4fc; }
                                    .nr-bar-send { flex-shrink:0;width:28px;height:28px;border-radius:8px;background:#6366f1;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:opacity 0.15s; }
                                    .nr-bar-send:hover { opacity:0.85; }

                                    /* Skipped group label */
                                    .nr-group-lbl { padding:8px 14px 5px;font-size:9.5px;font-weight:700;color:#c4c9d4;text-transform:uppercase;letter-spacing:0.08em;background:#fafafa;border-top:1px solid #f1f5f9;border-bottom:1px solid #f1f5f9; }

                                    /* Footer */
                                    .nr-footer { display:flex;flex-direction:column;gap:8px;padding:10px 14px 12px;border-top:1px solid #f1f5f9;background:#fff; }
                                    .nr-footer-stats { display:flex;align-items:center;gap:6px; }
                                    .nr-stat-pill { display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap;flex-shrink:0; }
                                    .nr-stat-pill.green { background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0; }
                                    .nr-stat-pill.amber { background:#fffbeb;color:#b45309;border:1px solid #fde68a; }
                                    .nr-btn-undo { width:100%;display:flex;align-items:center;justify-content:center;gap:6px;padding:7px 0;background:linear-gradient(135deg,#fff5f5 0%,#fff 100%);border:1.5px solid #fecaca;border-radius:8px;font-size:12px;font-weight:700;color:#dc2626;cursor:pointer;font-family:inherit;transition:all 0.18s;box-shadow:0 1px 3px rgba(220,38,38,0.08); }
                                    .nr-btn-undo:hover { background:linear-gradient(135deg,#fee2e2 0%,#fff5f5 100%);border-color:#f87171;box-shadow:0 2px 8px rgba(220,38,38,0.15);transform:translateY(-1px); }
                                    .nr-btn-undo:active { transform:translateY(0);box-shadow:none; }
                                </style>

                                <!-- rows container -->
                                <div id="${fillCardId}-rows"></div>

                                <!-- skipped group -->
                                <div id="${fillCardId}-skip"></div>

                                <!-- footer -->
                                <div class="nr-footer">
                                    <div class="nr-footer-stats">
                                        <span class="nr-stat-pill green"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>${filledCount} filled</span>
                                        ${skippedCount > 0 ? `<span class="nr-stat-pill amber"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${skippedCount} need help</span>` : ''}
                                    </div>
                                    <button id="${fillCardId}-undo" class="nr-btn-undo"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>Undo All Changes</button>
                                </div>`;

                                // ── Build rows ────────────────────────────────────
                                const rowsContainer = resultEl.querySelector(`#${fillCardId}-rows`);
                                const skipContainer = resultEl.querySelector(`#${fillCardId}-skip`);

                                // Filled fields first
                                fieldResults.filter(r => r.isFilled).forEach(({ f, val, srcLabel, srcColor, srcBg }, i) => {
                                    const rowId = `${fillCardId}-fr-${i}`;
                                    const selector = f.el.id ? `#${f.el.id}` : (f.el.name ? `[name="${f.el.name}"]` : null);
                                    const srcClass = srcLabel === 'AI' ? 'ai' : srcLabel === 'Cached' ? 'cache' : 'resume';

                                    const rowWrap = document.createElement('div');
                                    rowWrap.id = rowId;

                                    const mainRow = document.createElement('div');
                                    mainRow.className = 'nr-row';
                                    mainRow.innerHTML = `
                                        <div class="nr-icon">${_fieldIcon(f.el)}</div>
                                        <div class="nr-body">
                                            <div class="nr-name">${esc(f.label)}</div>
                                            <div class="nr-val" title="${esc(val)}">${esc(val ? (val.length > 38 ? val.slice(0, 36) + '…' : val) : '—')}</div>
                                        </div>
                                        <div class="nr-right">
                                            ${srcLabel ? `<span class="nr-src ${srcClass}">${srcLabel}</span>` : ''}
                                            <button class="nr-refine" title="Refine with AI">
                                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
                                            </button>
                                        </div>`;

                                    // Expand panel
                                    const expandPanel = document.createElement('div');
                                    expandPanel.className = 'nr-expand';
                                    expandPanel.innerHTML = `
                                        <div class="nr-expand-head">How should I rewrite <strong>${esc(f.label)}</strong>?</div>
                                        <div class="nr-chips">
                                            <span class="nr-chip">More professional</span>
                                            <span class="nr-chip">More concise</span>
                                            <span class="nr-chip">Focus on impact</span>
                                            <span class="nr-chip">Rewrite from scratch</span>
                                        </div>
                                        <div class="nr-thinking">
                                            <span class="nw-scan-spinner reading" style="width:11px;height:11px;border-width:1.5px;flex-shrink:0;border-color:rgba(99,102,241,0.25);border-top-color:#6366f1;border-right-color:#a5b4fc;"></span>
                                            Nova is rewriting…
                                        </div>
                                        <div class="nr-reply"></div>
                                        <div class="nr-bar">
                                            <input class="nr-bar-input" type="text" placeholder="e.g. focus on leadership…" />
                                            <button class="nr-bar-send">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                                            </button>
                                        </div>`;

                                    rowWrap.appendChild(mainRow);
                                    rowWrap.appendChild(expandPanel);
                                    rowsContainer.appendChild(rowWrap);

                                    // Refine button toggles expand panel
                                    const refineBtn = mainRow.querySelector('.nr-refine');
                                    refineBtn.addEventListener('click', (e) => {
                                        e.stopPropagation();
                                        const isOpen = expandPanel.classList.contains('open');
                                        // Close all others
                                        resultEl.querySelectorAll('.nr-expand.open').forEach(p => {
                                            p.classList.remove('open');
                                            p.previousElementSibling?.querySelector('.nr-refine')?.classList.remove('open');
                                        });
                                        if (!isOpen) {
                                            expandPanel.classList.add('open');
                                            refineBtn.classList.add('open');
                                            expandPanel.querySelector('.nr-bar-input').focus();
                                            setTimeout(() => messagesEl.scrollTop = messagesEl.scrollHeight, 60);
                                        }
                                    });

                                    // Shared regen logic
                                    const thinkEl  = expandPanel.querySelector('.nr-thinking');
                                    const replyEl  = expandPanel.querySelector('.nr-reply');
                                    const barInput = expandPanel.querySelector('.nr-bar-input');
                                    const sendBtn2 = expandPanel.querySelector('.nr-bar-send');
                                    const chipsEl  = expandPanel.querySelector('.nr-chips');

                                    const _runRegen = async (instruction) => {
                                        chipsEl.style.display = 'none';
                                        thinkEl.classList.add('on');
                                        replyEl.classList.remove('on');
                                        sendBtn2.disabled = true;

                                        try {
                                            let newVal = null;
                                            if (typeof window.regenerateFieldWithAI === 'function') {
                                                const r = await window.regenerateFieldWithAI(selector, f.label, instruction);
                                                if (r?.success) newVal = r.value || f.el.value;
                                            } else {
                                                newVal = await new Promise(resolve => {
                                                    chrome.runtime.sendMessage({
                                                        type: 'AI_REQUEST',
                                                        prompt: `Job application field: "${f.label}"\nCurrent value: "${f.el.value}"\nInstruction: ${instruction || 'improve it'}\nReturn only the new answer text.`,
                                                        systemInstruction: 'Return only the answer text. No explanation, no quotes.',
                                                        options: { maxTokens: 400, temperature: 0.7, provider: activeProvider }
                                                    }, r => resolve(r?.success ? r.text?.trim() : null));
                                                });
                                                if (newVal && f.el) {
                                                    f.el.value = newVal;
                                                    f.el.dispatchEvent(new Event('input', { bubbles: true }));
                                                    f.el.dispatchEvent(new Event('change', { bubbles: true }));
                                                }
                                            }

                                            thinkEl.classList.remove('on');

                                            if (newVal) {
                                                replyEl.textContent = newVal;
                                                replyEl.classList.add('on');
                                                // Apply button
                                                let applyBtn = expandPanel.querySelector('.nr-apply-btn');
                                                if (!applyBtn) {
                                                    applyBtn = document.createElement('button');
                                                    applyBtn.className = 'nr-apply-btn';
                                                    replyEl.after(applyBtn);
                                                }
                                                applyBtn.style.display = 'block';
                                                applyBtn.textContent = '✓ Apply to field';
                                                applyBtn.onclick = () => {
                                                    f.el.value = newVal;
                                                    f.el.dispatchEvent(new Event('input', { bubbles: true }));
                                                    f.el.dispatchEvent(new Event('change', { bubbles: true }));
                                                    f.el.classList.add('nova-filled');
                                                    // Update inline preview
                                                    const valEl = mainRow.querySelector('.nr-val');
                                                    if (valEl) valEl.textContent = newVal.length > 38 ? newVal.slice(0, 36) + '…' : newVal;
                                                    // Update source badge
                                                    const srcEl = mainRow.querySelector('.nr-src');
                                                    if (srcEl) { srcEl.textContent = 'AI'; srcEl.className = 'nr-src ai'; }
                                                    else {
                                                        const s = document.createElement('span');
                                                        s.className = 'nr-src ai';
                                                        s.textContent = 'AI';
                                                        mainRow.querySelector('.nr-right')?.prepend(s);
                                                    }
                                                    // Icon flashes indigo
                                                    const iconEl = mainRow.querySelector('.nr-icon');
                                                    if (iconEl) { iconEl.style.background = '#eef2ff'; iconEl.style.color = '#6366f1'; }
                                                    // Close + reset
                                                    setTimeout(() => {
                                                        expandPanel.classList.remove('open');
                                                        refineBtn.classList.remove('open');
                                                        replyEl.classList.remove('on');
                                                        replyEl.textContent = '';
                                                        applyBtn.style.display = 'none';
                                                        chipsEl.style.display = 'flex';
                                                        barInput.value = '';
                                                        sendBtn2.disabled = false;
                                                    }, 700);
                                                };
                                                setTimeout(() => messagesEl.scrollTop = messagesEl.scrollHeight, 60);
                                            } else {
                                                replyEl.textContent = '⚠ Could not generate — try again.';
                                                replyEl.classList.add('on');
                                                sendBtn2.disabled = false;
                                            }
                                        } catch (err) {
                                            thinkEl.classList.remove('on');
                                            replyEl.textContent = '⚠ Error: ' + err.message;
                                            replyEl.classList.add('on');
                                            sendBtn2.disabled = false;
                                        }
                                    };

                                    // Chips
                                    expandPanel.querySelectorAll('.nr-chip').forEach(chip => {
                                        chip.addEventListener('click', () => _runRegen(chip.textContent.trim()));
                                    });
                                    // Bar
                                    sendBtn2.addEventListener('click', () => { const t = barInput.value.trim(); if (t) _runRegen(t); });
                                    barInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const t = barInput.value.trim(); if (t) _runRegen(t); } });

                                    // Hover spotlight + beam
                                    mainRow.addEventListener('mouseenter', () => {
                                        f.el.classList.add('smarthirex-spotlight');
                                        if (typeof window.showConnectionBeam === 'function') window.showConnectionBeam(mainRow, f.el);
                                    });
                                    mainRow.addEventListener('mouseleave', () => {
                                        f.el.classList.remove('smarthirex-spotlight');
                                        if (typeof window.hideConnectionBeam === 'function') window.hideConnectionBeam();
                                    });
                                    mainRow.addEventListener('click', (e) => {
                                        if (e.target.closest('.nr-refine')) return;
                                        f.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        f.el.focus();
                                    });
                                }); // end filled forEach

                                // Skipped section
                                if (skippedCount > 0) {
                                    const skipSec = resultEl.querySelector(`#${fillCardId}-skip`);
                                    // Label
                                    const lbl = document.createElement('div');
                                    lbl.className = 'nr-group-lbl';
                                    lbl.textContent = `${skippedCount} skipped`;
                                    skipSec.appendChild(lbl);
                                    // Rows
                                    fieldResults.filter(r => !r.isFilled).forEach(({ f }, si) => {
                                        const selector = f.el.id ? `#${f.el.id}` : (f.el.name ? `[name="${f.el.name}"]` : null);
                                        const skipRowId = `${fillCardId}-sk-${si}`;

                                        const rowWrap = document.createElement('div');
                                        rowWrap.id = skipRowId;

                                        const row = document.createElement('div');
                                        row.className = 'nr-row nr-skip';
                                        row.innerHTML = `
                                            <div class="nr-icon">${_fieldIcon(f.el)}</div>
                                            <div class="nr-body">
                                                <div class="nr-name">${esc(f.label)}</div>
                                                <div class="nr-val">Not filled</div>
                                            </div>
                                            <div class="nr-right">
                                                <button class="nr-refine" title="Fill with AI">
                                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
                                                </button>
                                            </div>`;

                                        const expandPanel = document.createElement('div');
                                        expandPanel.className = 'nr-expand';
                                        expandPanel.innerHTML = `
                                            <div class="nr-expand-head">Fill <strong>${esc(f.label)}</strong> with AI</div>
                                            <div class="nr-chips">
                                                <span class="nr-chip">Write from resume</span>
                                                <span class="nr-chip">Professional tone</span>
                                                <span class="nr-chip">Keep it concise</span>
                                            </div>
                                            <div class="nr-thinking">
                                                <span class="nw-scan-spinner reading" style="width:11px;height:11px;border-width:1.5px;flex-shrink:0;border-color:rgba(99,102,241,0.25);border-top-color:#6366f1;border-right-color:#a5b4fc;"></span>
                                                Nova is writing…
                                            </div>
                                            <div class="nr-reply"></div>
                                            <div class="nr-bar">
                                                <input class="nr-bar-input" type="text" placeholder="Describe what to write…" />
                                                <button class="nr-bar-send">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                                                </button>
                                            </div>`;

                                        rowWrap.appendChild(row);
                                        rowWrap.appendChild(expandPanel);
                                        skipSec.appendChild(rowWrap);

                                        // Toggle
                                        const refineBtn = row.querySelector('.nr-refine');
                                        refineBtn.addEventListener('click', (e) => {
                                            e.stopPropagation();
                                            const isOpen = expandPanel.classList.contains('open');
                                            resultEl.querySelectorAll('.nr-expand.open').forEach(p => {
                                                p.classList.remove('open');
                                                p.previousElementSibling?.querySelector('.nr-refine')?.classList.remove('open');
                                            });
                                            if (!isOpen) {
                                                expandPanel.classList.add('open');
                                                refineBtn.classList.add('open');
                                                expandPanel.querySelector('.nr-bar-input').focus();
                                                setTimeout(() => messagesEl.scrollTop = messagesEl.scrollHeight, 60);
                                            }
                                        });

                                        // Regen logic (same pattern as filled rows)
                                        const thinkEl  = expandPanel.querySelector('.nr-thinking');
                                        const replyEl  = expandPanel.querySelector('.nr-reply');
                                        const barInput = expandPanel.querySelector('.nr-bar-input');
                                        const sendBtn2 = expandPanel.querySelector('.nr-bar-send');
                                        const chipsEl  = expandPanel.querySelector('.nr-chips');

                                        const _runSkipFill = async (instruction) => {
                                            chipsEl.style.display = 'none';
                                            thinkEl.classList.add('on');
                                            replyEl.classList.remove('on');
                                            sendBtn2.disabled = true;

                                            try {
                                                let newVal = null;
                                                if (typeof window.regenerateFieldWithAI === 'function') {
                                                    const r = await window.regenerateFieldWithAI(selector, f.label, instruction);
                                                    if (r?.success) newVal = r.value || f.el.value;
                                                } else {
                                                    newVal = await new Promise(resolve => {
                                                        chrome.runtime.sendMessage({
                                                            type: 'AI_REQUEST',
                                                            prompt: `Job application field: "${f.label}"\nInstruction: ${instruction || 'write a suitable value'}\nReturn only the answer text.`,
                                                            systemInstruction: 'Return only the answer text. No explanation, no quotes.',
                                                            options: { maxTokens: 400, temperature: 0.7, provider: activeProvider }
                                                        }, r => resolve(r?.success ? r.text?.trim() : null));
                                                    });
                                                    if (newVal && f.el) {
                                                        f.el.value = newVal;
                                                        f.el.dispatchEvent(new Event('input', { bubbles: true }));
                                                        f.el.dispatchEvent(new Event('change', { bubbles: true }));
                                                    }
                                                }

                                                thinkEl.classList.remove('on');

                                                if (newVal) {
                                                    replyEl.textContent = newVal;
                                                    replyEl.classList.add('on');
                                                    let applyBtn = expandPanel.querySelector('.nr-apply-btn');
                                                    if (!applyBtn) {
                                                        applyBtn = document.createElement('button');
                                                        applyBtn.className = 'nr-apply-btn';
                                                        replyEl.after(applyBtn);
                                                    }
                                                    applyBtn.style.display = 'block';
                                                    applyBtn.textContent = '✓ Apply to field';
                                                    applyBtn.onclick = () => {
                                                        f.el.value = newVal;
                                                        f.el.dispatchEvent(new Event('input', { bubbles: true }));
                                                        f.el.dispatchEvent(new Event('change', { bubbles: true }));
                                                        f.el.classList.add('nova-filled');
                                                        // Promote row to filled state
                                                        row.classList.remove('nr-skip');
                                                        row.querySelector('.nr-val').textContent = newVal.length > 38 ? newVal.slice(0, 36) + '…' : newVal;
                                                        row.querySelector('.nr-val').style.fontStyle = 'normal';
                                                        row.querySelector('.nr-icon').style.background = '#eef2ff';
                                                        row.querySelector('.nr-icon').style.color = '#6366f1';
                                                        const right = row.querySelector('.nr-right');
                                                        const badge = document.createElement('span');
                                                        badge.className = 'nr-src ai';
                                                        badge.textContent = 'AI';
                                                        right.insertBefore(badge, right.firstChild);
                                                        setTimeout(() => {
                                                            expandPanel.classList.remove('open');
                                                            refineBtn.classList.remove('open');
                                                            replyEl.classList.remove('on');
                                                            replyEl.textContent = '';
                                                            applyBtn.style.display = 'none';
                                                            chipsEl.style.display = 'flex';
                                                            barInput.value = '';
                                                            sendBtn2.disabled = false;
                                                        }, 700);
                                                    };
                                                    setTimeout(() => messagesEl.scrollTop = messagesEl.scrollHeight, 60);
                                                } else {
                                                    replyEl.textContent = '⚠ Could not generate — try again.';
                                                    replyEl.classList.add('on');
                                                    sendBtn2.disabled = false;
                                                }
                                            } catch (err) {
                                                thinkEl.classList.remove('on');
                                                replyEl.textContent = '⚠ Error: ' + err.message;
                                                replyEl.classList.add('on');
                                                sendBtn2.disabled = false;
                                            }
                                        };

                                        expandPanel.querySelectorAll('.nr-chip').forEach(chip => {
                                            chip.addEventListener('click', () => _runSkipFill(chip.textContent.trim()));
                                        });
                                        sendBtn2.addEventListener('click', () => { const t = barInput.value.trim(); if (t) _runSkipFill(t); });
                                        barInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const t = barInput.value.trim(); if (t) _runSkipFill(t); } });

                                        // Hover spotlight + beam (same as filled rows)
                                        row.addEventListener('mouseenter', () => {
                                            f.el.classList.add('smarthirex-spotlight');
                                            if (typeof window.showConnectionBeam === 'function') window.showConnectionBeam(row, f.el);
                                        });
                                        row.addEventListener('mouseleave', () => {
                                            f.el.classList.remove('smarthirex-spotlight');
                                            if (typeof window.hideConnectionBeam === 'function') window.hideConnectionBeam();
                                        });

                                        // Click to jump to field
                                        row.addEventListener('click', (e) => {
                                            if (e.target.closest('.nr-refine')) return;
                                            f.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                            f.el.focus();
                                        });
                                    });
                                }

                                // Undo
                                resultEl.querySelector(`#${fillCardId}-undo`)?.addEventListener('click', () => {
                                    if (window.UndoManager) window.UndoManager.undo();
                                    fields.forEach(f => {
                                        f.el.value = '';
                                        f.el.classList.remove('nova-filled', 'nova-filling');
                                        const badge = document.getElementById('badge-' + (f.el.id || f.el.name));
                                        if (badge) badge.classList.remove('visible');
                                    });
                                    const btn = resultEl.querySelector(`#${fillCardId}-undo`);
                                    if (btn) {
                                        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Done`;
                                        btn.disabled = true;
                                        btn.style.background = '#f0fdf4';
                                        btn.style.borderColor = '#bbf7d0';
                                        btn.style.color = '#15803d';
                                        btn.style.cursor = 'default';
                                    }
                                });
                            }
                            messagesEl.scrollTop = messagesEl.scrollHeight;

                            // Teardown watchers
                            if (typeof window._novaTeardownWatchers === 'function') {
                                window._novaTeardownWatchers();
                                window._novaTeardownWatchers = null;
                            }
                            window._novaFillCardId      = null;
                            window._novaFillStats       = null;
                            window._novaOnFillComplete  = null;
                            window._novaOnFieldAnswered = null;
                            if (window._novaOrigShowWidget)       window.showProcessingWidget     = window._novaOrigShowWidget;
                            if (window._novaOrigUpdateProgress)   window.updateProcessingProgress = window._novaOrigUpdateProgress;
                            if (window._novaOrigShowSidebar)      window.showAccordionSidebar     = window._novaOrigShowSidebar;
                            if (window._novaOrigShowSuccessToast) window.showSuccessToast         = window._novaOrigShowSuccessToast;
                            if (window._novaOrigTriggerConfetti)  window.triggerConfetti          = window._novaOrigTriggerConfetti;
                            window._novaOrigShowWidget = window._novaOrigUpdateProgress =
                                window._novaOrigShowSidebar = window._novaOrigShowSuccessToast =
                                window._novaOrigTriggerConfetti = null;
                        };
                    };

                    const _doFill = () => {
                        if (window.FormProcessor && window.FormProcessor.process) {
                            _applyOverrides();
                            window.FormProcessor.process();
                        } else {
                            const labelEl = document.getElementById(fillCardId + '-label');
                            const iconEl  = document.getElementById(fillCardId + '-icon');
                            if (labelEl) { labelEl.textContent = 'Engine not ready'; labelEl.style.color = '#ef4444'; }
                            if (iconEl)  iconEl.outerHTML = `<span style="font-size:14px;flex-shrink:0;">⚠</span>`;
                            _teardownWatchers();
                        }
                    };

                    if (window.__NOVA_LOADED && window.FormProcessor) {
                        _doFill();
                    } else if (typeof loadAllScripts === 'function') {
                        loadAllScripts().then(_doFill).catch(_doFill);
                    } else {
                        chrome.runtime.sendMessage({ type: 'INJECT_SCRIPTS' }, () => setTimeout(_doFill, 500));
                    }
                });

                chatHistory.push({ role: 'ai', text: `Form detected — ${fields.length} fields. Ready to fill.`, ts: fillTs });
                break;
            }

            case 'compatibility': {
                const result = await resolveCompatibility();
                if (!result) {
                    const msg = !pageContent
                        ? "I couldn't read the job description on this page. Make sure you're on a job posting and try again."
                        : '⚠️ No resume found. Please go to **Settings** and add your profile first, then try again.';
                    appendMsg('ai', msg);
                    chatHistory.push({ role: 'ai', text: msg, ts: Date.now() });
                } else {
                    renderCompatibilityCard(result);
                    const summary = `Fit analysis: ${result.score}/10 — ${result.verdict || ''}`;
                    chatHistory.push({ role: 'compat', result, ts: Date.now(), text: summary });
                }
                break;
            }

            case 'scan_jobs': {
                removeThinking(thinkId);
                isThinking = false;
                await resolveScanJobs();
                return;
            }

            case 'save_job': {
                const result = saveCurrentJob();
                if (result.startsWith('__JOB_SAVED__:')) {
                    const job = JSON.parse(result.slice('__JOB_SAVED__:'.length));
                    renderJobSavedCard(job);
                    chatHistory.push({ role: 'ai', text: `Saved "${job.title}" to job tracker.`, ts: Date.now() });
                } else {
                    appendMsg('ai', result);
                    chatHistory.push({ role: 'ai', text: result, ts: Date.now() });
                }
                break;
            }

            case 'list_jobs': {
                renderJobTracker();
                const jobs = jtLoad();
                chatHistory.push({ role: 'ai', text: `Showing job tracker (${jobs.length} jobs).`, ts: Date.now() });
                break;
            }

            case 'save_page': {
                const result = saveCurrentPage();
                if (result === '__PAGE_EXISTS__') {
                    appendMsg('ai', '**Already saved!** This page is already in your saved pages. Open the menu → **Saved Pages** to view it.');
                    chatHistory.push({ role: 'ai', text: 'Page already saved.', ts: Date.now() });
                } else {
                    const page = JSON.parse(result.slice('__PAGE_SAVED__:'.length));
                    renderPageSavedCard(page);
                    appendMsgRaw('ai', `🔖 <strong>${esc(page.title)}</strong> saved. Open the menu → <strong>Saved Pages</strong> to view all.`);
                    chatHistory.push({ role: 'ai', text: `Saved page: "${page.title}"`, ts: Date.now() });
                }
                break;
            }

            case 'list_pages': {
                renderSavedPages();
                chatHistory.push({ role: 'ai', text: 'Opened saved pages panel.', ts: Date.now() });
                break;
            }

            default: {
                const answer = await resolveContent(intent, originalText);
                appendMsg('ai', answer);
                chatHistory.push({ role: 'ai', text: answer, ts: Date.now() });
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
        chatHistory.push({ role: 'user', text, ts: Date.now() });
        inputEl.value = '';
        inputEl.style.height = 'auto';
        sendBtn.disabled = true;

        const thinkId = showThinking();
        isThinking = true;
        try {
            const SCAN_PATTERN = /\b(scan|check|analyse|analyze|compare|rank|score|review)\b.{0,30}\bjobs?\b|\bjobs?\b.{0,30}\b(scan|check|match|fit|compatible|compatibility|suit|qualify)\b|\bwhich jobs?\b|\ball jobs?\b|\bthese jobs?\b|\bjob listings?\b/i;
            if (SCAN_PATTERN.test(text)) {
                removeThinking(thinkId);
                isThinking = false;
                await resolveScanJobs();
                return;
            }

            const FILL_PATTERN = /\b(fill|autofill|auto-fill|auto fill)\b.{0,25}\b(form|fields?|application|this)\b|\b(fill this|fill the form|fill in|complete this form|fill out)\b/i;
            if (FILL_PATTERN.test(text)) {
                removeThinking(thinkId);
                isThinking = false;
                await dispatchIntent({ intent: 'fill' }, text, thinkId);
                return;
            }

            const NAV_PATTERN = /\b(open|go to|take me to|navigate to|visit|show me|bring me to|launch)\b|\bmy (profile|account|settings|dashboard|inbox|messages|notifications|jobs|feed|network|connections|page|resume)\b/i;
            const isNav = NAV_PATTERN.test(text);
            console.log(`[Nova v${WIDGET_VERSION}] doSend: "${text}" | navPattern=${isNav}`);

            if (isNav) {
                const resolved = await resolveUrl(text);
                removeThinking(thinkId);
                if (resolved?.url) {
                    navigate(resolved.url, resolved.label);
                    chatHistory.push({ role: 'ai', text: `Navigating to ${resolved.label || resolved.url}`, ts: Date.now() });
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
    function renderMsg(role, text, ts, extra) {
        if (role === 'scan') {
            _renderScanCard(extra || [], ts);
            return;
        }
        if (role === 'compat') {
            if (extra) renderCompatibilityCard(extra);
            return;
        }
        appendMsg(role, text, true, ts); // instant — no ghost typing for history restore
    }

    function _renderScanCard(records, ts) {
        const jobs = records.map(r => ({ url: r.url, title: r.title }));
        const card = getOrCreateScanCard(jobs, false, ts);
        const listEl  = card.querySelector(`#${SCAN_CARD_ID}-list`);
        const barEl   = card.querySelector(`#${SCAN_CARD_ID}-bar`);
        const progEl  = card.querySelector(`#${SCAN_CARD_ID}-prog`);
        const titleEl = card.querySelector(`#${SCAN_CARD_ID}-title`);

        records.forEach((r, i) => {
            const row = makeJobRow({ url: r.url, title: r.title }, i);
            listEl.appendChild(row);
            if (r.status === 'done') {
                setRowState(row, 'done', { score: r.score, verdict: r.verdict, match: r.match, gap: r.gap });
            } else {
                setRowState(row, 'error', {}, r.errorMsg || 'Could not load');
            }
        });

        Array.from(listEl.querySelectorAll('.nw-scan-row'))
            .sort((a, b) => (parseInt(b.dataset.score) || 0) - (parseInt(a.dataset.score) || 0))
            .forEach(r => listEl.appendChild(r));

        const scoredRecords = records.filter(r => r.status === 'done');
        if (scoredRecords.length) _lastScanResults = scoredRecords;

        barEl.style.width = '100%';
        barEl.classList.add('done');
        progEl.textContent  = '';
        titleEl.textContent = `✅ Scanned ${records.length} jobs — ${scoredRecords.length} scored`;
        _wireFilterChips(card, listEl, scoredRecords);
        if (scoredRecords.length) _appendPodium(listEl, scoredRecords);
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

    function appendMsg(role, text, instant = false, ts = Date.now()) {
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
                <div class="nw-user-body">
                    <div class="nw-bubble">${esc(text)}</div>
                </div>
                <button class="nw-edit-btn" title="Edit message">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>`;
            wrap.querySelector('.nw-user-body').appendChild(makeTimeEl(ts));
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
    // Note: FILL_COMPLETE is handled via window._novaOnFillComplete (direct call),
    // not here, because chrome.runtime.sendMessage goes to background only.
    chrome.runtime.onMessage.addListener((message) => {
        // Cache stats for the fill card (sent from FormProcessor.updateStats)
        if (message.type === 'UPDATE_STATS' && message.payload) {
            window._novaFillStats = message.payload;
        }

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
