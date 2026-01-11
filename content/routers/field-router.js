/**
 * FieldRouter
 * Decides which handler should process each field
 * Single decision point - eliminate sequential phase checks
 */

class FieldRouter {
    constructor() {
        this.neuralClassifier = new window.NeuralClassifier();
        this.neuralClassifier.init(); // Fire and forget init

        this.routingRules = {
            cache: 'Fields with cached values',
            history: 'Indexed work/education fields',
            matcher: 'Simple deterministic fields',
            ai: 'Complex/unknown fields'
        };
    }

    /**
     * Route a single field to appropriate handler
     * @param {Object} field - Field object with selector, name, label, type, etc.
     * @param {Object} cacheResult - Result from cache check (if any)
     * @returns {Object} { handler: string, priority: number, reason: string }
     */
    async route(field, cacheResult = null) {
        // 0. Neural Classification (The Brain)
        // Check if pre-classified (Phase 0), otherwise run inference
        let prediction = field.ml_prediction;

        if (!prediction) {
            prediction = this.neuralClassifier.predict(field);
            // normalization
            prediction = {
                label: prediction.label,
                confidence: prediction.confidence,
                source: prediction.source
            };
            field.ml_prediction = prediction;
        }

        // Priority 1: Use cached value if available
        // (Even if we know what it is, if we have a locked value, use it)
        if (cacheResult && cacheResult.cached) {
            return {
                handler: 'cache',
                priority: 1,
                reason: `Cached in ${cacheResult.source}`,
                confidence: cacheResult.confidence || 1.0
            };
        }

        // Priority 2: Neural Routing (High Confidence > 80%)
        if (prediction.confidence > 0.8) {
            // Map Neural Label -> Handler
            const handler = this.getHandlerForLabel(prediction.label);
            if (handler !== 'ai') { // If it's a standard field, route it
                // Calculate Index using Smart Indexing Service
                let index = 0;
                if (window.IndexingService) {
                    const type = this.getHistoryType(prediction.label);
                    // Check for Section Start (Sequential Logic)
                    if (window.IndexingService.SECTION_START_FIELDS[type]?.includes(prediction.label)) {
                        // Only increment if we see the same field again? 
                        // Actually, IndexingService.getIndex handles the "Get" logic. 
                        // But the "Increment" logic is usually when we detect a NEW section.
                        // For now, let's trust getIndex handling explicit/implicit.
                    }
                    index = window.IndexingService.getIndex(field, type);
                }

                return {
                    handler: handler,
                    priority: 2,
                    reason: `Neural Match: ${prediction.label}`,
                    confidence: prediction.confidence,
                    index: index // Attach valid index
                };
            }
        }

        // Priority 3: Regex Fallback (The Old Ways)
        // If Neural is unsure, double check with Regex
        if (this.isHistoryField(field)) {
            return { handler: 'history', priority: 3, reason: 'Regex: History Field', confidence: 0.9 };
        }
        if (this.isMatcherField(field)) {
            return { handler: 'matcher', priority: 3, reason: this.getMatcherReason(field), confidence: 0.85 };
        }

        // Priority 4: Complex/unknown → AI (LLM)
        return {
            handler: 'ai',
            priority: 4,
            reason: 'Unknown field type (Low Neural Confidence)',
            confidence: 0.7
        };
    }

    /**
     * Maps a Neural Label (e.g. 'company') to a Handler (e.g. 'history')
     */
    getHandlerForLabel(label) {
        const HISTORY_FIELDS = ['job_title', 'company', 'job_start_date', 'job_end_date', 'work_description', 'school', 'degree', 'major', 'gpa', 'edu_start_date', 'edu_end_date'];
        const MATCHER_FIELDS = ['sponsorship', 'citizenship', 'gender', 'race', 'veteran', 'disability', 'work_auth', 'clearance', 'legal_age'];

        if (HISTORY_FIELDS.includes(label)) return 'history';
        if (MATCHER_FIELDS.includes(label)) return 'matcher';

        return 'ai';
    }

    /**
     * Helper to determine history type (work vs education)
     */
    getHistoryType(label) {
        if (['job_title', 'company', 'job_start_date', 'job_end_date', 'work_description'].includes(label)) return 'work';
        if (['school', 'degree', 'major', 'gpa', 'edu_start_date', 'edu_end_date'].includes(label)) return 'education';
        return 'work'; // Default fallback
    }

