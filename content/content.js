// Content script - runs on all web pages
console.log('SmartHireX extension loaded');

// ============ TOKEN SYNC LISTENERS ============
// Listen for token updates from the SmartHireX website
window.addEventListener('smarthirex_token_update', (event) => {
    const token = event.detail?.token;
    if (token) {
        console.log('Token received from website, storing in extension...');
        chrome.runtime.sendMessage({
            type: 'STORE_TOKEN',
            token: token
        });
    }
});

// Also listen for window.postMessage (backup method)
window.addEventListener('message', (event) => {
    // Only accept messages from the same origin
    if (event.origin !== window.location.origin) return;

    if (event.data?.type === 'SMARTHIREX_LOGIN' && event.data?.token) {
        console.log('Token received via postMessage, storing in extension...');
        chrome.runtime.sendMessage({
            type: 'STORE_TOKEN',
            token: event.data.token
        });
    }
});
// ============================================

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'DETECT_FORMS') {
        const formCount = detectForms();
        sendResponse({ formCount });
        return true;
    }

    if (message.type === 'GET_FORM_HTML') {
        const formHTML = extractFormHTML();
        sendResponse({ html: formHTML });
        return true;
    }

    if (message.type === 'FILL_FORM') {
        const result = fillForm(message.mappings);
        sendResponse(result);
        return true;
    }

    if (message.type === 'SHOW_MISSING_DATA_MODAL') {
        // Show modal and collect user input asynchronously
        showMissingDataModal(message.missingFields, message.allFields)
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep message channel open for async response
    }
});

// Detect forms on the page
function detectForms() {
    // 1. Standard form elements
    const forms = document.querySelectorAll('form');
    if (forms.length > 0) return forms.length;

    // 2. Elements with role="form"
    const roleForms = document.querySelectorAll('[role="form"]');
    if (roleForms.length > 0) return roleForms.length;

    // 3. Workday specific detection
    const workdayContainer = document.querySelector('[data-automation-id="signInPage"], [data-automation-id="candidateHome-page"], [data-automation-id="applyManually-page"]');
    if (workdayContainer) return 1;

    // 4. Fallback: look for containers with multiple inputs and a button
    const containers = document.querySelectorAll('div, section, main');
    let dynamicFormFound = 0;

    for (const container of containers) {
        // If it's a small container or too large, skip
        if (container.children.length < 2) continue;

        const inputs = container.querySelectorAll('input:not([type="hidden"]), textarea, select');
        const buttons = container.querySelectorAll('button, [role="button"]');

        // If container has at least 2 inputs and a button, consider it a potential form
        if (inputs.length >= 2 && buttons.length >= 1) {
            // Check if this container is nested within another candidate
            const existingForms = document.querySelectorAll('form, [role="form"]');
            let isNested = false;
            for (const f of existingForms) {
                if (f.contains(container)) {
                    isNested = true;
                    break;
                }
            }
            if (!isNested) {
                dynamicFormFound = 1;
                break;
            }
        }
    }

    return dynamicFormFound;
}

// Extract form HTML
function extractFormHTML() {
    // 1. Get all standard forms
    const forms = document.querySelectorAll('form');
    if (forms.length > 0) {
        let html = '';
        forms.forEach(form => {
            html += form.outerHTML + '\n';
        });
        return html;
    }

    // 2. Look for role="form"
    const roleForms = document.querySelectorAll('[role="form"]');
    if (roleForms.length > 0) {
        let html = '';
        roleForms.forEach(form => {
            html += form.outerHTML + '\n';
        });
        return html;
    }

    // 3. Workday specific extraction
    const workdayContainer = document.querySelector('[data-automation-id="signInPage"], [data-automation-id="candidateHome-page"], [data-automation-id="applyManually-page"]');
    if (workdayContainer) {
        return workdayContainer.outerHTML;
    }

    // 4. Fallback to common input containers
    const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select');
    if (inputs.length > 0) {
        // Find the most relevant container (usually 'main' or a large div)
        const main = document.querySelector('main') || document.body;
        return main.innerHTML;
    }

    return document.body.innerHTML;
}

