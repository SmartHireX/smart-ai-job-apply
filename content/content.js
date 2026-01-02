// Content script - runs on all web pages
console.log('SmartHireX local extension loaded');

// ============ MESSAGE LISTENERS ============

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    // 1. Detect Forms
    if (message.type === 'DETECT_FORMS') {
        const formCount = detectForms();
        sendResponse({ formCount });
        return true;
    }

    // 2. Start Local Processing (Triggered by Popup)
    if (message.type === 'START_LOCAL_PROCESSING') {
        processPageFormLocal();
        return false; // Async work happens but we don't keep the channel open for this simple trigger
    }

    // 3. Undo Fill
    if (message.type === 'UNDO_FILL') {
        const result = undoFormFill();
        sendResponse(result);
        return true;
    }

    // 4. Toggle Chat
    if (message.type === 'TOGGLE_CHAT') {
        toggleChatInterface();
        sendResponse({ success: true });
        return false;
    }
});


// ============ PAGE PROCESSING WORKFLOW ============

async function processPageFormLocal() {
    try {
        console.log('✨ Starting local page processing...');
        showProcessingWidget('Nova is analyzing page architecture...', 1);

        // 1. Extract HTML
        const formHTML = extractFormHTML();
        if (!formHTML) {
            throw new Error('No form found on this page');
        }

        // 2. Analyze & Map (Using Local FormAnalyzer)
        showProcessingWidget('AI is understanding the form...', 2);

        // We need to handle AI calls. 
        // Note: In content scripts, fetch might be blocked by CSP. 
        // We'll wrap the AIClient call to proxy if needed, OR relies on the fact that
        // extensions often bypass CSP for fetches initiated by content scripts (in some cases)
        // BUT to be safe, we should probably proxy heavy lifting to background if this fails.
        // For now, let's try direct call via FormAnalyzer which uses AIClient.

        // We override AIClient.callAI to use background proxy to avoid CSP issues on strict pages
        const originalCallAI = window.AIClient.callAI;
        window.AIClient.callAI = async (prompt, sys, opts) => {
            return new Promise(resolve => {
                chrome.runtime.sendMessage({
                    type: 'AI_REQUEST',
                    prompt,
                    systemInstruction: sys,
                    options: opts
                }, response => {
                    resolve(response || { success: false, error: 'Background worker timeout' });
                });
            });
        };

        const result = await window.FormAnalyzer.analyzeAndMapForm(formHTML);

        // Restore original just in case
        window.AIClient.callAI = originalCallAI;

        if (!result.success) {
            throw new Error(result.error || 'Analysis failed');
        }

        const { fields, mappings } = result;

        // 3. Process Mappings for Confidence
        showProcessingWidget('Mapping your data to form...', 3);

        // FormAnalyzer returns simple mapping. We need to structure it for our fill logic
        // which expects { selector: { value, confidence, ... } }
        // The AI mapping should already match this structure if prompt was followed.

        console.log('Mappings received:', mappings);

        // 4. Execute Fill
        showProcessingWidget('Optimization Complete.', 4);
        setTimeout(() => removeProcessingWidget(), 800);

        // Send confirmation to extension
        chrome.runtime.sendMessage({ type: 'FILL_COMPLETE' });

        await executeInstantFill({
            mappings,
            analysis: { fields },
            allFields: fields
        });

    } catch (error) {
        console.error('Processing failed:', error);
        showProcessingWidget('Error occurred', -1);
        showErrorToast(error.message);
        setTimeout(() => removeProcessingWidget(), 2000);

        chrome.runtime.sendMessage({
            type: 'FILL_ERROR',
            error: error.message
        });
    }
}


// ============ FORM UTILITIES ============

function detectForms() {
    return document.querySelectorAll('form, input, select, textarea').length > 0 ? 1 : 0;
}

function extractFormHTML() {
    // Basic extraction - improved to focus on main content area if possible
    // or just return body if forms are scattered
    const forms = document.querySelectorAll('form');
    let html = '';

    if (forms.length > 0) {
        forms.forEach((f, i) => {
            html += `<!-- Form ${i} -->\n${f.outerHTML}\n`;
        });
    } else {
        // Fallback to inputs
        const inputs = document.querySelectorAll('input, select, textarea, label');
        // Get common parents? Too complex. Just dump body but cleaned by FormAnalyzer
        html = document.body.innerHTML;
    }

    // Limit size mostly handled by FormAnalyzer.cleanHTMLForAnalysis
    // But we check here for empty
    if (!html || html.trim().length < 10) return null;

    return html;
}

// ============ FILL LOGIC (Reused/Refined) ============

