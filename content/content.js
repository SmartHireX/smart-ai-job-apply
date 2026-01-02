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
        console.log('Received TOGGLE_CHAT command');
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
        const HIGH_CONFIDENCE_THRESHOLD = 0.9;

        const highConfidenceMappings = {};
        const lowConfidenceMappings = {};

        Object.entries(mappings).forEach(([selector, fieldData]) => {
            const confidence = fieldData.confidence || 0;
            if (confidence >= HIGH_CONFIDENCE_THRESHOLD && !fieldData.skipped) {
                highConfidenceMappings[selector] = fieldData;
            } else if (!fieldData.skipped) {
                lowConfidenceMappings[selector] = fieldData;
            }
        });

        const highConfCount = Object.keys(highConfidenceMappings).length;
        const lowConfCount = Object.keys(lowConfidenceMappings).length;

        // 1. Fill ALL fields regardless of confidence (Sequential Ghost Typer)
        const allFieldsToFill = { ...highConfidenceMappings, ...lowConfidenceMappings };
        const totalFillCount = Object.keys(allFieldsToFill).length;

        if (totalFillCount > 0) {
            console.log('👻 Starting Ghost Typer effect for ALL fields...');

            // Iterate sequentially for the visual effect
            for (const [selector, data] of Object.entries(allFieldsToFill)) {
                // Try to find element with flexible strategy
                let element = document.querySelector(selector);
                if (!element && selector.startsWith('#')) {
                    element = document.getElementById(selector.substring(1));
                }

                if (element && isFieldVisible(element)) {
                    // Use 'auto' behavior to prevent layout/ripple detachment issues
                    element.scrollIntoView({ behavior: 'auto', block: 'center' });

                    const confidence = data.confidence || 0;
                    if (data.value) {
                        await simulateTyping(element, data.value, confidence);
                    } else {
                        highlightField(element, confidence);
                    }
                }
            }
            console.log(`✅ Ghost Typer finished: ${totalFillCount} fields`);
        }

        // 2. Show toast
        showSuccessToast(highConfCount, lowConfCount);

        // 3. Show Sidebars (Always show if fields exists)
        if (lowConfCount > 0 || highConfCount > 0) {
            setTimeout(() => {
                const lowConfArray = Object.entries(lowConfidenceMappings).map(
                    ([selector, d]) => ({ selector, fieldData: d, confidence: d.confidence || 0 })
                );
                const highConfArray = Object.entries(highConfidenceMappings).map(
                    ([selector, d]) => ({ selector, fieldData: d, confidence: d.confidence || 1.0 })
                );
                showAccordionSidebar(highConfArray, lowConfArray);
            }, 500);
        } else {
            showErrorToast('Analysis complete, but no matching fields were found.');
        }

    } catch (error) {
        console.error('Fill error:', error);
        showErrorToast('Error during filling: ' + error.message);
    }
}

// ============ ENTERPRISE HELPERS (Setters, Animation, Validation) ============

function isFieldVisible(element) {
    if (!element) return false;
    try {
        const style = window.getComputedStyle(element);
        return (
            element.type !== 'hidden' &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            element.offsetWidth > 0 &&
            element.offsetHeight > 0
        );
    } catch { return false; }
}

async function simulateTyping(element, value, confidence = 1.0) {
    if (!element || !value) return;

    // Add visual state
    element.classList.add('smarthirex-typing');
    element.focus();

    // Check if text input
    const isText = (element.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'color', 'file', 'date', 'time'].includes(element.type)) || element.tagName === 'TEXTAREA';

    if (isText) {
        element.value = '';
        const chars = String(value).split('');
        for (const char of chars) {
            element.value += char;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            // Random delay 10-30ms
            await new Promise(r => setTimeout(r, Math.random() * 20 + 10)); // FAST
        }
    } else {
        await new Promise(r => setTimeout(r, 100));
        setFieldValue(element, value);
    }

    element.classList.remove('smarthirex-typing');
    highlightField(element, confidence);
    dispatchChangeEvents(element);
    await new Promise(r => setTimeout(r, 50));
}

