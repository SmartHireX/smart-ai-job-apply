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
            <button id="smarthirex-toast-clear-highlights" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">Clear Highlights</button>
            <button id="smarthirex-toast-undo" style="background: #ef4444; border: none; color: white; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">Undo</button>
        </div>
    `;

    document.body.appendChild(toast);

    // Event Listeners
    toast.querySelector('#smarthirex-toast-undo').addEventListener('click', () => {
        undoFormFill();
        toast.remove();
    });

    toast.querySelector('#smarthirex-toast-clear-highlights').addEventListener('click', () => {
        clearAllFieldHighlights();
        toast.remove();
    });

    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, -20px)';
            setTimeout(() => toast.remove(), 400);
        }
    }, 6000);
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

function showReopenTrigger(highFields, lowFields) {
    // Remove existing if any
    const existing = document.getElementById('smarthirex-reopen-trigger');
    if (existing) existing.remove();

    const trigger = document.createElement('div');
    trigger.id = 'smarthirex-reopen-trigger';
    trigger.innerHTML = `
        <div class="trigger-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
        </div>
        <span>Open Form Review</span>
    `;

    trigger.addEventListener('click', () => {
        showAccordionSidebar(highFields, lowFields);
        trigger.remove();
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

    allFields.forEach(item => {
        const element = document.querySelector(item.selector);
        if (!element || !isFieldVisible(element)) return;

        const label = item.fieldData?.label || getFieldLabel(element);
        const fieldInfo = {
            field: element,
            selector: item.selector,
            label,
            confidence: item.confidence,
            fieldType: item.fieldData?.field_type || element.type || 'text',
            source: item.source || 'heuristic',
            value: item.value || element.value
        };

        // Group by source
        if (item.source === 'smart-memory') {
            cacheFields.push(fieldInfo);
        } else if (item.confidence >= 0.85 && !item.source) {
            // High confidence heuristic matches = App Fill
            appFillFields.push(fieldInfo);
        } else {
            // Low confidence or AI-generated = AI tab
            aiFields.push(fieldInfo);
        }
    });

    console.log(`📄 App Fill: ${appFillFields.length}, 🧠 Cache: ${cacheFields.length}, 🤖 AI: ${aiFields.length}`);

    if (appFillFields.length === 0 && cacheFields.length === 0 && aiFields.length === 0) {
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
                <button class="action-btn-text" id="smarthirex-clear-highlights" title="Clear visual highlights">
                    💡 Remove Highlights
                </button>
                <button class="action-btn-text" id="smarthirex-undo-fill" title="Undo form fill">
                    ↩️ Undo All
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
        </div>
        
        <div class="sidebar-content-scroll" style="flex: 1; overflow-y: auto; overflow-x: hidden;">
            <!-- App Fill Tab (Read-only) -->
            <div class="tab-content active" data-tab="app">
                ${appFillFields.map(item => `
                    <div class="field-item" data-selector="${item.selector}">
                        <div class="field-label">${item.label}</div>
                        <div class="field-value">${item.value || ''}</div>
                    </div>
                `).join('')}
                ${appFillFields.length === 0 ? '<div class="empty-state">No app-filled fields</div>' : ''}
            </div>

            <!-- Cache Tab (With recalculate) -->
            <div class="tab-content" data-tab="cache" style="display: none;">
                ${cacheFields.length > 0 ? `
                    <div class="tab-actions">
                        <button class="recalculate-all-btn" data-tab="cache">Recalculate All (${cacheFields.length})</button>
                    </div>
                ` : ''}
                ${cacheFields.map(item => `
                    <div class="field-item" data-selector="${item.selector}">
                        <div class="field-header">
                            <div class="field-label">${item.label}</div>
                            <button class="recalculate-btn" data-selector="${item.selector}" data-label="${item.label}">🔄</button>
                        </div>
                        <div class="field-value">${item.value || ''}</div>
                    </div>
                `).join('')}
                ${cacheFields.length === 0 ? '<div class="empty-state">No cached fields</div>' : ''}
            </div>

            <!-- AI Tab (Confidence only, with recalculate) -->
            <div class="tab-content" data-tab="ai" style="display: none;">
                ${aiFields.length > 0 ? `
                    <div class="tab-actions">
                        <button class="recalculate-all-btn" data-tab="ai">Recalculate All (${aiFields.length})</button>
                    </div>
                ` : ''}
                ${aiFields.map(item => `
                    <div class="field-item" data-selector="${item.selector}">
                        <div class="field-header">
                            <div class="field-label">${item.label}</div>
                            <button class="recalculate-btn" data-selector="${item.selector}" data-label="${item.label}">🔄</button>
                        </div>
                        <div class="field-confidence">⚡ ${Math.round(item.confidence * 100)}%</div>
                    </div>
                `).join('')}
                ${aiFields.length === 0 ? '<div class="empty-state">No AI-generated fields</div>' : ''}
            </div>
        </div>
    `;

    // Update tab counts
    panel.querySelector('[data-tab="app"] .tab-count').textContent = `(${appFillFields.length})`;
    panel.querySelector('[data-tab="cache"] .tab-count').textContent = `(${cacheFields.length})`;
    panel.querySelector('[data-tab="ai"] .tab-count').textContent = `(${aiFields.length})`;

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
            showReopenTrigger(highConfidenceFields, lowConfidenceFields);

            document.querySelectorAll('.smarthirex-field-highlight').forEach(el => el.classList.remove('smarthirex-field-highlight'));
            hideConnectionBeam(); // Clean up beam
        });
    }

    // Clear Highlights button
    const clearHighlightsBtn = panel.querySelector('#smarthirex-clear-highlights');
    if (clearHighlightsBtn) {
        clearHighlightsBtn.addEventListener('click', () => {
            clearAllFieldHighlights();
        });
    }

    // Undo Fill button
    const undoFillBtn = panel.querySelector('#smarthirex-undo-fill');
    if (undoFillBtn) {
        undoFillBtn.addEventListener('click', async () => {
            await undoFormFill();
            const sidebar = document.getElementById('smarthirex-accordion-sidebar');
            if (sidebar) sidebar.remove();
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
            const element = document.querySelector(selector);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                element.focus();
            }
        });

        // Hover to show connection beam
        item.addEventListener('mouseenter', () => {
            const element = document.querySelector(selector);
            if (element) {
                element.classList.add('smarthirex-spotlight');
                showConnectionBeam(item, element);
            }
        });

        item.addEventListener('mouseleave', () => {
            const element = document.querySelector(selector);
            if (element) {
                element.classList.remove('smarthirex-spotlight');
                hideConnectionBeam();
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
        const sim = calculateUsingJaccardSimilarity(label, value);
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
    element.checked = (value === true || String(value).toLowerCase() === 'true' || String(value).toLowerCase() === 'yes');
    dispatchChangeEvents(element);
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

function attachSelfCorrectionTrigger(element) {
    if (element.dataset.shLearningAttached) return;
    element.dataset.shLearningAttached = 'true';

    element.addEventListener('change', () => {
        const label = getFieldLabel(element);
        const newValue = element.type === 'checkbox' ? element.checked : element.value;
        const key = normalizeSmartMemoryKey(label);

        if (newValue && String(newValue).length > 1) {
            updateSmartMemoryCache({
                [key]: {
                    answer: newValue,
                    timestamp: Date.now()
                }
            });
            console.log(`🧠 Smart Memory: Learned value for "${label}"`);
        }
    });
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
