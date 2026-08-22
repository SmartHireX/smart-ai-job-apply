/**
 * ui-components.js
 * Handles UI construction, chat interface, and native field manipulation helpers.
 */

// Helper: Safely query selector, handling invalid IDs (e.g. starting with numbers)
function safeQuerySelector(selector) {
    if (!selector) return null;
    try {
        return document.querySelector(selector);
    } catch (e) {
        // Only attempt fix if it looks like an ID selector
        if (selector.startsWith('#')) {
            try {
                // Escape the ID part (everything after #)
                const id = selector.substring(1);
                return document.querySelector('#' + CSS.escape(id));
            } catch (e2) {
                return null;
            }
        }
        return null;
    }
}

function updateSidebarWithState(allMappings) {
    const sidebar = document.getElementById('smarthirex-accordion-sidebar');
    // Prepare mappings even if sidebar isn't open yet

    // Convert mappings object to array of fields
    const allFields = Object.keys(allMappings).map(selector => ({
        selector,
        ...allMappings[selector]
    }));

    // Re-render with new tab-based UI
    showAccordionSidebar(allFields);
}

function showProcessingWidget(text, step, batchInfo = null) {
    let widget = document.getElementById('smarthirex-processing-widget');
    if (!widget) {
        widget = document.createElement('div');
        widget.id = 'smarthirex-processing-widget';
        document.body.appendChild(widget);
        // CSS Decoupling: Styles now in sidebar.css
    }

    if (step === -1) {
        widget.innerHTML = `
            <div class="sh-widget-header">
                <div class="sh-neural-loader">
                    <div class="sh-neural-core" style="background: #ef4444; box-shadow: 0 0 10px #ef4444;"></div>
                </div>
                <div class="sh-content-col">
                    <div class="sh-main-text" style="color: #fca5a5;">${text}</div>
                    <div class="sh-sub-text">ERROR ENCOUNTERED</div>
                </div>
            </div>
        `;
        setTimeout(() => removeProcessingWidget(), 3000);
        return;
    }

    // NEW: Handle batched progress
    if (batchInfo && batchInfo.currentBatch && batchInfo.totalBatches) {
        const { currentBatch, totalBatches } = batchInfo;
        const batchProgress = (currentBatch / totalBatches) * 100;

        // Generate batch indicator dots
        let batchDots = '';
        for (let i = 1; i <= totalBatches; i++) {
            const dotClass = i < currentBatch ? 'completed' : (i === currentBatch ? 'active' : 'pending');
            batchDots += `<div class="sh-batch-dot ${dotClass}"></div>`;
        }

        widget.innerHTML = `
            <div class="sh-widget-header">
                <div class="sh-neural-loader">
                    <div class="sh-neural-core"></div>
                    <div class="sh-neural-ring"></div>
                    <div class="sh-neural-ring"></div>
                </div>
                <div class="sh-content-col">
                    <div class="sh-main-text">${text}</div>
                    <div class="sh-batch-indicators-inline">
                        ${batchDots}
                    </div>
                </div>
            </div>
            <div class="sh-progress-track">
                <div class="sh-progress-fill sh-gradient-flow" style="width: ${batchProgress}%;"></div>
            </div>
        `;
        return;
    }

    // Original: Convert step to actual progress percentage
    // Step 1 (Instant Match) = 33%
    // Step 2 (AI Thinking) = 66%
    // Step 3 (Finalizing) = 100%
    const progressMap = { 1: 33, 2: 66, 3: 100, 4: 100 };
    const progressPercent = progressMap[step] || 0;

    widget.innerHTML = `
        <div class="sh-widget-header">
            <div class="sh-neural-loader">
                <div class="sh-neural-core"></div>
                <div class="sh-neural-ring"></div>
                <div class="sh-neural-ring"></div>
            </div>
            <div class="sh-content-col">
                <div class="sh-main-text">${text}</div>
                <div class="sh-sub-text">AI Neural Engine Active</div>
            </div>
        </div>
        <div class="sh-progress-track">
            <div class="sh-progress-fill" style="width: ${progressPercent}%; transition: width 0.6s ease;"></div>
        </div>
    `;
}

