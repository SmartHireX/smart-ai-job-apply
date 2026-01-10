/**
 * Form Analyzer for Smart AI Job Apply Extension
 * 
 * AI-powered form field analysis and data mapping using Gemini.
 * Identifies form fields, classifies their purpose, and maps resume data.
 * 
 * Uses Enterprise-Grade Prompts from SmartHireX Backend.
 */

// Prompt templates for AI operations (Ported from backend/ai/prompts.py)
const PROMPTS = {
    // ANALYZE_FORM REMOVED - We use local logic now
    MAP_DATA: `You are an intelligent job-application text assistant.

Your task is to generate values ONLY for unresolved TEXT-BASED form fields
(e.g., textarea, long text input).

⚠️ IMPORTANT:
- DO NOT fabricate experience or facts.
- For "select" or "radio" fields, YOU MUST PICK A VALID VALUE from the provided "options" array.
- If no option fits well, return null for that field.
- You will receive a mix of text and structured fields that local logic missed.

────────────────────────────
USER CONTEXT (COMPRESSED FACTS)
────────────────────────────
Name: {{name}}
Current Role: {{current_role}}
Total Experience: {{total_years_experience}} years

────────────────────────────
FULL APPLICANT PROFILE
────────────────────────────
## Personal Details
{{full_personal_info}}

## Work Experience
{{work_experience_details}}

## Education
{{education_details}}

## Skills
{{all_skills_details}}

## Projects
{{project_details}}

## Preferences & Additional Info
{{custom_fields_details}}

────────────────────────────
JOB CONTEXT
────────────────────────────
{{job_context}}

────────────────────────────
TEXT FIELDS TO FILL
────────────────────────────
Each item contains:
- selector: CSS selector
- label: Field label
- context: Help text or nearby description (if any)

Fields:
{{text_fields_array}}

────────────────────────────
INSTRUCTIONS
────────────────────────────
1. Generate concise, professional, ATS-friendly responses.
2. Tailor answers to the Job Context.
3. Use profile facts to answer questions.
4. Avoid filler words and generic phrases.
5. Keep answers under 120 words unless clearly required.
6. DO NOT fabricate experience or facts.
7. If context is insufficient, return an empty string.
8. **Sequential History Mapping**: For indexed fields (e.g. school_0, school_1) or repeated sections (Employer 1, Employer 2), YOU MUST map them in CHRONOLOGICAL ORDER (Latest to Oldest). Use the 1st history item for the 1st field (index 0), the 2nd history item for the 2nd field (index 1), and so on. NEVER repeat the same history entry for multiple distinct indices.
────────────────────────────
RESPONSE FORMAT (JSON ONLY)
────────────────────────────
{
  "mappings": {
    "<css_selector_1>": {
      "value": "<generated_text>",
      "confidence": <0.6 - 0.8>,
      "source": "ai_generated",
      "field_type": "textarea"
    },
    "<css_selector_2>": {
      "value": "<exact_option_value>", 
      "confidence": 0.9,
      "source": "ai_generated",
      "field_type": "select" 
    },
    "<css_selector_3>": {
      "value": true, 
      "confidence": 0.9,
      "source": "ai_generated",
      "field_type": "checkbox" 
    }
  }
}

⚠️ SPECIFIC OUTPUT RULES:
- **Select/Radio**: value MUST be one of the 'value' strings from the provided options array.
- **Checkbox (Single)**: value MUST be 'true' or 'false'.
- **Checkbox (Group)**: value MUST be an Array of matching values, e.g. ["remote", "contract"].

⚠️ RULES:
- Return mappings ONLY for provided selectors
- No extra text, no explanations
- Valid JSON only
`, // Optimization: We will construct a minimal prompt for just the "hard" fields dynamically.

    // NEW: Batched processing prompt for first batch (full context)
    MAP_DATA_BATCH: `You are an intelligent job-application assistant.

Your task is to answer 1-5 form questions professionally and concisely.

────────────────────────────
USER CONTEXT
────────────────────────────
Name: {{name}}
Current Role: {{current_role}}
Total Experience: {{total_years_experience}} years

────────────────────────────
FULL APPLICANT PROFILE
────────────────────────────
## Personal Details
{{full_personal_info}}

## Work Experience
{{work_experience_details}}

## Education
{{education_details}}

## Skills
{{all_skills_details}}

## Projects
{{project_details}}

## Preferences & Additional Info
{{custom_fields_details}}

────────────────────────────
JOB CONTEXT
────────────────────────────
{{job_context}}

────────────────────────────
QUESTIONS TO ANSWER
────────────────────────────
{{fields_array}}

────────────────────────────
INSTRUCTIONS
────────────────────────────
1. Generate concise, professional, ATS-friendly responses.
2. Tailor answers to the Job Context.
3. Use profile facts - DO NOT fabricate experience.
4. Keep answers under 120 words unless clearly required.
5. For select/radio/checkbox fields, ONLY use values from the provided options array.
6. **Sequential History Mapping**: For indexed fields (e.g. school_0, school_1), map them in CHRONOLOGICAL ORDER (Latest to Oldest). Index 0 = Latest, Index 1 = Previous. DO NOT repeat the same entry.
────────────────────────────
RESPONSE FORMAT (JSON ONLY - USE ABBREVIATED KEYS)
────────────────────────────
{
  "m": {
    "<selector>": {"v": "<answer>", "c": <0.6-0.9>, "t": "<type>"}
  }
}

KEY: m=mappings, v=value, c=confidence, t=type
Return mappings ONLY for provided selectors. Valid JSON only.
`,

    // NEW: Condensed prompt for subsequent batches (minimal context)
    MAP_DATA_BATCH_CONDENSED: `Job application assistant. Answer 1-5 questions.

PROFILE: {{name}} | {{current_role}} | {{years_exp}}yrs | {{top_skills}}
EDU: {{education}} | LOC: {{location}}

PREV ANSWERS:
{{previous_qa}}

JOB: {{job_context}}

QUESTIONS:
{{fields_array}}

RULES: <120 words, use provided facts only, select/radio/checkbox use given options only.

JSON RESPONSE (abbreviated keys):
{"m":{"<selector>":{"v":"<answer>","c":<0.6-0.9>,"t":"<type>"}}}

KEY: m=mappings, v=value, c=confidence, t=type
`,





    GENERATE_ANSWER: `You are helping a job applicant answer a question on a job application form. 

Based on the applicant's resume and the specific question, write a professional, concise answer.

Guidelines:
- Be professional and confident
- Keep it concise (2-4 sentences unless more detail is clearly needed)
- Use information from the resume when relevant
- For "Why do you want to work here?" type questions, focus on career growth and company fit
- For behavioral questions, use STAR method briefly
- Don't make up specific experiences not in the resume

Question: {{QUESTION}}

Context about the job (if available):
{{CONTEXT}}

Applicant's Resume:
{{RESUME}}

Write the answer:
`,

    CHAT_SYSTEM: `You are Nova, an AI career assistant residing in a browser extension.

**Context**:
- **User Profile/Resume**: {{RESUME}}
- **Role**: You are a helpful assistant for job applications.

**Instructions**:
1. Analyze user intent: Are they asking about their resume, job applications, or general career advice?
2. Use the provided **User Profile/Resume** to answer accurately.
3. Be concise (under 150 words) and helpful.
4. If the user asks for a cover letter or resume tailoring, use the resume data provided.
`
};

