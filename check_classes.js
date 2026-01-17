
const FieldTypes = require('./autofill/domains/inference/FieldTypes.js');

console.log('--- Checking Class Count ---');
try {
    const classes = FieldTypes.ORDERED_CLASSES;
    console.log(`ORDERED_CLASSES length: ${classes.length}`);
    if (classes.length !== 88 && classes.length !== 89) {
        console.log('⚠️ COUNT MISMATCH! Expected 88 or 89.');
        // console.log('Classes:', classes);
    } else {
        console.log('✅ Count matches expectation (88/89).');
    }

    // Check NeuralClassifier static output size if possible
    // (Need to read file or require it, but it might have side effects)
} catch (e) {
    console.error(e);
}