function updateProcessingWidget(text) {
    const widget = document.getElementById('smarthirex-processing-widget');
    if (widget) {
        const textEl = widget.querySelector('.sh-main-text');
        if (textEl) {
            textEl.textContent = text;
            return;
        }
    }
    // Fallback if widget doesn't exist
    showProcessingWidget(text, 2);
}

function removeProcessingWidget() {
    const widget = document.getElementById('smarthirex-processing-widget');
    if (widget) {
        widget.style.transform = 'translate(-50%, -100%)';
        widget.style.opacity = '0';
        setTimeout(() => widget.remove(), 400);
    }
}

function showSuccessToast(filled, review) {
    const toast = document.createElement('div');
    toast.id = 'smarthirex-success-toast';
    // Cool Design: Dark Glassmorphism + Gradient Border Glow
    toast.style.cssText = `
        position: fixed; top: 32px; left: 50%; transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.85); 
        backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        color: white; padding: 16px 24px; border-radius: 16px;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1), 0 20px 40px -10px rgba(0, 0, 0, 0.5);
        z-index: 2147483647;
        display: flex; align-items: center; gap: 16px; 
        font-family: 'Inter', system-ui, sans-serif;
        animation: slideDownFade 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        min-width: 300px;
        overflow: hidden;
    `;

    // Add a magical gradient line at the top
    const gradientLine = document.createElement('div');
    gradientLine.style.cssText = `
        position: absolute; top: 0; left: 0; right: 0; height: 2px;
        background: linear-gradient(90deg, #10b981, #3b82f6);
    `;
    toast.appendChild(gradientLine);

    toast.innerHTML += `
        <div style="
            background: linear-gradient(135deg, #10b981 0%, #059669 100%); 
            width: 40px; height: 40px; border-radius: 12px; 
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
            flex-shrink: 0;
        ">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
            </svg>
        </div>
        <div style="display: flex; flex-direction: column; flex-grow: 1;">
            <span style="font-weight: 700; font-size: 15px; letter-spacing: -0.01em; margin-bottom: 2px;">Completed</span>
            <span style="font-size: 13px; color: #cbd5e1; font-weight: 500;">
                <span style="color: #6ee7b7; font-weight: 600;">${filled}</span> fields filled <span style="margin: 0 4px; opacity: 0.3;">|</span> <span style="color: #93c5fd; font-weight: 600;">${review}</span> to review
            </span>
        </div>
    `;

    document.body.appendChild(toast);

    // Auto-remove after 5 seconds (slightly longer to admire the coolness)
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, -20px) scale(0.95)';
            toast.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            setTimeout(() => toast.remove(), 300);
        }
    }, 5000);
}

function showUndoToast() {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; top: 24px; left: 50%; transform: translateX(-50%);
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        color: #b91c1c; padding: 12px 24px; border-radius: 12px;
        box-shadow: 
            0 4px 6px -1px rgba(220, 38, 38, 0.05), 
            0 12px 20px -4px rgba(220, 38, 38, 0.1),
            0 0 0 1px rgba(220, 38, 38, 0.1);
        z-index: 2147483647; display: flex; align-items: center; gap: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; 
        font-weight: 600; font-size: 14px; letter-spacing: -0.01em;
        animation: slideDownFade 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        user-select: none;
    `;

    toast.innerHTML = `
        <div style="background: rgba(254, 226, 226, 0.6); width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" /><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="line-height: 1;">Form Cleared</span>
            <span style="font-size: 11px; font-weight: 500; opacity: 0.8;">Action completed successfully</span>
        </div>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, -10px) scale(0.98)';
        toast.style.transition = 'all 0.3s ease-in';
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

