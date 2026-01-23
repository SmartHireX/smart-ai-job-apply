/**
 * Show a processing widget with batch dots
 * @param {string} text - Status text
 * @param {number} step - Current step (1-3)
 * @param {Object} batchInfo - Optional batch info { currentBatch, totalBatches }
 */
function showProcessingWidget(text, step, batchInfo = null) {
    const panels = document.querySelectorAll('.smarthirex-panel');
    const panel = panels[panels.length - 1] || document.getElementById('smarthirex-accordion-sidebar');

    if (!panel) return;

    // 1. Get or Create Widget Wrapper
    let widget = panel.querySelector('.processing-widget');
    if (!widget) {
        widget = document.createElement('div');
        widget.className = 'processing-widget';
        widget.style.cssText = `
            margin: 12px 16px;
            padding: 12px;
            background: rgba(99, 102, 241, 0.08);
            border-radius: 8px;
            border: 1px solid rgba(99, 102, 241, 0.2);
            display: flex;
            flex-direction: column;
            gap: 8px;
            animation: fadeIn 0.3s ease;
        `;

        // Insert after header
        const header = panel.querySelector('.sh-nova-9x-sidebar-header');
        if (header && header.nextSibling) {
            panel.insertBefore(widget, header.nextSibling);
        } else {
            panel.appendChild(widget);
        }

        // Structure: Label Row + Dots Row
        widget.innerHTML = `
            <div class="pw-label-row" style="display: flex; align-items: center; gap: 10px;">
                <div class="loader-spinner" style="
                    width: 16px; 
                    height: 16px; 
                    border: 2px solid #6366f1; 
                    border-top-color: transparent; 
                    border-radius: 50%; 
                    animation: spin 1s linear infinite;
                "></div>
                <span class="pw-text" style="font-size: 13px; color: #4b5563; font-weight: 500;">Initializing...</span>
            </div>
            <div class="pw-dots-row" style="display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 4px; min-height: 8px;"></div>
            <style>
                @keyframes pulseDot {
                    0% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
                    70% { transform: scale(1.4); opacity: 0.7; box-shadow: 0 0 0 4px rgba(99, 102, 241, 0); }
                    100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
                }
            </style>
        `;
    }

    // 2. Update Text
    const textSpan = widget.querySelector('.pw-text');
    if (textSpan) textSpan.textContent = text;

    // 2.5 Ensure Progress Bar Exists
    let progressContainer = widget.querySelector('.pw-progress-container');
    if (!progressContainer) {
        const pContainer = document.createElement('div');
        pContainer.className = 'pw-progress-container';
        pContainer.style.cssText = `
            width: 100%;
            height: 4px;
            background: rgba(99, 102, 241, 0.1);
            border-radius: 2px;
            margin-top: 8px;
            overflow: hidden;
            position: relative;
        `;

        const pBar = document.createElement('div');
        pBar.className = 'pw-progress-bar';
        pBar.style.cssText = `
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, #6366f1, #8b5cf6);
            border-radius: 2px;
            transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 0 8px rgba(99, 102, 241, 0.4);
        `;

        pContainer.appendChild(pBar);
        widget.appendChild(pContainer);
    }

    // 3. Update Dots (Only if batchInfo provided)
    if (batchInfo && batchInfo.totalBatches > 1) {
        const dotsContainer = widget.querySelector('.pw-dots-row');
        if (dotsContainer) {
            const { currentBatch, totalBatches } = batchInfo;
            const dots = [];

            for (let i = 1; i <= totalBatches; i++) {
                let stateClass = 'dot-pending';
                if (i < currentBatch) stateClass = 'dot-completed';
                else if (i === currentBatch) stateClass = 'dot-active';

                const pulseStyle = (i === currentBatch) ? 'animation: pulseDot 1.5s infinite;' : '';
                const colors = {
                    'dot-pending': '#e2e8f0',
                    'dot-active': '#6366f1',
                    'dot-completed': '#10b981'
                };

                dots.push(`
                     <div class="batch-dot ${stateClass}" title="Batch ${i}" style="
                         width: 8px; 
                         height: 8px; 
                         border-radius: 50%; 
                         background-color: ${colors[stateClass]};
                         transition: all 0.3s ease;
                         ${pulseStyle}
                     "></div>
                 `);
            }
            dotsContainer.innerHTML = dots.join('');
            dotsContainer.style.display = 'flex'; // Ensure visible
        }
    }
}

/**
 * Update the progress bar percentage
 * @param {number} percent - 0 to 100
 */
function updateProcessingProgress(percent) {
    const panels = document.querySelectorAll('.smarthirex-panel');
    const panel = panels[panels.length - 1] || document.getElementById('smarthirex-accordion-sidebar');
    if (!panel) return;

    const bar = panel.querySelector('.pw-progress-bar');
    if (bar) {
        bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    }
}

// Export validation
if (typeof window !== 'undefined') {
    window.showProcessingWidget = showProcessingWidget;
    window.updateProcessingProgress = updateProcessingProgress;
}
