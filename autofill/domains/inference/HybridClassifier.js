/**
 * HybridClassifier
 * 
 * Enterprise-grade ensemble classifier that orchestrates multiple classification strategies.
 * Combines HeuristicEngine (pattern-based) and NeuralClassifier (ML-based) for optimal accuracy.
 * 
 * Architecture:
 *   HeuristicEngine (Fast, High Precision) → 
 *   NeuralClassifier (Context-Aware) → 
 *   Ensemble Arbitration (5-Tier Decision System)
 * 
 * Features:
 *   - 5-tier arbitration strategy for conflict resolution
 *   - Confidence-based routing (heuristic for obvious, neural for ambiguous)
 *   - Unanimous agreement boost (99% confidence when both agree)
 *   - Weighted voting for disagreements
 *   - Performance metrics and source tracking
 *   - Lazy-loading of dependencies
 * 
 * @module HybridClassifier
 * @version 1.0.0
 * @author SmartHireX AI Team
 */

class HybridClassifier {

    // ========================================================================
    // STATIC CONFIGURATION
    // ========================================================================

    /** @type {string} Current version */
    static VERSION = '1.0.0';

    /** @type {boolean} Enable debug logging */
    static DEBUG = false;

    // Arbitration thresholds
    static HEURISTIC_STRONG_THRESHOLD = 0.95;  // Trust heuristic above this
    static NEURAL_STRONG_THRESHOLD = 0.85;     // Trust neural if heuristic weak
    static HEURISTIC_WEAK_THRESHOLD = 0.80;    // Heuristic considered weak below this
    static UNANIMOUS_CONFIDENCE = 0.99;         // Boost when both agree

    // Weighted voting ratios (when disagreeing)
    // Weighted voting ratios (when disagreeing)
    static HEURISTIC_WEIGHT = 0.4;  // Heuristic weight lower due to lower base accuracy (78%)
    static NEURAL_WEIGHT = 0.6;     // Neural weight higher due to improved V7 accuracy (86%)

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

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

    // ========================================================================
    // PUBLIC API - CLASSIFICATION
    // ========================================================================

