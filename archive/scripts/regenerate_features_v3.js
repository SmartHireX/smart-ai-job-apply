/**
 * Regenerate Training Features V3 Script
 * 
 * Uses the new keyword-based FeatureExtractorV3 to generate
 * discriminative 97-dimensional feature vectors.
 */

const fs = require('fs');
const path = require('path');

// Load FeatureExtractorV3
const FeatureExtractorV3 = require('../../autofill/domains/inference/feature-extractor-v3.js');

const TRAIN_DIR = path.join(__dirname, 'train-dataset');
const OUTPUT_PATH = path.join(__dirname, 'train-dataset-v3.json');

// Initialize feature extractor
const featureExtractor = new FeatureExtractorV3();

console.log('🔄 Regenerating Training Features with V3 (Keyword-Based)');
console.log('==========================================================\n');

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

// Process each sample through FeatureExtractorV3
const regenerated = [];
let processed = 0;
let failed = 0;

console.log('\n🔧 Regenerating feature vectors with V3...');

for (const sample of allSamples) {
    processed++;

    try {
        // Extract features directly from sample (V3 handles both formats)
        const features = featureExtractor.extract(sample);

        if (features && features.length === FeatureExtractorV3.FEATURE_DIM) {
            regenerated.push({
                features: features,  // 97-dimensional vector
                label: sample.label
            });
        } else {
            console.warn(`   ⚠️ Invalid feature vector for sample ${processed}: ${features?.length || 0} dims`);
            failed++;
        }

    } catch (e) {
        console.warn(`   ⚠️ Failed to process sample ${processed}: ${e.message}`);
        failed++;
    }

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

// Verify feature dimensions and show sample
if (regenerated.length > 0) {
    const sample = regenerated[0];
    console.log(`\n🔍 Sample verification:`);
    console.log(`   Feature dimensions: ${sample.features.length}`);
    console.log(`   Label: ${sample.label}`);

    // Show which keyword features are active (non-zero in first 88 dims)
    const activeKeywords = [];
    const classNames = Object.keys(FeatureExtractorV3.KEYWORD_MAP);
    for (let i = 0; i < 88; i++) {
        if (sample.features[i] > 0) {
            activeKeywords.push(`${classNames[i]}:${sample.features[i].toFixed(2)}`);
        }
    }
    console.log(`   Active keywords: ${activeKeywords.join(', ') || 'none'}`);
    console.log(`   Structural: ${sample.features.slice(88).join(', ')}`);
}

console.log('\n🎉 Done!');