// Fill form with mapped data
function fillForm(mappings) {
    let filledCount = 0;
    let totalCount = Object.keys(mappings).length;
    const filledFields = [];

    for (const [selector, fieldData] of Object.entries(mappings)) {
        try {
            const element = document.querySelector(selector);

            if (!element) {
                console.warn(`Element not found: ${selector}`);
                continue;
            }

            // Handle both flat mappings (value) and nested mappings ({value: ...})
            const value = (fieldData && typeof fieldData === 'object' && fieldData.hasOwnProperty('value'))
                ? fieldData.value
                : fieldData;

            // Fill based on element type
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') {
                // Focus the element first
                element.focus();

                if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                    if (element.type === 'checkbox' || element.type === 'radio') {
                        element.checked = value === 'true' || value === true;
                    } else {
                        // Use native property setter to bypass React's value tracking
                        try {
                            const prototype = element.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
                            const nativeSetter = Object.getOwnPropertyDescriptor(prototype, "value").set;
                            nativeSetter.call(element, value);
                        } catch (e) {
                            // Fallback for non-standard environments
                            element.value = value;
                        }
                    }
                } else if (element.tagName === 'SELECT') {
                    element.value = value;
                    // Try to select by text if value doesn't match
                    if (element.value !== value) {
                        const options = element.options;
                        for (let i = 0; i < options.length; i++) {
                            if (options[i].text.toLowerCase() === value.toLowerCase()) {
                                element.selectedIndex = i;
                                break;
                            }
                        }
                    }
                }

                // Trigger events to ensure form validation
                // Use a combination of events for maximum compatibility
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));

                // For React/modern frameworks, sometimes we need to trigger the setter manually 
                // but usually dispatching input + change + blur is enough if we focused first.
                element.dispatchEvent(new Event('blur', { bubbles: true }));
            }

            // Add highlight animation
            highlightField(element);
            filledFields.push(element);
            filledCount++;

        } catch (error) {
            console.error(`Error filling ${selector}:`, error);
        }
    }

    // Scroll to first filled field
    if (filledFields.length > 0) {
        filledFields[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Find and highlight submit button
    highlightSubmitButton();

    return {
        success: true,
        filled: filledCount,
        total: totalCount
    };
}

// Highlight filled field with animation
function highlightField(element) {
    // Add highlight class
    element.classList.add('smarthirex-filled');

    // Create ripple effect
    const rect = element.getBoundingClientRect();
    const ripple = document.createElement('div');
    ripple.className = 'smarthirex-ripple';
    ripple.style.position = 'fixed';
    ripple.style.left = rect.left + 'px';
    ripple.style.top = rect.top + 'px';
    ripple.style.width = rect.width + 'px';
    ripple.style.height = rect.height + 'px';
    document.body.appendChild(ripple);

    // Remove ripple after animation
    setTimeout(() => {
        ripple.remove();
    }, 1000);

    // Remove highlight after delay
    setTimeout(() => {
        element.classList.remove('smarthirex-filled');
    }, 3000);
}

// Highlight submit button
function highlightSubmitButton() {
    const submitButtons = [
        ...document.querySelectorAll('button[type="submit"]'),
        ...document.querySelectorAll('input[type="submit"]'),
        ...document.querySelectorAll('button:not([type])'), // Some forms use button without type
    ];

    // Also look for buttons with submit-like text
    const allButtons = document.querySelectorAll('button, input[type="button"], a.button');
    allButtons.forEach(btn => {
        const text = btn.textContent || btn.value || '';
        if (/submit|apply|send|continue|next/i.test(text)) {
            submitButtons.push(btn);
        }
    });

    if (submitButtons.length > 0) {
        const submitBtn = submitButtons[0];
        submitBtn.classList.add('smarthirex-submit');
        submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Remove highlight after delay
        setTimeout(() => {
            submitBtn.classList.remove('smarthirex-submit');
        }, 5000);
    }
}

// Show missing data modal on the page
async function showMissingDataModal(missingFields, allFields) {
    return new Promise((resolve, reject) => {
        // Inject modal styles if not already present
        if (!document.getElementById('smarthirex-modal-styles')) {
            injectModalStyles();
        }

        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.id = 'smarthirex-missing-data-overlay';
        overlay.className = 'smarthirex-modal-overlay';

        // Create modal dialog
        const dialog = document.createElement('div');
        dialog.className = 'smarthirex-missing-data-dialog';

        // Dialog header
        const header = document.createElement('div');
        header.className = 'smarthirex-dialog-header';
        header.innerHTML = `
            <h3>Additional Information Needed</h3>
            <p>We need a few more details to complete the form</p>
        `;

        // Dialog content
        const content = document.createElement('div');
        content.className = 'smarthirex-dialog-content';

        // Create form fields for missing data
        const form = document.createElement('form');
        form.id = 'smarthirex-missing-data-form';

        missingFields.forEach((fieldPurpose) => {
            // Find the field details from allFields
            const fieldDetail = allFields.find(f => f.purpose === fieldPurpose);
            const label = fieldDetail ? fieldDetail.label : fieldPurpose;
            const fieldType = fieldDetail ? fieldDetail.type : 'text';

            const fieldGroup = document.createElement('div');
            fieldGroup.className = 'smarthirex-field-group';

            const fieldLabel = document.createElement('label');
            fieldLabel.textContent = label || fieldPurpose;
            fieldLabel.setAttribute('for', `smarthirex-field-${fieldPurpose}`);

            let input;
            if (fieldType === 'textarea' || fieldPurpose.includes('letter') || fieldPurpose.includes('why')) {
                input = document.createElement('textarea');
                input.rows = 4;
            } else {
                input = document.createElement('input');
                input.type = fieldType === 'email' ? 'email' : 'text';
            }

            input.id = `smarthirex-field-${fieldPurpose}`;
            input.name = fieldPurpose;
            input.placeholder = `Enter ${label || fieldPurpose}`;
            input.required = true;

            fieldGroup.appendChild(fieldLabel);
            fieldGroup.appendChild(input);
            form.appendChild(fieldGroup);
        });

        content.appendChild(form);

        // Dialog footer
        const footer = document.createElement('div');
        footer.className = 'smarthirex-dialog-footer';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'smarthirex-btn smarthirex-btn-secondary';
        cancelBtn.textContent = 'Cancel';

        const submitBtn = document.createElement('button');
        submitBtn.type = 'button';
        submitBtn.className = 'smarthirex-btn smarthirex-btn-primary';
        submitBtn.textContent = 'Continue';

        footer.appendChild(cancelBtn);
        footer.appendChild(submitBtn);

        // Assemble dialog
        dialog.appendChild(header);
        dialog.appendChild(content);
        dialog.appendChild(footer);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // Event handlers
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
            reject(new Error('User cancelled'));
        });

        submitBtn.addEventListener('click', () => {
            // Validate form
            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }

            // Collect data
            const formData = new FormData(form);
            const additionalData = {};

            for (const [key, value] of formData.entries()) {
                additionalData[key] = value;
            }

            document.body.removeChild(overlay);
            resolve(additionalData);
        });

        // Close on backdrop click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
                reject(new Error('User cancelled'));
            }
        });
    });
}