// ==========================================
// HEURISTIC ENGINE
// ==========================================

const HEURISTIC_PATTERNS = {
    name_first: [/first.*name/i, /fname/i, /given.*name/i],
    name_last: [/last.*name/i, /lname/i, /surname/i, /family.*name/i],
    name_full: [/full.*name/i, /^name$/i, /your.*name/i],
    email: [/email/i, /e-mail/i],
    phone: [/phone/i, /mobile/i, /contact.*number/i, /cell/i],
    linkedin: [/linkedin/i],
    github: [/github/i, /git/i],
    portfolio: [/portfolio/i, /website/i, /personal.*site/i],
    city: [/city/i, /location/i],
    resume: [/resume/i, /cv/i, /upload.*resume/i],
    cover_letter: [/cover.*letter/i]
};

/**
 * Extract form fields from HTML using DOM traversal (Local Logic)
 * Replaces the expensive "ANALYZE_FORM" AI call.
 * @param {string|HTMLElement} source
 * @returns {Array} Array of field objects
 */
function extractFieldsFromDOM(source) {
    let root = source;
    if (typeof source === 'string') {
        const temp = document.createElement('div');
        temp.innerHTML = source;
        root = temp;
    }

    const fields = [];
    const processedGroups = new Map(); // Map<name, groupObject>

    // Select all inputs except hidden/submit/button
    const inputs = root.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');

    inputs.forEach(input => {
        const safeName = input.name ? CSS.escape(input.name) : '';
        const safeValue = CSS.escape(input.value || '');
        const tagName = input.tagName;
        const type = (input.type || 'text').toLowerCase();

        // Determine Label
        let label = '';
        if (typeof window.getFieldLabel === 'function') {
            label = window.getFieldLabel(input);
        } else {
            const safeId = input.id ? CSS.escape(input.id) : '';
            if (safeId) {
                const labelTag = root.querySelector(`label[for="${safeId}"]`);
                if (labelTag) label = labelTag.innerText;
            }
            if (!label && input.getAttribute('aria-label')) label = input.getAttribute('aria-label');
            if (!label && input.parentElement) {
                label = input.parentElement.innerText.replace(input.value, '').trim().substring(0, 50);
            }
        }
        label = (label || '').trim();

        // GROUPING LOGIC for Radios and Checkboxes
        if ((type === 'radio' || type === 'checkbox') && input.name) {
            if (processedGroups.has(input.name)) {
                // Add option to existing group
                const group = processedGroups.get(input.name);
                group.options.push({
                    label: label,
                    value: input.value,
                    selector: input.id ? `#${CSS.escape(input.id)}` : `input[name="${safeName}"][value="${safeValue}"]`
                });
                // Update group label if current is better/longer (heuristic) or if group has generic label?
                // Actually keep the first label found or try to find a common legend? 
                // Ideally we'd find the fieldset legend. For now, keep first.
                return;
            } else {
                // Create new Group
                const groupObj = {
                    type: type, // 'radio' or 'checkbox' (implies group)
                    name: input.name,
                    id: input.id || '', // First ID
                    label: label, // Initial label
                    value: '', // No default value for group
                    selector: `input[name="${safeName}"]`, // selector points to the group (name)
                    options: [{
                        label: label,
                        value: input.value,
                        selector: input.id ? `#${CSS.escape(input.id)}` : `input[name="${safeName}"][value="${safeValue}"]`
                    }]
                };
                processedGroups.set(input.name, groupObj);
                fields.push(groupObj);
                return;
            }
        }

        // Standard Single Field
        let selector = '';
        if (input.id) selector = `#${CSS.escape(input.id)}`;
        else if (input.name) selector = `[name="${safeName}"]`;
        else return; // Skip unverifiable

        fields.push({
            type: tagName === 'TEXTAREA' ? 'textarea' : (tagName === 'SELECT' ? 'select' : type),
            label: label,
            name: input.name || '',
            id: input.id || '',
            value: input.value || '',
            placeholder: input.placeholder || '',
            selector: selector,
            options: tagName === 'SELECT' ? Array.from(input.options).map(o => ({ value: o.value, label: o.text.trim() })) : []
        });
    });

    return fields;
}

