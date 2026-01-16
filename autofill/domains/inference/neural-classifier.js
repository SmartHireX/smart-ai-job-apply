/**
 * Neural Classifier V7 (Enterprise Edition)
 * 
 * A robust feed-forward neural network for field classification.
 * Key features:
 * - Adam Optimizer (Adaptive Moment Estimation)
 * - Batch Normalization
 * - He Initialization
 * - Learning Rate Scheduling
 * - Gradient Clipping
 * - Dropout for Regularization
 * - Numerically Stable Softmax
 */

class NeuralClassifier {
    // Hyperparameters
    static INPUT_SIZE = 95;      // Matches FeatureExtractorV3
    static HIDDEN1_SIZE = 256;   // Expanded first layer
    static HIDDEN2_SIZE = 128;   // Refined second layer
    static OUTPUT_SIZE = 88;     // Number of classes

    static LEARNING_RATE = 0.001;// Initial learning rate
    static MOMENTUM = 0.9;
    static BETA1 = 0.9;          // Adam beta1
    static BETA2 = 0.999;        // Adam beta2
    static EPSILON = 1e-8;       // Adam epsilon
    static L2_LAMBDA = 0.0001;   // L2 Regularization strength
    static DROPOUT_RATE = 0.3;   // Dropout probability
    static BN_MOMENTUM = 0.9;    // Batch Norm momentum
    static BN_EPSILON = 1e-5;    // Batch Norm epsilon
    static GRADIENT_CLIP_NORM = 1.0; // Gradient clipping threshold

    constructor(config = {}) {
        this._featureExtractor = config.featureExtractor;
        this._fieldTypes = config.fieldTypes;

        // Model Parameters
        // Layer 1
        this.W1 = null;
        this.b1 = null;
        this.gamma1 = null; // BatchNorm scale
        this.beta1 = null;  // BatchNorm shift
        this.runningMean1 = null; // BatchNorm running mean
        this.runningVar1 = null;  // BatchNorm running variance

        // Layer 2
        this.W2 = null;
        this.b2 = null;
        this.gamma2 = null;
        this.beta2 = null;
        this.runningMean2 = null;
        this.runningVar2 = null;

        // Output Layer
        this.W3 = null;
        this.b3 = null;

        // Optimization State (Adam)
        this.m = {}; // First moment
        this.v = {}; // Second moment
        this.t = 0;  // Time step

        this._initializeRandomWeights();
    }

    _initializeRandomWeights() {
        const inputSize = NeuralClassifier.INPUT_SIZE;
        const hidden1Size = NeuralClassifier.HIDDEN1_SIZE;
        const hidden2Size = NeuralClassifier.HIDDEN2_SIZE;
        const outputSize = this._fieldTypes?.ORDERED_CLASSES?.length || NeuralClassifier.OUTPUT_SIZE;

        // Helper: Gaussian random with Box-Muller transform
        const gaussianRandom = (mean = 0, stddev = 1) => {
            const u = 1 - Math.random();
            const v = Math.random();
            const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
            return z * stddev + mean;
        };

        // He Initialization (for LeakyReLU)
        // stddev = sqrt(2 / (1 + alpha^2) / fan_in)
        // For standard ReLU/LeakyReLU, often simplified to sqrt(2 / fan_in)
        const heInit = (fanIn, fanOut) => {
            const stddev = Math.sqrt(2.0 / fanIn);
            const matrix = [];
            for (let i = 0; i < fanOut; i++) {
                const row = [];
                for (let j = 0; j < fanIn; j++) {
                    row.push(gaussianRandom(0, stddev));
                }
                matrix.push(row);
            }
            return matrix;
        };

        // Initialize weights
        this.W1 = heInit(inputSize, hidden1Size);
        this.b1 = new Array(hidden1Size).fill(0.01); // Small positive bias

        this.W2 = heInit(hidden1Size, hidden2Size);
        this.b2 = new Array(hidden2Size).fill(0.01);

        this.W3 = heInit(hidden2Size, outputSize); // Xavier might be better for final Softmax, but He is fine
        this.b3 = new Array(outputSize).fill(0.0);

        // Batch Norm Parameters (Initialize to 1 and 0)
        this.gamma1 = new Array(hidden1Size).fill(1.0);
        this.beta1 = new Array(hidden1Size).fill(0.0);
        this.runningMean1 = new Array(hidden1Size).fill(0.0);
        this.runningVar1 = new Array(hidden1Size).fill(1.0);

        this.gamma2 = new Array(hidden2Size).fill(1.0);
        this.beta2 = new Array(hidden2Size).fill(0.0);
        this.runningMean2 = new Array(hidden2Size).fill(0.0);
        this.runningVar2 = new Array(hidden2Size).fill(1.0);

        // Initialize Adam state
        this._initAdamState();

        console.log(`🧠 NeuralClassifier initialized with architecture: ${inputSize} -> ${hidden1Size} -> ${hidden2Size} -> ${outputSize}`);
    }

