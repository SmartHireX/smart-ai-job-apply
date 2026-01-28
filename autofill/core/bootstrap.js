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
    // THE BRAIN (Visual Label Extraction) - Must be first for all extractors
    'autofill/services/extraction/form-detector.js',

    // Metadata & Data Managers
    'shared/utils/ai-client.js',
    'shared/utils/resume-manager.js',
    'shared/utils/form-extractor.js',
    'shared/utils/form-analyzer.js',
    'autofill/utils/field-utils.js',
    'autofill/utils/key-generator.js',

    // Base Classes & Infrastructure
    'autofill/handlers/handler.js', // Loaded before subclasses like CopilotClient

    // Shared State
    'shared/state/state-manager.js',
    'shared/state/action-queue.js',

    // Infrastructure & Services (Core Logic)
    'autofill/domains/inference/feature-extractor.js',
    'autofill/domains/inference/FieldTypes.js',
    'autofill/domains/inference/HeuristicEngine.js',
    'autofill/domains/inference/OptimizedMathKernel.js',
    'autofill/domains/inference/neural-classifier-v8.js',
    'autofill/domains/inference/HybridClassifier.js',
    'autofill/domains/inference/CopilotClient.js',

    // Primary Features (Must load before Lifecycle init)
    'autofill/domains/memory/GlobalMemory.js',
    'autofill/features/undo-manager.js',
    'autofill/features/self-healing.js',
    'autofill/features/ai-field-regeneration.js',
    'autofill/features/form-observer.js',

    // Lifecycle & Orchestration
    'common/infrastructure/config.js',
    'common/infrastructure/lifecycle.js',

    // Remaining Logic & Services
    'autofill/domains/heuristics/InteractionLog.js',
    'autofill/domains/heuristics/RuleEngine.js',
    'autofill/domains/profile/EntityStore.js',
    'autofill/domains/profile/SectionController.js',
    'autofill/services/indexing/field-indexing-service.js',
    'autofill/domains/model/FieldRoutingPatterns.js',
    'autofill/core/PipelineOrchestrator.js',
    'autofill/services/extraction/section-detector.js',
    'autofill/services/extraction/section-grouper.js',
    'autofill/services/extraction/sibling-cluster.js',
    'autofill/domains/profile/CompositeFieldManager.js',
    'autofill/services/ai/AIBatchProcessor.js',
    'autofill/domains/inference/prefetch-engine.js',
    'autofill/domains/inference/execution-engine.js',
    'autofill/core/form-processor.js',
    'autofill/ui/animations/form-visuals.js',
    'autofill/ui/sidebar/drag-resize.js',
    'autofill/ui/sidebar/widget-overlay.js',
    'autofill/ui/sidebar/sidebar-components.js',
    'autofill/ui/premium-inputs/premium-input-renderer.js',
    'autofill/workflows/classification-workflow.js',
    'autofill/workflows/instant-fill-workflow.js',
    'autofill/workflows/ai-fill-workflow.js',

    'autofill/handlers/autofill-message-handler.js',
    'autofill/handlers/undo-handler.js',

    // Message Router & Orchestrator (LAST)
    'common/messaging/message-router.js',
    'autofill/core/autofill-orchestrator.js'
];

// ==========================================
// ROBUST SPA-AWARE FORM DETECTION
// ==========================================

/**
 * Platform-specific selectors for job application forms
 * These target common ATS platforms and ensure consistent detection
 */
const FORM_SELECTORS = [
    // Standard
    'form',
    '[role="form"]',

    // AshbyHQ (React SPA - primary target for this fix)
    '.ashby-application-form-container',
    '[class*="ashby-application-form"]',
    '[data-testid="application-form"]',
    'div[class*="ApplicationForm"]',

    // Greenhouse
    '#application_form',
    '.application-form',
    '[id*="job-application"]',

    // Lever
    '.application-page',
    '[class*="application-form"]',

    // Workday
    '[data-automation-id="form-container"]',
    '[data-automation-id="applicationForm"]',

    // Generic patterns
    '[class*="job-application"]',
    '[id*="apply"]',
    'main form',
    'section form'
];