function showErrorToast(message) {
    // Friendly Mapping
    let friendlyMessage = message;
    let showSettingsBtn = false;

    if (message.includes('RATE_LIMIT') || message.includes('429')) {
        friendlyMessage = "Gemini is taking a breather. Please wait a minute before trying again.";
    } else if (message.includes('API key') || message.includes('INVALID_KEY') || message.includes('UNAUTHORIZED')) {
        friendlyMessage = "AI Key issue detected. Please check your settings.";
        showSettingsBtn = true;
    } else if (message.includes('Quota')) {
        friendlyMessage = "AI Quota exceeded. Try again later or check your billing.";
    }

    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; top: 24px; left: 50%; transform: translate(-50%, 0);
        background: #fee2e2; color: #b91c1c; padding: 14px 20px; border-radius: 12px;
        box-shadow: 0 10px 25px -5px rgba(0,0,0,0.2); z-index: 2147483647;
        display: flex; flex-direction: column; align-items: center; gap: 8px; font-family: 'Inter', sans-serif;
        font-weight: 500; border: 1px solid #fecaca; font-size: 14px;
        animation: toastSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        max-width: 320px; text-align: center;
    `;

    toast.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>${friendlyMessage}</span>
        </div>
        ${showSettingsBtn ? `
            <button id="toast-settings-btn" style="
                background: #b91c1c; color: white; border: none; padding: 6px 12px; 
                border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;
                margin-top: 4px; transition: background 0.2s;
            ">Fix in Settings</button>
        ` : ''}
    `;

    document.body.appendChild(toast);

    const settingsBtn = toast.querySelector('#toast-settings-btn');
    if (settingsBtn) {
        settingsBtn.onclick = () => {
            chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
            toast.remove();
        };
    }

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, -20px)';
        setTimeout(() => toast.remove(), 400);
    }, showSettingsBtn ? 6000 : 4000);
}

const AI_DEGRADED_SESSION_KEY = 'smarthirex_ai_degraded_banner_shown';

/**
 * One-time, non-intrusive toast when falling back to heuristic mode (AI degraded/offline).
 * Shows only once per session (sessionStorage).
 * @param {string} [reason] - 'rate_limit' | 'invalid_key' | 'offline'
 */
function showAIDegradedBanner(reason) {
    try {
        if (sessionStorage.getItem(AI_DEGRADED_SESSION_KEY)) return;
        sessionStorage.setItem(AI_DEGRADED_SESSION_KEY, '1');
    } catch (e) { return; }

    let message = "Falling back to smart heuristics.";
    if (reason === 'rate_limit') message = "Gemini is busy; using smart heuristics for now.";
    if (reason === 'invalid_key') message = "AI key issue; using offline mode mapping.";

    const banner = document.createElement('div');
    banner.className = 'nova-ai-banner';
    banner.style.cssText = `
        position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
        background: rgba(30, 41, 59, 0.95); backdrop-filter: blur(8px);
        color: #e2e8f0; padding: 10px 18px; border-radius: 50px;
        font-size: 12px; font-weight: 500; z-index: 2147483647;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15); border: 1px solid rgba(255,255,255,0.1);
        display: flex; align-items: center; gap: 10px; animation: toastSlideIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `;

    banner.innerHTML = `
        <span style="display: flex; width: 8px; height: 8px; border-radius: 50%; background: #fbbf24; box-shadow: 0 0 10px #fbbf24;"></span>
        <span>${message}</span>
        <button id="close-banner" style="background: none; border: none; color: #94a3b8; cursor: pointer; padding: 2px 5px; font-size: 14px;">✕</button>
    `;

    document.body.appendChild(banner);

    const closeBtn = banner.querySelector('#close-banner');
    if (closeBtn) closeBtn.onclick = () => banner.remove();

    setTimeout(() => {
        if (banner.parentNode) {
            banner.style.opacity = '0';
            banner.style.transform = 'translate(-50%, -10px)';
            setTimeout(() => banner.remove(), 400);
        }
    }, 6000);
}
if (typeof window !== 'undefined') window.showAIDegradedBanner = showAIDegradedBanner;

