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
    const fileFields = detectFileFields();
    if (fileFields.length > 0) {
        // Highlight file fields after a short delay
        setTimeout(() => {
            highlightFileFields(fileFields);
        }, 1000);
    }

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
        fileFields: fileFields.map(field => ({
            selector: getElementSelector(field),
            label: field.labels && field.labels.length > 0 ? field.labels[0].textContent : 'File Upload'
        }))
    };
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

// Show preview modal for reviewing mappings before filling
async function showPreviewModal(mappings, analysis, allFields) {
    return new Promise((resolve, reject) => {
        // Inject modal styles if not already present
        if (!document.getElementById('smarthirex-modal-styles')) {
            injectModalStyles();
        }

        // Calculate statistics
        const stats = calculateMappingStats(mappings, allFields);

        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.id = 'smarthirex-preview-overlay';
        overlay.className = 'smarthirex-modal-overlay';

        // Create modal dialog
        const dialog = document.createElement('div');
        dialog.className = 'smarthirex-preview-dialog';

        // Dialog header with stats
        const header = document.createElement('div');
        header.className = 'smarthirex-dialog-header';
        header.innerHTML = `
            <h3>Review Before Filling</h3>
            <p style="margin-top: 8px;">Please review and confirm the field mappings below</p>
            <div class="smarthirex-stats-summary" style="margin-top: 16px; display: flex; gap: 16px; flex-wrap: wrap;">
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

        // Add rows for each mapping
        for (const [selector, fieldData] of Object.entries(mappings)) {
            const fieldInfo = allFields.find(f => f.selector === selector) || {};
            const label = fieldInfo.label || selector;
            const value = fieldData.value || '';
            const confidence = fieldData.confidence || 1.0;
            const isFileField = fieldInfo.type === 'file';

            const row = document.createElement('div');
            row.className = 'table-row';
            row.dataset.selector = selector;

            const confidenceLevel = getConfidenceLevel(confidence);
            const confidenceClass = confidenceLevel.toLowerCase();

            row.innerHTML = `
                <div class="td-checkbox">
                    <input type="checkbox" class="field-checkbox" ${!isFileField ? 'checked' : ''} ${isFileField ? 'disabled' : ''}>
                </div>
                <div class="td-field">
                    ${isFileField ? '<span class="file-icon">📄</span>' : ''}
                    <span class="field-label">${label}</span>
                    ${fieldInfo.required ? '<span class="required-badge">*</span>' : ''}
                </div>
                <div class="td-value">
                    ${isFileField ?
                    '<span class="manual-upload-text">Upload Manually</span>' :
                    `<input type="text" class="value-input" value="${escapeHtml(value)}" ${confidence >= 0.9 ? '' : 'style="background: #fef3c7;"'}>`
                }
                </div>
                <div class="td-confidence">
                    ${!isFileField ? `<span class="confidence-badge ${confidenceClass}">${confidenceLevel}</span>` : ''}
                </div>
            `;

            tableBody.appendChild(row);
        }

        table.appendChild(tableBody);
        content.appendChild(table);

        // Dialog footer
        const footer = document.createElement('div');
        footer.className = 'smarthirex-dialog-footer';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'smarthirex-btn smarthirex-btn-secondary';
        cancelBtn.textContent = 'Cancel';

        const fillBtn = document.createElement('button');
        fillBtn.type = 'button';
        fillBtn.className = 'smarthirex-btn smarthirex-btn-primary';
        fillBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Fill Form
        `;

        footer.appendChild(cancelBtn);
        footer.appendChild(fillBtn);

        // Assemble dialog
        dialog.appendChild(header);
        dialog.appendChild(content);
        dialog.appendChild(footer);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // Event handlers
        // Select all checkbox
        const selectAllCheckbox = tableHeader.querySelector('#select-all-fields');
        selectAllCheckbox.addEventListener('change', (e) => {
            const checkboxes = tableBody.querySelectorAll('.field-checkbox:not([disabled])');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
        });

        cancelBtn.addEventListener('click', () => {
            resolve({ mappings: {}, cancelled: true });
            setTimeout(() => document.body.removeChild(overlay), 50);
        });

        // Fill button - collect edited mappings and fill the form directly
        fillBtn.addEventListener('click', () => {
            const editedMappings = {};
            const rows = tableBody.querySelectorAll('.table-row');

            rows.forEach((row) => {
                const checkbox = row.querySelector('.field-checkbox');
                const selector = row.dataset.selector;

                // Only include checked fields
                if (checkbox && checkbox.checked && !checkbox.disabled) {
                    const valueInput = row.querySelector('.value-input');
                    const newValue = valueInput ? valueInput.value : mappings[selector]?.value;

                    editedMappings[selector] = {
                        ...mappings[selector],
                        value: newValue
                    };
                }
            });

            // Remove modal first
            document.body.removeChild(overlay);

            // Fill the form directly in content script
            const result = fillForm(editedMappings);

            // Resolve with the result so popup knows it's done
            resolve({ mappings: editedMappings, filled: result.filled, total: result.total, success: result.success, cancelled: false });
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                resolve({ mappings: {}, cancelled: true });
                setTimeout(() => document.body.removeChild(overlay), 50);
            }
        });
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
    document.head.appendChild(style);
}
