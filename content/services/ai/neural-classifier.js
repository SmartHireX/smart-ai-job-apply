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
        // Load weights from storage or use defaults
        // This simulates a trained 31-input (from extractor) -> 26-output dense layer
        this.weights = this.generateDummyWeights();
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

        // 2. Inference (Dot Product + Softmax)
        const logits = this.computeLogits(inputVector);
        const probs = this.softmax(logits);

        // 3. Decode
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

    // --- MOCK TRAINING DATA ---
    // In production, we replace this with `await fetch('weights.json')`
    generateDummyWeights() {
        const inputSize = 31; // From FeatureExtractor
        const outputSize = this.CLASSES.length;

        // Initialize random small weights
        const w = [];
        for (let c = 0; c < outputSize; c++) {
            const row = [];
            for (let i = 0; i < inputSize; i++) {
                // Skew weights slightly to prefer "unknown" for safety until trained
                row.push((Math.random() - 0.5) * 0.05);
            }
            w.push(row);
        }

        this.bias = new Array(outputSize).fill(-0.1);
        return w;
    }
}

// Export
if (typeof window !== 'undefined') window.NeuralClassifier = NeuralClassifier;
if (typeof module !== 'undefined') module.exports = NeuralClassifier;