    _initAdamState() {
        const shapeLike = (tensor) => {
            if (Array.isArray(tensor[0])) { // Matrix
                return tensor.map(row => new Array(row.length).fill(0));
            } else { // Vector
                return new Array(tensor.length).fill(0);
            }
        };

        this.m = {
            W1: shapeLike(this.W1), b1: shapeLike(this.b1),
            W2: shapeLike(this.W2), b2: shapeLike(this.b2),
            W3: shapeLike(this.W3), b3: shapeLike(this.b3),
            gamma1: shapeLike(this.gamma1), beta1: shapeLike(this.beta1),
            gamma2: shapeLike(this.gamma2), beta2: shapeLike(this.beta2)
        };

        this.v = {
            W1: shapeLike(this.W1), b1: shapeLike(this.b1),
            W2: shapeLike(this.W2), b2: shapeLike(this.b2),
            W3: shapeLike(this.W3), b3: shapeLike(this.b3),
            gamma1: shapeLike(this.gamma1), beta1: shapeLike(this.beta1),
            gamma2: shapeLike(this.gamma2), beta2: shapeLike(this.beta2)
        };

        this.t = 0;
    }

    train(samples, options = {}) {
        const epochs = options.epochs || 50;
        const learningRate = options.learningRate || NeuralClassifier.LEARNING_RATE;
        const batchSize = options.batchSize || 32;
        const validationData = options.validationData || [];

        let currentLR = learningRate;

        console.log(`🚀 Starting training for ${epochs} epochs with ${samples.length} samples...`);

        for (let epoch = 0; epoch < epochs; epoch++) {
            // LR Schedule: Linear Warmup (5 epochs) -> Cosine Annealing
            if (epoch < 5) {
                currentLR = learningRate * (epoch + 1) / 5;
            } else {
                currentLR = learningRate * 0.5 * (1 + Math.cos(Math.PI * (epoch - 5) / (epochs - 5)));
            }

            // Shuffle data
            const shuffled = [...samples].sort(() => Math.random() - 0.5);
            let totalLoss = 0;
            let correct = 0;

            // Mini-batch training
            for (let i = 0; i < shuffled.length; i += batchSize) {
                const batch = shuffled.slice(i, i + batchSize);
                const result = this._trainBatch(batch, currentLR);
                totalLoss += result.loss * batch.length;
                correct += result.correct;
            }

            // Logging
            if ((epoch + 1) % 5 === 0 || epoch === 0) {
                const avgLoss = totalLoss / samples.length;
                const accuracy = (correct / samples.length) * 100;
                let valMsg = '';

                if (validationData.length > 0) {
                    const valMetrics = this.evaluate(validationData);
                    valMsg = ` | Val Loss: ${valMetrics.loss.toFixed(4)} | Val Acc: ${valMetrics.accuracy.toFixed(2)}%`;
                }

                console.log(`Epoch ${epoch + 1}/${epochs} | Loss: ${avgLoss.toFixed(4)} | Acc: ${accuracy.toFixed(2)}% | LR: ${currentLR.toFixed(6)}${valMsg}`);
            }
        }
    }

