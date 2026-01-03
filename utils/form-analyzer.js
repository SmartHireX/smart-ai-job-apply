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
- DO NOT handle radio buttons, checkboxes, dropdowns, dates, numbers, or yes/no fields.
- Those fields are already processed by a local semantic engine.
- You will ONLY receive text fields that could not be resolved locally.

────────────────────────────
USER CONTEXT (COMPRESSED FACTS)
────────────────────────────
Name: {{name}}
Current Role: {{current_role}}
Total Experience: {{total_years_experience}} years
Primary Skills: {{top_skills}}
Education: {{highest_degree}} at {{college_name}}

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

────────────────────────────
RESPONSE FORMAT (JSON ONLY)
────────────────────────────
{
  "mappings": {
    "<css_selector>": {
      "value": "<generated_text>",
      "confidence": <0.6 - 0.8>,
      "source": "ai_generated",
      "field_type": "textarea"
    }
  }
}

⚠️ RULES:
- Return mappings ONLY for provided selectors
- No extra text, no explanations
- Valid JSON only
`, // Optimization: We will construct a minimal prompt for just the "hard" fields dynamically.



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
    // Select all inputs except hidden/submit/button
    const inputs = root.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');

    inputs.forEach(input => {
        // Generate a unique selector
        let selector = '';
        const safeName = input.name ? CSS.escape(input.name) : '';
        const safeId = input.id ? CSS.escape(input.id) : '';
        const safeValue = CSS.escape(input.value || '');

        if (input.id) selector = `#${safeId}`;
        else if (input.name) {
            if ((input.type === 'radio' || input.type === 'checkbox') && input.value) {
                // For radio/checkbox groups, we need a unique selector for each option
                selector = `input[name="${safeName}"][value="${safeValue}"]`;
            } else {
                selector = `[name="${safeName}"]`;
            }
        }
        else {
            // Fallback: This is tricky for detached DOM. 
            // Ideally we rely on IDs/Names. 
            return; // Skip unverifiable fields
        }

        // Determine Label / Context
        let label = '';
        // Use robust global scraper if available
        if (typeof window.getFieldLabel === 'function') {
            label = window.getFieldLabel(input);
        } else {
            // Fallback to basic logic if form-detection.js isn't loaded
            const safeId = input.id ? CSS.escape(input.id) : '';
            if (safeId) {
                const labelTag = root.querySelector(`label[for="${safeId}"]`);
                if (labelTag) label = labelTag.innerText;
            }
            if (!label && input.getAttribute('aria-label')) label = input.getAttribute('aria-label');
            if (!label && input.getAttribute('placeholder')) label = input.getAttribute('placeholder');
            if (!label && input.parentElement) {
                label = input.parentElement.innerText.replace(input.value, '').trim().substring(0, 50);
            }
        }

        fields.push({
            type: input.tagName === 'TEXTAREA' ? 'textarea' : (input.tagName === 'SELECT' ? 'select' : input.type),
            label: (label || '').trim(),
            name: input.name || '',
            id: input.id || '',
            value: input.value || '', // Capture current/default value (Crucial for Radios)
            selector: selector,
            options: input.tagName === 'SELECT' ? Array.from(input.options).map(o => o.value) : []
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

    // 2. Prepare Compressed Facts (Local Helpers)
    const personal = resumeData.personal || {};
    const name = `${personal.firstName || ''} ${personal.lastName || ''}`.trim();

    const jobs = resumeData.experience || [];
    const currentJob = jobs.find(j => j.current) || jobs[0] || {};
    const currentRole = currentJob.title || 'Candidate';

    // Calculate Experience (Simplified or use LocalMatcher if available)
    let totalYears = 0;
    if (window.LocalMatcher && window.LocalMatcher.calculateTotalExperience) {
        totalYears = window.LocalMatcher.calculateTotalExperience(jobs);
    } else {
        // Fallback simple calc
        totalYears = jobs.length * 1.5; // Rough estimate
    }

    const skills = (resumeData.skills?.technical || []).slice(0, 15).join(', ');

    const edu = (resumeData.education || [])[0] || {};
    const degree = edu.degree || 'Degree';
    const college = edu.school || 'University';

    const achievements = []; // Achievements removed per user request

    // 3. Construct Prompt
    const prompt = PROMPTS.MAP_DATA
        .replace('{{name}}', name)
        .replace('{{current_role}}', currentRole)
        .replace('{{total_years_experience}}', totalYears)
        .replace('{{top_skills}}', skills)
        .replace('{{highest_degree}}', degree)
        .replace('{{college_name}}', college)

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
        generateSmartAnswer,
        getChatSystemPrompt,
        analyzeAndMapForm,
        cleanHTMLForAnalysis,
        extractFieldsFromDOM,
        mapFieldsHeuristically,
        PROMPTS
    };
}
