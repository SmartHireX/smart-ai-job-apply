
/**
 * HistoryManager: Structured Entity Caching for Work & Education
 * Moves beyond key-value pairs to store cohesive objects (e.g. "Google" job with its specific dates).
 */
const HistoryManager = {
    profile: {
        work: [],
        education: []
    },

    isInitialized: false,

    // Schema Mapping Config
    SCHEMA: {
        work: {
            company: /company|employer|organization|business/i,
            title: /title|role|position|designation/i,
            startDate: /start.*date|from/i,
            endDate: /end.*date|to/i,
            description: /description|responsibilities|duty/i,
            location: /location|city|address/i
        },
        education: {
            school: /school|university|college|institution/i,
            degree: /degree|qualification|major|course/i,
            startDate: /start.*date|from/i,
            endDate: /end.*date|to|graduat/i,
            gpa: /gpa|grade|score/i
        }
    },

    /**
     * Initialize and load data from storage
     */
    async init() {
        if (this.isInitialized) return;
        try {
            const result = await chrome.storage.local.get(['smart_history_profile']);
            if (result.smart_history_profile) {
                this.profile = result.smart_history_profile;
            }
            this.isInitialized = true;
            console.log('[HistoryManager] Initialized with',
                this.profile.work.length, 'jobs,',
                this.profile.education.length, 'schools');
        } catch (e) {
            console.warn('[HistoryManager] Init failed:', e);
        }
    },

    /**
     * Save current profile to storage
     */
    async save() {
        try {
            await chrome.storage.local.set({ 'smart_history_profile': this.profile });
            console.log('[HistoryManager] Saved profile to storage');
        } catch (e) {
            console.error('[HistoryManager] Save failed:', e);
        }
    },

    /**
     * Retrieve a specific entity by Index
     * @param {string} type - 'work' or 'education'
     * @param {number} index - 0-based index
     * @returns {Object|null} The entity or null
     */
    getByIndex(type, index) {
        if (!this.profile[type]) return null;

        // Safety check index
        if (index < 0 || index >= this.profile[type].length) {
            console.warn(`[HistoryManager] Index ${index} out of bounds for ${type} (Length: ${this.profile[type].length})`);
            return null;
        }

        return this.profile[type][index];
    },

    /**
     * Analyze a filled batch and learn/update an entity
     * @param {Array} batch - Array of field objects
     * @param {Object} mappings - The values filled (from AI or Cache)
     * @returns {string|null} entityId if successfully learned
     */
    async learnFromBatch(batch, mappings) {
        if (!this.isInitialized) await this.init();

        // 1. Identify Topic (Work vs Edu)
        const isWork = batch.some(f => /job|employ|work|company/i.test((f.name || '') + ' ' + (f.label || '')));
        const isEdu = batch.some(f => /school|education|degree|university/i.test((f.name || '') + ' ' + (f.label || '')));

        if (!isWork && !isEdu) return null;

        const type = isWork ? 'work' : 'education';
        const schema = this.SCHEMA[type];

        // 2. Extract Data
        const data = {};
        let hasPrimary = false;

        batch.forEach(f => {
            const mapping = mappings[f.selector];
            if (!mapping || !mapping.value) return;

            const text = (f.name || '') + ' ' + (f.label || '');

            // Map to schema keys
            for (const [key, regex] of Object.entries(schema)) {
                if (regex.test(text)) {
                    data[key] = mapping.value;
                    if (key === 'company' || key === 'school') hasPrimary = true;
                    // Don't break, one field might match multiple (rare)
                }
            }
        });

        if (!hasPrimary) return null; // Need a primary key (Company/School)

        // 3. Upsert Entity
        return this.upsertEntity(type, data);
    },

    /**
     * Create or Update an entity in the list
     */
    upsertEntity(type, newData) {
        const list = this.profile[type];
        const primaryKey = type === 'work' ? 'company' : 'school';
        const primaryVal = newData[primaryKey];

        if (!primaryVal) return null;

        // Fuzzy Match existing
        const existingIndex = list.findIndex(e =>
            this.fuzzyMatch(e[primaryKey], primaryVal)
        );

        let entityId;

        if (existingIndex >= 0) {
            // Update existing
            console.log(`[HistoryManager] Updating existing ${type}: ${primaryVal}`);
            list[existingIndex] = { ...list[existingIndex], ...newData, lastUsed: Date.now() };
            entityId = list[existingIndex].id;
        } else {
            // Create new
            console.log(`[HistoryManager] Creating new ${type}: ${primaryVal}`);
            entityId = this.generateId();
            list.push({
                id: entityId,
                ...newData,
                created: Date.now(),
                lastUsed: Date.now()
            });
        }

        this.save();
        return entityId;
    },

    /**
     * Handle explicit user edit on a field
     * @param {string} entityId 
     * @param {string} fieldSelector - To identify field type? No, we need field Label/Name
     * @param {Object} fieldInfo - { label, name }
     * @param {string} newValue 
     */
    async updateFromUserEdit(entityId, fieldInfo, newValue) {
        if (!entityId) return;
        if (!this.isInitialized) await this.init();

        // Find Entity
        const workEntity = this.profile.work.find(e => e.id === entityId);
        const eduEntity = this.profile.education.find(e => e.id === entityId);

        let entity = workEntity || eduEntity;
        const type = workEntity ? 'work' : 'education';

        if (!entity) return;

        // Determine which property this field maps to
        const schema = this.SCHEMA[type];
        const text = (fieldInfo.name || '') + ' ' + (fieldInfo.label || '');
        let targetKey = null;

        for (const [key, regex] of Object.entries(schema)) {
            if (regex.test(text)) {
                targetKey = key;
                break;
            }
        }

        if (targetKey) {
            console.log(`[HistoryManager] User Edit: Updating ${type}.${targetKey} -> "${newValue}"`);
            entity[targetKey] = newValue;
            entity.lastUsed = Date.now();
            this.save();
        }
    },

    // --- RETRIEVAL LOGIC ---

    /**
     * Find an entity by name in the history
     * @param {string} name - Company or School name
     * @returns {Object|null} The entity if found
     */
    findEntity(name) {
        if (!name) return null;
        if (!this.isInitialized) {
            console.warn('[HistoryManager] findEntity called before init, cached results might be missed.');
        }

        // Search Work
        const workMatch = this.profile.work.find(e => this.fuzzyMatch(e.company, name));
        if (workMatch) return workMatch;

        // Search Education
        const eduMatch = this.profile.education.find(e => this.fuzzyMatch(e.school, name));
        if (eduMatch) return eduMatch;

        return null;
    },

    /**
     * Generate mappings for a batch based on a specific entity or resume fallback
     * @param {Array} batch - Fields 
     * @param {Object|null} entity - The cached history entity (if found)
     * @param {Object} resumeData - Full resume data (for fallback)
     * @param {number} index - The index of the job/school (0, 1, 2)
     */
    hydrateBatch(batch, entity, resumeData, index) {
        const mappings = {};

        // Determine type of the batch (Work vs Edu)
        const isWork = batch.some(f => /job|employ|work|company|position/i.test((f.name || '') + ' ' + (f.label || '')));
        const type = isWork ? 'work' : 'education';
        const schema = this.SCHEMA[type];

        // Data Source: Entity (Cache) > Resume (Fresh Parse)
        let sourceData = entity;
        if (!sourceData) {
            // Fallback to Resume Data
            if (isWork) {
                const experiences = resumeData.experience || resumeData.work || [];
                sourceData = experiences[index];
            } else {
                const educations = resumeData.education || resumeData.schools || [];
                sourceData = educations[index];
            }
        }

        if (!sourceData) return {};

        // Map fields
        batch.forEach(field => {
            const text = (field.name || '') + ' ' + (field.label || '');
            let matchedValue = null;

            // Map standard schema keys to source data
            for (const [key, regex] of Object.entries(schema)) {
                if (regex.test(text)) {
                    // MAPPING LOGIC
                    // 1. Exact Key Match in Source
                    if (sourceData[key]) matchedValue = sourceData[key];

                    // 2. Resume Schema Variations (if source is raw resume)
                    else if (!entity) {
                        if (key === 'company') matchedValue = sourceData.employer || sourceData.name || sourceData.organization;
                        if (key === 'school') matchedValue = sourceData.institution || sourceData.schoolName;
                        if (key === 'title') matchedValue = sourceData.role || sourceData.designation;
                    }

                    break;
                }
            }

            if (matchedValue) {
                mappings[field.selector] = {
                    value: matchedValue,
                    confidence: entity ? 0.99 : 0.85, // Cache is trusted more than parser
                    source: entity ? 'history-cache' : 'resume-inference'
                };
            }
        });

        return mappings;
    },

    // --- SMART LOGIC ---

    /**
     * Check if start date is logically before end date
     */
    validateDates(start, end) {
        if (!start || !end || end.toLowerCase() === 'present') return true;
        const d1 = new Date(start);
        const d2 = new Date(end);
        if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return true; // Can't validate
        return d1 <= d2;
    },

    /**
     * Normalize Company/School names for merging
     * Removes suffixes: Inc, LLC, Corp, Ltd, etc.
     */
    normalizeName(name) {
        if (!name) return '';
        return name.toLowerCase()
            .replace(/[,.]/g, '') // Remove punctuation
            .replace(/\s(inc|llc|corp|ltd|co|limited|corporation|group|technologies|solutions)$/i, '') // Remove business suffixes
            .trim();
    },

    /**
     * Enhanced Fuzzy Match with Normalization
     */
    fuzzyMatch(a, b) {
        if (!a || !b) return false;
        const normA = this.normalizeName(a);
        const normB = this.normalizeName(b);
        return normA === normB || normA.includes(normB) || normB.includes(normA);
    },

    generateId() {
        return 'hist_' + Math.random().toString(36).substr(2, 9);
    }
};

// Export to window
if (typeof window !== 'undefined') {
    window.HistoryManager = HistoryManager;
}
