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

        // Metadata for Semantic Logging
        field.routingReasons = [];

        // A. HARD OVERRIDE GUARDRAIL
        if (this.FLAT_MULTI_OVERRIDES.test(context)) {
            field.routingReasons.push('FLAT_MULTI_OVERRIDE matched');
            return isCheckOrMulti ? 'ATOMIC_MULTI' : 'ATOMIC_SINGLE';
        }

        // B. SPECIAL CASE: ATOMIC_MULTI Sets
        const atomicSetKeywords = /\b(skills|technologies|tools|languages|hobbies|interests|competencies)\b/i;
        if (isCheckOrMulti && atomicSetKeywords.test(context)) {
            field.routingReasons.push('Atomic Multiset Keyword matched');
            return 'ATOMIC_MULTI';
        }

        // C. MULTI-SIGNAL SECTIONAL DETECTION
        if (isCheckOrMulti || field.field_index !== null) {
            const scoring = this.calculateDetailedSectionalScore(field, context);
            field.sectionalScore = scoring.score;
            field.structuralSignalCount = scoring.signals;

            // Tier 1: Structural Multi (Strongest Signal)
            // Rules: score >= 10 AND structural signals >= 2
            if (scoring.score >= 10 && scoring.signals >= 2) {
                field.routingReasons.push(`Strong Structural Multi (${scoring.signals} signals)`);
                return 'SECTION_REPEATER';
            }

            // Tier 2: Verified Multi (Verified by count or pattern)
            // Rules: score >= 2 AND groupCount >= 2
            if (scoring.score >= 2 && groupCount >= 2) {
                field.routingReasons.push(`Verified Multi (score=${scoring.score}, count=${groupCount})`);
                return 'SECTION_REPEATER';
            }

            // Probation: Section Candidate
            // Rules: Has sectional sign but not verified yet (e.g. solitary edu_0_school)
            if (scoring.score >= 2) {
                field.routingReasons.push(`Section Candidate (waiting for verification)`);
                return 'SECTION_CANDIDATE';
            }
        }

        // D. ATOMIC_MULTI (Generic)
        if (isCheckOrMulti) {
            field.routingReasons.push('Generic Checkbox/Multi');
            return 'ATOMIC_MULTI';
        }

        field.routingReasons.push('Fallback to Atomic Single');
        return 'ATOMIC_SINGLE';
    }

    /**
     * Enhanced scoring that returns both numeric score and unique signal count
     */
    static calculateDetailedSectionalScore(field, context) {
        let score = 0;
        let signals = 0;
        const ctx = context || [field.label, field.name, field.parentContext].filter(Boolean).join(' ').toLowerCase();

        // 1. Keyword Signal (Semantic)
        const sectionKeywords = /\b(job.*title|role|position|employer.*name|company.*name|work.*experience|employment.*history|school.*name|university|degree|graduation.*year|study|start.*date|end.*date|description|responsibilities|summary|gpa|major|minor)\b/i;
        if (sectionKeywords.test(ctx)) {
            score += 1;
        }

        // 2. Structural Signal (Attribute/ID)
        let indexConfidence = 0;
        if (window.IndexingService && typeof window.IndexingService.getIndex === 'function') {
            const idxRes = window.IndexingService.getIndex(field, 'generic');
            if (idxRes && idxRes.confidence !== undefined) {
                indexConfidence = idxRes.confidence;
                if (idxRes.source === 'STRUCTURAL') signals++;
            }
        }

        if (indexConfidence >= 3) {
            score += 10;
        } else if (indexConfidence === 2) {
            score += 2;
        } else if (indexConfidence === 1) {
            score += 1;
        }

        // 3. Container Signal (Structural)
        if (field.element) {
            const repeaterContainer = field.element.closest('.repeater, .repeating-section, .ashby-repeater, .fieldset-repeater, [data-repeating]');
            if (repeaterContainer) {
                score += 1;
                signals++;
            }
        }

        // 4. Strong Repeater Flag (Detector signal)
        if (field.isStrongRepeater) {
            score += 10;
            signals++;
        }

        // Negative Adjustments
        if (FieldRoutingPatterns.PROFILE_QUESTIONS.test(ctx)) {
            score -= 2;
        }

        return { score: Math.max(0, score), signals };
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
        if (FieldRoutingPatterns.PROFILE_QUESTIONS.test(ctx) || /\b(proof|authorization|sponsorship|visa)\b/i.test(ctx)) {
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

        // SECTION_REPEATER and SECTION_CANDIDATE are inherently tied to a repeated SECTION
        if (field.instance_type === 'SECTION_REPEATER' || field.instance_type === 'SECTION_CANDIDATE') return 'SECTION';

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
