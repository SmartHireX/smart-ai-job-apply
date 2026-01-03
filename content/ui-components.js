/**
 * ui-components.js
 * Handles UI construction, chat interface, and native field manipulation helpers.
 */

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

function showProcessingWidget(text, step) {
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

    // Convert step to actual progress percentage
    // Step 1 (Instant Match) = 33%
    // Step 2 (AI Thinking) = 66%
    // Step 3 (Finalizing) = 100%
    const progressMap = { 1: 33, 2: 66, 3: 100 };
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
    toast.style.cssText = `
        position: fixed; top: 24px; left: 50%; transform: translateX(-50%);
        background: #0f172a; color: white; padding: 12px 24px; border-radius: 12px;
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2); z-index: 2147483647;
        display: flex; align-items: center; gap: 16px; font-family: 'Inter', sans-serif;
        border: 1px solid rgba(255,255,255,0.1); animation: slideDownFade 0.4s ease-out;
    `;

    toast.innerHTML = `
        <div style="background: #10b981; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div style="display: flex; flex-direction: column;">
            <span style="font-weight: 700; font-size: 14px;">Form Filled Successfully!</span>
            <span style="font-size: 12px; color: #94a3b8;">${filled} fields matched, ${review} need review</span>
        </div>
        <div style="display: flex; gap: 8px; margin-left: 8px;">
            <!-- Removed Clear Highlights Button -->
            <button id="smarthirex-toast-undo" style="background: #ef4444; border: none; color: white; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">Undo</button>
        </div>
    `;

    document.body.appendChild(toast);

    // Event Listeners
    toast.querySelector('#smarthirex-toast-undo').addEventListener('click', () => {
        undoFormFill();
        toast.remove();
    });

    // Clear highlight listener removed
    /*
    toast.querySelector('#smarthirex-toast-clear-highlights').addEventListener('click', () => {
        clearAllFieldHighlights();
        toast.remove();
    });
    */

    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, -20px)';
            setTimeout(() => toast.remove(), 400);
        }
    }, 6000);
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
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; top: 24px; left: 50%; transform: translate(-50%, 0);
        background: #fee2e2; color: #b91c1c; padding: 12px 20px; border-radius: 8px;
        box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); z-index: 2147483647;
        display: flex; align-items: center; gap: 10px; font-family: 'Inter', sans-serif;
        font-weight: 600; border: 1px solid #fecaca; font-size: 14px;
        animation: slideDownFade 0.3s ease-out;
    `;

    toast.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>${message}</span>
    `;

    // CSS Decoupling: Animations now in sidebar.css

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, -10px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function showUndoConfirmationModal() {
    const existing = document.getElementById('smarthirex-undo-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'smarthirex-undo-modal-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px);
        z-index: 2147483647; display: flex; align-items: center; justify-content: center;
        animation: fadeIn 0.2s ease-out;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
    `;

    // CSS Decoupling: Animations now in sidebar.css


    document.body.appendChild(overlay);

    const modal = document.createElement('div');
    modal.style.cssText = `
        background: white; width: 400px; border-radius: 16px; padding: 24px;
        box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    modal.innerHTML = `
        <div style="background: #fef2f2; width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5">
                <path d="M3 7v6h6M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>
            </svg>
        </div>
        <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 700; color: #0f172a;">Undo Form Fill?</h3>
        <p style="margin: 0 0 24px 0; font-size: 14px; color: #64748b; line-height: 1.5;">This will revert all fields to their original values and close the review sidebar. This action cannot be undone.</p>
        <div style="display: flex; gap: 12px;">
            <button id="smarthirex-modal-cancel" style="flex: 1; padding: 12px; border-radius: 10px; border: 1px solid #e2e8f0; background: white; color: #64748b; font-weight: 600; cursor: pointer; transition: all 0.2s;">Keep Changes</button>
            <button id="smarthirex-modal-confirm" style="flex: 1; padding: 12px; border-radius: 10px; border: none; background: #ef4444; color: white; font-weight: 600; cursor: pointer; transition: all 0.2s;">Yes, Undo All</button>
        </div>
    `;

    overlay.appendChild(modal);

    const close = () => overlay.remove();
    modal.querySelector('#smarthirex-modal-cancel').onclick = close;
    modal.querySelector('#smarthirex-modal-confirm').onclick = (e) => {
        undoFormFill();
        close();
    };
    overlay.onclick = (e) => {
        if (e.target === overlay) close();
    };
}

