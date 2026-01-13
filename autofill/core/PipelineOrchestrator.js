/**
 * PipelineOrchestrator
 * 
 * The Central Nervous System of the Autofill Engine.
 * Orchestrates the "Ingest -> Group -> Resolve -> Execute" pipeline.
 * 
 * Architecture Style: "Ace Developer" (Functional, Compositional, Clean)
 */

class PipelineOrchestrator {
    constructor() {
        this.neuralClassifier = window.NeuralClassifier ? new window.NeuralClassifier() : null;
        if (this.neuralClassifier) this.neuralClassifier.init();

        // Pipeline Stages
        this.pipeline = {
            ingestion: this.ingestAndEnrich.bind(this),
            grouping: this.groupFields.bind(this)
        };

        // Controllers (The Workhorses)
        this.controllers = {
            section: window.SectionController ? new window.SectionController() : null, // formerly HistoryHandler
            copilot: window.CopilotClient ? new window.CopilotClient() : null     // formerly AIResolver
        };

        // Stealth Executor (The Hands)
        this.executor = window.ExecutionEngine ? new window.ExecutionEngine() : null;
    }

    /**
     * MAIN PIPELINE EXECUTION
     */
    async executePipeline(rawFields, context) {
        const executionId = crypto.randomUUID();
        console.log(`🚀 [Pipeline:${executionId}] Starting Stealth Execution`);

        // 1. Ingest & Enrich
        const enriched = await this.pipeline.ingestion(rawFields);

        // 2. Group (Memory, Heuristic, Profile, General)
        const groups = this.pipeline.grouping(enriched);
        this.logGrouping(groups);

        const results = {};
        const unresolved = [];

        // --- PHASE 1: EXPLICIT LOCAL RESOLUTION ---

        // A. MEMORY BATCH (Strategy: InteractionLog -> GlobalMemory -> RuleEngine)
        if (groups.memory.length > 0) {
            const res = await this.resolveMemoryBatch(groups.memory, context);
            await this.applyAndCollect(res, results, groups.memory, unresolved);
        }

        // B. HEURISTIC BATCH (Strategy: InteractionLog -> GlobalMemory -> RuleEngine)
        if (groups.heuristic.length > 0) {
            const res = await this.resolveHeuristicBatch(groups.heuristic, context);
            await this.applyAndCollect(res, results, groups.heuristic, unresolved);
        }

        // C. PROFILE BATCH (Strategy: SectionController / CompositeFieldManager)
        if (groups.profile.length > 0) {
            const res = await this.processProfileGroup(groups.profile, context);
            await this.applyAndCollect(res, results, groups.profile, unresolved);
        }

        // D. GENERAL (Fallthrough)
        if (groups.general.length > 0) unresolved.push(...groups.general);

        // --- PHASE 2: GLOBAL INFERENCE FALLBACK ---
        if (unresolved.length > 0) {
            console.log(`🤖 [Pipeline] Global Inference Fallback for ${unresolved.length} fields...`);
            const aiResults = await this.strategyGlobalInference(unresolved, context);
            await this.applyResults(aiResults);
            Object.assign(results, aiResults);
        }

        return results;
    }

    // ==========================================
    // 🧠 STRATEGY RESOLVERS
    // ==========================================

    /**
     * Resolve Memory Fields (Text)
     * Chain: InteractionLog -> GlobalMemory -> RuleEngine
     */
    async resolveMemoryBatch(fields, context) {
        return this.runResolutionChain(fields, [
            (f) => this.strategyInteractionLog(f),
            (f) => this.strategyGlobalMemory(f),
            (f) => this.strategyRuleEngine(f, context.resumeData)
        ]);
    }

    /**
     * Resolve Heuristic Fields (Select/Radio)
     * Chain: InteractionLog -> GlobalMemory -> RuleEngine
     */
    async resolveHeuristicBatch(fields, context) {
        return this.runResolutionChain(fields, [
            (f) => this.strategyInteractionLog(f),
            (f) => this.strategyGlobalMemory(f),
            (f) => this.strategyRuleEngine(f, context.resumeData)
        ]);
    }

    /**
     * Strategy: Global Inference (AI)
     * Uses InferenceBatcher (via CopilotClient)
     */
    async strategyGlobalInference(fields, context) {
        if (!this.controllers.copilot) return {};
        // Delegate to CopilotClient (formerly AIResolver)
        return await this.controllers.copilot.handle(fields, context);
    }

    /**
     * Resolve Profile Fields (Multi-Value / Sections)
     * Logic: SectionController vs CompositeFieldManager
     */
    async processProfileGroup(fields, context) {
        const results = {};
        const { section, composite } = this.partitionProfileFields(fields);

        // 1. Section Fields (Jobs/Edu) -> SectionController (Transactional)
        if (section.length > 0 && this.controllers.section) {
            const sRes = await this.controllers.section.handle(section, context);
            Object.assign(results, sRes);
        }

        // 2. Composite Fields (Skills, Checkboxes) -> CompositeFieldManager
        if (composite.length > 0 && window.CompositeFieldManager) {
            const cRes = await window.CompositeFieldManager.processGroup(composite, context);
            this.markAsSkippedExecution(cRes.filled, results);
        }

        return results;
    }

    // ==========================================
    // 🧱 BASIC STRATEGIES (The Building Blocks)
    // ==========================================

