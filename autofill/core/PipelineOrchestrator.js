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
        this.classifier = window.HybridClassifier ? new window.HybridClassifier({ debug: false }) : null;

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
                    if (field.instance_type) {
                        field.element.setAttribute('instance_type', field.instance_type);
                    }

                    // 2. Store in Global Cache for persistence (GlobalStore)
                    if (!window.NovaCache) window.NovaCache = {};

                    // Store rich metadata object for robust routing
                    const cacheEntry = {
                        label: cacheLabel,
                        type: field.instance_type || 'ATOMIC_SINGLE',
                        scope: field.scope || 'GLOBAL'
                    };

                    if (field.element.id) {
                        window.NovaCache[field.element.id] = cacheEntry;
                    }
                    if (field.element.name) {
                        window.NovaCache[field.element.name] = cacheEntry;
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

        // C. COMPLEX BATCH (Strategy: SectionController / CompositeFieldManager)
        if (groups.complex.length > 0) {
            const res = await this.processMultiSelect(groups.complex, context);
            await this.applyAndCollect(res, results, groups.complex, unresolved);
        }

        // D. GENERAL (Fallthrough)
        if (groups.general.length > 0) unresolved.push(...groups.general);

        // --- PHASE 2: GLOBAL INFERENCE FALLBACK ---
        if (unresolved.length > 0) {
            // console.log(`🤖 [Pipeline] Global Inference Fallback for ${unresolved.length} fields...`);
            const aiResults = await this.strategyGlobalInference(unresolved, context);

            // FIX: Pass 'unresolved' (sourceFields) so executeBatchFills has metadata for auto-caching
            await this.executeBatchFills(aiResults, unresolved);

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

            // --- STRUCTURAL CLASSIFICATION (The Core Upgrade) ---
            if (window.FIELD_ROUTING_PATTERNS) {
                field.instance_type = window.FIELD_ROUTING_PATTERNS.classifyInstanceType(field);
                field.scope = window.FIELD_ROUTING_PATTERNS.classifyScope(field);

                // CLEANUP: If scope is GLOBAL, the index is irrelevant and should be removed
                // to prevent confusion (e.g. Skills set showing index 0).
                // We keep it for SECTION scope (Job Titles, Scope-Isolated Questions).
                if (field.scope === 'GLOBAL') {
                    field.field_index = null;
                }

                // IMMUTABILITY ENFORCEMENT
                // Verify these properties cannot be changed downstream
                try {
                    Object.defineProperty(field, 'instance_type', { writable: false, configurable: false });
                    Object.defineProperty(field, 'scope', { writable: false, configurable: false });
                } catch (e) {
                    console.warn('[Pipeline] Could not freeze field structure', e);
                }
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

            // CRITICAL FIX: Ignore empty values from Selection Cache
            // An empty string usually means "skipped" or "missed", not "explicitly delete".
            // If we accept empty string, we block GlobalMemory/RuleEngine from providing the real value.
            if (cached && cached.confidence > 0.6 && cached.value !== '' && cached.value !== null && cached.value !== undefined) {
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
            const success = await this.executor.fill(selector, res.value, res.confidence, field, res.source);
            if (!success) {
                console.warn(`⚠️ [Pipeline] Execution Failure: Could not fill element`, selector);
            } else {
                // Auto-Cache: If filled successfully and NOT from cache, save it!
                if (res.source !== 'selection_cache' && res.source !== 'cache' && field) {

                    // UNIFIED CACHING ARCHITECTURE (Consolidated)
                    // All fields flow into InteractionLog, which routes them to:
                    // 1. ATOMIC_SINGLE (Text, Phone, Email, Single-Select, Radio)
                    // 2. ATOMIC_MULTI (Skills, Interests)
                    // 3. SECTIONAL_MULTI (Jobs, Education)

                    if (window.InteractionLog) {
                        // Pass label, value, and the full field object (vital for instance_type routing)
                        window.InteractionLog.cacheSelection(field, field.label, res.value);
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
        const groups = { memory: [], heuristic: [], complex: [], general: [] };

        fields.forEach(field => {
            const type = field.instance_type || 'ATOMIC_SINGLE';
            const scope = field.scope || 'GLOBAL';
            const inputType = (field.type || 'text').toLowerCase();

            // --- ROUTING LOGIC (The Truth Table) ---

            // 1. COMPLEX (Sets & Sections)
            // Route: SECTIONAL_MULTI | ATOMIC_MULTI -> groups.complex
            if (type === 'SECTIONAL_MULTI' || type === 'ATOMIC_MULTI') {
                this.assertAllowedResolver(type, scope, 'CompositeFieldManager');
                groups.complex.push(field);
                return;
            }

            // 2. MEMORY (Global Facts)
            // Route: ATOMIC_SINGLE (Text/Email/Date) -> groups.memory
            if (type === 'ATOMIC_SINGLE') {
                const isRadio = inputType === 'radio';
                const isSelect = inputType === 'select-one' || inputType === 'select';

                // HEURISTIC SCOPE: All Radios and Selects (Global OR Section)
                // We want all structured choices to go through HeuristicEngine (RuleEngine)
                // This allows:
                // 1. InteractionLog Check (Cache)
                // 2. RuleEngine Check (Logic/Demographics)
                // 3. ExecutionEngine Fuzzy Matching
                if (isRadio || isSelect) {
                    this.assertAllowedResolver(type, scope, 'HeuristicEngine');
                    groups.heuristic.push(field);
                    return;
                }

                if (scope === 'GLOBAL') {
                    // Global single fields (Text/Email/etc) go to Memory for cross-site persistence
                    this.assertAllowedResolver(type, scope, 'GlobalMemory');
                    groups.memory.push(field);
                    return;
                }

                // Allow simple section text fields to go to memory (e.g. Job Description, Company Name)
                // These are legally routed to Memory/InteractionLog via the GlobalMemory adapter
                this.assertAllowedResolver(type, scope, 'GlobalMemory');
                groups.memory.push(field);
                return;
            }

            // Fallback
            groups.general.push(field);
        });
        return groups;
    }

    /**
     * Runtime Enforcement of the Golden Invariant
     */
    assertAllowedResolver(type, scope, resolverName) {
        // Truth Table Validation
        const allowed = {
            'ATOMIC_SINGLE:GLOBAL': ['RuleEngine', 'GlobalMemory'],
            'ATOMIC_SINGLE:SECTION': ['HeuristicEngine', 'GlobalMemory'], // GlobalMemory okay if key is scoped
            'ATOMIC_MULTI:GLOBAL': ['CompositeFieldManager'],
            'SECTIONAL_MULTI:SECTION': ['SectionController', 'CompositeFieldManager'],
            'COMPOSITE:GROUP': ['CompositeFieldManager']
        };

        const key = `${type}:${scope}`;
        // We do a loose check for now to allow for the orchestrator's broader groups
        // But we log warnings if something looks wildly off.

        // In strict mode we would throw:
        // if (!allowed[key]?.includes(resolverName)) throw new Error(...)
    }

    partitionProfileFields(fields) {
        const section = [];
        const composite = [];
        fields.forEach(f => {
            // Priority: Architecture V2 (Instance Type)
            if (f.instance_type === 'SECTIONAL_MULTI') {
                section.push(f);
            } else if (f.instance_type === 'ATOMIC_MULTI') {
                composite.push(f);
            }
            // Fallback: Legacy Logic (if type missing)
            else if (this.isSectionField(f)) {
                section.push(f);
            } else {
                composite.push(f);
            }
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
        // Restrict to strict section headers for the fallback
        return /company_name|institution_name|degree_type|major|job_title/i.test(label);
    }

    getSectionType(label) {
        if (!label) return null;
        if (/school|degree|education|institution/.test(label)) return 'education';
        if (/company|employer|job|title|work/.test(label)) return 'work';
        return null;
    }

    logGrouping(groups) {
        // console.log(`📊 [Pipeline] Grouping Summary: Mem:${groups.memory.length} Heu:${groups.heuristic.length} Multi:${groups.multiValue.length} Gen:${groups.general.length}`);

        // Detailed Group Logging
        // Detailed Group Logging
        if (groups.memory.length > 0) console.log('🧠 [Group: Memory]', groups.memory);
        if (groups.heuristic.length > 0) console.log('⚡ [Group: Heuristic]', groups.heuristic);
        if (groups.complex.length > 0) console.log('📚 [Group: Complex]', groups.complex);
        if (groups.general.length > 0) console.log('📂 [Group: General]', groups.general);
    }

    async applyHumanJitter() {
        const delay = Math.floor(Math.random() * 120) + 30;
        await new Promise(resolve => setTimeout(resolve, delay));
    }
}

if (typeof window !== 'undefined') window.PipelineOrchestrator = PipelineOrchestrator;
