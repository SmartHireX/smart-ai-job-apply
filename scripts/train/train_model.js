/**
 * Robust Neural Network Training Script V4
 * Uses folder-based data organization: train-dataset/ and test-dataset/
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
    // Folder-based paths
    trainFolder: path.join(__dirname, 'train-dataset'),
    testFolder: path.join(__dirname, 'test-dataset'),
    outputPath: path.join(__dirname, '../../autofill/domains/inference/model_v4_baseline.json'),
    iterations: 500000,
    logEvery: 50000,
    saveEvery: 100000
};

// ============================================================================
// DATA LOADING
// ============================================================================
function loadDatasetsFromFolder(folderPath) {
    let merged = [];
    if (!fs.existsSync(folderPath)) {
        console.warn(`   ⚠️ Folder not found: ${folderPath}`);
        return merged;
    }

    const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.json'));
    for (const file of files) {
        const filePath = path.join(folderPath, file);
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            console.log(`   Loaded ${data.length} samples from ${file}`);
            merged = merged.concat(data);
        } catch (e) {
            console.warn(`   ⚠️ Failed to parse ${file}: ${e.message}`);
        }
    }
    return merged;
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function balanceDataset(data) {
    // Count samples per class
    const classCounts = {};
    for (const sample of data) {
        classCounts[sample.label] = (classCounts[sample.label] || 0) + 1;
    }

    // Find median count (not max, to avoid extreme oversampling)
    const counts = Object.values(classCounts);
    counts.sort((a, b) => a - b);
    const medianCount = counts[Math.floor(counts.length / 2)];
    const targetCount = Math.max(medianCount, 20); // At least 20 per class

    // Oversample minority classes up to target (but not beyond 3x original)
    const balanced = [...data];
    for (const sample of data) {
        const currentCount = classCounts[sample.label];
        if (currentCount < targetCount) {
            const oversamplFactor = Math.min(Math.floor(targetCount / currentCount), 3) - 1;
            for (let i = 0; i < oversamplFactor; i++) {
                balanced.push({ ...sample });
            }
        }
    }

    return shuffleArray(balanced);
}

// ============================================================================
// TRAINING LOGIC
// ============================================================================
async function train() {
    console.log('🧠 Neural Classifier Training Script V4');
    console.log('========================================');

    // Load training data from folder
    console.log('\n📂 Loading TRAINING datasets from train-dataset/...');
    let trainData = loadDatasetsFromFolder(CONFIG.trainFolder);
    console.log(`   Total training samples: ${trainData.length}`);

    // Load test data from folder
    console.log('\n📂 Loading TEST datasets from test-dataset/...');
    let testData = loadDatasetsFromFolder(CONFIG.testFolder);
    console.log(`   Total test samples: ${testData.length}`);

    if (trainData.length === 0) {
        console.error('❌ No training data found!');
        return;
    }

    if (testData.length === 0) {
        console.warn('⚠️ No test data found, will use 10% of training for testing');
        trainData = shuffleArray(trainData);
        const splitIdx = Math.floor(trainData.length * 0.9);
        testData = trainData.slice(splitIdx);
        trainData = trainData.slice(0, splitIdx);
    }

    // Balance the training dataset
    console.log('\n⚖️ Balancing training dataset...');
    trainData = balanceDataset(trainData);
    console.log(`   Balanced training samples: ${trainData.length}`);

    // Show class distribution
    const classDist = {};
    for (const s of trainData) {
        classDist[s.label] = (classDist[s.label] || 0) + 1;
    }
    const numClasses = Object.keys(classDist).length;
    console.log(`\n📊 Training on ${numClasses} classes:`);
    Object.entries(classDist)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([k, v]) => console.log(`   ${k}: ${v}`));
    if (numClasses > 10) console.log(`   ... and ${numClasses - 10} more`);

    // Initialize classifier
    console.log('\n🔧 Initializing NeuralClassifier...');
    const classifier = new NeuralClassifier({ debug: false });
    await classifier.init();
    console.log('   Classifier ready.');

    // Training loop
    console.log(`\n🏋️ Starting training (${CONFIG.iterations} iterations)...`);
    const startTime = Date.now();

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
        trainingIterations: CONFIG.iterations,
        trainSetSize: trainData.length,
        testSetSize: testData.length,
        numClasses: numClasses,
        trainedAt: new Date().toISOString()
    };
    fs.writeFileSync(CONFIG.outputPath, JSON.stringify(finalWeights, null, 2));
    console.log(`\n✅ Training complete! Weights saved to ${CONFIG.outputPath}`);

    // ============================================================================
    // EVALUATION
    // ============================================================================
    console.log('\n📊 Evaluating on TEST set...');
    let correct = 0;
    let total = testData.length;

    const confusionMatrix = {};
    for (const sample of testData) {
        const prediction = classifier.predict(sample.features);
        const pred = prediction.label;
        const actual = sample.label;

        if (pred === actual) {
            correct++;
        }

        // Track confusion
        if (!confusionMatrix[actual]) confusionMatrix[actual] = {};
        confusionMatrix[actual][pred] = (confusionMatrix[actual][pred] || 0) + 1;
    }

    const accuracy = ((correct / total) * 100).toFixed(2);
    console.log(`\n   🎯 OVERALL ACCURACY: ${accuracy}% (${correct}/${total})`);

    // Per-class breakdown
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

    const sortedClasses = Object.entries(classStats)
        .map(([label, stats]) => ({
            label,
            accuracy: stats.total > 0 ? stats.correct / stats.total : 0,
            total: stats.total,
            correct: stats.correct
        }))
        .sort((a, b) => a.accuracy - b.accuracy);

    console.log('\n   ❌ Worst performing classes:');
    sortedClasses.slice(0, 8).forEach(c => {
        console.log(`     - ${c.label}: ${(c.accuracy * 100).toFixed(1)}% (${c.correct}/${c.total})`);
    });

    console.log('\n   ✅ Best performing classes:');
    sortedClasses.slice(-8).reverse().forEach(c => {
        console.log(`     - ${c.label}: ${(c.accuracy * 100).toFixed(1)}% (${c.correct}/${c.total})`);
    });

    // Classes at 100%
    const perfectClasses = sortedClasses.filter(c => c.accuracy === 1);
    console.log(`\n   Classes at 100%: ${perfectClasses.length}/${numClasses}`);

    // Classes at 0%
    const zeroClasses = sortedClasses.filter(c => c.accuracy === 0);
    console.log(`   Classes at 0%: ${zeroClasses.length}`);
    if (zeroClasses.length > 0 && zeroClasses.length <= 10) {
        console.log(`     ${zeroClasses.map(c => c.label).join(', ')}`);
    }

    console.log('\n🎉 Done!');
}

train().catch(console.error);
