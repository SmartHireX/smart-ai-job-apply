/**
 * Offline Training Script for TinyML Baseline Model
 * 
 * Usage: node scripts/train_baseline.js
 * 
 * Generates synthetic training data and trains the 2-layer neural network
 * to create baseline weights that ship with the extension.
 */

const fs = require('fs');
const path = require('path');

// Import classifier (modify paths as needed for Node.js)
// For now, we'll inline a simplified version
class SimpleFeatureExtractor {
    extract(field) {
        const vector = new Array(56).fill(0);

        // Simple bag-of-words hashing
        const text = `${field.label} ${field.name} ${field.placeholder || ''}`.toLowerCase();
        const words = text.split(/\W+/).filter(w => w.length > 2);

        words.forEach(word => {
            let hash = 0;
            for (let i = 0; i < word.length; i++) {
                hash = ((hash << 5) - hash) + word.charCodeAt(i);
                hash |= 0;
            }
            const index = Math.abs(hash) % 30; // Use first 30 slots
            vector[index] = 1.0;
        });

        // Type features
        if (field.type === 'email') vector[50] = 1.0;
        if (field.type === 'tel') vector[51] = 1.0;
        if (field.type === 'text') vector[52] = 1.0;

        return vector;
    }
}

// Simplified 2-layer network (matches your NeuralClassifier)
class TrainingNetwork {
    constructor() {
        this.HIDDEN_SIZE = 20;
        this.LEAKY_RELU_ALPHA = 0.01;
        this.L2_LAMBDA = 0.01;
        this.CLASSES = [
            'unknown', 'first_name', 'last_name', 'full_name', 'email', 'phone',
            'linkedin', 'github', 'portfolio', 'website',
            'address', 'city', 'state', 'zip_code', 'country',
            'job_title', 'company', 'job_start_date', 'job_end_date', 'work_description',
            'school', 'degree', 'major', 'gpa', 'edu_start_date', 'edu_end_date',
            'gender', 'race', 'veteran', 'disability',
            'salary_current', 'salary_expected',
            'work_auth', 'sponsorship', 'citizenship', 'clearance', 'legal_age', 'tax_id',
            'referral_source', 'cover_letter', 'generic_question'
        ];

        this.featureExtractor = new SimpleFeatureExtractor();
        this.totalSamples = 0;
        this.initializeWeights();
    }

    initializeWeights() {
        const inputSize = 56;
        const hiddenSize = this.HIDDEN_SIZE;
        const outputSize = this.CLASSES.length;

        // He initialization for W1
        this.W1 = [];
        const heScale = Math.sqrt(2.0 / inputSize);
        for (let i = 0; i < inputSize; i++) {
            this.W1[i] = [];
            for (let h = 0; h < hiddenSize; h++) {
                this.W1[i][h] = (Math.random() - 0.5) * 2 * heScale;
            }
        }
        this.b1 = new Array(hiddenSize).fill(0);

        // Xavier initialization for W2
        this.W2 = [];
        const xavierScale = Math.sqrt(1.0 / hiddenSize);
        for (let h = 0; h < hiddenSize; h++) {
            this.W2[h] = [];
            for (let c = 0; c < outputSize; c++) {
                this.W2[h][c] = (Math.random() - 0.5) * 2 * xavierScale;
            }
        }
        this.b2 = new Array(outputSize).fill(0);
    }

    leakyReLU(x) {
        return x > 0 ? x : this.LEAKY_RELU_ALPHA * x;
    }

    leakyReLU_derivative(x) {
        return x > 0 ? 1 : this.LEAKY_RELU_ALPHA;
    }

    forward(inputs) {
        // Layer 1
        const z1 = new Array(this.HIDDEN_SIZE).fill(0);
        for (let h = 0; h < this.HIDDEN_SIZE; h++) {
            z1[h] = this.b1[h];
            for (let i = 0; i < inputs.length; i++) {
                z1[h] += inputs[i] * this.W1[i][h];
            }
        }
        const hidden = z1.map(z => this.leakyReLU(z));

        // Layer 2
        const logits = new Array(this.CLASSES.length).fill(0);
        for (let c = 0; c < this.CLASSES.length; c++) {
            logits[c] = this.b2[c];
            for (let h = 0; h < this.HIDDEN_SIZE; h++) {
                logits[c] += hidden[h] * this.W2[h][c];
            }
        }

        return { logits, hidden, z1 };
    }