    _trainBatch(batch, learningRate) {
        // Accumulate gradients for the batch
        this.t++; // Increment time step for Adam
        let batchLoss = 0;
        let batchCorrect = 0;

        // Gradient accumulators
        const dW1_agg = this.W1.map(r => new Array(r.length).fill(0));
        const db1_agg = new Array(this.b1.length).fill(0);
        const dGamma1_agg = new Array(this.gamma1.length).fill(0);
        const dBeta1_agg = new Array(this.beta1.length).fill(0);

        const dW2_agg = this.W2.map(r => new Array(r.length).fill(0));
        const db2_agg = new Array(this.b2.length).fill(0);
        const dGamma2_agg = new Array(this.gamma2.length).fill(0);
        const dBeta2_agg = new Array(this.beta2.length).fill(0);

        const dW3_agg = this.W3.map(r => new Array(r.length).fill(0));
        const db3_agg = new Array(this.b3.length).fill(0);

        for (const sample of batch) {
            const features = sample.features;
            const label = sample.label;
            const targetIndex = this._fieldTypes?.getFieldTypeIndex?.(label) ?? 0;

            // Forward pass
            const forward = this._forward(features, true); // training=true

            // Loss & Accuracy
            const loss = -Math.log(forward.probs[targetIndex] + 1e-15);
            batchLoss += loss;

            const predictedIndex = forward.probs.indexOf(Math.max(...forward.probs));
            if (predictedIndex === targetIndex) batchCorrect++;

            // Backpropagation
            const grads = this._backpropagate(features, targetIndex, forward);

            // Accumulate gradients
            this._accumulateGradients(dW1_agg, grads.dW1);
            this._accumulateGradients(db1_agg, grads.db1);
            this._accumulateGradients(dGamma1_agg, grads.dGamma1);
            this._accumulateGradients(dBeta1_agg, grads.dBeta1);

            this._accumulateGradients(dW2_agg, grads.dW2);
            this._accumulateGradients(db2_agg, grads.db2);
            this._accumulateGradients(dGamma2_agg, grads.dGamma2);
            this._accumulateGradients(dBeta2_agg, grads.dBeta2);

            this._accumulateGradients(dW3_agg, grads.dW3);
            this._accumulateGradients(db3_agg, grads.db3);
        }

        // Apply gradients (Adam Optimizer)
        const batchScale = 1.0 / batch.length;

        this._adamUpdate('W1', this.W1, dW1_agg, learningRate, batchScale);
        this._adamUpdate('b1', this.b1, db1_agg, learningRate, batchScale);

        this._adamUpdate('W2', this.W2, dW2_agg, learningRate, batchScale);
        this._adamUpdate('b2', this.b2, db2_agg, learningRate, batchScale);

        this._adamUpdate('W3', this.W3, dW3_agg, learningRate, batchScale);
        this._adamUpdate('b3', this.b3, db3_agg, learningRate, batchScale);

        this._adamUpdate('gamma1', this.gamma1, dGamma1_agg, learningRate, batchScale);
        this._adamUpdate('beta1', this.beta1, dBeta1_agg, learningRate, batchScale);

        this._adamUpdate('gamma2', this.gamma2, dGamma2_agg, learningRate, batchScale);
        this._adamUpdate('beta2', this.beta2, dBeta2_agg, learningRate, batchScale);

        return { loss: batchLoss / batch.length, correct: batchCorrect };
    }

    _accumulateGradients(accumulator, newGrads) {
        if (Array.isArray(accumulator[0])) { // Matrix
            for (let i = 0; i < accumulator.length; i++) {
                for (let j = 0; j < accumulator[i].length; j++) {
                    accumulator[i][j] += newGrads[i][j];
                }
            }
        } else { // Vector
            for (let i = 0; i < accumulator.length; i++) {
                accumulator[i] += newGrads[i];
            }
        }
    }

    _adamUpdate(paramName, param, grads, learningRate, scale) {
        const beta1 = NeuralClassifier.BETA1;
        const beta2 = NeuralClassifier.BETA2;
        const epsilon = NeuralClassifier.EPSILON;
        const l2Lambda = NeuralClassifier.L2_LAMBDA;

        const m = this.m[paramName];
        const v = this.v[paramName];

        // Gradient clipping helper
        const clip = (val) => Math.max(-NeuralClassifier.GRADIENT_CLIP_NORM, Math.min(NeuralClassifier.GRADIENT_CLIP_NORM, val));

        const updateElement = (p, g, m_val, v_val, i, j = null) => {
            // Apply L2 regularization to gradient
            const g_reg = scale * g + l2Lambda * p;
            const g_clipped = clip(g_reg);

            // Update moments
            const m_new = beta1 * m_val + (1 - beta1) * g_clipped;
            const v_new = beta2 * v_val + (1 - beta2) * (g_clipped * g_clipped);

            // Bias correction
            const m_hat = m_new / (1 - Math.pow(beta1, this.t));
            const v_hat = v_new / (1 - Math.pow(beta2, this.t));

            // Update parameter
            const p_new = p - learningRate * m_hat / (Math.sqrt(v_hat) + epsilon);

            return { p: p_new, m: m_new, v: v_new };
        };

        if (Array.isArray(param[0])) { // Matrix
            for (let i = 0; i < param.length; i++) {
                for (let j = 0; j < param[i].length; j++) {
                    const res = updateElement(param[i][j], grads[i][j], m[i][j], v[i][j], i, j);
                    param[i][j] = res.p;
                    m[i][j] = res.m;
                    v[i][j] = res.v;
                }
            }
        } else { // Vector
            for (let i = 0; i < param.length; i++) {
                const res = updateElement(param[i], grads[i], m[i], v[i], i);
                param[i] = res.p;
                m[i] = res.m;
                v[i] = res.v;
            }
        }
    }

