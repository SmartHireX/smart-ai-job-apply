/**
 * FieldRouter
 * Refactored Pipeline Orchestrator for FANG-Level Form Filling
 * 
 * Architecture:
 * 1. Ingestion & Enrichment (TinyML + Indexing)
 * 2. Grouping (Text, Selector, Multi, General)
 * 3. Strategy Resolution (Fallback Chains)
 * 4. Execution Dispatch
 */

class FieldRouter {
    constructor() {
        this.neuralClassifier = new window.NeuralClassifier();
        this.neuralClassifier.init();

        // Pipeline Stages
        this.pipeline = {
            ingestion: this.ingestAndEnrich.bind(this),
            grouping: this.groupFields.bind(this)
        };

        // Handlers Map
        this.handlers = {
            cache: window.CacheHandler ? new window.CacheHandler() : null,
            history: window.HistoryHandler ? new window.HistoryHandler() : null,
            matcher: window.MatcherHandler ? new window.MatcherHandler() : null,
            ai: window.AIHandler ? new window.AIHandler() : null
        };

        // Execution Engine (The Hands)
        this.engine = window.ExecutionEngine ? new window.ExecutionEngine() : null;
    }

    /**
     * Main Entry Point: Execute the Pipeline
     * Uses strict sequential execution to mimic human behavior (Anti-Detection).
     * @param {Array} fields - Raw DOM-extracted fields
     * @param {Object} context - { resumeData, smartMemory }
     * @returns {Promise<Object>} Results map
     */
    async executePipeline(rawFields, context) {
        const executionId = crypto.randomUUID();
        console.log(`🚀 [Pipeline:${executionId}] Starting Stealth Execution for ${rawFields.length} fields`);

        // Stage 1: Ingestion & Enrichment
        const enrichedFields = await this.pipeline.ingestion(rawFields);

        // Stage 2: Grouping
        const groups = this.pipeline.grouping(enrichedFields);

        // --- DEBUG: Print Grouped Fields ---
        console.group(`📊 [Pipeline:${executionId}] Field Grouping Summary`);
        console.log(`Texts: ${groups.text.length}, Selectors: ${groups.selector.length}, Multi: ${groups.multi.length}, General: ${groups.general.length}`);

        // Detailed Object View (Full Arrays)
        console.log('📝 Text Fields:', groups.text);
        console.log('📝 Selector Fields:', groups.selector);
        console.log('📝 Multi Fields:', groups.multi);
        console.log('📝 General Fields:', groups.general);
        console.groupEnd();
        // -----------------------------------

        const results = {};
        const executionOrder = ['text', 'selector', 'multi', 'general'];

        // Stage 3 & 4: Resolution & Execution Loop
        for (const groupName of executionOrder) {
            const groupFields = groups[groupName];
            if (!groupFields || groupFields.length === 0) continue;

            console.log(`⚡ [Pipeline:${executionId}] Processing Group: ${groupName} (${groupFields.length} fields)`);

            if (groupName === 'multi') {
                // Transactional Batch Processing
                const batchResults = await this.processMultiValueGroup(groupFields, context);
                Object.assign(results, batchResults);

                // EXECUTE BATCH FILL
                if (this.engine) {
                    for (const [selector, res] of Object.entries(batchResults)) {
                        await this.engine.fill(selector, res.value, res.confidence);
                        await this.applyHumanJitter();
                    }
                }
            } else {
                // Linear Sequential Processing
                for (const field of groupFields) {
                    const fieldResult = await this.processSingleField(field, groupName, context);
                    if (fieldResult) {
                        results[field.selector] = fieldResult;

                        // EXECUTE FILL IMMEDIATELY (Stealth)
                        if (this.engine) {
                            await this.engine.fill(field.selector, fieldResult.value, fieldResult.confidence);
                        }
                    }

                    // Human Jitter (Anti-Detection)
                    await this.applyHumanJitter();
                }
            }

            // Micro-pause between groups
            await new Promise(r => setTimeout(r, 150));
        }

        return results;
    }

    /**
     * STAGE 1: Ingestion & Enrichment
     * Adds ML labels, Indices, and Visibility context
     */
    async ingestAndEnrich(fields) {
        const enriched = [];

        for (const field of fields) {
            // 1. TinyML Classification
            if (!field.ml_prediction) {
                field.ml_prediction = this.neuralClassifier.predict(field);
            }

            // 2. Indexing Service (Job 0 vs Job 1)
            if (window.IndexingService) {
                const type = this.getHistoryType(field.ml_prediction.label);
                field.field_index = window.IndexingService.getIndex(field, type);
            }

            // 3. Shadow DOM Path (if applicable - checking structure)
            // (Assumed handled by FormAnalyzer extraction, but we can verify)

            enriched.push(field);
        }
        return enriched;
    }

