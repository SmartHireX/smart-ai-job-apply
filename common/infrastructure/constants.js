/**
 * constants.js
 * Centralized constants and configuration values for the Smart AI Job Apply extension
 */

// ============ MESSAGE TYPES ============
const MESSAGE_TYPES = {
    GET_PAGE_CONTEXT: 'GET_PAGE_CONTEXT',
    DETECT_FORMS: 'DETECT_FORMS',
    START_LOCAL_PROCESSING: 'START_LOCAL_PROCESSING',
    UNDO_FILL: 'UNDO_FILL',
    TOGGLE_CHAT: 'TOGGLE_CHAT',
    FILL_COMPLETE: 'FILL_COMPLETE',
    AI_REQUEST: 'AI_REQUEST'
};

// ============ CONFIDENCE THRESHOLDS ============
const CONFIDENCE = {
    HIGH: 0.99,
    NEURAL_HIGH: 0.9,
    NEURAL_MATCH: 0.8,
    MEDIUM: 0.5,
    LOW: 0.3
};

// ============ CACHE TYPES ============
const CACHE_TYPES = {
    SMART_MEMORY: 'smart-memory',
    SELECTION_CACHE: 'selection-cache',
    HEURISTIC: 'heuristic',
    AI: 'ai',
    MANUAL: 'manual'
};

// ============ FIELD TYPES ============
const FIELD_TYPES = {
    TEXT: 'text',
    TEXTAREA: 'textarea',
    EMAIL: 'email',
    TEL: 'tel',
    URL: 'url',
    SEARCH: 'search',
    RADIO: 'radio',
    CHECKBOX: 'checkbox',
    SELECT: 'select',
    SELECT_ONE: 'select-one',
    SELECT_MULTIPLE: 'select-multiple'
};

// Text-based field types that can be cached in Smart Memory
const TEXT_FIELD_TYPES = new Set([
    FIELD_TYPES.TEXT,
    FIELD_TYPES.TEXTAREA,
    FIELD_TYPES.EMAIL,
    FIELD_TYPES.TEL,
    FIELD_TYPES.URL,
    FIELD_TYPES.SEARCH
]);

// Selection-based field types that use Selection Cache
const SELECTION_FIELD_TYPES = new Set([
    FIELD_TYPES.RADIO,
    FIELD_TYPES.CHECKBOX,
    FIELD_TYPES.SELECT,
    FIELD_TYPES.SELECT_ONE,
    FIELD_TYPES.SELECT_MULTIPLE
]);

// ============ NEURAL CLASSIFICATION LABELS ============
const NEURAL_LABELS = {
    // Work/Experience Fields
    JOB_TITLE: 'job_title',
    EMPLOYER_NAME: 'employer_name',
    JOB_START_DATE: 'job_start_date',
    JOB_END_DATE: 'job_end_date',
    WORK_DESCRIPTION: 'work_description',
    JOB_LOCATION: 'job_location',

    // Education Fields
    INSTITUTION_NAME: 'institution_name',
    DEGREE_TYPE: 'degree_type',
    FIELD_OF_STUDY: 'field_of_study',
    GPA_SCORE: 'gpa_score',
    EDUCATION_START_DATE: 'education_start_date',
    EDUCATION_END_DATE: 'education_end_date',

    // Other Common Fields
    SALARY_CURRENT: 'salary_current',
    UNKNOWN: 'unknown'
};

// Work-related labels
const WORK_LABELS = [
    NEURAL_LABELS.JOB_TITLE,
    NEURAL_LABELS.EMPLOYER_NAME,
    NEURAL_LABELS.JOB_START_DATE,
    NEURAL_LABELS.JOB_END_DATE,
    NEURAL_LABELS.WORK_DESCRIPTION,
    NEURAL_LABELS.JOB_LOCATION
];

// Education-related labels
const EDUCATION_LABELS = [
    NEURAL_LABELS.INSTITUTION_NAME,
    NEURAL_LABELS.DEGREE_TYPE,
    NEURAL_LABELS.FIELD_OF_STUDY,
    NEURAL_LABELS.GPA_SCORE,
    NEURAL_LABELS.EDUCATION_START_DATE,
    NEURAL_LABELS.EDUCATION_END_DATE
];

// All history-type labels (combined work + education)
const HISTORY_LABELS = [...WORK_LABELS, ...EDUCATION_LABELS];

// Labels for Smart Memory save operations (simplified list)
const HISTORY_LABELS_FOR_SAVE = [
    'job_title',
    'company',
    'job_start_date',
    'job_end_date',
    'school',
    'degree',
    'major',
    'gpa',
    'edu_start_date',
    'edu_end_date'
];

// Safe override patterns (can be cached even if they match history patterns)
const SAFE_OVERRIDE_PATTERN = /available|notice|relocat/i;

// ============ CACHE LIMITS ============
const CACHE_LIMITS = {
    MAX_VALUE_LENGTH: 500,           // Max characters to cache
    MIN_LABEL_LENGTH: 2,             // Min label length for caching
    MIN_QUALITY_LENGTH: 4,           // Min length for single-word labels
    MAX_NUMBER_RATIO: 0.33           // Max ratio of numbers in label
};

// ============ BATCH PROCESSING ============
const BATCH_CONFIG = {
    MUTATION_DEBOUNCE_MS: 500,       // Self-healing debounce
    PREFETCH_DELAY_MS: 300,          // Speculative prefetch delay
    SUCCESS_MESSAGE_DELAY_MS: 800    // Success widget display time
};

// ============ CSS CLASSES ============
const CSS_CLASSES = {
    FILLED: 'smarthirex-filled',
    FILLED_HIGH: 'smarthirex-filled-high',
    FILLED_MEDIUM: 'smarthirex-filled-medium',
    FILLED_LOW: 'smarthirex-filled-low',
    FIELD_HIGHLIGHT: 'smarthirex-field-highlight',
    TYPING: 'smarthirex-typing'
};

// ============ VALIDATION PATTERNS ============
const VALIDATION = {
    GENERIC_VALUES: /^(yes|no|ok|submit|cancel|true|false)$/i,
    SINGLE_WORD_MIN_LENGTH: 4
};

// ============ FEATURE FLAGS ============
const FEATURE_FLAGS = {
    NEW_ARCHITECTURE_KEY: 'novaai_new_arch'
};

// ============ AI CONFIGURATION ============
const AI_CONFIG = {
    MAX_TOKENS: 500,
    TEMPERATURE: 0.7,
    CONTEXT_LENGTH: 500              // Max context characters for AI prompts
};

// ============ GLOBAL EXPORT ============
// Export all constants to global scope for use by other modules
window.NovaConstants = {
    MESSAGE_TYPES,
    CONFIDENCE,
    CACHE_TYPES,
    FIELD_TYPES,
    TEXT_FIELD_TYPES,
    SELECTION_FIELD_TYPES,
    NEURAL_LABELS,
    WORK_LABELS,
    EDUCATION_LABELS,
    HISTORY_LABELS,
    HISTORY_LABELS_FOR_SAVE,
    SAFE_OVERRIDE_PATTERN,
    CACHE_LIMITS,
    BATCH_CONFIG,
    CSS_CLASSES,
    VALIDATION,
    FEATURE_FLAGS,
    AI_CONFIG
};
