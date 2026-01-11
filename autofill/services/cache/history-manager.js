/**
 * HistoryManager: Structured Entity Caching for Work & Education
 * Source of Truth for User Data (Jobs, Edu, Skills, etc.)
 */
const HistoryManager = {
    profile: {
        work: [],      // Array of Job Objects
        education: [], // Array of Education Objects

        // Multi-Value Arrays (Flat structure)
        skills: [],
        cities: [],
        languages: [],
        job_types: [],
        industries: [],
        // ... extendable
    },

    isInitialized: false,

    // Schema Mapping Config (Descriptive Keys)
    // Maps Field Labels (Regex) -> Storage Keys
    SCHEMA: {
        work: {
            employer_name: /company|employer|organization|business/i,
            job_title: /title|role|position|designation/i,
            job_start_date: /start.*date|from/i,
            job_end_date: /end.*date|to/i,
            work_description: /description|responsibilities|duty/i,
            job_location: /location|city|address/i
        },
        education: {
            institution_name: /school|university|college|institution/i,
            degree_type: /degree|qualification|major|course/i,
            field_of_study: /major|field|specialization/i,
            education_start_date: /start.*date|from/i,
            education_end_date: /end.*date|to|graduat/i,
            gpa_score: /gpa|grade|score/i
        },
        portfolio: {
            linkedin: /linkedin/i,
            github: /github/i,
            website: /website|portfolio|blog/i,
            twitter_url: /twitter|x\.com/i
        },
        personal: {
            marital_status: /marital|search_status/i
        },
        compensation: {
            salary_current: /current.*salary/i,
            salary_expected: /expected.*salary/i,
            desired_salary_text: /desired.*salary.*text|compensation.*expectation/i
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
                this.profile = { ...this.profile, ...result.smart_history_profile };
            }
            this.isInitialized = true;
            console.log('[HistoryManager] Initialized.');
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
        } catch (e) {
            console.error('[HistoryManager] Save failed:', e);
        }
    },

    /**
     * Retrieve a specific entity by Index
     * @param {string} type - 'work', 'education', 'skills', etc.
     * @param {number} index - 0-based index
     * @returns {Object|String|null} The entity/value or null
     */
    getByIndex(type, index) {
        if (!this.profile[type]) return null;

        const list = this.profile[type];
        if (index < 0 || index >= list.length) return null;

        return list[index];
    },

    /**
     * Add or Update an entity (called by BatchProcessor after AI fills)
     */
    async upsertEntity(type, newData) {
        // Logic to merge/append data
        // For arrays (skills), push unique.
        // For Objects (work), fuzzy match 'employer_name' or 'institution_name'.

        const list = this.profile[type];
        if (!Array.isArray(list)) return; // Should not happen

        // Case: Primitives (Skills)
        if (typeof newData === 'string') {
            if (!list.includes(newData)) {
                list.push(newData);
                this.save();
            }
            return;
        }

        // Case: Objects (Work/Edu)
        const primaryKey = type === 'work' ? 'employer_name' : 'institution_name';

        // 1. Validate Data Integrity
        if (!this.validateEntity(newData, primaryKey)) {
            console.warn('[HistoryManager] Skipped invalid entity:', newData);
            return;
        }

        const primaryVal = newData[primaryKey];
        if (!primaryVal) return;

        const existingIndex = list.findIndex(e => this.fuzzyMatch(e[primaryKey], primaryVal));

        if (existingIndex >= 0) {
            list[existingIndex] = { ...list[existingIndex], ...newData, lastUsed: Date.now() };
        } else {
            list.push({ ...newData, created: Date.now(), lastUsed: Date.now() });
        }
        this.save();
    },

    /**
     * Validate an entity before saving
     * Anti-Hallucination: Prevents "See Resume" or 1-char strings
     */
    validateEntity(data, primaryKey) {
        if (!data || typeof data !== 'object') return false;

        const primaryVal = data[primaryKey];
        if (!primaryVal || typeof primaryVal !== 'string') return false;

        // Rule 1: Too short (likely garbage or initial)
        if (primaryVal.trim().length < 2) return false;

        // Rule 2: Hallucination Keywords
        const BAD_PATTERNS = /see\s+resume|refer\s+to\s+resume|n\/a|unknown|various/i;
        if (BAD_PATTERNS.test(primaryVal)) return false;

        return true;
    },

    fuzzyMatch(a, b) {
        return (a || '').toLowerCase().includes((b || '').toLowerCase());
    }
};

if (typeof window !== 'undefined') window.HistoryManager = HistoryManager;
