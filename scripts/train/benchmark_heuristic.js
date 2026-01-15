/**
 * Benchmark HeuristicEngine against training/test datasets
 * Tests heuristic-only classification accuracy with alias resolution
 */

const fs = require('fs');
const path = require('path');

// Setup global performance object
global.performance = { now: () => Date.now() };

// Load HeuristicEngine
const HeuristicEnginePath = path.join(__dirname, '../../autofill/domains/inference/HeuristicEngine.js');
let code = fs.readFileSync(HeuristicEnginePath, 'utf8');
code = code.replace(/if \(typeof module.*?module\.exports.*?\}/s, '');
code += '\nif (typeof module !== "undefined") module.exports = HeuristicEngine;\n';

const tempPath = path.join(__dirname, '_temp_heuristic.js');
fs.writeFileSync(tempPath, code);
const HeuristicEngine = require(tempPath);
fs.unlinkSync(tempPath);

/**
 * Field aliases for synonym normalization
 * CRITICAL: Must match HeuristicEngine.FIELD_ALIASES
 */
const FIELD_ALIASES = {
    'address': 'address_line_1',
    'street': 'address_line_1',
    'current_company': 'company_name',
    'employer_name': 'company_name',
    'current_title': 'job_title',
    'position': 'job_title',
    'major': 'field_of_study',
    'degree': 'degree_type',
    'college': 'institution_name',
    'university': 'institution_name',
    'remote_preference': 'work_style',
    'salary': 'salary_expected',
    'expected_salary': 'salary_expected',
    'current_salary': 'salary_current',
    'start_date': 'availability',
    'mobile': 'phone',
    'cellphone': 'phone'
};

function resolveAlias(label) {
    return FIELD_ALIASES[label] || label;
}

function loadDatasetsFromFolder(folderPath) {
    const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.json')).sort();
    let merged = [];
    files.forEach(file => {
        const data = JSON.parse(fs.readFileSync(path.join(folderPath, file), 'utf8'));
        merged = merged.concat(data);
        console.log(`  Loaded ${file}: ${data.length} samples`);
    });
    return merged;
}

function benchmarkHeuristic(dataset, datasetName) {
    console.log(`\n${'='.repeat(60)}\nBenchmarking: ${datasetName}\n${'='.repeat(60)}\n`);

    const engine = new HeuristicEngine({ debug: false });
    let correct = 0, total = 0, noMatch = 0;
    const perClassStats = {}, confidenceStats = [];

    dataset.forEach(sample => {
        total++;
        const field = {
            name: sample.features.name || '',
            id: sample.features.automationId || '',
            placeholder: sample.features.placeholder || '',
            label: sample.features.label || '',
            type: sample.features.type || 'text'
        };

        const result = engine.classify(field, {
            parentContext: sample.features.parentContext || '',
            siblingContext: sample.features.siblingContext || ''
        });

        // Resolve aliases for both predicted and actual
        const predicted = resolveAlias(result ? result.label : 'unknown');
        const actual = resolveAlias(sample.label);

        if (!perClassStats[actual]) perClassStats[actual] = { total: 0, correct: 0, predicted: {} };
        perClassStats[actual].total++;

        if (predicted === actual) {
            correct++;
            perClassStats[actual].correct++;
        } else {
            perClassStats[actual].predicted[predicted] = (perClassStats[actual].predicted[predicted] || 0) + 1;
        }

        if (predicted === 'unknown') noMatch++;
        if (result) confidenceStats.push({ predicted, actual, confidence: result.confidence, correct: predicted === actual });
    });

    const accuracy = (correct / total) * 100;
    const coverage = ((total - noMatch) / total) * 100;
    const avgConf = confidenceStats.reduce((sum, s) => sum + s.confidence, 0) / confidenceStats.length;

    console.log(`\n📊 Overall Results:`);
    console.log(`  Total: ${total} | Correct: ${correct} | Accuracy: ${accuracy.toFixed(2)}%`);
    console.log(`  Coverage: ${coverage.toFixed(2)}% (${total - noMatch}/${total}) | No match: ${noMatch}`);
    console.log(`  Avg confidence: ${avgConf.toFixed(3)}`);

    console.log(`\n📈 Top 20 Classes:`);
    Object.entries(perClassStats).sort((a, b) => b[1].total - a[1].total).slice(0, 20).forEach(([type, stats]) => {
        const acc = (stats.correct / stats.total) * 100;
        const icon = acc >= 80 ? '✅' : acc >= 50 ? '⚠️' : '❌';
        console.log(`  ${icon} ${type.padEnd(25)} ${stats.correct}/${stats.total} (${acc.toFixed(1)}%)`);
    });

    console.log(`\n🏆 Perfect Classes (100%, min 3):`);
    Object.entries(perClassStats).filter(([_, s]) => s.total >= 3 && s.correct === s.total)
        .sort((a, b) => b[1].total - a[1].total).slice(0, 10)
        .forEach(([type, stats]) => console.log(`  ✅ ${type.padEnd(25)} ${stats.total}/${stats.total}`));

    console.log(`\n❌ Worst Classes (min 3):`);
    Object.entries(perClassStats).filter(([_, s]) => s.total >= 3)
        .sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total)).slice(0, 15)
        .forEach(([type, stats]) => {
            const acc = (stats.correct / stats.total) * 100;
            const top = Object.entries(stats.predicted || {}).sort((a, b) => b[1] - a[1])[0];
            const info = top ? ` → '${top[0]}'` : '';
            console.log(`  ❌ ${type.padEnd(25)} ${stats.correct}/${stats.total} (${acc.toFixed(1)}%)${info}`);
        });

    const correctConf = confidenceStats.filter(s => s.correct);
    const incorrectConf = confidenceStats.filter(s => !s.correct);
    console.log(`\n🎯 Confidence:`);
    if (correctConf.length) console.log(`  Correct: ${(correctConf.reduce((s, c) => s + c.confidence, 0) / correctConf.length).toFixed(3)}`);
    if (incorrectConf.length) console.log(`  Incorrect: ${(incorrectConf.reduce((s, c) => s + c.confidence, 0) / incorrectConf.length).toFixed(3)}`);

    return { accuracy, coverage, total, correct, noMatch, perClassStats };
}

async function main() {
    console.log('🔍 HeuristicEngine V3.1 Benchmark (with Alias Resolution)\n');

    const trainData = loadDatasetsFromFolder(path.join(__dirname, 'train-dataset'));
    const testData = loadDatasetsFromFolder(path.join(__dirname, 'test-dataset'));

    const trainResults = benchmarkHeuristic(trainData, 'Training Dataset');
    const testResults = benchmarkHeuristic(testData, 'Test Dataset');

    console.log(`\n${'='.repeat(60)}\n📊 SUMMARY\n${'='.repeat(60)}\n`);
    console.log(`Training: ${trainResults.accuracy.toFixed(2)}% | Coverage: ${trainResults.coverage.toFixed(2)}%`);
    console.log(`Test:     ${testResults.accuracy.toFixed(2)}% | Coverage: ${testResults.coverage.toFixed(2)}%`);

    const diff = trainResults.accuracy - testResults.accuracy;
    if (Math.abs(diff) < 5) console.log(`\n✅ Good generalization (${diff.toFixed(2)}% diff)`);
    else if (diff > 5) console.log(`\n⚠️ Overfitting (+${diff.toFixed(2)}%)`);
    else console.log(`\n✅ Better on test (${diff.toFixed(2)}%)`);
}

main().catch(console.error);
