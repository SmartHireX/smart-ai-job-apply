const fs = require('fs');
const NeuralClassifier = require('./autofill/domains/inference/neural-classifier.js');
const FieldTypes = require('./autofill/domains/inference/FieldTypes.js');

async function checkRare() {
    console.log('🧪 Verifying Rare Class Performance');

    // Load model
    const modelPath = './autofill/domains/inference/model_v7_epoch50.json';
    if (!fs.existsSync(modelPath)) {
        console.log('Waiting for model file...');
        return;
    }
    const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));

    const classifier = new NeuralClassifier({ fieldTypes: FieldTypes });
    classifier.loadWeights(model);

    // Load balanced data
    const data = JSON.parse(fs.readFileSync('./scripts/train/train-dataset-v3-balanced.json', 'utf8'));

    // Rare targets (Canonical names from FieldTypes)
    const rareLabels = ['disability', 'veteran', 'race', 'work_auth'];

    for (const label of rareLabels) {
        // Find samples for this label
        const samples = data.filter(s => s.label === label);
        if (samples.length === 0) continue;

        let correct = 0;
        samples.forEach(s => {
            const res = classifier.predict(s.features);
            if (res.label === label) correct++;
        });

        console.log(`${label.padEnd(20)}: ${(correct / samples.length * 100).toFixed(1)}% (${correct}/${samples.length})`);
    }
}

checkRare();
