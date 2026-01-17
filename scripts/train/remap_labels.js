/**
 * Label Remapping Script
 * Maps training data labels to existing FieldTypes.ORDERED_CLASSES (88 classes)
 */

const fs = require('fs');
const path = require('path');
const FieldTypes = require('../../autofill/domains/inference/FieldTypes.js');

// Label mapping: old label -> existing FieldTypes class
const LABEL_REMAP = {
    // Address variants
    'address': 'address_line',

    // Education variants
    'degree': 'degree_type',

    // Salary variants
    'salary': 'salary_expected',
    'current_salary': 'salary_current',

    // Emergency contact (map to unknown since no direct equivalent)
    'emergency_contact_name': 'unknown',
    'emergency_contact_phone': 'unknown',
    'emergency_contact_relationship': 'unknown',

    // Misc personal
    'dietary_restrictions': 'unknown',
    'tshirt_size': 'unknown',
    'age_verification': 'legal_age',

    // Social/URL variants
    'youtube_url': 'portfolio_url',
    'skype_url': 'portfolio_url',
    'whatsapp': 'phone',

    // Application questions
    'why_company': 'additional_info',
    'strengths': 'additional_info',
    'weaknesses': 'additional_info',
    'challenge': 'additional_info',

    // Referral
    'referral_name': 'unknown',
    'referral_code': 'unknown',

    // Work history
    'employer_name': 'company_name',
    'previous_employment': 'current_company',

    // References
    'references': 'unknown',

    // ID documents
    'ssn': 'tax_id',
    'passport': 'citizenship',
    'drivers_license': 'work_auth',

    // Job level
    'job_level': 'years_experience',

    // Misc
    'submitted_by': 'unknown'
};

const dataDir = './scripts/train/train-dataset';
const validClasses = new Set(FieldTypes.ORDERED_CLASSES);

let totalRemapped = 0;
let totalSamples = 0;
const remapCounts = {};

// Process each training file
const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
console.log(`Processing ${files.length} training files...\n`);

files.forEach(file => {
    const filePath = path.join(dataDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    let fileRemapped = 0;

    data.forEach(item => {
        totalSamples++;
        const originalLabel = item.label;

        // Check if label needs remapping
        if (!validClasses.has(originalLabel)) {
            const newLabel = LABEL_REMAP[originalLabel] || 'unknown';
            item.label = newLabel;
            fileRemapped++;
            totalRemapped++;

            // Track remap counts
            const key = `${originalLabel} -> ${newLabel}`;
            remapCounts[key] = (remapCounts[key] || 0) + 1;
        }
    });

    // Write updated file
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`  ${file}: ${fileRemapped} labels remapped`);
});

console.log(`\n=== Summary ===`);
console.log(`Total samples: ${totalSamples}`);
console.log(`Total remapped: ${totalRemapped} (${(totalRemapped / totalSamples * 100).toFixed(1)}%)`);
console.log(`\nRemap breakdown:`);
Object.entries(remapCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([mapping, count]) => {
        console.log(`  ${mapping}: ${count}`);
    });

// Also process augmented dataset if exists
const augmentedPath = './scripts/train/train-dataset-augmented.json';
if (fs.existsSync(augmentedPath)) {
    console.log(`\nProcessing augmented dataset...`);
    const augData = JSON.parse(fs.readFileSync(augmentedPath, 'utf-8'));
    let augRemapped = 0;

    augData.forEach(item => {
        if (!validClasses.has(item.label)) {
            item.label = LABEL_REMAP[item.label] || 'unknown';
            augRemapped++;
        }
    });

    fs.writeFileSync(augmentedPath, JSON.stringify(augData, null, 2));
    console.log(`  Augmented dataset: ${augRemapped} labels remapped`);
}

console.log(`\n✅ Label remapping complete!`);
