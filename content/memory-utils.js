/**
 * memory-utils.js
 * Handles smart memory operations and text similarity utilities.
 */

async function getSmartMemoryCache() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['smart_memory_cache'], (result) => {
            resolve(result.smart_memory_cache || {});
        });
    });
}

function updateSmartMemoryCache(newEntries) {
    chrome.storage.local.get(['smart_memory_cache'], (result) => {
        let cache = result.smart_memory_cache || {};

        // Add new entries
        cache = { ...cache, ...newEntries };

        // PRUNE: Keep only top 50 recently used
        const keys = Object.keys(cache);
        if (keys.length > 50) {
            // Sort by timestamp ASC (oldest first)
            const sortedKeys = keys.sort((a, b) => {
                return (cache[a].timestamp || 0) - (cache[b].timestamp || 0);
            });

            // Delete oldest until 50 left
            const deleteCount = keys.length - 50;
            for (let i = 0; i < deleteCount; i++) {
                delete cache[sortedKeys[i]];
            }
        }

        chrome.storage.local.set({ smart_memory_cache: cache });
        console.log('🧠 Smart Memory updated. Current Size:', Object.keys(cache).length);
    });
}

/**
 * Calculates Jaccard Similarity between two strings (Token Overlap)
 */
function calculateUsingJaccardSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;

    // Tokenize: Lowercase -> Remove non-alphanumeric -> Split -> Filter empty
    const tokenize = (s) => String(s).toLowerCase()
        .replace(/[^a-z0-9\s]/g, '') // Keep spaces to split
        .split(/\s+/)
        .filter(w => w.length > 2); // Ignore 'a', 'is' (stop words simple filter)

    const set1 = new Set(tokenize(str1));
    const set2 = new Set(tokenize(str2));

    if (set1.size === 0 || set2.size === 0) return 0;

    // Intersection
    const intersection = new Set([...set1].filter(x => set2.has(x)));

    // Union
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
}

// Common stop words to filter out
const STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'do', 'for',
    'from', 'has', 'have', 'in', 'is', 'it', 'of', 'on', 'or',
    'that', 'the', 'to', 'was', 'will', 'with', 'you', 'your',
    'please', 'enter', 'provide', 'kindly', 'input'
]);

// Helper: Normalize keys for robust matching with sorted tokens
function normalizeSmartMemoryKey(text) {
    if (!text) return '';

    return text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')     // Replace punctuation with space
        .replace(/\s+/g, ' ')          // Collapse multiple spaces
        .trim()
        .split(' ')                    // Split into words
        .filter(word =>
            word.length > 0 &&         // Not empty
            !STOP_WORDS.has(word)      // Not a stop word
        )
        .sort()                        // Sort alphabetically (order-independent!)
        .join(' ');                    // Join back together
}
