/**
 * Map AI's field_type to NeuralClassifier class labels
 * AI uses field types like 'text', 'email', 'select'
 * Classifier uses semantic labels like 'email', 'phone', 'job_title'
 * @param {string} aiFieldType - The field type from AI mapping
 * @returns {string|null} - Classifier class label or null
 */
function mapAIFieldToClassLabel(aiFieldType) {
    // Direct mappings for semantic types
    const directMap = {
        'email': 'email',
        'phone': 'phone',
        'tel': 'phone',
        'linkedin': 'linkedin',
        'github': 'github',
        'portfolio': 'portfolio',
        'website': 'website'
    };

    if (directMap[aiFieldType]) {
        return directMap[aiFieldType];
    }

    // For generic types (text, textarea, select), we can't reliably infer
    // These need context from the label/name which the classifier already has
    // So we skip training on these to avoid noise
    return null;
}