    _forward(features, training = false) {
        // Layer 1: Dense -> BN -> LeakyReLU -> Dropout
        const z1 = this._dense(features, this.W1, this.b1);
        const z1_bn = this._batchNorm(z1, this.gamma1, this.beta1, this.runningMean1, this.runningVar1, training);
        const a1 = this._leakyRelu(z1_bn);
        const a1_drop = training ? this._dropout(a1) : a1;

        // Layer 2: Dense -> BN -> LeakyReLU -> Dropout
        const z2 = this._dense(a1_drop, this.W2, this.b2);
        const z2_bn = this._batchNorm(z2, this.gamma2, this.beta2, this.runningMean2, this.runningVar2, training);
        const a2 = this._leakyRelu(z2_bn);
        const a2_drop = training ? this._dropout(a2) : a2;

        // Output Layer: Dense -> Softmax
        const z3 = this._dense(a2_drop, this.W3, this.b3);
        const probs = this._softmax(z3);

        return { features, z1, z1_bn, a1, a1_drop, z2, z2_bn, a2, a2_drop, z3, probs };
    }

    _dense(input, weights, bias) {
        // Robustness: handle undefined/null weights gracefully if concurrent loading
        if (!weights || !bias) return new Array(bias?.length || 0).fill(0);

        return bias.map((b, i) => {
            let sum = b;
            // Robustness: ensure row exists
            const wRow = weights[i];
            if (!wRow) return b;

            for (let j = 0; j < input.length; j++) {
                sum += input[j] * wRow[j];
            }
            return sum;
        });
    }

    _batchNorm(activations, gamma, beta, runningMean, runningVar, training = false) {
        const epsilon = NeuralClassifier.BN_EPSILON;
        const momentum = NeuralClassifier.BN_MOMENTUM;

        // For single-sample processing, we normalize per-neuron using running stats
        // activations[i] = pre-activation for neuron i

        if (training) {
            // During training: update running stats with current activations
            return activations.map((x, i) => {
                // Update running mean/var for each neuron
                runningMean[i] = momentum * runningMean[i] + (1 - momentum) * x;
                runningVar[i] = momentum * runningVar[i] + (1 - momentum) * 1.0;  // Var of single sample = 1

                // Normalize using running stats (same as inference for stability)
                const normalized = (x - runningMean[i]) / Math.sqrt(runningVar[i] + epsilon);
                return gamma[i] * normalized + beta[i];
            });
        } else {
            // Inference: use running statistics
            return activations.map((x, i) => {
                const mean = runningMean[i] || 0;
                const variance = runningVar[i] || 1;
                const normalized = (x - mean) / Math.sqrt(variance + epsilon);
                return gamma[i] * normalized + beta[i];
            });
        }
    }

    _leakyRelu(input, alpha = 0.01) {
        return input.map(x => x > 0 ? x : alpha * x);
    }

    _dropout(input) {
        return input.map(x => Math.random() < NeuralClassifier.DROPOUT_RATE ? 0 : x / (1 - NeuralClassifier.DROPOUT_RATE));
    }

    _softmax(logits) {
        const maxLogit = Math.max(...logits); // Numerical stability
        const exps = logits.map(l => Math.exp(l - maxLogit));
        const sumExps = exps.reduce((a, b) => a + b, 0);
        return exps.map(e => e / sumExps);
    }

