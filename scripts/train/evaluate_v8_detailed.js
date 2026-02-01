const fs = require('fs');
const path = require('path');

// Load dependencies
// Adjust paths as needed
const NeuralClassifierV8 = require('../../autofill/domains/inference/neural-classifier-v8.js');
const FieldTypes = require('../../autofill/domains/inference/FieldTypes.js');
const FeatureExtractor = require('../../autofill/domains/inference/feature-extractor.js');

const MODEL_PATH = path.join(__dirname, '../../autofill/domains/inference/model_v8.json');
const DATA_PATH = path.join(__dirname, 'train-dataset-v3-balanced.json');

function loadModel() {
    if (!fs.existsSync(MODEL_PATH)) {
        console.error('❌ Model not found:', MODEL_PATH);
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8'));
}

function loadData() {
    if (!fs.existsSync(DATA_PATH)) {
        console.error('❌ Data not found:', DATA_PATH);
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

async function evaluate() {
    // console.log('📊 Starting Detailed Evaluation of Neural Classifier V8...');

    // Load Model
    const weights = loadModel();
    const classifier = new NeuralClassifierV8({ fieldTypes: FieldTypes });
    classifier.loadWeights(weights);
    // console.log('✅ Model loaded.');

    // Load Data
    const data = loadData();
    // console.log(`✅ Data loaded: ${data.length} samples.`);

    // Metrics Containers
    const globalMetrics = { total: 0, top1: 0, top3: 0 };
    const classMetrics = {};
    const featureExtractor = new FeatureExtractor();

    // Initialize class metrics
    if (FieldTypes.ORDERED_CLASSES) {
        FieldTypes.ORDERED_CLASSES.forEach(cls => {
            classMetrics[cls] = { total: 0, top1: 0, top3: 0 };
        });
    }

    // console.log('🚀 Running inference...');

    // Evaluate
    for (const sample of data) {
        const trueLabel = sample.label;
        const features = featureExtractor.extract(sample.features);

        // Skip if label is not in our known list (shouldn't happen with balanced set but good safety)
        if (classMetrics[trueLabel] === undefined) {
            classMetrics[trueLabel] = { total: 0, top1: 0, top3: 0 };
        }

        const result = classifier.predict(features);

        // Check Top-1
        const isTop1 = (result.prediction === trueLabel);

        // Check Top-3
        // We need to look at probabilities map or reconstruct from result
        // V8 predict returns `probabilities` map for top classes > threshold OR top 5?
        // Let's check V8 predict logic.
        // It returns `probabilities: map`. We need to see if trueLabel is in the keys of that map
        // AND if it's in the top 3 of that map.
        // Actually, V8 predict returns *candidates* > threshold. 
        // For strict Top-3 evaluation, we might want the raw output if predict clips too much.
        // But let's use the public API. If the true label isn't in `probabilities` (because < threshold), 
        // it's definitely not in Top-3 "visible" predictions.

        // However, standard Top-3 metric usually considers the raw logits. 
        // Let's peek at internal forward pass for fairer comparison if `predict` hides low-conf classes.

        const forward = classifier._forward(features, false);
        const probs = forward.probs;
        const sortedIndices = probs.map((p, i) => ({ p, i }))
            .sort((a, b) => b.p - a.p)
            .slice(0, 3)
            .map(x => FieldTypes.getFieldTypeFromIndex(x.i));

        const isTop3 = sortedIndices.includes(trueLabel);

        // Update stats
        globalMetrics.total++;
        if (isTop1) globalMetrics.top1++;
        if (isTop3) globalMetrics.top3++;

        classMetrics[trueLabel].total++;
        if (isTop1) classMetrics[trueLabel].top1++;
        if (isTop3) classMetrics[trueLabel].top3++;
    }

    // Report
    // console.log('\n=============================================================');
    // console.log('🌍 OVERALL METRICS (Full Balanced Dataset)');
    // console.log('=============================================================');
    // console.log(`Total Samples: ${globalMetrics.total}`);
    // console.log(`Top-1 Accuracy: ${((globalMetrics.top1 / globalMetrics.total) * 100).toFixed(2)}%`);
    // console.log(`Top-3 Accuracy: ${((globalMetrics.top3 / globalMetrics.total) * 100).toFixed(2)}%`);

    // console.log('\n=============================================================');
    // console.log('📋 PER-CLASS BREAKDOWN (Sorted by Top-1 Accuracy)');
    // console.log('=============================================================');
    // console.log(`| ${'Field Class'.padEnd(30)} | ${'Count'.padStart(5)} | ${'Top-1'.padStart(7)} | ${'Top-3'.padStart(7)} |`);
    // console.log('|' + '-'.repeat(32) + '|' + '-'.repeat(7) + '|' + '-'.repeat(9) + '|' + '-'.repeat(9) + '|');

    const sortedClasses = Object.entries(classMetrics)
        .map(([cls, m]) => ({
            cls,
            total: m.total,
            acc1: m.total > 0 ? (m.top1 / m.total) * 100 : 0,
            acc3: m.total > 0 ? (m.top3 / m.total) * 100 : 0
        }))
        .filter(x => x.total > 0) // Only show classes present in data
        .sort((a, b) => b.acc1 - a.acc1);

    for (const item of sortedClasses) {
        // console.log(
            `| ${item.cls.padEnd(30)} | ` +
            `${item.total.toString().padStart(5)} | ` +
            `${item.acc1.toFixed(1).padStart(6)}% | ` +
            `${item.acc3.toFixed(1).padStart(6)}% |`
        );
    }

    // Low performance alert
    const weakClasses = sortedClasses.filter(x => x.acc1 < 50);
    if (weakClasses.length > 0) {
        // console.log('\n⚠️  Classes below 50% Top-1 Accuracy:');
        weakClasses.forEach(c => // console.log(`   - ${c.cls}: ${c.acc1.toFixed(1)}%`));
    }
}

evaluate().catch(console.error);
