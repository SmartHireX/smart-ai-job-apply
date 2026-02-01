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
                        <label class="sh-nova-9x-radio-option">
                            <input type="radio" name="preview-${fieldInfo.selector}" value="${escapeValue(opt.value || opt)}" ${isChecked ? 'checked' : ''}>
                            <span class="sh-nova-9x-radio-label">${opt.label || opt}</span>
                        </label>
                    `;
                }).join('');
                return `<div class="sh-nova-9x-radio-group">${radioOptions}</div>`;
            }
            return `<input type="text" class="sh-nova-9x-value-input" value="${escapeValue(value)}" ${lowConfidenceStyle}>`;

        case 'checkbox':
            const isChecked = value === true || value === 'true' || value === '1' || value === 'yes';
            return `
                <label class="sh-nova-9x-checkbox">
                    <input type="checkbox" class="sh-nova-9x-checkbox" ${isChecked ? 'checked' : ''}>
                    <span class="sh-nova-9x-checkbox-label">${isChecked ? 'Yes' : 'No'}</span>
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
                    <select class="sh-nova-9x-select sh-nova-9x-value-input" ${lowConfidenceStyle}>
                        <option value="">Select...</option>
                        ${selectOptions}
                    </select>
                `;
            }
            return `<input type="text" class="sh-nova-9x-value-input" value="${escapeValue(value)}" ${lowConfidenceStyle}>`;

        case 'date':
        case 'datetime-local':
        case 'time':
        case 'month':
        case 'week':
            return `<input type="${inputType}" class="sh-nova-9x-date sh-nova-9x-value-input" value="${escapeValue(value)}" ${lowConfidenceStyle}>`;

        case 'number':
        case 'range':
            return `<input type="number" class="sh-nova-9x-number sh-nova-9x-value-input" value="${escapeValue(value)}" ${lowConfidenceStyle}>`;

        case 'textarea':
            return `<textarea class="sh-nova-9x-textarea sh-nova-9x-value-input" rows="2" ${lowConfidenceStyle}>${escapeValue(value)}</textarea>`;

        case 'email':
        case 'tel':
        case 'url':
            return `<input type="${inputType}" class="sh-nova-9x-value-input" value="${escapeValue(value)}" ${lowConfidenceStyle} placeholder="${inputType === 'email' ? 'name@example.com' : ''}">`;

        default:
            return `<input type="text" class="sh-nova-9x-value-input" value="${escapeValue(value)}" ${lowConfidenceStyle}>`;
    }
}
