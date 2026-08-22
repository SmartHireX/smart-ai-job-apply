/**
 * Background Service Worker for Nova Apply Extension
 * 
 * Handles extension lifecycle events and can proxy AI requests if needed.
 */

// Import utility modules
importScripts('../shared/security/StorageVault.js', '../shared/security/EncryptionService.js', '../shared/utils/ai-client.js', '../shared/utils/resume-manager.js');


// console.log('Nova Apply background service worker started');

// Script injection order for lazy loading
const CONTENT_SCRIPTS = [
    // THE BRAIN (Visual Label Extraction) - MUST BE FIRST
    'autofill/services/extraction/form-detector.js',

    // Shared Utils & Security
    'shared/security/StorageVault.js',
    'shared/security/EncryptionService.js',
    'shared/utils/ai-client.js',
    'shared/utils/resume-manager.js',
    'shared/utils/form-extractor.js',
    'shared/utils/form-analyzer.js',
    'autofill/utils/field-utils.js',
    'autofill/utils/key-generator.js',

    // Base Classes & Infrastructure
    'autofill/handlers/handler.js',

    // Shared State
    'shared/state/state-manager.js',
    'shared/state/action-queue.js',

    // Inference Support
    'autofill/domains/inference/feature-extractor.js',
    'autofill/domains/inference/FieldTypes.js',
    'autofill/domains/inference/HeuristicEngine.js',
    'autofill/domains/inference/OptimizedMathKernel.js',
    'autofill/domains/inference/neural-classifier-v8.js',
    'autofill/domains/inference/HybridClassifier.js',
    'autofill/domains/inference/execution-engine.js',
    'autofill/domains/inference/CopilotClient.js',

    // Core Features
    'autofill/domains/memory/GlobalMemory.js',
    'autofill/features/undo-manager.js',
    'autofill/features/self-healing.js',
    'autofill/features/ai-field-regeneration.js',
    'autofill/features/form-observer.js',

    // Infrastructure
    'common/infrastructure/config.js',
    'common/infrastructure/lifecycle.js',

    // Remaining Logic & Services
    'autofill/services/extraction/section-detector.js',
    'autofill/services/extraction/sibling-cluster.js',
    'autofill/domains/heuristics/InteractionLog.js',
    'autofill/domains/heuristics/RuleEngine.js',
    'autofill/domains/profile/EntityStore.js',
    'autofill/services/indexing/field-indexing-service.js',
    'autofill/domains/model/FieldRoutingPatterns.js',

    // Enterprise Core (Phase 1-4)
    'autofill/core/ScanState.js',
    'autofill/core/FieldCandidates.js',
    'autofill/core/FillabilityPolicy.js',
    'autofill/core/ContextFeatureExtractor.js',
    'autofill/core/AutofillScanner.js',

    'autofill/core/PipelineOrchestrator.js',
    'autofill/domains/profile/CompositeFieldManager.js',
    'autofill/services/ai/AIBatchProcessor.js',
    'autofill/domains/inference/prefetch-engine.js',

    // UI
    // UI
    'autofill/ui/animations/form-visuals.js',
    'autofill/ui/sidebar/drag-resize.js',
    'autofill/ui/sidebar/widget-overlay.js',
    'autofill/ui/sidebar/sidebar-components.js',
    'autofill/ui/premium-inputs/premium-input-renderer.js',

    // Workflows & Handlers
    'autofill/workflows/classification-workflow.js',
    'autofill/workflows/instant-fill-workflow.js',
    'autofill/workflows/ai-fill-workflow.js',

    // Infrastructure (LOADED LATE)
    'common/infrastructure/config.js',
    'common/infrastructure/lifecycle.js',

    'autofill/core/form-processor.js',
    'autofill/domains/profile/SectionController.js',
    'autofill/handlers/autofill-message-handler.js',
    'autofill/handlers/undo-handler.js',
    'common/messaging/message-router.js',
    'autofill/core/autofill-orchestrator.js'
];

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    // Inject scripts for lazy loading
    if (message.type === 'INJECT_SCRIPTS') {
        (async () => {
            try {
                // Get tab ID from sender (message comes from content script)
                const tabId = sender.tab?.id;
                if (!tabId) {
                    throw new Error('No tab ID available');
                }

                // console.log(`📦 Injecting ${CONTENT_SCRIPTS.length} scripts into tab ${tabId}...`);

                // Reset AI state (clear old cooldowns from bad attempts)
                if (typeof resetAIState === 'function') await resetAIState().catch(() => { });

                // Inject scripts sequentially to maintain dependencies
                for (const file of CONTENT_SCRIPTS) {
                    await chrome.scripting.executeScript({
                        target: {
                            tabId: tabId,
                            frameIds: [sender.frameId] // Target only the requesting frame
                        },
                        files: [file]
                    });
                }

                // console.log('✅ All scripts injected successfully');
                sendResponse({ success: true, count: CONTENT_SCRIPTS.length });

            } catch (error) {
                console.error('❌ Script injection failed:', error);
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true; // Keep channel open for async response
    }

    // AI Request Proxy (for cases where content script can't make direct calls)
    if (message.type === 'AI_REQUEST') {
        (async () => {
            try {
                const result = await self.AIClient.callAI(
                    message.prompt,
                    message.systemInstruction || '',
                    message.options || {}
                );
                sendResponse(result);
            } catch (error) {
                console.error('AI request error:', error);
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true; // Keep message channel open for async response
    }

    // Check setup status
    if (message.type === 'CHECK_SETUP') {
        (async () => {
            try {
                const status = await self.AIClient.checkSetupStatus();
                sendResponse(status);
            } catch (error) {
                sendResponse({ ready: false, hasApiKey: false, hasResume: false });
            }
        })();
        return true;
    }

    // Get resume data
    if (message.type === 'GET_RESUME') {
        (async () => {
            try {
                const data = await self.ResumeManager.getResumeData();
                sendResponse({ success: true, data });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }

    // Get flattened resume data
    if (message.type === 'GET_FLAT_RESUME') {
        (async () => {
            try {
                const data = await self.ResumeManager.getFlattenedResumeData();
                sendResponse({ success: true, data });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }

    // Get resume as text
    if (message.type === 'GET_RESUME_TEXT') {
        (async () => {
            try {
                const text = await self.ResumeManager.getResumeAsText();
                sendResponse({ success: true, text });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }

    // Re-inject chat widget after navigation (called by bootstrap on pages with Trusted Types CSP)
    if (message.type === 'INJECT_CHAT_WIDGET') {
        (async () => {
            try {
                const tabId = sender.tab?.id;
                if (!tabId) return;
                // Skip if already present
                const [result] = await chrome.scripting.executeScript({
                    target: { tabId },
                    func: () => !!document.getElementById('nova-chat-widget')
                });
                if (result?.result) return;
                await chrome.scripting.executeScript({ target: { tabId }, files: ['shared/utils/nova-chat-core.js'] });
                await chrome.scripting.executeScript({ target: { tabId }, files: ['autofill/ui/chat/chat-widget.js'] });
            } catch (e) {}
        })();
        return false;
    }

    // Open a popup window for the job URL (user sees it load), scrape it, close it,
    // return the text directly. Widget stays alive on the search page the whole time.
    if (message.type === 'SCRAPE_JOB_POPUP') {
        const url = message.url;
        if (!url) { sendResponse({ text: '', error: 'no url' }); return false; }

        (async () => {
            let popupTabId = null;
            try {
                // Hidden background tab — visual is handled by the iframe in the widget
                const tab = await chrome.tabs.create({ url, active: false });
                popupTabId = tab.id;

                if (!popupTabId) throw new Error('no tab created');

                // Wait for the page to finish loading
                await new Promise((resolve, reject) => {
                    const timer = setTimeout(() => {
                        chrome.tabs.onUpdated.removeListener(fn);
                        reject(new Error('timeout'));
                    }, 15000);
                    function fn(tabId, info) {
                        if (tabId !== popupTabId || info.status !== 'complete') return;
                        chrome.tabs.onUpdated.removeListener(fn);
                        clearTimeout(timer);
                        resolve();
                    }
                    chrome.tabs.onUpdated.addListener(fn);
                });

                // Wait up to 8s for JS-rendered content (React/Vue SPAs).
                // Pulse chrome.storage every 2s to keep the MV3 service worker alive —
                // without this, the SW can suspend mid-wait and kill the pending sendResponse.
                await new Promise(r => {
                    let elapsed = 0;
                    const tick = setInterval(() => {
                        elapsed += 2000;
                        chrome.storage.local.get('_nw_sw_ping'); // no-op read keeps SW alive
                        if (elapsed >= 8000) { clearInterval(tick); r(); }
                    }, 2000);
                });

                // Smart scrape: JSON-LD → platform selectors → body fallback
                const [r] = await chrome.scripting.executeScript({
                    target: { tabId: popupTabId },
                    func: () => {
                        function clean(t) { return (t || '').replace(/\s+/g, ' ').trim(); }

                        // TIER 1: JSON-LD structured data
                        for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
                            try {
                                const d  = JSON.parse(s.textContent);
                                const jd = d['@type'] === 'JobPosting' ? d : d.jobPosting;
                                if (jd?.title) {
                                    return clean([
                                        `Title: ${jd.title}`,
                                        `Company: ${jd.hiringOrganization?.name || ''}`,
                                        `Location: ${jd.jobLocation?.address?.addressLocality || ''}`,
                                        `Description: ${clean(jd.description || '').slice(0, 4000)}`
                                    ].join('\n'));
                                }
                            } catch {}
                        }

                        // TIER 2: Platform-specific selectors
                        const h = location.hostname;
                        let titleSel, companySel, descSel;
                        if (h.includes('greenhouse') || h.includes('boards')) {
                            titleSel = '.app-title, h1.app-title'; companySel = '.company-name'; descSel = '#content .section-wrapper';
                        } else if (h.includes('lever')) {
                            titleSel = '.posting-headline h2'; companySel = '.main-header-text-logo'; descSel = '.section-wrapper';
                        } else if (h.includes('myworkday') || h.includes('workday')) {
                            titleSel = 'h2[data-automation-id="jobPostingHeader"], h3.css-12b42k6';
                            companySel = '[data-automation-id="company"]'; descSel = '[data-automation-id="jobPostingDescription"]';
                        } else if (h.includes('linkedin')) {
                            titleSel = 'h1.top-card-layout__title, h1.t-24';
                            companySel = 'a.topcard__org-name-link, .top-card-layout__second-subline';
                            descSel = '.description__text, .show-more-less-html__markup';
                        } else if (h.includes('indeed')) {
                            titleSel = 'h1.jobsearch-JobInfoHeader-title, h1[data-testid="jobsearch-JobInfoHeader-title"]';
                            companySel = '[data-testid="inlineHeader-companyName"]'; descSel = '#jobDescriptionText';
                        }
                        const descEl = descSel && document.querySelector(descSel);
                        if (descEl) {
                            return clean([
                                `Title: ${clean(document.querySelector(titleSel)?.innerText || document.title)}`,
                                `Company: ${clean(document.querySelector(companySel)?.innerText || '')}`,
                                `Description: ${clean(descEl.innerText).slice(0, 4000)}`
                            ].join('\n'));
                        }

                        // TIER 3: Body fallback
                        const clone = document.body.cloneNode(true);
                        clone.querySelectorAll('script,style,nav,footer,header,[role="banner"],[role="navigation"]').forEach(e => e.remove());
                        return clean(clone.innerText || '').slice(0, 5000);
                    }
                });

                sendResponse({ text: r?.result || '' });
            } catch (e) {
                sendResponse({ text: '', error: e.message });
            } finally {
                if (popupTabId) chrome.tabs.remove(popupTabId).catch(() => {});
            }
        })();

        return true; // keep message channel open for async sendResponse
    }

    if (message.type === 'OPEN_OPTIONS') {
        chrome.runtime.openOptionsPage();
        return false;
    }

    // Navigate the active tab to a URL (proper MV3 pattern — avoids CSP issues)
    if (message.type === 'NAVIGATE') {
        (async () => {
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab) await chrome.tabs.update(tab.id, { url: message.url });
                sendResponse({ success: true });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }
});


// ── Context menu: "Ask Nova about this" on selected text ──────────────────────
function createContextMenu() {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: 'nova-ask-selection',
            title: 'Ask Nova: "%s"',
            contexts: ['selection']
        });
    });
}

chrome.runtime.onInstalled.addListener((details) => {
    createContextMenu();
    if (details.reason === 'install') {
        chrome.runtime.openOptionsPage();
    }
});

// Recreate on service worker startup (context menus don't persist across restarts)
chrome.runtime.onStartup.addListener(createContextMenu);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'nova-ask-selection') return;
    if (!tab?.id || !info.selectionText) return;

    const selected = info.selectionText.trim().slice(0, 1000);

    try {
        // Inject core first, then widget
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['shared/utils/nova-chat-core.js']
        });
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['autofill/ui/chat/chat-widget.js']
        });

        // Small delay to let the widget initialise, then send the selection
        setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, {
                type: 'NOVA_SELECTION',
                text: selected
            });
        }, 300);
    } catch (e) {
        console.error('Nova context menu error:', e);
    }
});


