/**
 * AI Client for Smart AI Job Apply Extension
 *
 * Unified AI client using Google Gemini API with:
 * - Enterprise-Grade Key Rotation: Round-Robin across up to 5 API keys
 * - Cooldown management and predictive aborts
 * - Error taxonomy (RATE_LIMIT_TEMP, QUOTA_EXHAUSTED, INVALID_KEY, etc.)
 * - Rich state storage (ai_key_state) for status, retryAfterTs, lastError per key (hashed)
 */

// Gemini API Configuration
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_API_KEYS = 5;
const KEY_COOLDOWN_MS = 60 * 1000; // 1 min default for rate limit

// Storage keys
const STORAGE_KEYS = {
    API_KEY: 'gemini_api_key',
    API_KEYS: 'gemini_api_keys',
    MODEL: 'gemini_model',
    PROVIDER: 'ai_provider',
    AI_KEY_STATE: 'ai_key_state',
    LAST_USED_INDEX: 'ai_last_used_index'
};

/**
 * Error taxonomy for AI failures (managed state: degraded/offline)
 * @readonly
 */
const AIErrorCode = {
    RATE_LIMIT_TEMP: 'RATE_LIMIT_TEMP',
    QUOTA_EXHAUSTED: 'QUOTA_EXHAUSTED',
    INVALID_KEY: 'INVALID_KEY',
    UNAUTHORIZED: 'UNAUTHORIZED',
    MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
    SAFETY_BLOCK: 'SAFETY_BLOCK',
    NETWORK_ERROR: 'NETWORK_ERROR',
    UNKNOWN: 'UNKNOWN'
};

/**
 * Hash API key for storage (do not store raw key in ai_key_state)
 * @param {string} apiKey
 * @returns {string}
 */
function hashKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') return '';
    let h = 0;
    const s = apiKey.trim();
    for (let i = 0; i < Math.min(s.length, 64); i++) {
        h = ((h << 5) - h) + s.charCodeAt(i) | 0;
    }
    return 'k_' + Math.abs(h).toString(36);
}

/**
 * Get ai_key_state from storage
 * @returns {Promise<Object>} Map of keyHash -> { status, retryAfterTs, lastError, lastErrorCode }
 */
async function getKeyState() {
    const vault = globalThis.StorageVault || (typeof StorageVault !== 'undefined' ? StorageVault : null);
    if (vault) {
        const data = await vault.bucket('ai').get('key_state');
        return data || {};
    }
    const result = await chrome.storage.local.get([STORAGE_KEYS.AI_KEY_STATE]);
    return result[STORAGE_KEYS.AI_KEY_STATE] || {};
}

/**
 * Update state for a key (by hash)
 * @param {string} keyHash
 * @param {string} status - 'ok' | 'cooldown' | 'revoked'
 * @param {number} [retryAfterTs] - timestamp after which key can be retried
 * @param {string} [lastError]
 * @param {string} [lastErrorCode]
 */
async function updateKeyState(keyHash, status, retryAfterTs = null, lastError = null, lastErrorCode = null) {
    const vault = globalThis.StorageVault || (typeof StorageVault !== 'undefined' ? StorageVault : null);
    if (vault) {
        await vault.bucket('ai').update('key_state', async (state = {}) => {
            const entry = state[keyHash] || { status: 'ok', retryAfterTs: 0, lastError: null, lastErrorCode: null };
            entry.status = status;
            if (retryAfterTs != null) entry.retryAfterTs = retryAfterTs;
            if (lastError != null) entry.lastError = lastError;
            if (lastErrorCode != null) entry.lastErrorCode = lastErrorCode;
            state[keyHash] = entry;
            return state;
        });
        return;
    }
    const state = await getKeyState();
    const entry = state[keyHash] || { status: 'ok', retryAfterTs: 0, lastError: null, lastErrorCode: null };
    entry.status = status;
    if (retryAfterTs != null) entry.retryAfterTs = retryAfterTs;
    if (lastError != null) entry.lastError = lastError;
    if (lastErrorCode != null) entry.lastErrorCode = lastErrorCode;
    state[keyHash] = entry;
    await chrome.storage.local.set({ [STORAGE_KEYS.AI_KEY_STATE]: state });
}

/**
 * Classify API error into AIErrorCode and optional retry-after seconds
 * @param {number} status - HTTP status
 * @param {string} message - Error message
 * @returns {{ code: string, retryAfterSeconds?: number }}
 */
