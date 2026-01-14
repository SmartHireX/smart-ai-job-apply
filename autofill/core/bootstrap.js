/**
 * bootstrap.js
 * Minimal bootstrap loader for lazy loading extension scripts
 * 
 * This script is always loaded and listens for activation signals.
 * When user activates extension, it dynamically injects all other scripts.
 */

// Track if full extension is loaded
window.__NOVA_LOADED = false;
window.__NOVA_LOADING = false;

// Script loading queue (in dependency order)
const SCRIPT_QUEUE = [
    // Core Constants (MUST LOAD FIRST)
    'autofill/core/constants.js',

    // Shared Utils (4 files)
    'shared/utils/ai-client.js',
    'shared/utils/resume-manager.js',
    'shared/utils/form-extractor.js',
    'shared/utils/form-analyzer.js',

    // Autofill Services (18 files)
    'autofill/utils/key-generator.js',
    'autofill/domains/heuristics/InteractionLog.js',
    'autofill/domains/heuristics/RuleEngine.js',
    'autofill/domains/profile/EntityStore.js',

    'autofill/services/indexing/field-indexing-service.js',
    'autofill/core/PipelineOrchestrator.js',
    'autofill/services/extraction/section-detector.js',
    'autofill/services/extraction/sibling-cluster.js',
    'autofill/services/extraction/form-detector.js',
    'autofill/domains/profile/CompositeFieldManager.js',
    'autofill/services/ai/AIBatchProcessor.js',
    'autofill/domains/inference/prefetch-engine.js',
    'autofill/ui/animations/form-visuals.js',
    'autofill/ui/sidebar/drag-resize.js',
    'autofill/ui/sidebar/widget-overlay.js', // Loaded before sidebar for widget utility
    'autofill/ui/sidebar/sidebar-components.js',
    'autofill/ui/premium-inputs/premium-input-renderer.js',
    'autofill/handlers/handler.js',


    // Autofill Handlers (5 more)

    'autofill/domains/profile/SectionController.js',
    'autofill/domains/inference/CopilotClient.js',

    // Shared State (3 files)
    'shared/state/state-manager.js',
    'shared/state/action-queue.js',


    // Common Infrastructure (2 more - constants already loaded)
    'autofill/domains/inference/feature-extractor.js',
    'autofill/domains/inference/neural-classifier.js',
    'common/infrastructure/config.js',
    'common/infrastructure/lifecycle.js',

    // Autofill Core Features (6 files)
    'autofill/domains/memory/GlobalMemory.js',
    'autofill/utils/field-utils.js',
    'autofill/features/undo-manager.js',
    'autofill/features/self-healing.js',
    'autofill/features/ai-field-regeneration.js',

    // Autofill Workflows (3 files)
    'autofill/workflows/classification-workflow.js',
    'autofill/workflows/instant-fill-workflow.js',
    'autofill/workflows/ai-fill-workflow.js',
    'autofill/domains/inference/execution-engine.js',
    'autofill/core/form-processor.js',

    // Chatbot (4 files)
    'chatbot/handlers/context-handler.js',
    'chatbot/services/ai/context-classifier.js',

    // Message Handlers (3 files)
    'autofill/handlers/autofill-message-handler.js',
    'autofill/handlers/undo-handler.js',
    'chatbot/handlers/chat-message-handler.js',

    // Message Router & Orchestrator (2 files - LAST)
    'common/messaging/message-router.js',
    'autofill/core/autofill-orchestrator.js'
];

/**
 * Dynamically inject a script
 * @param {string} src - Script path
 * @returns {Promise<void>}
 */
function injectScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL(src);
        script.onload = () => {
            // console.log(`✅ Loaded: ${src}`);
            resolve();
        };
        script.onerror = () => {
            console.error(`❌ Failed to load: ${src}`);
            reject(new Error(`Failed to load ${src}`));
        };
        document.head.appendChild(script);
    });
}

/**
 * Load all extension scripts via background script injection
 * @returns {Promise<boolean>}
 */
async function loadAllScripts() {
    if (window.__NOVA_LOADED) {
        // console.log('✅ Extension already loaded');
        return true;
    }

    if (window.__NOVA_LOADING) {
        // console.log('⏳ Extension loading in progress...');
        // Wait for loading to complete
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (window.__NOVA_LOADED) {
                    clearInterval(checkInterval);
                    resolve(true);
                }
            }, 100);
        });
    }

    window.__NOVA_LOADING = true;
    // console.log('🚀 Requesting script injection from background...');

    try {
        // Ask background script to inject all scripts
        // Background will get tab ID from the message sender
        const response = await chrome.runtime.sendMessage({
            type: 'INJECT_SCRIPTS'
        });

        if (response && response.success) {
            window.__NOVA_LOADED = true;
            window.__NOVA_LOADING = false;
            // console.log(`✅ All ${response.count} scripts loaded successfully!`);
            return true;
        } else {
            throw new Error(response?.error || 'Injection failed');
        }

    } catch (error) {
        window.__NOVA_LOADING = false;
        console.error('❌ Failed to load extension scripts:', error);
        return false;
    }
}

/**
 * Handle activation message
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Quick form detection (works before full load)
    if (message.type === 'DETECT_FORMS') {
        const forms = document.querySelectorAll('form');
        const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select');

        // Count forms with actual input fields
        let formCount = 0;
        forms.forEach(form => {
            const formInputs = form.querySelectorAll('input:not([type="hidden"]), textarea, select');
            if (formInputs.length > 0) {
                formCount++;
            }
        });

        // Also count standalone inputs not in forms
        const standaloneInputs = Array.from(inputs).filter(input => !input.closest('form'));
        if (standaloneInputs.length > 3) {
            formCount += 1; // Count as one "virtual form"
        }

        sendResponse({ formCount });
        return true;
    }

    // Extension activation
    if (message.type === 'ACTIVATE_EXTENSION') {
        // console.log('📢 Extension activation requested');

        loadAllScripts().then(loaded => {
            sendResponse({
                success: loaded,
                loaded: window.__NOVA_LOADED
            });
        });

        return true; // Keep channel open for async response
    }
});

// console.log('🎯 Nova AI Bootstrap loaded (lazy loading enabled)');
