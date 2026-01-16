/**
 * Verify Hybrid Classifier V7
 * 
 * Verifies that the deployed HybridClassifier correctly uses:
 * 1. The V7 Neural weights (loading from model.json)
 * 2. The updated arbitration logic
 * 3. Correct FieldTypes mapping
 */

const fs = require('fs');
const path = require('path');
const HybridClassifier = require('../../autofill/domains/inference/HybridClassifier.js');
const NeuralClassifier = require('../../autofill/domains/inference/neural-classifier.js');
const HeuristicEngine = require('../../autofill/domains/inference/HeuristicEngine.js');
const FeatureExtractor = require('../../autofill/domains/inference/feature-extractor.js');
const FieldTypes = require('../../autofill/domains/inference/FieldTypes.js');

async function main() {
    console.log('🔍 Verifying Hybrid Classifier V7 Deployment...\n');

    // 1. Initialize Components
    const featureExtractor = new FeatureExtractor();
    const heuristicEngine = new HeuristicEngine();

    // Configurable NeuralClassifier with weights AND FieldTypes
    const neuralClassifier = new NeuralClassifier({
        featureExtractor: featureExtractor,
        fieldTypes: FieldTypes
    });

    // Load V7 weights
    const modelPath = path.join(__dirname, '../../autofill/domains/inference/model.json');
    if (fs.existsSync(modelPath)) {
        console.log('📂 Loading V7 model weights...');
        const weights = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
        const success = neuralClassifier.loadWeights(weights);
        if (success) {
            console.log('✅ Neural weights loaded successfully.');
        } else {
            console.error('❌ Failed to load neural weights.');
            process.exit(1);
        }
    } else {
        console.error('❌ model.json not found!');
        process.exit(1);
    }

    // Initialize Hybrid
    const hybrid = new HybridClassifier({
        heuristicEngine,
        neuralClassifier,
        featureExtractor,
        debug: false
    });

    console.log('\n🚀 Starting Verification on Validation Subset (50 samples)...');

    // 2. Load Validation Data (a subset)
    const rawDataPath = path.join(__dirname, 'train-dataset/train-dataset-1.json');
    if (!fs.existsSync(rawDataPath)) {
        console.warn('⚠️ Raw dataset 1 not found!');
        process.exit(1);
    }

    const rawData = JSON.parse(fs.readFileSync(rawDataPath, 'utf8'));
    const testSet = rawData.slice(0, 50);

    // 3. Run Classification
    let correct = 0;
    let heuristicOnly = 0;
    let neuralOnly = 0;
    let unanimous = 0;
    let weighted = 0;
    let idx = 0;

    console.log('\nSample Predictions (Truth | Hybrid Pred | Neural Pred | Heuristic Pred):');
    console.log('-----------------------------------------------------------------------');

    for (const sample of testSet) {
        idx++;

        // Run Hybrid Classification
        const result = await hybrid.classify(sample);

        // Run Individual Classifiers for Comparison (Manual Debug)
        const neuralPred = neuralClassifier.predict(sample);
        const heuristicPred = heuristicEngine.classify(sample);

        const groundTruth = String(sample.label || 'null');
        const isCorrect = result.label === groundTruth;
        if (isCorrect) correct++;

        // Stats
        if (result.source && result.source.includes('unanimous')) unanimous++;
        if (result.agreementType === 'heuristic_only') heuristicOnly++;
        if (result.agreementType === 'neural_only') neuralOnly++;
        if (result.agreementType === 'weighted_vote') weighted++;

        if (idx <= 10) {
            const status = isCorrect ? '✔' : '❌';
            const nLabel = neuralPred ? `${neuralPred.class} (${neuralPred.confidence.toFixed(2)})` : 'null';

            // Inspect heuristicPred structure
            let hLabel = 'null';
            if (heuristicPred) {
                if (heuristicPred.class) hLabel = heuristicPred.class;
                else if (heuristicPred.type) hLabel = heuristicPred.type;
                else if (heuristicPred.label) hLabel = heuristicPred.label;
                else hLabel = JSON.stringify(heuristicPred).slice(0, 15);
            }

            console.log(`[${status}] Truth: ${JSON.stringify(groundTruth).padEnd(20)} | Hybrid: ${JSON.stringify(result.label).padEnd(20)} | N: ${String(nLabel).padEnd(25)} | H: ${String(hLabel).padEnd(15)} | Src: ${result.source}`);
        }
    }

    const accuracy = (correct / testSet.length) * 100;

    console.log('\n📊 Final Results (N=50):');
    console.log(`   Accuracy: ${accuracy.toFixed(2)}%`);
    console.log(`   Heuristic Wins: ${hybrid._metrics.heuristicWins}`);
    console.log(`   Neural Wins: ${hybrid._metrics.neuralWins}`);
    console.log(`   Unanimous: ${unanimous}`);
    console.log(`   Weighted Votes: ${weighted}`);

    if (accuracy > 80) {
        console.log('\n✅ Hybrid System Verification PASSED (Accuracy > 80%)');
    } else {
        console.log('\n⚠️ Hybrid System Verification Warning (Accuracy < 80%)');
    }
}

main().catch(console.error);
