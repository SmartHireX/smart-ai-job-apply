/**
 * Local Semantic Matcher
 * 
 * High-Performance, Deterministic Logic Engine for Field Resolution.
 * Bypasses AI for known facts (Facts) and logical rules (Rules).
 * 
 * Features:
 * - Hybrid Fuzzy Matching (Levenshtein + Token Overlap)
 * - Strict Indexing for Repeating Sections (Job 0, Edu 1)
 * - Synonym-Aware Rule Engine (Visa, Relocation, Demographics)
 */

class RuleEngine {
    constructor() {
        this.debug = true; // Toggle for verbose logging
        this.synonyms = this.getSynonymsDictionary();
    }

    /**
     * Main Entry Point
     * @param {Array} fields - Unmapped fields
     * @param {Object} resumeData - Structured user data
     */
    resolveFields(fields, resumeData) {

        const facts = this.extractFacts(resumeData);
        const resolved = {};
        const remaining = [];
        const processedNames = new Set();

        // 1. Group Fields (Radios/Checkboxes)
        const groups = this.groupFieldsByName(fields);

        // 2. Process Groups (Batch Logic)
        for (const [name, group] of Object.entries(groups)) {
            const result = this.resolveGroup(name, group, facts);
            if (result) {
                // Apply logic result to all matching fields in group
                if (result.isMulti) {
                    // Checkbox Group: Result is Array of Values
                    result.values.forEach(val => {
                        // Find matching checkboxes
                        const matches = this.findMatchingOptions(group, val);
                        matches.forEach(m => {
                            resolved[m.selector] = { value: true, confidence: 1.0, source: 'local_rule_multi' };
                        });
                    });
                    // For Multi, we usually let MultiValueHandler do the actual filling, 
                    // but here we resolve the *intent*.
                    // Actually, if LocalMatcher resolves it, we assume we return strict values.
                    // The FieldRouter will pass these to ExecutionEngine.
                    // ExecutionEngine fills by Selector.
                    // So we map specific selectors to "checked=true" (or value).
                } else {
                    // Radio Group: Result is Single Value
                    const target = this.findMatchingOption(group, result.value);
                    if (target) {
                        resolved[target.selector] = { value: result.value, confidence: 1.0, source: 'local_rule_single' };
                    }
                }
                processedNames.add(name);
            }
        }

        // 3. Process Individual Fields
        fields.forEach(field => {
            if (field.name && processedNames.has(field.name)) return;

            const context = this.getContext(field);

            // Skip History Fields (Handled by HistoryHandler)
            if (this.isHistoryField(context, field)) {
                remaining.push(field);
                return;
            }

            const answer = this.resolveSingleField(field, context, facts);
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

        return { defined: resolved, remaining };
    }

    // --- RESOLUTION LOGIC ---

    resolveGroup(name, group, facts) {
        const primary = group[0];
        const context = `${(primary.label || '').toLowerCase()} ${name.toLowerCase()}`;

        if (context.includes('visa') || context.includes('sponsor') || context.includes('authorized')) {
            return { value: this.matchVisaRule(facts, context), isMulti: false };
        }
        if (context.includes('relocate') || context.includes('remote')) {
            return { value: this.matchLogisticsRule(facts, context), isMulti: false };
        }
        // Skills are tricky in LocalMatcher, usually better in MultiValueHandler.
        // But if we have them here, we can try.

        return null;
    }

    resolveSingleField(field, context, facts) {
        // Debug Context
        if (this.debug && (context.includes('name') || context.includes('email'))) {
            // console.log(`🔍 [RuleEngine] Checking: "${field.label}" Context: "[${context}]"`);
        }

        // 1. Demographics
        if (context.match(/gender|sex|male|female/)) return this.matchDemographic(field, facts.demographics.gender);
        if (context.includes('veteran')) return this.matchDemographic(field, facts.demographics.veteran);
        if (context.includes('disability')) return this.matchDemographic(field, facts.demographics.disability);
        if (context.match(/race|ethnicity/)) return this.matchDemographic(field, facts.demographics.race);

        // 2. Rules
        if (context.match(/notice|period/)) return this.matchNoticePeriod(field, facts.noticePeriod);
        if (context.includes('employed') && context.includes('current')) {
            return facts.isEmployed ? this.getYesNo(field, true) : this.getYesNo(field, false);
        }

        // 3. Facts (Direct Map)
        // Names
        if (context.includes('first') && context.includes('name')) return this._logMatch(field, facts.basics.firstName || null, 'firstName');
        if (context.includes('last') && context.includes('name')) return this._logMatch(field, facts.basics.lastName || null, 'lastName');
        if (context.includes('full') || (context.includes('name') && !context.includes('first') && !context.includes('last') && !context.includes('file') && !context.includes('user'))) return this._logMatch(field, facts.basics.fullName || null, 'fullName');

        // Contact
        if (context.includes('email')) return this._logMatch(field, facts.basics.email || null, 'email');
        if (context.includes('phone') || context.includes('mobile')) return this._logMatch(field, facts.contact.phone || null, 'phone');
        if (context.includes('zip') || context.includes('postal')) return this._logMatch(field, facts.contact.zip || null, 'zip');
        if (context.includes('city')) return this._logMatch(field, facts.contact.city || null, 'city');
        if (context.match(/address|street/)) return this._logMatch(field, facts.contact.address || null, 'address');

        // Links
        if (context.includes('linkedin')) return this._logMatch(field, facts.basics.linkedin || null, 'linkedin');
        if (context.includes('github') || context.includes('git')) return this._logMatch(field, facts.basics.github || null, 'github');
        if (context.includes('portfolio') || context.includes('website') || context.includes('url')) return this._logMatch(field, facts.basics.portfolio || null, 'portfolio');

        // Compensation
        if (context.match(/salary|pay|compensation|ctc|remuneration/)) {
            if (context.includes('expect') || context.includes('desire')) return this._logMatch(field, facts.compensation.desiredSalary || null, 'desiredSalary');
            return this._logMatch(field, facts.compensation.currentSalary || facts.compensation.desiredSalary || null, 'currentSalary');
        }

        // 4. Experience Years
        if (context.match(/years?|duration|how long/)) {
            return this.matchExperienceYears(field, facts.totalYearsExp);
        }

        return null;
    }

    _logMatch(field, value, source) {
        if (this.debug && value) {
            // console.log(`🎯 [RuleEngine] Matched: "${field.label || field.name}" -> "${value}" (Source: ${source})`);
        }
        return value;
    }

    // --- RULES ENGINE ---

    matchVisaRule(facts, context) {
        if (context.includes('sponsor')) return facts.sponsorshipRequired ? 'Yes' : 'No';
        return 'Yes'; // Default to authorized
    }

    matchLogisticsRule(facts, context) {
        if (context.includes('remote')) return facts.preferredLocation.includes('remote') ? 'Yes' : 'No';
        return facts.willingToRelocate ? 'Yes' : 'No';
    }

    matchDemographic(field, userValue) {
        if (!userValue) return null;
        // If field has options (Select/Radio), fuzzy match
        if (field.options?.length) {
            return this.findBestMatch(field.options, userValue);
        }
        return userValue; // Text input
    }

    matchNoticePeriod(field, userValue) {
        if (!userValue) return null;
        if (field.options?.length) return this.findBestMatch(field.options, userValue);
        return userValue;
    }

    getYesNo(field, isYes) {
        if (field.options?.length) {
            return this.findBestMatch(field.options, isYes ? 'Yes' : 'No');
        }
        return isYes ? 'Yes' : 'No';
    }

    matchExperienceYears(field, years) {
        // Logic to range match "5-7 years" vs 6
        if (field.options?.length) {
            return field.options.find(opt => this.checkRangeMatch(opt, years)) || null;
        }
        return years.toString();
    }

    // --- MATCHING UTILS ---

    checkRangeMatch(optionText, value) {
        const str = String(optionText).toLowerCase();
        const nums = str.match(/\d+/g);
        if (!nums) return false;

        const v = parseInt(value);
        if (str.includes('+') || str.includes('more')) return v >= parseInt(nums[0]);
        if (nums.length === 2) return v >= parseInt(nums[0]) && v <= parseInt(nums[1]);
        return v === parseInt(nums[0]);
    }

    findMatchingOption(group, targetValue) {
        if (!targetValue) return null;
        // Best match from group logic
        let best = null;
        let maxScore = 0;

        group.forEach(field => {
            const text = `${field.label} ${field.value}`.toLowerCase();
            const score = this.hybridFuzzyScore(text, String(targetValue).toLowerCase());
            if (score > maxScore) {
                maxScore = score;
                best = field;
            }
        });

        // Threshold
        return maxScore > 0.6 ? best : null;
    }

    findMatchingOptions(group, targetValue) {
        // Return all that match
        return group.filter(field => {
            const text = `${field.label} ${field.value}`.toLowerCase();
            return this.hybridFuzzyScore(text, String(targetValue).toLowerCase()) > 0.8;
        });
    }

    findBestMatch(options, targetValue) {
        let best = null;
        let maxScore = 0;
        options.forEach(opt => {
            const val = typeof opt === 'object' ? (opt.value || opt.label) : opt;
            const score = this.hybridFuzzyScore(String(val).toLowerCase(), String(targetValue).toLowerCase());
            if (score > maxScore) {
                maxScore = score;
                best = val;
            }
        });
        return maxScore > 0.6 ? best : null;
    }

    /**
     * FANG-Level Hybrid Exactness
     * 1. Token Overlap (Best for "Senior Engineer" vs "Engineer, Senior")
     * 2. Levenshtein (Best for typos "Enginer")
     * 3. Substring (Best for "Male" in "Cis-Male")
     */
    hybridFuzzyScore(candidate, target) {
        if (candidate.includes(target) || target.includes(candidate)) return 0.95; // Strong substring

        // Token Jaccard
        const t1 = new Set(candidate.split(/[\s,._-]+/));
        const t2 = new Set(target.split(/[\s,._-]+/));
        let intersection = 0;
        t1.forEach(t => { if (t2.has(t)) intersection++; });
        const jaccard = intersection / Math.max(t1.size, t2.size, 1);

        if (jaccard > 0.7) return jaccard;

        // Levenshtein Fallback
        const dist = this.levenshtein(candidate, target);
        const maxLen = Math.max(candidate.length, target.length);
        const levScore = (maxLen - dist) / maxLen;

        return Math.max(jaccard, levScore);
    }

    levenshtein(a, b) {
        if (!a.length) return b.length;
        if (!b.length) return a.length;
        const matrix = [];
        for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
        for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) == a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
                }
            }
        }
        return matrix[b.length][a.length];
    }

    // --- DATA EXTRACTION ---

    extractFacts(resumeData) {
        return {
            basics: {
                firstName: resumeData.firstName || resumeData.basics?.firstName,
                lastName: resumeData.lastName || resumeData.basics?.lastName,
                fullName: resumeData.name || resumeData.basics?.name || `${resumeData.firstName || ''} ${resumeData.lastName || ''}`.trim(),
                email: resumeData.email || resumeData.basics?.email,
                linkedin: this.findProfileUrl(resumeData, 'linkedin'),
                github: this.findProfileUrl(resumeData, 'github'),
                portfolio: this.findProfileUrl(resumeData, 'portfolio') || resumeData.basics?.url
            },
            contact: {
                phone: resumeData.phone || resumeData.basics?.phone,
                zip: resumeData.zip || resumeData.basics?.location?.postalCode,
                city: resumeData.city || resumeData.basics?.location?.city,
                address: resumeData.address || resumeData.basics?.location?.address
            },
            demographics: {
                gender: resumeData.customFields?.gender,
                veteran: resumeData.customFields?.veteranStatus,
                disability: resumeData.customFields?.disabilityStatus,
                race: resumeData.customFields?.race
            },
            compensation: {
                desiredSalary: resumeData.customFields?.desiredSalary,
                currentSalary: resumeData.customFields?.currentSalary,
                currency: resumeData.customFields?.currency || 'USD'
            },
            noticePeriod: resumeData.customFields?.noticePeriod,
            sponsorshipRequired: resumeData.customFields?.sponsorshipRequired === true,
            willingToRelocate: resumeData.customFields?.willingToRelocate === true,
            preferredLocation: (resumeData.customFields?.preferredLocation || '').toLowerCase(),
            isEmployed: (resumeData.experience || []).some(j => j.current),
            totalYearsExp: this.calculateTotalExperience(resumeData.experience || []),
            skills: resumeData.skills || [] // Extract skills
        };
    }

    findProfileUrl(resumeData, networkFragment) {
        const profiles = resumeData.profiles || resumeData.basics?.profiles || [];
        const found = profiles.find(p =>
            (p.network && p.network.toLowerCase().includes(networkFragment)) ||
            (p.url && p.url.toLowerCase().includes(networkFragment))
        );
        return found ? found.url : null;
    }

    calculateTotalExperience(jobs) {
        // Simple year sum (can be improved to overlap logic)
        return jobs.reduce((acc, job) => {
            const start = new Date(job.startDate).getFullYear();
            const end = job.current ? new Date().getFullYear() : new Date(job.endDate).getFullYear();
            return acc + (end - start);
        }, 0);
    }

    // --- HELPERS ---

    matchSkills(options, userSkills) {
        // Guard: Ensure userSkills is an array
        if (!userSkills || !Array.isArray(userSkills)) {
            // If userSkills is an object (like {technical: [...], soft: [...]}), flatten it
            if (userSkills && typeof userSkills === 'object') {
                userSkills = Object.values(userSkills).flat().filter(Boolean);
            } else {
                return []; // No skills to match
            }
        }

        // Return all options that fuzzy match any user skill
        const matched = [];
        const skillSet = new Set(userSkills.map(s => String(s).toLowerCase()));

        options.forEach(opt => {
            const optVal = typeof opt === 'object' ? (opt.value || opt.label) : opt;
            if (!optVal) return;

            // Check against all user skills
            let isMatch = false;
            for (const skill of skillSet) {
                if (this.hybridFuzzyScore(String(optVal).toLowerCase(), skill) > 0.8) {
                    isMatch = true;
                    break;
                }
            }
            if (isMatch) matched.push(optVal);
        });
        return matched;
    }

    groupFieldsByName(fields) {
        const groups = {};
        fields.forEach(f => {
            if ((f.type === 'radio' || f.type === 'checkbox') && f.name) {
                if (!groups[f.name]) groups[f.name] = [];
                groups[f.name].push(f);
            }
        });
        return groups;
    }

    getContext(field) {
        const parts = [
            field.label || '',
            field.name || '',
            field.id || '',
            field.ml_prediction?.label || '' // Critical: Include AI Classification
        ];
        return parts.join(' ').toLowerCase();
    }

    isHistoryField(context, field) {
        // Regex for job/edu terms
        // REMOVED: if (field.field_index !== undefined) return true; -> This was skipping valid indexed fields like first_name
        return /company|employer|job|title|school|university|degree|major|gpa|start date|end date/.test(context);
    }

    getSynonymsDictionary() {
        return {
            'male': ['man', 'cis-male', 'male', 'boy'],
            'female': ['woman', 'cis-female', 'female', 'girl'],
            'yes': ['y', 'true', 'definitely', 'yes'],
            'no': ['n', 'false', 'never', 'no']
        };
    }
}

if (typeof window !== 'undefined') window.RuleEngine = new RuleEngine();
