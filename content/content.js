// Content script - runs on all web pages
console.log('SmartHireX extension loaded');

// ============ TOKEN SYNC LISTENERS ============
// Listen for token updates from the SmartHireX website
window.addEventListener('smarthirex_token_update', (event) => {
    const token = event.detail?.token;
    if (token) {
        console.log('Token received from website, storing in extension...');
        try {
            if (chrome.runtime?.id) {
                chrome.runtime.sendMessage({
                    type: 'STORE_TOKEN',
                    token: token
                });
            } else {
                console.warn('Extension context invalidated. Please refresh the page.');
            }
        } catch (e) {
            console.warn('Extension context invalidated. Please refresh the page.');
        }
    }
});

// Also listen for window.postMessage (backup method)
window.addEventListener('message', (event) => {
    // Only accept messages from the same origin
    if (event.origin !== window.location.origin) return;

    if (event.data?.type === 'SMARTHIREX_LOGIN' && event.data?.token) {
        console.log('Token received via postMessage, storing in extension...');
        try {
            if (chrome.runtime?.id) {
                chrome.runtime.sendMessage({
                    type: 'STORE_TOKEN',
                    token: event.data.token
                });
            } else {
                console.warn('Extension context invalidated. Please refresh the page.');
            }
        } catch (e) {
            console.warn('Extension context invalidated. Please refresh the page.');
        }
    }
});
// ============================================

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_PAGE_CONTEXT') {
        const text = document.body.innerText || "";
        const selection = window.getSelection().toString();
        sendResponse({
            content: text,
            selectedText: selection,
            url: window.location.href,
            title: document.title
        });
        return true;
    }

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
        // NEW FLOW: Skip preview, fill instantly, show toast + sidebar
        (async () => {
            try {
                console.log('🚀 SmartHireX: Starting instant fill workflow...');

                const HIGH_CONFIDENCE_THRESHOLD = 0.9;
                const mappings = message.mappings;

                // Separate high and low confidence fields
                const highConfidenceMappings = {};
                const lowConfidenceMappings = {};

                Object.entries(mappings).forEach(([selector, data]) => {
                    const confidence = data.confidence || 0;
                    if (confidence >= HIGH_CONFIDENCE_THRESHOLD && !data.skipped) {
                        highConfidenceMappings[selector] = data;
                    } else if (!data.skipped) {
                        lowConfidenceMappings[selector] = data;
                    }
                });

                const highConfCount = Object.keys(highConfidenceMappings).length;
                const lowConfCount = Object.keys(lowConfidenceMappings).length;

                console.log(`📊 High-confidence: ${highConfCount}, Low-confidence: ${lowConfCount}`);

                // 1. Fill ALL fields regardless of confidence (Sequential Ghost Typer)
                const allFieldsToFill = { ...highConfidenceMappings, ...lowConfidenceMappings };
                const totalFillCount = Object.keys(allFieldsToFill).length;

                if (totalFillCount > 0) {
                    console.log('👻 Starting Ghost Typer effect for ALL fields...');

                    // Iterate sequentially for the visual effect
                    for (const [selector, data] of Object.entries(allFieldsToFill)) {
                        const element = document.querySelector(selector);
                        if (element && isFieldVisible(element)) {
                            // Scroll to element
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });

                            // Visualize typing with confidence awareness
                            const confidence = data.confidence || 0;
                            if (data.value) {
                                await simulateTyping(element, data.value, confidence);
                            } else {
                                // If value is empty, just highlight so user knows to review
                                highlightField(element, confidence);
                            }
                        }
                    }
                    console.log(`✅ Ghost Typer finished: ${totalFillCount} fields`);
                }

                // 2. Show toast notification
                showSuccessToast(highConfCount, lowConfCount);

                // 3. Open accordion sidebar (always show if any fields filled or need review)
                if (lowConfCount > 0 || highConfCount > 0) {
                    setTimeout(() => {
                        const lowConfFields = Object.entries(lowConfidenceMappings).map(
                            ([selector, data]) => ({
                                selector,
                                fieldData: data,
                                confidence: data.confidence || 0
                            })
                        );

                        const highConfFields = Object.entries(highConfidenceMappings).map(
                            ([selector, data]) => ({
                                selector,
                                fieldData: data,
                                confidence: data.confidence || 1.0
                            })
                        );

                        showAccordionSidebar(highConfFields, lowConfFields);
                    }, 500); // reduced delay
                }

                sendResponse({ success: true, filled: highConfCount, review: lowConfCount });
            } catch (error) {
                console.error('❌ Instant fill error:', error);
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

    if (message.type === 'TOGGLE_CHAT') {
        toggleChatInterface();
        sendResponse({ success: true });
        return false;
    }

    if (message.type === 'START_PAGE_PROCESSING') {
        processPageForm(message.token, message.userEmail, message.apiBaseUrl);
        return false; // Fire and forget - do not keep channel open as popup closes
    }

    if (message.type === 'SHOW_ERROR_TOAST') {
        showErrorToast(message.message);
        return false;
    }
});

// ============================================
// PAGE LEVEL PROCESSING
// ============================================

async function processPageForm(token, userEmail, apiBaseUrl) {
    try {
        console.log('✨ Starting page-level processing...');
        showProcessingWidget('Nova is analyzing page architecture...', 1);

        // 1. Extract HTML
        const formHTML = extractFormHTML();
        if (!formHTML) throw new Error('No form found');

        // 2. Analyze (via Proxy)
        showProcessingWidget('AI is understanding the form...', 2);
        const analysis = await makeProxyRequest('POST', `${apiBaseUrl}/autofill/analyze`, token, {
            html: formHTML,
            url: window.location.href
        });

        if (!analysis) throw new Error('Analysis request failed (no response)');

        if (!analysis.success || analysis.data.error) throw new Error(analysis.data?.error_message || 'Analysis failed');

        // 3. Map Data (via Proxy)
        showProcessingWidget('Mapping your data to form...', 3);
        const mapping = await makeProxyRequest('POST', `${apiBaseUrl}/autofill/map-data`, token, {
            user_email: userEmail,
            form_fields: analysis.data.fields
        });

        if (!mapping) throw new Error('Mapping request failed (no response)');

        if (!mapping.success || mapping.data.error) throw new Error(mapping.data?.error_message || 'Mapping failed');

        // 4. Handle Missing Fields
        const mappings = mapping.data.mappings;
        if (mapping.data.missing_fields?.length > 0) {
            mapping.data.missing_fields.forEach(purpose => {
                const field = analysis.data.fields.find(f => f.purpose === purpose);
                if (field?.selector) {
                    mappings[field.selector] = {
                        value: '',
                        confidence: 0.3,
                        source: 'user_input_required',
                        field_type: field.type
                    };
                }
            });
        }

        // 5. Complete & Show Preview
        showProcessingWidget('Optimization Complete.', 4);
        setTimeout(() => removeProcessingWidget(), 800);

        // Trigger existing preview flow
        window.postMessage({
            type: 'SMARTHIREX_PREVIEW',
            mappings: mappings,
            analysis: analysis.data,
            allFields: analysis.data.fields
        }, '*');

        // Reuse existing logic by calling the handler directly
        const previewMsg = {
            mappings: mappings,
            analysis: analysis.data,
            allFields: analysis.data.fields
        };

        // Execute the preview logic (same as SHOW_PREVIEW_MODAL but local)
        // We can just re-use the block from the message listener
        // But better to exact same function. Let's create a helper or just emit event.
        // Actually, we can just call the logic from line 78 directly.
        executeInstantFill(previewMsg);

    } catch (error) {
        console.error('Processing failed:', error);
        showProcessingWidget('Error occurred', -1); // Error state
        showErrorToast(error.message);
        setTimeout(() => removeProcessingWidget(), 2000);
    }
}

