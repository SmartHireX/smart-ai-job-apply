/**
 * FieldTypes.js
 * 
 * Canonical field type definitions for form classification.
 * Based on standard ATS (Applicant Tracking System) field schemas.
 * 
 * @module FieldTypes
 * @version 2.0.0
 * @author SmartHireX AI Team
 * 
 * Usage:
 *   import { FIELD_TYPES, FIELD_CATEGORIES, getFieldsByCategory } from './FieldTypes.js';
 */

// ============================================================================
// FIELD TYPE ENUMERATION
// Matches industry-standard ATS schemas (Greenhouse, Lever, Workday, iCIMS)
// ============================================================================

const FIELD_TYPES = Object.freeze({
    // Unknown/Unclassified
    UNKNOWN: 'unknown',

    // ======================== PERSONAL INFORMATION ========================
    FIRST_NAME: 'first_name',
    LAST_NAME: 'last_name',
    FULL_NAME: 'full_name',
    EMAIL: 'email',
    PHONE: 'phone',

    // ======================== SOCIAL & PORTFOLIO ========================
    LINKEDIN: 'linkedin',
    GITHUB: 'github',
    PORTFOLIO: 'portfolio',
    WEBSITE: 'website',
    TWITTER_URL: 'twitter_url',

    // ======================== LOCATION ========================
    ADDRESS: 'address',
    CITY: 'city',
    STATE: 'state',
    ZIP_CODE: 'zip_code',
    COUNTRY: 'country',

    // ======================== WORK HISTORY ========================
    JOB_TITLE: 'job_title',
    EMPLOYER_NAME: 'employer_name',
    JOB_START_DATE: 'job_start_date',
    JOB_END_DATE: 'job_end_date',
    WORK_DESCRIPTION: 'work_description',
    JOB_LOCATION: 'job_location',

    // ======================== EDUCATION ========================
    INSTITUTION_NAME: 'institution_name',
    DEGREE_TYPE: 'degree_type',
    FIELD_OF_STUDY: 'field_of_study',
    GPA_SCORE: 'gpa_score',
    EDUCATION_START_DATE: 'education_start_date',
    EDUCATION_END_DATE: 'education_end_date',

    // ======================== DEMOGRAPHICS (EEOC) ========================
    GENDER: 'gender',
    RACE: 'race',
    VETERAN: 'veteran',
    DISABILITY: 'disability',
    MARITAL_STATUS: 'marital_status',

    // ======================== COMPENSATION ========================
    SALARY_CURRENT: 'salary_current',
    SALARY_EXPECTED: 'salary_expected',

    // ======================== LEGAL & COMPLIANCE ========================
    WORK_AUTH: 'work_auth',
    SPONSORSHIP: 'sponsorship',
    CITIZENSHIP: 'citizenship',
    CLEARANCE: 'clearance',
    LEGAL_AGE: 'legal_age',
    TAX_ID: 'tax_id',
    CRIMINAL_RECORD: 'criminal_record',
    NOTICE_PERIOD: 'notice_period',

    // ======================== MISCELLANEOUS ========================
    REFERRAL_SOURCE: 'referral_source',
    COVER_LETTER: 'cover_letter',
    GENERIC_QUESTION: 'generic_question'
});

// ============================================================================
// CATEGORY GROUPINGS
// ============================================================================

const FIELD_CATEGORIES = Object.freeze({
    PERSONAL: 'personal',
    SOCIAL: 'social',
    LOCATION: 'location',
    WORK: 'work',
    EDUCATION: 'education',
    DEMOGRAPHICS: 'demographics',
    COMPENSATION: 'compensation',
    LEGAL: 'legal',
    MISC: 'misc'
});

// ============================================================================
// FIELD TO CATEGORY MAPPING
// ============================================================================

