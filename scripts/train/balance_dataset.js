/**
 * Balance Training Dataset
 * 
 * techniques:
 * 1. Oversampling: Duplicate samples for rare classes (target min 50)
 * 2. Undersampling: Cap dominant classes (target max 500)
 */

const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, 'train-dataset-augmented.json');
const OUTPUT_PATH = path.join(__dirname, 'train-dataset-v3-balanced.json');

const TARGET_MIN = 50;
const TARGET_MAX = 500;

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

if (!fs.existsSync(INPUT_PATH)) {
    console.error(`❌ Input file not found: ${INPUT_PATH}`);
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
console.log(`📂 Loaded ${data.length} samples`);

// Normalization Map to align with FieldTypes.ORDERED_CLASSES
const LABEL_MAP = {
    'disability_status': 'disability',
    'veteran_status': 'veteran',
    'race_ethnicity': 'race',
    'work_authorization': 'work_auth',
    'sponsorship_required': 'sponsorship',
    'age_check': 'legal_age',
    'referral_source': 'additional_info'
};

// Group by label with normalization
const buckets = {};
data.forEach(s => {
    let label = s.label;
    if (label === 'work_style') return; // FILTERED OUT per user request
    if (LABEL_MAP[label]) {
        label = LABEL_MAP[label];
        s.label = label; // Update sample label in place
    }

    // Only bucket if label is valid (optional check, but good for safety)
    if (!buckets[label]) buckets[label] = [];
    buckets[label].push(s);
});

console.log(`📊 Found ${Object.keys(buckets).length} classes`);

let balanced = [];
let oversampledCount = 0;
let undersampledCount = 0;

for (const [label, samples] of Object.entries(buckets)) {
    let count = samples.length;
    let selected = [];

    if (count < TARGET_MIN) {
        // Oversample
        selected = [...samples]; // Start with originals
        while (selected.length < TARGET_MIN) {
            // Pick random sample to duplicate
            const r = samples[Math.floor(Math.random() * samples.length)];
            // Deep copy to potentially add noise later if needed, but for now simple duplication
            selected.push(JSON.parse(JSON.stringify(r)));
            oversampledCount++;
        }
    } else if (count > TARGET_MAX) {
        // Undersample
        // Shuffle first to minimize bias
        const shuffled = shuffleArray([...samples]);
        selected = shuffled.slice(0, TARGET_MAX);
        undersampledCount += (count - TARGET_MAX);
    } else {
        // Keep as is
        selected = [...samples];
    }

    balanced = balanced.concat(selected);
    console.log(`   ${label.padEnd(30)}: ${count.toString().padStart(4)} -> ${selected.length.toString().padStart(4)}`);
}

// Final shuffle of the entire dataset
balanced = shuffleArray(balanced);

console.log('-----------------------------------');
console.log(`✅ Balanced dataset size: ${balanced.length}`);
console.log(`   Oversampled added: ${oversampledCount}`);
console.log(`   Undersampled removed: ${undersampledCount}`);

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(balanced, null, 2));
console.log(`💾 Saved to: ${OUTPUT_PATH}`);