function setFieldValue(element, value) {
    const tagName = element.tagName;
    const type = element.type?.toLowerCase();

    if (tagName === 'INPUT') {
        if (type === 'radio') setRadioValue(element, value);
        else if (type === 'checkbox') setCheckboxValue(element, value);
        else if (['date', 'time', 'datetime-local'].includes(type)) setDateTimeValue(element, value);
        else if (type === 'file') highlightFileField(element);
        else setTextValue(element, value);
    } else if (tagName === 'TEXTAREA') {
        setTextValue(element, value);
    } else if (tagName === 'SELECT') {
        setSelectValue(element, value);
    }
    dispatchChangeEvents(element);
}

function setRadioValue(element, value) {
    const name = element.name;
    if (!name) {
        element.checked = (element.value == value || value === true || value === 'true');
        return;
    }
    const group = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
    let matched = false;
    group.forEach(r => {
        if (r.value.toLowerCase() === String(value).toLowerCase()) { r.checked = true; matched = true; }
    });
    // Fallback label match
    if (!matched) {
        group.forEach(r => {
            const l = findLabelText(r);
            if (l && l.toLowerCase().includes(String(value).toLowerCase())) { r.checked = true; matched = true; }
        });
    }
}

function setCheckboxValue(element, value) {
    const truthy = [true, 'true', 'yes', '1', 'on', 'checked'];
    element.checked = truthy.includes(String(value).toLowerCase());
}

function setDateTimeValue(element, value) {
    try {
        let val = value;
        const d = new Date(value);
        if (!isNaN(d.getTime())) {
            if (element.type === 'date') val = d.toISOString().split('T')[0];
            if (element.type === 'datetime-local') val = d.toISOString().slice(0, 16);
        }
        element.value = val;
    } catch (e) { element.value = value; }
}

function setTextValue(element, value) {
    // Bypass React tracker if possible
    try {
        const proto = element.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(element, value);
    } catch (e) { element.value = value; }
}

function setSelectValue(element, value) {
    element.value = value;
    if (element.value !== value) {
        // Try text match
        for (let i = 0; i < element.options.length; i++) {
            if (element.options[i].text.toLowerCase().includes(String(value).toLowerCase())) {
                element.selectedIndex = i; break;
            }
        }
    }
}

function dispatchChangeEvents(element) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    if (element.type === 'radio' || element.type === 'checkbox') element.click();
}

function findLabelText(element) {
    if (element.labels && element.labels[0]) return element.labels[0].textContent;
    if (element.id) {
        const l = document.querySelector(`label[for="${element.id}"]`);
        if (l) return l.textContent;
    }
    return '';
}

function highlightFileField(element) {
    element.style.outline = '3px solid #F59E0B';
    element.style.outlineOffset = '2px';
}

function highlightField(element, confidence = 1.0) {
    // Add classes (CSS injected by addAccordionStyles)
    let cls = 'smarthirex-filled-high';
    if (confidence <= 0.5) cls = 'smarthirex-filled-low';
    else if (confidence <= 0.9) cls = 'smarthirex-filled-medium';

    element.classList.add(cls);

    // Add Ripple Effect
    try {
        const rect = element.getBoundingClientRect();
        const ripple = document.createElement('div');
        ripple.className = 'smarthirex-ripple';
        // Use fixed positioning relative to viewport (matches getBoundingClientRect)
        ripple.style.position = 'fixed';
        ripple.style.left = rect.left + 'px';
        ripple.style.top = rect.top + 'px';
        ripple.style.width = rect.width + 'px';
        ripple.style.height = rect.height + 'px';
        ripple.style.borderRadius = window.getComputedStyle(element).borderRadius;

        document.body.appendChild(ripple);

        // Remove after animation
        setTimeout(() => ripple.remove(), 800);
    } catch (e) { console.error('Ripple error', e); }

    // Inline fallback if CSS fails
    if (!document.getElementById('smarthirex-accordion-styles')) {
        const c = String(cls).includes('high') ? '#10b981' : (String(cls).includes('medium') ? '#3b82f6' : '#ef4444');
        element.style.border = `2px solid ${c}`;
        element.style.backgroundColor = `${c}0d`;
    }
}

