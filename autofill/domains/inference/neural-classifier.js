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
 *   - Pure neural network inference (no dependencies)
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
    static VERSION = '5.0.0';  // V5: 3-layer architecture [512,256,128]

    /** @type {number} Model architecture version for storage */
    static MODEL_VERSION = 5;

    /** @type {boolean} Enable debug logging */
    static DEBUG = false;

    // ========================================================================
    // NETWORK ARCHITECTURE CONSTANTS
    // ========================================================================

    /** @type {number} Number of input features from FeatureExtractor */
    static INPUT_SIZE = 84;  // 79 base + 5 semantic similarity

    /** @type {number} Number of neurons in first hidden layer */
    static HIDDEN1_SIZE = 512;  // Increased from 128 for better capacity

    /** @type {number} Number of neurons in second hidden layer */
    static HIDDEN2_SIZE = 256;  // Increased from 64

    /** @type {number} Number of neurons in third hidden layer (NEW) */
    static HIDDEN3_SIZE = 128;  // NEW: Additional layer for deeper learning

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
    static STORAGE_KEY = 'neural_weights_v4';

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
     * Initialize Neural Classifier
     * @param {Object} config - Configuration options
     */
    constructor(config = {}) {
        this._debug = config.debug || NeuralClassifier.DEBUG;
        this._isTraining = false;
        this._totalSamples = 0;

        // Initialize dependencies (support both window and node)
        if (config.featureExtractor) {
            this._featureExtractor = config.featureExtractor;
        } else if (typeof FeatureExtractor !== 'undefined') {
            this._featureExtractor = new FeatureExtractor();
        } else if (typeof window !== 'undefined' && window.FeatureExtractor) {
            this._featureExtractor = new window.FeatureExtractor();
        }

        if (config.fieldTypes) {
            this._fieldTypes = config.fieldTypes;
        } else if (typeof FieldTypes !== 'undefined') {
            this._fieldTypes = FieldTypes;
        } else if (typeof window !== 'undefined' && window.FieldTypes) {
            this._fieldTypes = window.FieldTypes;
        }

        // Initialize empty weights (will be loaded or randomized)
        this._W1 = null;
        this._b1 = null;
        this._W2 = null;
        this._b2 = null;
        this._W3 = null;  // Hidden2 -> Hidden3
        this._b3 = null;
        this._W4 = null;  // Hidden3 -> Output
        this._b4 = null;

        // Initialize random weights by default (88 classes)
        this._initializeRandomWeights();
    }

    // ========================================================================
    // PUBLIC API - PREDICTION
    // ========================================================================

    /**
     * Predict label for a field
     * @param {Object|Array} input - Field object or features array
     * @returns {Promise<Object>} Prediction result { label, confidence }
     */
    async predict(input) {
        if (!this._W1) return { label: 'unknown', confidence: 0 };

        // Support both field object and features array
        const features = Array.isArray(input) ? input : (this._featureExtractor?.extract(input) || []);

        // Forward pass
        const { logits } = this._forward(features);
        const probs = this._softmax(logits);

        // Find max probability
        let maxProb = -1;
        let maxIndex = -1;
        for (let i = 0; i < probs.length; i++) {
            if (probs[i] > maxProb) {
                maxProb = probs[i];
                maxIndex = i;
            }
        }

        const label = this._fieldTypes.getFieldTypeFromIndex(maxIndex);
        return {
            label: label || 'unknown',
            confidence: maxProb
        };
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
        // console.log('[TRAIN] Training on:', correctLabel);
        if (!this._W1 || !this._W2 || !this._W3 || !this._W4 || !this._b1 || !this._b2 || !this._b3 || !this._b4) {
            console.log('[TRAIN] Cannot train: weights not initialized');
            this._log('Cannot train: weights not initialized');
            return;
        }

        const targetIndex = this._fieldTypes.getFieldTypeIndex(correctLabel);
        if (targetIndex === -1) {
            console.log(`[TRAIN] Unknown label: ${correctLabel}`);
            this._log(`Unknown label: ${correctLabel}`);
            return;
        }

        // Debug inputs
        const inputs = Array.isArray(field) ? field : (this._featureExtractor?.extract(field) || []);
        if (inputs.length === 0) {
            console.log('[TRAIN] Inputs empty!');
        }

        // Enable training mode (activates dropout)
        this._isTraining = true;

        // Forward pass with dropout
        // Support both field object and features array
        // Input validation handled above (lines 151-154)
        const { logits, hidden1, hidden2, hidden3, z1, z2, z3 } = this._forward(inputs);  // NEW: added hidden3, z3
        const probs = this._softmax(logits);

        // Disable training mode
        this._isTraining = false;

        // Adaptive learning rate (decays with experience)
        const learningRate = NeuralClassifier.BASE_LEARNING_RATE * Math.exp(-0.0001 * this._totalSamples);
        this._totalSamples++;

        // Backpropagation through 4 layers (3 hidden + output)
        this._backpropagate(inputs, hidden1, hidden2, hidden3, z1, z2, z3, probs, targetIndex, learningRate);

        // Auto-save periodically
        if (this._totalSamples % 10 === 0) {
            await this._saveWeights();
        }

        this._log(`Trained on "${correctLabel}" (LR: ${learningRate.toFixed(4)}, Samples: ${this._totalSamples})`);
    }

    /**
     * Perform backpropagation through 4-layer network (3 hidden + output)
     * @private
     */
    _backpropagate(inputs, hidden1, hidden2, hidden3, z1, z2, z3, probs, targetIndex, learningRate) {
        const outputSize = this._fieldTypes?.getClassCount?.() || 88;  // 88 classes verified
        const hidden1Size = NeuralClassifier.HIDDEN1_SIZE;
        const hidden2Size = NeuralClassifier.HIDDEN2_SIZE;
        const hidden3Size = NeuralClassifier.HIDDEN3_SIZE;  // NEW
        const lambda = NeuralClassifier.L2_LAMBDA;

        // ============ Output Layer Gradients ============
        const dLogits = new Array(outputSize);
        for (let c = 0; c < outputSize; c++) {
            const target = (c === targetIndex) ? 1 : 0;
            dLogits[c] = probs[c] - target;
        }

        // Update W4 and b4 (Hidden3 → Output) **RENAMED FROM W3**
        for (let h = 0; h < hidden3Size; h++) {
            for (let c = 0; c < outputSize; c++) {
                const gradient = dLogits[c] * hidden3[h] + lambda * this._W4[h][c];
                this._W4[h][c] -= learningRate * gradient;
            }
        }
        for (let c = 0; c < outputSize; c++) {
            this._b4[c] -= learningRate * dLogits[c];
        }

        // ============ Hidden3 Layer Gradients **NEW** ============
        const dHidden3 = new Array(hidden3Size).fill(0);
        for (let h = 0; h < hidden3Size; h++) {
            for (let c = 0; c < outputSize; c++) {
                dHidden3[h] += dLogits[c] * this._W4[h][c];
            }
            dHidden3[h] *= this._leakyReLUDerivative(z3[h]);
        }

        // Update W3 and b3 (Hidden2 → Hidden3)
        for (let h2 = 0; h2 < hidden2Size; h2++) {
            for (let h3 = 0; h3 < hidden3Size; h3++) {
                const gradient = dHidden3[h3] * hidden2[h2] + lambda * this._W3[h2][h3];
                this._W3[h2][h3] -= learningRate * gradient;
            }
        }
        for (let h = 0; h < hidden3Size; h++) {
            this._b3[h] -= learningRate * dHidden3[h];
        }

        // ============ Hidden2 Layer Gradients ============
        const dHidden2 = new Array(hidden2Size).fill(0);
        for (let h = 0; h < hidden2Size; h++) {
            for (let h3 = 0; h3 < hidden3Size; h3++) {
                dHidden2[h] += dHidden3[h3] * this._W3[h][h3];
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
        const hidden3Size = NeuralClassifier.HIDDEN3_SIZE;  // NEW
        const outputSize = this._fieldTypes?.getClassCount?.() || 88;  // 88 classes verified

        // Validate input size
        const expectedInputSize = NeuralClassifier.INPUT_SIZE;
        if (inputs.length !== expectedInputSize) {
            console.error(`[ERROR] Input size mismatch: got ${inputs.length}, expected ${expectedInputSize}`);
            console.error(`[ERROR] First few inputs:`, inputs.slice(0, 10));
            throw new Error(`Input size mismatch: ${inputs.length} != ${expectedInputSize}`);
        }

        // ============ Layer 1: Input → Hidden1 (Leaky ReLU + Dropout) ============
        const z1 = new Array(hidden1Size).fill(0);
        for (let h = 0; h < hidden1Size; h++) {
            z1[h] = this._b1[h];
            for (let i = 0; i < expectedInputSize; i++) {  // Use expectedInputSize instead of inputs.length
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

        // ============ Layer 3: Hidden2 → Hidden3 (Leaky ReLU + Dropout) **NEW** ============
        const z3 = new Array(hidden3Size).fill(0);
        for (let h = 0; h < hidden3Size; h++) {
            z3[h] = this._b3[h];
            for (let i = 0; i < hidden2Size; i++) {
                z3[h] += hidden2[i] * this._W3[i][h];
            }
        }
        let hidden3 = z3.map(z => this._leakyReLU(z));

        // Apply dropout to hidden3 (only during training)
        if (this._isTraining && NeuralClassifier.DROPOUT_RATE > 0) {
            hidden3 = this._applyDropout(hidden3, NeuralClassifier.DROPOUT_RATE);
        }

        // ============ Layer 4: Hidden3 → Output (Logits) **RENAMED** ============
        const logits = new Array(outputSize).fill(0);
        for (let c = 0; c < outputSize; c++) {
            logits[c] = this._b4[c];
            for (let h = 0; h < hidden3Size; h++) {
                logits[c] += hidden3[h] * this._W4[h][c];
            }
        }

        return { logits, hidden1, hidden2, hidden3, z1, z2, z3 };
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
        const outputSize = this._fieldTypes?.getClassCount?.() || 88;  // 88 classes verified

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
        const hidden3Size = NeuralClassifier.HIDDEN3_SIZE || 128;  // Fallback to 128
        const outputSize = this._fieldTypes?.getClassCount?.() || 88;  // 88 classes verified

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

        // W3: Hidden2 → Hidden3 (He initialization for ReLU) **NEW LAYER**
        this._W3 = [];
        const heScale3 = Math.sqrt(2.0 / hidden2Size);
        for (let h2 = 0; h2 < hidden2Size; h2++) {
            this._W3[h2] = [];
            for (let h3 = 0; h3 < hidden3Size; h3++) {
                this._W3[h2][h3] = (Math.random() - 0.5) * 2 * heScale3;
            }
        }
        this._b3 = new Array(hidden3Size).fill(0);

        // W4: Hidden3 → Output (Xavier initialization for Softmax) **RENAMED FROM W3**
        this._W4 = [];
        const xavierScale = Math.sqrt(1.0 / hidden3Size);
        for (let h3 = 0; h3 < hidden3Size; h3++) {
            this._W4[h3] = [];
            for (let c = 0; c < outputSize; c++) {
                this._W4[h3][c] = (Math.random() - 0.5) * 2 * xavierScale;
            }
        }
        this._b4 = new Array(outputSize).fill(0);

        console.log('[DEBUG] Weights initialized:');
        console.log(`  W1: ${this._W1?.length || 0} x ${this._W1?.[0]?.length || 0}`);
        console.log(`  W2: ${this._W2?.length || 0} x ${this._W2?.[0]?.length || 0}`);
        console.log(`  W3: ${this._W3?.length || 0} x ${this._W3?.[0]?.length || 0}`);
        console.log(`  W4: ${this._W4?.length || 0} x ${this._W4?.[0]?.length || 0}`);

        this._log(`Weights initialized: ${inputSize} → ${hidden1Size} → ${hidden2Size} → ${hidden3Size} → ${outputSize}`);
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

            // Version 4: 3-layer architecture with 107 output classes
            if (data && data.version === 4 && data.W1 && data.W2 && data.W3) {
                this._W1 = data.W1;
                this._b1 = data.b1;
                this._W2 = data.W2;
                this._b2 = data.b2;
                this._W3 = data.W3;
                this._b3 = data.b3;
                this._totalSamples = data.totalSamples || 0;
                this._log(`Loaded v4 weights (${this._totalSamples} samples, ${data.W3[0]?.length || 107} classes)`);
                return true;
            }

            // Version 1, 2, or 3: Old architecture, reinitialize for 107 classes
            if (data?.version === 1 || data?.version === 2 || data?.version === 3) {
                this._log(`Found v${data.version} weights, reinitializing to v4 (107 classes)`);
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
            const baselineUrl = chrome.runtime.getURL('autofill/domains/inference/model_v4_baseline.json');
            const response = await fetch(baselineUrl);

            if (!response.ok) {
                this._log('Baseline weights not found, using random initialization');
                return false;
            }

            const data = await response.json();

            if (data.version === 4 &&
                data.W1 && data.W1.length > 0 &&
                data.W2 && data.W2.length > 0 &&
                data.W3 && data.W3.length > 0) {
                this._W1 = data.W1;
                this._b1 = data.b1;
                this._W2 = data.W2;
                this._b2 = data.b2;
                this._W3 = data.W3;
                this._b3 = data.b3;
                this._totalSamples = 0;
                this._log(`Loaded baseline weights (trained on ${data.metadata?.trainingExamples || 'N/A'} examples)`);
                return true;
            } else {
                this._log('Baseline weights empty or invalid version, skipping.');
            }
        } catch (e) {
            console.error('[NeuralClassifier] Failed to load baseline weights:', e);
        }
        return false;
    }

    /**
     * Export current weights for persistence (used by training scripts)
     * @returns {Object} Weight object
     */
    exportWeights() {
        return {
            version: 4,
            W1: this._W1,
            b1: this._b1,
            W2: this._W2,
            b2: this._b2,
            W3: this._W3,
            b3: this._b3,
            totalSamples: this._totalSamples,
            timestamp: Date.now()
        };
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
                version: 4,
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
