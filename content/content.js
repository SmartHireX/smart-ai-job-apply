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