// Helper to make proxy requests via background
// Helper to make proxy requests via background
function makeProxyRequest(method, url, token, body) {
    return new Promise((resolve, reject) => {
        // Set a timeout of 30 seconds
        const timeoutId = setTimeout(() => {
            reject(new Error('Request timed out'));
        }, 30000);

        try {
            chrome.runtime.sendMessage({
                type: 'PROXY_REQ',
                url,
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body
            }, response => {
                clearTimeout(timeoutId);
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        } catch (e) {
            clearTimeout(timeoutId);
            reject(e);
        }
    });
}

// Logic extracted from listener for reuse
async function executeInstantFill(data) {
    try {
        console.log('🚀 SmartHireX: Starting instant fill workflow...');
        const HIGH_CONFIDENCE_THRESHOLD = 0.9;
        const mappings = data.mappings;

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
                const element = document.querySelector(selector);
                if (element && isFieldVisible(element)) {
                    // Scroll to element
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

                    // Visualize typing with confidence awareness
                    const confidence = data.confidence || 0;
                    if (data.value) {
                        await simulateTyping(element, data.value, confidence);
                    } else {
                        // If value is empty, just highlight so user knows to review
                        highlightField(element, confidence);
                    }
                }
            }
            console.log(`✅ Ghost Typer finished: ${totalFillCount} fields`);
        }

        // 2. Toast
        showSuccessToast(highConfCount, lowConfCount);

        // 3. Sidebar (Using new FANG style)
        if (lowConfCount > 0 || highConfCount > 0) {
            setTimeout(() => {
                const lowConfFields = Object.entries(lowConfidenceMappings).map(
                    ([selector, d]) => ({ selector, fieldData: d, confidence: d.confidence || 0 })
                );
                const highConfFields = Object.entries(highConfidenceMappings).map(
                    ([selector, d]) => ({ selector, fieldData: d, confidence: d.confidence || 1.0 })
                );
                showAccordionSidebar(highConfFields, lowConfFields);
            }, 500);
        } else {
            console.warn('⚠️ No fields to fill or review found.');
            showErrorToast('Analysis complete, but no matching fields were found on this specific page.');
        }

    } catch (error) {
        console.error('Fill error:', error);
    }
}

// FANG-Style Processing Widget - Premium Design
function showProcessingWidget(text, step) {
    let widget = document.getElementById('smarthirex-processing-widget');
    if (!widget) {
        widget = document.createElement('div');
        widget.id = 'smarthirex-processing-widget';
        document.body.appendChild(widget);

        // Inject styles
        const style = document.createElement('style');
        style.textContent = `
            #smarthirex-processing-widget {
                position: fixed;
                top: 32px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(255, 255, 255, 0.9);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.8);
                padding: 12px 24px;
                border-radius: 99px;
                box-shadow: 
                    0 10px 40px -10px rgba(10, 102, 194, 0.25),
                    0 0 0 1px rgba(10, 102, 194, 0.1),
                    0 0 15px rgba(10, 102, 194, 0.15); /* Blue glow */
                display: flex;
                align-items: center;
                gap: 16px;
                z-index: 2147483647;
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
                animation: widgetSlideDown 0.6s cubic-bezier(0.16, 1, 0.3, 1);
                min-width: 340px;
                transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            }
            #smarthirex-processing-widget:hover {
                transform: translateX(-50%) translateY(4px) scale(1.02);
                background: rgba(255, 255, 255, 0.98);
                box-shadow: 
                    0 25px 50px -12px rgba(10, 102, 194, 0.3),
                    0 0 0 1px rgba(10, 102, 194, 0.2),
                    0 0 25px rgba(10, 102, 194, 0.25);
            }
            @keyframes widgetSlideDown {
                from { transform: translate(-50%, -100%); opacity: 0; }
                to { transform: translate(-50%, 0); opacity: 1; }
            }
            .sh-icon-container {
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
            }
            .sh-icon-ring {
                position: absolute;
                inset: 0;
                border: 2px solid transparent;
                border-top-color: #0a66c2;
                border-right-color: #0a66c2;
                border-radius: 50%;
                animation: shSpin 1.5s linear infinite;
            }
            .sh-icon-core {
                width: 16px;
                height: 16px;
                background: #0a66c2;
                border-radius: 50%;
                animation: shPulse 2s ease-in-out infinite;
                box-shadow: 0 0 10px #0a66c2;
            }
            @keyframes shSpin { to { transform: rotate(360deg); } }
            @keyframes shPulse { 
                0%, 100% { transform: scale(0.8); opacity: 0.8; }
                50% { transform: scale(1.1); opacity: 1; }
            }
            .sh-text-container {
                flex: 1;
                display: flex;
                flex-direction: column;
            }
            .sh-text {
                font-size: 14px;
                font-weight: 600;
                color: #0f172a;
                letter-spacing: -0.3px;
                background: linear-gradient(90deg, #0f172a, #334155);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }
            .sh-step {
                font-size: 11px;
                color: #64748b;
                font-weight: 500;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-top: 2px;
            }
        `;
        document.head.appendChild(style);
    }

    if (step === -1) {
        widget.innerHTML = `<div style="font-size: 24px;">⚠️</div><div class="sh-text" style="color:#b91c1c; -webkit-text-fill-color: #b91c1c;">${text}</div>`;
        return;
    }

    widget.innerHTML = `
        <div class="sh-icon-container">
            <div class="sh-icon-ring"></div>
            <div class="sh-icon-core"></div>
        </div>
        <div class="sh-text-container">
            <div class="sh-text">${text}</div>
            ${step > 0 ? `<div class="sh-step">STEP ${step} OF 3</div>` : ''}
        </div>
    `;
}

function removeProcessingWidget() {
    const w = document.getElementById('smarthirex-processing-widget');
    if (w) {
        w.style.opacity = '0';
        w.style.transform = 'translate(-50%, -20px) scale(0.95)';
        w.style.transition = 'all 0.3s';
        setTimeout(() => w.remove(), 300);
    }
}

