/**
 * AIHandler
 * Handles fields requiring AI processing (wraps BatchProcessor)
 * Features:
 * - Copilot Mode: Generates answers for "Why us?" textareas using Job/Resume context.
 * - Circuit Breaker: Fails fast after N errors.
 */
class AIHandler extends window.Handler {
    constructor() {
        super('ai');
        this.errorCount = 0;
        this.CIRCUIT_THRESHOLD = 3;
    }

    async handle(fields, context) {
        const results = {};
        const { resumeData, smartMemory, callbacks } = context;

        // Circuit Breaker Check
        if (this.errorCount >= this.CIRCUIT_THRESHOLD) {
            console.warn(`[AIHandler] Circuit Breaker Open! Skipping ${fields.length} fields.`);
            return results;
        }

        if (!window.BatchProcessor) {
            console.warn('[AIHandler] BatchProcessor not available');
            return results;
        }

        console.log(`[AIHandler] Processing ${fields.length} fields with Copilot/Batch`);

        // Separate "Copilot" Candidates (Texareas asking open-ended Qs)
        const copilotFields = fields.filter(f => f.tagName === 'TEXTAREA' || (f.type === 'text' && f.maxLength > 100));
        const standardFields = fields.filter(f => !copilotFields.includes(f));

        // 1. Process Standard Fields via BatchProcessor
        if (standardFields.length > 0) {
            try {
                const batchRes = await window.BatchProcessor.processFieldsInBatches(
                    standardFields,
                    resumeData,
                    smartMemory,
                    callbacks
                );
                Object.assign(results, batchRes);
                // Reset circuit on success
                this.errorCount = 0;
            } catch (error) {
                console.error('[AIHandler] Batch Error:', error);
                this.errorCount++;
            }
        }

        // 2. Process Copilot Fields (Individually or special batch)
        // These need richer context (Job Desc)
        if (copilotFields.length > 0) {
            for (const field of copilotFields) {
                try {
                    const answer = await this.generateCopilotAnswer(field, context);
                    if (answer) {
                        results[field.selector] = {
                            value: answer,
                            confidence: 0.85,
                            source: 'ai_copilot',
                            trace: this.createTrace('copilot_gen', 0.85)
                        };
                    }
                } catch (e) {
                    console.warn(`[AIHandler] Copilot failed for ${field.name}:`, e);
                }
            }
        }

        return results;
    }

    async generateCopilotAnswer(field, context) {
        // "Why do you want to work at [Company]?"
        // Construct prompt using Resume + Job Description
        // For now, delegate to existing BatchProcessor logic but flag as "High Context"
        // or call a specialized method if available. 
        // We'll reuse BatchProcessor for now as it has context building.

        // Simulating "Copilot" logic via single-item batch with specific instruction
        const batch = [field];
        const res = await window.BatchProcessor.processFieldsInBatches(batch, context.resumeData, context.smartMemory, context.callbacks);
        return res[field.selector]?.value;
    }
}

if (typeof window !== 'undefined') {
    window.AIHandler = AIHandler;
}
