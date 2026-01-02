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
    if (element.labels && element.labels[0]) {
        return element.labels[0].textContent.trim();
    } else if (element.placeholder) {
        return element.placeholder;
    } else if (element.name) {
        return element.name.replace(/[_-]/g, ' ');
    } else if (element.id) {
        return element.id.replace(/[_-]/g, ' ');
    }
    return 'Field';
}

function getElementSelector(element) {
    if (element.id) {
        return `#${element.id}`;
    }
    if (element.name) {
        return `input[name="${element.name}"]`;
    }
    // Fallback: use tag + nth-of-type
    const parent = element.parentElement;
    if (parent) {
        const siblings = Array.from(parent.children).filter(child =>
            child.tagName === element.tagName
        );
        const index = siblings.indexOf(element) + 1;
        return `${element.tagName.toLowerCase()}:nth-of-type(${index})`;
    }
    return element.tagName.toLowerCase();
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

function showAccordionSidebar(highConfidenceFields, lowConfidenceFields) {
    console.log('🎯 SmartHireX: Showing accordion sidebar...');
    console.log(`High-conf: ${highConfidenceFields.length}, Low-conf: ${lowConfidenceFields.length}`);

    // Remove existing sidebar if any
    const existing = document.getElementById('smarthirex-accordion-sidebar');
    if (existing) existing.remove();

    // Prepare high-confidence field info
    const autoFilledFields = highConfidenceFields.map(item => {
        const element = document.querySelector(item.selector);
        if (!element || !isFieldVisible(element)) return null;

        let label = item.fieldData.label || getFieldLabel(element);
        return {
            field: element,
            selector: item.selector,
            label,
            confidence: item.confidence,
            fieldType: item.fieldData.field_type || element.type || 'text',
            isFileUpload: false
        };
    }).filter(Boolean);

    // Prepare low-confidence field info  
    const needsReviewFields = lowConfidenceFields.map(item => {
        const element = document.querySelector(item.selector);
        if (!element || !isFieldVisible(element)) return null;

        let label = item.fieldData.label || getFieldLabel(element);
        return {
            field: element,
            selector: item.selector,
            label,
            confidence: item.confidence,
            fieldType: item.fieldData.field_type || element.type || 'text',
            isFileUpload: false
        };
    }).filter(Boolean);

    // Detect file upload fields
    const fileUploadFields = [];
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach(fileInput => {
        if (!isFieldVisible(fileInput)) return;

        let label = getFieldLabel(fileInput) || 'File Upload';

        if (!fileInput.files || fileInput.files.length === 0) {
            fileUploadFields.push({
                field: fileInput,
                selector: getElementSelector(fileInput),
                label,
                confidence: 1.0,
                fieldType: 'file',
                isFileUpload: true
            });
        }
    });

    if (autoFilledFields.length === 0 && needsReviewFields.length === 0 && fileUploadFields.length === 0) {
        console.log('No fields to show in sidebar');
        return;
    }

    // Create accordion sidebar panel
    const panel = document.createElement('div');
    panel.id = 'smarthirex-accordion-sidebar';
    panel.innerHTML = `
        <div class="sidebar-header">
            <div class="header-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                </svg>
                <span>Form Review</span>
            </div>
            <button class="close-btn" id="smarthirex-sidebar-close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
        
        ${autoFilledFields.length > 0 ? `
            <div class="accordion-section">
                <div class="section-header collapsed" data-section="autofilled">
                    <div class="section-title">
                        <span class="section-icon">✅</span>
                        <span class="section-label">AUTO-FILLED</span>
                        <span class="section-count">(${autoFilledFields.length})</span>
                    </div>
                    <svg class="toggle-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                </div>
                <div class="section-content" id="autofilled-content">
                    ${autoFilledFields.map((item, i) => `
                        <div class="field-item success-field" data-field-idx="auto-${i}">
                            <div class="field-info">
                                <div class="field-label">${item.label}</div>
                                <div class="field-meta">
                                    <span class="field-type">${item.fieldType.toUpperCase()}</span>
                                    <span class="field-confidence medium">${Math.round(item.confidence * 100)}%</span>
                                </div>
                            </div>
                            <svg class="field-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <polyline points="9 18 15 12 9 6"/>
                            </svg>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
        
        ${needsReviewFields.length > 0 ? `
            <div class="accordion-section">
                <div class="section-header expanded" data-section="needs-review">
                    <div class="section-title">
                        <span class="section-icon">⚠️</span>
                        <span class="section-label">NEEDS REVIEW</span>
                        <span class="section-count">(${needsReviewFields.length})</span>
                    </div>
                    <svg class="toggle-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                </div>
                <div class="section-content expanded" id="needsreview-content">
                    ${needsReviewFields.map((item, i) => `
                        <div class="field-item warning-field" data-field-idx="review-${i}">
                            <div class="field-info">
                                <div class="field-label">${item.label}</div>
                                <div class="field-meta">
                                    <span class="field-type">${item.fieldType.toUpperCase()}</span>
                                    <span class="field-confidence ${item.confidence >= 0.7 ? 'medium' : 'low'}">${Math.round(item.confidence * 100)}%</span>
                                </div>
                            </div>
                            <svg class="field-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <polyline points="9 18 15 12 9 6"/>
                            </svg>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
        
        ${fileUploadFields.length > 0 ? `
            <div class="accordion-section">
                <div class="section-header expanded" data-section="file-uploads">
                    <div class="section-title">
                        <span class="section-icon">📎</span>
                        <span class="section-label">FILE UPLOADS</span>
                        <span class="section-count">(${fileUploadFields.length})</span>
                    </div>
                    <svg class="toggle-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                </div>
                <div class="section-content expanded" id="fileuploads-content">
                    ${fileUploadFields.map((item, i) => `
                        <div class="field-item file-field" data-field-idx="file-${i}">
                            <div class="field-info">
                                <div class="field-label">${item.label}</div>
                                <div class="field-meta">
                                    <span class="field-type">FILE</span>
                                    <span class="field-badge">Required</span>
                                </div>
                            </div>
                            <svg class="field-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <polyline points="9 18 15 12 9 6"/>
                            </svg>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
    `;

    // Add accordion styles
    addAccordionStyles();

    document.body.appendChild(panel);

    // Add close handler securely
    const sidebarCloseBtn = panel.querySelector('#smarthirex-sidebar-close');
    if (sidebarCloseBtn) {
        sidebarCloseBtn.addEventListener('click', () => {
            const sidebar = document.getElementById('smarthirex-accordion-sidebar');
            if (sidebar) sidebar.remove();
            document.querySelectorAll('.smarthirex-field-highlight').forEach(el => el.classList.remove('smarthirex-field-highlight'));
        });
    }

    // Highlight fields that need review
    needsReviewFields.forEach(item => {
        item.field.classList.add('smarthirex-field-highlight');
    });

    // Add toggle handlers for accordion sections
    const headers = panel.querySelectorAll('.section-header');
    headers.forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const isExpanded = header.classList.contains('expanded');

            if (isExpanded) {
                // Close this section
                header.classList.remove('expanded');
                header.classList.add('collapsed');
                content.classList.remove('expanded');
            } else {
                // Close all other sections first
                headers.forEach(otherHeader => {
                    const otherContent = otherHeader.nextElementSibling;
                    otherHeader.classList.remove('expanded');
                    otherHeader.classList.add('collapsed');
                    otherContent.classList.remove('expanded');
                });

                // Then open this section
                header.classList.remove('collapsed');
                header.classList.add('expanded');
                content.classList.add('expanded');
            }
        });
    });

    // Add click handlers for field items  
    const allFields = [...autoFilledFields, ...needsReviewFields, ...fileUploadFields];
    panel.querySelectorAll('.field-item').forEach((fieldItem, index) => {
        const field = allFields[Math.min(index, allFields.length - 1)];
        if (field) {
            fieldItem.addEventListener('click', () => {
                field.field.scrollIntoView({ behavior: 'smooth', block: 'center' });
                field.field.focus();
            });
        }
    });
}

function addAccordionStyles() {
    if (document.getElementById('smarthirex-accordion-styles')) return;

    const style = document.createElement('style');
    style.id = 'smarthirex-accordion-styles';
    style.textContent = `
        #smarthirex-accordion-sidebar {
            position: fixed;
            bottom: 24px;
            left: 24px;
            width: 360px;
            max-height: 80vh;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            box-shadow: 
                0 4px 6px -1px rgba(0, 0, 0, 0.1),
                0 2px 4px -1px rgba(0, 0, 0, 0.06),
                0 0 0 1px rgba(0,0,0,0.05);
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            animation: slideInFromBottomLeft 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        
        @keyframes slideInFromBottomLeft {
            from {
                opacity: 0;
                transform: translateY(40px) translateX(-20px) scale(0.95);
            }
            to {
                opacity: 1;
                transform: translateY(0) translateX(0) scale(1);
            }
        }
        
        #smarthirex-accordion-sidebar .sidebar-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            background: #0a66c2;
            color: white;
            border-radius: 8px 8px 0 0;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        
        #smarthirex-accordion-sidebar .header-title {
            display: flex;
            align-items: center;
            gap: 10px;
            font-weight: 700;
            font-size: 15px;
            color: white;
            letter-spacing: -0.01em;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }

        #smarthirex-accordion-sidebar .header-title svg {
            color: white;
            opacity: 0.9;
        }
        
        #smarthirex-accordion-sidebar .close-btn {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: #ffffff !important;
            width: 28px;
            height: 28px;
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            backdrop-filter: blur(4px);
        }
        
        #smarthirex-accordion-sidebar .close-btn:hover {
            background: rgba(255, 255, 255, 0.25);
            color: white;
            transform: scale(1.05);
            border-color: rgba(255, 255, 255, 0.4);
        }
        
        #smarthirex-accordion-sidebar .accordion-section {
            border-bottom: 1px solid #e5e7eb;
        }
        
        #smarthirex-accordion-sidebar .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 20px 14px 17px;
            cursor: pointer;
            transition: all 0.2s;
            user-select: none;
            background: #f8fafc;
            border: 1px solid rgba(10,102,194,0.15);
            border-left: 3px solid #0a66c2;
            box-shadow: 0 1px 2px rgba(0,0,0,0.02);
        }
        
        #smarthirex-accordion-sidebar .section-header:hover {
            background: #f9fafb;
        }
        
        #smarthirex-accordion-sidebar .section-title {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 600;
            font-size: 13px;
            color: #374151;
        }
        
        #smarthirex-accordion-sidebar .section-icon {
            font-size: 16px;
        }
        
        #smarthirex-accordion-sidebar .section-count {
            color: #6b7280;
            font-weight: 500;
        }
        
        #smarthirex-accordion-sidebar .toggle-icon {
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            color: #9ca3af;
        }
        
        #smarthirex-accordion-sidebar .section-header.expanded .toggle-icon {
            transform: rotate(180deg);
        }
        
        #smarthirex-accordion-sidebar .section-content {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        #smarthirex-accordion-sidebar .section-content.expanded {
            max-height: 500px;
            overflow-y: auto;
        }
        
        #smarthirex-accordion-sidebar .field-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 20px;
            cursor: pointer;
            transition: all 0.2s;
            border-left: 3px solid transparent;
            border-bottom: 1px solid #f3f4f6;
            background: #f9fafb;
        }
        
        #smarthirex-accordion-sidebar .field-item:hover {
            background: #eff0f3ff;
            border-left-color: #64748b;
        }
        
        #smarthirex-accordion-sidebar .field-info {
            flex: 1;
        }
        
        #smarthirex-accordion-sidebar .field-meta {
            display: flex;
            gap: 8px;
            font-size: 11px;
        }
        
        #smarthirex-accordion-sidebar .field-type {
            color: #6b7280;
            font-weight: 500;
        }
        
        #smarthirex-accordion-sidebar .field-confidence {
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
        }
        
        #smarthirex-accordion-sidebar .field-confidence.low {
            background: #fef2f2;
            color: #b91c1c;
            border: 1px solid #fecaca;
        }
        
        #smarthirex-accordion-sidebar .field-confidence.medium {
            background: #eff6ff;
            color: #0a66c2;
            border: 1px solid #dbeafe;
        }
        
        #smarthirex-accordion-sidebar .field-badge {
            color: #10b981;
            font-weight: 600;
        }
        
        #smarthirex-accordion-sidebar .field-arrow {
            color: #d1d5db;
            transition: all 0.2s;
        }
        
        #smarthirex-accordion-sidebar .field-item:hover .field-arrow {
            color: #8b5cf6;
            transform: translateX(4px);
        }
        
        .smarthirex-field-highlight {
            outline: 2px solid #f59e0b !important;
            outline-offset: 2px !important;
            animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite !important;
        }
        
        @keyframes pulse {
            0%, 100% { outline-color: #f59e0b; }
            50% { outline-color: #fbbf24; }
        }

        /* PREMIUM GHOST TYPER STYLES - "Magical Shimmer" */
        .smarthirex-typing {
            background: linear-gradient(
                90deg, 
                rgba(10, 102, 194, 0.0) 0%, 
                rgba(10, 102, 194, 0.1) 25%, 
                rgba(10, 102, 194, 0.25) 50%, 
                rgba(10, 102, 194, 0.1) 75%, 
                rgba(10, 102, 194, 0.0) 100%
            ) !important;
            background-size: 200% 100% !important;
            animation: magicalShimmer 1s infinite linear !important;
            border-color: #0a66c2 !important;
            box-shadow: 
                0 0 0 4px rgba(10, 102, 194, 0.15),
                0 0 15px rgba(10, 102, 194, 0.2) !important;
            transition: all 0.2s ease !important;
            position: relative !important;
        }

        @keyframes magicalShimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
        }
        
        .smarthirex-filled {
            background-color: rgba(16, 185, 129, 0.05) !important;
            border-color: #10b981 !important;
            transition: background-color 0.5s ease !important;
        }

        .smarthirex-filled-high {
            background-color: rgba(16, 185, 129, 0.05) !important;
            border: 2px solid #10b981 !important;
            outline: none !important;
            transition: all 0.3s ease !important;
        }
        
        .smarthirex-filled-medium {
            background-color: rgba(59, 130, 246, 0.05) !important;
            border: 2px solid #3b82f6 !important;
            outline: none !important;
            transition: all 0.3s ease !important;
        }
        
        .smarthirex-filled-low {
            background-color: rgba(239, 68, 68, 0.05) !important;
            border: 2px solid #ef4444 !important;
            outline: none !important;
            transition: all 0.3s ease !important;
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
