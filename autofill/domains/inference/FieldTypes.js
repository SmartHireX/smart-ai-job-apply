/**
 * FieldTypes.js
 * 
 * Canonical Form Field Classification Taxonomy
 * 
 * @module FieldTypes
 * @version 5.0.0
 * @author SmartHireX AI Team
 */

// ============================================================================
// FIELD TYPE ENUMERATION
// Total: 129 field types across 17 categories
// ============================================================================

// IIFE to prevent global scope pollution and re-declaration errors
// IIFE to prevent global scope pollution and re-declaration errors
(function () {

    // Guard clause: Prevent double execution
    if (typeof window !== 'undefined' && window.FieldTypes) {
        console.warn('[FieldTypes] Already initialized, skipping re-execution');
        return;
    }

    const FIELD_TYPES = Object.freeze({
        UNKNOWN: 'unknown',

        // =========================================================================
        // PERSONAL IDENTITY
        // =========================================================================
        FIRST_NAME: 'first_name',
        MIDDLE_NAME: 'middle_name',
        LAST_NAME: 'last_name',
        FULL_NAME: 'full_name',
        PREFERRED_NAME: 'preferred_name',
        PROFILE_PHOTO: 'profile_photo',

        // =========================================================================
        // CONTACT INFORMATION
        // =========================================================================
        EMAIL: 'email',
        EMAIL_SECONDARY: 'email_secondary',
        PHONE: 'phone',
        PHONE_HOME: 'phone_home',

        // =========================================================================
        // ONLINE PRESENCE
        // =========================================================================
        LINKEDIN_URL: 'linkedin_url',
        GITHUB_URL: 'github_url',
        PORTFOLIO_URL: 'portfolio_url',
        TWITTER_URL: 'twitter_url',

        // =========================================================================
        // LOCATION & ADDRESS
        // =========================================================================
        ADDRESS_LINE: 'address_line',
        CITY: 'city',
        STATE: 'state',
        ZIP_CODE: 'zip_code',
        COUNTRY: 'country',
        CURRENT_LOCATION: 'current_location',
        TIMEZONE: 'timezone',
        PREFERRED_LOCATION: 'preferred_location',

        // =========================================================================
        // WORK EXPERIENCE
        // =========================================================================
        JOB_TITLE: 'job_title',
        CURRENT_TITLE: 'current_title',
        COMPANY_NAME: 'company_name',
        CURRENT_COMPANY: 'current_company',
        JOB_START_DATE: 'job_start_date',
        JOB_END_DATE: 'job_end_date',
        JOB_DESCRIPTION: 'job_description',
        JOB_LOCATION: 'job_location',
        YEARS_EXPERIENCE: 'years_experience',

        // =========================================================================
        // EDUCATION
        // =========================================================================
        INSTITUTION_NAME: 'institution_name',
        DEGREE_TYPE: 'degree_type',
        FIELD_OF_STUDY: 'field_of_study',
        MAJOR: 'major',
        GPA: 'gpa',
        GRADUATION_DATE: 'graduation_date',
        EDUCATION_START_DATE: 'education_start_date',
        EDUCATION_END_DATE: 'education_end_date',
        EDUCATION_CURRENT: 'education_current',
        EDUCATION_LEVEL: 'education_level',

        // =========================================================================
        // SKILLS & QUALIFICATIONS
        // =========================================================================
        SKILLS: 'skills',
        TECHNICAL_SKILLS: 'technical_skills',
        CERTIFICATIONS: 'certifications',
        LANGUAGES: 'languages',
        LANGUAGE_PROFICIENCY: 'language_proficiency',
        YEARS_SKILL: 'years_skill',

        // =========================================================================
        // DEMOGRAPHICS
        // =========================================================================
        GENDER: 'gender',
        RACE: 'race',
        ETHNICITY: 'ethnicity',
        VETERAN: 'veteran',
        DISABILITY: 'disability',
        MARITAL_STATUS: 'marital_status',

        // =========================================================================
        // COMPENSATION
        // =========================================================================
        SALARY_CURRENT: 'salary_current',
        SALARY_EXPECTED: 'salary_expected',

        // =========================================================================
        // AVAILABILITY
        // =========================================================================
        NOTICE_PERIOD_IN_DAYS: 'notice_period_in_days',
        WORK_TYPE: 'work_type',
        SHIFT_PREFERENCE: 'shift_preference',

        // =========================================================================
        // PREFERENCES
        // =========================================================================
        REMOTE_PREFERENCE: 'remote_preference',
        JOB_TYPE_PREFERENCE: 'job_type_preference',
        WORK_STYLE: 'work_style',
        CAREER_GOALS: 'career_goals',
        INTEREST_AREAS: 'interest_areas',

        // =========================================================================
        // LEGAL & COMPLIANCE
        // =========================================================================
        WORK_AUTH: 'work_auth',
        SPONSORSHIP: 'sponsorship',
        VISA_STATUS: 'visa_status',
        CITIZENSHIP: 'citizenship',
        CLEARANCE: 'clearance',
        LEGAL_AGE: 'legal_age',
        TAX_ID: 'tax_id',
        DATE_OF_BIRTH: 'date_of_birth',
        BACKGROUND_CHECK: 'background_check',
        CRIMINAL_RECORD: 'criminal_record',
        DRUG_TEST: 'drug_test',

        // =========================================================================
        // FEDERAL & MILITARY
        // =========================================================================
        MILITARY_SERVICE: 'military_service',
        SERVICE_DATES: 'service_dates',
        DISCHARGE_STATUS: 'discharge_status',
        FEDERAL_EMPLOYEE: 'federal_employee',
        FEDERAL_GRADE: 'federal_grade',
        SCHEDULE_A: 'schedule_a',

        // =========================================================================
        // SUPPLEMENTAL
        // =========================================================================
        COVER_LETTER: 'cover_letter',
        ADDITIONAL_INFO: 'additional_info',
        INTRO_NOTE: 'intro_note',
        AGREEMENT: 'agreement'
    });

    // ============================================================================
    // CATEGORY GROUPINGS
    // ============================================================================

    const FIELD_CATEGORIES = Object.freeze({
        IDENTITY: 'identity',
        CONTACT: 'contact',
        ONLINE_PRESENCE: 'online_presence',
        LOCATION: 'location',
        WORK_EXPERIENCE: 'work_experience',
        EDUCATION: 'education',
        SKILLS: 'skills',
        REFERENCES: 'references',
        DEMOGRAPHICS: 'demographics',
        COMPENSATION: 'compensation',
        AVAILABILITY: 'availability',
        PREFERENCES: 'preferences',
        LEGAL: 'legal',
        FEDERAL: 'federal',
        ACADEMIC: 'academic',
        APPLICATION: 'application',
        SUPPLEMENTAL: 'supplemental',
        MISC: 'misc'
    });

    // ============================================================================
    // FIELD TO CATEGORY MAPPING
    // ============================================================================

    const FIELD_CATEGORY_MAP = Object.freeze({
        // Identity
        [FIELD_TYPES.FIRST_NAME]: FIELD_CATEGORIES.IDENTITY,
        [FIELD_TYPES.MIDDLE_NAME]: FIELD_CATEGORIES.IDENTITY,
        [FIELD_TYPES.LAST_NAME]: FIELD_CATEGORIES.IDENTITY,
        [FIELD_TYPES.FULL_NAME]: FIELD_CATEGORIES.IDENTITY,
        [FIELD_TYPES.PREFERRED_NAME]: FIELD_CATEGORIES.IDENTITY,
        [FIELD_TYPES.PROFILE_PHOTO]: FIELD_CATEGORIES.IDENTITY,

        // Contact
        [FIELD_TYPES.EMAIL]: FIELD_CATEGORIES.CONTACT,
        [FIELD_TYPES.EMAIL_SECONDARY]: FIELD_CATEGORIES.CONTACT,
        [FIELD_TYPES.PHONE]: FIELD_CATEGORIES.CONTACT,
        [FIELD_TYPES.PHONE_HOME]: FIELD_CATEGORIES.CONTACT,

        // Online Presence
        [FIELD_TYPES.LINKEDIN_URL]: FIELD_CATEGORIES.ONLINE_PRESENCE,
        [FIELD_TYPES.GITHUB_URL]: FIELD_CATEGORIES.ONLINE_PRESENCE,
        [FIELD_TYPES.PORTFOLIO_URL]: FIELD_CATEGORIES.ONLINE_PRESENCE,
        [FIELD_TYPES.TWITTER_URL]: FIELD_CATEGORIES.ONLINE_PRESENCE,

        // Location
        [FIELD_TYPES.ADDRESS_LINE]: FIELD_CATEGORIES.LOCATION,
        [FIELD_TYPES.CITY]: FIELD_CATEGORIES.LOCATION,
        [FIELD_TYPES.STATE]: FIELD_CATEGORIES.LOCATION,
        [FIELD_TYPES.ZIP_CODE]: FIELD_CATEGORIES.LOCATION,
        [FIELD_TYPES.COUNTRY]: FIELD_CATEGORIES.LOCATION,
        [FIELD_TYPES.CURRENT_LOCATION]: FIELD_CATEGORIES.LOCATION,
        [FIELD_TYPES.TIMEZONE]: FIELD_CATEGORIES.LOCATION,
        [FIELD_TYPES.PREFERRED_LOCATION]: FIELD_CATEGORIES.LOCATION,

        // Work Experience
        [FIELD_TYPES.JOB_TITLE]: FIELD_CATEGORIES.WORK_EXPERIENCE,
        [FIELD_TYPES.CURRENT_TITLE]: FIELD_CATEGORIES.WORK_EXPERIENCE,
        [FIELD_TYPES.COMPANY_NAME]: FIELD_CATEGORIES.WORK_EXPERIENCE,
        [FIELD_TYPES.CURRENT_COMPANY]: FIELD_CATEGORIES.WORK_EXPERIENCE,
        [FIELD_TYPES.JOB_START_DATE]: FIELD_CATEGORIES.WORK_EXPERIENCE,
        [FIELD_TYPES.JOB_END_DATE]: FIELD_CATEGORIES.WORK_EXPERIENCE,
        [FIELD_TYPES.JOB_DESCRIPTION]: FIELD_CATEGORIES.WORK_EXPERIENCE,
        [FIELD_TYPES.JOB_LOCATION]: FIELD_CATEGORIES.WORK_EXPERIENCE,
        [FIELD_TYPES.YEARS_EXPERIENCE]: FIELD_CATEGORIES.WORK_EXPERIENCE,

        // Education
        [FIELD_TYPES.INSTITUTION_NAME]: FIELD_CATEGORIES.EDUCATION,
        [FIELD_TYPES.DEGREE_TYPE]: FIELD_CATEGORIES.EDUCATION,
        [FIELD_TYPES.FIELD_OF_STUDY]: FIELD_CATEGORIES.EDUCATION,
        [FIELD_TYPES.MAJOR]: FIELD_CATEGORIES.EDUCATION,
        [FIELD_TYPES.GPA]: FIELD_CATEGORIES.EDUCATION,
        [FIELD_TYPES.GRADUATION_DATE]: FIELD_CATEGORIES.EDUCATION,
        [FIELD_TYPES.EDUCATION_START_DATE]: FIELD_CATEGORIES.EDUCATION,
        [FIELD_TYPES.EDUCATION_END_DATE]: FIELD_CATEGORIES.EDUCATION,
        [FIELD_TYPES.EDUCATION_CURRENT]: FIELD_CATEGORIES.EDUCATION,
        [FIELD_TYPES.EDUCATION_LEVEL]: FIELD_CATEGORIES.EDUCATION,

        // Skills
        [FIELD_TYPES.SKILLS]: FIELD_CATEGORIES.SKILLS,
        [FIELD_TYPES.TECHNICAL_SKILLS]: FIELD_CATEGORIES.SKILLS,
        [FIELD_TYPES.CERTIFICATIONS]: FIELD_CATEGORIES.SKILLS,
        [FIELD_TYPES.LANGUAGES]: FIELD_CATEGORIES.SKILLS,
        [FIELD_TYPES.LANGUAGE_PROFICIENCY]: FIELD_CATEGORIES.SKILLS,
        [FIELD_TYPES.YEARS_SKILL]: FIELD_CATEGORIES.SKILLS,

        // Demographics
        [FIELD_TYPES.GENDER]: FIELD_CATEGORIES.DEMOGRAPHICS,

        [FIELD_TYPES.RACE]: FIELD_CATEGORIES.DEMOGRAPHICS,
        [FIELD_TYPES.ETHNICITY]: FIELD_CATEGORIES.DEMOGRAPHICS,
        [FIELD_TYPES.VETERAN]: FIELD_CATEGORIES.DEMOGRAPHICS,
        [FIELD_TYPES.DISABILITY]: FIELD_CATEGORIES.DEMOGRAPHICS,
        [FIELD_TYPES.MARITAL_STATUS]: FIELD_CATEGORIES.DEMOGRAPHICS,

        // Compensation
        [FIELD_TYPES.SALARY_CURRENT]: FIELD_CATEGORIES.COMPENSATION,
        [FIELD_TYPES.SALARY_EXPECTED]: FIELD_CATEGORIES.COMPENSATION,


        // Availability
        [FIELD_TYPES.NOTICE_PERIOD_IN_DAYS]: FIELD_CATEGORIES.AVAILABILITY,
        [FIELD_TYPES.WORK_TYPE]: FIELD_CATEGORIES.AVAILABILITY,
        [FIELD_TYPES.SHIFT_PREFERENCE]: FIELD_CATEGORIES.AVAILABILITY,

        // Preferences
        [FIELD_TYPES.REMOTE_PREFERENCE]: FIELD_CATEGORIES.PREFERENCES,
        [FIELD_TYPES.JOB_TYPE_PREFERENCE]: FIELD_CATEGORIES.PREFERENCES,
        [FIELD_TYPES.WORK_STYLE]: FIELD_CATEGORIES.PREFERENCES,
        [FIELD_TYPES.CAREER_GOALS]: FIELD_CATEGORIES.PREFERENCES,
        [FIELD_TYPES.INTEREST_AREAS]: FIELD_CATEGORIES.PREFERENCES,

        // Legal
        [FIELD_TYPES.WORK_AUTH]: FIELD_CATEGORIES.LEGAL,
        [FIELD_TYPES.SPONSORSHIP]: FIELD_CATEGORIES.LEGAL,
        [FIELD_TYPES.VISA_STATUS]: FIELD_CATEGORIES.LEGAL,
        [FIELD_TYPES.CITIZENSHIP]: FIELD_CATEGORIES.LEGAL,
        [FIELD_TYPES.CLEARANCE]: FIELD_CATEGORIES.LEGAL,
        [FIELD_TYPES.LEGAL_AGE]: FIELD_CATEGORIES.LEGAL,
        [FIELD_TYPES.TAX_ID]: FIELD_CATEGORIES.LEGAL,
        [FIELD_TYPES.DATE_OF_BIRTH]: FIELD_CATEGORIES.LEGAL,
        [FIELD_TYPES.BACKGROUND_CHECK]: FIELD_CATEGORIES.LEGAL,
        [FIELD_TYPES.CRIMINAL_RECORD]: FIELD_CATEGORIES.LEGAL,
        [FIELD_TYPES.DRUG_TEST]: FIELD_CATEGORIES.LEGAL,

        // Federal/Military
        [FIELD_TYPES.MILITARY_SERVICE]: FIELD_CATEGORIES.FEDERAL,
        [FIELD_TYPES.SERVICE_DATES]: FIELD_CATEGORIES.FEDERAL,
        [FIELD_TYPES.DISCHARGE_STATUS]: FIELD_CATEGORIES.FEDERAL,
        [FIELD_TYPES.FEDERAL_EMPLOYEE]: FIELD_CATEGORIES.FEDERAL,
        [FIELD_TYPES.FEDERAL_GRADE]: FIELD_CATEGORIES.FEDERAL,
        [FIELD_TYPES.SCHEDULE_A]: FIELD_CATEGORIES.FEDERAL,

        // Supplemental
        [FIELD_TYPES.COVER_LETTER]: FIELD_CATEGORIES.SUPPLEMENTAL,
        [FIELD_TYPES.ADDITIONAL_INFO]: FIELD_CATEGORIES.SUPPLEMENTAL,
        [FIELD_TYPES.INTRO_NOTE]: FIELD_CATEGORIES.SUPPLEMENTAL,
        [FIELD_TYPES.AGREEMENT]: FIELD_CATEGORIES.SUPPLEMENTAL,

        // Misc
        [FIELD_TYPES.UNKNOWN]: FIELD_CATEGORIES.MISC
    });

    // ============================================================================
    // ORDERED CLASS LIST (Neural Network Output Layer)
    // Total: 87 classes (reduced from 88: work_style removed)
    // ============================================================================

    const ORDERED_CLASSES = Object.freeze([
        'unknown',              // 0

        // Identity (1-6)
        'first_name',           // 1
        'middle_name',          // 2
        'last_name',            // 3
        'full_name',            // 4
        'preferred_name',       // 5
        'profile_photo',        // 6

        // Contact (7-9)
        'email',                // 7
        'email_secondary',      // 8
        'phone',                // 9
        'phone_home',           // 10

        // Online Presence (11-14)
        'linkedin_url',         // 11
        'github_url',           // 12
        'portfolio_url',        // 13
        'twitter_url',          // 14

        // Location (15-22)
        'address_line',         // 15
        'city',                 // 16
        'state',                // 17
        'zip_code',             // 18
        'country',              // 19
        'current_location',     // 20
        'timezone',             // 21
        'preferred_location',   // 22

        // Work Experience (23-30)
        'job_title',            // 23
        'current_title',        // 24
        'company_name',         // 25
        'current_company',      // 26
        'job_start_date',       // 27
        'job_end_date',         // 28
        'job_description',      // 29
        'job_location',         // 30
        'years_experience',     // 31

        // Education (32-41)
        'institution_name',     // 32
        'degree_type',          // 33
        'field_of_study',       // 34
        'major',                // 35
        'gpa',                  // 36
        'graduation_date',      // 37
        'education_start_date', // 38
        'education_end_date',   // 39
        'education_current',    // 40
        'education_level',      // 41

        // Skills (42-47)
        'skills',               // 42
        'technical_skills',     // 43
        'certifications',       // 44
        'languages',            // 45
        'language_proficiency', // 46
        'years_skill',          // 47

        // Demographics (48-52)
        'gender',               // 48
        'race',                 // 49
        'ethnicity',            // 50
        'veteran',              // 51
        'disability',           // 52
        'marital_status',       // 53

        // Compensation (54-55)
        'salary_current',       // 54
        'salary_expected',      // 55

        // Availability (56-58)
        'notice_period_in_days', // 56
        'work_type',            // 57
        'shift_preference',     // 58

        // Preferences (60-63)
        'remote_preference',    // 60
        'job_type_preference',  // 61

        'career_goals',         // 63
        'interest_areas',       // 64

        // Legal (65-76)
        'work_auth',            // 65
        'sponsorship',          // 66
        'visa_status',          // 67
        'citizenship',          // 68
        'clearance',            // 69
        'legal_age',            // 70
        'tax_id',               // 71
        'date_of_birth',        // 72
        'background_check',     // 73
        'criminal_record',      // 74
        'drug_test',            // 75

        // Federal/Military (76-81)
        'military_service',     // 76
        'service_dates',        // 77
        'discharge_status',     // 78
        'federal_employee',     // 79
        'federal_grade',        // 80
        'schedule_a',           // 81

        // Supplemental (82-85)
        'cover_letter',         // 82
        'additional_info',      // 83
        'intro_note',           // 84
        'agreement',            // 85

        // Resume (86-88)
        'resume',               // 86
        'resume_text',          // 87
        'resume_upload'         // 88
    ]);

    // ============================================================================
    // UTILITY FUNCTIONS
    // ============================================================================

    function getFieldsByCategory(category) {
        return Object.entries(FIELD_CATEGORY_MAP)
            .filter(([_, cat]) => cat === category)
            .map(([field, _]) => field);
    }

    function getCategoryForField(fieldType) {
        return FIELD_CATEGORY_MAP[fieldType] || null;
    }

    function isValidFieldType(fieldType) {
        return ORDERED_CLASSES.includes(fieldType);
    }

    function getFieldTypeIndex(fieldType) {
        return ORDERED_CLASSES.indexOf(fieldType);
    }

    function getFieldTypeFromIndex(index) {
        return ORDERED_CLASSES[index] || null;
    }

    function getDisplayName(fieldType) {
        if (!fieldType) return 'Unknown';
        return fieldType
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    function getClassCount() {
        return ORDERED_CLASSES.length;
    }

    function getStats() {
        const categoryStats = {};
        Object.values(FIELD_CATEGORIES).forEach(cat => {
            categoryStats[cat] = getFieldsByCategory(cat).length;
        });
        return {
            totalTypes: ORDERED_CLASSES.length,
            categories: Object.keys(FIELD_CATEGORIES).length,
            byCategory: categoryStats
        };
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
            getFieldTypeFromIndex,
            getDisplayName,
            getClassCount,
            getStats
        };
        console.log('[Dependencies] FieldTypes V5.0 loaded into window');
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
            getFieldTypeFromIndex,
            getDisplayName,
            getClassCount,
            getStats
        };
    }

})();