/**
 * Apply heuristics to map fields locally
 * @param {Array} fields 
 * @param {Object} resumeData 
 * @returns {Object} mapped and unmapped fields
 */
function mapFieldsHeuristically(fields, resumeData) {
    const mappings = {};
    const unmapped = [];
    const personal = resumeData.personal || {};

    // Helper map for heuristic targets -> mapping logic
    const dataMap = {
        name_first: { val: personal.firstName, conf: 0.95 },
        name_last: { val: personal.lastName, conf: 0.95 },
        name_full: { val: `${personal.firstName} ${personal.lastName}`, conf: 0.95 },
        email: { val: personal.email, conf: 1 },
        phone: { val: personal.phone, conf: 0.95 },
        linkedin: { val: personal.linkedin, conf: 0.95 },
        github: { val: personal.github, conf: 0.95 },
        portfolio: { val: personal.portfolio, conf: 0.9 },
        city: { val: personal.location, conf: 0.8 },
        resume: { val: '', conf: 0, skip: true, instruction: "Please upload resume manually" }
    };

    fields.forEach(field => {
        let matched = false;

        // Combine label, name, id for checking
        const signature = `${field.label} ${field.name} ${field.id}`;

        for (const [key, patterns] of Object.entries(HEURISTIC_PATTERNS)) {
            if (patterns.some(p => p.test(signature))) {
                const mapLogic = dataMap[key];
                if (mapLogic) {
                    mappings[field.selector] = {
                        value: mapLogic.val,
                        confidence: mapLogic.conf,
                        source: 'heuristic',
                        skipped: mapLogic.skip
                    };
                    matched = true;
                    break;
                }
            }
        }

        if (!matched) {
            unmapped.push(field);
        }
    });

    return { mappings, unmapped };
}