    /**
     * STAGE 2: Grouping
     * Sorts fields into 4 buckets for specialized handling
     */
    groupFields(fields) {
        const groups = {
            text: [],
            selector: [],
            multi: [],
            general: []
        };

        fields.forEach(field => {
            const type = field.field_type || field.type || 'text';
            const tag = field.tagName || 'INPUT';
            const label = (field.ml_prediction?.label || '').toLowerCase();

            // 1. Multi-Value / History Transactional
            // Check if it belongs to a repeating section (Job/Edu) OR is a multi-select
            if (this.isTransactionalField(field) || type === 'checkbox' || field.multiple || type == 'select-multiple') {
                groups.multi.push(field);
                return;
            }

            // 2. Selectors (Single choice constraints)
            if (type === 'radio' || tag === 'SELECT' || type === 'date' || type == 'select-one') {
                groups.selector.push(field);
                return;
            }

            // 3. Simple Text (Direct input)
            if (['text', 'email', 'tel', 'number', 'url', 'password', 'textarea'].includes(type) || tag === 'TEXTAREA') {
                groups.text.push(field);
                return;
            }

            // 4. Fallback
            groups.general.push(field);
        });

        return groups;
    }

    /**
     * PROCESS SINGLE FIELD (Linear Strategy)
     * Fallback Chain: Cache -> UserData -> AI
     */
    async processSingleField(field, groupType, context) {
        // 1. Tier 1: Selection Cache (Instant)
        if (this.handlers.cache) {
            const cached = await this.handlers.cache.handle([field]); // Batch of 1
            const res = cached[field.selector];
            if (res && res.confidence > 0.9) return res;
        }

        // 2. Tier 2: User Data (Manual/Local)
        // Delegate to MatcherHandler (DOM/Logic) or Local Logic
        if (this.handlers.matcher) {
            // MatcherHandler now focuses on DOM logic but can use LocalMatcher utility
            // We'll trust its existing resolve logic for now, or use LocalMatcher directly
            if (window.LocalMatcher) {
                const { defined } = window.LocalMatcher.resolveFields([field], context.resumeData);
                const res = defined[field.selector];
                if (res) return res;
            }
        }

        // 3. Tier 3: AI Copilot
        if (this.handlers.ai) {
            const aiRes = await this.handlers.ai.handle([field], context); // Batch of 1
            const res = aiRes[field.selector];
            if (res) return res;
        }

        return null;
    }

    /**
     * PROCESS MULTI-VALUE GROUP (Transactional)
     * Batches fields by 'Index' (Job 0, Job 1) to ensure data integrity
     */
    async processMultiValueGroup(fields, context) {
        // Group by Index (via HistoryHandler logic or internal)
        if (this.handlers.history) {
            // HistoryHandler is designed for this batch processing
            // We pass the whole clump. It should handle Cache checks internally if robust, 
            // or we do it here. Plan says: "Array Cache -> Resume -> AI"
            // For now, delegate to HistoryHandler which implements the Transactional logic in Phase 2
            return await this.handlers.history.handle(fields, context);
        }
        return {};
    }

    /**
     * Anti-Detection Jitter
     * Random delay between 30ms and 150ms
     */
    async applyHumanJitter() {
        const delay = Math.floor(Math.random() * 120) + 30; // 30-150ms
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    // --- Helpers ---

    getHistoryType(label) {
        const workLabels = ['job_title', 'employer_name', 'job_start_date', 'job_end_date', 'work_description', 'job_location'];
        if (workLabels.includes(label)) return 'work';
        return 'education';
    }

    isTransactionalField(field) {
        // Check if it's part of a Job or School block (has index + relevant label)
        return (field.field_index !== undefined && field.field_index !== null) &&
            (this.isHistoryField(field));
    }

    isHistoryField(field) {
        const prediction = field.ml_prediction?.label || '';
        const historyLabels = [
            'job_title', 'employer_name', 'job_start_date', 'job_end_date', 'work_description',
            'institution_name', 'degree_type', 'field_of_study', 'gpa_score', 'education_start_date'
        ];
        return historyLabels.includes(prediction);
    }

    // Legacy Alias for Backward Compatibility
    routeAll(fields, cacheResults) {
        console.warn('⚠️ [Deprecation] FieldRouter.routeAll called. Prefer executePipeline.');
        // This won't actually execute, just return groupings like before to not break legacy caller
        // We replicate the minimal logic needed for legacy
        const groups = this.groupFields(fields);
        return {
            cache: [], // Legacy expects these populated
            history: groups.multi,
            matcher: groups.selector.concat(groups.text),
            ai: groups.general
        };
    }
}

if (typeof window !== 'undefined') {
    window.FieldRouter = FieldRouter;
}
