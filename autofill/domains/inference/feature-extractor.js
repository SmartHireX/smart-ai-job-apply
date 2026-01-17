/**
 * FeatureExtractor V3 - Keyword-Based Approach
 * 
 * Instead of hashing, uses explicit keyword presence features for each class.
 * This creates sparse but highly discriminative feature vectors.
 * 
 * Feature Vector (95 dimensions used in V7 training):
 *   - Keyword Presence (86 dims): One per class
 *   - Structural Features (9 dims): Type, label, placeholder, dropdown, etc.
 * 
 * @module FeatureExtractorV3
 * @version 3.0.0
 */

class FeatureExtractorV3 {

    static VERSION = '3.0.0';
    static FEATURE_DIM = 95;  // matches training data

    // Keyword map for 86 classes (Archive Version)
    static KEYWORD_MAP = {
        'unknown': [],
        'first_name': ['first', 'given', 'fname', 'vorname', 'prénom', 'primer', 'nombre', 'firstname'],
        'middle_name': ['middle', 'mname', 'zweiter'],
        'last_name': ['last', 'surname', 'lname', 'family', 'nachname', 'nom', 'apellido', 'lastname', 'familyname'],
        'full_name': ['full', 'fullname', 'name', 'complete'],
        'preferred_name': ['preferred', 'nickname', 'goes by', 'display', 'prefer'],
        'profile_photo': ['photo', 'picture', 'avatar', 'image', 'headshot', 'profile pic'],
        'email': ['email', 'e-mail', 'correo', 'mail', 'courriel', 'emailaddress'],
        'email_secondary': ['secondary email', 'alternate email', 'other email', 'personal email', 'backup email'],
        'phone': ['phone', 'tel', 'mobile', 'cell', 'telefon', 'número', 'contact number', 'phonenumber'],
        'phone_home': ['home phone', 'landline', 'residential', 'house phone'],
        'linkedin_url': ['linkedin', 'linked in', 'linkedinurl'],
        'github_url': ['github', 'git hub', 'githuburl', 'gitprofile'],
        'portfolio_url': ['portfolio', 'website', 'personal site', 'blog', 'portfoliourl'],
        'twitter_url': ['twitter', 'x.com', 'twitterurl'],
        'address_line': ['address', 'street', 'adresse', 'dirección', 'strasse', 'addressline', 'address1', 'address2'],
        'city': ['city', 'town', 'ciudad', 'stadt', 'ville', 'municipality'],
        'state': ['state', 'province', 'region', 'bundesland', 'provincia', 'prefecture'],
        'zip_code': ['zip', 'postal', 'postcode', 'plz', 'código postal', 'zipcode', 'postalcode'],
        'country': ['country', 'nation', 'land', 'país', 'pays'],
        'current_location': ['current location', 'where are you', 'location', 'based in'],
        'preferred_location': ['preferred location', 'willing to relocate', 'desired location', 'where want work'],
        'date_of_birth': ['birth', 'dob', 'birthday', 'born', 'geburtsdatum', 'fecha nacimiento', 'dateofbirth'],
        'gender': ['gender', 'sex', 'geschlecht', 'género', 'male female'],
        'race': ['race', 'ethnicity background', 'racial', 'ethnic'],
        'ethnicity': ['ethnicity', 'hispanic', 'latino', 'ethnic origin', 'national origin'],
        'veteran': ['veteran', 'military service', 'served', 'armed forces', 'vet'],
        'disability': ['disability', 'disabled', 'accommodation', 'handicap', 'impairment'],
        'current_company': ['current company', 'present employer', 'where work now', 'current employer'],
        'current_title': ['current title', 'present position', 'job title now', 'current role', 'currenttitle'],
        'years_experience': ['years experience', 'experience years', 'how many years', 'work experience', 'total experience'],
        'resume': ['resume', 'cv', 'curriculum', 'lebenslauf', 'upload resume'],
        'cover_letter': ['cover letter', 'motivation letter', 'application letter', 'coverletter'],
        'institution_name': ['university', 'college', 'school', 'institution', 'hochschule', 'universidad', 'institute', 'alma mater'],
        'degree_type': ['degree', 'qualification', 'certificate', 'diploma', 'bachelor', 'master', 'phd', 'degreetype'],
        'major': ['major', 'field study', 'concentration', 'specialization', 'hauptfach'],
        'field_of_study': ['field of study', 'area study', 'discipline', 'subject'],
        'gpa': ['gpa', 'grade point', 'grades', 'score', 'marks', 'cgpa'],
        'graduation_date': ['graduation', 'graduate', 'completed', 'finished school', 'graduationdate'],
        'education_start_date': ['education start', 'enrolled', 'started school', 'began studies'],
        'education_end_date': ['education end', 'expected graduation', 'completion date'],
        'education_current': ['currently enrolled', 'still studying', 'in progress', 'ongoing education'],
        'company_name': ['company name', 'employer name', 'organization', 'firma', 'empresa', 'companyname'],
        'job_title': ['job title', 'position', 'role', 'title', 'designation', 'jobtitle'],
        'job_start_date': ['start date', 'from date', 'began', 'joined', 'startdate'],
        'job_end_date': ['end date', 'to date', 'left', 'finished', 'enddate', 'until'],
        'job_description': ['job description', 'responsibilities', 'duties', 'tasks', 'describe role', 'jobdescription'],
        'job_location': ['job location', 'work location', 'office location'],
        'salary_expected': ['expected salary', 'desired salary', 'salary expectation', 'compensation expected', 'salaryexpected'],
        'salary_current': ['current salary', 'present salary', 'salary now', 'salarycurrent'],
        'work_auth': ['work authorization', 'authorized to work', 'legal right', 'eligible work', 'workauth'],
        'sponsorship': ['sponsorship', 'visa sponsorship', 'sponsor visa', 'require sponsorship'],
        'visa_status': ['visa status', 'immigration status', 'work visa', 'visastatus'],
        'citizenship': ['citizenship', 'citizen', 'nationality', 'national'],
        'skills': ['skills', 'abilities', 'competencies', 'technical skills', 'skillset'],
        'technical_skills': ['technical skills', 'programming', 'software', 'technologies', 'technicalskills'],
        'certifications': ['certifications', 'certificates', 'licenses', 'credentials', 'certified'],
        'languages': ['languages', 'language proficiency', 'speak', 'fluent', 'bilingual'],
        'language_proficiency': ['proficiency', 'fluency level', 'language level'],
        'notice_period_in_days': ['notice period', 'when can start', 'availability', 'join date', 'noticeperiod'],
        'shift_preference': ['shift', 'schedule preference', 'work hours', 'availability hours'],
        'work_type': ['work type', 'employment type', 'full time', 'part time', 'contract', 'worktype'],
        'remote_preference': ['remote', 'work from home', 'hybrid', 'on-site', 'remotepreference'],
        'job_type_preference': ['job type', 'role preference', 'position type'],
        'additional_info': ['additional information', 'anything else', 'other info', 'comments', 'notes', 'additionalinfo'],
        'intro_note': ['intro', 'introduction', 'about yourself', 'describe yourself'],
        'military_service': ['military', 'service branch', 'armed forces', 'served in'],
        'service_dates': ['service dates', 'active duty dates', 'enlistment'],
        'discharge_status': ['discharge', 'separation', 'honorable', 'type of discharge'],
        'federal_employee': ['federal employee', 'government employee', 'federal worker', 'civil servant'],
        'federal_grade': ['federal grade', 'gs level', 'pay grade', 'grade level'],
        'clearance': ['clearance', 'security clearance', 'classified', 'top secret'],
        'schedule_a': ['schedule a', 'severe disability', '30% disabled'],
        'career_goals': ['career goals', 'objectives', 'aspirations', 'where see yourself'],
        'interest_areas': ['interest areas', 'interests', 'what interests you'],
        'agreement': ['agree', 'accept', 'consent', 'terms', 'acknowledge', 'confirm'],
        'legal_age': ['18 years', 'legal age', 'at least 18', 'over 18', 'legalage'],
        'background_check': ['background check', 'criminal history', 'felony', 'conviction'],
        'criminal_record': ['criminal record', 'arrested', 'charged', 'criminalrecord'],
        'drug_test': ['drug test', 'drug screening', 'substance test'],
        'tax_id': ['tax id', 'ssn', 'social security', 'tax number', 'ein', 'taxid'],
        'marital_status': ['marital status', 'married', 'single', 'maritalstatus'],
        'education_level': ['education level', 'highest degree', 'qualification level'],
        'years_skill': ['years skill', 'skill experience', 'how long using'],
        'timezone': ['timezone', 'time zone', 'your time zone'],
        'resume_upload': ['upload resume', 'attach resume', 'submit resume', 'resumeupload']
    };

