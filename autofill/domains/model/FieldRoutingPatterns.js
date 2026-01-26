/**
 * FieldRoutingPatterns
 * 
 * Centralized logic for routing fields to specific controllers (Section, Composite, etc.)
 * Used by PipelineOrchestrator to determine grouping.
 */

class FieldRoutingPatterns {

    // Regex for identifying Profile Questions (that should go to GlobalMemory, not MultiCache)
    static PROFILE_QUESTIONS = /\b(visa|sponsor|veteran|military|disability|handicap|citizen|work.?auth|ethnic|race|gender|sex|pronouns)\b/i;

    // Hard Overrides: Contexts that are NEVER sectional (Survey/Motivation/Static Questions)
    static FLAT_MULTI_OVERRIDES = /\b(how.*did.*hear|source|referral|motivation|interested.*in|availability|preferences|interests|pronouns|authorization|sponsorship|visa|legal.*consent|agreement|acknowledgment|background.*check)\b/i;

    /**
     * 1. Classify the Structural Role (Instance Type)
     * Determines HOW the field behaves (Single vs Set vs Repeating Block)
     * @param {Object} field
     * @param {number} groupCount - Number of fields sharing the same Base Key (for Repeater proof)
     */
    static classifyInstanceType(field, groupCount = 1) {
        const type = (field.type || 'text').toLowerCase();
        const isCheckOrMulti = type === 'checkbox' || type === 'select-multiple' || field.multiple;

        const context = [field.label, field.name, field.parentContext].filter(Boolean).join(' ').toLowerCase();

        // A. HARD OVERRIDE GUARDRAIL (High Priority)
        if (this.FLAT_MULTI_OVERRIDES.test(context)) {
            // CONFIDENCE CHECK: Even if it looks like atomic, if it has SUPER STRONG structural Repeater signal (Conf 3),
            // Structure beats Semantic/Keyword. 
            // e.g. "interests-0-name" is likely a repeater of "Interest" entries, not an atomic "Interests" text box.
            // But usually "How did you hear" doesn't have repeater indices.
            return isCheckOrMulti ? 'ATOMIC_MULTI' : 'ATOMIC_SINGLE';
        }

        // B. SPECIAL CASE: ATOMIC_MULTI Sets (Skills, Interests)
        const atomicSetKeywords = /\b(skills|technologies|tools|languages|hobbies|interests|competencies)\b/i;
        if (isCheckOrMulti && atomicSetKeywords.test(context)) {
            return 'ATOMIC_MULTI';
        }

        // C. MULTI-SIGNAL SECTIONAL DETECTION (The Opt-In Engine)
        if (isCheckOrMulti || field.field_index !== null) {
            const score = this.calculateSectionalScore(field, context);
            field.sectionalScore = score;

            // SECTION_REPEATER LOGIC:
            // 1. High Confidence Score (>= 10 means Conf 3 was hit in scoring)
            // 2. PROVEN GROUPING: count(baseKey) >= 2 
            //    (Use groupCount passed from Orchestrator pre-pass)
            if (score >= 10 && groupCount >= 2) {
                return 'SECTION_REPEATER';
            }

            if (score >= 2) {
                return 'SECTIONAL_MULTI';
            }
        }

        // D. ATOMIC_MULTI (Generic Checkboxes/MultiSelects)
        if (isCheckOrMulti) {
            return 'ATOMIC_MULTI';
        }

        return 'ATOMIC_SINGLE';
    }

