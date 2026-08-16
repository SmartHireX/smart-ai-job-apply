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

    // Extract page content from a URL by opening it in a background tab, scraping, then closing.
    // Sends status updates to the requesting tab via chrome.tabs.sendMessage so the widget
    // can show live progress (opening → reading → done / error).
    if (message.type === 'EXTRACT_JOB_CONTENT') {
        const originTabId = sender.tab?.id;
        const jobUrl      = message.url;
        const jobIndex    = message.index;

        const notify = (status, extra = {}) => {
            if (!originTabId) return;
            chrome.tabs.sendMessage(originTabId, {
                type: 'JOB_SCAN_STATUS',
                index: jobIndex,
                status,   // 'opening' | 'reading' | 'done' | 'error'
                url: jobUrl,
                ...extra
            }).catch(() => {});
        };

        (async () => {
            let tab;
            try {
                notify('opening');
                tab = await chrome.tabs.create({ url: jobUrl, active: false });

                // Wait for load (max 15s)
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('Page load timeout')), 15000);
                    const listener = (tabId, info) => {
                        if (tabId !== tab.id) return;
                        if (info.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(listener);
                            clearTimeout(timeout);
                            resolve();
                        }
                    };
                    chrome.tabs.onUpdated.addListener(listener);
                });

                // Let JS-rendered content settle
                await new Promise(r => setTimeout(r, 1000));
                notify('reading');

                const [result] = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        const clone = document.body.cloneNode(true);
                        clone.querySelectorAll('script,style,nav,footer,header,[role="banner"],[role="navigation"]').forEach(e => e.remove());
                        return {
                            title: document.title,
                            url:   location.href,
                            text:  (clone.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 6000)
                        };
                    }
                });

                const data = result?.result || { title: '', url: jobUrl, text: '' };
                notify('done', { data });
                sendResponse({ success: true, data });
            } catch (e) {
                notify('error', { error: e.message });
                sendResponse({ success: false, error: e.message });
            } finally {
                if (tab?.id) chrome.tabs.remove(tab.id).catch(() => {});
            }
        })();
        return true;
    }

    // Open popup and switch to the fill-form tab
    if (message.type === 'OPEN_POPUP_FILL') {
        chrome.storage.local.set({ nova_popup_tab: 'fill' });
        chrome.action.openPopup().catch(() => {});
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

// Handle extension icon click when popup is closed
chrome.action.onClicked.addListener((tab) => {
    // This only fires if there's no default_popup
    // With our popup, this won't fire normally
});
