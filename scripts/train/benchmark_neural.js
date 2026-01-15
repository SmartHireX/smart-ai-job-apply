/**
 * Neural Classifier Benchmark Script
 * Tests Neural V5 accuracy with proper alias resolution
 * 
 * Usage: node scripts/train/benchmark_neural.js
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

// Inject into window
global.window.FieldTypes = FieldTypes;
global.window.FeatureExtractor = FeatureExtractor;
global.window.HeuristicEngine = HeuristicEngine;

const NeuralClassifier = require('../../autofill/domains/inference/neural-classifier.js');

// ============================================================================
// FIELD ALIASES (Same as HeuristicEngine.FIELD_ALIASES)
// ============================================================================
const FIELD_ALIASES = {
    // Location synonyms
    'address': 'address_line_1',
    'street': 'address_line_1',

    // Work synonyms
    'current_company': 'company_name',
    'employer_name': 'company_name',
    'current_title': 'job_title',
    'position': 'job_title',

    // Education synonyms
    'major': 'field_of_study',
    'degree': 'degree_type',
    'college': 'institution_name',
    'university': 'institution_name',

    // Preference synonyms
    'remote_preference': 'work_style',
    'work_location_preference': 'work_style',

    // Compensation synonyms
    'salary': 'salary_expected',
    'expected_salary': 'salary_expected',
    'desired_salary': 'salary_expected',
    'current_salary': 'salary_current',

    // Date synonyms
    'start_date': 'availability',
    'available_start_date': 'availability',

    // Contact synonyms
    'phone_number': 'phone',
    'mobile': 'phone',
    'email_address': 'email'
};

/**
 * Resolve field label to canonical form
 */
function resolveAlias(label) {
    if (!label) return label;
    return FIELD_ALIASES[label] || label;
}

// ============================================================================
// DATA LOADING
// ============================================================================
function loadTestData() {
    const testFolder = path.join(__dirname, 'test-dataset');
    const files = fs.readdirSync(testFolder).filter(f => f.endsWith('.json'));

    let allData = [];
    for (const file of files) {
        const filepath = path.join(testFolder, file);
        const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        allData = allData.concat(data);
    }

    return allData;
}

// ============================================================================
// BENCHMARK FUNCTION
// ============================================================================
async function benchmarkNeural() {
    console.log('🧠 Neural Classifier V5 Benchmark');
    console.log('==================================\n');

    // Load test data
    console.log('📂 Loading test datasets...');
    const testData = loadTestData();
    console.log(`   Total test samples: ${testData.length}\n`);

    // Initialize Neural Classifier
    console.log('🔧 Initializing NeuralClassifier V5...');
    const classifier = new NeuralClassifier({ debug: false });
    await classifier.init();
    console.log('   Classifier ready.\n');

    // Run benchmark
    console.log('📊 Running benchmark...\n');

    let correct = 0;
    let correctWithAliases = 0;
    const classCounts = {};
    const classCorrect = {};
    const classCorrectAliased = {};
    const confusionPairs = {};

    for (const sample of testData) {
        const actualLabel = sample.label;
        const actualResolved = resolveAlias(actualLabel);

        // Track class counts
        classCounts[actualResolved] = (classCounts[actualResolved] || 0) + 1;

        // Predict using neural classifier
        const result = classifier.predict(sample.features);
        const predictedLabel = result.label;
        const predictedResolved = resolveAlias(predictedLabel);

        // Exact match (no alias resolution)
        if (predictedLabel === actualLabel) {
            correct++;
            classCorrect[actualResolved] = (classCorrect[actualResolved] || 0) + 1;
            classCorrectAliased[actualResolved] = (classCorrectAliased[actualResolved] || 0) + 1;
        }
        // Match with alias resolution
        else if (predictedResolved === actualResolved) {
            correctWithAliases++;
            classCorrectAliased[actualResolved] = (classCorrectAliased[actualResolved] || 0) + 1;

            // Track confusion (predicted canonical vs actual variant)
            const pair = `${actualLabel} → ${predictedLabel}`;
            confusionPairs[pair] = (confusionPairs[pair] || 0) + 1;
        }
    }

    // Calculate accuracies
    const exactAccuracy = (correct / testData.length) * 100;
    const aliasAccuracy = ((correct + correctWithAliases) / testData.length) * 100;

    // Print results
    console.log('═══════════════════════════════════════════════════════');
    console.log('📈 RESULTS');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log(`   🎯 EXACT MATCH ACCURACY: ${exactAccuracy.toFixed(2)}% (${correct}/${testData.length})`);
    console.log(`   🎯 WITH ALIAS RESOLUTION: ${aliasAccuracy.toFixed(2)}% (${correct + correctWithAliases}/${testData.length})\n`);

    console.log(`   ✅ Improvement from alias resolution: +${(aliasAccuracy - exactAccuracy).toFixed(2)}%\n`);

    // Per-class accuracy (with aliases)
    console.log('📊 PER-CLASS ACCURACY (with alias resolution):');
    console.log('───────────────────────────────────────────────────────\n');

    const classStats = Object.keys(classCounts)
        .map(cls => ({
            class: cls,
            total: classCounts[cls],
            correct: classCorrectAliased[cls] || 0,
            accuracy: ((classCorrectAliased[cls] || 0) / classCounts[cls]) * 100
        }))
        .sort((a, b) => b.accuracy - a.accuracy);

    // Best performing
    console.log('   ✅ BEST PERFORMING (Top 10):');
    classStats.slice(0, 10).forEach(stat => {
        console.log(`      ${stat.class}: ${stat.accuracy.toFixed(1)}% (${stat.correct}/${stat.total})`);
    });

    // Worst performing
    console.log('\n   ❌ WORST PERFORMING (Bottom 10):');
    classStats.slice(-10).forEach(stat => {
        console.log(`      ${stat.class}: ${stat.accuracy.toFixed(1)}% (${stat.correct}/${stat.total})`);
    });

    // Classes at extremes
    const perfect = classStats.filter(s => s.accuracy === 100).length;
    const failed = classStats.filter(s => s.accuracy === 0).length;
    console.log(`\n   Classes at 100%: ${perfect}/${classStats.length}`);
    console.log(`   Classes at 0%: ${failed}/${classStats.length}\n`);

    // Show alias confusion pairs
    if (Object.keys(confusionPairs).length > 0) {
        console.log('🔄 ALIAS CONFUSIONS (Predicted Canonical vs Actual Variant):');
        console.log('───────────────────────────────────────────────────────\n');

        const sortedPairs = Object.entries(confusionPairs)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15);

        sortedPairs.forEach(([pair, count]) => {
            console.log(`      ${pair} (${count}x)`);
        });
        console.log('');
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 Benchmark complete!');
    console.log('═══════════════════════════════════════════════════════\n');
}

// Run benchmark
benchmarkNeural().catch(err => {
    console.error('Error running benchmark:', err);
    process.exit(1);
});
