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
    const forms = document.querySelectorAll('form');
    return forms.length;
}

// Extract form HTML
function extractFormHTML() {
    // Get all forms on the page
    const forms = document.querySelectorAll('form');

    if (forms.length === 0) {
        // No form tag, look for common input containers
        const body = document.body;
        return body.innerHTML;
    }

    // Return HTML of the first form (or combine multiple)
    let html = '';
    forms.forEach(form => {
        html += form.outerHTML + '\n';
    });

    return html;
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

            const value = fieldData.value;

            // Fill based on element type
            if (element.tagName === 'INPUT') {
                if (element.type === 'checkbox' || element.type === 'radio') {
                    element.checked = value === 'true' || value === true;
                } else {
                    element.value = value;
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
            } else if (element.tagName === 'TEXTAREA') {
                element.value = value;
            }

            // Trigger events to ensure form validation
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('blur', { bubbles: true }));

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
