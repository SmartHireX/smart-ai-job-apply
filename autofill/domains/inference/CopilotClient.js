/**
 * AIResolver
 * 
 * Handles fields requiring AI processing (wraps BatchProcessor).
 * Located in atomic AI resolver directory.
 * 
 * Features:
 * - Copilot Mode: Generates answers for "Why us?" textareas using Job/Resume context.
 * - Circuit Breaker: Fails fast after N errors.
 */

class CopilotClient extends window.Handler {
    constructor() {
        super('copilot_client');
        this.errorCount = 0;
        this.CIRCUIT_THRESHOLD = 3;
    }

    async handle(fields, context) {
        const results = {};
        const { resumeData, smartMemory, callbacks, aiStatus } = context;

        // Explicit fallback: skip AI when offline (managed state)
        if (aiStatus === 'offline') {
            console.warn('[AIResolver] AI offline. Skipping AI inference.');
            return results;
        }

        // Circuit Breaker Check
        if (this.errorCount >= this.CIRCUIT_THRESHOLD) {
            console.warn(`[AIResolver] Circuit Breaker Open! Skipping ${fields.length} fields.`);
            return results;
        }

        const batchProcessor = window.AIBatchProcessor || window.BatchProcessor;

        if (!batchProcessor) {
            console.warn('[AIResolver] BatchProcessor not available (AIBatchProcessor missing)');
            return results;
        }

        // console.log(`[AIResolver] Processing ${fields.length} fields with Copilot/Batch`);

        // Separate "Copilot" Candidates (Textareas asking open-ended Qs)
        const copilotFields = fields.filter(f => f.tagName === 'TEXTAREA' || (f.type === 'text' && f.maxLength > 100));
        const standardFields = fields.filter(f => !copilotFields.includes(f));

        // 1. Process Standard Fields via BatchProcessor
        if (standardFields.length > 0) {
            try {
                const batchRes = await batchProcessor.processFieldsInBatches(
                    standardFields,
                    resumeData,
                    smartMemory,
                    callbacks
                );
                Object.assign(results, batchRes);
                // Reset circuit on success
                this.errorCount = 0;
            } catch (error) {
                console.error('[AIResolver] Batch Error:', error);
                this.errorCount++;
            }
        }

        // 2. Process Copilot Fields (Individually or special batch)
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
                    console.warn(`[AIResolver] Copilot failed for ${field.name}:`, e);
                }
            }
        }

        return results;
    }

    async generateCopilotAnswer(field, context) {
        // "Why do you want to work at [Company]?"
        // Construct prompt using Resume + Job Description
        // For now, delegate to existing BatchProcessor logic but flag as "High Context"

        // Simulating "Copilot" logic via single-item batch with specific instruction
        const batch = [field];
        const res = await window.BatchProcessor.processFieldsInBatches(batch, context.resumeData, context.smartMemory, context.callbacks);
        return res[field.selector]?.value;
    }
}

if (typeof window !== 'undefined') {
    window.CopilotClient = CopilotClient;
}
