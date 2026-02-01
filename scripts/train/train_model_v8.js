/**
 * Training Script for NeuralClassifier V8 (Multi-Label)
 * 
 * Implements:
 * - Weighted Binary Cross Entropy Loss (w_pos=3.0, w_neg=1.0)
 * - Top-3 Accuracy Monitoring
 * - Gradient Norm Safeguards
 * - Mean Probability Tracking (Pos/Neg)
 */

const fs = require('fs');
const path = require('path');

// Load dependencies
const FieldTypes = require('../../autofill/domains/inference/FieldTypes.js');
const NeuralClassifierV8 = require('../../autofill/domains/inference/neural-classifier-v8.js');
const FeatureExtractor = require('../../autofill/domains/inference/feature-extractor.js');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    // Data paths
    trainDataPath: path.join(__dirname, 'train-dataset-v3-balanced.json'),
    outputPath: path.join(__dirname, '../../autofill/domains/inference/model_v8.json'),

    // Training parameters
    epochs: 50,
    batchSize: 32,
    validationSplit: 0.05,
    testSplit: 0.05,

    // Optimization
    learningRate: 0.001, // Tuned for V8

    // Loss Weights (Weighted BCE)
    w_pos: 3.0,
    w_neg: 1.0,

    // Early stopping
    patience: 20,
    minDelta: 0.0001,

    // Logging
    logEveryEpoch: 1,
    saveEveryEpoch: 20
};

// ============================================================================
// DATA LOADING
// ============================================================================