/**
 * Map resume data to form fields via AI (for unmapped fields)
 * @param {Array} fields - Form fields from analyzeFormHTML
 * @param {Object} resumeData - Resume data from ResumeManager
 * @returns {Promise<{success: boolean, mappings?: Object, error?: string}>}
 */
/**
 * Step 3: Map resume data to remaining fields using AI
 * @param {Array} fields - List of unmapped field objects
 * @param {Object} resumeData - Parsed resume data
 * @param {string} pageContext - Scraped context (Title, JD, Company)
 */
async function mapResumeToFields(fields, resumeData, pageContext = '') {
    // 1. Check if we have fields to map
    if (!fields || fields.length === 0) return { success: true, mappings: {} };

    // 2. Prepare Detailed Facts for Prompt

    // -- Personal Info --
    const personal = resumeData.personal || {};
    const name = `${personal.firstName || ''} ${personal.lastName || ''}`.trim();
    const fullPersonalInfo = Object.entries(personal)
        .filter(([_, v]) => v && String(v).trim())
        .map(([k, v]) => `- ${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`)
        .join('\n');

    // -- Work Experience --
    const jobs = resumeData.experience || [];
    const currentJob = jobs.find(j => j.current) || jobs[0] || {};
    const currentRole = currentJob.title || 'Candidate';
    const workExperienceDetails = jobs.map(j => {
        const dates = `${j.startDate || ''} - ${j.current ? 'Present' : (j.endDate || '')}`;
        return `### ${j.title} at ${j.company} (${dates})\n${j.location ? `Location: ${j.location}\n` : ''}${j.description || ''}`;
    }).join('\n\n');

    // -- Education --
    const education = resumeData.education || [];
    const educationDetails = education.map(e => {
        const dates = `${e.startDate || ''} - ${e.endDate || ''}`;
        return `### ${e.degree} in ${e.field} from ${e.school} (${dates})\n${e.gpa ? `GPA: ${e.gpa}` : ''}`;
    }).join('\n\n');

    // -- Skills --
    const skillsData = resumeData.skills || {};
    const allSkillsDetails = Object.entries(skillsData)
        .filter(([_, v]) => Array.isArray(v) && v.length > 0)
        .map(([category, items]) => `- ${category.charAt(0).toUpperCase() + category.slice(1)}: ${items.join(', ')}`)
        .join('\n');

    // -- Projects --
    const projects = resumeData.projects || [];
    const projectDetails = projects.map(p => {
        return `### ${p.name}\n${p.description || ''}\nTechnologies: ${(p.technologies || []).join(', ')}`;
    }).join('\n\n');

    // -- Custom Fields (Preferences) --
    const customFields = resumeData.customFields || {};
    const customFieldsDetails = Object.entries(customFields)
        .filter(([_, v]) => v !== null && v !== '' && v !== undefined)
        .map(([k, v]) => `- ${k.replace(/([A-Z])/g, ' $1').trim().replace(/^\w/, c => c.toUpperCase())}: ${v}`)
        .join('\n');

    // Calculate Experience (Simplified or use LocalMatcher if available)
    let totalYears = 0;
    if (window.LocalMatcher && window.LocalMatcher.calculateTotalExperience) {
        totalYears = window.LocalMatcher.calculateTotalExperience(jobs);
    } else {
        totalYears = jobs.length * 1.5; // Rough estimate
    }

    // 3. Construct Prompt
    const prompt = PROMPTS.MAP_DATA
        .replace('{{name}}', name)
        .replace('{{current_role}}', currentRole)
        .replace('{{total_years_experience}}', totalYears)

        .replace('{{full_personal_info}}', fullPersonalInfo || 'N/A')
        .replace('{{work_experience_details}}', workExperienceDetails || 'N/A')
        .replace('{{education_details}}', educationDetails || 'N/A')
        .replace('{{all_skills_details}}', allSkillsDetails || 'N/A')
        .replace('{{project_details}}', projectDetails || 'N/A')
        .replace('{{custom_fields_details}}', customFieldsDetails || 'N/A')

        .replace('{{job_context}}', pageContext || 'No specific job description found.')
        .replace('{{text_fields_array}}', JSON.stringify(fields, null, 2));

    const result = await window.AIClient.callAI(prompt, '', {
        maxTokens: 4000, // Reduced token count for efficiency
        temperature: 0.3,
        jsonMode: true

    });

    if (!result || !result.success) {
        return { success: false, error: result?.error || 'AI call returned no response' };
    }

    const parseResult = window.AIClient.parseAIJson(result.text);

    if (!parseResult || typeof parseResult !== 'object') {
        return { success: false, error: 'Failed to parse mapping result' };
    }

    // The backend prompt returns an object with "mappings", "confidence_summary" etc.
    const mappings = parseResult.mappings || parseResult; // Fallback if AI returns just mappings

    return { success: true, mappings };
}