/**
 * Check if an element is a valid form container
 * @param {Element} el - Element to check
 * @returns {boolean}
 */
function isValidFormContainer(el) {
    if (!el) return false;

    // Must have input fields
    const inputCount = el.querySelectorAll('input:not([type="hidden"]), select, textarea').length;
    if (inputCount === 0) return false;

    // Exclude search forms and nav elements
    const isSearch = el.getAttribute('role') === 'search' ||
        el.classList.contains('search-form') ||
        (el.id && el.id.toLowerCase().includes('search')) ||
        (el.className && el.className.toLowerCase().includes('search'));

    if (isSearch) return false;

    // Exclude tiny forms (likely login/subscribe widgets)
    if (inputCount < 2 && !el.closest('main, article, [role="main"]')) return false;

    return true;
}

/**
 * Detect forms using robust selector matching
 * @returns {number} Form count
 */
function detectFormsFallback() {
    // Try platform-specific selectors
    const candidates = document.querySelectorAll(FORM_SELECTORS.join(', '));
    const validForms = Array.from(candidates).filter(isValidFormContainer);



    if (validForms.length > 0) {
        return validForms.length;
    }

    // NEW: Submission Anchor Detection (Backtracking)
    // Find "Submit" or "Next" buttons and walk up to find the form container
    const isSubmitButton = (el) => {
        if (!el) return false;
        const text = el.innerText?.toLowerCase() || el.value?.toLowerCase() || '';
        const type = el.getAttribute('type');
        const role = el.getAttribute('role');

        // Exact matches
        if (type === 'submit') return true;

        // Text matches
        if (/(apply|submit|next|continue|review|save)/i.test(text)) {
            if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') return true;
            if (role === 'button' || el.classList.contains('btn') || el.classList.contains('button')) return true;
        }
        return false;
    };

    // Helper: Check visibility
    const isFieldVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return el.offsetParent !== null &&
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            style.opacity !== '0' &&
            !el.closest('[aria-hidden="true"]');
    };

    const submitButtons = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]'))
        .filter(btn => isSubmitButton(btn) && isFieldVisible(btn));

    for (const btn of submitButtons) {
        let current = btn.parentElement;
        let depth = 0;
        // Walk up to 10 levels to find a container with enough inputs
        while (current && current !== document.body && depth < 10) {
            // Stop at semantic boundaries
            if (current.tagName === 'FORM' || current.getAttribute('role') === 'form') {
                // Already caught by standard selectors usually, but check validity
                if (isValidFormContainer(current)) return 1; // Found it!
            }

            // Check input density in this container
            const inputs = current.querySelectorAll('input:not([type="hidden"]), select, textarea');
            if (inputs.length >= 2) {
                // Found a likely form container!
                // Mark it so other modules can find it
                current.dataset.novaForm = "detected-via-anchor";
                console.log('⚓ [AnchorDetection] Found form via submit button:', btn, '->', current);
                return 1;
            }
            current = current.parentElement;
            depth++;
        }
    }

    // Fallback: Density Scan for virtual forms (SPA without form tags)
    const allInputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea');
    if (allInputs.length >= 3) {
        // Check if inputs are clustered (likely a form)
        const inputContainers = new Map();

        allInputs.forEach(input => {
            let parent = input.parentElement;
            for (let i = 0; i < 5; i++) {
                if (!parent || parent.tagName === 'BODY' || parent.tagName === 'HTML') break;
                inputContainers.set(parent, (inputContainers.get(parent) || 0) + 1);
                parent = parent.parentElement;
            }
        });

        // Find container with most inputs
        for (const [container, count] of inputContainers.entries()) {
            if (count >= 3 && isValidFormContainer(container)) {
                return 1; // Virtual form found
            }
        }
    }

    return 0;
}