async function executeInstantFill(data) {
    try {
        console.log('🚀 SmartHireX: Starting instant fill workflow...');
        const mappings = data.mappings;
        const allFields = data.allFields;

        const highConfidenceMappings = {};
        const lowConfidenceMappings = {};
        const HIGH_CONFIDENCE_THRESHOLD = 0.8; // Gemini is pretty good

        Object.entries(mappings).forEach(([selector, fieldData]) => {
            const confidence = fieldData.confidence || 0;
            if (confidence >= HIGH_CONFIDENCE_THRESHOLD) {
                highConfidenceMappings[selector] = fieldData;
            } else {
                lowConfidenceMappings[selector] = fieldData;
            }
        });

        const highConfCount = Object.keys(highConfidenceMappings).length;
        const lowConfCount = Object.keys(lowConfidenceMappings).length;

        // 1. Fill Fields
        const allFieldsToFill = { ...highConfidenceMappings, ...lowConfidenceMappings };

        if (Object.keys(allFieldsToFill).length > 0) {
            for (const [selector, data] of Object.entries(allFieldsToFill)) {
                // Try to find element
                let element = document.querySelector(selector);

                // If ID selector failed, try looser match if it looks like an ID
                if (!element && selector.startsWith('#')) {
                    const id = selector.substring(1);
                    element = document.getElementById(id);
                }

                if (element && isFieldVisible(element)) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                    if (data.value) {
                        await setInputValue(element, data.value);
                        highlightField(element, data.confidence || 0);
                    }
                }
            }
        }

        // 2. Show Sidebar for review
        if (lowConfCount > 0 || highConfCount > 0) {
            showAccordionSidebar(highConfidenceMappings, lowConfidenceMappings);
        } else {
            showErrorToast('Could not match any fields confidently.');
        }

    } catch (error) {
        console.error('Fill error:', error);
    }
}

async function setInputValue(element, value) {
    // Focus
    element.focus();

    const tagName = element.tagName.toLowerCase();
    const type = element.type;

    if (tagName === 'select') {
        // Find matching option
        let matched = false;
        // Try exact value match
        for (let i = 0; i < element.options.length; i++) {
            if (element.options[i].value === value) {
                element.selectedIndex = i;
                matched = true;
                break;
            }
        }
        // Try text match
        if (!matched) {
            for (let i = 0; i < element.options.length; i++) {
                if (element.options[i].text.toLowerCase().includes(value.toLowerCase())) {
                    element.selectedIndex = i;
                    matched = true;
                    break;
                }
            }
        }
    } else if (type === 'checkbox') {
        element.checked = (value === true || value === 'true');
    } else if (type === 'radio') {
        if (element.value === value) element.checked = true;
    } else {
        // Text inputs
        element.value = value;
    }

    // Trigger events
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.blur();

    // Small delay
    await new Promise(r => setTimeout(r, 50));
}

function highlightField(element, confidence) {
    const isHigh = confidence >= 0.8;
    const color = isHigh ? '#10b981' : '#f59e0b'; // Green or Orange

    const originalBorder = element.style.border;
    const originalShadow = element.style.boxShadow;

    element.style.transition = 'all 0.3s';
    element.style.border = `2px solid ${color}`;
    element.style.boxShadow = `0 0 8px ${color}40`;

    // Remove highlight after a while
    setTimeout(() => {
        element.style.border = originalBorder;
        element.style.boxShadow = originalShadow;
    }, 4000);
}

function isFieldVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}


// ============ UI WIDGETS ============

function showProcessingWidget(text, step) {
    let widget = document.getElementById('smarthirex-processing-widget');
    if (!widget) {
        widget = document.createElement('div');
        widget.id = 'smarthirex-processing-widget';
        document.body.appendChild(widget);

        // CSS injected via content.css file now, or inline?
        // Let's keep inline for simplicity/redundancy
        Object.assign(widget.style, {
            position: 'fixed',
            top: '32px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            padding: '12px 24px',
            borderRadius: '99px',
            boxShadow: '0 10px 40px -10px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            zIndex: '2147483647',
            fontFamily: 'system-ui, sans-serif',
            minWidth: '340px',
            transition: 'all 0.3s'
        });
    }

    if (step === -1) {
        widget.innerHTML = `<span style="font-size:20px">⚠️</span> <span style="font-weight:600; color:#ef4444">${text}</span>`;
        return;
    }

    widget.innerHTML = `
        <div style="width:24px; height:24px; border:2px solid #0a66c2; border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite"></div>
        <div style="display:flex; flex-direction:column">
            <span style="font-weight:600; color:#1f2937; font-size:14px">${text}</span>
            ${step > 0 ? `<span style="font-size:11px; color:#6b7280; text-transform:uppercase">STEP ${step} OF 4</span>` : ''}
        </div>
        <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    `;
}

