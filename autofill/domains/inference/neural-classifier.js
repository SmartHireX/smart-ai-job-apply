/**
 * NeuralClassifier
 * 
 * Enterprise-grade TinyML inference engine for form field classification.
 * A lightweight 2-layer neural network running in pure JavaScript with zero dependencies.
 * 
 * Architecture:
 *   Input (59 features) → Hidden (20, Leaky ReLU) → Output (46 classes, Softmax)
 * 
 * Features:
 *   - Zero external dependencies
 *   - Sub-millisecond inference time
 *   - Online learning with adaptive learning rate
 *   - L2 regularization for generalization
 *   - Hybrid inference (Heuristics → Neural Network)
 *   - Persistent weight storage via Chrome Storage API
 * 
 * @module NeuralClassifier
 * @version 2.0.0
 * @author SmartHireX AI Team
 */

class NeuralClassifier {

    // ========================================================================
    // STATIC CONFIGURATION
    // ========================================================================

    /** @type {string} Current version for weight compatibility */
    static VERSION = '2.0.0';

    /** @type {number} Model architecture version for storage */
    static MODEL_VERSION = 2;

    /** @type {boolean} Enable debug logging */
    static DEBUG = false;

    // ========================================================================
    // NETWORK ARCHITECTURE CONSTANTS
    // ========================================================================

    /** @type {number} Number of input features from FeatureExtractor */
    static INPUT_SIZE = 59;

    /** @type {number} Number of neurons in first hidden layer */
    static HIDDEN1_SIZE = 32;

    /** @type {number} Number of neurons in second hidden layer */
    static HIDDEN2_SIZE = 16;

    /** @type {number} Dropout probability (0 = disabled, 0.25 = recommended) */
    static DROPOUT_RATE = 0.25;

    /** @type {number} Leaky ReLU negative slope */
    static LEAKY_RELU_ALPHA = 0.01;

    /** @type {number} L2 regularization strength */
    static L2_LAMBDA = 0.01;

    /** @type {number} Base learning rate for SGD */
    static BASE_LEARNING_RATE = 0.05;

    /** @type {number} Confidence threshold for LLM fallback */
    static CONFIDENCE_THRESHOLD = 0.25;

    /** @type {string} Storage key for persisted weights */
    static STORAGE_KEY = 'neural_weights_v3';

    /** @type {boolean} Use optimized TypedArray math kernel */
    static USE_OPTIMIZED_KERNEL = true;

    /** @type {boolean} Use Int8 quantized weights for inference */
    static USE_QUANTIZATION = false;

    /** @type {number} Pruning threshold for weights */
    static PRUNE_THRESHOLD = 0.01;

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

    /**
     * Initialize the NeuralClassifier
     * @param {Object} options - Configuration options
     * @param {boolean} [options.debug=false] - Enable debug logging
     */
    constructor(options = {}) {
        // Configuration
        this._debug = options.debug ?? NeuralClassifier.DEBUG;

        // Feature extractor dependency
        this._featureExtractor = null;

        // Heuristic engine dependency (lazy loaded)
        this._heuristicEngine = null;

        // Field types (lazy loaded)
        this._fieldTypes = null;

        // Network weights (initialized on init())
        // Layer 1: Input → Hidden1 (59 → 32)
        this._W1 = null;  // [INPUT_SIZE x HIDDEN1_SIZE]
        this._b1 = null;  // [HIDDEN1_SIZE]

        // Layer 2: Hidden1 → Hidden2 (32 → 16)
        this._W2 = null;  // [HIDDEN1_SIZE x HIDDEN2_SIZE]
        this._b2 = null;  // [HIDDEN2_SIZE]

        // Layer 3: Hidden2 → Output (16 → OUTPUT_SIZE)
        this._W3 = null;  // [HIDDEN2_SIZE x OUTPUT_SIZE]
        this._b3 = null;  // [OUTPUT_SIZE]

        // Optimized weights (TypedArrays for fast inference)
        this._W1_opt = null;  // Float32Array
        this._b1_opt = null;  // Float32Array
        this._W2_opt = null;  // Float32Array
        this._b2_opt = null;  // Float32Array
        this._W3_opt = null;  // Float32Array
        this._b3_opt = null;  // Float32Array

        // Quantized weights (Int8 for memory efficiency)
        this._W1_quant = null;
        this._W2_quant = null;
        this._W3_quant = null;

        // Math kernel reference
        this._mathKernel = null;

        // Training state
        this._totalSamples = 0;
        this._isInitialized = false;
        this._isTraining = false;  // Toggle for dropout
        this._useOptimized = NeuralClassifier.USE_OPTIMIZED_KERNEL;

        // Performance metrics
        this._metrics = {
            totalPredictions: 0,
            heuristicMatches: 0,
            neuralMatches: 0,
            averageInferenceTime: 0,
            lastInferenceTime: 0,
            memoryReduction: 0,
            sparsity: 0
        };
    }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    /**
     * Initialize the classifier
     * Loads dependencies and weights from storage
     * @returns {Promise<void>}
     */
    async init() {
        if (this._isInitialized) {
            this._log('Already initialized');
            return;
        }

        this._log(`Initializing NeuralClassifier v${NeuralClassifier.VERSION}...`);

        // Load dependencies
        this._loadDependencies();

        // Load weights (priority: user → baseline → random)
        const weightsLoaded = await this._loadWeights();

        if (!weightsLoaded) {
            const baselineLoaded = await this._loadBaselineWeights();

            if (!baselineLoaded) {
                this._initializeRandomWeights();
                this._log('Initialized with random weights (cold start)');
            }
        }

        // Optimize weights for fast inference
        if (this._useOptimized && this._mathKernel) {
            this._optimizeWeightsForInference();
        }

        this._isInitialized = true;
        this._log(`Ready. Output classes: ${this._getOutputSize()}, Optimized: ${this._useOptimized}`);
    }

