/**
 * NeuralClassifier
 * A "TinyML" inference engine running in pure JavaScript.
 * Replaces heavy libraries for simple Logistic Regression tasks.
 * 
 * Capability:
 * - 0 dependencies
 * - Instant inference
 * - Loads weights dynamically or uses built-in defaults
 */

class NeuralClassifier {
    constructor() {
        this.featureExtractor = new window.FeatureExtractor();

        // ARCHITECTURE
        this.HIDDEN_SIZE = 20; // Hidden layer neurons
        this.LEAKY_RELU_ALPHA = 0.01; // Leaky ReLU slope for negative values
        this.L2_LAMBDA = 0.01; // L2 regularization strength

        // LABELS: The expanded output classes (Standard ATS Fields)
        this.CLASSES = [
            'unknown',          // 0

            // Personal Info
            'first_name',       // 1
            'last_name',        // 2
            'full_name',        // 3
            'email',            // 4
            'phone',            // 5

            // Links & Portfolios
            'linkedin',         // 6
            'github',           // 7
            'portfolio',        // 8
            'website',          // 9

            // Location
            'address',          // 10
            'city',             // 11
            'state',            // 12
            'zip_code',         // 13
            'country',          // 14

            // Work History (Descriptive Keys)
            'job_title',        // 15
            'employer_name',    // 16
            'job_start_date',   // 17
            'job_end_date',     // 18
            'work_description', // 19
            'job_location',     // 19.5 (New/Optional)

            // Education (Descriptive Keys)
            'institution_name', // 20
            'degree_type',      // 21
            'field_of_study',   // 22
            'gpa_score',        // 23
            'education_start_date', // 24
            'education_end_date',   // 25

            // Demographics (EEOC)
            'gender',           // 26
            'race',             // 27
            'veteran',          // 28
            'disability',       // 29

            // Compensation
            'salary_current',   // 30
            'salary_expected',  // 31

            // Legal & Compliance
            'work_auth',        // 32
            'sponsorship',      // 33
            'citizenship',      // 34
            'clearance',        // 35
            'legal_age',        // 36
            'tax_id',           // 37
            'criminal_record',  // 38
            'notice_period',    // 39

            // Misc
            'referral_source',  // 40
            'cover_letter',     // 41
            'generic_question'  // 42
        ];

        // No extra mapping needed - CLASSES match Profile Schema directly.


        // TWO-LAYER WEIGHTS
        // Layer 1: Input (56) → Hidden (20)
        this.W1 = null; // [56 x 20]
        this.b1 = null; // [20]

        // Layer 2: Hidden (20) → Output (41)
        this.W2 = null; // [20 x 41]
        this.b2 = null; // [41]

        // Training state
        this.totalSamples = 0; // For adaptive learning rate
    }

    async init() {
        console.log(`[NeuralClassifier] Initializing TinyML Engine for ${this.CLASSES.length} classes...`);

        // Priority 1: Try to load user's trained weights (personalized)
        const userWeightsLoaded = await this.loadWeights();

        if (!userWeightsLoaded) {
            // Priority 2: Load pre-trained baseline weights (bundled with extension)
            const baselineLoaded = await this.loadBaselineWeights();

            if (!baselineLoaded) {
                // Priority 3: Initialize random weights (cold start)
                this.generateDummyWeights();
                console.log('[NeuralClassifier] 🆕 No saved weights. Initialized fresh model.');
            }
        }

        console.log('[NeuralClassifier] Ready.');
    }

    /**
     * Predict the class of a field
     * @param {Object} field - Raw field object
     * @returns {Object} { label: string, confidence: number }
     */
    predict(field) {
        // 1. Vectorize
        const inputVector = this.featureExtractor.extract(field);

        // 2. Hybrid Heuristic Check (The "Fast Path")
        // If our weights are dummy/random, or just as a sanity check, run heuristics first.
        const heuristic = this.heuristicFallback(field);
        if (heuristic) {
            return {
                label: heuristic.label,
                confidence: heuristic.confidence,
                source: 'heuristic_hybrid',
                features: inputVector.length
            };
        }

        // 3. Inference (Two-layer forward pass + Softmax)
        if (!this.W1 || !this.W2) {
            // If no heuristics and no weights, unknown.
            return { label: 'unknown', confidence: 0 };
        }

        const { logits } = this.forward(inputVector);
        const probs = this.softmax(logits);

        // 4. Decode
        const maxProb = Math.max(...probs);
        const classIndex = probs.indexOf(maxProb);

        // Threshold: If confidence is too low, treat as 'generic_question' (LLM Fallback)
        let label = this.CLASSES[classIndex];
        if (maxProb < 0.25) {
            label = 'generic_question'; // Fallback to System 2
        }

        return {
            label: label,
            confidence: maxProb,
            // Debug info
            features: inputVector.length
        };
    }

