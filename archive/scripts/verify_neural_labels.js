/**
 * Verification Script for Neural Classifier Labels
 * 
 * Purpose: Verify that passing `fieldTypes` to NeuralClassifier results in
 * human-readable labels (e.g., "first_name") instead of "class_N".
 */

const fs = require('fs');
const path = require('path');

// Load dependencies
// Adjust paths as needed based on where this script is run
const FieldTypes = require('../../autofill/domains/inference/FieldTypes.js');
const NeuralClassifier = require('../../autofill/domains/inference/neural-classifier.js');

const CONFIG = {
    // Using the dataset found earlier
    trainDataPath: path.join(__dirname, 'train-dataset-v3.json'),
    modelPath: path.join(__dirname, '../../autofill/domains/inference/model_v7.json'),
    sampleSize: 20 // Check first 20 samples
};

async function verify() {
    console.log('🔍 Starting Neural Classifier Label Verification...');

    // 1. Load Data
    if (!fs.existsSync(CONFIG.trainDataPath)) {
        console.error(`❌ Data file not found: ${CONFIG.trainDataPath}`);
        process.exit(1);
    }
    const rawData = fs.readFileSync(CONFIG.trainDataPath, 'utf8');
    const data = JSON.parse(rawData);
    console.log(`✅ Loaded ${data.length} samples from train-dataset-v3.json`);

    // 2. Load Weights
    if (!fs.existsSync(CONFIG.modelPath)) {
        console.error(`❌ Model file not found: ${CONFIG.modelPath}`);
        process.exit(1);
    }
    const weights = JSON.parse(fs.readFileSync(CONFIG.modelPath, 'utf8'));
    console.log(`✅ Loaded model weights from model_v7.json`);

    // 3. Initialize Classifier WITH FieldTypes (The Fix)
    console.log('\n🤖 Initializing NeuralClassifier with fieldTypes...');
    const classifier = new NeuralClassifier({
        fieldTypes: FieldTypes
    }); // Fix: passing config

    // Load weights
    classifier.loadWeights(weights);

    // 4. Test Predictions
    console.log(`\n🧪 Testing first ${CONFIG.sampleSize} samples...`);

    let correctLabelFormat = 0;
    let rawLabelFormat = 0;
    let errors = 0;

    const samples = data.slice(0, CONFIG.sampleSize);

    samples.forEach((sample, i) => {
        const result = classifier.predict(sample.features);

        if (!result) {
            console.log(`[${i}] No result`);
            return;
        }

        const label = result.label;
        const isRaw = label.startsWith('class_') && !isNaN(parseInt(label.split('_')[1]));
        const isReadable = !isRaw && label !== 'unknown';

        console.log(`[${i}] Prediction: "${label}" (Conf: ${result.confidence.toFixed(4)}) - Type: ${isRaw ? 'RAW (BAD)' : 'READABLE (GOOD)'}`);

        if (isRaw) {
            rawLabelFormat++;
        } else {
            correctLabelFormat++;
        }
    });

    // 5. Summary
    console.log('\n📊 Verification Summary');
    console.log('=======================');
    console.log(`Total Samples: ${samples.length}`);
    console.log(`Readable Labels (GOOD): ${correctLabelFormat}`);
    console.log(`Raw Labels (BAD): ${rawLabelFormat}`);

    if (rawLabelFormat === 0 && correctLabelFormat > 0) {
        console.log('\n✅ PASS: Classifier is returning human-readable labels.');
    } else {
        console.log('\n❌ FAIL: Classifier returned raw class indices.');
    }
}

verify().catch(console.error);
