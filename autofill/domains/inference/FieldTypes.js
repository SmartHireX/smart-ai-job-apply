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
        // =========================================================================
        // UNKNOWN
        // =========================================================================
        UNKNOWN: 'unknown',

        // =========================================================================
        // PERSONAL IDENTITY
        // =========================================================================
        FIRST_NAME: 'first_name',
        MIDDLE_NAME: 'middle_name',
        LAST_NAME: 'last_name',
        FULL_NAME: 'full_name',
        PREFERRED_NAME: 'preferred_name',
        HEADLINE: 'headline',
        SUMMARY: 'summary',
        PROFILE_PHOTO: 'profile_photo',

        // =========================================================================
        // CONTACT INFORMATION
        // =========================================================================
        EMAIL: 'email',
        EMAIL_SECONDARY: 'email_secondary',
        PHONE: 'phone',
        PHONE_MOBILE: 'phone_mobile',
        PHONE_HOME: 'phone_home',

        // =========================================================================
        // ONLINE PRESENCE
        // =========================================================================
        LINKEDIN_URL: 'linkedin_url',
        GITHUB_URL: 'github_url',
        PORTFOLIO_URL: 'portfolio_url',
        WEBSITE_URL: 'website_url',
        TWITTER_URL: 'twitter_url',
        FACEBOOK_URL: 'facebook_url',
        INSTAGRAM_URL: 'instagram_url',
        GOOGLE_SCHOLAR_URL: 'google_scholar_url',
        OTHER_URL: 'other_url',

        // =========================================================================
        // LOCATION & ADDRESS
        // =========================================================================
        ADDRESS_LINE_1: 'address_line_1',
        ADDRESS_LINE_2: 'address_line_2',
        CITY: 'city',
        STATE: 'state',
        ZIP_CODE: 'zip_code',
        COUNTRY: 'country',
        CURRENT_LOCATION: 'current_location',
        TIMEZONE: 'timezone',
        RELOCATION: 'relocation',
        PREFERRED_LOCATION: 'preferred_location',

        // =========================================================================
        // WORK EXPERIENCE
        // =========================================================================
        JOB_TITLE: 'job_title',
        CURRENT_TITLE: 'current_title',
        EMPLOYER_NAME: 'employer_name',
        CURRENT_COMPANY: 'current_company',
        JOB_START_DATE: 'job_start_date',
        JOB_END_DATE: 'job_end_date',
        JOB_CURRENT: 'job_current',
        JOB_DESCRIPTION: 'job_description',
        JOB_LOCATION: 'job_location',
        YEARS_EXPERIENCE: 'years_experience',
        INDUSTRY: 'industry',
        DEPARTMENT: 'department',

        // =========================================================================
        // EDUCATION
        // =========================================================================
        INSTITUTION_NAME: 'institution_name',
        SCHOOL_NAME: 'school_name',
        DEGREE_TYPE: 'degree_type',
        FIELD_OF_STUDY: 'field_of_study',
        MAJOR: 'major',
        MINOR: 'minor',
        GPA: 'gpa',
        GRADUATION_DATE: 'graduation_date',
        EDUCATION_START_DATE: 'education_start_date',
        EDUCATION_END_DATE: 'education_end_date',
        EDUCATION_CURRENT: 'education_current',
        HONORS: 'honors',
        EDUCATION_LEVEL: 'education_level',

        // =========================================================================
        // SKILLS & QUALIFICATIONS
        // =========================================================================
        SKILLS: 'skills',
        TECHNICAL_SKILLS: 'technical_skills',
        CERTIFICATIONS: 'certifications',
        LICENSES: 'licenses',
        LANGUAGES: 'languages',
        LANGUAGE_PROFICIENCY: 'language_proficiency',
        YEARS_SKILL: 'years_skill',
        SKILL_LEVEL: 'skill_level',

        // =========================================================================
        // REFERENCES
        // =========================================================================
        REFERENCE_NAME: 'reference_name',
        REFERENCE_EMAIL: 'reference_email',
        REFERENCE_PHONE: 'reference_phone',
        REFERENCE_RELATIONSHIP: 'reference_relationship',

        // =========================================================================
        // DEMOGRAPHICS
        // =========================================================================
        GENDER: 'gender',
        GENDER_IDENTITY: 'gender_identity',
        PRONOUNS: 'pronouns',
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
        SALARY_MINIMUM: 'salary_minimum',
        SALARY_CURRENCY: 'salary_currency',
        BONUS_EXPECTED: 'bonus_expected',
        EQUITY_EXPECTED: 'equity_expected',

        // =========================================================================
        // AVAILABILITY
        // =========================================================================
        START_DATE: 'start_date',
        AVAILABILITY: 'availability',
        NOTICE_PERIOD: 'notice_period',
        WORK_TYPE: 'work_type',
        SHIFT_PREFERENCE: 'shift_preference',
        TRAVEL_PERCENTAGE: 'travel_percentage',

        // =========================================================================
        // PREFERENCES
        // =========================================================================
        REMOTE_PREFERENCE: 'remote_preference',
        JOB_TYPE_PREFERENCE: 'job_type_preference',
        WORK_STYLE: 'work_style',
        COMMUNICATION_STYLE: 'communication_style',
        CAREER_GOALS: 'career_goals',
        DESIRED_ROLE: 'desired_role',
        INTEREST_AREAS: 'interest_areas',

        // =========================================================================
        // LEGAL & COMPLIANCE
        // =========================================================================
        WORK_AUTH: 'work_auth',
        SPONSORSHIP: 'sponsorship',
        VISA_STATUS: 'visa_status',
        CITIZENSHIP: 'citizenship',
        CLEARANCE: 'clearance',
        CLEARANCE_ACTIVE: 'clearance_active',
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
        // ACADEMIC & RESEARCH
        // =========================================================================
        PUBLICATIONS: 'publications',
        PATENTS: 'patents',
        RESEARCH_INTERESTS: 'research_interests',
        THESIS_TITLE: 'thesis_title',
        ADVISOR_NAME: 'advisor_name',

        // =========================================================================
        // APPLICATION CONTEXT
        // =========================================================================
        REFERRAL_SOURCE: 'referral_source',
        REFERRER_NAME: 'referrer_name',
        REFERRER_EMAIL: 'referrer_email',
        EMPLOYEE_ID: 'employee_id',
        JOB_ID: 'job_id',
        REQUISITION_ID: 'requisition_id',
        APPLICATION_DATE: 'application_date',
        RESUME_FILENAME: 'resume_filename',

        // =========================================================================
        // SUPPLEMENTAL
        // =========================================================================
        COVER_LETTER: 'cover_letter',
        ADDITIONAL_INFO: 'additional_info',
        NOTES: 'notes',
        INTRO_NOTE: 'intro_note',
        CUSTOM_QUESTION: 'custom_question',
        GENERIC_QUESTION: 'generic_question',
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
        [FIELD_TYPES.HEADLINE]: FIELD_CATEGORIES.IDENTITY,
        [FIELD_TYPES.SUMMARY]: FIELD_CATEGORIES.IDENTITY,
        [FIELD_TYPES.PROFILE_PHOTO]: FIELD_CATEGORIES.IDENTITY,

        // Contact
        [FIELD_TYPES.EMAIL]: FIELD_CATEGORIES.CONTACT,
        [FIELD_TYPES.EMAIL_SECONDARY]: FIELD_CATEGORIES.CONTACT,
        [FIELD_TYPES.PHONE]: FIELD_CATEGORIES.CONTACT,
        [FIELD_TYPES.PHONE_MOBILE]: FIELD_CATEGORIES.CONTACT,
        [FIELD_TYPES.PHONE_HOME]: FIELD_CATEGORIES.CONTACT,

        // Online Presence
        [FIELD_TYPES.LINKEDIN_URL]: FIELD_CATEGORIES.ONLINE_PRESENCE,
        [FIELD_TYPES.GITHUB_URL]: FIELD_CATEGORIES.ONLINE_PRESENCE,
        [FIELD_TYPES.PORTFOLIO_URL]: FIELD_CATEGORIES.ONLINE_PRESENCE,
        [FIELD_TYPES.WEBSITE_URL]: FIELD_CATEGORIES.ONLINE_PRESENCE,
        [FIELD_TYPES.TWITTER_URL]: FIELD_CATEGORIES.ONLINE_PRESENCE,
        [FIELD_TYPES.FACEBOOK_URL]: FIELD_CATEGORIES.ONLINE_PRESENCE,
        [FIELD_TYPES.INSTAGRAM_URL]: FIELD_CATEGORIES.ONLINE_PRESENCE,
        [FIELD_TYPES.GOOGLE_SCHOLAR_URL]: FIELD_CATEGORIES.ONLINE_PRESENCE,
        [FIELD_TYPES.OTHER_URL]: FIELD_CATEGORIES.ONLINE_PRESENCE,

        // Location
        [FIELD_TYPES.ADDRESS_LINE_1]: FIELD_CATEGORIES.LOCATION,
        [FIELD_TYPES.ADDRESS_LINE_2]: FIELD_CATEGORIES.LOCATION,
        [FIELD_TYPES.CITY]: FIELD_CATEGORIES.LOCATION,
        [FIELD_TYPES.STATE]: FIELD_CATEGORIES.LOCATION,
        [FIELD_TYPES.ZIP_CODE]: FIELD_CATEGORIES.LOCATION,
        [FIELD_TYPES.COUNTRY]: FIELD_CATEGORIES.LOCATION,
        [FIELD_TYPES.CURRENT_LOCATION]: FIELD_CATEGORIES.LOCATION,
        [FIELD_TYPES.TIMEZONE]: FIELD_CATEGORIES.LOCATION,
        [FIELD_TYPES.RELOCATION]: FIELD_CATEGORIES.LOCATION,
        [FIELD_TYPES.PREFERRED_LOCATION]: FIELD_CATEGORIES.LOCATION,

        // Work Experience
        [FIELD_TYPES.JOB_TITLE]: FIELD_CATEGORIES.WORK_EXPERIENCE,
        [FIELD_TYPES.CURRENT_TITLE]: FIELD_CATEGORIES.WORK_EXPERIENCE,
        [FIELD_TYPES.EMPLOYER_NAME]: FIELD_CATEGORIES.WORK_EXPERIENCE,
        [FIELD_TYPES.CURRENT_COMPANY]: FIELD_CATEGORIES.WORK_EXPERIENCE,
        [FIELD_TYPES.JOB_START_DATE]: FIELD_CATEGORIES.WORK_EXPERIENCE,
        [FIELD_TYPES.JOB_END_DATE]: FIELD_CATEGORIES.WORK_EXPERIENCE,
        [FIELD_TYPES.JOB_CURRENT]: FIELD_CATEGORIES.WORK_EXPERIENCE,
        [FIELD_TYPES.JOB_DESCRIPTION]: FIELD_CATEGORIES.WORK_EXPERIENCE,
        [FIELD_TYPES.JOB_LOCATION]: FIELD_CATEGORIES.WORK_EXPERIENCE,
        [FIELD_TYPES.YEARS_EXPERIENCE]: FIELD_CATEGORIES.WORK_EXPERIENCE,
        [FIELD_TYPES.INDUSTRY]: FIELD_CATEGORIES.WORK_EXPERIENCE,
        [FIELD_TYPES.DEPARTMENT]: FIELD_CATEGORIES.WORK_EXPERIENCE,

        // Education
        [FIELD_TYPES.INSTITUTION_NAME]: FIELD_CATEGORIES.EDUCATION,
        [FIELD_TYPES.SCHOOL_NAME]: FIELD_CATEGORIES.EDUCATION,
        [FIELD_TYPES.DEGREE_TYPE]: FIELD_CATEGORIES.EDUCATION,
        [FIELD_TYPES.FIELD_OF_STUDY]: FIELD_CATEGORIES.EDUCATION,
        [FIELD_TYPES.MAJOR]: FIELD_CATEGORIES.EDUCATION,
        [FIELD_TYPES.MINOR]: FIELD_CATEGORIES.EDUCATION,
        [FIELD_TYPES.GPA]: FIELD_CATEGORIES.EDUCATION,
        [FIELD_TYPES.GRADUATION_DATE]: FIELD_CATEGORIES.EDUCATION,
        [FIELD_TYPES.EDUCATION_START_DATE]: FIELD_CATEGORIES.EDUCATION,
        [FIELD_TYPES.EDUCATION_END_DATE]: FIELD_CATEGORIES.EDUCATION,
        [FIELD_TYPES.EDUCATION_CURRENT]: FIELD_CATEGORIES.EDUCATION,
        [FIELD_TYPES.HONORS]: FIELD_CATEGORIES.EDUCATION,
        [FIELD_TYPES.EDUCATION_LEVEL]: FIELD_CATEGORIES.EDUCATION,

        // Skills
        [FIELD_TYPES.SKILLS]: FIELD_CATEGORIES.SKILLS,
        [FIELD_TYPES.TECHNICAL_SKILLS]: FIELD_CATEGORIES.SKILLS,
        [FIELD_TYPES.CERTIFICATIONS]: FIELD_CATEGORIES.SKILLS,
        [FIELD_TYPES.LICENSES]: FIELD_CATEGORIES.SKILLS,
        [FIELD_TYPES.LANGUAGES]: FIELD_CATEGORIES.SKILLS,
        [FIELD_TYPES.LANGUAGE_PROFICIENCY]: FIELD_CATEGORIES.SKILLS,
        [FIELD_TYPES.YEARS_SKILL]: FIELD_CATEGORIES.SKILLS,
        [FIELD_TYPES.SKILL_LEVEL]: FIELD_CATEGORIES.SKILLS,

        // References
        [FIELD_TYPES.REFERENCE_NAME]: FIELD_CATEGORIES.REFERENCES,
        [FIELD_TYPES.REFERENCE_EMAIL]: FIELD_CATEGORIES.REFERENCES,
        [FIELD_TYPES.REFERENCE_PHONE]: FIELD_CATEGORIES.REFERENCES,
        [FIELD_TYPES.REFERENCE_RELATIONSHIP]: FIELD_CATEGORIES.REFERENCES,

        // Demographics
        [FIELD_TYPES.GENDER]: FIELD_CATEGORIES.DEMOGRAPHICS,
        [FIELD_TYPES.GENDER_IDENTITY]: FIELD_CATEGORIES.DEMOGRAPHICS,
        [FIELD_TYPES.PRONOUNS]: FIELD_CATEGORIES.DEMOGRAPHICS,
        [FIELD_TYPES.RACE]: FIELD_CATEGORIES.DEMOGRAPHICS,
        [FIELD_TYPES.ETHNICITY]: FIELD_CATEGORIES.DEMOGRAPHICS,
        [FIELD_TYPES.VETERAN]: FIELD_CATEGORIES.DEMOGRAPHICS,
        [FIELD_TYPES.DISABILITY]: FIELD_CATEGORIES.DEMOGRAPHICS,
        [FIELD_TYPES.MARITAL_STATUS]: FIELD_CATEGORIES.DEMOGRAPHICS,

        // Compensation
        [FIELD_TYPES.SALARY_CURRENT]: FIELD_CATEGORIES.COMPENSATION,
        [FIELD_TYPES.SALARY_EXPECTED]: FIELD_CATEGORIES.COMPENSATION,
        [FIELD_TYPES.SALARY_MINIMUM]: FIELD_CATEGORIES.COMPENSATION,
        [FIELD_TYPES.SALARY_CURRENCY]: FIELD_CATEGORIES.COMPENSATION,
        [FIELD_TYPES.BONUS_EXPECTED]: FIELD_CATEGORIES.COMPENSATION,
        [FIELD_TYPES.EQUITY_EXPECTED]: FIELD_CATEGORIES.COMPENSATION,

        // Availability
        [FIELD_TYPES.START_DATE]: FIELD_CATEGORIES.AVAILABILITY,
        [FIELD_TYPES.AVAILABILITY]: FIELD_CATEGORIES.AVAILABILITY,
        [FIELD_TYPES.NOTICE_PERIOD]: FIELD_CATEGORIES.AVAILABILITY,
        [FIELD_TYPES.WORK_TYPE]: FIELD_CATEGORIES.AVAILABILITY,
        [FIELD_TYPES.SHIFT_PREFERENCE]: FIELD_CATEGORIES.AVAILABILITY,
        [FIELD_TYPES.TRAVEL_PERCENTAGE]: FIELD_CATEGORIES.AVAILABILITY,

        // Preferences
        [FIELD_TYPES.REMOTE_PREFERENCE]: FIELD_CATEGORIES.PREFERENCES,
        [FIELD_TYPES.JOB_TYPE_PREFERENCE]: FIELD_CATEGORIES.PREFERENCES,
        [FIELD_TYPES.WORK_STYLE]: FIELD_CATEGORIES.PREFERENCES,
        [FIELD_TYPES.COMMUNICATION_STYLE]: FIELD_CATEGORIES.PREFERENCES,
        [FIELD_TYPES.CAREER_GOALS]: FIELD_CATEGORIES.PREFERENCES,
        [FIELD_TYPES.DESIRED_ROLE]: FIELD_CATEGORIES.PREFERENCES,
        [FIELD_TYPES.INTEREST_AREAS]: FIELD_CATEGORIES.PREFERENCES,

        // Legal
        [FIELD_TYPES.WORK_AUTH]: FIELD_CATEGORIES.LEGAL,
        [FIELD_TYPES.SPONSORSHIP]: FIELD_CATEGORIES.LEGAL,
        [FIELD_TYPES.VISA_STATUS]: FIELD_CATEGORIES.LEGAL,
        [FIELD_TYPES.CITIZENSHIP]: FIELD_CATEGORIES.LEGAL,
        [FIELD_TYPES.CLEARANCE]: FIELD_CATEGORIES.LEGAL,
        [FIELD_TYPES.CLEARANCE_ACTIVE]: FIELD_CATEGORIES.LEGAL,
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

        // Academic/Research
        [FIELD_TYPES.PUBLICATIONS]: FIELD_CATEGORIES.ACADEMIC,
        [FIELD_TYPES.PATENTS]: FIELD_CATEGORIES.ACADEMIC,
        [FIELD_TYPES.RESEARCH_INTERESTS]: FIELD_CATEGORIES.ACADEMIC,
        [FIELD_TYPES.THESIS_TITLE]: FIELD_CATEGORIES.ACADEMIC,
        [FIELD_TYPES.ADVISOR_NAME]: FIELD_CATEGORIES.ACADEMIC,

        // Application Context
        [FIELD_TYPES.REFERRAL_SOURCE]: FIELD_CATEGORIES.APPLICATION,
        [FIELD_TYPES.REFERRER_NAME]: FIELD_CATEGORIES.APPLICATION,
        [FIELD_TYPES.REFERRER_EMAIL]: FIELD_CATEGORIES.APPLICATION,
        [FIELD_TYPES.EMPLOYEE_ID]: FIELD_CATEGORIES.APPLICATION,
        [FIELD_TYPES.JOB_ID]: FIELD_CATEGORIES.APPLICATION,
        [FIELD_TYPES.REQUISITION_ID]: FIELD_CATEGORIES.APPLICATION,
        [FIELD_TYPES.APPLICATION_DATE]: FIELD_CATEGORIES.APPLICATION,
        [FIELD_TYPES.RESUME_FILENAME]: FIELD_CATEGORIES.APPLICATION,

        // Supplemental
        [FIELD_TYPES.COVER_LETTER]: FIELD_CATEGORIES.SUPPLEMENTAL,
        [FIELD_TYPES.ADDITIONAL_INFO]: FIELD_CATEGORIES.SUPPLEMENTAL,
        [FIELD_TYPES.NOTES]: FIELD_CATEGORIES.SUPPLEMENTAL,
        [FIELD_TYPES.INTRO_NOTE]: FIELD_CATEGORIES.SUPPLEMENTAL,
        [FIELD_TYPES.CUSTOM_QUESTION]: FIELD_CATEGORIES.SUPPLEMENTAL,
        [FIELD_TYPES.GENERIC_QUESTION]: FIELD_CATEGORIES.SUPPLEMENTAL,
        [FIELD_TYPES.AGREEMENT]: FIELD_CATEGORIES.SUPPLEMENTAL,

        // Misc
        [FIELD_TYPES.UNKNOWN]: FIELD_CATEGORIES.MISC
    });

    // ============================================================================
    // ORDERED CLASS LIST (Neural Network Output Layer)
    // Total: 129 classes
    // ============================================================================

    const ORDERED_CLASSES = Object.freeze([
        'unknown',              // 0

        // Identity (1-8)
        'first_name',           // 1
        'middle_name',          // 2
        'last_name',            // 3
        'full_name',            // 4
        'preferred_name',       // 5
        'headline',             // 6
        'summary',              // 7
        'profile_photo',        // 8

        // Contact (9-13)
        'email',                // 9
        'email_secondary',      // 10
        'phone',                // 11
        'phone_mobile',         // 12
        'phone_home',           // 13

        // Online Presence (14-22)
        'linkedin_url',         // 14
        'github_url',           // 15
        'portfolio_url',        // 16
        'website_url',          // 17
        'twitter_url',          // 18
        'facebook_url',         // 19
        'instagram_url',        // 20
        'google_scholar_url',   // 21
        'other_url',            // 22

        // Location (23-32)
        'address_line_1',       // 23
        'address_line_2',       // 24
        'city',                 // 25
        'state',                // 26
        'zip_code',             // 27
        'country',              // 28
        'current_location',     // 29
        'timezone',             // 30
        'relocation',           // 31
        'preferred_location',   // 32

        // Work Experience (33-44)
        'job_title',            // 33
        'current_title',        // 34
        'employer_name',        // 35
        'current_company',      // 36
        'job_start_date',       // 37
        'job_end_date',         // 38
        'job_current',          // 39
        'job_description',      // 40
        'job_location',         // 41
        'years_experience',     // 42
        'industry',             // 43
        'department',           // 44

        // Education (45-57)
        'institution_name',     // 45
        'school_name',          // 46
        'degree_type',          // 47
        'field_of_study',       // 48
        'major',                // 49
        'minor',                // 50
        'gpa',                  // 51
        'graduation_date',      // 52
        'education_start_date', // 53
        'education_end_date',   // 54
        'education_current',    // 55
        'honors',               // 56
        'education_level',      // 57

        // Skills (58-65)
        'skills',               // 58
        'technical_skills',     // 59
        'certifications',       // 60
        'licenses',             // 61
        'languages',            // 62
        'language_proficiency', // 63
        'years_skill',          // 64
        'skill_level',          // 65

        // References (66-69)
        'reference_name',       // 66
        'reference_email',      // 67
        'reference_phone',      // 68
        'reference_relationship', // 69

        // Demographics (70-77)
        'gender',               // 70
        'gender_identity',      // 71
        'pronouns',             // 72
        'race',                 // 73
        'ethnicity',            // 74
        'veteran',              // 75
        'disability',           // 76
        'marital_status',       // 77

        // Compensation (78-83)
        'salary_current',       // 78
        'salary_expected',      // 79
        'salary_minimum',       // 80
        'salary_currency',      // 81
        'bonus_expected',       // 82
        'equity_expected',      // 83

        // Availability (84-89)
        'start_date',           // 84
        'availability',         // 85
        'notice_period',        // 86
        'work_type',            // 87
        'shift_preference',     // 88
        'travel_percentage',    // 89

        // Preferences (90-96)
        'remote_preference',    // 90
        'job_type_preference',  // 91
        'work_style',           // 92
        'communication_style',  // 93
        'career_goals',         // 94
        'desired_role',         // 95
        'interest_areas',       // 96

        // Legal (97-108)
        'work_auth',            // 97
        'sponsorship',          // 98
        'visa_status',          // 99
        'citizenship',          // 100
        'clearance',            // 101
        'clearance_active',     // 102
        'legal_age',            // 103
        'tax_id',               // 104
        'date_of_birth',        // 105
        'background_check',     // 106
        'criminal_record',      // 107
        'drug_test',            // 108

        // Federal/Military (109-114)
        'military_service',     // 109
        'service_dates',        // 110
        'discharge_status',     // 111
        'federal_employee',     // 112
        'federal_grade',        // 113
        'schedule_a',           // 114

        // Academic (115-119)
        'publications',         // 115
        'patents',              // 116
        'research_interests',   // 117
        'thesis_title',         // 118
        'advisor_name',         // 119

        // Application Context (120-127)
        'referral_source',      // 120
        'referrer_name',        // 121
        'referrer_email',       // 122
        'employee_id',          // 123
        'job_id',               // 124
        'requisition_id',       // 125
        'application_date',     // 126
        'resume_filename',      // 127

        // Supplemental (128-134)
        'cover_letter',         // 128
        'additional_info',      // 129
        'notes',                // 130
        'intro_note',           // 131
        'custom_question',      // 132
        'generic_question',     // 133
        'agreement'             // 134
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
