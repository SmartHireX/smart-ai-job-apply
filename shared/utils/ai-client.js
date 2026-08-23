/**
 * AI Client for Nova Apply Extension
 *
 * Unified AI client using Google Gemini API with:
 * - Enterprise-Grade Key Rotation: Round-Robin across up to 5 API keys
 * - Cooldown management and predictive aborts
 * - Error taxonomy (RATE_LIMIT_TEMP, QUOTA_EXHAUSTED, INVALID_KEY, etc.)
 * - Rich state storage (ai_key_state) for status, retryAfterTs, lastError per key (hashed)
 */

// Gemini API Configuration
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';

// Groq API Configuration
const GROQ_API_BASE = 'https://api.groq.com/openai/v1';
const DEFAULT_GROQ_MODEL = 'llama-3.1-8b-instant';
const MAX_API_KEYS = 5;
const KEY_COOLDOWN_MS = 60 * 1000; // 1 min default for rate limit

// Ordered list of text-capable models to try during auto-discovery (most available first)
const MODEL_DISCOVERY_ORDER = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-flash-latest',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash-8b',
    'gemini-1.5-flash-8b-latest',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash-8b',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-1.5-pro',
    'gemini-1.5-pro-latest',
    'gemini-pro',
];

// Substrings that identify non-text-chat models — skip these during discovery
const MODEL_EXCLUDE_PATTERNS = ['video', 'tts', 'embedding', 'aqa', 'vision', 'image', 'eap', 'exp', 'preview'];

function isTextModel(name) {
    const n = (name || '').toLowerCase();
    return n.startsWith('gemini') && !MODEL_EXCLUDE_PATTERNS.some(p => n.includes(p));
}

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
    if (!vault) return {};
    await vault.waitUntilReady?.();
    const data = await vault.bucket('ai').get('key_state');
    return data || {};
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
    if (!vault) return;

    await vault.bucket('ai').update('key_state', async (state = {}) => {
        const entry = state[keyHash] || { status: 'ok', retryAfterTs: 0, lastError: null, lastErrorCode: null };
        entry.status = status;
        if (retryAfterTs != null) entry.retryAfterTs = retryAfterTs;
        if (lastError != null) entry.lastError = lastError;
        if (lastErrorCode != null) entry.lastErrorCode = lastErrorCode;
        state[keyHash] = entry;
        return state;
    });
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
    if (!vault) return [];

    await vault.waitUntilReady?.();
    const keys = await vault.bucket('ai').get('keys');

    // Legacy support: if stored as string, wrap in array
    if (typeof keys === 'string' && keys.trim().length > 0) {
        return [keys];
    }

    return Array.isArray(keys) ? keys : [];
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
    if (!vault) return null;

    const sys = await vault.bucket('system').get('ai_meta');
    lastUsed = sys?.last_used_index ?? -1;

    const now = Date.now();

    for (let i = 0; i < keys.length; i++) {
        const idx = (lastUsed + 1 + i) % keys.length;
        const key = keys[idx];
        const keyHash = hashKey(key);
        const entry = state[keyHash];

        if (entry?.status === 'revoked') continue;
        if (entry?.status === 'cooldown' && entry.retryAfterTs > now) continue;

        await vault.bucket('system').update('ai_meta', async (meta = {}) => {
            meta.last_used_index = idx;
            return meta;
        }, false);

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
    if (!vault) return;

    await vault.bucket('ai').update('key_state', async (state = {}) => {
        const entry = state[keyHash];
        if (entry && entry.status === 'cooldown') {
            entry.status = 'ok';
            entry.retryAfterTs = 0;
        }
        return state;
    });
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
    const vault = globalThis.StorageVault || (typeof StorageVault !== 'undefined' ? StorageVault : null);
    if (vault) {
        const config = await vault.bucket('system').get('config');
        const model = (config?.ai_model || '').trim();
        const legacyModels = [
            'gemini-2.5-flash', 'gemini-2.5-flash-lite',
            'gemini-2.5-flash-exp', 'gemini-2.5-flash-preview-05-20',
            'gemini-1.0-pro'
        ];
        if (!model || legacyModels.includes(model) || !isTextModel(model)) {
            return DEFAULT_GEMINI_MODEL;
        }
        return model;
    }
    return DEFAULT_GEMINI_MODEL;
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

    const vault = globalThis.StorageVault || (typeof StorageVault !== 'undefined' ? StorageVault : null);
    if (!vault) return false;

    await vault.waitUntilReady?.();

    // Save to AI bucket (Encryption handled by Vault)
    // We allow an empty list if the user wants to clear all keys
    await vault.bucket('ai').set('keys', list);

    // Save model to System bucket
    await vault.bucket('system').update('config', async (config = {}) => {
        config.ai_model = model || DEFAULT_GEMINI_MODEL;
        return config;
    });

    // // console.log(`[AIClient] Saved ${list.length} API keys to vault.`);
    return true;
}

