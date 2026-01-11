/**
 * AIHandler
 * Handles fields requiring AI processing (wraps BatchProcessor)
 */
class AIHandler {
    constructor() {
        this.name = 'ai';
    }

    async handle(fields, context) {
        const results = {};
        const { resumeData, smartMemory, callbacks } = context;

        if (!window.BatchProcessor) {
            console.warn('[AIHandler] BatchProcessor not available');
            return results;
        }

        if (fields.length === 0) return results;

        console.log(`[AIHandler] Sending ${fields.length} fields to AI processing`);

        // BatchProcessor.processFieldsInBatches(fields, resumeData, smartMemory, callbacks)
        // returns { [selector]: { value, confidence, source } }

        try {
            const aiResults = await window.BatchProcessor.processFieldsInBatches(
                fields,
                resumeData,
                smartMemory,
                callbacks
            );

            Object.assign(results, aiResults);
        } catch (error) {
            console.error('[AIHandler] Error in batch processing:', error);
        }

        return results;
    }
}

if (typeof window !== 'undefined') {
    window.AIHandler = AIHandler;
}
