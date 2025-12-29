// COMPLETE REPLACEMENT FOR highlightUnfilledFields() 
// Use the SAME pattern as highlightFileFields() - IT WORKS!

function highlightUnfilledFields() {
    console.log('🎯 Highlighting unfilled fields...');

    // Find all unfilled fields
    const allFields = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea');
    const unfilledFields = [];

    allFields.forEach(field => {
        if (field.value && field.value.trim() !== '') return;
        if (field.disabled) return;
        if (!isFieldVisible(field)) return;

        unfilledFields.push(field);
    });

    console.log(`Found ${unfilledFields.length} unfilled fields`);

    // Highlight each unfilled field (SAME AS FILE UPLOAD)
    unfilledFields.forEach((field, index) => {
        // Add pulsing border class
        field.classList.add('smarthirex-unfilled-highlight');

        // Create overlay with instructions
        const overlay = document.createElement('div');
        overlay.className = 'smarthirex-unfilled-overlay';
        overlay.innerHTML = `
            <div class="smarthirex-unfilled-indicator">
                <div class="icon">✍️</div>
                <div class="message">Please fill this field</div>
            </div>
        `;

        // Position overlay near the field
        const rect = field.getBound ingClientRect();
        overlay.style.position = 'absolute';
        overlay.style.left = `${rect.left + window.scrollX}px`;
        overlay.style.top = `${rect.top + window.scrollY - 60}px`;
        overlay.style.zIndex = '999998';

        document.body.appendChild(overlay);

        // Scroll to first unfilled field
        if (index === 0) {
            setTimeout(() => {
                field.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 500);
        }

        // Remove overlay after 10 seconds
        const removeOverlay = () => {
            overlay.style.opacity = '0';
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.remove();
                }
            }, 300);
        };

        setTimeout(removeOverlay, 10000);

        // Remove highlight when field is filled
        field.addEventListener('input', () => {
            if (field.value) {
                field.classList.remove('smarthirex-unfilled-highlight');
                if (overlay.parentNode) {
                    overlay.remove();
                }
            }
        }, { once: true });
    });
}
