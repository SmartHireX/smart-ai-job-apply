/**
 * Background Service Worker for Smart AI Job Apply Extension
 * 
 * Handles extension lifecycle events and can proxy AI requests if needed.
 */

// Import utility modules
importScripts('../shared/utils/ai-client.js', '../shared/utils/resume-manager.js');


console.log('Smart AI Job Apply background service worker started');

// Script injection order for lazy loading
const CONTENT_SCRIPTS = [
    'shared/utils/ai-client.js',
    'shared/utils/resume-manager.js',
    'shared/utils/form-extractor.js',
    'shared/utils/form-analyzer.js',
    'autofill/services/cache/selection-cache.js',
    'autofill/services/matching/local-matcher.js',
    'autofill/services/cache/history-manager.js',
    'autofill/services/cache/cache-manager.js',
    'autofill/services/indexing/field-indexing-service.js',
    'autofill/routers/field-router.js',
    'autofill/services/extraction/section-detector.js',
    'autofill/services/extraction/sibling-cluster.js',
    'autofill/services/extraction/form-detector.js',
    'autofill/services/cache/multi-value-handler.js',
    'autofill/services/ai/batch-processor.js',
    'autofill/services/ai/prefetch-engine.js',
    'autofill/ui/animations/form-visuals.js',
    'autofill/ui/sidebar/drag-resize.js',
    'autofill/ui/sidebar/sidebar-components.js',
    'autofill/ui/premium-inputs/premium-input-renderer.js',
    'autofill/handlers/handler.js',
    'autofill/handlers/cache-handler.js',
    'autofill/handlers/matcher-handler.js',
    'autofill/handlers/history-handler.js',
    'autofill/handlers/ai-handler.js',
    'shared/state/state-manager.js',
    'shared/state/action-queue.js',
    'shared/state/orchestrator.js',
    'autofill/services/ai/feature-extractor.js',
    'autofill/services/ai/neural-classifier.js',
    'common/infrastructure/config.js',
    'common/infrastructure/lifecycle.js',
    'autofill/services/cache/smart-memory-service.js',
    'autofill/utils/field-utils.js',
    'autofill/features/undo-manager.js',
    'autofill/features/self-healing.js',
    'autofill/features/ai-field-regeneration.js',
    'autofill/workflows/classification-workflow.js',
    'autofill/workflows/instant-fill-workflow.js',
    'autofill/workflows/ai-fill-workflow.js',
    'autofill/core/form-processor.js',
    'chatbot/handlers/context-handler.js',
    'chatbot/services/ai/context-classifier.js',
    'autofill/handlers/autofill-message-handler.js',
    'autofill/handlers/undo-handler.js',
    'chatbot/handlers/chat-message-handler.js',
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

                console.log(`📦 Injecting ${CONTENT_SCRIPTS.length} scripts into tab ${tabId}...`);

                // Inject scripts sequentially to maintain dependencies
                for (const file of CONTENT_SCRIPTS) {
                    await chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        files: [file]
                    });
                }

                console.log('✅ All scripts injected successfully');
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
});


// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('Smart AI Job Apply extension installed');
        // Open options page for initial setup
        chrome.runtime.openOptionsPage();
    } else if (details.reason === 'update') {
        console.log('Smart AI Job Apply extension updated to version 2.0');
        // Could show changelog or new features here
    }
});


// Listen for tab updates (for future page-specific behavior)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // Could inject setup prompts for job sites here
        console.log('Page loaded:', tab.url);
    }
});

// Handle extension icon click when popup is closed
chrome.action.onClicked.addListener((tab) => {
    // This only fires if there's no default_popup
    // With our popup, this won't fire normally
});
