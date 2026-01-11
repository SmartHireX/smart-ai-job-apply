
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

    /**
     * Find best matching entity for a given text (e.g. "Stanf" -> Stanford Obj)
     */
    findEntity(query) {
        if (!query || query.length < 2) return null;

        // Search both work and edu
        const all = [...this.profile.work, ...this.profile.education];

        // Simple fuzzy search
        const match = all.find(e => {
            const primary = e.company || e.school || '';
            return this.fuzzyMatch(primary, query);
        });

        return match || null;
    },

    /**
     * Convert Entity to Mappings for a Batch
     * Uses 3-tier strategy: Cache → Resume → (AI handles remaining)
     * @param {Array} batch - Fields to fill
     * @param {Object} entity - Cached entity (optional, can be null)
     * @param {Object} resumeData - Resume data for fallback (optional)
     * @param {Number} index - Index for resume lookup (0, 1, 2...)
     */
    hydrateBatch(batch, entity, resumeData = null, index = 0) {
        const mappings = {};

        // Determine type from batch context
        const isWork = batch.some(f => /job|employ|work|company|position|title|role/i.test((f.name || '') + ' ' + (f.label || '')));
        const isEdu = batch.some(f => /degree|education|school|university|college|institution|major/i.test((f.name || '') + ' ' + (f.label || '')));

        const type = isWork ? 'work' : (isEdu ? 'education' : null);
        if (!type) return mappings;

        const schema = this.SCHEMA[type];

        // Get resume item as fallback
        let resumeItem = null;
        if (resumeData && !entity) {
            if (type === 'education') {
                const eduArray = resumeData.education || resumeData.schools || [];
                resumeItem = eduArray[index];
            } else if (type === 'work') {
                const workArray = resumeData.experience || resumeData.work || [];
                resumeItem = workArray[index];
            }
        }

        // Fill fields using cache or resume
        batch.forEach(f => {
            const text = (f.name || '') + ' ' + (f.label || '');

            // Try each schema property
            for (const [key, regex] of Object.entries(schema)) {
                if (regex.test(text)) {
                    let value = null;
                    let source = null;

                    // Priority 1: Use cached entity
                    if (entity && entity[key]) {
                        value = entity[key];
                        source = 'history-cache';
                    }
                    // Priority 2: Use resume data as fallback
                    else if (resumeItem) {
                        value = this.extractFromResume(resumeItem, key, type);
                        source = 'resume-data';
                    }

                    if (value) {
                        mappings[f.selector] = {
                            value: value,
                            confidence: source === 'history-cache' ? 1.0 : 0.95,
                            source: source,
                            meta: entity ? { entityId: entity.id } : { index, type }
                        };
                        break;
                    }
                }
            }
        });

        return mappings;
    },

    /**
     * Extract value from resume item based on schema key
     * @param {Object} resumeItem - Work or education entry from resume
     * @param {String} key - Schema key (company, title, startDate, etc.)
     * @param {String} type - 'work' or 'education'
     */
    extractFromResume(resumeItem, key, type) {
        if (!resumeItem) return null;

        if (type === 'work') {
            switch (key) {
                case 'company':
                    return resumeItem.company || resumeItem.employer || resumeItem.name || resumeItem.organization;
                case 'title':
                    return resumeItem.title || resumeItem.position || resumeItem.role || resumeItem.jobTitle;
                case 'startDate':
                    return resumeItem.startDate || resumeItem.from;
                case 'endDate':
                    return resumeItem.endDate || resumeItem.to || (resumeItem.current ? 'Present' : null);
                case 'description':
                    return resumeItem.description || resumeItem.summary || (resumeItem.highlights ? resumeItem.highlights.join('\n') : null);
                case 'location':
                    return resumeItem.location;
            }
        } else if (type === 'education') {
            switch (key) {
                case 'school':
                    return resumeItem.school || resumeItem.institution || resumeItem.university || resumeItem.schoolName;
                case 'degree':
                    return resumeItem.degree || resumeItem.qualification;
                case 'startDate':
                    return resumeItem.startDate || resumeItem.from;
                case 'endDate':
                    return resumeItem.endDate || resumeItem.to || resumeItem.graduationDate;
                case 'gpa':
                    return resumeItem.gpa || resumeItem.grade;
            }
        }

        return null;
    },

    // Helpers
    fuzzyMatch(a, b) {
        if (!a || !b) return false;
        const normA = a.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normB = b.toLowerCase().replace(/[^a-z0-9]/g, '');
        return normA.includes(normB) || normB.includes(normA);
    },

    generateId() {
        return 'hist_' + Math.random().toString(36).substr(2, 9);
    }
};

// Export to window
if (typeof window !== 'undefined') {
    window.HistoryManager = HistoryManager;
}
