/**
 * ai-regeneration.js
 * AI-powered field regeneration on demand
 */


/**
 * AI Regeneration
 * Handles on-demand AI-powered field value regeneration
 */
class AIRegeneration {
    /**
     * Regenerate a field value using AI
     * @param {string} selector - CSS selector for the field
     * @param {string} label - Field label
     * @param {string} customInstruction - Optional custom instruction
     * @returns {Promise<Object>} Result object
     */
    static async regenerate(selector, label, customInstruction = '') {
        const element = document.querySelector(selector);

        if (!element) {
            const error = 'Field not found';
            if (typeof window.showErrorToast === 'function') {
                window.showErrorToast(error);
            }
            return { success: false, error };
        }

        // Show processing indicator
        if (typeof window.showProcessingWidget === 'function') {
            window.showProcessingWidget('AI Generating...', 1);
        }

        try {
            // Build AI prompt
            const prompt = this.buildPrompt(label, customInstruction);

            // Call AI
            const result = await this.callAI(prompt);

            if (!result.success || !result.text) {
                throw new Error(result.error || 'AI generation failed');
            }

            // Apply new value
            const newValue = result.text.trim();
            FieldUtils.setNativeValue(element, newValue);
            FieldUtils.dispatchChangeEvents(element);

            // Cache result if it's a text field
            await this.cacheResult(element, label, newValue);

            // Visual feedback
            this.showSuccess(element);

            // Remove processing indicator
            if (typeof window.removeProcessingWidget === 'function') {
                window.removeProcessingWidget();
            }

            return {
                success: true,
                value: newValue
            };

        } catch (error) {
            console.error('Regeneration error:', error);

            if (typeof window.showErrorToast === 'function') {
                window.showErrorToast(`Regeneration failed: ${error.message}`);
            }

            if (typeof window.removeProcessingWidget === 'function') {
                window.removeProcessingWidget();
            }

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Build AI prompt for field regeneration
     * @param {string} label - Field label
     * @param {string} customInstruction - Custom instruction
     * @returns {string} AI prompt
     */
    static buildPrompt(label, customInstruction) {
        // Get job context if available
        let jobContext = '';
        if (typeof window.getJobContext === 'function') {
            const fullContext = window.getJobContext();
            jobContext = fullContext.substring(0, AI_CONFIG.CONTEXT_LENGTH);
        }

        let prompt = `You are filling a job application form field.\nField Label: "${label}"\n`;

        if (jobContext) {
            prompt += `Job Context: ${jobContext}\n`;
        }

        prompt += `Generate an appropriate, professional answer for this field.`;

        if (customInstruction) {
            prompt += `\n\nCustom Instructions: ${customInstruction}`;
        }

        prompt += `\n\nProvide ONLY the answer text, nothing else.`;

        return prompt;
    }

    /**
     * Call AI service
     * @param {string} prompt - AI prompt
     * @returns {Promise<Object>} AI response
     */
    static async callAI(prompt) {
        if (!window.AIClient) {
            throw new Error('AI Client not available');
        }

        return await window.AIClient.callAI(
            prompt,
            '',
            {
                maxTokens: AI_CONFIG.MAX_TOKENS,
                temperature: AI_CONFIG.TEMPERATURE
            }
        );
    }

    /**
     * Cache regenerated value
     * @param {HTMLElement} element - Field element
     * @param {string} label - Field label
     * @param {string} value - Generated value
     * @returns {Promise<void>}
     */
    static async cacheResult(element, label, value) {
        const fieldType = FieldUtils.getFieldType(element);
        const isTextType = TEXT_FIELD_TYPES.has(fieldType) ||
            element.tagName === 'TEXTAREA';

        if (isTextType) {
            // CENTRALIZED: Use cache_label as authoritative key
            let cacheLabel = element.getAttribute('cache_label');
            if (!cacheLabel && window.NovaCache) {
                cacheLabel = window.NovaCache[element.id] || window.NovaCache[element.name];
            }
            const key = cacheLabel || (window.GlobalMemory ? window.GlobalMemory.normalizeKey(label) : label);

            if (window.GlobalMemory) {
                const cacheEntry = window.GlobalMemory.createCacheEntry(value);
                await window.GlobalMemory.updateCache({
                    [key]: cacheEntry
                });
            }

            // console.log(`🧠 [SmartMemory] Cached regenerated value for "${label}"`);
        }
    }

    /**
     * Show success visual feedback
     * @param {HTMLElement} element - Field element
     */
    static showSuccess(element) {
        // Add typing animation class
        element.classList.add('smarthirex-typing');

        setTimeout(() => {
            element.classList.remove('smarthirex-typing');
        }, 1000);

        // Show success toast
        if (typeof window.showSuccessToast === 'function') {
            window.showSuccessToast('Field regenerated! 🎉');
        }
    }

    /**
     * Regenerate multiple fields
     * @param {Array<Object>} fields - Array of {selector, label, instruction}
     * @returns {Promise<Array>} Array of results
     */
    static async regenerateMultiple(fields) {
        const results = [];

        for (const field of fields) {
            const result = await this.regenerate(
                field.selector,
                field.label,
                field.instruction || ''
            );
            results.push(result);

            // Small delay between regenerations
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        return results;
    }
}

// Global export for backward compatibility
window.regenerateFieldWithAI = AIRegeneration.regenerate.bind(AIRegeneration);

// Export for module usage
const {
    regenerate,
    regenerateMultiple
} = AIRegeneration;