const FIELD_CATEGORY_MAP = Object.freeze({
    // Personal
    [FIELD_TYPES.FIRST_NAME]: FIELD_CATEGORIES.PERSONAL,
    [FIELD_TYPES.LAST_NAME]: FIELD_CATEGORIES.PERSONAL,
    [FIELD_TYPES.FULL_NAME]: FIELD_CATEGORIES.PERSONAL,
    [FIELD_TYPES.EMAIL]: FIELD_CATEGORIES.PERSONAL,
    [FIELD_TYPES.PHONE]: FIELD_CATEGORIES.PERSONAL,

    // Social
    [FIELD_TYPES.LINKEDIN]: FIELD_CATEGORIES.SOCIAL,
    [FIELD_TYPES.GITHUB]: FIELD_CATEGORIES.SOCIAL,
    [FIELD_TYPES.PORTFOLIO]: FIELD_CATEGORIES.SOCIAL,
    [FIELD_TYPES.WEBSITE]: FIELD_CATEGORIES.SOCIAL,
    [FIELD_TYPES.TWITTER_URL]: FIELD_CATEGORIES.SOCIAL,

    // Location
    [FIELD_TYPES.ADDRESS]: FIELD_CATEGORIES.LOCATION,
    [FIELD_TYPES.CITY]: FIELD_CATEGORIES.LOCATION,
    [FIELD_TYPES.STATE]: FIELD_CATEGORIES.LOCATION,
    [FIELD_TYPES.ZIP_CODE]: FIELD_CATEGORIES.LOCATION,
    [FIELD_TYPES.COUNTRY]: FIELD_CATEGORIES.LOCATION,

    // Work
    [FIELD_TYPES.JOB_TITLE]: FIELD_CATEGORIES.WORK,
    [FIELD_TYPES.EMPLOYER_NAME]: FIELD_CATEGORIES.WORK,
    [FIELD_TYPES.JOB_START_DATE]: FIELD_CATEGORIES.WORK,
    [FIELD_TYPES.JOB_END_DATE]: FIELD_CATEGORIES.WORK,
    [FIELD_TYPES.WORK_DESCRIPTION]: FIELD_CATEGORIES.WORK,
    [FIELD_TYPES.JOB_LOCATION]: FIELD_CATEGORIES.WORK,

    // Education
    [FIELD_TYPES.INSTITUTION_NAME]: FIELD_CATEGORIES.EDUCATION,
    [FIELD_TYPES.DEGREE_TYPE]: FIELD_CATEGORIES.EDUCATION,
    [FIELD_TYPES.FIELD_OF_STUDY]: FIELD_CATEGORIES.EDUCATION,
    [FIELD_TYPES.GPA_SCORE]: FIELD_CATEGORIES.EDUCATION,
    [FIELD_TYPES.EDUCATION_START_DATE]: FIELD_CATEGORIES.EDUCATION,
    [FIELD_TYPES.EDUCATION_END_DATE]: FIELD_CATEGORIES.EDUCATION,

    // Demographics
    [FIELD_TYPES.GENDER]: FIELD_CATEGORIES.DEMOGRAPHICS,
    [FIELD_TYPES.RACE]: FIELD_CATEGORIES.DEMOGRAPHICS,
    [FIELD_TYPES.VETERAN]: FIELD_CATEGORIES.DEMOGRAPHICS,
    [FIELD_TYPES.DISABILITY]: FIELD_CATEGORIES.DEMOGRAPHICS,
    [FIELD_TYPES.MARITAL_STATUS]: FIELD_CATEGORIES.DEMOGRAPHICS,

    // Compensation
    [FIELD_TYPES.SALARY_CURRENT]: FIELD_CATEGORIES.COMPENSATION,
    [FIELD_TYPES.SALARY_EXPECTED]: FIELD_CATEGORIES.COMPENSATION,

    // Legal
    [FIELD_TYPES.WORK_AUTH]: FIELD_CATEGORIES.LEGAL,
    [FIELD_TYPES.SPONSORSHIP]: FIELD_CATEGORIES.LEGAL,
    [FIELD_TYPES.CITIZENSHIP]: FIELD_CATEGORIES.LEGAL,
    [FIELD_TYPES.CLEARANCE]: FIELD_CATEGORIES.LEGAL,
    [FIELD_TYPES.LEGAL_AGE]: FIELD_CATEGORIES.LEGAL,
    [FIELD_TYPES.TAX_ID]: FIELD_CATEGORIES.LEGAL,
    [FIELD_TYPES.CRIMINAL_RECORD]: FIELD_CATEGORIES.LEGAL,
    [FIELD_TYPES.NOTICE_PERIOD]: FIELD_CATEGORIES.LEGAL,

    // Misc
    [FIELD_TYPES.REFERRAL_SOURCE]: FIELD_CATEGORIES.MISC,
    [FIELD_TYPES.COVER_LETTER]: FIELD_CATEGORIES.MISC,
    [FIELD_TYPES.GENERIC_QUESTION]: FIELD_CATEGORIES.MISC,
    [FIELD_TYPES.UNKNOWN]: FIELD_CATEGORIES.MISC
});

