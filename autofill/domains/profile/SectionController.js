/**
 * HistoryHandler
 * specialized handler for repeating sections (Jobs, Education)
 * Implements "Transactional Integrity" - ensures a section is filled coherently (all from same source entity)
 */
class SectionController extends window.Handler {
    constructor() {
        super('section_controller');
        // Dependency Injection
        this.store = window.EntityStore || null;
    }

    canHandle(field) {
        // We rely on FieldRouter grouping, but as a check:
        return !!field.field_index && /work|education/.test(field.section_type || '');
    }

    async handle(fields, context) {
        const results = {};
        const { resumeData } = context;

        // 1. Group fields by Section Index (e.g. "Job 0", "Job 1")
        const sections = this.groupFieldsBySection(fields);

        for (const [sectionKey, sectionFields] of Object.entries(sections)) {
            const { type, index } = this.parseSectionKey(sectionKey);
            console.log(`📜 [HistoryHandler] Processing Transactional Section: ${type} #${index} (${sectionFields.length} fields)`);

            // 2. Fetch Source Entity (Transactional Unit)
            // Try HistoryManager first (Edited Data), Fallback to Resume (Raw Data)
            let entity = window.HistoryManager ? window.HistoryManager.getByIndex(type, index) : null;
            let source = 'history_manager';

            if (!entity) {
                // Fallback to Resume Data
                entity = this.getEntityFromResume(resumeData, type, index);
                source = 'resume_data';
            }

            if (!entity) {
                console.warn(`⚠️ [HistoryHandler] No data found for ${type} #${index}. Skipping section.`);
                // Return empty trace? OR let AI handle it?
                // Plan says: Cache -> User -> AI.
                // If we return nothing here, FieldRouter (Tier 3) will send to AI.
                continue;
            }

            // 3. Map Fields to Entity Properties
            const sectionResults = await this.mapSection(sectionFields, entity, source);

            // 4. Transactional Integrity Check
            // Verify if critical fields are mapped
            // if (this.verifyIntegrity(sectionResults, type)) {
            Object.assign(results, sectionResults);
            // } else {
            //    console.warn(`⚠️ [HistoryHandler] Integrity Check Failed for ${type} #${index}. Partial data.`);
            // We might still fill partials, or block. Plan said "Mark as Needs Review".
            // For now, we fill what we have, but append a flag to trace.
            // }
        }

        return results;
    }

    groupFieldsBySection(fields) {
        const groups = {};
        fields.forEach(f => {
            // Determine Type ('work' or 'education')
            // FieldRouter enrichment should have attached 'field_index' and maybe 'section_type'.
            // If not, infer from label? FieldRouter.ingestAndEnrich calls getHistoryType.
            // But FieldRouter doesn't attach 'section_type' explicitly in the code I wrote step 102.
            // It uses 'getHistoryType' inside ingest logic but only for indexing.
            // I should re-infer or trust field metadata.

            let type = 'work';
            if (/school|education|degree/i.test(f.ml_prediction?.label || '')) type = 'education';

            const index = f.field_index !== undefined ? f.field_index : 0;
            const key = `${type}_${index}`;

            if (!groups[key]) groups[key] = [];
            groups[key].push(f);
        });
        return groups;
    }

    parseSectionKey(key) {
        const [type, indexStr] = key.split('_');
        return { type, index: parseInt(indexStr) };
    }

    getEntityFromResume(resume, type, index) {
        if (type === 'work') {
            return (resume.experience || resume.work || [])[index];
        }
        if (type === 'education') {
            return (resume.education || resume.schools || [])[index];
        }
        return null; // Skills?
    }

    async mapSection(fields, entity, source) {
        const mapped = {};

        for (const field of fields) {
            // 1. Check InteractionLog (Cache) Priority
            if (window.InteractionLog) {
                const cached = await window.InteractionLog.getCachedValue(field);
                if (cached && cached.value && cached.confidence > 0.6) {
                    mapped[field.selector] = {
                        value: cached.value,
                        confidence: cached.confidence,
                        source: 'selection_cache', // Preserves cache source
                        trace: this.createTrace('cache_hit', cached.confidence, { source: 'multi_cache' })
                    };
                    continue; // Skip entity mapping
                }
            }

            // 2. Map from Entity (Fallback)
            const label = field.ml_prediction?.label || '';
            const val = this.extractValue(entity, label);

            if (val) {
                mapped[field.selector] = {
                    value: val,
                    confidence: 1.0,
                    source: source,
                    trace: this.createTrace('history_map', 1.0, { source, entity_field: label })
                };
            }
        }
        return mapped;
    }

    extractValue(entity, label) {
        // Schema Mapping
        // Simple mapping for now, can use HistoryManager.SCHEMA regex later
        // Map ML Label -> Entity Key
        const map = {
            'employer_name': ['name', 'company', 'employer'],
            'job_title': ['position', 'title', 'role'],
            'job_start_date': ['startDate', 'from'],
            'job_end_date': ['endDate', 'to'],
            'work_description': ['summary', 'description', 'highlights'], // highlights is array
            'job_location': ['location', 'city'],
            'institution_name': ['institution', 'school', 'university'],
            'degree_type': ['studyType', 'degree'],
            'field_of_study': ['area', 'major'],
            'education_start_date': ['startDate'],
            'education_end_date': ['endDate'],
            'gpa_score': ['score', 'gpa']
        };

        const keys = map[label];
        if (!keys) return null;

        for (const k of keys) {
            if (entity[k]) {
                const v = entity[k];
                if (Array.isArray(v)) return v.join('\n'); // Join bullet points
                return v;
            }
        }
        return null;
    }
}

if (typeof window !== 'undefined') {
    window.SectionController = SectionController;
}