    /**
     * Deterministic Regex Fallback (Hybrid Layer)
     * Maps field text to class labels directly.
     */
    heuristicFallback(field) {
        // Construct the full "Context String" similar to what LocalMatcher uses
        // We use the computed label from FeatureExtractor logic or fallback to DOM
        const computedLabel = this.featureExtractor.getComputedLabel(field) || '';
        const text = (
            computedLabel + ' ' +
            (field.name || '') + ' ' +
            (field.id || '') + ' ' +
            (field.placeholder || '') + ' ' +  // NEW: Check Placeholder
            (field.parentContext || '') + ' ' + // Check Heading
            (field.siblingContext || '')        // Check Neighbors
        ).toLowerCase();

        // --- HISTORY FIELDS ---
        // Normalized regex matching (handles 'start_date' and 'start date')
        if (/job[_\s]?title|position|role|designation/i.test(text)) return { label: 'job_title', confidence: 0.95 };
        if (/company|employer|organization/i.test(text)) return { label: 'company', confidence: 0.95 };
        if (/school|university|college|institution/i.test(text)) return { label: 'school', confidence: 0.95 };
        if (/degree|major|qualification/i.test(text)) return { label: 'degree', confidence: 0.95 }; // 'degree' or 'major' often overlap
        if (/gpa|grade/i.test(text)) return { label: 'gpa', confidence: 0.95 };

        // Dates need careful context
        const isStart = /start[_\s]?date|from/i.test(text);
        const isEnd = /end[_\s]?date|to/i.test(text);

        // Try to infer context if available (Feature Extractor doesn't pass it yet, but we can guess)
        const isEduContext = /education|school|degree/i.test(text); // Weak check

        if (isStart) return { label: isEduContext ? 'edu_start_date' : 'job_start_date', confidence: 0.90 };
        if (isEnd) return { label: isEduContext ? 'edu_end_date' : 'job_end_date', confidence: 0.90 };

        // --- PERSONAL INFO ---
        if (/first[_\s]?name|fname/i.test(text)) return { label: 'first_name', confidence: 0.95 };
        if (/last[_\s]?name|lname/i.test(text)) return { label: 'last_name', confidence: 0.95 };
        if (/email/i.test(text)) return { label: 'email', confidence: 0.99 };
        if (/phone|mobile/i.test(text)) return { label: 'phone', confidence: 0.99 };
        if (/linkedin/i.test(text)) return { label: 'linkedin', confidence: 0.99 };
        if (/github/i.test(text)) return { label: 'github', confidence: 0.99 };
        if (/portfolio|website/i.test(text)) return { label: 'portfolio', confidence: 0.95 };

        // --- LOCATION ---
        if (/address/i.test(text)) return { label: 'address', confidence: 0.90 };
        if (/city/i.test(text)) return { label: 'city', confidence: 0.90 };
        if (/state|province/i.test(text)) return { label: 'state', confidence: 0.90 };
        if (/zip|postal/i.test(text)) return { label: 'zip_code', confidence: 0.95 };
        if (/country/i.test(text)) return { label: 'country', confidence: 0.95 };

        return null; // No strong match
    }

    // --- MATH KERNEL (Pure JS) ---

    /**
     * Leaky ReLU activation function
     * f(x) = x if x > 0, else alpha * x
     */
    leakyReLU(x) {
        return x > 0 ? x : this.LEAKY_RELU_ALPHA * x;
    }

    /**
     * Leaky ReLU derivative for backpropagation
     * f'(x) = 1 if x > 0, else alpha
     */
    leakyReLU_derivative(x) {
        return x > 0 ? 1 : this.LEAKY_RELU_ALPHA;
    }

