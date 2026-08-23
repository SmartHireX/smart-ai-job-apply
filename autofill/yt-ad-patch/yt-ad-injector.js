/**
 * Content script (isolated world, document_start) — injects yt-ad-patch.js
 * into the PAGE context so it can intercept YouTube's own fetch/XHR/player calls
 * before any YouTube script has a chance to read ad data.
 *
 * Always injects on YouTube — the patch script itself checks nova_adblock
 * after localStorage is available, so pages load normally when ad block is off.
 */
(function () {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('autofill/yt-ad-patch/yt-ad-patch.js');
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
})();
