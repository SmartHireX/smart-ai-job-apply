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
     * Determine if a field is eligible for MultiValue/Section grouping
     * @param {string} context - Combined context string (label + name + parent)
     * @param {string} type - Field input type
     * @returns {boolean}
     */
    static isMultiValueEligible(context, type) {
        if (!context) return false;
        const ctx = context.toLowerCase();
        const t = (type || 'text').toLowerCase();

        // 1. Explicit Multi-Value Types
        if (t === 'checkbox' || t === 'select-multiple') {
            return true;
        }

        // 2. EXCLUSIONS (Single-Value Fields that might contain section keywords)
        // These fields should NEVER be treated as repeating section fields
        if (this.PROFILE_QUESTIONS.test(ctx)) {
            return false;
        }

        const exclusionKeywords = [
            'currently employed', 'are you employed', 'notice period',
            'authorized to work', 'require sponsorship', 'relocate'
        ];
        if (exclusionKeywords.some(kw => ctx.includes(kw))) {
            return false;
        }

        // 3. Section Keywords (Job/Education)
        // These fields belong to repeated sections and must be handled by SectionController
        const sectionKeywords = [
            'job', 'employment', 'employer', 'work experience', 'position',
            'education', 'school', 'university', 'college', 'degree', 'institution',
            'project', 'volunteer', 'certification', 'training'
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