function classifyError(status, message) {
    const msg = (message || '').toLowerCase();
    if (status === 429) {
        const retrySec = msg.includes('minute') ? 60 : (msg.includes('hour') ? 3600 : 60);
        return { code: msg.includes('quota') ? AIErrorCode.QUOTA_EXHAUSTED : AIErrorCode.RATE_LIMIT_TEMP, retryAfterSeconds: retrySec };
    }
    if (status === 403) {
        if (msg.includes('api key') || msg.includes('invalid') || msg.includes('revoked')) return { code: AIErrorCode.INVALID_KEY };
        return { code: AIErrorCode.UNAUTHORIZED };
    }
    if (status === 400) {
        if (msg.includes('api key')) return { code: AIErrorCode.INVALID_KEY };
        if (msg.includes('not found') || msg.includes('model')) return { code: AIErrorCode.MODEL_NOT_FOUND };
    }
    if (status === 503 || status === 502) return { code: AIErrorCode.RATE_LIMIT_TEMP, retryAfterSeconds: 30 };
    if (msg.includes('safety') || msg.includes('blocked')) return { code: AIErrorCode.SAFETY_BLOCK };
    if (msg.includes('network') || msg.includes('fetch')) return { code: AIErrorCode.NETWORK_ERROR };
    return { code: AIErrorCode.UNKNOWN };
}

/**
 * Get list of API keys (supports legacy single key)
 * @returns {Promise<string[]>}
 */
async function getApiKeys() {
    const vault = globalThis.StorageVault || (typeof StorageVault !== 'undefined' ? StorageVault : null);
    if (vault) {
        const keys = await vault.bucket('ai').get('keys');
        return keys || [];
    }

    const data = await chrome.storage.local.get([STORAGE_KEYS.API_KEYS, STORAGE_KEYS.API_KEY]);
    let keys = data[STORAGE_KEYS.API_KEYS];

    // Normalize to array
    if (!Array.isArray(keys) || keys.length === 0) {
        const single = data[STORAGE_KEYS.API_KEY];
        keys = (single && typeof single === 'string' && single.trim()) ? [single.trim()] : [];
    }

    if (keys.length === 0) return [];

    // Encryption Integration
    const finalKeys = [];
    const encryptionService = globalThis.EncryptionService || (typeof EncryptionService !== 'undefined' ? EncryptionService : null);
    const encryptionAAD = globalThis.EncryptionAAD || (typeof EncryptionAAD !== 'undefined' ? EncryptionAAD : null);

    for (const k of keys) {
        if (typeof k !== 'string') continue;

        if (encryptionService && encryptionService.isEncrypted(k)) {
            try {
                const aad = encryptionAAD.aiKey();
                const decrypted = await encryptionService.decrypt(k, aad);
                if (decrypted) finalKeys.push(decrypted);
            } catch (err) {
                console.error('[AIClient] Failed to decrypt API key. Data might be corrupted.', err);
            }
        } else {
            finalKeys.push(k.trim());
        }
    }

    return finalKeys.filter(k => k.length > 0);
}

/**
 * Get next API key for round-robin (skips cooldown and revoked)
 * @returns {Promise<{ key: string, index: number }|null>}
 */
async function getNextApiKey() {
    const keys = await getApiKeys();
    if (keys.length === 0) return null;

    const state = await getKeyState();
    let lastUsed = -1;

    const vault = globalThis.StorageVault || (typeof StorageVault !== 'undefined' ? StorageVault : null);
    if (vault) {
        const sys = await vault.bucket('system').get('ai_meta');
        lastUsed = sys?.last_used_index ?? -1;
    } else {
        lastUsed = (await chrome.storage.local.get([STORAGE_KEYS.LAST_USED_INDEX]))[STORAGE_KEYS.LAST_USED_INDEX] ?? -1;
    }

    const now = Date.now();

    for (let i = 0; i < keys.length; i++) {
        const idx = (lastUsed + 1 + i) % keys.length;
        const key = keys[idx];
        const keyHash = hashKey(key);
        const entry = state[keyHash];

        if (entry?.status === 'revoked') continue;
        if (entry?.status === 'cooldown' && entry.retryAfterTs > now) continue;

        const currentVault = globalThis.StorageVault || (typeof StorageVault !== 'undefined' ? StorageVault : null);
        if (currentVault) {
            await currentVault.bucket('system').update('ai_meta', async (meta = {}) => {
                meta.last_used_index = idx;
                return meta;
            }, false);
        } else {
            await chrome.storage.local.set({ [STORAGE_KEYS.LAST_USED_INDEX]: idx });
        }
        return { key: key, index: idx };
    }
    return null;
}