    softmax(logits) {
        const maxLogit = Math.max(...logits);
        const exps = logits.map(l => Math.exp(l - maxLogit));
        const sumExps = exps.reduce((a, b) => a + b, 0);
        return exps.map(e => e / sumExps);
    }

    train(field, correctLabel) {
        const targetIndex = this.CLASSES.indexOf(correctLabel);
        if (targetIndex === -1) return;

        const inputs = this.featureExtractor.extract(field);
        const { logits, hidden, z1 } = this.forward(inputs);
        const probs = this.softmax(logits);

        // Adaptive learning rate
        const baseLR = 0.05;
        const learningRate = baseLR * Math.exp(-0.0001 * this.totalSamples);
        this.totalSamples++;

        // Backprop - Output layer
        const dLogits = new Array(this.CLASSES.length);
        for (let c = 0; c < this.CLASSES.length; c++) {
            const target = (c === targetIndex) ? 1 : 0;
            dLogits[c] = probs[c] - target;
        }

        // Update W2, b2
        for (let h = 0; h < this.HIDDEN_SIZE; h++) {
            for (let c = 0; c < this.CLASSES.length; c++) {
                const grad = dLogits[c] * hidden[h] + this.L2_LAMBDA * this.W2[h][c];
                this.W2[h][c] -= learningRate * grad;
            }
        }
        for (let c = 0; c < this.CLASSES.length; c++) {
            this.b2[c] -= learningRate * dLogits[c];
        }

        // Backprop - Hidden layer
        const dHidden = new Array(this.HIDDEN_SIZE).fill(0);
        for (let h = 0; h < this.HIDDEN_SIZE; h++) {
            for (let c = 0; c < this.CLASSES.length; c++) {
                dHidden[h] += dLogits[c] * this.W2[h][c];
            }
            dHidden[h] *= this.leakyReLU_derivative(z1[h]);
        }

        // Update W1, b1
        for (let i = 0; i < inputs.length; i++) {
            for (let h = 0; h < this.HIDDEN_SIZE; h++) {
                if (inputs[i] !== 0) {
                    const grad = dHidden[h] * inputs[i] + this.L2_LAMBDA * this.W1[i][h];
                    this.W1[i][h] -= learningRate * grad;
                }
            }
        }
        for (let h = 0; h < this.HIDDEN_SIZE; h++) {
            this.b1[h] -= learningRate * dHidden[h];
        }

        return probs[targetIndex]; // Return confidence
    }
}

