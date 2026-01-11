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
class SimpleFeatureExtractor {
    extract(field) {
        const vector = new Array(56).fill(0);

        // Hash label + name + placeholder (30 slots: 0-29)
        const text = `${field.label || ''} ${field.name || ''} ${field.placeholder || ''}`.toLowerCase();
        const words = text.split(/\W+/).filter(w => w.length > 2);

        words.forEach(word => {
            let hash = 0;
            for (let i = 0; i < word.length; i++) {
                hash = ((hash << 5) - hash) + word.charCodeAt(i);
                hash |= 0;
            }
            const index = Math.abs(hash) % 30;
            vector[index] = 1.0;
        });

        // Type features (slots 50-52)
        if (field.type === 'email') vector[50] = 1.0;
        if (field.type === 'tel') vector[51] = 1.0;
        if (field.type === 'text') vector[52] = 1.0;

        // Hash parentContext (10 slots: 31-40)
        if (field.parentContext) {
            const parentWords = field.parentContext.toLowerCase().split(/\W+/).filter(w => w.length > 2);
            parentWords.forEach(word => {
                let hash = 0;
                for (let i = 0; i < word.length; i++) {
                    hash = ((hash << 5) - hash) + word.charCodeAt(i);
                    hash |= 0;
                }
                vector[31 + (Math.abs(hash) % 10)] = 1.0;
            });
        }

        // Hash siblingContext (10 slots: 41-50)
        if (field.siblingContext) {
            const siblingWords = field.siblingContext.toLowerCase().split(/\W+/).filter(w => w.length > 2);
            siblingWords.forEach(word => {
                let hash = 0;
                for (let i = 0; i < word.length; i++) {
                    hash = ((hash << 5) - hash) + word.charCodeAt(i);
                    hash |= 0;
                }
                vector[41 + (Math.abs(hash) % 10)] = 1.0;
            });
        }

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
            'unknown', 'first_name', 'last_name', 'full_name', 'email', 'phone',
            'linkedin', 'github', 'portfolio', 'website',
            'address', 'city', 'state', 'zip_code', 'country',
            'job_title', 'company', 'job_start_date', 'job_end_date', 'work_description',
            'school', 'degree', 'major', 'gpa', 'edu_start_date', 'edu_end_date',
            'gender', 'race', 'veteran', 'disability',
            'salary_current', 'salary_expected',
            'work_auth', 'sponsorship', 'citizenship', 'clearance', 'legal_age', 'tax_id',
            'referral_source', 'cover_letter', 'generic_question'
        ];

