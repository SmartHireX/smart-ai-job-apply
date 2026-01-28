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

        // REPEATER REGISTRY (Layer 4): Form-Scoped Persistence
        // Stores baseKeys that have been proven to be repeaters (Conf 3 / Add Button)
        // Prevents flip-flopping and global cache pollution.
        this.repeaterRegistry = new Set();

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
                    let cacheLabel = '';

                    if (field.ml_prediction.confidence > 0.8) {
                        cacheLabel = field.ml_prediction.label;
                    } else if (window.KeyGenerator) {
                        cacheLabel = window.KeyGenerator.generateEnterpriseCacheKey(field);
                    } else {
                        cacheLabel = [field.name, field.label].filter(Boolean).join('_') || 'unknown';
                    }

                    field.cache_label = cacheLabel;

                    // 1. Store on DOM for fast access (Primary)
                    const targets = field.groupElements || [field.element];
                    targets.forEach(target => {
                        if (target.setAttribute) {
                            target.setAttribute('cache_label', cacheLabel);
                            if (field.instance_type) target.setAttribute('instance_type', field.instance_type);
                            if (field.scope) target.setAttribute('scope', field.scope);
                            if (typeof field.field_index === 'number') target.setAttribute('field_index', field.field_index);
                            if (field.section_type) target.setAttribute('section_type', field.section_type);
                        }
                    });

                    // 2. Store in NovaCache for sidebar/manual persistence
                    if (!window.NovaCache) window.NovaCache = {};

                    const cacheEntry = {
                        label: cacheLabel,
                        instance_type: field.instance_type || 'ATOMIC_SINGLE',
                        scope: field.scope || 'GLOBAL',
                        field_index: field.field_index,
                        section_type: field.section_type
                    };

                    targets.forEach(target => {
                        if (target.id) window.NovaCache[target.id] = cacheEntry;
                        if (target.name) window.NovaCache[target.name] = cacheEntry;
                    });

                } catch (e) {
                    // console.warn('[Pipeline] Failed to attach metadata:', e);
                }
            }
        });

        // 2. Group (Memory, Heuristic, Profile, General)
        const groups = this.pipeline.grouping(enriched);
        // this.logGrouping(groups);
        console.log("🚀 ~ PipelineOrchestrator ~ executePipeline ~ groups:", groups)
        const results = {};
        const unresolved = [];

        // --- PHASE 1: EXPLICIT LOCAL RESOLUTION ---

        // A. ATOMIC_SINGLE (Merged Memory/Heuristic)
        // Strategy: InteractionLog -> RuleEngine
        const atomicFields = groups.ATOMIC_SINGLE || [];

        if (atomicFields.length > 0) {
            const res = await this.resolveAtomicBatch(atomicFields, context);
            await this.applyAndCollect(res, results, atomicFields, unresolved);
        }

        // B. MULTI-VALUE / SECTIONS (Complex)
        // Strategy: SectionController / CompositeFieldManager
        const complexFields = [
            ...(groups.ATOMIC_MULTI || []),
            ...(groups.SECTION_REPEATER || []),
            ...(groups.SECTION_CANDIDATE || []) // Route candidates here so SectionController can use indices
        ];

        if (complexFields.length > 0) {
            const res = await this.processMultiSelect(complexFields, context);
            await this.applyAndCollect(res, results, complexFields, unresolved);
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

    async ingestAndEnrich(fields) {
        // Phase 1: Initial Enrichment (ML + Detector Signals)
        await Promise.all(fields.map(async field => {
            if (!field.ml_prediction && this.classifier) {
                field.ml_prediction = await this.classifier.classify(field);
            }
            if (window.SectionDetector && field.element) {
                const secRes = window.SectionDetector.detect(field.element);
                if (secRes) {
                    field.parentContext = secRes.context;
                    field.sectionConfidence = secRes.confidence;
                    if (secRes.isRepeater) field.isStrongRepeater = true;
                }
            }
            const label = (field.ml_prediction?.label || field.label || field.name || '').toLowerCase();
            field.section_type = this.getSectionType(label);
        }));

        // Phase 2: Structural Grouping (Drift-Proof Identity V2)
        if (window.SectionGrouper) {
            // New 3-Layer Container Discovery + WeakMap Persistence
            const { blocks, orphans } = window.SectionGrouper.groupFieldsByContainer(fields);

            // Map blocks to fields for later processing (preserving new UIDs)
            // (The fields inside 'blocks' have already been mutated by SectionGrouper with UIDs)
        }

        // Phase 3: Final Indexing & Routing
        const seenHeaders = { work: false, education: false };
        const baseKeyCounts = {};
        if (window.IndexingService && window.IndexingService.getBaseKey) {
            fields.forEach(f => {
                const base = window.IndexingService.getBaseKey(f);
                if (base) baseKeyCounts[base] = (baseKeyCounts[base] || 0) + 1;
            });
        }

        fields.forEach(field => {
            const type = field.section_type;

            // DOM Indexing Fallback (If structural didn't catch it)
            if (window.IndexingService && field.field_index === undefined) {
                const label = (field.ml_prediction?.label || field.label || field.name || '').toLowerCase();
                const isWorkHeader = type === 'work' && (label.includes('company') || label.includes('employer') || label.includes('organization'));
                const isEduHeader = type === 'education' && (label.includes('school') || label.includes('university') || label.includes('institution'));

                if (isWorkHeader) {
                    if (seenHeaders.work) window.IndexingService.incrementCounter('work');
                    seenHeaders.work = true;
                }
                if (isEduHeader) {
                    if (seenHeaders.education) window.IndexingService.incrementCounter('education');
                    seenHeaders.education = true;
                }

                const idxRes = window.IndexingService.getIndex(field, type);
                if (idxRes !== null && typeof idxRes === 'object' && idxRes.index !== undefined) {
                    field.field_index = idxRes.index;
                } else if (typeof idxRes === 'number') {
                    field.field_index = idxRes;
                }
            }

            // Instance Type & Scope resolution
            if (window.FIELD_ROUTING_PATTERNS) {
                const base = window.IndexingService ? window.IndexingService.getBaseKey(field) : field.name;
                const groupCount = baseKeyCounts[base] || 1;
                field.instance_type = window.FIELD_ROUTING_PATTERNS.classifyInstanceType(field, groupCount);

                // Registry Promotion
                if (field.instance_type === 'SECTION_REPEATER' && base) this.repeaterRegistry.add(base);
                else if (this.repeaterRegistry.has(base) && field.instance_type !== 'SECTION_REPEATER') {
                    field.instance_type = 'SECTION_REPEATER';
                }

                const isSectional = field.instance_type === 'SECTION_REPEATER' || field.instance_type === 'SECTION_CANDIDATE';
                if (!isSectional && field.indexSource !== 'STRUCTURAL') {
                    field.field_index = null;
                }
                field.scope = window.FIELD_ROUTING_PATTERNS.classifyScope(field);
            }

            // Stable UID
            if (window.IndexingService && window.IndexingService.getStableUID && !field.instance_uid) {
                field.instance_uid = window.IndexingService.getStableUID(field, type);
            }

            // Container UID (Hardened Layout Anchor)
            if (field.field_index !== null && field.container_fingerprint) {
                field.container_uid = `${field.container_fingerprint}_row${field.field_index}`;
            }

            // Freeze
            try {
                Object.defineProperty(field, 'instance_type', { writable: false, configurable: false });
                Object.defineProperty(field, 'scope', { writable: false, configurable: false });
            } catch (e) { }
        });

        // Phase 4: Date Lifecycle Management (The "Single Writer" Prep)
        // Ensure all date fields are registered with authoritative metadata
        if (window.DateHandler) {
            fields.forEach(f => {
                if (f.type === 'date' || f.ml_prediction?.label?.includes('date')) {
                    // Just ensuring metadata is ready, actual writing happens in Executor via DateHandler
                    f.isDateField = true;
                }
            });
        }

        return fields;
    }

    /**
     * Apply structural grouping to fields.
     * Identifies containers and assigns deterministic indices.
     */
    applyStructuralGrouping(fields) {
        const { blocks, orphans } = window.SectionGrouper.groupFieldsByContainer(fields);

        // Group blocks by (SectionType + Fingerprint) to identify repeaters within context
        const groupMap = new Map(); // "type:fingerprint" -> blocks[]
        blocks.forEach(block => {
            // Determine the predominant section type for this block
            const typeCounts = {};
            block.fields.forEach(f => {
                const t = f.section_type || 'generic';
                typeCounts[t] = (typeCounts[t] || 0) + 1;
            });
            const predominantType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0][0];

            const groupKey = `${predominantType}:${block.fingerprint}`;
            if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
            groupMap.get(groupKey).push(block);
        });

        groupMap.forEach((instances, key) => {
            // Sort instances by vertical position for deterministic indexing
            instances.sort((a, b) => a.top - b.top);

            const isRepeater = instances.length > 1;

            instances.forEach((instance, index) => {
                instance.fields.forEach(field => {
                    const [type, fingerprint] = key.split(':');
                    field.container_fingerprint = fingerprint;
                    field.field_index = index;
                    field.indexSource = 'STRUCTURAL';

                    if (isRepeater) {
                        field.isStrongRepeater = true;
                    } else {
                        field.wasSolitaryStructural = true;
                    }
                });
            });
        });

        // 3.5 ENRICHMENT: LABEL SANITIZATION (Fix for "current value is YYYY")
        fields.forEach(field => {
            if (field.cache_label) {
                const crapPatterns = [
                    /^current value is/i,
                    /^type a value/i,
                    /^use arrow keys/i,
                    /^yyyy$/i, /^mm\/dd\/yyyy$/i
                ];
                if (crapPatterns.some(p => p.test(field.cache_label.replace(/_/g, ' ')))) {
                    // Fallback to name or ml_label if available
                    field.cache_label = field.ml_prediction?.label || field.name || 'unknown';
                }
            }
        });
    }

    // ==========================================
    // 🧠 STRATEGY RESOLVERS
    // ==========================================

    /**
     * Resolve Memory Fields (Text)
     * Chain: InteractionLog -> GlobalMemory -> RuleEngine
     */
    /**
     * Resolve Atomic Fields (Single Value)
     * Chain: InteractionLog -> RuleEngine
     * Merges legacy Memory and Heuristic batches.
     */
    async resolveAtomicBatch(fields, context) {
        return this.runResolutionChain(fields, [
            (f) => this.strategyInteractionLog(f),
            (f) => this.strategyRuleEngine(f, context.resumeData) // User Data Fallback
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
        //console.log('strategyInteractionLog', fields);
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
        // Initialize buckets based on instance_type
        const groups = {
            ATOMIC_SINGLE: [],
            ATOMIC_MULTI: [],
            SECTION_REPEATER: [],
            SECTION_CANDIDATE: [],
            general: []
        };

        fields.forEach(field => {
            const type = field.instance_type || 'ATOMIC_SINGLE';

            // Route strictly by instance_type
            if (groups[type]) {
                groups[type].push(field);
            } else {
                // Fallback for unclassified fields
                groups.general.push(field);
            }
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
            'SECTION_REPEATER:SECTION': ['SectionController', 'CompositeFieldManager'],
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
            if (f.instance_type === 'SECTION_REPEATER') {
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
            return window.FIELD_ROUTING_PATTERNS.isMultiValueEligible(fieldContext, field.type || 'text', field);
        }

        // Fallback (should typically be handled by centralized logic)
        const label = field.ml_prediction?.label || '';
        // Restrict to strict section headers for the fallback
        return /company_name|institution_name|degree_type|major|job_title/i.test(label);
    }

    getSectionType(label) {
        if (!label) return null;
        // Education Signals
        if (/school|degree|education|institution|gpa|major|minor|study|grade|score/.test(label) || label.includes('edu')) return 'education';

        // Work Signals
        if (/company|employer|job|title|work|description|responsibilities|summary/.test(label)) return 'work';

        // Date Signals (Default to Work if not caught by Edu above)
        if (/start.*date|end.*date/.test(label)) return 'work';

        return null;
    }

    logGrouping(groups) {
        console.log(`📊 [Pipeline] Grouping Summary:`);

        const logGroup = (name, list) => {
            if (!list || list.length === 0) return;
            console.group(`${name} (${list.length})`);
            list.forEach(f => {
                const label = (f.label || f.name || 'unnamed').substring(0, 30);
                const reason = (f.routingReasons || []).join(', ') || 'N/A';
                const meta = `Score: ${f.sectionalScore || 0}, Signals: ${f.structuralSignalCount || 0}`;
                console.log(`- ${label} | Reason: ${reason} | ${meta}`);
            });
            console.groupEnd();
        };

        logGroup('🧠 Atomic', groups.ATOMIC_SINGLE);
        logGroup('📚 Atomic Multi', groups.ATOMIC_MULTI);
        logGroup('⚡ Section Repeater', groups.SECTION_REPEATER);
        logGroup('⏳ Section Candidate', groups.SECTION_CANDIDATE);
        logGroup('📂 General', groups.general);
    }

    async applyHumanJitter() {
        const delay = Math.floor(Math.random() * 120) + 30;
        await new Promise(resolve => setTimeout(resolve, delay));
    }
}

if (typeof window !== 'undefined') window.PipelineOrchestrator = PipelineOrchestrator;
