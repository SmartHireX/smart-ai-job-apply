/**
 * Premium input renderer for preview modal - renders actual input types instead of text
 * FANG-level UI quality
 */
function renderPremiumInput(fieldInfo, value, confidence) {
    const inputType = fieldInfo.type || 'text';
    const escapeValue = (val) => (val || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lowConfidenceStyle = confidence >= 0.9 ? '' : 'style="background: #fef3c7;"';

    switch (inputType) {
        case 'radio':
            // For radio buttons, show all options
            if (fieldInfo.options && fieldInfo.options.length > 0) {
                const radioOptions = fieldInfo.options.map(opt => {
                    const isChecked = opt === value || opt.value === value;
                    return `
                        <label class="premium-radio-option">
                            <input type="radio" name="preview-${fieldInfo.selector}" value="${escapeValue(opt.value || opt)}" ${isChecked ? 'checked' : ''}>
                            <span class="radio-label">${opt.label || opt}</span>
                        </label>
                    `;
                }).join('');
                return `<div class="premium-radio-group">${radioOptions}</div>`;
            }
            return `<input type="text" class="value-input" value="${escapeValue(value)}" ${lowConfidenceStyle}>`;

        case 'checkbox':
            const isChecked = value === true || value === 'true' || value === '1' || value === 'yes';
            return `
                <label class="premium-checkbox">
                    <input type="checkbox" class="value-checkbox" ${isChecked ? 'checked' : ''}>
                    <span class="checkbox-label">${isChecked ? 'Yes' : 'No'}</span>
                </label>
            `;

        case 'select':
            if (fieldInfo.options && fieldInfo.options.length > 0) {
                const selectOptions = fieldInfo.options.map(opt => {
                    const optValue = opt.value || opt;
                    const optLabel = opt.label || opt;
                    const isSelected = optValue === value;
                    return `<option value="${escapeValue(optValue)}" ${isSelected ? 'selected' : ''}>${optLabel}</option>`;
                }).join('');
                return `
                    <select class="premium-select value-input" ${lowConfidenceStyle}>
                        <option value="">Select...</option>
                        ${selectOptions}
                    </select>
                `;
            }
            return `<input type="text" class="value-input" value="${escapeValue(value)}" ${lowConfidenceStyle}>`;

        case 'date':
        case 'datetime-local':
        case 'time':
        case 'month':
        case 'week':
            return `<input type="${inputType}" class="premium-date value-input" value="${escapeValue(value)}" ${lowConfidenceStyle}>`;

        case 'number':
        case 'range':
            return `<input type="number" class="premium-number value-input" value="${escapeValue(value)}" ${lowConfidenceStyle}>`;

        case 'textarea':
            return `<textarea class="premium-textarea value-input" rows="2" ${lowConfidenceStyle}>${escapeValue(value)}</textarea>`;

        case 'email':
        case 'tel':
        case 'url':
            return `<input type="${inputType}" class="value-input" value="${escapeValue(value)}" ${lowConfidenceStyle} placeholder="${inputType === 'email' ? 'name@example.com' : ''}">`;

        default:
            return `<input type="text" class="value-input" value="${escapeValue(value)}" ${lowConfidenceStyle}>`;
    }
}
