/**
 * FieldRoutingPatterns
 * 
 * Centralized logic for routing fields to specific controllers (Section, Composite, etc.)
 * Used by PipelineOrchestrator to determine grouping.
 */

class FieldRoutingPatterns {

    // Regex for identifying Profile Questions (that should go to GlobalMemory, not MultiCache)
    static PROFILE_QUESTIONS = /visa|sponsor|veteran|military|disability|handicap|citizen|work.?auth|ethnic|race|gender|sex\b|felony|criminal|background.?check/i;

    /**
     * 1. Classify the Structural Role (Instance Type)
     * Determines HOW the field behaves (Single vs Set vs Repeating Block)
     * 
     * | Type | Description | Examples |
     * | :--- | :--- | :--- |
     * | **ATOMIC_SINGLE** | A single value field. | First Name, Email, "Are you authorized?" (Radio) |
     * | **ATOMIC_MULTI** | A set of values (Order doesn't matter). | Skills, Interests, "Select all that apply" |
     * | **SECTIONAL_MULTI** | A field inside a repeating list (Order matters). | Job 1 Title, Job 2 Title, School Name |
     * 
     * @param {Object} field - The field object
     * @returns {string} ATOMIC_SINGLE | ATOMIC_MULTI | SECTIONAL_MULTI | COMPOSITE
     */
    static classifyInstanceType(field) {
        const type = (field.type || 'text').toLowerCase();
        const isCheckOrMulti = type === 'checkbox' || type === 'select-multiple' || field.multiple;

        // A. SPECIAL CASE: ATOMIC_MULTI Sets (Skills, Interests)
        // Even if they have an index, a group of checkboxes for "Skills" should be ATOMIC_MULTI (a set),
        // not SECTIONAL_MULTI (repeating blocks like Job 1, Job 2).
        const context = [field.label, field.name, field.parentContext].filter(Boolean).join(' ').toLowerCase();
        const atomicSetKeywords = /skills|technologies|tools|languages|hobbies|interests|competencies/i;
        if (isCheckOrMulti && atomicSetKeywords.test(context)) {
            return 'ATOMIC_MULTI';
        }

        // B. SECTIONAL_MULTI (Repeating Blocks like Job 1, Job 2)
        // CRITICAL: Requires BOTH an index AND a repeatable semantic context
        if (field.field_index !== null && field.field_index !== undefined) {
            // We use isMultiValueEligible to confirm it's semantically a repeating section (Work/Edu)
            if (this.isMultiValueEligible(context, type)) {
                return 'SECTIONAL_MULTI';
            }
        }

        // C. ATOMIC_MULTI (Generic Checkboxes/MultiSelects)
        if (isCheckOrMulti) {
            return 'ATOMIC_MULTI';
        }

        // C. ATOMIC_SINGLE (Global Facts like Email, Phone, Single-Selects)
        return 'ATOMIC_SINGLE';
    }

    /**
     * 2. Classify the Data Boundary (Scope)
     * Determines WHERE the data lives (Global vs Local)
     * @param {Object} field - The field object
     * @returns {string} GLOBAL | SECTION | GROUP
     */
    static classifyScope(field) {
        // A. GROUP (Smallest interaction unit, e.g. Address Block)
        // If CompositeFieldManager has flagged it, or it's part of a known composite set
        if (field.groupId || field.parentGroup) {
            return 'GROUP';
        }

        // B. SECTION (Job 1 vs Job 2)
        // If it has an index, it is structurally inside a section.
        // EXCEPTION: ATOMIC_MULTI (e.g. Skills) is inherently GLOBAL (a single set of skills for the user),
        // so we force GLOBAL scope even if it appears to have an index in a section.
        if (field.instance_type === 'ATOMIC_MULTI') {
            return 'GLOBAL';
        }

        if (field.field_index !== null && field.field_index !== undefined) {
            return 'SECTION';
        }

        // C. GLOBAL (Default)
        return 'GLOBAL';
    }