/**
 * NEW: Build condensed context for subsequent batches (token-efficient)
 * @param {Object} context - Context object from BatchProcessor
 * @param {Object} resumeData - Full resume data (for first batch)
 * @param {string} pageContext - Job context
 * @returns {Object} Prepared prompt replacements
 */
function buildCondensedContext(context, resumeData, pageContext = '') {
    if (context.type === 'full') {
        // First batch - use full context (same as mapResumeToFields)
        const personal = resumeData.personal || {};
        const name = `${personal.firstName || ''} ${personal.lastName || ''}`.trim();
        const fullPersonalInfo = Object.entries(personal)
            .filter(([_, v]) => v && String(v).trim())
            .map(([k, v]) => `- ${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`)
            .join('\n');

        const jobs = resumeData.experience || [];
        const currentJob = jobs.find(j => j.current) || jobs[0] || {};
        const currentRole = currentJob.title || 'Candidate';
        const workExperienceDetails = jobs.map(j => {
            const dates = `${j.startDate || ''} - ${j.current ? 'Present' : (j.endDate || '')}`;
            return `### ${j.title} at ${j.company} (${dates})\n${j.location ? `Location: ${j.location}\n` : ''}${j.description || ''}`;
        }).join('\n\n');

        const education = resumeData.education || [];
        const educationDetails = education.map(e => {
            const dates = `${e.startDate || ''} - ${e.endDate || ''}`;
            return `### ${e.degree} in ${e.field} from ${e.school} (${dates})\n${e.gpa ? `GPA: ${e.gpa}` : ''}`;
        }).join('\n\n');

        const skillsData = resumeData.skills || {};
        const allSkillsDetails = Object.entries(skillsData)
            .filter(([_, v]) => Array.isArray(v) && v.length > 0)
            .map(([category, items]) => `- ${category.charAt(0).toUpperCase() + category.slice(1)}: ${items.join(', ')}`)
            .join('\n');

        const projects = resumeData.projects || [];
        const projectDetails = projects.map(p => {
            return `### ${p.name}\n${p.description || ''}\nTechnologies: ${(p.technologies || []).join(', ')}`;
        }).join('\n\n');

        const customFields = resumeData.customFields || {};
        const customFieldsDetails = Object.entries(customFields)
            .filter(([_, v]) => v !== null && v !== '' && v !== undefined)
            .map(([k, v]) => `- ${k.replace(/([A-Z])/g, ' $1').trim().replace(/^\w/, c => c.toUpperCase())}: ${v}`)
            .join('\n');

        let totalYears = 0;
        if (window.LocalMatcher?.calculateTotalExperience) {
            totalYears = window.LocalMatcher.calculateTotalExperience(jobs);
        } else {
            totalYears = jobs.length * 1.5;
        }

        return {
            name,
            current_role: currentRole,
            total_years_experience: totalYears,
            full_personal_info: fullPersonalInfo || 'N/A',
            work_experience_details: workExperienceDetails || 'N/A',
            education_details: educationDetails || 'N/A',
            all_skills_details: allSkillsDetails || 'N/A',
            project_details: projectDetails || 'N/A',
            custom_fields_details: customFieldsDetails || 'N/A',
            job_context: pageContext || 'No specific job description found.'
        };
    } else {
        // Condensed context for subsequent batches
        const profile = context.profile || {};
        const previousQA = context.previousQA || [];

        const previousQAText = previousQA.length > 0
            ? previousQA.map((qa, idx) => `Q${idx + 1}: ${qa.question}\nA${idx + 1}: ${qa.answer}`).join('\n\n')
            : 'No previous questions yet.';

        return {
            name: profile.name || 'Candidate',
            current_role: profile.currentRole || 'Professional',
            years_exp: profile.yearsExp || 0,
            top_skills: Array.isArray(profile.topSkills) ? profile.topSkills.join(', ') : 'N/A',
            education: profile.latestEducation || 'N/A',
            email: profile.email || '',
            phone: profile.phone || '',
            location: profile.location || '',
            previous_qa: previousQAText,
            job_context: pageContext || 'No specific job description found.'
        };
    }
}

