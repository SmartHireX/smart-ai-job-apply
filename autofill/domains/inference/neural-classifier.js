/**
 * NeuralClassifier V7 - Enterprise-Grade Implementation
 * 
 * Parity version from archive to match model_v7 training.
 */

class NeuralClassifier {

    static VERSION = '7.0.0';
    static MODEL_VERSION = 7;

    // Network Architecture
    static INPUT_SIZE = 95;      // Matches FeatureExtractorV3
    static HIDDEN1_SIZE = 256;
    static HIDDEN2_SIZE = 128;
    static OUTPUT_SIZE = 88;     // Number of classes

    constructor(config = {}) {
        this._debug = config.debug || false;
        this._isTraining = false;

        // Initialize FieldTypes for class mapping
        if (config.fieldTypes) {
            this._fieldTypes = config.fieldTypes;
        } else if (typeof window !== 'undefined' && window.FieldTypes) {
            this._fieldTypes = window.FieldTypes;
        }

        // Feature Extractor
        if (typeof window !== 'undefined' && window.FeatureExtractorV3) {
            this._featureExtractor = new window.FeatureExtractorV3();
        }

        // Weight matrices
        this.W1 = null;
        this.b1 = null;
        this.W2 = null;
        this.b2 = null;
        this.W3 = null;
        this.b3 = null;

        // BatchNorm parameters
        this.gamma1 = null;
        this.beta1 = null;
        this.runningMean1 = null;
        this.runningVar1 = null;
        this.gamma2 = null;
        this.beta2 = null;
        this.runningMean2 = null;
        this.runningVar2 = null;

        this._log('NeuralClassifier restored from archive');
    }

    _leakyRelu(x) {
        const alpha = 0.01;
        return x > 0 ? x : alpha * x;
    }

    _softmax(logits) {
        const maxLogit = Math.max(...logits);
        const expLogits = logits.map(x => Math.exp(x - maxLogit));
        const sumExp = expLogits.reduce((a, b) => a + b, 0);
        return expLogits.map(x => x / (sumExp + 1e-10));
    }

    _batchNorm(activations, gamma, beta, runningMean, runningVar) {
        const epsilon = 1e-5;
        return activations.map((x, i) => {
            const mean = runningMean[i] || 0;
            const variance = runningVar[i] || 1;
            const normalized = (x - mean) / Math.sqrt(variance + epsilon);
            return gamma[i] * normalized + beta[i];
        });
    }

    _forward(features) {
        // Layer 1: Input -> Hidden1
        const z1 = new Array(NeuralClassifier.HIDDEN1_SIZE).fill(0);
        for (let h = 0; h < NeuralClassifier.HIDDEN1_SIZE; h++) {
            let sum = this.b1[h];
            for (let i = 0; i < features.length; i++) {
                sum += features[i] * this.W1[i][h]; // Training used [Input][Hidden]
            }
            z1[h] = sum;
        }

        const z1_bn = this._batchNorm(z1, this.gamma1, this.beta1, this.runningMean1, this.runningVar1);
        const h1 = z1_bn.map(x => this._leakyRelu(x));

        // Layer 2: Hidden1 -> Hidden2
        const z2 = new Array(NeuralClassifier.HIDDEN2_SIZE).fill(0);
        for (let h = 0; h < NeuralClassifier.HIDDEN2_SIZE; h++) {
            let sum = this.b2[h];
            for (let i = 0; i < h1.length; i++) {
                sum += h1[i] * this.W2[i][h];
            }
            z2[h] = sum;
        }

        const z2_bn = this._batchNorm(z2, this.gamma2, this.beta2, this.runningMean2, this.runningVar2);
        const h2 = z2_bn.map(x => this._leakyRelu(x));

        // Output Layer: Hidden2 -> Output
        const logits = new Array(NeuralClassifier.OUTPUT_SIZE).fill(0);
        for (let c = 0; c < NeuralClassifier.OUTPUT_SIZE; c++) {
            let sum = this.b3[c];
            for (let i = 0; i < h2.length; i++) {
                sum += h2[i] * this.W3[i][c];
            }
            logits[c] = sum;
        }

        return this._softmax(logits);
    }

