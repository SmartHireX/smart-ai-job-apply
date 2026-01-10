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

                    // Return the FULL ARRAY to trigger the robust setCheckboxValue logic
                    // We map it to the primary selector (any element in the group works because of name grouping)
                    if (matches.length > 0) {
                        resolved[primary.selector] = { value: matches, confidence: 1, source: 'local-rule' };
                    }

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
            else if (context.includes('degree') || context.includes('education') || context.includes('school') || context.includes('university') || context.includes('college') || context.includes('edu_')) {
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

            // 8. Enhanced Regex / Strict Contact Info (Zip, Phone, etc)
            else if (context.includes('zip') || context.includes('postal')) {
                answer = facts.contact.zip;
            }
            else if (context.includes('phone') || context.includes('mobile') || context.includes('cell')) {
                answer = facts.contact.phone;
            }
            else if (context.includes('city') || context.includes('town')) {
                answer = facts.contact.city;
            }
            else if (context.includes('state') || context.includes('province') || context.includes('region')) {
                answer = facts.contact.state;
            }
            else if (context.includes('address') || context.includes('street')) {
                answer = facts.contact.address;
            }

            // 6. Generic Types (Date, Time, Number) -> Implied Local by Prompt Rules
            else if (field.type === 'date' || context.includes('date')) {
                // "Start Date" or "Available From" usually means today/asap
                if (context.includes('birth')) {
                    // Start blank for DOB to avoid accidents, or parse from basics if available?
                    // Safe: Leave blank or implement strict DOB extraction later
                } else {
                    answer = new Date().toISOString().split('T')[0]; // Today
                }
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
        // PRE-SORT HISTORY (Latest First)
        const sortedEdu = this.getSortedHistory(resumeData.education);
        const sortedExp = this.getSortedHistory(resumeData.experience);

        return {
            totalYearsExp: this.calculateTotalExperience(resumeData.experience || []),
            education: sortedEdu,
            workExperience: sortedExp, // Expose sorted experience
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
            isEmployed: (resumeData.experience || []).some(j => j.current === true),

            // Contact Info (for Enhanced Regex)
            contact: {
                phone: resumeData.basics?.phone || resumeData.phone || '',
                email: resumeData.basics?.email || resumeData.email || '',
                city: resumeData.basics?.location?.city || resumeData.city || '',
                state: resumeData.basics?.location?.region || resumeData.state || '',
                zip: resumeData.basics?.location?.postalCode || resumeData.zip || '',
                address: resumeData.basics?.location?.address || resumeData.address || ''
            }
        };
    },

    // --- MATCHERS ---

    matchExperience(field, facts) {
        // 1. Check if this is a "Years of Experience" question (Range Match)
        // If the label asks for "How many years...", use the totalYears logic
        const context = (field.label + ' ' + (field.name || '')).toLowerCase();

        if (context.includes('how many') || context.includes('years') || context.includes('duration')) {
            return this.matchExperienceYears(field, facts.totalYearsExp);
        }

        // 2. Index-Aware Matching (like Education)
        // Extract Index from Name/ID OR Label (e.g., job_0, Employer 1)
        let index = 0;
        const nameId = (field.name || field.id || '');
        const indexMatch = nameId.match(/[_\-\[](\d+)[_\-\]]?/);

        if (indexMatch) {
            index = parseInt(indexMatch[1]);
        } else {
            // Check Label for "Employer 1", "Job 2", etc.
            const labelLower = (field.label || '').toLowerCase();
            const labelNumMatch = labelLower.match(/(?:employer|job|company|experience|work)\s*[#]?\s*(\d+)/);
            if (labelNumMatch) {
                const labelNum = parseInt(labelNumMatch[1]);
                if (labelNum > 0) index = labelNum - 1; // Convert 1-based label to 0-based index
            }
        }

        console.log(`💼 [LocalMatcher-Exp] Field: "${field.label}" (${nameId}) -> Index: ${index}`);

        // 3. Get specific experience entry
        if (!facts.workExperience || index >= facts.workExperience.length) {
            // STRICTER LOGIC: If we are looking for >1st item (e.g. Job 2) and don't have it,
            // we MUST return generic EMPTY to prevent AI from filling it with Job 1 or hallucinating.
            if (index > 0) {
                console.log(`   ⛔ Exp Index ${index} out of bounds (Total: ${facts.workExperience ? facts.workExperience.length : 0}). Returning EMPTY to block AI duplicate.`);
                return '';
            }
            // For Index 0 (Primary), we allow AI to try fallback (maybe parsing failed?)
            console.log(`   ⚠️ Exp Index ${index} not found locally. Handing over to AI.`);
            return null;
        }
        const job = facts.workExperience[index];
        console.log(`   ✅ Using Job #${index}: ${job.name || job.company}`);

        // 4. Match Field Type
        // Company / Employer
        if (context.includes('company') || context.includes('employer') || context.includes('organization')) {
            return job.name || job.company || null;
        }

        // Job Title / Role
        if (context.includes('title') || context.includes('role') || context.includes('position') || context.includes('designation')) {
            return job.position || job.title || null;
        }

        // Start Date
        if (context.includes('start') && context.includes('date')) {
            return this.normalizeDate(job.startDate, field.type === 'date' ? 'date' : 'text');
        }

        // End Date
        if (context.includes('end') && context.includes('date')) {
            const isCurrent = job.current || (job.endDate && job.endDate.toLowerCase() === 'present');
            if (isCurrent || !job.endDate) {
                console.log(`   ⛔ Job #${index} is Current/Ongoing. Returning EMPTY for End Date.`);
                return '';
            }
            return this.normalizeDate(job.endDate, field.type === 'date' ? 'date' : 'text');
        }

        // Description / Responsibilities
        if (context.includes('description') || context.includes('responsibilities') || context.includes('duties')) {
            return job.summary || job.description || (job.highlights ? job.highlights.join('\n') : null);
        }

        return null; // Fallback
    },

    matchExperienceYears(field, totalYears) {
        if (!field.options && !field.value) return null;

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

    // --- DATE NORMALIZATION ---

    /**
     * Normalize a date value to the target field format
     * @param {string} dateStr - Input date string
     * @param {string} targetType - 'date' (ISO) or 'text' (US/Locale)
     * @returns {string|null}
     */
    normalizeDate(dateStr, targetType = 'date') {
        if (!dateStr) return null;

        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;

        // ISO Format (YYYY-MM-DD) - Required for <input type="date">
        if (targetType === 'date') {
            return d.toISOString().split('T')[0];
        }

        // US Format (MM/DD/YYYY) - Common for text fields
        // We could make this locale-aware if needed later
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${mm}/${dd}/${yyyy}`;
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
                const text = (opt.label + ' ' + (opt.value || '')).toLowerCase();

                // Use Synonym Checker for robustness
                // Check if Option matches "Yes" (if target is yes) or "No" (if target is no)
                if (targetAnswer === 'yes') return this.checkSynonyms(text, 'yes') || this.checkSynonyms(text, 'true');
                if (targetAnswer === 'no') return this.checkSynonyms(text, 'no') || this.checkSynonyms(text, 'false');

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
                const text = (opt.label + ' ' + (opt.value || '')).toLowerCase();
                if (targetAnswer === 'yes') return this.checkSynonyms(text, 'yes');
                if (targetAnswer === 'no') return this.checkSynonyms(text, 'no');
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
        // 1. Extract Index from Name/ID OR Label
        let index = 0;
        const nameId = (field.name || field.id || '');
        const indexMatch = nameId.match(/[_\-\[](\d+)[_\-\]]?/);

        if (indexMatch) {
            index = parseInt(indexMatch[1]);
        } else {
            // Check Label for "School 1", "Education 2"
            const labelLower = (field.label || '').toLowerCase();
            const labelNumMatch = labelLower.match(/(?:school|education|university|college|institution)\s*[#]?\s*(\d+)/);
            if (labelNumMatch) {
                const labelNum = parseInt(labelNumMatch[1]);
                if (labelNum > 0) index = labelNum - 1; // Convert 1-based label to 0-based index
            }
        }

        console.log(`🎓 [LocalMatcher-Edu] Field: "${field.label}" (${nameId}) -> Index: ${index}`);

        // 2. Get specific education entry
        if (!facts.education || index >= facts.education.length) {
            // CRITICAL FIX: Only block AI (return '') if we are looking for >1st item.
            // If we are looking for the 1st item (index 0) and don't have it locally,
            // we SHOULD let the AI try (return null), as it might find it in raw text.
            if (index > 0) {
                console.log(`   ⚠️ Edu Index ${index} out of bounds (Total: ${facts.education ? facts.education.length : 0}). Returning EMPTY to block AI duplicate.`);
                return '';
            }
            return null; // Fallback to AI for primary field
        }
        const edu = facts.education[index];
        console.log(`   ✅ Using Education #${index}: ${edu.institution}`);

        const context = (field.label + ' ' + (field.name || '')).toLowerCase();

        // 3. Match Field Type
        // School / University
        if (context.includes('school') || context.includes('university') || context.includes('institution') || context.includes('college')) {
            return edu.institution || edu.organization || null;
        }

        // Degree / Major
        if (context.includes('degree') || context.includes('qualification') || context.includes('major')) {
            // Check if it's a dropdown for "Type" (BS, MS) or Text for "Major" (Computer Science)
            const degreeLevel = this.calculateHighestDegree([edu]); // Get level of THIS entry

            // If it's a select, try to match level or text
            if (field.type === 'select' || field.type === 'radio') {
                return this.calculateHighestDegree([edu]); // Reuse logic to return "bachelor", "master", etc.
            }
            return edu.area || edu.studyType || null;
        }

        // Start Date
        if (context.includes('start') && context.includes('date')) {
            return this.normalizeDate(edu.startDate, field.type === 'date' ? 'date' : 'text');
        }

        // End Date
        if (context.includes('end') && context.includes('date')) {
            // STRICT CHECK: If current or no end date, return generic handling or empty
            const isCurrent = edu.current || (edu.endDate && edu.endDate.toLowerCase() === 'present');

            if (isCurrent || !edu.endDate) {
                console.log(`   ⛔ Education #${index} is Current/Ongoing. Returning EMPTY for End Date to block generic fallback.`);
                return ''; // Return empty string to MARK AS RESOLVED (blocked), preventing Generic Date Fallback
            }
            return this.normalizeDate(edu.endDate, field.type === 'date' ? 'date' : 'text');
        }

        return null; // Fallback
    },

    // --- SYNONYMS DICTIONARY ---
    SYNONYMS: {
        'male': ['man', 'cis-male', 'male', 'boy'],
        'female': ['woman', 'cis-female', 'female', 'girl'],
        'white': ['caucasian', 'european', 'white', 'non-hispanic'],
        'hispanic': ['latino', 'latinx', 'spanish'],
        'black': ['african', 'african american'],
        'asian': ['indian', 'chinese', 'japanese', 'korean', 'vietnamese', 'filipino', 'south asian', 'east asian'],
        'indian': ['asian', 'south asian'],
        'veteran': ['served', 'military', 'armed forces'],
        'disability': ['disabled', 'impairment', 'condition', 'handicap']
    },

    /**
     * Check if text matches a value or its synonyms
     * @param {string} text - The form option text
     * @param {string} userVal - The user's profile value
     * @returns {boolean}
     */
    checkSynonyms(text, userVal) {
        if (!text || !userVal) return false;
        text = text.toLowerCase();
        userVal = userVal.toLowerCase();

        // 1. Direct Match
        if (text.includes(userVal) || userVal.includes(text)) return true;

        // 2. Look up userVal in synonyms
        // Find the canonical key for the userVal
        let canonicalKey = null;
        for (const [key, synonyms] of Object.entries(this.SYNONYMS)) {
            if (key === userVal || synonyms.includes(userVal)) {
                canonicalKey = key;
                break;
            }
        }

        if (canonicalKey) {
            // Check if text matches any synonym of the canonical key
            const synonyms = this.SYNONYMS[canonicalKey];
            return synonyms.some(syn => text.includes(syn));
        }

        return false;
    },

    matchDemographics(field, facts, key) {
        let userVal = (facts.demographics[key] || '').toLowerCase();
        if (!userVal) return null;

        const text = (field.label + ' ' + (field.value || '')).toLowerCase();

        // Enhanced Synonym Match
        if (this.checkSynonyms(text, userVal)) return field.value;

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

    // --- SORTING UTILS ---

    getSortedHistory(historyArray) {
        if (!historyArray || !Array.isArray(historyArray)) return [];

        // Sort DESCENDING by End Date (Latest First)
        // "Current" or "Present" -> Date.now()
        return [...historyArray].sort((a, b) => {
            const getEndTime = (item) => {
                if (item.current || (item.endDate && item.endDate.toLowerCase() === 'present')) return Date.now();
                return item.endDate ? new Date(item.endDate).getTime() : (item.startDate ? new Date(item.startDate).getTime() : 0);
            };
            return getEndTime(b) - getEndTime(a);
        });
    },

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
