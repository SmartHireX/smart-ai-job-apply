/**
 * HybridClassifier Demo & Comparison
 * 
 * Demonstrates the new separated architecture:
 * - HybridClassifier.js (Orchestrator with 5-tier arbitration)
 * - NeuralClassifier.js (Pure neural network)
 * - HeuristicEngine.js (Pattern-based classifier)
 */

const FieldTypes = require('../autofill/domains/inference/FieldTypes.js');
const HeuristicEngine = require('../autofill/domains/inference/HeuristicEngine.js');
const NeuralClassifier = require('../autofill/domains/inference/neural-classifier.js');
const HybridClassifier = require('../autofill/domains/inference/HybridClassifier.js');
const FeatureExtractor = require('../autofill/domains/inference/feature-extractor.js');

// console.log('🧪 HybridClassifier Architecture Demo\n');
// console.log('='.repeat(70));

// ============================================================================
// 1. INITIALIZE CLASSIFIERS
// ============================================================================

// console.log('\n📦 Initializing Classifiers...\n');

// Individual classifiers
const heuristicEngine = new HeuristicEngine({ debug: false });
const neuralClassifier = new NeuralClassifier({ debug: false });
const featureExtractor = new FeatureExtractor();

// Hybrid classifier with dependency injection
const hybridClassifier = new HybridClassifier({
    heuristicEngine,
    neuralClassifier,
    featureExtractor,
    debug: true
});

// console.log('✅ HeuristicEngine initialized');
// console.log('✅ NeuralClassifier initialized');
// console.log('✅ HybridClassifier initialized (with dependencies injected)');

// ============================================================================
// 2. TEST FIELDS
// ============================================================================

const testFields = [
    {
        name: 'email',
        id: 'user_email',
        placeholder: 'Enter your email address',
        type: 'email',
        label: 'Email Address'
    },
    {
        name: 'alternate_email',
        id: 'email2',
        placeholder: 'Secondary email',
        type: 'email',
        label: 'Alternate Email'
    },
    {
        name: 'firstName',
        id: 'first_name',
        placeholder: 'Your first name',
        type: 'text',
        label: 'First Name'
    },
    {
        name: 'notice',
        id: 'notice_period_days',
        placeholder: 'Notice period in days',
        type: 'number',
        label: 'Notice Period (Days)'
    },
    {
        name: 'company',
        id: 'current_employer',
        placeholder: 'Current company name',
        type: 'text',
        label: 'Company'
    },
    // Category-Specific Test Cases
    {
        name: 'phone_mobile',
        id: 'cell',
        placeholder: '555-0123',
        type: 'tel',
        label: 'Mobile Phone (Contact - Trusts Heuristic)'
    },
    {
        name: 'job_desc',
        id: 'description',
        placeholder: 'Led a team of 5 engineers to build...',
        type: 'textarea',
        label: 'Job Description (Context - Trusts Neural)'
    }
];

// ============================================================================
// 3. RUN COMPARISON: HYBRID vs PURE NEURAL
// ============================================================================

// console.log('\n' + '='.repeat(70));
// console.log('🔬 Classification Comparison: Hybrid vs Pure Neural\n');

async function runDemo() {
    for (const field of testFields) {
        // console.log('-'.repeat(70));
        // console.log(`\n📝 Field: "${field.label}" (name: ${field.name})`);
        // console.log(`   Placeholder: "${field.placeholder}"`);

        // Pure Neural Prediction
        // console.log('\n   🧠 Pure Neural Network:');
        try {
            await neuralClassifier.init();
            const neuralResult = neuralClassifier.predict(field);
            // console.log(`      → ${neuralResult.label} (${(neuralResult.confidence * 100).toFixed(1)}%) [${neuralResult.source}]`);
        } catch (error) {
            // console.log(`      → Error: ${error.message}`);
        }

        // Hybrid Ensemble Prediction
        // console.log('\n   ⚡ Hybrid Classifier:');
        try {
            const hybridResult = await hybridClassifier.classify(field);
            // console.log(`      → ${hybridResult.label} (${(hybridResult.confidence * 100).toFixed(1)}%) [${hybridResult.source}]`);

            if (hybridResult.agreementType) {
                // console.log(`      → Agreement: ${hybridResult.agreementType}`);
            }

            if (hybridResult.heuristicLabel) {
                // console.log(`      → Heuristic suggested: ${hybridResult.heuristicLabel} (${(hybridResult.heuristicConfidence * 100).toFixed(1)}%)`);
            }

            if (hybridResult.neuralLabel) {
                // console.log(`      → Neural suggested: ${hybridResult.neuralLabel} (${(hybridResult.neuralConfidence * 100).toFixed(1)}%)`);
            }
        } catch (error) {
            // console.log(`      → Error: ${error.message}`);
        }

        // console.log('');
    }

    // ============================================================================
    // 4. SHOW METRICS
    // ============================================================================

    // console.log('='.repeat(70));
    // console.log('\n📊 Hybrid Classifier Performance Metrics:\n');

    const metrics = hybridClassifier.getMetrics();
    // console.log(`   Total Classifications: ${metrics.totalClassifications}`);
    // console.log(`   Unanimous Agreements:  ${metrics.unanimousAgreements} (${metrics.unanimousRate})`);
    // console.log(`   Heuristic Wins:        ${metrics.heuristicWins} (${metrics.heuristicWinRate})`);
    // console.log(`   Neural Wins:           ${metrics.neuralWins} (${metrics.neuralWinRate})`);
    // console.log(`   Weighted Votes:        ${metrics.weightedVotes} (${metrics.weightedVoteRate})`);
    // console.log(`   Average Latency:       ${metrics.averageLatency.toFixed(2)}ms`);

    // ============================================================================
    // 5. ARCHITECTURE SUMMARY
    // ============================================================================

    // console.log('\n' + '='.repeat(70));
    // console.log('📐 New Architecture Summary:\n');
    // console.log('   ┌─────────────────────────────┐');
    // console.log('   │   HybridClassifier.js       │ ← Orchestrator (5-Tier Arbitration)');
    // console.log('   └──────────┬──────────────────┘');
    // console.log('              │');
    // console.log('      ┌───────┴────────┐');
    // console.log('      │                │');
    // console.log('      ▼                ▼');
    // console.log('┌─────────────┐  ┌──────────────────┐');
    // console.log('│ Heuristic   │  │ NeuralClassifier │ ← Pure Neural Network');
    // console.log('│ Engine.js   │  │ .js              │   (No hybrid logic)');
    // console.log('└─────────────┘  └──────────────────┘');
    // console.log('');
    // console.log('Benefits:');
    // console.log('  ✅ Single Responsibility Principle');
    // console.log('  ✅ Dependency Injection (testable)');
    // console.log('  ✅ Pure Neural Classifier (reusable)');
    // console.log('  ✅ Flexible hybrid strategy (easy to tune)');
    // console.log('  ✅ Comprehensive metrics & debugging');
    // console.log('');
    // console.log('='.repeat(70));
}

// Run the demo
runDemo().catch(console.error);
