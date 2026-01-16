/**
 * Benchmark Hybrid Classifier - Full Dataset
 * 
 * Evaluates the performance of the HybridClassifier (Neural V7 + Heuristic V3.1)
 * on the complete dataset (train-dataset-v3.json).
 */

const fs = require('fs');
const path = require('path');
const HybridClassifier = require('../../autofill/domains/inference/HybridClassifier.js');
const NeuralClassifier = require('../../autofill/domains/inference/neural-classifier.js');
const HeuristicEngine = require('../../autofill/domains/inference/HeuristicEngine.js');
const FeatureExtractor = require('../../autofill/domains/inference/feature-extractor.js');
const FieldTypes = require('../../autofill/domains/inference/FieldTypes.js');

async function main() {
    console.log('🚀 Starting Full Hybrid Classifier Benchmark...\n');

    // 1. Initialize Components
    const featureExtractor = new FeatureExtractor();
    const heuristicEngine = new HeuristicEngine();

    // Neural Classifier
    const neuralClassifier = new NeuralClassifier({
        featureExtractor: featureExtractor,
        fieldTypes: FieldTypes
    });

    // Load Weights
    const modelPath = path.join(__dirname, '../../autofill/domains/inference/model.json');
    if (!fs.existsSync(modelPath)) {
        console.error('❌ model.json not found!');
        process.exit(1);
    }
    const weights = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
    if (!neuralClassifier.loadWeights(weights)) {
        console.error('❌ Failed to load neural weights.');
        process.exit(1);
    }

    // Hybrid Classifier
    const hybrid = new HybridClassifier({
        heuristicEngine,
        neuralClassifier,
        featureExtractor,
        debug: false
    });

    // 2. Load Dataset
    let datasetPath = path.join(__dirname, 'train-dataset-v3.json');
    if (!fs.existsSync(datasetPath)) {
        // Fallback or check alternative location
        if (fs.existsSync(path.join(__dirname, 'train-dataset/train-dataset-1.json'))) {
            // If v3 missing, we can't run full bench easily without aggregating again.
            // But user context says they have it. 
            // Just in case, try to find it.
            console.error(`❌ Dataset not found at ${datasetPath}`);
            process.exit(1);
        }
    }

    console.log(`📂 Loading dataset from ${path.basename(datasetPath)}...`);
    const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
    console.log(`ℹ️  Total Samples: ${dataset.length}\n`);

    // 3. Run Evaluation
    const metrics = {
        total: 0,
        correct: 0,
        heuristicWins: 0,
        neuralWins: 0,
        unanimous: 0,
        weighted: 0,
        byClass: {}
    };

    // Alias Map (Dataset Label -> Canonical Hybrid Label)
    const ALIAS_MAP = {
        'current_company': 'company_name',
        'employer_name': 'company_name',
        'current_title': 'job_title',
        'position': 'job_title',
        'major': 'field_of_study',
        'degree': 'degree_type',
        'college': 'institution_name',
        'university': 'institution_name',
        'address': 'address_line', // Heuristic maps this to address_line
        'address_line_1': 'address_line',
        'phone_mobile': 'phone',
        'phone_home': 'phone',
        'cellphone': 'phone',
        'salary': 'salary_expected',
        'desired_salary': 'salary_expected',
        'current_salary': 'salary_current'
    };

    console.log('⚡ Running predictions...');
    const startTime = performance.now();

    for (const sample of dataset) {
        metrics.total++;
        const rawGT = sample.label;
        // Normalize Ground Truth
        const groundTruth = ALIAS_MAP[rawGT] || rawGT;

        // Initialize class stats
        if (!metrics.byClass[groundTruth]) {
            metrics.byClass[groundTruth] = { total: 0, correct: 0 };
        }
        metrics.byClass[groundTruth].total++;

        // Predict
        const result = await hybrid.classify(sample);
        const resultLabel = result.label;

        // Evaluate
        // Check exact match (since we normalized GT)
        if (resultLabel === groundTruth) {
            metrics.correct++;
            metrics.byClass[groundTruth].correct++;
        }

        // Track decision path
        if (result.source.includes('unanimous')) metrics.unanimous++;
        if (result.agreementType === 'heuristic_override' || result.source.includes('heuristic')) metrics.heuristicWins++;
        if (result.agreementType === 'neural_override' || result.source.includes('neural')) metrics.neuralWins++;
        if (result.agreementType === 'weighted_vote') metrics.weighted++;

        // Periodic log
        if (metrics.total % 500 === 0) {
            process.stdout.write(`   Processed ${metrics.total}/${dataset.length} (${((metrics.total / dataset.length) * 100).toFixed(1)}%)...\r`);
        }
    }
    const duration = (performance.now() - startTime) / 1000;
    console.log('\n✅ Processing complete.\n');

    // 4. Report Results
    const accuracy = (metrics.correct / metrics.total) * 100;

    console.log('📊 OVERALL RESULTS');
    console.log('==================');
    console.log(`Samples:      ${metrics.total}`);
    console.log(`Time:         ${duration.toFixed(2)}s`);
    console.log(`Throughput:   ${(metrics.total / duration).toFixed(0)} samples/s`);
    console.log(`Accuracy:     ${accuracy.toFixed(2)}%  (${metrics.correct}/${metrics.total})`);
    console.log('------------------');
    console.log('Decision Breakdown:');
    console.log(`- Unanimous:  ${metrics.unanimous} (${((metrics.unanimous / metrics.total) * 100).toFixed(1)}%)`);
    console.log(`- Heuristic:  ${metrics.heuristicWins} (${((metrics.heuristicWins / metrics.total) * 100).toFixed(1)}%)`);
    console.log(`- Neural:     ${metrics.neuralWins} (${((metrics.neuralWins / metrics.total) * 100).toFixed(1)}%)`);
    console.log('');

    // 5. Per-Class Performance (Sorted by Accuracy)
    console.log('📉 WEAKEST FIELDS (< 80% Accuracy)');
    console.log('----------------------------------');
    const classResults = Object.entries(metrics.byClass).map(([label, stats]) => ({
        label,
        ...stats,
        acc: (stats.correct / stats.total) * 100
    })).sort((a, b) => a.acc - b.acc);

    classResults.filter(c => c.acc < 80).forEach(c => {
        console.log(`${c.label.padEnd(25)}: ${c.acc.toFixed(1)}% (${c.correct}/${c.total})`);
    });

    console.log('\n📈 STRONGEST FIELDS (100% Accuracy)');
    console.log('-----------------------------------');
    const strong = classResults.filter(c => c.acc === 100).map(c => c.label);
    console.log(strong.join(', '));
    console.log(`\n(Total perfect classes: ${strong.length}/${classResults.length})`);
}

main().catch(console.error);