    /**
     * Strategy: Interaction Log (Exact History Replay)
     * Formerly SelectionCache
     */
    async strategyInteractionLog(fields) {
        if (!window.InteractionLog) return {};
        const results = {};
        for (const field of fields) {
            const cached = await window.InteractionLog.getCachedValue(field.selector);
            if (cached && cached.confidence > 0.9) {
                results[field.selector] = cached;
            }
        }
        return results;
    }

    /**
     * Strategy: Global Memory (Cross-Site Learning)
     * Formerly SmartMemoryService
     */
    async strategyGlobalMemory(fields) {
        if (!window.GlobalMemory) return {};
        return await window.GlobalMemory.resolveBatch(fields);
    }

    /**
     * Strategy: Rule Engine (Resume Logic)
     * Formerly LocalMatcher
     */
    strategyRuleEngine(fields, resumeData) {
        if (!window.RuleEngine) return {};
        // RuleEngine returns { defined, remaining }
        return window.RuleEngine.resolveFields(fields, resumeData).defined;
    }

    // ==========================================
    // 🔧 CORE UTILITIES
    // ==========================================

    async runResolutionChain(fields, strategies) {
        const validStrategies = strategies.filter(s => typeof s === 'function');
        let remaining = [...fields];
        const finalResults = {};

        for (const strategy of validStrategies) {
            if (remaining.length === 0) break;
            try {
                const stepResults = await strategy(remaining);
                Object.assign(finalResults, stepResults);
                remaining = remaining.filter(f => !finalResults[f.selector]);
            } catch (err) {
                console.error('⚠️ [Pipeline] Strategy Error:', err);
            }
        }
        return finalResults;
    }

    async applyAndCollect(batchResults, globalResults, sourceFields, unresolvedCollection) {
        Object.assign(globalResults, batchResults);
        await this.executeBatchFills(batchResults);
        this.collectUnresolved(sourceFields, batchResults, unresolvedCollection);
    }

    async executeBatchFills(batchResults) {
        if (!this.executor) return;
        for (const [selector, res] of Object.entries(batchResults)) {
            if (res.skipExecution) continue;
            await this.executor.fill(selector, res.value, res.confidence);
            await this.applyHumanJitter();
        }
    }

    collectUnresolved(fields, results, collection) {
        fields.forEach(f => {
            if (!results[f.selector]) collection.push(f);
        });
    }

    async applyResults(results) {
        await this.executeBatchFills(results);
    }

    // --- Helpers ---

    ingestAndEnrich(fields) {
        return fields.map(field => {
            // Neural Classification
            if (!field.ml_prediction && this.neuralClassifier) {
                field.ml_prediction = this.neuralClassifier.predict(field);
            }
            // DOM Indexing
            if (window.IndexingService) {
                const type = this.getSectionType(field.ml_prediction?.label);
                field.field_index = window.IndexingService.getIndex(field, type);
            }
            return field;
        });
    }

    groupFields(fields) {
        const groups = { memory: [], heuristic: [], profile: [], general: [] };
        fields.forEach(field => {
            const type = (field.field_type || field.type || 'text').toLowerCase();
            const tag = (field.tagName || 'INPUT').toLowerCase();

            if (this.isProfileField(field, type)) {
                groups.profile.push(field); // Contextual/Multi
                return;
            }
            if (this.isHeuristicField(type, tag)) {
                groups.heuristic.push(field); // Selectors
                return;
            }
            if (this.isMemoryField(type, tag)) {
                groups.memory.push(field); // Text
                return;
            }
            groups.general.push(field);
        });
        return groups;
    }

    partitionProfileFields(fields) {
        const section = [];
        const composite = [];
        fields.forEach(f => {
            this.isSectionField(f) ? section.push(f) : composite.push(f);
        });
        return { section, composite };
    }

    markAsSkippedExecution(filledFields, results) {
        filledFields.forEach(f => {
            results[f.selector] = {
                value: f.value,
                confidence: 1.0,
                source: f.source || 'composite_manager',
                skipExecution: true
            };
        });
    }

    // --- Predicates ---

    isProfileField(field, type) {
        return (this.isSectionField(field) && field.field_index !== undefined) ||
            type === 'checkbox' || field.multiple || type == 'select-multiple';
    }

    isHeuristicField(type, tag) {
        return type === 'radio' || tag === 'select' || type === 'date' || type == 'select-one';
    }

    isMemoryField(type, tag) {
        return ['text', 'email', 'tel', 'number', 'url', 'password', 'textarea'].includes(type) || tag === 'textarea';
    }

    isSectionField(field) {
        const label = field.ml_prediction?.label || '';
        return /job|employer|work|school|degree|education/i.test(label);
    }

    getSectionType(label) {
        return /school|degree|education/.test(label || '') ? 'education' : 'work';
    }

    logGrouping(groups) {
        console.log(`📊 [Pipeline] Grouping: Mem:${groups.memory.length} Heu:${groups.heuristic.length} Prof:${groups.profile.length} Gen:${groups.general.length}`);
    }

    async applyHumanJitter() {
        const delay = Math.floor(Math.random() * 120) + 30;
        await new Promise(resolve => setTimeout(resolve, delay));
    }
}

if (typeof window !== 'undefined') window.PipelineOrchestrator = PipelineOrchestrator;