    constructor() {
        // Precompute class->index mapping
        this._classToIndex = {};
        const classes = Object.keys(FeatureExtractorV3.KEYWORD_MAP);
        for (let i = 0; i < classes.length; i++) {
            this._classToIndex[classes[i]] = i;
        }
    }

    /**
     * Extract features from a field object
     * @param {Object} field - Field object with attributes
     * @returns {number[]} Feature vector (95 dims)
     */
    extract(field) {
        if (!field) {
            return new Array(FeatureExtractorV3.FEATURE_DIM).fill(0);
        }

        // Collect all text from field
        const allText = this._collectText(field).toLowerCase();

        // Part 1: Keyword presence features (86 dims)
        const keywordFeatures = this._extractKeywordFeatures(allText);

        // Part 2: Structural features (9 dims)
        const structuralFeatures = this._extractStructuralFeatures(field);

        return [...keywordFeatures, ...structuralFeatures];
    }

    /**
     * Collect all relevant text from a field
     * @private
     */
    _collectText(field) {
        const parts = [];

        // Direct attributes
        if (field.name) parts.push(field.name);
        if (field.id) parts.push(field.id);
        if (field.label) parts.push(field.label);
        if (field.placeholder) parts.push(field.placeholder);
        if (field.automationId) parts.push(field.automationId);
        if (field.parentContext) parts.push(field.parentContext);
        if (field.siblingContext) parts.push(field.siblingContext);

        // From features object (training data format)
        if (field.features) {
            if (field.features.name) parts.push(field.features.name);
            if (field.features.label) parts.push(field.features.label);
            if (field.features.placeholder) parts.push(field.features.placeholder);
            if (field.features.automationId) parts.push(field.features.automationId);
            if (field.features.parentContext) parts.push(field.features.parentContext);
            if (field.features.siblingContext) parts.push(field.features.siblingContext);
        }

        // DOM access
        if (typeof field.getAttribute === 'function') {
            const ariaLabel = field.getAttribute('aria-label');
            const dataAutomation = field.getAttribute('data-automation-id');
            if (ariaLabel) parts.push(ariaLabel);
            if (dataAutomation) parts.push(dataAutomation);
        }

        // Labels array
        if (field.labels && field.labels.length > 0) {
            parts.push(...field.labels.map(l => l.textContent || l.innerText || ''));
        }

        return parts.join(' ').replace(/[_-]/g, ' ');
    }