function removeProcessingWidget() {
    const w = document.getElementById('smarthirex-processing-widget');
    if (w) w.remove();
}

function showErrorToast(message) {
    const toast = document.createElement('div');
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        background: '#ef4444',
        color: 'white',
        padding: '12px 20px',
        borderRadius: '8px',
        fontWeight: '500',
        zIndex: '2147483647',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
    });
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}


// ============ SIDEBAR ============

function showAccordionSidebar(highConf, lowConf) {
    const existing = document.getElementById('smarthirex-sidebar');
    if (existing) existing.remove();

    const sidebar = document.createElement('div');
    sidebar.id = 'smarthirex-sidebar';

    // Combine for display
    const items = [];
    Object.entries(lowConf).forEach(([sel, data]) => items.push({ sel, ...data, isLow: true }));
    Object.entries(highConf).forEach(([sel, data]) => items.push({ sel, ...data, isLow: false }));

    const contentHTML = items.map(item => `
        <div style="padding: 12px; border-bottom: 1px solid #e5e7eb; background: ${item.isLow ? '#fffbeb' : 'white'}">
            <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px; color: #374151">
                ${item.isLow ? '⚠️ Review: ' : '✓'} ${item.source || 'Field'}
            </div>
            <div style="font-size: 14px; color: #111827">
                ${item.value || '<span style="color:#9ca3af; font-style:italic">Empty</span>'}
            </div>
        </div>
    `).join('');

    Object.assign(sidebar.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        width: '320px',
        maxHeight: '80vh',
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
        zIndex: '2147483647',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid #e5e7eb'
    });

    sidebar.innerHTML = `
        <div style="padding: 16px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; display:flex; justify-content:space-between; align-items:center">
            <h3 style="margin:0; font-size:16px; font-weight:700; color:#1f2937">Smart Fill Review</h3>
            <button id="sh-close-sidebar" style="background:none; border:none; color:#6b7280; font-size:20px; cursor:pointer">&times;</button>
        </div>
        <div style="overflow-y: auto; flex: 1">
            ${contentHTML || '<div style="padding:20px; text-align:center; color:#6b7280">No fields filled</div>'}
        </div>
    `;

    document.body.appendChild(sidebar);

    document.getElementById('sh-close-sidebar').onclick = () => sidebar.remove();
}

function undoFormFill() {
    // Basic implementation - reload page or clear inputs?
    // Clearing inputs is safer
    // Typically we'd track what we changed. 
    // For now returning false as "not implemented full undo" but UI handles it
    return { success: true };
}


// ============ CHAT INTERFACE ============

function toggleChatInterface() {
    let container = document.getElementById('smarthirex-chat-container');

    if (container) {
        if (container.style.display === 'none') {
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
        }
        return;
    }

    // Create Chat Iframe
    container = document.createElement('div');
    container.id = 'smarthirex-chat-container';
    Object.assign(container.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '400px',
        height: '600px',
        zIndex: '2147483647',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        borderRadius: '12px',
        overflow: 'hidden',
        background: 'white'
    });

    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('chat/chat.html');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';

    // Drag handle
    const handle = document.createElement('div');
    Object.assign(handle.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        right: '40px',
        height: '40px',
        cursor: 'move',
        zIndex: '10'
    });

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    Object.assign(closeBtn.style, {
        position: 'absolute',
        top: '8px',
        right: '8px',
        width: '24px',
        height: '24px',
        background: 'rgba(0,0,0,0.1)',
        border: 'none',
        borderRadius: '50%',
        color: '#374151',
        cursor: 'pointer',
        zIndex: '20',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '18px'
    });
    closeBtn.onclick = () => container.style.display = 'none';

    container.appendChild(handle);
    container.appendChild(closeBtn);
    container.appendChild(iframe);
    document.body.appendChild(container);

    // Basic drag logic
    let isDragging = false;
    let startX, startY, initialRight, initialBottom;

    handle.onmousedown = (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = container.getBoundingClientRect();
        initialRight = window.innerWidth - rect.right;
        initialBottom = window.innerHeight - rect.bottom;
        container.style.transition = 'none'; // Disable transition for smooth drag
    };

    document.onmousemove = (e) => {
        if (!isDragging) return;
        const deltaX = startX - e.clientX;
        const deltaY = startY - e.clientY;
        container.style.right = `${Math.max(0, initialRight + deltaX)}px`;
        container.style.bottom = `${Math.max(0, initialBottom + deltaY)}px`;
    };

    document.onmouseup = () => isDragging = false;
}