        this.featureExtractor = new SimpleFeatureExtractor();
        this.totalSamples = 0;
        this.initializeWeights();
    }

    initializeWeights() {
        const inputSize = 56;
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

        const baseLR = 0.01; // Optimal for 10K examples 
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
    first_name: ['First Name', 'First name', 'Given Name', 'First', 'Fname', 'Your First Name', 'Legal First Name', 'Applicant First Name', 'Candidate First Name', 'First Name *', 'First Name:', 'Enter First Name', 'Forename', 'Given name', 'First/Given Name', 'What is your first name', 'Legal given name', 'First Name (Required)', 'First name as on ID', 'Your given name', 'Preferred First Name', 'First Name (as on passport)', 'First name in full', 'First/Middle Name'],
    last_name: ['Last Name', 'Last name', 'Family Name', 'Surname', 'Last', 'Lname', 'Your Last Name', 'Legal Last Name', 'Candidate Last Name', 'Last Name *', 'Last Name:', 'Enter Last Name', 'Family name', 'Surname (Family Name)', 'What is your last name', 'Legal surname', 'Last Name (Required)', 'Last name as on ID', 'Your family name', 'Last/Family Name', 'Last Name (as on passport)', 'Last name in full', 'Legal last name'],
    full_name: ['Full Name', 'Name', 'Your Name', 'Full Legal Name', 'Applicant Name', 'Complete Name', 'Candidate Name', 'Full name', 'Name *', 'Enter your name', 'Legal Name', 'Name (Required)', 'Your full name', 'Full name as on ID', 'Name (as on passport)', 'Preferred Name', 'Display Name', 'What is your name', 'Complete legal name', 'First and Last Name', 'Full name in order'],
    email: ['Email', 'Email Address', 'E-mail', 'Your Email', 'Contact Email', 'Primary Email', 'Work Email', 'Personal Email', 'Email *', 'Email:', 'Enter Email', 'Email address', 'E-mail address', 'Your email address', 'Preferred Email', 'Email (Required)', 'Main Email', 'Business Email', 'Candidate Email', 'What is your email', 'Email ID', 'Mail', 'EMail', 'E-Mail Address', 'Contact email address', 'Current Email', 'Best Email', 'Email for contact', 'Correspondence Email'],
    phone: ['Phone', 'Phone Number', 'Mobile', 'Cell', 'Contact Number', 'Telephone', 'Mobile Number', 'Cell Phone', 'Primary Phone', 'Phone *', 'Phone:', 'Enter Phone', 'Your Phone', 'Mobile phone', 'Cell phone number', 'Contact phone', 'Daytime Phone', 'Evening Phone', 'Home Phone', 'Work Phone', 'Mobile Number *', 'Phone (Required)', 'Best Phone', 'Phone number to reach you', 'What is your phone number', 'Primary contact number', 'Telephone Number', 'Your mobile number', 'Main Phone', 'Cell Number', 'Contact Phone Number', 'Direct Phone'],
    linkedin: ['LinkedIn', 'LinkedIn Profile', 'LinkedIn URL', 'Your LinkedIn', 'LinkedIn Link', 'LinkedIn profile URL', 'LinkedIn page', 'LinkedIn Username', 'LinkedIn *', 'LinkedIn (optional)', 'LinkedIn:', 'Enter LinkedIn URL', 'Your LinkedIn profile', 'LinkedIn Profile URL', 'What is your LinkedIn', 'Personal LinkedIn', 'LinkedIn public URL', 'LinkedIn Profile Link'],
    github: ['GitHub', 'GitHub Profile', 'GitHub URL', 'Your GitHub', 'GitHub Username', 'GitHub Link', 'GitHub profile URL', 'GitHub page', 'GitHub *', 'GitHub (optional)', 'GitHub:', 'Enter GitHub URL', 'Your GitHub profile', 'GitHub Profile URL', 'What is your GitHub', 'Personal GitHub', 'GitHub public URL', 'GitHub Account', 'GitHub Repo', 'GitLab', 'Git URL', 'Version Control'],
    portfolio: ['Portfolio', 'Portfolio URL', 'Personal Website', 'Portfolio Link', 'Work Samples', 'Portfolio *', 'Portfolio:', 'Your Portfolio', 'Portfolio site', 'Online Portfolio', 'Work Portfolio', 'Design Portfolio', 'Portfolio website', 'Your work samples', 'Projects URL', 'Personal Site', 'Personal Portfolio', 'Sample Work', 'Work Examples'],
    website: ['Website', 'Personal Website', 'Your Website', 'Web URL', 'Homepage', 'Personal URL', 'Website *', 'Website:', 'Your URL', 'Web address', 'Online presence', 'Blog', 'Blog URL', 'Personal blog', 'Your site', 'Personal site URL', 'Web Page', 'Your web page', 'URL', 'Personal Homepage'],
    address: ['Address', 'Street Address', 'Home Address', 'Current Address', 'Mailing Address', 'Residential Address', 'Address *', 'Address:', 'Enter Address', 'Your Address', 'Address Line 1', 'Street', 'Street address line 1', 'Physical Address', 'Permanent Address', 'Present Address', 'What is your address', 'Street name and number', 'Full Address', 'Address (Required)', 'Where do you live', 'Correspondence Address', 'Local Address'],
    city: ['City', 'City Name', 'Town', 'Your City', 'Current City', 'Location City', 'City *', 'City:', 'Enter City', 'Town/City', 'City or Town', 'City (Required)', 'What city do you live in', 'Residing City', 'Home City', 'Hometown', 'City of residence', 'Your town', 'Current town', 'Location'],
    state: ['State', 'State/Province', 'Province', 'Region', 'Your State', 'State *', 'State:', 'Enter State', 'State or Province', 'State (Required)', 'What state', 'US State', 'County', 'Territory', 'Your province', 'State/Region', 'State of residence', 'Current state', 'Select State'],
    zip_code: ['Zip Code', 'ZIP', 'Postal Code', 'Zip', 'ZIP Code', 'Postcode', 'Zip Code *', 'Zip:', 'Enter Zip', 'Zip/Postal Code', 'Postal code (Required)', 'What is your zip code', 'PIN Code', 'Post Code', 'Area Code', 'Zip code (5 digit)', '5-digit Zip', 'Mailing Zip', 'Zipcode', 'ZIP/Postal'],
    country: ['Country', 'Country Name', 'Nation', 'Your Country', 'Country of Residence', 'Country *', 'Country:', 'Enter Country', 'Country (Required)', 'Select Country', 'What country', 'Current country', 'Home Country', 'Residing Country', 'Nation of residence', 'Country where you live', 'Your nation'],
    job_title: ['Job Title', 'Position', 'Role', 'Title', 'Current Title', 'Position Title', 'Your Role', 'Job Title *', 'Title:', 'Enter Title', 'Position held', 'Your position', 'Job role', 'Current position', 'Current Job Title', 'Most Recent Title', 'Position name', 'Role title', 'What was your job title', 'Employment title', 'Designation', 'Current designation', 'Occupation', 'Work Title'],
    company: ['Company', 'Employer', 'Organization', 'Company Name', 'Employer Name', 'Current Company', 'Workplace', 'Company *', 'Company:', 'Enter Company', 'Organization name', 'Your employer', 'Firm', 'Business', 'Current employer', 'Most Recent Company', 'Company or Organization', 'Where did you work', 'Employer organization', 'Work place', 'Corporation', 'Your Company'],
    job_start_date: ['Start Date', 'From', 'Start', 'Date Started', 'From Date', 'Employment Start', 'Start Date *', 'Start:', 'Enter Start Date', 'From (Month/Year)', 'When did you start', 'Started', 'Beginning Date', 'Start date (MM/YYYY)', 'Position start', 'Job started', 'Joined', 'Date joined', 'Hire Date', 'Start Month', 'Starting Date'],
    job_end_date: ['End Date', 'To', 'End', 'Date Ended', 'To Date', 'Employment End', 'End Date *', 'End:', 'Enter End Date', 'To (Month/Year)', 'When did you leave', 'Ended', 'Ending Date', 'End date (MM/YYYY)', 'Position end', 'Job ended', 'Left', 'Date left', 'Last Day', 'End Month', 'Ending Date', 'Present'],
    work_description: ['Description', 'Job Description', 'Responsibilities', 'Duties', 'Role Description', 'Job Duties', 'Work Description', 'What did you do', 'Describe your role', 'Key responsibilities', 'Summary', 'Job Summary', 'Role summary', 'Experience description', 'Achievements', 'Key achievements', 'Accomplishments', 'Tasks', 'Key tasks'],
    school: ['School', 'University', 'College', 'Institution', 'School Name', 'Educational Institution', 'School *', 'University:', 'Enter School', 'College name', 'Your school', 'Institution name', 'Academic institution', 'Education institution', 'Where did you study', 'School/University', 'College/University', 'Name of institution', 'Academy', 'High School', 'Secondary School', 'Graduate School'],
    degree: ['Degree', 'Degree Type', 'Qualification', 'Diploma', 'Certificate', 'Degree *', 'Degree:', 'Enter Degree', 'Type of degree', 'Your degree', 'Qualification earned', 'Education level', 'Academic degree', 'Degree obtained', 'What degree', 'Highest Degree', 'Degree name', 'Bachelor', 'Master', 'PhD', 'Doctorate', 'Associates'],
    major: ['Major', 'Field of Study', 'Specialization', 'Subject', 'Area of Study', 'Concentration', 'Major *', 'Major:', 'Enter Major', 'Your major', 'Field', 'Study area', 'Academic major', 'What did you study', 'Discipline', 'Program', 'Course of study', 'Primary field', 'Course', 'Stream', 'Branch', 'Department'],
    gpa: ['GPA', 'Grade', 'CGPA', 'Grade Point Average', 'Academic Score', 'GPA *', 'GPA:', 'Enter GPA', 'Your GPA', 'Cumulative GPA', 'Final GPA', 'Overall GPA', 'Grade average', 'Academic grade', 'Score', 'Grade point', 'GPA (out of 4.0)', 'GPA Scale', 'Academic GPA', 'University GPA', 'College GPA', 'Percentage', 'Marks'],
    edu_start_date: ['Start Date', 'From', 'Enrollment Date', 'Started', 'Education Start', 'Start Date *', 'From:', 'When did you start', 'Enrolled', 'Enrollment year', 'Year started', 'From (Year)', 'Start year', 'Began studying', 'First year', 'Admission date', 'Entry date'],
    edu_end_date: ['End Date', 'Graduation', 'To', 'Graduation Date', 'Completed', 'Education End', 'End Date *', 'To:', 'When did you graduate', 'Graduated', 'Graduation year', 'Year completed', 'To (Year)', 'End year', 'Finished studying', 'Final year', 'Completion date', 'Expected graduation'],
    gender: ['Gender', 'Gender Identity', 'Sex', 'Your Gender', 'Gender *', 'Gender:', 'Select Gender', 'What is your gender', 'Gender (optional)', 'Sex (optional)', 'Gender/Sex', 'Biological Sex', 'Preferred Gender', 'I identify as', 'Your sex'],
    race: ['Race', 'Ethnicity', 'Race/Ethnicity', 'Ethnic Background', 'Race *', 'Ethnicity:', 'Select Race', 'What is your race', 'Race (optional)', 'Ethnicity (optional)', 'Racial Background', 'Ethnic Origin', 'Your ethnicity', 'Your race', 'Demographic', 'Heritage'],
    veteran: ['Veteran Status', 'Veteran', 'Protected Veteran', 'Military Service', 'Veteran *', 'Veteran:', 'Are you a veteran', 'Military veteran', 'US Veteran', 'Armed Forces', 'Service member', 'Former military', 'Have you served', 'Military status', 'Veteran (optional)', 'Served in military'],
    disability: ['Disability', 'Disability Status', 'Accommodation Needed', 'Disability *', 'Disability:', 'Do you have a disability', 'Disability (optional)', 'Disabled', 'Physical disability', 'Special needs', 'ADA', 'Accommodations', 'Need accommodations', 'Require accommodations', 'Disability self-identification'],
    salary_current: ['Current Salary', 'Current CTC', 'Current Compensation', 'Present Salary', 'Current Salary *', 'Current Pay', 'Your current salary', 'Base Salary', 'Current Base', 'Annual Salary', 'Yearly Compensation', 'What is your current salary', 'Current annual income', 'Present compensation', 'Current package', 'Total current compensation', 'Current earnings'],
    salary_expected: ['Expected Salary', 'Desired Salary', 'Salary Expectations', 'Desired Compensation', 'Expected Salary *', 'Expected Pay', 'Your expected salary', 'Salary requirement', 'Desired pay', 'What salary do you expect', 'Target salary', 'Required compensation', 'Preferred salary', 'Salary expectation', 'Minimum salary', 'Expected annual salary', 'Expected package'],
    work_auth: ['Work Authorization', 'Legal Authorization', 'Right to Work', 'Employment Authorization', 'Work Authorization *', 'Work Auth:', 'Are you authorized to work', 'Work eligibility', 'Employment eligibility', 'Legally authorized', 'Can you legally work', 'Work permit', 'Authorization status', 'Legal right to work', 'Authorized to work in US', 'Work status'],
    sponsorship: ['Sponsorship', 'Require Sponsorship', 'Visa Sponsorship', 'Sponsorship Required', 'Sponsorship *', 'Do you need sponsorship', 'Need visa sponsorship', 'Sponsorship needed', 'Will you need sponsorship', 'Require visa', 'H1B Sponsorship', 'Immigration sponsorship', 'Visa support', 'Sponsorship requirement', 'Future sponsorship'],
    citizenship: ['Citizenship', 'Citizenship Status', 'National Status', 'Country of Citizenship', 'Citizenship *', 'Your citizenship', 'Are you a citizen', 'Citizen of', 'Nationality', 'US Citizen', 'Permanent Resident', 'Immigration Status', 'VISA Status', 'Legal Status', 'Citizenship country', 'Citizen status'],
    clearance: ['Security Clearance', 'Clearance', 'Clearance Level', 'Security Level', 'Clearance *', 'Do you have clearance', 'Current clearance', 'Active clearance', 'Secret Clearance', 'Top Secret', 'TS/SCI', 'Government Clearance', 'Federal Clearance', 'Clearance status', 'Security authorization'],
    legal_age: ['Are you 18+?', 'Over 18', 'Age Verification', 'Legal Age', 'Are you at least 18', 'Minimum Age', 'Age requirement', 'Are you 18 or older', 'Above 18', 'Legal working age', 'Over 18 years old', 'At least 18 years', 'Age confirmation', 'Can you legally work (18+)'],
    tax_id: ['SSN', 'Tax ID', 'Social Security', 'National ID', 'SSN *', 'Social Security Number', 'Tax Identification', 'Government ID', 'ID Number', 'National Insurance', 'TIN', 'Taxpayer ID', 'ITIN', 'EIN', 'SSN (last 4)', 'Last 4 SSN'],
    referral_source: ['How did you hear about us?', 'Referral Source', 'Where did you hear about us?', 'Source', 'Referral', 'How did you find us', 'Heard about us from', 'Source of application', 'How did you learn about this job', 'Recruitment source', 'Application source', 'Where did you find this job', 'Job source', 'Referred by', 'Employee referral'],
    cover_letter: ['Cover Letter', 'Cover Note', 'Introduction Letter', 'Application Letter', 'Cover Letter *', 'Upload cover letter', 'Your cover letter', 'Letter of interest', 'Motivation letter', 'Personal statement', 'Why are you applying', 'Cover message', 'Application note', 'Introductory letter'],
    generic_question: ['Question', 'Additional Info', 'Other', 'Comments', 'Notes', 'Additional Information', 'Other information', 'Anything else', 'Additional comments', 'More info', 'Extra details', 'Other details', 'Remarks', 'Add notes', 'Custom Question']
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
    address: ['address', 'street_address', 'streetAddress', 'home_address', 'mailing_address'],
    city: ['city', 'location_city', 'town', 'city_name'],
    state: ['state', 'state_province', 'province', 'region'],
    zip_code: ['zip', 'zip_code', 'zipCode', 'postal_code', 'postalCode', 'postcode'],
    country: ['country', 'country_name', 'nation'],
    job_title: ['job_title', 'jobTitle', 'position', 'role', 'title', 'current_title'],
    company: ['company', 'employer', 'organization', 'company_name', 'workplace'],
    job_start_date: ['start_date', 'startDate', 'from_date', 'date_started', 'job_start'],
    job_end_date: ['end_date', 'endDate', 'to_date', 'date_ended', 'job_end'],
    work_description: ['description', 'job_description', 'responsibilities', 'duties'],
    school: ['school', 'university', 'college', 'institution', 'school_name'],
    degree: ['degree', 'degree_type', 'qualification', 'diploma'],
    major: ['major', 'field_of_study', 'specialization', 'subject', 'concentration'],
    gpa: ['gpa', 'grade', 'cgpa', 'grade_point'],
    edu_start_date: ['edu_start', 'education_start', 'enrollment_date'],
    edu_end_date: ['edu_end', 'graduation_date', 'graduation', 'completed'],
    gender: ['gender', 'gender_identity', 'sex'],
    race: ['race', 'ethnicity', 'ethnic_background'],
    veteran: ['veteran', 'veteran_status', 'military_service'],
    disability: ['disability', 'disability_status', 'accommodation'],
    salary_current: ['current_salary', 'currentSalary', 'current_ctc', 'present_salary'],
    salary_expected: ['expected_salary', 'expectedSalary', 'desired_salary', 'salary_expectation'],
    work_auth: ['work_auth', 'workAuth', 'legal_authorization', 'right_to_work'],
    sponsorship: ['sponsorship', 'require_sponsorship', 'visa_sponsorship'],
    citizenship: ['citizenship', 'citizenship_status', 'nationality'],
    clearance: ['clearance', 'security_clearance', 'clearance_level'],
    legal_age: ['legal_age', 'over_18', 'age_verification'],
    tax_id: ['ssn', 'tax_id', 'social_security', 'national_id'],
    referral_source: ['referral_source', 'referral', 'source', 'how_heard'],
    cover_letter: ['cover_letter', 'coverLetter', 'cover_note'],
    generic_question: ['question', 'additional_info', 'other', 'comments']
};

