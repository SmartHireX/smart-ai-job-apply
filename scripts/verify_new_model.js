const fs = require('fs');
const path = require('path');

// Mock Browser Environment
global.window = {};

// Load Modules
const FeatureExtractor = require('../autofill/domains/inference/feature-extractor.js');
const NeuralClassifierV8 = require('../autofill/domains/inference/neural-classifier-v8.js');
const FieldTypes = require('../autofill/domains/inference/FieldTypes.js');

// Load Weights
try {
    const weightsPath = path.join(__dirname, '../autofill/domains/inference/model_v8.json');
    if (!fs.existsSync(weightsPath)) {
        console.error(`❌ Model file not found at: ${weightsPath}`);
        process.exit(1);
    }
    const weights = JSON.parse(fs.readFileSync(weightsPath, 'utf8'));

    async function runDebug() {
        // console.log('🔍 Final Model Verification (V8)...');
        // console.log(`Weights Timestamp: ${weights.timestamp ? new Date(weights.timestamp).toISOString() : 'N/A'}`);

        const featureExtractor = new FeatureExtractor();
        const classifier = new NeuralClassifierV8({
            fieldTypes: FieldTypes,
            debug: false
        });

        // Initialize V8 weights
        if (!classifier.loadWeights(weights)) {
            console.error('❌ Failed to load weights into NeuralClassifierV8');
            return;
        }

        // console.log('✅ Weights loaded successfully.');

        // Test Case: Last Name (Isolated)
        const field = {
            name: 'lastName',
            id: 'lastName',
            label: 'Last Name',
            parentContext: 'Personal Information',
            siblingContext: '', // Should be empty/ignored
            placeholder: 'Enter last name',
            type: 'text'
        };

        // console.log(`\n----------------------------------------`);
        // console.log(`Test Field 1: ${field.label}`);
        const features = featureExtractor.extract(field);
        const result = classifier.predict(features);

        // console.log(`Predicted Label: ${result.label}`);
        // console.log(`Confidence:      ${result.confidence.toFixed(4)}`);

        if (result.confidence > 0.35 && result.label === 'last_name') {
            // console.log('✅ SUCCESS: Model correctly identifies Last Name without sibling context.');
        } else {
            // console.log(`❌ FAILURE: Expected 'last_name', got '${result.label}' or low confidence.`);
        }

        // Test Case: Email (Isolated)
        const emailField = {
            name: 'email',
            id: 'email',
            label: 'Email Address',
            parentContext: 'Contact Info',
            siblingContext: '',
            placeholder: 'test@example.com',
            type: 'email'
        };

        // console.log(`\n----------------------------------------`);
        // console.log(`Test Field 2: ${emailField.label}`);
        const emailResult = classifier.predict(featureExtractor.extract(emailField));
        // console.log(`Predicted Label: ${emailResult.label}`);
        // console.log(`Confidence:      ${emailResult.confidence.toFixed(4)}`);

        if (emailResult.confidence > 0.35 && emailResult.label === 'email') {
            // console.log('✅ SUCCESS: Model correctly identifies Email.');
        } else {
            // console.log(`❌ FAILURE: Expected 'email', got '${emailResult.label}' or low confidence.`);
        }
    }

    runDebug();
} catch (e) {
    console.error('Error running verification:', e);
}
