// Drop this code at the very end of content.js or test it in browser console

/**
 * Show floating badge with unfilled fields (Google/Notion style)
 */
function highlightUnfilledFieldsV2() {
    console.log('🎯 Checking for unfilled fields...');

    // Remove existing badge
    const existing = document.getElementById('smarthirex-unfilled-badge');
    if (existing) existing.remove();

    // Find unfilled fields
    const allFields = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea');
    const unfilledFields = [];

    allFields.forEach(field => {
        // Skip if filled, disabled, or hidden
        if (field.value && field.value.trim() !== '') return;
        if (field.disabled) return;
        if (field.offsetParent === null) return; // hidden

        // Get label
        let label = 'Field';
        if (field.labels && field.labels[0]) {
            label = field.labels[0].textContent.trim();
        } else if (field.placeholder) {
            label = field.placeholder;
        } else if (field.name) {
            label = field.name;
        }

        unfilledFields.push({ field, label });
    });

    console.log(`Found ${unfilledFields.length} unfilled fields`);

    if (unfilledFields.length === 0) return;

    // Create floating badge
    const badge = document.createElement('div');
    badge.id = 'smarthirex-unfilled-badge';
    badge.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: linear-gradient(135deg, #fbbf24, #f59e0b);
        color: white;
        border-radius: 16px;
        box-shadow: 0 8px 24px rgba(245, 158, 11, 0.4);
        z-index: 999999;
        max-width: 300px;
        font-family: system-ui, -apple-system, sans-serif;
        animation: slideIn 0.4s ease-out;
    `;

    badge.innerHTML = `
        <div style="padding: 16px; border-bottom: 1px solid rgba(255,255,255,0.2); display: flex; align-items: center; gap: 8px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <span style="background: rgba(255,255,255,0.3); padding: 4px 10px; border-radius: 10px; font-weight: 700;">${unfilledFields.length}</span>
            <span style="flex: 1; font-weight: 600; font-size: 14px;">field${unfilledFields.length > 1 ? 's' : ''} need attention</span>
            <button onclick="this.parentElement.parentElement.remove()" style="background: transparent; border: none; color: white; font-size: 24px; cursor: pointer; padding: 0 4px;">×</button>
        </div>
        <div style="padding: 8px; max-height: 300px; overflow-y: auto;">
            ${unfilledFields.map((item, idx) => `
                <div onclick="document.querySelectorAll('input, select, textarea')[${Array.from(allFields).indexOf(item.field)}].scrollIntoView({behavior: 'smooth', block: 'center'}); document.querySelectorAll('input, select, textarea')[${Array.from(allFields).indexOf(item.field)}].focus();" 
                     style="padding: 12px; background: rgba(255,255,255,0.15); border-radius: 8px; margin-bottom: 6px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px;"
                     onmouseover="this.style.background='rgba(255,255,255,0.25)'; this.style.transform='translateX(-4px)'"
                     onmouseout="this.style.background='rgba(255,255,255,0.15)'; this.style.transform='translateX(0)'">
                    <span style="flex: 1; font-size: 13px;">${item.label}</span>
                    <span style="background: rgba(255,255,255,0.3); padding: 4px 8px; border-radius: 6px; font-size: 12px;">→</span>
                </div>
            `).join('')}
        </div>
    `;

    document.body.appendChild(badge);

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateY(100px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);

    console.log('✅ Unfilled fields badge shown!');
}

// Call this after form fill
setTimeout(() => highlightUnfilledFieldsV2(), 1000);
