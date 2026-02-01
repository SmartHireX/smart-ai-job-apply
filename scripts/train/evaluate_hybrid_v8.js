const HybridClassifier = require('../../autofill/domains/inference/HybridClassifier.js');
const NeuralClassifierV8 = require('../../autofill/domains/inference/neural-classifier-v8.js');
const HeuristicEngine = require('../../autofill/domains/inference/HeuristicEngine.js');
const FeatureExtractor = require('../../autofill/domains/inference/feature-extractor.js');
const FieldTypes = require('../../autofill/domains/inference/FieldTypes.js');
const fs = require('fs');
const path = require('path');

async function evaluateHybrid() {
    // console.log('🚀 Starting HybridClassifier V8 Evaluation...');

    // 1. Initialize Components
    const featureExtractor = new FeatureExtractor();
    const heuristicEngine = new HeuristicEngine();
    const neuralClassifier = new NeuralClassifierV8({
        fieldTypes: FieldTypes
    });

    // Load trained model
    const modelPath = path.join(__dirname, '../../autofill/domains/inference/model_v8.json');
    if (fs.existsSync(modelPath)) {
        // console.log('📦 Loading V8 Model...');
        const modelData = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
        await neuralClassifier.loadWeights(modelData);
    } else {
        console.error('❌ Model V8 not found at:', modelPath);
        process.exit(1);
    }

    // 2. Initialize Hybrid with V8
    const hybrid = new HybridClassifier({
        heuristicEngine,
        neuralClassifier,
        featureExtractor,
        debug: false
    });

    // 3. Load Dataset (Use Augmented Dataset for Raw Attributes)
    const datasetPath = path.join(__dirname, 'train-dataset-augmented.json');
    // console.log('📂 Loading Dataset:', datasetPath);
    const data = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

    // 4. Run Inference
    let correct = 0;
    let total = 0;
    let sourceStats = {
        ensemble_unanimous: 0,
        ensemble_heuristic_strong: 0,
        ensemble_neural_strong: 0,
        ensemble_heuristic_weighted: 0,
        ensemble_neural_weighted: 0,
        ensemble_heuristic_fallback: 0,
        ensemble_neural_fallback: 0,
        ensemble_ambiguous: 0,
        heuristic_only: 0,
        neural_only: 0,
        both_failed: 0
    };

    // console.log(`⚡ Processing ${data.length} samples...`);

    // Using a subset for speed if needed, but full run is better
    const samples = data;
    const startTime = Date.now();

    for (const sample of samples) {
        // Construct Field Object from dataset "features" (which are actually attributes in this file)
        const rawAttributes = sample.features;

        // HybridClassifier expects { name, id, placeholder, label, etc. }
        // The dataset has these keys directly in rawAttributes
        const field = {
            name: rawAttributes.name || '',
            id: rawAttributes.automationId || '', // automationId often maps to ID
            label: rawAttributes.label || '',
            placeholder: rawAttributes.placeholder || '',
            type: 'text', // Defaulting to text input
            parentContext: rawAttributes.parentContext || '',
            siblingContext: rawAttributes.siblingContext || ''
        };

        const result = await hybrid.classify(field);

        // Ground Truth
        const groundTruth = sample.label;

        // Check Correctness
        // Hybrid V8 might return 'unknown' or a class. match is exact string match.
        if (result.label === groundTruth) {
            correct++;
        }

        // Stats
        total++;
        if (result.agreementType) {
            sourceStats[result.agreementType] = (sourceStats[result.agreementType] || 0) + 1;
        }

        // Only log Both Failed if the ground truth was ACTUALLY a specific class we missed
        if (result.agreementType === 'both_failed' && groundTruth !== 'unknown' && sourceStats.both_failed_meaningful <= 20) {
            sourceStats.both_failed_meaningful = (sourceStats.both_failed_meaningful || 0) + 1;
            // console.log(`\n❌ BOTH FAIL #${sourceStats.both_failed_meaningful} (Truth: ${groundTruth}):`);
            // console.log(`   Attributes: name="${field.name}", id="${field.id}", label="${field.label}", placeholder="${field.placeholder}"`);
            // Re-run for debug
            const features = await hybrid._extractFeatures(field);
            const neuralRaw = await neuralClassifier.predict(features);
            const heuristicRaw = await heuristicEngine.classify(field);

            // console.log(`   Neural: ${JSON.stringify(neuralRaw)}`);
            // console.log(`   Heuristic: ${JSON.stringify(heuristicRaw)}`);
        }

        if (total % 1000 === 0) {
            process.stdout.write(`\rProgress: ${total}/${samples.length} | Acc: ${((correct / total) * 100).toFixed(2)}%`);
        }
    }

    const duration = (Date.now() - startTime) / 1000;
    // console.log(`\n\n✅ Evaluation Complete in ${duration.toFixed(2)}s`);
    // console.log(`--------------------------------------------------`);
    // console.log(`Total Samples: ${total}`);
    // console.log(`Accuracy:      ${((correct / total) * 100).toFixed(2)}% (${correct}/${total})`);
    // console.log(`--------------------------------------------------`);
    // console.log(`Source Breakdown:`);
    Object.entries(sourceStats).forEach(([key, val]) => {
        if (val > 0) // console.log(`  ${key.padEnd(30)}: ${val} (${((val / total) * 100).toFixed(1)}%)`);
    });
}

evaluateHybrid();