    /**
     * Forward pass through 2-layer network
     * @param {Array} inputs - Input vector (56 features)
     * @returns {Object} {logits: Array, hidden: Array}
     */
    forward(inputs) {
        // Layer 1: Input → Hidden with Leaky ReLU
        const z1 = new Array(this.HIDDEN_SIZE).fill(0);
        for (let h = 0; h < this.HIDDEN_SIZE; h++) {
            z1[h] = this.b1[h];
            for (let i = 0; i < inputs.length; i++) {
                z1[h] += inputs[i] * this.W1[i][h];
            }
        }
        const hidden = z1.map(z => this.leakyReLU(z));

        // Layer 2: Hidden → Output (logits)
        const logits = new Array(this.CLASSES.length).fill(0);
        for (let c = 0; c < this.CLASSES.length; c++) {
            logits[c] = this.b2[c];
            for (let h = 0; h < this.HIDDEN_SIZE; h++) {
                logits[c] += hidden[h] * this.W2[h][c];
            }
        }

        return { logits, hidden, z1 }; // z1 needed for derivative
    }

    /**
     * Softmax activation to convert logits to probabilities
     */
    softmax(logits) {
        const maxLogit = Math.max(...logits); // Stability fix
        const exps = logits.map(l => Math.exp(l - maxLogit));
        const sumExps = exps.reduce((a, b) => a + b, 0);
        return exps.map(e => e / sumExps);
    }

    // --- TRAINING & PERSISTENCE ---

    /**
     * Train the model on a single example (Online Learning)
     * Using Stochastic Gradient Descent (SGD) with L2 regularization.
     * Backpropagation through 2 layers.
     * @param {Object} field - The input field object
     * @param {string} correctLabel - The ground truth label
     */
    async train(field, correctLabel) {
        if (!this.W1 || !this.W2 || !this.b1 || !this.b2) return;

        const targetIndex = this.CLASSES.indexOf(correctLabel);
        if (targetIndex === -1) return;

        // 1. Forward Pass
        const inputs = this.featureExtractor.extract(field);
        const { logits, hidden, z1 } = this.forward(inputs);
        const probs = this.softmax(logits);

        // 2. Adaptive Learning Rate (decays with experience)
        const baseLR = 0.05;
        const learningRate = baseLR * Math.exp(-0.0001 * this.totalSamples);
        this.totalSamples++;

        // 3. Backward Pass - Output Layer
        // Gradient of cross-entropy loss w.r.t. logits
        const dLogits = new Array(this.CLASSES.length);
        for (let c = 0; c < this.CLASSES.length; c++) {
            const target = (c === targetIndex) ? 1 : 0;
            dLogits[c] = probs[c] - target; // Softmax + CE derivative
        }

        // Gradients for W2 and b2
        const dW2 = [];
        const dB2 = dLogits.slice(); // Copy

        for (let h = 0; h < this.HIDDEN_SIZE; h++) {
            dW2[h] = [];
            for (let c = 0; c < this.CLASSES.length; c++) {
                // Gradient: dL/dW2[h][c] = dLogits[c] * hidden[h] + L2 * W2[h][c]
                dW2[h][c] = dLogits[c] * hidden[h] + this.L2_LAMBDA * this.W2[h][c];
            }
        }

        // Update W2 and b2
        for (let h = 0; h < this.HIDDEN_SIZE; h++) {
            for (let c = 0; c < this.CLASSES.length; c++) {
                this.W2[h][c] -= learningRate * dW2[h][c];
            }
        }
        for (let c = 0; c < this.CLASSES.length; c++) {
            this.b2[c] -= learningRate * dB2[c];
        }

        // 4. Backward Pass - Hidden Layer
        // Backpropagate error to hidden layer
        const dHidden = new Array(this.HIDDEN_SIZE).fill(0);
        for (let h = 0; h < this.HIDDEN_SIZE; h++) {
            for (let c = 0; c < this.CLASSES.length; c++) {
                dHidden[h] += dLogits[c] * this.W2[h][c];
            }
            // Apply Leaky ReLU derivative
            dHidden[h] *= this.leakyReLU_derivative(z1[h]);
        }

        // Gradients for W1 and b1
        const dW1 = [];
        const dB1 = dHidden.slice(); // Copy

        for (let i = 0; i < inputs.length; i++) {
            dW1[i] = [];
            for (let h = 0; h < this.HIDDEN_SIZE; h++) {
                // Gradient: dL/dW1[i][h] = dHidden[h] * inputs[i] + L2 * W1[i][h]
                if (inputs[i] !== 0) { // Sparse optimization
                    dW1[i][h] = dHidden[h] * inputs[i] + this.L2_LAMBDA * this.W1[i][h];
                } else {
                    dW1[i][h] = this.L2_LAMBDA * this.W1[i][h]; // Only L2 term
                }
            }
        }

        // Update W1 and b1
        for (let i = 0; i < inputs.length; i++) {
            for (let h = 0; h < this.HIDDEN_SIZE; h++) {
                this.W1[i][h] -= learningRate * dW1[i][h];
            }
        }
        for (let h = 0; h < this.HIDDEN_SIZE; h++) {
            this.b1[h] -= learningRate * dB1[h];
        }

        console.log(`[NeuralClassifier] 🎓 Trained on "${correctLabel}" (Conf: ${probs[targetIndex].toFixed(2)} → 1.0, LR: ${learningRate.toFixed(4)}, Samples: ${this.totalSamples})`);

        // Auto-save periodically (every 10 samples to reduce I/O)
        if (this.totalSamples % 10 === 0) {
            this.saveWeights();
        }
    }