/**
 * Detect forms with retry logic for SPAs
 * Handles dynamically loaded content (React, Vue, Angular)
 * @returns {Promise<number>} Form count
 */
async function detectFormsWithRetry() {
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [0, 500, 1500]; // Immediate, 500ms, 1.5s

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        // Wait before retry (except first attempt)
        if (attempt > 0) {
            await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
        }

        // Use advanced detector if loaded
        if (typeof window.detectForms === 'function') {
            try {
                const forms = window.detectForms();
                if (forms && forms.length > 0) {
                    return forms.length;
                }

                // OPTIMIZATION: If the first attempt found ZERO inputs on the whole page,
                // it's highly unlikely a form will appear in 500ms without a major mutation.
                // We've already logged a suppressed warn in FormDetector.
                if (attempt === 0) {
                    const hasAnyInputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea').length > 0;
                    if (!hasAnyInputs) {
                        return 0; // Exit early to avoid noise
                    }
                }
            } catch (e) {
                console.warn('detectForms error:', e);
            }
        }

        // Use robust fallback
        const count = detectFormsFallback();
        if (count > 0) {
            return count;
        }

        // On last attempt, try waiting for DOM mutations
        if (attempt === MAX_RETRIES - 1) {
            const mutationResult = await waitForFormMutation(1500);
            if (mutationResult > 0) return mutationResult;
        }
    }

    return 0;
}

/**
 * Wait for potential form mutation (lazy loading)
 * @param {number} timeout - Max wait time in ms
 * @returns {Promise<number>} Form count after mutation
 */
function waitForFormMutation(timeout) {
    return new Promise(resolve => {
        let resolved = false;

        const observer = new MutationObserver((mutations) => {
            // Check if any mutation added form elements
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const hasInputs = node.querySelector &&
                            node.querySelector('input, select, textarea');
                        if (hasInputs || FORM_SELECTORS.some(sel => {
                            try { return node.matches && node.matches(sel); } catch { return false; }
                        })) {
                            // Form-like content added, check full page
                            const count = detectFormsFallback();
                            if (count > 0 && !resolved) {
                                resolved = true;
                                observer.disconnect();
                                resolve(count);
                                return;
                            }
                        }
                    }
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Timeout fallback
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                observer.disconnect();
                resolve(detectFormsFallback());
            }
        }, timeout);
    });
}

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
    // Robust form detection with SPA support
    if (message.type === 'DETECT_FORMS') {
        // Use async detection with retry for SPAs
        detectFormsWithRetry().then(formCount => {
            sendResponse({ formCount });
        });
        return true; // Keep channel open for async
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

// ==========================================
// AUTO-DETECTION TRIGGERS (SPA Support)
// ==========================================

let lastUrl = window.location.href;
let autoDetectTimer = null;

function triggerAutoDetect() {
    if (autoDetectTimer) clearTimeout(autoDetectTimer);
    autoDetectTimer = setTimeout(() => {
        // Only run if we have the detector loaded
        if (typeof window.ScoreBasedFormDetector !== 'undefined') {
            const detector = new window.ScoreBasedFormDetector();
            detector.detect().then(result => {
                if (result.primary) {
                    // console.log('🎯 [AutoDetect] Form found via background check');
                    // Optional: Send message to background to update badge?
                    // For now, we just ensure the detector is ready.
                }
            });
        }
    }, 2000); // 2s debounce to let page settle
}

// 1. URL Change Listener
new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        // console.log('🌐 [Bootstrap] URL Changed, triggering detection...');
        triggerAutoDetect();
    }
}).observe(document, { subtree: true, childList: true });

// 2. Initial Trigger
if (document.readyState === 'complete') {
    triggerAutoDetect();
} else {
    window.addEventListener('load', triggerAutoDetect);
}

// console.log('🎯 Nova AI Bootstrap loaded (lazy loading enabled)');