/**
 * Remove all stored API keys and key state
 * @returns {Promise<void>}
 */
async function removeApiKey() {
    const vault = globalThis.StorageVault || (typeof StorageVault !== 'undefined' ? StorageVault : null);
    if (!vault) return;

    await vault.bucket('ai').remove('keys');
    await vault.bucket('ai').remove('key_state');
    await vault.bucket('system').update('ai_meta', async (meta = {}) => {
        meta.last_used_index = -1;
        return meta;
    }, false);
}

/**
 * Reset all AI key states (clears cooldowns and revoked status)
 * Useful after updating model names or endpoints.
 * @returns {Promise<void>}
 */
async function resetAIState() {
    const vault = globalThis.StorageVault || (typeof StorageVault !== 'undefined' ? StorageVault : null);
    if (!vault) return;
    await vault.bucket('ai').remove('key_state');
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
        // Step 1: verify the key is valid by listing models (lightweight GET, no quota cost)
        const listResp = await fetch(
            `${GEMINI_API_BASE}/models?key=${apiKey}&pageSize=50`,
            { signal: controller.signal }
        );

        clearTimeout(timeoutId);

        if (!listResp.ok) {
            const errData = await listResp.json().catch(() => ({}));
            const msg = errData.error?.message || `HTTP ${listResp.status}`;
            if (listResp.status === 400 || listResp.status === 401 || listResp.status === 403) {
                return { valid: false, error: 'API key is invalid or has been revoked.' };
            }
            return { valid: false, error: msg };
        }

        const listData = await listResp.json();
        const available = (listData.models || []).map(m => m.name.split('/').pop());

        // Step 2: confirm the target model is in the list
        if (!available.includes(modelName)) {
            // Pick best available from priority order
            const fallback = MODEL_DISCOVERY_ORDER.find(m => available.includes(m)) || available[0];
            console.warn(`[AIClient] ${modelName} not in list, falling back to ${fallback}. Full list:`, available);
            return {
                valid: true,
                warning: true,
                resolvedModel: fallback,
                error: `Model '${modelName}' not available. Auto-selected '${fallback}'.`
            };
        }

        return { valid: true, resolvedModel: modelName };

    } catch (error) {
        clearTimeout(timeoutId);
        console.error('API key validation error:', error);
        if (error.name === 'AbortError') return { valid: false, error: 'Request timed out. Check your connection.' };
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
    const vault = globalThis.StorageVault || (typeof StorageVault !== 'undefined' ? StorageVault : null);
    if (!vault) return { ready: false, hasApiKey: false, hasResume: false, error: 'Vault not found' };

    try {
        await vault.waitUntilReady?.();

        const keys = await getApiKeys();
        const resumeData = await vault.bucket('identity').get('resumeData');
        const profile = await vault.bucket('identity').get('profile');

        const hasApiKey = Array.isArray(keys) && keys.length > 0;
        const hasResume = (resumeData && Object.keys(resumeData).length > 0) || (profile && Object.keys(profile).length > 0);

        return {
            ready: hasApiKey && hasResume,
            hasApiKey,
            hasResume,
            vaultReady: vault.initialized
        };
    } catch (err) {
        console.error('[AIClient] checkSetupStatus failed:', err);
        return { ready: false, hasApiKey: false, hasResume: false, error: err.message };
    }
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
    const errorStatus = errorData.error?.status || '';
    const errorCode = errorData.error?.code || response.status;
    console.error(`[AIClient] fetchWithKey ${modelName} → HTTP ${response.status} | status="${errorStatus}" | msg="${errorMessage}"`);
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
 * Find the first model in MODEL_DISCOVERY_ORDER that actually responds to a real
 * generateContent call. Falls back to probing models from the /models list.
 * @param {string} apiKey
 * @returns {Promise<string|null>}
 */
async function discoverWorkingModel(apiKey) {
    const testBody = {
        contents: [{ parts: [{ text: 'Hi' }] }],
        generationConfig: { maxOutputTokens: 5 }
    };

    // Step 1: get the account's actual model list
    let accountModels = [];
    try {
        const resp = await fetch(
            `${GEMINI_API_BASE}/models?key=${apiKey}&pageSize=100`,
            { signal: AbortSignal.timeout(8000) }
        );
        if (!resp.ok) {
            const errData = await resp.json().catch(() => ({}));
            console.error(`[AIClient] /models list failed: HTTP ${resp.status} | msg="${errData.error?.message}"`);
        } else {
            const data = await resp.json();
            accountModels = (data.models || [])
                .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
                .map(m => m.name.split('/').pop())
                .filter(isTextModel);
            console.log(`[AIClient] Account text models:`, accountModels);
        }
    } catch (e) {
        console.warn(`[AIClient] Could not fetch models list:`, e);
    }

    // Step 2: build probe list — priority order intersected with account models, then extras
    const inAccount = MODEL_DISCOVERY_ORDER.filter(m => accountModels.includes(m));
    const notInOrder = accountModels.filter(m => !MODEL_DISCOVERY_ORDER.includes(m));
    const probeList = [...inAccount, ...notInOrder];

    if (probeList.length === 0) {
        // Account list fetch failed or empty — probe our known list directly
        probeList.push(...MODEL_DISCOVERY_ORDER);
    }

    console.log(`[AIClient] Probing models:`, probeList);

    for (const model of probeList) {
        try {
            const result = await fetchWithKey(apiKey, model, testBody);
            if (result.ok) {
                console.log(`[AIClient] Discovered working model: ${model}`);
                return model;
            }
            // 429 or 503 = model IS valid for this key, just temporarily overloaded
            if (result.status === 429 || result.status === 503) {
                console.log(`[AIClient] Discovered working model (busy ${result.status}): ${model}`);
                return model;
            }
            // 400/401/403 = bad key — stop entirely
            if (result.status === 401 || result.status === 403) {
                console.error(`[AIClient] Key rejected by ${model} (${result.status}), stopping.`);
                return null;
            }
            // 404 = not available for this account — skip, try next
            console.log(`[AIClient] ${model} → ${result.status}, trying next...`);
        } catch {
            // network error, skip
        }
    }

    console.error(`[AIClient] No working text model found for this key.`);
    return null;
}

/**
 * Persist an auto-discovered model so future calls use it.
 * @param {string} model
 */
async function persistDiscoveredModel(model) {
    const vault = globalThis.StorageVault || (typeof StorageVault !== 'undefined' ? StorageVault : null);
    if (!vault) return;
    await vault.bucket('system').update('config', async (config = {}) => {
        config.ai_model = model;
        return config;
    });
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
        generationConfig: {
            maxOutputTokens: maxTokens,
            temperature
        }
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
    let activeModelName = modelName;

    console.log(`[AIClient] callGemini using model: ${activeModelName}`);

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const keyHash = hashKey(key);
        if (triedHashes.has(keyHash)) continue;
        triedHashes.add(keyHash);

        const result = await fetchWithKey(key, activeModelName, requestBody);

        if (result.ok) {
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

        // Model not available or wrong type: probe for a real working model and retry
        const needsDiscovery = result.status === 404
            || result.errorCode === AIErrorCode.MODEL_NOT_FOUND
            || (result.status === 503 && !isTextModel(activeModelName));

        if (needsDiscovery) {
            console.log(`[AIClient] Model ${activeModelName} unusable (${result.status}), probing for working model...`);
            const discovered = await discoverWorkingModel(key);
            if (discovered) {
                console.log(`[AIClient] Found working model: ${discovered}, retrying actual call...`);
                activeModelName = discovered;
                await persistDiscoveredModel(discovered);
                const retry = await fetchWithKey(key, activeModelName, requestBody);
                if (retry.ok) {
                    const text = retry.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) return { success: true, text };
                }
                lastError = retry.error;
                lastErrorCode = retry.errorCode;
            } else {
                lastError = 'No working Gemini model found for this API key.';
                lastErrorCode = AIErrorCode.MODEL_NOT_FOUND;
            }
            break;
        }

        // 429/503 on a text model = valid model but overloaded; try next key if available
        if (result.status !== 429 && result.status !== 503) break;
    }

    return {
        success: false,
        error: lastError || 'API request failed.',
        errorCode: lastErrorCode || AIErrorCode.UNKNOWN
    };
}