    /**
     * Route all fields and return grouped by handler
     * @param {Array} fields - Array of field objects
     * @param {Object} cacheResults - Map of selector → cache result
     * @returns {Object} { cache: [], history: [], matcher: [], ai: [] }
     */
    routeAll(fields, cacheResults = {}) {
        const routing = {
            cache: [],
            history: [],
            matcher: [],
            ai: []
        };

        const routingDecisions = [];

        fields.forEach(async field => {
            const cacheResult = cacheResults[field.selector];
            // Fix: route is now async
            const decision = await this.route(field, cacheResult);

            routing[decision.handler].push(field);

            routingDecisions.push({
                field: field.label || field.name,
                handler: decision.handler,
                reason: decision.reason,
                confidence: decision.confidence
            });
        });

        console.log('[FieldRouter] Routing summary:', {
            cache: routing.cache.length,
            history: routing.history.length,
            matcher: routing.matcher.length,
            ai: routing.ai.length
        });

        if (window.DEBUG_MODE) {
            console.table(routingDecisions);
        }

        return routing;
    }

    /**
     * Get routing statistics
     */
    getRoutingStats(fields, cacheResults = {}) {
        const routing = this.routeAll(fields, cacheResults);
        const total = fields.length;

        return {
            total,
            cache: { count: routing.cache.length, percent: (routing.cache.length / total * 100).toFixed(1) },
            history: { count: routing.history.length, percent: (routing.history.length / total * 100).toFixed(1) },
            matcher: { count: routing.matcher.length, percent: (routing.matcher.length / total * 100).toFixed(1) },
            ai: { count: routing.ai.length, percent: (routing.ai.length / total * 100).toFixed(1) }
        };
    }

    // ========================================
    // CLASSIFICATION HELPERS
    // ========================================

    /**
     * Check if field should go to HistoryManager
     */
    isHistoryField(field) {
        const hasIndex = /[_\-\[]\d+[_\-\]]?/.test(field.name || field.id || '');

        // Use section context if available (most accurate)
        if (field.sectionContext && hasIndex) {
            const ctx = field.sectionContext;
            if (ctx.confidence >= 4 && (ctx.context === 'work' || ctx.context === 'education')) {
                return true;
            }
        }

        // Fallback to keyword matching
        if (hasIndex) {
            const text = (field.name + ' ' + field.label).toLowerCase();
            const isWorkField = /job|employ|work|company|position|title|role/i.test(text);
            const isEduField = /degree|education|school|university|college|institution|major/i.test(text);
            return isWorkField || isEduField;
        }

        return false;
    }

    /**
     * Check if field should go to LocalMatcher
     */
    isMatcherField(field) {
        const text = (field.name + ' ' + field.label).toLowerCase();

        // Simple deterministic patterns
        const patterns = [
            /experience.*years/i,
            /years.*experience/i,
            /sponsorship/i,
            /visa/i,
            /authorized.*work/i,
            /relocate/i,
            /remote/i,
            /travel/i,
            /veteran/i,
            /disability/i,
            /gender/i,
            /race/i,
            /ethnicity/i,
            /citizenship/i,
            /clearance/i,
            /employed.*currently/i,
            /notice.*period/i
        ];

        return patterns.some(pattern => pattern.test(text));
    }

    /**
     * Get reason for matcher routing
     */
    getMatcherReason(field) {
        const text = (field.name + ' ' + field.label).toLowerCase();

        if (/experience|years/i.test(text)) return 'Years of experience question';
        if (/sponsorship|visa|authorized/i.test(text)) return 'Visa/sponsorship question';
        if (/relocate|remote|travel/i.test(text)) return 'Work logistics question';
        if (/veteran|disability|gender|race|ethnicity/i.test(text)) return 'Demographics question';
        if (/citizenship/i.test(text)) return 'Citizenship question';
        if (/clearance/i.test(text)) return 'Security clearance question';
        if (/employed|notice/i.test(text)) return 'Employment status question';

        return 'Deterministic field';
    }

    /**
     * Helper: Extract field index
     */
    extractFieldIndex(field) {
        const match = (field.name || '').match(/[_\-\[](\d+)[_\-\]]?/);
        return match ? parseInt(match[1]) : 0;
    }
}

// Export for use
if (typeof window !== 'undefined') {
    window.FieldRouter = FieldRouter;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FieldRouter;
}
