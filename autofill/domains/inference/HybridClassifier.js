/**
 * Hybrid Classifier
 * 
 * Orchestrates multiple classification engines (Heuristic + Neural)
 * and arbitrates their results using a confidence-based voting system.
 * 
 * Architecture:
 * 1. Feature Extraction (shared)
 * 2. Parallel Classification (Heuristic + Neural)
 * 3. Arbitration Logic (5-tier system)
 * 4. Result Enrichment (validation, formatting)
 * 
 * @version 2.0.0
 */

// NeuralClassifier and HeuristicEngine are loaded globally in browser
// const NeuralClassifier = require('./neural-classifier.js');
// const HeuristicEngine = require('./HeuristicEngine.js');

class HybridClassifier {

    static VERSION = '2.0.0';
    static DEBUG = false;

    // Mutually Exclusive Conflict Groups for Resolution
    static CONFLICT_GROUPS = [
        ["salary_current", "salary_expected"],
        ["education_start_date", "education_end_date", "graduation_date"],
        ["job_location", "current_location", "preferred_location"],
        ["field_of_study", "major"],
        ["years_experience", "years_skill"]
    ];

    // Arbitration Thresholds (Default values, overridden dynamically)
    static HEURISTIC_STRONG_THRESHOLD = 0.95; // Increased to prioritize Neural
    static NEURAL_STRONG_THRESHOLD = 0.70;    // Decreased to trust Neural more
    static HEURISTIC_WEAK_THRESHOLD = 0.50;

    // Confidence for unanimous agreement
    static UNANIMOUS_CONFIDENCE = 0.99;

    /**
     * Initialize the HybridClassifier
     * @param {Object} options - Configuration options
     * @param {Object} [options.heuristicEngine] - Pre-initialized HeuristicEngine instance
     * @param {Object} [options.neuralClassifier] - Pre-initialized NeuralClassifier instance
     * @param {Object} [options.featureExtractor] - Pre-initialized FeatureExtractor instance
     * @param {boolean} [options.debug=false] - Enable debug logging
     */
    constructor(options = {}) {
        // Configuration
        this._debug = options.debug ?? HybridClassifier.DEBUG;

        // Dependency injection (lazy-loaded if not provided)
        this._heuristicEngine = options.heuristicEngine || null;
        this._neuralClassifier = options.neuralClassifier || null;
        this._featureExtractor = options.featureExtractor || null;

        // Performance metrics
        this._metrics = {
            totalClassifications: 0,
            heuristicWins: 0,
            neuralWins: 0,
            unanimousAgreements: 0,
            weightedVotes: 0,
            averageLatency: 0
        };

        this._log('HybridClassifier initialized');
    }

    /**
     * Classify a form field using hybrid ensemble approach
     * @param {Object} field - Form field object with attributes (name, id, placeholder, etc.)
     * @returns {Promise<Object>} Classification result
     */
    async classify(field) {
        const startTime = performance.now();
        // Store current field for use in arbitration helpers
        this._currentField = field;

        try {
            // 1. Extract features (shared by both classifiers)
            const features = await this._extractFeatures(field);

            // 2. Run both classifiers in parallel for speed
            const [heuristicResult, neuralResult] = await Promise.all([
                this._runHeuristic(field, features),
                this._runNeural(field, features)
            ]);

            // 3. Arbitrate to determine final result
            const finalResult = this._arbitrate(heuristicResult, neuralResult);

            // 4. Enrich with metadata
            const enrichedResult = this._enrichResult(finalResult, field);

            // 5. Record metrics
            this._recordMetrics(startTime, finalResult);

            return enrichedResult;

        } catch (error) {
            this._logError('Classification failed', error);
            return {
                label: 'unknown',
                confidence: 0,
                source: 'error',
                error: error.message
            };
        }
    }

