/**
 * Highlight unfilled fields with premium indicators (Google/Notion style)
 * Shows visual cue for fields that need manual attention
 */
function highlightUnfilledFields() {
    // Find all visible form fields
    const allFields = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');

    allFields.forEach(field => {
        // Skip if field already has a value or is disabled
        if (field.value || field.disabled || !isFieldVisible(field)) {
            return;
        }

        // Skip if already highlighted
        if (field.dataset.smarthirexUnfilled) {
            return;
        }

        // Mark as unfilled
        field.dataset.smarthirexUnfilled = 'true';

        // Add premium styling
        field.style.position = 'relative';
        field.style.borderColor = '#f59e0b';
        field.style.borderWidth = '2px';
        field.style.borderStyle = 'solid';
        field.style.boxShadow = '0 0 0 3px rgba(245, 158, 11, 0.1)';

        // Create premium indicator icon
        const indicator = document.createElement('div');
        indicator.className = 'smarthirex-unfilled-indicator';
        indicator.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="#f59e0b"/>
            </svg>
            <span class="tooltip">Click to fill manually</span>
        `;

        // Position indicator relative to field
        const rect = field.getBoundingClientRect();
        indicator.style.cssText = `
            position: absolute;
            top: ${rect.top + window.scrollY}px;
            left: ${rect.left + rect.width - 25}px;
            z-index: 999998;
            pointer-events: none;
            animation: smarthirex-pulse-unfilled 2s ease-in-out infinite;
        `;

        document.body.appendChild(indicator);

        // Store reference for cleanup
        field.dataset.smarthirexIndicator = 'active';

        // Smooth scroll into view (one by one with delay)
        const index = Array.from(allFields).indexOf(field);
        setTimeout(() => {
            field.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, index * 300);

        // Remove indicator when user starts typing
        const removeIndicator = () => {
            if (field.value) {
                field.style.borderColor = '';
                field.style.borderWidth = '';
                field.style.boxShadow = '';
                delete field.dataset.smarthirexUnfilled;
                delete field.dataset.smarthirexIndicator;
                const indicators = document.querySelectorAll('.smarthirex-unfilled-indicator');
                indicators.forEach(ind => ind.remove());
            }
        };

        field.addEventListener('input', removeIndicator);
        field.addEventListener('change', removeIndicator);
    });
}

// Inject CSS for unfilled field indicators
function injectUnfilledFieldStyles() {
    if (document.getElementById('smarthirex-unfilled-styles')) return;

    const style = document.createElement('style');
    style.id = 'smarthirex-unfilled-styles';
    style.textContent = `
        .smarthirex-unfilled-indicator {
            display: flex;
            align-items: center;
            gap: 8px;
            background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
            color: white;
            padding: 8px 12px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
            font-size: 13px;
            font-weight: 600;
        }
        
        .smarthirex-unfilled-indicator .tooltip {
            white-space: nowrap;
        }
        
        @keyframes smarthirex-pulse-unfilled {
            0%, 100% {
                transform: scale(1);
                box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
            }
            50% {
                transform: scale(1.05);
                box-shadow: 0 6px 16px rgba(245, 158, 11, 0.4);
            }
        }
        
        /* Mobile responsive */
        @media (max-width: 768px) {
            .smarthirex-unfilled-indicator {
                font-size: 11px;
                padding: 6px 10px;
            }
            
            .smarthirex-unfilled-indicator svg {
                width: 16px;
                height: 16px;
            }
        }
    `;

    document.head.appendChild(style);
}