    /**
     * Load required dependencies
     * @private
     */
    _loadDependencies() {
        // Feature Extractor
        if (typeof window !== 'undefined' && window.FeatureExtractor) {
            this._featureExtractor = new window.FeatureExtractor();
        } else {
            this._log('FeatureExtractor not found, will use empty features');
        }

        // Field Types (try to load, fallback is built-in)
        if (typeof window !== 'undefined' && window.FieldTypes) {
            this._fieldTypes = window.FieldTypes;
            this._log('Using FieldTypes module');
        } else {
            // This is normal on first load - fallback is fully functional
            this._fieldTypes = this._getFallbackFieldTypes();
            this._log('Using built-in field types');
        }

        // Heuristic Engine (optional, lazy-loaded)
        if (typeof window !== 'undefined' && window.HeuristicEngine) {
            this._heuristicEngine = new window.HeuristicEngine({ debug: this._debug });
            this._log('Using HeuristicEngine module');
        }

        // Optimized Math Kernel (for TypedArray operations)
        if (typeof window !== 'undefined' && window.OptimizedMathKernel) {
            this._mathKernel = window.OptimizedMathKernel;
            this._log('Using OptimizedMathKernel for SIMD operations');
        } else {
            this._useOptimized = false;
            this._log('OptimizedMathKernel not found, using standard JS');
        }
    }

    /**
     * Get fallback field types if FieldTypes.js not loaded
     * @private
     * @returns {Object}
     */
    _getFallbackFieldTypes() {
        return {
            ORDERED_CLASSES: [
                'unknown',
                'first_name', 'last_name', 'full_name', 'email', 'phone',
                'linkedin', 'github', 'portfolio', 'website', 'twitter_url',
                'address', 'city', 'state', 'zip_code', 'country',
                'job_title', 'employer_name', 'job_start_date', 'job_end_date', 'work_description', 'job_location',
                'institution_name', 'degree_type', 'field_of_study', 'gpa_score', 'education_start_date', 'education_end_date',
                'gender', 'race', 'veteran', 'disability', 'marital_status',
                'salary_current', 'salary_expected',
                'work_auth', 'sponsorship', 'citizenship', 'clearance', 'legal_age', 'tax_id', 'criminal_record', 'notice_period',
                'referral_source', 'cover_letter', 'generic_question'
            ],
            getFieldTypeIndex: (type) => this._fieldTypes.ORDERED_CLASSES.indexOf(type),
            getFieldTypeFromIndex: (idx) => this._fieldTypes.ORDERED_CLASSES[idx] || 'unknown'
        };
    }

    /**
     * Get the output layer size
     * @private
     * @returns {number}
     */
    _getOutputSize() {
        return this._fieldTypes?.ORDERED_CLASSES?.length || 46;
    }

