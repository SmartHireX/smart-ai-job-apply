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

    ANALYZE_FORM: `You are an expert in web scraping and form analysis.
Analyze the following HTML snippet and extract all interactive form fields (inputs, selects, textareas).

HTML:
{{HTML}}

For each field, identify:
1. **type**: The HTML input type (text, email, tel, number, select, radio, checkbox, etc.)
2. **purpose**: The semantic purpose of the field (e.g., first_name, last_name, email, phone, city, github_url, linkedin_url, resume_upload, etc.)
3. **label**: The visible label or placeholder text associated with the field
4. **required**: Whether the field is marked as required
5. **selector**: A unique CSS selector to target this field
6. **options**: For select fields, a list of available option values

Respond ONLY with valid JSON in this format:
[
  {
    "type": "text",
    "purpose": "first_name",
    "label": "First Name",
    "required": true,
    "selector": "input#first-name",
    "options": []
  },
  ...
]
`,

    MAP_DATA: `You are an intelligent form-filling assistant that maps user profile and resume data to job application form fields.

USER PROFILE DATA:
{{USER_DATA}}

USER RESUME DATA (Primary Resume):
{{RESUME_DATA}}

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

CONFIDENCE SCORING RULES:
- **1.0 (Perfect Match)**: Exact match found in user profile (e.g., email → user.email)
- **0.95 (Profile Match)**: Direct profile field with high certainty (e.g., name, phone)
- **0.90 (Resume Match)**: Data directly from resume with minor formatting (e.g., education, experience)
- **0.80 (Inferred from Resume)**: Derived from resume context (e.g., years of experience calculated from work history)
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
4. **AI Generation for Open-Ended Questions**:
   - "Why do you want to work here?" → Use resume summary + relevant skills
   - "Tell us about yourself" → Professional summary from resume
   - "Cover letter" → Generate using resume highlights
   - "Why are you a good fit?" → Match resume skills to common job requirements
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

Response:
`
};

/**
 * Analyze form HTML and extract field information
 * @param {string} html - HTML content of the form
 * @returns {Promise<{success: boolean, fields?: Array, error?: string}>}
 */
async function analyzeFormHTML(html) {
    // First, do basic HTML parsing to help the AI
    const cleanedHtml = cleanHTMLForAnalysis(html);

    const prompt = PROMPTS.ANALYZE_FORM.replace('{{HTML}}', cleanedHtml);

    const result = await window.AIClient.callAI(prompt, '', {
        maxTokens: 4096,
        temperature: 0.1,
        jsonMode: true
    });

    if (!result.success) {
        return { success: false, error: result.error };
    }

    const fields = window.AIClient.parseAIJson(result.text);

    if (!fields || !Array.isArray(fields)) {
        return { success: false, error: 'Failed to parse form analysis result' };
    }

    return { success: true, fields };
}

/**
 * Map resume data to form fields
 * @param {Array} fields - Form fields from analyzeFormHTML
 * @param {Object} resumeData - Resume data from ResumeManager
 * @returns {Promise<{success: boolean, mappings?: Object, error?: string}>}
 */
async function mapResumeToFields(fields, resumeData) {
    // Get flattened resume for easier mapping context
    const flatResume = await window.ResumeManager.getFlattenedResumeData();
    const resumeText = await window.ResumeManager.getResumeAsText();

    // Prepare separate User Data and Resume Data for the prompt
    // In standalone mode, we mostly have resume data.
    // We can infer "User Data" (Profile) from resume personal info
    const userData = {
        name: resumeData.personal?.firstName + ' ' + resumeData.personal?.lastName,
        email: resumeData.personal?.email,
        phone: resumeData.personal?.phone,
        location: resumeData.personal?.location,
        linkedin: resumeData.personal?.linkedin,
        github: resumeData.personal?.github,
        portfolio: resumeData.personal?.portfolio,
        custom: resumeData.customFields
    };

    const prompt = PROMPTS.MAP_DATA
        .replace('{{USER_DATA}}', JSON.stringify(userData, null, 2))
        .replace('{{RESUME_DATA}}', JSON.stringify({
            experience: resumeData.experience,
            education: resumeData.education,
            skills: resumeData.skills,
            projects: resumeData.projects,
            summary: resumeData.summary
        }, null, 2))
        .replace('{{FORM_FIELDS}}', JSON.stringify(fields, null, 2));

    const result = await window.AIClient.callAI(prompt, '', {
        maxTokens: 4096,
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
 * Clean HTML for better AI analysis
 * Removes scripts, styles, and unnecessary attributes
 * @param {string} html 
 * @returns {string}
 */
function cleanHTMLForAnalysis(html) {
    // Create a temporary div to parse HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // Remove scripts and styles
    temp.querySelectorAll('script, style, link, meta').forEach(el => el.remove());

    // Remove hidden elements
    temp.querySelectorAll('[type="hidden"], [style*="display: none"], [style*="display:none"]')
        .forEach(el => el.remove());

    // Keep only form-relevant elements
    const formElements = temp.querySelectorAll('input, select, textarea, label, form, fieldset, legend, button, datalist, option');

    if (formElements.length === 0) {
        // If no form elements found via querySelector, return cleaned HTML
        return temp.innerHTML.substring(0, 15000); // Limit size
    }

    // Build a minimal HTML with just form elements and their context
    let result = '';
    formElements.forEach(el => {
        // Get parent context for labels
        const parent = el.parentElement;
        if (parent && parent.tagName !== 'DIV') {
            result += parent.outerHTML + '\n';
        } else {
            result += el.outerHTML + '\n';
        }
    });

    return result.substring(0, 15000); // Limit size for API
}

/**
 * Complete form analysis and mapping workflow
 * Combines analyzeFormHTML and mapResumeToFields
 * @param {string} html - Form HTML
 * @returns {Promise<{success: boolean, fields?: Array, mappings?: Object, error?: string}>}
 */
async function analyzeAndMapForm(html) {
    // Step 1: Analyze form
    const analysisResult = await analyzeFormHTML(html);

    if (!analysisResult.success) {
        return { success: false, error: `Form analysis failed: ${analysisResult.error}` };
    }

    const fields = analysisResult.fields;

    if (!fields || fields.length === 0) {
        return { success: false, error: 'No form fields detected' };
    }

    // Step 2: Get resume data
    const resumeData = await window.ResumeManager.getResumeData();

    if (!resumeData) {
        return {
            success: false,
            error: 'No resume data found. Please set up your resume in settings.'
        };
    }

    // Step 3: Map data to fields
    const mappingResult = await mapResumeToFields(fields, resumeData);

    if (!mappingResult.success) {
        return { success: false, error: `Data mapping failed: ${mappingResult.error}` };
    }

    return {
        success: true,
        fields: fields,
        mappings: mappingResult.mappings
    };
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.FormAnalyzer = {
        analyzeFormHTML,
        mapResumeToFields,
        generateSmartAnswer,
        getChatSystemPrompt,
        analyzeAndMapForm,
        cleanHTMLForAnalysis,
        PROMPTS
    };
}

if (typeof self !== 'undefined' && typeof self.FormAnalyzer === 'undefined') {
    self.FormAnalyzer = {
        analyzeFormHTML,
        mapResumeToFields,
        generateSmartAnswer,
        getChatSystemPrompt,
        analyzeAndMapForm,
        cleanHTMLForAnalysis,
        PROMPTS
    };
}