    _backpropagate(input, targetIndex, forward) {
        // Output Layer Gradients (Softmax + CrossEntropy derivative is probs - target)
        const dZ3 = forward.probs.map((p, i) => i === targetIndex ? p - 1 : p);

        const dW3 = dZ3.map((d, i) => forward.a2_drop.map(x => d * x));
        const db3 = [...dZ3];

        // Layer 2 Gradients
        // dL/dA2 = W3^T * dZ3
        let dA2 = new Array(forward.a2.length).fill(0);
        for (let j = 0; j < this.W3[0].length; j++) { // output size
            for (let i = 0; i < this.W3.length; i++) { // hidden2 size
                dA2[i] += this.W3[i][j] * dZ3[j];
            }
        }

        // Dropout mask approximation
        const dA2_drop = dA2.map((g, i) => forward.a2_drop[i] === 0 ? 0 : g / (1 - NeuralClassifier.DROPOUT_RATE));

        // LeakyReLU derivative
        const dZ2_bn = dA2_drop.map((g, i) => g * (forward.z2_bn[i] > 0 ? 1 : 0.01));

        // BatchNorm Layer 2 Gradients
        const epsilon = NeuralClassifier.BN_EPSILON;
        const dZ2 = dZ2_bn.map((g, i) => g * this.gamma2[i] / Math.sqrt(this.runningVar2[i] + epsilon));
        const dGamma2 = dZ2_bn.map((g, i) => g * (forward.z2[i] - this.runningMean2[i]) / Math.sqrt(this.runningVar2[i] + epsilon));
        const dBeta2 = [...dZ2_bn];

        // Weights/Bias 2 Gradients
        const dW2 = dZ2.map((d, i) => forward.a1_drop.map(x => d * x));
        const db2 = [...dZ2];

        // Layer 1 Gradients
        let dA1 = new Array(forward.a1.length).fill(0);
        for (let j = 0; j < this.W2[0].length; j++) {
            for (let i = 0; i < this.W2.length; i++) {
                dA1[i] += this.W2[i][j] * dZ2[j];
            }
        }

        const dA1_drop = dA1.map((g, i) => forward.a1_drop[i] === 0 ? 0 : g / (1 - NeuralClassifier.DROPOUT_RATE));
        const dZ1_bn = dA1_drop.map((g, i) => g * (forward.z1_bn[i] > 0 ? 1 : 0.01));

        // BatchNorm Layer 1
        const dZ1 = dZ1_bn.map((g, i) => g * this.gamma1[i] / Math.sqrt(this.runningVar1[i] + epsilon));
        const dGamma1 = dZ1_bn.map((g, i) => g * (forward.z1[i] - this.runningMean1[i]) / Math.sqrt(this.runningVar1[i] + epsilon));
        const dBeta1 = [...dZ1_bn];

        const dW1 = dZ1.map((d, i) => input.map(x => d * x));
        const db1 = [...dZ1];

        return { dW1, db1, dGamma1, dBeta1, dW2, db2, dGamma2, dBeta2, dW3, db3 };
    }

    predict(inputData) {
        if (!this.W1) {
            console.warn('⚠️ NeuralClassifier not initialized (no weights). Returning null.');
            return null;
        }

        // Optimization: Handle pre-extracted features from HybridClassifier
        let features;
        if (Array.isArray(inputData)) {
            features = inputData;
        } else {
            features = this._featureExtractor.extract(inputData);
        }

        if (!features) return null;

        const forward = this._forward(features, false); // training=false

        // Find top prediction
        const maxProb = Math.max(...forward.probs);
        const predictedIndex = forward.probs.indexOf(maxProb);
        const predictedClass = this._fieldTypes?.getFieldTypeFromIndex?.(predictedIndex) || `class_${predictedIndex}`;

        // Build probability map for top 5
        const indexedProbs = forward.probs.map((p, i) => ({ index: i, prob: p }));
        indexedProbs.sort((a, b) => b.prob - a.prob);

        const top5 = {};
        for (let i = 0; i < Math.min(5, indexedProbs.length); i++) {
            const className = this._fieldTypes?.getFieldTypeFromIndex?.(indexedProbs[i].index) || `class_${indexedProbs[i].index}`;
            top5[className] = indexedProbs[i].prob;
        }

        return {
            label: predictedClass, // Standardized for HybridClassifier
            class: predictedClass, // Backward compatibility
            confidence: maxProb,
            probabilities: top5
        };
    }

    evaluate(data) {
        let correct = 0;
        let totalLoss = 0;

        for (const sample of data) {
            const features = sample.features;
            const label = sample.label;
            const targetIndex = this._fieldTypes?.getFieldTypeIndex?.(label) ?? 0;

            const forward = this._forward(features, false);

            // Cross-entropy loss
            totalLoss += -Math.log(forward.probs[targetIndex] + 1e-15);

            // Accuracy
            const predictedIndex = forward.probs.indexOf(Math.max(...forward.probs));
            if (predictedIndex === targetIndex) correct++;
        }

        return {
            accuracy: (correct / data.length) * 100,
            loss: totalLoss / data.length
        };
    }