    /**
     * Classify a form field using hybrid ensemble approach
     * @param {Object} field - Form field object with attributes (name, id, placeholder, etc.)
     * @returns {Promise<Object>} Classification result
     */
    async classify(field) {
        const startTime = performance.now();

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
     * Classify multiple fields in batch
     * @param {Array<Object>} fields - Array of form field objects
     * @returns {Promise<Array<Object>>} Array of classification results
     */
    async classifyBatch(fields) {
        return Promise.all(fields.map(field => this.classify(field)));
    }

    // ========================================================================
    // PRIVATE METHODS - FEATURE EXTRACTION
    // ========================================================================

    /**
     * Extract features from field
     * @private
     */
    async _extractFeatures(field) {
        const extractor = this._getFeatureExtractor();
        if (!extractor) {
            this._log('Warning: FeatureExtractor not available, using minimal features');
            return this._buildMinimalFeatures(field);
        }

        return extractor.extract(field);
    }

    /**
     * Build minimal feature set when FeatureExtractor unavailable
     * @private
     */
    _buildMinimalFeatures(field) {
        // Basic features from field attributes
        return {
            name: field.name || '',
            id: field.id || '',
            placeholder: field.placeholder || '',
            label: field.label || '',
            type: field.type || 'text'
        };
    }

    // ========================================================================
    // PRIVATE METHODS - CLASSIFIER EXECUTION
    // ========================================================================

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
                label: result?.type || 'unknown',
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

    // ========================================================================
    // PRIVATE METHODS - ARBITRATION (5-TIER SYSTEM)
    // ========================================================================

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
        // (Lower threshold for Contact/Identity, Higher for Job/Edu)
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
        // Trust Neural if above category-specific threshold and Heuristic is weak
        // (Lower threshold for Job/Edu, Higher for Contact/Identity)
        if (nLabel !== 'unknown' &&
            nConf > neuralThreshold &&
            hConf < HybridClassifier.HEURISTIC_WEAK_THRESHOLD) {
            this._metrics.neuralWins++;
            return {
                label: nLabel,
                confidence: nConf,
                source: 'ensemble_neural_strong',
                agreementType: 'neural_override',
                heuristicLabel: hLabel,
                heuristicConfidence: hConf
            };
        }

        // ========== TIER 4: WEIGHTED VOTE ==========
        // Both found something but disagree - calculate weighted scores
        if (hLabel !== 'unknown' && nLabel !== 'unknown') {
            this._metrics.weightedVotes++;

            // Use Dynamic Weights
            const hScore = hConf * heuristicWeight;
            const nScore = nConf * neuralWeight;

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
     * Get dynamic arbitration thresholds based on field category
     * @private
     */
    _getDynamicThresholds(category) {
        // Defaults
        let heuristicThreshold = HybridClassifier.HEURISTIC_STRONG_THRESHOLD; // 0.95
        let neuralThreshold = HybridClassifier.NEURAL_STRONG_THRESHOLD;       // 0.85
        let heuristicWeight = HybridClassifier.HEURISTIC_WEIGHT;              // 0.4
        let neuralWeight = HybridClassifier.NEURAL_WEIGHT;                    // 0.6

        switch (category) {
            // PATTERN-HEAVY FIELDS: Trust Heuristics More
            case 'contact':
            case 'identity':
            case 'online_presence':
            case 'location':
                heuristicThreshold = 0.85; // Lower h-bar (Regex is reliable)
                neuralThreshold = 0.90;    // Raise n-bar (Neural struggles with exact strings)
                heuristicWeight = 0.7;     // Bias voting to heuristic
                neuralWeight = 0.3;
                break;

            // CONTEXT-HEAVY FIELDS: Trust Neural More
            case 'work_experience':
            case 'education':
            case 'skills':
            case 'availability':
                heuristicThreshold = 0.98; // Raise h-bar (Hard to regex job descriptions)
                neuralThreshold = 0.75;    // Lower n-bar (Neural excels at context)
                heuristicWeight = 0.4;     // Bias voting to neural
                neuralWeight = 0.6;
                break;

            default:
                // Keep defaults for misc/unknown
                break;
        }

        return { heuristicThreshold, neuralThreshold, heuristicWeight, neuralWeight };
    }

    // ========================================================================
    // PRIVATE METHODS - RESULT ENRICHMENT
    // ========================================================================

    /**
     * Enrich final result with additional metadata
     * @private
     */
    _enrichResult(result, field) {
        // Add group/category information
        const groupType = this._getGroupType(result.label);

        return {
            ...result,
            group_type: groupType,
            field_name: field.name || field.id || 'unknown',
            timestamp: Date.now()
        };
    }

    /**
     * Get field group/category
     * @private
     */
    _getGroupType(label) {
        // This should ideally come from FieldTypes
        // For now, return a default
        if (typeof FieldTypes !== 'undefined' && FieldTypes.getCategoryForField) {
            return FieldTypes.getCategoryForField(label) || 'misc';
        }
        return 'misc';
    }

    // ========================================================================
    // PRIVATE METHODS - DEPENDENCY MANAGEMENT
    // ========================================================================

    /**
     * Lazy-load HeuristicEngine
     * @private
     */
    _getHeuristicEngine() {
        if (this._heuristicEngine) {
            return this._heuristicEngine;
        }

        // Try to load from global scope (browser)
        if (typeof HeuristicEngine !== 'undefined') {
            this._heuristicEngine = new HeuristicEngine();
            this._log('HeuristicEngine lazy-loaded from global scope');
            return this._heuristicEngine;
        }

        // Try to require (Node.js)
        try {
            const HeuristicEngineClass = require('./HeuristicEngine.js');
            this._heuristicEngine = new HeuristicEngineClass();
            this._log('HeuristicEngine lazy-loaded via require');
            return this._heuristicEngine;
        } catch (e) {
            this._log('Warning: HeuristicEngine not available');
            return null;
        }
    }

    /**
     * Lazy-load NeuralClassifier
     * @private
     */
    _getNeuralClassifier() {
        if (this._neuralClassifier) {
            return this._neuralClassifier;
        }

        // Try to load from global scope (browser)
        if (typeof NeuralClassifier !== 'undefined') {
            this._neuralClassifier = new NeuralClassifier();
            this._log('NeuralClassifier lazy-loaded from global scope');
            return this._neuralClassifier;
        }

        // Try to require (Node.js)
        try {
            const NeuralClassifierClass = require('./neural-classifier.js');
            this._neuralClassifier = new NeuralClassifierClass();
            this._log('NeuralClassifier lazy-loaded via require');
            return this._neuralClassifier;
        } catch (e) {
            this._log('Warning: NeuralClassifier not available');
            return null;
        }
    }

    /**
     * Lazy-load FeatureExtractor
     * @private
     */
    _getFeatureExtractor() {
        if (this._featureExtractor) {
            return this._featureExtractor;
        }

        // Try to load from global scope
        if (typeof FeatureExtractor !== 'undefined') {
            this._featureExtractor = new FeatureExtractor();
            this._log('FeatureExtractor lazy-loaded from global scope');
            return this._featureExtractor;
        }

        // Try to require
        try {
            const FeatureExtractorClass = require('./feature-extractor.js');
            this._featureExtractor = new FeatureExtractorClass();
            this._log('FeatureExtractor lazy-loaded via require');
            return this._featureExtractor;
        } catch (e) {
            this._log('Warning: FeatureExtractor not available');
            return null;
        }
    }

    // ========================================================================
    // PRIVATE METHODS - METRICS & LOGGING
    // ========================================================================

    /**
     * Record performance metrics
     * @private
     */
    _recordMetrics(startTime, result) {
        const latency = performance.now() - startTime;
        this._metrics.totalClassifications++;

        // Update rolling average latency
        const n = this._metrics.totalClassifications;
        this._metrics.averageLatency =
            (this._metrics.averageLatency * (n - 1) + latency) / n;

        this._log(`Classification complete: ${result.label} (${result.source}) in ${latency.toFixed(2)}ms`);
    }

    /**
     * Get performance metrics
     * @returns {Object} Performance statistics
     */
    getMetrics() {
        const total = this._metrics.totalClassifications || 1; // Prevent division by zero

        return {
            ...this._metrics,
            heuristicWinRate: (this._metrics.heuristicWins / total * 100).toFixed(2) + '%',
            neuralWinRate: (this._metrics.neuralWins / total * 100).toFixed(2) + '%',
            unanimousRate: (this._metrics.unanimousAgreements / total * 100).toFixed(2) + '%',
            weightedVoteRate: (this._metrics.weightedVotes / total * 100).toFixed(2) + '%'
        };
    }

    /**
     * Reset metrics
     */
    resetMetrics() {
        this._metrics = {
            totalClassifications: 0,
            heuristicWins: 0,
            neuralWins: 0,
            unanimousAgreements: 0,
            weightedVotes: 0,
            averageLatency: 0
        };
    }

    /**
     * Debug logging
     * @private
     */
    _log(message) {
        if (this._debug) {
            console.log(`[HybridClassifier] ${message}`);
        }
    }

    /**
     * Error logging
     * @private
     */
    _logError(message, error) {
        console.error(`[HybridClassifier] ${message}:`, error);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof window !== 'undefined') {
    window.HybridClassifier = HybridClassifier;
    console.log('[Dependencies] HybridClassifier V1.0 loaded into window');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = HybridClassifier;
}