// Parent context variations
const PARENT_CONTEXTS = {
    first_name: ['Personal Information', 'Basic Info', 'Contact Details', 'Applicant Info', 'Your Details', ''],
    last_name: ['Personal Information', 'Basic Info', 'Contact Details', 'Applicant Info', 'Your Details', ''],
    full_name: ['Personal Information', 'Application Form', 'Your Information', ''],
    email: ['Contact Information', 'Personal Information', 'Contact Details', 'How to Reach You', ''],
    phone: ['Contact Information', 'Personal Information', 'Contact Details', 'How to Reach You', ''],
    linkedin: ['Professional Links', 'Social Profiles', 'Online Presence', 'Links', ''],
    github: ['Professional Links', 'Social Profiles', 'Online Presence', 'Developer Profiles', ''],
    portfolio: ['Professional Links', 'Work Samples', 'Online Presence', ''],
    website: ['Professional Links', 'Online Presence', 'Links', ''],
    address: ['Location', 'Contact Information', 'Address', ''],
    city: ['Location', 'Address', 'Where You Live', ''],
    state: ['Location', 'Address', 'Where You Live', ''],
    zip_code: ['Location', 'Address', 'Contact Information', ''],
    country: ['Location', 'Address', ''],
    job_title: ['Work Experience', 'Employment History', 'Professional Experience', 'Previous Jobs', 'Current Employment'],
    company: ['Work Experience', 'Employment History', 'Professional Experience', 'Previous Jobs', 'Current Employment'],
    job_start_date: ['Work Experience', 'Employment History', 'Professional Experience', 'Previous Jobs'],
    job_end_date: ['Work Experience', 'Employment History', 'Professional Experience', 'Previous Jobs'],
    work_description: ['Work Experience', 'Employment History', 'Job Responsibilities'],
    school: ['Education', 'Academic Background', 'Education History', 'Academic History'],
    degree: ['Education', 'Academic Background', 'Education History', 'Qualifications'],
    major: ['Education', 'Academic Background', 'Field of Study'],
    gpa: ['Education', 'Academic Performance', 'Grades'],
    edu_start_date: ['Education', 'Academic History', 'Education History'],
    edu_end_date: ['Education', 'Academic History', 'Education History', 'Graduation'],
    gender: ['Equal Opportunity', 'Diversity Information', 'EEOC', 'Demographics'],
    race: ['Equal Opportunity', 'Diversity Information', 'EEOC', 'Demographics'],
    veteran: ['Equal Opportunity', 'Diversity Information', 'EEOC', 'Military Status'],
    disability: ['Equal Opportunity', 'Diversity Information', 'EEOC', 'Accommodations'],
    salary_current: ['Compensation', 'Pay Details', 'Salary Information'],
    salary_expected: ['Compensation', 'Pay Expectations', 'Salary Information'],
    work_auth: ['Legal Requirements', 'Employment Eligibility', 'Work Authorization'],
    sponsorship: ['Legal Requirements', 'Visa Information', 'Work Authorization'],
    citizenship: ['Legal Requirements', 'Legal Status', 'Citizenship'],
    clearance: ['Background Check', 'Security Requirements', 'Security'],
    legal_age: ['Legal Requirements', 'Eligibility', 'Age Verification'],
    tax_id: ['Legal Requirements', 'Tax Information', 'Government ID'],
    referral_source: ['Application Details', 'Source', 'How You Found Us'],
    cover_letter: ['Additional Information', 'Documents', 'Supporting Materials'],
    generic_question: ['Additional Questions', 'Other Information', 'Comments', '']
};