    /**
     * Determine if a field is eligible for MultiValue/Section grouping
     * @param {string} context - Combined context string (label + name + parent)
     * @param {string} type - Field input type
     * @returns {boolean}
     */
    static isMultiValueEligible(context, type) {
        if (!context) return false;
        const ctx = context.toLowerCase();
        const t = (type || 'text').toLowerCase();

        // 0. Explicit Structural Indexing (Strongest Signal)
        // e.g. "work_0_description", "job-1-title", "school_2_name"
        if (/[\b_.-](work|job|edu|school|proj|vol|cert)[\b_.-]?\d+[\b_.-]/i.test(ctx)) {
            return true;
        }

        // 1. Explicit Multi-Value Types
        if (t === 'checkbox' || t === 'select-multiple') {
            return true;
        }

        // 2. EXCLUSIONS (Single-Value Fields that contain section keywords but ARE NOT repeating sections)
        // These fields must be excluded BEFORE checking section keywords

        // 2a. Profile Questions (demographics, legal)
        if (this.PROFILE_QUESTIONS.test(ctx)) {
            return false;
        }

        // 2b. Survey/Sourcing Questions (contain "job" but are single-value)
        const surveyExclusions = [
            'how did you hear',           // "How did you hear about this job?"
            'where did you hear',         // "Where did you hear about this job?"
            'referral source',            // Source tracking
            'hear about this',            // General sourcing
            'learn about this',           // General sourcing
            'find this job',              // General sourcing
            'find out about',             // General sourcing
            'job board',                  // Sourcing question
            'job posting',                // Sourcing reference
            'apply for this job',         // Motivation question
            'why this job',               // Motivation question
            'interested in this job'      // Motivation question
        ];
        if (surveyExclusions.some(excl => ctx.includes(excl))) {
            return false;
        }

        // 2c. Other Single-Value Questions
        const singleValueExclusions = [
            'currently employed', 'are you employed', 'notice period',
            'authorized to work', 'require sponsorship', 'relocate',
            'education level', 'highest degree', 'degree type',
            'years of experience', 'total experience', 'years experience',
            'total years', 'how many years', 'experience level',
            'open to relocat', 'willing to relocat'
        ];
        // CRITICAL: Only exclude if there is NO explicit index in the name
        // (e.g. "school_0_degree" should still be allowed, but "degree_level" should be excluded)
        if (!/[\b_.-]\d+[\b_.-]/.test(ctx)) {
            if (singleValueExclusions.some(kw => ctx.includes(kw))) {
                return false;
            }
        }

        // 3. Section Keywords (Job/Education) - More specific patterns
        // These fields belong to repeated sections and must be handled by SectionController
        const sectionKeywords = [
            // Work Experience - require compound terms or specific patterns
            'job title', 'job role', 'job history', 'job details',
            'employer name', 'employer address', 'company name',
            'work experience', 'work history', 'employment history',
            'position title', 'position held', 'current position', 'previous position',
            'job description', 'work description', 'duties', 'responsibilities',

            // Education - specific compound terms
            'school name', 'university name', 'college name', 'institution name',
            'education history', 'educational background',
            'degree name', 'degree earned', 'field of study', 'major', 'minor',
            'graduation date', 'graduation year', 'start date', 'end date',

            // Other repeating sections
            'project name', 'project title', 'project description',
            'volunteer experience', 'volunteering',
            'certification name', 'certificate', 'training'
        ];

        // Check for presence of any section keyword
        const isSection = sectionKeywords.some(kw => ctx.includes(kw));
        if (isSection) return true;

        // 4. Composite Field Keywords (Skills, Lists)
        const compositeKeywords = [
            'skills', 'technologies', 'tools', 'languages', 'hobbies', 'interests'
        ];

        if (compositeKeywords.some(kw => ctx.includes(kw))) {
            return true;
        }

        return false;
    }
}

// Export for Browser (Extension)
if (typeof window !== 'undefined') {
    window.FIELD_ROUTING_PATTERNS = FieldRoutingPatterns;
    // console.log('✅ FieldRoutingPatterns loaded');
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FieldRoutingPatterns;
}