    /**
     * Get or create HeuristicEngine instance
     * @private
     * @returns {Object|null}
     */
    _getHeuristicEngine() {
        if (!this._heuristicEngine) {
            if (typeof window !== 'undefined' && window.HeuristicEngine) {
                this._heuristicEngine = new window.HeuristicEngine({ debug: this._debug });
            }
        }
        return this._heuristicEngine;
    }

    // ========================================================================
    // PUBLIC API - PREDICTION
    // ========================================================================

    /**
     * Predict the field type for a given form field
     * Uses hybrid approach: Heuristics first, then Neural Network
     * 
     * @param {Object} field - Form field object with attributes
     * @returns {Object} Prediction result { label, confidence, source, features }
     */
    predict(field) {
        const startTime = performance.now();

        // 1. Extract features
        const inputVector = this._featureExtractor?.extract(field) || new Array(NeuralClassifier.INPUT_SIZE).fill(0);

        // 2. Try heuristic classification first (fast path)
        const heuristicResult = this._runHeuristics(field);
        if (heuristicResult) {
            this._recordMetrics(startTime, 'heuristic');
            return {
                label: heuristicResult.label,
                confidence: heuristicResult.confidence,
                source: 'heuristic_hybrid',
                features: inputVector.length
            };
        }

        // 3. Fall back to neural network inference
        if (!this._W1 || !this._W2) {
            this._recordMetrics(startTime, 'none');
            return { label: 'unknown', confidence: 0, source: 'no_weights', features: inputVector.length };
        }

        const { logits } = this._forward(inputVector);
        const probs = this._softmax(logits);

        // 4. Decode prediction
        const maxProb = Math.max(...probs);
        const classIndex = probs.indexOf(maxProb);

        let label = this._fieldTypes.getFieldTypeFromIndex(classIndex);

        // Apply confidence threshold
        if (maxProb < NeuralClassifier.CONFIDENCE_THRESHOLD) {
            label = 'generic_question';  // Fallback to LLM
        }

        this._recordMetrics(startTime, 'neural');

        return {
            label,
            confidence: maxProb,
            source: 'neural_network',
            features: inputVector.length
        };
    }

    /**
     * Run heuristic classification
     * @private
     * @param {Object} field - Form field
     * @returns {Object|null} Result or null if no match
     */
    _runHeuristics(field) {
        const engine = this._getHeuristicEngine();
        if (!engine) return null;

        // Build enriched field object
        const computedLabel = this._featureExtractor?.getComputedLabel(field) || '';
        const enrichedField = {
            ...field,
            label: computedLabel || field.label
        };

        // Delegate to HeuristicEngine
        const result = engine.classify(enrichedField, {
            parentContext: field.parentContext,
            siblingContext: field.siblingContext
        });

        if (result) {
            result.source = 'heuristic_chrome';
        }

        return result;
    }

    // ========================================================================
    // PUBLIC API - TRAINING
    // ========================================================================

    /**
     * Train the model on a single labeled example (online learning)
     * Uses Stochastic Gradient Descent with L2 regularization
     * 
     * @param {Object} field - Form field object
     * @param {string} correctLabel - Ground truth label
     * @returns {Promise<void>}
     */
    async train(field, correctLabel) {
        if (!this._W1 || !this._W2 || !this._W3 || !this._b1 || !this._b2 || !this._b3) {
            this._log('Cannot train: weights not initialized');
            return;
        }

        const targetIndex = this._fieldTypes.getFieldTypeIndex(correctLabel);
        if (targetIndex === -1) {
            this._log(`Unknown label: ${correctLabel}`);
            return;
        }

        // Enable training mode (activates dropout)
        this._isTraining = true;

        // Forward pass with dropout
        const inputs = this._featureExtractor?.extract(field) || [];
        const { logits, hidden1, hidden2, z1, z2 } = this._forward(inputs);
        const probs = this._softmax(logits);

        // Disable training mode
        this._isTraining = false;

        // Adaptive learning rate (decays with experience)
        const learningRate = NeuralClassifier.BASE_LEARNING_RATE * Math.exp(-0.0001 * this._totalSamples);
        this._totalSamples++;

        // Backpropagation through 3 layers
        this._backpropagate(inputs, hidden1, hidden2, z1, z2, probs, targetIndex, learningRate);

        // Auto-save periodically
        if (this._totalSamples % 10 === 0) {
            await this._saveWeights();
        }

        this._log(`Trained on "${correctLabel}" (LR: ${learningRate.toFixed(4)}, Samples: ${this._totalSamples})`);
    }