// Generate synthetic training data
function generateTrainingData() {
    return [
        // Personal Info
        { label: 'First Name', name: 'fname', type: 'text', placeholder: 'John', class: 'first_name' },
        { label: 'First Name', name: 'first_name', type: 'text', class: 'first_name' },
        { label: 'Given Name', name: 'given_name', type: 'text', class: 'first_name' },

        { label: 'Last Name', name: 'lname', type: 'text', placeholder: 'Doe', class: 'last_name' },
        { label: 'Last Name', name: 'last_name', type: 'text', class: 'last_name' },
        { label: 'Family Name', name: 'family_name', type: 'text', class: 'last_name' },
        { label: 'Surname', name: 'surname', type: 'text', class: 'last_name' },

        { label: 'Full Name', name: 'name', type: 'text', class: 'full_name' },
        { label: 'Your Name', name: 'full_name', type: 'text', class: 'full_name' },

        { label: 'Email', name: 'email', type: 'email', placeholder: 'you@example.com', class: 'email' },
        { label: 'Email Address', name: 'email_address', type: 'email', class: 'email' },
        { label: 'E-mail', name: 'user_email', type: 'email', class: 'email' },

        { label: 'Phone', name: 'phone', type: 'tel', placeholder: '123-456-7890', class: 'phone' },
        { label: 'Phone Number', name: 'phone_number', type: 'tel', class: 'phone' },
        { label: 'Mobile', name: 'mobile', type: 'tel', class: 'phone' },
        { label: 'Contact Number', name: 'contact', type: 'tel', class: 'phone' },

        // Social Links
        { label: 'LinkedIn', name: 'linkedin', type: 'text', placeholder: 'linkedin.com/in/...', class: 'linkedin' },
        { label: 'LinkedIn Profile', name: 'linkedin_url', type: 'text', class: 'linkedin' },

        { label: 'GitHub', name: 'github', type: 'text', placeholder: 'github.com/...', class: 'github' },
        { label: 'GitHub Profile', name: 'github_url', type: 'text', class: 'github' },

        { label: 'Portfolio', name: 'portfolio', type: 'text', class: 'portfolio' },
        { label: 'Website', name: 'website', type: 'text', class: 'website' },
        { label: 'Personal Website', name: 'personal_site', type: 'text', class: 'portfolio' },

        // Location
        { label: 'Address', name: 'address', type: 'text', class: 'address' },
        { label: 'Street Address', name: 'street_address', type: 'text', class: 'address' },

        { label: 'City', name: 'city', type: 'text', placeholder: 'New York', class: 'city' },
        { label: 'City', name: 'location_city', type: 'text', class: 'city' },

        { label: 'State', name: 'state', type: 'text', placeholder: 'NY', class: 'state' },
        { label: 'State/Province', name: 'state_province', type: 'text', class: 'state' },

        { label: 'Zip Code', name: 'zip', type: 'text', placeholder: '10001', class: 'zip_code' },
        { label: 'Postal Code', name: 'postal_code', type: 'text', class: 'zip_code' },
        { label: 'ZIP', name: 'zipcode', type: 'text', class: 'zip_code' },

        { label: 'Country', name: 'country', type: 'text', class: 'country' },

        // Work History
        { label: 'Job Title', name: 'job_title', type: 'text', placeholder: 'Software Engineer', class: 'job_title' },
        { label: 'Position', name: 'position', type: 'text', class: 'job_title' },
        { label: 'Role', name: 'role', type: 'text', class: 'job_title' },
        { label: 'Current Title', name: 'current_title', type: 'text', class: 'job_title' },

        { label: 'Company', name: 'company', type: 'text', placeholder: 'Google', class: 'company' },
        { label: 'Employer', name: 'employer', type: 'text', class: 'company' },
        { label: 'Organization', name: 'organization', type: 'text', class: 'company' },
        { label: 'Company Name', name: 'company_name', type: 'text', class: 'company' },

        { label: 'Start Date', name: 'start_date', type: 'text', parentContext: 'Work Experience', class: 'job_start_date' },
        { label: 'From', name: 'from_date', type: 'text', parentContext: 'Employment History', class: 'job_start_date' },

        { label: 'End Date', name: 'end_date', type: 'text', parentContext: 'Work Experience', class: 'job_end_date' },
        { label: 'To', name: 'to_date', type: 'text', parentContext: 'Employment History', class: 'job_end_date' },

        // Education
        { label: 'School', name: 'school', type: 'text', placeholder: 'MIT', class: 'school' },
        { label: 'University', name: 'university', type: 'text', class: 'school' },
        { label: 'College', name: 'college', type: 'text', class: 'school' },
        { label: 'Institution', name: 'institution', type: 'text', class: 'school' },

        { label: 'Degree', name: 'degree', type: 'text', placeholder: 'Bachelor of Science', class: 'degree' },
        { label: 'Degree Type', name: 'degree_type', type: 'text', class: 'degree' },

        { label: 'Major', name: 'major', type: 'text', placeholder: 'Computer Science', class: 'major' },
        { label: 'Field of Study', name: 'field_of_study', type: 'text', class: 'major' },

        { label: 'GPA', name: 'gpa', type: 'text', placeholder: '3.8', class: 'gpa' },
        { label: 'Grade', name: 'grade', type: 'text', class: 'gpa' },

        { label: 'Start Date', name: 'start_date', type: 'text', parentContext: 'Education', class: 'edu_start_date' },
        { label: 'End Date', name: 'end_date', type: 'text', parentContext: 'Education', class: 'edu_end_date' },

        // Demographics
        { label: 'Gender', name: 'gender', type: 'text', class: 'gender' },
        { label: 'Gender Identity', name: 'gender_identity', type: 'text', class: 'gender' },

        { label: 'Race', name: 'race', type: 'text', class: 'race' },
        { label: 'Ethnicity', name: 'ethnicity', type: 'text', class: 'race' },

        { label: 'Veteran Status', name: 'veteran', type: 'text', class: 'veteran' },
        { label: 'Disability', name: 'disability', type: 'text', class: 'disability' },

        // Compensation
        { label: 'Current Salary', name: 'current_salary', type: 'text', placeholder: '$100,000', class: 'salary_current' },
        { label: 'Current Compensation', name: 'current_ctc', type: 'text', class: 'salary_current' },

        { label: 'Expected Salary', name: 'expected_salary', type: 'text', class: 'salary_expected' },
        { label: 'Desired Pay', name: 'desired_pay', type: 'text', class: 'salary_expected' },

        // Legal
        { label: 'Work Authorization', name: 'work_auth', type: 'text', class: 'work_auth' },
        { label: 'Legal Authorization', name: 'legal_auth', type: 'text', class: 'work_auth' },

        { label: 'Sponsorship', name: 'sponsorship', type: 'text', class: 'sponsorship' },
        { label: 'Require Sponsorship', name: 'require_sponsorship', type: 'text', class: 'sponsorship' },

        { label: 'Citizenship', name: 'citizenship', type: 'text', class: 'citizenship' },
        { label: 'Citizenship Status', name: 'citizenship_status', type: 'text', class: 'citizenship' },

        { label: 'Security Clearance', name: 'clearance', type: 'text', class: 'clearance' },
        { label: 'Clearance Level', name: 'clearance_level', type: 'text', class: 'clearance' },

        { label: 'Are you 18+?', name: 'legal_age', type: 'text', class: 'legal_age' },
        { label: 'Over 18', name: 'age_verification', type: 'text', class: 'legal_age' },

        // Misc
        { label: 'How did you hear about us?', name: 'referral_source', type: 'text', class: 'referral_source' },
        { label: 'Referral', name: 'referral', type: 'text', class: 'referral_source' },

        { label: 'Cover Letter', name: 'cover_letter', type: 'textarea', class: 'cover_letter' },
    ];
}

