/**
 * Offline Training Script for TinyML Baseline Model
 * 
 * Usage: node scripts/train_baseline.js
 * 
 * Generates 10,000+ synthetic training examples with data augmentation
 * and trains the 2-layer neural network to create baseline weights.
 * 
 * IMPORTANT: This script runs OUTSIDE the extension - only the exported
 * model_v2_baseline.json (~40KB) gets bundled with the extension.
 */

const fs = require('fs');
const path = require('path');

// === FEATURE EXTRACTOR (Matches production version) ===
// === FEATURE EXTRACTOR (Matches production version) ===
class SimpleFeatureExtractor {
    constructor() {
        this.VOCAB_SIZE = 100;
    }

    extract(field) {
        if (!field) return new Array(59).fill(0);

        const getAttr = (attr) => (field.getAttribute && typeof field.getAttribute === 'function') ? field.getAttribute(attr) : (field[attr] || null);

        const computedLabel = this.getComputedLabel(field);
        const computedRole = getAttr('role') || (field.tagName ? field.tagName.toLowerCase() : (field.type || 'text'));

        const features = [
            // 1. Structural Features (One-Hot / Binary)
            this.isType(field, 'text'),
            this.isType(field, 'number'),
            this.isType(field, 'email'),
            this.isType(field, 'password'),
            this.isType(field, 'tel'),

            // 2. Heuristic Features
            computedLabel ? 1 : 0,
            field.placeholder ? 1 : 0,
            this.calculateVisualWeight(field),
            (computedRole === 'combobox' || computedRole === 'listbox') ? 1 : 0,

            // 3. Textual Features (Hashed Bag of Words)
            ...this.hashText(computedLabel || '', 10),   // 10 label
            ...this.hashText(field.name || '', 10),      // 10 name
            ...this.hashText(field.placeholder || '', 5), // 5 placeholder
            ...this.hashText(getAttr('context') || field.context || '', 5),     // 5 context

            // NEW: Rich Context Signals
            ...this.hashText(field.parentContext || '', 10),  // 10 parent
            // ...this.hashText(field.siblingContext || '', 10)  // 10 sibling (Disabled)
            ...new Array(10).fill(0) // Zero out sibling context
        ];

        return features;
    }

    getComputedLabel(field) {
        if (field.label) return field.label;
        return field.placeholder || '';
    }

    isType(field, type) {
        const t = (field.type || '').toLowerCase();
        return (t === type) ? 1.0 : 0.0;
    }

    calculateVisualWeight(field) {
        return 0.5; // Mock for training
    }

    hashText(text, slots) {
        const vector = new Array(slots).fill(0);
        const cleanText = text.replace(/\d+/g, ''); // Strip digits
        const words = cleanText.toLowerCase().split(/\W+/).filter(w => w.length > 2);

        words.forEach(word => {
            let hash = 0;
            for (let i = 0; i < word.length; i++) {
                hash = ((hash << 5) - hash) + word.charCodeAt(i);
                hash |= 0;
            }
            const index = Math.abs(hash) % slots;
            vector[index] = 1.0;
        });

        return vector;
    }
}

// === 2-LAYER NEURAL NETWORK ===
class TrainingNetwork {
    constructor() {
        this.HIDDEN_SIZE = 20;
        this.LEAKY_RELU_ALPHA = 0.01;
        this.L2_LAMBDA = 0.01;
        this.CLASSES = [
            'unknown',          // 0
            'first_name', 'last_name', 'full_name', 'email', 'phone', // Personal
            'linkedin', 'github', 'portfolio', 'website', 'twitter_url', // Social
            'address', 'city', 'state', 'zip_code', 'country', // Location
            'job_title', 'employer_name', 'job_start_date', 'job_end_date', 'work_description', 'job_location', // Work
            'institution_name', 'degree_type', 'field_of_study', 'gpa_score', 'education_start_date', 'education_end_date', // Edu
            'gender', 'race', 'veteran', 'disability', 'marital_status', // Demo
            'salary_current', 'salary_expected', 'desired_salary_text', // Comp
            'work_auth', 'sponsorship', 'citizenship', 'clearance', 'legal_age', 'tax_id', 'criminal_record', 'notice_period', // Legal
            'referral_source', 'cover_letter', 'generic_question' // Misc
        ];

        this.featureExtractor = new SimpleFeatureExtractor();
        this.totalSamples = 0;
        this.initializeWeights();
    }