    /**
     * Perform backpropagation through 3-layer network
     * @private
     */
    _backpropagate(inputs, hidden1, hidden2, z1, z2, probs, targetIndex, learningRate) {
        const outputSize = this._getOutputSize();
        const hidden1Size = NeuralClassifier.HIDDEN1_SIZE;
        const hidden2Size = NeuralClassifier.HIDDEN2_SIZE;
        const lambda = NeuralClassifier.L2_LAMBDA;

        // ============ Output Layer Gradients ============
        const dLogits = new Array(outputSize);
        for (let c = 0; c < outputSize; c++) {
            const target = (c === targetIndex) ? 1 : 0;
            dLogits[c] = probs[c] - target;
        }

        // Update W3 and b3 (Hidden2 → Output)
        for (let h = 0; h < hidden2Size; h++) {
            for (let c = 0; c < outputSize; c++) {
                const gradient = dLogits[c] * hidden2[h] + lambda * this._W3[h][c];
                this._W3[h][c] -= learningRate * gradient;
            }
        }
        for (let c = 0; c < outputSize; c++) {
            this._b3[c] -= learningRate * dLogits[c];
        }

        // ============ Hidden2 Layer Gradients ============
        const dHidden2 = new Array(hidden2Size).fill(0);
        for (let h = 0; h < hidden2Size; h++) {
            for (let c = 0; c < outputSize; c++) {
                dHidden2[h] += dLogits[c] * this._W3[h][c];
            }
            dHidden2[h] *= this._leakyReLUDerivative(z2[h]);
        }

        // Update W2 and b2 (Hidden1 → Hidden2)
        for (let h1 = 0; h1 < hidden1Size; h1++) {
            for (let h2 = 0; h2 < hidden2Size; h2++) {
                const gradient = dHidden2[h2] * hidden1[h1] + lambda * this._W2[h1][h2];
                this._W2[h1][h2] -= learningRate * gradient;
            }
        }
        for (let h = 0; h < hidden2Size; h++) {
            this._b2[h] -= learningRate * dHidden2[h];
        }

        // ============ Hidden1 Layer Gradients ============
        const dHidden1 = new Array(hidden1Size).fill(0);
        for (let h1 = 0; h1 < hidden1Size; h1++) {
            for (let h2 = 0; h2 < hidden2Size; h2++) {
                dHidden1[h1] += dHidden2[h2] * this._W2[h1][h2];
            }
            dHidden1[h1] *= this._leakyReLUDerivative(z1[h1]);
        }

        // Update W1 and b1 (Input → Hidden1)
        for (let i = 0; i < inputs.length; i++) {
            for (let h = 0; h < hidden1Size; h++) {
                if (inputs[i] !== 0) {  // Sparse optimization
                    const gradient = dHidden1[h] * inputs[i] + lambda * this._W1[i][h];
                    this._W1[i][h] -= learningRate * gradient;
                }
            }
        }
        for (let h = 0; h < hidden1Size; h++) {
            this._b1[h] -= learningRate * dHidden1[h];
        }
    }

    // ========================================================================
    // NEURAL NETWORK OPERATIONS
    // ========================================================================

    /**
     * Forward pass through the network (3-layer with dropout)
     * Architecture: Input(59) → Hidden1(32) → Hidden2(16) → Output
     * @private
     * @param {number[]} inputs - Input feature vector
     * @returns {Object} { logits, hidden1, hidden2, z1, z2 }
     */
    _forward(inputs) {
        // Standard forward pass (optimized version disabled for 3-layer)
        return this._forwardStandard(inputs);
    }

