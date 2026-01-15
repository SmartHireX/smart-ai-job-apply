/**
 * FieldTypes.js
 * 
 * Canonical Form Field Classification Taxonomy
 * 
 * Enterprise-grade form field type definitions for job application platforms.
 * 
 * @module FieldTypes
 * @version 5.0.0
 * @author SmartHireX AI Team
 */

// ============================================================================
// FIELD TYPE ENUMERATION
// Total: 135 field types across 18 categories
// ============================================================================

const FIELD_TYPES = Object.freeze({

    // =========================================================================
    // UNKNOWN / UNCLASSIFIED
    // =========================================================================
    UNCLASSIFIED_FIELD: 'unclassified_field',

    // =========================================================================
    // PERSONAL IDENTITY
    // =========================================================================
    APPLICANT_FIRST_NAME: 'applicant_first_name',
    APPLICANT_MIDDLE_NAME: 'applicant_middle_name',
    APPLICANT_LAST_NAME: 'applicant_last_name',
    APPLICANT_FULL_NAME: 'applicant_full_name',
    APPLICANT_PREFERRED_NAME: 'applicant_preferred_name',
    PROFESSIONAL_HEADLINE: 'professional_headline',
    PROFESSIONAL_SUMMARY: 'professional_summary',
    APPLICANT_PROFILE_PHOTO: 'applicant_profile_photo',

    // =========================================================================
    // CONTACT INFORMATION
    // =========================================================================
    PRIMARY_EMAIL_ADDRESS: 'primary_email_address',
    SECONDARY_EMAIL_ADDRESS: 'secondary_email_address',
    PRIMARY_PHONE_NUMBER: 'primary_phone_number',
    MOBILE_PHONE_NUMBER: 'mobile_phone_number',
    HOME_PHONE_NUMBER: 'home_phone_number',

    // =========================================================================
    // ONLINE PRESENCE & SOCIAL PROFILES
    // =========================================================================
    LINKEDIN_PROFILE_URL: 'linkedin_profile_url',
    GITHUB_PROFILE_URL: 'github_profile_url',
    PORTFOLIO_WEBSITE_URL: 'portfolio_website_url',
    PERSONAL_WEBSITE_URL: 'personal_website_url',
    TWITTER_PROFILE_URL: 'twitter_profile_url',
    FACEBOOK_PROFILE_URL: 'facebook_profile_url',
    INSTAGRAM_PROFILE_URL: 'instagram_profile_url',
    GOOGLE_SCHOLAR_PROFILE_URL: 'google_scholar_profile_url',
    OTHER_WEBSITE_URL: 'other_website_url',

    // =========================================================================
    // LOCATION & ADDRESS
    // =========================================================================
    STREET_ADDRESS_LINE_1: 'street_address_line_1',
    STREET_ADDRESS_LINE_2: 'street_address_line_2',
    CITY_NAME: 'city_name',
    STATE_OR_PROVINCE: 'state_or_province',
    ZIP_OR_POSTAL_CODE: 'zip_or_postal_code',
    COUNTRY_NAME: 'country_name',
    CURRENT_LOCATION_COMBINED: 'current_location_combined',
    APPLICANT_TIMEZONE: 'applicant_timezone',
    RELOCATION_WILLINGNESS: 'relocation_willingness',
    PREFERRED_WORK_LOCATION: 'preferred_work_location',

    // =========================================================================
    // WORK EXPERIENCE & EMPLOYMENT HISTORY
    // =========================================================================
    POSITION_TITLE: 'position_title',
    CURRENT_POSITION_TITLE: 'current_position_title',
    EMPLOYER_COMPANY_NAME: 'employer_company_name',
    CURRENT_EMPLOYER_NAME: 'current_employer_name',
    EMPLOYMENT_START_DATE: 'employment_start_date',
    EMPLOYMENT_END_DATE: 'employment_end_date',
    CURRENTLY_EMPLOYED_HERE: 'currently_employed_here',
    JOB_RESPONSIBILITIES_DESCRIPTION: 'job_responsibilities_description',
    JOB_WORK_LOCATION: 'job_work_location',
    TOTAL_YEARS_OF_EXPERIENCE: 'total_years_of_experience',
    INDUSTRY_SECTOR: 'industry_sector',
    DEPARTMENT_OR_TEAM: 'department_or_team',

    // =========================================================================
    // EDUCATION & ACADEMIC BACKGROUND
    // =========================================================================
    EDUCATIONAL_INSTITUTION_NAME: 'educational_institution_name',
    SCHOOL_OR_UNIVERSITY_NAME: 'school_or_university_name',
    DEGREE_TYPE_OBTAINED: 'degree_type_obtained',
    ACADEMIC_FIELD_OF_STUDY: 'academic_field_of_study',
    ACADEMIC_MAJOR_CONCENTRATION: 'academic_major_concentration',
    ACADEMIC_MINOR_CONCENTRATION: 'academic_minor_concentration',
    GRADE_POINT_AVERAGE: 'grade_point_average',
    EXPECTED_GRADUATION_DATE: 'expected_graduation_date',
    EDUCATION_START_DATE: 'education_start_date',
    EDUCATION_END_DATE: 'education_end_date',
    CURRENTLY_ENROLLED_STUDENT: 'currently_enrolled_student',
    ACADEMIC_HONORS_AND_AWARDS: 'academic_honors_and_awards',
    HIGHEST_EDUCATION_LEVEL: 'highest_education_level',

    // =========================================================================
    // SKILLS & PROFESSIONAL QUALIFICATIONS
    // =========================================================================
    GENERAL_SKILLS_LIST: 'general_skills_list',
    TECHNICAL_SKILLS_LIST: 'technical_skills_list',
    PROFESSIONAL_CERTIFICATIONS: 'professional_certifications',
    PROFESSIONAL_LICENSES: 'professional_licenses',
    SPOKEN_LANGUAGES: 'spoken_languages',
    LANGUAGE_PROFICIENCY_LEVEL: 'language_proficiency_level',
    YEARS_OF_SKILL_EXPERIENCE: 'years_of_skill_experience',
    SKILL_PROFICIENCY_LEVEL: 'skill_proficiency_level',

    // =========================================================================
    // PROFESSIONAL REFERENCES
    // =========================================================================
    REFERENCE_FULL_NAME: 'reference_full_name',
    REFERENCE_EMAIL_ADDRESS: 'reference_email_address',
    REFERENCE_PHONE_NUMBER: 'reference_phone_number',
    REFERENCE_RELATIONSHIP_TYPE: 'reference_relationship_type',

    // =========================================================================
    // DEMOGRAPHICS & EEOC COMPLIANCE
    // =========================================================================
    GENDER_IDENTITY: 'gender_identity',
    EXTENDED_GENDER_IDENTITY: 'extended_gender_identity',
    PREFERRED_PRONOUNS: 'preferred_pronouns',
    RACIAL_BACKGROUND: 'racial_background',
    ETHNIC_BACKGROUND: 'ethnic_background',
    VETERAN_STATUS: 'veteran_status',
    DISABILITY_STATUS: 'disability_status',
    MARITAL_STATUS: 'marital_status',

    // =========================================================================
    // COMPENSATION & BENEFITS
    // =========================================================================
    CURRENT_ANNUAL_SALARY: 'current_annual_salary',
    EXPECTED_ANNUAL_SALARY: 'expected_annual_salary',
    MINIMUM_ACCEPTABLE_SALARY: 'minimum_acceptable_salary',
    SALARY_CURRENCY_PREFERENCE: 'salary_currency_preference',
    EXPECTED_BONUS_PERCENTAGE: 'expected_bonus_percentage',
    EXPECTED_EQUITY_COMPENSATION: 'expected_equity_compensation',

    // =========================================================================
    // AVAILABILITY & SCHEDULING
    // =========================================================================
    AVAILABLE_START_DATE: 'available_start_date',
    GENERAL_AVAILABILITY: 'general_availability',
    REQUIRED_NOTICE_PERIOD: 'required_notice_period',
    EMPLOYMENT_TYPE_PREFERENCE: 'employment_type_preference',
    SHIFT_SCHEDULE_PREFERENCE: 'shift_schedule_preference',
    TRAVEL_WILLINGNESS_PERCENTAGE: 'travel_willingness_percentage',

    // =========================================================================
    // WORK PREFERENCES & CAREER GOALS
    // =========================================================================
    REMOTE_WORK_PREFERENCE: 'remote_work_preference',
    CONTRACT_TYPE_PREFERENCE: 'contract_type_preference',
    PREFERRED_WORK_STYLE: 'preferred_work_style',
    PREFERRED_COMMUNICATION_STYLE: 'preferred_communication_style',
    CAREER_OBJECTIVES: 'career_objectives',
    DESIRED_JOB_ROLE: 'desired_job_role',
    PROFESSIONAL_INTEREST_AREAS: 'professional_interest_areas',

    // =========================================================================
    // LEGAL STATUS & COMPLIANCE
    // =========================================================================
    WORK_AUTHORIZATION_STATUS: 'work_authorization_status',
    VISA_SPONSORSHIP_REQUIRED: 'visa_sponsorship_required',
    CURRENT_VISA_STATUS: 'current_visa_status',
    COUNTRY_OF_CITIZENSHIP: 'country_of_citizenship',
    SECURITY_CLEARANCE_LEVEL: 'security_clearance_level',
    SECURITY_CLEARANCE_ACTIVE: 'security_clearance_active',
    LEGAL_WORKING_AGE_CONFIRMATION: 'legal_working_age_confirmation',
    TAX_IDENTIFICATION_NUMBER: 'tax_identification_number',
    DATE_OF_BIRTH: 'date_of_birth',
    BACKGROUND_CHECK_CONSENT: 'background_check_consent',
    CRIMINAL_HISTORY_DISCLOSURE: 'criminal_history_disclosure',
    DRUG_TEST_CONSENT: 'drug_test_consent',

    // =========================================================================
    // FEDERAL & MILITARY SERVICE
    // =========================================================================
    MILITARY_BRANCH_SERVED: 'military_branch_served',
    MILITARY_SERVICE_DATES: 'military_service_dates',
    MILITARY_DISCHARGE_STATUS: 'military_discharge_status',
    FEDERAL_EMPLOYEE_STATUS: 'federal_employee_status',
    FEDERAL_PAY_GRADE: 'federal_pay_grade',
    SCHEDULE_A_ELIGIBILITY: 'schedule_a_eligibility',

    // =========================================================================
    // ACADEMIC RESEARCH & PUBLICATIONS
    // =========================================================================
    ACADEMIC_PUBLICATIONS_LIST: 'academic_publications_list',
    PATENTS_HELD: 'patents_held',
    RESEARCH_INTEREST_AREAS: 'research_interest_areas',
    THESIS_DISSERTATION_TITLE: 'thesis_dissertation_title',
    ACADEMIC_ADVISOR_NAME: 'academic_advisor_name',

    // =========================================================================
    // APPLICATION CONTEXT & METADATA
    // =========================================================================
    APPLICATION_REFERRAL_SOURCE: 'application_referral_source',
    EMPLOYEE_REFERRER_NAME: 'employee_referrer_name',
    EMPLOYEE_REFERRER_EMAIL: 'employee_referrer_email',
    INTERNAL_EMPLOYEE_ID: 'internal_employee_id',
    POSITION_JOB_ID: 'position_job_id',
    REQUISITION_NUMBER: 'requisition_number',
    APPLICATION_SUBMISSION_DATE: 'application_submission_date',
    RESUME_FILE_UPLOAD: 'resume_file_upload',

    // =========================================================================
    // SUPPLEMENTAL INFORMATION
    // =========================================================================
    COVER_LETTER_CONTENT: 'cover_letter_content',
    ADDITIONAL_INFORMATION_TEXT: 'additional_information_text',
    GENERAL_NOTES_FIELD: 'general_notes_field',
    INTRODUCTION_NOTE_TEXT: 'introduction_note_text',
    CUSTOM_SCREENING_QUESTION: 'custom_screening_question',
    GENERIC_APPLICATION_QUESTION: 'generic_application_question',
    TERMS_AND_CONDITIONS_AGREEMENT: 'terms_and_conditions_agreement'
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
    [FIELD_TYPES.APPLICANT_FIRST_NAME]: FIELD_CATEGORIES.IDENTITY,
    [FIELD_TYPES.APPLICANT_MIDDLE_NAME]: FIELD_CATEGORIES.IDENTITY,
    [FIELD_TYPES.APPLICANT_LAST_NAME]: FIELD_CATEGORIES.IDENTITY,
    [FIELD_TYPES.APPLICANT_FULL_NAME]: FIELD_CATEGORIES.IDENTITY,
    [FIELD_TYPES.APPLICANT_PREFERRED_NAME]: FIELD_CATEGORIES.IDENTITY,
    [FIELD_TYPES.PROFESSIONAL_HEADLINE]: FIELD_CATEGORIES.IDENTITY,
    [FIELD_TYPES.PROFESSIONAL_SUMMARY]: FIELD_CATEGORIES.IDENTITY,
    [FIELD_TYPES.APPLICANT_PROFILE_PHOTO]: FIELD_CATEGORIES.IDENTITY,

    // Contact
    [FIELD_TYPES.PRIMARY_EMAIL_ADDRESS]: FIELD_CATEGORIES.CONTACT,
    [FIELD_TYPES.SECONDARY_EMAIL_ADDRESS]: FIELD_CATEGORIES.CONTACT,
    [FIELD_TYPES.PRIMARY_PHONE_NUMBER]: FIELD_CATEGORIES.CONTACT,
    [FIELD_TYPES.MOBILE_PHONE_NUMBER]: FIELD_CATEGORIES.CONTACT,
    [FIELD_TYPES.HOME_PHONE_NUMBER]: FIELD_CATEGORIES.CONTACT,

    // Online Presence
    [FIELD_TYPES.LINKEDIN_PROFILE_URL]: FIELD_CATEGORIES.ONLINE_PRESENCE,
    [FIELD_TYPES.GITHUB_PROFILE_URL]: FIELD_CATEGORIES.ONLINE_PRESENCE,
    [FIELD_TYPES.PORTFOLIO_WEBSITE_URL]: FIELD_CATEGORIES.ONLINE_PRESENCE,
    [FIELD_TYPES.PERSONAL_WEBSITE_URL]: FIELD_CATEGORIES.ONLINE_PRESENCE,
    [FIELD_TYPES.TWITTER_PROFILE_URL]: FIELD_CATEGORIES.ONLINE_PRESENCE,
    [FIELD_TYPES.FACEBOOK_PROFILE_URL]: FIELD_CATEGORIES.ONLINE_PRESENCE,
    [FIELD_TYPES.INSTAGRAM_PROFILE_URL]: FIELD_CATEGORIES.ONLINE_PRESENCE,
    [FIELD_TYPES.GOOGLE_SCHOLAR_PROFILE_URL]: FIELD_CATEGORIES.ONLINE_PRESENCE,
    [FIELD_TYPES.OTHER_WEBSITE_URL]: FIELD_CATEGORIES.ONLINE_PRESENCE,

    // Location
    [FIELD_TYPES.STREET_ADDRESS_LINE_1]: FIELD_CATEGORIES.LOCATION,
    [FIELD_TYPES.STREET_ADDRESS_LINE_2]: FIELD_CATEGORIES.LOCATION,
    [FIELD_TYPES.CITY_NAME]: FIELD_CATEGORIES.LOCATION,
    [FIELD_TYPES.STATE_OR_PROVINCE]: FIELD_CATEGORIES.LOCATION,
    [FIELD_TYPES.ZIP_OR_POSTAL_CODE]: FIELD_CATEGORIES.LOCATION,
    [FIELD_TYPES.COUNTRY_NAME]: FIELD_CATEGORIES.LOCATION,
    [FIELD_TYPES.CURRENT_LOCATION_COMBINED]: FIELD_CATEGORIES.LOCATION,
    [FIELD_TYPES.APPLICANT_TIMEZONE]: FIELD_CATEGORIES.LOCATION,
    [FIELD_TYPES.RELOCATION_WILLINGNESS]: FIELD_CATEGORIES.LOCATION,
    [FIELD_TYPES.PREFERRED_WORK_LOCATION]: FIELD_CATEGORIES.LOCATION,

    // Work Experience
    [FIELD_TYPES.POSITION_TITLE]: FIELD_CATEGORIES.WORK_EXPERIENCE,
    [FIELD_TYPES.CURRENT_POSITION_TITLE]: FIELD_CATEGORIES.WORK_EXPERIENCE,
    [FIELD_TYPES.EMPLOYER_COMPANY_NAME]: FIELD_CATEGORIES.WORK_EXPERIENCE,
    [FIELD_TYPES.CURRENT_EMPLOYER_NAME]: FIELD_CATEGORIES.WORK_EXPERIENCE,
    [FIELD_TYPES.EMPLOYMENT_START_DATE]: FIELD_CATEGORIES.WORK_EXPERIENCE,
    [FIELD_TYPES.EMPLOYMENT_END_DATE]: FIELD_CATEGORIES.WORK_EXPERIENCE,
    [FIELD_TYPES.CURRENTLY_EMPLOYED_HERE]: FIELD_CATEGORIES.WORK_EXPERIENCE,
    [FIELD_TYPES.JOB_RESPONSIBILITIES_DESCRIPTION]: FIELD_CATEGORIES.WORK_EXPERIENCE,
    [FIELD_TYPES.JOB_WORK_LOCATION]: FIELD_CATEGORIES.WORK_EXPERIENCE,
    [FIELD_TYPES.TOTAL_YEARS_OF_EXPERIENCE]: FIELD_CATEGORIES.WORK_EXPERIENCE,
    [FIELD_TYPES.INDUSTRY_SECTOR]: FIELD_CATEGORIES.WORK_EXPERIENCE,
    [FIELD_TYPES.DEPARTMENT_OR_TEAM]: FIELD_CATEGORIES.WORK_EXPERIENCE,

    // Education
    [FIELD_TYPES.EDUCATIONAL_INSTITUTION_NAME]: FIELD_CATEGORIES.EDUCATION,
    [FIELD_TYPES.SCHOOL_OR_UNIVERSITY_NAME]: FIELD_CATEGORIES.EDUCATION,
    [FIELD_TYPES.DEGREE_TYPE_OBTAINED]: FIELD_CATEGORIES.EDUCATION,
    [FIELD_TYPES.ACADEMIC_FIELD_OF_STUDY]: FIELD_CATEGORIES.EDUCATION,
    [FIELD_TYPES.ACADEMIC_MAJOR_CONCENTRATION]: FIELD_CATEGORIES.EDUCATION,
    [FIELD_TYPES.ACADEMIC_MINOR_CONCENTRATION]: FIELD_CATEGORIES.EDUCATION,
    [FIELD_TYPES.GRADE_POINT_AVERAGE]: FIELD_CATEGORIES.EDUCATION,
    [FIELD_TYPES.EXPECTED_GRADUATION_DATE]: FIELD_CATEGORIES.EDUCATION,
    [FIELD_TYPES.EDUCATION_START_DATE]: FIELD_CATEGORIES.EDUCATION,
    [FIELD_TYPES.EDUCATION_END_DATE]: FIELD_CATEGORIES.EDUCATION,
    [FIELD_TYPES.CURRENTLY_ENROLLED_STUDENT]: FIELD_CATEGORIES.EDUCATION,
    [FIELD_TYPES.ACADEMIC_HONORS_AND_AWARDS]: FIELD_CATEGORIES.EDUCATION,
    [FIELD_TYPES.HIGHEST_EDUCATION_LEVEL]: FIELD_CATEGORIES.EDUCATION,

    // Skills
    [FIELD_TYPES.GENERAL_SKILLS_LIST]: FIELD_CATEGORIES.SKILLS,
    [FIELD_TYPES.TECHNICAL_SKILLS_LIST]: FIELD_CATEGORIES.SKILLS,
    [FIELD_TYPES.PROFESSIONAL_CERTIFICATIONS]: FIELD_CATEGORIES.SKILLS,
    [FIELD_TYPES.PROFESSIONAL_LICENSES]: FIELD_CATEGORIES.SKILLS,
    [FIELD_TYPES.SPOKEN_LANGUAGES]: FIELD_CATEGORIES.SKILLS,
    [FIELD_TYPES.LANGUAGE_PROFICIENCY_LEVEL]: FIELD_CATEGORIES.SKILLS,
    [FIELD_TYPES.YEARS_OF_SKILL_EXPERIENCE]: FIELD_CATEGORIES.SKILLS,
    [FIELD_TYPES.SKILL_PROFICIENCY_LEVEL]: FIELD_CATEGORIES.SKILLS,

    // References
    [FIELD_TYPES.REFERENCE_FULL_NAME]: FIELD_CATEGORIES.REFERENCES,
    [FIELD_TYPES.REFERENCE_EMAIL_ADDRESS]: FIELD_CATEGORIES.REFERENCES,
    [FIELD_TYPES.REFERENCE_PHONE_NUMBER]: FIELD_CATEGORIES.REFERENCES,
    [FIELD_TYPES.REFERENCE_RELATIONSHIP_TYPE]: FIELD_CATEGORIES.REFERENCES,

    // Demographics
    [FIELD_TYPES.GENDER_IDENTITY]: FIELD_CATEGORIES.DEMOGRAPHICS,
    [FIELD_TYPES.EXTENDED_GENDER_IDENTITY]: FIELD_CATEGORIES.DEMOGRAPHICS,
    [FIELD_TYPES.PREFERRED_PRONOUNS]: FIELD_CATEGORIES.DEMOGRAPHICS,
    [FIELD_TYPES.RACIAL_BACKGROUND]: FIELD_CATEGORIES.DEMOGRAPHICS,
    [FIELD_TYPES.ETHNIC_BACKGROUND]: FIELD_CATEGORIES.DEMOGRAPHICS,
    [FIELD_TYPES.VETERAN_STATUS]: FIELD_CATEGORIES.DEMOGRAPHICS,
    [FIELD_TYPES.DISABILITY_STATUS]: FIELD_CATEGORIES.DEMOGRAPHICS,
    [FIELD_TYPES.MARITAL_STATUS]: FIELD_CATEGORIES.DEMOGRAPHICS,

    // Compensation
    [FIELD_TYPES.CURRENT_ANNUAL_SALARY]: FIELD_CATEGORIES.COMPENSATION,
    [FIELD_TYPES.EXPECTED_ANNUAL_SALARY]: FIELD_CATEGORIES.COMPENSATION,
    [FIELD_TYPES.MINIMUM_ACCEPTABLE_SALARY]: FIELD_CATEGORIES.COMPENSATION,
    [FIELD_TYPES.SALARY_CURRENCY_PREFERENCE]: FIELD_CATEGORIES.COMPENSATION,
    [FIELD_TYPES.EXPECTED_BONUS_PERCENTAGE]: FIELD_CATEGORIES.COMPENSATION,
    [FIELD_TYPES.EXPECTED_EQUITY_COMPENSATION]: FIELD_CATEGORIES.COMPENSATION,

    // Availability
    [FIELD_TYPES.AVAILABLE_START_DATE]: FIELD_CATEGORIES.AVAILABILITY,
    [FIELD_TYPES.GENERAL_AVAILABILITY]: FIELD_CATEGORIES.AVAILABILITY,
    [FIELD_TYPES.REQUIRED_NOTICE_PERIOD]: FIELD_CATEGORIES.AVAILABILITY,
    [FIELD_TYPES.EMPLOYMENT_TYPE_PREFERENCE]: FIELD_CATEGORIES.AVAILABILITY,
    [FIELD_TYPES.SHIFT_SCHEDULE_PREFERENCE]: FIELD_CATEGORIES.AVAILABILITY,
    [FIELD_TYPES.TRAVEL_WILLINGNESS_PERCENTAGE]: FIELD_CATEGORIES.AVAILABILITY,

    // Preferences
    [FIELD_TYPES.REMOTE_WORK_PREFERENCE]: FIELD_CATEGORIES.PREFERENCES,
    [FIELD_TYPES.CONTRACT_TYPE_PREFERENCE]: FIELD_CATEGORIES.PREFERENCES,
    [FIELD_TYPES.PREFERRED_WORK_STYLE]: FIELD_CATEGORIES.PREFERENCES,
    [FIELD_TYPES.PREFERRED_COMMUNICATION_STYLE]: FIELD_CATEGORIES.PREFERENCES,
    [FIELD_TYPES.CAREER_OBJECTIVES]: FIELD_CATEGORIES.PREFERENCES,
    [FIELD_TYPES.DESIRED_JOB_ROLE]: FIELD_CATEGORIES.PREFERENCES,
    [FIELD_TYPES.PROFESSIONAL_INTEREST_AREAS]: FIELD_CATEGORIES.PREFERENCES,

    // Legal
    [FIELD_TYPES.WORK_AUTHORIZATION_STATUS]: FIELD_CATEGORIES.LEGAL,
    [FIELD_TYPES.VISA_SPONSORSHIP_REQUIRED]: FIELD_CATEGORIES.LEGAL,
    [FIELD_TYPES.CURRENT_VISA_STATUS]: FIELD_CATEGORIES.LEGAL,
    [FIELD_TYPES.COUNTRY_OF_CITIZENSHIP]: FIELD_CATEGORIES.LEGAL,
    [FIELD_TYPES.SECURITY_CLEARANCE_LEVEL]: FIELD_CATEGORIES.LEGAL,
    [FIELD_TYPES.SECURITY_CLEARANCE_ACTIVE]: FIELD_CATEGORIES.LEGAL,
    [FIELD_TYPES.LEGAL_WORKING_AGE_CONFIRMATION]: FIELD_CATEGORIES.LEGAL,
    [FIELD_TYPES.TAX_IDENTIFICATION_NUMBER]: FIELD_CATEGORIES.LEGAL,
    [FIELD_TYPES.DATE_OF_BIRTH]: FIELD_CATEGORIES.LEGAL,
    [FIELD_TYPES.BACKGROUND_CHECK_CONSENT]: FIELD_CATEGORIES.LEGAL,
    [FIELD_TYPES.CRIMINAL_HISTORY_DISCLOSURE]: FIELD_CATEGORIES.LEGAL,
    [FIELD_TYPES.DRUG_TEST_CONSENT]: FIELD_CATEGORIES.LEGAL,

    // Federal/Military
    [FIELD_TYPES.MILITARY_BRANCH_SERVED]: FIELD_CATEGORIES.FEDERAL,
    [FIELD_TYPES.MILITARY_SERVICE_DATES]: FIELD_CATEGORIES.FEDERAL,
    [FIELD_TYPES.MILITARY_DISCHARGE_STATUS]: FIELD_CATEGORIES.FEDERAL,
    [FIELD_TYPES.FEDERAL_EMPLOYEE_STATUS]: FIELD_CATEGORIES.FEDERAL,
    [FIELD_TYPES.FEDERAL_PAY_GRADE]: FIELD_CATEGORIES.FEDERAL,
    [FIELD_TYPES.SCHEDULE_A_ELIGIBILITY]: FIELD_CATEGORIES.FEDERAL,

    // Academic/Research
    [FIELD_TYPES.ACADEMIC_PUBLICATIONS_LIST]: FIELD_CATEGORIES.ACADEMIC,
    [FIELD_TYPES.PATENTS_HELD]: FIELD_CATEGORIES.ACADEMIC,
    [FIELD_TYPES.RESEARCH_INTEREST_AREAS]: FIELD_CATEGORIES.ACADEMIC,
    [FIELD_TYPES.THESIS_DISSERTATION_TITLE]: FIELD_CATEGORIES.ACADEMIC,
    [FIELD_TYPES.ACADEMIC_ADVISOR_NAME]: FIELD_CATEGORIES.ACADEMIC,

    // Application Context
    [FIELD_TYPES.APPLICATION_REFERRAL_SOURCE]: FIELD_CATEGORIES.APPLICATION,
    [FIELD_TYPES.EMPLOYEE_REFERRER_NAME]: FIELD_CATEGORIES.APPLICATION,
    [FIELD_TYPES.EMPLOYEE_REFERRER_EMAIL]: FIELD_CATEGORIES.APPLICATION,
    [FIELD_TYPES.INTERNAL_EMPLOYEE_ID]: FIELD_CATEGORIES.APPLICATION,
    [FIELD_TYPES.POSITION_JOB_ID]: FIELD_CATEGORIES.APPLICATION,
    [FIELD_TYPES.REQUISITION_NUMBER]: FIELD_CATEGORIES.APPLICATION,
    [FIELD_TYPES.APPLICATION_SUBMISSION_DATE]: FIELD_CATEGORIES.APPLICATION,
    [FIELD_TYPES.RESUME_FILE_UPLOAD]: FIELD_CATEGORIES.APPLICATION,

    // Supplemental
    [FIELD_TYPES.COVER_LETTER_CONTENT]: FIELD_CATEGORIES.SUPPLEMENTAL,
    [FIELD_TYPES.ADDITIONAL_INFORMATION_TEXT]: FIELD_CATEGORIES.SUPPLEMENTAL,
    [FIELD_TYPES.GENERAL_NOTES_FIELD]: FIELD_CATEGORIES.SUPPLEMENTAL,
    [FIELD_TYPES.INTRODUCTION_NOTE_TEXT]: FIELD_CATEGORIES.SUPPLEMENTAL,
    [FIELD_TYPES.CUSTOM_SCREENING_QUESTION]: FIELD_CATEGORIES.SUPPLEMENTAL,
    [FIELD_TYPES.GENERIC_APPLICATION_QUESTION]: FIELD_CATEGORIES.SUPPLEMENTAL,
    [FIELD_TYPES.TERMS_AND_CONDITIONS_AGREEMENT]: FIELD_CATEGORIES.SUPPLEMENTAL,

    // Misc
    [FIELD_TYPES.UNCLASSIFIED_FIELD]: FIELD_CATEGORIES.MISC
});