    serialize() {
        return JSON.stringify({
            weights: {
                W1: this.W1, b1: this.b1,
                gamma1: this.gamma1, beta1: this.beta1,
                runningMean1: this.runningMean1, runningVar1: this.runningVar1,

                W2: this.W2, b2: this.b2,
                gamma2: this.gamma2, beta2: this.beta2,
                runningMean2: this.runningMean2, runningVar2: this.runningVar2,

                W3: this.W3, b3: this.b3
            }
        });
    }

    loadWeights(json) {
        try {
            const data = typeof json === 'string' ? JSON.parse(json) : json;
            // Handle both wrapped { weights: ... } and unwrapped { W1: ... } formats
            const w = data.weights || data;

            if (w.W1) this.W1 = w.W1;
            if (w.b1) this.b1 = w.b1;

            if (w.gamma1) this.gamma1 = w.gamma1;
            if (w.beta1) this.beta1 = w.beta1;
            if (w.beta1_bn && !this.beta1) this.beta1 = w.beta1_bn; // Handle beta mismatch

            if (w.runningMean1) this.runningMean1 = w.runningMean1;
            if (w.runningVar1) this.runningVar1 = w.runningVar1;

            if (w.W2) this.W2 = w.W2;
            if (w.b2) this.b2 = w.b2;

            if (w.gamma2) this.gamma2 = w.gamma2;
            if (w.beta2) this.beta2 = w.beta2;
            if (w.beta2_bn && !this.beta2) this.beta2 = w.beta2_bn; // Handle beta mismatch

            if (w.runningMean2) this.runningMean2 = w.runningMean2;
            if (w.runningVar2) this.runningVar2 = w.runningVar2;

            if (w.W3) this.W3 = w.W3;
            if (w.b3) this.b3 = w.b3;

            // Transpose weights if they are in [Input][Output] format (from training export)
            // W1 Expected: [256][95], Loaded might be [95][256]
            if (this.W1 && this.W1.length === NeuralClassifier.INPUT_SIZE && this.W1[0].length === NeuralClassifier.HIDDEN1_SIZE) {
                console.log('🔄 Transposing W1 to match inference expectation...');
                this.W1 = this._transpose(this.W1);
            }

            // W2 Expected: [128][256], Loaded might be [256][128]
            if (this.W2 && this.W2.length === NeuralClassifier.HIDDEN1_SIZE && this.W2[0].length === NeuralClassifier.HIDDEN2_SIZE) {
                console.log('🔄 Transposing W2 to match inference expectation...');
                this.W2 = this._transpose(this.W2);
            }

            // W3 Expected: [88][128], Loaded might be [128][88]
            const outputSize = this.b3 ? this.b3.length : NeuralClassifier.OUTPUT_SIZE;
            if (this.W3 && this.W3.length === NeuralClassifier.HIDDEN2_SIZE && this.W3[0].length === outputSize) {
                console.log('🔄 Transposing W3 to match inference expectation...');
                this.W3 = this._transpose(this.W3);
            }

            // Simple validation
            if (!this.W1 || !this.W2 || !this.W3) {
                console.warn('⚠️ Partial weights loaded - check model format: ', Object.keys(w).slice(0, 5));
                return false;
            }

            console.log('✅ NeuralClassifier weights loaded successfully');
            console.log(`   W1: ${this.W1.length}x${this.W1[0]?.length}, b1: ${this.b1.length}`);
            console.log(`   W2: ${this.W2.length}x${this.W2[0]?.length}, b2: ${this.b2.length}`);
            console.log(`   W3: ${this.W3.length}x${this.W3[0]?.length}, b3: ${this.b3.length}`);
            return true;
        } catch (e) {
            console.error('❌ Failed to load weights:', e);
            return false;
        }
    }

    _transpose(matrix) {
        return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
    }

    /**
     * Initialization for Lifecycle compatibility
     */
    async init() {
        console.log('[NeuralClassifier] Init called (compatibility mode)');
        return true;
    }
}

// Export for both Node.js and Browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NeuralClassifier;
} else if (typeof window !== 'undefined') {
    window.NeuralClassifier = NeuralClassifier;
}