    initializeWeights() {
        const inputSize = 59; // Matches production FeatureExtractor
        const hiddenSize = this.HIDDEN_SIZE;
        const outputSize = this.CLASSES.length;

        // He initialization for W1
        this.W1 = [];
        const heScale = Math.sqrt(2.0 / inputSize);
        for (let i = 0; i < inputSize; i++) {
            this.W1[i] = [];
            for (let h = 0; h < hiddenSize; h++) {
                this.W1[i][h] = (Math.random() - 0.5) * 2 * heScale;
            }
        }
        this.b1 = new Array(hiddenSize).fill(0);

        // Xavier initialization for W2
        this.W2 = [];
        const xavierScale = Math.sqrt(1.0 / hiddenSize);
        for (let h = 0; h < hiddenSize; h++) {
            this.W2[h] = [];
            for (let c = 0; c < outputSize; c++) {
                this.W2[h][c] = (Math.random() - 0.5) * 2 * xavierScale;
            }
        }
        this.b2 = new Array(outputSize).fill(0);
    }

    leakyReLU(x) { return x > 0 ? x : this.LEAKY_RELU_ALPHA * x; }
    leakyReLU_derivative(x) { return x > 0 ? 1 : this.LEAKY_RELU_ALPHA; }

    forward(inputs) {
        const z1 = new Array(this.HIDDEN_SIZE).fill(0);
        for (let h = 0; h < this.HIDDEN_SIZE; h++) {
            z1[h] = this.b1[h];
            for (let i = 0; i < inputs.length; i++) {
                z1[h] += inputs[i] * this.W1[i][h];
            }
        }
        const hidden = z1.map(z => this.leakyReLU(z));

        const logits = new Array(this.CLASSES.length).fill(0);
        for (let c = 0; c < this.CLASSES.length; c++) {
            logits[c] = this.b2[c];
            for (let h = 0; h < this.HIDDEN_SIZE; h++) {
                logits[c] += hidden[h] * this.W2[h][c];
            }
        }
        return { logits, hidden, z1 };
    }

    softmax(logits) {
        const maxLogit = Math.max(...logits);
        const exps = logits.map(l => Math.exp(l - maxLogit));
        const sumExps = exps.reduce((a, b) => a + b, 0);
        return exps.map(e => e / sumExps);
    }

    train(field, correctLabel) {
        const targetIndex = this.CLASSES.indexOf(correctLabel);
        if (targetIndex === -1) return 0;

        const inputs = this.featureExtractor.extract(field);
        const { logits, hidden, z1 } = this.forward(inputs);
        const probs = this.softmax(logits);

        const baseLR = 0.002; // Reduced to prevent gradient explosion
        const epoch = Math.floor(this.totalSamples / 10000);
        const learningRate = baseLR * Math.exp(-0.005 * epoch); // Proper decay
        this.totalSamples++;

        // Backprop - Output layer
        const dLogits = new Array(this.CLASSES.length);
        for (let c = 0; c < this.CLASSES.length; c++) {
            dLogits[c] = probs[c] - (c === targetIndex ? 1 : 0);
        }

        for (let h = 0; h < this.HIDDEN_SIZE; h++) {
            for (let c = 0; c < this.CLASSES.length; c++) {
                this.W2[h][c] -= learningRate * (dLogits[c] * hidden[h] + this.L2_LAMBDA * this.W2[h][c]);
            }
        }
        for (let c = 0; c < this.CLASSES.length; c++) {
            this.b2[c] -= learningRate * dLogits[c];
        }

        // Backprop - Hidden layer
        const dHidden = new Array(this.HIDDEN_SIZE).fill(0);
        for (let h = 0; h < this.HIDDEN_SIZE; h++) {
            for (let c = 0; c < this.CLASSES.length; c++) {
                dHidden[h] += dLogits[c] * this.W2[h][c];
            }
            dHidden[h] *= this.leakyReLU_derivative(z1[h]);
        }

        for (let i = 0; i < inputs.length; i++) {
            for (let h = 0; h < this.HIDDEN_SIZE; h++) {
                if (inputs[i] !== 0) {
                    this.W1[i][h] -= learningRate * (dHidden[h] * inputs[i] + this.L2_LAMBDA * this.W1[i][h]);
                }
            }
        }
        for (let h = 0; h < this.HIDDEN_SIZE; h++) {
            this.b1[h] -= learningRate * dHidden[h];
        }

        return probs[targetIndex];
    }
}