/**
 * NEW: Map a small batch of fields (1-5) using AI with smart context
 * @param {Array} fields - Batch of 1-5 field objects
 * @param {Object} context - Context object from BatchProcessor (type: 'full' or 'condensed')
 * @param {string} pageContext - Job context
 * @returns {Promise<{success: boolean, mappings?: Object, error?: string}>}
 */
async function mapFieldsBatch(fields, context, pageContext = '') {
    // Validate inputs
    if (!fields || !Array.isArray(fields) || fields.length === 0) {
        return { success: true, mappings: {} };
    }

    if (!context || typeof context !== 'object') {
        console.error('[FormAnalyzer] mapFieldsBatch: Invalid context');
        return { success: false, error: 'Invalid context object' };
    }

    // Ensure we don't exceed batch size
    if (fields.length > 5) {
        console.warn('[FormAnalyzer] mapFieldsBatch called with more than 5 fields, truncating...');
        fields = fields.slice(0, 5);
    }

    // Filter out invalid fields
    const validFields = fields.filter(f => f && f.selector);
    if (validFields.length === 0) {
        console.warn('[FormAnalyzer] mapFieldsBatch: No valid fields after filtering');
        return { success: true, mappings: {} };
    }

    console.log(`[FormAnalyzer] Processing batch of ${validFields.length} fields with ${context.type || 'unknown'} context`);

    try {
        // Choose prompt template based on context type
        const promptTemplate = context.type === 'full'
            ? PROMPTS.MAP_DATA_BATCH
            : PROMPTS.MAP_DATA_BATCH_CONDENSED;

        if (!promptTemplate) {
            console.error('[FormAnalyzer] Missing prompt template for type:', context.type);
            return { success: false, error: 'Missing prompt template' };
        }

        // Build context replacements
        const contextData = buildCondensedContext(context, context.resumeData || {}, pageContext);

        // Prepare fields for prompt - sanitize field data
        const sanitizedFields = validFields.map(f => ({
            selector: f.selector,
            label: f.label || '',
            type: f.type || 'text',
            name: f.name || '',
            options: f.options || []
        }));
        const fieldsArray = JSON.stringify(sanitizedFields, null, 2);

        // Replace template variables
        let prompt = promptTemplate;
        Object.entries(contextData).forEach(([key, value]) => {
            const safeValue = typeof value === 'string' ? value : JSON.stringify(value);
            prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), safeValue);
        });
        prompt = prompt.replace('{{fields_array}}', fieldsArray);

        // Verify AIClient is available
        if (!window.AIClient?.callAI) {
            console.error('[FormAnalyzer] AIClient not available');
            return { success: false, error: 'AI client not initialized' };
        }

        // Call AI with appropriate token limits
        const result = await window.AIClient.callAI(prompt, '', {
            maxTokens: context.type === 'full' ? 3000 : 1500,
            temperature: 0.3,
            jsonMode: true
        });

        if (!result) {
            return { success: false, error: 'AI returned null response' };
        }

        if (!result.success) {
            return { success: false, error: result.error || 'AI call failed' };
        }

        if (!result.text) {
            return { success: false, error: 'AI returned empty text' };
        }

        // Parse JSON response with fallback
        let parseResult;
        try {
            parseResult = window.AIClient.parseAIJson(result.text);
        } catch (e) {
            console.warn('[FormAnalyzer] parseAIJson failed, trying manual parse');
            try {
                // Try to extract JSON from response
                const jsonMatch = result.text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    parseResult = JSON.parse(jsonMatch[0]);
                }
            } catch (e2) {
                return { success: false, error: 'Failed to parse AI response as JSON' };
            }
        }

        if (!parseResult || typeof parseResult !== 'object') {
            return { success: false, error: 'Invalid mapping result format' };
        }

        // Extract mappings - handle different response formats including abbreviated keys
        // Abbreviated: { m: { selector: { v, c, t } } }
        // Full: { mappings: { selector: { value, confidence, field_type } } }
        let mappings = parseResult.m || parseResult.mappings || parseResult.fields || parseResult;

        // Validate mappings structure
        if (typeof mappings !== 'object') {
            return { success: false, error: 'Mappings is not an object' };
        }

        // Ensure each mapping has required fields - handle both abbreviated and full keys
        const validatedMappings = {};
        for (const [selector, data] of Object.entries(mappings)) {
            if (data && typeof data === 'object') {
                validatedMappings[selector] = {
                    // v = value (abbreviated), value (full), answer (fallback)
                    value: data.v ?? data.value ?? data.answer ?? null,
                    // c = confidence (abbreviated), confidence (full)
                    confidence: typeof (data.c ?? data.confidence) === 'number'
                        ? (data.c ?? data.confidence)
                        : 0.8,
                    source: 'ai-batch',
                    // t = type (abbreviated), field_type/type (full)
                    field_type: data.t || data.field_type || data.type || 'text',
                    label: data.label || data.l || ''
                };
            }
        }

        console.log(`[FormAnalyzer] Batch mapped ${Object.keys(validatedMappings).length} fields successfully`);
        return { success: true, mappings: validatedMappings };

    } catch (error) {
        console.error('[FormAnalyzer] mapFieldsBatch error:', error);
        return { success: false, error: error.message || 'Unknown error in batch processing' };
    }
}