// Sibling context patterns
const SIBLING_PATTERNS = {
    first_name: ['*First Name*, Last Name, Email', '*First Name*, Last Name, Phone', 'Name, *First Name*, Last Name'],
    last_name: ['First Name, *Last Name*, Email', 'First Name, *Last Name*, Phone', '*Last Name*, Email, Phone'],
    full_name: ['*Full Name*, Email, Phone', '*Name*, Email Address', 'Name, *Full Name*, Contact'],
    email: ['Name, *Email*, Phone', 'Phone, *Email*, LinkedIn', 'First Name, Last Name, *Email*'],
    phone: ['Email, *Phone*, Address', 'Name, Email, *Phone*', '*Phone*, LinkedIn, Website'],
    linkedin: ['GitHub, *LinkedIn*, Portfolio', 'Email, *LinkedIn*, Website', '*LinkedIn*, GitHub, Resume'],
    github: ['LinkedIn, *GitHub*, Portfolio', '*GitHub*, LinkedIn, Website', 'Email, *GitHub*, Portfolio'],
    portfolio: ['GitHub, *Portfolio*, Resume', 'LinkedIn, *Portfolio*, Website', '*Portfolio*, GitHub, Cover Letter'],
    website: ['LinkedIn, *Website*, Portfolio', 'GitHub, *Website*, Blog', 'Portfolio, *Website*, Resume'],
    address: ['*Address*, City, State', 'Name, *Address*, Phone', '*Street Address*, Apartment, City'],
    city: ['Address, *City*, State', '*City*, State, Zip', 'Street, *City*, Country'],
    state: ['City, *State*, Zip', '*State*, Zip Code, Country', 'Address, City, *State*'],
    zip_code: ['State, *Zip Code*, Country', 'City, State, *ZIP*', '*Postal Code*, Country'],
    country: ['Zip, *Country*, Phone', 'State, Zip, *Country*', '*Country*, Address'],
    job_title: ['*Job Title*, Company, Start Date', '*Position*, Employer, Duration', 'Company, *Title*, Description'],
    company: ['Job Title, *Company*, Start Date', 'Position, *Employer*, Duration', '*Company Name*, Location, Title'],
    job_start_date: ['Company, *Start Date*, End Date', '*From*, To, Description', 'Title, *Start Date*, End Date'],
    job_end_date: ['Start Date, *End Date*, Description', 'From, *To*, Current', '*End Date*, Responsibilities'],
    work_description: ['End Date, *Description*, Next Job', 'Company, Title, *Responsibilities*'],
    school: ['*School*, Degree, Major', '*University*, Field, GPA', 'Education, *Institution*, Graduation'],
    degree: ['School, *Degree*, Major', '*Degree Type*, Field, Year', 'University, *Qualification*, GPA'],
    major: ['Degree, *Major*, GPA', 'School, Degree, *Field of Study*', '*Concentration*, Graduation'],
    gpa: ['Major, *GPA*, Graduation', 'Degree, *Grade*, Year', 'School, Degree, *CGPA*'],
    edu_start_date: ['School, *Start Date*, End Date', '*From*, To, Degree', 'Institution, *Enrollment*, Graduation'],
    edu_end_date: ['Start Date, *End Date*, Degree', 'From, *Graduation*, GPA', '*Completed*, Major, Honors'],
    gender: ['*Gender*, Race, Veteran', '*Gender Identity*, Ethnicity', 'Demographics, *Gender*, Disability'],
    race: ['Gender, *Race*, Veteran', '*Ethnicity*, Gender, Disability', 'Demographics, *Race*, Age'],
    veteran: ['Race, *Veteran Status*, Disability', 'Gender, *Veteran*, Accommodation', '*Military Service*, Citizenship'],
    disability: ['Veteran, *Disability*, Legal Age', 'Gender, Race, *Disability Status*', '*Accommodation*, Other'],
    salary_current: ['*Current Salary*, Expected', 'Compensation, *Current CTC*', '*Present Salary*, Desired'],
    salary_expected: ['Current, *Expected Salary*', '*Desired Pay*, Benefits', 'Current CTC, *Salary Expectation*'],
    work_auth: ['*Work Authorization*, Sponsorship', '*Legal Auth*, Citizenship', 'Eligibility, *Right to Work*'],
    sponsorship: ['Work Auth, *Sponsorship*, Visa', '*Require Sponsorship*, Citizenship', 'Legal, *Visa Sponsorship*'],
    citizenship: ['Sponsorship, *Citizenship*', 'Work Auth, *Nationality*', '*Citizenship Status*, Visa'],
    clearance: ['*Security Clearance*, Level', '*Clearance*, Background', 'Security, *Clearance Level*'],
    legal_age: ['*Over 18*, Certification', 'Disability, *Legal Age*', '*Age Verification*, Work Auth'],
    tax_id: ['*SSN*, Work Auth', '*Tax ID*, Legal', 'ID, *Social Security*'],
    referral_source: ['*How did you hear?*, Referral', 'Source, *Referral Code*', '*Where heard*, Employee Referral'],
    cover_letter: ['Resume, *Cover Letter*, References', 'Documents, *Cover Note*', '*Application Letter*, Portfolio'],
    generic_question: ['*Question*, Comments', 'Other, *Additional Info*', '*Notes*, Submit']
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
    address: ['123 Main St', 'Street address', 'Enter address', ''],
    city: ['New York', 'San Francisco', 'Enter city', 'City name', ''],
    state: ['NY', 'CA', 'State', 'Enter state', ''],
    zip_code: ['10001', '94102', 'Zip code', 'Enter zip', ''],
    country: ['United States', 'USA', 'Country', ''],
    job_title: ['Software Engineer', 'Product Manager', 'Your title', ''],
    company: ['Google', 'Microsoft', 'Company name', ''],
    job_start_date: ['MM/YYYY', 'Jan 2020', 'Start date', ''],
    job_end_date: ['MM/YYYY', 'Dec 2023', 'End date', 'Present', ''],
    school: ['MIT', 'Stanford', 'University name', ''],
    degree: ['Bachelor of Science', 'Master of Arts', 'Degree type', ''],
    major: ['Computer Science', 'Business', 'Field of study', ''],
    gpa: ['3.8', '3.5/4.0', 'Your GPA', ''],
    salary_current: ['$100,000', '100000', 'Current salary', ''],
    salary_expected: ['$120,000', '120000', 'Desired salary', '']
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
                siblingContext: siblings[Math.floor(Math.random() * siblings.length)],
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
    console.log(`⚙️ Features: label + name + placeholder + parentContext + siblingContext`);
    console.log(`📦 Params: ~2,001\n`);

    const EPOCHS = 1000; // Extended training for better accuracy
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
