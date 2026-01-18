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
    // console.log('🎯 Nova AI: Showing Form Review...');
    // console.log(`Total fields: ${allFields.length}`);

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

        // Smart Label Logic
        let label = item.fieldData?.label || getFieldLabel(element);
        const ml = item.fieldData?.ml_prediction || item.ml_prediction;

        if (ml && ml.confidence > 0.8 && ml.label) {
            // High confidence: Use ML Label (Clean)
            label = ml.label;
            // Capitalize first letter
            label = label.charAt(0).toUpperCase() + label.slice(1).replace(/_/g, ' ');
        } else {
            // Low confidence or No ML: Use DOM Label + Context
            const context = item.fieldData?.parentContext || item.parentContext || '';
            if (context) {
                label = `${label} (${context})`;
            }
        }

        // Index stored separately for badge display
        const index = item.fieldData?.field_index ?? item.field_index ?? 0;
        const indexBadge = index > 0 ? index + 1 : null;
        const fieldType = item.fieldData?.field_type || element.type || 'text';
        const isFileUpload = fieldType === 'file' || element.type === 'file';

        const value = item.value || element.value;
        const hasValue = value && String(value).trim().length > 0;
        // Prioritize explicit source from fieldData (set by FormProcessor)
        const source = item.source || item.fieldData?.source || 'heuristic';

        const fieldInfo = {
            field: element,
            selector: item.selector,
            label,
            confidence: item.confidence,
            fieldType: fieldType,
            source: source,
            value: value,
            filled: hasValue,
            value: value,
            filled: hasValue,
            isFileUpload,
            indexBadge // Add indexBadge to fieldInfo
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
            // FIX: Re-query live DOM to check status because 'radios' might contain stale element references
            let selectedRadio = radios.find(r => {
                // 1. Try Live Element Check
                if (r.field instanceof HTMLElement && r.field.isConnected) {
                    return r.field.checked;
                }
                // 2. Try ID Lookup
                if (r.field.id) {
                    const live = document.getElementById(r.field.id);
                    if (live) return live.checked;
                }
                // 3. Try Name + Value Lookup
                if (r.field.name && (r.field.value !== undefined)) {
                    // Use CSS.escape for safety
                    try {
                        const selector = `input[name="${CSS.escape(r.field.name)}"][value="${CSS.escape(r.field.value)}"]`;
                        const live = document.querySelector(selector);
                        if (live) return live.checked;
                    } catch (e) { /* ignore invalid selector */ }
                }
                // 4. Fallback to object property
                return r.field.checked;
            });

            // ROBUSTNESS: If iteration failed, try Query Selector for the entire group
            if (!selectedRadio && name) {
                try {
                    const liveChecked = document.querySelector(`input[name="${CSS.escape(name)}"]:checked`);
                    if (liveChecked) {
                        // Found a checked radio in the DOM!
                        // Try to correspond it to one of our known fields
                        const matchingField = radios.find(r =>
                            r.field.id === liveChecked.id ||
                            r.field.value === liveChecked.value
                        );

                        if (matchingField) {
                            selectedRadio = matchingField;
                        } else {
                            // If we can't match it (dynamicaly added?), create a proxy wrapper
                            // mimicking the structure so it displays correctly
                            selectedRadio = {
                                field: liveChecked,
                                selector: `input[name="${CSS.escape(name)}"]:checked`,
                                label: liveChecked.nextElementSibling?.textContent || liveChecked.value,
                                value: liveChecked.value
                            };
                        }
                    }
                } catch (e) { /* naming error */ }
            }

            if (selectedRadio) {
                let selectedValue = selectedRadio.value || selectedRadio.field.value;

                // Try to get label text for display
                if (selectedRadio.field.id) {
                    const label = document.querySelector(`label[for="${selectedRadio.field.id}"]`);
                    if (label) selectedValue = label.textContent.trim();
                }
                // If no label, look for parent label text
                if (selectedRadio.field.parentElement && selectedRadio.field.parentElement.tagName === 'LABEL') {
                    selectedValue = selectedRadio.field.parentElement.textContent.trim();
                }

                // Get the GROUP label from field name (capitalized and formatted)
                const fieldName = (radios[0] && radios[0].field.name) || name || 'Radio';
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
            // FIX: Re-query live DOM for Checkboxes too
            const checkedBoxes = checkboxes.filter(c => {
                // 1. Try Live Element Check
                if (c.field instanceof HTMLElement && c.field.isConnected) {
                    return c.field.checked;
                }
                // 2. Try ID Lookup
                if (c.field.id) {
                    const live = document.getElementById(c.field.id);
                    if (live) return live.checked;
                }
                // 3. Try Name + Value Lookup
                if (c.field.name && (c.field.value !== undefined)) {
                    try {
                        const selector = `input[name="${CSS.escape(c.field.name)}"][value="${CSS.escape(c.field.value)}"]`;
                        const live = document.querySelector(selector);
                        if (live) return live.checked;
                    } catch (e) { }
                }
                return c.field.checked;
            });

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

    // Helper: Categorize a single field
    function categorizeField(field) {
        // 1. Manual / Unfilled
        if (!field.filled && !field.isFileUpload) {
            // Check if radio/checkbox group is truly unfilled
            if ((field.isRadioGroup || field.isCheckboxGroup || field.isSelectGroup) && !field.filled) {
                finalManualFields.push(field);
                return;
            }
            // For single inputs
            if (!field.value && !field.displayValue) {
                finalManualFields.push(field);
                return;
            }
        }

        if (field.isFileUpload) {
            finalManualFields.push(field);
            return;
        }

        // 2. Classify by Source
        const source = (field.source || '').toLowerCase();

        // CACHE: Explicit cache sources
        if (source.includes('smart-memory') || source.includes('selection_cache') || source.includes('cache')) {
            finalCacheFields.push(field);
            return;
        }

        // AI: Explicit AI sources
        if (source.includes('ai') || source.includes('inference') || source.includes('copilot') || source.includes('gen')) {
            finalAiFields.push(field);
            return;
        }

        // APP FILL: Heuristics, User Data, Resume, or Default (High Confidence)
        // If source is empty but filled, it's likely a local heuristic
        finalAppFillFields.push(field);
    }

    // Process all groups using the helper
    groupedRadioCheckbox.forEach(categorizeField);
    groupedSelects.forEach(categorizeField);
    otherFieldsRaw.forEach(categorizeField);

    // console.log(`📄 After Grouping & Re-routing - App Fill: ${finalAppFillFields.length}, Cache: ${finalCacheFields.length}, AI: ${finalAiFields.length}, Manual: ${finalManualFields.length}`);

    if (finalAppFillFields.length === 0 && finalCacheFields.length === 0 && finalAiFields.length === 0) {
        // console.log('No fields to show in sidebar');
        return;
    }

    // Remove existing reopen trigger if showing
    const existingTrigger = document.getElementById('smarthirex-reopen-trigger');
    if (existingTrigger) existingTrigger.remove();

    // Create accordion sidebar panel
    const panel = document.createElement('div');
    panel.id = 'smarthirex-accordion-sidebar';
    panel.innerHTML = `
        <style>
            .index-badge {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                background-color: #f1f5f9;
                color: #475569;
                border: 1px solid #cbd5e1;
                font-family: 'Inter', system-ui, -apple-system, sans-serif;
                font-size: 10px;
                font-weight: 600;
                padding: 1px 5px;
                border-radius: 4px;
                margin-left: 6px;
                vertical-align: middle;
                height: 16px;
                min-width: 16px;
                letter-spacing: -0.01em;
            }
        </style>
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
            <button class="tab nova-tab" data-tab="nova" style="display: none;">
                💬 Nova
            </button>
        </div>
        
        <div class="sidebar-content-scroll" style="flex: 1; overflow-y: auto; overflow-x: hidden;">
            <!-- App Fill Tab (Read-only, name only) -->
            <div class="tab-content active" data-tab="app">
                ${finalAppFillFields.map(item => `
                    <div class="field-item" data-selector="${item.selector.replace(/"/g, '&quot;')}">
                        <div class="field-label">${item.label}${item.indexBadge ? `<span class="index-badge">#${item.indexBadge}</span>` : ''}${(item.isRadioGroup || item.isCheckboxGroup || item.isSelectGroup) && item.displayValue ? `: <span style="color: #10b981; font-weight: 500;">${item.displayValue}</span>` : ''}</div>
                    </div>
                `).join('')}
                ${finalAppFillFields.length === 0 ? '<div class="empty-state">No app-filled fields</div>' : ''}
            </div>

            <!-- Cache Tab (Name only, with recalculate for text fields only) -->
            <div class="tab-content" data-tab="cache" style="display: none;">
                ${finalCacheFields.map(item => {
        // Robust check for text-only fields (Exclude select, number, date, etc.)
        const type = (item.type || '').toLowerCase();
        const tagName = (item.tagName || '').toUpperCase();
        const isSelect = item.isSelectGroup || type.includes('select') || tagName === 'SELECT';
        const excludedTypes = ['number', 'date', 'month', 'week', 'time', 'datetime-local', 'color', 'range', 'hidden', 'submit', 'reset', 'button', 'image', 'file', 'checkbox', 'radio'];

        // Strict: Must not be excluded type, must not be select, and if type is present it typically defaults to text
        const isSafeText = !excludedTypes.includes(type) && !isSelect;
        const isTextBased = !item.isRadioGroup && !item.isCheckboxGroup && !item.isFileUpload && isSafeText && item.source !== 'selection_cache';

        return `
                    <div class="field-item" data-selector="${item.selector.replace(/"/g, '&quot;')}">
                        <div class="field-header">
                            <div class="field-label">${item.label}${item.indexBadge ? `<span class="index-badge">#${item.indexBadge}</span>` : ''}${(item.isRadioGroup || item.isCheckboxGroup || item.isSelectGroup) && item.displayValue ? `: <span style="color: #10b981;">${item.displayValue}</span>` : ''}</div>
                            
                            <div style="display: flex; align-items: center; gap: 8px;">
                                ${isTextBased ? `<button class="recalculate-btn" data-selector="${item.selector.replace(/"/g, '&quot;')}" data-label="${item.label}" data-tooltip="Regenerate using AI" title="Regenerate using AI" style="border: none; background: transparent; padding: 4px;">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
                                </button>` : ''}
                            </div>
                        </div>
                    </div>
                `}).join('')}
                ${finalCacheFields.length === 0 ? '<div class="empty-state">No cached fields</div>' : ''}
            </div>

            <!-- AI Tab (Name + confidence, with recalculate for text fields only) -->
            <div class="tab-content" data-tab="ai" style="display: none;">
                ${finalAiFields.map(item => {
            // Enterprise Logic: Exclude selects explicitly + other non-text types
            const type = (item.type || '').toLowerCase();
            const tagName = (item.tagName || '').toUpperCase();
            const isSelect = item.isSelectGroup || type.includes('select') || tagName === 'SELECT';
            const excludedTypes = ['number', 'date', 'month', 'week', 'time', 'datetime-local', 'color', 'range', 'hidden', 'submit', 'reset', 'button', 'image', 'file', 'checkbox', 'radio'];

            const isSafeText = !excludedTypes.includes(type) && !isSelect;
            const isTextBased = !item.isRadioGroup && !item.isCheckboxGroup && !item.isFileUpload && isSafeText;

            // Enterprise Confidence Display
            const confidence = Math.round(item.confidence * 100);
            const confClass = confidence >= 80 ? 'sh-conf-high' : 'sh-conf-med';
            const statusIcon = confidence >= 80 ? '●' : '○';

            return `
                    <div class="field-item" data-selector="${item.selector.replace(/"/g, '&quot;')}">
                        <div class="field-header">
                            <div class="field-label">${item.label}${item.indexBadge ? `<span class="index-badge">#${item.indexBadge}</span>` : ''}${(!isTextBased && item.displayValue) ? `: <span style="color: #10b981;">${item.displayValue}</span>` : ''}</div>
                            
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <div class="${confClass}" style="font-size: 11px; padding: 2px 8px; border-radius: 12px; display: flex; align-items: center; gap: 4px; white-space: nowrap;">
                                    ${statusIcon} ${confidence}%
                                </div>
                                
                                ${isTextBased ? `<button class="recalculate-btn" data-selector="${item.selector.replace(/"/g, '&quot;')}" data-label="${item.label}" data-tooltip="Regenerate using AI" title="Regenerate using AI" style="border: none; background: transparent; padding: 4px;">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
                                </button>` : ''}
                            </div>
                        </div>
                    </div>
                `}).join('')}
                ${finalAiFields.length === 0 ? '<div class="empty-state">No AI-generated fields</div>' : ''}
            </div>

            <!-- Manual Tab (Unfilled and file uploads) -->
            <div class="tab-content" data-tab="manual" style="display: none;">
                ${finalManualFields.map(item => `
                    <div class="field-item" data-selector="${item.selector.replace(/"/g, '&quot;')}">
                        <div class="field-header">
                            <div class="field-label">
                                ${item.isFileUpload ? '📁 ' : ''}
                                ${item.label}
                                ${item.parentContext ? `<span style="opacity: 0.7; margin-left: 4px;">(${item.parentContext})</span>` : ''}
                                ${item.cache_label ? `<span style="font-family: monospace; opacity: 0.8; font-size: 0.85em; color: #888; margin-left: 4px;">[${item.cache_label}]</span> ` : ''}
                                ${item.indexBadge ? `<span class="index-badge">#${item.indexBadge}</span>` : ''}
                            </div>
                        </div>
                        ${item.isFileUpload ? '<div class="field-note">File upload required</div>' : '<div class="field-note">Not filled</div>'}
                    </div>
                `).join('')}
                ${finalManualFields.length === 0 ? '<div class="empty-state">All fields filled!</div>' : ''}
            </div>

            <!-- Nova Chat Tab (Hidden by default, shown when regenerate is clicked) -->
            <div class="tab-content" data-tab="nova" style="display: none;">
                <div id="nova-chat-container"></div>
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

    // Individual recalculate buttons - now open Nova Chat tab
    const recalculateBtns = panel.querySelectorAll('.recalculate-btn');
    recalculateBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const selector = btn.dataset.selector;
            const label = btn.dataset.label;

            // Get current value from the field
            try {
                const element = document.querySelector(selector);
                const currentValue = element?.value || element?.textContent || '';

                // Open Nova Chat tab with regeneration context
                initNovaTabForRegeneration(selector, label, currentValue);
            } catch (err) {
                console.error('[Nova] Failed to get field value:', err);
                showErrorToast('Could not open regeneration chat');
            }
        });
    });

    // Recalculate All buttons removed - individual regenerate only

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
                // console.log('Field info:', { label: item.textContent, selector: selector, length: selector?.length });
                showErrorToast('Could not scroll to field (Invalid Selector)');
            }
        });

        // Hover to show connection beam
        item.addEventListener('mouseenter', () => {
            try {
                if (!selector) return;
                const element = document.querySelector(selector);
                // console.log(`[Sidebar Debug] Hovering "${selector}". Found?`, !!element);

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

                    // console.log(`[Sidebar Debug] Highlight Target:`, target.tagName, target.className);
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
            const label = findLabelText(cb) || '';
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

    // console.log(`🔍 [SelectDebug] Setting value for select. Target: "${value}"`);

    // STRATEGY 1: Exact Match (Value or Text) - Priority #1
    for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        if (opt.value === "" || opt.text.toLowerCase().includes("select")) continue;

        if (opt.value.toLowerCase() === String(value).toLowerCase() ||
            opt.text.toLowerCase() === String(value).toLowerCase()) {
            bestMatchIndex = i;
            // console.log(`✅ [SelectDebug] Exact match found: "${opt.text}"`);
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

        // console.log(`   🏆 Best Fuzzy Match: "${bestMatchIndex !== -1 ? options[bestMatchIndex].text : 'None'}" (Score: ${maxSim})`);
    }

    // Apply Best Match
    if (bestMatchIndex !== -1 && (maxSim >= 0.4 || bestMatchIndex !== -1)) { // If bestMatchIndex set by Strat 1, it's valid.
        element.selectedIndex = bestMatchIndex;
        // Force update value attribute too for framework listeners
        element.value = element.options[bestMatchIndex].value;
        dispatchChangeEvents(element);
        // console.log(`✅ [SelectDebug] Applied index ${bestMatchIndex}: "${element.options[bestMatchIndex].text}"`);
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
    return null;
}

function attachSelfCorrectionTrigger(element) {
    if (element.dataset.shLearningAttached || element._novaEditListenerAttached) return;
    element.dataset.shLearningAttached = 'true';
    element._novaEditListenerAttached = true;

    const handleChange = async () => {
        const label = getFieldLabel(element);
        const fieldType = element.type || element.tagName?.toLowerCase();

        console.log(`⚡ [Sidebar] Event Triggered by Field: "${label}"`, {
            name: element.name,
            id: element.id,
            type: fieldType,
            value: element.value,
            'ml_attr_label': element.getAttribute('data-nova-ml-label') || 'null',
            'ml_prop': element.__ml_prediction || 'undefined'
        });


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

            } else {
                console.warn(`⚠️ [CacheDebug] Lookup Failed for [${element.id}, ${element.name}]. Available Keys:`, Object.keys(window.NovaCache));
            }
        }

        console.log(`🔍 [CacheDebug] Cache Label: ${cacheLabel}, Type: ${instanceType}`);

        // 1. Determine Cache Strategy
        // We use InteractionLog (SelectionCache) for "Known Profile Fields" and "Structured Inputs" (Select/Radio).
        // We use GlobalMemory (SmartMemory) for "Open-Ended Questions" (Generic Text).

        let handledByInteractionLog = false;

        // Create rich field object to pass architectural metadata (instance_type)
        const fieldObj = {
            id: element.id,
            name: element.name,
            tagName: element.tagName,
            type: element.type,
            cache_label: cacheLabel,
            instance_type: instanceType, // From DOM or Cache
            scope: scope,
            element: element
        };

        // Strategy A: Non-Text Inputs (always explicit selection)
        if (isNonTextInput && window.SelectionCache) {
            await window.SelectionCache.cacheSelection(fieldObj, label, newValue);
            // console.log(`💾 [SelectionCache] Learned: "${label}" → ${newValue} (Non-Text)`);
            handledByInteractionLog = true;
        }

        // Strategy B: MultiCache-eligible text fields (job/education/skills)
        // Check for multiCache keywords before routing to SmartMemory
        const fieldContext = [label, element.name, element.id].filter(Boolean).join(' ').toLowerCase();

        // Use centralized routing logic
        const isMultiCacheEligible = window.FIELD_ROUTING_PATTERNS.isMultiValueEligible(fieldContext, element.type);

        // (Moved cacheLabel logic up)
        // console.log(`🔍 [CacheDebug] Cache Label: ${cacheLabel} and element : `, element);

        if (!handledByInteractionLog && isMultiCacheEligible && window.InteractionLog) {
            await window.InteractionLog.cacheSelection(element, label, newValue);
            // console.log(`📚 [MultiCache] Learned: "${label}" → ${newValue}`);
            handledByInteractionLog = true;
        }

        // Strategy C: Fallback to Smart Memory (Generic Text)
        // If not handled by InteractionLog, and it's a valid text string
        if (!handledByInteractionLog && newValue && String(newValue).length > 1) {
            // Use authoritative cacheLabel if available, otherwise normalize label
            const key = cacheLabel || (window.GlobalMemory ? window.GlobalMemory.normalizeKey(label) : label);

            if (window.GlobalMemory) {
                await window.GlobalMemory.updateCache({
                    [key]: {
                        answer: newValue,
                        timestamp: Date.now()
                    }
                });
            } else if (window.updateSmartMemoryCache) {
                // Formatting for legacy bridge if needed
                await window.updateSmartMemoryCache({
                    [key]: {
                        answer: newValue,
                        timestamp: Date.now()
                    }
                });
            }
            // console.log(`🧠 [SmartMemory] Learned: "${label}" → ${newValue}`);
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

// ============================================================
// NOVA CHAT - INLINE FIELD REGENERATION
// ============================================================

// Global context for regeneration session
window._novaRegenerationContext = null;

// Status messages for progress animation
const NOVA_STATUS_MESSAGES = [
    'Analyzing your request...',
    'Crafting the perfect response...',
    'Applying your style preferences...',
    'Fine-tuning the content...',
    'Almost there...'
];

let novaStatusInterval = null;

/**
 * Create regeneration context object
 */
function createRegenerationContext(selector, label, currentValue) {
    return {
        selector,
        label,
        currentValue,
        originalValue: currentValue,
        previousValue: null,
        pendingValue: null,
        history: [],
        undoStack: []
    };
}

/**
 * Initialize Nova Chat tab for field regeneration
 */
function initNovaTabForRegeneration(selector, label, currentValue) {
    const panel = document.getElementById('smarthirex-accordion-sidebar');
    if (!panel) {
        console.error('[Nova] Sidebar panel not found');
        return;
    }

    // Show Nova tab button
    const novaTabBtn = panel.querySelector('[data-tab="nova"]');
    if (novaTabBtn) {
        novaTabBtn.style.display = 'flex';
    }

    // Switch to Nova tab
    const allTabs = panel.querySelectorAll('.tab');
    allTabs.forEach(t => t.classList.remove('active'));
    novaTabBtn?.classList.add('active');

    const allContents = panel.querySelectorAll('.tab-content');
    allContents.forEach(c => c.style.display = 'none');

    const novaContent = panel.querySelector('.tab-content[data-tab="nova"]');
    if (novaContent) {
        novaContent.style.display = 'block';
    }

    // Render chat UI
    renderNovaChatForField(selector, label, currentValue);
}

/**
 * Render Nova Chat UI for a specific field
 */
function renderNovaChatForField(selector, label, currentValue) {
    const container = document.getElementById('nova-chat-container');
    if (!container) return;

    // Create regeneration context
    window._novaRegenerationContext = createRegenerationContext(selector, label, currentValue);

    // Truncate long values for display
    const displayValue = currentValue.length > 200
        ? currentValue.substring(0, 200) + '...'
        : currentValue;

    // Get context-aware quick actions
    const quickActions = getQuickActionsForField(label);

    container.innerHTML = `
        <div class="nova-chat-header">
            <div class="nova-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                </svg>
                <span>Regenerate: ${escapeHtmlNova(label)}</span>
            </div>
            <button class="nova-close-btn" id="nova-close" title="Close">✕</button>
        </div>
        
        <div class="nova-chat-body" id="nova-chat-messages">
            <div class="nova-current-value">
                <div class="nova-label">📝 Current Value:</div>
                <div class="nova-value-box">${displayValue ? escapeHtmlNova(displayValue) : '<em>Empty</em>'}</div>
            </div>
            
            <div class="nova-prompt">
                What changes would you like to make?
            </div>
            
            <div class="nova-quick-actions" id="nova-quick-actions">
                ${quickActions.map(action => `
                    <button class="nova-action-chip" data-action="${escapeHtmlNova(action)}">${escapeHtmlNova(action)}</button>
                `).join('')}
            </div>
        </div>
        
        <div class="nova-chat-input">
            <textarea 
                id="nova-input" 
                placeholder="Describe your changes..." 
                rows="2"
            ></textarea>
            <button id="nova-send-btn" class="nova-send" title="Send">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                </svg>
            </button>
        </div>
    `;

    // Bind event listeners
    bindNovaChatEvents();

    // Focus input
    setTimeout(() => {
        document.getElementById('nova-input')?.focus();
    }, 100);
}

/**
 * Get context-aware quick actions based on field label
 */
function getQuickActionsForField(label) {
    const labelLower = label.toLowerCase();

    // Cover Letter / Motivation
    if (labelLower.includes('cover') || labelLower.includes('letter') || labelLower.includes('motivation')) {
        return ['Make it concise', 'More enthusiastic', 'Add company focus', 'Professional tone'];
    }

    // Experience / Work History
    if (labelLower.includes('experience') || labelLower.includes('work') || labelLower.includes('responsibility')) {
        return ['Add metrics/numbers', 'Focus on impact', 'More technical', 'Highlight leadership'];
    }

    // Why This Role / Interest
    if (labelLower.includes('why') || labelLower.includes('interest') || labelLower.includes('joining')) {
        return ['Show passion', 'Company-specific', 'Career growth angle', 'Skills alignment'];
    }

    // Summary / About Me
    if (labelLower.includes('summary') || labelLower.includes('about') || labelLower.includes('profile')) {
        return ['Make it shorter', 'More impactful', 'Add key achievements', 'Industry keywords'];
    }

    // Skills / Strengths
    if (labelLower.includes('skill') || labelLower.includes('strength') || labelLower.includes('expertise')) {
        return ['Add technical skills', 'Soft skills focus', 'Industry-specific', 'Quantify impact'];
    }

    // Availability / Notice Period
    if (labelLower.includes('available') || labelLower.includes('notice') || labelLower.includes('start')) {
        return ['Immediate', '2 weeks', '1 month', 'Negotiable'];
    }

    // Salary / Compensation
    if (labelLower.includes('salary') || labelLower.includes('compensation') || labelLower.includes('expectation')) {
        return ['Market rate', 'Negotiable', 'Based on role', 'Open to discuss'];
    }

    // Default actions for any text field
    return ['Make it concise', 'More professional', 'Add more detail', 'Simpler language'];
}

/**
 * Bind Nova Chat event listeners
 */
function bindNovaChatEvents() {
    const container = document.getElementById('nova-chat-container');
    if (!container) return;

    // Close button
    container.querySelector('#nova-close')?.addEventListener('click', closeNovaTab);

    // Quick action chips
    container.querySelectorAll('.nova-action-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const action = chip.dataset.action;
            document.getElementById('nova-input').value = action;
            handleNovaSubmit();
        });
    });

    // Send button
    container.querySelector('#nova-send-btn')?.addEventListener('click', handleNovaSubmit);

    // Enter key (without shift) submits
    container.querySelector('#nova-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleNovaSubmit();
        }
    });
}

/**
 * Close Nova Chat tab and return to App Fill
 */
function closeNovaTab() {
    const panel = document.getElementById('smarthirex-accordion-sidebar');
    if (!panel) return;

    // Clear any running status interval
    if (novaStatusInterval) {
        clearInterval(novaStatusInterval);
        novaStatusInterval = null;
    }

    // Hide Nova tab button
    const novaTabBtn = panel.querySelector('[data-tab="nova"]');
    if (novaTabBtn) {
        novaTabBtn.style.display = 'none';
        novaTabBtn.classList.remove('active');
    }

    // Switch back to App Fill tab
    const appTabBtn = panel.querySelector('[data-tab="app"]');
    if (appTabBtn) {
        appTabBtn.classList.add('active');
    }

    const allContents = panel.querySelectorAll('.tab-content');
    allContents.forEach(c => c.style.display = 'none');

    const appContent = panel.querySelector('.tab-content[data-tab="app"]');
    if (appContent) {
        appContent.style.display = 'block';
    }

    // Clear context
    window._novaRegenerationContext = null;
}

/**
 * Handle Nova Chat message submission
 */
async function handleNovaSubmit() {
    const input = document.getElementById('nova-input');
    const userInstruction = input?.value?.trim();
    if (!userInstruction) return;

    const context = window._novaRegenerationContext;
    if (!context) return;

    // Clear input
    input.value = '';

    // Disable input while processing
    input.disabled = true;
    const sendBtn = document.getElementById('nova-send-btn');
    if (sendBtn) sendBtn.disabled = true;

    // Add user message to chat
    addNovaChatMessage('user', userInstruction);

    // Show progress animation
    showNovaTyping();

    try {
        // Get optimized context (Text/Markdown)
        let resumeContext = '';
        try {
            resumeContext = await window.ResumeManager?.getOptimizedContext() || '';
        } catch (e) {
            console.warn('[Nova] Could not get resume context:', e);
        }

        // Robustness: Handle empty resume context
        let resumeSection = '';
        if (resumeContext && resumeContext.length > 50) {
            resumeSection = `RESUME_DATA:\n${resumeContext}`;
        } else {
            resumeSection = `RESUME_DATA: (Not available. Please rely on general professional standards and the user instruction.)`;
        }

        // Optimized Concise Prompt (Token Saver)
        const systemPrompt = `CONTEXT: Job Application Field "${context.label}"
