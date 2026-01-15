/**
 * Synthetic Dataset Generator V2
 * Generates rich training data for the Neural Classifier
 * 
 * This version creates more realistic field representations
 * based on actual patterns seen in job application forms.
 */

const fs = require('fs');
const path = require('path');

// Mock window for dependencies
global.window = {};

// Load dependencies
const FieldTypes = require('../../autofill/domains/inference/FieldTypes.js');
const HeuristicEngine = require('../../autofill/domains/inference/HeuristicEngine.js');

const OUTPUT_FILE = path.join(__dirname, 'training_data.json');

// ============================================================================
// REALISTIC SEED DATA
// Based on actual job application form patterns
// ============================================================================
const FIELD_TEMPLATES = {
    // Personal Identity
    first_name: [
        { label: 'First Name', name: 'firstName', id: 'first-name', placeholder: 'Enter your first name' },
        { label: 'First name *', name: 'first_name', id: 'firstname', placeholder: 'First name' },
        { label: 'Given Name', name: 'givenName', id: 'given-name', placeholder: '' },
        { label: 'First', name: 'fname', id: 'fname', placeholder: 'Your first name' },
        { label: 'Legal First Name', name: 'legalFirstName', id: 'legal-first', placeholder: '' },
    ],
    last_name: [
        { label: 'Last Name', name: 'lastName', id: 'last-name', placeholder: 'Enter your last name' },
        { label: 'Last name *', name: 'last_name', id: 'lastname', placeholder: 'Last name' },
        { label: 'Family Name', name: 'familyName', id: 'family-name', placeholder: '' },
        { label: 'Surname', name: 'surname', id: 'surname', placeholder: 'Your surname' },
        { label: 'Last', name: 'lname', id: 'lname', placeholder: '' },
    ],
    middle_name: [
        { label: 'Middle Name', name: 'middleName', id: 'middle-name', placeholder: '' },
        { label: 'Middle Initial', name: 'middleInitial', id: 'mi', placeholder: 'M.I.' },
    ],
    full_name: [
        { label: 'Full Name', name: 'fullName', id: 'full-name', placeholder: 'Enter your full name' },
        { label: 'Name *', name: 'name', id: 'candidate-name', placeholder: 'Your name' },
        { label: 'Legal Name', name: 'legalName', id: 'legal-name', placeholder: '' },
    ],

    // Contact
    email: [
        { label: 'Email', name: 'email', id: 'email', placeholder: 'email@example.com' },
        { label: 'Email Address *', name: 'emailAddress', id: 'email-address', placeholder: 'Enter email' },
        { label: 'E-mail', name: 'e-mail', id: 'e-mail', placeholder: '' },
        { label: 'Your Email', name: 'yourEmail', id: 'your-email', placeholder: 'you@company.com' },
    ],
    phone: [
        { label: 'Phone', name: 'phone', id: 'phone', placeholder: '(555) 555-5555' },
        { label: 'Phone Number *', name: 'phoneNumber', id: 'phone-number', placeholder: 'Enter phone' },
        { label: 'Mobile', name: 'mobile', id: 'mobile', placeholder: '' },
        { label: 'Contact Number', name: 'contactNumber', id: 'contact-number', placeholder: '' },
    ],

    // Online Presence
    linkedin_url: [
        { label: 'LinkedIn', name: 'linkedin', id: 'linkedin', placeholder: 'https://linkedin.com/in/...' },
        { label: 'LinkedIn Profile', name: 'linkedinUrl', id: 'linkedin-url', placeholder: '' },
        { label: 'LinkedIn URL', name: 'linkedin_url', id: 'linkedin-profile', placeholder: '' },
    ],
    github_url: [
        { label: 'GitHub', name: 'github', id: 'github', placeholder: 'https://github.com/...' },
        { label: 'GitHub Profile', name: 'githubUrl', id: 'github-url', placeholder: '' },
    ],
    portfolio_url: [
        { label: 'Portfolio', name: 'portfolio', id: 'portfolio', placeholder: 'https://portfolio.com' },
        { label: 'Personal Website', name: 'website', id: 'personal-site', placeholder: '' },
    ],

    // Location
    address_line_1: [
        { label: 'Street Address', name: 'streetAddress', id: 'street-address', placeholder: '123 Main St' },
        { label: 'Address Line 1', name: 'address1', id: 'address-1', placeholder: '' },
        { label: 'Address', name: 'address', id: 'address', placeholder: 'Enter address' },
    ],
    city: [
        { label: 'City', name: 'city', id: 'city', placeholder: 'City' },
        { label: 'City *', name: 'cityName', id: 'city-name', placeholder: '' },
    ],
    state: [
        { label: 'State', name: 'state', id: 'state', placeholder: 'State' },
        { label: 'State/Province', name: 'stateProvince', id: 'state-province', placeholder: '' },
    ],
    zip_code: [
        { label: 'ZIP Code', name: 'zipCode', id: 'zip-code', placeholder: '12345' },
        { label: 'Postal Code', name: 'postalCode', id: 'postal-code', placeholder: '' },
        { label: 'ZIP', name: 'zip', id: 'zip', placeholder: '' },
    ],
    country: [
        { label: 'Country', name: 'country', id: 'country', placeholder: '' },
        { label: 'Country *', name: 'countryName', id: 'country-name', placeholder: '' },
    ],

    // Work Experience
    job_title: [
        { label: 'Job Title', name: 'jobTitle', id: 'job-title', placeholder: 'e.g. Software Engineer' },
        { label: 'Title *', name: 'title', id: 'position-title', placeholder: '' },
        { label: 'Position', name: 'position', id: 'position', placeholder: '' },
    ],
    employer_name: [
        { label: 'Company', name: 'company', id: 'company', placeholder: 'Company name' },
        { label: 'Employer', name: 'employer', id: 'employer', placeholder: '' },
        { label: 'Organization', name: 'organization', id: 'organization', placeholder: '' },
    ],
    job_start_date: [
        { label: 'Start Date', name: 'startDate', id: 'start-date', placeholder: 'MM/YYYY' },
        { label: 'From', name: 'from', id: 'from-date', placeholder: '' },
    ],
    job_end_date: [
        { label: 'End Date', name: 'endDate', id: 'end-date', placeholder: 'MM/YYYY' },
        { label: 'To', name: 'to', id: 'to-date', placeholder: '' },
    ],
    job_description: [
        { label: 'Description', name: 'description', id: 'job-description', placeholder: 'Describe your responsibilities...' },
        { label: 'Job Responsibilities', name: 'responsibilities', id: 'responsibilities', placeholder: '' },
    ],

    // Education
    institution_name: [
        { label: 'School', name: 'school', id: 'school', placeholder: 'University name' },
        { label: 'University', name: 'university', id: 'university', placeholder: '' },
        { label: 'Institution', name: 'institution', id: 'institution', placeholder: '' },
    ],
    degree_type: [
        { label: 'Degree', name: 'degree', id: 'degree', placeholder: "e.g. Bachelor's" },
        { label: 'Degree Type', name: 'degreeType', id: 'degree-type', placeholder: '' },
    ],
    field_of_study: [
        { label: 'Field of Study', name: 'fieldOfStudy', id: 'field-of-study', placeholder: '' },
        { label: 'Major', name: 'major', id: 'major', placeholder: 'e.g. Computer Science' },
    ],
    gpa: [
        { label: 'GPA', name: 'gpa', id: 'gpa', placeholder: '3.5' },
        { label: 'Grade Point Average', name: 'gradePointAverage', id: 'grade-point', placeholder: '' },
    ],

    // Compensation
    salary_expected: [
        { label: 'Expected Salary', name: 'expectedSalary', id: 'expected-salary', placeholder: '$' },
        { label: 'Desired Salary', name: 'desiredSalary', id: 'desired-salary', placeholder: '' },
        { label: 'Salary Expectations', name: 'salaryExpectations', id: 'salary-exp', placeholder: '' },
    ],
    years_experience: [
        { label: 'Years of Experience', name: 'yearsExperience', id: 'years-experience', placeholder: '' },
        { label: 'Experience (years)', name: 'experience', id: 'experience-years', placeholder: '' },
    ],

    // Legal & Compliance
    work_authorization: [
        { label: 'Work Authorization', name: 'workAuth', id: 'work-auth', placeholder: '' },
        { label: 'Are you authorized to work in the U.S.?', name: 'usAuth', id: 'us-authorization', placeholder: '' },
    ],
    sponsorship_required: [
        { label: 'Do you require sponsorship?', name: 'sponsorship', id: 'sponsorship', placeholder: '' },
        { label: 'Visa Sponsorship', name: 'visaSponsorship', id: 'visa-sponsorship', placeholder: '' },
    ],
    citizenship: [
        { label: 'Citizenship', name: 'citizenship', id: 'citizenship', placeholder: '' },
        { label: 'Country of Citizenship', name: 'citizenshipCountry', id: 'citizen-country', placeholder: '' },
    ],

    // Demographics
    gender: [
        { label: 'Gender', name: 'gender', id: 'gender', placeholder: '' },
        { label: 'Gender (optional)', name: 'genderOptional', id: 'gender-optional', placeholder: '' },
    ],
    race_ethnicity: [
        { label: 'Race/Ethnicity', name: 'raceEthnicity', id: 'race-ethnicity', placeholder: '' },
        { label: 'Ethnicity', name: 'ethnicity', id: 'ethnicity', placeholder: '' },
    ],
    veteran_status: [
        { label: 'Veteran Status', name: 'veteranStatus', id: 'veteran-status', placeholder: '' },
        { label: 'Are you a veteran?', name: 'isVeteran', id: 'is-veteran', placeholder: '' },
    ],
    disability_status: [
        { label: 'Disability Status', name: 'disabilityStatus', id: 'disability-status', placeholder: '' },
        { label: 'Do you have a disability?', name: 'hasDisability', id: 'has-disability', placeholder: '' },
    ],

    // Misc
    cover_letter: [
        { label: 'Cover Letter', name: 'coverLetter', id: 'cover-letter', placeholder: 'Paste your cover letter...' },
        { label: 'Why do you want this job?', name: 'whyThisJob', id: 'why-this-job', placeholder: '' },
    ],
    available_start_date: [
        { label: 'Available Start Date', name: 'availableStart', id: 'available-start', placeholder: '' },
        { label: 'When can you start?', name: 'startAvailability', id: 'start-availability', placeholder: '' },
    ],
    marital_status: [
        { label: 'Marital Status', name: 'maritalStatus', id: 'marital-status', placeholder: '' },
    ],

    // Unknown fallback
    unknown: [
        { label: 'Other', name: 'other', id: 'other-field', placeholder: '' },
        { label: 'Additional Info', name: 'additionalInfo', id: 'additional-info', placeholder: '' },
    ],
};