    /**
     * Extract keyword presence features for all 86 classes
     * @private
     */
    _extractKeywordFeatures(text) {
        const features = [];
        const classes = Object.keys(FeatureExtractorV3.KEYWORD_MAP);

        for (const cls of classes) {
            const keywords = FeatureExtractorV3.KEYWORD_MAP[cls];
            let score = 0;

            if (keywords) {
                for (const keyword of keywords) {
                    if (text.includes(keyword)) {
                        score += keyword.split(' ').length;
                    }
                }
            }

            features.push(Math.min(score / 3, 1));
        }

        return features;
    }

    /**
     * Extract structural features (9 dims)
     * @private
     */
    _extractStructuralFeatures(field) {
        const type = (field.type || 'text').toLowerCase();

        return [
            // Input type one-hot (5 dims)
            type === 'text' ? 1 : 0,
            type === 'email' ? 1 : 0,
            type === 'tel' ? 1 : 0,
            type === 'number' ? 1 : 0,
            type === 'file' ? 1 : 0,

            // Other structural (4 dims)
            field.label ? 1 : 0,
            field.placeholder ? 1 : 0,
            (field.tagName === 'SELECT' || field.type === 'select') ? 1 : 0,
            (field.tagName === 'TEXTAREA' || field.type === 'textarea') ? 1 : 0
        ];
    }
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FeatureExtractorV3;
}

// Export for browser
if (typeof window !== 'undefined') {
    window.FeatureExtractorV3 = FeatureExtractorV3;
}
