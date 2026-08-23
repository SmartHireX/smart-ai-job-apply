/**
 * Nova YT Ad Patch — runs in PAGE context (injected via script tag at document_start).
 * Patches fetch + XHR + ytInitialPlayerResponse so YouTube's player never receives
 * ad placement data — ads are stripped from the response before the player reads them.
 *
 * Gated on localStorage nova_adblock so it's a no-op when the user hasn't enabled it.
 */
(function () {
    'use strict';

    // Keys in YouTube's player JSON that control ad insertion
    const AD_KEYS = [
        'adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams',
        'adParams', 'adBreakServiceUrl', 'adSafetyReason',
        'adTimeOffset', 'adRenderer', 'adBreakParams',
    ];

    function isEnabled() {
        try { return !!localStorage.getItem('nova_adblock'); } catch { return false; }
    }

    // Recursively strip all ad keys from a player response object
    function stripAds(obj, depth) {
        if (!obj || typeof obj !== 'object' || depth > 8) return obj;
        for (const key of AD_KEYS) {
            if (key in obj) {
                obj[key] = Array.isArray(obj[key]) ? [] : undefined;
                delete obj[key];
            }
        }
        for (const val of Object.values(obj)) {
            if (val && typeof val === 'object') stripAds(val, depth + 1);
        }
        return obj;
    }

    // Only patch player-related URLs (avoid touching unrelated requests)
    function isPlayerUrl(url) {
        return url && (
            url.includes('/youtubei/') ||
            url.includes('get_video_info') ||
            url.includes('/player') ||
            url.includes('watch?') ||
            url.includes('next?')
        );
    }

    function tryStrip(text) {
        try {
            const obj = JSON.parse(text);
            stripAds(obj, 0);
            return JSON.stringify(obj);
        } catch {
            return text;
        }
    }

    // ── Intercept fetch ───────────────────────────────────────────────────────
    const _origFetch = window.fetch;
    window.fetch = async function (...args) {
        const res = await _origFetch.apply(this, args);
        if (!isEnabled()) return res;
        const url = (typeof args[0] === 'string' ? args[0] : args[0]?.url) || '';
        if (!isPlayerUrl(url)) return res;
        const text = await res.clone().text();
        const patched = tryStrip(text);
        return new Response(patched, {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
        });
    };

    // ── Intercept XMLHttpRequest ──────────────────────────────────────────────
    const _origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._novaUrl = typeof url === 'string' ? url : '';
        return _origOpen.call(this, method, url, ...rest);
    };

    const _origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (...args) {
        if (isEnabled() && isPlayerUrl(this._novaUrl)) {
            this.addEventListener('load', function () {
                if (!isEnabled()) return;
                try {
                    const desc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText');
                    const raw = desc?.get ? desc.get.call(this) : this.responseText;
                    const patched = tryStrip(raw);
                    Object.defineProperty(this, 'responseText', {
                        value: patched, configurable: true, writable: true
                    });
                } catch { /* best-effort */ }
            }, { once: true });
        }
        return _origSend.apply(this, args);
    };

    // ── Intercept ytInitialPlayerResponse (set inline before any script runs) ─
    // This catches the initial page load ad data — the most important intercept.
    let _ytIPR;
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
        get: () => _ytIPR,
        set: (val) => {
            _ytIPR = isEnabled() ? stripAds(val, 0) : val;
        },
        configurable: true,
    });

    // ── Intercept ytInitialData (homepage / search ad slots) ──────────────────
    let _ytID;
    Object.defineProperty(window, 'ytInitialData', {
        get: () => _ytID,
        set: (val) => {
            if (isEnabled()) stripAds(val, 0);
            _ytID = val;
        },
        configurable: true,
    });
})();
