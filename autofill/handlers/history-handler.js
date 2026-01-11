/**
 * HistoryHandler
 * Handles indexed work/education fields using HistoryManager
 */
class HistoryHandler {
    constructor() {
        this.name = 'history';
    }

    async handle(fields, context) {
        const results = {};
        const { resumeData } = context;

        // Group by index/type
        // Actually HistoryManager.hydrateBatch handles batch logic nicely
        // But here we might want to leverage it directly

        if (!window.HistoryManager) {
            console.warn('[HistoryHandler] HistoryManager not available');
            return results;
        }

        // We can reuse hydrateBatch from HistoryManager which now supports resume fallback
        // But we need to group fields by "entry" (e.g. Job 1, Job 2)

        // Group fields by Virtual Index (index + type)
        const batches = this.groupFields(fields);

        for (const batch of batches) {
            const index = batch.index;
            // Determine type from fields
            const firstField = batch.fields[0];
            const isWork = /job|employ|work|company|position|title/i.test(firstField.name + ' ' + firstField.label);
            const type = isWork ? 'work' : 'education';

            // Get entity from cache if exists
            let entity = null;
            if (context.smartMemory) {
                // Doing a lookup? No, HistoryManager manages its own entities.
                // We rely on hydrateBatch to find entity or use resume
            }

            // hydrateBatch needs (batch, entity, resumeData, index)
            // It tries to find entity internally if we don't pass it? 
            // Looking at HistoryManager code: hydrateBatch(batch, entity, resumeData, index)
            // It doesn't look up entity if passed null.
            // We need to look up entity first?
            // Actually batch-processor used: window.HistoryManager.findEntity(candidateName)
            // But we don't have candidateName easily here.

            // Simplify: Just pass resumeData fallback. HistoryManager's cache part requires an entity object.
            // For now, let's rely on Resume Fallback primarily if cache is empty.
            // If we want FULL history features (learning from past), we need that entity lookup.
            // But HistoryManager.hydrateBatch uses "entity" object.

            // Let's rely on the logic we just proved works: Passing resumeData
            const mappings = window.HistoryManager.hydrateBatch(batch.fields, null, resumeData, index);

            Object.assign(results, mappings);
        }

        console.log(`[HistoryHandler] Resolved ${Object.keys(results).length} fields`);
        return results;
    }

    groupFields(fields) {
        const groups = new Map();

        fields.forEach(field => {
            const match = (field.name || '').match(/[_\-\[](\d+)[_\-\]]?/);
            const index = match ? parseInt(match[1]) : 0;

            if (!groups.has(index)) {
                groups.set(index, []);
            }
            groups.get(index).push(field);
        });

        return Array.from(groups.entries()).map(([index, fields]) => ({ index, fields }));
    }
}

if (typeof window !== 'undefined') {
    window.HistoryHandler = HistoryHandler;
}