// ============================================================================
// ORDERED CLASS LIST (Neural Network Output Layer)
// Total: 135 classes
// ============================================================================

const ORDERED_CLASSES = Object.freeze([
    'unclassified_field',              // 0

    // Identity (1-8)
    'applicant_first_name',            // 1
    'applicant_middle_name',           // 2
    'applicant_last_name',             // 3
    'applicant_full_name',             // 4
    'applicant_preferred_name',        // 5
    'professional_headline',           // 6
    'professional_summary',            // 7
    'applicant_profile_photo',         // 8

    // Contact (9-13)
    'primary_email_address',           // 9
    'secondary_email_address',         // 10
    'primary_phone_number',            // 11
    'mobile_phone_number',             // 12
    'home_phone_number',               // 13

    // Online Presence (14-22)
    'linkedin_profile_url',            // 14
    'github_profile_url',              // 15
    'portfolio_website_url',           // 16
    'personal_website_url',            // 17
    'twitter_profile_url',             // 18
    'facebook_profile_url',            // 19
    'instagram_profile_url',           // 20
    'google_scholar_profile_url',      // 21
    'other_website_url',               // 22

    // Location (23-32)
    'street_address_line_1',           // 23
    'street_address_line_2',           // 24
    'city_name',                       // 25
    'state_or_province',               // 26
    'zip_or_postal_code',              // 27
    'country_name',                    // 28
    'current_location_combined',       // 29
    'applicant_timezone',              // 30
    'relocation_willingness',          // 31
    'preferred_work_location',         // 32

    // Work Experience (33-44)
    'position_title',                  // 33
    'current_position_title',          // 34
    'employer_company_name',           // 35
    'current_employer_name',           // 36
    'employment_start_date',           // 37
    'employment_end_date',             // 38
    'currently_employed_here',         // 39
    'job_responsibilities_description', // 40
    'job_work_location',               // 41
    'total_years_of_experience',       // 42
    'industry_sector',                 // 43
    'department_or_team',              // 44

    // Education (45-57)
    'educational_institution_name',    // 45
    'school_or_university_name',       // 46
    'degree_type_obtained',            // 47
    'academic_field_of_study',         // 48
    'academic_major_concentration',    // 49
    'academic_minor_concentration',    // 50
    'grade_point_average',             // 51
    'expected_graduation_date',        // 52
    'education_start_date',            // 53
    'education_end_date',              // 54
    'currently_enrolled_student',      // 55
    'academic_honors_and_awards',      // 56
    'highest_education_level',         // 57

    // Skills (58-65)
    'general_skills_list',             // 58
    'technical_skills_list',           // 59
    'professional_certifications',     // 60
    'professional_licenses',           // 61
    'spoken_languages',                // 62
    'language_proficiency_level',      // 63
    'years_of_skill_experience',       // 64
    'skill_proficiency_level',         // 65

    // References (66-69)
    'reference_full_name',             // 66
    'reference_email_address',         // 67
    'reference_phone_number',          // 68
    'reference_relationship_type',     // 69

    // Demographics (70-77)
    'gender_identity',                 // 70
    'extended_gender_identity',        // 71
    'preferred_pronouns',              // 72
    'racial_background',               // 73
    'ethnic_background',               // 74
    'veteran_status',                  // 75
    'disability_status',               // 76
    'marital_status',                  // 77

    // Compensation (78-83)
    'current_annual_salary',           // 78
    'expected_annual_salary',          // 79
    'minimum_acceptable_salary',       // 80
    'salary_currency_preference',      // 81
    'expected_bonus_percentage',       // 82
    'expected_equity_compensation',    // 83

    // Availability (84-89)
    'available_start_date',            // 84
    'general_availability',            // 85
    'required_notice_period',          // 86
    'employment_type_preference',      // 87
    'shift_schedule_preference',       // 88
    'travel_willingness_percentage',   // 89

    // Preferences (90-96)
    'remote_work_preference',          // 90
    'contract_type_preference',        // 91
    'preferred_work_style',            // 92
    'preferred_communication_style',   // 93
    'career_objectives',               // 94
    'desired_job_role',                // 95
    'professional_interest_areas',     // 96

    // Legal (97-108)
    'work_authorization_status',       // 97
    'visa_sponsorship_required',       // 98
    'current_visa_status',             // 99
    'country_of_citizenship',          // 100
    'security_clearance_level',        // 101
    'security_clearance_active',       // 102
    'legal_working_age_confirmation',  // 103
    'tax_identification_number',       // 104
    'date_of_birth',                   // 105
    'background_check_consent',        // 106
    'criminal_history_disclosure',     // 107
    'drug_test_consent',               // 108

    // Federal/Military (109-114)
    'military_branch_served',          // 109
    'military_service_dates',          // 110
    'military_discharge_status',       // 111
    'federal_employee_status',         // 112
    'federal_pay_grade',               // 113
    'schedule_a_eligibility',          // 114

    // Academic (115-119)
    'academic_publications_list',      // 115
    'patents_held',                    // 116
    'research_interest_areas',         // 117
    'thesis_dissertation_title',       // 118
    'academic_advisor_name',           // 119

    // Application Context (120-127)
    'application_referral_source',     // 120
    'employee_referrer_name',          // 121
    'employee_referrer_email',         // 122
    'internal_employee_id',            // 123
    'position_job_id',                 // 124
    'requisition_number',              // 125
    'application_submission_date',     // 126
    'resume_file_upload',              // 127

    // Supplemental (128-134)
    'cover_letter_content',            // 128
    'additional_information_text',     // 129
    'general_notes_field',             // 130
    'introduction_note_text',          // 131
    'custom_screening_question',       // 132
    'generic_application_question',    // 133
    'terms_and_conditions_agreement'   // 134
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

/**
 * Get human-readable display name from field type value
 * Converts 'applicant_first_name' to 'Applicant First Name'
 */
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