// === DATA AUGMENTATION ===

// Label variations per class (expanded for 50K+ training)
const LABEL_VARIATIONS = {
    first_name: ['First Name', 'First name', 'Given Name', 'First', 'Fname', 'Your First Name', 'Legal First Name', 'Applicant First Name', 'Candidate First Name', 'First Name *', 'First Name:', 'Enter First Name', 'Forename', 'Given name', 'First/Given Name'],
    last_name: ['Last Name', 'Last name', 'Family Name', 'Surname', 'Last', 'Lname', 'Your Last Name', 'Legal Last Name', 'Candidate Last Name', 'Last Name *', 'Last Name:', 'Enter Last Name', 'Family name', 'Surname (Family Name)'],
    full_name: ['Full Name', 'Name', 'Your Name', 'Full Legal Name', 'Applicant Name', 'Complete Name', 'Candidate Name', 'Full name', 'Name *', 'Enter your name', 'Legal Name', 'Name (Required)'],
    email: ['Email', 'Email Address', 'E-mail', 'Your Email', 'Contact Email', 'Primary Email', 'Work Email', 'Personal Email', 'Email *', 'Email:', 'Enter Email', 'Email address', 'E-mail address'],
    phone: ['Phone', 'Phone Number', 'Mobile', 'Cell', 'Contact Number', 'Telephone', 'Mobile Number', 'Cell Phone', 'Primary Phone', 'Phone *', 'Phone:', 'Enter Phone', 'Your Phone', 'Mobile phone'],
    linkedin: ['LinkedIn', 'LinkedIn Profile', 'LinkedIn URL', 'Your LinkedIn', 'LinkedIn Link', 'LinkedIn profile URL', 'LinkedIn page', 'LinkedIn Username', 'LinkedIn *', 'LinkedIn (optional)', 'LinkedIn:', 'Enter LinkedIn URL'],
    github: ['GitHub', 'GitHub Profile', 'GitHub URL', 'Your GitHub', 'GitHub Username', 'GitHub Link', 'GitHub profile URL', 'GitHub page', 'GitHub *'],
    portfolio: ['Portfolio', 'Portfolio URL', 'Personal Website', 'Portfolio Link', 'Work Samples', 'Portfolio *', 'Portfolio:', 'Your Portfolio', 'Portfolio site', 'Online Portfolio'],
    website: ['Website', 'Personal Website', 'Your Website', 'Web URL', 'Homepage', 'Personal URL', 'Website *', 'Website:', 'Your URL', 'Web address'],
    twitter_url: ['Twitter', 'Twitter URL', 'X Handle', 'X.com', 'Twitter Profile', 'Social Media URL', 'Twitter Link'],
    address: ['Address', 'Street Address', 'Home Address', 'Current Address', 'Mailing Address', 'Residential Address', 'Address *', 'Address:', 'Enter Address', 'Your Address'],
    city: ['City', 'City Name', 'Town', 'Your City', 'Current City', 'Location City', 'City *', 'City:', 'Enter City', 'Town/City'],
    state: ['State', 'State/Province', 'Province', 'Region', 'Your State', 'State *', 'State:', 'Enter State', 'State or Province'],
    zip_code: ['Zip Code', 'ZIP', 'Postal Code', 'Zip', 'ZIP Code', 'Postcode', 'Zip Code *', 'Zip:', 'Enter Zip', 'Zip/Postal Code'],
    country: ['Country', 'Country Name', 'Nation', 'Your Country', 'Country of Residence', 'Country *', 'Country:', 'Enter Country'],
    job_title: ['Job Title', 'Position', 'Role', 'Title', 'Current Title', 'Position Title', 'Your Role', 'Job Title *', 'Title:', 'Enter Title', 'Position held', 'Your position'],
    employer_name: ['Company', 'Employer', 'Organization', 'Company Name', 'Employer Name', 'Current Company', 'Workplace', 'Company *', 'Company:', 'Enter Company', 'Organization name', 'Your employer'],
    job_start_date: ['Start Date', 'From', 'Start', 'Date Started', 'From Date', 'Employment Start', 'Start Date *', 'Start:', 'Enter Start Date'],
    job_end_date: ['End Date', 'To', 'End', 'Date Ended', 'To Date', 'Employment End', 'End Date *', 'End:', 'Enter End Date'],
    work_description: ['Description', 'Job Description', 'Responsibilities', 'Duties', 'Role Description', 'Job Duties', 'Work Description', 'What did you do'],
    job_location: ['Job Location', 'Office Location', 'Work Location', 'Location', 'City/State (Job)'],
    institution_name: ['School', 'University', 'College', 'Institution', 'School Name', 'Educational Institution', 'School *', 'University:', 'Enter School'],
    degree_type: ['Degree', 'Degree Type', 'Qualification', 'Diploma', 'Certificate', 'Degree *', 'Degree:', 'Enter Degree', 'Type of degree'],
    field_of_study: ['Major', 'Field of Study', 'Specialization', 'Subject', 'Area of Study', 'Concentration', 'Major *', 'Major:', 'Enter Major'],
    gpa_score: ['GPA', 'Grade', 'CGPA', 'Grade Point Average', 'Academic Score', 'GPA *', 'GPA:', 'Enter GPA'],
    education_start_date: ['Start Date', 'From', 'Enrollment Date', 'Started', 'Education Start', 'Start Date *', 'From:', 'When did you start'],
    education_end_date: ['End Date', 'Graduation', 'To', 'Graduation Date', 'Completed', 'Education End', 'End Date *', 'To:', 'When did you graduate'],
    gender: ['Gender', 'Gender Identity', 'Sex', 'Your Gender', 'Gender *', 'Gender:', 'Select Gender'],
    race: ['Race', 'Ethnicity', 'Race/Ethnicity', 'Ethnic Background', 'Race *', 'Ethnicity:', 'Select Race'],
    veteran: ['Veteran Status', 'Veteran', 'Protected Veteran', 'Military Service', 'Veteran *', 'Veteran:', 'Are you a veteran'],
    disability: ['Disability', 'Disability Status', 'Accommodation Needed', 'Disability *', 'Disability:', 'Do you have a disability'],
    marital_status: ['Marital Status', 'Marriage Status', 'Single/Married', 'Civil Status'],
    salary_current: ['Current Salary', 'Current CTC', 'Current Compensation', 'Present Salary', 'Current Salary *', 'Current Pay'],
    salary_expected: ['Expected Salary', 'Desired Salary', 'Salary Expectations', 'Desired Compensation', 'Expected Salary *', 'Expected Pay'],
    desired_salary_text: ['Desired Salary (Text)', 'Salary Expectations (Description)', 'Compensation Requirement (Text)', 'Pay Expectations'],
    work_auth: ['Work Authorization', 'Legal Authorization', 'Right to Work', 'Employment Authorization', 'Work Authorization *', 'Work Auth:'],
    sponsorship: ['Sponsorship', 'Require Sponsorship', 'Visa Sponsorship', 'Sponsorship Required', 'Sponsorship *', 'Do you need sponsorship'],
    citizenship: ['Citizenship', 'Citizenship Status', 'National Status', 'Country of Citizenship', 'Citizenship *', 'Your citizenship'],
    clearance: ['Security Clearance', 'Clearance', 'Clearance Level', 'Security Level', 'Clearance *', 'Do you have clearance'],
    legal_age: ['Are you 18+?', 'Over 18', 'Age Verification', 'Legal Age', 'Are you at least 18', 'Minimum Age'],
    tax_id: ['SSN', 'Tax ID', 'Social Security', 'National ID', 'SSN *', 'Social Security Number'],
    criminal_record: ['Criminal Record', 'Felony History', 'Have you been convicted?', 'Criminal History', 'Background Check'],
    notice_period: ['Notice Period', 'Availability', 'How soon can you start?', 'Days Notice', 'Weeks Notice'],
    referral_source: ['How did you hear about us?', 'Referral Source', 'Where did you hear about us?', 'Source', 'Referral'],
    cover_letter: ['Cover Letter', 'Cover Note', 'Introduction Letter', 'Application Letter', 'Cover Letter *', 'Upload cover letter'],
    generic_question: ['Question', 'Additional Info', 'Other', 'Comments', 'Notes', 'Additional Information']
};

