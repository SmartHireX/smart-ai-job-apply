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
        const resolvedGroups = new Set();
        const remaining = [];

        // Pre-calculate facts
        const facts = this.extractFacts(resumeData);
        console.log('🧠 [LocalMatcher] extracted facts:', facts);

        // First pass: Resolve fields
        fields.forEach(field => {
            let answer = null;

            // Skip if group already resolved (for radios)
            if (field.name && resolvedGroups.has(field.name)) {
                return; // Already handled this group
            }

            const labelLower = (field.label || '').toLowerCase();
            const nameLower = (field.name || '').toLowerCase();
            const context = `${labelLower} ${nameLower}`;

            // DEBUG LOGGING
            if (context.includes('visa') || context.includes('skill') || context.includes('relocate') || context.includes('sponsor')) {
                console.log(`[LocalMatcher] TRACE "${field.name}":`, { label: field.label, context, type: field.type, value: field.value });
            }

            // 1. Experience
            if (context.includes('experience') || context.includes('years')) {
                answer = this.matchExperience(field, facts.totalYearsExp);
            }
            // 2. Visa / Sponsorship
            else if (context.includes('sponsorship') || context.includes('visa') || context.includes('authorized')) {
                answer = this.matchVisa(field, facts, context);
            }
            // 3. Relocation / Remote
            else if (context.includes('relocate') || context.includes('remote') || context.includes('travel')) {
                answer = this.matchLogistics(field, facts, context);
            }
            // 3.5 Skills
            else if (context.includes('skill')) {
                answer = this.matchSkills(field, facts);
            }
            // 4. Education
            else if (context.includes('degree') || context.includes('education')) {
                answer = this.matchEducation(field, facts);
            }
            // 5. Gender / Veteran / Disability
            else if (['gender', 'sex', 'male', 'female'].some(k => context.includes(k))) {
                answer = this.matchDemographics(field, facts, 'gender');
            }
            else if (context.includes('veteran')) {
                answer = this.matchDemographics(field, facts, 'veteran');
            }
            else if (context.includes('disability')) {
                answer = this.matchDemographics(field, facts, 'disability');
            }

            // 6. Employment Status & Notice Period
            else if (context.includes('employed') && (context.includes('currently') || context.includes('now'))) {
                answer = this.matchEmploymentStatus(field, facts);
            }
            else if (context.includes('notice') && (context.includes('period') || context.includes('days'))) {
                answer = this.matchNoticePeriod(field, facts);
            }

            // 7. Ethnicity / Race
            else if (context.includes('race') || context.includes('ethnicity')) {
                answer = this.matchEthnicity(field, facts);
            }

            // 6. Generic Types (Date, Time, Number) -> Implied Local by Prompt Rules
            else if (field.type === 'date') {
                answer = new Date().toISOString().split('T')[0]; // Today
            }
            else if (field.type === 'time') {
                answer = '09:00';
            }
            else if (field.type === 'number') {
                if (context.includes('salary')) answer = '60000'; // Safe default
                else if (context.includes('notice')) {
                    // Try to extract number from notice period string "30 days" -> "30"
                    const np = parseInt(facts.noticePeriod) || 0;
                    answer = np > 0 ? np.toString() : '0';
                }
                else if (context.includes('experience')) answer = Math.floor(facts.totalYearsExp).toString();
                else answer = '0'; // Default safe fallback
            }


            if (answer !== null) {
                resolved[field.selector] = {
                    value: answer,
                    confidence: 1.0,
                    source: 'local_heuristic',
                    field_type: field.type
                };

                if (field.name) {
                    resolvedGroups.add(field.name);
                }
            }
        });

        // Second pass: Populate remaining, filtering out resolved groups
        fields.forEach(field => {
            if (resolved[field.selector]) return; // Already resolved
            if (field.name && resolvedGroups.has(field.name)) return; // Group resolved

            remaining.push(field);
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
                disability: resumeData.customFields?.disabilityStatus || '',
                race: resumeData.customFields?.race || resumeData.customFields?.ethnicity || ''
            },
            skills: (resumeData.skills?.technical || []).map(s => s.toLowerCase()),
            noticePeriod: resumeData.customFields?.noticePeriod || null, // e.g. "30 days" or "1 month"
            isEmployed: (resumeData.experience || []).some(j => j.current === true)
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

    matchVisa(field, facts, context) {
        const text = (field.label + ' ' + (field.value || '')).toLowerCase();
        const valueLower = (field.value || '').toLowerCase(); // Strict value check
        const isYes = valueLower === 'yes' || valueLower === 'true' || valueLower === 'on';
        const isNo = valueLower === 'no' || valueLower === 'false' || valueLower === 'off';

        // 1. Sponsorship Question: "Do you require sponsorship?"
        if (context.includes('sponsorship') || text.includes('sponsorship')) {
            // "Will you now or in future require..." -> If sponsorshipRequired=false, answer NO.
            // If sponsorshipRequired=true, answer YES.

            if (facts.sponsorshipRequired) {
                if (isYes) return field.value;
            } else {
                if (isNo) return field.value;
            }
        }

        // 2. Authorization Question: "Are you authorized?", "Legally allowed?"
        if (context.includes('authorized') || context.includes('authorization') || context.includes('legally')) {
            // "Are you authorized to work?" -> If sponsorshipRequired=false (meaning authorized based on assumption), answer YES.
            // Note: This logic assumes if you don't need sponsorship, you are authorized.
            // Real world: You might be authorized BUT need sponsorship later (OPT).
            // But usually: Authorized = YES.

            // If authorized (default to true if not specified, or checks field)
            const authorized = facts.workAuthorization === 'Authorized' || !facts.sponsorshipRequired;

            if (authorized) {
                if (isYes) return field.value;
            } else {
                if (isNo) return field.value;
            }
        }

        // Select logic (simplified)
        if (field.type === 'select' && field.options) {
            const target = facts.sponsorshipRequired ? 'yes' : 'no';
            if (context.includes('sponsorship')) {
                return field.options.find(opt => opt.toLowerCase().includes(target)) || null;
            }
            if (context.includes('authorized')) {
                const authTarget = !facts.sponsorshipRequired ? 'yes' : 'no';
                return field.options.find(opt => opt.toLowerCase().includes(authTarget)) || null;
            }
        }

        return null;
    },

    matchLogistics(field, facts, context) {
        const text = (field.label + ' ' + (field.value || '')).toLowerCase();
        // Loose check for "Yes" in label or value
        const isYes = text.includes('yes') || text.includes('true') || (field.value === 'on');

        // Context-aware checking
        // "Relocate"
        if (context.includes('relocate')) {
            if (facts.willingToRelocate === true) {
                // If Checkbox ("Willing to relocate"), check it
                if (field.type === 'checkbox') return field.value;
                // If Radio "Yes", select it
                if (isYes) return field.value;
            } else if (facts.willingToRelocate === false) {
                // If Radio "No" (implied if not Yes), select it
                if (!isYes && field.type === 'radio') return field.value;
            }
        }

        // "Remote"
        if (context.includes('remote')) {
            // Check if profile mentions "remote" in location preference
            const wantsRemote = facts.preferredLocation.includes('remote');

            if (wantsRemote) {
                if (field.type === 'checkbox') return field.value;
                if (isYes) return field.value;
            } else {
                if (!isYes && field.type === 'radio') return field.value;
            }
        }

        if (context.includes('travel')) {
            // Optimistic handling: If it's a checkbox "Willing to travel", check it?
            // Safer: Leave for AI if not explicit. But let's check it for now if simple boolean.
            if (field.type === 'checkbox') return field.value;
        }

        return null;
    },


    matchSkills(field, facts) {
        // Multi-select or Checkbox group
        // If Select
        if (field.type === 'select' && field.options) {
            // Return ARRAY of matching values
            const matches = field.options.filter(opt => {
                const optLower = opt.toLowerCase();
                return facts.skills.some(skill => optLower.includes(skill) || skill.includes(optLower));
            });
            return matches.length > 0 ? matches : null;
        }
        // If Checkbox
        if (field.type === 'checkbox') {
            const val = (field.value || '').toLowerCase();
            // If value is present, use it directly (e.g. "javascript")
            if (val.length > 1) {
                const isMatch = facts.skills.some(skill => val.includes(skill) || skill.includes(val));
                return isMatch ? field.value : null;
            }

            // Fallback: Use label if value is generic/empty, but strip common prefixes
            let text = (field.label || '').toLowerCase();
            // Remove group label if present (heuristic)
            const commonPrefixes = ['skills', 'technologies', 'proficiency', 'select', ':'];
            commonPrefixes.forEach(p => text = text.replace(p, ''));

            const isMatch = facts.skills.some(skill => text.includes(skill) || skill.includes(text));
            return isMatch ? field.value : null;
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

        // Helper: get level from string
        const getLevel = (str) => {
            if (!str) return 0;
            str = str.toLowerCase();
            for (const [key, lvl] of Object.entries(levels)) {
                if (str.includes(key)) return lvl;
            }
            return 0;
        };

        const text = (field.label + ' ' + (field.value || '')).toLowerCase();

        // Select: Iterate options
        if (field.type === 'select' && field.options) {
            // Find option with closest matching level
            // Note: options might be values. If values are codes (e.g. "deg_1"), this fails.
            // But usually they are "bachelors", "masters".
            return field.options.find(opt => getLevel(opt) === targetLevel) || null;
        }

        // Radio: Check if THIS option matches
        if (field.type === 'radio') {
            if (getLevel(text) === targetLevel) return field.value;
        }

        return null;
    },

    matchDemographics(field, facts, key) {
        let userVal = (facts.demographics[key] || '').toLowerCase();
        if (!userVal) return null;

        const text = (field.label + ' ' + (field.value || '')).toLowerCase();

        // Direct match
        if (text.includes(userVal)) return field.value;

        return null;
    },

    matchEthnicity(field, facts) {
        return this.matchDemographics(field, facts, 'race');
    },

    matchEmploymentStatus(field, facts) {
        const text = (field.label + ' ' + (field.value || '')).toLowerCase();
        const isYes = text === 'yes' || text === 'true';
        const isNo = text === 'no' || text === 'false';

        // "Are you currently employed?"
        if (facts.isEmployed) {
            if (isYes) return field.value;
        } else {
            if (isNo) return field.value;
        }
        return null;
    },

    matchNoticePeriod(field, facts) {
        if (!facts.noticePeriod) return null;

        // Example fact: "30 days"
        // Options: "Immedate", "15 days", "30 days", "60 days"

        // Simple strategy: check if fact is contained in option
        const factLower = facts.noticePeriod.toLowerCase();
        const text = (field.label + ' ' + (field.value || '')).toLowerCase();

        if (text.includes(factLower)) return field.value;

        // Number matching? e.g. fact="30" matches "30 days"
        const factNum = parseInt(factLower) || 0;
        if (factNum > 0 && text.includes(factNum.toString())) return field.value;

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
    window.LocalMatcherDebug = LocalMatcher; // Alias for debug
}
