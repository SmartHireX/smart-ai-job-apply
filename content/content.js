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

        // Note: Unfilled field highlighting is now handled by showLowConfidenceFieldsSidebar
        // in the preview modal flow, so we don't need to call highlightUnfilledFields here
        // to avoid showing duplicate UI elements

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

    if (message.type === 'SHOW_PREVIEW_MODAL') {
        // Show preview modal - form will be filled directly in content script
        (async () => {
            try {
                const data = await showPreviewModal(message.mappings, message.analysis, message.allFields);
                sendResponse({ success: true, data });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();

        return true; // Keep message channel open for async response
    }

    if (message.type === 'UNDO_FILL') {
        // Undo the last form fill
        const result = undoFormFill();
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

// ============================================
// ENTERPRISE FORM FILLING HELPERS - Phase 1
// ============================================

/**
 * Check if a field is visible (security: prevent AutoSpill attacks)
 */
function isFieldVisible(element) {
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
    } catch {
        return false;
    }
}

/**
 * Validate field value before filling
 */
function validateFieldValue(value, fieldType) {
    if (!value) return { valid: true, value };

    const validations = {
        email: {
            test: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
            message: 'Invalid email format'
        },
        tel: {
            test: (v) => v.replace(/\D/g, '').length >= 10,
            message: 'Phone number too short'
        },
        url: {
            test: (v) => {
                try {
                    new URL(v.startsWith('http') ? v : `https://${v}`);
                    return true;
                } catch {
                    return false;
                }
            },
            message: 'Invalid URL'
        }
    };

    const validator = validations[fieldType];
    if (validator && !validator.test(value)) {
        return { valid: false, reason: validator.message, value };
    }

    return { valid: true, value };
}

/**
 * Normalize value based on field type
 */
function normalizeValue(value, fieldType) {
    if (!value) return value;

    switch (fieldType) {
        case 'url':
            // Add https:// if missing
            return value.startsWith('http') ? value : `https://${value}`;
        case 'email':
            // Trim and lowercase
            return value.trim().toLowerCase();
        case 'tel':
            // Remove non-digits for storage, but keep formatted for display
            return value.trim();
        default:
            return value;
    }
}

/**
 * Enhanced field value setter with React compatibility
 * Handles ALL input types like enterprise tools (1Password, LastPass)
 */
function setFieldValue(element, value) {
    const tagName = element.tagName;
    const inputType = element.type?.toLowerCase();

    // Focus the element first for better event handling
    try {
        element.focus();
    } catch (e) {
        // Some elements can't be focused, that's okay
    }

    // Handle different input types
    if (tagName === 'INPUT') {
        switch (inputType) {
            case 'radio':
                setRadioValue(element, value);
                break;
            case 'checkbox':
                setCheckboxValue(element, value);
                break;
            case 'date':
            case 'datetime-local':
            case 'time':
            case 'month':
            case 'week':
                setDateTimeValue(element, value);
                break;
            case 'number':
            case 'range':
                setNumberValue(element, value);
                break;
            case 'color':
                setColorValue(element, value);
                break;
            case 'file':
                // Can't programmatically set file inputs for security reasons
                highlightFileField(element);
                return; // Don't dispatch events
            default:
                // text, email, tel, url, password, search, etc.
                setTextValue(element, value);
                break;
        }
    } else if (tagName === 'TEXTAREA') {
        setTextValue(element, value);
    } else if (tagName === 'SELECT') {
        setSelectValue(element, value);
    }

    // Dispatch comprehensive event sequence for React/Vue/Angular compatibility
    dispatchChangeEvents(element);
}

/**
 * Set radio button value (enterprise approach)
 */
function setRadioValue(element, value) {
    // For radio buttons, we need to find the correct option in the group
    const name = element.name;
    if (!name) {
        // Single radio without a group, just check if value matches
        element.checked = (element.value == value || value === true || value === 'true');
        return;
    }

    // Find all radios in the same group
    const radioGroup = document.querySelectorAll(`input[type="radio"][name="${name}"]`);

    // Try to match by value first
    let matched = false;
    radioGroup.forEach(radio => {
        if (radio.value.toLowerCase() === value.toString().toLowerCase()) {
            radio.checked = true;
            matched = true;
        } else {
            radio.checked = false;
        }
    });

    // If no match by value, try matching by label text
    if (!matched) {
        radioGroup.forEach(radio => {
            const label = findLabelText(radio);
            if (label && label.toLowerCase().includes(value.toString().toLowerCase())) {
                radio.checked = true;
                matched = true;
            }
        });
    }

    // If still no match, check the first option as fallback
    if (!matched && radioGroup.length > 0) {
        radioGroup[0].checked = true;
    }
}

/**
 * Set checkbox value
 */
function setCheckboxValue(element, value) {
    // Handle various truthy/falsy representations
    const truthyValues = [true, 'true', 'yes', '1', 'on', 'checked'];
    const isTruthy = truthyValues.includes(value?.toString().toLowerCase());
    element.checked = isTruthy;
}

/**
 * Set date/time input value
 */
function setDateTimeValue(element, value) {
    // Try to format value appropriately for the input type
    try {
        let formattedValue = value;

        if (element.type === 'date') {
            // Ensure format is YYYY-MM-DD
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                formattedValue = date.toISOString().split('T')[0];
            }
        } else if (element.type === 'datetime-local') {
            // Ensure format is YYYY-MM-DDThh:mm
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                formattedValue = date.toISOString().slice(0, 16);
            }
        } else if (element.type === 'time') {
            // Ensure format is hh:mm
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                formattedValue = date.toTimeString().slice(0, 5);
            }
        }

        element.value = formattedValue;
    } catch (e) {
        // Fallback to direct value setting
        element.value = value;
    }
}

/**
 * Set number/range input value
 */
function setNumberValue(element, value) {
    // Ensure value is numeric
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
        // Check min/max constraints
        const min = element.min ? parseFloat(element.min) : -Infinity;
        const max = element.max ? parseFloat(element.max) : Infinity;
        const clampedValue = Math.min(Math.max(numValue, min), max);
        element.value = clampedValue;
    } else {
        element.value = value;
    }
}

/**
 * Set color picker value
 */
function setColorValue(element, value) {
    // Ensure value is in #RRGGBB format
    let colorValue = value.toString();
    if (!colorValue.startsWith('#')) {
        colorValue = '#' + colorValue;
    }
    element.value = colorValue;
}

/**
 * Set text-based input value (with React compatibility)
 */
function setTextValue(element, value) {
    // Use native property setter to bypass React's value tracking
    try {
        const prototype = element.tagName === 'INPUT'
            ? window.HTMLInputElement.prototype
            : window.HTMLTextAreaElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
        nativeSetter.call(element, value);
    } catch (e) {
        // Fallback for non-standard environments
        element.value = value;
    }
}

/**
 * Set select dropdown value (including multi-select)
 */
function setSelectValue(element, value) {
    if (element.multiple) {
        // Handle multi-select
        const values = Array.isArray(value) ? value : [value];
        Array.from(element.options).forEach(option => {
            option.selected = values.includes(option.value) ||
                values.some(v => option.text.toLowerCase().includes(v.toString().toLowerCase()));
        });
    } else {
        // Single select
        element.value = value;

        // Try to select by text if value doesn't match
        if (element.value !== value) {
            const options = element.options;
            for (let i = 0; i < options.length; i++) {
                if (options[i].text.toLowerCase() === value.toString().toLowerCase()) {
                    element.selectedIndex = i;
                    break;
                }
            }
        }
    }
}

/**
 * Dispatch change events for framework compatibility
 */
function dispatchChangeEvents(element) {
    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));

    // For some React versions, also dispatch InputEvent
    try {
        element.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            data: element.value
        }));
    } catch {
        // InputEvent not supported in all browsers, ignore
    }

    // For radio/checkbox, also trigger click event
    if (element.type === 'radio' || element.type === 'checkbox') {
        element.dispatchEvent(new Event('click', { bubbles: true }));
    }
}

/**
 * Find label text for an element
 */
function findLabelText(element) {
    // Check for aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    // Check for associated label
    if (element.id) {
        const label = document.querySelector(`label[for="${element.id}"]`);
        if (label) return label.textContent.trim();
    }

    // Check for parent label
    const parentLabel = element.closest('label');
    if (parentLabel) return parentLabel.textContent.trim();

    // Check for previous sibling label
    const prevLabel = element.previousElementSibling;
    if (prevLabel && prevLabel.tagName === 'LABEL') {
        return prevLabel.textContent.trim();
    }

    return '';
}

/**
 * Highlight file input field since we can't fill it programmatically
 */