// Inject modal styles into the page
function injectModalStyles() {
    const styleId = 'smarthirex-modal-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .smarthirex-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(15, 23, 42, 0.75);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999999;
            padding: 20px;
            animation: smarthirex-fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes smarthirex-fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .smarthirex-missing-data-dialog {
            background: linear-gradient(180deg, #ffffff 0%, #fafbfc 100%);
            border-radius: 20px;
            width: 100%;
            max-width: 480px;
            max-height: 85vh;
            overflow: hidden;
            box-shadow:
                0 0 0 1px rgba(15, 23, 42, 0.05),
                0 20px 25px -5px rgba(15, 23, 42, 0.1),
                0 40px 60px -15px rgba(15, 23, 42, 0.25);
            animation: smarthirex-slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
        }

        .smarthirex-missing-data-dialog::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, #8B5CF6 0%, #6366F1 50%, #8B5CF6 100%);
            background-size: 200% 100%;
            animation: smarthirex-shimmer 3s linear infinite;
        }

        @keyframes smarthirex-shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }

        @keyframes smarthirex-slideUp {
            from {
                transform: translateY(32px) scale(0.96);
                opacity: 0;
            }
            to {
                transform: translateY(0) scale(1);
                opacity: 1;
            }
        }

        .smarthirex-dialog-header {
            padding: 32px 32px 24px 32px;
            background: linear-gradient(135deg, rgba(139, 92, 246, 0.03) 0%, rgba(99, 102, 241, 0.03) 100%);
            border-bottom: 1px solid rgba(226, 232, 240, 0.8);
            position: relative;
        }

        .smarthirex-dialog-header::before {
            content: '🎯';
            position: absolute;
            top: 24px;
            left: 32px;
            font-size: 28px;
            opacity: 0.9;
        }

        .smarthirex-dialog-header h3 {
            font-size: 22px;
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 8px;
            margin-left: 44px;
            letter-spacing: -0.02em;
            line-height: 1.3;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        }

        .smarthirex-dialog-header p {
            font-size: 14px;
            color: #64748b;
            margin-left: 44px;
            line-height: 1.5;
            font-weight: 500;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        }

        .smarthirex-dialog-content {
            padding: 24px 32px;
            max-height: calc(85vh - 200px);
            overflow-y: auto;
        }

        .smarthirex-dialog-content::-webkit-scrollbar {
            width: 8px;
        }

        .smarthirex-dialog-content::-webkit-scrollbar-track {
            background: transparent;
        }

        .smarthirex-dialog-content::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 4px;
        }

        .smarthirex-dialog-content::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
        }

        .smarthirex-field-group {
            margin-bottom: 20px;
            animation: smarthirex-slideIn 0.3s ease forwards;
            opacity: 0;
        }

        .smarthirex-field-group:nth-child(1) { animation-delay: 0.05s; }
        .smarthirex-field-group:nth-child(2) { animation-delay: 0.1s; }
        .smarthirex-field-group:nth-child(3) { animation-delay: 0.15s; }
        .smarthirex-field-group:nth-child(4) { animation-delay: 0.2s; }
        .smarthirex-field-group:nth-child(5) { animation-delay: 0.25s; }

        @keyframes smarthirex-slideIn {
            from {
                transform: translateX(-8px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        .smarthirex-field-group:last-child {
            margin-bottom: 0;
        }

        .smarthirex-field-group label {
            display: block;
            font-size: 13px;
            font-weight: 600;
            color: #0f172a;
            margin-bottom: 8px;
            letter-spacing: -0.01em;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        }

        .smarthirex-field-group label::after {
            content: '*';
            color: #ef4444;
            margin-left: 4px;
            font-weight: 700;
        }

        .smarthirex-field-group input,
        .smarthirex-field-group textarea {
            width: 100%;
            padding: 12px 14px;
            border: 1.5px solid #e2e8f0;
            border-radius: 10px;
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            background: #ffffff;
            color: #0f172a;
        }

        .smarthirex-field-group input::placeholder,
        .smarthirex-field-group textarea::placeholder {
            color: #94a3b8;
        }

        .smarthirex-field-group input:hover,
        .smarthirex-field-group textarea:hover {
            border-color: #cbd5e1;
        }

        .smarthirex-field-group input:focus,
        .smarthirex-field-group textarea:focus {
            outline: none;
            border-color: #8B5CF6;
            box-shadow:
                0 0 0 4px rgba(139, 92, 246, 0.08),
                0 1px 2px 0 rgba(0, 0, 0, 0.05);
            background: #ffffff;
        }

        .smarthirex-field-group textarea {
            resize: vertical;
            min-height: 96px;
            line-height: 1.5;
        }

        .smarthirex-dialog-footer {
            padding: 20px 32px 32px 32px;
            background: linear-gradient(180deg, rgba(248, 250, 252, 0.5) 0%, rgba(248, 250, 252, 0.8) 100%);
            border-top: 1px solid rgba(226, 232, 240, 0.8);
            display: flex;
            gap: 12px;
        }

        .smarthirex-btn {
            flex: 1;
            padding: 14px 20px;
            font-size: 15px;
            font-weight: 600;
            border-radius: 10px;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            cursor: pointer;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        }

        .smarthirex-btn-secondary {
            background: #ffffff;
            color: #475569;
            border: 1.5px solid #e2e8f0;
        }

        .smarthirex-btn-secondary:hover {
            background: #f8fafc;
            border-color: #cbd5e1;
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.04);
        }

        .smarthirex-btn-primary {
            background: linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%);
            color: white;
            border: none;
            box-shadow:
                0 0 0 1px rgba(139, 92, 246, 0.1),
                0 4px 12px rgba(139, 92, 246, 0.25);
        }

        .smarthirex-btn-primary:hover {
            background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
            box-shadow:
                0 0 0 1px rgba(139, 92, 246, 0.2),
                0 8px 20px rgba(139, 92, 246, 0.35);
            transform: translateY(-1px);
        }
    `;
    document.head.appendChild(style);
}