// Name attribute variations
const NAME_VARIATIONS = {
    first_name: ['fname', 'first_name', 'firstName', 'given_name', 'givenName', 'first', 'applicant_first'],
    last_name: ['lname', 'last_name', 'lastName', 'family_name', 'familyName', 'surname', 'last'],
    full_name: ['name', 'full_name', 'fullName', 'applicant_name', 'your_name'],
    email: ['email', 'email_address', 'emailAddress', 'user_email', 'contact_email', 'primary_email'],
    phone: ['phone', 'phone_number', 'phoneNumber', 'mobile', 'cell', 'telephone', 'contact_number'],
    linkedin: ['linkedin', 'linkedin_url', 'linkedinUrl', 'linkedin_profile'],
    github: ['github', 'github_url', 'githubUrl', 'github_profile', 'github_username'],
    portfolio: ['portfolio', 'portfolio_url', 'portfolioUrl', 'personal_site'],
    website: ['website', 'web_url', 'homepage', 'personal_url'],
    twitter_url: ['twitter', 'twitter_url', 'twitter_handle', 'x_handle'],
    address: ['address', 'street_address', 'streetAddress', 'home_address', 'mailing_address'],
    city: ['city', 'location_city', 'town', 'city_name'],
    state: ['state', 'state_province', 'province', 'region'],
    zip_code: ['zip', 'zip_code', 'zipCode', 'postal_code', 'postalCode', 'postcode'],
    country: ['country', 'country_name', 'nation'],
    job_title: ['job_title', 'jobTitle', 'position', 'role', 'title', 'current_title'],
    employer_name: ['company', 'employer', 'organization', 'company_name', 'workplace'],
    job_start_date: ['start_date', 'startDate', 'from_date', 'date_started', 'job_start'],
    job_end_date: ['end_date', 'endDate', 'to_date', 'date_ended', 'job_end'],
    work_description: ['description', 'job_description', 'responsibilities', 'duties'],
    job_location: ['job_location', 'work_location', 'office_loc'],
    institution_name: ['school', 'university', 'college', 'institution', 'school_name'],
    degree_type: ['degree', 'degree_type', 'qualification', 'diploma'],
    field_of_study: ['major', 'field_of_study', 'specialization', 'subject', 'concentration'],
    gpa_score: ['gpa', 'grade', 'cgpa', 'grade_point'],
    education_start_date: ['edu_start', 'education_start', 'enrollment_date'],
    education_end_date: ['edu_end', 'graduation_date', 'graduation', 'completed'],
    gender: ['gender', 'gender_identity', 'sex'],
    race: ['race', 'ethnicity', 'ethnic_background'],
    veteran: ['veteran', 'veteran_status', 'military_service'],
    disability: ['disability', 'disability_status', 'accommodation'],
    marital_status: ['marital_status', 'marital', 'civil_status'],
    salary_current: ['current_salary', 'currentSalary', 'current_ctc', 'present_salary'],
    salary_expected: ['expected_salary', 'expectedSalary', 'desired_salary', 'salary_expectation'],
    desired_salary_text: ['desired_salary_text', 'salary_desc', 'comp_req'],
    work_auth: ['work_auth', 'workAuth', 'legal_authorization', 'right_to_work'],
    sponsorship: ['sponsorship', 'require_sponsorship', 'visa_sponsorship'],
    citizenship: ['citizenship', 'citizenship_status', 'nationality'],
    clearance: ['clearance', 'security_clearance', 'clearance_level'],
    legal_age: ['legal_age', 'over_18', 'age_verification'],
    tax_id: ['ssn', 'tax_id', 'social_security', 'national_id'],
    criminal_record: ['criminal_record', 'felony', 'conviction'],
    notice_period: ['notice_period', 'availability', 'start_avail'],
    referral_source: ['referral_source', 'referral', 'source', 'how_heard'],
    cover_letter: ['cover_letter', 'coverLetter', 'cover_note'],
    generic_question: ['question', 'additional_info', 'other', 'comments']
};

