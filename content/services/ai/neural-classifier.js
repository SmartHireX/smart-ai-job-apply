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

            // Work History
            'job_title',        // 15
            'company',          // 16
            'job_start_date',   // 17
            'job_end_date',     // 18
            'work_description', // 19

            // Education
            'school',           // 20
            'degree',           // 21
            'major',            // 22
            'gpa',              // 23
            'edu_start_date',   // 24
            'edu_end_date',     // 25

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

            // Misc
            'referral_source',  // 38
            'cover_letter',     // 39
            'generic_question'  // 40
        ];

        // WEIGHTS: (Placeholder)
        // In the future, we will load `model_v1.json` here.
        this.weights = null;
        this.bias = null;
    }

    async init() {
        console.log(`[NeuralClassifier] Initializing TinyML Engine for ${this.CLASSES.length} classes...`);

        // Try to load learned weights
        const loaded = await this.loadWeights();
        if (!loaded) {
            // First run: Initialize random weights
            this.weights = this.generateDummyWeights();
            console.log('[NeuralClassifier] 🆕 No saved weights. Initialized fresh model.');
        }

        console.log('[NeuralClassifier] Ready.');
    }

    /**
     * Predict the class of a field
     * @param {Object} field - Raw field object
     * @returns {Object} { label: string, confidence: number }
     */
    predict(field) {
        if (!this.weights) return { label: 'unknown', confidence: 0 };

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

        // 3. Inference (Dot Product + Softmax) - Only if heuristics fail
        if (!this.weights) {
            // If no heuristics and no weights, unknown.
            return { label: 'unknown', confidence: 0 };
        }

        const logits = this.computeLogits(inputVector);
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
            (field.parentContext || '') + ' ' + // NEW: Check Heading
            (field.siblingContext || '')        // NEW: Check Neighbors
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
     * Computes Z = Inputs * Weights + Bias
     */
    computeLogits(inputs) {
        return this.CLASSES.map((_, classIdx) => {
            let sum = this.bias[classIdx] || 0;
            // Loop unrolling optimization for speed not needed yet, simple loop is fine
            for (let i = 0; i < inputs.length; i++) {
                sum += inputs[i] * (this.weights[classIdx][i] || 0);
            }
            return sum;
        });
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
     * Using Stochastic Gradient Descent (SGD) with simple Delta Rule.
     * @param {Object} field - The input field object
     * @param {string} correctLabel - The ground truth label
     */
    async train(field, correctLabel) {
        if (!this.weights || !this.bias) return;

        const targetIndex = this.CLASSES.indexOf(correctLabel);
        if (targetIndex === -1) return;

        // 1. Forward Pass
        const inputs = this.featureExtractor.extract(field);
        const logits = this.computeLogits(inputs);
        const probs = this.softmax(logits);

        // 2. Compute Gradients (Cross-Entropy Loss derivative for Softmax)
        // dL/dz = prob - target (where target is 1 for correct class, 0 otherwise)
        const learningRate = 0.05; // Conservative learning rate

        for (let j = 0; j < this.CLASSES.length; j++) {
            const target = (j === targetIndex) ? 1 : 0;
            const error = probs[j] - target; // The delta

            // Update Bias
            this.bias[j] -= learningRate * error;

            // Update Weights
            for (let i = 0; i < inputs.length; i++) {
                if (inputs[i] !== 0) { // Optimization: sparse inputs
                    this.weights[j][i] -= learningRate * error * inputs[i];
                }
            }
        }

        console.log(`[NeuralClassifier] 🎓 Trained on "${correctLabel}" (Conf: ${probs[targetIndex].toFixed(2)} -> Target: 1.0)`);

        // Auto-save every few updates? For now, we save explicitly or can debounce.
        this.saveWeights();
    }

    async saveWeights() {
        const payload = {
            weights: this.weights,
            bias: this.bias,
            version: 1,
            timestamp: Date.now()
        };
        await chrome.storage.local.set({ 'neural_weights': payload });
    }

    async loadWeights() {
        try {
            const result = await chrome.storage.local.get('neural_weights');
            if (result.neural_weights) {
                this.weights = result.neural_weights.weights;
                this.bias = result.neural_weights.bias;
                console.log('[NeuralClassifier] 📂 Loaded trained weights from storage.');
                return true;
            }
        } catch (e) {
            console.error('[NeuralClassifier] Failed to load weights:', e);
        }
        return false;
    }

    // --- MOCK TRAINING DATA ---
    generateDummyWeights() {
        const inputSize = 51; // From FeatureExtractor (was 31, now +20 for context)
        const outputSize = this.CLASSES.length;

        // Initialize random small weights (He Initialization-ish)
        const w = [];
        for (let c = 0; c < outputSize; c++) {
            const row = [];
            for (let i = 0; i < inputSize; i++) {
                row.push((Math.random() - 0.5) * 0.1);
            }
            w.push(row);
        }

        this.bias = new Array(outputSize).fill(0);
        return w;
    }
}

// Export
if (typeof window !== 'undefined') window.NeuralClassifier = NeuralClassifier;
if (typeof module !== 'undefined') module.exports = NeuralClassifier;