function highlightFileField(element) {
    element.style.outline = '3px solid #F59E0B';
    element.style.outlineOffset = '2px';
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ============================================
// END ENTERPRISE HELPERS
// ============================================

// Fill form with mapped data
function fillForm(mappings) {
    // Validate mappings
    if (!mappings || typeof mappings !== 'object' || Object.keys(mappings).length === 0) {
        return {
            success: false,
            filled: 0,
            total: 0,
            canUndo: false,
            fileFields: [],
            error: 'Invalid or empty mappings'
        };
    }

    let filledCount = 0;
    let totalCount = Object.keys(mappings).length;
    const filledFields = [];
    const originalValues = {}; // Store original values for undo

    for (const [selector, fieldData] of Object.entries(mappings)) {
        try {
            const element = document.querySelector(selector);

            if (!element) {
                continue;
            }

            // SECURITY: Skip hidden fields to prevent AutoSpill attacks
            if (!isFieldVisible(element)) {
                continue;
            }

            // Save original value before filling
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                if (element.type === 'checkbox' || element.type === 'radio') {
                    originalValues[selector] = element.checked;
                } else {
                    originalValues[selector] = element.value;
                }
            } else if (element.tagName === 'SELECT') {
                originalValues[selector] = element.value;
            }

            // Handle both flat mappings (value) and nested mappings ({value: ..., field_type: ...})
            const value = (fieldData && typeof fieldData === 'object' && fieldData.hasOwnProperty('value'))
                ? fieldData.value
                : fieldData;

            const fieldType = fieldData?.field_type || element.type;

            // VALIDATION: Validate value before filling
            const validation = validateFieldValue(value, fieldType);
            if (!validation.valid) {
                // Skip invalid values
                continue;
            }

            // NORMALIZATION: Normalize value based on field type
            const normalizedValue = normalizeValue(value, fieldType);

            // Fill based on element type using enterprise helper
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') {
                setFieldValue(element, normalizedValue);
            }

            // Add highlight animation
            highlightField(element);
            filledFields.push(element);
            filledCount++;

        } catch (error) {
            // Silently skip fields that can't be filled
        }
    }

    // Scroll to first filled field
    if (filledFields.length > 0) {
        filledFields[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Find and highlight submit button
    highlightSubmitButton();

    // Detect and highlight file upload fields
    // NOTE: File field highlighting removed - now handled by low-confidence sidebar
    // const fileFields = detectFileFields();
    // if (fileFields.length > 0) {
    //     // Highlight file fields after a short delay
    //     setTimeout(() => {
    //         highlightFileFields(fileFields);
    //     }, 1000);
    // }

    // Store original values in sessionStorage for undo (expires in 5 minutes)
    const undoData = {
        originalValues,
        timestamp: Date.now(),
        expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes
    };
    try {
        sessionStorage.setItem('smarthirex_undo_data', JSON.stringify(undoData));
    } catch (e) {
        console.warn('Could not store undo data:', e);
    }

    return {
        success: true,
        filled: filledCount,
        total: totalCount,
        canUndo: Object.keys(originalValues).length > 0,
        fileFields: [] // File fields now handled by sidebar, not returned here
    };
}

/**
 * Show sidebar for low-confidence fields that need manual review
 * @param {Array} skippedFields - Array of {selector, fieldData, confidence}
 */
function showLowConfidenceFieldsSidebar(skippedFields) {
    console.log('🎯 SmartHireX: Showing low-confidence fields sidebar...');

    const fieldsWithInfo = skippedFields.map(item => {
        const element = document.querySelector(item.selector);
        if (!element || !isFieldVisible(element)) return null;

        let label = item.fieldData.label || 'Field';
        if (!label || label === 'Field') {
            if (element.labels && element.labels[0]) {
                label = element.labels[0].textContent.trim();
            } else if (element.placeholder) {
                label = element.placeholder;
            } else if (element.name) {
                label = element.name.replace(/[_-]/g, ' ');
            } else if (element.id) {
                label = element.id.replace(/[_-]/g, ' ');
            }
        }

        return {
            field: element,
            label,
            confidence: item.confidence,
            fieldType: item.fieldData.field_type || element.type || 'text',
            isFileUpload: false
        };
    }).filter(Boolean);

    // Also detect file upload fields
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach(fileInput => {
        if (!isFieldVisible(fileInput)) return;

        let label = 'File Upload';
        if (fileInput.labels && fileInput.labels[0]) {
            label = fileInput.labels[0].textContent.trim();
        } else if (fileInput.name) {
            label = fileInput.name.replace(/[_-]/g, ' ');
        } else if (fileInput.id) {
            label = fileInput.id.replace(/[_-]/g, ' ');
        }

        // Check if not already filled
        if (!fileInput.files || fileInput.files.length === 0) {
            fieldsWithInfo.push({
                field: fileInput,
                label,
                confidence: 1.0,  // File uploads are high priority
                fieldType: 'file',
                isFileUpload: true
            });
        }
    });

    if (fieldsWithInfo.length === 0) {
        console.log('No visible low-confidence fields or file uploads to show');
        return;
    }

    console.log(`Found ${fieldsWithInfo.length} low-confidence fields to display`);

    // Create the sidebar panel
    const panel = document.createElement('div');
    panel.id = 'smarthirex-lowconf-panel';
    panel.innerHTML = `
        <div class="panel-header">
            <div class="header-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
            </div>
            <div class="header-content">
                <div class="header-title">
                    <span id="lowconf-count" class="count-badge">${fieldsWithInfo.length}</span>
                    <span class="header-text">field${fieldsWithInfo.length > 1 ? 's' : ''} needing attention</span>
                </div>
                <div class="header-subtitle">Please review and complete</div>
            </div>
            <button class="close-btn" onclick="this.closest('#smarthirex-lowconf-panel').remove(); document.querySelectorAll('.smarthirex-lowconf-overlay').forEach(el => el.remove()); document.querySelectorAll('.smarthirex-lowconf-highlight').forEach(el => el.classList.remove('smarthirex-lowconf-highlight'))">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
        <div class="panel-divider"></div>
        <div class="panel-list">
            ${fieldsWithInfo.map((item, i) => {
        const confidencePercent = Math.round(item.confidence * 100);
        const confidenceClass = item.confidence >= 0.7 ? 'medium' : 'low';

        // Special styling for file uploads
        const isFile = item.isFileUpload;
        const fieldIcon = isFile ? '📎' : (i + 1);
        const fieldNumClass = isFile ? 'file-upload-icon' : '';

        return `
                    <div class="field-item ${isFile ? 'file-upload-item' : ''}" data-idx="${i}">
                        <div class="field-number ${fieldNumClass}">${fieldIcon}</div>
                        <div class="field-content">
                            <div class="field-label">${item.label}</div>
                            <div class="field-hint">
                                <span class="field-type-badge ${isFile ? 'file-badge' : ''}">${isFile ? 'FILE UPLOAD' : item.fieldType.toUpperCase()}</span>
                                ${!isFile ? `<span class="field-confidence-badge ${confidenceClass}">${confidencePercent}% confidence</span>` : '<span class="field-priority-badge">Required</span>'}
                            </div>
                        </div>
                        <div class="field-arrow">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <polyline points="9 18 15 12 9 6"/>
                            </svg>
                        </div>
                    </div>
                `;
    }).join('')}
        </div>
        <div class="panel-footer">
            <div class="footer-icon">⚠️</div>
            <div class="footer-text">Confidence below 90% - verify before submitting</div>
        </div>
    `;

    document.body.appendChild(panel);

    // Add highlighting to low-confidence fields
    fieldsWithInfo.forEach((item, index) => {
        const field = item.field;

        // Add highlighting
        field.classList.add('smarthirex-lowconf-highlight');

        // Create badge overlay
        const overlay = document.createElement('div');
        overlay.className = 'smarthirex-lowconf-overlay';
        const confidencePercent = Math.round(item.confidence * 100);
        overlay.innerHTML = `
            <div class="lowconf-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M12 20h9"/>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
                <span>Review (${confidencePercent}%)</span>
            </div>
        `;

        const rect = field.getBoundingClientRect();
        overlay.style.position = 'absolute';
        overlay.style.left = `${rect.left + window.scrollX}px`;
        overlay.style.top = `${rect.top + window.scrollY - 46}px`;
        overlay.style.zIndex = '999998';

        document.body.appendChild(overlay);

        // Scroll to first field
        if (index === 0) {
            setTimeout(() => field.scrollIntoView({ behavior: 'smooth', block: 'center' }), 500);
        }

        // Remove when filled
        field.addEventListener('input', () => {
            if (field.value) {
                field.classList.remove('smarthirex-lowconf-highlight');
                if (overlay.parentNode) overlay.remove();
                updateLowConfCount();
            }
        }, { once: true });
    });

    // Add styles for low-confidence sidebar (FANG Enterprise Premium Design)
    if (!document.getElementById('lowconf-sidebar-styles')) {
        const style = document.createElement('style');
        style.id = 'lowconf-sidebar-styles';
        style.textContent = `
            #smarthirex-lowconf-panel {
                position: fixed;
                left: 24px;
                bottom: 24px;
                width: 400px;
                max-height: 520px;
                background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.98) 100%);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border-radius: 20px;
                box-shadow: 
                    0 0 0 1px rgba(0, 0, 0, 0.04),
                    0 8px 16px -4px rgba(0, 0, 0, 0.08),
                    0 20px 40px -8px rgba(0, 0, 0, 0.12),
                    0 32px 64px -12px rgba(0, 0, 0, 0.14);
                z-index: 2147483647 !important;
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Segoe UI", Roboto, sans-serif;
                animation: slideInFromBottomLeft 0.6s cubic-bezier(0.16, 1, 0.3, 1);
                border: 1px solid rgba(245, 158, 11, 0.1);
                overflow: hidden;
            }
            
            @keyframes slideInFromBottomLeft {
                from { 
                    transform: translateY(40px) translateX(-20px) scale(0.95); 
                    opacity: 0; 
                }
                to { 
                    transform: translateY(0) translateX(0) scale(1); 
                    opacity: 1; 
                }
            }
            
            #smarthirex-lowconf-panel::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 3px;
                background: linear-gradient(90deg, 
                    #f59e0b 0%, 
                    #f97316 25%, 
                    #fb923c 50%, 
                    #f97316 75%, 
                    #f59e0b 100%);
                background-size: 200% 100%;
                animation: shimmer 3s linear infinite;
            }
            
            @keyframes shimmer {
                0% { background-position: 200% 0; }
                100% { background-position: -200% 0; }
            }
            
            #smarthirex-lowconf-panel .panel-header {
                padding: 24px 24px 20px 24px;
                background: linear-gradient(135deg, rgba(251, 146, 60, 0.04) 0%, rgba(249, 115, 22, 0.06) 100%);
                border-bottom: 1px solid rgba(0, 0, 0, 0.06);
                display: flex;
                align-items: flex-start;
                gap: 14px;
            }
            
            #smarthirex-lowconf-panel .header-icon {
                width: 42px;
                height: 42px;
                background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%);
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                flex-shrink: 0;
                box-shadow: 0 4px 12px rgba(245, 158, 11, 0.25);
            }
            
            #smarthirex-lowconf-panel .header-content {
                flex: 1;
                min-width: 0;
            }
            
            #smarthirex-lowconf-panel .header-title {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 6px;
            }
            
            #smarthirex-lowconf-panel .count-badge {
                background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%);
                color: white;
                padding: 4px 10px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 700;
                letter-spacing: -0.3px;
                box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
            }
            
            #smarthirex-lowconf-panel .header-text {
                font-size: 16px;
                font-weight: 600;
                color: #0f172a;
                letter-spacing: -0.4px;
            }
            
            #smarthirex-lowconf-panel .header-subtitle {
                font-size: 13px;
                color: #64748b;
                font-weight: 500;
                letter-spacing: -0.1px;
            }
            
            #smarthirex-lowconf-panel .close-btn {
                width: 32px;
                height: 32px;
                background: rgba(248, 250, 252, 0.8);
                border: 1px solid rgba(0, 0, 0, 0.06);
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                color: #64748b;
                flex-shrink: 0;
            }
            
            #smarthirex-lowconf-panel .close-btn:hover {
                background: rgba(241, 245, 249, 1);
                border-color: rgba(0, 0, 0, 0.1);
                color: #334155;
                transform: scale(1.05);
            }
            
            #smarthirex-lowconf-panel .panel-divider {
                height: 1px;
                background: linear-gradient(to right, 
                    transparent, 
                    rgba(0, 0, 0, 0.08) 20%, 
                    rgba(0, 0, 0, 0.08) 80%, 
                    transparent);
                margin: 0;
            }
            
            #smarthirex-lowconf-panel .panel-list {
                padding: 16px 16px 12px 16px;
                max-height: 340px;
                overflow-y: auto;
                overflow-x: hidden;
            }
            
            #smarthirex-lowconf-panel .panel-list::-webkit-scrollbar {
                width: 6px;
            }
            
            #smarthirex-lowconf-panel .panel-list::-webkit-scrollbar-track {
                background: transparent;
            }
            
            #smarthirex-lowconf-panel .panel-list::-webkit-scrollbar-thumb {
                background: rgba(203, 213, 225, 0.6);
                border-radius: 3px;
            }
            
            #smarthirex-lowconf-panel .panel-list::-webkit-scrollbar-thumb:hover {
                background: rgba(148, 163, 184, 0.8);
            }
            
            #smarthirex-lowconf-panel .field-item {
                display: flex;
                align-items: center;
                gap: 14px;
                padding: 14px 16px;
                margin-bottom: 10px;
                background: linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.6) 100%);
                border: 1px solid rgba(0, 0, 0, 0.06);
                border-radius: 14px;
                cursor: pointer;
                transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
                overflow: hidden;
            }
            
            #smarthirex-lowconf-panel .field-item::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(249, 115, 22, 0.08) 100%);
                opacity: 0;
                transition: opacity 0.25s ease;
            }
            
            #smarthirex-lowconf-panel .field-item:hover {
                background: rgba(255, 255, 255, 0.9);
                border-color: rgba(245, 158, 11, 0.3);
                transform: translateX(6px) scale(1.02);
                box-shadow: 
                    0 4px 12px rgba(0, 0, 0, 0.08),
                    0 0 0 1px rgba(245, 158, 11, 0.1);
            }
            
            #smarthirex-lowconf-panel .field-item:hover::before {
                opacity: 1;
            }
            
            #smarthirex-lowconf-panel .field-item:active {
                transform: translateX(4px) scale(0.98);
            }
            
            #smarthirex-lowconf-panel .field-number {
                width: 28px;
                height: 28px;
                background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(249, 115, 22, 0.15));
                color: #ea580c;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                font-weight: 700;
                flex-shrink: 0;
                position: relative;
                z-index: 1;
                border: 1px solid rgba(245, 158, 11, 0.2);
            }
            
            #smarthirex-lowconf-panel .field-content {
                flex: 1;
                min-width: 0;
                position: relative;
                z-index: 1;
            }
            
            #smarthirex-lowconf-panel .field-label {
                font-size: 14px;
                font-weight: 600;
                color: #1e293b;
                margin-bottom: 5px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                letter-spacing: -0.2px;
            }
            
            #smarthirex-lowconf-panel .field-hint {
                font-size: 11px;
                color: #64748b;
                font-weight: 500;
                display: flex;
                align-items: center;
                gap: 6px;
                flex-wrap: wrap;
            }
            
            #smarthirex-lowconf-panel .field-arrow {
                color: #cbd5e1;
                flex-shrink: 0;
                transition: all 0.25s ease;
                position: relative;
                z-index: 1;
            }
            
            #smarthirex-lowconf-panel .field-item:hover .field-arrow {
                color: #f59e0b;
                transform: translateX(4px);
            }
            
            #smarthirex-lowconf-panel .panel-footer {
                padding: 16px 24px 20px 24px;
                background: linear-gradient(to top, rgba(255, 255, 255, 0.8), transparent);
                border-top: 1px solid rgba(0, 0, 0, 0.04);
                display: flex;
                align-items: center;
                gap: 12px;
            }
            
            #smarthirex-lowconf-panel .footer-icon {
                font-size: 18px;
                filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
            }
            
            #smarthirex-lowconf-panel .footer-text {
                font-size: 13px;
                color: #64748b;
                font-weight: 600;
                letter-spacing: -0.1px;
            }
            
            .smarthirex-lowconf-highlight {
                outline: 3px solid #f59e0b !important;
                outline-offset: 3px !important;
                box-shadow: 0 0 0 6px rgba(245, 158, 11, 0.15) !important;
                animation: pulse-lowconf-field 2.5s ease-in-out infinite !important;
                border-radius: 8px;
            }
            
            @keyframes pulse-lowconf-field {
                0%, 100% { 
                    outline-color: #f59e0b; 
                    box-shadow: 0 0 0 6px rgba(245, 158, 11, 0.15); 
                }
                50% { 
                    outline-color: #fb923c; 
                    box-shadow: 0 0 0 6px rgba(251, 146, 60, 0.25); 
                }
            }
            
            .smarthirex-lowconf-overlay {
                opacity: 1;
                transition: opacity 0.3s ease;
                animation: fadeInBounce 0.5s cubic-bezier(0.16, 1, 0.3, 1);
                filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15));
            }
            
            @keyframes fadeInBounce {
                0% { opacity: 0; transform: translateY(-15px) scale(0.9); }
                60% { transform: translateY(2px) scale(1.02); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            
            .lowconf-badge {
                background: linear-gradient(135deg, #f59e0b 0%, #f97316 50%, #fb923c 100%);
                color: white;
                padding: 8px 14px;
                border-radius: 10px;
                display: inline-flex;
                align-items: center;
                gap: 7px;
                box-shadow: 
                    0 4px 16px rgba(245, 158, 11, 0.4),
                    0 0 0 1px rgba(255, 255, 255, 0.2) inset;
                font-size: 13px;
                font-weight: 700;
                letter-spacing: 0.3px;
                animation: floatGlow 4s ease-in-out infinite;
            }
            
            @keyframes floatGlow {
                0%, 100% { 
                    transform: translateY(0); 
                    box-shadow: 0 4px 16px rgba(245, 158, 11, 0.4);
                }
                50% { 
                    transform: translateY(-5px); 
                    box-shadow: 0 8px 24px rgba(245, 158, 11, 0.5);
                }
            }
            
            .field-type-badge {
                background: linear-gradient(135deg, #f1f5f9, #e2e8f0);
                color: #475569;
                padding: 3px 8px;
                border-radius: 6px;
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                border: 1px solid rgba(0, 0, 0, 0.06);
            }
            
            .field-confidence-badge {
                font-size: 11px;
                padding: 3px 8px;
                border-radius: 6px;
                font-weight: 700;
                letter-spacing: 0.2px;
                border: 1px solid;
            }
            
            .field-confidence-badge.low {
                background: linear-gradient(135deg, #fef3c7, #fde68a);
                color: #92400e;
                border-color: rgba(146, 64, 14, 0.2);
            }
            
            .field-confidence-badge.medium {
                background: linear-gradient(135deg, #dbeafe, #bfdbfe);
                color: #1e40af;
                border-color: rgba(30, 64, 175, 0.2);
            }
            
            .field-priority-badge {
                font-size: 11px;
                padding: 3px 8px;
                border-radius: 6px;
                font-weight: 700;
                letter-spacing: 0.2px;
                background: linear-gradient(135deg, #d1fae5, #a7f3d0);
                color: #065f46;
                border: 1px solid rgba(5, 150, 105, 0.3);
            }
            
            .field-type-badge.file-badge {
                background: linear-gradient(135deg, #10b981, #059669);
                color: white;
                border-color: rgba(5, 150, 105, 0.3);
            }
            
            .file-upload-item {
                background: linear-gradient(135deg, rgba(236, 253, 245, 0.6) 0%, rgba(209, 250, 229, 0.6) 100%);
                border-color: rgba(16, 185, 129, 0.2);
            }
            
            .file-upload-item:hover {
                background: rgba(236, 253, 245, 0.95);
                border-color: rgba(16, 185, 129, 0.4);
                box-shadow: 
                    0 4px 12px rgba(16, 185, 129, 0.15),
                    0 0 0 1px rgba(16, 185, 129, 0.1);
            }
            
            .file-upload-icon {
                background: linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.2));
                color: #059669;
                border-color: rgba(16, 185, 129, 0.3);
                font-size: 16px;
            }
            
            @keyframes slideOutToBottomLeft {
                to { 
                    transform: translateY(40px) translateX(-20px) scale(0.95); 
                    opacity: 0; 
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Click handlers for navigation
    panel.querySelectorAll('.field-item').forEach((el, i) => {
        el.onclick = () => {
            const targetField = fieldsWithInfo[i].field;
            targetField.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
                targetField.focus();
                // Pulse effect
                targetField.style.animation = 'none';
                setTimeout(() => {
                    targetField.style.animation = '';
                }, 10);
            }, 600);
        };
    });

    // Update count helper
    window.updateLowConfCount = () => {
        const remaining = document.querySelectorAll('.smarthirex-lowconf-highlight').length;
        const countEl = document.getElementById('lowconf-count');
        if (countEl) {
            countEl.textContent = remaining;
            if (remaining === 0) {
                panel.style.animation = 'slideOutToBottomLeft 0.4s ease-out forwards';
                setTimeout(() => panel.remove(), 400);
            }
        }
    };

    console.log('✅ Low-confidence field sidebar displayed!');
}

/**
 * Highlight unfilled fields with premium indicators (Google/Notion style)
 */
// PREMIUM FANG-ENTERPRISE UNFILLED FIELD INDICATOR
// Inspired by: Google Forms, Notion, Linear, Stripe

function highlightUnfilledFields() {
    console.log('🎯 SmartHireX: Highlighting unfilled fields...');

    // Find unfilled fields
    const allFields = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea');
    const unfilledFields = [];

    allFields.forEach(field => {
        if (field.value && field.value.trim() !== '') return;
        if (field.disabled) return;
        if (!isFieldVisible(field)) return;

        let label = 'Field';
        if (field.labels && field.labels[0]) {
            label = field.labels[0].textContent.trim();
        } else if (field.placeholder) {
            label = field.placeholder;
        } else if (field.name) {
            label = field.name.replace(/[_-]/g, ' ');
        } else if (field.id) {
            label = field.id.replace(/[_-]/g, ' ');
        }

        unfilledFields.push({ field, label });
    });

    console.log(`Found ${unfilledFields.length} unfilled fields`);
    if (unfilledFields.length === 0) return;

    // Safety check to filter out invalid elements
    const validFields = unfilledFields.filter(item => item && item.field && document.body.contains(item.field));

    // ===== PREMIUM LEFT-SIDE PANEL =====
    const panel = document.createElement('div');
    panel.id = 'smarthirex-unfilled-panel';
    panel.innerHTML = `
        <div class="panel-header">
            <div class="header-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
            </div>
            <div class="header-content">
                <div class="header-title">
                    <span id="unfilled-count" class="count-badge">${unfilledFields.length}</span>
                    <span class="header-text">field${unfilledFields.length > 1 ? 's' : ''} remaining</span>
                </div>
                <div class="header-subtitle">Click to navigate</div>
            </div>
            <button class="close-btn" onclick="this.closest('#smarthirex-unfilled-panel').remove(); document.querySelectorAll('.smarthirex-unfilled-overlay').forEach(el => el.remove()); document.querySelectorAll('.smarthirex-unfilled-highlight').forEach(el => el.classList.remove('smarthirex-unfilled-highlight'))">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
        <div class="panel-divider"></div>
        <div class="panel-list">
            ${validFields.map((item, i) => `
                <div class="field-item" data-idx="${i}">
                    <div class="field-number">${i + 1}</div>
                    <div class="field-content">
                        <div class="field-label">${item.label}</div>
                        <div class="field-hint">Required field</div>
                    </div>
                    <div class="field-arrow">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="9 18 15 12 9 6"/>
                        </svg>
                    </div>
                </div>
            `).join('')}
        </div>
        <div class="panel-footer">
            <div class="footer-icon">✨</div>
            <div class="footer-text">Fill all fields to continue</div>
        </div>
    `;

    document.body.appendChild(panel);

    // ===== INDIVIDUAL FIELD OVERLAYS =====
    unfilledFields.forEach((item, index) => {
        const field = item.field;

        // Add highlighting
        field.classList.add('smarthirex-unfilled-highlight');

        // Create badge overlay
        const overlay = document.createElement('div');
        overlay.className = 'smarthirex-unfilled-overlay';
        overlay.innerHTML = `
            <div class="unfilled-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M12 20h9"/>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
                <span>Required</span>
            </div>
        `;

        const rect = field.getBoundingClientRect();
        overlay.style.position = 'absolute';
        overlay.style.left = `${rect.left + window.scrollX}px`;
        overlay.style.top = `${rect.top + window.scrollY - 46}px`;
        overlay.style.zIndex = '999998';

        document.body.appendChild(overlay);

        // Scroll to first
        if (index === 0) {
            setTimeout(() => field.scrollIntoView({ behavior: 'smooth', block: 'center' }), 500);
        }

        // Remove when filled
        field.addEventListener('input', () => {
            if (field.value) {
                field.classList.remove('smarthirex-unfilled-highlight');
                if (overlay.parentNode) overlay.remove();
                updateUnfilledCount();
            }
        }, { once: true });
    });

    // ===== PREMIUM STYLES =====
    if (!document.getElementById('unfilled-premium-styles')) {
        const style = document.createElement('style');
        style.id = 'unfilled-premium-styles';
        style.textContent = `
            #smarthirex-unfilled-panel {
                position: fixed;
                left: 20px;
                top: 50%;
                transform: translateY(-50%);
                width: 340px;
                background: #ffffff;
                border-radius: 16px;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                z-index: 2147483647 !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                animation: slideInFromLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1);
                border: 1px solid rgba(0, 0, 0, 0.08);
            }
            
            @keyframes slideInFromLeft {
                from { transform: translateY(-50%) translateX(-60px); opacity: 0; }
                to { transform: translateY(-50%) translateX(0); opacity: 1; }
            }
            
            .panel-header {
                padding: 20px;
                display: flex;
                align-items: flex-start;
                gap: 12px;
            }
            
            .header-icon {
                width: 36px;
                height: 36px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                flex-shrink: 0;
            }
            
            .header-content {
                flex: 1;
                min-width: 0;
            }
            
            .header-title {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 4px;
            }
            
            .count-badge {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 2px 8px;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 700;
                letter-spacing: -0.3px;
            }
            
            .header-text {
                font-size: 15px;
                font-weight: 600;
                color: #1e293b;
                letter-spacing: -0.3px;
            }
            
            .header-subtitle {
                font-size: 12px;
                color: #64748b;
                font-weight: 500;
            }
            
            .close-btn {
                width: 28px;
                height: 28px;
                background: #f1f5f9;
                border: none;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s;
                color: #64748b;
                flex-shrink: 0;
            }
            
            .close-btn:hover {
                background: #e2e8f0;
                color: #334155;
            }
            
            .panel-divider {
                height: 1px;
                background: linear-gradient(to right, transparent, #e2e8f0, transparent);
                margin: 0 20px;
            }
            
            .panel-list {
                padding: 16px 12px;
                max-height: 400px;
                overflow-y: auto;
            }
            
            .panel-list::-webkit-scrollbar {
                width: 6px;
            }
            
            .panel-list::-webkit-scrollbar-track {
                background: transparent;
            }
            
            .panel-list::-webkit-scrollbar-thumb {
                background: #cbd5e1;
                border-radius: 3px;
            }
            
            .field-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px;
                margin-bottom: 8px;
                background: #fafafa;
                border: 1px solid #e2e8f0;
                border-radius: 10px;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            .field-item:hover {
                background: #f8fafc;
                border-color: #cbd5e1;
                transform: translateX(4px);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
            }
            
            .field-number {
                width: 24px;
                height: 24px;
                background: linear-gradient(135deg, #667eea20, #764ba220);
                color: #667eea;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 11px;
                font-weight: 700;
                flex-shrink: 0;
            }
            
            .field-content {
                flex: 1;
                min-width: 0;
            }
            
            .field-label {
                font-size: 13px;
                font-weight: 600;
                color: #334155;
                margin-bottom: 2px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            
            .field-hint {
                font-size: 11px;
                color: #94a3b8;
                font-weight: 500;
            }
            
            .field-arrow {
                color: #cbd5e1;
                flex-shrink: 0;
                transition: all 0.2s;
            }
            
            .field-item:hover .field-arrow {
                color: #667eea;
                transform: translateX(2px);
            }
            
            .panel-footer {
                padding: 16px 20px;
                background: linear-gradient(to bottom, transparent, #fafafa);
                border-top: 1px solid #f1f5f9;
                display: flex;
                align-items: center;
                gap: 10px;
                border-radius: 0 0 16px 16px;
            }
            
            .footer-icon {
                font-size: 16px;
            }
            
            .footer-text {
                font-size: 12px;
                color: #64748b;
                font-weight: 600;
            }
            
            /* Field Highlighting */
            .smarthirex-unfilled-highlight {
                outline: 2px solid #667eea !important;
                outline-offset: 2px !important;
                box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1) !important;
                animation: pulse-field 2s ease-in-out infinite !important;
            }
            
            @keyframes pulse-field {
                0%, 100% { outline-color: #667eea; box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1); }
                50% { outline-color: #764ba2; box-shadow: 0 0 0 4px rgba(118, 75, 162, 0.15); }
            }
            
            /* Field Overlay Badge */
            .smarthirex-unfilled-overlay {
                opacity: 1;
                transition: opacity 0.3s;
                animation: fadeIn 0.4s ease-out;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            .unfilled-badge {
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                padding: 6px 12px;
                border-radius: 8px;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                font-size: 12px;
                font-weight: 600;
                letter-spacing: 0.2px;
                animation: float 3s ease-in-out infinite;
            }
            
            @keyframes float {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-4px); }
            }
            
            /* Mobile Responsive */
            @media (max-width: 768px) {
                #smarthirex-unfilled-panel {
                    width: 280px;
                    left: 12px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // ===== CLICK HANDLERS =====
    panel.querySelectorAll('.field-item').forEach((el, i) => {
        el.onclick = () => {
            const item = validFields[i]; // Use validFields instead of unfilledFields
            if (item && item.field) {
                const targetField = item.field;
                targetField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => {
                    targetField.focus();
                    // Pulse effect
                    targetField.style.animation = 'none';
                    setTimeout(() => {
                        targetField.style.animation = '';
                    }, 10);
                }, 600);
            }
        };
    });

    // Update count helper
    window.updateUnfilledCount = () => {
        const remaining = document.querySelectorAll('.smarthirex-unfilled-highlight').length;
        const countEl = document.getElementById('unfilled-count');
        if (countEl) {
            countEl.textContent = remaining;
            if (remaining === 0) {
                panel.style.animation = 'slideOutToLeft 0.4s ease-out forwards';
                setTimeout(() => panel.remove(), 400);
            }
        }
    };

    const slideOutStyle = document.createElement('style');
    slideOutStyle.textContent = `
        @keyframes slideOutToLeft {
            to { transform: translateY(-50%) translateX(-60px); opacity: 0; }
        }
    `;
    document.head.appendChild(slideOutStyle);

    console.log('✅ Premium unfilled field UX activated!');
}

// Undo form fill - restore original values
function undoFormFill() {
    try {
        // Retrieve undo data from sessionStorage
        const undoDataStr = sessionStorage.getItem('smarthirex_undo_data');

        if (!undoDataStr) {
            return {
                success: false,
                error: 'No undo data available'
            };
        }

        const undoData = JSON.parse(undoDataStr);

        // Check if undo data has expired
        if (Date.now() > undoData.expiresAt) {
            sessionStorage.removeItem('smarthirex_undo_data');
            return {
                success: false,
                error: 'Undo data has expired (> 5 minutes old)'
            };
        }

        let restoredCount = 0;
        const { originalValues } = undoData;

        // Restore each field to its original value
        for (const [selector, originalValue] of Object.entries(originalValues)) {
            try {
                const element = document.querySelector(selector);

                if (!element) {
                    console.warn(`Element not found for undo: ${selector}`);
                    continue;
                }

                // Restore based on element type
                if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                    if (element.type === 'checkbox' || element.type === 'radio') {
                        element.checked = originalValue;
                    } else {
                        // Use native setter for React compatibility
                        try {
                            const prototype = element.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
                            const nativeSetter = Object.getOwnPropertyDescriptor(prototype, "value").set;
                            nativeSetter.call(element, originalValue);
                        } catch (e) {
                            element.value = originalValue;
                        }
                    }
                } else if (element.tagName === 'SELECT') {
                    element.value = originalValue;
                }

                // Trigger events to update form state
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.dispatchEvent(new Event('blur', { bubbles: true }));

                // Add visual feedback (brief flash)
                element.style.transition = 'background-color 0.3s';
                element.style.backgroundColor = '#fef3c7';
                setTimeout(() => {
                    element.style.backgroundColor = '';
                }, 300);

                restoredCount++;
            } catch (error) {
                console.error(`Error restoring ${selector}:`, error);
            }
        }

        // Clear undo data after successful undo
        sessionStorage.removeItem('smarthirex_undo_data');

        // Remove file field highlighting if present
        const highlightedFields = document.querySelectorAll('.smarthirex-file-upload-highlight');
        highlightedFields.forEach(field => {
            field.classList.remove('smarthirex-file-upload-highlight');
        });

        // Remove file upload overlays
        const overlays = document.querySelectorAll('.smarthirex-file-upload-overlay');
        overlays.forEach(overlay => overlay.remove());

        return {
            success: true,
            restored: restoredCount
        };

    } catch (error) {
        console.error('Undo failed:', error);
        return {
            success: false,
            error: error.message || 'Undo failed'
        };
    }
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

// Detect all file upload fields on the page
function detectFileFields() {
    const fileInputs = document.querySelectorAll('input[type="file"]');
    return Array.from(fileInputs);
}

// Highlight file upload fields with visual indicators
function highlightFileFields(fileFields) {
    fileFields.forEach((field, index) => {
        // Add pulsing border class
        field.classList.add('smarthirex-file-upload-highlight');

        // Create overlay with instructions
        const overlay = document.createElement('div');
        overlay.className = 'smarthirex-file-upload-overlay';
        overlay.innerHTML = `
            <div class="smarthirex-file-upload-indicator">
                <div class="icon">📄</div>
                <div class="message">Please upload your document here</div>
                <div class="hint">Click or drag & drop</div>
            </div>
        `;

        // Position overlay near the file input
        const rect = field.getBoundingClientRect();
        overlay.style.position = 'absolute';
        overlay.style.left = `${rect.left + window.scrollX}px`;
        overlay.style.top = `${rect.top + window.scrollY - 80}px`;
        overlay.style.zIndex = '999998';

        document.body.appendChild(overlay);

        // Scroll to first file field
        if (index === 0) {
            setTimeout(() => {
                field.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 500);
        }

        // Remove overlay after 15 seconds, but show again on hover
        const removeOverlay = () => {
            overlay.style.opacity = '0';
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.remove();
                }
            }, 300);
        };

        setTimeout(removeOverlay, 15000);

        // Show overlay again on hover
        field.addEventListener('mouseenter', () => {
            if (!overlay.parentNode) {
                document.body.appendChild(overlay);
                overlay.style.opacity = '1';
            }
        });

        // Remove highlight when file is selected
        field.addEventListener('change', () => {
            field.classList.remove('smarthirex-file-upload-highlight');
            if (overlay.parentNode) {
                overlay.remove();
            }
        });
    });
}

// Get a unique selector for an element
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

// Show missing data modal on the page
// Helper to get consistent enterprise-grade CSS for all modals (Shadow DOM & Main)
function getEnterpriseModalCSS() {
    return `
        /* ENTERPRISE THEME VARIABLES & FONTS */
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        :host {
            all: initial;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

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
            z-index: 2147483647 !important;
            padding: 20px;
            animation: smarthirex-fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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

        /* Preview Modal Specific Styles */
        .smarthirex-preview-dialog {
            background: linear-gradient(180deg, #ffffff 0%, #fafbfc 100%);
            border-radius: 20px;
            width: 100%;
            max-width: 800px;
            max-height: 90vh;
            overflow: hidden;
            box-shadow:
                0 0 0 1px rgba(15, 23, 42, 0.05),
                0 20px 25px -5px rgba(15, 23, 42, 0.1),
                0 40px 60px -15px rgba(15, 23, 42, 0.25);
            animation: smarthirex-slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
        }

        .smarthirex-preview-dialog::before {
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

        .smarthirex-preview-dialog .smarthirex-dialog-header::before {
            content: '👀';
        }

        .smarthirex-stats-summary {
            background: rgba(139, 92, 246, 0.05);
            padding: 12px 16px;
            border-radius: 10px;
            border: 1px solid rgba(139, 92, 246, 0.1);
        }

        .smarthirex-stats-summary .stat-item {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .smarthirex-stats-summary .stat-label {
            font-size: 13px;
            color: #64748b;
            font-weight: 500;
        }

        .smarthirex-stats-summary .stat-value {
            font-size: 15px;
            font-weight: 700;
            color: #0f172a;
        }

        .smarthirex-confidence-summary {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .confidence-badge {
            display: inline-flex;
            align-items: center;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .confidence-badge.high {
            background: #d1fae5;
            color: #065f46;
            border: 1px solid #10b981;
        }

        .confidence-badge.medium {
            background: #fef3c7;
            color: #92400e;
            border: 1px solid #f59e0b;
        }

        .confidence-badge.low {
            background: #fee2e2;
            color: #991b1b;
            border: 1px solid #ef4444;
        }

        /* Table Styles */
        .smarthirex-mappings-table {
            background: white;
            border-radius: 10px;
            border: 1px solid #e2e8f0;
            overflow: hidden;
        }

        .smarthirex-mappings-table .table-header {
            display: grid;
            grid-template-columns: 40px 1fr 2fr 100px;
            gap: 12px;
            padding: 14px 16px;
            background: #f8fafc;
            border-bottom: 2px solid #e2e8f0;
            font-size: 12px;
            font-weight: 700;
            color: #475569;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .smarthirex-mappings-table .table-body {
            max-height: 400px;
            overflow-y: auto;
        }

        .smarthirex-mappings-table .table-body::-webkit-scrollbar {
            width: 6px;
        }

        .smarthirex-mappings-table .table-body::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 3px;
        }

        .smarthirex-mappings-table .table-row {
            display: grid;
            grid-template-columns: 40px 1fr 2fr 100px;
            gap: 12px;
            padding: 12px 16px;
            border-bottom: 1px solid #f1f5f9;
            transition: background 0.15s;
        }

        .smarthirex-mappings-table .table-row:hover {
            background: #fafbfc;
        }

        .smarthirex-mappings-table .table-row:last-child {
            border-bottom: none;
        }

        .td-checkbox,
        .th-checkbox {
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .td-checkbox input[type="checkbox"],
        .th-checkbox input[type="checkbox"] {
            width: 18px;
            height: 18px;
            cursor: pointer;
            accent-color: #8B5CF6;
        }

        .td-field {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            color: #0f172a;
        }

        .field-icon {
            font-size: 18px;
        }

        .field-label {
            font-weight: 500;
        }

        .required-badge {
            color: #ef4444;
            font-weight: 700;
            font-size: 16px;
        }

        .td-value {
            display: flex;
            align-items: center;
        }

        .value-input {
            width: 100%;
            padding: 8px 12px;
            border: 1.5px solid #e2e8f0;
            border-radius: 8px;
            font-size: 13px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            transition: all 0.2s;
        }

        .value-input:focus {
            outline: none;
            border-color: #8B5CF6;
            box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
        }

        .manual-upload-text {
            font-size: 13px;
            color: #64748b;
            font-style: italic;
        }

        .td-confidence {
            display: flex;
            align-items: center;
            justify-content: center;
        }

        /* Mobile Responsive */
        @media (max-width: 768px) {
            .smarthirex-preview-dialog {
                max-width: 100%;
                margin: 0;
                border-radius: 20px 20px 0 0;
                max-height: 95vh;
            }

            .smarthirex-mappings-table .table-header,
            .smarthirex-mappings-table .table-row {
                grid-template-columns: 30px 1fr 80px;
                gap: 8px;
            }

            .th-value,
            .td-value {
                display: none;
            }

            .smarthirex-dialog-header {
                padding: 24px 20px 20px 20px;
            }

            .smarthirex-dialog-header h3,
            .smarthirex-dialog-header p {
                margin-left: 36px;
            }

            .smarthirex-dialog-content {
                padding: 16px;
            }

            .smarthirex-dialog-footer {
                padding: 16px 20px 24px 20px;
                flex-direction: column;
            }

            .smarthirex-btn {
                width: 100%;
            }
        }

        /* File Upload Field Highlighting */
        .smarthirex-file-upload-highlight {
            animation: smarthirex-file-pulse 2s infinite !important;
            border: 3px solid #8B5CF6 !important;
            border-radius: 8px !important;
            box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.2) !important;
        }

        @keyframes smarthirex-file-pulse {
            0%, 100% {
                box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.7);
                border-color: #8B5CF6;
            }
            50% {
                box-shadow: 0 0 0 12px rgba(139, 92, 246, 0);
                border-color: #a78bfa;
            }
        }

        .smarthirex-file-upload-overlay {
            position: absolute;
            z-index: 999998;
            pointer-events: none;
            transition: opacity 0.3s ease;
        }

        .smarthirex-file-upload-indicator {
            background: linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%);
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow:
                0 0 0 1px rgba(139, 92, 246, 0.3),
                0 10px 25px rgba(139, 92, 246, 0.4),
                0 4px 8px rgba(0, 0, 0, 0.1);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            animation: smarthirex-indicator-bounce 2s ease-in-out infinite;
        }

        @keyframes smarthirex-indicator-bounce {
            0%, 100% {
                transform: translateY(0);
            }
            50% {
                transform: translateY(-8px);
            }
        }

        .smarthirex-file-upload-indicator .icon {
            font-size: 32px;
            animation: smarthirex-icon-pulse 1.5s ease-in-out infinite;
        }

        @keyframes smarthirex-icon-pulse {
            0%, 100% {
                transform: scale(1);
            }
            50% {
                transform: scale(1.1);
            }
        }

        .smarthirex-file-upload-indicator .message {
            font-size: 15px;
            font-weight: 700;
            text-align: center;
            letter-spacing: -0.01em;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }

        .smarthirex-file-upload-indicator .hint {
            font-size: 12px;
            opacity: 0.9;
            font-weight: 500;
            text-align: center;
        }
    `;
}

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

/**
 * Render premium input based on field type (Enterprise-grade UI)
 */
function renderPremiumInput(fieldInfo, value, confidence) {
    const inputType = fieldInfo.type || 'text';
    const escapeValue = (val) => (val || '').toString().replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lowConfidenceStyle = confidence >= 0.9 ? '' : 'style="background: #fef3c7;"';

    switch (inputType) {
        case 'radio':
            if (fieldInfo.options && fieldInfo.options.length > 0) {
                const radioOptions = fieldInfo.options.map((opt, idx) => {
                    const optValue = typeof opt === 'object' ? (opt.value || opt) : opt;
                    const optLabel = typeof opt === 'object' ? (opt.label || opt.value || opt) : opt;
                    const isChecked = optValue == value || optLabel == value;
                    return `
                        <label class="premium-radio-option">
                            <input type="radio" name="preview-${fieldInfo.selector}" value="${escapeValue(optValue)}" ${isChecked ? 'checked' : ''}>
                            <span class="radio-label">${optLabel}</span>
                        </label>
                    `;
                }).join('');
                return `<div class="premium-radio-group">${radioOptions}</div>`;
            }
            return `<input type="text" class="value-input" value="${escapeValue(value)}" ${lowConfidenceStyle}>`;

        case 'checkbox':
            const isChecked = value === true || value === 'true' || value === '1' || value === 'yes' || value === 'on';
            return `
                <label class="premium-checkbox">
                    <input type="checkbox" class="value-checkbox" ${isChecked ? 'checked' : ''}>
                    <span class="checkbox-label">${isChecked ? 'Yes' : 'No'}</span>
                </label>
            `;

        case 'select':
            if (fieldInfo.options && fieldInfo.options.length > 0) {
                const selectOptions = fieldInfo.options.map(opt => {
                    const optValue = typeof opt === 'object' ? (opt.value || opt) : opt;
                    const optLabel = typeof opt === 'object' ? (opt.label || opt.value || opt) : opt;
                    const isSelected = optValue == value || optLabel == value;
                    return `<option value="${escapeValue(optValue)}" ${isSelected ? 'selected' : ''}>${optLabel}</option>`;
                }).join('');
                return `
                    <select class="premium-select value-input" ${lowConfidenceStyle}>
                        <option value="">Select...</option>
                        ${selectOptions}
                    </select>
                `;
            }
            return `<input type="text" class="value-input" value="${escapeValue(value)}" ${lowConfidenceStyle}>`;

        case 'date':
        case 'datetime-local':
        case 'time':
        case 'month':
        case 'week':
            return `<input type="${inputType}" class="premium-date value-input" value="${escapeValue(value)}" ${lowConfidenceStyle}>`;

        case 'number':
        case 'range':
            return `<input type="number" class="premium-number value-input" value="${escapeValue(value)}" ${lowConfidenceStyle}>`;

        case 'textarea':
            return `<textarea class="premium-textarea value-input" rows="2" ${lowConfidenceStyle}>${escapeValue(value)}</textarea>`;

        case 'email':
        case 'tel':
        case 'url':
            return `<input type="${inputType}" class="value-input" value="${escapeValue(value)}" ${lowConfidenceStyle} placeholder="${inputType === 'email' ? 'name@example.com' : ''}">`;

        default:
            return `<input type="text" class="value-input" value="${escapeValue(value)}" ${lowConfidenceStyle}>`;
    }
}

// Show preview modal for reviewing mappings before filling
// Helper to generate smart answer via API
async function generateSmartAnswer(question, context) {
    try {
        const { token } = await chrome.storage.local.get(['token']);
        if (!token) throw new Error("No auth token");

        // Use hardcoded URL or environment var if available. 
        // NOTE: In production this should come from config. `localhost:8000` is for dev.
        const API_BASE_URL = 'http://localhost:8000';

        const response = await fetch(`${API_BASE_URL}/autofill/generate-answer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                question: question,
                context: context,
                url: window.location.href
            })
        });

        if (!response.ok) throw new Error("API Error");
        const data = await response.json();
        return data.answer;
    } catch (e) {
        console.error("Smart Answer Error:", e);
        return null; // Handle error gracefully in UI
    }
}

async function showPreviewModal(mappings, analysis, allFields) {
    console.log('🚀 showPreviewModal started');
    // Track initial state for correction detection
    // Track initial state for correction detection
    const initialMappings = JSON.parse(JSON.stringify(mappings));

    // CONFIDENCE-BASED FILTERING
    // Separate high-confidence (≥0.9) and low-confidence fields
    const HIGH_CONFIDENCE_THRESHOLD = 0.9;
    const highConfidenceMappings = {};
    const lowConfidenceMappings = {};

    Object.entries(mappings).forEach(([selector, fieldData]) => {
        const confidence = fieldData.confidence || 0;
        if (confidence >= HIGH_CONFIDENCE_THRESHOLD) {
            highConfidenceMappings[selector] = fieldData;
        } else {
            lowConfidenceMappings[selector] = fieldData;
        }
    });

    console.log(`📊 Confidence split: ${Object.keys(highConfidenceMappings).length} high, ${Object.keys(lowConfidenceMappings).length} low`);

    // Use high-confidence mappings for the preview display
    // Store low-confidence mappings for later use after form fill
    const displayMappings = highConfidenceMappings;

    // Track corrections for machine learning
    const userCorrections = [];

    // Add custom styles for warning
    if (!document.getElementById('smarthirex-warning-styles')) {
        const style = document.createElement('style');
        style.id = 'smarthirex-warning-styles';
        style.textContent = `
            .row-warning {
                background-color: #fff1f2 !important;
                border-left: 3px solid #f43f5e !important;
            }
            .row-warning .field-label {
                color: #e11d48 !important;
            }
            @keyframes slideInUp {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .table-row {
                animation: slideInUp 0.3s ease-out forwards;
                opacity: 0; /* Star hidden until animation runs */
            }
        `;
        document.head.appendChild(style);
    }

    return new Promise((resolve, reject) => {
        // Inject modal styles if not already present
        if (!document.getElementById('smarthirex-modal-styles')) {
            injectModalStyles();
            console.log('✅ Modal styles injected');
        } else {
            console.log('ℹ️ Modal styles already present');
        }



        // Calculate statistics using only high-confidence fields for display
        const stats = calculateMappingStats(displayMappings, allFields);
        console.log('📊 Stats calculated:', stats);

        // SHADOW DOM IMPLEMENTATION
        // Create host
        const host = document.createElement('div');
        host.id = 'smarthirex-shadow-host';
        // Note: Host has pointer-events: none to let clicks pass through if we wanted, 
        // BUT we must set pointer-events: auto on children we want to be clickable.
        host.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;pointer-events:none;';
        document.documentElement.appendChild(host);

        // Create Shadow Root
        const shadow = host.attachShadow({ mode: 'open' });

        // Inject Styles into Shadow Root using the centralized premium styles
        const style = document.createElement('style');
        style.textContent = getEnterpriseModalCSS();
        // Actually, we should probably pull the styles from injectModalStyles textContent logic
        // But for now, let's just make it visible with minimal styles to PROVE it works.
        // Better: Clone the styles from injectModalStyles if possible, or redefine critical ones.

        // Let's rely on the existing class names but WE MUST define them in shadow style.
        // I will copy the CSS content from injectModalStyles (manually or by ref).
        // Since I can't easily ref, I'll define critical layout styles here.

        shadow.appendChild(style);


        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.id = 'smarthirex-preview-overlay';
        overlay.className = 'smarthirex-modal-overlay';
        // Force visibility bypass and enable pointer events
        overlay.style.cssText = 'display:flex;align-items:center;justify-content:center;pointer-events:auto;';

        // Create modal dialog
        const dialog = document.createElement('div');
        dialog.className = 'smarthirex-preview-dialog';

        dialog.tabIndex = -1; // Make focusable for keyboard events
        dialog.style.outline = 'none';

        // Prevent clicks inside dialog from closing the modal (bubbling to overlay)
        dialog.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Dialog header with stats
        const header = document.createElement('div');
        header.className = 'smarthirex-dialog-header';
        header.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                <div>
                    <h3 id="page-title" style="margin: 0; font-size: 18px;">Review Before Filling</h3>
                    <p style="margin: 4px 0 0; color: #64748b; font-size: 13px;">Please review and confirm the field mappings below</p>
                </div>
                <div id="page-indicator" style="font-size: 12px; font-weight: 600; color: #64748b; background: #f1f5f9; padding: 4px 8px; border-radius: 6px;">Step 1 of 1</div>
            </div>

            <!-- Progress Bar -->
            <div style="height: 4px; background: #e2e8f0; border-radius: 2px; margin-bottom: 16px; overflow: hidden;">
                <div id="progress-bar-fill" style="height: 100%; background: #8b5cf6; width: 0%; transition: width 0.3s ease;"></div>
            </div>

            <div class="smarthirex-stats-summary" style="display: flex; gap: 16px; flex-wrap: wrap;">
                <div class="stat-item">
                    <span class="stat-label">Total Fields:</span>
                    <span class="stat-value">${stats.total}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Auto-Fill:</span>
                    <span class="stat-value" style="color: #10b981;">${stats.autoFill}</span>
                </div>
                ${stats.manualUpload > 0 ? `
                    <div class="stat-item">
                        <span class="stat-label">Manual Upload:</span>
                        <span class="stat-value" style="color: #f59e0b;">${stats.manualUpload}</span>
                    </div>
                ` : ''}
            </div>
            <div class="smarthirex-confidence-summary" style="margin-top: 12px; display: flex; gap: 12px; font-size: 12px;">
                ${stats.highConfidence > 0 ? `<span class="confidence-badge high">${stats.highConfidence} High</span>` : ''}
                ${stats.mediumConfidence > 0 ? `<span class="confidence-badge medium">${stats.mediumConfidence} Medium</span>` : ''}
                ${stats.lowConfidence > 0 ? `<span class="confidence-badge low">${stats.lowConfidence} Low</span>` : ''}
            </div>
            ${Object.keys(lowConfidenceMappings).length > 0 ? `
                <div class="info-banner" style="
                    background: linear-gradient(135deg, #dbeafe 0%, #e0e7ff 100%);
                    border: 1px solid #93c5fd;
                    border-radius: 10px;
                    padding: 12px 16px;
                    margin-top: 16px;
                    font-size: 13px;
                    color: #1e40af;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-weight: 500;
                ">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="16" x2="12" y2="12"/>
                        <line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                    <span>${Object.keys(lowConfidenceMappings).length} low-confidence field${Object.keys(lowConfidenceMappings).length > 1 ? 's' : ''} will be shown for manual review after auto-fill</span>
                </div>
            ` : ''}
        `;

        // Dialog content - table of mappings
        const content = document.createElement('div');
        content.className = 'smarthirex-dialog-content';

        const table = document.createElement('div');
        table.className = 'smarthirex-mappings-table';

        // Table header
        const tableHeader = document.createElement('div');
        tableHeader.className = 'table-header';
        tableHeader.innerHTML = `
            <div class="th-checkbox"><input type="checkbox" id="select-all-fields" checked></div>
            <div class="th-field">Field Name</div>
            <div class="th-value">Value</div>
            <div class="th-confidence">Confidence</div>
        `;
        table.appendChild(tableHeader);

        // Table body with editable rows
        const tableBody = document.createElement('div');
        tableBody.className = 'table-body';

        // SMART GROUPING & PAGINATION
        // ==========================================

        // 1. Group fields by category
        const groups = {
            personal: [],
            experience: [],
            education: [],
            questions: [],
            other: []
        };

        const categoryTitles = {
            personal: '👤 Personal Information',
            experience: '💼 Work Experience',
            education: '🎓 Education',
            questions: '❓ Questions & Additional Info',
            other: '📄 Other Fields'
        };

        Object.entries(displayMappings).forEach(([selector, fieldData]) => {
            const fieldInfo = allFields.find(f => f.selector === selector) || {};
            // Use category from backend or fallback to 'other'
            const category = fieldData.category || 'other';

            // Validate category is known, else put in other
            const targetGroup = groups[category] ? groups[category] : groups['other'];

            targetGroup.push({
                selector,
                ...fieldData,
                fieldInfo
            });
        });

        // 2. Create Pages from Groups
        const pages = [];
        const MAX_FIELDS_PER_PAGE = 8;

        // Define order of categories in the wizard
        const categoryOrder = ['personal', 'experience', 'education', 'questions', 'other'];

        categoryOrder.forEach(cat => {
            const groupFields = groups[cat];
            if (groupFields.length === 0) return;

            // Split into sub-pages if too large
            for (let i = 0; i < groupFields.length; i += MAX_FIELDS_PER_PAGE) {
                const chunk = groupFields.slice(i, i + MAX_FIELDS_PER_PAGE);
                const isMultiPage = groupFields.length > MAX_FIELDS_PER_PAGE;

                pages.push({
                    title: categoryTitles[cat] + (isMultiPage ? ` (${Math.floor(i / MAX_FIELDS_PER_PAGE) + 1}/${Math.ceil(groupFields.length / MAX_FIELDS_PER_PAGE)})` : ''),
                    category: cat,
                    fields: chunk
                });
            }
        });

        // Fallback if no pages (shouldn't happen if mappings exist)
        if (pages.length === 0) {
            pages.push({ title: 'Review Fields', category: 'other', fields: [] });
        }

        const totalPages = pages.length;
        let currentPage = 0;

        // Progress Bar
        const progressContainer = document.createElement('div');
        progressContainer.className = 'smarthirex-progress-container';
        progressContainer.style.cssText = 'padding: 0 24px; margin-top: 16px; margin-bottom: 8px;';
        progressContainer.innerHTML = `
            <div style="display: flex; justify-content: space-between; font-size: 12px; color: #64748b; margin-bottom: 6px;">
                <span id="page-indicator">Step 1 of ${totalPages}</span>
                <span id="progress-percentage">0% Reviewed</span>
            </div>
            <div style="height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                <div id="progress-bar-fill" style="width: 0%; height: 100%; background: linear-gradient(90deg, #6366f1, #8b5cf6); transition: width 0.3s ease;"></div>
            </div>
        `;

        // Insert progress bar after stats
        header.appendChild(progressContainer);

        // Function to render a specific page
        function renderPage(pageIndex) {
            tableBody.innerHTML = ''; // Clear current rows
            const page = pages[pageIndex];

            // Update Progress UI
            const percentage = Math.round(((pageIndex + 1) / totalPages) * 100);
            header.querySelector('#page-title').textContent = page.title;
            header.querySelector('#page-indicator').textContent = `Step ${pageIndex + 1} of ${totalPages}`;
            header.querySelector('#progress-bar-fill').style.width = `${percentage}%`;

            page.fields.forEach((item, index) => {
                const { selector, value, confidence, fieldInfo } = item;
                // Note: 'value' comes from item which is a copy. 
                // We need to ensure we display the LATEST value from the 'mappings' object which is our source of truth.
                const currentValue = mappings[selector]?.value || value || '';
                const currentSkipped = mappings[selector]?.skipped;

                // Skip displayed logic if needed, but for smart grouping we usually show all relevant.
                // Re-using the filter logic:
                if (!currentValue && confidence < 0.2 && !fieldInfo.required && !mappings[selector].source) {
                    // return; // Don't skip in smart mode, show everything so user sees what's empty
                }

                const label = fieldInfo.label || selector;
                const isFileField = fieldInfo.type === 'file';
                const confidenceClass = confidence > 0.8 ? 'high' : (confidence > 0.5 ? 'medium' : 'low');
                const confidenceLevel = confidence > 0.8 ? 'High' : (confidence > 0.5 ? 'Medium' : 'Low');

                const row = document.createElement('div');
                row.className = 'table-row';
                // Add staggered animation delay based on index
                row.style.animationDelay = `${index * 0.05}s`;

                if (fieldInfo.required && !currentValue && !isFileField) {
                    row.classList.add('row-warning');
                }
                row.dataset.selector = selector;

                row.innerHTML = `
                    <div class="td-checkbox"><input type="checkbox" class="field-checkbox" ${!currentSkipped ? 'checked' : ''}></div>
                    <div class="td-field">
                        <div class="field-label" title="${label}">${label}</div>
                        <div class="field-selector">${selector.split(' > ').pop().substring(0, 30)}</div>
                    </div>
                    <div class="td-value">
                        ${isFileField ?
                        '<span class="manual-upload-text">Upload Manually</span>' :
                        renderPremiumInput(fieldInfo, currentValue, confidence)
                    }
                    </div>
                    <div class="td-confidence">
                        ${!isFileField ? `<span class="confidence-badge ${confidenceClass}">${confidenceLevel}</span>` : ''}
                    </div>
                `;
                tableBody.appendChild(row);

                // Add "Magic Write" button for textareas or essay questions
                const isTextArea = fieldInfo.type === 'textarea' || (fieldInfo.purpose && (fieldInfo.purpose.includes('question') || fieldInfo.purpose.includes('cover_letter') || fieldInfo.purpose.includes('why')));

                if (isTextArea && !isFileField) {
                    const valueCell = row.querySelector('.td-value');

                    const magicBtn = document.createElement('button');
                    magicBtn.className = 'smarthirex-magic-btn';
                    magicBtn.innerHTML = '✨ Magic Write';
                    magicBtn.type = 'button';
                    magicBtn.style.cssText = `
                        margin-top: 8px; 
                        border: none; 
                        background: linear-gradient(135deg, #8b5cf6, #d946ef); 
                        color: white; 
                        font-size: 11px; 
                        padding: 6px 10px; 
                        border-radius: 6px; 
                        cursor: pointer;
                        display: inline-flex; 
                        align-items: center; 
                        gap: 6px; 
                        font-weight: 600;
                        box-shadow: 0 2px 5px rgba(139, 92, 246, 0.3);
                        transition: transform 0.2s, box-shadow 0.2s;
                    `;

                    // Hover effect
                    magicBtn.onmouseover = () => { magicBtn.style.transform = 'translateY(-1px)'; magicBtn.style.boxShadow = '0 4px 8px rgba(139, 92, 246, 0.4)'; };
                    magicBtn.onmouseout = () => { magicBtn.style.transform = 'translateY(0)'; magicBtn.style.boxShadow = '0 2px 5px rgba(139, 92, 246, 0.3)'; };

                    magicBtn.addEventListener('click', async () => {
                        const originalText = magicBtn.innerHTML;
                        magicBtn.innerHTML = '✨ Thinking...';
                        magicBtn.disabled = true;
                        magicBtn.style.opacity = '0.8';
                        magicBtn.style.cursor = 'wait';

                        // Get context from page (simple scrape of visible text)
                        // Truncate to avoid huge payload, priority to body text
                        const pageContext = document.title + "\n" + document.body.innerText.substring(0, 5000);

                        const answer = await generateSmartAnswer(label, pageContext);

                        if (answer) {
                            // Update input value
                            // We need to find the input again because renderPage might have re-run? 
                            // No, 'row' is still valid DOM as long as we haven't re-rendered.
                            // But safest to query within row.
                            const input = row.querySelector('.value-input');
                            if (input) {
                                input.value = answer;
                                input.dispatchEvent(new Event('input', { bubbles: true })); // Trigger state update logic

                                // Flash success on button
                                magicBtn.innerHTML = '✅ Written!';
                                magicBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';

                                setTimeout(() => {
                                    magicBtn.innerHTML = originalText;
                                    magicBtn.style.background = 'linear-gradient(135deg, #8b5cf6, #d946ef)';
                                    magicBtn.disabled = false;
                                    magicBtn.style.opacity = '1';
                                    magicBtn.style.cursor = 'pointer';
                                }, 2500);
                            }
                        } else {
                            magicBtn.innerHTML = '❌ Failed';
                            magicBtn.style.background = '#ef4444';
                            setTimeout(() => {
                                magicBtn.innerHTML = originalText;
                                magicBtn.style.background = 'linear-gradient(135deg, #8b5cf6, #d946ef)';
                                magicBtn.disabled = false;
                                magicBtn.style.opacity = '1';
                                magicBtn.style.cursor = 'pointer';
                            }, 2000);
                        }
                    });

                    valueCell.appendChild(magicBtn);
                }
            });

            // Scroll to top of table
            if (content.scrollTop > 0) content.scrollTop = 0;

            // Re-bind select all checkbox logic for this page (VISUAL ONLY)
            // The actual state is in 'mappings'
            const selectAll = tableHeader.querySelector('#select-all-fields');
            if (selectAll) {
                // If all displayed fields are checked, check 'select-all'
                const allChecked = page.fields.every(f => !mappings[f.selector]?.skipped);
                selectAll.checked = allChecked;
            }

            // ADDED: Bind input events to update model state (mappings)
            // This is crucial because inputs are destroyed when changing pages
            const inputs = tableBody.querySelectorAll('.value-input');
            inputs.forEach(input => {
                input.addEventListener('input', (e) => {
                    const row = input.closest('.table-row');
                    const selector = row.dataset.selector;
                    if (mappings[selector]) {
                        mappings[selector].value = e.target.value;
                    }
                });
            });

            // Bind checkboxes to update skipped state
            const checkboxes = tableBody.querySelectorAll('.field-checkbox');
            checkboxes.forEach(cb => {
                cb.addEventListener('change', (e) => {
                    const row = cb.closest('.table-row');
                    const selector = row.dataset.selector;
                    if (mappings[selector]) {
                        mappings[selector].skipped = !e.target.checked;
                    }

                    // Update select-all state
                    const allPageChecked = Array.from(checkboxes).every(c => c.checked);
                    if (selectAll) selectAll.checked = allPageChecked;
                });
            });
        }

        // Render first page


        table.appendChild(tableBody);
        content.appendChild(table);

        // Dialog footer
        const footer = document.createElement('div');
        footer.className = 'smarthirex-dialog-footer';

        // Navigation Buttons
        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'smarthirex-btn smarthirex-btn-secondary';
        prevBtn.innerHTML = 'Previous <span style="opacity:0.6; font-size: 10px; margin-left: 4px;">(←)</span>';
        prevBtn.disabled = true; // Start on first page
        prevBtn.style.marginRight = 'auto'; // Push others to right

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'smarthirex-btn smarthirex-btn-secondary';
        cancelBtn.textContent = 'Cancel';

        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.id = 'smarthirex-next-btn';
        nextBtn.className = 'smarthirex-btn smarthirex-btn-primary';
        nextBtn.innerHTML = `
            Next <span style="opacity:0.6; font-size: 10px; margin-left: 4px;">(→)</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 6px;">
                <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
        `;

        // Helper to update button states
        function updateButtons() {
            prevBtn.disabled = currentPage === 0;

            if (currentPage === totalPages - 1) {
                // Last page: Show Fill Form
                nextBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Fill Form
                `;
                nextBtn.dataset.action = 'fill';
            } else {
                // Not last page: Show Next
                nextBtn.innerHTML = `
                    Next <span style="opacity:0.6; font-size: 10px; margin-left: 4px;">(→)</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 6px;">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                `;
                nextBtn.dataset.action = 'next';
            }
        }

        // If only 1 page, show Fill Form immediately
        if (totalPages <= 1) {
            nextBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Fill Form
            `;
            nextBtn.dataset.action = 'fill';
        } else {
            nextBtn.dataset.action = 'next';
        }

        footer.appendChild(prevBtn);
        footer.appendChild(cancelBtn);
        footer.appendChild(nextBtn);

        // Navigation Event Handlers
        prevBtn.addEventListener('click', () => {
            if (currentPage > 0) {
                currentPage--;
                renderPage(currentPage);
                updateButtons();
            }
        });

        // Cancel button handler
        cancelBtn.addEventListener('click', () => {
            resolve({ mappings: {}, cancelled: true });
            host.remove();
        });

        // Next / Fill button - handles both navigation and filling
        nextBtn.addEventListener('click', () => {
            if (nextBtn.dataset.action === 'next') {
                if (currentPage < totalPages - 1) {
                    currentPage++;
                    renderPage(currentPage);
                    updateButtons();
                }
            } else {
                // FILL FORM ACTION
                const editedHighConfidenceMappings = {};
                const editedLowConfidenceMappings = {};

                // Separate high and low confidence fields from edited mappings
                Object.entries(displayMappings).forEach(([selector, data]) => {
                    // Only include if not skipped and use the potentially edited version from mappings
                    const updatedData = mappings[selector] || data;
                    if (!updatedData.skipped) {
                        const confidence = updatedData.confidence || 0;
                        if (confidence >= HIGH_CONFIDENCE_THRESHOLD) {
                            editedHighConfidenceMappings[selector] = updatedData;
                        }
                    }
                });

                // Collect low-confidence fields for sidebar
                console.log('🔍 Debug: lowConfidenceMappings keys:', Object.keys(lowConfidenceMappings));
                Object.entries(lowConfidenceMappings).forEach(([selector, data]) => {
                    const updatedData = mappings[selector] || data;
                    console.log(`🔍 Checking low-conf field ${selector}: skipped=${updatedData.skipped}, confidence=${updatedData.confidence}`);
                    if (!updatedData.skipped) {
                        editedLowConfidenceMappings[selector] = updatedData;
                        console.log(`✅ Added to editedLowConfidenceMappings: ${selector}`);
                    }
                });

                // Remove modal first
                // Remove host node to completely clear Shadow DOM
                host.remove();
                console.log("Fill button clicked. Starting fillForm...");
                console.log(`Filling ${Object.keys(editedHighConfidenceMappings).length} high-confidence fields`);
                console.log(`Tracking ${Object.keys(editedLowConfidenceMappings).length} low-confidence fields for sidebar`);

                // Fill the form directly in content script (only high-confidence fields)
                let result;
                try {
                    result = fillForm(editedHighConfidenceMappings);
                } catch (err) {
                    console.error("Critical error in fillForm:", err);
                    resolve({ mappings: {}, success: false, filled: 0, total: 0, cancelled: false, error: err.message });
                    return;
                }

                // Calculate corrections by comparing final state vs initial state
                Object.entries(editedHighConfidenceMappings).forEach(([selector, finalData]) => {
                    const initialData = initialMappings[selector];

                    if (initialData && finalData.value !== initialData.value) {
                        userCorrections.push({
                            field_purpose: finalData.purpose || 'unknown',
                            field_label: finalData.label || selector,
                            ai_value: initialData.value,
                            user_value: finalData.value,
                            form_url: window.location.href
                        });
                    }
                });

                // Send corrections to backend for learning (async, don't block)
                if (userCorrections.length > 0) {
                    try {
                        chrome.runtime.sendMessage({
                            type: 'SAVE_CORRECTIONS',
                            corrections: userCorrections,
                            form_url: window.location.href
                        });
                        console.log(`📊 Tracked ${userCorrections.length} corrections for ML`);
                    } catch (e) {
                        console.warn("Could not save corrections (likely dev env):", e);
                    }
                }

                // Show sidebar for low-confidence fields if any exist
                console.log('🔍 Debug: editedLowConfidenceMappings count:', Object.keys(editedLowConfidenceMappings).length);
                console.log('🔍 Debug: editedLowConfidenceMappings:', editedLowConfidenceMappings);
                if (Object.keys(editedLowConfidenceMappings).length > 0) {
                    console.log(`✅ Showing sidebar for ${Object.keys(editedLowConfidenceMappings).length} low-confidence fields`);
                    setTimeout(() => {
                        const skippedFields = Object.entries(editedLowConfidenceMappings).map(
                            ([selector, data]) => ({
                                selector,
                                fieldData: data,
                                confidence: data.confidence || 0
                            })
                        );
                        console.log('🔍 Debug: Calling showLowConfidenceFieldsSidebar with:', skippedFields);
                        showLowConfidenceFieldsSidebar(skippedFields);
                    }, 800); // Delay to let form fill animation complete
                } else {
                    console.log('⚠️ No low-confidence fields to show in sidebar');
                }

                console.log("Resolving preview modal with success...");
                // Resolve with the result so popup knows it's done

                // Resolve with the result so popup knows it's done
                resolve({ mappings: editedHighConfidenceMappings, filled: result.filled, total: result.total, success: result.success, cancelled: false });
            }
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                resolve({ mappings: {}, cancelled: true });
                resolve({ mappings: {}, cancelled: true });
                setTimeout(() => host.remove(), 50);
            }
        });

        // ASSEMBLE MODAL - CRITICAL FIX
        // 1. Assemble Dialog
        dialog.appendChild(header);
        dialog.appendChild(content); // Note: content contains table
        dialog.appendChild(footer);

        // 2. Add Dialog to Overlay
        overlay.appendChild(dialog);

        // 3. Append Overlay to Shadow DOM (Isolated!)
        shadow.appendChild(overlay);

        // VISIBILITY DEBUGGING
        setTimeout(() => {
            const rect = overlay.getBoundingClientRect();
            // We need to check Shadow Root logic?
            console.log("🕵️‍♂️ MODAL VISIBILITY REPORT (Shadow DOM):");
            console.log("Host in Light DOM:", document.contains(host));
            console.log("Overlay in Shadow DOM:", shadow.contains(overlay));
            console.log("Dimensions:", rect.width, "x", rect.height);
        }, 500);


        // VISIBILITY DEBUGGING
        setTimeout(() => {
            const rect = overlay.getBoundingClientRect();
            const computed = window.getComputedStyle(overlay);
            console.log("🕵️‍♂️ MODAL VISIBILITY REPORT:");
            console.log("In DOM:", document.contains(overlay));
            console.log("Dimensions:", rect.width, "x", rect.height);
            console.log("Position:", rect.top, ",", rect.left);
            console.log("Z-Index:", computed.zIndex);
            console.log("Display:", computed.display);
            console.log("Opacity:", computed.opacity);
            console.log("Visibility:", computed.visibility);
            console.log("Container:", targetContainer.tagName);
        }, 500);


        // Initial render
        try {
            console.log("Starting initial render...");
            renderPage(0);
            updateButtons();
            console.log("Initial render complete");
        } catch (e) {
            console.error("Render failed:", e);
        }

        // Keyboard Shortcuts
        dialog.addEventListener('keydown', (e) => {
            // Left Arrow: Previous
            if (e.key === 'ArrowLeft') {
                if (!prevBtn.disabled) prevBtn.click();
            }
            // Right Arrow: Next
            if (e.key === 'ArrowRight') {
                if (!nextBtn.disabled && nextBtn.dataset.action === 'next') nextBtn.click();
            }
            // Cmd+Enter or Ctrl+Enter: Fill Form (Submit)
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                // If on last page, submit. If not, maybe fast-forward? 
                // Let's just trigger next button which handles logic.
                // If it's "Fill", it fills. If "Next", it goes next.
                // Power user might want to submit FROM ANY PAGE? 
                // That's risky if they haven't reviewed. Let's stick to triggering the primary action.
                nextBtn.click();
            }
            // Esc: Cancel
            if (e.key === 'Escape') {
                cancelBtn.click();
            }
        });

        // Focus dialog to capture events
        setTimeout(() => dialog.focus(), 50);
    });
}


// Calculate mapping statistics for preview
function calculateMappingStats(mappings, allFields) {
    let total = 0;
    let autoFill = 0;
    let manualUpload = 0;
    let highConfidence = 0;
    let mediumConfidence = 0;
    let lowConfidence = 0;

    for (const [selector, fieldData] of Object.entries(mappings)) {
        total++;
        const fieldInfo = allFields.find(f => f.selector === selector) || {};

        if (fieldInfo.type === 'file') {
            manualUpload++;
        } else {
            autoFill++;
            const confidence = fieldData.confidence || 1.0;
            if (confidence >= 0.9) highConfidence++;
            else if (confidence >= 0.7) mediumConfidence++;
            else lowConfidence++;
        }
    }

    return {
        total,
        autoFill,
        manualUpload,
        highConfidence,
        mediumConfidence,
        lowConfidence
    };
}

// Get confidence level label
function getConfidenceLevel(confidence) {
    if (confidence >= 0.9) return 'High';
    if (confidence >= 0.7) return 'Medium';
    return 'Low';
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Inject modal styles into the page
function injectModalStyles() {
    console.log("🎨 injectModalStyles called");
    const styleId = 'smarthirex-modal-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = getEnterpriseModalCSS();
    document.head.appendChild(style);
}
