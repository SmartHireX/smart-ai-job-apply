/**
 * Training Script for NeuralClassifier V7
 * 
 * Enterprise-grade training with:
 * - Epoch-based training (full dataset passes)
 * - Mini-batch processing
 * - Learning rate scheduling with warm-up
 * - Comprehensive loss and accuracy logging
 * - Early stopping with patience
 * - Validation set evaluation
 */

const fs = require('fs');
const path = require('path');

// Load dependencies
const FieldTypes = require('../../autofill/domains/inference/FieldTypes.js');
const NeuralClassifierV7 = require('../../autofill/domains/inference/neural-classifier-v7.js');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    // Data paths
    // Data paths
    trainDataPath: path.join(__dirname, 'train-dataset-v3-balanced.json'),
    outputPath: path.join(__dirname, '../../autofill/domains/inference/model_v7.json'),

    // Training parameters
    epochs: 300,                  // Extended training for higher accuracy
    batchSize: 32,
    validationSplit: 0.05,        // 5% for validation (more data for training)
    testSplit: 0.05,              // 5% for final testing

    // Early stopping
    patience: 40,                 // Increased patience
    minDelta: 0.0001,             // Stricter improvement threshold

    // Logging
    logEveryEpoch: 1,             // Log every epoch for monitoring
    saveEveryEpoch: 50
};

// ============================================================================
// DATA LOADING
// ============================================================================

function loadData() {
    console.log('📂 Loading training data...');

    if (!fs.existsSync(CONFIG.trainDataPath)) {
        console.error(`❌ Data file not found: ${CONFIG.trainDataPath}`);
        console.log('   Run regenerate_features_v3.js first to create V3 features.');
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(CONFIG.trainDataPath, 'utf8'));
    console.log(`   Loaded ${data.length} samples`);

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

    console.log(`   Train: ${trainData.length}, Validation: ${valData.length}, Test: ${testData.length}`);

    return { trainData, valData, testData };
}

// ============================================================================
// EVALUATION
// ============================================================================

function evaluate(classifier, data) {
    let correct = 0;
    let totalLoss = 0;

    for (const sample of data) {
        const result = classifier.predict(sample.features);
        const targetClass = sample.label;

        if (result.prediction === targetClass) {
            correct++;
        }

        // Approximate loss (we don't have access to full forward pass here)
        const confidence = result.confidence || 0.01;
        totalLoss += -Math.log(Math.max(confidence, 1e-10));
    }

    return {
        accuracy: correct / data.length,
        loss: totalLoss / data.length,
        correct: correct,
        total: data.length
    };
}

// ============================================================================
// TRAINING LOOP
// ============================================================================

