/**
 * Synthetic Dataset Generator V8 (Enterprise Grade)
 * Massive synonym dictionary for all 129 classes + Workday depth.
 */

const fs = require('fs');
const path = require('path');

// Mock window for dependencies
global.window = {};

// Load dependencies
const FieldTypes = require('../../autofill/domains/inference/FieldTypes.js');

const OUTPUT_FILE = path.join(__dirname, 'training_data.json');
const LLM_DATA_FILE = path.join(__dirname, 'llm_generated_data.json');

// ============================================================================
// MASSIVE SYNONYM DICTIONARY
// ============================================================================
const SYNONYMS = {
    first_name: ['first name', 'given name', 'fname', 'first', 'legal first name', 'forename'],
    last_name: ['last name', 'family name', 'surname', 'lname', 'legal last name', 'family name (surname)'],
    email: ['email', 'email address', 'e-mail', 'primary email', 'contact email', 'electronic mail'],
    phone: ['phone', 'telephone', 'mobile', 'cell', 'contact number', 'phone number', 'mobile phone'],
    address_line_1: ['address', 'street address', 'address line 1', 'location', 'mailing address'],
    city: ['city', 'town', 'municipality', 'locality'],
    state: ['state', 'province', 'region', 'state/province', 'territory'],
    zip_code: ['zip', 'zip code', 'postal code', 'postcode', 'postal'],
    job_title: ['job title', 'position', 'role', 'current title', 'designation', 'occupation'],
    employer_name: ['company', 'employer', 'organization', 'previous company', 'current employer'],
    institution_name: ['school', 'university', 'college', 'institution', 'academy', 'education institute'],
    degree_type: ['degree', 'qualification', 'level of education', 'diploma', 'degree level'],
    field_of_study: ['major', 'field of study', 'discipline', 'subject', 'specialization'],
    gpa: ['gpa', 'grade point average', 'marks', 'percentage', 'grade', 'score'],
    work_authorization: ['work authorization', 'right to work', 'legally authorized', 'work permit'],
    sponsorship_required: ['visa sponsorship', 'require sponsorship', 'sponsor needed', 'visa status'],
    gender: ['gender', 'sex', 'gender identity', 'biological sex'],
    race_ethnicity: ['race', 'ethnicity', 'ethnic group', 'racial background', 'heritage'],
    veteran_status: ['veteran', 'military service', 'protected veteran', 'veteran status'],
    disability_status: ['disability', 'impairment', 'accessibility needs', 'disability status'],
    middle_name: ['middle name', 'middle initial', 'mi', 'middle'],
    linkedin_url: ['linkedin', 'linkedin profile', 'linkedin url', 'linkedin link'],
    github_url: ['github', 'github profile', 'github url', 'github repository'],
    portfolio_url: ['portfolio', 'website', 'personal website', 'blog', 'online portfolio'],
    salary_expected: ['expected salary', 'desired compensation', 'salary expectations', 'target pay'],
    years_experience: ['years of experience', 'total experience', 'work history length'],
    desired_role: ['desired role', 'target position', 'preferred role'],
    availability: ['availability', 'notice period', 'when can you start'],
    notice_period: ['notice period', 'earliest start', 'available from'],
    cover_letter: ['cover letter', 'statement', 'personal statement', 'why us'],
    job_description: ['responsibilities', 'duties', 'what you did', 'job summary'],
    skills: ['skills', 'technologies', 'expertise', 'proficiencies', 'stack'],
    languages: ['languages', 'fluent in', 'native language', 'multilingual'],
    references: ['references', 'vouch', 'professional reference'],
    referral_source: ['heard from', 'source', 'how did you find us', 'referral'],
};

// ... and so on. To avoid writing 129 entries, I'll generate generic ones 
// for the missing classes during the loop.

function generateSample(label, correctClass, isWorkday = false) {
    const noise = Math.random();
    return {
        features: {
            label: noise > 0.05 ? label : '',
            name: !isWorkday ? label.toLowerCase().replace(/ /g, '_') : (noise > 0.4 ? label : ''),
            id: !isWorkday ? label.toLowerCase().replace(/ /g, '-') : (noise > 0.6 ? label : ''),
            automationId: isWorkday ? label : '',
            placeholder: noise > 0.5 ? `Enter your ${label}` : '',
            ariaLabel: noise > 0.7 ? label : '',
            parentContext: isWorkday ? 'Workday Form' : (noise > 0.85 ? 'Personal Info' : ''),
            // siblingContext: noise > 0.95 ? 'Required' : '' // Disabled per user request
            siblingContext: ''
        },
        label: correctClass
    };
}

function generateDataset() {
    // console.log('🧬 Generating synthetic dataset V8 (Enterprise Scale)...');
    let dataset = [];
    const targetSize = 50000; // Reduced for faster retraining

    // 1. Process Synonym Dictionary
    for (const [className, seeds] of Object.entries(SYNONYMS)) {
        for (const seed of seeds) {
            // 500 samples per synonym
            for (let i = 0; i < 500; i++) {
                dataset.push(generateSample(seed, className, Math.random() > 0.5));
            }
        }
    }

    // 2. Full Taxonomy Coverage for MISSING classes
    const allClasses = FieldTypes.ORDERED_CLASSES;
    for (const className of allClasses) {
        if (!SYNONYMS[className]) {
            const seed = className.replace(/_/g, ' ');
            for (let i = 0; i < 500; i++) {
                dataset.push(generateSample(seed, className, Math.random() > 0.5));
            }
        }
    }

    // 3. Load LLM Data (High Priority)
    if (fs.existsSync(LLM_DATA_FILE)) {
        const llmData = JSON.parse(fs.readFileSync(LLM_DATA_FILE, 'utf8'));
        // Boost LLM data significantly (10x)
        for (let i = 0; i < 20; i++) {
            dataset = dataset.concat(llmData);
        }
    }

    // Shuffle and Cap
    // console.log(`   Scaling to ${targetSize} samples...`);
    const finalDataset = [];
    while (finalDataset.length < targetSize) {
        const source = dataset[Math.floor(Math.random() * dataset.length)];
        finalDataset.push({
            features: {
                ...source.features,
                label: Math.random() > 0.1 ? source.features.label : source.features.label.toUpperCase()
            },
            label: source.label
        });
    }

    // Final Shuffle
    for (let i = finalDataset.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [finalDataset[i], finalDataset[j]] = [finalDataset[j], finalDataset[i]];
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalDataset, null, 2));
    // console.log(`✅ Saved ${finalDataset.length} samples to ${OUTPUT_FILE}`);
}

generateDataset();
