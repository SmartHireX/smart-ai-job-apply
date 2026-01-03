/**
 * Local Semantic Matcher
 * 
 * deterministic logic to resolve structured form fields (Radio, Checkbox, Select)
 * using user profile data, bypassing AI for speed and cost efficiency.
 */

const LocalMatcher = {

    /**
     * Main entry point
     * @param {Array} fields - List of unmapped fields
     * @param {Object} resumeData - Full resume object
     * @returns {Object} { defined: mappingObject, remaining: unmappedArray }
     */
    resolveFields(fields, resumeData) {
        const resolved = {};
        const remaining = [];

        // Pre-calculate facts
        const facts = this.extractFacts(resumeData);
        console.log('🧠 [LocalMatcher] extracted facts:', facts);

        fields.forEach(field => {
            let answer = null;
            const labelLower = (field.label || '').toLowerCase();
            const nameLower = (field.name || '').toLowerCase();
            const context = `${labelLower} ${nameLower}`;

            // 1. Experience
            if (context.includes('experience') || context.includes('years')) {
                answer = this.matchExperience(field, facts.totalYearsExp);
            }
            // 2. Visa / Sponsorship
            else if (context.includes('sponsorship') || context.includes('visa') || context.includes('authorized')) {
                answer = this.matchVisa(field, facts);
            }
            // 3. Relocation / Remote
            else if (context.includes('relocate') || context.includes('remote')) {
                answer = this.matchLogistics(field, facts);
            }
            // 4. Education
            else if (context.includes('degree') || context.includes('education')) {
                answer = this.matchEducation(field, facts);
            }
            // 5. Gender / Veteran / Disability (Demographics)
            else if (['gender', 'sex', 'male', 'female'].some(k => context.includes(k))) {
                answer = this.matchDemographics(field, facts, 'gender');
            }
            else if (context.includes('veteran')) {
                answer = this.matchDemographics(field, facts, 'veteran');
            }
            else if (context.includes('disability')) {
                answer = this.matchDemographics(field, facts, 'disability');
            }


            if (answer) {
                resolved[field.selector] = {
                    value: answer,
                    confidence: 1.0, // Absolute certainty
                    source: 'local_heuristic',
                    field_type: field.type
                };
            } else {
                remaining.push(field);
            }
        });

        console.log(`⚡ [LocalMatcher] Resolved ${Object.keys(resolved).length} fields locally.`);
        return { defined: resolved, remaining };
    },

    extractFacts(resumeData) {
        return {
            totalYearsExp: this.calculateTotalExperience(resumeData.experience || []),
            highestDegree: this.calculateHighestDegree(resumeData.education || []),
            sponsorshipRequired: resumeData.customFields?.sponsorshipRequired === true, // Boolean
            workAuthorization: resumeData.customFields?.workAuthorization || 'Authorized',
            willingToRelocate: resumeData.customFields?.willingToRelocate, // true/false/null
            preferredLocation: (resumeData.customFields?.preferredLocation || '').toLowerCase(),
            demographics: {
                gender: resumeData.customFields?.gender || '',
                veteran: resumeData.customFields?.veteranStatus || '',
                disability: resumeData.customFields?.disabilityStatus || ''
            }
        };
    },

    // --- MATCHERS ---

    matchExperience(field, totalYears) {
        if (!field.options && !field.value) return null; // Can't match if no options

        // Strategy: Parse ranges from label/value
        // "0-2 years", "3-5", "5+"

        // Helper to check if a number is in range
        const checkRange = (text) => {
            const matches = text.match(/(\d+)\s*(?:-|to)\s*(\d+)/);
            if (matches) {
                const min = parseInt(matches[1]);
                const max = parseInt(matches[2]);
                return totalYears >= min && totalYears <= max;
            }
            // "5+" or "More than 5"
            const plusMatch = text.match(/(\d+)\+/) || text.match(/more than (\d+)/i);
            if (plusMatch) {
                const min = parseInt(plusMatch[1]);
                return totalYears >= min;
            }
            return false;
        };

        // If Radio/Checkbox, check this specific option
        if (field.type === 'radio' || field.type === 'checkbox') {
            const textToScan = (field.label + ' ' + (field.value || '')).toLowerCase();
            if (checkRange(textToScan)) return field.value;
            return null;
        }

        // If Select, loop options (Not implemented in this basic version, assumes Select options are handled differently or passed as array)
        if (field.type === 'select' && field.options) {
            // Find best match in options
            // This requires 'options' to be an array of {text, value} or strings
            // In extractedFields, options are values. We might need text.
            // Assume values are descriptive for now.
            return field.options.find(opt => checkRange(opt));
        }

        return null;
    },

    matchVisa(field, facts) {
        const text = (field.label + ' ' + (field.value || '')).toLowerCase();

        // Q: "Do you need sponsorship?"
        if (text.includes('sponsorship') || text.includes('sponsor')) {
            // Need sponsorship?
            const isYes = text === 'yes' || text === 'true';
            const isNo = text === 'no' || text === 'false';

            if (facts.sponsorshipRequired) {
                if (isYes) return field.value;
            } else {
                if (isNo) return field.value;
            }
        }

        // Q: "Are you authorized?"
        if (text.includes('authorized') || text.includes('authorization') || text.includes('legally')) {
            const isYes = text === 'yes' || text === 'true';
            const isNo = text === 'no' || text === 'false';

            // If NOT sponsorship required, assume authorized (simplification)
            if (!facts.sponsorshipRequired) {
                if (isYes) return field.value;
            }
        }

        return null;
    },

    matchLogistics(field, facts) {
        const text = (field.label + ' ' + (field.value || '')).toLowerCase();
        const isYes = text === 'yes' || text === 'true' || text === 'on';

        if (text.includes('relocate')) {
            if (facts.willingToRelocate === true && isYes) return field.value;
            if (facts.willingToRelocate === false && !isYes) return field.value; // "No" option
        }

        if (text.includes('remote')) {
            // If preferred location has 'remote'
            if (facts.preferredLocation.includes('remote')) {
                if (isYes) return field.value;
            }
        }
        return null;
    },

    matchEducation(field, facts) {
        // Simple hierarchy map
        const levels = {
            'high school': 1, 'secondary': 1,
            'bachelor': 2, 'undergraduate': 2, 'bs': 2, 'ba': 2, 'b.tech': 2,
            'master': 3, 'graduate': 3, 'ms': 3, 'ma': 3, 'mba': 3,
            'phd': 4, 'doctorate': 4
        };

        const targetLevel = levels[facts.highestDegree] || 0;
        if (targetLevel === 0) return null;

        const text = (field.label + ' ' + (field.value || '')).toLowerCase();
        let optionLevel = 0;
        for (const [key, lvl] of Object.entries(levels)) {
            if (text.includes(key)) {
                optionLevel = lvl;
                break;
            }
        }

        // Exact match or closest? 
        // For radio, we select if equal.
        if (optionLevel === targetLevel) return field.value;
        return null;
    },

    matchDemographics(field, facts, key) {
        const userVal = (facts.demographics[key] || '').toLowerCase();
        if (!userVal) return null;

        const text = (field.label + ' ' + (field.value || '')).toLowerCase();

        // Direct match
        if (text.includes(userVal)) return field.value;

        // "Decline to identify" fallback?
        // Only if no userVal provided? Logic above returns null if no userVal.
        return null;
    },

    // --- UTILS ---

    calculateTotalExperience(experience) {
        if (!experience || experience.length === 0) return 0;

        // Convert to ranges
        const ranges = experience.map(exp => {
            const start = new Date(exp.startDate);
            let end = new Date(); // Default to now
            if (!exp.current && exp.endDate) {
                end = new Date(exp.endDate === 'Present' ? new Date() : exp.endDate);
            }
            return { start: start.getTime(), end: end.getTime() };
        }).sort((a, b) => a.start - b.start);

        // Merge overlaps
        const merged = [];
        let current = ranges[0];

        for (let i = 1; i < ranges.length; i++) {
            const next = ranges[i];
            if (next.start <= current.end) {
                // Overlap: extend end
                current.end = Math.max(current.end, next.end);
            } else {
                merged.push(current);
                current = next;
            }
        }
        merged.push(current);

        // Sum duration
        let totalMs = 0;
        merged.forEach(r => totalMs += (r.end - r.start));

        // Convert to Years (ms -> sec -> min -> hr -> day -> year)
        const years = totalMs / (1000 * 60 * 60 * 24 * 365.25);
        return parseFloat(years.toFixed(1));
    },

    calculateHighestDegree(education) {
        // Extract from "degree" field
        // Simple keyword scan
        let maxLevel = 0;
        let bestMatch = '';

        const levels = {
            'phd': 4, 'doctorate': 4,
            'master': 3, 'mba': 3, 'ms': 3, 'ma': 3,
            'bachelor': 2, 'b.tech': 2, 'bs': 2, 'ba': 2, 'engineer': 2,
            'high school': 1, 'secondary': 1
        };

        education.forEach(edu => {
            const deg = (edu.degree || '').toLowerCase();
            for (const [key, lvl] of Object.entries(levels)) {
                if (deg.includes(key)) {
                    if (lvl > maxLevel) {
                        maxLevel = lvl;
                        bestMatch = key;
                    }
                }
            }
        });

        return bestMatch || 'bachelor'; // Default to bachelor if unsure? Or null?
    }
};

// Export
if (typeof window !== 'undefined') {
    window.LocalMatcher = LocalMatcher;
}
