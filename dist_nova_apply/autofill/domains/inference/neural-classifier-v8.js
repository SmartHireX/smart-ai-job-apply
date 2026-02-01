/**
 * NeuralClassifier V8 - Multi-Label Implementation
 * 
 * Major architectural shift from V7 (Softmax) to V8 (Sigmoid Multi-label):
 * - Removes Batch Normalization (causes instability with small batches/noise)
 * - Removes Dropout (simplified for Phase 1)
 * - Uses LeakyReLU activations with He Initialization
 * - Outputs independent Sigmoid probabilities for each class
 * - Inference uses a calibrated threshold (0.35) for multi-label detection
 * 
 * Architecture: Input(95) → Dense(256) → LeakyReLU → Dense(128) → LeakyReLU → Dense(88) → Sigmoid
 * 
 * @module NeuralClassifierV8
 * @version 8.0.0
 * @author SmartHireX AI Team
 */

class NeuralClassifierV8 {

    // ========================================================================
    // VERSION & CONFIGURATION
    // ========================================================================

    static VERSION = '8.0.0';
    static MODEL_VERSION = 8;

    // Network Architecture
    static INPUT_SIZE = 95;      // V3 features: 86 keywords + 9 structural
    static HIDDEN1_SIZE = 256;
    static HIDDEN2_SIZE = 128;
    static OUTPUT_SIZE = 87;     // Number of field type classes (Reduced: work_style removed)

    // Training Hyperparameters
    static BATCH_SIZE = 32;
    static BASE_LEARNING_RATE = 0.001;   // Increased from 0.0002 for V8
    static LEAKY_RELU_ALPHA = 0.01;
    static L2_LAMBDA = 0.0001;
    static GRADIENT_CLIP_NORM = 1.0;

    // Inference Thresholds
    static CONFIDENCE_THRESHOLD = 0.35; // Lower threshold to catch ambiguous fields

    // Adam Optimizer Parameters
    static ADAM_BETA1 = 0.9;
    static ADAM_BETA2 = 0.999;
    static ADAM_EPSILON = 1e-8;

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

    constructor(config = {}) {
        this._debug = config.debug || false;
        this._isTraining = false;

        // Initialize FieldTypes for class mapping
        if (config.fieldTypes) {
            this._fieldTypes = config.fieldTypes;
        } else if (typeof FieldTypes !== 'undefined') {
            this._fieldTypes = FieldTypes;
        }

        // Weight matrices
        this._W1 = null;  // Input → Hidden1
        this._b1 = null;
        this._W2 = null;  // Hidden1 → Hidden2
        this._b2 = null;
        this._W3 = null;  // Hidden2 → Output
        this._b3 = null;

        // Adam optimizer state
        this._adamState = null;

        this._log('NeuralClassifier V8 (Multi-Label) initialized');
    }

    get isReady() {
        return this._W1 !== null;
    }

    // ========================================================================
    // WEIGHT INITIALIZATION (He Normal)
    // ========================================================================

    _initializeWeights() {
        const inputSize = NeuralClassifierV8.INPUT_SIZE;
        const hidden1Size = NeuralClassifierV8.HIDDEN1_SIZE;
        const hidden2Size = NeuralClassifierV8.HIDDEN2_SIZE;
        const outputSize = this._fieldTypes?.ORDERED_CLASSES?.length || NeuralClassifierV8.OUTPUT_SIZE;

        // Helper: Gaussian random with Box-Muller transform
        const gaussianRandom = (mean = 0, stddev = 1) => {
            const u1 = Math.random();
            const u2 = Math.random();
            const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
            return z0 * stddev + mean;
        };

        // He initialization for LeakyReLU
        const alpha = NeuralClassifierV8.LEAKY_RELU_ALPHA;
        const heScale1 = Math.sqrt(2.0 / (1 + alpha * alpha) / inputSize);
        const heScale2 = Math.sqrt(2.0 / (1 + alpha * alpha) / hidden1Size);

        // Xavier/Glorot for Sigmoid output (Fan-avg)
        const xavierScale = Math.sqrt(2.0 / (hidden2Size + outputSize));

        // W1: Input → Hidden1
        this._W1 = [];
        for (let i = 0; i < inputSize; i++) {
            this._W1[i] = [];
            for (let h = 0; h < hidden1Size; h++) {
                this._W1[i][h] = gaussianRandom(0, heScale1);
            }
        }
        this._b1 = new Array(hidden1Size).fill(0.01);

        // W2: Hidden1 → Hidden2
        this._W2 = [];
        for (let h1 = 0; h1 < hidden1Size; h1++) {
            this._W2[h1] = [];
            for (let h2 = 0; h2 < hidden2Size; h2++) {
                this._W2[h1][h2] = gaussianRandom(0, heScale2);
            }
        }
        this._b2 = new Array(hidden2Size).fill(0.01);

        // W3: Hidden2 → Output
        this._W3 = [];
        for (let h2 = 0; h2 < hidden2Size; h2++) {
            this._W3[h2] = [];
            for (let c = 0; c < outputSize; c++) {
                this._W3[h2][c] = gaussianRandom(0, xavierScale);
            }
        }
        this._b3 = new Array(outputSize).fill(0);

        this._initializeAdamState(inputSize, hidden1Size, hidden2Size, outputSize);
        this._log(`Weights initialized: ${inputSize}→${hidden1Size}→${hidden2Size}→${outputSize}`);
    }

