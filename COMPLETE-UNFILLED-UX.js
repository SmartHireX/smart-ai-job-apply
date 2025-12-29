// COMPLETE UNFILLED FIELD INDICATOR - DUAL SYSTEM
// 1. Individual overlays on each field (like file upload)
// 2. Left-side floating panel with total + clickable list

function highlightUnfilledFields() {
    console.log('🎯 SmartHireX: Highlighting unfilled fields...');

    // Find all unfilled fields
    const allFields = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea');
    const unfilledFields = [];

    allFields.forEach(field => {
        if (field.value && field.value.trim() !== '') return;
        if (field.disabled) return;
        if (!isFieldVisible(field)) return;

        // Get label
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

    // ===== PART 1: Individual Overlays on Each Field =====
    unfilledFields.forEach((item, index) => {
        const field = item.field;

        // Add pulsing border
        field.classList.add('smarthirex-unfilled-highlight');

        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'smarthirex-unfilled-overlay';
        overlay.innerHTML = `
            <div class="smarthirex-unfilled-indicator">
                <div class="icon">✍️</div>
                <div class="message">Fill manually</div>
            </div>
        `;

        // Position near field
        const rect = field.getBoundingClientRect();
        overlay.style.position = 'absolute';
        overlay.style.left = `${rect.left + window.scrollX}px`;
        overlay.style.top = `${rect.top + window.scrollY - 60}px`;
        overlay.style.zIndex = '999998';

        document.body.appendChild(overlay);

        // Scroll to first field
        if (index === 0) {
            setTimeout(() => {
                field.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 500);
        }

        // Remove when filled
        field.addEventListener('input', () => {
            if (field.value) {
                field.classList.remove('smarthirex-unfilled-highlight');
                if (overlay.parentNode) overlay.remove();
                updateSidePanelCount();
            }
        }, { once: true });
    });

    // ===== PART 2: Left-Side Floating Panel =====
    const panel = document.createElement('div');
    panel.id = 'smarthirex-unfilled-panel';
    panel.style.cssText = `
        position: fixed;
        left: 24px;
        top: 50%;
        transform: translateY(-50%);
        background: linear-gradient(135deg, #fbbf24, #f59e0b);
        color: white;
        border-radius: 16px;
        box-shadow: 0 8px 24px rgba(245, 158, 11, 0.4);
        z-index: 999999;
        max-width: 280px;
        font-family: system-ui, -apple-system, sans-serif;
        animation: slideInFromLeft 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    panel.innerHTML = `
        <div style="padding: 16px; border-bottom: 1px solid rgba(255,255,255,0.2); display: flex; align-items: center; gap: 10px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <span id="unfilled-count" style="background: rgba(255,255,255,0.3); padding: 4px 12px; border-radius: 12px; font-weight: 700; font-size: 14px;">${unfilledFields.length}</span>
            <span style="flex: 1; font-weight: 600; font-size: 13px;">unfilled</span>
            <button onclick="this.parentElement.parentElement.remove(); document.querySelectorAll('.smarthirex-unfilled-overlay').forEach(el => el.remove())" style="background: transparent; border: none; color: white; font-size: 24px; cursor: pointer; padding: 0 4px; line-height: 1;">×</button>
        </div>
        <div style="padding: 8px; max-height: 400px; overflow-y: auto;">
            ${unfilledFields.map((item, i) => `
                <div class="uf-field-item" data-idx="${i}" style="padding: 10px 12px; background: rgba(255,255,255,0.15); border-radius: 8px; margin-bottom: 6px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px;">
                    <span style="flex: 1; font-size: 12px; font-weight: 500;">${item.label}</span>
                    <span style="background: rgba(255,255,255,0.3); padding: 4px 8px; border-radius: 6px; font-size: 12px;">→</span>
                </div>
            `).join('')}
        </div>
    `;

    document.body.appendChild(panel);

    // Add CSS if not present
    if (!document.getElementById('unfilled-styles')) {
        const style = document.createElement('style');
        style.id = 'unfilled-styles';
        style.textContent = `
            @keyframes slideInFromLeft {
                from { transform: translateY(-50%) translateX(-100px); opacity: 0; }
                to { transform: translateY(-50%) translateX(0); opacity: 1; }
            }
            .uf-field-item:hover {
                background: rgba(255,255,255,0.25) !important;
                transform: translateX(4px);
            }
            .smarthirex-unfilled-highlight {
                outline: 3px solid #F59E0B !important;
                outline-offset: 2px !important;
                animation: pulse-unfilled 2s ease-in-out infinite !important;
            }
            @keyframes pulse-unfilled {
                0%, 100% { outline-color: #F59E0B; }
                50% { outline-color: #fbbf24; }
            }
            .smarthirex-unfilled-overlay {
                opacity: 1;
                transition: opacity 0.3s;
            }
            .smarthirex-unfilled-indicator {
                background: linear-gradient(135deg, #fbbf24, #f59e0b);
                color: white;
                padding: 8px 16px;
                border-radius: 8px;
                display: flex;
                align-items: center;
                gap: 8px;
                box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
                font-size: 13px;
                font-weight: 600;
                animation: float 2s ease-in-out infinite;
            }
            @keyframes float {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-5px); }
            }
        `;
        document.head.appendChild(style);
    }

    // Click handlers for panel items
    panel.querySelectorAll('.uf-field-item').forEach((el, i) => {
        el.onclick = () => {
            const targetField = unfilledFields[i].field;
            targetField.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
                targetField.focus();
                targetField.style.transform = 'scale(1.02)';
                targetField.style.transition = 'transform 0.3s';
                setTimeout(() => {
                    targetField.style.transform = '';
                }, 1000);
            }, 500);
        };
    });

    // Helper to update panel count
    window.updateSidePanelCount = () => {
        const remaining = document.querySelectorAll('.smarthirex-unfilled-highlight').length;
        const countEl = document.getElementById('unfilled-count');
        if (countEl) {
            countEl.textContent = remaining;
            if (remaining === 0) {
                panel.style.animation = 'slideOutToLeft 0.3s ease-out forwards';
                setTimeout(() => panel.remove(), 300);
            }
        }
    };

    // Add slide out animation
    const slideOut = document.createElement('style');
    slideOut.textContent = `
        @keyframes slideOutToLeft {
            to { transform: translateY(-50%) translateX(-100px); opacity: 0; }
        }
    `;
    document.head.appendChild(slideOut);

    console.log('✅ Unfilled field indicators shown!');
}
