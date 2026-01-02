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
    MAP_DATA: `You are an intelligent form-filling assistant that maps user profile and resume data to job application form fields.

USER PROFILE DATA:
{{USER_DATA}}

USER RESUME DATA (Primary Resume):
{{RESUME_DATA}}

JOB CONTEXT (Page Title, Job Description, Company):
{{JOB_CONTEXT}}

FORM FIELDS TO FILL:
{{FORM_FIELDS}}

YOUR TASK:
For each form field, determine the best value from the user's profile and resume data. Prioritize accuracy and relevance.

USE FIELD CONTEXT FOR BETTER UNDERSTANDING:
- Each field may include **context** with surrounding text (questions, hints, help text)
- Example: Field label is "Salary" but context.question is "What is your expected salary range in USD?"
- Use context to understand what the field is really asking for
- Context helps disambiguate similar field names (e.g., "start date" could be availability or last job)
- If context.hint exists, use it for formatting (e.g., "Format: MM/DD/YYYY", "Enter as integer")

USE JOB CONTEXT FOR TAILORED ANSWERS:
- If a question asks "Why do you want to work here?" use the **Company Name** and **Job Title** from the Job Context.
- If a question asks "Why are you a good fit?" highlight skills from the Resume that match the **Job Description** in the Job Context.
- Mention specific keywords found in the Job Context to increase ATS compatibility.

CONFIDENCE SCORING RULES:
- **1.0 (Perfect Match)**: Exact match found in user profile (e.g., email → user.email)
- **0.95 (Profile Match)**: Direct profile field with high certainty (e.g., name, phone)
- **0.90 (Resume Match)**: Data directly from resume with minor formatting (e.g., education, experience)
- **0.80 (Inferred from Resume)**: Derived from resume context (e.g., years of experience calculated from work history)
- **0.75 (Context Tailored)**: Answer specifically tailored to the Job Description (High Value).
- **0.70 (AI Generated - High Context)**: Generated answer using rich resume context (e.g., "Why this company?" using resume summary + skills)
- **0.60 (AI Generated - Medium Context)**: Generated with some context (e.g., cover letter intro)
- **0.50 (AI Generated - Low Context)**: Generic AI generation with minimal context
- **0.30 (Uncertain)**: Very uncertain mapping or missing data

MAPPING INSTRUCTIONS:
1. **Profile Fields First**: Always prioritize exact profile data (name, email, phone, location, urls)
2. **Resume Context**: Use resume data for professional content:
   - Work experience summaries
   - Skills and technologies
   - Education details
   - Projects and achievements
   - Professional summary/bio
3. **Intelligent Derivation**:
   - Extract first/last name from full name
   - Calculate years of experience from work history
   - Derive current company from most recent job
   - Extract degree/university from education
4. **AI Generation for Open-Ended Questions (TAILORED)**:
   - "Why do you want to work here?" → Connect resume goals to **Job Context** (Company Mission/Product).
   - "Tell us about yourself" → Professional summary + relevance to **Job Context**.
   - "Cover letter" → Generate using resume highlights matching **Job Context** requirements.
   - "Why are you a good fit?" → Match resume skills to **Job Context** requirements.
5. **File Upload Detection**:
   - Mark file upload fields with skip=true and instructions
   - Common file field purposes: resume_upload, cover_letter_upload, portfolio_upload

RESPONSE FORMAT:
\`\`\`json
{
  "mappings": {
    "input#first-name": {
      "value": "John",
      "confidence": 1.0,
      "source": "user_profile.name",
      "field_type": "text"
    },
    "input#email": {
      "value": "john@example.com",
      "confidence": 1.0,
      "source": "user_profile.email",
      "field_type": "email"
    },
    "textarea#why-company": {
      "value": "I am passionate about...",
      "confidence": 0.70,
      "source": "ai_generated",
      "field_type": "textarea"
    },
    "input#resume": {
      "value": "",
      "confidence": 0.0,
      "source": "manual_upload",
      "field_type": "file",
      "skip": true,
      "instruction": "Upload your resume manually"
    }
  },
  "missing_fields": ["cover_letter", "references"],
  "confidence_summary": {
    "high_confidence": 8,
    "medium_confidence": 2,
    "low_confidence": 1,
    "requires_manual": 2
  }
}
\`\`\`

CRITICAL RULES:
1. Every mapping MUST include: value, confidence (0-1), source, field_type
2. File upload fields MUST have skip=true and instruction
3. Use EXACT CSS selectors from form_fields as keys
4. Don't fabricate data - use only what's in profile/resume
5. **MANDAOTRY: YOU MUST RETURN A MAPPING FOR EVERY SINGLE FIELD IN \`form_fields\`**
6. If data is missing or low confidence, return \`value: ""\` and \`confidence: 0.1\` and \`source: "missing_data"\`
7. DO NOT OMIT ANY FIELDS. The frontend needs to know about every field to show the "Red" border.
8. Calculate confidence_summary accurately

Respond with ONLY valid JSON - no explanations or additional text.
`, // Optimization: We will construct a minimal prompt for just the "hard" fields dynamically.

    HARD_FIELDS_MAP: `You are an expert form filler.
    
USER PROFILE:
{{USER_DATA}}

RESUME SUMMARY:
{{RESUME_SUMMARY}}

COMPLEX FORM FIELDS TO FILL:
{{FORM_FIELDS}}

INSTRUCTIONS:
For each field, provide the best answer from the user's data.
- If it's a "Why us?" question, generate a short, professional answer.
- If it's a cover letter, keep it brief and relevant.
- Return JSON mappings with value and confidence.

FORMAT:
{
  "mappings": {
    "selector_1": { "value": "Answer...", "confidence": 0.8 }
  }
}
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

    CHAT_SYSTEM: `You are SmartHireX, an AI career assistant residing in a browser extension.

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
        if (input.id) selector = `#${CSS.escape(input.id)}`;
        else if (input.name) selector = `[name="${CSS.escape(input.name)}"]`;
        else {
            // Fallback: This is tricky for detached DOM. 
            // Ideally we rely on IDs/Names. 
            return; // Skip unverifiable fields
        }

        // Determine Label / Context
        let label = '';
        // 1. Label tag
        if (input.id) {
            const labelTag = root.querySelector(`label[for="${CSS.escape(input.id)}"]`);
            if (labelTag) label = labelTag.innerText;
        }
        // 2. Aria Label
        if (!label && input.getAttribute('aria-label')) label = input.getAttribute('aria-label');
        if (!label && input.getAttribute('placeholder')) label = input.getAttribute('placeholder');

        // 3. Parent Text (naive)
        if (!label && input.parentElement) {
            // Get text of parent matching heuristics often helps
            label = input.parentElement.innerText.replace(input.value, '').trim().substring(0, 50);
        }

        fields.push({
            type: input.tagName === 'TEXTAREA' ? 'textarea' : (input.tagName === 'SELECT' ? 'select' : input.type),
            label: label.trim(),
            name: input.name || '',
            id: input.id || '',
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

    // 2. Prepare user data (Manual construction from resume)
    const userData = {
        name: (resumeData.personal?.firstName || '') + ' ' + (resumeData.personal?.lastName || ''),
        email: resumeData.personal?.email,
        phone: resumeData.personal?.phone,
        location: resumeData.personal?.location,
        linkedin: resumeData.personal?.linkedin,
        github: resumeData.personal?.github,
        portfolio: resumeData.personal?.portfolio,
        custom: resumeData.customFields || {}
    };

    // 3. Construct Prompt
    const prompt = PROMPTS.MAP_DATA
        .replace('{{USER_DATA}}', JSON.stringify(userData, null, 2))
        .replace('{{RESUME_DATA}}', JSON.stringify({
            experience: resumeData.experience,
            education: resumeData.education,
            skills: resumeData.skills,
            projects: resumeData.projects,
            summary: resumeData.summary
        }, null, 2))
        .replace('{{JOB_CONTEXT}}', pageContext || 'No specific job context available. Infer from field labels.')
        .replace('{{FORM_FIELDS}}', JSON.stringify(fields, null, 2));

    const result = await window.AIClient.callAI(prompt, '', {
        maxTokens: 16000,
        temperature: 0.2,
        jsonMode: true
    });

    if (!result.success) {
        return { success: false, error: result.error };
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