// Main training function
function trainModel() {
    console.log('🚀 Starting offline training...\n');

    const network = new TrainingNetwork();
    const trainingData = generateTrainingData();

    console.log(`📊 Training data: ${trainingData.length} examples`);
    console.log(`🏗️ Network: 56 → 20 (Leaky ReLU) → ${network.CLASSES.length}`);
    console.log(`⚙️ Params: ${56 * 20 + 20 + 20 * network.CLASSES.length + network.CLASSES.length} = ~2,001\n`);

    const EPOCHS = 1000;
    const REPORT_INTERVAL = 100;

    for (let epoch = 1; epoch <= EPOCHS; epoch++) {
        let totalLoss = 0;
        let correctPredictions = 0;

        // Shuffle training data
        const shuffled = trainingData.sort(() => Math.random() - 0.5);

        for (const example of shuffled) {
            const confidence = network.train(example, example.class);
            if (confidence > 0.5) correctPredictions++;
            totalLoss += (1 - confidence);
        }

        const avgLoss = totalLoss / trainingData.length;
        const accuracy = (correctPredictions / trainingData.length) * 100;

        if (epoch % REPORT_INTERVAL === 0 || epoch === 1) {
            console.log(`Epoch ${epoch}/${EPOCHS} | Loss: ${avgLoss.toFixed(4)} | Accuracy: ${accuracy.toFixed(2)}%`);
        }
    }

    console.log('\n✅ Training complete!\n');

    // Export weights
    const weights = {
        W1: network.W1,
        b1: network.b1,
        W2: network.W2,
        b2: network.b2,
        totalSamples: network.totalSamples,
        version: 2,
        timestamp: Date.now(),
        metadata: {
            inputSize: 56,
            hiddenSize: network.HIDDEN_SIZE,
            outputSize: network.CLASSES.length,
            trainingExamples: trainingData.length,
            epochs: EPOCHS
        }
    };

    const outputPath = path.join(__dirname, '..', 'content', 'services', 'ai', 'model_v2_baseline.json');
    fs.writeFileSync(outputPath, JSON.stringify(weights, null, 2));

    const sizeKB = (JSON.stringify(weights).length / 1024).toFixed(2);
    console.log(`💾 Exported weights to: ${outputPath}`);
    console.log(`📦 File size: ${sizeKB} KB\n`);

    console.log('🎉 Done! You can now load these weights in NeuralClassifier.init()');
}

// Run training
trainModel();
