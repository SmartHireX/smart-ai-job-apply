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
        // ========== DETAILED INPUT LOGGING ==========
        console.log('🔵 ============================================');
        console.log('🔵 LOCAL MATCHER - ALL INPUT FIELDS');
        console.log('🔵 ============================================');
        console.log(`📊 Total fields received: ${fields.length}`);
        console.log('');

        fields.forEach((field, index) => {
            console.log(`📝 Field #${index + 1}:`);
            console.log(`   Type: ${field.type}`);
            console.log(`   Label: ${field.label || '(no label)'}`);
            console.log(`   Name: ${field.name || '(no name)'}`);
            console.log(`   ID: ${field.id || '(no id)'}`);
            console.log(`   Selector: ${field.selector || '(no selector)'}`);
            console.log(`   Value: ${field.value || '(no value)'}`);
            if (field.options && field.options.length > 0) {
                console.log(`   Options: [${field.options.join(', ')}]`);
            }
            console.log('   ---');
        });

        console.log('🔵 ============================================');
        console.log('');
        // ========== END OF INPUT LOGGING ==========

        const resolved = {};
        const remaining = [];

        // Pre-calculate facts
        const facts = this.extractFacts(resumeData);
        console.log('🧠 [LocalMatcher] extracted facts:', facts);

        // Pre-processing: Group Radio/Checkbox fields by Name
        const fieldGroups = {};
        fields.forEach(field => {
            if ((field.type === 'radio' || field.type === 'checkbox') && field.name) {
                if (!fieldGroups[field.name]) fieldGroups[field.name] = [];
                fieldGroups[field.name].push(field);
            }
        });

        // Set of processed names to skip individual processing
        const processedNames = new Set();

        // Pass 1: Handle Groups (Radios/Checkboxes)
        for (const [name, group] of Object.entries(fieldGroups)) {
            // Use the first field's label/context as the group "master"
            const primary = group[0];
            const labelLower = (primary.label || '').toLowerCase();
            const nameLower = (name || '').toLowerCase();
            const context = `${labelLower} ${nameLower}`;

            let answerIdx = -1; // Index of the selected option in the group
            let answerVal = null;

            // DEBUG LOGGING
            if (context.includes('visa') || context.includes('skill') || context.includes('relocate') || context.includes('sponsor')) {
                console.log(`[LocalMatcher] GROUP TRACE "${name}":`, group.map(g => g.value));
            }

            // Route to Matchers (Passing FULL GROUP)
            if (context.includes('experience') || context.includes('years')) {
                // Not typically radio, but possible
            }
            else if (context.includes('sponsorship') || context.includes('visa') || context.includes('authorized')) {
                answerVal = this.matchVisaGroup(group, facts, context);
            }
            else if (context.includes('relocate') || context.includes('remote') || context.includes('travel')) {
                answerVal = this.matchLogisticsGroup(group, facts, context);
            }
            else if (context.includes('skill')) {
                // Skills usually check individual checkboxes, but let's see
                // For checkboxes, we might want to check MULTIPLE.
                // If type is radio, single select. If checkbox, multi.
                if (primary.type === 'checkbox') {
                    // Start with empty, let individual loop handle or handle here?
                    // Better to handle here for "Select your technical skills" 
                    const matches = this.matchSkillsGroup(group, facts);
                    matches.forEach(val => {
                        // Find the field with this value
                        const target = group.find(g => g.value === val);
                        if (target) resolved[target.selector] = { value: val, confidence: 1, source: 'local-rule' };
                    });
                    processedNames.add(name);
                    continue;
                }
            }
            // ... Add other groups as needed

            // Apply Group Result (For Radios - Single Select)
            if (answerVal !== null && primary.type === 'radio') {
                // Find the field that matches this value
                const target = group.find(g => g.value === answerVal);
                if (target) {
                    resolved[target.selector] = { value: answerVal, confidence: 1, source: 'local-rule' };
                    console.log(`[LocalMatcher] Group "${name}" resolved to ->`, answerVal);
                }
                processedNames.add(name);
            }
        }

        // Pass 2: Handle Remaining / Non-Grouped Fields
        fields.forEach(field => {
            if (field.name && processedNames.has(field.name)) return;

            let answer = null;
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
            else if ((context.includes('sponsorship') || context.includes('visa') || context.includes('authorized')) && field.type !== 'radio') {
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

    // --- GROUP MATCHERS ---

    matchVisaGroup(group, facts, context) {
        let targetAnswer = null; // 'yes' or 'no'

        // 1. Sponsorship Question
        if (context.includes('sponsorship') || context.includes('sponsor')) {
            targetAnswer = facts.sponsorshipRequired ? 'yes' : 'no';
        }
        // 2. Authorization Question
        else if (context.includes('authorized') || context.includes('legally')) {
            const authorized = facts.workAuthorization === 'Authorized' || !facts.sponsorshipRequired;
            targetAnswer = authorized ? 'yes' : 'no';
        }

        if (targetAnswer) {
            console.log(`[LocalMatcher] Visa Target -> "${targetAnswer}" (sponsorship: ${facts.sponsorshipRequired})`);

            const match = group.find(opt => {
                const val = (opt.value || '').toLowerCase();
                const lbl = (opt.label || '').toLowerCase();

                // Strict Value Checks
                if (targetAnswer === 'yes') {
                    if (val === 'yes' || val === 'true' || val === 'on') return true;
                    if (/\byes\b/.test(lbl)) return true;
                }

                if (targetAnswer === 'no') {
                    if (val === 'no' || val === 'false' || val === 'off') return true;
                    if (/\bno\b/.test(lbl)) return true;
                }

                return false;
            });
            return match ? match.value : null;
        }

        return null;
    },

    matchLogisticsGroup(group, facts, context) {
        let targetAnswer = null;

        if (context.includes('relocate')) {
            targetAnswer = facts.willingToRelocate ? 'yes' : 'no';
        }
        else if (context.includes('remote')) {
            const wantsRemote = facts.preferredLocation.includes('remote');
            targetAnswer = wantsRemote ? 'yes' : 'no';
        }

        if (targetAnswer) {
            const match = group.find(opt => {
                const val = (opt.value || '').toLowerCase();
                const lbl = (opt.label || '').toLowerCase();
                if (targetAnswer === 'yes') return val === 'true' || val === 'yes' || val === 'on' || lbl.includes('yes');
                if (targetAnswer === 'no') return val === 'false' || val === 'no' || val === 'off' || lbl.includes('no');
                return false;
            });
            return match ? match.value : null;
        }
        return null;
    },

    matchSkillsGroup(group, facts) {
        const matches = [];
        const userSkills = facts.skills.map(s => s.toLowerCase());

        group.forEach(opt => {
            const val = (opt.value || '').toLowerCase();
            const lbl = (opt.label || '').toLowerCase();

            let isMatch = false;
            // Value match
            if (val.length > 1) {
                isMatch = userSkills.some(skill => val.includes(skill) || skill.includes(val));
            }
            // Label match
            if (!isMatch && lbl.length > 1 && !lbl.includes('select')) {
                isMatch = userSkills.some(skill => lbl.includes(skill) || skill.includes(lbl)); // Loose match
            }

            if (isMatch) matches.push(opt.value);
        });

        return matches;
    },

    // Legacy / Single Field Wrappers
    matchVisa(field, facts, context) {
        return this.matchVisaGroup([{ value: field.value, label: field.label }], facts, context);
    },

    matchLogistics(field, facts, context) {
        return this.matchLogisticsGroup([{ value: field.value, label: field.label }], facts, context);
    },

    matchSkills(field, facts) {
        const matches = this.matchSkillsGroup([{ value: field.value, label: field.label }], facts);
        return matches.length > 0 ? matches[0] : null; // Return single value or null
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