    /**
     * Calculate sectional eligibility score (Hardened V2)
     */
    static calculateSectionalScore(field, context) {
        let score = 0;
        const ctx = context || [field.label, field.name, field.parentContext].filter(Boolean).join(' ').toLowerCase();

        // Signal 1: Hardened Keyword Signal (+1)
        // Require word boundaries and compound terms for weaker words to avoid "employer" in survey triggers
        const sectionKeywords = /\b(job.*title|role|position|employer.*name|company.*name|work.*experience|employment.*history|school.*name|university|degree|graduation.*year|study|start.*date|end.*date|description|responsibilities|summary|gpa|major|minor)\b/i;
        if (sectionKeywords.test(ctx)) score += 1;

        // Signal 2: Hardened Index Signal (Confidence Based)
        let indexConfidence = 0;

        // REPEATER OVERRIDE: If SectionDetector found an "Add Button" or strong ATS signal, respect it.
        if (field.isStrongRepeater) {
            return 10; // SHORT-CIRCUIT: Explicit "Add Button" determines Repeater Capability (Conf 3+)
        }

        if (window.IndexingService && typeof window.IndexingService.getIndex === 'function') {
            // We infer type from ctx or assume generic to get the index confidence
            // Ideally we should pass the detected 'work' or 'education' type, but for scoring 'generic' is okay
            // The IndexingService needs 'type' mainly for sequential counters.
            // For Attribute Detection (which gives High Confidence), type doesn't matter much.
            const dummyType = 'generic';
            const idxRes = window.IndexingService.getIndex(field, dummyType);

            if (idxRes && idxRes.confidence !== undefined) {
                indexConfidence = idxRes.confidence;
            }
        }

        if (indexConfidence >= 3) {
            return 10; // SHORT-CIRCUIT: Explicit Repeater Signature determines it IMMEDIATELY.
        }
        if (indexConfidence === 2) {
            score += 2; // Strong Attribute
        }
        if (indexConfidence === 1) {
            score += 1; // Explicit Label
        }

        const hasRealIndex = indexConfidence >= 1;

        // Signal 3: Structural Signal (+1) (Capped)
        // Boost if index > 0 OR if it's index 0 but explicitly structural (e.g. "edu_0_degree")
        if ((field.field_index > 0 && field.field_index < 50) || (field.field_index === 0 && hasRealIndex)) {
            score += 1;
        }

        // Signal 4: Container Signal (+1)
        if (field.element) {
            const repeaterContainer = field.element.closest('.repeater, .repeating-section, .ashby-repeater, .fieldset-repeater, [data-repeating]');
            if (repeaterContainer) score += 1;
        }

        // Negative Signal: Legal/Profile Bias (-1)
        // If it looks strongly like a profile or legal question, reduce sectional confidence
        if (this.PROFILE_QUESTIONS.test(ctx) || /\b(proof|authorization|sponsorship|visa)\b/i.test(ctx)) {
            score -= 1;
        }

        return Math.max(0, score);
    }

    /**
     * 2. Classify the Data Boundary (Scope)
     * Determines WHERE the data lives (Global vs Local)
     */
    static classifyScope(field) {
        if (field.groupId || field.parentGroup) return 'GROUP';

        // ATOMIC_MULTI is inherently GLOBAL (a single set of skills/interests for the user)
        if (field.instance_type === 'ATOMIC_MULTI') return 'GLOBAL';

        // SECTIONAL_MULTI is inherently tied to a repeated SECTION
        if (field.instance_type === 'SECTIONAL_MULTI') return 'SECTION';

        if (field.field_index !== null && field.field_index !== undefined) return 'SECTION';

        return 'GLOBAL';
    }

    /**
     * Determine if a field is eligible for MultiValue/Section grouping
     * (Retained for backward compatibility by other engines, but Logic refactored)
     */
    static isMultiValueEligible(context, type, field = {}) {
        if (!context) return false;
        const ctx = context.toLowerCase();

        // Hard Overrides first
        if (this.FLAT_MULTI_OVERRIDES.test(ctx)) return true; // It's multi-value, but as ATOMIC_MULTI

        // Run the scoring-lite version for context-only checks
        const score = this.calculateSectionalScore(field, ctx);

        // If type is multi-value, it's eligible
        const isMultiType = /checkbox|select-multiple/i.test(type) || field.multiple;
        if (isMultiType) return true;

        // For text fields, they are only eligible if they are sectional
        return score >= 2;
    }
}

// Export for Browser (Extension)
if (typeof window !== 'undefined') {
    window.FIELD_ROUTING_PATTERNS = FieldRoutingPatterns;
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FieldRoutingPatterns;
}