    _initializeAdamState(inputSize, hidden1Size, hidden2Size, outputSize) {
        const zeros2D = (rows, cols) => {
            const arr = [];
            for (let i = 0; i < rows; i++) arr[i] = new Array(cols).fill(0);
            return arr;
        };

        this._adamState = {
            t: 0,
            m_W1: zeros2D(inputSize, hidden1Size), v_W1: zeros2D(inputSize, hidden1Size),
            m_b1: new Array(hidden1Size).fill(0), v_b1: new Array(hidden1Size).fill(0),
            m_W2: zeros2D(hidden1Size, hidden2Size), v_W2: zeros2D(hidden1Size, hidden2Size),
            m_b2: new Array(hidden2Size).fill(0), v_b2: new Array(hidden2Size).fill(0),
            m_W3: zeros2D(hidden2Size, outputSize), v_W3: zeros2D(hidden2Size, outputSize),
            m_b3: new Array(outputSize).fill(0), v_b3: new Array(outputSize).fill(0)
        };
    }

    // ========================================================================
    // ACTIVATION FUNCTIONS
    // ========================================================================

    _leakyRelu(x) {
        return x > 0 ? x : NeuralClassifierV8.LEAKY_RELU_ALPHA * x;
    }

    _leakyReluDerivative(x) {
        return x > 0 ? 1 : NeuralClassifierV8.LEAKY_RELU_ALPHA;
    }

    _sigmoid(x) {
        if (x >= 0) {
            const z = Math.exp(-x);
            return 1 / (1 + z);
        } else {
            const z = Math.exp(x);
            return z / (1 + z);
        }
    }

    _sigmoidDerivative(sigmoidOutput) {
        return sigmoidOutput * (1 - sigmoidOutput);
    }

    // ========================================================================
    // FORWARD PASS
    // ========================================================================

    _forward(features, training = false) {
        if (training && features.length !== NeuralClassifierV8.INPUT_SIZE) {
            throw new Error(`Expected ${NeuralClassifierV8.INPUT_SIZE} features, got ${features.length}`);
        }

        // Layer 1: Input → Hidden1
        const z1 = new Array(NeuralClassifierV8.HIDDEN1_SIZE).fill(0);
        for (let h = 0; h < NeuralClassifierV8.HIDDEN1_SIZE; h++) {
            let sum = this._b1[h];
            for (let i = 0; i < features.length; i++) {
                sum += features[i] * this._W1[i][h];
            }
            z1[h] = sum;
        }
        const h1 = z1.map(x => this._leakyRelu(x));

        // Layer 2: Hidden1 → Hidden2
        const z2 = new Array(NeuralClassifierV8.HIDDEN2_SIZE).fill(0);
        for (let h = 0; h < NeuralClassifierV8.HIDDEN2_SIZE; h++) {
            let sum = this._b2[h];
            for (let h1_i = 0; h1_i < h1.length; h1_i++) {
                sum += h1[h1_i] * this._W2[h1_i][h];
            }
            z2[h] = sum;
        }
        const h2 = z2.map(x => this._leakyRelu(x));

        // Output Layer: Hidden2 → Output (Sigmoid)
        const outputSize = this._W3[0].length;
        const logits = new Array(outputSize).fill(0);
        for (let c = 0; c < outputSize; c++) {
            let sum = this._b3[c];
            for (let h2_i = 0; h2_i < h2.length; h2_i++) {
                sum += h2[h2_i] * this._W3[h2_i][c];
            }
            logits[c] = sum;
        }
        const probs = logits.map(x => this._sigmoid(x));

        return { z1, h1, z2, h2, logits, probs };
    }

    // ========================================================================
    // PREDICTION (INFERENCE)
    // ========================================================================