function setNativeValue(element, value) {
    let lastValue = element.value;
    element.value = value;

    let event = new Event('input', { bubbles: true });

    // React hack: overwriting value setter
    let tracker = element._valueTracker;
    if (tracker) {
        tracker.setValue(lastValue);
    }

    // Try finding the setter from the specific prototype
    let descriptor;
    if (element instanceof HTMLInputElement) {
        descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    } else if (element instanceof HTMLTextAreaElement) {
        descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    } else if (element instanceof HTMLSelectElement) {
        descriptor = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
        event = new Event('change', { bubbles: true }); // Selects need 'change'
    }

    if (descriptor && descriptor.set) {
        descriptor.set.call(element, value);
    }

    element.dispatchEvent(event);
}

function setFieldValue(element, value, fieldMetadata = null) {
    const type = element.type;
    const tag = element.tagName.toLowerCase();

    // Normalize value: extract string from cache objects
    let normalizedValue = value;
    if (value && typeof value === 'object') {
        // Cache object: {value: '', confidence: 0.75, ...}
        if ('value' in value) {
            normalizedValue = value.value;
        } else if (Array.isArray(value)) {
            // Array of values - join them
            normalizedValue = value.map(v => typeof v === 'object' && v.value ? v.value : v).join(', ');
        }
    }

    // Skip if value is still not a valid string
    if (normalizedValue === null || normalizedValue === undefined || normalizedValue === '') {
        console.warn('[setFieldValue] Skipping empty/null value for:', element);
        return;
    }

    if (type === 'radio') setRadioValue(element, normalizedValue, fieldMetadata);
    else if (type === 'checkbox') setCheckboxValue(element, normalizedValue, fieldMetadata);
    else if (type === 'date' || type === 'time' || type === 'datetime-local') setDateTimeValue(element, normalizedValue);
    else if (tag === 'select') setSelectValue(element, normalizedValue);
    else if (type === 'tel') setTelValue(element, normalizedValue); // Special handling for phone inputs
    else setTextValue(element, normalizedValue);
}

/**
 * Sets text value using ghost typing animation for consistency
 */
function setTextValue(element, value) {
    if (window.showGhostingAnimation) {
        // Use ghost typing for all text fields
        // This ensures React/Angular compatibility and consistent user experience
        window.showGhostingAnimation(element, value, 1.0);
    } else {
        // Fallback
        setNativeValue(element, value);
        dispatchChangeEvents(element);
    }
}

/**
 * Special handler for tel/phone inputs in React apps
 * Simulates typing to ensure React properly registers input
 */
function setTelValue(element, value) {
    if (!value) return;

    // Smart Phone Logic:
    // 1. Clean the value
    let cleanValue = String(value).replace(/[^\d+]/g, '');

    // 2. Check if it's a US number with country code (e.g., +1 or 1)
    if (cleanValue.length === 11 && cleanValue.startsWith('1')) {
        cleanValue = cleanValue.substring(1);
    } else if (cleanValue.length === 12 && cleanValue.startsWith('+1')) {
        cleanValue = cleanValue.substring(2);
    }

    // 3. Format if it looks like US number (10 digits) -> (123) 456-7890
    let formattedValue = cleanValue;
    if (cleanValue.length === 10) {
        formattedValue = `(${cleanValue.substring(0, 3)}) ${cleanValue.substring(3, 6)}-${cleanValue.substring(6)}`;
    }

    // Attempt 1: Direct Set (Standard)
    setNativeValue(element, formattedValue);
    dispatchChangeEvents(element);

    // Verify if it stuck
    const currentClean = element.value.replace(/\D/g, '');
    const expectedClean = cleanValue.replace(/\D/g, '');

    if (currentClean === expectedClean || element.value === formattedValue) return;

    // Attempt 2: Slow Typing (The Fix)
    // Reuse the ghosting animation logic which handles delayed typing perfectly
    if (window.showGhostingAnimation) {
        element.focus();
        element.value = '';
        // "Ghost type" the raw digits
        // We use 'await' if we're in an async context, but setTelValue is sync.
        // That's fine, showGhostingAnimation returns a promise and runs independently.
        window.showGhostingAnimation(element, cleanValue, 1.0).then(() => {
            element.blur();
        });
    } else {
        // Fallback if visual module missing (rare)
        element.focus();
        element.value = cleanValue;
        dispatchChangeEvents(element);
    }
}