/**
 * Mark key as success (clear cooldown for that key)
 * @param {string} apiKey
 */
async function markKeySuccess(apiKey) {
    const keyHash = hashKey(apiKey);
    const vault = globalThis.StorageVault || (typeof StorageVault !== 'undefined' ? StorageVault : null);
    if (vault) {
        await vault.bucket('ai').update('key_state', async (state = {}) => {
            const entry = state[keyHash];
            if (entry && entry.status === 'cooldown') {
                entry.status = 'ok';
                entry.retryAfterTs = 0;
            }
            return state;
        });
        return;
    }
    const state = await getKeyState();
    const entry = state[keyHash];
    if (entry && entry.status === 'cooldown') {
        entry.status = 'ok';
        entry.retryAfterTs = 0;
        state[keyHash] = entry;
        await chrome.storage.local.set({ [STORAGE_KEYS.AI_KEY_STATE]: state });
    }
}

/**
 * Get the stored Gemini API key (first available for backward compat)
 * @returns {Promise<string|null>}
 */
async function getStoredApiKey() {
    const keys = await getApiKeys();
    return keys.length > 0 ? keys[0] : null;
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
 * Save a single Gemini API key (appends to list, max 5). For multiple keys use saveApiKeys.
 * @param {string} apiKey
 * @param {string} model (optional)
 * @returns {Promise<void>}
 */
async function saveApiKey(apiKey, model = DEFAULT_GEMINI_MODEL) {
    const keys = await getApiKeys();
    const trimmed = (apiKey || '').trim();
    if (!trimmed) return;

    let newKeys = keys.filter(k => k !== trimmed);
    newKeys.unshift(trimmed);
    newKeys = newKeys.slice(0, MAX_API_KEYS);

    await saveApiKeys(newKeys, model);
}

/**
 * Save multiple Gemini API keys (max 5)
 * @param {string[]} apiKeys
 * @param {string} model (optional)
 * @returns {Promise<void>}
 */
async function saveApiKeys(apiKeys, model = DEFAULT_GEMINI_MODEL) {
    const list = (Array.isArray(apiKeys) ? apiKeys : [])
        .map(k => (k && typeof k === 'string' ? k.trim() : ''))
        .filter(Boolean)
        .slice(0, MAX_API_KEYS);

    if (list.length === 0) return;

    // Encrypt Keys if service is available
    let keysToSave = list;
    const encryptionService = globalThis.EncryptionService || (typeof EncryptionService !== 'undefined' ? EncryptionService : null);
    const encryptionAAD = globalThis.EncryptionAAD || (typeof EncryptionAAD !== 'undefined' ? EncryptionAAD : null);

    if (encryptionService) {
        const aad = encryptionAAD.aiKey();
        try {
            keysToSave = await Promise.all(
                list.map(k => encryptionService.encrypt(k, aad))
            );
        } catch (err) {
            console.error('[AIClient] Encryption failed during save:', err);
            throw err;
        }
    }

    await chrome.storage.local.set({
        [STORAGE_KEYS.API_KEYS]: keysToSave,
        [STORAGE_KEYS.API_KEY]: keysToSave[0],
        [STORAGE_KEYS.MODEL]: model || DEFAULT_GEMINI_MODEL,
        [STORAGE_KEYS.PROVIDER]: 'gemini'
    });
}

/**
 * Remove all stored API keys and key state
 * @returns {Promise<void>}
 */
async function removeApiKey() {
    await chrome.storage.local.remove([
        STORAGE_KEYS.API_KEY,
        STORAGE_KEYS.API_KEYS,
        STORAGE_KEYS.MODEL,
        STORAGE_KEYS.PROVIDER,
        STORAGE_KEYS.AI_KEY_STATE,
        STORAGE_KEYS.LAST_USED_INDEX
    ]);
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
        const response = await fetch(
            `${GEMINI_API_BASE}/models/${modelName}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: 'Say "OK"' }] }],
                    generationConfig: { maxOutputTokens: 5 }
                })
            }
        );

        if (response.ok) return { valid: true };

        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `HTTP ${response.status}`;

        if (response.status === 400) {
            if (errorMessage.includes('API key')) return { valid: false, error: 'Invalid API key format' };
            if (errorMessage.includes('not found')) return { valid: false, error: `Model '${modelName}' not found or not supported` };
        }
        if (response.status === 403) return { valid: false, error: 'API key is invalid or has been revoked' };
        if (response.status === 429) return { valid: false, error: 'Rate limit exceeded. Try again later.' };

        return { valid: false, error: errorMessage };
    } catch (error) {
        console.error('API key validation error:', error);
        return { valid: false, error: 'Network error. Check your connection.' };
    }
}

/**
 * AI status for pipeline/UI: ok | degraded | offline
 * @returns {Promise<{ status: 'ok'|'degraded'|'offline', usableKeys: number, totalKeys: number }>}
 */
async function getAIStatus() {
    const keys = await getApiKeys();
    if (keys.length === 0) return { status: 'offline', usableKeys: 0, totalKeys: 0 };

    const state = await getKeyState();
    const now = Date.now();
    let usable = 0;
    for (const key of keys) {
        const keyHash = hashKey(key);
        const entry = state[keyHash];
        if (entry?.status === 'revoked') continue;
        if (entry?.status === 'cooldown' && entry.retryAfterTs > now) continue;
        usable++;
    }

    if (usable === 0) return { status: 'offline', usableKeys: 0, totalKeys: keys.length };
    if (usable < keys.length) return { status: 'degraded', usableKeys: usable, totalKeys: keys.length };
    return { status: 'ok', usableKeys: usable, totalKeys: keys.length };
}

/**
 * Check if the extension is properly set up (has API key)
 * @returns {Promise<{ready: boolean, hasApiKey: boolean, hasResume: boolean}>}
 */
async function checkSetupStatus() {
    const keys = await getApiKeys();
    const { resumeData } = await chrome.storage.local.get(['resumeData']);
    const hasApiKey = keys.length > 0;
    const hasResume = !!(resumeData && Object.keys(resumeData).length > 0);
    return {
        ready: hasApiKey && hasResume,
        hasApiKey,
        hasResume
    };
}

/**
 * Call Gemini API with one key (internal); returns result or error with classified code
 * @param {string} apiKey
 * @param {string} modelName
 * @param {Object} requestBody
 * @returns {Promise<{ ok: boolean, data?: Object, error?: string, status?: number, errorCode?: string }>}
 */
async function fetchWithKey(apiKey, modelName, requestBody) {
    const url = `${GEMINI_API_BASE}/models/${modelName}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (response.ok) {
        const data = await response.json();
        return { ok: true, data };
    }

    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || `API request failed with status ${response.status}`;
    const classified = classifyError(response.status, errorMessage);
    return {
        ok: false,
        error: errorMessage,
        status: response.status,
        errorCode: classified.code,
        retryAfterSeconds: classified.retryAfterSeconds
    };
}

/**
 * Call Gemini API with round-robin key rotation and automatic retry on 429/403
 * @param {string} prompt
 * @param {string} systemInstruction
 * @param {Object} options
 * @returns {Promise<{success: boolean, text?: string, error?: string, errorCode?: string}>}
 */
async function callGemini(prompt, systemInstruction = '', options = {}) {
    const {
        maxTokens = 8192,
        temperature = 0.7,
        jsonMode = false,
        fileData = null
    } = options;

    const modelName = await getStoredModel();
    const keys = await getApiKeys();
    if (keys.length === 0) {
        return {
            success: false,
            error: 'No API key configured. Please set up your Gemini API key in settings.',
            errorCode: AIErrorCode.INVALID_KEY
        };
    }

    const parts = [{ text: prompt }];
    if (fileData) {
        parts.push({
            inlineData: { mimeType: fileData.mimeType, data: fileData.data }
        });
    }

    const requestBody = {
        contents: [{ parts }],
        generationConfig: { maxOutputTokens: maxTokens, temperature }
    };
    if (systemInstruction) {
        requestBody.systemInstruction = { parts: [{ text: systemInstruction }] };
    }
    if (jsonMode) {
        requestBody.generationConfig.responseMimeType = 'application/json';
    }

    const triedHashes = new Set();
    let lastError = null;
    let lastErrorCode = null;

    while (true) {
        const next = await getNextApiKey();
        if (!next) {
            return {
                success: false,
                error: lastError || 'All API keys are in cooldown or revoked. Try again later.',
                errorCode: lastErrorCode || AIErrorCode.UNKNOWN
            };
        }

        const keyHash = hashKey(next.key);
        if (triedHashes.has(keyHash)) break;
        triedHashes.add(keyHash);

        const result = await fetchWithKey(next.key, modelName, requestBody);

        if (result.ok) {
            await markKeySuccess(next.key);
            const text = result.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            const finishReason = result.data?.candidates?.[0]?.finishReason;
            if (!text) {
                if (finishReason === 'SAFETY') {
                    return { success: false, error: 'Response blocked by safety filters.', errorCode: AIErrorCode.SAFETY_BLOCK };
                }
                return { success: false, error: 'No response generated.' };
            }
            return { success: true, text };
        }

        lastError = result.error;
        lastErrorCode = result.errorCode;
        const retryAfterTs = result.retryAfterSeconds
            ? Date.now() + result.retryAfterSeconds * 1000
            : Date.now() + KEY_COOLDOWN_MS;
        const isRevoked = result.errorCode === AIErrorCode.INVALID_KEY || result.errorCode === AIErrorCode.UNAUTHORIZED;
        await updateKeyState(
            keyHash,
            isRevoked ? 'revoked' : 'cooldown',
            retryAfterTs,
            result.error,
            result.errorCode
        );

        if (isRevoked) continue;
        if (result.status === 429) continue;
        break;
    }

    return {
        success: false,
        error: lastError || 'API request failed.',
        errorCode: lastErrorCode || AIErrorCode.UNKNOWN
    };
}

/**
 * Main AI call function - entry point for all AI requests
 * @param {string} prompt
 * @param {string} systemInstruction
 * @param {Object} options
 * @returns {Promise<{success: boolean, text?: string, error?: string, errorCode?: string}>}
 */
async function callAI(prompt, systemInstruction = '', options = {}) {
    return callGemini(prompt, systemInstruction, options);
}

/**
 * Parse JSON from AI response (handles markdown code blocks)
 * @param {string} text
 * @returns {Object|null}
 */
function parseAIJson(text) {
    if (!text) return null;
    const trimmedText = text.trim();
    try {
        return JSON.parse(trimmedText);
    } catch (e) {
        const jsonMatch = trimmedText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[1].trim());
            } catch (e2) { }
        }
        const firstBrace = trimmedText.indexOf('{');
        const lastBrace = trimmedText.lastIndexOf('}');
        const firstBracket = trimmedText.indexOf('[');
        const lastBracket = trimmedText.lastIndexOf(']');
        let jsonStr = '';
        const startIdx = (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) ? firstBrace : firstBracket;
        if (startIdx !== -1) {
            const endIdx = (startIdx === firstBrace) ? lastBrace : lastBracket;
            if (endIdx !== -1 && endIdx > startIdx) jsonStr = trimmedText.substring(startIdx, endIdx + 1);
            else jsonStr = trimmedText.substring(startIdx);
        }
        if (!jsonStr) return null;
        try {
            return JSON.parse(jsonStr);
        } catch (parseError) {
            let currentAttempt = jsonStr.trim();
            const MAX_BACKTRACKS = 5;
            for (let attempt = 0; attempt <= MAX_BACKTRACKS; attempt++) {
                try {
                    let fixedJson = currentAttempt.replace(/[:,\s]+$/, '');
                    const quotes = fixedJson.match(/(")(?<!\\)/g) || [];
                    if (quotes.length % 2 !== 0) fixedJson += '"';
                    const stack = [];
                    for (let i = 0; i < fixedJson.length; i++) {
                        const char = fixedJson[i];
                        if (char === '"' && (i === 0 || fixedJson[i - 1] !== '\\')) {
                            let j = i + 1;
                            while (j < fixedJson.length && (fixedJson[j] !== '"' || fixedJson[j - 1] === '\\')) j++;
                            i = j;
                        } else if (char === '{' || char === '[') {
                            stack.push(char === '{' ? '}' : ']');
                        } else if (char === '}' || char === ']') {
                            if (stack.length > 0 && stack[stack.length - 1] === char) stack.pop();
                        }
                    }
                    while (stack.length > 0) fixedJson += stack.pop();
                    return JSON.parse(fixedJson);
                } catch (e2) {
                    if (attempt === MAX_BACKTRACKS) break;
                    const lastComma = currentAttempt.lastIndexOf(',');
                    if (lastComma !== -1) currentAttempt = currentAttempt.substring(0, lastComma);
                    else break;
                }
            }
        }
    }
    return null;
}

const AIClientExport = {
    getStoredApiKey,
    getStoredModel,
    saveApiKey,
    saveApiKeys,
    removeApiKey,
    validateApiKey,
    checkSetupStatus,
    callAI,
    callGemini,
    parseAIJson,
    getApiKeys,
    getAIStatus,
    getKeyState,
    AIErrorCode,
    STORAGE_KEYS,
    MAX_API_KEYS
};

globalThis.AIClient = AIClientExport;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIClientExport;
}
