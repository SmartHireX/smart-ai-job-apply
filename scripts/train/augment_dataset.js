/**
 * Data Augmentation Script for Neural Classifier Training
 * 
 * Expands training dataset from 3,456 to 8,000-10,000 samples using:
 * 1. Synonym expansion for field labels
 * 2. Label paraphrasing with variations
 * 3. Context mixing from different samples
 * 
 * Usage: node scripts/train/augment_dataset.js
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// SYNONYM DICTIONARIES
// ============================================================================

const LABEL_SYNONYMS = {
    // Name fields
    'first name': ['given name', 'forename', 'christian name', 'first'],
    'last name': ['surname', 'family name', 'last'],
    'middle name': ['middle initial', 'middle'],
    'full name': ['name', 'complete name', 'your name'],
    'preferred name': ['nickname', 'preferred first name', 'goes by'],

    // Contact fields
    'email': ['email address', 'e-mail', 'electronic mail', 'contact email'],
    'email_secondary': ['alternate email', 'secondary email', 'backup email', 'other email'],
    'phone': ['phone number', 'telephone', 'mobile', 'cell phone', 'contact number'],
    'phone_home': ['home phone', 'landline', 'residence phone'],
    'address': ['street address', 'mailing address', 'home address'],
    'city': ['town', 'municipality'],
    'state': ['province', 'region'],
    'zip code': ['postal code', 'zip', 'postcode'],
    'country': ['nation', 'country/region'],

    // Work fields
    'company': ['employer', 'organization', 'company name'],
    'job title': ['title', 'position', 'role', 'job role'],
    'start date': ['from', 'began', 'employment start'],
    'end date': ['to', 'until', 'employment end'],
    'currently work here': ['current position', 'present', 'current employer'],
    'responsibilities': ['duties', 'description', 'job description'],

    // Education fields
    'school': ['university', 'college', 'institution', 'educational institution'],
    'degree': ['degree type', 'qualification', 'education level'],
    'major': ['field of study', 'area of study', 'concentration', 'specialization'],
    'gpa': ['grade point average', 'grades', 'academic performance'],
    'graduation date': ['completion date', 'graduated', 'year graduated'],

    // Social media
    'linkedin': ['linkedin profile', 'linkedin url', 'linkedin link'],
    'github': ['github profile', 'github username', 'github url'],
    'portfolio': ['portfolio url', 'website', 'personal website'],

    // Application fields
    'cover letter': ['letter of interest', 'application letter', 'why interested'],
    'resume': ['cv', 'curriculum vitae', 'resume/cv'],
    'salary expectation': ['desired salary', 'expected salary', 'salary requirement'],
    'availability': ['start date', 'available to start', 'when can you start'],
    'work authorization': ['eligible to work', 'work permit', 'visa status'],

    // Underperforming Classes (Targeted Augmentation)
    'military_service': ['veteran status', 'military experience', 'armed forces', 'service history'],
    'publications': ['published works', 'papers', 'research papers', 'articles'],
    'patents': ['inventions', 'intellectual property', 'patent list'],
    'awards': ['honors', 'achievements', 'recognitions', 'prizes'],
    'speaking': ['presentations', 'public speaking', 'conference talks'],
    'references': ['referees', 'recommendations', 'professional references'],
    'hobbies': ['interests', 'activities', 'pastimes', 'leisure'],
    'volunteering': ['community service', 'volunteer work', 'pro bono'],

    // Preferences
    'willing to relocate': ['open to relocation', 'relocation', 'can relocate'],
    'remote work': ['work from home', 'telecommute', 'remote position'],
    'work schedule': ['availability', 'preferred hours', 'schedule preference']
};

const WORD_SYNONYMS = {
    'enter': ['provide', 'type', 'input'],
    'your': ['my', 'the'],
    'please': ['kindly', ''],
    'optional': ['not required', 'if applicable'],
    'required': ['mandatory', 'must provide'],
    'current': ['present', 'existing'],
    'previous': ['former', 'past'],
    'professional': ['work', 'career'],
    'personal': ['private', 'individual']
};

// ============================================================================
// AUGMENTATION FUNCTIONS
// ============================================================================

/**
 * Generate label variations using synonyms
 */
function generateLabelVariations(originalLabel) {
    if (!originalLabel) return [originalLabel];

    const normalized = originalLabel.toLowerCase().trim();
    const variations = [originalLabel]; // Keep original

    // Check for exact matches in LABEL_SYNONYMS
    for (const [key, synonyms] of Object.entries(LABEL_SYNONYMS)) {
        if (normalized.includes(key)) {
            synonyms.forEach(syn => {
                const variant = originalLabel.replace(new RegExp(key, 'gi'), syn);
                if (variant !== originalLabel) {
                    variations.push(variant);
                    // Capitalize first letter
                    variations.push(variant.charAt(0).toUpperCase() + variant.slice(1));
                }
            });
        }
    }

    // Apply word-level synonyms
    for (const [word, synonyms] of Object.entries(WORD_SYNONYMS)) {
        if (normalized.includes(word)) {
            synonyms.forEach(syn => {
                const variant = originalLabel.replace(new RegExp(`\\b${word}\\b`, 'gi'), syn);
                if (variant !== originalLabel && variant.trim()) {
                    variations.push(variant);
                }
            });
        }
    }

    // Remove duplicates and empty strings
    return [...new Set(variations.filter(v => v && v.trim()))];
}

/**
 * Generate placeholder variations
 */