async function showRegenerateModal(selector, label) {
    const existing = document.getElementById('smarthirex-regenerate-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'smarthirex-regenerate-modal';

    modal.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <div class="modal-header">
                <div class="modal-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                    </svg>
                    <span>Regenerate Field</span>
                </div>
                <button class="modal-close-btn" id="regen-close">×</button>
            </div>
            <div class="modal-body">
                <div class="field-preview">
                    <label>Field:</label>
                    <div class="field-name">${label}</div>
                </div>
                <div class="instruction-input">
                    <label for="regen-instruction">Custom Instructions (Optional)</label>
                    <textarea 
                        id="regen-instruction" 
                        placeholder="e.g., 'Make it more professional' or 'Focus on teamwork skills'"
                        rows="3"
                    ></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" id="regen-cancel">Cancel</button>
                <button class="btn-primary" id="regen-submit">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                    </svg>
                    Regenerate
                </button>
            </div>
        </div>
    `;

    // Add styles
    // CSS Decoupling: Styles now in sidebar.css

    document.body.appendChild(modal);

    // Event handlers
    const close = () => modal.remove();

    modal.querySelector('#regen-close').addEventListener('click', close);
    modal.querySelector('#regen-cancel').addEventListener('click', close);
    modal.querySelector('.modal-overlay').addEventListener('click', close);

    modal.querySelector('#regen-submit').addEventListener('click', async () => {
        const instruction = modal.querySelector('#regen-instruction').value.trim();
        close();
        await regenerateFieldWithAI(selector, label, instruction);
    });
}

function showReopenTrigger(allFields) {
    // Remove any existing trigger first
    const existingTrigger = document.getElementById('smarthirex-reopen-trigger');
    if (existingTrigger) existingTrigger.remove();

    // Create reopen button
    const trigger = document.createElement('div');
    trigger.id = 'smarthirex-reopen-trigger';
    trigger.className = 'smarthirex-reopen-button';
    trigger.innerHTML = `
        <div class="trigger-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0a66c2" stroke-width="2.5">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
            </svg>
        </div>
        <span>Form Review</span>
    `;

    trigger.addEventListener('click', () => {
        trigger.remove();
        showAccordionSidebar(allFields);
    });

    document.body.appendChild(trigger);
}

function showAccordionSidebar(allFields) {
    console.log('🎯 Nova AI: Showing Form Review...');
    console.log(`Total fields: ${allFields.length}`);

    // Remove existing sidebar if any
    const existing = document.getElementById('smarthirex-accordion-sidebar');
    if (existing) existing.remove();

    // Group fields by source type
    const appFillFields = [];   // Heuristic matches (high confidence, no specific source)
    const cacheFields = [];      // From smart memory
    const aiFields = [];         // AI-generated or low confidence
    const manualFields = [];     // Unfilled or file uploads

    // ========== SEPARATE RADIO/CHECKBOX/SELECT FIELDS FROM OTHERS ==========
    const radioCheckboxFields = [];
    const selectFields = [];
    const otherFieldsRaw = [];

    allFields.forEach(item => {
        const element = document.querySelector(item.selector);
        if (!element || !isFieldVisible(element)) return;

        const label = item.fieldData?.label || getFieldLabel(element);
        const fieldType = item.fieldData?.field_type || element.type || 'text';
        const isFileUpload = fieldType === 'file' || element.type === 'file';

        const fieldInfo = {
            field: element,
            selector: item.selector,
            label,
            confidence: item.confidence,
            fieldType: fieldType,
            source: item.source || 'heuristic',
            value: item.value || element.value,
            isFileUpload
        };

        // Separate radio/checkbox/select from other fields
        if (fieldType === 'radio' || fieldType === 'checkbox') {
            radioCheckboxFields.push(fieldInfo);
        } else if (fieldType === 'select' || fieldType === 'select-one' || fieldType === 'select-multiple' || element.tagName === 'SELECT') {
            selectFields.push(fieldInfo);
        } else {
            otherFieldsRaw.push(fieldInfo);
        }
    });

    // ========== GROUP RADIO/CHECKBOX FIELDS BY NAME ==========
    function groupRadioCheckboxFields(fields) {
        const radioGroups = {};
        const checkboxGroups = {};
        const ungroupedFields = [];

        fields.forEach(fieldInfo => {
            if (fieldInfo.fieldType === 'radio') {
                const name = fieldInfo.field.name;
                if (name) {
                    if (!radioGroups[name]) radioGroups[name] = [];
                    radioGroups[name].push(fieldInfo);
                } else {
                    ungroupedFields.push(fieldInfo);
                }
            } else if (fieldInfo.fieldType === 'checkbox') {
                const name = fieldInfo.field.name;
                if (name) {
                    if (!checkboxGroups[name]) checkboxGroups[name] = [];
                    checkboxGroups[name].push(fieldInfo);
                } else {
                    ungroupedFields.push(fieldInfo);
                }
            }
        });

        const groupedFields = [];

        // Helper to extract the GROUP question label (not individual option labels)
        function getGroupQuestionLabel(field) {
            // Try fieldset legend first
            const fieldset = field.closest('fieldset');
            if (fieldset) {
                const legend = fieldset.querySelector('legend');
                if (legend) return legend.textContent.trim();
            }

            // Look for a parent container with a header or label
            let parent = field.parentElement;
            for (let i = 0; i < 4; i++) {
                if (!parent || parent.tagName === 'FORM' || parent.tagName === 'BODY') break;

                // Look for headers in this parent
                const headers = parent.querySelectorAll('h1, h2, h3, h4, h5, h6, legend, .form-label, .question');
                for (const header of headers) {
                    if (header.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING) {
                        const text = header.textContent.trim();
                        if (text.length > 5 && text.length < 200) return text;
                    }
                }

                parent = parent.parentElement;
            }

            // Fallback: use the name attribute formatted
            const formatted = field.name.replace(/[-_]/g, ' ').replace(/([A-Z])/g, ' $1').trim();
            // Capitalize first letter
            return formatted.charAt(0).toUpperCase() + formatted.slice(1);
        }

        // Process radio groups
        Object.entries(radioGroups).forEach(([name, radios]) => {
            const selectedRadio = radios.find(r => r.field.checked);

            if (selectedRadio) {
                // Get the SPECIFIC option label (not the group question)
                // Use label[for="id"] or adjacent text, NOT getFieldLabel which returns group question
                let selectedValue = selectedRadio.value || selectedRadio.field.value;

                // Try to get the option's specific label text
                if (selectedRadio.field.id) {
                    const optionLabel = document.querySelector(`label[for="${selectedRadio.field.id}"]`);
                    if (optionLabel) {
                        selectedValue = optionLabel.textContent.trim();
                    }
                } else {
                    // No id - check if input is inside a label
                    const parentLabel = selectedRadio.field.closest('label');
                    if (parentLabel) {
                        selectedValue = parentLabel.textContent.trim();
                    }
                }

                // Get the GROUP label from field name (capitalized and formatted)
                const fieldName = radios[0].field.name || 'Radio';
                let groupLabel = fieldName.replace(/[-_]/g, ' ').replace(/([A-Z])/g, ' $1').trim();
                groupLabel = groupLabel.charAt(0).toUpperCase() + groupLabel.slice(1);

                groupedFields.push({
                    ...selectedRadio,
                    label: groupLabel,
                    displayValue: selectedValue,
                    isRadioGroup: true,
                    filled: true,
                    groupName: name
                });
            } else {
                const firstRadio = radios[0];
                let groupLabel = getGroupQuestionLabel(firstRadio.field);

                groupedFields.push({
                    ...firstRadio,
                    label: groupLabel,
                    displayValue: null,
                    isRadioGroup: true,
                    filled: false,
                    groupName: name
                });
            }
        });

        // Process checkbox groups
        Object.entries(checkboxGroups).forEach(([name, checkboxes]) => {
            const checkedBoxes = checkboxes.filter(c => c.field.checked);

            if (checkedBoxes.length > 0) {
                // Get SPECIFIC checkbox option labels, not group question
                const selectedValues = checkedBoxes.map(cb => {
                    let value = cb.value || cb.field.value;

                    // Try to get the option's specific label
                    if (cb.field.id) {
                        const optionLabel = document.querySelector(`label[for="${cb.field.id}"]`);
                        if (optionLabel) {
                            value = optionLabel.textContent.trim();
                        }
                    }

                    return value;
                });

                let groupLabel = getGroupQuestionLabel(checkboxes[0].field);

                groupedFields.push({
                    ...checkedBoxes[0],
                    label: groupLabel,
                    displayValue: selectedValues.join(', '),
                    isCheckboxGroup: true,
                    filled: true,
                    groupName: name,
                    checkedCount: checkedBoxes.length,
                    totalCount: checkboxes.length
                });
            } else {
                const firstCheckbox = checkboxes[0];
                let groupLabel = getGroupQuestionLabel(firstCheckbox.field);

                groupedFields.push({
                    ...firstCheckbox,
                    label: groupLabel,
                    displayValue: null,
                    isCheckboxGroup: true,
                    filled: false,
                    groupName: name,
                    checkedCount: 0,
                    totalCount: checkboxes.length
                });
            }
        });

        return [...ungroupedFields, ...groupedFields];
    }

    // Group all radio/checkbox fields
    const groupedRadioCheckbox = groupRadioCheckboxFields(radioCheckboxFields);

    // ========== GROUP SELECT FIELDS BY NAME PREFIX ==========
    function groupSelectFields(fields) {
        // Helper to extract prefix from name (before _, -, or camelCase)
        function extractPrefix(name) {
            if (!name) return null;

            // Try underscore delimiter: education_level -> education
            if (name.includes('_')) {
                return name.split('_')[0];
            }

            // Try dash delimiter: work-experience -> work
            if (name.includes('-')) {
                return name.split('-')[0];
            }

            // Try camelCase: addressCity -> address
            const camelMatch = name.match(/^[a-z]+/);
            if (camelMatch && camelMatch[0].length < name.length) {
                return camelMatch[0];
            }

            return null; // No grouping pattern detected
        }

        // Helper to format prefix as label
        function formatPrefixAsLabel(prefix) {
            // Convert to sentence case: education -> Education
            return prefix.charAt(0).toUpperCase() + prefix.slice(1);
        }

        const selectGroups = {};
        const ungroupedSelects = [];

        // Group selects by prefix
        fields.forEach(fieldInfo => {
            const name = fieldInfo.field.name;
            const prefix = extractPrefix(name);

            if (prefix) {
                if (!selectGroups[prefix]) selectGroups[prefix] = [];
                selectGroups[prefix].push(fieldInfo);
            } else {
                ungroupedSelects.push(fieldInfo);
            }
        });

        const groupedFields = [];

        // Process select groups (minimum 2 selects to form a group)
        Object.entries(selectGroups).forEach(([prefix, selects]) => {
            if (selects.length < 2) {
                // Single select - don't group, keep as is
                ungroupedSelects.push(...selects);
                return;
            }

            // Check if ALL selects in group have values
            const allFilled = selects.every(s => s.value && String(s.value).trim() !== '');
            const anyFilled = selects.some(s => s.value && String(s.value).trim() !== '');

            if (allFilled) {
                // All filled - create grouped entry
                const selectedValues = selects.map(s => {
                    const select = s.field;
                    if (select.selectedIndex >= 0 && select.options[select.selectedIndex]) {
                        return select.options[select.selectedIndex].text.trim();
                    }
                    return s.value || '';
                }).filter(v => v);

                const groupLabel = formatPrefixAsLabel(prefix);

                groupedFields.push({
                    ...selects[0], // Use first select as base
                    label: groupLabel,
                    displayValue: selectedValues.join(', '),
                    isSelectGroup: true,
                    filled: true,
                    groupName: prefix,
                    selectCount: selects.length,
                    originalFields: selects
                });
            } else if (anyFilled) {
                // Partially filled - show filled values with indicator
                const filledSelects = selects.filter(s => s.value && String(s.value).trim() !== '');
                const selectedValues = filledSelects.map(s => {
                    const select = s.field;
                    if (select.selectedIndex >= 0 && select.options[select.selectedIndex]) {
                        return select.options[select.selectedIndex].text.trim();
                    }
                    return s.value || '';
                }).filter(v => v);

                const unfilledCount = selects.length - filledSelects.length;
                const groupLabel = formatPrefixAsLabel(prefix);

                groupedFields.push({
                    ...filledSelects[0],
                    label: groupLabel,
                    displayValue: selectedValues.join(', ') + ` (+${unfilledCount} more)`,
                    isSelectGroup: true,
                    filled: false, // Partially filled = not fully complete
                    groupName: prefix,
                    selectCount: selects.length,
                    filledCount: filledSelects.length,
                    originalFields: selects
                });
            } else {
                // All unfilled - create empty group entry
                const groupLabel = formatPrefixAsLabel(prefix);

                groupedFields.push({
                    ...selects[0],
                    label: groupLabel,
                    displayValue: null,
                    isSelectGroup: true,
                    filled: false,
                    groupName: prefix,
                    selectCount: selects.length,
                    filledCount: 0,
                    originalFields: selects
                });
            }
        });

        return [...ungroupedSelects, ...groupedFields];
    }

    // Group all select fields
    const groupedSelects = groupSelectFields(selectFields);

    // ========== CATEGORIZE ALL FIELDS INTO TABS ==========
    const finalAppFillFields = [];
    const finalCacheFields = [];
    const finalAiFields = [];
    const finalManualFields = [];

    // Process grouped radio/checkbox fields
    groupedRadioCheckbox.forEach(field => {
        // Unfilled groups go to Manual
        if ((field.isRadioGroup || field.isCheckboxGroup) && !field.filled) {
            finalManualFields.push(field);
        } else {
            // Filled groups - categorize by source/confidence
            if (field.source === 'smart-memory' || field.source === 'selection_cache') {
                finalCacheFields.push(field);
            } else if (field.confidence >= 0.85 && (field.source === 'heuristic' || field.source === 'local_heuristic' || !field.source || field.source === undefined)) {
                finalAppFillFields.push(field);
            } else {
                finalAiFields.push(field);
            }
        }
    });

    // Process grouped select fields
    groupedSelects.forEach(field => {
        // Select groups - route based on filled status
        if (field.isSelectGroup && !field.filled) {
            // Unfilled or partially filled groups go to Manual
            finalManualFields.push(field);
        } else if (field.isSelectGroup && field.filled) {
            // Fully filled groups - categorize by source/confidence
            if (field.source === 'smart-memory' || field.source === 'selection_cache') {
                finalCacheFields.push(field);
            } else if (field.confidence >= 0.85 && (field.source === 'heuristic' || field.source === 'local_heuristic' || !field.source || field.source === undefined)) {
                finalAppFillFields.push(field);
            } else {
                finalAiFields.push(field);
            }
        } else {
            // Ungrouped single selects - categorize normally
            const isEmpty = !field.value || String(field.value).trim() === '';
            if (isEmpty) {
                finalManualFields.push(field);
            } else if (field.source === 'smart-memory' || field.source === 'selection_cache') {
                finalCacheFields.push(field);
            } else if (field.confidence >= 0.85 && (field.source === 'heuristic' || field.source === 'local_heuristic' || !field.source || field.source === undefined)) {
                finalAppFillFields.push(field);
            } else {
                finalAiFields.push(field);
            }
        }
    });

    // Process other (non-radio/checkbox) fields
    otherFieldsRaw.forEach(field => {
        const isEmpty = !field.value || String(field.value).trim() === '';

        if (field.isFileUpload || isEmpty) {
            finalManualFields.push(field);
        } else if (field.source === 'smart-memory' || field.source === 'selection_cache') {
            finalCacheFields.push(field);
        } else if (field.confidence >= 0.85 && (field.source === 'heuristic' || field.source === 'local_heuristic' || !field.source || field.source === undefined)) {
            finalAppFillFields.push(field);
        } else {
            finalAiFields.push(field);
        }
    });

    console.log(`📄 After Grouping & Re-routing - App Fill: ${finalAppFillFields.length}, Cache: ${finalCacheFields.length}, AI: ${finalAiFields.length}, Manual: ${finalManualFields.length}`);

    if (finalAppFillFields.length === 0 && finalCacheFields.length === 0 && finalAiFields.length === 0) {
        console.log('No fields to show in sidebar');
        return;
    }

    // Remove existing reopen trigger if showing
    const existingTrigger = document.getElementById('smarthirex-reopen-trigger');
    if (existingTrigger) existingTrigger.remove();

    // Create accordion sidebar panel
    const panel = document.createElement('div');
    panel.id = 'smarthirex-accordion-sidebar';
    panel.innerHTML = `
        <div class="resize-handle top"></div>
        <div class="resize-handle right"></div>
        <div class="resize-handle bottom"></div>
        <div class="resize-handle left"></div>
        <div class="resize-handle top-left"></div>
        <div class="resize-handle top-right"></div>
        <div class="resize-handle bottom-left"></div>
        <div class="resize-handle bottom-right"></div>

        <div class="sidebar-header">
            <div class="header-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                </svg>
                <span>Form Review</span>
            </div>
            <div class="header-actions">
                <!-- Removed Clear Highlights Button -->
                <button class="header-text-btn" id="smarthirex-undo-fill" data-tooltip="Undo all the filled field">
                    Undo all
                </button>
                <button class="close-btn-x" id="smarthirex-sidebar-close" aria-label="Close Sidebar">
                    ✕
                </button>
            </div>
        </div>
        
        <div class="tab-navigation">
            <button class="tab active" data-tab="app">
                📄 App Fill <span class="tab-count">(0)</span>
            </button>
            <button class="tab" data-tab="cache">
                🧠 Cache <span class="tab-count">(0)</span>
            </button>
            <button class="tab" data-tab="ai">
                🤖 AI <span class="tab-count">(0)</span>
            </button>
            <button class="tab" data-tab="manual">
                ✋ Manual <span class="tab-count">(0)</span>
            </button>
        </div>
        
        <div class="sidebar-content-scroll" style="flex: 1; overflow-y: auto; overflow-x: hidden;">
            <!-- App Fill Tab (Read-only, name only) -->
            <div class="tab-content active" data-tab="app">
                ${finalAppFillFields.map(item => `
                    <div class="field-item" data-selector="${item.selector.replace(/"/g, '&quot;')}">
                        <div class="field-label">${item.label}${(item.isRadioGroup || item.isCheckboxGroup || item.isSelectGroup) && item.displayValue ? `: <span style="color: #10b981; font-weight: 500;">${item.displayValue}</span>` : ''}</div>
                    </div>
                `).join('')}
                ${finalAppFillFields.length === 0 ? '<div class="empty-state">No app-filled fields</div>' : ''}
            </div>

            <!-- Cache Tab (Name only, with recalculate) -->
            <div class="tab-content" data-tab="cache" style="display: none;">
                ${finalCacheFields.filter(field => field.source !== 'selection_cache').length > 0 ? `
                    <div class="tab-actions">
                        <button class="recalculate-all-btn" data-tab="cache" data-tooltip="Regenerate all cached fields using AI">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
                            Regenerate All (${finalCacheFields.filter(field => field.source !== 'selection_cache').length})
                        </button>
                    </div>
                ` : ''}
                ${finalCacheFields.map(item => `
                    <div class="field-item" data-selector="${item.selector.replace(/"/g, '&quot;')}">
                        <div class="field-header">
                            <div class="field-label">${item.label}${(item.isRadioGroup || item.isCheckboxGroup || item.isSelectGroup) && item.displayValue ? `: <span style="color: #10b981;">${item.displayValue}</span>` : ''}</div>
                            ${item.source !== 'selection_cache' ? `<button class="recalculate-btn" data-selector="${item.selector.replace(/"/g, '&quot;')}" data-label="${item.label}" data-tooltip="Regenerate using AI">🔄</button>` : ''}
                        </div>
                    </div>
                `).join('')}
                ${finalCacheFields.length === 0 ? '<div class="empty-state">No cached fields</div>' : ''}
            </div>

            <!-- AI Tab (Name + confidence, with recalculate) -->
            <div class="tab-content" data-tab="ai" style="display: none;">
                ${finalAiFields.length > 0 ? `
                    <div class="tab-actions">
                        <button class="recalculate-all-btn" data-tab="ai" data-tooltip="Regenerate all AI fields with fresh context">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
                            Regenerate All (${finalAiFields.length})
                        </button>
                    </div>
                ` : ''}
                ${finalAiFields.map(item => `
                    <div class="field-item" data-selector="${item.selector.replace(/"/g, '&quot;')}">
                        <div class="field-header">
                            <div class="field-label">${item.label}${(item.isRadioGroup || item.isCheckboxGroup || item.isSelectGroup) && item.displayValue ? `: <span style="color: #10b981;">${item.displayValue}</span>` : ''}</div>
                            <button class="recalculate-btn" data-selector="${item.selector.replace(/"/g, '&quot;')}" data-label="${item.label}" data-tooltip="Regenerate using AI">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
                            </button>
                        </div>
                        <div class="field-confidence">⚡ ${Math.round(item.confidence * 100)}%</div>
                    </div>
                `).join('')}
                ${finalAiFields.length === 0 ? '<div class="empty-state">No AI-generated fields</div>' : ''}
            </div>

            <!-- Manual Tab (Unfilled and file uploads) -->
            <div class="tab-content" data-tab="manual" style="display: none;">
                ${finalManualFields.map(item => `
                    <div class="field-item" data-selector="${item.selector.replace(/"/g, '&quot;')}">
                        <div class="field-header">
                            <div class="field-label">
                                ${item.isFileUpload ? '📁 ' : ''}${item.label}
                            </div>
                        </div>
                        ${item.isFileUpload ? '<div class="field-note">File upload required</div>' : '<div class="field-note">Not filled</div>'}
                    </div>
                `).join('')}
                ${finalManualFields.length === 0 ? '<div class="empty-state">All fields filled!</div>' : ''}
            </div>
        </div>
    `;

    // Update tab counts
    panel.querySelector('[data-tab="app"] .tab-count').textContent = `(${finalAppFillFields.length})`;
    panel.querySelector('[data-tab="cache"] .tab-count').textContent = `(${finalCacheFields.length})`;
    panel.querySelector('[data-tab="ai"] .tab-count').textContent = `(${finalAiFields.length})`;
    panel.querySelector('[data-tab="manual"] .tab-count').textContent = `(${finalManualFields.length})`;

    document.body.appendChild(panel);

    // Setup Dragging and Resizing
    setupSidebarInteractivity(panel);

    // Add close handler securely
    const sidebarCloseBtn = panel.querySelector('#smarthirex-sidebar-close');
    if (sidebarCloseBtn) {
        sidebarCloseBtn.addEventListener('click', () => {
            const sidebar = document.getElementById('smarthirex-accordion-sidebar');
            if (sidebar) sidebar.remove();

            // Show the reopen trigger
            showReopenTrigger(allFields);

            document.querySelectorAll('.smarthirex-field-highlight').forEach(el => el.classList.remove('smarthirex-field-highlight'));
            hideConnectionBeam(); // Clean up beam
        });
    }

    // Clear Highlights button removed
    /*
    const clearHighlightsBtn = panel.querySelector('#smarthirex-clear-highlights');
    if (clearHighlightsBtn) {
        clearHighlightsBtn.addEventListener('click', () => {
            clearAllFieldHighlights();
        });
    }
    */

    // Undo Fill button
    const undoFillBtn = panel.querySelector('#smarthirex-undo-fill');
    if (undoFillBtn) {
        undoFillBtn.addEventListener('click', () => {
            // Create and append modal
            const overlay = document.createElement('div');
            overlay.id = 'smarthirex-undo-modal-overlay';
            overlay.innerHTML = `
                <div id="smarthirex-undo-modal" role="dialog" aria-modal="true">
                    <h3>Confirm Undo</h3>
                    <p>Are you sure you want to undo all filled fields? This action cannot be reversed.</p>
                    <div class="modal-actions">
                        <button class="btn btn-cancel" id="smarthirex-modal-cancel">Cancel</button>
                        <button class="btn btn-confirm" id="smarthirex-modal-confirm">Yes, Undo All</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            // Close modal helper
            const close = () => {
                overlay.style.opacity = '0';
                setTimeout(() => overlay.remove(), 200);
            };

            // Event listeners
            overlay.querySelector('#smarthirex-modal-cancel').addEventListener('click', close);

            overlay.querySelector('#smarthirex-modal-confirm').addEventListener('click', async () => {
                close();
                await undoFormFill();
                const sidebar = document.getElementById('smarthirex-accordion-sidebar');
                if (sidebar) sidebar.remove();
            });

            // Close on overlay click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close();
            });
        });
    }

    // Tab switching
    const tabs = panel.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;

            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Show corresponding content
            const tabContents = panel.querySelectorAll('.tab-content');
            tabContents.forEach(content => {
                content.style.display = content.dataset.tab === tabName ? 'block' : 'none';
            });
        });
    });

    // Individual recalculate buttons
    const recalculateBtns = panel.querySelectorAll('.recalculate-btn');
    recalculateBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const selector = btn.dataset.selector;
            const label = btn.dataset.label;
            await showRegenerateModal(selector, label);
        });
    });

    // Recalculate All buttons
    const recalculateAllBtns = panel.querySelectorAll('.recalculate-all-btn');
    recalculateAllBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const tabType = btn.dataset.tab;
            const btnText = btn.textContent;
            btn.textContent = 'Recalculating...';
            btn.disabled = true;

            // Get all fields in this tab
            const tabContent = panel.querySelector(`.tab-content[data-tab="${tabType}"]`);
            const fieldBtns = tabContent.querySelectorAll('.recalculate-btn');

            // Recalculate each field sequentially
            for (const fieldBtn of fieldBtns) {
                await new Promise(resolve => {
                    fieldBtn.click();
                    setTimeout(resolve, 500); // Small delay between fields
                });
            }

            btn.textContent = btnText;
            btn.disabled = false;
        });
    });

    // Field click handlers for scrolling and highlighting
    const fieldItems = panel.querySelectorAll('.field-item');
    fieldItems.forEach(item => {
        const selector = item.dataset.selector;
        if (!selector) return;

        // Click to scroll to field
        item.addEventListener('click', () => {
            try {
                const element = document.querySelector(selector);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    element.focus();
                }
            } catch (e) {
                console.warn('Skipping invalid selector click:', selector, 'Error:', e.message);
                console.log('Field info:', { label: item.textContent, selector: selector, length: selector?.length });
                showErrorToast('Could not scroll to field (Invalid Selector)');
            }
        });

        // Hover to show connection beam
        item.addEventListener('mouseenter', () => {
            try {
                if (!selector) return;
                const element = document.querySelector(selector);
                console.log(`[Sidebar Debug] Hovering "${selector}". Found?`, !!element);

                if (element) {
                    // Smart Highlight: If radio/checkbox, prefer the entire Group Container over the individual option
                    let target = element;
                    if (element.type === 'radio' || element.type === 'checkbox') {
                        // 1. Try to find the container of the whole question (fieldset or form-group)
                        const groupContainer = element.closest('fieldset, .form-group, .question-block, .card');

                        // 2. If valid and reasonably close (don't highlight the whole body), use it
                        if (groupContainer && groupContainer.contains(element)) {
                            // Heuristic: Check size. If it's the whole page, ignore.
                            if (groupContainer.offsetHeight < window.innerHeight * 0.7) { // Increased to 0.7
                                target = groupContainer;
                            }
                        }

                        // 3. Fallback to Option Container if no Group found
                        if (target === element) {
                            const parentOption = element.closest('label, .checkbox-option, .radio-option');
                            if (parentOption) target = parentOption;
                        }
                    }

                    console.log(`[Sidebar Debug] Highlight Target:`, target.tagName, target.className);
                    target.classList.add('smarthirex-spotlight');
                    showConnectionBeam(item, target);
                    item._highlightedElement = target; // Store for cleanup
                }
            } catch (e) {
                // Invalid selector ignored to prevent crash
                console.warn('Skipping invalid selector highlight:', selector);
            }
        });

        item.addEventListener('mouseleave', () => {
            try {
                if (item._highlightedElement) {
                    item._highlightedElement.classList.remove('smarthirex-spotlight');
                    item._highlightedElement = null;
                    hideConnectionBeam();
                } else {
                    // Fallback cleanup
                    const element = document.querySelector(selector);
                    if (element) element.classList.remove('smarthirex-spotlight');
                    hideConnectionBeam();
                }
            } catch (e) {
                // Ignore
            }
        });
    });
}

function setNativeValue(element, value) {
    const { set: valueSetter } = Object.getOwnPropertyDescriptor(element, 'value') || {};
    const prototype = Object.getPrototypeOf(element);
    const { set: prototypeValueSetter } = Object.getOwnPropertyDescriptor(prototype, 'value') || {};

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
        prototypeValueSetter.call(element, value);
    } else if (valueSetter) {
        valueSetter.call(element, value);
    } else {
        element.value = value;
    }
}

function setFieldValue(element, value) {
    const type = element.type;
    const tag = element.tagName.toLowerCase();

    if (type === 'radio') setRadioValue(element, value);
    else if (type === 'checkbox') setCheckboxValue(element, value);
    else if (type === 'date' || type === 'time' || type === 'datetime-local') setDateTimeValue(element, value);
    else if (tag === 'select') setSelectValue(element, value);
    else setTextValue(element, value);
}

function setRadioValue(element, value) {
    const name = element.name;
    const radios = document.querySelectorAll(`input[name="${name}"]`);
    let bestMatch = null;
    let maxSim = 0;

    radios.forEach(r => {
        const label = findLabelText(r);
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

function setCheckboxValue(element, value) {
    if (Array.isArray(value)) {
        // Handle Multi-Checkbox Group (AI/Batch context)
        const name = element.name;
        if (!name) return; // Cannot handle group without name

        const checkboxes = document.querySelectorAll(`input[name="${name}"]`);
        checkboxes.forEach(cb => {
            const label = findLabelText(cb) || '';
            const val = cb.value || '';

            // Check if this checkbox matches ANY value in the array
            const isMatch = value.some(target => {
                // Exact value match
                if (val === target) return true;
                // Text/Label match (loose)
                const textSim = calculateUsingJaccardSimilarity(label, target);
                return textSim > 0.8;
            });

            if (isMatch) {
                cb.checked = true;
                dispatchChangeEvents(cb);
            }
        });
    } else {
        // Standard Single Boolean
        element.checked = (value === true || String(value).toLowerCase() === 'true' || String(value).toLowerCase() === 'yes');
        dispatchChangeEvents(element);
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
            if (isMatch && !opt.selected) {
                opt.selected = true;
                changed = true;
            }
        });
        if (changed) dispatchChangeEvents(element);
        return;
    }

    // Single Select Logic
    let bestMatch = options[0];
    let maxSim = 0;

    options.forEach(opt => {
        const textSim = calculateUsingJaccardSimilarity(opt.text, value);
        const valSim = calculateUsingJaccardSimilarity(opt.value, value);
        const sim = Math.max(textSim, valSim);
        if (sim > maxSim) {
            maxSim = sim;
            bestMatch = opt;
        }
    });

    if (maxSim > 0.3) {
        element.value = bestMatch.value;
        dispatchChangeEvents(element);
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
    return null;
}

function attachSelfCorrectionTrigger(element) {
    if (element.dataset.shLearningAttached) return;
    element.dataset.shLearningAttached = 'true';

    const handleChange = async () => {
        const label = getFieldLabel(element);
        const fieldType = element.type || element.tagName?.toLowerCase();

        // Determine if this is a non-text input (for SelectionCache)
        const isNonTextInput = fieldType === 'radio' || fieldType === 'checkbox' ||
            fieldType === 'select' || fieldType === 'select-one' ||
            fieldType === 'select-multiple' || element.tagName === 'SELECT';

        // Get the value
        let newValue;
        if (fieldType === 'checkbox') {
            newValue = element.checked ? (element.value || 'true') : '';
        } else if (fieldType === 'radio') {
            // For radio, only cache if checked
            if (!element.checked) return;
            newValue = element.value;

            // Handle Dynamic Values (e.g., numeric IDs like '27794634')
            // If value looks like an ID, prefer the visible label text (e.g., 'Yes')
            const isDynamic = /^[0-9]+$/.test(newValue) || (newValue.length > 8 && /[0-9]/.test(newValue) && !newValue.includes(' '));
            if (isDynamic) {
                const textLabel = getOptionLabelText(element);
                if (textLabel) newValue = textLabel;
            }

        } else if (element.tagName === 'SELECT') {
            const selectedOption = element.options[element.selectedIndex];
            newValue = selectedOption ? selectedOption.value : element.value;
        } else {
            newValue = element.value;
        }

        // Save to appropriate cache
        if (isNonTextInput && newValue && window.SelectionCache) {
            // Save to SelectionCache for radio/checkbox/select
            await window.SelectionCache.cacheSelection(element, label, newValue);
            console.log(`💾 [SelectionCache] Learned: "${label}" → ${newValue}`);
        } else if (newValue && String(newValue).length > 1) {
            // Save to SmartMemory for text fields
            const key = normalizeSmartMemoryKey(label);
            updateSmartMemoryCache({
                [key]: {
                    answer: newValue,
                    timestamp: Date.now()
                }
            });
            console.log(`🧠 [SmartMemory] Learned: "${label}" → ${newValue}`);
        }
    };

    // Listen to both 'change' and 'input' events for better coverage
    // 'change' for radio/checkbox/select, 'input' for text/date fields
    element.addEventListener('change', handleChange);
    element.addEventListener('input', handleChange);
}

function activateSmartMemoryLearning() {
    const inputs = document.querySelectorAll('input, textarea, select');
    inputs.forEach(attachSelfCorrectionTrigger);
}

function toggleChatInterface() {
    let container = document.getElementById('smarthirex-chat-container');

    if (container) {
        const isHidden = container.style.display === 'none';
        container.style.display = isHidden ? 'flex' : 'none';

        // Ensure state is saved
        chrome.storage.local.set({ chatInterfaceVisible: isHidden });
        return;
    }

    // Create Container
    container = document.createElement('div');
    container.id = 'smarthirex-chat-container';

    // Initial Styles (Desktop-like floating window)
    container.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 24px;
        width: 380px;
        height: 600px;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 
            0 12px 28px rgba(0,0,0,0.12),
            0 8px 10px rgba(0,0,0,0.08),
            0 0 0 1px rgba(0,0,0,0.04);
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: chatAppear 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        min-width: 300px;
        min-height: 400px;
    `;

    // Add 8-Way Resizers
    const resizers = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];
    resizers.forEach(dir => {
        const resizer = document.createElement('div');
        resizer.className = `chat-resizer resizer-${dir}`;
        resizer.style.cssText = `
            position: absolute;
            z-index: 100;
        `;

        // Position and cursor
        if (dir === 'n') {
            resizer.style.top = '0'; resizer.style.left = '0'; resizer.style.width = '100%'; resizer.style.height = '6px'; resizer.style.cursor = 'ns-resize';
        } else if (dir === 's') {
            resizer.style.bottom = '0'; resizer.style.left = '0'; resizer.style.width = '100%'; resizer.style.height = '6px'; resizer.style.cursor = 'ns-resize';
        } else if (dir === 'e') {
            resizer.style.right = '0'; resizer.style.top = '0'; resizer.style.width = '6px'; resizer.style.height = '100%'; resizer.style.cursor = 'ew-resize';
        } else if (dir === 'w') {
            resizer.style.left = '0'; resizer.style.top = '0'; resizer.style.width = '6px'; resizer.style.height = '100%'; resizer.style.cursor = 'ew-resize';
        } else if (dir === 'nw') {
            resizer.style.top = '0'; resizer.style.left = '0'; resizer.style.width = '12px'; resizer.style.height = '12px'; resizer.style.cursor = 'nwse-resize';
        } else if (dir === 'ne') {
            resizer.style.top = '0'; resizer.style.right = '0'; resizer.style.width = '12px'; resizer.style.height = '12px'; resizer.style.cursor = 'nesw-resize';
        } else if (dir === 'sw') {
            resizer.style.bottom = '0'; resizer.style.left = '0'; resizer.style.width = '12px'; resizer.style.height = '12px'; resizer.style.cursor = 'nesw-resize';
        } else if (dir === 'se') {
            resizer.style.bottom = '0'; resizer.style.right = '0'; resizer.style.width = '12px'; resizer.style.height = '12px'; resizer.style.cursor = 'nwse-resize';
        }

        container.appendChild(resizer);
        setupResizer(resizer, dir);
    });

    // Add Header for Dragging (Theme Restoration)
    const header = document.createElement('div');
    header.id = 'smarthirex-chat-header';
    header.style.cssText = `
        padding: 16px 20px;
        background: linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%);
        color: white;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: grab;
        user-select: none;
    `;
    header.innerHTML = `
        <div style="display: flex; align-items: center; gap: 14px;">
            <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.15); border-radius: 10px; border: 1px solid rgba(255,255,255,0.2);">
                <div style="position: absolute; inset: -4px; background: radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%); border-radius: 50%; opacity: 0.6; animation: iconGlow 3s infinite alternate;"></div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color: white; filter: drop-shadow(0 0 4px rgba(255,255,255,0.5));">
                    <path d="M12 2L2 7L12 12L22 7L12 2Z" />
                    <path d="M2 17L12 22L22 17" />
                    <path d="M2 12L12 17L22 12" />
                </svg>
            </div>
            <div style="display: flex; flex-direction: column; gap: 2px;">
                <span style="font-weight: 800; font-size: 16px; letter-spacing: -0.01em; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">Nova AI</span>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <div style="width: 8px; height: 8px; background: #10b981; border-radius: 50%; box-shadow: 0 0 8px rgba(16, 185, 129, 0.8), 0 0 16px rgba(16, 185, 129, 0.4); animation: statusPulse 2s infinite;"></div>
                    <span style="font-size: 11px; font-weight: 600; opacity: 0.9; letter-spacing: 0.02em;">Online & Ready</span>
                </div>
            </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
            <button id="smarthirex-chat-close" style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.1); color: white; cursor: pointer; width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; hover: background: rgba(255,255,255,0.25);">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
        </div>
        <style>
            @keyframes iconGlow { 0% { opacity: 0.4; transform: scale(0.9); } 100% { opacity: 0.8; transform: scale(1.1); } }
            @keyframes statusPulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.2); opacity: 0.7; } 100% { transform: scale(1); opacity: 1; } }
            #smarthirex-chat-close:hover { background: rgba(255,255,255,0.25) !important; transform: translateY(-1px); }
        </style>
    `;

    // Iframe for Chat Interface
    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('chat/chat.html');
    iframe.style.cssText = `
        width: 100%;
        flex: 1;
        border: none;
    `;

    container.appendChild(header);
    container.appendChild(iframe);
    document.body.appendChild(container);

    // Event Listeners
    container.querySelector('#smarthirex-chat-close').onclick = () => {
        container.style.display = 'none';
        chrome.storage.local.set({ chatInterfaceVisible: false });
    };

    // Dragging Logic
    let isDragging = false;
    let startX, startY;

    header.addEventListener('mousedown', dragStart);
    header.addEventListener('touchstart', dragStart, { passive: false });

    function dragStart(e) {
        isDragging = true;
        header.style.cursor = 'grabbing';

        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

        startX = clientX - container.offsetLeft;
        startY = clientY - container.offsetTop;

        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('touchmove', drag, { passive: false });
        document.addEventListener('touchend', dragEnd);
    }

    function drag(e) {
        if (!isDragging) return;
        e.preventDefault();

        const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

        let newX = clientX - startX;
        let newY = clientY - startY;

        container.style.left = `${newX}px`;
        container.style.top = `${newY}px`;
        container.style.bottom = 'auto';
        container.style.right = 'auto';
    }

    function dragEnd() {
        isDragging = false;
        header.style.cursor = 'grab';
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', dragEnd);
        document.removeEventListener('touchmove', drag);
        document.removeEventListener('touchend', dragEnd);

        // Save Position
        chrome.storage.local.set({
            chatPosition: { left: container.offsetLeft, top: container.offsetTop }
        });
    }

    function setupResizer(resizer, direction) {
        resizer.addEventListener('mousedown', function (e) {
            e.preventDefault();
            const startWidth = container.offsetWidth;
            const startHeight = container.offsetHeight;
            const startX = e.clientX;
            const startY = e.clientY;
            const startLeft = container.offsetLeft;
            const startTop = container.offsetTop;

            // Prevent iframe from capturing mouse events during resize
            iframe.style.pointerEvents = 'none';

            function onMouseMove(e) {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                if (direction.includes('e')) {
                    const newWidth = startWidth + dx;
                    if (newWidth >= 300) {
                        container.style.width = newWidth + 'px';
                    }
                }
                if (direction.includes('w')) {
                    const newWidth = startWidth - dx;
                    if (newWidth >= 300) {
                        container.style.width = newWidth + 'px';
                        container.style.left = (startLeft + dx) + 'px';
                        container.style.right = 'auto';
                    }
                }
                if (direction.includes('s')) {
                    const newHeight = startHeight + dy;
                    if (newHeight >= 400) {
                        container.style.height = newHeight + 'px';
                    }
                }
                if (direction.includes('n')) {
                    const newHeight = startHeight - dy;
                    if (newHeight >= 400) {
                        container.style.height = newHeight + 'px';
                        container.style.top = (startTop + dy) + 'px';
                        container.style.bottom = 'auto';
                    }
                }
            }

            function onMouseUp() {
                iframe.style.pointerEvents = 'auto';
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                chrome.storage.local.set({
                    chatSize: { width: container.offsetWidth, height: container.offsetHeight },
                    chatPosition: { left: container.offsetLeft, top: container.offsetTop }
                });
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    // Load saved state
    chrome.storage.local.get(['chatPosition', 'chatSize'], (data) => {
        if (data.chatPosition) {
            container.style.left = `${data.chatPosition.left}px`;
            container.style.top = `${data.chatPosition.top}px`;
            container.style.bottom = 'auto';
            container.style.right = 'auto';
        }
        if (data.chatSize) {
            container.style.width = `${data.chatSize.width}px`;
            container.style.height = `${data.chatSize.height}px`;
        }
    });

    // Save Visibility
    chrome.storage.local.set({ chatInterfaceVisible: true });
}