// Listen for tab updates (for future page-specific behavior)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // Could inject setup prompts for job sites here
        // console.log('Page loaded:', tab.url);
    }
});

// Extension icon click — inject widget if needed, then toggle open
chrome.action.onClicked.addListener(async (tab) => {
    if (!tab?.id) return;
    try {
        // Check if widget is already in the page
        const [result] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => !!document.getElementById('nova-chat-widget')
        });

        if (!result?.result) {
            // First time on this page — inject
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['shared/utils/nova-chat-core.js'] });
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['autofill/ui/chat/chat-widget.js'] });
            // Widget auto-opens on inject, nothing more to do
        } else {
            // Already injected — toggle visibility
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const w = document.getElementById('nova-chat-widget');
                    if (!w) return;
                    const hidden = w.style.display === 'none' || w.dataset.minimized === 'true';
                    if (hidden) {
                        w.style.display = '';
                        w.dataset.minimized = 'false';
                        // Restore bubble if present
                        const bubble = document.getElementById('nova-mini-bubble');
                        if (bubble) bubble.style.display = 'none';
                    } else {
                        w.style.display = 'none';
                        w.dataset.minimized = 'true';
                    }
                }
            });
        }
    } catch (e) {
        console.error('Nova icon click error:', e);
    }
});