CURRENT_VALUE: ${context.currentValue}
${resumeSection}

INSTRUCTION: ${userInstruction}

TASK: Regenerate the field value based on the instruction.
RULES:
1. Professional tone.
2. Use resume facts only (if available).
3. Do not be concise unless asked. Write comprehensive, complete responses.
4. OUTPUT: New value ONLY. No quotes/preamble.`;

        const result = await window.AIClient.callAI(
            'Regenerate value:',
            systemPrompt,
            { maxTokens: 2000, temperature: 0.7 }
        );

        hideNovaTyping();

        if (result.success) {
            let newValue = result.text.trim()
                .replace(/^["']|["']$/g, '')  // Remove surrounding quotes
                .replace(/^Here'?s? (?:the |your )?(?:new |updated )?(?:value|response|answer)?:?\s*/i, ''); // Remove preamble

            // Store pending value for preview
            context.pendingValue = newValue;

            // Add to history
            context.history.push({
                instruction: userInstruction,
                value: newValue,
                timestamp: Date.now()
            });

            // Show preview with action buttons (PREVIEW FIRST!)
            addNovaPreviewMessage(newValue);

        } else {
            addNovaChatMessage('error', `Failed to generate: ${result.error}`);
        }

    } catch (error) {
        hideNovaTyping();
        addNovaChatMessage('error', `Error: ${error.message}`);
    } finally {
        // Re-enable input
        if (input) input.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        input?.focus();
    }
}

/**
 * Show progress typing indicator with animation
 */
function showNovaTyping() {
    const messagesContainer = document.getElementById('nova-chat-messages');
    if (!messagesContainer) return;

    // Remove existing typing indicator
    messagesContainer.querySelector('.nova-typing')?.remove();

    const typingDiv = document.createElement('div');
    typingDiv.className = 'nova-message nova-typing';
    typingDiv.innerHTML = `
        <div class="nova-progress-container">
            <div class="nova-progress-header">
                <span class="nova-progress-icon">✨</span>
                <span class="nova-progress-title">Nova is thinking...</span>
            </div>
            <div class="nova-progress-bar">
                <div class="nova-progress-fill"></div>
            </div>
            <div class="nova-progress-status">Analyzing your request...</div>
        </div>
    `;
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Cycle through status messages
    let statusIndex = 0;
    novaStatusInterval = setInterval(() => {
        statusIndex = (statusIndex + 1) % NOVA_STATUS_MESSAGES.length;
        const statusEl = typingDiv.querySelector('.nova-progress-status');
        if (statusEl) {
            statusEl.textContent = NOVA_STATUS_MESSAGES[statusIndex];
        }
    }, 2000);
}

/**
 * Hide progress typing indicator
 */
function hideNovaTyping() {
    // Clear status interval
    if (novaStatusInterval) {
        clearInterval(novaStatusInterval);
        novaStatusInterval = null;
    }
    document.querySelector('.nova-typing')?.remove();
}

/**
 * Add a message to Nova Chat
 */
function addNovaChatMessage(type, content) {
    const messagesContainer = document.getElementById('nova-chat-messages');
    if (!messagesContainer) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `nova-message nova-${type}`;
    msgDiv.innerHTML = `<div class="nova-message-content">${escapeHtmlNova(content)}</div>`;

    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Show preview message with Apply/Retry/Cancel buttons
 */
function addNovaPreviewMessage(newValue) {
    const messagesContainer = document.getElementById('nova-chat-messages');
    if (!messagesContainer) return;

    // Remove any existing preview
    messagesContainer.querySelectorAll('.nova-preview').forEach(el => el.remove());

    const truncatedValue = newValue.length > 400
        ? newValue.substring(0, 400) + '...'
        : newValue;

    const previewDiv = document.createElement('div');
    previewDiv.className = 'nova-message nova-preview';
    previewDiv.innerHTML = `
        <div class="nova-preview-label">✨ Preview - New Value:</div>
        <div class="nova-preview-value">${escapeHtmlNova(truncatedValue)}</div>
        <div class="nova-preview-actions">
            <button class="nova-btn nova-btn-apply" id="nova-apply" title="Apply to form field">
                ✓ Apply
            </button>
            <button class="nova-btn nova-btn-retry" id="nova-retry" title="Try different instruction">
                🔄 Try Again
            </button>
            <button class="nova-btn nova-btn-cancel" id="nova-cancel" title="Discard and close">
                ✕ Cancel
            </button>
        </div>
    `;

    messagesContainer.appendChild(previewDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Bind preview action buttons
    previewDiv.querySelector('#nova-apply')?.addEventListener('click', applyNovaRegeneration);
    previewDiv.querySelector('#nova-retry')?.addEventListener('click', () => {
        previewDiv.remove();
        document.getElementById('nova-input')?.focus();
    });
    previewDiv.querySelector('#nova-cancel')?.addEventListener('click', closeNovaTab);
}

/**
 * Apply regenerated value to the form field
 */
async function applyNovaRegeneration() {
    const context = window._novaRegenerationContext;
    if (!context || !context.pendingValue) return;

    try {
        const element = document.querySelector(context.selector);
        if (!element) {
            addNovaChatMessage('error', 'Field not found on page. It may have been removed.');
            return;
        }

        // UNDO SUPPORT: Save current value before overwriting
        context.previousValue = context.currentValue;
        context.undoStack.push(context.currentValue);

        // Apply with ghosting animation if available
        if (typeof showGhostingAnimation === 'function') {
            await showGhostingAnimation(element, context.pendingValue, 0.95);
        } else {
            // Fallback: Robust native setter for React/Angular support
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            const nativeTextAreaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;

            if (element.tagName === 'TEXTAREA' && nativeTextAreaSetter) {
                nativeTextAreaSetter.call(element, context.pendingValue);
            } else if (nativeInputValueSetter) {
                nativeInputValueSetter.call(element, context.pendingValue);
            } else {
                element.value = context.pendingValue;
            }

            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('blur', { bubbles: true }));
        }

        // Active Learning: Attach trigger for future manual corrections
        if (typeof attachSelfCorrectionTrigger === 'function') {
            attachSelfCorrectionTrigger(element);
        }

        // Update smart memory cache
        try {
            if (typeof normalizeSmartMemoryKey === 'function' && typeof updateSmartMemoryCache === 'function') {
                const normalizedLabel = normalizeSmartMemoryKey(context.label);
                updateSmartMemoryCache({
                    [normalizedLabel]: {
                        answer: context.pendingValue,
                        timestamp: Date.now()
                    }
                });
            }
        } catch (e) {
            console.warn('[Nova] Smart memory update failed:', e);
        }

        // Update context for iterative editing
        context.currentValue = context.pendingValue;
        context.pendingValue = null;

        // Remove preview message
        document.querySelectorAll('.nova-preview').forEach(el => el.remove());

        // Show success with undo option
        addNovaSuccessMessage(context.label);

    } catch (error) {
        addNovaChatMessage('error', `Failed to apply: ${error.message}`);
    }
}

/**
 * Show success message with Undo and follow-up actions
 */
function addNovaSuccessMessage(fieldLabel) {
    const messagesContainer = document.getElementById('nova-chat-messages');
    if (!messagesContainer) return;

    const successDiv = document.createElement('div');
    successDiv.className = 'nova-message nova-success';
    successDiv.innerHTML = `
        <div class="nova-success-text">
            ✅ Updated "${escapeHtmlNova(fieldLabel)}" successfully!
        </div>
        <div class="nova-success-subtext">
            Would you like to make any other changes?
        </div>
        <div class="nova-followup-actions">
            <button class="nova-btn nova-btn-undo" id="nova-undo" title="Revert to previous value">
                ↩️ Undo
            </button>
            <button class="nova-action-chip" data-action="Make it shorter">Shorter</button>
            <button class="nova-action-chip" data-action="Add more detail">More detail</button>
            <button class="nova-btn nova-btn-done" id="nova-done" title="Close and finish">
                Done ✓
            </button>
        </div>
    `;

    messagesContainer.appendChild(successDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Bind undo button
    successDiv.querySelector('#nova-undo')?.addEventListener('click', undoNovaRegeneration);

    // Bind follow-up action chips
    successDiv.querySelectorAll('.nova-action-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.getElementById('nova-input').value = chip.dataset.action;
            handleNovaSubmit();
        });
    });

    // Bind done button
    successDiv.querySelector('#nova-done')?.addEventListener('click', closeNovaTab);
}

/**
 * Undo the last regeneration
 */
async function undoNovaRegeneration() {
    const context = window._novaRegenerationContext;
    if (!context) return;

    // Check if we have something to undo
    if (context.undoStack.length === 0) {
        addNovaChatMessage('info', 'Nothing to undo.');
        return;
    }

    try {
        const element = document.querySelector(context.selector);
        if (!element) {
            addNovaChatMessage('error', 'Field not found on page.');
            return;
        }

        // Pop previous value from undo stack
        const previousValue = context.undoStack.pop();

        // Apply previous value with animation
        if (typeof showGhostingAnimation === 'function') {
            await showGhostingAnimation(element, previousValue, 0.95);
        } else {
            element.value = previousValue;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Update context
        context.currentValue = previousValue;

        // Show confirmation
        addNovaChatMessage('bot', `↩️ Reverted "${context.label}" to previous value.`);

        // Disable undo button if no more history
        if (context.undoStack.length === 0) {
            const undoBtn = document.getElementById('nova-undo');
            if (undoBtn) {
                undoBtn.disabled = true;
                undoBtn.style.opacity = '0.5';
            }
        }

    } catch (error) {
        addNovaChatMessage('error', `Undo failed: ${error.message}`);
    }
}

/**
 * Escape HTML for Nova Chat (avoid conflict with existing escapeHtml)
 */
function escapeHtmlNova(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========================================
// RESTORED HELPERS (Legacy Support)
// ========================================

/**
 * Legacy: Calculate Jaccard Similarity between two strings
 * Used by setRadioValue/setSelectValue for fuzzy matching
 */
function calculateUsingJaccardSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;

    // Tokenize (Bag of Words)
    const set1 = new Set(str1.toLowerCase().split(/\W+/));
    const set2 = new Set(str2.toLowerCase().split(/\W+/));

    // Intersection
    const intersection = new Set([...set1].filter(x => set2.has(x)));

    // Union
    const union = new Set([...set1, ...set2]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
}

window.calculateUsingJaccardSimilarity = calculateUsingJaccardSimilarity;
