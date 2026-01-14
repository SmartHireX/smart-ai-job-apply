/**
 * Shared Constants for SmartHireX Autofill Extension
 * 
 * This file contains patterns and constants used across field routing logic.
 */

// =============================================================================
// FIELD ROUTING PATTERNS
// =============================================================================

/**
 * HISTORY_FIELDS_PATTERN: Fields that belong to multi-entry sections (Job/Education history)
 * These fields should be routed to MultiCache with index support.
 */
const HISTORY_FIELDS_PATTERN = /job|employ|education|school|degree|title|employer|position|company|university|college|major|gpa/i;

/**
 * PROFILE_QUESTIONS_PATTERN: Fields that are single-value profile questions
 * These should be routed to SmartMemory, NOT MultiCache, even if they contain "work" keywords.
 * 
 * Examples:
 * - "Are you legally authorized to work in the US?" → SmartMemory
 * - "Do you require visa sponsorship?" → SmartMemory
 * - "Veteran status" → SmartMemory
 */
const PROFILE_QUESTIONS_PATTERN = /authorization|authorized|visa|sponsor|eligible|legally|permit|citizen|relocat|notice|salary|expect|veteran|disability|gender|ethnicity|race|criminal|background|convicted|felony|clearance|remote|hybrid|onsite|travel|willingness|accommodation|eeoc|eeo/i;

/**
 * SAFE_MULTIVALUE_KEYWORDS: Keywords that indicate a field is genuinely part of employment/education history.
 * These are safe to route to MultiCache.
 */
const SAFE_MULTIVALUE_KEYWORDS = /employer|position|job_title|company_name|school_name|university|degree|start_date|end_date|graduation/i;

/**
 * Helper function to determine if a field is multivalue-eligible
 * @param {string} fieldContext - Combined context (label + name + parentContext)
 * @param {string} fieldType - Field type (text, radio, checkbox, select)
 * @returns {boolean} True if field should go to MultiCache
 */
function isMultiValueEligible(fieldContext, fieldType = 'text') {
    // Structured inputs (radio/checkbox/select) are usually single-value selections
    const isStructuredInput = /radio|checkbox|select-one|select/.test(fieldType);

    // Check for history keywords
    const hasHistoryKeyword = HISTORY_FIELDS_PATTERN.test(fieldContext);

    // Check for profile question exclusions
    const isProfileQuestion = PROFILE_QUESTIONS_PATTERN.test(fieldContext);

    // Only eligible if:
    // 1. Has history keywords AND
    // 2. NOT a profile question AND
    // 3. NOT a structured input (radio/checkbox)
    return hasHistoryKeyword && !isProfileQuestion && !isStructuredInput;
}

// =============================================================================
// ML LABEL TAXONOMY
// =============================================================================

/**
 * ML Labels for work authorization and visa-related fields
 * These should be added to the neural classifier training data.
 */
const ML_PROFILE_LABELS = [
    'work_authorization',      // "Are you authorized to work in the US?"
    'visa_sponsorship',        // "Do you require visa sponsorship?"
    'visa_status',             // "Current visa status"
    'citizenship',             // "Are you a US citizen?"
    'veteran_status',          // "Veteran status"
    'disability_status',       // "Disability status"
    'gender',                  // "Gender"
    'ethnicity',               // "Race/Ethnicity"
    'criminal_history',        // "Have you been convicted..."
    'willing_to_relocate',     // "Are you willing to relocate?"
    'willing_to_travel',       // "Willing to travel %?"
    'salary_expectation',      // "Expected salary"
    'available_start_date',    // "When can you start?"
    'notice_period',           // "Notice period"
    'remote_preference',       // "Remote/Hybrid/Onsite preference"
    'security_clearance'       // "Do you have security clearance?"
];

/**
 * ML Labels for multi-entry history fields
 */
const ML_HISTORY_LABELS = [
    'employer_name',
    'job_title',
    'job_start_date',
    'job_end_date',
    'job_description',
    'school_name',
    'degree',
    'major',
    'graduation_date',
    'gpa'
];

// =============================================================================
// EXPORTS
// =============================================================================

// Make constants available globally
window.FIELD_ROUTING_PATTERNS = {
    HISTORY_FIELDS: HISTORY_FIELDS_PATTERN,
    PROFILE_QUESTIONS: PROFILE_QUESTIONS_PATTERN,
    SAFE_MULTIVALUE: SAFE_MULTIVALUE_KEYWORDS,
    isMultiValueEligible: isMultiValueEligible
};

window.ML_LABELS = {
    PROFILE: ML_PROFILE_LABELS,
    HISTORY: ML_HISTORY_LABELS
};

// console.log('[Constants] Field routing patterns loaded');