// ─── Groq Provider ────────────────────────────────────────────────────────────

async function getGroqConfig() {
    const vault = globalThis.StorageVault || (typeof StorageVault !== 'undefined' ? StorageVault : null);
    if (!vault) return null;
    await vault.waitUntilReady?.();
    const cfg = await vault.bucket('ai').get('groq_config');
    return cfg || null;
}

async function saveGroqConfig(apiKey, model = DEFAULT_GROQ_MODEL) {
    const vault = globalThis.StorageVault || (typeof StorageVault !== 'undefined' ? StorageVault : null);
    if (!vault) return;
    await vault.waitUntilReady?.();
    await vault.bucket('ai').set('groq_config', { key: apiKey.trim(), model: model || DEFAULT_GROQ_MODEL });
}

async function validateGroqKey(apiKey, model = DEFAULT_GROQ_MODEL) {
    if (!apiKey || !apiKey.trim()) return { valid: false, error: 'API key is empty' };
    try {
        const resp = await fetch(`${GROQ_API_BASE}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey.trim()}` },
            body: JSON.stringify({
                model: model || DEFAULT_GROQ_MODEL,
                messages: [{ role: 'user', content: 'Hi' }],
                max_tokens: 5
            }),
            signal: AbortSignal.timeout(10000)
        });
        if (resp.ok) return { valid: true, model };
        const err = await resp.json().catch(() => ({}));
        const msg = err.error?.message || `HTTP ${resp.status}`;
        if (resp.status === 401) return { valid: false, error: 'Invalid Groq API key.' };
        return { valid: false, error: msg };
    } catch (e) {
        if (e.name === 'AbortError') return { valid: false, error: 'Request timed out.' };
        return { valid: false, error: 'Network error.' };
    }
}

