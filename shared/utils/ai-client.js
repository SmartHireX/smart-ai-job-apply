/**
 * AI Client for Smart AI Job Apply Extension
 * 
 * Unified AI client using Google Gemini API.
 * All AI calls go through this module for consistency.
 */

// Gemini API Configuration
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

// Storage keys
const STORAGE_KEYS = {
    API_KEY: 'gemini_api_key',
    MODEL: 'gemini_model',
    PROVIDER: 'ai_provider' // For future multi-provider support
};

/**
 * Get the stored Gemini API key
 * @returns {Promise<string|null>}
 */
async function getStoredApiKey() {
    const result = await chrome.storage.local.get([STORAGE_KEYS.API_KEY]);
    return result[STORAGE_KEYS.API_KEY] || null;
}

/**
 * Get the stored Model ID
 * @returns {Promise<string>}
 */
async function getStoredModel() {
    const result = await chrome.storage.local.get([STORAGE_KEYS.MODEL]);
    return result[STORAGE_KEYS.MODEL] || DEFAULT_GEMINI_MODEL;
}

/**
 * Save the Gemini API key and Model
 * @param {string} apiKey 
 * @param {string} model (optional)
 * @returns {Promise<void>}
 */
async function saveApiKey(apiKey, model = DEFAULT_GEMINI_MODEL) {
    await chrome.storage.local.set({
        [STORAGE_KEYS.API_KEY]: apiKey,
        [STORAGE_KEYS.MODEL]: model,
        [STORAGE_KEYS.PROVIDER]: 'gemini'
    });
}

/**
 * Remove the stored API key
 * @returns {Promise<void>}
 */
async function removeApiKey() {
    await chrome.storage.local.remove([STORAGE_KEYS.API_KEY, STORAGE_KEYS.MODEL, STORAGE_KEYS.PROVIDER]);
}

/**
 * Validate a Gemini API key by making a test request
 * @param {string} apiKey 
 * @param {string} modelName (optional)
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
async function validateApiKey(apiKey, modelName = DEFAULT_GEMINI_MODEL) {
    if (!apiKey || apiKey.trim() === '') {
        return { valid: false, error: 'API key is empty' };
    }

    try {
        // Make a minimal test request to validate the key
        const response = await fetch(
            `${GEMINI_API_BASE}/models/${modelName}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: 'Say "OK"' }]
                    }],
                    generationConfig: {
                        maxOutputTokens: 5
                    }
                })
            }
        );

        if (response.ok) {
            return { valid: true };
        }

        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `HTTP ${response.status}`;

        if (response.status === 400) {
            if (errorMessage.includes('API key')) return { valid: false, error: 'Invalid API key format' };
            if (errorMessage.includes('not found')) return { valid: false, error: `Model '${modelName}' not found or not supported` };
        }
        if (response.status === 403) {
            return { valid: false, error: 'API key is invalid or has been revoked' };
        }
        if (response.status === 429) {
            return { valid: false, error: 'Rate limit exceeded. Try again later.' };
        }

        return { valid: false, error: errorMessage };
    } catch (error) {
        console.error('API key validation error:', error);
        return { valid: false, error: 'Network error. Check your connection.' };
    }
}

/**
 * Check if the extension is properly set up (has API key)
 * @returns {Promise<{ready: boolean, hasApiKey: boolean, hasResume: boolean}>}
 */
async function checkSetupStatus() {
    const apiKey = await getStoredApiKey();
    const { resumeData } = await chrome.storage.local.get(['resumeData']);

    const hasApiKey = !!apiKey;
    const hasResume = !!(resumeData && Object.keys(resumeData).length > 0);

    return {
        ready: hasApiKey && hasResume,
        hasApiKey,
        hasResume
    };
}

/**
 * Call Gemini API with a prompt
 * @param {string} prompt - The user prompt
 * @param {string} systemInstruction - System instruction for the model
 * @param {Object} options - Additional options
 * @param {number} options.maxTokens - Max output tokens (default: 2048)
 * @param {number} options.temperature - Temperature 0-1 (default: 0.7)
 * @param {boolean} options.jsonMode - Whether to request JSON output
 * @returns {Promise<{success: boolean, text?: string, error?: string}>}
 */
