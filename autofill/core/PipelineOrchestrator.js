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
        // Use HybridClassifier for ensemble classification (Heuristic + Neural)
        // HybridClassifier handles its own dependencies (HeuristicEngine/NeuralClassifierV8) internally
        this.classifier = window.HybridClassifier ? new window.HybridClassifier({ debug: true }) : null;

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
        // console.log(`🚀 [Pipeline:${executionId}] Starting Stealth Execution`);

        // Reset Indexing Service for this run
        if (window.IndexingService) window.IndexingService.reset();

        // 1. Ingest & Enrich
        const enriched = await this.pipeline.ingestion(rawFields);

        // Eagerly attach ML Metadata to DOM elements
        // This ensures sidebar/manual edits have access to high-confidence predictions (e.g. zip_code)
        // even if the field wasn't auto-filled by the engine.
        enriched.forEach(field => {
            if (field.element && field.ml_prediction) {
                try {
                    // Start of REFACTOR: Simplify to "cache_label"
                    let cacheLabel = '';

                    if (field.ml_prediction.confidence > 0.8) {
                        cacheLabel = field.ml_prediction.label;
                    } else {
                        // ROBUST TOKENIZED KEY GENERATION (Refactored to shared utility)
                        // Uses the same techniques as the Advanced KeyMatcher
                        if (window.KeyGenerator) {
                            cacheLabel = window.KeyGenerator.generateEnterpriseCacheKey(field);
                        } else {
                            console.warn('[Pipeline] KeyGenerator not found, falling back to simple key');
                            cacheLabel = [field.name, field.label].filter(Boolean).join('_') || 'unknown';
                        }
                    }
                    // console.log(`🔍 [CacheDebug] Cache Label: ${cacheLabel}`);

                    // CENTRALIZED: Attach cache_label to field object
                    // This allows all downstream consumers (workflows, sidebar, InteractionLog)
                    // to simply access field.cache_label instead of regenerating keys.
                    field.cache_label = cacheLabel;

                    // 1. Store on DOM for fast access (Primary)
                    field.element.setAttribute('cache_label', cacheLabel);

                    // 2. Store in Global Cache for persistence (GlobalStore)
                    if (!window.NovaCache) window.NovaCache = {};

                    if (field.element.id) {
                        window.NovaCache[field.element.id] = cacheLabel;
                    }
                    if (field.element.name) {
                        window.NovaCache[field.element.name] = cacheLabel;
                    }

                    // console.log(`🏷️ [Pipeline] Cache Label Assigned: "${field.label}" -> "${cacheLabel}" (ML Conf: ${field.ml_prediction.confidence})`);
                } catch (e) {
                    console.warn('[Pipeline] Failed to attach Cache Label:', e);
                }
            } else {
                // Even without ML, we should technically assign a fallback cache label, 
                // but for now we follow the "if ml_prediction" block structure.
                // console.log(`⚠️ [Pipeline] Field Skipped (No Element/ML): "${field.label}"`);
            }

        });

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

        // C. MULTIVALUE BATCH (Strategy: SectionController / CompositeFieldManager)
        if (groups.multiValue.length > 0) {
            const res = await this.processMultiSelect(groups.multiValue, context);
            await this.applyAndCollect(res, results, groups.multiValue, unresolved);
        }

        // D. GENERAL (Fallthrough)
        if (groups.general.length > 0) unresolved.push(...groups.general);

        // --- PHASE 2: GLOBAL INFERENCE FALLBACK ---
        if (unresolved.length > 0) {
            // console.log(`🤖 [Pipeline] Global Inference Fallback for ${unresolved.length} fields...`);
            const aiResults = await this.strategyGlobalInference(unresolved, context);
            await this.applyResults(aiResults);
            Object.assign(results, aiResults);
        }

        return results;
    }

    ingestAndEnrich(fields) {
        // Track unique headers to detect new sections (e.g. Job 1 -> Job 2)
        const seenHeaders = { work: false, education: false };

        return Promise.all(fields.map(async field => {
            // Hybrid Classification (Heuristic + Neural with 5-tier arbitration)
            if (!field.ml_prediction && this.classifier) {
                field.ml_prediction = await this.classifier.classify(field);
            }

            // DOM Indexing
            if (window.IndexingService) {
                const label = (field.ml_prediction?.label || field.label || field.name || '').toLowerCase();
                const type = this.getSectionType(label);

                // --- SMART SEQUENTIAL INCREMENT ---
                // If we hit a "Header Field" (Company/School) and we have ALREADY seen one in this batch,
                // it implies we have moved to the NEXT section (e.g. Job 1 -> Job 2).

                const isWorkHeader = type === 'work' && (label.includes('company') || label.includes('employer') || label.includes('organization'));
                const isEduHeader = type === 'education' && (label.includes('school') || label.includes('university') || label.includes('institution'));

                if (isWorkHeader) {
                    if (seenHeaders.work) {
                        // We already saw a company, this must be the next one!
                        window.IndexingService.incrementCounter('work');
                    }
                    seenHeaders.work = true;
                }

                if (isEduHeader) {
                    if (seenHeaders.education) {
                        window.IndexingService.incrementCounter('education');
                    }
                    seenHeaders.education = true;
                }

                field.field_index = window.IndexingService.getIndex(field, type);

                // Logging
                // console.log(`🔍 [Enrich] ${label.substring(0, 20)}... | ML: ${field.ml_prediction?.label || 'N/A'} | Idx: ${field.field_index}`);

            } else {
                console.warn('⚠️ IndexingService missing during enrichment');
            }
            return field;
        }));
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
            (f) => this.strategyRuleEngine(f, context.resumeData), // User Data Fallback
            (f) => this.strategyGlobalMemory(f)                    // Smart Memory (Last Resort)
        ]);
    }

    /**
     * Resolve Heuristic Fields (Select/Radio)
     * Chain: InteractionLog -> GlobalMemory -> RuleEngine
     */
    async resolveHeuristicBatch(fields, context) {
        return this.runResolutionChain(fields, [
            (f) => this.strategyInteractionLog(f),
            (f) => this.strategyRuleEngine(f, context.resumeData), // User Data Fallback
            (f) => this.strategyGlobalMemory(f)                    // Smart Memory (Last Resort)
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
    async processMultiSelect(fields, context) {
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
            // Pass the FULL field object to allow ML-based lookup
            const cached = await window.InteractionLog.getCachedValue(field);
            if (cached && cached.confidence > 0.6) { // Lowered from 0.9 to trust user history more
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
                const resolvedCount = Object.keys(stepResults).length;
                if (resolvedCount > 0) {
                    // console.log(`✅ [Pipeline] Strategy resolved ${resolvedCount} fields.`);
                }

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
        await this.executeBatchFills(batchResults, sourceFields); // Pass source fields for auto-caching
        this.collectUnresolved(sourceFields, batchResults, unresolvedCollection);
    }

    async executeBatchFills(batchResults, sourceFields) {
        if (!this.executor) return;
        for (const [selector, res] of Object.entries(batchResults)) {
            if (res.skipExecution) continue;

            // Find the original field object for metadata
            const field = sourceFields ? sourceFields.find(f => f.selector === selector) : null;

            // Pass field to executor for change listener attachment
            const success = await this.executor.fill(selector, res.value, res.confidence, field);
            if (!success) {
                console.warn(`⚠️ [Pipeline] Execution Failure: Could not fill element`, selector);
            } else {
                // Auto-Cache: If filled successfully and NOT from cache, save it!
                if (res.source !== 'selection_cache' && res.source !== 'cache' && field) {
                    const fieldType = (field.type || '').toLowerCase();
                    const isStructuredInput = ['radio', 'checkbox', 'select', 'select-one', 'select-multiple'].includes(fieldType);

                    // Check if this is a multiCache-eligible field (job/education/skills)
                    // Use centralized routing logic
                    const fieldContext = [field.label, field.name, field.parentContext].filter(Boolean).join(' ').toLowerCase();
                    const isMultiCacheEligible = window.FIELD_ROUTING_PATTERNS.isMultiValueEligible(fieldContext, fieldType);

                    if (isStructuredInput && window.InteractionLog) {
                        // Structured inputs go to SelectionCache
                        window.InteractionLog.cacheSelection(field, field.label, res.value);
                    } else if (isMultiCacheEligible && window.InteractionLog) {
                        // MultiCache-eligible text fields go to InteractionLog (which routes to multiCache)
                        window.InteractionLog.cacheSelection(field, field.label, res.value);
                    } else if (!isStructuredInput && !isMultiCacheEligible && window.GlobalMemory) {
                        // Generic text fields go to SmartMemory using cache_label
                        const key = field.cache_label || (window.GlobalMemory.normalizeKey ? window.GlobalMemory.normalizeKey(field.label) : field.label);
                        window.GlobalMemory.updateCache({
                            [key]: { answer: res.value, timestamp: Date.now() }
                        });
                    }
                }
            }
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

    groupFields(fields) {
        const groups = { memory: [], heuristic: [], multiValue: [], general: [] };
        fields.forEach(field => {
            const type = (field.field_type || field.type || 'text').toLowerCase();
            const tag = (field.tagName || 'INPUT').toLowerCase();

            if (this.isMultiValueField(field, type)) {
                groups.multiValue.push(field); // Contextual/Multi (Job/Edu/Skills)
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

    isMultiValueField(field, type) {
        // Exclude basics (Name, Email, Phone) from MultiValue Group so they hit RuleEngine
        if (field.ml_prediction && ['first_name', 'last_name', 'email', 'phone', 'linkedin'].includes(field.ml_prediction.label)) {
            return false;
        }

        // Section fields (job/education) ALWAYS go to MultiValue group, even with cache hits
        // This ensures SectionController handles them with correct indexing
        if (this.isSectionField(field)) {
            return true;
        }

        return type === 'checkbox' || field.multiple || type == 'select-multiple';
    }

    isHeuristicField(type, tag) {
        return type === 'radio' || tag === 'select' || type === 'date' || type == 'select-one';
    }

    isMemoryField(type, tag) {
        return ['text', 'email', 'tel', 'number', 'url', 'password', 'textarea'].includes(type) || tag === 'textarea';
    }

    isSectionField(field) {
        // Use centralized routing logic
        if (window.FIELD_ROUTING_PATTERNS && typeof window.FIELD_ROUTING_PATTERNS.isMultiValueEligible === 'function') {
            const fieldContext = [field.label, field.name, field.parentContext].filter(Boolean).join(' ').toLowerCase();
            return window.FIELD_ROUTING_PATTERNS.isMultiValueEligible(fieldContext, field.type || 'text');
        }

        // Fallback (should typically be handled by centralized logic)
        const label = field.ml_prediction?.label || '';
        return /job|employer|work|school|degree|education|institution|title/i.test(label);
    }

    getSectionType(label) {
        return /school|degree|education|institution/.test(label || '') ? 'education' : 'work';
    }

    logGrouping(groups) {
        // console.log(`📊 [Pipeline] Grouping Summary: Mem:${groups.memory.length} Heu:${groups.heuristic.length} Multi:${groups.multiValue.length} Gen:${groups.general.length}`);

        // Detailed Group Logging
        if (groups.memory.length > 0) console.log('🧠 [Group: Memory]', groups.memory);
        if (groups.heuristic.length > 0) console.log('⚡ [Group: Heuristic]', groups.heuristic);
        if (groups.multiValue.length > 0) console.log('📚 [Group: MultiValue]', groups.multiValue);
        if (groups.general.length > 0) console.log('📂 [Group: General]', groups.general);
    }

    async applyHumanJitter() {
        const delay = Math.floor(Math.random() * 120) + 30;
        await new Promise(resolve => setTimeout(resolve, delay));
    }
}

if (typeof window !== 'undefined') window.PipelineOrchestrator = PipelineOrchestrator;