    predict(features) {
        if (!this._W1) {
            console.warn('[NeuralClassifierV8] Weights not initialized');
            return { prediction: 'unknown', confidence: 0, probabilities: {} };
        }

        const forward = this._forward(features, false);
        const probs = forward.probs;

        // Find top prediction
        let maxProb = 0;
        let maxIndex = -1;

        // Collect all probs > threshold
        const candidates = [];

        for (let i = 0; i < probs.length; i++) {
            const p = probs[i];
            if (p > maxProb) {
                maxProb = p;
                maxIndex = i;
            }

            if (p >= NeuralClassifierV8.CONFIDENCE_THRESHOLD) {
                const className = this._fieldTypes?.getFieldTypeFromIndex?.(i) || `class_${i}`;
                candidates.push({ class: className, prob: p });
            }
        }

        // UNKNOWN Handling
        if (maxProb < NeuralClassifierV8.CONFIDENCE_THRESHOLD) {
            return {
                prediction: 'unknown',
                label: 'unknown',
                confidence: maxProb,
                probabilities: {
                    unknown: 1.0 - maxProb
                }
            };
        }

        // Note: 'unknown' is a confidence gate, not a learned class.
        // It represents the probability mass not assigned to the top prediction
        // when confidence is low.

        const predictedClass = this._fieldTypes?.getFieldTypeFromIndex?.(maxIndex) || `class_${maxIndex}`;

        // Convert candidates to map
        candidates.sort((a, b) => b.prob - a.prob);
        const probMap = {};
        candidates.forEach(c => probMap[c.class] = c.prob);

        return {
            label: predictedClass,
            prediction: predictedClass, // Keep for backward compat if needed
            confidence: maxProb,
            probabilities: probMap
        };
    }

    // ========================================================================
    // GRADIENT CLIPPING
    // ========================================================================

    _clipGradients(gradients) {
        const maxNorm = NeuralClassifierV8.GRADIENT_CLIP_NORM;
        let totalNormSq = 0;

        const addNorm = (g) => {
            if (Array.isArray(g[0])) {
                for (let row of g) for (let val of row) totalNormSq += val * val;
            } else {
                for (let val of g) totalNormSq += val * val;
            }
        };

        addNorm(gradients.dW1); addNorm(gradients.db1);
        addNorm(gradients.dW2); addNorm(gradients.db2);
        addNorm(gradients.dW3); addNorm(gradients.db3);

        const totalNorm = Math.sqrt(totalNormSq);
        if (totalNorm > maxNorm) {
            const scale = maxNorm / (totalNorm + 1e-8);
            const scaleTensor = (g) => {
                if (Array.isArray(g[0])) {
                    for (let i = 0; i < g.length; i++)
                        for (let j = 0; j < g[i].length; j++) g[i][j] *= scale;
                } else {
                    for (let i = 0; i < g.length; i++) g[i] *= scale;
                }
            };
            scaleTensor(gradients.dW1); scaleTensor(gradients.db1);
            scaleTensor(gradients.dW2); scaleTensor(gradients.db2);
            scaleTensor(gradients.dW3); scaleTensor(gradients.db3);
        }
    }

    // ========================================================================
    // ADAM UPDATE
    // ========================================================================

    _adamUpdate(param, gradient, mState, vState, learningRate) {
        const beta1 = NeuralClassifierV8.ADAM_BETA1;
        const beta2 = NeuralClassifierV8.ADAM_BETA2;
        const epsilon = NeuralClassifierV8.ADAM_EPSILON;
        const t = this._adamState.t;

        const bc1 = 1 - Math.pow(beta1, t);
        const bc2 = 1 - Math.pow(beta2, t);

        if (Array.isArray(param[0])) {
            for (let i = 0; i < param.length; i++) {
                for (let j = 0; j < param[i].length; j++) {
                    mState[i][j] = beta1 * mState[i][j] + (1 - beta1) * gradient[i][j];
                    vState[i][j] = beta2 * vState[i][j] + (1 - beta2) * gradient[i][j] * gradient[i][j];
                    const mHat = mState[i][j] / bc1;
                    const vHat = vState[i][j] / bc2;
                    param[i][j] -= learningRate * mHat / (Math.sqrt(vHat) + epsilon);
                    param[i][j] -= learningRate * NeuralClassifierV8.L2_LAMBDA * param[i][j];
                }
            }
        } else {
            for (let i = 0; i < param.length; i++) {
                mState[i] = beta1 * mState[i] + (1 - beta1) * gradient[i];
                vState[i] = beta2 * vState[i] + (1 - beta2) * gradient[i] * gradient[i];

                const mHat = mState[i] / bc1;
                const vHat = vState[i] / bc2;

                param[i] -= learningRate * mHat / (Math.sqrt(vHat) + epsilon);
                // Note: L2 applied to biases as well for consistency, though often omitted.
                param[i] -= learningRate * NeuralClassifierV8.L2_LAMBDA * param[i];
            }
        }
    }

    // ========================================================================
    // TRAINING METHODS (Public for script usage)
    // ========================================================================