/**
 * Generate a smart answer for an open-ended question
 * @param {string} question - The question to answer
 * @param {string} context - Additional context (job description, etc.)
 * @returns {Promise<{success: boolean, answer?: string, error?: string}>}
 */
async function generateSmartAnswer(question, context = '') {
    const resumeText = await window.ResumeManager.getResumeAsText();

    const prompt = PROMPTS.GENERATE_ANSWER
        .replace('{{QUESTION}}', question)
        .replace('{{CONTEXT}}', context || 'No additional context provided.')
        .replace('{{RESUME}}', resumeText);

    const result = await window.AIClient.callAI(prompt, '', {
        maxTokens: 1024,
        temperature: 0.7
    });

    if (!result.success) {
        return { success: false, error: result.error };
    }

    return { success: true, answer: result.text.trim() };
}

/**
 * Get the chat system prompt with resume context
 * @returns {Promise<string>}
 */
async function getChatSystemPrompt() {
    const resumeText = await window.ResumeManager.getResumeAsText();
    return PROMPTS.CHAT_SYSTEM.replace('{{RESUME}}', resumeText || 'No resume data available.');
}

/**
 * Clean HTML for better AI analysis using Smart DOM Densification
 * Creates a semantic skeleton of the form, removing >90% of noise.
 * @param {string|HTMLElement} source - HTML string or Element
 * @returns {string} Densified HTML string
 */