// Parent context variations
const PARENT_CONTEXTS = {
    first_name: ['Personal Information', 'Basic Info', 'Contact Details'],
    last_name: ['Personal Information', 'Basic Info', 'Contact Details', 'Applicant Info', 'Your Details', ''],
    full_name: ['Personal Information', 'Application Form', 'Your Information', ''],
    email: ['Contact Information', 'Personal Information', 'Contact Details', 'How to Reach You', ''],
    phone: ['Contact Information', 'Personal Information', 'Contact Details', 'How to Reach You', ''],
    linkedin: ['Professional Links', 'Social Profiles', 'Online Presence', 'Links', ''],
    github: ['Professional Links', 'Social Profiles', 'Online Presence', 'Developer Profiles', ''],
    portfolio: ['Professional Links', 'Work Samples', 'Online Presence', ''],
    website: ['Professional Links', 'Online Presence', 'Links', ''],
    twitter_url: ['Social Profiles', 'Links'],
    address: ['Location', 'Contact Information', 'Address', ''],
    city: ['Location', 'Address', 'Where You Live', ''],
    state: ['Location', 'Address', 'Where You Live', ''],
    zip_code: ['Location', 'Address', 'Contact Information', ''],
    country: ['Location', 'Address', ''],
    job_title: ['Work Experience', 'Employment History', 'Professional Experience', 'Previous Jobs', 'Current Employment'],
    employer_name: ['Work Experience', 'Employment History', 'Professional Experience'],
    job_start_date: ['Work Experience', 'Employment History', 'Professional Experience', 'Previous Jobs'],
    job_end_date: ['Work Experience', 'Employment History', 'Professional Experience', 'Previous Jobs'],
    work_description: ['Work Experience', 'Employment History', 'Job Responsibilities'],
    job_location: ['Work Experience', 'Employment History', 'Location'],
    institution_name: ['Education', 'Academic Background', 'Education History'],
    degree_type: ['Education', 'Academic Background', 'Education History', 'Qualifications'],
    field_of_study: ['Education', 'Academic Background', 'Field of Study'],
    gpa_score: ['Education', 'Academic Performance', 'Grades'],
    education_start_date: ['Education', 'Academic History', 'Education History'],
    education_end_date: ['Education', 'Academic History', 'Education History', 'Graduation'],
    gender: ['Equal Opportunity', 'Diversity Information', 'EEOC', 'Demographics'],
    race: ['Equal Opportunity', 'Diversity Information', 'EEOC', 'Demographics'],
    veteran: ['Equal Opportunity', 'Diversity Information', 'EEOC', 'Military Status'],
    disability: ['Equal Opportunity', 'Diversity Information', 'EEOC', 'Accommodations'],
    marital_status: ['Demographics', 'Personal details'],
    salary_current: ['Compensation', 'Pay Details', 'Salary Information'],
    salary_expected: ['Compensation', 'Pay Expectations', 'Salary Information'],
    desired_salary_text: ['Compensation', 'Additional Info'],
    work_auth: ['Legal Requirements', 'Employment Eligibility', 'Work Authorization'],
    sponsorship: ['Legal Requirements', 'Visa Information', 'Work Authorization'],
    citizenship: ['Legal Requirements', 'Legal Status', 'Citizenship'],
    clearance: ['Background Check', 'Security Requirements', 'Security'],
    legal_age: ['Legal Requirements', 'Eligibility', 'Age Verification'],
    tax_id: ['Legal Requirements', 'Tax Information', 'Government ID'],
    criminal_record: ['Legal', 'Background Check'],
    notice_period: ['Availability', 'Logistics'],
    referral_source: ['Application Details', 'Source', 'How You Found Us'],
    cover_letter: ['Additional Information', 'Documents', 'Supporting Materials'],
    generic_question: ['Additional Questions', 'Other Information', 'Comments', '']
};