function setRadioValue(element, value, fieldMetadata = null) {
    if (window.FieldUtils && typeof window.FieldUtils.setFieldValue === 'function') {
        window.FieldUtils.setFieldValue(element, value, fieldMetadata);
    } else {
        const name = element.name;
        const radios = document.querySelectorAll(`input[name="${name}"]`);
        let bestMatch = null;
        let maxSim = 0;

        radios.forEach(r => {
            const label = getOptionLabelText(r);
            const val = r.value;

            const labelSim = calculateUsingJaccardSimilarity(label, value);
            const valSim = calculateUsingJaccardSimilarity(val, value);

            // Exact match override
            const exactMatch = (val === value || label === value) ? 1.0 : 0;

            const sim = Math.max(labelSim, valSim, exactMatch);

            if (sim > maxSim) {
                maxSim = sim;
                bestMatch = r;
            }
        });

        if (bestMatch && maxSim > 0.4) {
            bestMatch.checked = true;
            dispatchChangeEvents(bestMatch);
        }
    }
}

function setCheckboxValue(element, value, fieldMetadata = null) {
    if (window.FieldUtils && typeof window.FieldUtils.setFieldValue === 'function') {
        window.FieldUtils.setFieldValue(element, value, fieldMetadata);
        return;
    }
    let targetValues = value;

    // Robustness: Handle comma-separated strings as arrays
    if (typeof value === 'string' && value.includes(',')) {
        targetValues = value.split(',').map(v => v.trim());
    }

    if (Array.isArray(targetValues)) {
        // Handle Multi-Checkbox Group (AI/Batch context)
        const name = element.name;
        if (!name) return; // Cannot handle group without name

        const checkboxes = document.querySelectorAll(`input[name="${name}"]`);

        checkboxes.forEach(cb => {
            const label = getOptionLabelText(cb) || '';
            const val = cb.value || '';

            // Check if this checkbox matches ANY value in the array
            const isMatch = targetValues.some(target => {
                // Exact value match
                if (val === target) {
                    return true;
                }

                // Text/Label match (loose)
                const textSim = calculateUsingJaccardSimilarity(label, target);
                const isSimMatch = textSim > 0.6; // Lowered threshold 

                return isSimMatch;
            });

            if (isMatch) {
                // SAFE CHECKING LOGIC:
                // 1. If not checked, try clicking (natural event trigger)
                if (!cb.checked) {
                    cb.click();

                    // 2. If click didn't work (e.g. prevented), force it
                    if (!cb.checked) {
                        cb.checked = true;
                        cb.dispatchEvent(new Event('input', { bubbles: true }));
                        cb.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            }
        });
    } else {
        // Standard Single Boolean
        const shouldBeChecked = (value === true || String(value).toLowerCase() === 'true' || String(value).toLowerCase() === 'yes');
        if (element.checked !== shouldBeChecked) {
            element.click();
            // Fallback
            if (element.checked !== shouldBeChecked) {
                element.checked = shouldBeChecked;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }
}

function setDateTimeValue(element, value) {
    try {
        if (element.type === 'date') {
            const date = new Date(value);
            if (!isNaN(date)) element.value = date.toISOString().split('T')[0];
        } else {
            element.value = value;
        }
        dispatchChangeEvents(element);
    } catch (e) { element.value = value; }
}

function setTextValue(element, value) {
    setNativeValue(element, value);
    dispatchChangeEvents(element);
}

function setSelectValue(element, value) {
    const options = Array.from(element.options);

    // Context: Handle Multi-Select (LocalMatcher returns array for skills)
    if (element.multiple && Array.isArray(value)) {
        let changed = false;
        options.forEach(opt => {
            // Check if this option matches ANY of the target values
            const isMatch = value.some(target => {
                const textSim = calculateUsingJaccardSimilarity(opt.text, target);
                const valSim = calculateUsingJaccardSimilarity(opt.value, target);
                return Math.max(textSim, valSim) > 0.6; // Threshold for multi-select
            });

            // Strict Sync: Select if match, Deselect if not key
            // This prevents "accumulating" old selections (User bug report)
            if (opt.selected !== isMatch) {
                opt.selected = isMatch;
                changed = true;
            }
        });
        if (changed) dispatchChangeEvents(element);
        return;
    }

    // Single Select Logic
    let bestMatchIndex = -1;
    let maxSim = 0;

    // // // console.log(`🔍 [SelectDebug] Setting value for select. Target: "${value}"`);

    // STRATEGY 1: Exact Match (Value or Text) - Priority #1
    for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        if (opt.value === "" || opt.text.toLowerCase().includes("select")) continue;

        if (opt.value.toLowerCase() === String(value).toLowerCase() ||
            opt.text.toLowerCase() === String(value).toLowerCase()) {
            bestMatchIndex = i;
            // // // console.log(`✅ [SelectDebug] Exact match found: "${opt.text}"`);
            break;
        }
    }

    // STRATEGY 2: Jaccard & Substring Fallback (if no exact match)
    if (bestMatchIndex === -1) {
        options.forEach((opt, index) => {
            if (opt.value === "" || opt.text.toLowerCase().includes("select")) return;

            const textSim = calculateUsingJaccardSimilarity(opt.text, value);
            const valSim = calculateUsingJaccardSimilarity(opt.value, value);
            const sim = Math.max(textSim, valSim);

            // Exact match override (case-insensitive) - Already checked, but check if passed text was slightly off?
            // Actually let's assume Strategy 1 covered exact. 
            // Here we look for high similarity.

            if (sim > maxSim) {
                maxSim = sim;
                bestMatchIndex = index;
            }
        });

        // // // console.log(`   🏆 Best Fuzzy Match: "${bestMatchIndex !== -1 ? options[bestMatchIndex].text : 'None'}" (Score: ${maxSim})`);
    }

    // Apply Best Match
    if (bestMatchIndex !== -1 && (maxSim >= 0.4 || bestMatchIndex !== -1)) { // If bestMatchIndex set by Strat 1, it's valid.
        element.selectedIndex = bestMatchIndex;
        // Force update value attribute too for framework listeners
        element.value = element.options[bestMatchIndex].value;
        dispatchChangeEvents(element);
        // // // console.log(`✅ [SelectDebug] Applied index ${bestMatchIndex}: "${element.options[bestMatchIndex].text}"`);
    } else {
        console.warn(`❌ [SelectDebug] No match found. Max Sim: ${maxSim}`);
    }
}

function dispatchChangeEvents(element) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    if (element.type === 'radio' || element.type === 'checkbox') element.click();
}

function captureFieldState(element) {
    return {
        element: element,
        value: element.type === 'checkbox' ? element.checked : element.value,
        isCheckbox: element.type === 'checkbox',
        originalStyles: {
            border: element.style.border,
            borderColor: element.style.borderColor,
            borderWidth: element.style.borderWidth,
            borderStyle: element.style.borderStyle,
            boxShadow: element.style.boxShadow,
            backgroundColor: element.style.backgroundColor,
            transition: element.style.transition
        }
    };
}

// Helper to extract text from a specific option input
function getOptionLabelText(input) {
    if (input.labels && input.labels.length > 0) return input.labels[0].innerText.trim();
    if (input.id) {
        const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
        if (label) return label.innerText.trim();
    }
    const parent = input.closest('label');
    if (parent) {
        const clone = parent.cloneNode(true);
        const inputInClone = clone.querySelector('input');
        if (inputInClone) inputInClone.remove();
        return clone.innerText.trim();
    }
    // Ashby Style: Input followed immediately by Label
    if (input.nextElementSibling && input.nextElementSibling.tagName === 'LABEL') {
        return input.nextElementSibling.innerText.trim();
    }
    return null;
}

function attachSelfCorrectionTrigger(element) {
    if (element.dataset.shLearningAttached || element._novaEditListenerAttached) return;
    element.dataset.shLearningAttached = 'true';
    element._novaEditListenerAttached = true;

    const handleChange = async () => {
        const label = getFieldLabel(element);
        const fieldType = (element.type || element.tagName || '').toLowerCase();

        // ---------------------------------------------------------
        // 0. METADATA RECOVERY (Construct fieldObj FIRST)
        // ---------------------------------------------------------
        let cacheLabel = element.getAttribute('cache_label');
        let instanceType = element.getAttribute('instance_type'); // From DOM
        let scope = element.getAttribute('scope') || 'GLOBAL';

        if (!cacheLabel && window.NovaCache) {
            const entry = window.NovaCache[element.id] || window.NovaCache[element.name];
            if (entry) {
                // Handle new Object structure or legacy string
                cacheLabel = (typeof entry === 'object') ? entry.label : entry;

                // If DOM was missing metadata, recover it from NovaCache
                if (typeof entry === 'object') {
                    if (!instanceType) instanceType = entry.type;
                    if (element.getAttribute('scope') === null) scope = entry.scope;
                }

                // Force attributes onto element for consistency
                if (cacheLabel) element.setAttribute('cache_label', cacheLabel);
                if (instanceType) element.setAttribute('instance_type', instanceType);

            }
        }

        // Create rich field object to pass architectural metadata (instance_type)
        const fieldObj = {
            id: element.id,
            name: element.name,
            tagName: element.tagName,
            type: element.type,
            cache_label: cacheLabel,
            instance_type: instanceType, // From DOM or Cache
            scope: scope,
            element: element,
            // Add ML prediction if available on element property
            ml_prediction: element.__ml_prediction
        };



        // Determine if this is a non-text input (for SelectionCache)
        const isNonTextInput = fieldType === 'radio' || fieldType === 'checkbox' ||
            fieldType === 'select' || fieldType === 'select-one' ||
            fieldType === 'select-multiple' || element.tagName === 'SELECT';

        // Get the value
        let newValue;
        if (fieldType === 'checkbox') {

            const rawVal = element.value;
            // Robust value extraction
            if (!rawVal || rawVal === 'on' || rawVal === 'true') {
                const text = getOptionLabelText(element);
                newValue = text || true;
            } else {
                newValue = rawVal;
            }

            // Branch 1: Unified Multi-Select Update (if supported)
            if (window.InteractionLog && window.InteractionLog.updateMultiSelection) {

                // PASS RICHER METADATA OBJECT
                await window.InteractionLog.updateMultiSelection(fieldObj, label, newValue, element.checked);
                return; // Skip the standard cacheSelection call below
            }

            // Fallback (Old Behavior)
            newValue = element.checked ? newValue : '';
            if (!element.checked) return; // Don't cache unchecks in legacy mode

        } else if (fieldType === 'radio') {
            // For radio, only cache if checked
            if (!element.checked) return;
            newValue = element.value;

            // Handle Generic Values (on/true) OR Dynamic IDs
            const isGeneric = newValue.toLowerCase() === 'on' || newValue.toLowerCase() === 'true';
            const isDynamic = /^[0-9]+$/.test(newValue) || (newValue.length > 8 && /[0-9]/.test(newValue) && !newValue.includes(' '));

            if (isGeneric || isDynamic) {
                const textLabel = getOptionLabelText(element);
                if (textLabel) newValue = textLabel;
            }

        } else if (element.tagName === 'SELECT') {
            if (element.multiple) {
                // Handle Multi-Select: Capture ALL selected options
                const selectedOptions = Array.from(element.selectedOptions);
                // Extract text labels for all selected items
                newValue = selectedOptions.map(opt => (opt.text || opt.value || '').trim());
            } else {
                // Handle Single-Select
                const selectedOption = element.options[element.selectedIndex];
                if (selectedOption) {
                    newValue = (selectedOption.text || selectedOption.value || '').trim();
                } else {
                    newValue = element.value;
                }
            }
        } else {
            newValue = element.value;
        }

        // ---------------------------------------------------------
        // CACHE ROUTING LOGIC
        // ---------------------------------------------------------

        // 0. Pre-Flight: Ensure Authoritative Cache Key
        // Resurrect Authoritative Cache Key (from Pipeline/GlobalStore)
        // 0. Pre-Flight: Ensure Authoritative Cache Key
        // Resurrect Authoritative Cache Key (from Pipeline/GlobalStore)
        // Moved to top of handleChange
        // let cacheLabel = element.getAttribute('cache_label');
        // let instanceType = element.getAttribute('instance_type'); // From DOM
        // let scope = element.getAttribute('scope') || 'GLOBAL';

        // if (!cacheLabel && window.NovaCache) {
        //     const entry = window.NovaCache[element.id] || window.NovaCache[element.name];
        //     if (entry) {
        //         // Handle new Object structure or legacy string
        //         cacheLabel = (typeof entry === 'object') ? entry.label : entry;

        //         // If DOM was missing metadata, recover it from NovaCache
        //         if (typeof entry === 'object') {
        //             if (!instanceType) instanceType = entry.type;
        //             if (element.getAttribute('scope') === null) scope = entry.scope;
        //         }

        //         // Force attributes onto element for consistency
        //         if (cacheLabel) element.setAttribute('cache_label', cacheLabel);
        //         if (instanceType) element.setAttribute('instance_type', instanceType);

        //     } else {
        //         console.warn(`⚠️ [CacheDebug] Lookup Failed for [${element.id}, ${element.name}]. Available Keys:`, Object.keys(window.NovaCache));
        //     }
        // }



        // 1. Determine Cache Strategy
        // We use InteractionLog (SelectionCache) for "Known Profile Fields" and "Structured Inputs" (Select/Radio).
        // We use GlobalMemory (SmartMemory) for "Open-Ended Questions" (Generic Text).

        let handledByInteractionLog = false;

        // Create rich field object to pass architectural metadata (instance_type)
        // Moved to top of handleChange
        // const fieldObj = {
        //     id: element.id,
        //     name: element.name,
        //     tagName: element.tagName,
        //     type: element.type,
        //     cache_label: cacheLabel,
        //     instance_type: instanceType, // From DOM or Cache
        //     scope: scope,
        //     element: element
        // };

        // Strategy A: Non-Text Inputs (always explicit selection)
        if (isNonTextInput && window.SelectionCache) {
            await window.SelectionCache.cacheSelection(fieldObj, label, newValue);
            // // // console.log(`💾 [SelectionCache] Learned: "${label}" → ${newValue} (Non-Text)`);
            handledByInteractionLog = true;
        }

        // Strategy B: MultiCache-eligible text fields (job/education/skills)
        // Check for multiCache keywords before routing to SmartMemory
        const fieldContext = [label, element.name, element.id].filter(Boolean).join(' ').toLowerCase();

        // Use centralized routing logic
        const isMultiCacheEligible = window.FIELD_ROUTING_PATTERNS.isMultiValueEligible(fieldContext, element.type, fieldObj);

        // (Moved cacheLabel logic up)
        // // // console.log(`🔍 [CacheDebug] Cache Label: ${cacheLabel} and element : `, element);

        // UNIFIED CACHING STRATEGY (Consolidated)
        // All interactions flow into InteractionLog -> 3-Bucket System
        if (window.InteractionLog && newValue !== null && newValue !== undefined) {
            // Always route to InteractionLog.
            // It handles Text vs Select routing via instance_type internally.
            await window.InteractionLog.cacheSelection(element, label, newValue);
            // // // console.log(`📚 [UnifiedCache] Learned: "${label}" → ${newValue}`);

            handledByInteractionLog = true;
        } else {
            console.warn('[Sidebar] InteractionLog missing, cannot save field.');
        }
    };

    // Debounce the handler to prevent spamming storage on every keystroke
    const debouncedHandleChange = (() => {
        let timeout;
        return (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => handleChange(e), 800); // Wait 800ms after typing stops
        };
    })();

    // Listen to both 'change' and 'input' events for better coverage
    // 'change' (select/radio) is usually instant, so maybe we don't debounce that?
    // Actually, 'input' is the spammy one. 'change' is fine.

    element.addEventListener('change', handleChange); // Instant save for Blur/Select
    element.addEventListener('input', debouncedHandleChange); // Debounced save for Typing
}

function activateSmartMemoryLearning() {
    const inputs = document.querySelectorAll('input, textarea, select');
    inputs.forEach(attachSelfCorrectionTrigger);
}