// ============================================
// CHAT INTERFACE INJECTION
// ============================================

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
                    // Moving Left (negative deltaX) should INCREASE width
                    container.style.width = `${startWidth - deltaX}px`;
                    // Moving Up (negative deltaY) should INCREASE height
                    container.style.height = `${startHeight - deltaY}px`;
                }

                // NE: Drag Right/Up -> Increase Width/Height. But Right is Anchored.
                // WE MUST: Decrease Right, Increase Width
                if (direction === 'ne') {
                    // Moving Right (positive deltaX)
                    // Increase Width by deltaX
                    container.style.width = `${startWidth + deltaX}px`;
                    // Decrease Right by deltaX
                    container.style.right = `${startRight - deltaX}px`;

                    // Moving Up (negative deltaY) -> Increase Height
                    container.style.height = `${startHeight - deltaY}px`;
                }

                // SW: Drag Left/Down -> Increase Width. But Bottom is Anchored.
                // WE MUST: Decrease Bottom, Increase Height
                if (direction === 'sw') {
                    // Moving Left (negative deltaX) -> Increase Width
                    container.style.width = `${startWidth - deltaX}px`;

                    // Moving Down (positive deltaY)
                    // Increase Height
                    container.style.height = `${startHeight + deltaY}px`;
                    // Decrease Bottom
                    container.style.bottom = `${startBottom - deltaY}px`;
                }

                // SE: Drag Right/Down -> Increase Width/Height. Anchors Right/Bottom.
                // WE MUST: Decrease Right, Decrease Bottom, Increase W/H
                if (direction === 'se') {
                    // Moving Right (positive deltaX)
                    container.style.width = `${startWidth + deltaX}px`;
                    container.style.right = `${startRight - deltaX}px`;

                    // Moving Down (positive deltaY)
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

/**
 * Ghost Typer: Simulates human typing into an element
 */
async function simulateTyping(element, value, confidence = 1.0) {
    if (!element || !value) return;

    // Add typing visual state
    element.classList.add('smarthirex-typing');
    element.focus();

    const tagName = element.tagName;
    const inputType = element.type?.toLowerCase();
    const isTextInputs = (tagName === 'INPUT' && ['text', 'email', 'tel', 'url', 'search', 'password', 'number'].includes(inputType)) || tagName === 'TEXTAREA';

    if (isTextInputs) {
        // Clear current value
        element.value = '';

        // Type characters
        const chars = value.toString().split('');
        for (const char of chars) {
            element.value += char;
            // Dispatch input event for frameworks (React/Vue)
            element.dispatchEvent(new Event('input', { bubbles: true }));

            // Random delay between keystrokes (ultra-fast but visible)
            // Visible typing speed: 20-40ms per character
            await new Promise(r => setTimeout(r, Math.random() * 20 + 20));
        }
    } else {
        // Non-text inputs (select, radio, etc.) - just set value with small delay
        await new Promise(r => setTimeout(r, 200));
        setFieldValue(element, value);
    }

    // Remove typing state and add filled state
    element.classList.remove('smarthirex-typing');
    // Use highlightField to apply the confidence-based color persistence
    highlightField(element, confidence);

    // Final events to ensure state is saved
    dispatchChangeEvents(element);

    // Small pause before next field
    await new Promise(r => setTimeout(r, 100));
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

            // Confidence extraction
            const confidence = (fieldData && typeof fieldData === 'object') ? fieldData.confidence : 1.0;

            // Fill based on element type
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                const type = element.type?.toLowerCase();
                // Use typing animation for text-like inputs
                if (!['checkbox', 'radio', 'file', 'hidden', 'color', 'range', 'date', 'datetime-local', 'time', 'week', 'month'].includes(type)) {
                    // Fire and forget typing animation (parallel filling)
                    simulateTyping(element, normalizedValue, confidence);
                } else {
                    setFieldValue(element, normalizedValue);
                    highlightField(element, confidence);
                }
            } else if (element.tagName === 'SELECT') {
                setFieldValue(element, normalizedValue);
                highlightField(element, confidence);
            }

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
 * Show error toast notification
 */
function showErrorToast(message) {
    // Remove any existing toast
    const existingToast = document.getElementById('smarthirex-fill-toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.id = 'smarthirex-fill-toast';
    toast.style.cssText = `
        position: fixed;
        top: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: white;
        border-left: 4px solid #ef4444;
        border-radius: 8px;
        padding: 16px 20px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        min-width: 320px;
        max-width: 450px;
        display: flex;
        align-items: flex-start;
        gap: 12px;
        animation: slideDownFade 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    toast.innerHTML = `
        <div style="font-size: 20px; line-height: 1; flex-shrink: 0;">⚠️</div>
        <div style="flex: 1;">
            <div style="font-weight: 700; color: #7f1d1d; font-size: 15px; margin-bottom: 4px;">Error</div>
            <div style="color: #450a0a; font-size: 14px; line-height: 1.4;">${message}</div>
        </div>
        <div id="smarthirex-error-close" style="cursor: pointer; color: #991b1b; padding: 4px;">✕</div>
    `;

    // Securely attach listener
    document.body.appendChild(toast);

    // Auto remove after 6 seconds
    setTimeout(() => {
        if (toast && toast.parentNode) toast.remove();
    }, 6000);

    const closeBtn = document.getElementById('smarthirex-error-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (toast) toast.remove();
        });
    }

    // Add animation styles if needed
    if (!document.getElementById('smarthirex-toast-styles')) {
        const style = document.createElement('style');
        style.id = 'smarthirex-toast-styles';
        style.textContent = `
            @keyframes slideDownFade {
                from { transform: translate(-50%, -20px); opacity: 0; }
                to { transform: translate(-50%, 0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    // Auto remove after 6 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, -10px)';
            setTimeout(() => toast.remove(), 300);
        }
    }, 6000);
}

/**
 * Show success toast notification after instant fill
 */
function showSuccessToast(filledCount, reviewCount) {
    // Remove any existing toast
    const existingToast = document.getElementById('smarthirex-fill-toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.id = 'smarthirex-fill-toast';
    toast.style.cssText = `
        position: fixed;
        top: 24px;
        left: 24px;
        background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 16px 20px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        min-width: 300px;
        animation: slideInLeft 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    const icon = filledCount > 0 ? '✅' : '📋';
    const fillText = filledCount > 0 ? `Filled ${filledCount} field${filledCount > 1 ? 's' : ''}` : 'Ready to review';

    toast.innerHTML = `
        <div style="display: flex; align-items: start; gap: 12px;">
            <div style="font-size: 24px; line-height: 1;">${icon}</div>
            <div style="flex: 1;">
                <div style="font-weight: 700; color: #0f172a; font-size: 15px; margin-bottom: 4px; letter-spacing: -0.01em;">
                    ${fillText}
                </div>
                ${reviewCount > 0 ? `
                    <div style="color: #d97706; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 6px; margin-top: 6px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="12" y1="8" x2="12" y2="12"/>
                            <line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        <span>Action required: ${reviewCount} field${reviewCount > 1 ? 's' : ''} to review</span>
                    </div>
                ` : `
                    <div style="color: #059669; font-size: 13px; font-weight: 500;">
                        ✨ All fields smartly filled!
                    </div>
                `}
            </div>
            <button id="smarthirex-toast-close" style="
                background: transparent;
                border: none;
                color: #64748b;
                cursor: pointer;
                padding: 4px;
                line-height: 1;
                font-size: 18px;
            ">×</button>
        </div>
    `;

    // Attach click handler separately for CSP compliance
    // We need to wait for appending to body first, or create element first
    // Since we used innerHTML on 'toast' element, we can find the button inside 'toast'
    // BEFORE appending 'toast' to body? Yes.

    // Actually, 'toast' is the container. We set innerHTML on it.
    // So we can find the close button within 'toast' immediately.

    // Add animation styles if not already present
    if (!document.getElementById('smarthirex-toast-styles')) {
        const style = document.createElement('style');
        style.id = 'smarthirex-toast-styles';
        style.textContent = `
            @keyframes slideInLeft {
                from { opacity: 0; transform: translateX(-100px) scale(0.95); }
                to { opacity: 1; transform: translateX(0) scale(1); }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    // Attach listener after appending (or before, doesn't matter for element reference)
    const closeBtn = document.getElementById('smarthirex-toast-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            toast.remove();
        });
    }

    // Auto-dismiss after 5 seconds for all cases (since sidebar is open)
    setTimeout(() => {
        if (toast && toast.parentElement) {
            toast.style.animation = 'slideInLeft 0.3s reverse';
            setTimeout(() => toast.remove(), 300);
        }
    }, 5000);
}

/**
 * Show accordion-style sidebar with auto-filled, needs review, and file upload sections
 */
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

// Helper to get field label
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

// Add accordion styles (only once)
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

        /* PREMIUM GHOST TYPER STYLES */
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

    // Separate File Uploads from regular Low Confidence fields
    const lowConfFields = fieldsWithInfo.filter(f => !f.isFileUpload);
    const fileUploadFields = fieldsWithInfo.filter(f => f.isFileUpload);

    console.log(`Found ${lowConfFields.length} review fields and ${fileUploadFields.length} file uploads`);

    // Create the sidebar panel
    const panel = document.createElement('div');
    panel.id = 'smarthirex-lowconf-panel';
    panel.innerHTML = `
    <div class="panel-header" style="background: #0a66c2; border-bottom: 1px solid rgba(255,255,255,0.1); border-radius: 2px 2px 0 0; flex-shrink: 0;">
            <div class="header-icon" style="background: rgba(255,255,255,0.2); border-radius: 6px; padding: 4px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
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
            <button class="close-btn" id="smarthirex-lowconf-close" style="color: white !important; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); border-radius: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
        <div class="panel-divider"></div>
        <div class="panel-list" style="flex: 1; overflow-y: auto; overflow-x: hidden; min-height: 0; position: relative;">
            
            ${lowConfFields.length > 0 ? `
            <div class="section-header" style="position: sticky; top: 0; background: rgba(248,250,252,0.98); backdrop-filter: blur(8px); padding: 12px 24px 8px 20px; font-size: 10px; font-weight: 700; color: #64748b; letter-spacing: 0.1em; text-transform: uppercase; border: 1px solid rgba(10,102,194,0.15); border-left: 3px solid #0a66c2; box-shadow: 0 1px 2px rgba(0,0,0,0.02); z-index: 10;">
                Review Required (${lowConfFields.length})
            </div>
            ${lowConfFields.map((item, i) => {
        const confidencePercent = Math.round(item.confidence * 100);
        const confidenceClass = item.confidence >= 0.7 ? 'medium' : 'low';
        return `
                    <div class="field-item" data-idx="${i}" style="padding-left: 32px; background: #f9fafb;">
                        <div class="field-number">${i + 1}</div>
                        <div class="field-content">
                            <div class="field-label">${item.label}</div>
                            <div class="field-hint">
                                <span class="field-type-badge ${item.fieldType}">${item.fieldType.toUpperCase()}</span>
                                <span class="field-confidence-badge ${confidenceClass}">${confidencePercent}% confidence</span>
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
            ` : ''}

            ${fileUploadFields.length > 0 ? `
            <div class="section-header" style="position: sticky; top: ${lowConfFields.length > 0 ? '0' : '0'}; background: rgba(248,250,252,0.98); backdrop-filter: blur(8px); padding: 12px 24px 8px 20px; font-size: 10px; font-weight: 700; color: #64748b; letter-spacing: 0.1em; text-transform: uppercase; border: 1px solid rgba(10,102,194,0.15); border-left: 3px solid #0a66c2; box-shadow: 0 1px 2px rgba(0,0,0,0.02); z-index: 10;">
                File Uploads (${fileUploadFields.length})
            </div>
            ${fileUploadFields.map((item, i) => {
        return `
                    <div class="field-item file-upload-item" data-idx="${lowConfFields.length + i}" style="padding-left: 32px; background: #f9fafb;">
                        <div class="field-number file-upload-icon">📎</div>
                        <div class="field-content">
                            <div class="field-label">${item.label}</div>
                            <div class="field-hint">
                                <span class="field-type-badge file-badge">FILE UPLOAD</span>
                                <span class="field-priority-badge">Required</span>
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
            ` : ''}
        </div>
        <div class="panel-footer" style="flex-shrink: 0;">
            <div class="footer-icon">⚠️</div>
            <div class="footer-text">Confidence below 90% - verify before submitting</div>
        </div>
`;

    document.body.appendChild(panel);

    // Securely attach close listener
    const lowConfCloseBtn = panel.querySelector('#smarthirex-lowconf-close');
    if (lowConfCloseBtn) {
        lowConfCloseBtn.addEventListener('click', () => {
            const p = document.getElementById('smarthirex-lowconf-panel');
            if (p) p.remove();
            document.querySelectorAll('.smarthirex-lowconf-overlay').forEach(el => el.remove());
            document.querySelectorAll('.smarthirex-lowconf-highlight').forEach(el => el.classList.remove('smarthirex-lowconf-highlight'));
        });
    }

    // Securely attach close listener


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
    < div class="lowconf-badge" >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M12 20h9"/>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
                <span>Review (${confidencePercent}%)</span>
            </div >
    `;

        const rect = field.getBoundingClientRect();
        overlay.style.position = 'absolute';
        overlay.style.left = `${rect.left + window.scrollX} px`;
        overlay.style.top = `${rect.top + window.scrollY - 46} px`;
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
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    background: #ffffff;
    border-radius: 2px;
    box-shadow: 
        0 4px 6px -1px rgba(0, 0, 0, 0.1),
        0 2px 4px -1px rgba(0, 0, 0, 0.06);
    z-index: 2147483647 !important;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Segoe UI", Roboto, sans-serif;
    animation: slideInFromBottomLeft 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    border: 1px solid #e2e8f0;
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



@keyframes shimmer {
    0 % { background- position: 200 % 0;
}
100 % { background- position: -200 % 0; }
            }

#smarthirex - lowconf - panel.panel - header {
    padding: 24px 24px 20px 24px;
    background: #0a66c2;
    border - bottom: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align - items: flex - start;
    gap: 14px;
    color: white;
}

#smarthirex - lowconf - panel.header - icon {
    width: 42px;
    height: 42px;
    background: rgba(255, 255, 255, 0.15);
    border - radius: 12px;
    display: flex;
    align - items: center;
    justify - content: center;
    color: white;
    flex - shrink: 0;
    box - shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    backdrop - filter: blur(4px);
    border: 1px solid rgba(255, 255, 255, 0.2);
}

#smarthirex - lowconf - panel.header - content {
    flex: 1;
    min - width: 0;
}

#smarthirex - lowconf - panel.header - title {
    display: flex;
    align - items: center;
    gap: 10px;
    border: 1px solid rgba(0, 0, 0, 0.06);
    border - radius: 10px;
    display: flex;
    align - items: center;
    justify - content: center;
    cursor: pointer;
    transition: all 0.2s cubic - bezier(0.4, 0, 0.2, 1);
    color: #64748b;
    flex - shrink: 0;
}

#smarthirex - lowconf - panel.close - btn:hover {
    background: rgba(241, 245, 249, 1);
    border - color: rgba(0, 0, 0, 0.1);
    color: #334155;
    transform: scale(1.05);
}

#smarthirex - lowconf - panel.panel - divider {
    height: 1px;
    background: linear - gradient(to right,
        transparent,
        rgba(0, 0, 0, 0.08) 20 %,
        rgba(0, 0, 0, 0.08) 80 %,
        transparent);
    margin: 0;
}

#smarthirex - lowconf - panel.panel - list {
    padding: 16px 16px 12px 16px;
    max - height: 340px;
    overflow - y: auto;
    overflow - x: hidden;
}

#smarthirex - lowconf - panel.panel - list:: -webkit - scrollbar {
    width: 6px;
}

#smarthirex - lowconf - panel.panel - list:: -webkit - scrollbar - track {
    background: transparent;
}

#smarthirex - lowconf - panel.panel - list:: -webkit - scrollbar - thumb {
    background: rgba(203, 213, 225, 0.6);
    border - radius: 3px;
}

#smarthirex - lowconf - panel.panel - list:: -webkit - scrollbar - thumb:hover {
    background: rgba(148, 163, 184, 0.8);
}

#smarthirex - lowconf - panel.field - item {
    display: flex;
    align - items: center;
    gap: 14px;
    padding: 14px 16px;
    margin - bottom: 10px;
    background: linear - gradient(135deg, rgba(255, 255, 255, 0.4) 0 %, rgba(255, 255, 255, 0.6) 100 %);
    border: 1px solid rgba(0, 0, 0, 0.06);
    border - radius: 14px;
    cursor: pointer;
    transition: all 0.25s cubic - bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
}

#smarthirex - lowconf - panel.field - item::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear - gradient(135deg, rgba(245, 158, 11, 0.08) 0 %, rgba(249, 115, 22, 0.08) 100 %);
    opacity: 0;
    transition: opacity 0.25s ease;
}

#smarthirex - lowconf - panel.field - item:hover {
    background: #e5e7eb !important;
    border-left: 3px solid #64748b !important;
    transform: translateX(6px) scale(1.02);
    box - shadow:
    0 4px 12px rgba(0, 0, 0, 0.08),
        0 0 0 1px rgba(100, 116, 139, 0.1);
}

#smarthirex - lowconf - panel.field - item: hover::before {
    opacity: 1;
}

#smarthirex - lowconf - panel.field - item:active {
    transform: translateX(4px) scale(0.98);
}

#smarthirex - lowconf - panel.field - number {
    width: 28px;
    height: 28px;
    background: linear - gradient(135deg, rgba(245, 158, 11, 0.12), rgba(249, 115, 22, 0.15));
    color: #ea580c;
    border - radius: 8px;
    display: flex;
    align - items: center;
    justify - content: center;
    font - size: 12px;
    font - weight: 700;
    flex - shrink: 0;
    position: relative;
    z - index: 1;
    border: 1px solid rgba(245, 158, 11, 0.2);
}

#smarthirex - lowconf - panel.field - content {
    flex: 1;
    min - width: 0;
    position: relative;
    z - index: 1;
}

#smarthirex - lowconf - panel.field - label {
    font - size: 14px;
    font - weight: 600;
    color: #1e293b;
    margin - bottom: 5px;
    overflow: hidden;
    text - overflow: ellipsis;
    white - space: nowrap;
    letter - spacing: -0.2px;
}

#smarthirex - lowconf - panel.field - hint {
    font - size: 11px;
    color: #64748b;
    font - weight: 500;
    display: flex;
    align - items: center;
    gap: 6px;
    flex - wrap: wrap;
}

#smarthirex - lowconf - panel.field - arrow {
    color: #cbd5e1;
    flex - shrink: 0;
    transition: all 0.25s ease;
    position: relative;
    z - index: 1;
}

#smarthirex - lowconf - panel.field - item: hover.field - arrow {
    color: #f59e0b;
    transform: translateX(4px);
}

#smarthirex - lowconf - panel.panel - footer {
    padding: 16px 24px 20px 24px;
    background: linear - gradient(to top, rgba(255, 255, 255, 0.8), transparent);
    border - top: 1px solid rgba(0, 0, 0, 0.04);
    display: flex;
    align - items: center;
    gap: 12px;
}

#smarthirex - lowconf - panel.footer - icon {
    font - size: 18px;
    filter: drop - shadow(0 2px 4px rgba(0, 0, 0, 0.1));
}

#smarthirex - lowconf - panel.footer - text {
    font - size: 13px;
    color: #64748b;
    font - weight: 600;
    letter - spacing: -0.1px;
}
            
            .smarthirex - lowconf - highlight {
    outline: 3px solid #f59e0b!important;
    outline - offset: 3px!important;
    box - shadow: 0 0 0 6px rgba(245, 158, 11, 0.15)!important;
    animation: pulse - lowconf - field 2.5s ease -in -out infinite!important;
    border - radius: 8px;
}

@keyframes pulse - lowconf - field {
    0 %, 100 % {
        outline- color: #f59e0b;
    box - shadow: 0 0 0 6px rgba(245, 158, 11, 0.15);
}
50 % {
    outline- color: #fb923c;
box - shadow: 0 0 0 6px rgba(251, 146, 60, 0.25); 
                }
            }
            
            .smarthirex - lowconf - overlay {
    opacity: 1;
    transition: opacity 0.3s ease;
    animation: fadeInBounce 0.5s cubic - bezier(0.16, 1, 0.3, 1);
    filter: drop - shadow(0 4px 12px rgba(0, 0, 0, 0.15));
}

@keyframes fadeInBounce {
    0 % { opacity: 0; transform: translateY(-15px) scale(0.9); }
    60 % { transform: translateY(2px) scale(1.02); }
    100 % { opacity: 1; transform: translateY(0) scale(1); }
}
            
            .lowconf - badge {
    background: linear - gradient(135deg, #f59e0b 0 %, #f97316 50 %, #fb923c 100 %);
    color: white;
    padding: 8px 14px;
    border - radius: 10px;
    display: inline - flex;
    align - items: center;
    gap: 7px;
    box - shadow:
    0 4px 16px rgba(245, 158, 11, 0.4),
        0 0 0 1px rgba(255, 255, 255, 0.2) inset;
    font - size: 13px;
    font - weight: 700;
    letter - spacing: 0.3px;
    animation: floatGlow 4s ease -in -out infinite;
}

@keyframes floatGlow {
    0 %, 100 % {
        transform: translateY(0);
        box- shadow: 0 4px 16px rgba(245, 158, 11, 0.4);
}
50 % {
    transform: translateY(-5px);
    box- shadow: 0 8px 24px rgba(245, 158, 11, 0.5);
                }
            }
            
            .field - type - badge {
    background: linear - gradient(135deg, #f1f5f9, #e2e8f0);
    color: #475569;
    padding: 3px 8px;
    border - radius: 6px;
    font - size: 10px;
    font - weight: 700;
    text - transform: uppercase;
    letter - spacing: 0.5px;
    border: 1px solid rgba(0, 0, 0, 0.06);
}
            
            .field - confidence - badge {
    font - size: 11px;
    padding: 3px 8px;
    border - radius: 6px;
    font - weight: 700;
    letter - spacing: 0.2px;
    border: 1px solid;
}
            
            .field - confidence - badge.low {
    background: linear - gradient(135deg, #fef3c7, #fde68a);
    color: #92400e;
    border - color: rgba(146, 64, 14, 0.2);
}
            
            .field - confidence - badge.medium {
    background: linear - gradient(135deg, #dbeafe, #bfdbfe);
    color: #1e40af;
    border - color: rgba(30, 64, 175, 0.2);
}
            
            .field - priority - badge {
    font - size: 11px;
    padding: 3px 8px;
    border - radius: 6px;
    font - weight: 700;
    letter - spacing: 0.2px;
    background: linear - gradient(135deg, #d1fae5, #a7f3d0);
    color: #065f46;
    border: 1px solid rgba(5, 150, 105, 0.3);
}
            
            .field - type - badge.file - badge {
    background: linear - gradient(135deg, #10b981, #059669);
    color: white;
    border - color: rgba(5, 150, 105, 0.3);
}
            
            .file - upload - item {
    background: linear - gradient(135deg, rgba(236, 253, 245, 0.6) 0 %, rgba(209, 250, 229, 0.6) 100 %);
    border - color: rgba(16, 185, 129, 0.2);
}
            
            .file - upload - item:hover {
    background: rgba(236, 253, 245, 0.95);
    border - color: rgba(16, 185, 129, 0.4);
    box - shadow:
    0 4px 12px rgba(16, 185, 129, 0.15),
        0 0 0 1px rgba(16, 185, 129, 0.1);
}
            
            .file - upload - icon {
    background: linear - gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.2));
    color: #059669;
    border - color: rgba(16, 185, 129, 0.3);
    font - size: 16px;
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
    < div class="panel-header" >
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
        </div >
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
    < div class="unfilled-badge" >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M12 20h9"/>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
                <span>Required</span>
            </div >
    `;

        const rect = field.getBoundingClientRect();
        overlay.style.position = 'absolute';
        overlay.style.left = `${rect.left + window.scrollX} px`;
        overlay.style.top = `${rect.top + window.scrollY - 46} px`;
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
#smarthirex - unfilled - panel {
    position: fixed;
    left: 20px;
    top: 50 %;
    transform: translateY(-50 %);
    width: 340px;
    background: #ffffff;
    border - radius: 16px;
    box - shadow: 0 20px 25px - 5px rgba(0, 0, 0, 0.1), 0 10px 10px - 5px rgba(0, 0, 0, 0.04);
    z - index: 2147483647!important;
    font - family: -apple - system, BlinkMacSystemFont, "Segoe UI", Roboto, sans - serif;
    animation: slideInFromLeft 0.5s cubic - bezier(0.16, 1, 0.3, 1);
    border: 1px solid rgba(0, 0, 0, 0.08);
}

@keyframes slideInFromLeft {
                from { transform: translateY(-50 %) translateX(-60px); opacity: 0; }
                to { transform: translateY(-50 %) translateX(0); opacity: 1; }
}
            
            .panel - header {
    padding: 20px;
    display: flex;
    align - items: flex - start;
    gap: 12px;
}
            
            .header - icon {
    width: 36px;
    height: 36px;
    background: linear - gradient(135deg, #667eea 0 %, #764ba2 100 %);
    border - radius: 10px;
    display: flex;
    align - items: center;
    justify - content: center;
    color: white;
    flex - shrink: 0;
}
            
            .header - content {
    flex: 1;
    min - width: 0;
}
            
            .header - title {
    display: flex;
    align - items: center;
    gap: 8px;
    margin - bottom: 4px;
}
            
            .count - badge {
    background: linear - gradient(135deg, #667eea 0 %, #764ba2 100 %);
    color: white;
    padding: 2px 8px;
    border - radius: 8px;
    font - size: 13px;
    font - weight: 700;
    letter - spacing: -0.3px;
}
            
            .header - text {
    font - size: 15px;
    font - weight: 600;
    color: #1e293b;
    letter - spacing: -0.3px;
}
            
            .header - subtitle {
    font - size: 12px;
    color: #64748b;
    font - weight: 500;
}
            
            .close - btn {
    width: 28px;
    height: 28px;
    background: #f1f5f9;
    border: none;
    border - radius: 8px;
    display: flex;
    align - items: center;
    justify - content: center;
    cursor: pointer;
    transition: all 0.2s;
    color: #64748b;
    flex - shrink: 0;
}
            
            .close - btn:hover {
    background: #e2e8f0;
    color: #334155;
}
            
            .panel - divider {
    height: 1px;
    background: linear - gradient(to right, transparent, #e2e8f0, transparent);
    margin: 0 20px;
}
            
            .panel - list {
    padding: 16px 12px;
    max - height: 400px;
    overflow - y: auto;
}
            
            .panel - list:: -webkit - scrollbar {
    width: 6px;
}
            
            .panel - list:: -webkit - scrollbar - track {
    background: transparent;
}
            
            .panel - list:: -webkit - scrollbar - thumb {
    background: #cbd5e1;
    border - radius: 3px;
}
            
            .field - item {
    display: flex;
    align - items: center;
    gap: 12px;
    padding: 12px;
    margin - bottom: 8px;
    background: #fafafa;
    border: 1px solid #e2e8f0;
    border - radius: 10px;
    cursor: pointer;
    transition: all 0.2s cubic - bezier(0.4, 0, 0.2, 1);
}
            
            .field - item:hover {
    background: #f8fafc;
    border - color: #cbd5e1;
    transform: translateX(4px);
    box - shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}
            
            .field - number {
    width: 24px;
    height: 24px;
    background: linear - gradient(135deg, #667eea20, #764ba220);
    color: #667eea;
    border - radius: 6px;
    display: flex;
    align - items: center;
    justify - content: center;
    font - size: 11px;
    font - weight: 700;
    flex - shrink: 0;
}
            
            .field - content {
    flex: 1;
    min - width: 0;
}
            
            .field - label {
    font - size: 13px;
    font - weight: 600;
    color: #334155;
    margin - bottom: 2px;
    overflow: hidden;
    text - overflow: ellipsis;
    white - space: nowrap;
}
            
            .field - hint {
    font - size: 11px;
    color: #94a3b8;
    font - weight: 500;
}
            
            .field - arrow {
    color: #cbd5e1;
    flex - shrink: 0;
    transition: all 0.2s;
}
            
            .field - item: hover.field - arrow {
    color: #667eea;
    transform: translateX(2px);
}
            
            .panel - footer {
    padding: 16px 20px;
    background: linear - gradient(to bottom, transparent, #fafafa);
    border - top: 1px solid #f1f5f9;
    display: flex;
    align - items: center;
    gap: 10px;
    border - radius: 0 0 16px 16px;
}
            
            .footer - icon {
    font - size: 16px;
}
            
            .footer - text {
    font - size: 12px;
    color: #64748b;
    font - weight: 600;
}

            /* Field Highlighting */
            .smarthirex - unfilled - highlight {
    outline: 2px solid #667eea!important;
    outline - offset: 2px!important;
    box - shadow: 0 0 0 4px rgba(102, 126, 234, 0.1)!important;
    animation: pulse - field 2s ease -in -out infinite!important;
}

@keyframes pulse - field {
    0 %, 100 % { outline- color: #667eea; box - shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
}
50 % { outline- color: #764ba2; box - shadow: 0 0 0 4px rgba(118, 75, 162, 0.15); }
            }

            /* Field Overlay Badge */
            .smarthirex - unfilled - overlay {
    opacity: 1;
    transition: opacity 0.3s;
    animation: fadeIn 0.4s ease - out;
}

@keyframes fadeIn {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
}
            
            .unfilled - badge {
    background: linear - gradient(135deg, #667eea, #764ba2);
    color: white;
    padding: 6px 12px;
    border - radius: 8px;
    display: inline - flex;
    align - items: center;
    gap: 6px;
    box - shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
    font - size: 12px;
    font - weight: 600;
    letter - spacing: 0.2px;
    animation: float 3s ease -in -out infinite;
}

@keyframes float {
    0 %, 100 % { transform: translateY(0); }
    50 % { transform: translateY(-4px); }
}

/* Mobile Responsive */
@media(max - width: 768px) {
    #smarthirex - unfilled - panel {
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
            to { transform: translateY(-50 %) translateX(-60px); opacity: 0; }
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
                    console.warn(`Element not found for undo: ${selector} `);
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
                console.error(`Error restoring ${selector}: `, error);
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

// Highlight filled field with animation and confidence-based color
function highlightField(element, confidence = 1.0) {
    // Determine class based on confidence
    let filledClass = 'smarthirex-filled-high'; // Default (Green)

    if (confidence <= 0.5) {
        filledClass = 'smarthirex-filled-low'; // Red
    } else if (confidence <= 0.9) {
        filledClass = 'smarthirex-filled-medium'; // Blue
    }

    // Add highlight class (persistent)
    element.classList.add(filledClass);

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
    < div class="smarthirex-file-upload-indicator" >
                <div class="icon">📄</div>
                <div class="message">Please upload your document here</div>
                <div class="hint">Click or drag & drop</div>
            </div >
    `;

        // Position overlay near the file input
        const rect = field.getBoundingClientRect();
        overlay.style.position = 'absolute';
        overlay.style.left = `${rect.left + window.scrollX} px`;
        overlay.style.top = `${rect.top + window.scrollY - 80} px`;
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
        return `#${element.id} `;
    }

    if (element.name) {
        return `input[name = "${element.name}"]`;
    }

    // Fallback: use tag + nth-of-type
    const parent = element.parentElement;
    if (parent) {
        const siblings = Array.from(parent.children).filter(child =>
            child.tagName === element.tagName
        );
        const index = siblings.indexOf(element) + 1;
        return `${element.tagName.toLowerCase()}: nth - of - type(${index})`;
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
    font - family: 'Inter', -apple - system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans - serif;
}

        .smarthirex - modal - overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(15, 23, 42, 0.75);
    backdrop - filter: blur(8px);
    -webkit - backdrop - filter: blur(8px);
    display: flex;
    align - items: center;
    justify - content: center;
    z - index: 2147483647!important;
    padding: 20px;
    animation: smarthirex - fadeIn 0.3s cubic - bezier(0.16, 1, 0.3, 1);
    font - family: 'Inter', -apple - system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans - serif;
}

@keyframes smarthirex - fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
}

        .smarthirex - missing - data - dialog {
    background: linear - gradient(180deg, #ffffff 0 %, #fafbfc 100 %);
    border - radius: 20px;
    width: 100 %;
    max - width: 480px;
    max - height: 85vh;
    overflow: hidden;
    box - shadow:
    0 0 0 1px rgba(15, 23, 42, 0.05),
        0 20px 25px - 5px rgba(15, 23, 42, 0.1),
            0 40px 60px - 15px rgba(15, 23, 42, 0.25);
    animation: smarthirex - slideUp 0.4s cubic - bezier(0.16, 1, 0.3, 1);
    position: relative;
}

        .smarthirex - missing - data - dialog::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear - gradient(90deg, #8B5CF6 0 %, #6366F1 50 %, #8B5CF6 100 %);
    background - size: 200 % 100 %;
    animation: smarthirex - shimmer 3s linear infinite;
}

@keyframes smarthirex - shimmer {
    0 % { background- position: 200 % 0;
}
100 % { background- position: -200 % 0; }
        }

@keyframes smarthirex - slideUp {
            from {
        transform: translateY(32px) scale(0.96);
        opacity: 0;
    }
            to {
        transform: translateY(0) scale(1);
        opacity: 1;
    }
}

        .smarthirex - dialog - header {
    padding: 32px 32px 24px 32px;
    background: linear - gradient(135deg, rgba(139, 92, 246, 0.03) 0 %, rgba(99, 102, 241, 0.03) 100 %);
    border - bottom: 1px solid rgba(226, 232, 240, 0.8);
    position: relative;
}

        .smarthirex - dialog - header::before {
    content: '🎯';
    position: absolute;
    top: 24px;
    left: 32px;
    font - size: 28px;
    opacity: 0.9;
}

        .smarthirex - dialog - header h3 {
    font - size: 22px;
    font - weight: 700;
    color: #0f172a;
    margin - bottom: 8px;
    margin - left: 44px;
    letter - spacing: -0.02em;
    line - height: 1.3;
    font - family: -apple - system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans - serif;
}

        .smarthirex - dialog - header p {
    font - size: 14px;
    color: #64748b;
    margin - left: 44px;
    line - height: 1.5;
    font - weight: 500;
    font - family: -apple - system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans - serif;
}

        .smarthirex - dialog - content {
    padding: 24px 32px;
    max - height: calc(85vh - 200px);
    overflow - y: auto;
}

        .smarthirex - dialog - content:: -webkit - scrollbar {
    width: 8px;
}

        .smarthirex - dialog - content:: -webkit - scrollbar - track {
    background: transparent;
}

        .smarthirex - dialog - content:: -webkit - scrollbar - thumb {
    background: #cbd5e1;
    border - radius: 4px;
}

        .smarthirex - dialog - content:: -webkit - scrollbar - thumb:hover {
    background: #94a3b8;
}

        .smarthirex - field - group {
    margin - bottom: 20px;
    animation: smarthirex - slideIn 0.3s ease forwards;
    opacity: 0;
}

        .smarthirex - field - group: nth - child(1) { animation - delay: 0.05s; }
        .smarthirex - field - group: nth - child(2) { animation - delay: 0.1s; }
        .smarthirex - field - group: nth - child(3) { animation - delay: 0.15s; }
        .smarthirex - field - group: nth - child(4) { animation - delay: 0.2s; }
        .smarthirex - field - group: nth - child(5) { animation - delay: 0.25s; }

@keyframes smarthirex - slideIn {
            from {
        transform: translateX(-8px);
        opacity: 0;
    }
            to {
        transform: translateX(0);
        opacity: 1;
    }
}

        .smarthirex - field - group: last - child {
    margin - bottom: 0;
}

        .smarthirex - field - group label {
    display: block;
    font - size: 13px;
    font - weight: 600;
    color: #0f172a;
    margin - bottom: 8px;
    letter - spacing: -0.01em;
    font - family: -apple - system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans - serif;
}

        .smarthirex - field - group label::after {
    content: '*';
    color: #ef4444;
    margin - left: 4px;
    font - weight: 700;
}

        .smarthirex - field - group input,
        .smarthirex - field - group textarea {
    width: 100 %;
    padding: 12px 14px;
    border: 1.5px solid #e2e8f0;
    border - radius: 10px;
    font - size: 14px;
    font - family: -apple - system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans - serif;
    transition: all 0.2s cubic - bezier(0.4, 0, 0.2, 1);
    background: #ffffff;
    color: #0f172a;
}

        .smarthirex - field - group input:: placeholder,
        .smarthirex - field - group textarea::placeholder {
    color: #94a3b8;
}

        .smarthirex - field - group input: hover,
        .smarthirex - field - group textarea:hover {
    border - color: #cbd5e1;
}

        .smarthirex - field - group input: focus,
        .smarthirex - field - group textarea:focus {
    outline: none;
    border - color: #8B5CF6;
    box - shadow:
    0 0 0 4px rgba(139, 92, 246, 0.08),
        0 1px 2px 0 rgba(0, 0, 0, 0.05);
    background: #ffffff;
}

        .smarthirex - field - group textarea {
    resize: vertical;
    min - height: 96px;
    line - height: 1.5;
}

        .smarthirex - dialog - footer {
    padding: 20px 32px 32px 32px;
    background: linear - gradient(180deg, rgba(248, 250, 252, 0.5) 0 %, rgba(248, 250, 252, 0.8) 100 %);
    border - top: 1px solid rgba(226, 232, 240, 0.8);
    display: flex;
    gap: 12px;
}

        .smarthirex - btn {
    flex: 1;
    padding: 14px 20px;
    font - size: 15px;
    font - weight: 600;
    border - radius: 10px;
    transition: all 0.2s cubic - bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
    font - family: -apple - system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans - serif;
}

        .smarthirex - btn - secondary {
    background: #ffffff;
    color: #475569;
    border: 1.5px solid #e2e8f0;
}

        .smarthirex - btn - secondary:hover {
    background: #f8fafc;
    border - color: #cbd5e1;
    transform: translateY(-1px);
    box - shadow: 0 4px 8px rgba(0, 0, 0, 0.04);
}

        .smarthirex - btn - primary {
    background: linear - gradient(135deg, #8B5CF6 0 %, #6366F1 100 %);
    color: white;
    border: none;
    box - shadow:
    0 0 0 1px rgba(139, 92, 246, 0.1),
        0 4px 12px rgba(139, 92, 246, 0.25);
}

        .smarthirex - btn - primary:hover {
    background: linear - gradient(135deg, #7c3aed 0 %, #4f46e5 100 %);
    box - shadow:
    0 0 0 1px rgba(139, 92, 246, 0.2),
        0 8px 20px rgba(139, 92, 246, 0.35);
    transform: translateY(-1px);
}

        /* Preview Modal Specific Styles */
        .smarthirex - preview - dialog {
    background: linear - gradient(180deg, #ffffff 0 %, #fafbfc 100 %);
    border - radius: 20px;
    width: 100 %;
    max - width: 800px;
    max - height: 90vh;
    overflow: hidden;
    box - shadow:
    0 0 0 1px rgba(15, 23, 42, 0.05),
        0 20px 25px - 5px rgba(15, 23, 42, 0.1),
            0 40px 60px - 15px rgba(15, 23, 42, 0.25);
    animation: smarthirex - slideUp 0.4s cubic - bezier(0.16, 1, 0.3, 1);
    position: relative;
}

        .smarthirex - preview - dialog::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear - gradient(90deg, #8B5CF6 0 %, #6366F1 50 %, #8B5CF6 100 %);
    background - size: 200 % 100 %;
    animation: smarthirex - shimmer 3s linear infinite;
}

        .smarthirex - preview - dialog.smarthirex - dialog - header::before {
    content: '👀';
}

        .smarthirex - stats - summary {
    background: rgba(139, 92, 246, 0.05);
    padding: 12px 16px;
    border - radius: 10px;
    border: 1px solid rgba(139, 92, 246, 0.1);
}

        .smarthirex - stats - summary.stat - item {
    display: flex;
    align - items: center;
    gap: 6px;
}

        .smarthirex - stats - summary.stat - label {
    font - size: 13px;
    color: #64748b;
    font - weight: 500;
}

        .smarthirex - stats - summary.stat - value {
    font - size: 15px;
    font - weight: 700;
    color: #0f172a;
}

        .smarthirex - confidence - summary {
    display: flex;
    align - items: center;
    gap: 8px;
}

        .confidence - badge {
    display: inline - flex;
    align - items: center;
    padding: 4px 10px;
    border - radius: 6px;
    font - size: 11px;
    font - weight: 600;
    text - transform: uppercase;
    letter - spacing: 0.5px;
}

        .confidence - badge.high {
    background: #d1fae5;
    color: #065f46;
    border: 1px solid #10b981;
}

        .confidence - badge.medium {
    background: #fef3c7;
    color: #92400e;
    border: 1px solid #f59e0b;
}

        .confidence - badge.low {
    background: #fee2e2;
    color: #991b1b;
    border: 1px solid #ef4444;
}

        /* Table Styles */
        .smarthirex - mappings - table {
    background: white;
    border - radius: 10px;
    border: 1px solid #e2e8f0;
    overflow: hidden;
}

        .smarthirex - mappings - table.table - header {
    display: grid;
    grid - template - columns: 40px 1fr 2fr 100px;
    gap: 12px;
    padding: 14px 16px;
    background: #f8fafc;
    border - bottom: 2px solid #e2e8f0;
    font - size: 12px;
    font - weight: 700;
    color: #475569;
    text - transform: uppercase;
    letter - spacing: 0.5px;
}

        .smarthirex - mappings - table.table - body {
    max - height: 400px;
    overflow - y: auto;
}

        .smarthirex - mappings - table.table - body:: -webkit - scrollbar {
    width: 6px;
}

        .smarthirex - mappings - table.table - body:: -webkit - scrollbar - thumb {
    background: #cbd5e1;
    border - radius: 3px;
}

        .smarthirex - mappings - table.table - row {
    display: grid;
    grid - template - columns: 40px 1fr 2fr 100px;
    gap: 12px;
    padding: 12px 16px;
    border - bottom: 1px solid #f1f5f9;
    transition: background 0.15s;
}

        .smarthirex - mappings - table.table - row:hover {
    background: #fafbfc;
}

        .smarthirex - mappings - table.table - row: last - child {
    border - bottom: none;
}

        .td - checkbox,
        .th - checkbox {
    display: flex;
    align - items: center;
    justify - content: center;
}

        .td - checkbox input[type = "checkbox"],
        .th - checkbox input[type = "checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent - color: #8B5CF6;
}

        .td - field {
    display: flex;
    align - items: center;
    gap: 8px;
    font - size: 14px;
    color: #0f172a;
}

        .field - icon {
    font - size: 18px;
}

        .field - label {
    font - weight: 500;
}

        .required - badge {
    color: #ef4444;
    font - weight: 700;
    font - size: 16px;
}

        .td - value {
    display: flex;
    align - items: center;
}

        .value - input {
    width: 100 %;
    padding: 8px 12px;
    border: 1.5px solid #e2e8f0;
    border - radius: 8px;
    font - size: 13px;
    font - family: -apple - system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans - serif;
    transition: all 0.2s;
}

        .value - input:focus {
    outline: none;
    border - color: #8B5CF6;
    box - shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
}

        .manual - upload - text {
    font - size: 13px;
    color: #64748b;
    font - style: italic;
}

        .td - confidence {
    display: flex;
    align - items: center;
    justify - content: center;
}

/* Mobile Responsive */
@media(max - width: 768px) {
            .smarthirex - preview - dialog {
        max - width: 100 %;
        margin: 0;
        border - radius: 20px 20px 0 0;
        max - height: 95vh;
    }

            .smarthirex - mappings - table.table - header,
            .smarthirex - mappings - table.table - row {
        grid - template - columns: 30px 1fr 80px;
        gap: 8px;
    }

            .th - value,
            .td - value {
        display: none;
    }

            .smarthirex - dialog - header {
        padding: 24px 20px 20px 20px;
    }

            .smarthirex - dialog - header h3,
            .smarthirex - dialog - header p {
        margin - left: 36px;
    }

            .smarthirex - dialog - content {
        padding: 16px;
    }

            .smarthirex - dialog - footer {
        padding: 16px 20px 24px 20px;
        flex - direction: column;
    }

            .smarthirex - btn {
        width: 100 %;
    }
}

        /* File Upload Field Highlighting */
        .smarthirex - file - upload - highlight {
    animation: smarthirex - file - pulse 2s infinite!important;
    border: 3px solid #8B5CF6!important;
    border - radius: 8px!important;
    box - shadow: 0 0 0 4px rgba(139, 92, 246, 0.2)!important;
}

@keyframes smarthirex - file - pulse {
    0 %, 100 % {
        box- shadow: 0 0 0 0 rgba(139, 92, 246, 0.7);
    border - color: #8B5CF6;
}
50 % {
    box- shadow: 0 0 0 12px rgba(139, 92, 246, 0);
border - color: #a78bfa;
            }
        }

        .smarthirex - file - upload - overlay {
    position: absolute;
    z - index: 999998;
    pointer - events: none;
    transition: opacity 0.3s ease;
}

        .smarthirex - file - upload - indicator {
    background: linear - gradient(135deg, #8B5CF6 0 %, #6366F1 100 %);
    color: white;
    padding: 16px 24px;
    border - radius: 12px;
    box - shadow:
    0 0 0 1px rgba(139, 92, 246, 0.3),
        0 10px 25px rgba(139, 92, 246, 0.4),
            0 4px 8px rgba(0, 0, 0, 0.1);
    display: flex;
    flex - direction: column;
    align - items: center;
    gap: 8px;
    animation: smarthirex - indicator - bounce 2s ease -in -out infinite;
}

@keyframes smarthirex - indicator - bounce {
    0 %, 100 % {
        transform: translateY(0);
    }
    50 % {
        transform: translateY(-8px);
    }
}

        .smarthirex - file - upload - indicator.icon {
    font - size: 32px;
    animation: smarthirex - icon - pulse 1.5s ease -in -out infinite;
}

@keyframes smarthirex - icon - pulse {
    0 %, 100 % {
        transform: scale(1);
    }
    50 % {
        transform: scale(1.1);
    }
}

        .smarthirex - file - upload - indicator.message {
    font - size: 15px;
    font - weight: 700;
    text - align: center;
    letter - spacing: -0.01em;
    text - shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

        .smarthirex - file - upload - indicator.hint {
    font - size: 12px;
    opacity: 0.9;
    font - weight: 500;
    text - align: center;
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
    < h3 > Additional Information Needed</h3 >
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
            fieldLabel.setAttribute('for', `smarthirex - field - ${fieldPurpose} `);

            let input;
            if (fieldType === 'textarea' || fieldPurpose.includes('letter') || fieldPurpose.includes('why')) {
                input = document.createElement('textarea');
                input.rows = 4;
            } else {
                input = document.createElement('input');
                input.type = fieldType === 'email' ? 'email' : 'text';
            }

            input.id = `smarthirex - field - ${fieldPurpose} `;
            input.name = fieldPurpose;
            input.placeholder = `Enter ${label || fieldPurpose} `;
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
    < label class="premium-radio-option" >
        <input type="radio" name="preview-${fieldInfo.selector}" value="${escapeValue(optValue)}" ${isChecked ? 'checked' : ''}>
            <span class="radio-label">${optLabel}</span>
        </label>
`;
                }).join('');
                return `< div class="premium-radio-group" > ${radioOptions}</div > `;
            }
            return `< input type = "text" class="value-input" value = "${escapeValue(value)}" ${lowConfidenceStyle}> `;

        case 'checkbox':
            const isChecked = value === true || value === 'true' || value === '1' || value === 'yes' || value === 'on';
            return `
    < label class="premium-checkbox" >
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
                    return `< option value = "${escapeValue(optValue)}" ${isSelected ? 'selected' : ''}> ${optLabel}</option > `;
                }).join('');
                return `
    < select class="premium-select value-input" ${lowConfidenceStyle}>
        <option value="">Select...</option>
                        ${selectOptions}
                    </select >
    `;
            }
            return `< input type = "text" class="value-input" value = "${escapeValue(value)}" ${lowConfidenceStyle}> `;

        case 'date':
        case 'datetime-local':
        case 'time':
        case 'month':
        case 'week':
            return `< input type = "${inputType}" class="premium-date value-input" value = "${escapeValue(value)}" ${lowConfidenceStyle}> `;

        case 'number':
        case 'range':
            return `< input type = "number" class="premium-number value-input" value = "${escapeValue(value)}" ${lowConfidenceStyle}> `;

        case 'textarea':
            return `< textarea class="premium-textarea value-input" rows = "2" ${lowConfidenceStyle}> ${escapeValue(value)}</textarea > `;

        case 'email':
        case 'tel':
        case 'url':
            return `< input type = "${inputType}" class="value-input" value = "${escapeValue(value)}" ${lowConfidenceStyle} placeholder = "${inputType === 'email' ? 'name@example.com' : ''}" > `;

        default:
            return `< input type = "text" class="value-input" value = "${escapeValue(value)}" ${lowConfidenceStyle}> `;
    }
}

