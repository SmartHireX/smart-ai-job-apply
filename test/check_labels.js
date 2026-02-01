const FieldTypes = require('./autofill/domains/inference/FieldTypes.js');
const fs = require('fs');
const path = require('path');

console.log('FieldTypes has', FieldTypes.ORDERED_CLASSES.length, 'classes');
console.log('First 20 classes:', FieldTypes.ORDERED_CLASSES.slice(0, 20));

// Check training data labels
const dataDir = './scripts/train/train-dataset';
const labels = new Set();
fs.readdirSync(dataDir).filter(f => f.endsWith('.json')).forEach(file => {
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, file)));
    data.forEach(item => labels.add(item.label));
});
console.log('\nTraining data has', labels.size, 'unique labels');
const missing = [...labels].filter(l => !FieldTypes.ORDERED_CLASSES.includes(l));
console.log('Labels NOT in FieldTypes (' + missing.length + '):', missing);