    async saveWeights() {
        const payload = {
            W1: this.W1,
            b1: this.b1,
            W2: this.W2,
            b2: this.b2,
            totalSamples: this.totalSamples,
            version: 2, // Version 2 for 2-layer network
            timestamp: Date.now()
        };
        await chrome.storage.local.set({ 'neural_weights': payload });
    }

    async loadWeights() {
        try {
            const result = await chrome.storage.local.get('neural_weights');
            if (result.neural_weights) {
                const data = result.neural_weights;

                // Check version compatibility
                if (data.version === 2 && data.W1 && data.W2) {
                    this.W1 = data.W1;
                    this.b1 = data.b1;
                    this.W2 = data.W2;
                    this.b2 = data.b2;
                    this.totalSamples = data.totalSamples || 0;
                    console.log('[NeuralClassifier] 📂 Loaded trained 2-layer weights from storage.');
                    return true;
                } else if (data.version === 1) {
                    console.log('[NeuralClassifier] ⚠️ Found v1 weights (1-layer). Reinitializing to v2 (2-layer).');
                    return false; // Force reinitialization
                }
            }
        } catch (e) {
            console.error('[NeuralClassifier] Failed to load weights:', e);
        }
        return false;
    }

    async loadBaselineWeights() {
        try {
            // Load pre-trained baseline weights bundled with extension
            const baselineUrl = chrome.runtime.getURL('content/services/ai/model_v2_baseline.json');
            const response = await fetch(baselineUrl);

            if (!response.ok) {
                console.warn('[NeuralClassifier] Baseline weights not found (will use random init)');
                return false;
            }

            const data = await response.json();

            if (data.version === 2 && data.W1 && data.W2) {
                this.W1 = data.W1;
                this.b1 = data.b1;
                this.W2 = data.W2;
                this.b2 = data.b2;
                this.totalSamples = 0; // Reset training counter for user's personalization

                console.log(`[NeuralClassifier] 📦 Loaded pre-trained baseline (v2) - Trained on ${data.metadata?.trainingExamples || 'N/A'} examples`);
                return true;
            }
        } catch (e) {
            console.error('[NeuralClassifier] Failed to load baseline weights:', e);
        }
        return false;
    }

    // --- WEIGHT INITIALIZATION ---
    generateDummyWeights() {
        const inputSize = 59; // From FeatureExtractor
        const hiddenSize = this.HIDDEN_SIZE;
        const outputSize = this.CLASSES.length;

        // W1: Input → Hidden (He Initialization for ReLU)
        // Variance = 2/n_in (He et al., 2015)
        this.W1 = [];
        const heScale = Math.sqrt(2.0 / inputSize);
        for (let i = 0; i < inputSize; i++) {
            this.W1[i] = [];
            for (let h = 0; h < hiddenSize; h++) {
                this.W1[i][h] = (Math.random() - 0.5) * 2 * heScale;
            }
        }
        this.b1 = new Array(hiddenSize).fill(0); // Zeros for bias

        // W2: Hidden → Output (Xavier Initialization for Softmax)
        // Variance = 1/n_in (Glorot & Bengio, 2010)
        this.W2 = [];
        const xavierScale = Math.sqrt(1.0 / hiddenSize);
        for (let h = 0; h < hiddenSize; h++) {
            this.W2[h] = [];
            for (let c = 0; c < outputSize; c++) {
                this.W2[h][c] = (Math.random() - 0.5) * 2 * xavierScale;
            }
        }
        this.b2 = new Array(outputSize).fill(0); // Zeros for bias

        console.log(`[NeuralClassifier] ✨ Initialized 2-layer network: ${inputSize} → ${hiddenSize} → ${outputSize}`);
    }
}
// Export
if (typeof window !== 'undefined') window.NeuralClassifier = NeuralClassifier;
if (typeof module !== 'undefined') module.exports = NeuralClassifier;
