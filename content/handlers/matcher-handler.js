/**
 * MatcherHandler
 * Handles fields using LocalMatcher (deterministic text matching)
 */
class MatcherHandler {
    constructor() {
        this.name = 'matcher';
    }

    async handle(fields, context) {
        const results = {};

        if (!window.LocalMatcher) {
            console.warn('[MatcherHandler] LocalMatcher not available');
            return results;
        }

        const matcher = new window.LocalMatcher();
        const { resumeData } = context;

        // Process each field independent (or batch if matcher supports it?)
        // LocalMatcher.resolveFields takes an array of fields

        const answers = matcher.resolveFields(fields, resumeData);

        // Convert array of {selector, value} to results map
        answers.forEach(answer => {
            if (answer && answer.selector && answer.value) {
                results[answer.selector] = {
                    value: answer.value,
                    confidence: 0.9,
                    source: 'local-matcher'
                };
            }
        });

        console.log(`[MatcherHandler] Resolved ${Object.keys(results).length} fields`);
        return results;
    }
}

if (typeof window !== 'undefined') {
    window.MatcherHandler = MatcherHandler;
}