function cleanHTMLForAnalysis(source) {
    // 1. Convert string to DOM if needed
    let root = source;
    if (typeof source === 'string') {
        const temp = document.createElement('div');
        temp.innerHTML = source;
        root = temp;
    }

    // 2. Attributes we want to KEEP (denylist everything else)
    const ATTR_ALLOWLIST = new Set([
        'id', 'name', 'type', 'value', 'placeholder', 'for',
        'aria-label', 'aria-describedby', 'role', 'title', 'required', 'checked'
    ]);

    // 3. Tags we want to KEEP as structural blocks
    const TAG_ALLOWLIST = new Set([
        'FORM', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'LABEL', 'FIELDSET', 'LEGEND',
        'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'LI', 'OPTION', 'OPTGROUP'
    ]);

    // 4. Helper to check if a node is "noise" (script, style, etc.)
    const isNoise = (node) => {
        const tag = node.tagName;
        return ['SCRIPT', 'STYLE', 'SVG', 'PATH', 'NOSCRIPT', 'IFRAME', 'LINK', 'META'].includes(tag);
    };

    // 5. Build the text output

    // Recursive Approach (Cleanest for hierarchical output)
    function serializeNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.replace(/\s+/g, ' ').trim();
            return text ? `${text} ` : '';
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return '';

        const tag = node.tagName;
        if (isNoise(node)) return '';

        // Is this a hidden input?
        if (tag === 'INPUT' && node.type === 'hidden') return '';

        let innerHTML = '';
        node.childNodes.forEach(child => {
            innerHTML += serializeNode(child);
        });

        if (TAG_ALLOWLIST.has(tag)) {
            let attrStr = '';
            if (node.hasAttributes()) {
                for (const attr of node.attributes) {
                    if (ATTR_ALLOWLIST.has(attr.name)) {
                        attrStr += ` ${attr.name}="${attr.value}"`;
                    }
                }
            }
            // Don't close void elements
            if (['INPUT', 'BR', 'HR'].includes(tag)) {
                return `<${tag.toLowerCase()}${attrStr}>\n`;
            }
            return `<${tag.toLowerCase()}${attrStr}> ${innerHTML}</${tag.toLowerCase()}>\n`;
        } else {
            // Flatten: just return children, maybe with spacing
            const isBlock = ['DIV', 'SECTION', 'TR', 'LI'].includes(tag);
            return (isBlock ? '\n' : '') + innerHTML + (isBlock ? '\n' : '');
        }
    }

    return serializeNode(root).trim();
}

/**
 * Complete form analysis and mapping workflow
 * Combines extractFieldsFromDOM and mapFieldsHeuristically (Local First)
 */
async function analyzeAndMapForm(html) {
    // Phase 1: Local Heuristic Analysis (Fast, Cheap)
    console.log('🚀 Phase 1: Local Heuristic Analysis...');

    // In hybrid mode, we need DOM access. If html is string, extractFieldsFromDOM handles it.
    // Ideally, for better context, we should pass the document structure if possible, 
    // but here we likely only have the outerHTML string passed from content.js.
    const fields = extractFieldsFromDOM(html);

    if (!fields || fields.length === 0) {
        return { success: false, error: 'No form fields detected locally.' };
    }

    // Get Resume Data
    const resumeData = await window.ResumeManager.getResumeData();
    if (!resumeData) {
        return { success: false, error: 'No resume data found.' };
    }

    // Apply Heuristics
    const { mappings, unmapped } = mapFieldsHeuristically(fields, resumeData);
    console.log(`✅ Heuristics Mapped: ${Object.keys(mappings).length}, Unmapped: ${unmapped.length}`);

    // Phase 2: AI Analysis for Unmapped Fields (Slow, Smart)
    if (unmapped.length > 0) {
        console.log('🧠 Phase 2: Delegating complex fields to AI...');

        // We only send the unmapped fields to AI to save tokens
        // BUT AI needs context. We can send the Densified HTML 
        // OR we can send just the list of unmapped fields with their context (label/surrounding text).
        // Sending just the field list is much cheaper but might lose "page structure" clues.
        // Let's rely on the field objects we already extracted which contain 'label'.

        const aiResult = await mapResumeToFields(unmapped, resumeData);
        if (aiResult.success && aiResult.mappings) {
            // Merge AI mappings
            Object.assign(mappings, aiResult.mappings);
        } else {
            console.error('AI Mapping failed:', aiResult.error);
        }
    }

    return {
        success: true,
        fields: fields,
        mappings: mappings
    };
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.FormAnalyzer = {
        mapResumeToFields,
        mapFieldsBatch,           // NEW: Batched processing
        buildCondensedContext,    // NEW: Context builder
        generateSmartAnswer,
        getChatSystemPrompt,
        analyzeAndMapForm,
        cleanHTMLForAnalysis,
        extractFieldsFromDOM,
        mapFieldsHeuristically,
        PROMPTS
    };
}

if (typeof self !== 'undefined' && typeof self.FormAnalyzer === 'undefined') {
    self.FormAnalyzer = {
        mapResumeToFields,
        mapFieldsBatch,
        buildCondensedContext,
        generateSmartAnswer,
        getChatSystemPrompt,
        analyzeAndMapForm,
        cleanHTMLForAnalysis,
        extractFieldsFromDOM,
        mapFieldsHeuristically,
        PROMPTS
    };
}