async function callGroq(prompt, systemInstruction = '', options = {}) {
    const { maxTokens = 4096, temperature = 0.7 } = options;
    const cfg = await getGroqConfig();
    if (!cfg?.key) return { success: false, error: 'No Groq API key configured.', errorCode: AIErrorCode.INVALID_KEY };

    const messages = [];
    if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
    messages.push({ role: 'user', content: prompt });

    try {
        const resp = await fetch(`${GROQ_API_BASE}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.key}` },
            body: JSON.stringify({ model: cfg.model || DEFAULT_GROQ_MODEL, messages, max_tokens: maxTokens, temperature }),
            signal: AbortSignal.timeout(30000)
        });
        if (resp.ok) {
            const data = await resp.json();
            const text = data.choices?.[0]?.message?.content;
            if (!text) return { success: false, error: 'No response from Groq.' };
            console.log(`[AIClient] Groq success with model: ${cfg.model || DEFAULT_GROQ_MODEL}`);
            return { success: true, text };
        }
        const err = await resp.json().catch(() => ({}));
        const msg = err.error?.message || `HTTP ${resp.status}`;
        console.error(`[AIClient] Groq error: ${resp.status} | ${msg}`);
        return { success: false, error: msg, errorCode: resp.status === 429 ? AIErrorCode.RATE_LIMIT_TEMP : AIErrorCode.UNKNOWN };
    } catch (e) {
        return { success: false, error: e.message, errorCode: AIErrorCode.NETWORK_ERROR };
    }
}

/**
 * Main AI call function — uses the provider specified in options.provider
 * ('gemini' | 'groq'), defaults to 'gemini'
 */
// Intents that are cheap/general — route to Groq when available to save Gemini quota
const GROQ_ELIGIBLE_INTENTS = new Set([
    'summarize', 'explain', 'extract', 'translate', 'write', 'chat',
    'scroll', 'copy', 'keyword_match'
]);

async function callAI(prompt, systemInstruction = '', options = {}) {
    const provider = options.provider || 'gemini';

    // Explicit Groq request
    if (provider === 'groq') return callGroq(prompt, systemInstruction, options);

    // Smart routing: use Groq for lightweight intents if a Groq key is configured
    // Heavy intents (compatibility, fill AI, scan scoring) always go to Gemini
    if (provider !== 'gemini_only' && options.intent && GROQ_ELIGIBLE_INTENTS.has(options.intent)) {
        const groqCfg = await getGroqConfig();
        if (groqCfg?.key) {
            const result = await callGroq(prompt, systemInstruction, options);
            if (result.success) return result;
            // Groq failed — fall through to Gemini
        }
    }

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
    callGroq,
    getGroqConfig,
    saveGroqConfig,
    validateGroqKey,
    parseAIJson,
    getApiKeys,
    getAIStatus,
    getKeyState,
    resetAIState,
    AIErrorCode,
    STORAGE_KEYS,
    MAX_API_KEYS
};

globalThis.AIClient = AIClientExport;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIClientExport;
}