    /**
     * Run heuristic classification
     * @private
     */
    async _runHeuristic(field, features) {
        const engine = this._getHeuristicEngine();

        if (!engine) {
            return { label: 'unknown', confidence: 0, source: 'heuristic_unavailable' };
        }

        try {
            const result = engine.classify(field, {
                parentContext: field.parentContext,
                siblingContext: field.siblingContext
            });

            return {
                label: result?.label || result?.type || 'unknown', // Correctly read label property
                confidence: result?.confidence || 0,
                source: 'heuristic',
                details: result
            };
        } catch (error) {
            this._logError('Heuristic classification failed', error);
            return { label: 'unknown', confidence: 0, source: 'heuristic_error' };
        }
    }

    /**
     * Run neural classification
     * @private
     */
    async _runNeural(field, features) {
        const classifier = this._getNeuralClassifier();

        if (!classifier) {
            return { label: 'unknown', confidence: 0, source: 'neural_unavailable' };
        }

        try {
            // Neural classifier can work with features or field object
            const result = await classifier.predict(features);

            return {
                label: result?.label || 'unknown',
                confidence: result?.confidence || 0,
                source: 'neural',
                details: result
            };
        } catch (error) {
            this._logError('Neural classification failed', error);
            return { label: 'unknown', confidence: 0, source: 'neural_error' };
        }
    }

    /**
     * Arbitrate between Heuristic and Neural results using 5-tier decision system
     * Enhanced with Category-Specific Thresholds
     * @private
     * @param {Object} hResult - Heuristic result
     * @param {Object} nResult - Neural result
     * @returns {Object} Final decision
     */
    _arbitrate(hResult, nResult) {
        const hLabel = hResult?.label || 'unknown';
        const hConf = hResult?.confidence || 0;
        const nLabel = nResult?.label || 'unknown';
        const nConf = nResult?.confidence || 0;

        // 1. Determine Arbitration Context (Category)
        // We use the proposed labels to determine which "mode" we are in
        const proposedLabel = hLabel !== 'unknown' ? hLabel : nLabel;
        const category = this._getGroupType(proposedLabel);

        // 2. Get Dynamic Thresholds based on Category
        const {
            heuristicThreshold,
            neuralThreshold,
            heuristicWeight,
            neuralWeight
        } = this._getDynamicThresholds(category);

        this._log(`Arbitration [${category}]: H(${hLabel}:${hConf.toFixed(2)}) vs N(${nLabel}:${nConf.toFixed(2)}) | Thresh: H>${heuristicThreshold} N>${neuralThreshold}`);

        // ========== TIER 1: UNANIMOUS AGREEMENT ==========
        // When both classifiers agree, boost confidence to 99%
        if (hLabel !== 'unknown' && hLabel === nLabel) {
            this._metrics.unanimousAgreements++;
            return {
                label: hLabel,
                confidence: HybridClassifier.UNANIMOUS_CONFIDENCE,
                source: 'ensemble_unanimous',
                agreementType: 'unanimous',
                heuristicConfidence: hConf,
                neuralConfidence: nConf
            };
        }

        // ========== TIER 2: STRONG HEURISTIC ==========
        // Trust Heuristic if above category-specific threshold
        if (hLabel !== 'unknown' && hConf >= heuristicThreshold) {
            this._metrics.heuristicWins++;
            return {
                label: hLabel,
                confidence: hConf,
                source: 'ensemble_heuristic_strong',
                agreementType: 'heuristic_override',
                neuralLabel: nLabel,
                neuralConfidence: nConf
            };
        }

        // ========== TIER 3: STRONG NEURAL (WEAK HEURISTIC) ==========
        // OPTIMIZATION: Margin-Based Trust
        // Neural only wins if it has a significant margin over the second best class
        // This prevents confident but "confused" predictions
        let neuralApproved = false;
        if (nLabel !== 'unknown' && nConf > neuralThreshold && hConf < HybridClassifier.HEURISTIC_WEAK_THRESHOLD) {
            const neuralMargin = (nResult.details?.probabilities) ?
                this._calculateMargin(nResult.details.probabilities, nLabel) : 1.0;

            // Require 15% margin to override
            if (neuralMargin > 0.15) {
                // OPTIMIZATION: Value Sanity Check
                // Ensure the neural prediction makes sense for the field type
                // (Heuristics are usually type-safe by regex design, Neural is not)
                if (this._checkValueType(nLabel, this._currentField)) {
                    neuralApproved = true;
                }
            }
        }

        if (neuralApproved) {
            this._metrics.neuralWins++;
            return {
                label: nLabel,
                confidence: nConf,
                source: 'ensemble_neural_strong_margin',
                agreementType: 'neural_override',
                heuristicLabel: hLabel,
                heuristicConfidence: hConf
            };
        }

        // ========== TIER 4: WEIGHTED VOTE + CONFLICT RESOLUTION ==========
        // Both found something but disagree - calculate weighted scores
        if (hLabel !== 'unknown' && nLabel !== 'unknown') {
            this._metrics.weightedVotes++;

            // Use Dynamic Weights
            let hScore = hConf * heuristicWeight;
            let nScore = nConf * neuralWeight;

            // OPTIMIZATION: Conflict Group Resolution
            // Check if H and N are in a "confused group" (e.g. salary_current vs salary_expected)
            // If so, pick the one with the higher ABSOLUTE score, ignoring the source weights slightly
            const conflictGroup = HybridClassifier.CONFLICT_GROUPS.find(g => g.includes(hLabel) && g.includes(nLabel));

            if (conflictGroup) {
                // In a conflict group, we trust the raw confidence more than the ensemble weights
                // because usually one model has "latched" onto a specific distinguishing feature
                if (nConf > hConf + 0.1 && this._checkValueType(nLabel, this._currentField)) {
                    nScore += 0.2; // Boost neural if it found a clear distinguishing signal
                }
            } else {
                // Standard Sanity Check Penalty
                if (!this._checkValueType(nLabel, this._currentField)) nScore *= 0.1;
            }

            if (hScore > nScore) {
                return {
                    label: hLabel,
                    confidence: hConf,
                    source: 'ensemble_heuristic_weighted',
                    agreementType: 'weighted_vote',
                    scores: { heuristic: hScore, neural: nScore },
                    neuralLabel: nLabel,
                    neuralConfidence: nConf
                };
            } else {
                return {
                    label: nLabel,
                    confidence: nConf,
                    source: 'ensemble_neural_weighted',
                    agreementType: 'weighted_vote',
                    scores: { heuristic: hScore, neural: nScore },
                    heuristicLabel: hLabel,
                    heuristicConfidence: hConf
                };
            }
        }

        // ========== TIER 5: FALLBACK ==========
        // Only one found something, or both failed
        if (hLabel !== 'unknown') {
            return {
                label: hLabel,
                confidence: hConf,
                source: 'ensemble_heuristic_fallback',
                agreementType: 'heuristic_only'
            };
        }

        if (nLabel !== 'unknown') {
            return {
                label: nLabel,
                confidence: nConf,
                source: 'ensemble_neural_fallback',
                agreementType: 'neural_only'
            };
        }

        // Both failed - return unknown
        return {
            label: 'unknown',
            confidence: 0,
            source: 'ensemble_ambiguous',
            agreementType: 'both_failed'
        };
    }