    /**
     * Standard 3-layer forward pass with dropout
     * @private
     */
    _forwardStandard(inputs) {
        const hidden1Size = NeuralClassifier.HIDDEN1_SIZE;
        const hidden2Size = NeuralClassifier.HIDDEN2_SIZE;
        const outputSize = this._getOutputSize();

        // ============ Layer 1: Input → Hidden1 (Leaky ReLU + Dropout) ============
        const z1 = new Array(hidden1Size).fill(0);
        for (let h = 0; h < hidden1Size; h++) {
            z1[h] = this._b1[h];
            for (let i = 0; i < inputs.length; i++) {
                z1[h] += inputs[i] * this._W1[i][h];
            }
        }
        let hidden1 = z1.map(z => this._leakyReLU(z));

        // Apply dropout to hidden1 (only during training)
        if (this._isTraining && NeuralClassifier.DROPOUT_RATE > 0) {
            hidden1 = this._applyDropout(hidden1, NeuralClassifier.DROPOUT_RATE);
        }

        // ============ Layer 2: Hidden1 → Hidden2 (Leaky ReLU + Dropout) ============
        const z2 = new Array(hidden2Size).fill(0);
        for (let h = 0; h < hidden2Size; h++) {
            z2[h] = this._b2[h];
            for (let i = 0; i < hidden1Size; i++) {
                z2[h] += hidden1[i] * this._W2[i][h];
            }
        }
        let hidden2 = z2.map(z => this._leakyReLU(z));

        // Apply dropout to hidden2 (only during training)
        if (this._isTraining && NeuralClassifier.DROPOUT_RATE > 0) {
            hidden2 = this._applyDropout(hidden2, NeuralClassifier.DROPOUT_RATE);
        }

        // ============ Layer 3: Hidden2 → Output (Logits) ============
        const logits = new Array(outputSize).fill(0);
        for (let c = 0; c < outputSize; c++) {
            logits[c] = this._b3[c];
            for (let h = 0; h < hidden2Size; h++) {
                logits[c] += hidden2[h] * this._W3[h][c];
            }
        }

        return { logits, hidden1, hidden2, z1, z2 };
    }

    /**
     * Apply dropout to a layer
     * During training: randomly zero out neurons with probability p
     * During inference: scale activations by (1-p) for consistency
     * @private
     * @param {number[]} activations - Layer activations
     * @param {number} dropoutRate - Probability of dropping (0-1)
     * @returns {number[]} Modified activations
     */
    _applyDropout(activations, dropoutRate) {
        if (this._isTraining) {
            // Training: randomly drop neurons, scale survivors
            const scale = 1.0 / (1.0 - dropoutRate);  // Inverted dropout
            return activations.map(a => {
                if (Math.random() < dropoutRate) {
                    return 0;  // Dropped
                }
                return a * scale;  // Scale to maintain expected value
            });
        } else {
            // Inference: no dropout needed (already scaled during training)
            return activations;
        }
    }

    /**
     * Leaky ReLU activation
     * @private
     * @param {number} x - Input value
     * @returns {number}
     */
    _leakyReLU(x) {
        return x > 0 ? x : NeuralClassifier.LEAKY_RELU_ALPHA * x;
    }

    /**
     * Leaky ReLU derivative
     * @private
     * @param {number} x - Pre-activation value
     * @returns {number}
     */
    _leakyReLUDerivative(x) {
        return x > 0 ? 1 : NeuralClassifier.LEAKY_RELU_ALPHA;
    }

    /**
     * Softmax activation
     * @private
     * @param {number[]} logits - Raw network outputs
     * @returns {number[]} Probability distribution
     */
    _softmax(logits) {
        // Use optimized kernel if available
        if (this._useOptimized && this._mathKernel) {
            const logitArray = logits instanceof Float32Array
                ? logits
                : new Float32Array(logits);
            return Array.from(this._mathKernel.softmax(logitArray));
        }

        // Standard softmax
        const maxLogit = Math.max(...logits);  // Numerical stability
        const exps = logits.map(l => Math.exp(l - maxLogit));
        const sumExps = exps.reduce((a, b) => a + b, 0);
        return exps.map(e => e / sumExps);
    }

    // ========================================================================
    // WEIGHT OPTIMIZATION
    // ========================================================================

