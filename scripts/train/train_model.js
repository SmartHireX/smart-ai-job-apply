/**
 * Neural Network Training Script
 * Trains the NeuralClassifier on synthetic data
 * 
 * Usage: node scripts/train/train_model.js
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// MOCK BROWSER ENVIRONMENT
// ============================================================================
global.window = {};
global.chrome = {
    runtime: { getURL: (p) => p },
    storage: { local: { get: async () => ({}), set: async () => { } } }
};
global.performance = { now: () => Date.now() };

// Load dependencies
const FieldTypes = require('../../autofill/domains/inference/FieldTypes.js');
const FeatureExtractor = require('../../autofill/domains/inference/feature-extractor.js');
const HeuristicEngine = require('../../autofill/domains/inference/HeuristicEngine.js');

// Inject into window for NeuralClassifier to find
global.window.FieldTypes = FieldTypes;
global.window.FeatureExtractor = FeatureExtractor;
global.window.HeuristicEngine = HeuristicEngine;

const NeuralClassifier = require('../../autofill/domains/inference/neural-classifier.js');

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    datasetPath: path.join(__dirname, 'training_data.json'),
    outputPath: path.join(__dirname, '../../autofill/domains/inference/model_v4_baseline.json'),
    iterations: 500000,
    testSplit: 0.04, // 4% for testing (10k samples)
    logEvery: 50000,
    saveEvery: 100000
};

// ============================================================================
// TRAINING LOGIC
// ============================================================================
async function train() {
    console.log('🧠 Neural Classifier Training Script');
    console.log('====================================');

    // Load dataset
    console.log(`📂 Loading dataset from ${CONFIG.datasetPath}...`);
    const rawData = JSON.parse(fs.readFileSync(CONFIG.datasetPath, 'utf8'));
    console.log(`   Loaded ${rawData.length} samples`);

    // Split into train/test
    const splitIdx = Math.floor(rawData.length * (1 - CONFIG.testSplit));
    const trainData = rawData.slice(0, splitIdx);
    const testData = rawData.slice(splitIdx);
    console.log(`   Train: ${trainData.length}, Test: ${testData.length}`);

    // Initialize classifier
    console.log('🔧 Initializing NeuralClassifier...');
    const classifier = new NeuralClassifier({ debug: false });
    await classifier.init();
    console.log('   Classifier ready.');

    // Training loop
    console.log(`\n🏋️ Starting training (${CONFIG.iterations} iterations)...`);
    const startTime = Date.now();
    let losses = [];

    for (let i = 0; i < CONFIG.iterations; i++) {
        // Pick random sample
        const sample = trainData[Math.floor(Math.random() * trainData.length)];

        // Train on sample
        await classifier.train(sample.features, sample.label);

        // Logging
        if ((i + 1) % CONFIG.logEvery === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const samplesPerSec = ((i + 1) / elapsed).toFixed(0);
            console.log(`   Iteration ${i + 1}/${CONFIG.iterations} (${elapsed}s, ${samplesPerSec} samples/sec)`);
        }

        // Checkpoint
        if ((i + 1) % CONFIG.saveEvery === 0) {
            const weights = classifier.exportWeights();
            fs.writeFileSync(CONFIG.outputPath, JSON.stringify(weights, null, 2));
            console.log(`   💾 Checkpoint saved at iteration ${i + 1}`);
        }
    }

    // Final save
    const finalWeights = classifier.exportWeights();
    finalWeights.metadata = {
        trainingExamples: CONFIG.iterations,
        trainSetSize: trainData.length,
        testSetSize: testData.length,
        trainedAt: new Date().toISOString()
    };
    fs.writeFileSync(CONFIG.outputPath, JSON.stringify(finalWeights, null, 2));
    console.log(`\n✅ Training complete! Weights saved to ${CONFIG.outputPath}`);

    // ============================================================================
    // EVALUATION
    // ============================================================================
    console.log('\n📊 Evaluating on test set...');
    let correct = 0;
    let total = testData.length;

    for (const sample of testData) {
        const prediction = classifier.predict(sample.features);
        if (prediction.label === sample.label) {
            correct++;
        }
    }

    const accuracy = ((correct / total) * 100).toFixed(2);
    console.log(`   Accuracy: ${accuracy}% (${correct}/${total})`);

    // Per-class breakdown (top 5 worst)
    const classStats = {};
    for (const sample of testData) {
        if (!classStats[sample.label]) {
            classStats[sample.label] = { correct: 0, total: 0 };
        }
        classStats[sample.label].total++;
        const prediction = classifier.predict(sample.features);
        if (prediction.label === sample.label) {
            classStats[sample.label].correct++;
        }
    }

    const worstClasses = Object.entries(classStats)
        .map(([label, stats]) => ({ label, accuracy: stats.correct / stats.total }))
        .sort((a, b) => a.accuracy - b.accuracy)
        .slice(0, 5);

    console.log('\n   Worst performing classes:');
    worstClasses.forEach(c => {
        console.log(`     - ${c.label}: ${(c.accuracy * 100).toFixed(1)}%`);
    });

    console.log('\n🎉 Done!');
}

train().catch(console.error);
