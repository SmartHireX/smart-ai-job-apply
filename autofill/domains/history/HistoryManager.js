/**
 * HistoryManager.js
 * 
 * Manages complex, multi-entry history sections (Work Experience, Education).
 * Handles:
 * 1. Hydrating batches of fields from Resume Data (Array structures).
 * 2. Mapping specific indices (Job 0, Job 1) to form fields.
 * 3. Learning from user edits to update the history model.
 */

class HistoryManager {
    constructor() {
        this.store = window.EntityStore || {};
    }

    /**
     * Hydrates a batch of fields using Resume Data and Entity Index.
     * @param {Array} batch - Array of field objects (selector, name, label, etc.)
     * @param {Object} entity - The specific entity (e.g. Job object) if already resolved (optional)
     * @param {Object} resumeData - Full resume data object
     * @param {number} index - The 0-based index of the entity (e.g. Job 0)
     * @returns {Object} structMappings - Map of selector -> { value, source, confidence }
     */
    hydrateBatch(batch, entity, resumeData, index = 0) {
        const mappings = {};

        // 1. Determine Context (Work or Education)
        const isEdu = batch.some(f => /school|education|degree|university|college/i.test(f.label || f.name));
        const section = isEdu ? (resumeData.education || resumeData.schools) : (resumeData.experience || resumeData.work);

        // 2. Resolve Entity (if not provided)
        const targetEntity = entity || (section && section[index]);

        if (!targetEntity) {
            console.warn(`[HistoryManager] No entity found for index ${index} (isEdu: ${isEdu})`);
            return mappings;
        }

        // 3. Map Fields
        batch.forEach(field => {
            const label = (field.label || '').toLowerCase();
            const name = (field.name || '').toLowerCase();

            let value = null;

            // Simple Heuristic Mapping (Robust enough for standard resumes)
            if (isEdu) {
                if (/school|university|institution|college/i.test(label) || /school/i.test(name)) value = targetEntity.institution || targetEntity.school;
                else if (/degree|qualification/i.test(label) || /degree/i.test(name)) value = targetEntity.degree || targetEntity.qualification;
                else if (/major|field|study/i.test(label) || /major/i.test(name)) value = targetEntity.fieldOfStudy || targetEntity.major;
                else if (/gpa|grade/i.test(label) || /gpa/i.test(name)) value = targetEntity.gpa || targetEntity.score;
                else if (/start/i.test(label) || /start/i.test(name)) value = targetEntity.startDate;
                else if (/end/i.test(label) || /end/i.test(name)) value = targetEntity.endDate;
            } else {
                // Work
                if (/company|employer/i.test(label) || /company/i.test(name)) value = targetEntity.company || targetEntity.employer;
                else if (/title|position|role/i.test(label) || /title/i.test(name)) value = targetEntity.title || targetEntity.position;
                else if (/description|responsibility|summary/i.test(label)) value = targetEntity.description || targetEntity.summary;
                else if (/start/i.test(label) || /start/i.test(name)) value = targetEntity.startDate;
                else if (/end/i.test(label) || /end/i.test(name)) value = targetEntity.endDate;
                else if (/location|city/i.test(label)) value = targetEntity.location || targetEntity.city;
            }

            if (value) {
                mappings[field.selector] = {
                    value: value,
                    confidence: 0.95,
                    source: 'history_manager',
                    entityId: `${isEdu ? 'edu' : 'work'}_${index}`
                };
            }
        });

        // console.log(`📜 [HistoryManager] Hydrated ${Object.keys(mappings).length} fields for Index ${index}`);
        return mappings;
    }

    /**
     * Learning loop: User edited a history field.
     */
    updateFromUserEdit(entityId, field, newValue) {
        console.log(`📜 [HistoryManager] Learning update for ${entityId}: ${field.label} -> ${newValue}`);
        // TODO: Implement persistent storage update (sync to EntityStore or LocalStorage)
        // For now, this is a placeholder to prevent crashes.
    }
}

// Export
if (typeof window !== 'undefined') {
    window.HistoryManager = new HistoryManager();
}
