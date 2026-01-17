/**
 * Prepare Full Training Dataset
 * 
 * Merges all available data sources:
 * - individual batches in scripts/train/train-dataset/*.json
 * - augmented dataset in scripts/train/train-dataset-augmented.json
 * - LLM generated data
 * 
 * Converts all to 95-dimensional V3 feature vectors.
 */

const fs = require('fs');
const path = require('path');

// Load FeatureExtractor
const FeatureExtractor = require('../../autofill/domains/inference/feature-extractor.js');

const DATA_DIR = __dirname;
const BATCH_DIR = path.join(DATA_DIR, 'train-dataset');
const AUGMENTED_PATH = path.join(DATA_DIR, 'train-dataset-augmented.json');
const LLM_PATH = path.join(DATA_DIR, 'llm_generated_data.json');
const OUTPUT_PATH = path.join(DATA_DIR, 'train-dataset-v3-full.json');

const fe = new FeatureExtractor();

async function prepare() {
    console.log('🚀 Preparing Full Training Dataset...');
    let allRawSamples = [];

    // 1. Load Batches
    if (fs.existsSync(BATCH_DIR)) {
        const batchFiles = fs.readdirSync(BATCH_DIR).filter(f => f.endsWith('.json'));
        console.log(`📂 Loading ${batchFiles.length} batch files from ${BATCH_DIR}...`);
        for (const file of batchFiles) {
            const data = JSON.parse(fs.readFileSync(path.join(BATCH_DIR, file), 'utf8'));
            allRawSamples = allRawSamples.concat(data);
        }
    }

    // 2. Load Augmented
    if (fs.existsSync(AUGMENTED_PATH)) {
        console.log(`📂 Loading augmented dataset: ${AUGMENTED_PATH}`);
        const data = JSON.parse(fs.readFileSync(AUGMENTED_PATH, 'utf8'));
        allRawSamples = allRawSamples.concat(data);
    }

    // 3. Load LLM Data
    if (fs.existsSync(LLM_PATH)) {
        console.log(`📂 Loading LLM data: ${LLM_PATH}`);
        const data = JSON.parse(fs.readFileSync(LLM_PATH, 'utf8'));
        allRawSamples = allRawSamples.concat(data);
    }

    console.log(`\n📊 Total raw samples collected: ${allRawSamples.length}`);

    // 4. Extract Features
    console.log('🔧 Extracting 95-dim features...');
    const processed = [];
    let count = 0;

    for (const sample of allRawSamples) {
        try {
            // Some samples have raw fields, some are already features.
            // If it has 'features' property as an object, it's raw.
            // If it has 'features' property as an array, it's already processed (skip or re-process).
            const input = sample.features || sample;

            // If it's already a 95-dim array, we can use it or re-extract for consistency.
            // Re-extracting is safer to ensure perfect alignment with current FE keyword map.
            const features = fe.extract(input);

            if (features && features.length === 95) {
                processed.push({
                    features: features,
                    label: sample.label
                });
            }
        } catch (e) {
            // Skip bad samples
        }

        count++;
        if (count % 1000 === 0) console.log(`   Processed ${count}/${allRawSamples.length}`);
    }

    console.log(`\n✅ Final processed samples: ${processed.length}`);

    // Save to disk
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(processed, null, 2));
    console.log(`💾 Saved full dataset to: ${OUTPUT_PATH}`);
}

prepare().catch(console.error);