// Sibling context patterns (Disabled)
const SIBLING_PATTERNS = {
    // Disabled per user request
};

// Placeholder variations
const PLACEHOLDERS = {
    first_name: ['John', 'Jane', 'Alex', 'First name', 'Enter first name', ''],
    last_name: ['Doe', 'Smith', 'Johnson', 'Last name', 'Enter last name', ''],
    full_name: ['John Doe', 'Your full name', 'Enter name', ''],
    email: ['you@example.com', 'john@email.com', 'email@domain.com', 'Enter email', ''],
    phone: ['123-456-7890', '(555) 123-4567', '+1 234 567 8900', 'Enter phone', ''],
    linkedin: ['linkedin.com/in/yourprofile', 'Your LinkedIn URL', 'https://linkedin.com/in/', ''],
    github: ['github.com/username', 'Your GitHub URL', 'https://github.com/', ''],
    portfolio: ['https://yourportfolio.com', 'Portfolio URL', 'Your website', ''],
    website: ['https://yoursite.com', 'Personal website', 'Your URL', ''],
    twitter_url: ['twitter.com/username', '@handle'],
    address: ['123 Main St', 'Street address', 'Enter address', ''],
    city: ['New York', 'San Francisco', 'Enter city', 'City name', ''],
    state: ['NY', 'CA', 'State', 'Enter state', ''],
    zip_code: ['10001', '94102', 'Zip code', 'Enter zip', ''],
    country: ['United States', 'USA', 'Country', ''],
    job_title: ['Software Engineer', 'Product Manager', 'Your title', ''],
    employer_name: ['Google', 'Microsoft', 'Company name'],
    job_start_date: ['MM/YYYY', 'Jan 2020', 'Start date', ''],
    job_end_date: ['MM/YYYY', 'Dec 2023', 'End date', 'Present', ''],
    work_description: ['Describe your role', 'Responsibilities', 'Key achievements'],
    job_location: ['New York, NY', 'Remote', 'San Francisco'],
    institution_name: ['MIT', 'Stanford', 'University name'],
    degree_type: ['Bachelor of Science', 'Master of Arts', 'Degree type', ''],
    field_of_study: ['Computer Science', 'Business', 'Field of study', ''],
    gpa_score: ['3.8', '3.5/4.0', 'Your GPA', ''],
    education_start_date: ['MM/YYYY', '2018', 'Start year'],
    education_end_date: ['MM/YYYY', '2022', 'Graduation year'],
    gender: ['Male', 'Female', 'Non-binary', 'Select gender'],
    race: ['White', 'Asian', 'Black', 'Select ethnicity'],
    veteran: ['Yes', 'No', 'Prefer not to say'],
    disability: ['Yes', 'No', 'Prefer not to say'],
    marital_status: ['Select status', 'Single/Married'],
    salary_current: ['$100,000', '100000', 'Current salary', ''],
    salary_expected: ['$120,000', '120000', 'Desired salary', ''],
    desired_salary_text: ['Enter salary expectations...'],
    work_auth: ['Yes', 'No'],
    sponsorship: ['Yes', 'No'],
    citizenship: ['United States', 'Canada', 'Select country'],
    clearance: ['None', 'Secret', 'Top Secret'],
    legal_age: ['Yes', 'No'],
    tax_id: ['XXX-XX-XXXX', 'Social Security Number'],
    criminal_record: ['Explain if yes...'],
    notice_period: ['2 weeks', 'Immediate'],
    referral_source: ['LinkedIn', 'Friend', 'Job Board'],
    cover_letter: ['Upload file', 'Paste text'],
    generic_question: ['Your answer here', 'Comments']
};

