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
     */
    static classifyInstanceType(field) {
        const type = (field.type || 'text').toLowerCase();
        const isCheckOrMulti = type === 'checkbox' || type === 'select-multiple' || field.multiple;

        const context = [field.label, field.name, field.parentContext].filter(Boolean).join(' ').toLowerCase();

        // A. HARD OVERRIDE GUARDRAIL (High Priority)
        if (this.FLAT_MULTI_OVERRIDES.test(context)) {
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
        const sectionKeywords = /\b(job.*title|role|position|employer.*name|company.*name|work.*experience|employment.*history|school.*name|university.*name|degree.*earned|graduation.*year|field.*of.*study)\b/i;
        if (sectionKeywords.test(ctx)) score += 1;

        // Signal 2: Hardened Index Signal (+1)
        // Delegate to IndexingService which now implements anchored regex and UUID protection (V3)
        let hasRealIndex = false;
        if (window.IndexingService && typeof window.IndexingService.detectIndexFromAttribute === 'function') {
            const detectedIdx = window.IndexingService.detectIndexFromAttribute(field);
            if (detectedIdx !== null) hasRealIndex = true;
        }

        if (hasRealIndex) score += 1;

        // Signal 3: Structural Signal (+1) (Capped)
        // Capping index at 50; values like 4199 are usually DOM walk errors or flat list overflow
        if (field.field_index > 0 && field.field_index < 50) score += 1;

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
