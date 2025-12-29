// ====================================================================
// PREVIEW MODAL CODE - BACKED UP AND DEPRECATED
// ====================================================================
// This file contains the old preview modal implementation that was
// replaced with instant fill + toast + sidebar workflow.
// 
// Kept for reference and potential rollback if needed.
// Date backed up: 2025-12-29
// Reason: Implementing faster instant-fill workflow
// New approach: Skip preview modal, fill high-confidence fields instantly,
//               show toast notification, auto-open sidebar for low-confidence
// ====================================================================

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
                // Last page: Show Fill Form with counts
                const highConfCount = Object.keys(displayMappings).length;
                const lowConfCount = Object.keys(lowConfidenceMappings).length;
                const btnText = lowConfCount > 0
                    ? `Fill ${highConfCount} & Review ${lowConfCount}`
                    : `Fill All Fields`;

                nextBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    ${btnText}
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

        // If only 1 page, show Fill Form immediately with counts
        if (totalPages <= 1) {
            const highConfCount = Object.keys(displayMappings).length;
            const lowConfCount = Object.keys(lowConfidenceMappings).length;
            const btnText = lowConfCount > 0
                ? `Fill ${highConfCount} & Review ${lowConfCount}`
                : `Fill All Fields`;

            nextBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                ${btnText}
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
