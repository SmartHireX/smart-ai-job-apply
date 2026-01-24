/**
 * FieldRoutingPatterns
 * 
 * Centralized logic for routing fields to specific controllers (Section, Composite, etc.)
 * Used by PipelineOrchestrator to determine grouping.
 */

class FieldRoutingPatterns {

    // Regex for identifying Profile Questions (that should go to GlobalMemory, not MultiCache)
    static PROFILE_QUESTIONS = /visa|sponsor|veteran|military|disability|handicap|citizen|work.?auth|ethnic|race|gender|sex\b|felony|criminal|background.?check/i;

    // Hard Overrides: Contexts that are NEVER sectional (Survey/Motivation/Static Questions)
    static FLAT_MULTI_OVERRIDES = /how.*did.*hear|source|referral|motivation|interested.*in|availability|preferences|interests/i;

    /**
     * 1. Classify the Structural Role (Instance Type)
     * Determines HOW the field behaves (Single vs Set vs Repeating Block)
     */
    static classifyInstanceType(field) {
        const type = (field.type || 'text').toLowerCase();
        const isCheckOrMulti = type === 'checkbox' || type === 'select-multiple' || field.multiple;

        const context = [field.label, field.name, field.parentContext].filter(Boolean).join(' ').toLowerCase();

        // A. HARD OVERRIDE GUARDRAIL (High Priority)
        // If it matches a known flat multi-select pattern, force ATOMIC_MULTI immediately.
        if (this.FLAT_MULTI_OVERRIDES.test(context)) {
            // console.log(`🛡️ [Routing] Hard Override Triggered: "${context}" -> ATOMIC_MULTI`);
            return 'ATOMIC_MULTI';
        }

        // B. SPECIAL CASE: ATOMIC_MULTI Sets (Skills, Interests)
        const atomicSetKeywords = /skills|technologies|tools|languages|hobbies|interests|competencies/i;
        if (isCheckOrMulti && atomicSetKeywords.test(context)) {
            return 'ATOMIC_MULTI';
        }

        // C. MULTI-SIGNAL SECTIONAL DETECTION (The Opt-In Engine)
        // A field must accumulate at least 2 independent signals to be SECTIONAL_MULTI.
        if (isCheckOrMulti || field.field_index !== null) {
            const score = this.calculateSectionalScore(field, context);
            field.sectionalScore = score; // Store for debug logging in Pipeline

            if (score >= 2) {
                return 'SECTIONAL_MULTI';
            }
        }

        // D. ATOMIC_MULTI (Generic Checkboxes/MultiSelects that didn't hit sectional threshold)
        if (isCheckOrMulti) {
            return 'ATOMIC_MULTI';
        }

        // E. ATOMIC_SINGLE (Global Facts like Email, Phone, Single-Selects)
        return 'ATOMIC_SINGLE';
    }

    /**
     * Calculate sectional eligibility score
     * threshold >= 2 -> SECTIONAL_MULTI
     */
    static calculateSectionalScore(field, context) {
        let score = 0;
        const ctx = context || [field.label, field.name, field.parentContext].filter(Boolean).join(' ').toLowerCase();

        // Signal 1: Keyword Signal (+1)
        const sectionKeywords = /job.*title|role|position|employer|company|work|employment|school|university|degree|education|graduation|major|field_of_study/i;
        if (sectionKeywords.test(ctx)) score += 1;

        // Signal 2: Index Signal (+1)
        // Check for explicit indexing in name/id like _0, [1], or card sequences
        const indexPattern = /[\b_.-]\d+[\b_.-]|card|item|repeater/i;
        const explicitIndex = (field.name && indexPattern.test(field.name)) || (field.id && indexPattern.test(field.id));
        if (explicitIndex) score += 1;

        // Signal 3: Structural/Position Signal (+1)
        // If the indexing service assigned an index > 0, it's a strong indicator of repetition
        if (field.field_index > 0) score += 1;

        // Signal 4: Container Signal (+1) (If DOM element available)
        if (field.element) {
            const repeaterContainer = field.element.closest('.repeater, .repeating-section, .ashby-repeater, .fieldset-repeater, [data-repeating]');
            if (repeaterContainer) score += 1;
        }

        return score;
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