function generatePlaceholderVariations(originalPlaceholder) {
    if (!originalPlaceholder) return [null, '', originalPlaceholder];

    const variations = [originalPlaceholder];

    // Add ellipsis variant
    if (!originalPlaceholder.includes('...')) {
        variations.push(originalPlaceholder + '...');
    }

    // Add "e.g." variant
    if (!originalPlaceholder.toLowerCase().includes('e.g.')) {
        variations.push('e.g. ' + originalPlaceholder);
        variations.push('E.g., ' + originalPlaceholder);
    }

    // Add parentheses variant
    variations.push('(' + originalPlaceholder + ')');

    return variations;
}

/**
 * Create augmented samples from original sample
 */
function augmentSample(sample, maxVariations = 3) {
    const augmented = [];

    // Get label variations
    const labelVariations = generateLabelVariations(sample.features.label || '');
    const placeholderVariations = sample.features.placeholder
        ? generatePlaceholderVariations(sample.features.placeholder)
        : [null];

    // Limit combinations to avoid explosion
    const selectedLabels = labelVariations.slice(0, maxVariations);
    const selectedPlaceholders = placeholderVariations.slice(0, 2);

    // Generate combinations
    for (const label of selectedLabels) {
        for (const placeholder of selectedPlaceholders) {
            // Skip if identical to original
            if (label === sample.features.label && placeholder === sample.features.placeholder) {
                continue;
            }

            augmented.push({
                features: {
                    ...sample.features,
                    label: label,
                    placeholder: placeholder
                },
                label: sample.label  // Keep ground truth the same
            });
        }
    }

    return augmented;
}

/**
 * Mix contexts from different samples of the same class
 */
function mixContexts(samples, maxMixed = 2) {
    const byClass = {};

    // Group by class
    for (const sample of samples) {
        const cls = sample.label;
        if (!byClass[cls]) byClass[cls] = [];
        byClass[cls].push(sample);
    }

    const mixed = [];

    // For each class with multiple samples
    for (const [cls, classSamples] of Object.entries(byClass)) {
        if (classSamples.length < 2) continue;

        // Create mixed samples
        for (let i = 0; i < Math.min(maxMixed, classSamples.length); i++) {
            const base = classSamples[i];
            const donor = classSamples[(i + 1) % classSamples.length];

            mixed.push({
                features: {
                    ...base.features,
                    parentContext: donor.features.parentContext,
                    siblingContext: '' // base.features.siblingContext (Disabled)
                },
                label: cls
            });

            mixed.push({
                features: {
                    ...base.features,
                    parentContext: base.features.parentContext,
                    siblingContext: '' // donor.features.siblingContext (Disabled)
                },
                label: cls
            });
        }
    }

    return mixed;
}

// ============================================================================
// MAIN AUGMENTATION PIPELINE
// ============================================================================

function augmentDataset() {
    console.log('🔄 Data Augmentation Pipeline');
    console.log('==============================\n');

    // Load original training data
    const trainFolder = path.join(__dirname, 'train-dataset');
    const files = fs.readdirSync(trainFolder).filter(f => f.endsWith('.json'));

    let originalData = [];
    for (const file of files) {
        const filepath = path.join(trainFolder, file);
        const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        originalData = originalData.concat(data);
        console.log(`   Loaded ${data.length} samples from ${file}`);
    }

    // STRIP SIBLING CONTEXT from all samples (User Request)
    originalData.forEach(sample => {
        if (sample.features) sample.features.siblingContext = '';
    });

    console.log(`\n📊 Original dataset: ${originalData.length} samples\n`);

    // Step 1: Synonym expansion
    console.log('🔤 Step 1: Generating synonym variations...');
    let augmented = [];
    for (const sample of originalData) {
        const variations = augmentSample(sample, 5);  // Increased from 2 to 5
        augmented = augmented.concat(variations);
    }
    console.log(`   Generated ${augmented.length} synonym variations\n`);

    // Step 2: Context mixing
    console.log('🔀 Step 2: Mixing contexts...');
    const mixed = mixContexts(originalData, 3);   // Increased from 1 to 3
    augmented = augmented.concat(mixed);
    console.log(`   Generated ${mixed.length} context-mixed samples\n`);

    // Combine original + augmented
    const finalDataset = [...originalData, ...augmented];
    console.log(`✅ Final dataset: ${finalDataset.length} samples (${(finalDataset.length / originalData.length).toFixed(1)}x expansion)\n`);

    // Class distribution
    const classCounts = {};
    for (const sample of finalDataset) {
        classCounts[sample.label] = (classCounts[sample.label] || 0) + 1;
    }

    console.log(`📈 Class distribution:`);
    console.log(`   Total classes: ${Object.keys(classCounts).length}`);
    console.log(`   Avg samples/class: ${(finalDataset.length / Object.keys(classCounts).length).toFixed(1)}`);
    const counts = Object.values(classCounts).sort((a, b) => b - a);
    console.log(`   Max: ${counts[0]}, Min: ${counts[counts.length - 1]}, Median: ${counts[Math.floor(counts.length / 2)]}\n`);

    // Save augmented dataset
    const outputPath = path.join(__dirname, 'train-dataset-augmented.json');
    fs.writeFileSync(outputPath, JSON.stringify(finalDataset, null, 2));
    console.log(`💾 Saved augmented dataset to: ${outputPath}`);
    console.log(`   Size: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB\n`);

    console.log('🎉 Data augmentation complete!');
}

// Run augmentation
augmentDataset();
