
const NeuralClassifier = require('./autofill/domains/inference/neural-classifier.js');
const FeatureExtractor = require('./autofill/domains/inference/feature-extractor.js');
const FieldTypes = require('./autofill/domains/inference/FieldTypes.js');

// Mock browser environment
global.window = {};

async function runDebug() {
    console.log('🔧 Starting Inference Debug...');

    // 1. Initialize Classifier
    // (Dependencies should be auto-injected via new constructor if we pass them or if they are global)
    // We pass them explicitly to be safe.
    const classifier = new NeuralClassifier({
        debug: true,
        featureExtractor: new FeatureExtractor(),
        fieldTypes: FieldTypes
    });

    console.log('✅ Classifier initialized');
    // Check if FeatureExtractor is present
    if (classifier._featureExtractor) {
        console.log('✅ FeatureExtractor detected in classifier');
    } else {
        console.error('❌ FeatureExtractor NOT initialized in classifier!');
        return;
    }

    // Check internal weights (should be init in constructor)
    console.log(`   Weights initialized: ${classifier._W1 ? 'YES' : 'NO'}`);

    // 2. Create Mock Field
    const mockField = {
        label: "Email Address",
        name: "email",
        type: "email",
        placeholder: "example@domain.com",
        getAttribute: (attr) => mockField[attr] || null
    };

    // 3. Test Feature Extraction
    console.log('\n🧪 Testing Feature Extraction...');
    const features = classifier._featureExtractor.extract(mockField);
    console.log(`   Feature vector length: ${features.length}`);

    if (features.length !== 84) {
        console.error('❌ DIMENSION MISMATCH! Expected 84, got ' + features.length);
    } else {
        console.log('✅ Dimensions match (84)');
    }

    // 4. Test Prediction
    // If weights are missing (they shouldn't be), we can't predict.
    if (!classifier._W1) {
        console.error('❌ Weights are missing, cannot predict.');
        return;
    }

    console.log('\n🔮 Running Predict...');
    try {
        const result = await classifier.predict(mockField);
        console.log('   Prediction Result:', result);

        if (result.label === 'unknown' && result.confidence === 0) {
            console.warn('⚠️ Prediction low confidence (Expected with random weights)');
        } else {
            console.log('✅ Prediction returned valid confidence');
        }
    } catch (err) {
        console.error('❌ Process crashed:', err);
    }
}

runDebug().catch(console.error);