    /**
     * Determine category for dynamic thresholding
     */
    _getGroupType(label) {
        if (!label || label === 'unknown') return 'general';

        // Categorization Logic
        if (['first_name', 'last_name', 'email', 'phone', 'address_line', 'city', 'state', 'zip_code', 'country'].includes(label)) {
            return 'contact'; // Heuristic is king here
        }

        if (['company_name', 'job_title', 'industry', 'years_experience', 'skills', 'job_description'].includes(label)) {
            return 'job'; // Neural is better here (context needed)
        }

        if (['institution_name', 'degree', 'major', 'gpa', 'graduation_date'].includes(label)) {
            return 'education'; // Mixed
        }

        return 'general';
    }

    /**
     * Check if the predicted label conflicts with the field's explicit type constraint
     * @private
     */
    _checkValueType(label, field) {
        if (!field) return true;

        // 1. Check HTML input type
        const type = field.type || '';
        if (type === 'date' && !label.includes('date') && !label.includes('dob')) return false;
        if (type === 'email' && !label.includes('email')) return false;
        if (type === 'number' && label.includes('name')) return false;

        // 2. Check value format if available (Sanity Check)
        const val = field.value || '';
        if (val) {
            if (label.includes('email') && !val.includes('@')) return false;
            // Salary must be number-like
            if (label.includes('salary') && /^[a-zA-Z\s]{4,}$/.test(val)) return false;
            // Year must be 4 digits
            if (label.includes('year') && val.length > 0 && !/\d/.test(val)) return false;
        }

        return true;
    }