function loadData() {
    // console.log('📂 Loading training data...');

    if (!fs.existsSync(CONFIG.trainDataPath)) {
        console.error(`❌ Data file not found: ${CONFIG.trainDataPath}`);
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(CONFIG.trainDataPath, 'utf8'));
    // console.log(`   Loaded ${data.length} samples`);

    // Vectorize Features
    const featureExtractor = new FeatureExtractor();
    // console.log('   Vectorizing features...');

    data.forEach(sample => {
        // sample.features is currently raw { name, id, label... }
        // we convert it to dense vector [0, 1, 0, ...]
        sample.features = featureExtractor.extract(sample.features);
    });

    return data;
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function splitData(data) {
    const shuffled = shuffleArray([...data]);
    const testSize = Math.floor(data.length * CONFIG.testSplit);
    const valSize = Math.floor(data.length * CONFIG.validationSplit);
    const trainSize = data.length - testSize - valSize;

    const trainData = shuffled.slice(0, trainSize);
    const valData = shuffled.slice(trainSize, trainSize + valSize);
    const testData = shuffled.slice(trainSize + valSize);

    // console.log(`   Train: ${trainData.length}, Validation: ${valData.length}, Test: ${testData.length}`);
    return { trainData, valData, testData };
}

// ============================================================================
// LOSS & METRICS
// ============================================================================

// Weighted BCE Loss Derivative
// dL/dz = w_neg * (1-y) * p - w_pos * y * (1-p)
function computeWeightedBCEDerivative(p, y, w_pos, w_neg) {
    return w_neg * (1 - y) * p - w_pos * y * (1 - p);
}

// Weighted BCE Loss per sample (normalized by number of classes)
function computesampleLoss(probs, targetIndex, outputSize) {
    let loss = 0;
    for (let i = 0; i < outputSize; i++) {
        const p = Math.max(Math.min(probs[i], 1 - 1e-10), 1e-10); // Clamp
        const y = (i === targetIndex) ? 1 : 0;

        if (y === 1) {
            loss -= CONFIG.w_pos * Math.log(p);
        } else {
            loss -= CONFIG.w_neg * Math.log(1 - p);
        }
    }
    return loss / outputSize;
}

function evaluate(classifier, data) {
    let top1Correct = 0;
    let top3Correct = 0;
    let totalLoss = 0;
    let sumPosConf = 0;
    let sumNegConf = 0;
    let posCount = 0;
    let negCount = 0;

    const outputSize = classifier._W3[0].length;

    for (const sample of data) {
        const result = classifier.predict(sample.features);
        const forward = classifier._forward(sample.features, false);
        const probs = forward.probs;
        const targetClass = sample.label;
        const targetIndex = classifier._fieldTypes.getFieldTypeIndex(targetClass);

        // Loss
        totalLoss += computesampleLoss(probs, targetIndex, outputSize);

        // Top-1 Accuracy (Classic)
        let maxProb = -1;
        let predIndex = -1;

        // Metrics for confidence
        for (let i = 0; i < probs.length; i++) {
            if (i === targetIndex) {
                sumPosConf += probs[i];
                posCount++;
            } else {
                sumNegConf += probs[i];
                negCount++;
            }
            if (probs[i] > maxProb) {
                maxProb = probs[i];
                predIndex = i;
            }
        }

        if (predIndex === targetIndex) top1Correct++;

        // Top-3 Accuracy
        const indexedProbs = probs.map((p, i) => ({ i, p }));
        indexedProbs.sort((a, b) => b.p - a.p);
        const top3Indices = indexedProbs.slice(0, 3).map(x => x.i);
        if (top3Indices.includes(targetIndex)) top3Correct++;
    }

    return {
        loss: totalLoss / data.length,
        top1Acc: top1Correct / data.length,
        top3Acc: top3Correct / data.length,
        meanPosConf: posCount > 0 ? sumPosConf / posCount : 0,
        meanNegConf: negCount > 0 ? sumNegConf / negCount : 0
    };
}

// ============================================================================
// TRAINING LOOP
// ============================================================================

async function train() {
    // console.log('\n🧠 NeuralClassifier V8 Training (Multi-Label / Weighted BCE)');
    // console.log('============================================================');
    // console.log(`  • Learning Rate: ${CONFIG.learningRate}`);
    // console.log(`  • Loss Weights: Pos=${CONFIG.w_pos}, Neg=${CONFIG.w_neg}`);
    // console.log(`  • Batch Size: ${CONFIG.batchSize}`);
    // console.log(`  • Validation: Top-3 Accuracy Focus\n`);

    const data = loadData();
    const { trainData, valData, testData } = splitData(data);

    const classifier = new NeuralClassifierV8({
        debug: false,
        fieldTypes: FieldTypes
    });
    classifier._initializeWeights(); // Ensure weights exist

    // History
    const history = {
        loss: [], top1: [], top3: [], valLoss: [], valTop1: [], valTop3: [],
        meanPos: [], meanNeg: []
    };

    let bestValTop3 = 0;
    let bestValLoss = Infinity; // Track this too
    let bestWeights = null;
    let patienceCounter = 0;
    const outputSize = classifier._W3[0].length;

    // console.log(`\n🚀 Starting training for ${CONFIG.epochs} epochs...\n`);
    const startTime = Date.now();

    for (let epoch = 0; epoch < CONFIG.epochs; epoch++) {
        const epochStart = Date.now();
        const shuffledTrain = shuffleArray([...trainData]);

        let epochLoss = 0;
        let batchCount = 0;
        let gradNormSum = 0;
        let totalSamples = 0;

        // Mini-batch loop
        for (let i = 0; i < shuffledTrain.length; i += CONFIG.batchSize) {
            const batch = shuffledTrain.slice(i, i + CONFIG.batchSize);
            const batchGradients = {
                dW1: null, db1: null, dW2: null, db2: null, dW3: null, db3: null
            };

            let batchLoss = 0;

            // Accumulate gradients
            for (const sample of batch) {
                const forward = classifier._forward(sample.features, true);
                const probs = forward.probs;
                const targetIndex = classifier._fieldTypes.getFieldTypeIndex(sample.label);

                // Compute Loss
                batchLoss += computesampleLoss(probs, targetIndex, outputSize);

                // Compute dLogits (Error signal)
                const dLogits = new Array(outputSize).fill(0);
                for (let c = 0; c < outputSize; c++) {
                    const y = (c === targetIndex) ? 1 : 0;
                    dLogits[c] = computeWeightedBCEDerivative(probs[c], y, CONFIG.w_pos, CONFIG.w_neg);
                    dLogits[c] /= outputSize;
                }

                const grads = classifier.computeGradientsFromError(sample.features, forward, dLogits);

                // Initialize or Add to Batch Gradients
                if (!batchGradients.dW1) {
                    batchGradients.dW1 = grads.dW1; batchGradients.db1 = grads.db1;
                    batchGradients.dW2 = grads.dW2; batchGradients.db2 = grads.db2;
                    batchGradients.dW3 = grads.dW3; batchGradients.db3 = grads.db3;
                } else {
                    // Manual addition loops
                    for (let r = 0; r < grads.dW1.length; r++) for (let c = 0; c < grads.dW1[r].length; c++) batchGradients.dW1[r][c] += grads.dW1[r][c];
                    for (let r = 0; r < grads.db1.length; r++)  batchGradients.db1[r] += grads.db1[r];

                    for (let r = 0; r < grads.dW2.length; r++) for (let c = 0; c < grads.dW2[r].length; c++) batchGradients.dW2[r][c] += grads.dW2[r][c];
                    for (let r = 0; r < grads.db2.length; r++)  batchGradients.db2[r] += grads.db2[r];

                    for (let r = 0; r < grads.dW3.length; r++) for (let c = 0; c < grads.dW3[r].length; c++) batchGradients.dW3[r][c] += grads.dW3[r][c];
                    for (let r = 0; r < grads.db3.length; r++)  batchGradients.db3[r] += grads.db3[r];
                }
            }

            // Average gradients
            const bSize = batch.length;
            const div = (t) => {
                if (Array.isArray(t[0])) for (let r = 0; r < t.length; r++) for (let c = 0; c < t[r].length; c++) t[r][c] /= bSize;
                else for (let r = 0; r < t.length; r++) t[r] /= bSize;
            };
            div(batchGradients.dW1); div(batchGradients.db1);
            div(batchGradients.dW2); div(batchGradients.db2);
            div(batchGradients.dW3); div(batchGradients.db3);

            // Clip & Apply
            classifier._clipGradients(batchGradients);
            classifier.applyGradients(batchGradients, CONFIG.learningRate);

            epochLoss += batchLoss; // Sum of averages
            totalSamples += bSize;
            batchCount++;
        }

        const avgTrainLoss = epochLoss / totalSamples; // Approximate, technically sum(batch_avgs)/batches

        // Validation
        const valMetrics = evaluate(classifier, valData);

        // Log
        const epochTime = ((Date.now() - epochStart) / 1000).toFixed(1);
        // console.log(
            `E${String(epoch + 1).padStart(3)} | ` +
            `Loss: ${avgTrainLoss.toFixed(4)} | ` +
            `Val Loss: ${valMetrics.loss.toFixed(4)} | ` +
            `Top-1: ${(valMetrics.top1Acc * 100).toFixed(1)}% | ` +
            `Top-3: ${(valMetrics.top3Acc * 100).toFixed(1)}% | ` +
            `Pos/Neg: ${valMetrics.meanPosConf.toFixed(2)}/${valMetrics.meanNegConf.toFixed(2)} | ` +
            `${epochTime}s`
        );

        // Safeguard: Gradient Check (implicit via loss movement, but could add norm check log if needed)
        // Safeguard: Probability Collapse
        if (valMetrics.meanPosConf < 0.01) console.warn('   ⚠️ Warning: Positive confidence collapsing!');

        // Checkpoint based on Validation Loss (Overall Correctness)
        // This ensures the entire probability distribution is optimized, not just the rank of the top match.
        if (valMetrics.loss < bestValLoss) {
            bestValLoss = valMetrics.loss;
            bestValTop3 = valMetrics.top3Acc; // Keep tracking for info
            bestWeights = classifier.exportWeights();
            patienceCounter = 0;
            // console.log('   ⭐ New Best Model (Lowest Loss)');
        } else {
            patienceCounter++;
        }

        if (patienceCounter >= CONFIG.patience) {
            // console.log('\n⏹️  Early stopping triggered.');
            break;
        }
    }

    // Final Save
    if (bestWeights) {
        classifier.loadWeights(bestWeights);
        // console.log(`\n💾 Saving best model (Top-3: ${(bestValTop3 * 100).toFixed(2)}%)...`);
    }
    fs.writeFileSync(CONFIG.outputPath, JSON.stringify(classifier.exportWeights(), null, 2));

    // Test Set Evaluation
    // console.log('\n📊 Final Test Evaluation:');
    const testMetrics = evaluate(classifier, testData);
    // console.log(`   Top-1 Accuracy: ${(testMetrics.top1Acc * 100).toFixed(2)}%`);
    // console.log(`   Top-3 Accuracy: ${(testMetrics.top3Acc * 100).toFixed(2)}%  <-- PRIMARY METRIC`);
    // console.log(`   Test Loss:      ${testMetrics.loss.toFixed(4)}`);
}

train().catch(console.error);