// ============================================================================
// ORDERED CLASS LIST (for Neural Network output layer)
// Order MUST remain stable for weight compatibility
// ============================================================================

const ORDERED_CLASSES = Object.freeze([
    'unknown',          // 0

    // Personal Info (1-5)
    'first_name',       // 1
    'last_name',        // 2
    'full_name',        // 3
    'email',            // 4
    'phone',            // 5

    // Social & Portfolio (6-10)
    'linkedin',         // 6
    'github',           // 7
    'portfolio',        // 8
    'website',          // 9
    'twitter_url',      // 10

    // Location (11-15)
    'address',          // 11
    'city',             // 12
    'state',            // 13
    'zip_code',         // 14
    'country',          // 15

    // Work History (16-21)
    'job_title',        // 16
    'employer_name',    // 17
    'job_start_date',   // 18
    'job_end_date',     // 19
    'work_description', // 20
    'job_location',     // 21

    // Education (22-27)
    'institution_name', // 22
    'degree_type',      // 23
    'field_of_study',   // 24
    'gpa_score',        // 25
    'education_start_date', // 26
    'education_end_date',   // 27

    // Demographics (28-32)
    'gender',           // 28
    'race',             // 29
    'veteran',          // 30
    'disability',       // 31
    'marital_status',   // 32

    // Compensation (33-34)
    'salary_current',   // 33
    'salary_expected',  // 34

    // Legal & Compliance (35-42)
    'work_auth',        // 35
    'sponsorship',      // 36
    'citizenship',      // 37
    'clearance',        // 38
    'legal_age',        // 39
    'tax_id',           // 40
    'criminal_record',  // 41
    'notice_period',    // 42

    // Misc (43-45)
    'referral_source',  // 43
    'cover_letter',     // 44
    'generic_question'  // 45
]);

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get all field types in a specific category
 * @param {string} category - Category from FIELD_CATEGORIES
 * @returns {string[]} Array of field type values
 */
function getFieldsByCategory(category) {
    return Object.entries(FIELD_CATEGORY_MAP)
        .filter(([_, cat]) => cat === category)
        .map(([field, _]) => field);
}

/**
 * Get the category for a specific field type
 * @param {string} fieldType - Field type value
 * @returns {string|null} Category or null if not found
 */
function getCategoryForField(fieldType) {
    return FIELD_CATEGORY_MAP[fieldType] || null;
}

/**
 * Check if a field type is valid
 * @param {string} fieldType - Field type to validate
 * @returns {boolean}
 */
function isValidFieldType(fieldType) {
    return ORDERED_CLASSES.includes(fieldType);
}

/**
 * Get the index of a field type in the neural network output layer
 * @param {string} fieldType - Field type value
 * @returns {number} Index or -1 if not found
 */
function getFieldTypeIndex(fieldType) {
    return ORDERED_CLASSES.indexOf(fieldType);
}

/**
 * Get the field type from a neural network output index
 * @param {number} index - Output layer index
 * @returns {string|null} Field type or null if invalid
 */
function getFieldTypeFromIndex(index) {
    return ORDERED_CLASSES[index] || null;
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof window !== 'undefined') {
    window.FieldTypes = {
        FIELD_TYPES,
        FIELD_CATEGORIES,
        FIELD_CATEGORY_MAP,
        ORDERED_CLASSES,
        getFieldsByCategory,
        getCategoryForField,
        isValidFieldType,
        getFieldTypeIndex,
        getFieldTypeFromIndex
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        FIELD_TYPES,
        FIELD_CATEGORIES,
        FIELD_CATEGORY_MAP,
        ORDERED_CLASSES,
        getFieldsByCategory,
        getCategoryForField,
        isValidFieldType,
        getFieldTypeIndex,
        getFieldTypeFromIndex
    };
}