async function train() {
    console.log('\n🧠 NeuralClassifier V7 Training');
    console.log('================================');
    console.log('Enterprise-grade training with:');
    console.log('  • Adam Optimizer (β1=0.9, β2=0.999)');
    console.log('  • Mini-batch Training (batch_size=32)');
    console.log('  • Batch Normalization');
    console.log('  • Gradient Clipping (max_norm=1.0)');
    console.log('  • He Initialization (Gaussian)');
    console.log('  • LR Schedule with Warm-up');
    console.log('  • Early Stopping (patience=10)\n');

    // Load and split data
    const data = loadData();
    const { trainData, valData, testData } = splitData(data);

    // Initialize classifier
    const classifier = new NeuralClassifierV7({
        debug: false,
        fieldTypes: FieldTypes
    });

    // Training state
    let bestValLoss = Infinity;
    let bestWeights = null;
    let patienceCounter = 0;
    const history = {
        trainLoss: [],
        trainAcc: [],
        valLoss: [],
        valAcc: [],
        lr: []
    };

    console.log(`\n🚀 Starting training for ${CONFIG.epochs} epochs...\n`);
    const startTime = Date.now();

    for (let epoch = 0; epoch < CONFIG.epochs; epoch++) {
        const epochStart = Date.now();

        // Shuffle training data each epoch
        const shuffledTrain = shuffleArray([...trainData]);

        // Mini-batch training
        let epochLoss = 0;
        let epochCorrect = 0;
        let batchCount = 0;
        let currentLR = 0;

        for (let i = 0; i < shuffledTrain.length; i += CONFIG.batchSize) {
            const batch = shuffledTrain.slice(i, i + CONFIG.batchSize);

            const result = classifier.trainBatch(batch, epoch, CONFIG.epochs);

            epochLoss += result.loss * batch.length;
            epochCorrect += result.accuracy * batch.length;
            currentLR = result.lr;
            batchCount++;
        }

        const avgTrainLoss = epochLoss / shuffledTrain.length;
        const avgTrainAcc = epochCorrect / shuffledTrain.length;

        // Validation evaluation
        const valMetrics = evaluate(classifier, valData);

        // Update history
        history.trainLoss.push(avgTrainLoss);
        history.trainAcc.push(avgTrainAcc);
        history.valLoss.push(valMetrics.loss);
        history.valAcc.push(valMetrics.accuracy);
        history.lr.push(currentLR);

        // Check for improvement
        if (valMetrics.loss < bestValLoss - CONFIG.minDelta) {
            bestValLoss = valMetrics.loss;
            bestWeights = classifier.exportWeights();
            patienceCounter = 0;
        } else {
            patienceCounter++;
        }

        // Logging
        if (epoch % CONFIG.logEveryEpoch === 0 || epoch === CONFIG.epochs - 1) {
            const epochTime = ((Date.now() - epochStart) / 1000).toFixed(2);
            console.log(
                `Epoch ${String(epoch + 1).padStart(3)}/${CONFIG.epochs} | ` +
                `Loss: ${avgTrainLoss.toFixed(4)} | ` +
                `Acc: ${(avgTrainAcc * 100).toFixed(2)}% | ` +
                `Val Loss: ${valMetrics.loss.toFixed(4)} | ` +
                `Val Acc: ${(valMetrics.accuracy * 100).toFixed(2)}% | ` +
                `LR: ${currentLR.toFixed(6)} | ` +
                `Time: ${epochTime}s` +
                (patienceCounter === 0 ? ' ⭐' : '')
            );
        }

        // Save checkpoint
        if ((epoch + 1) % CONFIG.saveEveryEpoch === 0) {
            const checkpointPath = CONFIG.outputPath.replace('.json', `_epoch${epoch + 1}.json`);
            fs.writeFileSync(checkpointPath, JSON.stringify(classifier.exportWeights(), null, 2));
            console.log(`   💾 Checkpoint saved: ${checkpointPath}`);
        }

        // Early stopping
        if (patienceCounter >= CONFIG.patience) {
            console.log(`\n⏹️  Early stopping triggered at epoch ${epoch + 1} (no improvement for ${CONFIG.patience} epochs)`);
            break;
        }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Training complete in ${totalTime}s`);

    // Load best weights
    if (bestWeights) {
        classifier.loadWeights(bestWeights);
        console.log(`   Loaded best weights (val_loss: ${bestValLoss.toFixed(4)})`);
    }

    // Final test evaluation
    console.log('\n📊 Final Test Evaluation:');
    const testMetrics = evaluate(classifier, testData);
    console.log(`   Test Accuracy: ${(testMetrics.accuracy * 100).toFixed(2)}% (${testMetrics.correct}/${testMetrics.total})`);
    console.log(`   Test Loss: ${testMetrics.loss.toFixed(4)}`);

    // Save final model
    fs.writeFileSync(CONFIG.outputPath, JSON.stringify(classifier.exportWeights(), null, 2));
    console.log(`\n💾 Model saved to: ${CONFIG.outputPath}`);

    // Print training summary
    console.log('\n📈 Training Summary:');
    console.log(`   Best Validation Loss: ${bestValLoss.toFixed(4)}`);
    console.log(`   Best Validation Accuracy: ${(Math.max(...history.valAcc) * 100).toFixed(2)}%`);
    console.log(`   Final Test Accuracy: ${(testMetrics.accuracy * 100).toFixed(2)}%`);

    // Per-class analysis
    console.log('\n📊 Per-Class Analysis (Sample):');
    const classAccuracy = {};
    for (const sample of testData) {
        const result = classifier.predict(sample.features);
        const targetClass = sample.label;

        if (!classAccuracy[targetClass]) {
            classAccuracy[targetClass] = { correct: 0, total: 0 };
        }
        classAccuracy[targetClass].total++;
        if (result.prediction === targetClass) {
            classAccuracy[targetClass].correct++;
        }
    }

    // Sort by accuracy
    const sortedClasses = Object.entries(classAccuracy)
        .map(([cls, stats]) => ({ cls, acc: stats.correct / stats.total, ...stats }))
        .sort((a, b) => b.acc - a.acc);

    console.log('\n   Best performing:');
    for (let i = 0; i < Math.min(5, sortedClasses.length); i++) {
        const c = sortedClasses[i];
        console.log(`     ${c.cls}: ${(c.acc * 100).toFixed(1)}% (${c.correct}/${c.total})`);
    }

    console.log('\n   Worst performing:');
    for (let i = Math.max(0, sortedClasses.length - 5); i < sortedClasses.length; i++) {
        const c = sortedClasses[i];
        console.log(`     ${c.cls}: ${(c.acc * 100).toFixed(1)}% (${c.correct}/${c.total})`);
    }

    console.log('\n🎉 Done!');
}

// Run training
train().catch(console.error);