// Type mappings
const FIELD_TYPES = {
    email: ['email'],
    phone: ['tel'],
    default: ['text']
};

/**
 * Generate 10K+ training examples with augmentation
 */
function generateTrainingData() {
    const data = [];
    const targetCount = 10000; // 10K examples - achieved 83.67% accuracy

    const classes = Object.keys(LABEL_VARIATIONS);
    const examplesPerClass = Math.ceil(targetCount / classes.length);

    for (const fieldClass of classes) {
        const labels = LABEL_VARIATIONS[fieldClass] || ['Unknown'];
        const names = NAME_VARIATIONS[fieldClass] || ['field'];
        const contexts = PARENT_CONTEXTS[fieldClass] || [''];
        const siblings = SIBLING_PATTERNS[fieldClass] || [''];
        const placeholders = PLACEHOLDERS[fieldClass] || [''];
        const types = FIELD_TYPES[fieldClass] || FIELD_TYPES.default;

        for (let i = 0; i < examplesPerClass; i++) {
            const example = {
                label: labels[Math.floor(Math.random() * labels.length)],
                name: names[Math.floor(Math.random() * names.length)],
                type: types[Math.floor(Math.random() * types.length)],
                parentContext: contexts[Math.floor(Math.random() * contexts.length)],
                // siblingContext: siblings[Math.floor(Math.random() * siblings.length)], // Disabled
                siblingContext: '',
                placeholder: placeholders[Math.floor(Math.random() * placeholders.length)] || '',
                class: fieldClass
            };

            data.push(example);
        }
    }

    return data;
}