    predict(inputData) {
        if (!this.W1) return { prediction: 'unknown', confidence: 0, probabilities: {} };

        let features;
        if (Array.isArray(inputData)) {
            features = inputData;
        } else if (this._featureExtractor) {
            features = this._featureExtractor.extract(inputData);
        } else {
            return { prediction: 'unknown', confidence: 0, probabilities: {} };
        }

        if (features.length !== NeuralClassifier.INPUT_SIZE) {
            console.warn(`[NeuralClassifier] Input size mismatch: expected ${NeuralClassifier.INPUT_SIZE}, got ${features.length}`);
            if (features.length < NeuralClassifier.INPUT_SIZE) {
                features = [...features, ...new Array(NeuralClassifier.INPUT_SIZE - features.length).fill(0)];
            } else {
                features = features.slice(0, NeuralClassifier.INPUT_SIZE);
            }
        }

        const probs = this._forward(features);
        const maxProb = Math.max(...probs);
        const predictedIndex = probs.indexOf(maxProb);

        const predictedClass = this._fieldTypes?.getFieldTypeFromIndex?.(predictedIndex) || `class_${predictedIndex}`;

        // Top 5 probabilities
        const indexedProbs = probs.map((p, i) => ({ index: i, prob: p }));
        indexedProbs.sort((a, b) => b.prob - a.prob);
        const top5 = {};
        for (let i = 0; i < Math.min(5, indexedProbs.length); i++) {
            const label = this._fieldTypes?.getFieldTypeFromIndex?.(indexedProbs[i].index) || `class_${indexedProbs[i].index}`;
            top5[label] = indexedProbs[i].prob;
        }

        return {
            label: predictedClass,
            prediction: predictedClass,
            confidence: maxProb,
            probabilities: top5
        };
    }

    loadWeights(w) {
        if (!w) return false;

        // Support both versions of parameters
        this.W1 = w.W1 || w.weights?.W1;
        this.b1 = w.b1 || w.weights?.b1;
        this.W2 = w.W2 || w.weights?.W2;
        this.b2 = w.b2 || w.weights?.b2;
        this.W3 = w.W3 || w.weights?.W3;
        this.b3 = w.b3 || w.weights?.b3;

        this.gamma1 = w.gamma1 || w.weights?.gamma1 || new Array(NeuralClassifier.HIDDEN1_SIZE).fill(1.0);
        this.beta1 = w.beta1 || w.beta1_bn || w.weights?.beta1 || new Array(NeuralClassifier.HIDDEN1_SIZE).fill(0.0);
        this.runningMean1 = w.runningMean1 || w.weights?.runningMean1 || new Array(NeuralClassifier.HIDDEN1_SIZE).fill(0.0);
        this.runningVar1 = w.runningVar1 || w.weights?.runningVar1 || new Array(NeuralClassifier.HIDDEN1_SIZE).fill(1.0);

        this.gamma2 = w.gamma2 || w.weights?.gamma2 || new Array(NeuralClassifier.HIDDEN2_SIZE).fill(1.0);
        this.beta2 = w.beta2 || w.beta2_bn || w.weights?.beta2 || new Array(NeuralClassifier.HIDDEN2_SIZE).fill(0.0);
        this.runningMean2 = w.runningMean2 || w.weights?.runningMean2 || new Array(NeuralClassifier.HIDDEN2_SIZE).fill(0.0);
        this.runningVar2 = w.runningVar2 || w.weights?.runningVar2 || new Array(NeuralClassifier.HIDDEN2_SIZE).fill(1.0);

        this._log('Weights loaded successfully from checkpoint');
        return true;
    }

    _log(msg) {
        if (this._debug) console.log(`[NeuralClassifier] ${msg}`);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NeuralClassifier;
}
if (typeof window !== 'undefined') {
    window.NeuralClassifier = NeuralClassifier;
}