function highlightSubmitButton() {
    const btns = Array.from(document.querySelectorAll('button, input[type="submit"]'));
    const sub = btns.find(b => /submit|apply|next/i.test(b.textContent || b.value));
    if (sub) {
        sub.style.boxShadow = '0 0 0 4px rgba(16, 185, 129, 0.4)';
        sub.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function getFieldLabel(element) {
    if (element.labels?.[0]) return element.labels[0].textContent;
    return element.placeholder || element.name || 'Field';
}


// ============ UI WIDGETS ============

// ============ PREMIUM UI WIDGETS ============

function showProcessingWidget(text, step) {
    let widget = document.getElementById('smarthirex-processing-widget');
    if (!widget) {
        widget = document.createElement('div');
        widget.id = 'smarthirex-processing-widget';
        document.body.appendChild(widget);

        // FANG Style
        widget.style.cssText = `
            position: fixed; top: 32px; left: 50%; transform: translateX(-50%);
            background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(20px);
            padding: 12px 24px; border-radius: 99px;
            box-shadow: 0 10px 40px -10px rgba(10, 102, 194, 0.25), 0 0 0 1px rgba(10, 102, 194, 0.1);
            display: flex; align-items: center; gap: 16px; z-index: 2147483647;
            font-family: system-ui, sans-serif; min-width: 340px;
            animation: widgetSlideDown 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        `;
        const style = document.createElement('style');
        style.textContent = `
            @keyframes widgetSlideDown { from { transform: translate(-50%, -100%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
            .sh-spinner { width:20px; height:20px; border:2px solid #0a66c2; border-right-color:transparent; border-radius:50%; animation:shSpin 1s linear infinite; }
            @keyframes shSpin { to { transform: rotate(360deg); } }
        `;
        document.head.appendChild(style);
    }

    if (step === -1) {
        widget.innerHTML = `<div style="font-size:20px">⚠️</div><div style="font-weight:600; color:#b91c1c">${text}</div>`;
        return;
    }

    widget.innerHTML = `
        <div class="sh-spinner"></div>
        <div style="display:flex; flex-direction:column">
            <div style="font-size:14px; font-weight:600; color:#0f172a">${text}</div>
            ${step > 0 ? `<div style="font-size:11px; color:#64748b; font-weight:500; margin-top:2px">STEP ${step} OF 4</div>` : ''}
        </div>
    `;
}

function removeProcessingWidget() {
    const w = document.getElementById('smarthirex-processing-widget');
    if (w) {
        w.style.opacity = '0'; w.style.transform = 'translate(-50%, -20px)';
        setTimeout(() => w.remove(), 300);
    }
}

function showSuccessToast(filled, review) {
    const existing = document.getElementById('smarthirex-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'smarthirex-toast';
    toast.style.cssText = `
        position: fixed; top: 24px; left: 24px;
        background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
        border: 1px solid #e2e8f0; border-radius: 12px;
        padding: 16px 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.15);
        z-index: 999999; display: flex; gap: 12px; min-width: 300px;
        animation: slideInLeft 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    toast.innerHTML = `
        <div style="font-size:24px">${filled > 0 ? '✅' : '📋'}</div>
        <div>
            <div style="font-weight:700; color:#0f172a; font-size:15px; margin-bottom:4px">
                ${filled > 0 ? `Filled ${filled} fields` : 'Ready to review'}
            </div>
            ${review > 0 ? `<div style="color:#d97706; font-size:13px; font-weight:500">Action required: ${review} fields</div>` :
            `<div style="color:#059669; font-size:13px; font-weight:500">All fields filled!</div>`}
        </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 6000);
}

function showAccordionSidebar(highConfArray, lowConfArray) {
    addAccordionStyles();

    const existing = document.getElementById('smarthirex-accordion-sidebar');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'smarthirex-accordion-sidebar';

    const createSection = (title, icon, items, cls) => {
        if (items.length === 0) return '';
        return `
            <div class="accordion-section expanded">
                <div class="section-header expanded" onclick="this.classList.toggle('expanded'); this.nextElementSibling.classList.toggle('expanded')">
                    <div class="section-title"><span class="section-icon">${icon}</span> <span>${title} (${items.length})</span></div>
                    <div style="font-size:10px">▼</div>
                </div>
                <div class="section-content expanded">
                    ${items.map(item => `
                        <div class="field-item ${cls}" onclick="document.querySelector('${item.selector}').scrollIntoView({behavior:'smooth',block:'center'}); document.querySelector('${item.selector}').focus()">
                            <div class="field-info">
                                <div class="field-label">${item.fieldData.source || 'Field'}</div>
                                <div class="field-meta">
                                    <span class="field-confidence">${Math.round((item.confidence || 0) * 100)}%</span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    };

    panel.innerHTML = `
        <div class="sidebar-header">
            <div class="header-title"><span>Form Review</span></div>
            <button class="close-btn" onclick="this.closest('#smarthirex-accordion-sidebar').remove()">×</button>
        </div>
        ${createSection('AUTO-FILLED', '✅', highConfArray, 'success-field')}
        ${createSection('NEEDS REVIEW', '⚠️', lowConfArray, 'warning-field')}
    `;

    document.body.appendChild(panel);
}

function addAccordionStyles() {
    if (document.getElementById('smarthirex-accordion-styles')) return;
    const style = document.createElement('style');
    style.id = 'smarthirex-accordion-styles';
    style.textContent = `
        #smarthirex-accordion-sidebar {
            position: fixed; bottom: 24px; left: 24px; width: 360px; max-height: 80vh;
            background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); z-index: 999999;
            display: flex; flexDirection: column; overflow: hidden;
            animation: slideInFromBottomLeft 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            font-family: system-ui, sans-serif;
        }
        @keyframes slideInFromBottomLeft {
            from { opacity: 0; transform: translateY(40px) translateX(-20px); }
            to { opacity: 1; transform: translateY(0) translateX(0); }
        }
        .sidebar-header { background: #0a66c2; color: white; padding: 16px; display: flex; justify-content: space-between; align-items: center; }
        .close-btn { background: rgba(255,255,255,0.2); border: none; color: white; border-radius: 4px; cursor: pointer; }
        .accordion-section { border-bottom: 1px solid #e5e7eb; }
        .section-header { padding: 12px 16px; background: #f8fafc; cursor: pointer; display: flex; justify-content: space-between; font-weight: 600; font-size: 13px; color: #334155; }
        .section-content { max-height: 0; overflow: hidden; transition: max-height 0.3s; }
        .section-content.expanded { max-height: 400px; overflow-y: auto; }
        .field-item { padding: 10px 16px; border-bottom: 1px solid #f1f5f9; cursor: pointer; font-size: 13px; }
        .field-item:hover { background: #f1f5f9; }
        .warning-field { border-left: 3px solid #f59e0b; background: #fffbeb; }
        .success-field { border-left: 3px solid #10b981; }
        .field-label { font-weight: 500; color: #1e293b; margin-bottom: 2px; }
        .field-meta { font-size: 11px; color: #64748b; }
        
        /* Highlight Classes - Using OUTLINE to avoid layout shifts */
        .smarthirex-filled-high { background-color: rgba(16, 185, 129, 0.05) !important; outline: 2px solid #10b981 !important; outline-offset: -2px; }
        .smarthirex-filled-medium { background-color: rgba(59, 130, 246, 0.05) !important; outline: 2px solid #3b82f6 !important; outline-offset: -2px; }
        .smarthirex-filled-low { background-color: rgba(239, 68, 68, 0.05) !important; outline: 2px solid #ef4444 !important; outline-offset: -2px; }
        
        .smarthirex-typing { 
            background: linear-gradient(90deg, transparent 0%, rgba(10,102,194,0.1) 50%, transparent 100%);
            background-size: 200% 100%; animation: shimmer 1.5s infinite;
            outline: 2px solid #0a66c2 !important; outline-offset: -2px;
        }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        
        /* Ripple Effect */
        .smarthirex-ripple {
            pointer-events: none; background: rgba(16, 185, 129, 0.2);
            animation: rippleEffect 0.6s ease-out forwards; z-index: 10000;
        }
        @keyframes rippleEffect {
            from { transform: scale(1); opacity: 0.8; }
            to { transform: scale(1.4); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

function undoFormFill() {
    return { success: true };
}


// ============ CHAT INTERFACE ============

function toggleChatInterface() {
    const existingChat = document.getElementById('smarthirex-chat-container');

    if (existingChat) {
        // Toggle visibility if it exists
        if (existingChat.style.display === 'none') {
            existingChat.style.display = 'block';
            existingChat.classList.add('slide-in');
        } else {
            existingChat.style.display = 'none';
        }
        return;
    }

    // Create container
    const container = document.createElement('div');
    container.id = 'smarthirex-chat-container';

    // Initial styles - Bottom right position
    container.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 400px;
        height: 600px;
        max-width: 90vw;
        max-height: 90vh;
        min-width: 300px;
        min-height: 200px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        z-index: 2147483647;
        overflow: visible; /* Changed to visible for resize handles */
        border: 1px solid rgba(0,0,0,0.1);
        transition: transform 0.1s ease-out;
        animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    // Add drag handle at the top (covering the header area)
    const dragHandle = document.createElement('div');
    dragHandle.title = "Click and drag to move";
    dragHandle.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 30px; /* Leave space for close button */
        height: 60px; /* Cover the approximate header height */
        cursor: move;
        z-index: 100;
        background: transparent;
    `;
    container.appendChild(dragHandle);

    // Add close button (extra overlay control)
    const closeBtn = document.createElement('div');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
        position: absolute;
        top: 10px;
        right: 12px;
        width: 24px;
        height: 24px;
        line-height: 24px;
        text-align: center;
        cursor: pointer;
        z-index: 101;
        color: white;
        font-weight: bold;
        font-family: sans-serif;
        font-size: 20px;
        opacity: 0.8;
        text-shadow: 0 1px 2px rgba(0,0,0,0.2);
    `;
    closeBtn.onclick = () => {
        container.style.display = 'none';
    };
    closeBtn.onmouseenter = () => closeBtn.style.opacity = '1';
    closeBtn.onmouseleave = () => closeBtn.style.opacity = '0.8';
    container.appendChild(closeBtn);

    // Create Iframe
    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('chat/chat.html');
    iframe.style.cssText = `
        width: 100%;
        height: 100%;
        border: none;
        background: white;
        border-radius: 12px; /* Inner radius for iframe */
    `;

    container.appendChild(iframe);

    // ============================================
    // CUSTOM RESIZERS (4 CORNERS)
    // ============================================
    const resizerSize = 15;
    const resizerStyles = `
        position: absolute;
        width: ${resizerSize}px;
        height: ${resizerSize}px;
        background: transparent;
        z-index: 200;
    `;

    // 1. Top-Left (NW)
    const resizerNW = document.createElement('div');
    resizerNW.style.cssText = `${resizerStyles} top: -5px; left: -5px; cursor: nw-resize;`;
    container.appendChild(resizerNW);

    // 2. Top-Right (NE)
    const resizerNE = document.createElement('div');
    resizerNE.style.cssText = `${resizerStyles} top: -5px; right: -5px; cursor: ne-resize;`;
    container.appendChild(resizerNE);

    // 3. Bottom-Left (SW)
    const resizerSW = document.createElement('div');
    resizerSW.style.cssText = `${resizerStyles} bottom: -5px; left: -5px; cursor: sw-resize;`;
    container.appendChild(resizerSW);

    // 4. Bottom-Right (SE)
    const resizerSE = document.createElement('div');
    resizerSE.style.cssText = `${resizerStyles} bottom: -5px; right: -5px; cursor: se-resize;`;
    container.appendChild(resizerSE);

    // Resize Logic
    setupResizer(resizerNW, 'nw');
    setupResizer(resizerNE, 'ne');
    setupResizer(resizerSW, 'sw');
    setupResizer(resizerSE, 'se');

    function setupResizer(resizer, direction) {
        let startX, startY, startWidth, startHeight, startRight, startBottom;

        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Stop drag event from propagating to container drag

            startX = e.clientX;
            startY = e.clientY;

            const rect = container.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;

            // Get computed styles for right/bottom
            const computedStyle = window.getComputedStyle(container);
            startRight = parseFloat(computedStyle.right);
            startBottom = parseFloat(computedStyle.bottom);

            // Disable iframe interactions during resize for smoothness
            iframe.style.pointerEvents = 'none';
            container.style.transition = 'none';

            function onMouseMove(e) {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;

                // NW: Drag Left/Up -> Increase Width/Height (Anchored Right/Bottom)
                if (direction === 'nw') {
                    container.style.width = `${startWidth - deltaX}px`;
                    container.style.height = `${startHeight - deltaY}px`;
                }

                // NE: Drag Right/Up -> Increase Width/Height
                if (direction === 'ne') {
                    // Increase Width by deltaX (move right)
                    container.style.width = `${startWidth + deltaX}px`;
                    // Decrease Right by deltaX (since right is fixed, increasing width to right means right pos stays, so width grows left? No. fixed right means Left edge moves.
                    // Wait. If right is fixed. Width increases. Box grows to LEFT.
                    // But we want box to grow to RIGHT.
                    // So we must DECREASE 'Right' property by deltaX?
                    // Original code:
                    container.style.width = `${startWidth + deltaX}px`;
                    container.style.right = `${startRight - deltaX}px`;
                    container.style.height = `${startHeight - deltaY}px`;
                }

                // SW: Drag Left/Down -> Increase Width.
                if (direction === 'sw') {
                    container.style.width = `${startWidth - deltaX}px`; // Move Left increases width
                    container.style.height = `${startHeight + deltaY}px`; // Move Down increases height
                    container.style.bottom = `${startBottom - deltaY}px`; // Move Down decreases bottom? 
                    // If bottom is anchored, moving mouse down means height increases DOWNWARDS?
                    // No, 'bottom' property fixes bottom edge. Increasing Height grows UPWARDS.
                    // If we want to grow DOWNWARDS, we must Decrease Bottom.
                    // Correct.
                }

                // SE: Drag Right/Down -> Increase Width/Height.
                if (direction === 'se') {
                    container.style.width = `${startWidth + deltaX}px`;
                    container.style.right = `${startRight - deltaX}px`;
                    container.style.height = `${startHeight + deltaY}px`;
                    container.style.bottom = `${startBottom - deltaY}px`;
                }
            }

            function onMouseUp() {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                // Re-enable iframe interactions
                iframe.style.pointerEvents = 'auto';
                container.style.transition = 'transform 0.1s ease-out';
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    document.body.appendChild(container);

    // Draggable functionality
    let isDragging = false;
    let dragStartX;
    let dragStartY;
    let initialRight;
    let initialBottom;

    dragHandle.addEventListener("mousedown", dragStart);
    document.addEventListener("mouseup", dragEnd);
    document.addEventListener("mousemove", drag);

    function dragStart(e) {
        if (e.target === dragHandle) {
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;

            // Get current styles
            const rect = container.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            // Calculate initial right/bottom values
            initialRight = viewportWidth - rect.right;
            initialBottom = viewportHeight - rect.bottom;

            // Disable transition during drag
            container.style.transition = 'none';
        }
    }

    function dragEnd(e) {
        if (isDragging) {
            isDragging = false;
            // Re-enable transition
            container.style.transition = 'transform 0.3s ease';
        }
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();

            const deltaX = dragStartX - e.clientX; // Moving left increases right value
            const deltaY = dragStartY - e.clientY; // Moving up increases bottom value

            container.style.right = `${initialRight + deltaX}px`;
            container.style.bottom = `${initialBottom + deltaY}px`;

            // Reset transform if it was used
            container.style.transform = 'none';
        }
    }

    // Inject keyframe animation if not present
    if (!document.getElementById('smarthirex-animations')) {
        const style = document.createElement('style');
        style.id = 'smarthirex-animations';
        style.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100px); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
}