    /**
     * Get dynamic thresholds based on category
     */
    _getDynamicThresholds(category) {
        // DEFAULT: Trust Neural more (New Policy)
        let config = {
            heuristicThreshold: HybridClassifier.HEURISTIC_STRONG_THRESHOLD,
            neuralThreshold: HybridClassifier.NEURAL_STRONG_THRESHOLD,
            heuristicWeight: 0.3,
            neuralWeight: 0.7
        };

        // ADJUSTMENT 1: Contact Info (Heuristic is still very good, but let's allow Neural to veto if very confident)
        if (category === 'contact') {
            config.heuristicThreshold = 0.90;
            config.neuralThreshold = 0.80;
            config.heuristicWeight = 0.4;
            config.neuralWeight = 0.6;
        }
        // ADJUSTMENT 2: Job Info (Neural is definitely better)
        else if (category === 'job') {
            config.heuristicThreshold = 0.95; // Very hard for heuristic to win
            config.neuralThreshold = 0.60;    // Neural wins easily
            config.heuristicWeight = 0.2;
            config.neuralWeight = 0.8;
        }

        return config;
    }

    /**
     * Extract features (lazy load extractor)
     * @private
     */
    async _extractFeatures(field) {
        const extractor = this._getFeatureExtractor();
        if (!extractor) return [];
        return extractor.extract(field);
    }

    _enrichResult(result, field) {
        return {
            ...result,
            fieldId: field.id || field.name,
            timestamp: new Date().toISOString()
        };
    }

    _recordMetrics(startTime, result) {
        const duration = performance.now() - startTime;
        this._metrics.totalClassifications++;
        this._metrics.averageLatency =
            (this._metrics.averageLatency * (this._metrics.totalClassifications - 1) + duration) / this._metrics.totalClassifications;
    }

    _getFeatureExtractor() {
        if (this._featureExtractor) return this._featureExtractor;
        if (typeof window !== 'undefined' && window.FeatureExtractor) {
            this._featureExtractor = new window.FeatureExtractor();
            return this._featureExtractor;
        }
        return null;
    }

    _getHeuristicEngine() {
        if (this._heuristicEngine) return this._heuristicEngine;
        if (typeof window !== 'undefined' && window.HeuristicEngine) {
            this._heuristicEngine = new window.HeuristicEngine();
            return this._heuristicEngine;
        }
        return null;
    }

    _getNeuralClassifier() {
        if (this._neuralClassifier) return this._neuralClassifier;

        // Prefer V8 if available
        if (typeof window !== 'undefined') {
            if (window.NeuralClassifierV8) {
                this._neuralClassifier = new window.NeuralClassifierV8();
                if (this._debug) console.log('[HybridClassifier] Using NeuralClassifierV8');
                return this._neuralClassifier;
            }
            // Fallback to V7 (legacy)
            if (window.NeuralClassifier) {
                this._neuralClassifier = new window.NeuralClassifier({
                    fieldTypes: window.FieldTypes
                });
                return this._neuralClassifier;
            }
        }
        return null;
    }

    _log(msg) {
        if (this._debug) console.log(`[HybridClassifier] ${msg}`);
    }

    _logError(msg, err) {
        console.error(`[HybridClassifier] ${msg}:`, err);
    }

    _calculateMargin(probabilities, topLabel) {
        if (!probabilities) return 1.0;
        const sorted = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
        if (sorted.length < 2) return 1.0;
        // topLabel might not be sorted[0][0] if something else happened, but usually is
        // We want margin between top1 and top2
        return sorted[0][1] - sorted[1][1];
    }
}

// Export for both Node.js and Browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HybridClassifier;
} else if (typeof window !== 'undefined') {
    window.HybridClassifier = HybridClassifier;
}

