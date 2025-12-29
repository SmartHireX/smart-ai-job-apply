// PASTE THIS TO REPLACE highlightUnfilledFields function in content.js (lines 656-680)

function highlightUnfilledFields() {
    console.log('🎯 Checking unfilled fields...');

    // Remove existing badge
    const old = document.getElementById('smarthirex-unfilled-badge');
    if (old) old.remove();

    // Find unfilled fields
    const all = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea');
    const unfilled = [];

    all.forEach(f => {
        if (f.value && f.value.trim()) return;
        if (f.disabled) return;
        if (!isFieldVisible(f)) return;

        let label = 'Field';
        if (f.labels && f.labels[0]) label = f.labels[0].textContent.trim();
        else if (f.placeholder) label = f.placeholder;
        else if (f.name) label = f.name;

        unfilled.push({ field: f, label });
    });

    console.log(`Found ${unfilled.length} unfilled fields`);
    if (unfilled.length === 0) return;

    // Create badge
    const badge = document.createElement('div');
    badge.id = 'smarthirex-unfilled-badge';
    badge.style.cssText = 'position:fixed;bottom:24px;right:24px;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:white;border-radius:16px;box-shadow:0 8px 24px rgba(245,158,11,0.4);z-index:999999;max-width:320px;font-family:system-ui;animation:slideIn 0.4s ease-out';

    badge.innerHTML = `
        <div style="padding:16px;border-bottom:1px solid rgba(255,255,255,0.2);display:flex;align-items:center;gap:10px">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
            <span style="background:rgba(255,255,255,0.3);padding:4px 12px;border-radius:12px;font-weight:700">${unfilled.length}</span>
            <span style="flex:1;font-weight:600;font-size:14px">field${unfilled.length > 1 ? 's' : ''} need attention</span>
            <button onclick="this.parentElement.parentElement.remove()" style="background:transparent;border:none;color:white;font-size:24px;cursor:pointer;padding:0 4px">×</button>
        </div>
        <div style="padding:8px;max-height:300px;overflow-y:auto">
            ${unfilled.map((item, i) => `
                <div class="uf-item" data-idx="${i}" style="padding:12px;background:rgba(255,255,255,0.15);border-radius:8px;margin-bottom:6px;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;gap:8px">
                    <span style="flex:1;font-size:13px;font-weight:500">${item.label}</span>
                    <span style="background:rgba(255,255,255,0.3);padding:6px 10px;border-radius:6px">→</span>
                </div>
            `).join('')}
        </div>
    `;

    document.body.appendChild(badge);

    // Add CSS
    if (!document.getElementById('uf-css')) {
        const s = document.createElement('style');
        s.id = 'uf-css';
        s.textContent = '@keyframes slideIn{from{transform:translateY(100px);opacity:0}to{transform:translateY(0);opacity:1}}.uf-item:hover{background:rgba(255,255,255,0.25)!important;transform:translateX(-4px)}';
        document.head.appendChild(s);
    }

    // Click handlers
    badge.querySelectorAll('.uf-item').forEach((el, i) => {
        el.onclick = () => {
            const f = unfilled[i].field;
            f.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
                f.focus();
                f.style.borderColor = '#f59e0b';
                f.style.boxShadow = '0 0 0 4px rgba(245,158,11,0.25)';
                setTimeout(() => {
                    f.style.borderColor = '';
                    f.style.boxShadow = '';
                }, 2000);
            }, 500);
        };
    });

    console.log('✅ Badge shown!');
}