    /**
     * Optimize weights for fast inference
     * Converts 2D arrays to flattened TypedArrays
     * @private
     */
    _optimizeWeightsForInference() {
        if (!this._W1 || !this._mathKernel) return;

        const inputSize = NeuralClassifier.INPUT_SIZE;
        const hiddenSize = NeuralClassifier.HIDDEN_SIZE;
        const outputSize = this._getOutputSize();

        try {
            // Flatten and convert to Float32Array
            this._W1_opt = this._mathKernel.flatten2D(this._W1);
            this._b1_opt = this._mathKernel.toFloat32(this._b1);
            this._W2_opt = this._mathKernel.flatten2D(this._W2);
            this._b2_opt = this._mathKernel.toFloat32(this._b2);

            // Optional: Prune small weights
            if (NeuralClassifier.PRUNE_THRESHOLD > 0) {
                const pruneResult1 = this._mathKernel.pruneWeights(this._W1_opt, NeuralClassifier.PRUNE_THRESHOLD);
                const pruneResult2 = this._mathKernel.pruneWeights(this._W2_opt, NeuralClassifier.PRUNE_THRESHOLD);

                this._W1_opt = pruneResult1.pruned;
                this._W2_opt = pruneResult2.pruned;
                this._metrics.sparsity = (pruneResult1.sparsity + pruneResult2.sparsity) / 2;
            }

            // Optional: Quantize for memory efficiency
            if (NeuralClassifier.USE_QUANTIZATION) {
                this._W1_quant = this._mathKernel.quantizeWeights(this._W1_opt);
                this._W2_quant = this._mathKernel.quantizeWeights(this._W2_opt);

                // Calculate memory reduction (Float32 -> Int8 = 75% reduction)
                const originalSize = (inputSize * hiddenSize + hiddenSize * outputSize) * 4;
                const quantizedSize = (inputSize * hiddenSize + hiddenSize * outputSize) * 1;
                this._metrics.memoryReduction = ((originalSize - quantizedSize) / originalSize) * 100;
            }

            this._log(`Weights optimized: Sparsity=${(this._metrics.sparsity * 100).toFixed(1)}%, Memory=-${this._metrics.memoryReduction.toFixed(1)}%`);
        } catch (e) {
            console.error('[NeuralClassifier] Weight optimization failed:', e);
            this._useOptimized = false;
        }
    }

    /**
     * Re-optimize weights after training
     * Call this after train() to update optimized weights
     */
    refreshOptimizedWeights() {
        if (this._useOptimized && this._mathKernel) {
            this._optimizeWeightsForInference();
        }
    }

    // ========================================================================
    // WEIGHT MANAGEMENT
    // ========================================================================

    /**
     * Initialize with random weights (He initialization for all layers)
     * Architecture: 59 → 32 → 16 → OUTPUT
     * @private
     */
    _initializeRandomWeights() {
        const inputSize = NeuralClassifier.INPUT_SIZE;
        const hidden1Size = NeuralClassifier.HIDDEN1_SIZE;
        const hidden2Size = NeuralClassifier.HIDDEN2_SIZE;
        const outputSize = this._getOutputSize();

        // W1: Input → Hidden1 (He initialization for ReLU)
        this._W1 = [];
        const heScale1 = Math.sqrt(2.0 / inputSize);
        for (let i = 0; i < inputSize; i++) {
            this._W1[i] = [];
            for (let h = 0; h < hidden1Size; h++) {
                this._W1[i][h] = (Math.random() - 0.5) * 2 * heScale1;
            }
        }
        this._b1 = new Array(hidden1Size).fill(0);

        // W2: Hidden1 → Hidden2 (He initialization for ReLU)
        this._W2 = [];
        const heScale2 = Math.sqrt(2.0 / hidden1Size);
        for (let h1 = 0; h1 < hidden1Size; h1++) {
            this._W2[h1] = [];
            for (let h2 = 0; h2 < hidden2Size; h2++) {
                this._W2[h1][h2] = (Math.random() - 0.5) * 2 * heScale2;
            }
        }
        this._b2 = new Array(hidden2Size).fill(0);

        // W3: Hidden2 → Output (Xavier initialization for Softmax)
        this._W3 = [];
        const xavierScale = Math.sqrt(1.0 / hidden2Size);
        for (let h2 = 0; h2 < hidden2Size; h2++) {
            this._W3[h2] = [];
            for (let c = 0; c < outputSize; c++) {
                this._W3[h2][c] = (Math.random() - 0.5) * 2 * xavierScale;
            }
        }
        this._b3 = new Array(outputSize).fill(0);

        this._log(`Weights initialized: ${inputSize} → ${hidden1Size} → ${hidden2Size} → ${outputSize}`);
    }

