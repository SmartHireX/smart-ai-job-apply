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
            ${unfilledFields.map((item, i) => `
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
                z-index: 999999;
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
            const targetField = unfilledFields[i].field;
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
