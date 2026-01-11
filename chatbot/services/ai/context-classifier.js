/**
 * Context Classifier for Smart AI Job Apply Extension
 * 
 * Uses Gemini AI to analyze page content and classify page type.
 * Determines if the page is a job posting, application form, etc.
 */

/**
 * Classify page content using AI
 * @param {Object} pageData - Page data including url, title, and content
 * @returns {Promise<Object>} Classification result with type, greeting, and actions
 */
async function classifyPageContext(pageData) {
    const { url, title, content, selectedText } = pageData;

    // Build classification prompt
    const prompt = buildClassificationPrompt(url, title, content, selectedText);

    const systemInstruction = `You are an intelligent page classifier for a job application assistant.
Analyze the provided page content and determine the page type.

IMPORTANT INSTRUCTIONS FOR JOB POSTINGS:
- If this is a job posting, extract the exact job title and company name
- Create a SHORT, enthusiastic greeting mentioning the position and company (max 15 words)
- DO NOT mention actions in the greeting - those will be separate action buttons
- Suggest 3 COMPACT action labels: "Tailor Resume", "Job Fit", "Job Details", "Fill Form"
- If there's an application form on the page, include "Fill Form" as the first action

Respond ONLY with valid JSON in this exact format:
{
  "pageType": "job_posting" | "application_form" | "company_page" | "generic",
  "greeting": "Short personalized greeting WITHOUT mentioning actions (max 15 words)",
  "actions": ["Action 1", "Action 2", "Action 3"],
  "context": {
    "jobTitle": "extracted job title if applicable",
    "company": "extracted company name if applicable",
    "hasForm": true/false
  }
}

Example for job posting:
{
  "pageType": "job_posting",
  "greeting": "Found a Software Engineer role at Google!",
  "actions": ["Tailor Resume", "Job Fit", "Job Details"],
  "context": {"jobTitle": "Software Engineer", "company": "Google", "hasForm": false}
}

Example with form:
{
  "pageType": "job_posting",
  "greeting": "Senior Developer at Microsoft - ready to apply?",
  "actions": ["Fill Form", "Tailor Resume", "Job Fit"],
  "context": {"jobTitle": "Senior Developer", "company": "Microsoft", "hasForm": true}
}`;

    try {
        // Call AI with JSON mode
        const result = await window.AIClient.callAI(prompt, systemInstruction, {
            jsonMode: true,
            maxTokens: 800, // Increased to ensure complete JSON response
            temperature: 0.3
        });

        if (!result.success) {
            console.error('AI classification failed:', result.error);
            return getFallbackResponse(url, title);
        }

        // Parse AI response
        const parsed = window.AIClient.parseAIJson(result.text);
        if (!parsed || !parsed.pageType) {
            console.warn('Invalid AI response, using fallback');
            return getFallbackResponse(url, title);
        }

        return {
            pageType: parsed.pageType,
            greeting: parsed.greeting || 'How can I help you today?',
            actions: parsed.actions || [],
            context: parsed.context || {}
        };

    } catch (error) {
        console.error('Classification error:', error);
        return getFallbackResponse();
    }
}

/**
 * Build the classification prompt from page data
 */
function buildClassificationPrompt(url, title, content, selectedText) {
    // Limit content size to avoid token limits
    const maxContentLength = 5000;
    let truncatedContent = content;

    if (content && content.length > maxContentLength) {
        truncatedContent = content.substring(0, maxContentLength) + '...';
    }

    let prompt = `Analyze this web page and classify it:\n\n`;
    prompt += `URL: ${url}\n`;
    prompt += `Page Title: ${title}\n\n`;

    if (selectedText) {
        prompt += `User Selected Text:\n${selectedText}\n\n`;
    }

    prompt += `Page Content (excerpt):\n${truncatedContent}\n\n`;
    prompt += `Instructions:\n`;
    prompt += `1. Determine if this is a job posting page, job application form, company careers page, or generic page\n`;
    prompt += `2. Extract job title and company name if visible\n`;
    prompt += `3. Check if there are form fields present\n`;
    prompt += `4. Create a friendly, context-aware greeting\n`;
    prompt += `5. Suggest 2-3 relevant actions the user might want to take\n`;
    prompt += `6. Return the result as valid JSON only\n`;

    return prompt;
}

/**
 * Get fallback response when AI classification fails
 * Uses heuristics to provide better defaults
 */
function getFallbackResponse(url = '', title = '') {
    // Use heuristics to make educated guess
    const isJobRelated = quickJobPageHeuristic(url, title, '');

    if (isJobRelated) {
        return {
            pageType: 'job_posting',
            greeting: 'Found a job opportunity! Ready to help.',
            actions: ['Tailor Resume', 'Job Fit', 'Job Details'],
            context: {}
        };
    }

    return {
        pageType: 'generic',
        greeting: 'Hi! I\'m Nova, your AI career assistant.',
        actions: ['Resume Help', 'Career Tips'],
        context: {}
    };
}

/**
 * Quick heuristic check to determine if page might be job-related
 * Used for fast initial assessment before AI call
 */
function quickJobPageHeuristic(url, title, content) {
    const jobKeywords = [
        'job', 'career', 'position', 'opening', 'apply',
        'hiring', 'employment', 'vacancy', 'opportunity'
    ];

    const textToCheck = `${url} ${title} ${content.substring(0, 1000)}`.toLowerCase();

    return jobKeywords.some(keyword => textToCheck.includes(keyword));
}

/**
 * Generate context-aware action suggestions based on page type
 */
function getDefaultActions(pageType, hasForm) {
    const actionMap = {
        'job_posting': hasForm
            ? ['Fill Form', 'Tailor Resume', 'Job Fit', 'Job Details']
            : ['Tailor Resume', 'Job Fit', 'Job Details'],
        'application_form': ['Fill Form', 'Review Info', 'Preview'],
        'company_page': ['Find Jobs', 'Research', 'Careers'],
        'generic': ['Resume Help', 'Career Tips']
    };

    return (actionMap[pageType] || actionMap['generic']).slice(0, 3); // Limit to 3 actions
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.ContextClassifier = {
        classifyPageContext,
        quickJobPageHeuristic,
        getDefaultActions
    };
}
