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

    // ── Field history picker ──────────────────────────────────────────────────
    const FIELD_HISTORY_KEY = 'nova_field_history';
    function _fhLoad() { try { return JSON.parse(localStorage.getItem(FIELD_HISTORY_KEY) || '{}'); } catch { return {}; } }
    function _fhSave(map) { try { localStorage.setItem(FIELD_HISTORY_KEY, JSON.stringify(map)); } catch {} }
    function _fhBucketKey(el) {
        const t = (el.type || 'text').toLowerCase();
        const name = (el.name || el.id || el.placeholder || '').toLowerCase();
        if (/email/.test(name) || t === 'email') return 'email';
        if (/phone|tel|mobile/.test(name) || t === 'tel') return 'phone';
        if (/name/.test(name)) return 'name';
        if (/company|employer|organization/.test(name)) return 'company';
        if (/title|position|role/.test(name)) return 'title';
        if (/location|city|address/.test(name)) return 'location';
        if (/salary|compensation|pay/.test(name)) return 'salary';
        if (/linkedin/.test(name)) return 'linkedin';
        if (/github|portfolio|website|url/.test(name) || t === 'url') return 'url';
        if (t === 'textarea') return 'textarea_' + name.slice(0, 20);
        return t + '_' + name.slice(0, 20);
    }
    function _fhRecord(el) {
        if (!el.value?.trim()) return;
        const key = _fhBucketKey(el);
        const map = _fhLoad();
        const list = (map[key] || []).filter(v => v !== el.value).slice(0, 4);
        list.unshift(el.value);
        map[key] = list.slice(0, 3);
        _fhSave(map);
    }
    function _fhShowPicker(el) {
        document.getElementById('nova-fh-picker')?.remove();
        const key = _fhBucketKey(el);
        const suggestions = (_fhLoad()[key] || []);
        if (!suggestions.length) return;
        const rect = el.getBoundingClientRect();
        const picker = document.createElement('div');
        picker.id = 'nova-fh-picker';
        picker.style.cssText = `position:fixed;z-index:2147483647;left:${rect.left}px;top:${rect.bottom + 4}px;min-width:${Math.max(rect.width, 160)}px;max-width:320px;background:white;border:1.5px solid #e0e7ff;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.12);overflow:hidden;font-family:-apple-system,sans-serif;`;
        picker.innerHTML = `<div style="padding:5px 10px 3px;font-size:9.5px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;background:#f8f9ff;border-bottom:1px solid #f1f5f9;">Recent values</div>` +
            suggestions.map((v, i) => `<div class="nova-fh-item" data-i="${i}" style="padding:7px 10px;font-size:12.5px;color:#1e293b;cursor:pointer;border-bottom:1px solid #f8f9ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${v}">${v}</div>`).join('');
        document.body.appendChild(picker);
        picker.querySelectorAll('.nova-fh-item').forEach(item => {
            item.addEventListener('mousedown', e => {
                e.preventDefault();
                el.value = suggestions[+item.dataset.i];
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                picker.remove();
            });
            item.addEventListener('mouseenter', () => item.style.background = '#f0f4ff');
            item.addEventListener('mouseleave', () => item.style.background = '');
        });
        setTimeout(() => {
            const close = (e) => { if (!picker.contains(e.target) && e.target !== el) { picker.remove(); document.removeEventListener('mousedown', close); } };
            document.addEventListener('mousedown', close);
        }, 0);
    }

    // ── Form Autosave ─────────────────────────────────────────────────────────
    const FORM_AUTOSAVE_KEY = 'nova_form_autosave';
    let _autosaveTimer = null;

    function _autosaveStart() {
        _autosaveStop();
        _autosaveTimer = setInterval(() => {
            try {
                const inputs = Array.from(document.querySelectorAll('input,textarea,select'))
                    .filter(el => el.offsetParent !== null && !el.closest('#nova-chat-widget') && el.value?.trim());
                if (!inputs.length) return;
                const snapshot = inputs.reduce((acc, el) => {
                    const key = el.id || el.name || el.placeholder || el.type;
                    if (key) acc[key] = el.value;
                    return acc;
                }, {});
                const store = _asLoad();
                store[location.href] = { ts: Date.now(), snapshot, url: location.href, title: document.title.replace(/\s*[\|\-–—].*$/, '').trim() };
                // Keep only last 20 pages
                const keys = Object.keys(store);
                if (keys.length > 20) {
                    const oldest = keys.sort((a, b) => store[a].ts - store[b].ts)[0];
                    delete store[oldest];
                }
                localStorage.setItem(FORM_AUTOSAVE_KEY, JSON.stringify(store));
            } catch {}
        }, 30000);
    }

    function _autosaveStop() {
        if (_autosaveTimer) { clearInterval(_autosaveTimer); _autosaveTimer = null; }
    }

    function _asLoad() {
        try { return JSON.parse(localStorage.getItem(FORM_AUTOSAVE_KEY) || '{}'); } catch { return {}; }
    }

    // ── Reading Progress Tracker ──────────────────────────────────────────────
    const READ_PROGRESS_KEY = 'nova_read_progress';
    function _rpLoad() { try { return JSON.parse(localStorage.getItem(READ_PROGRESS_KEY) || '{}'); } catch { return {}; } }
    function _rpSave(map) { try { localStorage.setItem(READ_PROGRESS_KEY, JSON.stringify(map)); } catch {} }
    function _rpPageHeight() { return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight); }
    function _rpScrollPct() {
        const scrolled = window.scrollY || document.documentElement.scrollTop;
        const total = _rpPageHeight() - window.innerHeight;
        return total > 0 ? Math.round((scrolled / total) * 100) : 0;
    }

    // ── Web Clipper ───────────────────────────────────────────────────────────
    const CLIPS_KEY = 'nova_clips';
    async function _clipsLoad() {
        const res = await NovaChatCore.sharedGet([CLIPS_KEY]);
        return res[CLIPS_KEY] || [];
    }
    async function _clipsSave(clips) {
        await NovaChatCore.sharedSet({ [CLIPS_KEY]: clips });
    }

    async function _saveClip(text, pageTitle, url, annotation = '') {
        // Save to nova_clips (detailed record with title/annotation)
        const clips = await _clipsLoad();
        clips.unshift({
            id: Date.now(),
            text: text.slice(0, 800),
            title: pageTitle.replace(/\s*[\|\-–—].*$/, '').trim().slice(0, 60),
            url,
            annotation,
            ts: Date.now(),
            date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        });
        await _clipsSave(clips.slice(0, 200));
        // Also add to clipboard history panel so it shows up immediately
        await cbAdd(text.slice(0, 800));
    }

    // ── Chat Sessions ─────────────────────────────────────────────────────────
    const SESSIONS_KEY = 'nova_chat_sessions';
    let _activeSessionId = null;

    function _sessGenId() { return 'cs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6); }

    async function _sessLoadAll() {
        const res = await NovaChatCore.sharedGet([SESSIONS_KEY]);
        return res[SESSIONS_KEY] || {};
    }

    async function _sessSaveAll(map) {
        await NovaChatCore.sharedSet({ [SESSIONS_KEY]: map });
    }

    function _sessRelTime(ts) {
        const d = Date.now() - ts;
        if (d < 60000) return 'just now';
        if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
        if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
        return Math.floor(d / 86400000) + 'd ago';
    }

    async function _sessSaveCurrent() {
        if (!_activeSessionId) return;
        const map = await _sessLoadAll();
        const sess = map[_activeSessionId];
        if (!sess) return;
        sess.messages = _seed.slice(-60);
        sess.ts = Date.now();
        // Auto-title from first user message
        if (!sess.titled) {
            const first = sess.messages.find(m => m.role === 'user');
            if (first) {
                sess.title = first.text.slice(0, 40) + (first.text.length > 40 ? '…' : '');
                sess.titled = true;
                _updateHeaderTitle(sess.title);
            }
        }
        await _sessSaveAll(map);
    }

    function _updateHeaderTitle(title) {
        const el = document.getElementById('nw-session-title');
        if (!el) return;
        if (title) {
            el.innerHTML = `${esc(title.slice(0, 28))}${title.length > 28 ? '…' : ''} <span>AI</span>`;
        } else {
            el.innerHTML = `Nova <span>AI</span>`;
        }
    }

    async function _sessCreate(switchTo = true) {
        const map = await _sessLoadAll();
        const id = _sessGenId();
        map[id] = { id, title: 'New chat', ts: Date.now(), messages: [], titled: false };
        await _sessSaveAll(map);
        if (switchTo) await _sessSwitchTo(id, map);
        return id;
    }

    async function _sessSwitchTo(id, mapArg) {
        const map = mapArg || await _sessLoadAll();
        const sess = map[id];
        if (!sess) return;

        // Persist current session before switching
        if (_activeSessionId && _activeSessionId !== id) {
            await _sessSaveCurrent();
        }

        _activeSessionId = id;
        try { chrome.storage.local.set({ nova_active_session: id }); } catch {}

        // Swap in-memory history
        _seed.length = 0;
        if (Array.isArray(sess.messages)) _seed.push(...sess.messages);

        // Re-render chat
        const msgs = document.getElementById('nw-messages');
        const chips = document.getElementById('nw-chips');
        if (msgs) {
            msgs.innerHTML = '';
            if (_seed.length) {
                _seed.forEach(m => renderMsg(m.role, m.text, m.ts, m.records));
                if (chips) chips.style.display = 'none';
            } else {
                if (chips) { chips.style.display = 'flex'; renderChips(); }
            }
            msgs.scrollTop = msgs.scrollHeight;
        }
        _updateHeaderTitle(sess.titled ? sess.title : null);
        _lastScanResults = null;
    }

    async function _sessDelete(id) {
        const map = await _sessLoadAll();
        delete map[id];
        await _sessSaveAll(map);
        if (_activeSessionId === id) {
            const remaining = Object.keys(map);
            if (remaining.length) {
                await _sessSwitchTo(remaining[remaining.length - 1]);
            } else {
                await _sessCreate(true);
            }
        }
    }

    function _sessRenderList() {
        _sessLoadAll().then(map => {
            const listEl = document.getElementById('nw-sessions-list');
            if (!listEl) return;
            const sorted = Object.values(map).sort((a, b) => b.ts - a.ts);
            if (!sorted.length) {
                listEl.innerHTML = `<div class="nw-sessions-empty">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    No saved sessions yet
                </div>`;
                return;
            }
            listEl.innerHTML = '';
            sorted.forEach(sess => {
                const item = document.createElement('div');
                item.className = 'nw-session-item' + (sess.id === _activeSessionId ? ' active' : '');
                item.dataset.id = sess.id;
                item.innerHTML = `
                    <div class="nw-session-icon">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    </div>
                    <div class="nw-session-info">
                        <div class="nw-session-name">${esc(sess.title || 'New chat')}</div>
                        <div class="nw-session-meta">${(sess.messages || []).filter(m => m.role === 'user').length} messages · ${_sessRelTime(sess.ts)}</div>
                    </div>
                    <button class="nw-session-del" title="Delete session">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                    </button>`;
                item.querySelector('.nw-session-del').addEventListener('click', e => {
                    e.stopPropagation();
                    _sessDelete(sess.id).then(() => _sessRenderList());
                });
                item.addEventListener('click', () => {
                    _sessSwitchTo(sess.id).then(() => {
                        document.getElementById('nw-sessions-panel').classList.remove('open');
                    });
                });
                listEl.appendChild(item);
            });
        });
    }

    const _seed = [];

    const chatHistory = new Proxy(_seed, {
        get(target, prop) {
            if (prop === 'push') {
                return (...args) => {
                    const result = Array.prototype.push.apply(target, args);
                    // Save to active session
                    _sessSaveCurrent();
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
        /* ── Sessions panel ── */
        .nw-sessions-panel {
            position: absolute; inset: 0; background: #fff; z-index: 6;
            display: none; flex-direction: column;
        }
        .nw-sessions-panel.open { display: flex; }
        .nw-sessions-header {
            display: flex; align-items: center; gap: 10px;
            padding: 0 14px; height: 52px;
            background: #fff; border-bottom: 1px solid #e5e7eb; flex-shrink: 0;
        }
        .nw-sessions-back {
            width: 28px; height: 28px; border: 1px solid #e5e7eb;
            border-radius: 7px; background: #fff; color: #6b7280;
            cursor: pointer; display: flex; align-items: center;
            justify-content: center; transition: all 0.15s; flex-shrink: 0;
        }
        .nw-sessions-back:hover { background: #f3f4f6; color: #111827; }
        .nw-sessions-title { font-size: 13px; font-weight: 700; color: #111827; flex: 1; }
        .nw-sessions-new {
            display: flex; align-items: center; gap: 6px;
            padding: 5px 11px; background: #6366f1; color: white;
            border: none; border-radius: 8px; font-size: 11.5px; font-weight: 600;
            cursor: pointer; font-family: inherit; transition: all 0.15s; flex-shrink: 0;
        }
        .nw-sessions-new:hover { background: #4f46e5; }
        .nw-sessions-list { flex: 1; overflow-y: auto; padding: 6px 0; }
        .nw-session-item {
            display: flex; align-items: center; gap: 8px;
            padding: 9px 14px; cursor: pointer;
            transition: background 0.1s; position: relative;
        }
        .nw-session-item:hover { background: #f9fafb; }
        .nw-session-item.active { background: #eef2ff; }
        .nw-session-item.active .nw-session-name { color: #4338ca; font-weight: 600; }
        .nw-session-icon {
            width: 28px; height: 28px; background: #f3f4f6; border-radius: 8px;
            display: flex; align-items: center; justify-content: center;
            color: #9ca3af; flex-shrink: 0;
        }
        .nw-session-item.active .nw-session-icon { background: #e0e7ff; color: #6366f1; }
        .nw-session-info { flex: 1; min-width: 0; }
        .nw-session-name { font-size: 12px; font-weight: 500; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .nw-session-meta { font-size: 10px; color: #9ca3af; margin-top: 1px; }
        .nw-session-del {
            opacity: 0; width: 22px; height: 22px; border: none; background: none;
            color: #9ca3af; cursor: pointer; border-radius: 5px; padding: 0;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.15s; flex-shrink: 0;
        }
        .nw-session-item:hover .nw-session-del { opacity: 1; }
        .nw-session-del:hover { background: #fee2e2; color: #ef4444; }
        .nw-sessions-empty {
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; padding: 40px 20px; color: #9ca3af;
            font-size: 12px; text-align: center; gap: 8px;
        }
        /* ── Clipboard History panel ── */
        .nw-cb-panel {
            position: absolute; inset: 0; background: #f8f9fb; z-index: 5;
            display: none; flex-direction: column;
        }
        .nw-cb-panel.open { display: flex; }
        .nw-cb-panel-header {
            display: flex; align-items: center; gap: 10px;
            padding: 0 16px; height: 52px;
            background: #fff;
            border-bottom: 1px solid #e5e7eb; flex-shrink: 0;
        }
        .nw-cb-panel-back {
            width: 28px; height: 28px; border: 1px solid #e5e7eb;
            border-radius: 7px; background: #fff; color: #6b7280;
            cursor: pointer; display: flex; align-items: center;
            justify-content: center; transition: all 0.15s; flex-shrink: 0;
        }
        .nw-cb-panel-back:hover { background: #f3f4f6; color: #111827; }
        .nw-cb-panel-title { font-size: 13px; font-weight: 700; color: #111827; flex: 1; }
        .nw-cb-count {
            font-size: 10.5px; font-weight: 600; color: #6366f1;
            background: #eef2ff; padding: 2px 8px; border-radius: 10px;
        }
        .nw-cb-search {
            padding: 10px 12px; background: #fff;
            border-bottom: 1px solid #e5e7eb; flex-shrink: 0;
        }
        .nw-cb-search-inner {
            display: flex; align-items: center; gap: 8px;
            background: #f3f4f6; border: 1.5px solid transparent;
            border-radius: 9px; padding: 7px 10px;
            transition: border-color 0.15s;
        }
        .nw-cb-search-inner:focus-within { border-color: #6366f1; background: #fff; }
        .nw-cb-search-inner svg { color: #9ca3af; flex-shrink: 0; }
        .nw-cb-search-inner input {
            flex: 1; border: none; outline: none; font-size: 12px;
            background: transparent; font-family: inherit; color: #111827;
        }
        .nw-cb-search-inner input::placeholder { color: #9ca3af; }
        .nw-cb-list {
            flex: 1; overflow-y: auto; padding: 8px 12px;
            display: flex; flex-direction: column; gap: 6px;
        }
        .nw-cb-item {
            background: #fff;
            border: 1.5px solid #e5e7eb;
            border-radius: 10px;
            padding: 10px 12px;
            cursor: pointer;
            display: flex; align-items: flex-start; gap: 10px;
            transition: border-color 0.15s, box-shadow 0.15s;
        }
        .nw-cb-item:hover {
            border-color: #6366f1;
            box-shadow: 0 2px 8px rgba(99,102,241,0.1);
        }
        .nw-cb-item:hover .nw-cb-copy-btn { opacity: 1; }
        .nw-cb-icon {
            width: 28px; height: 28px; border-radius: 7px;
            background: #eef2ff; display: flex; align-items: center;
            justify-content: center; flex-shrink: 0; margin-top: 1px;
        }
        .nw-cb-icon svg { color: #6366f1; }
        .nw-cb-body { flex: 1; min-width: 0; }
        .nw-cb-text {
            font-size: 12px; color: #1f2937; line-height: 1.5;
            white-space: pre-wrap; word-break: break-word;
            max-height: 56px; overflow: hidden;
            display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
        }
        .nw-cb-meta {
            display: flex; align-items: center; gap: 6px;
            font-size: 10px; color: #9ca3af; margin-top: 5px;
        }
        .nw-cb-meta-dot { width: 3px; height: 3px; border-radius: 50%; background: #d1d5db; }
        .nw-cb-copy-btn {
            opacity: 0; flex-shrink: 0;
            padding: 4px 10px; background: #6366f1; color: #fff;
            border: none; border-radius: 6px; font-size: 10.5px; font-weight: 600;
            cursor: pointer; font-family: inherit;
            transition: opacity 0.15s, background 0.15s;
            align-self: center;
        }
        .nw-cb-copy-btn:hover { background: #4f46e5; }
        .nw-cb-copy-btn.copied { background: #10b981; opacity: 1; }
        .nw-cb-empty {
            padding: 40px 20px; text-align: center; color: #9ca3af; font-size: 12px;
            line-height: 1.6;
        }
        .nw-cb-empty-icon { font-size: 28px; margin-bottom: 8px; }
        /* ── Sticky Notes panel ── */
        .nw-sn-panel {
            position: absolute; inset: 0; background: #f8fafc; z-index: 5;
            display: none; flex-direction: column;
        }
        .nw-sn-panel.open { display: flex; }
        .nw-sn-panel-header {
            display: flex; align-items: center; gap: 10px;
            padding: 0 14px; height: 52px;
            background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%);
            border-bottom: 1px solid rgba(99,102,241,0.15); flex-shrink: 0;
        }
        .nw-sn-panel-back {
            width: 28px; height: 28px; border: 1px solid rgba(99,102,241,0.25);
            border-radius: 8px; background: rgba(255,255,255,0.8); color: #4338ca;
            cursor: pointer; display: flex; align-items: center;
            justify-content: center; transition: all 0.15s; flex-shrink: 0;
        }
        .nw-sn-panel-back:hover { background: #fff; box-shadow: 0 1px 4px rgba(99,102,241,0.15); }
        .nw-sn-panel-title { font-size: 13px; font-weight: 700; color: #312e81; flex: 1; }
        .nw-sn-panel-count {
            font-size: 10.5px; font-weight: 700; color: #4338ca;
            background: rgba(255,255,255,0.8); border: 1px solid rgba(99,102,241,0.25);
            padding: 2px 9px; border-radius: 20px;
        }
        /* Search + tag toolbar */
        .nw-sn-toolbar {
            padding: 10px 12px 6px; display: flex; flex-direction: column; gap: 7px;
            border-bottom: 1px solid #e5e7eb; background: #fff; flex-shrink: 0;
        }
        .nw-sn-search-wrap {
            display: flex; align-items: center; gap: 7px;
            background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 10px;
            padding: 6px 11px; transition: border-color 0.15s;
        }
        .nw-sn-search-wrap:focus-within { border-color: #6366f1; background: #fff; }
        .nw-sn-search-wrap svg { flex-shrink: 0; color: #9ca3af; }
        .nw-sn-search-input {
            flex: 1; border: none; outline: none; background: transparent;
            font-size: 12.5px; color: #111827; font-family: inherit;
        }
        .nw-sn-search-input::placeholder { color: #9ca3af; }
        .nw-sn-tag-filters {
            display: flex; gap: 5px; flex-wrap: wrap; padding-bottom: 2px;
        }
        .nw-sn-tag-pill {
            padding: 3px 10px; border-radius: 20px; font-size: 10.5px; font-weight: 600;
            cursor: pointer; border: 1.5px solid transparent; transition: all 0.12s;
            font-family: inherit;
        }
        .nw-sn-tag-pill:hover { filter: brightness(0.95); }
        .nw-sn-tag-pill.active { border-color: currentColor; box-shadow: 0 0 0 2px rgba(99,102,241,0.1); }
        /* Note list */
        .nw-sn-list {
            flex: 1; overflow-y: auto; padding: 10px 10px;
            display: flex; flex-direction: column; gap: 8px;
        }
        .nw-sn-card {
            background: #fff;
            border: 1px solid #e2e8f0;
            border-left: 3.5px solid #6366f1;
            border-radius: 12px; padding: 11px 12px 10px;
            cursor: pointer;
            transition: box-shadow 0.15s, border-color 0.15s, transform 0.1s;
            box-shadow: 0 1px 4px rgba(0,0,0,0.04);
        }
        .nw-sn-card:hover {
            box-shadow: 0 4px 14px rgba(99,102,241,0.12);
            border-color: #c7d2fe; border-left-color: #4f46e5;
            transform: translateY(-1px);
        }
        .nw-sn-card-url {
            font-size: 10px; color: #6366f1; font-weight: 600;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            margin-bottom: 5px; display: flex; align-items: center; gap: 4px;
        }
        .nw-sn-card-text {
            font-size: 12.5px; color: #1c1917; line-height: 1.55;
            display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .nw-sn-card-footer {
            display: flex; align-items: center; justify-content: space-between;
            margin-top: 8px; padding-top: 7px;
            border-top: 1px solid #f1f5f9;
        }
        .nw-sn-card-ts { font-size: 10px; color: #6366f1; font-weight: 500; }
        .nw-sn-card-actions { display: flex; gap: 5px; }
        .nw-sn-card-btn {
            padding: 3px 10px; border: none; border-radius: 6px;
            font-size: 10.5px; font-weight: 600; cursor: pointer;
            font-family: inherit; transition: all 0.12s;
        }
        .nw-sn-card-btn.open {
            background: linear-gradient(135deg,#6366f1,#4f46e5);
            color: #fff; box-shadow: 0 1px 4px rgba(99,102,241,0.3);
        }
        .nw-sn-card-btn.open:hover { background: #4f46e5; box-shadow: 0 2px 8px rgba(99,102,241,0.4); }
        .nw-sn-card-btn.del { background: #f8fafc; color: #6b7280; border: 1px solid #e2e8f0; }
        .nw-sn-card-btn.del:hover { background: #fee2e2; color: #b91c1c; border-color: #fca5a5; }
        /* Empty state */
        .nw-sn-empty {
            padding: 48px 24px; text-align: center;
            color: #9ca3af; font-size: 12.5px; line-height: 1.7;
        }
        .nw-sn-empty-icon { font-size: 36px; margin-bottom: 10px; opacity: 0.7; }
        /* Tags in note card */
        .nw-sn-card-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px; }
        .nw-sn-card-tag {
            padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600;
        }
        /* Tag input area in note widget */
        .nova-sn-tags-row {
            display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
            padding: 6px 12px 5px;
            border-top: 1px solid rgba(99,102,241,0.15);
            background: rgba(238,242,255,0.5); min-height: 32px;
        }
        .nova-sn-tag-chip {
            display: inline-flex; align-items: center; gap: 3px;
            padding: 2px 8px; border-radius: 20px; font-size: 10.5px; font-weight: 600;
            cursor: default; letter-spacing: 0.01em;
        }
        .nova-sn-tag-chip-del {
            cursor: pointer; opacity: 0.55; font-size: 9px; line-height: 1;
            border: none; background: none; padding: 0 1px; color: inherit;
            transition: opacity 0.1s;
        }
        .nova-sn-tag-chip-del:hover { opacity: 1; }
        .nova-sn-tag-input {
            border: none; outline: none; background: transparent; font-family: inherit;
            font-size: 11px; color: #4338ca; min-width: 70px; flex: 1;
        }
        .nova-sn-tag-input::placeholder { color: #818cf8; opacity: 0.7; }
        /* Markdown preview */
        .nova-sn-preview {
            flex: 1; padding: 12px 14px; font-size: 13px; line-height: 1.65;
            color: #1c1917; overflow-y: auto; background: #ffffff;
            min-height: 110px;
        }
        .nova-sn-preview h1,.nova-sn-preview h2,.nova-sn-preview h3 {
            font-size: 13.5px; font-weight: 700; margin: 8px 0 4px; color: #312e81;
        }
        .nova-sn-preview p { margin: 0 0 7px; }
        .nova-sn-preview ul,.nova-sn-preview ol { margin: 0 0 7px; padding-left: 18px; }
        .nova-sn-preview li { margin-bottom: 3px; }
        .nova-sn-preview code {
            background: #eef2ff; border-radius: 4px; padding: 1px 5px;
            font-size: 11.5px; font-family: monospace; color: #4f46e5;
        }
        .nova-sn-preview strong { font-weight: 700; }
        .nova-sn-preview em { font-style: italic; color: #4f46e5; }
        .nova-sn-preview a { color: #6366f1; text-decoration: underline; }
        /* ── Tab Switcher overlay ── */
        .nw-tab-overlay {
            position: fixed; inset: 0; z-index: 2147483647;
            background: rgba(0,0,0,0.55); display: flex;
            align-items: flex-start; justify-content: center;
            padding-top: 80px;
        }
        .nw-tab-palette {
            width: 520px; max-width: calc(100vw - 32px);
            background: #fff; border-radius: 14px;
            box-shadow: 0 24px 80px rgba(0,0,0,0.22);
            overflow: hidden; display: flex; flex-direction: column;
            max-height: calc(100vh - 160px);
        }
        .nw-tab-search-row {
            display: flex; align-items: center; gap: 10px;
            padding: 14px 16px; border-bottom: 1px solid #f3f4f6;
        }
        .nw-tab-search-row svg { color: #9ca3af; flex-shrink: 0; }
        .nw-tab-search-row input {
            flex: 1; border: none; outline: none; font-size: 15px;
            color: #111827; font-family: inherit; background: transparent;
        }
        .nw-tab-search-row input::placeholder { color: #9ca3af; }
        .nw-tab-esc {
            font-size: 10px; color: #9ca3af; background: #f3f4f6;
            padding: 2px 6px; border-radius: 4px; flex-shrink: 0;
        }
        .nw-tab-list { overflow-y: auto; padding: 6px 0; }
        .nw-tab-section-label {
            padding: 4px 16px; font-size: 10px; font-weight: 700;
            color: #9ca3af; text-transform: uppercase; letter-spacing: 0.06em;
        }
        .nw-tab-item {
            display: flex; align-items: center; gap: 10px;
            padding: 9px 16px; cursor: pointer; transition: background 0.1s;
        }
        .nw-tab-item.active, .nw-tab-item:hover { background: #f5f3ff; }
        .nw-tab-item.selected { background: #eef2ff; }
        .nw-tab-favicon { width: 16px; height: 16px; flex-shrink: 0; border-radius: 3px; }
        .nw-tab-info { flex: 1; min-width: 0; }
        .nw-tab-title {
            font-size: 13px; color: #111827; font-weight: 500;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .nw-tab-url {
            font-size: 10px; color: #9ca3af;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .nw-tab-badge {
            font-size: 10px; color: #6366f1; background: #eef2ff;
            padding: 1px 6px; border-radius: 10px; flex-shrink: 0;
        }
        .nw-tab-hint {
            padding: 8px 16px; border-top: 1px solid #f3f4f6;
            font-size: 10px; color: #9ca3af; display: flex; gap: 12px;
        }
        .nw-tab-hint kbd {
            background: #f3f4f6; padding: 1px 5px; border-radius: 4px;
            font-family: inherit; font-size: 10px;
        }
        /* ── Saved pages panel ── */
        .nw-sp-panel {
            position: absolute; inset: 0; background: #fff; z-index: 5;
            display: none; flex-direction: column;
        }
        .nw-sp-panel.open { display: flex; }
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
        /* Highlight & Explain tooltip */
        #nova-explain-tooltip {
            position: fixed; z-index: 2147483646;
            display: flex; align-items: center; gap: 4px;
            background: #1e293b; border-radius: 8px;
            padding: 5px 7px; box-shadow: 0 4px 16px rgba(0,0,0,0.22);
            font-family: -apple-system, sans-serif;
            animation: nova-tooltip-in 0.12s ease;
            pointer-events: auto;
        }
        @keyframes nova-tooltip-in {
            from { opacity: 0; transform: translateY(4px) scale(0.96); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        #nova-explain-tooltip button {
            padding: 3px 9px; border: none; border-radius: 5px;
            font-size: 11.5px; font-weight: 700; cursor: pointer;
            font-family: inherit; white-space: nowrap;
            transition: background 0.12s;
        }
        #nova-explain-tooltip .nova-tt-explain {
            background: #6366f1; color: white;
        }
        #nova-explain-tooltip .nova-tt-explain:hover { background: #4f46e5; }
        #nova-explain-tooltip .nova-tt-ask {
            background: rgba(255,255,255,0.12); color: #e2e8f0;
        }
        #nova-explain-tooltip .nova-tt-ask:hover { background: rgba(255,255,255,0.2); }
        #nova-explain-tooltip .nova-tt-clip {
            background: rgba(255,255,255,0.12); color: #e2e8f0;
        }
        #nova-explain-tooltip .nova-tt-clip:hover { background: rgba(255,255,255,0.2); }
        #nova-explain-tooltip .nova-tt-search {
            background: rgba(255,255,255,0.12); color: #e2e8f0;
        }
        #nova-explain-tooltip .nova-tt-search:hover { background: rgba(255,255,255,0.2); }
        /* Quick Search panel */
        #nova-qs-panel {
            position: fixed; z-index: 2147483645;
            background: #fff; border-radius: 14px;
            border: 1px solid #e5e7eb;
            box-shadow: 0 12px 40px rgba(0,0,0,0.18);
            width: 300px;
            font-family: -apple-system, sans-serif;
            animation: nova-tooltip-in 0.15s ease;
            overflow: hidden;
        }
        #nova-qs-header {
            padding: 10px 14px 8px;
            border-bottom: 1px solid #f3f4f6;
            display: flex; align-items: center; justify-content: space-between;
        }
        #nova-qs-query {
            font-size: 12px; font-weight: 600; color: #374151;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            max-width: 220px;
        }
        #nova-qs-close {
            background: none; border: none; cursor: pointer;
            color: #9ca3af; font-size: 16px; line-height: 1; padding: 0 2px;
        }
        #nova-qs-close:hover { color: #374151; }
        .nova-qs-item {
            display: flex; align-items: center; gap: 10px;
            padding: 9px 14px; cursor: pointer;
            border-bottom: 1px solid #f9fafb;
            transition: background 0.1s; text-decoration: none;
        }
        .nova-qs-item:last-child { border-bottom: none; }
        .nova-qs-item:hover { background: #f5f3ff; }
        .nova-qs-icon {
            width: 28px; height: 28px; border-radius: 8px;
            display: flex; align-items: center; justify-content: center;
            font-size: 15px; flex-shrink: 0;
        }
        .nova-qs-label { font-size: 12.5px; font-weight: 600; color: #111827; }
        .nova-qs-sub   { font-size: 11px; color: #6b7280; }
        /* Link preview card */
        #nova-link-preview {
            position: fixed; z-index: 2147483645;
            background: #fff; border-radius: 12px;
            border: 1px solid #e5e7eb;
            box-shadow: 0 8px 32px rgba(0,0,0,0.14);
            padding: 12px 14px; width: 280px;
            font-family: -apple-system, sans-serif;
            animation: nova-tooltip-in 0.15s ease;
            pointer-events: none;
        }
        .nova-lp-domain {
            display: flex; align-items: center; gap: 6px;
            font-size: 10px; color: #6b7280; margin-bottom: 6px;
        }
        .nova-lp-favicon { width: 14px; height: 14px; border-radius: 3px; }
        .nova-lp-title {
            font-size: 13px; font-weight: 700; color: #111827;
            line-height: 1.35; margin-bottom: 5px;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .nova-lp-desc {
            font-size: 11px; color: #6b7280; line-height: 1.45;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .nova-lp-loading { font-size: 11px; color: #9ca3af; padding: 4px 0; }
        /* ── Reading Mode ── */
        body.nova-reading-mode > *:not(#nova-read-overlay):not(#${WIDGET_ID}):not(#nova-explain-tooltip):not(#nova-sticky-note):not(#nova-qs-panel) {
            display: none !important;
        }
        #nova-read-overlay {
            position: fixed; inset: 0; z-index: 2147483630;
            background: #f9f6f1; overflow-y: auto;
            font-family: Georgia, 'Times New Roman', serif;
        }
        #nova-read-content {
            max-width: 680px; margin: 0 auto;
            padding: 56px 32px 80px;
            color: #1a1a1a;
            font-size: 19px; line-height: 1.75;
        }
        #nova-read-content h1, #nova-read-content h2, #nova-read-content h3 {
            font-family: -apple-system, sans-serif;
            line-height: 1.3; margin: 1.4em 0 0.5em;
            color: #111;
        }
        #nova-read-content h1 { font-size: 1.9em; }
        #nova-read-content h2 { font-size: 1.4em; }
        #nova-read-content h3 { font-size: 1.15em; }
        #nova-read-content p { margin: 0 0 1.15em; }
        #nova-read-content a { color: #6366f1; text-decoration: underline; }
        #nova-read-content img {
            max-width: 100%; height: auto; border-radius: 6px; margin: 1em 0;
        }
        #nova-read-content blockquote {
            border-left: 3px solid #d1d5db; margin: 1.2em 0; padding: 0.5em 1em;
            color: #555; font-style: italic;
        }
        #nova-read-content pre, #nova-read-content code {
            font-family: 'Fira Code', monospace; font-size: 0.85em;
            background: #f3f4f6; border-radius: 4px; padding: 2px 6px;
        }
        #nova-read-content pre { padding: 14px 16px; overflow-x: auto; }
        #nova-read-topbar {
            position: sticky; top: 0; z-index: 1;
            background: rgba(249,246,241,0.94); backdrop-filter: blur(8px);
            border-bottom: 1px solid #e5e7eb;
            display: flex; align-items: center; justify-content: space-between;
            padding: 10px 32px; max-width: 680px; margin: 0 auto;
        }
        #nova-read-title {
            font-family: -apple-system, sans-serif;
            font-size: 13px; font-weight: 600; color: #374151;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            max-width: 480px;
        }
        #nova-read-close {
            font-family: -apple-system, sans-serif;
            background: #111827; color: #fff; border: none;
            border-radius: 8px; padding: 6px 14px;
            font-size: 12px; font-weight: 600; cursor: pointer;
            flex-shrink: 0;
        }
        #nova-read-close:hover { background: #374151; }
        #nova-read-font-ctrl {
            display: flex; align-items: center; gap: 8px;
        }
        .nova-read-fc-btn {
            font-family: -apple-system, sans-serif;
            background: #f3f4f6; border: 1px solid #e5e7eb;
            border-radius: 6px; padding: 4px 9px;
            font-size: 12px; font-weight: 700; cursor: pointer; color: #374151;
        }
        .nova-read-fc-btn:hover { background: #e5e7eb; }
        /* ── Sticky Notes ── */
        #nova-sticky-note {
            position: fixed; z-index: 2147483642;
            width: 300px;
            background: #ffffff;
            border: 1px solid rgba(99,102,241,0.2);
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08);
            display: flex; flex-direction: column;
            font-family: -apple-system, sans-serif;
            animation: nova-sn-in 0.18s cubic-bezier(0.34,1.56,0.64,1);
            overflow: hidden;
        }
        @keyframes nova-sn-in {
            from { opacity: 0; transform: scale(0.94) translateY(6px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .nova-sn-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 10px 12px 9px;
            background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%);
            cursor: move; user-select: none;
            border-bottom: 1px solid rgba(99,102,241,0.15);
        }
        .nova-sn-title {
            font-size: 11.5px; font-weight: 700; color: #312e81;
            display: flex; align-items: center; gap: 6px; letter-spacing: 0.01em;
        }
        .nova-sn-title-dot {
            width: 6px; height: 6px; border-radius: 50%;
            background: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,0.2);
        }
        .nova-sn-actions { display: flex; gap: 3px; }
        .nova-sn-btn {
            width: 24px; height: 24px; border: none; border-radius: 6px;
            background: rgba(99,102,241,0.1); color: #4338ca;
            cursor: pointer; font-size: 12px; display: flex;
            align-items: center; justify-content: center;
            transition: background 0.12s, transform 0.1s;
        }
        .nova-sn-btn:hover { background: rgba(99,102,241,0.2); transform: scale(1.1); }
        .nova-sn-textarea {
            flex: 1; border: none; outline: none; resize: none;
            background: #ffffff; padding: 12px 14px;
            font-size: 13px; line-height: 1.65; color: #1c1917;
            font-family: inherit; min-height: 110px;
            letter-spacing: 0.01em;
        }
        .nova-sn-textarea::placeholder { color: #a5b4fc; opacity: 0.8; }
        .nova-sn-footer {
            padding: 5px 12px 7px; font-size: 10px; color: #6366f1;
            border-top: 1px solid rgba(99,102,241,0.12);
            background: rgba(238,242,255,0.5);
            display: flex; align-items: center; justify-content: space-between;
            gap: 6px;
        }
        .nova-sn-status {
            display: flex; align-items: center; gap: 4px; font-weight: 500;
        }
        .nova-sn-status-dot {
            width: 5px; height: 5px; border-radius: 50%; background: #10b981;
            flex-shrink: 0;
        }
        /* ── Notepad panel (inside widget) ── */
        .nw-np-panel {
            position: absolute; inset: 0; background: #fff; z-index: 7;
            display: none; flex-direction: column;
        }
        .nw-np-panel.open { display: flex; }
        .nw-np-panel-header {
            display: flex; align-items: center; gap: 8px;
            padding: 0 14px; height: 52px;
            background: #fff; border-bottom: 1px solid #e5e7eb; flex-shrink: 0;
        }
        .nw-np-panel-back {
            width: 28px; height: 28px; border: 1px solid #e5e7eb;
            border-radius: 7px; background: #fff; color: #6b7280;
            cursor: pointer; display: flex; align-items: center;
            justify-content: center; transition: all 0.15s; flex-shrink: 0;
        }
        .nw-np-panel-back:hover { background: #f3f4f6; color: #111827; }
        .nw-np-panel-title { font-size: 13px; font-weight: 700; color: #111827; flex: 1; }
        .nw-np-panel-new {
            display: flex; align-items: center; gap: 5px;
            padding: 5px 10px; background: #6366f1; color: white;
            border: none; border-radius: 7px; font-size: 11px; font-weight: 600;
            cursor: pointer; font-family: inherit; transition: background 0.15s; flex-shrink: 0;
        }
        .nw-np-panel-new:hover { background: #4f46e5; }
        .nw-np-panel-badge {
            font-size: 10px; font-weight: 600; background: #f3f4f6;
            color: #6b7280; padding: 2px 7px; border-radius: 999px;
        }
        /* Two-pane body */
        .nw-np-body { display: flex; flex: 1; overflow: hidden; min-height: 0; }
        /* Sidebar */
        .nw-np-sidebar {
            width: 180px; background: #0f172a; display: flex; flex-direction: column;
            border-right: 1px solid #1e293b; flex-shrink: 0; overflow: hidden;
        }
        .nw-np-search-wrap {
            display: flex; align-items: center; gap: 6px;
            margin: 10px 8px 4px; padding: 6px 10px;
            background: rgba(255,255,255,0.06); border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.08);
        }
        .nw-np-search-wrap svg { flex-shrink: 0; color: #475569; }
        .nw-np-search-input {
            background: transparent; border: none; outline: none;
            font-size: 11.5px; color: #e2e8f0; width: 100%; font-family: inherit;
        }
        .nw-np-search-input::placeholder { color: #475569; }
        .nw-np-section-label {
            font-size: 9px; font-weight: 700; color: #475569; text-transform: uppercase;
            letter-spacing: 0.06em; padding: 6px 14px 2px;
        }
        .nw-np-list { flex: 1; overflow-y: auto; padding: 2px 6px 10px; }
        .nw-np-list::-webkit-scrollbar { width: 3px; }
        .nw-np-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
        .nw-np-item {
            padding: 8px 10px; border-radius: 8px; cursor: pointer;
            transition: background 0.1s; margin-bottom: 2px;
            border-left: 3px solid transparent;
        }
        .nw-np-item:hover { background: rgba(255,255,255,0.05); }
        .nw-np-item.active { background: rgba(99,102,241,0.12); }
        .nw-np-item-header { display: flex; align-items: center; gap: 7px; margin-bottom: 4px; }
        .nw-np-item-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .nw-np-item-title {
            font-size: 11.5px; font-weight: 600; color: #cbd5e1;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
        }
        .nw-np-item.active .nw-np-item-title { color: #a5b4fc; }
        .nw-np-item-pin {
            font-size: 10px; opacity: 0; cursor: pointer;
            background: none; border: none; padding: 0; line-height: 1;
            transition: opacity 0.15s; filter: grayscale(1);
        }
        .nw-np-item:hover .nw-np-item-pin,
        .nw-np-item.active .nw-np-item-pin { opacity: 0.5; }
        .nw-np-item-pin.pinned { opacity: 1 !important; filter: none; }
        .nw-np-item-preview {
            font-size: 10.5px; color: #475569; white-space: nowrap;
            overflow: hidden; text-overflow: ellipsis; line-height: 1.4;
        }
        .nw-np-empty-list { padding: 24px 12px; text-align: center; color: #334155; font-size: 11px; line-height: 1.8; }
        /* Editor pane */
        .nw-np-editor { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
        .nw-np-color-accent { height: 3px; flex-shrink: 0; }
        .nw-np-title-wrap { padding: 12px 16px 0; border-bottom: 1px solid #f1f5f9; flex-shrink: 0; }
        .nw-np-title-input {
            width: 100%; border: none; outline: none; background: transparent;
            font-size: 16px; font-weight: 700; color: #0f172a;
            font-family: inherit; padding-bottom: 10px; box-sizing: border-box; line-height: 1.3;
        }
        .nw-np-title-input::placeholder { color: #e2e8f0; }
        .nw-np-editor-toolbar {
            display: flex; align-items: center; gap: 4px; flex-shrink: 0;
            padding: 5px 14px; border-bottom: 1px solid #f1f5f9; background: #fafafa;
        }
        .nw-np-tb-btn {
            height: 24px; padding: 0 8px; border: 1px solid #e2e8f0;
            border-radius: 5px; background: #fff; color: #374151;
            font-size: 10.5px; font-weight: 600; cursor: pointer; font-family: inherit;
            transition: all 0.12s; display: flex; align-items: center; gap: 3px;
        }
        .nw-np-tb-btn:hover { background: #eef2ff; color: #4338ca; border-color: #c7d2fe; }
        .nw-np-tb-btn.active { background: #eef2ff; color: #4338ca; border-color: #c7d2fe; }
        .nw-np-tb-btn.danger:hover { background: #fee2e2; color: #b91c1c; border-color: #fca5a5; }
        .nw-np-tb-sep { width: 1px; height: 14px; background: #e2e8f0; margin: 0 2px; flex-shrink: 0; }
        .nw-np-wc { font-size: 10px; color: #9ca3af; margin-left: auto; white-space: nowrap; }
        .nw-np-textarea {
            flex: 1; border: none; outline: none; resize: none;
            background: #fff; padding: 12px 16px;
            font-size: 13px; line-height: 1.85; color: #1e293b;
            font-family: inherit; overflow-y: auto;
        }
        .nw-np-textarea::placeholder { color: #e2e8f0; }
        .nw-np-textarea.font-sm { font-size: 11px; }
        .nw-np-textarea.font-lg { font-size: 15px; }
        .nw-np-editor-footer {
            padding: 4px 16px 5px; font-size: 10px; color: #9ca3af;
            border-top: 1px solid #f1f5f9; background: #fafafa; flex-shrink: 0;
            display: flex; align-items: center; justify-content: space-between;
        }
        .nw-np-status { display: flex; align-items: center; gap: 4px; font-weight: 500; }
        .nw-np-status-dot { width: 5px; height: 5px; border-radius: 50%; background: #10b981; flex-shrink: 0; }
        .nw-np-empty-editor {
            flex: 1; display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            color: #cbd5e1; gap: 10px; font-size: 12px; text-align: center; padding: 20px;
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
            <div class="nw-title" id="nw-session-title">Nova <span>AI</span></div>
            <div class="nw-actions">
                <button class="nw-btn" id="nw-sessions-btn" title="Chat sessions">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </button>
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
                        <button class="nw-menu-item" id="nw-menu-clipboard">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M14 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
                            Clipboard History
                        </button>
                        <button class="nw-menu-item" id="nw-menu-tabs">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="17"/><line x1="9.5" y1="14.5" x2="14.5" y2="14.5"/></svg>
                            Tab Switcher
                        </button>
                        <button class="nw-menu-item" id="nw-menu-adblock">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                            Remove Ads
                        </button>
                        <button class="nw-menu-item" id="nw-menu-readmode">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                            Reading Mode
                        </button>
                        <button class="nw-menu-item" id="nw-menu-sticky">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                            Sticky Note
                        </button>
                        <button class="nw-menu-item" id="nw-menu-scratch">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                            Notepad
                        </button>
                        <button class="nw-menu-item" id="nw-menu-settings">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                            Settings
                        </button>
                        <div class="nw-menu-sep"></div>
                        <div class="nw-menu-sub">
                            <div class="nw-menu-sub-label">AI Provider</div>
                            <div class="nw-menu-provider nw-provider-toggle">
                                <button class="nw-provider-btn active" id="nw-use-gemini">Gemini</button>
                                <button class="nw-provider-btn" id="nw-use-groq">Groq</button>
                            </div>
                        </div>
                        <button class="nw-menu-item" id="nw-menu-clear">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                            Clear chat
                        </button>
                        <button class="nw-menu-item danger" id="nw-menu-close">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            Close chat
                        </button>
                    </div>
                </div>
            </div>
        </div>
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

        <!-- ── Overlay panels — placed last so they paint above all flex children ── -->
        <!-- Sessions panel (slides in from left) -->
        <div class="nw-sessions-panel" id="nw-sessions-panel">
            <div class="nw-sessions-header">
                <button class="nw-sessions-back" id="nw-sessions-back">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <div class="nw-sessions-title">Chat Sessions</div>
                <button class="nw-sessions-new" id="nw-sessions-new">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    New chat
                </button>
            </div>
            <div class="nw-sessions-list" id="nw-sessions-list"></div>
        </div>
        <!-- Clipboard history panel -->
        <div class="nw-cb-panel" id="nw-cb-panel">
            <div class="nw-cb-panel-header">
                <button class="nw-cb-panel-back" id="nw-cb-back">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <div class="nw-cb-panel-title">📋 Clipboard History</div>
                <div class="nw-cb-count" id="nw-cb-count"></div>
            </div>
            <div class="nw-cb-search">
                <div class="nw-cb-search-inner">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input type="text" id="nw-cb-search" placeholder="Search copies…" autocomplete="off"/>
                </div>
            </div>
            <div class="nw-cb-list" id="nw-cb-list"></div>
        </div>
        <!-- Sticky Notes panel -->
        <div class="nw-sn-panel" id="nw-sn-panel">
            <div class="nw-sn-panel-header">
                <button class="nw-sn-panel-back" id="nw-sn-panel-back">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <div class="nw-sn-panel-title">📝 Sticky Notes</div>
                <div class="nw-sn-panel-count" id="nw-sn-panel-count"></div>
            </div>
            <div class="nw-sn-toolbar">
                <div class="nw-sn-search-wrap">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input class="nw-sn-search-input" id="nw-sn-search" placeholder="Search notes…" autocomplete="off"/>
                </div>
                <div class="nw-sn-tag-filters" id="nw-sn-tag-filters"></div>
            </div>
            <div class="nw-sn-list" id="nw-sn-list"></div>
        </div>
        <!-- Saved pages panel -->
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
        <!-- Notepad panel — last so it's always on top -->
        <div class="nw-np-panel" id="nw-np-panel">
            <div class="nw-np-panel-header">
                <button class="nw-np-panel-back" id="nw-np-panel-back">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <div class="nw-np-panel-title">🗒 Notepad</div>
                <span class="nw-np-panel-badge" id="nw-np-panel-badge">0 notes</span>
                <button class="nw-np-panel-new" id="nw-np-panel-new">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    New note
                </button>
            </div>
            <div class="nw-np-body">
                <div class="nw-np-sidebar">
                    <div class="nw-np-search-wrap">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input class="nw-np-search-input" id="nw-np-search" placeholder="Search…" autocomplete="off"/>
                    </div>
                    <div class="nw-np-section-label">Notes</div>
                    <div class="nw-np-list" id="nw-np-list"></div>
                </div>
                <div class="nw-np-editor" id="nw-np-editor"></div>
            </div>
        </div>
        <div class="nw-save-toast" id="nw-save-toast"></div>
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

    // ── Page content (compressed) ─────────────────────────────────────────────
    function _compressPage(rawText, url) {
        // For job pages: extract structured fields instead of raw prose
        const isJobPage = /job|career|position|apply|opening|role|hiring/i.test(url + document.title);
        if (isJobPage) {
            const lines = rawText.split(/[\n.]{1,3}/).map(l => l.trim()).filter(l => l.length > 15);
            const title    = document.querySelector('h1')?.innerText?.trim() || document.title.replace(/\s*[\|\-–—].*$/, '').trim();
            const company  = document.querySelector('[class*="company"],[class*="employer"],[data-company]')?.innerText?.trim() || '';
            // Extract bullet-like requirement sentences
            const reqLines = lines.filter(l => /require|must|experience|skill|qualif|responsib|duty|duties|you will|you have|looking for/i.test(l)).slice(0, 12);
            const otherLines = lines.filter(l => !reqLines.includes(l)).slice(0, 6);
            const parts = [
                title    ? `Role: ${title}` : '',
                company  ? `Company: ${company}` : '',
                reqLines.length ? `Requirements:\n${reqLines.map(l => `• ${l.slice(0, 120)}`).join('\n')}` : '',
                otherLines.length ? `Context:\n${otherLines.map(l => l.slice(0, 120)).join('\n')}` : '',
            ].filter(Boolean);
            return parts.join('\n\n').slice(0, 2000);
        }
        // For article/general pages: keep first meaningful paragraphs
        const lines = rawText.split(/\n+/).map(l => l.trim()).filter(l => l.length > 40);
        return lines.slice(0, 20).join('\n').slice(0, 2000);
    }

    try {
        const clone = document.body.cloneNode(true);
        clone.querySelectorAll(`script, style, #${WIDGET_ID}`).forEach(el => el.remove());
        const raw = (clone.innerText || '').replace(/\s+/g, ' ').trim();
        pageContent = _compressPage(raw, location.href);
        document.getElementById('nw-page-title').textContent = document.title || location.hostname;
    } catch (e) {
        document.getElementById('nw-page-title').textContent = location.hostname;
    }

    // ── Restore session ───────────────────────────────────────────────────────
    const messagesEl = document.getElementById('nw-messages');
    (async () => {
        try {
            let map = await _sessLoadAll();
            // Migrate legacy flat history if sessions store is empty
            if (!Object.keys(map).length) {
                const legacy = await new Promise(r => {
                    try { chrome.storage.local.get(['nova_chat_history'], res => r(res.nova_chat_history)); }
                    catch { r(null); }
                });
                const id = _sessGenId();
                map[id] = {
                    id, titled: !!legacy?.length,
                    title: legacy?.find(m => m.role === 'user')?.text?.slice(0, 40) || 'New chat',
                    ts: Date.now(),
                    messages: Array.isArray(legacy) ? legacy.slice(-60) : []
                };
                await _sessSaveAll(map);
                try { chrome.storage.local.remove('nova_chat_history'); } catch {}
            }
            // Restore last active session
            const activeId = await new Promise(r => {
                try { chrome.storage.local.get(['nova_active_session'], res => r(res.nova_active_session)); }
                catch { r(null); }
            });
            const targetId = (activeId && map[activeId]) ? activeId : Object.keys(map).sort((a, b) => map[b].ts - map[a].ts)[0];
            if (targetId) {
                await _sessSwitchTo(targetId, map);
            } else {
                await _sessCreate(true);
            }
        } catch (e) {
            console.warn('[Nova] session restore failed:', e);
        }
    })();

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

    function openMenu()  {
        menuEl.classList.add('open');
    }
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
        _sessCreate(true);
    });

    // ── Sessions panel ────────────────────────────────────────────────────────
    const sessionsPanel = document.getElementById('nw-sessions-panel');

    document.getElementById('nw-sessions-btn').addEventListener('click', () => {
        closeAllPanels();
        _sessRenderList();
        sessionsPanel.classList.add('open');
    });
    document.getElementById('nw-sessions-back').addEventListener('click', () => {
        sessionsPanel.classList.remove('open');
    });
    document.getElementById('nw-sessions-new').addEventListener('click', () => {
        sessionsPanel.classList.remove('open');
        _sessCreate(true);
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

    async function buildSpList() {
        spList.innerHTML = `<div class="nw-sp-empty" style="color:#9ca3af">Loading…</div>`;
        const pages = await spLoad();
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
            card.querySelector('.nw-sp-remove').addEventListener('click', async () => {
                const latest = await spLoad();
                const updated = latest.filter(p => p.id !== page.id);
                await spSave(updated);
                card.remove();
                spCount.textContent = `${updated.length} saved`;
                if (!updated.length) spList.innerHTML = `<div class="nw-sp-empty">No saved pages yet.<br>Say <strong>"save this page"</strong> or use the chip on any page.</div>`;
                renderChips();
            });
            spList.appendChild(card);
        });
    }

    function closeAllPanels() {
        document.getElementById('nw-sp-panel')?.classList.remove('open');
        document.getElementById('nw-cb-panel')?.classList.remove('open');
        document.getElementById('nw-sn-panel')?.classList.remove('open');
        document.getElementById('nw-np-panel')?.classList.remove('open');
        document.getElementById('nw-sessions-panel')?.classList.remove('open');
    }

    function openSpPanel() {
        closeMenu();
        closeAllPanels();
        buildSpList();
        spPanel.classList.add('open');
    }

    function closeSpPanel() { spPanel.classList.remove('open'); }

    document.getElementById('nw-menu-pages').addEventListener('click', openSpPanel);
    document.getElementById('nw-sp-back').addEventListener('click', closeSpPanel);

    // ── Ad Remover (site-specific + generic selectors) ────────────────────────
    const FOCUS_SELECTORS = {
        'linkedin.com': [
            // Sidebars and recommendations
            '.scaffold-layout__aside',
            '.ad-banner-container',
            '[data-ad-banner]',
            '.jobs-premium-upsell',
            '.reusable-search__result-container ~ .reusable-search__result-container ~ .reusable-search__result-container ~ .reusable-search__result-container ~ .reusable-search__result-container',
            '.feed-follows-module',
            '.pymk-hcard',
            '.scaffold-finite-scroll__load-button',
            '[data-view-name="profile-card"]',
            '.news-module',
            '.ad-banner',
            '.jobs-company-info__ads',
            // "People also viewed", "More jobs like this"
            '.jobs-similar-jobs',
            '.jobs-details__right-rail',
            '.p-ads',
        ],
        'indeed.com': [
            '.mosaic-zone[id*="mosaic-afterJobResults"]',
            '.mosaic-zone[id*="mosaic-aboveFullJobDescription"]',
            '#mosaic-provider-jobsearch-feedback',
            '.indeed-ad',
            '[class*="sponsoredJob"]',
            '.jobsearch-SerpJobCard-sponsoredJob',
            '#indeed-share-widget',
            '.icl-WhatWhere ~ div[class*="Carousel"]',
            '.salaryGuide',
            '.resumeIncentive',
        ],
        'glassdoor.com': [
            '[class*="EIJobsSideBar"]',
            '[class*="AdDisplay"]',
            '[class*="ad-unit"]',
            '.tightAll',
        ],
        'youtube.com': [
            // Top banner and masthead ads
            '#masthead-ad',
            'ytd-banner-promo-renderer',
            'ytd-statement-banner-renderer',
            // Sidebar promoted / ad slots
            'ytd-ad-slot-renderer',
            'ytd-promoted-sparkles-web-renderer',
            'ytd-promoted-video-renderer',
            'ytd-display-ad-renderer',
            'ytd-compact-promoted-item-renderer',
            // In-feed promoted items
            '[class*="ytd-ad"]',
            // In-player overlay ads (banner over video)
            '.ytp-ad-overlay-container',
            '.ytp-ad-text-overlay',
            '.ytp-ad-image-overlay',
            '.ytp-ad-module',
            '.ytp-ad-player-overlay',
            '.ytp-ad-player-overlay-instream-info',
            '.ytp-ad-preview-container',
            // Shorts ads
            'ytd-reel-shelf-renderer',
            'ytd-shorts-lockup-view-model',
            // Survey / feedback modals YouTube injects
            'ytd-mealbar-promo-renderer',
            // "Primetime channels" / premium upsell rows
            'ytd-primetime-promo-renderer',
            // Right-rail recommendations that are promoted
            '#related ytd-compact-promoted-video-renderer',
            // Info card overlays (sponsored)
            '.ytp-ce-element[class*="ad"]',
            // Shopping shelf ads below video
            'ytd-merch-shelf-renderer',
            'ytd-action-companion-ad-renderer',
            // Survey/opinion prompts
            '#survey-url-endpoint-id',
        ],
    };

    // Generic ad/noise selectors that work on most sites
    const GENERIC_AD_SELECTORS = [
        'ins.adsbygoogle',
        '[id*="google_ads"]',
        '[id*="ad-slot"]',
        '[id*="ad_slot"]',
        '[class*="ad-container"]',
        '[class*="adContainer"]',
        '[class*="advertisement"]',
        '[class*="ad-wrapper"]',
        '[class*="sponsored-content"]',
        '[class*="promo-banner"]',
        '[aria-label*="advertisement" i]',
        '[aria-label*="sponsored" i]',
        'iframe[src*="doubleclick"]',
        'iframe[src*="googlesyndication"]',
        'iframe[src*="adservice"]',
        '[data-ad-client]',
        '[data-google-query-id]',
        '.widget_media_image + div[class*="ad"]',
    ];

    // ── YouTube ad skipper (Brave-inspired) ──────────────────────────────────
    let _ytObserver = null;
    let _ytSkipTimer = null;
    let _ytAdCount = 0;
    let _ytSkipping = false;
    let _ytCoverEl = null;    // thumbnail cover shown over player while ad plays silently

    const YT_SKIP_SELECTORS = [
        '.ytp-skip-ad-button',
        '.ytp-ad-skip-button',
        '.ytp-ad-skip-button-modern',
        '.ytp-skip-ad-button__text',
        '[class*="skip-ad-button"]',
        '.ytp-ad-overlay-close-button',
        'button.ytp-ad-skip-button-container',
        '[id*="skip-button"]',
    ].join(', ');

    // Get the real video's thumbnail URL from the page
    function _ytGetThumb() {
        const canonical = document.querySelector('link[rel="canonical"]');
        const href = canonical?.href || location.href;
        const m = href.match(/[?&]v=([^&]+)/);
        const vid = m?.[1];
        if (!vid) return null;
        // maxresdefault → hqdefault as fallback
        return `https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`;
    }

    // Overlay a static thumbnail over the player so user sees zero ad content
    function _ytShowCover() {
        if (_ytCoverEl) return;
        const player = document.querySelector('#movie_player, .html5-video-player');
        if (!player) return;
        const thumb = _ytGetThumb();
        const cover = document.createElement('div');
        cover.id = 'nova-yt-cover';
        cover.style.cssText = `
            position:absolute;inset:0;z-index:9998;
            background:#000 ${thumb ? `url("${thumb}") center/cover no-repeat` : ''};
            display:flex;align-items:center;justify-content:center;
            pointer-events:none;
        `;
        // "Ad skipped" badge
        const badge = document.createElement('div');
        badge.textContent = '⚡ Ad blocked by Nova';
        badge.style.cssText = `
            background:rgba(0,0,0,.65);color:#fff;font-size:13px;font-family:sans-serif;
            padding:6px 14px;border-radius:20px;backdrop-filter:blur(4px);
            border:1px solid rgba(255,255,255,.15);
        `;
        cover.appendChild(badge);
        // Player must be positioned so the absolute cover sits inside it
        if (getComputedStyle(player).position === 'static') player.style.position = 'relative';
        player.appendChild(cover);
        _ytCoverEl = cover;
    }

    // Fade the cover out smoothly once the ad is gone
    function _ytHideCover() {
        if (!_ytCoverEl) return;
        const el = _ytCoverEl;
        _ytCoverEl = null;
        el.style.transition = 'opacity 0.35s ease';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 380);
    }

    function _ytSkipAds() {
        if (_ytSkipping) return;
        _ytSkipping = true;
        try {
            const player = document.querySelector('.html5-video-player, #movie_player');
            if (!player) return;

            const isAdPlaying = player.classList.contains('ad-showing') ||
                                player.classList.contains('ad-interrupting');
            const video = document.querySelector('video.html5-main-video, video');

            if (!isAdPlaying) {
                // Ad is over — restore video and remove cover
                if (video && video._novaMuted) {
                    video.muted = false;
                    video.playbackRate = 1;
                    video._novaMuted = false;
                }
                _ytHideCover();
                return;
            }

            // Strategy 1: click skip button — instant, no cover needed
            const skipBtn = document.querySelector(YT_SKIP_SELECTORS);
            if (skipBtn) { skipBtn.click(); _ytAdCount++; return; }

            // Strategy 2: show cover + mute + 16× speed so user sees nothing.
            // Never seek — seeking causes the black-screen frame drop.
            _ytShowCover();
            if (video) {
                if (!video._novaMuted) { video.muted = true; video._novaMuted = true; }
                if (video.playbackRate < 16) video.playbackRate = 16;
            }
        } finally {
            _ytSkipping = false;
        }
    }

    function _startYtObserver() {
        if (_ytObserver) return;
        _ytAdCount = 0;
        _ytSkipAds();

        const watchTarget = document.querySelector('#movie_player, .html5-video-player') || document.body;
        _ytObserver = new MutationObserver((mutations) => {
            let needsCheck = false;
            for (const m of mutations) {
                if (m.type === 'attributes' && m.attributeName === 'class') { needsCheck = true; break; }
                if (m.type === 'childList' && m.addedNodes.length) { needsCheck = true; break; }
            }
            if (needsCheck) _ytSkipAds();
        });
        _ytObserver.observe(watchTarget, {
            attributes: true,
            attributeFilter: ['class'],
            childList: true,
            subtree: true
        });
        _ytSkipTimer = setInterval(_ytSkipAds, 300);
    }

    function _stopYtObserver() {
        _ytObserver?.disconnect(); _ytObserver = null;
        clearInterval(_ytSkipTimer); _ytSkipTimer = null;
        const video = document.querySelector('video.html5-main-video, video');
        if (video && video._novaMuted) { video.muted = false; video.playbackRate = 1; video._novaMuted = false; }
        _ytHideCover();
        _ytAdCount = 0;
    }

    let _adBlockActive = false;
    let _adBlockStyleEl = null;

    function _toggleAdBlock(on) {
        _adBlockActive = on;
        const btn = document.getElementById('nw-menu-adblock');
        if (on) {
            if (!_adBlockStyleEl) {
                _adBlockStyleEl = document.createElement('style');
                _adBlockStyleEl.id = 'nova-adblock-styles';
                document.head.appendChild(_adBlockStyleEl);
            }
            const isYT = location.hostname.includes('youtube.com');
            const host = location.hostname.replace('www.', '');
            const siteKey = Object.keys(FOCUS_SELECTORS).find(k => host.includes(k));
            const siteSelectors = siteKey ? FOCUS_SELECTORS[siteKey] : [];
            const allSelectors = [...GENERIC_AD_SELECTORS, ...siteSelectors];
            _adBlockStyleEl.textContent = allSelectors
                .map(s => `${s} { display: none !important; }`)
                .join('\n');
            // Physically remove already-rendered ad elements
            let removed = 0;
            document.querySelectorAll(allSelectors.join(',')).forEach(el => {
                if (!el.closest(`#${WIDGET_ID}`)) { el.remove(); removed++; }
            });
            // Start YouTube-specific ad skipper (MutationObserver + video skip)
            if (isYT) {
                _startYtObserver();
                // Enable network-level YouTube ad blocking via declarativeNetRequest
                chrome.runtime.sendMessage({ type: 'TOGGLE_YT_ADBLOCK', enable: true });
            }
            if (btn) { btn.style.color = '#6366f1'; btn.style.fontWeight = '700'; btn.textContent = ''; btn.insertAdjacentHTML('afterbegin', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> Remove Ads ✓'); }
            localStorage.setItem('nova_adblock', '1');
            const msg = isYT
                ? `🚫 YouTube ad blocker active — network requests blocked, banner ads hidden, video ads auto-skipped. Unskippable ads are muted and fast-forwarded.`
                : `🚫 Removed ${removed} ad element${removed !== 1 ? 's' : ''} from this page. Ads are now blocked for this session.`;
            appendMsg('ai', msg);
        } else {
            if (_adBlockStyleEl) { _adBlockStyleEl.textContent = ''; }
            _stopYtObserver();
            // Disable network-level blocking
            chrome.runtime.sendMessage({ type: 'TOGGLE_YT_ADBLOCK', enable: false });
            if (btn) { btn.style.color = ''; btn.style.fontWeight = ''; btn.textContent = ''; btn.insertAdjacentHTML('afterbegin', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> Remove Ads'); }
            localStorage.removeItem('nova_adblock');
        }
    }

    document.getElementById('nw-menu-adblock').addEventListener('click', () => {
        closeMenu();
        _toggleAdBlock(!_adBlockActive);
    });

    // Restore on init if previously enabled
    if (localStorage.getItem('nova_adblock')) {
        _toggleAdBlock(true);
        // Re-arm network rules on YouTube (declarativeNetRequest persists across sessions but reinforce it)
        if (location.hostname.includes('youtube.com')) {
            chrome.runtime.sendMessage({ type: 'TOGGLE_YT_ADBLOCK', enable: true });
        }
    }

    // ── Reading Mode ─────────────────────────────────────────────────────────
    let _rmActive = false;
    let _rmOverlay = null;
    let _rmFontSize = 19;

    function _rmFindArticle() {
        // Priority order: semantic tags → content attributes → largest text block
        const candidates = [
            document.querySelector('article'),
            document.querySelector('[role="main"]'),
            document.querySelector('[itemprop="articleBody"]'),
            document.querySelector('main'),
            document.querySelector('.post-content'),
            document.querySelector('.article-body'),
            document.querySelector('.entry-content'),
            document.querySelector('.article__body'),
            document.querySelector('.story-body'),
            document.querySelector('#article-body'),
            document.querySelector('#content'),
        ].filter(Boolean);

        if (candidates.length) return candidates[0];

        // Fallback: find div with the most <p> text
        let best = null, bestLen = 0;
        document.querySelectorAll('div, section').forEach(el => {
            if (el.closest(`#${WIDGET_ID}`)) return;
            const text = el.innerText || '';
            const ps = el.querySelectorAll('p');
            if (ps.length >= 3 && text.length > bestLen) {
                bestLen = text.length;
                best = el;
            }
        });
        return best;
    }

    function _rmOpen() {
        const src = _rmFindArticle();
        if (!src) {
            appendMsg('ai', "Reading Mode couldn't find an article on this page. It works best on news articles and blog posts.");
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'nova-read-overlay';

        const title = document.title || location.hostname;
        const content = src.cloneNode(true);
        // Strip scripts/styles/ads from the clone
        content.querySelectorAll('script,style,iframe,ins,[class*="ad-"],[id*="ad-"],[class*="banner"],[class*="promo"]')
            .forEach(el => el.remove());

        overlay.innerHTML = `
            <div id="nova-read-topbar">
                <span id="nova-read-title">${NovaChatCore.esc(title)}</span>
                <div id="nova-read-font-ctrl">
                    <button class="nova-read-fc-btn" id="nova-read-font-down">A−</button>
                    <button class="nova-read-fc-btn" id="nova-read-font-up">A+</button>
                    <button id="nova-read-close">✕ Exit</button>
                </div>
            </div>
            <div id="nova-read-content"></div>`;

        overlay.querySelector('#nova-read-content').appendChild(content);
        document.body.appendChild(overlay);
        document.body.classList.add('nova-reading-mode');
        _rmOverlay = overlay;
        _rmActive = true;

        const btn = document.getElementById('nw-menu-readmode');
        if (btn) { btn.style.color = '#6366f1'; btn.style.fontWeight = '700'; }

        overlay.querySelector('#nova-read-close').addEventListener('click', _rmClose);

        overlay.querySelector('#nova-read-font-up').addEventListener('click', () => {
            _rmFontSize = Math.min(28, _rmFontSize + 1);
            overlay.querySelector('#nova-read-content').style.fontSize = _rmFontSize + 'px';
        });
        overlay.querySelector('#nova-read-font-down').addEventListener('click', () => {
            _rmFontSize = Math.max(14, _rmFontSize - 1);
            overlay.querySelector('#nova-read-content').style.fontSize = _rmFontSize + 'px';
        });

        // Esc key exits
        const _rmEsc = (e) => { if (e.key === 'Escape') { _rmClose(); document.removeEventListener('keydown', _rmEsc); } };
        document.addEventListener('keydown', _rmEsc);

        appendMsg('ai', `📖 Reading Mode on — showing just the article. Use A+ / A− to adjust text size. Press Esc or ✕ to exit.`);
    }

    function _rmClose() {
        if (_rmOverlay) { _rmOverlay.remove(); _rmOverlay = null; }
        document.body.classList.remove('nova-reading-mode');
        _rmActive = false;
        const btn = document.getElementById('nw-menu-readmode');
        if (btn) { btn.style.color = ''; btn.style.fontWeight = ''; }
    }

    document.getElementById('nw-menu-readmode').addEventListener('click', () => {
        closeMenu();
        if (_rmActive) _rmClose(); else _rmOpen();
    });

    // ── Bookmark button in context bar ────────────────────────────────────────
    const bookmarkBtn = document.getElementById('nw-bookmark-btn');

    async function syncBookmarkBtn() {
        const pages = await spLoad();
        const already = pages.some(p => p.url === location.href);
        bookmarkBtn.classList.toggle('saved', already);
        bookmarkBtn.title = already ? 'Already saved' : 'Save this page';
        bookmarkBtn.querySelector('svg').setAttribute('fill', already ? 'currentColor' : 'none');
    }
    syncBookmarkBtn();

    bookmarkBtn.addEventListener('click', async () => {
        const result = await saveCurrentPage();
        if (result === '__PAGE_EXISTS__') {
            showSaveToast('Already saved');
        } else {
            const page = JSON.parse(result.slice('__PAGE_SAVED__:'.length));
            showSaveToast(`🔖 Saved: ${page.title.slice(0, 40)}${page.title.length > 40 ? '…' : ''}`);
            if (spPanel.classList.contains('open')) buildSpList();
        }
        syncBookmarkBtn();
        renderChips();
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

    // ── Update summary chip (Feature 11) ─────────────────────────────────
    function _updateSummaryChip() {
        const existing = chipsEl.querySelector('#nw-summary-chip');
        if (existing) existing.remove();
        if (chatHistory.length < 5) return;
        const summaryBtn = document.createElement('button');
        summaryBtn.id = 'nw-summary-chip';
        summaryBtn.className = 'nw-chip';
        summaryBtn.textContent = '📋 Summarize session';
        summaryBtn.addEventListener('click', () => {
            chipsEl.style.display = 'none';
            const lines = chatHistory.slice(-20).map(m => `${m.role === 'user' ? '• You:' : '• Nova:'} ${m.text?.slice(0, 120) || ''}`);
            const summary = lines.join('\n');
            appendMsg('ai', '**Session summary:**\n' + summary);
            chatHistory.push({ role: 'ai', text: 'Session summary generated.', ts: Date.now() });
        });
        chipsEl.appendChild(summaryBtn);
    }

    // ── Domain-aware chips (data from Core) ──────────────────────────────────
    function renderChips() {
        chipsEl.innerHTML = '';
        getChipsForPage(location.hostname, location.href).forEach(({ label, prompt }) => {
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
        // Quick re-fill chip — show if this domain was filled before (Feature 10)
        try {
            const fh = JSON.parse(localStorage.getItem('nova_domain_fills') || '{}');
            const host = location.hostname.replace('www.', '');
            if (fh[host]) {
                const refillBtn = document.createElement('button');
                refillBtn.className = 'nw-chip';
                refillBtn.textContent = '⚡ Re-fill';
                refillBtn.title = 'Fill form like last time';
                refillBtn.style.cssText = 'background:#eef2ff;border-color:#a5b4fc;color:#4f46e5;';
                refillBtn.addEventListener('click', () => {
                    inputEl.value = 'fill this form';
                    inputEl.dispatchEvent(new Event('input'));
                    doSend();
                });
                chipsEl.appendChild(refillBtn);
            }
        } catch {}
        // Sticky note chips — loads async (cross-origin shared storage)
        NovaChatCore.snSharedLoad().then(allNotes => {
            const snKey  = location.href.split('#')[0].split('?')[0];
            const snNote = allNotes[snKey];

            if (snNote?.text) {
                const snBtn = document.createElement('button');
                snBtn.className = 'nw-chip';
                snBtn.textContent = '📝 My note';
                snBtn.title = snNote.text.length > 60 ? snNote.text.slice(0, 60) + '…' : snNote.text;
                snBtn.style.cssText = 'background:#eef2ff;border-color:#c7d2fe;color:#4338ca;';
                snBtn.addEventListener('click', _snOpen);
                chipsEl.appendChild(snBtn);
            }

            const totalCount = Object.values(allNotes).filter(n => n?.text).length;
            const otherCount = totalCount - (snNote?.text ? 1 : 0);
            if (otherCount > 0) {
                const allBtn = document.createElement('button');
                allBtn.className = 'nw-chip';
                allBtn.textContent = `🗒 ${totalCount} saved note${totalCount !== 1 ? 's' : ''}`;
                allBtn.title = 'View notes from all pages';
                allBtn.style.cssText = 'background:#f0fdf4;border-color:#86efac;color:#166534;';
                allBtn.addEventListener('click', openSnPanel);
                chipsEl.appendChild(allBtn);
            }
        }).catch(() => {});
        // Saved pages chip — loads async (cross-origin shared storage)
        spLoad().then(pages => {
            if (!pages.length) return;
            const currentSaved = pages.some(p => p.url === location.href);
            const spBtn = document.createElement('button');
            spBtn.className = 'nw-chip';
            spBtn.id = 'nw-chip-saved-pages';
            spBtn.textContent = `🔖 ${pages.length} saved page${pages.length !== 1 ? 's' : ''}`;
            spBtn.title = currentSaved ? 'This page is saved — view all saved pages' : 'View your saved pages';
            spBtn.style.cssText = currentSaved
                ? 'background:#eef2ff;border-color:#a5b4fc;color:#4338ca;'
                : 'background:#f0f9ff;border-color:#7dd3fc;color:#0369a1;';
            spBtn.addEventListener('click', openSpPanel);
            // Remove stale chip if renderChips ran again before this resolved
            document.getElementById('nw-chip-saved-pages')?.remove();
            chipsEl.appendChild(spBtn);
        }).catch(() => {});
        // Session summary chip — show after 5+ messages (Feature 11)
        _updateSummaryChip();
    }

    renderChips();

    // ── Highlight & Explain tooltip ───────────────────────────────────────────
    let _ttHideTimer = null;
    function _showExplainTooltip(selectedText, x, y) {
        document.getElementById('nova-explain-tooltip')?.remove();
        const tt = document.createElement('div');
        tt.id = 'nova-explain-tooltip';
        // Position above the selection end point
        tt.style.left = Math.min(x, window.innerWidth - 220) + 'px';
        tt.style.top  = Math.max(y - 46, 8) + 'px';

        const explainBtn = document.createElement('button');
        explainBtn.className = 'nova-tt-explain';
        explainBtn.textContent = '✨ Explain';

        const askBtn = document.createElement('button');
        askBtn.className = 'nova-tt-ask';
        askBtn.textContent = '💬 Ask';

        const clipBtn = document.createElement('button');
        clipBtn.className = 'nova-tt-clip';
        clipBtn.textContent = '📎 Clip';

        const searchBtn = document.createElement('button');
        searchBtn.className = 'nova-tt-search';
        searchBtn.textContent = '🔍 Search';

        const noteBtn = document.createElement('button');
        noteBtn.className = 'nova-tt-search';
        noteBtn.textContent = '📝 Note';

        tt.appendChild(explainBtn);
        tt.appendChild(askBtn);
        tt.appendChild(clipBtn);
        tt.appendChild(searchBtn);
        tt.appendChild(noteBtn);
        document.body.appendChild(tt);

        const truncated = selectedText.slice(0, 400);

        explainBtn.addEventListener('click', e => {
            e.stopPropagation();
            tt.remove();
            // Open widget
            widget.style.display = 'flex';
            widget.dataset.minimized = 'false';
            document.getElementById('nova-mini-bubble')?.style && (document.getElementById('nova-mini-bubble').style.display = 'none');
            const question = `Explain this in plain English:\n\n"${truncated}"`;
            inputEl.value = question;
            inputEl.dispatchEvent(new Event('input'));
            setTimeout(doSend, 80);
        });

        askBtn.addEventListener('click', e => {
            e.stopPropagation();
            tt.remove();
            widget.style.display = 'flex';
            widget.dataset.minimized = 'false';
            document.getElementById('nova-mini-bubble')?.style && (document.getElementById('nova-mini-bubble').style.display = 'none');
            inputEl.value = `"${truncated}"\n\n`;
            inputEl.dispatchEvent(new Event('input'));
            inputEl.focus();
            // Position cursor at end so user can type their question
            inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
        });

        clipBtn.addEventListener('click', e => {
            e.stopPropagation();
            tt.remove();
            _saveClip(truncated, document.title, location.href);
            const confirm = document.createElement('div');
            confirm.style.cssText = 'position:fixed;bottom:80px;right:24px;z-index:2147483647;background:#1e293b;color:white;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;font-family:-apple-system,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.2);animation:nova-tooltip-in 0.12s ease;';
            confirm.textContent = '📎 Clipped!';
            document.body.appendChild(confirm);
            setTimeout(() => confirm.remove(), 1800);
        });

        searchBtn.addEventListener('click', e => {
            e.stopPropagation();
            tt.remove();
            _showQuickSearch(truncated, e.clientX, e.clientY);
        });

        noteBtn.addEventListener('click', e => {
            e.stopPropagation();
            tt.remove();
            _snOpen(truncated);
        });

        // Auto-hide if user clicks elsewhere
        setTimeout(() => {
            const hide = (ev) => {
                if (!tt.contains(ev.target)) { tt.remove(); document.removeEventListener('mousedown', hide); }
            };
            document.addEventListener('mousedown', hide);
        }, 0);
    }

    document.addEventListener('mouseup', e => {
        if (e.target.closest('#nova-chat-widget') || e.target.closest('#nova-explain-tooltip')) return;
        clearTimeout(_ttHideTimer);
        _ttHideTimer = setTimeout(() => {
            const sel = window.getSelection();
            const text = sel?.toString().trim();
            if (!text || text.length < 10) { document.getElementById('nova-explain-tooltip')?.remove(); return; }
            _showExplainTooltip(text, e.clientX, e.clientY);
        }, 200);
    });

    document.addEventListener('selectionchange', () => {
        const sel = window.getSelection();
        if (!sel?.toString().trim()) {
            clearTimeout(_ttHideTimer);
            // Small delay so tooltip click doesn't hide immediately
            setTimeout(() => {
                if (!window.getSelection()?.toString().trim()) document.getElementById('nova-explain-tooltip')?.remove();
            }, 300);
        }
    });

    // Field history picker — show on focus of any page input
    document.addEventListener('focusin', e => {
        const el = e.target;
        if (!el.matches('input[type=text],input[type=email],input[type=tel],input[type=url],input:not([type]),textarea')) return;
        if (el.closest('#nova-chat-widget') || el.closest('#nova-sticky-note')) return;
        _fhShowPicker(el);
    });
    document.addEventListener('focusout', e => {
        const el = e.target;
        if (!el.matches('input,textarea')) return;
        if (el.closest('#nova-chat-widget') || el.closest('#nova-sticky-note')) return;
        _fhRecord(el);
        setTimeout(() => document.getElementById('nova-fh-picker')?.remove(), 150);
    });

    // Re-show chips on page context change (SPA like LinkedIn)
    let _lastChipUrl = location.href;
    window.addEventListener('popstate', () => {
        if (location.href !== _lastChipUrl) {
            _lastChipUrl = location.href;
            chipsEl.style.display = 'flex';
            renderChips();
        }
    });

    // Duplicate application detector — check on load
    (function _checkDuplicateApp() {
        const jobs = jtLoad();
        if (!jobs.length) return;
        const currentHost = location.hostname.replace('www.', '');
        const currentTitle = document.title.replace(/\s*[\|\-–—].*$/, '').trim().toLowerCase().slice(0, 40);
        const match = jobs.find(j => {
            const jobHost = (() => { try { return new URL(j.url).hostname.replace('www.', ''); } catch { return ''; } })();
            const jobTitle = (j.title || '').toLowerCase().slice(0, 40);
            return jobHost === currentHost && (
                j.url === location.href ||
                (currentTitle.length > 10 && jobTitle.includes(currentTitle.slice(0, 20)))
            );
        });
        if (!match) return;
        const statusLabel = { saved: 'saved', applied: 'already applied to', interview: 'in interview stage for', offer: 'got an offer for', rejected: 'marked rejected for' };
        const label = statusLabel[match.status] || 'saved';
        setTimeout(() => {
            const warn = appendMsg('ai', `👋 Heads up — you've ${label} **${match.title}** on ${match.date}. Want to apply again or update the status?`);
            const btns = document.createElement('div');
            btns.style.cssText = 'display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;';
            const applyBtn = document.createElement('button');
            applyBtn.textContent = '⚡ Fill anyway';
            applyBtn.style.cssText = 'padding:5px 12px;background:#6366f1;color:white;border:none;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;';
            applyBtn.addEventListener('click', () => dispatchIntent({ intent: 'fill' }, '', null));
            const updateBtn = document.createElement('button');
            updateBtn.textContent = '📋 View tracker';
            updateBtn.style.cssText = 'padding:5px 12px;background:#f1f5f9;color:#374151;border:1px solid #e5e7eb;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;';
            updateBtn.addEventListener('click', () => renderJobTracker());
            btns.appendChild(applyBtn);
            btns.appendChild(updateBtn);
            warn?.querySelector('.nw-bubble')?.appendChild(btns);
        }, 1200);
    })();

    // Page re-visit detector
    (async function _checkRevisit() {
        const pages = await spLoad();
        if (!pages.length) return;
        const currentUrl = location.href;
        const match = pages.find(p => p.url === currentUrl);
        if (!match) return;
        // Don't show if dup-app detector already fired (avoids double message)
        const jobs = jtLoad();
        const currentHost = location.hostname.replace('www.', '');
        const alreadyHasJobMatch = jobs.some(j => {
            const jh = (() => { try { return new URL(j.url).hostname.replace('www.', ''); } catch { return ''; } })();
            return jh === currentHost && j.url === currentUrl;
        });
        if (alreadyHasJobMatch) return;

        // Only show on pages that look like job postings
        const looksLikeJob = /apply|job|position|career|role|opening/i.test(currentUrl + document.title);
        if (!looksLikeJob) return;

        setTimeout(() => {
            const revisit = appendMsg('ai', `👀 You saved **${match.title.slice(0, 50)}** on ${match.date}. Ready to apply now?`);
            const btns = document.createElement('div');
            btns.style.cssText = 'display:flex;gap:6px;margin-top:8px;';
            const fillBtn = document.createElement('button');
            fillBtn.textContent = '⚡ Fill form';
            fillBtn.style.cssText = 'padding:5px 12px;background:#6366f1;color:white;border:none;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;';
            fillBtn.addEventListener('click', () => dispatchIntent({ intent: 'fill' }, '', null));
            btns.appendChild(fillBtn);
            revisit?.querySelector('.nw-bubble')?.appendChild(btns);
        }, 1800);
    })();

    // Form autosave restore — check if we have a snapshot for this URL
    (function _checkAutosave() {
        const store = _asLoad();
        const saved = store[location.href];
        if (!saved) return;
        const ageMs = Date.now() - saved.ts;
        if (ageMs > 86400000 * 3) return; // ignore if >3 days old
        const fieldCount = Object.keys(saved.snapshot).length;
        if (!fieldCount) return;

        setTimeout(() => {
            const msg = appendMsg('ai', `💾 Found a saved form snapshot for this page (${fieldCount} fields, saved ${Math.round(ageMs / 60000)} min ago). Want to restore it?`);
            const btns = document.createElement('div');
            btns.style.cssText = 'display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;';

            const restoreBtn = document.createElement('button');
            restoreBtn.textContent = '↩ Restore fields';
            restoreBtn.style.cssText = 'padding:5px 12px;background:#6366f1;color:white;border:none;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;';
            restoreBtn.addEventListener('click', () => {
                let restored = 0;
                Object.entries(saved.snapshot).forEach(([key, val]) => {
                    const el = document.getElementById(key) || document.querySelector(`[name="${key}"]`) || document.querySelector(`[placeholder="${key}"]`);
                    if (el && !el.value) {
                        el.value = val;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        restored++;
                    }
                });
                appendMsg('ai', `✅ Restored ${restored} field${restored !== 1 ? 's' : ''}. Review them before submitting.`);
                btns.style.display = 'none';
            });

            const dismissBtn = document.createElement('button');
            dismissBtn.textContent = 'Dismiss';
            dismissBtn.style.cssText = 'padding:5px 12px;background:#f1f5f9;color:#374151;border:1px solid #e5e7eb;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;';
            dismissBtn.addEventListener('click', () => {
                const store2 = _asLoad();
                delete store2[location.href];
                localStorage.setItem(FORM_AUTOSAVE_KEY, JSON.stringify(store2));
                btns.style.display = 'none';
            });

            btns.appendChild(restoreBtn);
            btns.appendChild(dismissBtn);
            msg?.querySelector('.nw-bubble')?.appendChild(btns);
        }, 2200);
    })();

    // Reading progress — save scroll position every 5 seconds while reading
    // Only track pages that are long enough to be "readable" content
    (function _initReadingProgress() {
        const minHeight = 2000; // Only track pages taller than 2000px
        if (_rpPageHeight() < minHeight) return;
        // Skip forms, job application pages — not reading content
        if (/apply|login|signin|checkout|cart/i.test(location.href)) return;

        let _rpSaveTimer = null;
        const _doSave = () => {
            const pct = _rpScrollPct();
            if (pct < 5) return; // Don't save if barely scrolled
            if (pct > 95) {
                // Mark as finished — remove entry
                const map = _rpLoad();
                delete map[location.href];
                _rpSave(map);
                return;
            }
            const map = _rpLoad();
            map[location.href] = {
                pct,
                ts: Date.now(),
                title: document.title.replace(/\s*[\|\-–—].*$/, '').trim().slice(0, 60),
                scrollY: window.scrollY
            };
            // Keep only 50 most recent pages
            const keys = Object.keys(map);
            if (keys.length > 50) {
                const oldest = keys.sort((a, b) => map[a].ts - map[b].ts)[0];
                delete map[oldest];
            }
            _rpSave(map);
        };

        window.addEventListener('scroll', () => {
            clearTimeout(_rpSaveTimer);
            _rpSaveTimer = setTimeout(_doSave, 5000);
        }, { passive: true });

        // Check if we have a saved position for this URL
        const saved = _rpLoad()[location.href];
        if (!saved) return;
        const ageHours = (Date.now() - saved.ts) / 3600000;
        if (ageHours > 168) return; // Ignore if >1 week old
        if (saved.pct < 10) return; // Don't bother if barely scrolled

        setTimeout(() => {
            const msg = appendMsg('ai', `📖 You were **${saved.pct}%** through **${saved.title}** — want to pick up where you left off?`);
            const btns = document.createElement('div');
            btns.style.cssText = 'display:flex;gap:6px;margin-top:8px;';

            const continueBtn = document.createElement('button');
            continueBtn.textContent = '↓ Continue reading';
            continueBtn.style.cssText = 'padding:5px 12px;background:#6366f1;color:white;border:none;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;';
            continueBtn.addEventListener('click', () => {
                window.scrollTo({ top: saved.scrollY, behavior: 'smooth' });
                btns.style.display = 'none';
            });

            const dismissBtn = document.createElement('button');
            dismissBtn.textContent = 'Start over';
            dismissBtn.style.cssText = 'padding:5px 12px;background:#f1f5f9;color:#374151;border:1px solid #e5e7eb;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;';
            dismissBtn.addEventListener('click', () => {
                const map = _rpLoad();
                delete map[location.href];
                _rpSave(map);
                btns.style.display = 'none';
            });

            btns.appendChild(continueBtn);
            btns.appendChild(dismissBtn);
            msg?.querySelector('.nw-bubble')?.appendChild(btns);
        }, 1500);
    })();

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
    // Regex-based intent classifier — used as fallback when AI call fails
    function classifyIntentRegex(userText) {
        const t = userText.toLowerCase().trim();

        // Navigation
        if (/\b(go to|take me to|navigate to|visit|bring me to|launch)\b/i.test(t) &&
            !/\b(summar|saved|notes?|clips?|pages?|clipboard|copied)\b/i.test(t))
            return { intent: 'navigate', destination: userText };

        // Search
        const searchM = t.match(/\b(search|look up|find on|google|youtube|search for)\b.{0,60}/i);
        if (searchM) {
            const engine = /youtube/i.test(t) ? 'youtube' : /linkedin/i.test(t) ? 'linkedin' : 'google';
            return { intent: 'search', query: userText.replace(/\b(search|look up|find|google)\b/i, '').trim(), engine };
        }

        // Scroll
        if (/\b(scroll down|scroll up|go to top|go to bottom|page down|page up)\b/i.test(t))
            return { intent: 'scroll', direction: /up|top/.test(t) ? 'up' : /bottom/.test(t) ? 'bottom' : /top/.test(t) ? 'top' : 'down' };

        // Copy
        if (/\b(copy (this |the )?(url|link|title|page|address))\b/i.test(t))
            return { intent: 'copy', what: /title/.test(t) ? 'title' : /text/.test(t) ? 'text' : 'url' };

        // Fill form
        if (/\b(fill|autofill|auto-fill|complete|apply for me|fill (this |the )?(form|application)|submit my)\b/i.test(t))
            return { intent: 'fill', fields: 'all' };

        // Summarize
        if (/\b(summar(ize|ise|y)|tldr|tl;dr|overview|brief me)\b/i.test(t))
            return { intent: 'summarize' };

        // Translate
        const transM = t.match(/\btranslate( this| page)? (to |into )(\w+)/i);
        if (transM) return { intent: 'translate', language: transM[3] };

        // Extract
        const extractM = t.match(/\bextract (.{3,40})/i);
        if (extractM) return { intent: 'extract', what: extractM[1] };

        // Explain
        const explainM = t.match(/\b(explain|what is|what are|define|meaning of)\b.{0,60}/i);
        if (explainM) {
            const topic = userText.replace(/\b(explain|what is|what are|define|meaning of)\b/i, '').trim();
            return { intent: 'explain', topic };
        }

        // Save / list jobs
        if (/\b(save this job|bookmark this job|add to (tracker|applications))\b/i.test(t)) return { intent: 'save_job' };
        if (/\b(saved jobs?|job tracker|my jobs?|my applications?|tracked jobs?)\b/i.test(t)) return { intent: 'list_jobs' };

        // Save / list pages
        if (/\b(save this page|bookmark this page|save this link|add to reading list)\b/i.test(t)) return { intent: 'save_page' };
        if (/\b(saved pages?|my pages?|bookmarks?|reading list)\b/i.test(t)) return { intent: 'list_pages' };

        // Clips
        if (/\b(clip this|save this text|save selection|clip this paragraph)\b/i.test(t)) return { intent: 'save_clip' };
        if (/\b(my clips?|saved clips?|show clips?|list clips?)\b/i.test(t)) return { intent: 'list_clips', query: '' };

        // Compatibility / scan
        if (/\b(am I (a good fit|qualified|compatible)|do I (qualify|match|fit)|this job|this role|this position)\b/i.test(t))
            return { intent: 'compatibility' };
        if (/\b(scan (all )?jobs?|jobs? on this page|all jobs?|these jobs?|which jobs? match)\b/i.test(t))
            return { intent: 'scan_jobs' };

        // Keyword match / profile
        if (/\b(keyword|missing keyword|keyword (gap|match|analysis))\b/i.test(t)) return { intent: 'keyword_match' };
        if (/\b(profile (score|completeness|strength)|resume score|what.s missing from my profile)\b/i.test(t)) return { intent: 'profile_score' };

        // Daily briefing
        if (/\b(daily briefing|morning briefing|today.s summary|what.s on my plate)\b/i.test(t)) return { intent: 'daily_briefing' };

        // Wiki search
        const wikiM = t.match(/\b(find|search (my )?saves?|look up|search my (notes?|clips?|pages?|stuff))\b.{0,60}/i);
        if (wikiM) return { intent: 'wiki_search', query: userText.replace(/\b(find|search|look up)\b/i, '').trim() };

        // Compare / export jobs
        if (/\b(compare jobs?|job comparison|side.by.side)\b/i.test(t)) return { intent: 'compare_jobs' };
        if (/\b(export jobs?|download (jobs?|tracker)|save jobs? to file)\b/i.test(t)) return { intent: 'export_jobs' };

        return { intent: 'chat' };
    }

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
                    console.warn('[Nova] classifyIntent AI failed, using regex fallback:', chrome.runtime.lastError?.message);
                    return resolve(classifyIntentRegex(userText));
                }
                const raw = (result.text || '').trim();
                console.log('[Nova] classify raw:', raw);
                try {
                    const match = raw.match(/\{[\s\S]*\}/);
                    if (!match) throw new Error('no JSON block found');
                    const json = JSON.parse(match[0]);
                    console.log('[Nova] intent:', json);
                    resolve(json);
                } catch (e) {
                    console.warn('[Nova] intent parse failed, using regex fallback:', e.message);
                    resolve(classifyIntentRegex(userText));
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
${pageContent.slice(0, 2000)}

--- CANDIDATE RESUME ---
${resumeText.slice(0, 1500)}

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
                            <div style="font-size:13px;font-weight:700;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc((
                    document.querySelector('meta[property="og:title"]')?.content ||
                    document.querySelector('meta[name="title"]')?.content ||
                    document.querySelector('h1')?.textContent?.trim() ||
                    document.title
                ).replace(/\s*[\|\-–—].*$/, '').trim().slice(0, 60) || 'This Role')}</div>
                            <div style="margin-top:4px;">
                                <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;background:${lbl.bg};color:${lbl.color};">${lbl.text}</span>
                            </div>
                        </div>
                    </div>
                    ${result.verdict ? `<div style="padding:10px 16px;font-size:12px;color:#6b7280;line-height:1.5;border-bottom:1px solid #f3f4f6;font-style:italic;">${esc(result.verdict)}</div>` : ''}
                    ${matchTags || gapTags ? `<div style="padding:10px 16px;display:flex;flex-wrap:wrap;gap:6px;">${matchTags}${gapTags}</div>` : ''}
                    <div style="display:flex;gap:8px;padding:10px 16px 12px;border-top:1px solid #f3f4f6;">
                      <button id="compat-save-${ts}" style="flex:1;padding:7px 0;background:#f0fdf4;color:#15803d;border:1.5px solid #bbf7d0;border-radius:8px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit;">💾 Save to tracker</button>
                      <button id="compat-fill-${ts}" style="flex:1;padding:7px 0;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border:none;border-radius:8px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit;">⚡ Fill Form</button>
                    </div>
                </div>
            </div>`;
        wrap.querySelector('.nw-msg-wrap').appendChild(makeTimeEl(ts));
        messagesEl.appendChild(wrap);

        // Wire buttons
        wrap.querySelector(`#compat-save-${ts}`)?.addEventListener('click', function() {
            saveCurrentJob();
            this.textContent = '✓ Saved!';
            this.style.background = '#dcfce7';
            this.disabled = true;
        });
        wrap.querySelector(`#compat-fill-${ts}`)?.addEventListener('click', () => {
            dispatchIntent({ intent: 'fill' }, '', null);
        });

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
${jobText.slice(0, 1800)}

--- CANDIDATE RESUME ---
${resumeText.slice(0, 1200)}

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

    function _wireFilterChips(card, listEl, scoredRecords) {
        const filtersContainer = card.querySelector('.nw-scan-filters');
        if (!filtersContainer) {
            // Add filter container if it doesn't exist
            const progressRow = card.querySelector('.nw-scan-bar-wrap');
            if (progressRow) {
                const newContainer = document.createElement('div');
                newContainer.className = 'nw-scan-filters';
                newContainer.id = `${SCAN_CARD_ID}-filters`;
                progressRow.insertAdjacentElement('afterend', newContainer);
            }
        }

        const filterEl = card.querySelector('.nw-scan-filters') || card.querySelector(`#${SCAN_CARD_ID}-filters`);
        if (!filterEl) return;

        filterEl.innerHTML = '';

        // Calculate counts by score bucket
        const buckets = {
            'All': scoredRecords.length,
            'Strong (8-10)': scoredRecords.filter(r => r.score >= 8).length,
            'Good (5-7)': scoredRecords.filter(r => r.score >= 5 && r.score < 8).length,
            'Weak (<5)': scoredRecords.filter(r => r.score < 5).length,
        };

        let activeFilter = 'All';
        const updateRowVisibility = (filter) => {
            Array.from(listEl.querySelectorAll('.nw-scan-row')).forEach(row => {
                const score = parseInt(row.dataset.score);
                if (isNaN(score)) {
                    row.style.display = 'none';
                    return;
                }

                let show = false;
                if (filter === 'All') show = true;
                else if (filter === 'Strong (8-10)') show = score >= 8;
                else if (filter === 'Good (5-7)') show = score >= 5 && score < 8;
                else if (filter === 'Weak (<5)') show = score < 5;

                row.style.display = show ? '' : 'none';
            });

            // Update visible count in title
            const visibleCount = Array.from(listEl.querySelectorAll('.nw-scan-row')).filter(r => r.style.display !== 'none').length;
            const titleEl = card.querySelector(`#${SCAN_CARD_ID}-title`);
            if (titleEl) {
                const total = scoredRecords.length;
                titleEl.textContent = visibleCount === total
                    ? `✅ Scanned ${total} jobs — ${visibleCount} scored`
                    : `✅ Scanned ${total} jobs — ${visibleCount} shown`;
            }
        };

        // Create chips
        Object.entries(buckets).forEach(([label, count]) => {
            const chip = document.createElement('button');
            chip.className = 'nw-scan-chip';
            chip.textContent = `${label} (${count})`;
            if (label === 'All') chip.classList.add('active');

            chip.addEventListener('click', () => {
                // Update active state
                filterEl.querySelectorAll('.nw-scan-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                activeFilter = label;
                updateRowVisibility(label);
            });

            filterEl.appendChild(chip);
        });
    }

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
                    <button id="nw-preview-newtab" style="width:22px;height:22px;border-radius:50%;background:#f3f4f6;border:none;cursor:pointer;font-size:11px;color:#6b7280;display:flex;align-items:center;justify-content:center;flex-shrink:0;" title="Open in new tab">↗</button>
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
            document.getElementById('nw-preview-newtab')?.addEventListener('click', () => {
                chrome.runtime.sendMessage({ type: 'NAVIGATE', url: document.getElementById('nw-preview-iframe')?.src || '' });
            });
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
            const errWrap = appendMsg('ai', '⚠️ No resume found. Add your profile to get started.');
            const btn = document.createElement('button');
            btn.textContent = '⚙️ Open Settings';
            btn.style.cssText = 'display:block;margin-top:8px;padding:6px 14px;background:#6366f1;color:white;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;';
            btn.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }));
            errWrap?.querySelector('.nw-bubble')?.appendChild(btn);
            return;
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

        // Add summary banner at top of list
        if (scoredRecords.length) {
            const topScore = scoredRecords[0].score;
            const topTitle = scoredRecords[0].title;
            const strongCount = scoredRecords.filter(r => r.score >= 8).length;
            const banner = document.createElement('div');
            banner.style.cssText = 'margin:0 0 8px;padding:10px 12px;background:linear-gradient(135deg,#f0fdf4,#ecfdf5);border:1px solid #bbf7d0;border-radius:10px;font-size:11.5px;color:#15803d;line-height:1.6;';
            banner.innerHTML = `<strong>${scoredRecords.length} jobs scored</strong> · ${strongCount} strong match${strongCount !== 1 ? 'es' : ''} · Top: <strong>${esc(topTitle.slice(0, 30))}${topTitle.length > 30 ? '…' : ''}</strong> (${topScore}/10)`;
            listEl.insertBefore(banner, listEl.firstChild);
        }

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

    function _downloadFile(filename, content, mimeType) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([content], { type: mimeType }));
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }

    async function renderDailyBriefing() {
        const ts = Date.now();
        const wrap = document.createElement('div');
        wrap.className = 'nw-msg ai';

        // Jobs needing follow-up: status saved/applied, saved >3 days ago
        const allJobs = jtLoad();
        const followUpJobs = allJobs.filter(j => {
            const daysOld = (Date.now() - j.id) / 86400000;
            return (j.status === 'saved' || j.status === 'applied') && daysOld > 3;
        });

        // Unread saved pages: saved but no re-visit recorded in read progress
        let savedPages = await spLoad();
        let readProgress = {};
        try { readProgress = JSON.parse(localStorage.getItem('nova_read_progress') || '{}'); } catch {}
        const unreadPages = savedPages.filter(p => !readProgress[p.url]);

        // Clips saved today
        const clips = await _clipsLoad();
        const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const todayClips = clips.filter(c => c.date === today);

        const hasAnything = followUpJobs.length || unreadPages.length || todayClips.length || allJobs.length;

        const bubble = document.createElement('div');
        bubble.className = 'nw-bubble';
        bubble.style.cssText = 'padding:0;overflow:hidden;min-width:260px;';
        bubble.innerHTML = `
            <div style="padding:10px 14px 8px;background:linear-gradient(135deg,#1e293b,#334155);color:white;">
                <div style="font-size:13px;font-weight:700;">📋 Daily Briefing</div>
                <div style="font-size:10.5px;opacity:0.75;margin-top:1px;">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
            </div>`;

        const addRow = (emoji, label, count, color, onClick) => {
            if (!count && !onClick) return;
            const row = document.createElement('div');
            row.style.cssText = `display:flex;align-items:center;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #f8f9fa;${onClick ? 'cursor:pointer;' : ''}`;
            row.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:15px;">${emoji}</span>
                    <span style="font-size:12px;color:#374151;font-weight:500;">${label}</span>
                </div>
                <span style="padding:2px 9px;background:${color}1a;color:${color};border-radius:20px;font-size:11.5px;font-weight:700;border:1px solid ${color}33;">${count}</span>`;
            if (onClick) {
                row.addEventListener('click', onClick);
                row.style.cursor = 'pointer';
                row.addEventListener('mouseenter', () => row.style.background = '#f8f9ff');
                row.addEventListener('mouseleave', () => row.style.background = '');
            }
            bubble.appendChild(row);
        };

        addRow('💼', 'Jobs to follow up', followUpJobs.length || 0, '#b45309', followUpJobs.length ? () => renderJobTracker() : null);
        addRow('📌', 'Saved jobs total', allJobs.length, '#6366f1', () => renderJobTracker());
        addRow('🔖', 'Unread saved pages', unreadPages.length || 0, '#0891b2', unreadPages.length ? () => renderSavedPages() : null);
        addRow('📎', 'Clips saved today', todayClips.length || 0, '#7c3aed', todayClips.length ? () => renderClips() : null);

        if (!hasAnything) {
            bubble.insertAdjacentHTML('beforeend', '<div style="padding:12px 14px;font-size:12px;color:#6b7280;">Nothing to catch up on. Start saving jobs and pages!</div>');
        }

        const msgWrap = document.createElement('div');
        msgWrap.className = 'nw-msg-wrap';
        msgWrap.appendChild(bubble);
        msgWrap.appendChild(makeTimeEl(ts));
        wrap.appendChild(Object.assign(document.createElement('div'), { className: 'nw-avatar', textContent: 'N' }));
        wrap.appendChild(msgWrap);
        messagesEl.appendChild(wrap);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    async function renderWikiSearch(query) {
        if (!query?.trim()) {
            appendMsg('ai', 'What would you like to search for? Try: **"find React hooks"** or **"search my saves for Google"**');
            return;
        }
        const q = query.trim().toLowerCase();
        const ts = Date.now();

        // Search jobs
        const jobs = jtLoad().filter(j =>
            j.title?.toLowerCase().includes(q) ||
            j.company?.toLowerCase().includes(q) ||
            (j.notes || '').toLowerCase().includes(q));

        // Search saved pages
        const allPages = await spLoad();
        const pages = allPages.filter(p =>
            p.title?.toLowerCase().includes(q) ||
            p.url?.toLowerCase().includes(q));

        // Search clips
        const allClips = await _clipsLoad();
        const clips = allClips.filter(c =>
            c.text?.toLowerCase().includes(q) ||
            c.title?.toLowerCase().includes(q) ||
            (c.annotation || '').toLowerCase().includes(q));

        // Search recent chat history
        const chats = chatHistory.filter(m =>
            m.text?.toLowerCase().includes(q)).slice(0, 5);

        const totalResults = jobs.length + pages.length + clips.length + chats.length;

        const wrap = document.createElement('div');
        wrap.className = 'nw-msg ai';

        if (!totalResults) {
            wrap.innerHTML = `
                <div class="nw-avatar">N</div>
                <div class="nw-msg-wrap">
                    <div class="nw-bubble">
                        <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:4px;">🔎 No results for "${esc(query)}"</div>
                        <div style="font-size:11.5px;color:#6b7280;">Nothing found in your saved jobs, pages, or clips.</div>
                    </div>
                </div>`;
            wrap.querySelector('.nw-msg-wrap').appendChild(makeTimeEl(ts));
            messagesEl.appendChild(wrap);
            messagesEl.scrollTop = messagesEl.scrollHeight;
            return;
        }

        const bubble = document.createElement('div');
        bubble.className = 'nw-bubble';
        bubble.style.cssText = 'padding:0;overflow:hidden;min-width:260px;';
        bubble.innerHTML = `
            <div style="padding:10px 14px 8px;background:linear-gradient(135deg,#0f172a,#1e293b);color:white;">
                <div style="font-size:13px;font-weight:700;">🔎 Search: "${esc(query)}"</div>
                <div style="font-size:10.5px;opacity:0.75;margin-top:1px;">${totalResults} result${totalResults !== 1 ? 's' : ''} across your saved data</div>
            </div>`;

        const addSection = (title, items, renderFn) => {
            if (!items.length) return;
            const sec = document.createElement('div');
            sec.style.cssText = 'border-top:1px solid #f1f5f9;padding:6px 14px 4px;';
            sec.innerHTML = `<div style="font-size:9.5px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px;">${title}</div>`;
            items.slice(0, 3).forEach(item => {
                const row = document.createElement('div');
                row.style.cssText = 'padding:4px 0;border-bottom:1px solid #f8f9fa;';
                row.innerHTML = renderFn(item);
                sec.appendChild(row);
            });
            if (items.length > 3) {
                sec.insertAdjacentHTML('beforeend', `<div style="font-size:10.5px;color:#9ca3af;padding:3px 0;">+${items.length - 3} more</div>`);
            }
            bubble.appendChild(sec);
        };

        addSection('Jobs', jobs, j =>
            `<a href="${esc(j.url)}" target="_blank" rel="noopener" style="display:block;text-decoration:none;">
                <div style="font-size:12px;font-weight:600;color:#111827;">${esc(j.title)}</div>
                <div style="font-size:10.5px;color:#6b7280;">${esc(j.company)} · ${esc(j.status)}</div>
            </a>`);

        addSection('Saved Pages', pages, p =>
            `<a href="${esc(p.url)}" target="_blank" rel="noopener" style="display:block;text-decoration:none;">
                <div style="font-size:12px;font-weight:600;color:#111827;">${esc(p.title)}</div>
                <div style="font-size:10px;color:#9ca3af;">${esc(p.url.slice(0, 50))}${p.url.length > 50 ? '…' : ''}</div>
            </a>`);

        addSection('Clips', clips, c =>
            `<div>
                <div style="font-size:11.5px;color:#374151;">"${esc(c.text.slice(0, 80))}${c.text.length > 80 ? '…' : ''}"</div>
                <div style="font-size:10px;color:#9ca3af;">${esc(c.title)}</div>
            </div>`);

        addSection('Chat history', chats, m =>
            `<div style="font-size:11.5px;color:#374151;">${esc(m.text?.slice(0, 100) || '')}${(m.text?.length || 0) > 100 ? '…' : ''}</div>`);

        const msgWrap = document.createElement('div');
        msgWrap.className = 'nw-msg-wrap';
        msgWrap.appendChild(bubble);
        msgWrap.appendChild(makeTimeEl(ts));
        wrap.appendChild(Object.assign(document.createElement('div'), { className: 'nw-avatar', textContent: 'N' }));
        wrap.appendChild(msgWrap);
        messagesEl.appendChild(wrap);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function renderClips(query = '') {
        const clips = _clipsLoad();
        const ts = Date.now();
        const wrap = document.createElement('div');
        wrap.className = 'nw-msg ai';

        const filtered = query
            ? clips.filter(c =>
                c.text.toLowerCase().includes(query.toLowerCase()) ||
                c.title.toLowerCase().includes(query.toLowerCase()) ||
                (c.annotation || '').toLowerCase().includes(query.toLowerCase()))
            : clips;

        if (!filtered.length) {
            wrap.innerHTML = `
                <div class="nw-avatar">N</div>
                <div class="nw-msg-wrap">
                    <div class="nw-bubble">
                        <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:6px;">📎 Saved Clips</div>
                        <div style="font-size:12px;color:#6b7280;">${query ? `No clips match "${esc(query)}"` : 'No clips saved yet. Select text on any page and click 📎 Clip.'}</div>
                    </div>
                </div>`;
            wrap.querySelector('.nw-msg-wrap').appendChild(makeTimeEl(ts));
            messagesEl.appendChild(wrap);
            messagesEl.scrollTop = messagesEl.scrollHeight;
            return;
        }

        const bubble = document.createElement('div');
        bubble.className = 'nw-bubble';
        bubble.style.cssText = 'padding:0;overflow:hidden;min-width:260px;';
        bubble.innerHTML = `
            <div style="padding:10px 14px 8px;background:linear-gradient(135deg,#0f172a,#1e293b);color:white;">
                <div style="font-size:13px;font-weight:700;">📎 Saved Clips</div>
                <div style="font-size:10.5px;opacity:0.75;margin-top:1px;">${filtered.length} clip${filtered.length !== 1 ? 's' : ''}${query ? ` matching "${esc(query)}"` : ''}</div>
            </div>`;

        filtered.slice(0, 8).forEach(clip => {
            const card = document.createElement('div');
            card.style.cssText = 'padding:9px 14px;border-bottom:1px solid #f1f5f9;';
            card.innerHTML = `
                <div style="font-size:11.5px;color:#1e293b;line-height:1.5;margin-bottom:4px;">"${esc(clip.text.slice(0, 120))}${clip.text.length > 120 ? '…' : ''}"</div>
                ${clip.annotation ? `<div style="font-size:11px;color:#6366f1;margin-bottom:3px;font-style:italic;">${esc(clip.annotation)}</div>` : ''}
                <div style="display:flex;align-items:center;justify-content:space-between;">
                    <div style="font-size:10px;color:#9ca3af;">${esc(clip.title)} · ${clip.date}</div>
                    <div style="display:flex;gap:5px;">
                        <a href="${esc(clip.url)}" target="_blank" rel="noopener" style="font-size:10.5px;color:#6366f1;font-weight:600;text-decoration:none;">↗</a>
                        <button data-clip-id="${clip.id}" style="background:none;border:none;cursor:pointer;font-size:10.5px;color:#ef4444;padding:0;font-family:inherit;">✕</button>
                    </div>
                </div>`;
            card.querySelector('button')?.addEventListener('click', () => {
                const all = _clipsLoad().filter(c => c.id !== clip.id);
                _clipsSave(all);
                card.style.opacity = '0';
                card.style.transition = 'opacity 0.15s';
                setTimeout(() => card.remove(), 150);
            });
            bubble.appendChild(card);
        });

        if (filtered.length > 8) {
            const more = document.createElement('div');
            more.style.cssText = 'padding:8px 14px;font-size:11px;color:#9ca3af;text-align:center;';
            more.textContent = `+${filtered.length - 8} more clips`;
            bubble.appendChild(more);
        }

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

    function renderJobComparison() {
        const jobs = jtLoad();
        if (jobs.length < 2) {
            appendMsg('ai', 'You need at least 2 saved jobs to compare. Save some jobs first by saying **"save this job"** on any job posting.');
            return;
        }

        const compareJobs = jobs.slice(0, 3); // Compare up to 3 most recent
        const ts = Date.now();
        const wrap = document.createElement('div');
        wrap.className = 'nw-msg ai';

        const STATUS_COLORS = { saved: '#6366f1', applied: '#0891b2', interview: '#d97706', offer: '#15803d', rejected: '#dc2626' };
        const STATUS_BG    = { saved: '#eef2ff', applied: '#e0f2fe', interview: '#fffbeb', offer: '#f0fdf4', rejected: '#fef2f2' };

        const colW = compareJobs.length === 2 ? '50%' : '33.33%';

        const headerCells = compareJobs.map(j =>
            `<th style="width:${colW};padding:8px 10px;text-align:left;border-right:1px solid #f1f5f9;vertical-align:top;">
                <div style="font-size:12px;font-weight:700;color:#111827;line-height:1.3;">${esc(j.title)}</div>
                <div style="font-size:10.5px;color:#6b7280;margin-top:2px;">${esc(j.company)}</div>
            </th>`
        ).join('');

        const statusCells = compareJobs.map(j =>
            `<td style="padding:7px 10px;border-right:1px solid #f8f9fa;vertical-align:top;">
                <span style="padding:2px 8px;background:${STATUS_BG[j.status]||'#f1f5f9'};color:${STATUS_COLORS[j.status]||'#374151'};border-radius:20px;font-size:10.5px;font-weight:700;">${JT_LABELS[j.status]||j.status}</span>
            </td>`
        ).join('');

        const dateCells = compareJobs.map(j =>
            `<td style="padding:7px 10px;border-right:1px solid #f8f9fa;font-size:11px;color:#374151;vertical-align:top;">${esc(j.date)}</td>`
        ).join('');

        const notesCells = compareJobs.map(j =>
            `<td style="padding:7px 10px;border-right:1px solid #f8f9fa;font-size:11px;color:#374151;vertical-align:top;max-width:120px;">${j.notes ? esc(j.notes.slice(0, 80)) + (j.notes.length > 80 ? '…' : '') : '<span style="color:#cbd5e1;">—</span>'}</td>`
        ).join('');

        const linkCells = compareJobs.map(j =>
            `<td style="padding:7px 10px;border-right:1px solid #f8f9fa;vertical-align:top;">
                <a href="${esc(j.url)}" target="_blank" rel="noopener" style="color:#6366f1;font-size:11px;font-weight:600;text-decoration:none;">↗ Open</a>
            </td>`
        ).join('');

        wrap.innerHTML = `
            <div class="nw-avatar">N</div>
            <div class="nw-msg-wrap">
                <div class="nw-bubble" style="padding:0;overflow:hidden;min-width:260px;">
                    <div style="padding:10px 14px 8px;background:linear-gradient(135deg,#6366f1,#818cf8);color:white;">
                        <div style="font-size:13px;font-weight:700;">⚖ Job Comparison</div>
                        <div style="font-size:10.5px;opacity:0.85;margin-top:1px;">Comparing ${compareJobs.length} most recent jobs</div>
                    </div>
                    <div style="overflow-x:auto;">
                        <table style="width:100%;border-collapse:collapse;font-family:inherit;">
                            <thead style="background:#f8f9ff;">
                                <tr><th style="padding:6px 10px;text-align:left;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;border-right:1px solid #f1f5f9;width:60px;">Field</th>${headerCells}</tr>
                            </thead>
                            <tbody>
                                <tr style="border-top:1px solid #f1f5f9;">
                                    <td style="padding:7px 10px;font-size:10.5px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;border-right:1px solid #f1f5f9;">Status</td>
                                    ${statusCells}
                                </tr>
                                <tr style="border-top:1px solid #f1f5f9;background:#fafbff;">
                                    <td style="padding:7px 10px;font-size:10.5px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;border-right:1px solid #f1f5f9;">Saved</td>
                                    ${dateCells}
                                </tr>
                                <tr style="border-top:1px solid #f1f5f9;">
                                    <td style="padding:7px 10px;font-size:10.5px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;border-right:1px solid #f1f5f9;">Notes</td>
                                    ${notesCells}
                                </tr>
                                <tr style="border-top:1px solid #f1f5f9;background:#fafbff;">
                                    <td style="padding:7px 10px;font-size:10.5px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;border-right:1px solid #f1f5f9;">Link</td>
                                    ${linkCells}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div style="padding:8px 14px;font-size:10.5px;color:#9ca3af;border-top:1px solid #f1f5f9;">Showing ${compareJobs.length} most recently saved jobs. Say <strong>"show my saved jobs"</strong> to manage all.</div>
                </div>
            </div>`;
        wrap.querySelector('.nw-msg-wrap').appendChild(makeTimeEl(ts));
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
        const statusCounts = JT_STATUSES.reduce((acc, s) => { acc[s] = jobs.filter(j => j.status === s).length; return acc; }, {});
        const STATUS_COLORS = { saved: '#6366f1', applied: '#0891b2', interview: '#d97706', offer: '#15803d', rejected: '#dc2626' };
        const STATUS_BG    = { saved: '#eef2ff', applied: '#e0f2fe', interview: '#fffbeb', offer: '#f0fdf4', rejected: '#fef2f2' };
        const statsHtml = JT_STATUSES.filter(s => statusCounts[s] > 0).map(s =>
            `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:700;background:${STATUS_BG[s]};color:${STATUS_COLORS[s]};border:1px solid ${STATUS_COLORS[s]}33;">
                ${statusCounts[s]} ${s}
            </span>`).join('');
        bubble.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                <div class="nw-jt-header" style="margin-bottom:0;">📋 Job Tracker (${jobs.length} job${jobs.length !== 1 ? 's' : ''})</div>
                <div style="display:flex;gap:5px;">
                    <button id="nw-jt-compare" style="padding:3px 9px;background:#fdf4ff;color:#7e22ce;border:1px solid #d8b4fe;border-radius:6px;font-size:10.5px;font-weight:600;cursor:pointer;font-family:inherit;">⚖ Compare</button>
                    <button id="nw-jt-export-csv" style="padding:3px 9px;background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;border-radius:6px;font-size:10.5px;font-weight:600;cursor:pointer;font-family:inherit;">↓ CSV</button>
                    <button id="nw-jt-export-json" style="padding:3px 9px;background:#eef2ff;color:#4f46e5;border:1px solid #a5b4fc;border-radius:6px;font-size:10.5px;font-weight:600;cursor:pointer;font-family:inherit;">↓ JSON</button>
                </div>
            </div>
            ${statsHtml ? `<div style="display:flex;flex-wrap:wrap;gap:5px;padding:0 0 10px;">${statsHtml}</div>` : ''}
        `;

        // Compare button
        bubble.querySelector('#nw-jt-compare')?.addEventListener('click', () => renderJobComparison());

        // Export buttons
        bubble.querySelector('#nw-jt-export-csv')?.addEventListener('click', () => {
            const rows = [['Title', 'Company', 'Status', 'Date', 'URL', 'Notes']];
            jtLoad().forEach(j => rows.push([
                `"${(j.title || '').replace(/"/g, '""')}"`,
                `"${(j.company || '').replace(/"/g, '""')}"`,
                j.status || '',
                j.date || '',
                j.url || '',
                `"${(j.notes || '').replace(/"/g, '""')}"`
            ]));
            const csv = rows.map(r => r.join(',')).join('\n');
            _downloadFile('nova_jobs.csv', csv, 'text/csv');
        });

        bubble.querySelector('#nw-jt-export-json')?.addEventListener('click', () => {
            _downloadFile('nova_jobs.json', JSON.stringify(jtLoad(), null, 2), 'application/json');
        });

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

            const savedMs = job.id || 0;
            const daysOld = savedMs ? Math.floor((Date.now() - savedMs) / 86400000) : 0;
            const staleHtml = (daysOld >= 7 && job.status === 'saved')
                ? `<span style="margin-left:6px;padding:1px 7px;background:#fef3c7;color:#92400e;border-radius:20px;font-size:9.5px;font-weight:700;">${daysOld}d old</span>`
                : '';
            card.innerHTML = `
                <div class="nw-job-title">${esc(job.title)}${staleHtml}</div>
                <div class="nw-job-meta">${esc(job.company)} · ${esc(job.date)}</div>
                <div class="nw-job-actions"></div>`;
            const actions = card.querySelector('.nw-job-actions');
            actions.appendChild(statusBtn);
            actions.insertAdjacentHTML('beforeend', `<a class="nw-job-link" href="${esc(job.url)}" target="_blank" rel="noopener">↗ Open</a>`);

            // Follow-up reminder button
            const remindBtn = document.createElement('button');
            remindBtn.className = 'nw-job-remove';
            remindBtn.textContent = '🔔 Remind';
            remindBtn.title = 'Set a follow-up reminder';
            remindBtn.addEventListener('click', () => {
                // Replace button with inline picker
                remindBtn.style.display = 'none';
                const picker = document.createElement('div');
                picker.style.cssText = 'display:flex;align-items:center;gap:5px;margin-top:4px;flex-wrap:wrap;';
                picker.innerHTML = `<span style="font-size:10.5px;color:#6b7280;">Remind in:</span>`;
                const opts = [
                    { label: '1d', days: 1 }, { label: '3d', days: 3 },
                    { label: '1w', days: 7 }, { label: '2w', days: 14 }
                ];
                opts.forEach(o => {
                    const btn = document.createElement('button');
                    btn.textContent = o.label;
                    btn.style.cssText = 'padding:2px 8px;background:#eef2ff;color:#4f46e5;border:1px solid #a5b4fc;border-radius:6px;font-size:10.5px;font-weight:600;cursor:pointer;font-family:inherit;';
                    btn.addEventListener('click', () => {
                        chrome.runtime.sendMessage({
                            type: 'SET_REMINDER',
                            jobId: job.id,
                            jobTitle: job.title,
                            delayMinutes: o.days * 24 * 60
                        }, () => {
                            picker.innerHTML = `<span style="font-size:10.5px;color:#15803d;font-weight:600;">✓ Reminder set for ${o.label}</span>`;
                            setTimeout(() => { picker.remove(); remindBtn.style.display = ''; }, 2000);
                        });
                    });
                    picker.appendChild(btn);
                });
                const cancelBtn = document.createElement('button');
                cancelBtn.textContent = '✕';
                cancelBtn.style.cssText = 'padding:2px 6px;background:#f8f9fa;color:#94a3b8;border:1px solid #e5e7eb;border-radius:6px;font-size:10px;cursor:pointer;font-family:inherit;';
                cancelBtn.addEventListener('click', () => { picker.remove(); remindBtn.style.display = ''; });
                picker.appendChild(cancelBtn);
                card.appendChild(picker);
            });

            actions.appendChild(removeBtn);
            actions.appendChild(remindBtn);

            // Notes toggle
            const notesBtn = document.createElement('button');
            notesBtn.className = 'nw-job-remove';
            notesBtn.textContent = job.notes ? '📝 Notes ✓' : '📝 Notes';
            notesBtn.title = 'Add private notes';

            const notesArea = document.createElement('div');
            notesArea.style.cssText = 'display:none;padding:6px 0 2px;';
            notesArea.innerHTML = `<textarea placeholder="Interview notes, salary discussed, contacts..." style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #e0e7ff;border-radius:6px;font-size:11.5px;color:#1e293b;resize:vertical;min-height:52px;font-family:inherit;outline:none;background:#fafbff;">${job.notes ? esc(job.notes) : ''}</textarea>`;
            const textarea = notesArea.querySelector('textarea');

            textarea.addEventListener('blur', () => {
                const val = textarea.value.trim();
                const all = jtLoad();
                const entry = all.find(j => j.id === job.id);
                if (entry) {
                    entry.notes = val;
                    jtSave(all);
                    job.notes = val;
                    notesBtn.textContent = val ? '📝 Notes ✓' : '📝 Notes';
                }
            });

            notesBtn.addEventListener('click', () => {
                const open = notesArea.style.display === 'block';
                notesArea.style.display = open ? 'none' : 'block';
                if (!open) setTimeout(() => textarea.focus(), 50);
            });

            actions.appendChild(notesBtn);
            card.appendChild(notesArea);
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

    // ── Resume Score ──────────────────────────────────────────────────────────

    function renderResumeScore(resumeData) {
        const ts = Date.now();
        const checks = [
            { key: 'name',       label: 'Full name',       val: resumeData?.basics?.name || resumeData?.name },
            { key: 'email',      label: 'Email',            val: resumeData?.basics?.email || resumeData?.email },
            { key: 'phone',      label: 'Phone',            val: resumeData?.basics?.phone || resumeData?.phone },
            { key: 'location',   label: 'Location',         val: resumeData?.basics?.location || resumeData?.location },
            { key: 'summary',    label: 'Summary/Bio',      val: resumeData?.basics?.summary || resumeData?.summary },
            { key: 'linkedin',   label: 'LinkedIn URL',     val: resumeData?.basics?.linkedin || resumeData?.linkedin || resumeData?.basics?.profiles?.find?.(p => /linkedin/i.test(p.network))?.url },
            { key: 'github',     label: 'GitHub/Portfolio', val: resumeData?.basics?.github || resumeData?.github || resumeData?.portfolio || resumeData?.basics?.profiles?.find?.(p => /github/i.test(p.network))?.url },
            { key: 'experience', label: 'Work experience',  val: (resumeData?.experience || resumeData?.work || []).length },
            { key: 'education',  label: 'Education',        val: (resumeData?.education || resumeData?.schools || []).length },
            { key: 'skills',     label: 'Skills',           val: (resumeData?.skills || []).length },
        ];
        const filled = checks.filter(c => c.val && c.val !== 0).length;
        const pct = Math.round((filled / checks.length) * 100);
        const missing = checks.filter(c => !c.val || c.val === 0).map(c => c.label);

        const color = pct >= 80 ? '#15803d' : pct >= 50 ? '#b45309' : '#dc2626';
        const bg    = pct >= 80 ? '#f0fdf4' : pct >= 50 ? '#fffbeb' : '#fef2f2';
        const border= pct >= 80 ? '#bbf7d0' : pct >= 50 ? '#fde68a' : '#fecaca';
        const emoji = pct >= 80 ? '🟢' : pct >= 50 ? '🟡' : '🔴';

        const wrap = document.createElement('div');
        wrap.className = 'nw-msg ai';
        wrap.innerHTML = `
            <div class="nw-avatar">N</div>
            <div class="nw-msg-wrap">
                <div class="nw-bubble" style="padding:0;overflow:hidden;min-width:240px;">
                    <div style="padding:12px 14px 10px;border-bottom:1px solid #f3f4f6;">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <div style="flex:1;">
                                <div style="font-size:13px;font-weight:700;color:#111827;">Profile Completeness</div>
                                <div style="font-size:11px;color:#6b7280;margin-top:2px;">${filled}/${checks.length} sections filled</div>
                            </div>
                            <div style="display:flex;align-items:center;gap:6px;padding:6px 12px;background:${bg};border:1.5px solid ${border};border-radius:10px;">
                                <span style="font-size:15px;">${emoji}</span>
                                <span style="font-size:18px;font-weight:800;color:${color};">${pct}%</span>
                            </div>
                        </div>
                        <div style="margin-top:10px;height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden;">
                            <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:width 0.6s ease;"></div>
                        </div>
                    </div>
                    ${missing.length ? `
                    <div style="padding:10px 14px;">
                        <div style="font-size:10.5px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Missing</div>
                        <div style="display:flex;flex-wrap:wrap;gap:5px;">
                            ${missing.map(m => `<span style="padding:2px 9px;background:#fef2f2;border:1px solid #fecaca;border-radius:20px;font-size:11px;color:#dc2626;font-weight:500;">${m}</span>`).join('')}
                        </div>
                        <button style="margin-top:10px;width:100%;padding:7px 0;background:#6366f1;color:white;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;" onclick="chrome.runtime.sendMessage({type:'OPEN_OPTIONS'})">⚙️ Complete Profile</button>
                    </div>` : `<div style="padding:10px 14px;font-size:12px;color:#15803d;">✓ Your profile looks complete!</div>`}
                </div>
            </div>`;
        wrap.querySelector('.nw-msg-wrap').appendChild(makeTimeEl(ts));
        messagesEl.appendChild(wrap);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    // ── Keyword Gap Overlay ───────────────────────────────────────────────────
    function renderKeywordOverlay() {
        // Extract page text (job description)
        const clone = document.body.cloneNode(true);
        clone.querySelectorAll(`script, style, #nova-chat-widget`).forEach(el => el.remove());
        const pageText = (clone.innerText || clone.textContent || '').toLowerCase().replace(/\s+/g, ' ');

        // Extract keywords from page — nouns, tech words, role titles
        const stopwords = new Set(['and','the','for','with','you','your','our','will','have','this','that','are','from','which','their','they','must','about','more','also','can','all','any','its','into','been','has','was','not','but','per','use','who','how','what','when','where','why','one','two','new','get','let','set','put','see','may','each','both','such','than','over','after','before','while','these','those','other','some','very','just','even','then','there','here','been','have','were','work','team','role','job','time','year','years','day','days','able','make','take','give','come','need','help','well','good','best','high','low','first','last','next','many','much','way','ways']);
        const words = pageText.match(/\b[a-z][a-z0-9+#.\-]{2,}\b/g) || [];
        const freq = {};
        words.forEach(w => { if (!stopwords.has(w)) freq[w] = (freq[w] || 0) + 1; });
        // Top 30 keywords by frequency
        const topKw = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([w]) => w);

        // Remove existing overlay
        document.getElementById('nova-kw-overlay')?.remove();

        chrome.runtime.sendMessage({ type: 'GET_RESUME_TEXT' }, result => {
            const resumeText = (result?.text || '').toLowerCase();
            if (!resumeText) {
                appendMsg('ai', '⚠️ No resume found. Add your profile in Settings first to compare keywords.');
                return;
            }

            const matched = topKw.filter(k => resumeText.includes(k));
            const missing = topKw.filter(k => !resumeText.includes(k));
            const matchPct = topKw.length ? Math.round((matched.length / topKw.length) * 100) : 0;
            const color = matchPct >= 70 ? '#15803d' : matchPct >= 40 ? '#b45309' : '#dc2626';

            // Show summary in chat
            const ts = Date.now();
            const wrap = document.createElement('div');
            wrap.className = 'nw-msg ai';
            wrap.innerHTML = `
                <div class="nw-avatar">N</div>
                <div class="nw-msg-wrap">
                    <div class="nw-bubble" style="padding:0;overflow:hidden;min-width:260px;">
                        <div style="padding:10px 14px 8px;background:linear-gradient(135deg,#6366f1,#818cf8);color:white;">
                            <div style="font-size:13px;font-weight:700;">🔍 Keyword Match</div>
                            <div style="font-size:11px;opacity:0.85;margin-top:2px;">${matched.length}/${topKw.length} keywords matched — <strong style="color:white;">${matchPct}%</strong></div>
                        </div>
                        <div style="padding:10px 14px;">
                            <div style="font-size:10.5px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px;">✓ In your resume</div>
                            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;">
                                ${matched.slice(0, 15).map(k => `<span style="padding:2px 8px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:20px;font-size:11px;color:#15803d;">${k}</span>`).join('')}
                            </div>
                            <div style="font-size:10.5px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px;">✗ Missing from resume</div>
                            <div style="display:flex;flex-wrap:wrap;gap:4px;">
                                ${missing.slice(0, 15).map(k => `<span style="padding:2px 8px;background:#fef2f2;border:1px solid #fecaca;border-radius:20px;font-size:11px;color:#dc2626;">${k}</span>`).join('')}
                            </div>
                        </div>
                        <div style="padding:0 14px 10px;">
                            <button id="nova-kw-highlight-btn" style="width:100%;padding:7px 0;background:#6366f1;color:white;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">Highlight on page</button>
                        </div>
                    </div>
                </div>`;
            wrap.querySelector('.nw-msg-wrap').appendChild(makeTimeEl(ts));
            messagesEl.appendChild(wrap);
            messagesEl.scrollTop = messagesEl.scrollHeight;

            // Highlight button — inject overlay on page
            wrap.querySelector('#nova-kw-highlight-btn')?.addEventListener('click', () => {
                document.getElementById('nova-kw-overlay')?.remove();
                const overlay = document.createElement('div');
                overlay.id = 'nova-kw-overlay';
                overlay.style.cssText = 'position:fixed;top:70px;right:16px;z-index:2147483646;width:220px;max-height:60vh;overflow-y:auto;background:white;border:1.5px solid #e0e7ff;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.15);font-family:-apple-system,sans-serif;';
                overlay.innerHTML = `
                    <div style="padding:8px 12px 6px;background:linear-gradient(135deg,#6366f1,#818cf8);border-radius:10px 10px 0 0;display:flex;align-items:center;justify-content:space-between;">
                        <span style="font-size:12px;font-weight:700;color:white;">Keyword Overlay</span>
                        <button id="nova-kw-close" style="background:none;border:none;color:white;cursor:pointer;font-size:14px;padding:0;line-height:1;">✕</button>
                    </div>
                    <div style="padding:8px 10px;">
                        <div style="font-size:9.5px;font-weight:700;color:#15803d;text-transform:uppercase;margin-bottom:4px;">✓ Matched (${matched.length})</div>
                        <div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:8px;">${matched.map(k => `<span style="padding:1px 7px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:20px;font-size:10.5px;color:#15803d;">${k}</span>`).join('')}</div>
                        <div style="font-size:9.5px;font-weight:700;color:#dc2626;text-transform:uppercase;margin-bottom:4px;">✗ Missing (${missing.length})</div>
                        <div style="display:flex;flex-wrap:wrap;gap:3px;">${missing.map(k => `<span style="padding:1px 7px;background:#fef2f2;border:1px solid #fecaca;border-radius:20px;font-size:10.5px;color:#dc2626;">${k}</span>`).join('')}</div>
                    </div>`;
                document.body.appendChild(overlay);
                overlay.querySelector('#nova-kw-close')?.addEventListener('click', () => overlay.remove());

                // Highlight matched keywords in page body text
                _kwHighlightPage(matched, missing);
            });
        });
    }

    function _kwHighlightPage(matched, missing) {
        // Remove previous highlights
        document.querySelectorAll('.nova-kw-hl').forEach(el => {
            el.outerHTML = el.textContent;
        });
        const all = [...matched, ...missing];
        if (!all.length) return;
        const pattern = new RegExp(`\\b(${all.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');
        const matchedSet = new Set(matched);
        // Walk text nodes in body (skip widget)
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode: n => {
                if (n.parentElement?.closest('#nova-chat-widget')) return NodeFilter.FILTER_REJECT;
                if (n.parentElement?.closest('script,style,textarea,input')) return NodeFilter.FILTER_REJECT;
                if (!n.textContent.trim()) return NodeFilter.FILTER_SKIP;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(node => {
            if (!pattern.test(node.textContent)) return;
            pattern.lastIndex = 0;
            const frag = document.createDocumentFragment();
            let last = 0, m;
            while ((m = pattern.exec(node.textContent)) !== null) {
                if (m.index > last) frag.appendChild(document.createTextNode(node.textContent.slice(last, m.index)));
                const span = document.createElement('span');
                span.className = 'nova-kw-hl';
                const isMatch = matchedSet.has(m[0].toLowerCase());
                span.style.cssText = isMatch
                    ? 'background:#bbf7d0;color:#14532d;border-radius:3px;padding:0 2px;'
                    : 'background:#fecaca;color:#7f1d1d;border-radius:3px;padding:0 2px;';
                span.textContent = m[0];
                frag.appendChild(span);
                last = m.index + m[0].length;
            }
            if (last < node.textContent.length) frag.appendChild(document.createTextNode(node.textContent.slice(last)));
            node.parentNode.replaceChild(frag, node);
        });
    }

    // ── Saved Pages ───────────────────────────────────────────────────────────

    async function saveCurrentPage() {
        const pages = await spLoad();
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
        await spSave(pages);
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

    // ── Context Assembly (MCP-style) ─────────────────────────────────────────
    // Loads relevant user data stores based on intent and injects them as
    // structured context sections into the prompt before calling AI.

    function _getResumeText() {
        return new Promise(resolve => {
            try {
                chrome.runtime.sendMessage({ type: 'GET_RESUME_TEXT' }, result => {
                    if (chrome.runtime.lastError || !result?.success) { resolve(''); return; }
                    resolve(result.text || '');
                });
            } catch { resolve(''); }
        });
    }

    // Routes which data stores to load based on intent and user message keywords
    async function assembleContext(intent, userText) {
        const intentType = intent.intent || 'chat';
        const uLow = userText.toLowerCase();

        // Signals for each data source
        const wantsResume    = /\b(resume|cv|my (skills?|experience|background|profile|work|education|qualification|summary))\b/i.test(uLow)
            || /\b(cover letter|job fit|compatibility|keyword|apply|fill|autofill|form)\b/i.test(uLow)
            || ['compatibility', 'keyword_match', 'profile_score', 'fill', 'write'].includes(intentType);

        const wantsNotes     = /\b(note|notes?|notepad|wrote|saved note|my notes?|from my notes?)\b/i.test(uLow)
            || intentType === 'chat';

        const wantsPages     = /\b(saved pages?|bookmarks?|reading list|saved links?|articles? I saved|my pages?)\b/i.test(uLow)
            || intentType === 'list_pages';

        const wantsClips     = /\b(clip|clips?|clipping|saved text|saved clip)\b/i.test(uLow)
            || intentType === 'list_clips';

        const wantsClipboard = /\b(clipboard|copied|paste|last copied)\b/i.test(uLow);

        const sections = [];

        // Resume
        if (wantsResume) {
            try {
                const resumeText = await _getResumeText();
                if (resumeText && resumeText.length > 20) {
                    sections.push(`--- My Resume / Profile ---\n${resumeText.slice(0, 3000)}\n---`);
                }
            } catch {}
        }

        // Notepad
        if (wantsNotes) {
            try {
                const allNotes = await _npLoadAll();
                const noteList = Object.values(allNotes);
                if (noteList.length) {
                    const notesText = noteList
                        .filter(n => n.content && n.content.trim())
                        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
                        .slice(0, 8)
                        .map(n => `[${(n.title || 'Untitled').slice(0, 40)}]: ${n.content.slice(0, 400)}`)
                        .join('\n\n');
                    if (notesText) {
                        sections.push(`--- My Notepad Notes ---\n${notesText}\n---`);
                    }
                }
            } catch {}
        }

        // Saved pages
        if (wantsPages) {
            try {
                const pages = await spLoad();
                if (pages.length) {
                    const pagesText = pages.slice(0, 10)
                        .map(p => `• ${p.title} — ${p.url}`)
                        .join('\n');
                    sections.push(`--- My Saved Pages ---\n${pagesText}\n---`);
                }
            } catch {}
        }

        // Web clips
        if (wantsClips) {
            try {
                const clips = await _clipsLoad();
                if (clips.length) {
                    const clipsText = clips.slice(0, 5)
                        .map(c => `• [${c.title || c.url || 'clip'}]: ${c.text.slice(0, 300)}`)
                        .join('\n\n');
                    sections.push(`--- My Saved Clips ---\n${clipsText}\n---`);
                }
            } catch {}
        }

        // Clipboard history
        if (wantsClipboard) {
            try {
                const cbItems = await cbLoad();
                if (cbItems.length) {
                    const cbText = cbItems.slice(0, 5)
                        .map(i => `• ${i.text.slice(0, 200)}`)
                        .join('\n');
                    sections.push(`--- My Recent Clipboard ---\n${cbText}\n---`);
                }
            } catch {}
        }

        return sections.length ? sections.join('\n\n') + '\n\n' : '';
    }

    // For content intents: AI generates the actual response
    async function resolveContent(intent, userText) {
        const ctx = pageContent
            ? `--- Page content ---\n${pageContent.slice(0, 2500)}\n---\n\n`
            : '';
        const history = chatHistory.slice(-4)
            .map(m => `${m.role === 'user' ? 'User' : 'Nova'}: ${(m.text || '').slice(0, 200)}`)
            .join('\n');

        // Assemble personalised context from user's data stores
        const userCtx = await assembleContext(intent, userText);

        let prompt;
        if (intent.intent === 'summarize') {
            prompt = `${userCtx}${ctx}Summarize this page:\n• 2-3 sentence overview\n• Key points (max 5 bullets)\n• What the user might want to do next`;
        } else if (intent.intent === 'explain') {
            prompt = `${userCtx}Explain "${intent.topic}":\n• What it is (one sentence)\n• Why it matters\n• One concrete example`;
        } else if (intent.intent === 'extract') {
            prompt = `${userCtx}${ctx}Extract ${intent.what} from this page as a clean structured list. If nothing found, say so.`;
        } else if (intent.intent === 'translate') {
            prompt = `${userCtx}${ctx}Translate the main content of this page to ${intent.language}. Keep formatting intact.`;
        } else if (intent.intent === 'write') {
            prompt = `${userCtx}Write a ${intent.type} about: "${intent.about}".\nContext: currently on ${document.title} (${location.href}).\nMake it professional, ready to use, no placeholder brackets.`;
        } else {
            // chat
            const needsPage = pageContent && /\b(page|this|here|content|article|post|job|profile)\b/i.test(userText);
            const scanCtx = _lastScanResults && _lastScanResults.length
                ? `--- Recent job scan results ---\n${_lastScanResults.slice(0, 5).map((j, i) =>
                    `${i + 1}. ${j.title} — ${j.score}/10`
                  ).join('\n')}\n---\n\n`
                : '';
            prompt = `${userCtx}${scanCtx}${needsPage ? ctx : ''}${history ? history + '\n' : ''}User: ${userText}`;
        }

        return callAI(prompt, NOVA_SYSTEM, { intent: intent.intent });
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
                const allMappedFields = rawFields.slice(0, 14).map(el => ({
                    el,
                    id: el.id || el.name || '',
                    alreadyFilled: !!(el.value && el.value.trim() && !el.classList.contains('nova-filled')),
                    label: (document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim()
                        || el.getAttribute('aria-label') || el.placeholder || el.name || el.id || el.type)
                        .replace(/[*:]/g, '').trim()
                })).filter(f => f.label);

                const preFilledCount = allMappedFields.filter(f => f.alreadyFilled).length;
                const fields = allMappedFields.filter(f => !f.alreadyFilled);

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
                    const isRequired = f.el.required || f.el.getAttribute('aria-required') === 'true' ||
                        document.querySelector(`label[for="${f.el.id}"]`)?.textContent?.includes('*');
                    return `<div id="${rid}" style="display:flex;align-items:center;gap:10px;padding:7px 16px;border-bottom:1px solid #f1f5f9;transition:background 0.15s;">
                        <span id="${rid}-dot" style="width:7px;height:7px;border-radius:50%;background:#e2e8f0;flex-shrink:0;transition:all 0.25s;"></span>
                        <span style="color:#64748b;flex-shrink:0;display:flex;align-items:center;">${_fieldIcon(f.el)}</span>
                        <span style="font-size:12px;color:#1e293b;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;">${esc(f.label)}${isRequired ? '<span style="color:#ef4444;margin-left:3px;font-size:10px;">*</span>' : ''}</span>
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
                                            <div style="font-size:11px;color:rgba(255,255,255,0.75);margin-top:1px;">
                                                ${fields.length} field${fields.length !== 1 ? 's' : ''} to fill${preFilledCount > 0 ? ` · ${preFilledCount} already filled` : ''} · ${allMappedFields.length <= 5 ? '🟢 Simple' : allMappedFields.length <= 10 ? '🟡 Moderate' : '🔴 Complex'}
                                            </div>
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

                // Auto-start fill immediately — intent already confirmed by user message
                setTimeout(() => {
                    // Show brief "Starting…" hint
                    const readyBadge = fillWrap.querySelector('[style*="rgba(255,255,255,0.2)"]');
                    if (readyBadge) {
                        readyBadge.textContent = 'Starting…';
                        readyBadge.style.background = 'rgba(255,255,255,0.35)';
                    }
                    document.getElementById(fillCardId + '-confirm')?.click();
                }, 300);

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
                                                const prevVal = f.el.value;
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
                                                    // Add revert link
                                                    const revertLink = document.createElement('span');
                                                    revertLink.textContent = '↩ Revert';
                                                    revertLink.style.cssText = 'font-size:10px;color:#94a3b8;cursor:pointer;text-decoration:underline;display:block;margin-top:3px;';
                                                    revertLink.addEventListener('click', () => {
                                                        f.el.value = prevVal;
                                                        f.el.dispatchEvent(new Event('input', { bubbles: true }));
                                                        revertLink.remove();
                                                        if (valEl) valEl.textContent = prevVal.length > 38 ? prevVal.slice(0, 36) + '…' : prevVal;
                                                    });
                                                    valEl?.parentElement?.appendChild(revertLink);
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
                                            <div style="padding:2px 14px 4px;font-size:10.5px;color:#a78bfa;">Tell me what to write, or I'll pull from your resume.</div>
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
                            _autosaveStop();
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
                            // Record this domain was filled for quick-refill chip (Feature 10)
                            try {
                                const fh = JSON.parse(localStorage.getItem('nova_domain_fills') || '{}');
                                const host = location.hostname.replace('www.', '');
                                fh[host] = { ts: Date.now(), fieldCount: filledCount };
                                localStorage.setItem('nova_domain_fills', JSON.stringify(fh));
                            } catch {}
                            // Prompt user to save this job after a successful fill
                            if (filledCount > 0) {
                                try {
                                    const jobs = jtLoad();
                                    const alreadySaved = jobs.some(j => j.url === location.href);
                                    if (!alreadySaved) {
                                        const { title, company } = extractJobInfo();
                                        setTimeout(() => {
                                            const toastWrap = appendMsg('ai', `Great work! Want to save **${title}** to your job tracker?`);
                                            const btns = document.createElement('div');
                                            btns.style.cssText = 'display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;';
                                            const saveBtn = document.createElement('button');
                                            saveBtn.textContent = '💾 Save as Applied';
                                            saveBtn.style.cssText = 'padding:5px 12px;background:#6366f1;color:white;border:none;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;';
                                            saveBtn.addEventListener('click', () => {
                                                const all = jtLoad();
                                                if (!all.some(j => j.url === location.href)) {
                                                    all.unshift({ id: Date.now(), title, company, url: location.href, date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), status: 'applied' });
                                                    jtSave(all);
                                                }
                                                btns.innerHTML = '<span style="font-size:11.5px;color:#15803d;font-weight:600;">✓ Saved to tracker as Applied</span>';
                                            });
                                            const skipBtn = document.createElement('button');
                                            skipBtn.textContent = 'Skip';
                                            skipBtn.style.cssText = 'padding:5px 12px;background:#f1f5f9;color:#374151;border:1px solid #e5e7eb;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;';
                                            skipBtn.addEventListener('click', () => btns.style.display = 'none');
                                            btns.appendChild(saveBtn);
                                            btns.appendChild(skipBtn);
                                            toastWrap?.querySelector('.nw-bubble')?.appendChild(btns);
                                        }, 800);
                                    }
                                } catch {}
                            }
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

                    _autosaveStart();
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
                    if (!pageContent) {
                        const msg = "I couldn't read the job description on this page. Make sure you're on a job posting and try again.";
                        appendMsg('ai', msg);
                        chatHistory.push({ role: 'ai', text: msg, ts: Date.now() });
                    } else {
                        const errWrap = appendMsg('ai', '⚠️ No resume found. Add your profile to get started.');
                        const btn = document.createElement('button');
                        btn.textContent = '⚙️ Open Settings';
                        btn.style.cssText = 'display:block;margin-top:8px;padding:6px 14px;background:#6366f1;color:white;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;';
                        btn.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }));
                        errWrap?.querySelector('.nw-bubble')?.appendChild(btn);
                        chatHistory.push({ role: 'ai', text: '⚠️ No resume found. Add your profile to get started.', ts: Date.now() });
                    }
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

            case 'daily_briefing': {
                removeThinking(thinkId);
                renderDailyBriefing();
                chatHistory.push({ role: 'ai', text: 'Showing daily briefing.', ts: Date.now() });
                return;
            }

            case 'wiki_search': {
                removeThinking(thinkId);
                renderWikiSearch(intent.query || '');
                chatHistory.push({ role: 'ai', text: `Searched for "${intent.query}".`, ts: Date.now() });
                return;
            }

            case 'list_clips': {
                const q = intent.query || '';
                renderClips(q);
                chatHistory.push({ role: 'ai', text: `Showing saved clips${q ? ` matching "${q}"` : ''}.`, ts: Date.now() });
                break;
            }

            case 'save_clip': {
                const sel = window.getSelection()?.toString().trim();
                if (sel && sel.length > 10) {
                    _saveClip(sel, document.title, location.href);
                    appendMsg('ai', `📎 Clipped "${sel.slice(0, 60)}${sel.length > 60 ? '…' : ''}" from this page.`);
                } else {
                    appendMsg('ai', 'Please select some text on the page first, then say "clip this".');
                }
                chatHistory.push({ role: 'ai', text: 'Clip saved.', ts: Date.now() });
                break;
            }

            case 'compare_jobs': {
                renderJobComparison();
                chatHistory.push({ role: 'ai', text: 'Opened job comparison.', ts: Date.now() });
                break;
            }

            case 'export_jobs': {
                const jobs = jtLoad();
                if (!jobs.length) {
                    appendMsg('ai', 'No jobs in tracker to export yet.');
                } else {
                    _downloadFile('nova_jobs.csv',
                        ['Title,Company,Status,Date,URL,Notes',
                         ...jobs.map(j => `"${(j.title||'').replace(/"/g,'""')}","${(j.company||'').replace(/"/g,'""')}",${j.status||''},${j.date||''},${j.url||''},"${(j.notes||'').replace(/"/g,'""')}"`)]
                        .join('\n'), 'text/csv');
                    appendMsg('ai', `✅ Exported ${jobs.length} job${jobs.length !== 1 ? 's' : ''} as CSV.`);
                    chatHistory.push({ role: 'ai', text: `Exported ${jobs.length} jobs as CSV.`, ts: Date.now() });
                }
                break;
            }

            case 'list_jobs': {
                renderJobTracker();
                const jobs = jtLoad();
                chatHistory.push({ role: 'ai', text: `Showing job tracker (${jobs.length} jobs).`, ts: Date.now() });
                break;
            }

            case 'keyword_match': {
                renderKeywordOverlay();
                chatHistory.push({ role: 'ai', text: 'Analyzed keyword match.', ts: Date.now() });
                break;
            }

            case 'profile_score': {
                chrome.runtime.sendMessage({ type: 'GET_RESUME' }, result => {
                    removeThinking(thinkId);
                    if (!result?.success || !result.data) {
                        appendMsg('ai', '⚠️ No profile found. Please add your resume in Settings first.');
                    } else {
                        renderResumeScore(result.data);
                    }
                });
                return;
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
    async function callAI(prompt, systemInstruction, extraOpts = {}) {
        return new Promise((resolve, reject) => {
            try {
                chrome.runtime.sendMessage({
                    type: 'AI_REQUEST',
                    prompt,
                    systemInstruction,
                    options: { maxTokens: 4096, temperature: 0.7, provider: activeProvider, ...extraOpts }
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
            console.log(`[Nova v${WIDGET_VERSION}] doSend: "${text}"`);

            // ── Step 1: classify intent (AI first, regex fallback on failure) ──
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
            if (chatHistory.length >= 5) _updateSummaryChip();
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

    // ── Clipboard History ─────────────────────────────────────────────────────
    const CB_KEY      = 'nova_clipboard_history';
    const CB_MAX      = 50;
    const cbPanel     = document.getElementById('nw-cb-panel');
    const cbList      = document.getElementById('nw-cb-list');
    const cbCount     = document.getElementById('nw-cb-count');
    const cbSearchEl  = document.getElementById('nw-cb-search');

    async function cbLoad() {
        const res = await NovaChatCore.sharedGet([CB_KEY]);
        return res[CB_KEY] || [];
    }
    async function cbSave(items) {
        await NovaChatCore.sharedSet({ [CB_KEY]: items });
    }

    async function cbAdd(text) {
        if (!text || text.length < 2 || text.length > 10000) return;
        let items = await cbLoad();
        items = items.filter(i => i.text !== text);
        items.unshift({ text, ts: Date.now(), url: location.hostname });
        if (items.length > CB_MAX) items = items.slice(0, CB_MAX);
        await cbSave(items);
    }

    function cbTimestamp(ts) {
        const diff = Date.now() - ts;
        if (diff < 60000) return 'just now';
        if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
        if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
        return Math.floor(diff / 86400000) + 'd ago';
    }

    async function cbRender(query) {
        cbList.innerHTML = `<div class="nw-cb-empty" style="color:#9ca3af">Loading…</div>`;
        let items = await cbLoad();
        if (query) {
            const q = query.toLowerCase();
            items = items.filter(i => i.text.toLowerCase().includes(q));
        }
        cbCount.textContent = items.length ? `${items.length}` : '';
        if (!items.length) {
            cbList.innerHTML = `<div class="nw-cb-empty"><div class="nw-cb-empty-icon">📋</div>${query ? 'No matches found.' : 'Nothing copied yet.<br>Copy any text on any page<br>and it will appear here.'}</div>`;
            return;
        }

        function cbTypeIcon(text) {
            if (/^https?:\/\//i.test(text)) return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
            if (text.length > 120) return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;
            if (/^\d[\d\s\-().+]+$/.test(text.trim())) return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
            return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>`;
        }

        cbList.innerHTML = items.map((item, i) => `
            <div class="nw-cb-item" data-idx="${i}">
                <div class="nw-cb-icon">${cbTypeIcon(item.text)}</div>
                <div class="nw-cb-body">
                    <div class="nw-cb-text">${NovaChatCore.esc(item.text)}</div>
                    <div class="nw-cb-meta">
                        <span>${cbTimestamp(item.ts)}</span>
                        ${item.url ? `<span class="nw-cb-meta-dot"></span><span>${NovaChatCore.esc(item.url)}</span>` : ''}
                    </div>
                </div>
                <button class="nw-cb-copy-btn" data-idx="${i}">Copy</button>
            </div>
        `).join('');

        cbList.querySelectorAll('.nw-cb-item').forEach((el, idx) => {
            el.addEventListener('click', async () => {
                const text = items[idx]?.text;
                if (!text) return;
                await navigator.clipboard.writeText(text).catch(() => {});
                const btn = el.querySelector('.nw-cb-copy-btn');
                if (btn) {
                    btn.textContent = '✓ Copied';
                    btn.classList.add('copied');
                    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1400);
                }
            });
        });
    }

    function openCbPanel() {
        closeAllPanels();
        cbPanel.classList.add('open');
        cbSearchEl.value = '';
        cbRender('');
        setTimeout(() => cbSearchEl.focus(), 200);
    }
    function closeCbPanel() { cbPanel.classList.remove('open'); }

    document.getElementById('nw-cb-back').addEventListener('click', closeCbPanel);
    document.getElementById('nw-menu-clipboard').addEventListener('click', () => { closeMenu(); openCbPanel(); });
    cbSearchEl.addEventListener('input', () => cbRender(cbSearchEl.value.trim()));

    // Listen for copy events on the page to record clipboard entries
    document.addEventListener('copy', () => {
        setTimeout(async () => {
            try {
                const text = await navigator.clipboard.readText();
                cbAdd(text);
            } catch { /* clipboard read requires focus/permission — silent fail */ }
        }, 50);
    }, true);

    // ── Tab Command Palette ───────────────────────────────────────────────────
    let _tabOverlay    = null;
    let _tabItems      = [];
    let _tabSelected   = 0;

    function _tabTimeAgo(ts) {
        if (!ts) return '';
        const diff = Date.now() - ts;
        if (diff < 60000) return 'just now';
        if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
        return Math.floor(diff / 3600000) + 'h ago';
    }

    function _tabRenderList(items, query) {
        const list = _tabOverlay.querySelector('.nw-tab-list');
        if (!items.length) {
            list.innerHTML = `<div style="padding:24px;text-align:center;color:#9ca3af;font-size:12px;">No tabs match "${NovaChatCore.esc(query)}"</div>`;
            return;
        }

        // Split open tabs vs history
        const open = items.filter(i => i.source === 'tab');
        const hist = items.filter(i => i.source === 'history');

        let html = '';
        if (open.length) {
            html += `<div class="nw-tab-section-label">Open Tabs</div>`;
            html += open.map((t, i) => _tabItemHtml(t, i === _tabSelected)).join('');
        }
        if (hist.length) {
            const offset = open.length;
            html += `<div class="nw-tab-section-label" style="margin-top:4px;">Recent History</div>`;
            html += hist.map((t, i) => _tabItemHtml(t, (i + offset) === _tabSelected)).join('');
        }
        list.innerHTML = html;

        // Scroll selected into view
        const sel = list.querySelector('.nw-tab-item.selected');
        if (sel) sel.scrollIntoView({ block: 'nearest' });

        // Click handlers
        list.querySelectorAll('.nw-tab-item').forEach(el => {
            el.addEventListener('click', () => _tabActivate(+el.dataset.idx));
        });
    }

    function _tabItemHtml(t, selected) {
        const favicon = t.favIconUrl
            ? `<img class="nw-tab-favicon" src="${NovaChatCore.esc(t.favIconUrl)}" onerror="this.style.display='none'">`
            : `<div class="nw-tab-favicon" style="background:#e5e7eb;border-radius:3px;"></div>`;
        return `
            <div class="nw-tab-item${selected ? ' selected' : ''}" data-idx="${t._idx}">
                ${favicon}
                <div class="nw-tab-info">
                    <div class="nw-tab-title">${NovaChatCore.esc(t.title || t.url || 'Untitled')}</div>
                    <div class="nw-tab-url">${NovaChatCore.esc((t.url || '').replace(/^https?:\/\//, ''))}</div>
                </div>
                ${t.source === 'tab' ? `<div class="nw-tab-badge">${t.active ? 'current' : 'tab'}</div>` : `<div class="nw-tab-badge" style="color:#9ca3af;background:#f3f4f6;">${_tabTimeAgo(t.lastVisitTime)}</div>`}
            </div>`;
    }

    function _tabFilter(allItems, query) {
        if (!query) return allItems;
        const q = query.toLowerCase();
        return allItems.filter(t =>
            (t.title || '').toLowerCase().includes(q) ||
            (t.url || '').toLowerCase().includes(q)
        );
    }

    function _tabActivate(idx) {
        const item = _tabItems[idx];
        if (!item) return;
        closeTabPalette();
        if (item.source === 'tab') {
            chrome.runtime.sendMessage({ type: 'SWITCH_TAB', tabId: item.id, windowId: item.windowId });
        } else {
            chrome.runtime.sendMessage({ type: 'NAVIGATE', url: item.url });
        }
    }

    function closeTabPalette() {
        if (!_tabOverlay) return;
        _tabOverlay.remove();
        _tabOverlay = null;
    }

    async function openTabPalette() {
        if (_tabOverlay) { closeTabPalette(); return; }

        // Build overlay
        const overlay = document.createElement('div');
        overlay.className = 'nw-tab-overlay';
        overlay.innerHTML = `
            <div class="nw-tab-palette">
                <div class="nw-tab-search-row">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input type="text" placeholder="Search tabs and history…" autocomplete="off" id="nw-tab-input"/>
                    <span class="nw-tab-esc">ESC</span>
                </div>
                <div class="nw-tab-list" id="nw-tab-list" style="max-height:340px;"></div>
                <div class="nw-tab-hint">
                    <span><kbd>↑↓</kbd> navigate</span>
                    <span><kbd>Enter</kbd> switch</span>
                    <span><kbd>ESC</kbd> close</span>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        _tabOverlay = overlay;
        _tabSelected = 0;

        // Close on backdrop click
        overlay.addEventListener('click', e => { if (e.target === overlay) closeTabPalette(); });

        const input = overlay.querySelector('#nw-tab-input');
        input.focus();

        // Fetch tabs + recent history from background
        chrome.runtime.sendMessage({ type: 'GET_TABS_AND_HISTORY' }, (res) => {
            const tabs = (res?.tabs || []).map((t, i) => ({ ...t, source: 'tab', _idx: i }));
            const hist = (res?.history || []).map((h, i) => ({ ...h, source: 'history', _idx: tabs.length + i }));
            _tabItems = [...tabs, ...hist];
            _tabRenderList(_tabFilter(_tabItems, ''), '');
        });

        input.addEventListener('input', () => {
            _tabSelected = 0;
            const q = input.value.trim();
            _tabRenderList(_tabFilter(_tabItems, q), q);
        });

        input.addEventListener('keydown', e => {
            const filtered = _tabFilter(_tabItems, input.value.trim());
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                _tabSelected = Math.min(_tabSelected + 1, filtered.length - 1);
                _tabRenderList(filtered, input.value.trim());
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                _tabSelected = Math.max(_tabSelected - 1, 0);
                _tabRenderList(filtered, input.value.trim());
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const item = filtered[_tabSelected];
                if (item) _tabActivate(item._idx);
            } else if (e.key === 'Escape') {
                closeTabPalette();
            }
        });
    }

    document.getElementById('nw-menu-tabs').addEventListener('click', () => { closeMenu(); openTabPalette(); });

    // Global keyboard shortcut: Ctrl+Shift+K opens tab palette
    document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.shiftKey && e.key === 'K') { e.preventDefault(); openTabPalette(); }
    }, true);

    // ── Writing Assistant ─────────────────────────────────────────────────────
    // ── Quick Search ──────────────────────────────────────────────────────────
    function _showQuickSearch(query, x, y) {
        document.getElementById('nova-qs-panel')?.remove();

        const q = query.trim().slice(0, 200);
        const enc = encodeURIComponent(q);

        const engines = [
            {
                icon: '🌐',
                bg: '#e8f0fe',
                label: 'Google',
                sub: 'Web search',
                url: `https://www.google.com/search?q=${enc}`,
            },
            {
                icon: '📖',
                bg: '#fef3c7',
                label: 'Wikipedia',
                sub: 'Encyclopedia',
                url: `https://en.wikipedia.org/w/index.php?search=${enc}`,
            },
            {
                icon: '▶',
                bg: '#fee2e2',
                label: 'YouTube',
                sub: 'Videos',
                url: `https://www.youtube.com/results?search_query=${enc}`,
            },
            {
                icon: '📚',
                bg: '#ede9fe',
                label: 'Dictionary',
                sub: 'Definition',
                url: `https://www.merriam-webster.com/dictionary/${enc}`,
            },
            {
                icon: '🛒',
                bg: '#d1fae5',
                label: 'Amazon',
                sub: 'Shop',
                url: `https://www.amazon.com/s?k=${enc}`,
            },
        ];

        const panel = document.createElement('div');
        panel.id = 'nova-qs-panel';

        const left = Math.min(x, window.innerWidth - 316);
        const top  = Math.max(y - 10, 8);
        panel.style.cssText = `left:${left}px;top:${top}px;`;

        const short = q.length > 40 ? q.slice(0, 40) + '…' : q;
        panel.innerHTML = `
            <div id="nova-qs-header">
                <span id="nova-qs-query">"${NovaChatCore.esc(short)}"</span>
                <button id="nova-qs-close">✕</button>
            </div>
            ${engines.map(e => `
                <a class="nova-qs-item" href="${e.url}" target="_blank" rel="noopener" data-url="${e.url}">
                    <div class="nova-qs-icon" style="background:${e.bg}">${e.icon}</div>
                    <div>
                        <div class="nova-qs-label">${e.label}</div>
                        <div class="nova-qs-sub">${e.sub}</div>
                    </div>
                </a>
            `).join('')}`;

        document.body.appendChild(panel);

        panel.querySelector('#nova-qs-close').addEventListener('click', () => panel.remove());

        // Open in new tab and close panel on item click
        panel.querySelectorAll('.nova-qs-item').forEach(item => {
            item.addEventListener('click', e => {
                e.preventDefault();
                window.open(item.dataset.url, '_blank', 'noopener');
                panel.remove();
            });
        });

        setTimeout(() => {
            const hide = (ev) => {
                if (!panel.contains(ev.target)) {
                    panel.remove();
                    document.removeEventListener('mousedown', hide);
                }
            };
            document.addEventListener('mousedown', hide);
        }, 0);
    }

    // ── Link Preview on Hover ─────────────────────────────────────────────────
    let _lpTimer = null;
    let _lpCard  = null;
    let _lpCache = {};

    function _lpShow(url, x, y) {
        _lpHide();
        const card = document.createElement('div');
        card.id = 'nova-link-preview';
        _lpCard = card;

        // Position: prefer above, fall back below
        const top = y - 20 > 160 ? y - 155 : y + 20;
        const left = Math.min(Math.max(x - 140, 8), window.innerWidth - 296);
        card.style.cssText = `left:${left}px;top:${top}px;`;
        card.innerHTML = `<div class="nova-lp-loading">Loading preview…</div>`;
        document.body.appendChild(card);

        if (_lpCache[url]) { _lpPopulate(card, _lpCache[url]); return; }

        fetch(url, { method: 'GET', credentials: 'omit', signal: AbortSignal.timeout(4000) })
            .then(r => r.text())
            .then(html => {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const getMeta = (name) =>
                    doc.querySelector(`meta[property="${name}"]`)?.content ||
                    doc.querySelector(`meta[name="${name}"]`)?.content || '';
                const data = {
                    title:   getMeta('og:title') || doc.title || url,
                    desc:    getMeta('og:description') || getMeta('description') || '',
                    favicon: `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`,
                    domain:  new URL(url).hostname.replace('www.', ''),
                };
                _lpCache[url] = data;
                if (_lpCard === card) _lpPopulate(card, data);
            })
            .catch(() => { if (_lpCard === card) card.remove(); });
    }

    function _lpPopulate(card, data) {
        card.innerHTML = `
            <div class="nova-lp-domain">
                <img class="nova-lp-favicon" src="${NovaChatCore.esc(data.favicon)}" onerror="this.style.display='none'">
                ${NovaChatCore.esc(data.domain)}
            </div>
            <div class="nova-lp-title">${NovaChatCore.esc(data.title)}</div>
            ${data.desc ? `<div class="nova-lp-desc">${NovaChatCore.esc(data.desc)}</div>` : ''}
        `;
    }

    function _lpHide() {
        _lpCard?.remove(); _lpCard = null;
    }

    document.addEventListener('mouseover', e => {
        const link = e.target.closest('a[href]');
        if (!link || link.closest(`#${WIDGET_ID}`)) return;
        const href = link.href;
        if (!href || !href.startsWith('http')) return;
        clearTimeout(_lpTimer);
        _lpTimer = setTimeout(() => _lpShow(href, e.clientX, e.clientY), 600);
    }, true);

    document.addEventListener('mouseout', e => {
        const link = e.target.closest('a[href]');
        if (!link) return;
        clearTimeout(_lpTimer);
        _lpHide();
    }, true);

    // ── Sticky Notes ──────────────────────────────────────────────────────────
    const SN_KEY = 'nova_sticky_notes';

    async function _snLoad() { return NovaChatCore.snSharedLoad(); }
    async function _snSave(d) { return NovaChatCore.snSharedSave(d); }
    function _snUrlKey() { return location.href.split('#')[0].split('?')[0]; }

    let _snEl = null;

    // Tag colour palette (cycles by index)
    const SN_TAG_COLORS = [
        { bg: '#eef2ff', color: '#3730a3', border: '#c7d2fe' },
        { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' },
        { bg: '#dcfce7', color: '#166534', border: '#86efac' },
        { bg: '#fce7f3', color: '#9d174d', border: '#f9a8d4' },
        { bg: '#ede9fe', color: '#5b21b6', border: '#c4b5fd' },
        { bg: '#ffedd5', color: '#9a3412', border: '#fdba74' },
    ];
    function _snTagColor(tag, allTags) {
        const idx = allTags.indexOf(tag) % SN_TAG_COLORS.length;
        return SN_TAG_COLORS[Math.abs(idx)];
    }

    function _snMarkdown(text) {
        return text
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
            .replace(/^# (.+)$/gm,   '<h1>$1</h1>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g,    '<em>$1</em>')
            .replace(/`(.+?)`/g,      '<code>$1</code>')
            .replace(/\[(.+?)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
            .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
            .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
            .replace(/\n{2,}/g, '</p><p>')
            .replace(/\n/g, '<br>')
            .replace(/^(?!<[hlu]|<\/p|<p)(.+)/, '<p>$1</p>');
    }

    async function _snOpen(prefillText = '') {
        if (_snEl && !prefillText) { _snEl.remove(); _snEl = null; return; }
        if (_snEl) _snEl.remove();

        const key   = _snUrlKey();
        const notes = await _snLoad();
        const saved = notes[key] || { text: '', tags: [], x: null, y: null };

        // If prefilling, append selection to existing text
        const initialText = prefillText
            ? (saved.text ? saved.text + '\n\n' + prefillText : prefillText)
            : saved.text;

        const el = document.createElement('div');
        el.id = 'nova-sticky-note';
        const startX = saved.x ?? (window.innerWidth - 260);
        const startY = saved.y ?? 80;
        el.style.cssText = `left:${startX}px;top:${startY}px;`;

        el.innerHTML = `
            <div class="nova-sn-header" id="nova-sn-drag">
                <div class="nova-sn-title">
                    <div class="nova-sn-title-dot"></div>
                    ${NovaChatCore.esc(location.hostname.replace('www.',''))}
                </div>
                <div class="nova-sn-actions">
                    <button class="nova-sn-btn" id="nova-sn-preview-btn" title="Preview markdown">👁</button>
                    <button class="nova-sn-btn" id="nova-sn-clear" title="Clear note">🗑</button>
                    <button class="nova-sn-btn" id="nova-sn-close" title="Close">✕</button>
                </div>
            </div>
            <textarea class="nova-sn-textarea" id="nova-sn-text" placeholder="Write a note…&#10;Supports **bold**, *italic*, # heading, - list" spellcheck="false">${NovaChatCore.esc(initialText)}</textarea>
            <div class="nova-sn-preview" id="nova-sn-preview" style="display:none"></div>
            <div class="nova-sn-tags-row" id="nova-sn-tags-row"></div>
            <div class="nova-sn-footer">
                <span class="nova-sn-status">
                    <span class="nova-sn-status-dot" id="nova-sn-status-dot"></span>
                    <span id="nova-sn-status">${prefillText ? 'Text added ✓' : 'Auto-saved'}</span>
                </span>
                <span style="opacity:0.6">${new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
            </div>`;
        document.body.appendChild(el);
        _snEl = el;

        // ── Tags ─────────────────────────────────────────────────────────────
        let _tags = [...(saved.tags || [])];
        const tagsRow = el.querySelector('#nova-sn-tags-row');

        function _snRenderTags() {
            tagsRow.innerHTML = '';
            _tags.forEach((tag, i) => {
                const c = SN_TAG_COLORS[i % SN_TAG_COLORS.length];
                const chip = document.createElement('span');
                chip.className = 'nova-sn-tag-chip';
                chip.style.cssText = `background:${c.bg};color:${c.color};border:1px solid ${c.border}`;
                chip.innerHTML = `#${NovaChatCore.esc(tag)} <button class="nova-sn-tag-chip-del" data-tag="${NovaChatCore.esc(tag)}">✕</button>`;
                chip.querySelector('.nova-sn-tag-chip-del').addEventListener('click', async () => {
                    _tags = _tags.filter(t => t !== tag);
                    _snRenderTags();
                    await _snPersist();
                    renderChips();
                });
                tagsRow.appendChild(chip);
            });
            const input = document.createElement('input');
            input.className = 'nova-sn-tag-input';
            input.placeholder = _tags.length ? '+tag' : '#add tag…';
            input.addEventListener('keydown', async e => {
                if ((e.key === 'Enter' || e.key === ' ' || e.key === ',') && input.value.trim()) {
                    e.preventDefault();
                    const newTag = input.value.replace(/^#/, '').replace(/[,\s]/g, '').trim().slice(0, 20);
                    if (newTag && !_tags.includes(newTag)) { _tags.push(newTag); }
                    _snRenderTags();
                    await _snPersist();
                    renderChips();
                } else if (e.key === 'Backspace' && !input.value && _tags.length) {
                    _tags.pop();
                    _snRenderTags();
                    await _snPersist();
                }
            });
            tagsRow.appendChild(input);
        }
        _snRenderTags();

        // ── Textarea & auto-save ──────────────────────────────────────────────
        const textarea = el.querySelector('#nova-sn-text');
        const preview  = el.querySelector('#nova-sn-preview');
        let _preview = false;
        let _snSaveTimer;

        async function _snPersist() {
            const d = await _snLoad();
            d[key] = {
                text: textarea.value,
                tags: _tags,
                ts:   d[key]?.ts || Date.now(),
                x: parseInt(el.style.left),
                y: parseInt(el.style.top),
            };
            await _snSave(d);
        }

        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        textarea.addEventListener('input', () => {
            const statusEl = el.querySelector('#nova-sn-status');
            const dotEl    = el.querySelector('#nova-sn-status-dot');
            if (statusEl) statusEl.textContent = 'Saving…';
            if (dotEl) dotEl.style.background = '#a5b4fc';
            clearTimeout(_snSaveTimer);
            _snSaveTimer = setTimeout(async () => {
                await _snPersist();
                if (statusEl) statusEl.textContent = 'Saved ✓';
                if (dotEl) dotEl.style.background = '#10b981';
                renderChips();
            }, 600);
        });

        // ── Markdown preview toggle ───────────────────────────────────────────
        el.querySelector('#nova-sn-preview-btn').addEventListener('click', () => {
            _preview = !_preview;
            if (_preview) {
                preview.innerHTML = _snMarkdown(textarea.value || '*Nothing to preview yet*');
                preview.style.display = 'block';
                textarea.style.display = 'none';
                el.querySelector('#nova-sn-preview-btn').title = 'Back to edit';
                el.querySelector('#nova-sn-preview-btn').textContent = '✏️';
            } else {
                preview.style.display = 'none';
                textarea.style.display = 'block';
                el.querySelector('#nova-sn-preview-btn').title = 'Preview markdown';
                el.querySelector('#nova-sn-preview-btn').textContent = '👁';
                textarea.focus();
            }
        });

        el.querySelector('#nova-sn-close').addEventListener('click', () => {
            el.remove(); _snEl = null; renderChips();
        });
        el.querySelector('#nova-sn-clear').addEventListener('click', async () => {
            textarea.value = ''; _tags = [];
            _snRenderTags();
            const d = await _snLoad();
            delete d[key];
            await _snSave(d);
            el.querySelector('#nova-sn-status').textContent = 'Cleared';
            renderChips();
        });

        // ── Drag ─────────────────────────────────────────────────────────────
        const dragHandle = el.querySelector('#nova-sn-drag');
        let _dx, _dy, _dragging = false;
        dragHandle.addEventListener('mousedown', e => {
            _dragging = true; _dx = e.clientX - el.offsetLeft; _dy = e.clientY - el.offsetTop;
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', onDrop, { once: true });
        });
        function onDrag(e) {
            if (!_dragging) return;
            el.style.left = Math.max(0, Math.min(e.clientX - _dx, window.innerWidth  - 250)) + 'px';
            el.style.top  = Math.max(0, Math.min(e.clientY - _dy, window.innerHeight - 100)) + 'px';
        }
        async function onDrop() {
            _dragging = false;
            document.removeEventListener('mousemove', onDrag);
            await _snPersist();
        }
    }

    // Sticky note chip is rendered in renderChips() above — no separate nudge needed

    document.getElementById('nw-menu-sticky').addEventListener('click', () => { closeMenu(); openSnPanel(); });

    // ── Nova Notepad (integrated panel) ──────────────────────────────────────
    const NP_STORAGE_KEY = 'nova_notepad';
    let _npSaveTimer;
    let _npActiveId = null;
    let _npFontSize = 'md';

    async function _npLoadAll() {
        const res = await NovaChatCore.sharedGet([NP_STORAGE_KEY]);
        return res[NP_STORAGE_KEY] || {};
    }
    async function _npSaveAll(notes) {
        await NovaChatCore.sharedSet({ [NP_STORAGE_KEY]: notes });
    }
    function _npGenId() { return 'np_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }
    function _npWc(text) { const w = text.trim() ? text.trim().split(/\s+/).length : 0; return `${w}w · ${text.length}c`; }
    function _npColor(note, idx) {
        const NP_COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ec4899','#8b5cf6','#ef4444','#14b8a6'];
        return note.color || NP_COLORS[idx % NP_COLORS.length];
    }

    const npPanel    = document.getElementById('nw-np-panel');
    const npList     = document.getElementById('nw-np-list');
    const npEditor   = document.getElementById('nw-np-editor');
    const npBadgeEl  = document.getElementById('nw-np-panel-badge');
    const npSearch   = document.getElementById('nw-np-search');

    let _npNotes = {};

    function _npSortedIds() {
        return Object.keys(_npNotes).sort((a, b) => {
            if (_npNotes[a].pinned && !_npNotes[b].pinned) return -1;
            if (!_npNotes[a].pinned && _npNotes[b].pinned) return 1;
            return (_npNotes[b].ts || 0) - (_npNotes[a].ts || 0);
        });
    }

    function _npBadge() {
        const c = Object.keys(_npNotes).length;
        if (npBadgeEl) npBadgeEl.textContent = `${c} note${c !== 1 ? 's' : ''}`;
    }

    function _npRenderList(query = '') {
        const ids = _npSortedIds();
        const q = query.toLowerCase().trim();
        const filtered = ids.filter(id => {
            if (!q) return true;
            const n = _npNotes[id];
            return (n.title || '').toLowerCase().includes(q) || (n.content || n.text || '').toLowerCase().includes(q);
        });
        if (!filtered.length) {
            npList.innerHTML = `<div class="nw-np-empty-list">${q ? 'No notes match.' : 'No notes yet.\nClick "+ New note".'}</div>`;
            return;
        }
        npList.innerHTML = filtered.map((id, i) => {
            const n = _npNotes[id];
            const color = _npColor(n, ids.indexOf(id));
            const body = (n.content || n.text || '').replace(/\n/g, ' ').trim().slice(0, 45) || 'Empty note';
            return `<div class="nw-np-item${id === _npActiveId ? ' active' : ''}" data-id="${id}" style="${id === _npActiveId ? `border-left-color:${color}` : ''}">
                <div class="nw-np-item-header">
                    <span class="nw-np-item-dot" style="background:${color}"></span>
                    <span class="nw-np-item-title">${NovaChatCore.esc(n.title || 'Untitled')}</span>
                    <button class="nw-np-item-pin${n.pinned ? ' pinned' : ''}" data-id="${id}">${n.pinned ? '📌' : '📍'}</button>
                </div>
                <div class="nw-np-item-preview">${NovaChatCore.esc(body)}</div>
            </div>`;
        }).join('');

        npList.querySelectorAll('.nw-np-item').forEach(item => {
            item.addEventListener('click', e => {
                if (e.target.closest('.nw-np-item-pin')) return;
                _npActiveId = item.dataset.id;
                _npRenderList(npSearch.value);
                _npRenderEditor();
            });
        });
        npList.querySelectorAll('.nw-np-item-pin').forEach(btn => {
            btn.addEventListener('click', async e => {
                e.stopPropagation();
                const id = btn.dataset.id;
                _npNotes[id].pinned = !_npNotes[id].pinned;
                await _npSaveAll(_npNotes);
                _npRenderList(npSearch.value);
            });
        });
    }

    function _npRenderEditor() {
        if (!_npActiveId || !_npNotes[_npActiveId]) {
            npEditor.innerHTML = `
                <div class="nw-np-empty-editor">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <div>Select a note or create a new one</div>
                </div>`;
            return;
        }
        const note  = _npNotes[_npActiveId];
        const ids   = _npSortedIds();
        const color = _npColor(note, ids.indexOf(_npActiveId));
        const fsClass = _npFontSize === 'sm' ? 'font-sm' : _npFontSize === 'lg' ? 'font-lg' : '';
        const body  = note.content || note.text || '';

        npEditor.innerHTML = `
            <div class="nw-np-color-accent" style="background:${color}"></div>
            <div class="nw-np-title-wrap">
                <input class="nw-np-title-input" id="nw-np-title" value="${NovaChatCore.esc(note.title || '')}" placeholder="Note title…" spellcheck="false" autocomplete="off"/>
            </div>
            <div class="nw-np-editor-toolbar">
                <button class="nw-np-tb-btn" id="nw-np-copy">📋 Copy</button>
                <div class="nw-np-tb-sep"></div>
                <button class="nw-np-tb-btn${_npFontSize==='sm'?' active':''}" id="nw-np-fs-sm">A−</button>
                <button class="nw-np-tb-btn${_npFontSize==='md'?' active':''}" id="nw-np-fs-md">A</button>
                <button class="nw-np-tb-btn${_npFontSize==='lg'?' active':''}" id="nw-np-fs-lg">A+</button>
                <div class="nw-np-tb-sep"></div>
                <button class="nw-np-tb-btn danger" id="nw-np-delete">🗑 Delete</button>
                <span class="nw-np-wc" id="nw-np-wc">${_npWc(body)}</span>
            </div>
            <textarea class="nw-np-textarea ${fsClass}" id="nw-np-text" placeholder="Start writing…" spellcheck="true" autocomplete="off">${NovaChatCore.esc(body)}</textarea>
            <div class="nw-np-editor-footer">
                <span class="nw-np-status">
                    <span class="nw-np-status-dot" id="nw-np-dot"></span>
                    <span id="nw-np-status">Auto-saved</span>
                </span>
                <span id="nw-np-wc2">${_npWc(body)}</span>
            </div>`;

        const titleInput = npEditor.querySelector('#nw-np-title');
        const textarea   = npEditor.querySelector('#nw-np-text');
        const statusEl   = npEditor.querySelector('#nw-np-status');
        const dotEl      = npEditor.querySelector('#nw-np-dot');
        const wcEl       = npEditor.querySelector('#nw-np-wc');
        const wc2El      = npEditor.querySelector('#nw-np-wc2');

        textarea.focus();

        async function _save() {
            if (!_npNotes[_npActiveId]) return;
            _npNotes[_npActiveId].title   = titleInput.value.trim() || 'Untitled';
            _npNotes[_npActiveId].content = textarea.value;
            _npNotes[_npActiveId].text    = textarea.value;
            _npNotes[_npActiveId].ts      = Date.now();
            await _npSaveAll(_npNotes);
            statusEl.textContent = 'Saved ✓';
            dotEl.style.background = '#10b981';
            _npBadge();
            _npRenderList(npSearch.value);
        }

        function _onInput() {
            const wc = _npWc(textarea.value);
            if (wcEl) wcEl.textContent = wc;
            if (wc2El) wc2El.textContent = wc;
            statusEl.textContent = 'Saving…';
            dotEl.style.background = '#a5b4fc';
            clearTimeout(_npSaveTimer);
            _npSaveTimer = setTimeout(_save, 600);
        }

        textarea.addEventListener('input', _onInput);
        titleInput.addEventListener('input', () => { clearTimeout(_npSaveTimer); _npSaveTimer = setTimeout(_save, 600); });

        ['sm','md','lg'].forEach(sz => {
            npEditor.querySelector(`#nw-np-fs-${sz}`).addEventListener('click', () => {
                _npFontSize = sz; _npRenderEditor();
                npEditor.querySelector('#nw-np-text')?.focus();
            });
        });

        npEditor.querySelector('#nw-np-copy').addEventListener('click', () => {
            const full = (titleInput.value.trim() ? titleInput.value.trim() + '\n\n' : '') + textarea.value;
            navigator.clipboard.writeText(full).then(() => {
                const btn = npEditor.querySelector('#nw-np-copy');
                btn.textContent = '✓ Copied';
                setTimeout(() => { btn.textContent = '📋 Copy'; }, 1500);
            });
        });

        npEditor.querySelector('#nw-np-delete').addEventListener('click', async () => {
            if (!confirm(`Delete "${_npNotes[_npActiveId]?.title || 'Untitled'}"?`)) return;
            const delId = _npActiveId;
            delete _npNotes[delId];
            const remaining = _npSortedIds();
            _npActiveId = remaining.length ? remaining[0] : null;
            await _npSaveAll(_npNotes);
            _npBadge();
            _npRenderList(npSearch.value);
            _npRenderEditor();
        });
    }

    async function _npOpenPanel() {
        closeAllPanels();
        npPanel.classList.add('open');
        _npNotes = await _npLoadAll();
        const ids = _npSortedIds();
        if (!_npActiveId || !_npNotes[_npActiveId]) {
            _npActiveId = ids.length ? ids[0] : null;
        }
        _npBadge();
        _npRenderList();
        _npRenderEditor();
    }

    document.getElementById('nw-np-panel-back').addEventListener('click', () => npPanel.classList.remove('open'));
    npSearch.addEventListener('input', e => _npRenderList(e.target.value));
    document.getElementById('nw-np-panel-new').addEventListener('click', async () => {
        const id = _npGenId();
        _npNotes[id] = { title: '', content: '', text: '', ts: Date.now(), pinned: false };
        _npActiveId = id;
        await _npSaveAll(_npNotes);
        _npBadge();
        _npRenderList();
        _npRenderEditor();
        npEditor.querySelector('#nw-np-title')?.focus();
    });

    document.getElementById('nw-menu-scratch').addEventListener('click', () => { closeMenu(); closeAllPanels(); _npOpenPanel(); });

    document.addEventListener('keydown', e => {
        if (e.altKey && e.key === 's' && !e.target.matches('input,textarea,[contenteditable]')) {
            e.preventDefault();
            if (npPanel.classList.contains('open')) npPanel.classList.remove('open');
            else _npOpenPanel();
        }
    });

    // ── All Notes panel ───────────────────────────────────────────────────────
    const snPanel      = document.getElementById('nw-sn-panel');
    const snPanelList  = document.getElementById('nw-sn-list');
    const snPanelCount = document.getElementById('nw-sn-panel-count');

    function _snTimestamp(ts) {
        if (!ts) return '';
        const diff = Date.now() - ts;
        if (diff < 60000)    return 'just now';
        if (diff < 3600000)  return Math.floor(diff / 60000) + 'm ago';
        if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
        return new Date(ts).toLocaleDateString();
    }

    let _snPanelData   = {};   // full dataset, loaded once per open
    let _snActiveTag   = null; // currently selected tag filter
    let _snSearchQuery = '';

    async function _snRenderPanel() {
        snPanelList.innerHTML = `<div class="nw-sn-empty" style="color:#9ca3af">Loading…</div>`;
        _snPanelData = await _snLoad();

        // Collect all tags across all notes
        const allTags = [...new Set(
            Object.values(_snPanelData).flatMap(n => n?.tags || [])
        )];

        // Render tag filter pills
        const tagFilters = document.getElementById('nw-sn-tag-filters');
        if (tagFilters) {
            tagFilters.style.display = allTags.length ? '' : 'none';
            tagFilters.innerHTML = allTags.map((tag, i) => {
                const c = SN_TAG_COLORS[i % SN_TAG_COLORS.length];
                const active = _snActiveTag === tag;
                return `<button class="nw-sn-tag-pill${active ? ' active' : ''}" data-tag="${NovaChatCore.esc(tag)}"
                    style="background:${c.bg};color:${c.color};border-color:${active ? c.color : 'transparent'}">#${NovaChatCore.esc(tag)}</button>`;
            }).join('');
            tagFilters.querySelectorAll('.nw-sn-tag-pill').forEach(pill => {
                pill.addEventListener('click', () => {
                    _snActiveTag = _snActiveTag === pill.dataset.tag ? null : pill.dataset.tag;
                    _snDrawList();
                    // re-render pills to update active state
                    _snRenderPanel();
                });
            });
        }

        _snDrawList();
    }

    function _snDrawList() {
        const q = _snSearchQuery.toLowerCase();
        const entries = Object.entries(_snPanelData)
            .filter(([, v]) => v?.text)
            .filter(([url, note]) => {
                if (_snActiveTag && !(note.tags || []).includes(_snActiveTag)) return false;
                if (q) return note.text.toLowerCase().includes(q) || url.toLowerCase().includes(q)
                    || (note.tags || []).some(t => t.toLowerCase().includes(q));
                return true;
            })
            .sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));

        snPanelCount.textContent = entries.length ? `${entries.length}` : '';

        if (!entries.length) {
            snPanelList.innerHTML = `<div class="nw-sn-empty"><div class="nw-sn-empty-icon">📝</div>${
                q || _snActiveTag ? 'No notes match your filter.' : 'No sticky notes yet.<br>Open any page and add a note<br>from the menu.'
            }</div>`;
            return;
        }

        // Collect all tags for color lookup
        const allTags = [...new Set(Object.values(_snPanelData).flatMap(n => n?.tags || []))];

        snPanelList.innerHTML = entries.map(([url, note]) => {
            const display = url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 55);
            const preview = note.text.length > 140 ? note.text.slice(0, 140) + '…' : note.text;
            const tagsHtml = (note.tags || []).map(tag => {
                const c = _snTagColor(tag, allTags);
                return `<span class="nw-sn-card-tag" style="background:${c.bg};color:${c.color};border:1px solid ${c.border}">#${NovaChatCore.esc(tag)}</span>`;
            }).join('');
            return `
                <div class="nw-sn-card" data-url="${NovaChatCore.esc(url)}">
                    <div class="nw-sn-card-url" title="${NovaChatCore.esc(url)}"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> ${NovaChatCore.esc(display)}</div>
                    ${tagsHtml ? `<div class="nw-sn-card-tags">${tagsHtml}</div>` : ''}
                    <div class="nw-sn-card-text">${NovaChatCore.esc(preview)}</div>
                    <div class="nw-sn-card-footer">
                        <span class="nw-sn-card-ts">${_snTimestamp(note.ts)}</span>
                        <div class="nw-sn-card-actions">
                            <button class="nw-sn-card-btn open" data-url="${NovaChatCore.esc(url)}">Open page</button>
                            <button class="nw-sn-card-btn del"  data-url="${NovaChatCore.esc(url)}">Delete</button>
                        </div>
                    </div>
                </div>`;
        }).join('');

        snPanelList.querySelectorAll('.nw-sn-card-btn.open').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                chrome.runtime.sendMessage({ type: 'NAVIGATE', url: btn.dataset.url });
            });
        });

        snPanelList.querySelectorAll('.nw-sn-card-btn.del').forEach(btn => {
            btn.addEventListener('click', async e => {
                e.stopPropagation();
                const d = await _snLoad();
                delete d[btn.dataset.url];
                await _snSave(d);
                delete _snPanelData[btn.dataset.url];
                renderChips();
                _snRenderPanel();
            });
        });

        snPanelList.querySelectorAll('.nw-sn-card').forEach(card => {
            card.addEventListener('click', () => {
                chrome.runtime.sendMessage({ type: 'NAVIGATE', url: card.dataset.url });
            });
        });
    }

    function openSnPanel() {
        _snActiveTag   = null;
        _snSearchQuery = '';
        const searchEl = document.getElementById('nw-sn-search');
        if (searchEl) searchEl.value = '';
        closeAllPanels();
        snPanel.classList.add('open');
        _snRenderPanel();
    }
    function closeSnPanel() { snPanel.classList.remove('open'); }

    document.getElementById('nw-sn-panel-back').addEventListener('click', closeSnPanel);

    // Wire search input
    document.getElementById('nw-sn-search')?.addEventListener('input', e => {
        _snSearchQuery = e.target.value.trim();
        _snDrawList();
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