    // Backprop and training batch logic are handled in train_model_v8.js 
    // to allow flexible loss function injection (Weighted BCE), but we provide
    // the compute gradients helper here for encapsulation if needed, 
    // OR expose weights for external training loop.

    // For V8, we will expose a method to compute gradients based on an external error signal
    // (dLogits) so the loss function can be calculated externally.

    computeGradientsFromError(features, forward, dLogits) { // dLogits = dL/dz3
        const outputSize = this._W3[0].length;
        const hidden2Size = NeuralClassifierV8.HIDDEN2_SIZE;
        const hidden1Size = NeuralClassifierV8.HIDDEN1_SIZE;
        const inputSize = features.length;

        // Gradients for W3, b3
        const dW3 = [];
        for (let h2 = 0; h2 < hidden2Size; h2++) {
            dW3[h2] = [];
            for (let c = 0; c < outputSize; c++) {
                dW3[h2][c] = forward.h2[h2] * dLogits[c];
            }
        }
        const db3 = dLogits.slice();

        // Backprop to Hidden 2
        const dH2 = new Array(hidden2Size).fill(0);
        for (let h2 = 0; h2 < hidden2Size; h2++) {
            for (let c = 0; c < outputSize; c++) {
                dH2[h2] += dLogits[c] * this._W3[h2][c];
            }
        }
        // LeakyReLU derivative
        const dZ2 = dH2.map((val, i) => val * this._leakyReluDerivative(forward.z2[i]));

        // Gradients for W2, b2
        const dW2 = [];
        for (let h1 = 0; h1 < hidden1Size; h1++) {
            dW2[h1] = [];
            for (let h2 = 0; h2 < hidden2Size; h2++) {
                dW2[h1][h2] = forward.h1[h1] * dZ2[h2];
            }
        }
        const db2 = dZ2.slice();

        // Backprop to Hidden 1
        const dH1 = new Array(hidden1Size).fill(0);
        for (let h1 = 0; h1 < hidden1Size; h1++) {
            for (let h2 = 0; h2 < hidden2Size; h2++) {
                dH1[h1] += dZ2[h2] * this._W2[h1][h2];
            }
        }
        // LeakyReLU derivative
        const dZ1 = dH1.map((val, i) => val * this._leakyReluDerivative(forward.z1[i]));

        // Gradients for W1, b1
        const dW1 = [];
        for (let i = 0; i < inputSize; i++) {
            dW1[i] = [];
            for (let h = 0; h < hidden1Size; h++) {
                dW1[i][h] = features[i] * dZ1[h];
            }
        }
        const db1 = dZ1.slice();

        return { dW1, db1, dW2, db2, dW3, db3 };
    }

    applyGradients(batchGradients, lr) {
        this._clipGradients(batchGradients);
        this._adamState.t++;
        this._adamUpdate(this._W1, batchGradients.dW1, this._adamState.m_W1, this._adamState.v_W1, lr);
        this._adamUpdate(this._b1, batchGradients.db1, this._adamState.m_b1, this._adamState.v_b1, lr);
        this._adamUpdate(this._W2, batchGradients.dW2, this._adamState.m_W2, this._adamState.v_W2, lr);
        this._adamUpdate(this._b2, batchGradients.db2, this._adamState.m_b2, this._adamState.v_b2, lr);
        this._adamUpdate(this._W3, batchGradients.dW3, this._adamState.m_W3, this._adamState.v_W3, lr);
        this._adamUpdate(this._b3, batchGradients.db3, this._adamState.m_b3, this._adamState.v_b3, lr);
    }

    // ========================================================================
    // SERIALIZATION
    // ========================================================================

    exportWeights() {
        return {
            version: NeuralClassifierV8.VERSION,
            W1: this._W1, b1: this._b1,
            W2: this._W2, b2: this._b2,
            W3: this._W3, b3: this._b3
        };
    }

    loadWeights(weights) {
        if (!weights) return false;
        // Basic validation could be added here
        this._W1 = weights.W1; this._b1 = weights.b1;
        this._W2 = weights.W2; this._b2 = weights.b2;
        this._W3 = weights.W3; this._b3 = weights.b3;

        // Initialize optimizer if training is needed after load
        if (!this._adamState && this._W1) {
            const inputSize = this._W1.length;
            const hidden1Size = this._W1[0].length;
            const hidden2Size = this._W2[0].length;
            const outputSize = this._W3[0].length;
            this._initializeAdamState(inputSize, hidden1Size, hidden2Size, outputSize);
        }

        this._log('Weights loaded successfully');
        return true;
    }

    _log(msg) {
        if (this._debug) // console.log(`[NeuralClassifierV8] ${msg}`);
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NeuralClassifierV8;
}
if (typeof window !== 'undefined') {
    window.NeuralClassifierV8 = NeuralClassifierV8;
}
