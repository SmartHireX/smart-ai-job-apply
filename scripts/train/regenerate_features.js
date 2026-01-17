/**
 * Regenerate Training Features Script
 * 
 * This script reads the existing training data (with field attributes)
 * and runs it through the current FeatureExtractor to generate
 * proper 84-dimensional feature vectors for neural network training.
 */

const fs = require('fs');
const path = require('path');

// Load dependencies
require('../../autofill/domains/inference/FieldTypes.js');
const FeatureExtractor = require('../../autofill/domains/inference/feature-extractor.js');

const TRAIN_DIR = path.join(__dirname, 'train-dataset');
const OUTPUT_PATH = path.join(__dirname, 'train-dataset-regenerated.json');

// Initialize feature extractor
const featureExtractor = new FeatureExtractor();

console.log('🔄 Regenerating Training Features');
console.log('================================\n');

// Load all training datasets
let allSamples = [];
const files = fs.readdirSync(TRAIN_DIR).filter(f => f.endsWith('.json'));

console.log(`📂 Loading ${files.length} training files...`);
for (const file of files) {
    const filePath = path.join(TRAIN_DIR, file);
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        console.log(`   ${file}: ${data.length} samples`);
        allSamples = allSamples.concat(data);
    } catch (e) {
        console.warn(`   ⚠️ Failed to load ${file}: ${e.message}`);
    }
}

console.log(`\n📊 Total samples to process: ${allSamples.length}`);

// Process each sample through FeatureExtractor
const regenerated = [];
let processed = 0;
let failed = 0;

console.log('\n🔧 Regenerating feature vectors...');

for (const sample of allSamples) {
    processed++;

    try {
        // Extract the field object from the sample
        const fieldAttrs = sample.features;
        const targetLabel = sample.label;

        // Create a mock field object that FeatureExtractor expects
        const mockField = {
            tagName: 'INPUT',
            type: 'text',
            name: fieldAttrs.name || '',
            id: fieldAttrs.automationId || fieldAttrs.name || '',
            placeholder: fieldAttrs.placeholder || '',
            value: '',
            className: '',
            // Create a mock element for context extraction
            getAttribute: (attr) => {
                if (attr === 'data-automation-id') return fieldAttrs.automationId || null;
                if (attr === 'aria-label') return fieldAttrs.label || null;
                if (attr === 'placeholder') return fieldAttrs.placeholder || null;
                if (attr === 'name') return fieldAttrs.name || null;
                if (attr === 'id') return fieldAttrs.automationId || fieldAttrs.name || null;
                return null;
            },
            closest: () => null,
            parentElement: null,
            previousElementSibling: null,
            nextElementSibling: null,
            labels: fieldAttrs.label ? [{ textContent: fieldAttrs.label }] : []
        };

        // Add context hints
        mockField._parentContext = fieldAttrs.parentContext || '';
        mockField._siblingContext = fieldAttrs.siblingContext || '';
        mockField._label = fieldAttrs.label || '';

        // Generate feature vector using FeatureExtractor
        const features = featureExtractor.extract(mockField);

        if (features && features.length === 84) {
            regenerated.push({
                features: features,  // Now an array of 84 numbers
                label: targetLabel
            });
        } else {
            console.warn(`   ⚠️ Invalid feature vector for sample ${processed}: ${features?.length || 0} dims`);
            failed++;
        }

    } catch (e) {
        console.warn(`   ⚠️ Failed to process sample ${processed}: ${e.message}`);
        failed++;
    }

    // Progress logging
    if (processed % 500 === 0) {
        console.log(`   Processed ${processed}/${allSamples.length} (${failed} failed)`);
    }
}

console.log(`\n✅ Regeneration complete!`);
console.log(`   Success: ${regenerated.length}`);
console.log(`   Failed: ${failed}`);

// Save regenerated data
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(regenerated, null, 2));
console.log(`\n💾 Saved to: ${OUTPUT_PATH}`);

// Verify feature dimensions
if (regenerated.length > 0) {
    const sample = regenerated[0];
    console.log(`\n🔍 Sample verification:`);
    console.log(`   Feature dimensions: ${sample.features.length}`);
    console.log(`   Label: ${sample.label}`);
    console.log(`   Features[0:5]: ${sample.features.slice(0, 5).map(f => f.toFixed(3)).join(', ')}`);
}

console.log('\n🎉 Done!');
