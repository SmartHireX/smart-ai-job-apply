/**
 * MatcherHandler
 * Handles interactions for Selector Fields (Radio, Checkbox, Select)
 * Delegated Logic: Uses LocalMatcher or internal logic for "Selection"
 */
class MatcherHandler extends window.Handler {
    constructor() {
        super('matcher');
    }

    async handle(fields, context) {
        const results = {};
        const { resumeData } = context;

        // Processing a batch (usually 1 field in Sequential Pipeline)
        // But logic is robust for arrays

        // Strategy: Delegate to LocalMatcher for "Decision"
        // MatcherHandler is just the "Handler" wrapper now in Pipeline
        // Ideally FieldRouter called LocalMatcher directly, but we kept this layer.

        if (window.LocalMatcher) {
            // LocalMatcher.resolveFields returns { defined: {}, remaining: [] }
            const { defined } = window.LocalMatcher.resolveFields(fields, resumeData);

            for (const [selector, res] of Object.entries(defined)) {
                results[selector] = {
                    ...res,
                    trace: this.createTrace('local_matcher', res.confidence, { source: res.source })
                };
            }
        }

        return results;
    }
}

if (typeof window !== 'undefined') {
    window.MatcherHandler = MatcherHandler;
}