// ============================================================================
// DATA GENERATION
// ============================================================================

function generateVariations(template) {
    // Create multiple variations from a single template
    const variations = [];

    // Original
    variations.push({ ...template });

    // Lowercase all
    variations.push({
        label: template.label.toLowerCase(),
        name: template.name.toLowerCase(),
        id: template.id.toLowerCase(),
        placeholder: template.placeholder.toLowerCase()
    });

    // Uppercase label
    variations.push({
        ...template,
        label: template.label.toUpperCase()
    });

    // Empty placeholder
    variations.push({
        ...template,
        placeholder: ''
    });

    // Empty label (rely on name/id)
    variations.push({
        label: '',
        name: template.name,
        id: template.id,
        placeholder: template.placeholder
    });

    return variations;
}

function generateDataset() {
    console.log('🧬 Generating synthetic dataset V2...');
    const dataset = [];

    for (const [fieldType, templates] of Object.entries(FIELD_TEMPLATES)) {
        for (const template of templates) {
            const variations = generateVariations(template);
            for (const variation of variations) {
                dataset.push({
                    features: {
                        label: variation.label,
                        name: variation.name,
                        id: variation.id,
                        placeholder: variation.placeholder,
                        ariaLabel: '',
                        parentContext: '',
                        siblingContext: ''
                    },
                    label: fieldType
                });
            }
        }
    }

    // Shuffle
    for (let i = dataset.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [dataset[i], dataset[j]] = [dataset[j], dataset[i]];
    }

    // Extend dataset by duplicating with noise
    const extendedDataset = [];
    const TARGET_SIZE = 15000;
    while (extendedDataset.length < TARGET_SIZE) {
        for (const sample of dataset) {
            if (extendedDataset.length >= TARGET_SIZE) break;
            extendedDataset.push({
                features: {
                    ...sample.features,
                    // Add slight randomness
                    ariaLabel: Math.random() > 0.8 ? sample.features.label : '',
                    parentContext: Math.random() > 0.7 ? 'Form Section' : '',
                    siblingContext: Math.random() > 0.9 ? 'Submit, Cancel' : ''
                },
                label: sample.label
            });
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(extendedDataset, null, 2));
    console.log(`✅ Saved ${extendedDataset.length} samples to ${OUTPUT_FILE}`);

    // Stats
    const classCounts = {};
    for (const s of extendedDataset) {
        classCounts[s.label] = (classCounts[s.label] || 0) + 1;
    }
    console.log('\nClass distribution:');
    Object.entries(classCounts).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => {
        console.log(`  ${c}: ${n}`);
    });
}

generateDataset();