async function callGemini(prompt, systemInstruction = '', options = {}) {
    const {
        maxTokens = 8192,
        temperature = 0.7,
        jsonMode = false,
        fileData = null // { mimeType: string, data: string (base64) }
    } = options;

    const apiKey = await getStoredApiKey();
    const modelName = await getStoredModel();

    if (!apiKey) {
        return {
            success: false,
            error: 'No API key configured. Please set up your Gemini API key in settings.'
        };
    }

    try {
        const parts = [{ text: prompt }];

        // Add file data if provided (multimodal)
        if (fileData) {
            parts.push({
                inlineData: {
                    mimeType: fileData.mimeType,
                    data: fileData.data
                }
            });
        }

        const requestBody = {
            contents: [{
                parts: parts
            }],
            generationConfig: {
                maxOutputTokens: maxTokens,
                temperature: temperature
            }
        };

        // Add system instruction if provided
        if (systemInstruction) {
            requestBody.systemInstruction = {
                parts: [{ text: systemInstruction }]
            };
        }

        // Request JSON output if needed
        if (jsonMode) {
            requestBody.generationConfig.responseMimeType = 'application/json';
        }

        const response = await fetch(
            `${GEMINI_API_BASE}/models/${modelName}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.error?.message || `API request failed with status ${response.status}`;

            // Handle specific error cases
            if (response.status === 429) {
                return { success: false, error: 'Rate limit exceeded. Please wait a moment and try again.' };
            }
            if (response.status === 403) {
                return { success: false, error: 'API key is invalid. Please check your settings.' };
            }

            return { success: false, error: errorMessage };
        }

        const data = await response.json();

        // Extract text from response
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            // Check for safety blocks
            const finishReason = data.candidates?.[0]?.finishReason;
            if (finishReason === 'SAFETY') {
                return { success: false, error: 'Response blocked by safety filters.' };
            }
            return { success: false, error: 'No response generated.' };
        }

        return { success: true, text };

    } catch (error) {
        console.error('Gemini API call error:', error);
        return {
            success: false,
            error: error.message || 'Failed to call AI. Check your connection.'
        };
    }
}

/**
 * Main AI call function - entry point for all AI requests
 * @param {string} prompt - The user prompt
 * @param {string} systemInstruction - System instruction
 * @param {Object} options - Options passed to the provider
 * @returns {Promise<{success: boolean, text?: string, error?: string}>}
 */
async function callAI(prompt, systemInstruction = '', options = {}) {
    // Currently only Gemini, but structured for future providers
    return callGemini(prompt, systemInstruction, options);
}

/**
 * Parse JSON from AI response (handles markdown code blocks)
 * @param {string} text - Raw text from AI
 * @returns {Object|null}
 */
function parseAIJson(text) {
    if (!text) return null;

    const trimmedText = text.trim();

    // 1. Try direct parse
    try {
        return JSON.parse(trimmedText);
    } catch (e) {
        // 2. Try extraction from markdown block
        const jsonMatch = trimmedText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[1].trim());
            } catch (e2) {
                // Continue to fallback if markdown parse fails
            }
        }

        // 3. Extract candidate JSON substring
        const firstBrace = trimmedText.indexOf('{');
        const lastBrace = trimmedText.lastIndexOf('}');
        const firstBracket = trimmedText.indexOf('[');
        const lastBracket = trimmedText.lastIndexOf(']');

        let jsonStr = '';
        const startIdx = (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) ? firstBrace : firstBracket;

        if (startIdx !== -1) {
            const endIdx = (startIdx === firstBrace) ? lastBrace : lastBracket;
            if (endIdx !== -1 && endIdx > startIdx) {
                jsonStr = trimmedText.substring(startIdx, endIdx + 1);
            } else {
                // Truncated case: take from start until end of text
                jsonStr = trimmedText.substring(startIdx);
            }
        }

        if (!jsonStr) {
            console.error('Could not find start of JSON in response:', text);
            return null;
        }

        // 4. Try parsing extracted candidate
        try {
            return JSON.parse(jsonStr);
        } catch (parseError) {
            // 5. Final attempt: Aggressive Repair with Backtracking
            // Strategy: 
            // 1. Try simple balancing (append quotes/braces)
            // 2. If valid JSON isn't found, find the last comma, cut it off, and retry (discarding the partial last entry)

            let currentAttempt = jsonStr.trim();
            const MAX_BACKTRACKS = 5; // Don't loop forever

            for (let attempt = 0; attempt <= MAX_BACKTRACKS; attempt++) {
                try {
                    let fixedJson = currentAttempt;

                    // 1. Remove trailing garbage/separators
                    fixedJson = fixedJson.replace(/[:,\s]+$/, '');

                    // 2. Fix unterminated strings
                    const quotes = fixedJson.match(/(?<!\\)"/g) || [];
                    if (quotes.length % 2 !== 0) {
                        fixedJson += '"';
                    }

                    // 3. Balance braces and brackets
                    const stack = [];
                    for (let i = 0; i < fixedJson.length; i++) {
                        const char = fixedJson[i];
                        if (char === '"' && (i === 0 || fixedJson[i - 1] !== '\\')) {
                            let j = i + 1;
                            while (j < fixedJson.length && (fixedJson[j] !== '"' || fixedJson[j - 1] === '\\')) j++;
                            i = j; // Skip string content
                        } else if (char === '{' || char === '[') {
                            stack.push(char === '{' ? '}' : ']');
                        } else if (char === '}' || char === ']') {
                            if (stack.length > 0 && stack[stack.length - 1] === char) stack.pop();
                        }
                    }
                    while (stack.length > 0) fixedJson += stack.pop();

                    // 4. Try parsing
                    return JSON.parse(fixedJson);

                } catch (parseError) {
                    if (attempt === MAX_BACKTRACKS) {
                        console.error('Failed to repair truncated JSON after backtracks:', parseError);
                        console.error('Raw text:', text);
                        break;
                    }

                    // Backtrack: Find last comma and truncate
                    const lastComma = currentAttempt.lastIndexOf(',');
                    if (lastComma !== -1) {
                        // console.log('⚠️ JSON Parse failed, backtracking to last comma...');
                        currentAttempt = currentAttempt.substring(0, lastComma);
                    } else {
                        // No more commas to backtrack to
                        break;
                    }
                }
            }
        }

        return null;
    }
}

// Export functions for use in other modules
// In Chrome extensions, we use window to share between scripts
if (typeof window !== 'undefined') {
    window.AIClient = {
        getStoredApiKey,
        getStoredModel,
        saveApiKey,
        removeApiKey,
        validateApiKey,
        checkSetupStatus,
        callAI,
        callGemini,
        parseAIJson,
        STORAGE_KEYS
    };
}

// For background script / service worker context
if (typeof self !== 'undefined' && typeof self.AIClient === 'undefined') {
    self.AIClient = {
        getStoredApiKey,
        getStoredModel,
        saveApiKey,
        removeApiKey,
        validateApiKey,
        checkSetupStatus,
        callAI,
        callGemini,
        parseAIJson,
        STORAGE_KEYS
    };
}