    /**
     * Load weights from Chrome storage
     * @private
     * @returns {Promise<boolean>}
     */
    async _loadWeights() {
        try {
            const result = await chrome.storage.local.get(NeuralClassifier.STORAGE_KEY);
            const data = result[NeuralClassifier.STORAGE_KEY];

            // Version 3: 3-layer architecture
            if (data && data.version === 3 && data.W1 && data.W2 && data.W3) {
                this._W1 = data.W1;
                this._b1 = data.b1;
                this._W2 = data.W2;
                this._b2 = data.b2;
                this._W3 = data.W3;
                this._b3 = data.b3;
                this._totalSamples = data.totalSamples || 0;
                this._log(`Loaded v3 weights (${this._totalSamples} samples)`);
                return true;
            }

            // Version 1 or 2: Old architecture, reinitialize
            if (data?.version === 1 || data?.version === 2) {
                this._log(`Found v${data.version} weights, reinitializing to v3 (3-layer)`);
                return false;
            }
        } catch (e) {
            console.error('[NeuralClassifier] Failed to load weights:', e);
        }
        return false;
    }

    /**
     * Load baseline weights bundled with extension
     * @private
     * @returns {Promise<boolean>}
     */
    async _loadBaselineWeights() {
        try {
            const baselineUrl = chrome.runtime.getURL('autofill/domains/inference/model_v3_baseline.json');
            const response = await fetch(baselineUrl);

            if (!response.ok) {
                this._log('Baseline weights not found');
                return false;
            }

            const data = await response.json();

            if (data.version === 3 && data.W1 && data.W2 && data.W3) {
                this._W1 = data.W1;
                this._b1 = data.b1;
                this._W2 = data.W2;
                this._b2 = data.b2;
                this._W3 = data.W3;
                this._b3 = data.b3;
                this._totalSamples = 0;
                this._log(`Loaded baseline weights (trained on ${data.metadata?.trainingExamples || 'N/A'} examples)`);
                return true;
            }
        } catch (e) {
            console.error('[NeuralClassifier] Failed to load baseline weights:', e);
        }
        return false;
    }

    /**
     * Save weights to Chrome storage
     * @private
     * @returns {Promise<void>}
     */
    async _saveWeights() {
        try {
            const payload = {
                W1: this._W1,
                b1: this._b1,
                W2: this._W2,
                b2: this._b2,
                W3: this._W3,
                b3: this._b3,
                totalSamples: this._totalSamples,
                version: 3,
                timestamp: Date.now()
            };
            await chrome.storage.local.set({ [NeuralClassifier.STORAGE_KEY]: payload });
        } catch (e) {
            console.error('[NeuralClassifier] Failed to save weights:', e);
        }
    }

    // ========================================================================
    // METRICS & UTILITIES
    // ========================================================================

    /**
     * Record performance metrics
     * @private
     * @param {number} startTime - Performance.now() start time
     * @param {string} source - Classification source (heuristic/neural/none)
     */
    _recordMetrics(startTime, source) {
        const elapsed = performance.now() - startTime;

        this._metrics.totalPredictions++;
        this._metrics.lastInferenceTime = elapsed;

        if (source === 'heuristic') {
            this._metrics.heuristicMatches++;
        } else if (source === 'neural') {
            this._metrics.neuralMatches++;
        }

        // Running average
        const n = this._metrics.totalPredictions;
        this._metrics.averageInferenceTime += (elapsed - this._metrics.averageInferenceTime) / n;
    }

    /**
     * Get performance metrics
     * @returns {Object}
     */
    getMetrics() {
        return {
            ...this._metrics,
            totalSamples: this._totalSamples,
            isInitialized: this._isInitialized
        };
    }

    /**
     * Get the list of supported field types
     * @returns {string[]}
     */
    getClasses() {
        return this._fieldTypes?.ORDERED_CLASSES || [];
    }

    /**
     * Reset training state and weights
     * @returns {Promise<void>}
     */
    async reset() {
        this._initializeRandomWeights();
        this._totalSamples = 0;
        await chrome.storage.local.remove(NeuralClassifier.STORAGE_KEY);
        this._log('Reset to random weights');
    }

    /**
     * Debug logging helper
     * @private
     * @param {...any} args - Log arguments
     */
    _log(...args) {
        if (this._debug) {
            console.log('[NeuralClassifier]', ...args);
        }
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof window !== 'undefined') {
    window.NeuralClassifier = NeuralClassifier;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NeuralClassifier;
}