// === MAIN TRAINING FUNCTION ===
function trainModel() {
    console.log('🚀 Starting offline training with 10K+ examples...\n');

    const network = new TrainingNetwork();
    const trainingData = generateTrainingData();

    console.log(`📊 Training data: ${trainingData.length} examples`);
    console.log(`🏗️ Network: 56 → 20 (Leaky ReLU) → ${network.CLASSES.length}`);
    console.log(`⚙️ Features: label + name + placeholder + parentContext`);
    console.log(`📦 Params: ~2,001\n`);

    const EPOCHS = 600; // Optimized for performance/time trade-off
    const REPORT_INTERVAL = 50;

    for (let epoch = 1; epoch <= EPOCHS; epoch++) {
        let totalLoss = 0;
        let correctPredictions = 0;

        // Shuffle
        const shuffled = trainingData.sort(() => Math.random() - 0.5);

        for (const example of shuffled) {
            const confidence = network.train(example, example.class);
            if (confidence > 0.5) correctPredictions++;
            totalLoss += (1 - confidence);
        }

        const avgLoss = totalLoss / trainingData.length;
        const accuracy = (correctPredictions / trainingData.length) * 100;

        if (epoch % REPORT_INTERVAL === 0 || epoch === 1) {
            const lr = (0.01 * Math.exp(-0.005 * epoch)).toFixed(5);
            console.log(`Epoch ${epoch}/${EPOCHS} | Loss: ${avgLoss.toFixed(4)} | Accuracy: ${accuracy.toFixed(2)}% | LR: ${lr}`);
        }
    }

    console.log('\n✅ Training complete!\n');

    // Export
    const weights = {
        W1: network.W1,
        b1: network.b1,
        W2: network.W2,
        b2: network.b2,
        totalSamples: network.totalSamples,
        version: 2,
        timestamp: Date.now(),
        metadata: {
            inputSize: 56,
            hiddenSize: network.HIDDEN_SIZE,
            outputSize: network.CLASSES.length,
            trainingExamples: trainingData.length,
            epochs: EPOCHS
        }
    };

    const outputPath = path.join(__dirname, '..', 'content', 'services', 'ai', 'model_v2_baseline.json');
    fs.writeFileSync(outputPath, JSON.stringify(weights, null, 2));

    const sizeKB = (JSON.stringify(weights).length / 1024).toFixed(2);
    console.log(`💾 Exported weights to: ${outputPath}`);
    console.log(`📦 File size: ${sizeKB} KB`);
    console.log(`🎯 Final Accuracy: ${((network.totalSamples > 0) ? 'See last epoch' : 'N/A')}\n`);
    console.log('🎉 Done! Reload extension to use new baseline model.');
}

// Run
trainModel();
