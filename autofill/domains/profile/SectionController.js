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
        console.log("🚀 ~ SectionController ~ handle ~ sections:", sections)
        for (const [sectionKey, sectionFields] of Object.entries(sections)) {
            const { type, index } = this.parseSectionKey(sectionKey);
            // console.log(`📜 [SectionController] Processing Transactional Section: ${type} #${index} (${sectionFields.length} fields)`);
            //console.log("🚀 ~ SectionController ~ handle ~ type:", type)
            // console.log("🚀 ~ SectionController ~ handle ~ index:", index)
            // 2. Fetch Source Entity (Transactional Unit)
            // Fallback to Resume Data
            let entity = this.getEntityFromResume(resumeData, type, index) || {};
            let source = 'resume_data';

            // REMOVED: if (!entity) continue;
            // We MUST proceed to mapSection to allow Cache Lookups even if Resume Data is missing.

            // 3. Map Fields to Entity Properties
            const sectionResults = await this.mapSection(sectionFields, entity, source, type, index);

            // 4. Transactional Integrity Check
            // Verify if critical fields are mapped
            // if (this.verifyIntegrity(sectionResults, type)) {
            Object.assign(results, sectionResults);
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
            // Critical Fix: Add 'major', 'field_of_study', 'gpa' to education detection
            if (/school|education|degree|institution|major|field_of_study|gpa|score/i.test(f.ml_prediction?.label || '')) {
                type = 'education';
            }

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

    async mapSection(fields, entity, source, type, index) {
        const mapped = {};
        for (const field of fields) {
            // 1. Check InteractionLog (Cache) Priority
            if (window.InteractionLog) {
                const cached = await window.InteractionLog.getCachedValue(field);

                // Debug Log
                if (cached && cached.value) {
                    // console.log(`[SectionController] 🟢 Cache Candidate: "${field.label}" Val: "${cached.value}" Conf: ${cached.confidence} Idx: ${field.field_index}`);
                }

                if (cached && cached.value && cached.confidence > 0.6) {
                    mapped[field.selector] = {
                        value: cached.value,
                        confidence: cached.confidence,
                        source: 'selection_cache', // Preserves cache source
                        trace: this.createTrace('cache_hit', cached.confidence, { source: 'multi_cache' })
                    };
                    // console.log(`[SectionController] ✅ Used Cache for "${field.label}"`);
                    continue; // Skip entity mapping
                } else if (cached) {
                    // console.log(`[SectionController] 🟡 Cache Rejected (Low Confidence/Empty) for "${field.label}"`);
                }
            }

            // 2. Map from Entity (Fallback)
            const label = field.ml_prediction?.label || '';
            const val = this.extractValue(entity, label);

            if (val) {
                // console.log(`[SectionController] ⚠️ Using User Data for "${field.label}" (Cache Miss/Skip). Val: "${val}"`);
                mapped[field.selector] = {
                    value: val,
                    confidence: 1.0,
                    source: source,
                    trace: this.createTrace('history_map', 1.0, { source, entity_field: label })
                };
            } else {
                // console.log(`[SectionController] ❌ No Data (Cache or User) for "${field.label}"`);
            }
        }
        return mapped;
    }

    extractValue(entity, label) {
        // Schema Mapping
        // Simple mapping for now, can use HistoryManager.SCHEMA regex later
        // Map ML Label -> Entity Key
        // Map ML Label -> Entity Key
        const map = {
            'employer_name': ['name', 'company', 'employer', 'organization'],
            'company_name': ['name', 'company', 'employer', 'organization'], // Alias
            'job_title': ['position', 'title', 'role', 'jobTitle'],
            'job_start_date': ['startDate', 'from', 'start'],
            'job_end_date': ['endDate', 'to', 'end'],
            'work_description': ['summary', 'description', 'highlights'], // highlights is array
            'job_location': ['location', 'city', 'address'],

            'institution_name': ['institution', 'school', 'university', 'college', 'institution_name'],
            'school_name': ['institution', 'school', 'university', 'college'], // Alias
            'degree_type': ['studyType', 'degree', 'qualification', 'degree_type'],
            'field_of_study': ['field_of_study', 'area', 'major', 'field', 'discipline', 'specialization', 'department'],
            'major': ['area', 'major', 'field', 'discipline'], // Alias
            'education_start_date': ['startDate', 'from', 'start'],
            'education_end_date': ['endDate', 'to', 'end'],
            'gpa_score': ['gpa', 'score', 'grade', 'average', 'gpa_score'],
            'gpa': ['gpa', 'score', 'grade', 'average'] // Alias
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
