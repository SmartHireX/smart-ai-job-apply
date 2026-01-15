/**
 * HeuristicEngine
 * 
 * Enterprise-grade form field classification using Chrome-style regex patterns.
 * Based on Chromium's autofill heuristics (components/autofill/core/browser/form_parsing/).
 * 
 * Features:
 * - 45+ field types with international variants
 * - Typo tolerance and fuzzy matching
 * - Context-aware classification (work vs education)
 * - Negative patterns for exclusion
 * - Performance metrics and logging
 * 
 * @version 2.0.0
 * @author SmartHireX AI Team
 */

class HeuristicEngine {

    // ============================================================================
    // CONFIGURATION
    // ============================================================================

    static VERSION = '3.1.0';
    static DEBUG = false;  // Toggle for verbose logging

    /**
     * Field alias mapping for synonym resolution
     * Maps alternative field names to canonical HeuristicEngine field types
     * Fixes synonym mismatches (e.g., "address" → "address_line_1", "major" → "field_of_study")
     */
    static FIELD_ALIASES = {
        // Location synonyms
        'address': 'address_line_1',
        'street': 'address_line_1',

        // Work synonyms
        'current_company': 'company_name',
        'employer_name': 'company_name',
        'current_title': 'job_title',
        'position': 'job_title',

        // Education synonyms
        'major': 'field_of_study',
        'degree': 'degree_type',
        'college': 'institution_name',
        'university': 'institution_name',

        // Preference synonyms
        'remote_preference': 'work_style',
        'work_location_preference': 'work_style',

        // Compensation synonyms
        'salary': 'salary_expected',
        'expected_salary': 'salary_expected',
        'desired_salary': 'salary_expected',
        'current_salary': 'salary_current',

        // Date synonyms
        'start_date': 'availability',  // Generic start date → availability
        'available_start_date': 'availability',

        // Contact synonyms
        'mobile': 'phone',
        'cellphone': 'phone',
        'telephone': 'phone'
    };

    // Performance thresholds
    static CONFIDENCE_HIGH = 0.95;
    static CONFIDENCE_MEDIUM = 0.85;
    static CONFIDENCE_LOW = 0.70;

    // ============================================================================
    // PATTERN DEFINITIONS
    // Organized by category for maintainability
    // ============================================================================

    static PATTERNS = {

        // ======================== PERSONAL INFORMATION ========================
        first_name: {
            patterns: [
                /\b(first[_\-\s]?name|fname|given[_\-\s]?name|forename)\b/i,
                /\b(vorname|prénom|nombre|nome)\b/i,  // DE, FR, ES, IT
                /\b(frist[_\-\s]?name|fisrt[_\-\s]?name)\b/i,  // Typos
                /^(first|given)$/i,
                /\bapplicant[_\-\s]?first/i,
                /\bcandidate[_\-\s]?first/i,
                /\blegal[_\-\s]?first/i
            ],
            confidence: 0.97,
            category: 'personal'
        },

        last_name: {
            patterns: [
                /\b(last[_\-\s]?name|lname|family[_\-\s]?name|surname)\b/i,
                /\b(nachname|nom[_\-\s]?de[_\-\s]?famille|apellido|cognome)\b/i,  // DE, FR, ES, IT
                /\b(lsat[_\-\s]?name|lastn[_\-\s]?ame)\b/i,  // Typos
                /^(last|family|surname)$/i,
                /\bapplicant[_\-\s]?last/i,
                /\bcandidate[_\-\s]?last/i
            ],
            confidence: 0.97,
            category: 'personal'
        },

        full_name: {
            patterns: [
                /\b(full[_\-\s]?name|complete[_\-\s]?name|your[_\-\s]?name)\b/i,
                /\b(legal[_\-\s]?name|applicant[_\-\s]?name)\b/i,
                /^name$/i,
                /\bcandidate[_\-\s]?name\b/i,
                /\bcontact[_\-\s]?name\b/i
            ],
            confidence: 0.92,
            category: 'personal',
            negative: /\b(user|company|employer|job|file|school|institution)\s*name/i
        },

        email: {
            patterns: [
                /\b(e[\-_\.]?mail|email[_\-\s]?address)\b/i,
                /\b(correo|courriel|e[\-_]?post)\b/i,  // ES, FR, DE
                /\b(primary[_\-\s]?email|work[_\-\s]?email|personal[_\-\s]?email)\b/i,
                /\b(contact[_\-\s]?email|your[_\-\s]?email)\b/i,
                /^email$/i,
                /type.*email/i
            ],
            confidence: 0.99,
            category: 'personal'
        },

        phone: {
            patterns: [
                /\b(phone|telephone|tel|mobile|cell)\b/i,
                /\b(phone[_\-\s]?number|contact[_\-\s]?number)\b/i,
                /\b(mobile[_\-\s]?number|cell[_\-\s]?phone)\b/i,
                /\b(telefon|téléphone|teléfono|telefono)\b/i,  // DE, FR, ES, IT
                /\b(primary[_\-\s]?phone|work[_\-\s]?phone|home[_\-\s]?phone)\b/i,
                /\b(daytime[_\-\s]?phone|evening[_\-\s]?phone)\b/i
            ],
            confidence: 0.98,
            category: 'personal',
            negative: /\b(phone[_\-\s]?(brand|model|type|manufacturer))\b/i
        },

        // ======================== SOCIAL & PORTFOLIO ========================
        linkedin_url: {
            patterns: [
                /\blinkedin\b/i,
                /\blinked[\-_\s]?in\b/i,
                /\blinkedin[_\-\s]?(url|profile|link)\b/i,
                /linkedin\.com/i
            ],
            confidence: 0.99,
            category: 'social'
        },

        github_url: {
            patterns: [
                /\bgithub\b/i,
                /\bgit[\-_\s]?hub\b/i,
                /\bgithub[_\-\s]?(url|profile|link|username)\b/i,
                /github\.com/i
            ],
            confidence: 0.99,
            category: 'social'
        },

        portfolio_url: {
            patterns: [
                /\bportfolio\b/i,
                /\bportfolio[_\-\s]?(url|link|site|website)\b/i,
                /\bwork[_\-\s]?samples\b/i,
                /\bpersonal[_\-\s]?site\b/i,
                /\bonline[_\-\s]?portfolio\b/i
            ],
            confidence: 0.95,
            category: 'social'
        },

        website_url: {
            patterns: [
                /\b(website|web[_\-\s]?site|homepage)\b/i,
                /\b(personal[_\-\s]?website|personal[_\-\s]?url)\b/i,
                /\b(web[_\-\s]?url|your[_\-\s]?url)\b/i,
                /\bblog[_\-\s]?url\b/i
            ],
            confidence: 0.93,
            category: 'social'
        },

        twitter_url: {
            patterns: [
                /\b(twitter|x\.com)\b/i,
                /\btwitter[_\-\s]?(url|handle|profile)\b/i,
                /\b@?twitter\b/i,
                /\bx[_\-\s]?handle\b/i
            ],
            confidence: 0.97,
            category: 'social'
        },

        // ======================== LOCATION ========================
        address_line_1: {
            patterns: [
                /\b(address|street[_\-\s]?address|mailing[_\-\s]?address)\b/i,
                /\b(home[_\-\s]?address|residential[_\-\s]?address)\b/i,
                /\b(current[_\-\s]?address|permanent[_\-\s]?address)\b/i,
                /\b(address[_\-\s]?line[_\-\s]?[12]?|street[_\-\s]?line)\b/i,
                /\b(adresse|dirección|indirizzo)\b/i  // DE/FR, ES, IT
            ],
            confidence: 0.94,
            category: 'location',
            negative: /\b(email|e[\-_]?mail|ip|mac|web|url)\s*(address|adresse)/i
        },

        city: {
            patterns: [
                /\b(city|town|municipality)\b/i,
                /\b(city[_\-\s]?name|your[_\-\s]?city|location[_\-\s]?city)\b/i,
                /\b(stadt|ville|ciudad|città)\b/i,  // DE, FR, ES, IT
                /\btown[_\-\/]city\b/i
            ],
            confidence: 0.94,
            category: 'location',
            negative: /\b(capacity|electricity|utility|power|water)\b/i
        },

        state: {
            patterns: [
                /\b(state|province|region)\b/i,
                /\b(state[_\-\/]province|state[_\-\s]?region)\b/i,
                /\b(bundesland|provincia|état)\b/i,  // DE, ES/IT, FR
                /\bcounty\b/i
            ],
            confidence: 0.93,
            category: 'location'
        },

        zip_code: {
            patterns: [
                /\b(zip|zip[_\-\s]?code|postal[_\-\s]?code)\b/i,
                /\b(postcode|post[_\-\s]?code)\b/i,
                /\b(plz|código[_\-\s]?postal|cap)\b/i,  // DE, ES, IT
                /\bpin[_\-\s]?code\b/i  // India
            ],
            confidence: 0.97,
            category: 'location'
        },

        country: {
            patterns: [
                /\b(country|nation)\b/i,
                /\b(country[_\-\s]?name|country[_\-\s]?of[_\-\s]?residence)\b/i,
                /\b(land|país|paese)\b/i,  // DE, ES, IT
                /\blocation[_\-\s]?country\b/i
            ],
            confidence: 0.96,
            category: 'location'
        },

        // ======================== WORK HISTORY ========================
        job_title: {
            patterns: [
                /\b(job[_\-\s]?title|position|role|designation)\b/i,
                /\b(title|current[_\-\s]?title|position[_\-\s]?title)\b/i,
                /\b(your[_\-\s]?role|position[_\-\s]?held)\b/i,
                /\b(beruf|titre|título)\b/i,  // DE, FR, ES
                /\b(work[_\-\s]?title|employment[_\-\s]?title)\b/i
            ],
            confidence: 0.96,
            category: 'work',
            negative: /\b(job[_\-\s]?description|page[_\-\s]?title|document[_\-\s]?title|book[_\-\s]?title)\b/i
        },

        company_name: {
            patterns: [
                /\b(company|employer|organization|organisation)\b/i,
                /\b(company[_\-\s]?name|employer[_\-\s]?name)\b/i,
                /\b(current[_\-\s]?company|previous[_\-\s]?company)\b/i,
                /\b(workplace|firm|business[_\-\s]?name)\b/i,
                /\b(unternehmen|entreprise|empresa)\b/i  // DE, FR, ES
            ],
            confidence: 0.95,
            category: 'work',
            negative: /\b(company[_\-\s]?(size|type|culture|website|industry))\b/i
        },

        job_start_date: {
            patterns: [
                /\b(start[_\-\s]?date|from[_\-\s]?date|date[_\-\s]?started)\b/i,
                /\b(employment[_\-\s]?start|job[_\-\s]?start)\b/i,
                /\b(joined[_\-\s]?date|from[_\-\s]?month)\b/i,
                /\bwork[_\-\s]?from\b/i
            ],
            confidence: 0.93,
            category: 'work',
            contextFilter: (text) => !/education|school|degree|graduat|universit|college/i.test(text)
        },

        job_end_date: {
            patterns: [
                /\b(end[_\-\s]?date|to[_\-\s]?date|date[_\-\s]?ended)\b/i,
                /\b(employment[_\-\s]?end|job[_\-\s]?end|left[_\-\s]?date)\b/i,
                /\bwork[_\-\s]?to\b/i,
                /\bcurrent(ly)?[_\-\s]?working/i
            ],
            confidence: 0.93,
            category: 'work',
            contextFilter: (text) => !/education|school|degree|graduat|universit|college/i.test(text)
        },

        job_description: {
            patterns: [
                /\b(job[_\-\s]?description|responsibilities|duties)\b/i,
                /\b(role[_\-\s]?description|work[_\-\s]?description)\b/i,
                /\b(key[_\-\s]?responsibilities|achievements)\b/i,
                /\bwhat[_\-\s]?did[_\-\s]?you[_\-\s]?do\b/i
            ],
            confidence: 0.92,
            category: 'work',
            negative: /\b(description[_\-\s]?of[_\-\s]?(yourself|skills|experience))\b/i
        },

        job_location: {
            patterns: [
                /\b(job[_\-\s]?location|work[_\-\s]?location)\b/i,
                /\b(office[_\-\s]?location|employment[_\-\s]?location)\b/i
            ],
            confidence: 0.90,
            category: 'work'
        },

        // ======================== EDUCATION ========================
        institution_name: {
            patterns: [
                /\b(school|university|college|institution)\b/i,
                /\b(school[_\-\s]?name|university[_\-\s]?name)\b/i,
                /\b(educational[_\-\s]?institution|academia)\b/i,
                /\b(hochschule|université|universidad)\b/i,  // DE, FR, ES
                /\balma[_\-\s]?mater\b/i
            ],
            confidence: 0.96,
            category: 'education',
            negative: /\b(type[_\-\s]?of[_\-\s]?institution|institution[_\-\s]?type)\b/i
        },

        degree_type: {
            patterns: [
                /\b(degree|degree[_\-\s]?type|qualification)\b/i,
                /\b(diploma|certificate|certification)\b/i,
                /\b(highest[_\-\s]?degree|degree[_\-\s]?earned)\b/i,
                /\b(bachelor|master|phd|doctorate)\b/i,
                /\b(abschluss|diplôme|título)\b/i  // DE, FR, ES
            ],
            confidence: 0.94,
            category: 'education',
            negative: /\b(temperature|angle|rotation|latitude|longitude)\b/i
        },

        field_of_study: {
            patterns: [
                /\b(major|field[_\-\s]?of[_\-\s]?study|specialization)\b/i,
                /\b(subject|concentration|discipline)\b/i,
                /\b(area[_\-\s]?of[_\-\s]?study|course[_\-\s]?of[_\-\s]?study)\b/i,
                /\bstudienfach\b/i  // DE
            ],
            confidence: 0.93,
            category: 'education'
        },

        gpa: {
            patterns: [
                /\b(gpa|cgpa|grade[_\-\s]?point[_\-\s]?average)\b/i,
                /\b(grade|grades|academic[_\-\s]?score)\b/i,
                /\b(percentage|marks|score)\b/i
            ],
            confidence: 0.94,
            category: 'education'
        },

        education_start_date: {
            patterns: [
                /\b(edu[_\-\s]?start|education[_\-\s]?start)\b/i,
                /\benrollment[_\-\s]?date\b/i,
                /\bstart[_\-\s]?year\b/i
            ],
            confidence: 0.91,
            category: 'education',
            contextFilter: (text) => /education|school|degree|graduat|universit|college/i.test(text)
        },

        education_end_date: {
            patterns: [
                /\b(edu[_\-\s]?end|education[_\-\s]?end)\b/i,
                /\b(graduation[_\-\s]?date|graduation[_\-\s]?year)\b/i,
                /\b(completed|completion[_\-\s]?date)\b/i,
                /\bgraduated\b/i
            ],
            confidence: 0.92,
            category: 'education',
            contextFilter: (text) => /education|school|degree|graduat|universit|college/i.test(text)
        },

        // ======================== DEMOGRAPHICS (EEOC) ========================
        gender: {
            patterns: [
                /\b(gender|gender[_\-\s]?identity|sex)\b/i,
                /\b(your[_\-\s]?gender|select[_\-\s]?gender)\b/i,
                /\b(geschlecht|genre|género)\b/i  // DE, FR, ES
            ],
            confidence: 0.98,
            category: 'demographics'
        },

        race: {
            patterns: [
                /\b(race|ethnicity|ethnic[_\-\s]?background)\b/i,
                /\b(race[_\-\/]ethnicity|racial[_\-\s]?background)\b/i
            ],
            confidence: 0.98,
            category: 'demographics'
        },

        veteran: {
            patterns: [
                /\b(veteran|veteran[_\-\s]?status|protected[_\-\s]?veteran)\b/i,
                /\b(military[_\-\s]?service|armed[_\-\s]?forces)\b/i,
                /\bare[_\-\s]?you[_\-\s]?a[_\-\s]?veteran\b/i
            ],
            confidence: 0.99,
            category: 'demographics'
        },

        disability: {
            patterns: [
                /\b(disability|disability[_\-\s]?status)\b/i,
                /\b(accommodation[_\-\s]?needed|special[_\-\s]?needs)\b/i,
                /\bdo[_\-\s]?you[_\-\s]?have[_\-\s]?a[_\-\s]?disability\b/i
            ],
            confidence: 0.99,
            category: 'demographics'
        },

        marital_status: {
            patterns: [
                /\b(marital[_\-\s]?status|marriage[_\-\s]?status)\b/i,
                /\b(civil[_\-\s]?status|relationship[_\-\s]?status)\b/i,
                /\bsingle[_\-\/]married\b/i
            ],
            confidence: 0.97,
            category: 'demographics'
        },

        // ======================== COMPENSATION ========================
        salary_current: {
            patterns: [
                /\b(current[_\-\s]?salary|current[_\-\s]?ctc|present[_\-\s]?salary)\b/i,
                /\b(current[_\-\s]?compensation|current[_\-\s]?pay)\b/i,
                /\b(existing[_\-\s]?salary|annual[_\-\s]?salary)\b/i
            ],
            confidence: 0.97,
            category: 'compensation'
        },

        salary_expected: {
            patterns: [
                /\b(expected[_\-\s]?salary|desired[_\-\s]?salary)\b/i,
                /\b(salary[_\-\s]?expectation|salary[_\-\s]?requirement)\b/i,
                /\b(desired[_\-\s]?compensation|expected[_\-\s]?pay)\b/i,
                /\b(target[_\-\s]?salary|preferred[_\-\s]?salary)\b/i
            ],
            confidence: 0.97,
            category: 'compensation'
        },

        // ======================== LEGAL & COMPLIANCE ========================
        work_auth: {
            patterns: [
                /\b(work[_\-\s]?authorization|work[_\-\s]?auth)\b/i,
                /\b(legal[_\-\s]?authorization|authorized[_\-\s]?to[_\-\s]?work)\b/i,
                /\b(right[_\-\s]?to[_\-\s]?work|employment[_\-\s]?authorization)\b/i,
                /\b(eligib(le|ility)[_\-\s]?to[_\-\s]?work)\b/i
            ],
            confidence: 0.98,
            category: 'legal'
        },

        sponsorship: {
            patterns: [
                /\b(sponsorship|visa[_\-\s]?sponsorship)\b/i,
                /\b(require[_\-\s]?sponsorship|need[_\-\s]?sponsorship)\b/i,
                /\b(h1b|h-1b|work[_\-\s]?visa)\b/i,
                /\bdo[_\-\s]?you[_\-\s]?require[_\-\s]?sponsorship\b/i
            ],
            confidence: 0.98,
            category: 'legal'
        },

        citizenship: {
            patterns: [
                /\b(citizenship|citizenship[_\-\s]?status|nationality)\b/i,
                /\b(country[_\-\s]?of[_\-\s]?citizenship|citizen[_\-\s]?of)\b/i,
                /\bnational[_\-\s]?status\b/i
            ],
            confidence: 0.97,
            category: 'legal'
        },

        clearance: {
            patterns: [
                /\b(security[_\-\s]?clearance|clearance[_\-\s]?level)\b/i,
                /\b(clearance|secret[_\-\s]?clearance|top[_\-\s]?secret)\b/i,
                /\bdo[_\-\s]?you[_\-\s]?have[_\-\s]?clearance\b/i
            ],
            confidence: 0.98,
            category: 'legal'
        },

        legal_age: {
            patterns: [
                /\b(legal[_\-\s]?age|over[_\-\s]?18|18[_\-\s]?\+)\b/i,
                /\b(age[_\-\s]?verification|minimum[_\-\s]?age)\b/i,
                /\bare[_\-\s]?you[_\-\s]?(at[_\-\s]?least[_\-\s]?)?18\b/i,
                /\b18[_\-\s]?years[_\-\s]?(old|or[_\-\s]?older)\b/i
            ],
            confidence: 0.98,
            category: 'legal'
        },

        tax_id: {
            patterns: [
                /\b(ssn|social[_\-\s]?security|social[_\-\s]?security[_\-\s]?number)\b/i,
                /\b(tax[_\-\s]?id|national[_\-\s]?id|government[_\-\s]?id)\b/i,
                /\b(ein|tin|itin)\b/i
            ],
            confidence: 0.96,
            category: 'legal'
        },

        criminal_record: {
            patterns: [
                /\b(criminal[_\-\s]?record|criminal[_\-\s]?history)\b/i,
                /\b(felony|conviction|convicted)\b/i,
                /\b(background[_\-\s]?check|arrest[_\-\s]?record)\b/i,
                /\bhave[_\-\s]?you[_\-\s]?been[_\-\s]?convicted\b/i
            ],
            confidence: 0.98,
            category: 'legal'
        },

        notice_period: {
            patterns: [
                /\b(notice[_\-\s]?period|notice[_\-\s]?required)\b/i,
                /\b(how[_\-\s]?soon[_\-\s]?can[_\-\s]?you[_\-\s]?start|availability)\b/i,
                /\b(start[_\-\s]?date[_\-\s]?availability|earliest[_\-\s]?start)\b/i,
                /\b(days[_\-\s]?notice|weeks[_\-\s]?notice)\b/i
            ],
            confidence: 0.96,
            category: 'legal'
        },

        // ======================== MISCELLANEOUS ========================
        referral_source: {
            patterns: [
                /\b(how[_\-\s]?did[_\-\s]?you[_\-\s]?hear|referral[_\-\s]?source)\b/i,
                /\b(where[_\-\s]?did[_\-\s]?you[_\-\s]?hear|source)\b/i,
                /\b(how[_\-\s]?did[_\-\s]?you[_\-\s]?find[_\-\s]?us|referral)\b/i,
                /\b(employee[_\-\s]?referral|referred[_\-\s]?by)\b/i
            ],
            confidence: 0.95,
            category: 'misc'
        },

        cover_letter: {
            patterns: [
                /\b(cover[_\-\s]?letter|cover[_\-\s]?note)\b/i,
                /\b(application[_\-\s]?letter|introduction[_\-\s]?letter)\b/i,
                /\b(why[_\-\s]?should[_\-\s]?we[_\-\s]?hire|about[_\-\s]?yourself)\b/i,
                /\btell[_\-\s]?us[_\-\s]?about[_\-\s]?yourself\b/i
            ],
            confidence: 0.94,
            category: 'misc'
        },

        generic_question: {
            patterns: [
                /\b(additional[_\-\s]?information|additional[_\-\s]?comments)\b/i,
                /\b(other[_\-\s]?information|notes|comments)\b/i,
                /\b(anything[_\-\s]?else|other[_\-\s]?details)\b/i
            ],
            confidence: 0.85,
            category: 'misc'
        },

        // ==================== BATCH 1: PERSONAL IDENTITY EXTENDED ====================
        middle_name: {
            patterns: [
                /\b(middle[_\-\s]?name|middle[_\-\s]?initial|m\.?i\.?)\b/i,
                /\b(second[_\-\s]?name|additional[_\-\s]?name)\b/i,
                /\bzweiter[_\-\s]?vorname\b/i  // DE
            ],
            confidence: 0.96,
            category: 'personal'
        },

        preferred_name: {
            patterns: [
                /\b(preferred[_\-\s]?name|nickname|goes[_\-\s]?by)\b/i,
                /\b(known[_\-\s]?as|prefer[_\-\s]?to[_\-\s]?be[_\-\s]?called)\b/i,
                /\b(rufname|sobrenombre|surnom)\b/i  // DE, ES, FR
            ],
            confidence: 0.95,
            category: 'personal'
        },

        email_secondary: {
            patterns: [
                /\b(secondary[_\-\s]?email|alternate[_\-\s]?email|second[_\-\s]?email)\b/i,
                /\b(backup[_\-\s]?email|alternative[_\-\s]?email|other[_\-\s]?email)\b/i,
                /\bemail[_\-\s]?2\b/i
            ],
            confidence: 0.97,
            category: 'personal'
        },

        phone_home: {
            patterns: [
                /\b(home[_\-\s]?phone|home[_\-\s]?number)\b/i,
                /\b(residence[_\-\s]?phone|landline)\b/i,
                /\bfixed[_\-\s]?line\b/i
            ],
            confidence: 0.96,
            category: 'personal'
        },

        phone_mobile: {
            patterns: [
                /\b(mobile[_\-\s]?phone|mobile[_\-\s]?number|cell[_\-\s]?phone)\b/i,
                /\b(cell|cellular|handy)\b/i,  // handy = mobile in DE
                /\bmovil\b/i  // ES
            ],
            confidence: 0.97,
            category: 'personal'
        },

        headline: {
            patterns: [
                /\b(headline|tagline|professional[_\-\s]?headline)\b/i,
                /\b(professional[_\-\s]?title|profile[_\-\s]?headline)\b/i,
                /\bone[_\-\s]?liner\b/i
            ],
            confidence: 0.94,
            category: 'personal',
            negative: /\b(news[_\-\s]?headline|article[_\-\s]?headline|breaking[_\-\s]?news)\b/i
        },

        summary: {
            patterns: [
                /\b(summary|professional[_\-\s]?summary|profile[_\-\s]?summary)\b/i,
                /\b(bio|biography|about[_\-\s]?me|about[_\-\s]?yourself)\b/i,
                /\b(executive[_\-\s]?summary|professional[_\-\s]?profile)\b/i,
                /\bpersonal[_\-\s]?statement\b/i
            ],
            confidence: 0.92,
            category: 'personal',
            negative: /\bjob[_\-\s]?summary|position[_\-\s]?summary/i
        },

        profile_photo: {
            patterns: [
                /\b(profile[_\-\s]?photo|profile[_\-\s]?picture|photo)\b/i,
                /\b(headshot|avatar|profile[_\-\s]?image)\b/i,
                /\b(upload[_\-\s]?photo|your[_\-\s]?photo|picture)\b/i,
                /\bprofilbild\b/i  // DE
            ],
            confidence: 0.95,
            category: 'personal'
        },

        pronouns: {
            patterns: [
                /\b(pronouns|preferred[_\-\s]?pronouns|gender[_\-\s]?pronouns)\b/i,
                /\b(she[\/\-]her|he[\/\-]him|they[\/\-]them)\b/i,
                /\bhow[_\-\s]?should[_\-\s]?we[_\-\s]?address[_\-\s]?you\b/i
            ],
            confidence: 0.98,
            category: 'personal'
        },

        date_of_birth: {
            patterns: [
                /\b(date[_\-\s]?of[_\-\s]?birth|dob|birth[_\-\s]?date)\b/i,
                /\b(birthday|birthdate|born[_\-\s]?on)\b/i,
                /\b(geburtsdatum|fecha[_\-\s]?de[_\-\s]?nacimiento)\b/i  // DE, ES
            ],
            confidence: 0.98,
            category: 'personal'
        },

        gender_identity: {
            patterns: [
                /\b(gender[_\-\s]?identity|how[_\-\s]?do[_\-\s]?you[_\-\s]?identify)\b/i,
                /\b(gender[_\-\s]?expression|identify[_\-\s]?as)\b/i
            ],
            confidence: 0.97,
            category: 'demographics'
        },

        address_line_2: {
            patterns: [
                /\b(address[_\-\s]?line[_\-\s]?2|address[_\-\s]?2)\b/i,
                /\b(apartment|apt|suite|unit|floor)\b/i,
                /\b(building|flat|room)\b/i,
                /\bwohnung\b/i  // DE apartment
            ],
            confidence: 0.95,
            category: 'location'
        },

        current_location: {
            patterns: [
                /\b(current[_\-\s]?location|present[_\-\s]?location)\b/i,
                /\b(where[_\-\s]?are[_\-\s]?you[_\-\s]?located|your[_\-\s]?location)\b/i,
                /\bcurrent[_\-\s]?city\b/i
            ],
            confidence: 0.93,
            category: 'location'
        },

        preferred_location: {
            patterns: [
                /\b(preferred[_\-\s]?location|desired[_\-\s]?location)\b/i,
                /\b(target[_\-\s]?location|where[_\-\s]?would[_\-\s]?you[_\-\s]?like[_\-\s]?to[_\-\s]?work)\b/i,
                /\bwilling[_\-\s]?to[_\-\s]?relocate[_\-\s]?to\b/i
            ],
            confidence: 0.92,
            category: 'preferences'
        },

        // ==================== BATCH 2: WORK EXPERIENCE EXTENDED ====================
        current_company: {
            patterns: [
                /\b(current[_\-\s]?company|present[_\-\s]?company|current[_\-\s]?employer)\b/i,
                /\b(working[_\-\s]?at|employed[_\-\s]?by|work[_\-\s]?for)\b/i,
                /\bcurrent[_\-\s]?organization\b/i
            ],
            confidence: 0.96,
            category: 'work',
            negative: /\b(previous[_\-\s]?company|past[_\-\s]?company|former[_\-\s]?employer)\b/i
        },

        current_title: {
            patterns: [
                /\b(current[_\-\s]?title|current[_\-\s]?position|current[_\-\s]?role)\b/i,
                /\b(present[_\-\s]?title|present[_\-\s]?position)\b/i,
                /\byour[_\-\s]?current[_\-\s]?job\b/i
            ],
            confidence: 0.96,
            category: 'work',
            negative: /\b(previous[_\-\s]?title|past[_\-\s]?title|former[_\-\s]?position)\b/i
        },

        job_current: {
            patterns: [
                /\b(currently[_\-\s]?working[_\-\s]?here|current[_\-\s]?job)\b/i,
                /\b(still[_\-\s]?working|present[_\-\s]?position)\b/i,
                /\b(is[_\-\s]?this[_\-\s]?current|work[_\-\s]?here[_\-\s]?now)\b/i,
                /\bpresent$/i
            ],
            confidence: 0.94,
            category: 'work'
        },

        years_experience: {
            patterns: [
                /\b(years[_\-\s]?of[_\-\s]?experience|total[_\-\s]?experience)\b/i,
                /\b(years[_\-\s]?experience|experience[_\-\s]?years)\b/i,
                /\b(work[_\-\s]?experience|professional[_\-\s]?experience)\b/i,
                /\bhow[_\-\s]?many[_\-\s]?years\b/i
            ],
            confidence: 0.95,
            category: 'work'
        },

        job_type_preference: {
            patterns: [
                /\b(job[_\-\s]?type|employment[_\-\s]?type|work[_\-\s]?type)\b/i,
                /\b(full[_\-\s]?time|part[_\-\s]?time|contract|freelance)\b/i,
                /\btype[_\-\s]?of[_\-\s]?employment\b/i
            ],
            confidence: 0.93,
            category: 'preferences'
        },

        work_style: {
            patterns: [
                /\b(work[_\-\s]?style|working[_\-\s]?style|work[_\-\s]?mode)\b/i,
                /\b(remote|hybrid|onsite|in[_\-\s]?office)\b/i,
                /\bhow[_\-\s]?do[_\-\s]?you[_\-\s]?prefer[_\-\s]?to[_\-\s]?work\b/i
            ],
            confidence: 0.92,
            category: 'preferences'
        },

        department: {
            patterns: [
                /\b(department|dept|division|team)\b/i,
                /\b(functional[_\-\s]?area|business[_\-\s]?unit)\b/i,
                /\babteilung\b/i  // DE
            ],
            confidence: 0.91,
            category: 'work'
        },

        industry: {
            patterns: [
                /\b(industry|sector|field)\b/i,
                /\b(industry[_\-\s]?sector|business[_\-\s]?sector)\b/i,
                /\b(domain|vertical)\b/i
            ],
            confidence: 0.90,
            category: 'work'
        },

        employee_id: {
            patterns: [
                /\b(employee[_\-\s]?id|employee[_\-\s]?number|staff[_\-\s]?id)\b/i,
                /\b(emp[_\-\s]?id|personnel[_\-\s]?number)\b/i,
                /\bmitarbeiter[_\-\s]?nummer\b/i  // DE
            ],
            confidence: 0.96,
            category: 'work'
        },

        // ==================== BATCH 3: EDUCATION EXTENDED ====================
        school_name: {
            patterns: [
                /\b(school[_\-\s]?name|high[_\-\s]?school|secondary[_\-\s]?school)\b/i,
                /\b(name[_\-\s]?of[_\-\s]?school|educational[_\-\s]?institution)\b/i,
                /\bschule\b/i  // DE
            ],
            confidence: 0.95,
            category: 'education'
        },

        degree: {
            patterns: [
                /\b(degree|degree[_\-\s]?level|highest[_\-\s]?degree)\b/i,
                /\b(qualification|educational[_\-\s]?level)\b/i,
                /\b(bachelor|master|phd|associate|doctorate)\b/i,
                /\babschluss\b/i  // DE
            ],
            confidence: 0.94,
            category: 'education'
        },

        education_level: {
            patterns: [
                /\b(education[_\-\s]?level|level[_\-\s]?of[_\-\s]?education)\b/i,
                /\b(educational[_\-\s]?attainment|highest[_\-\s]?education)\b/i,
                /\b(bildungsniveau|nivel[_\-\s]?educativo)\b/i  // DE, ES
            ],
            confidence: 0.94,
            category: 'education'
        },

        education_current: {
            patterns: [
                /\b(currently[_\-\s]?enrolled|currently[_\-\s]?studying)\b/i,
                /\b(still[_\-\s]?in[_\-\s]?school|current[_\-\s]?student)\b/i,
                /\bpresently[_\-\s]?attending\b/i
            ],
            confidence: 0.95,
            category: 'education'
        },

        major: {
            patterns: [
                /\b(major|field[_\-\s]?of[_\-\s]?study|specialization)\b/i,
                /\b(concentration|area[_\-\s]?of[_\-\s]?study|discipline)\b/i,
                /\b(subject|course[_\-\s]?of[_\-\s]?study)\b/i,
                /\bstudienfach\b/i  // DE
            ],
            confidence: 0.94,
            category: 'education'
        },

        minor: {
            patterns: [
                /\b(minor|second[_\-\s]?major|secondary[_\-\s]?field)\b/i,
                /\barea[_\-\s]?of[_\-\s]?minor\b/i
            ],
            confidence: 0.95,
            category: 'education'
        },

        honors: {
            patterns: [
                /\b(honors|honours|awards|distinctions)\b/i,
                /\b(academic[_\-\s]?honors|dean'?s[_\-\s]?list)\b/i,
                /\b(cum[_\-\s]?laude|magna[_\-\s]?cum[_\-\s]?laude|summa[_\-\s]?cum[_\-\s]?laude)\b/i,
                /\b(auszeichnungen|reconocimientos)\b/i  // DE, ES
            ],
            confidence: 0.96,
            category: 'education'
        },

        publications: {
            patterns: [
                /\b(publications|published[_\-\s]?papers|research[_\-\s]?papers)\b/i,
                /\b(scholarly[_\-\s]?articles|journal[_\-\s]?articles)\b/i,
                /\b(research[_\-\s]?publications|academic[_\-\s]?publications)\b/i,
                /\bpublikationen\b/i  // DE
            ],
            confidence: 0.97,
            category: 'education'
        },

        thesis_title: {
            patterns: [
                /\b(thesis[_\-\s]?title|dissertation[_\-\s]?title)\b/i,
                /\b(thesis|dissertation|capstone[_\-\s]?project)\b/i,
                /\b(research[_\-\s]?topic|thesis[_\-\s]?topic)\b/i
            ],
            confidence: 0.97,
            category: 'education'
        },

        advisor_name: {
            patterns: [
                /\b(advisor[_\-\s]?name|thesis[_\-\s]?advisor|faculty[_\-\s]?advisor)\b/i,
                /\b(supervisor|mentor|adviser)\b/i,
                /\b(dissertation[_\-\s]?advisor|research[_\-\s]?advisor)\b/i
            ],
            confidence: 0.96,
            category: 'education'
        },

        graduation_date: {
            patterns: [
                /\b(graduation[_\-\s]?date|date[_\-\s]?of[_\-\s]?graduation)\b/i,
                /\b(completion[_\-\s]?date|grad[_\-\s]?date|graduated)\b/i,
                /\b(year[_\-\s]?graduated|when[_\-\s]?did[_\-\s]?you[_\-\s]?graduate)\b/i
            ],
            confidence: 0.96,
            category: 'education'
        },

        // ==================== BATCH 4: SKILLS & QUALIFICATIONS ====================
        skills: {
            patterns: [
                /\b(skills|core[_\-\s]?skills|key[_\-\s]?skills)\b/i,
                /\b(competencies|abilities|capabilities)\b/i,
                /\b(technical[_\-\s]?skills|professional[_\-\s]?skills)\b/i,
                /\b(fähigkeiten|habilidades|compétences)\b/i  // DE, ES, FR
            ],
            confidence: 0.93,
            category: 'skills',
            negative: /\b(skill[_\-\s]?(requirement|needed|required|gap))\b/i
        },

        technical_skills: {
            patterns: [
                /\b(technical[_\-\s]?skills|tech[_\-\s]?skills|technology[_\-\s]?skills)\b/i,
                /\b(programming[_\-\s]?languages|coding[_\-\s]?skills)\b/i,
                /\b(software[_\-\s]?proficiency|tools[_\-\s]?\\&[_\-\s]?technologies)\b/i
            ],
            confidence: 0.95,
            category: 'skills'
        },

        certifications: {
            patterns: [
                /\b(certifications?|certificates?|professional[_\-\s]?certifications?)\b/i,
                /\b(credentials|accreditations|licenses)\b/i,
                /\b(certified|cert|certification[_\-\s]?name)\b/i,
                /\b(zertifizierungen|certificaciones)\b/i  // DE, ES
            ],
            confidence: 0.96,
            category: 'skills'
        },

        licenses: {
            patterns: [
                /\b(licenses?|licensing|professional[_\-\s]?licenses?)\b/i,
                /\b(license[_\-\s]?number|license[_\-\s]?type)\b/i,
                /\b(driver'?s[_\-\s]?license|driving[_\-\s]?license)\b/i
            ],
            confidence: 0.96,
            category: 'skills'
        },

        languages: {
            patterns: [
                /\b(languages?|language[_\-\s]?skills|language[_\-\s]?proficiency)\b/i,
                /\b(spoken[_\-\s]?languages?|foreign[_\-\s]?languages?)\b/i,
                /\b(multilingual|bilingual)\b/i,
                /\b(sprachen|idiomas)\b/i  // DE, ES
            ],
            confidence: 0.95,
            category: 'skills'
        },

        language_proficiency: {
            patterns: [
                /\b(language[_\-\s]?proficiency|proficiency[_\-\s]?level)\b/i,
                /\b(fluency|fluent[_\-\s]?in|language[_\-\s]?level)\b/i,
                /\b(native|conversational|basic|intermediate|advanced)\b/i
            ],
            confidence: 0.94,
            category: 'skills'
        },

        skill_level: {
            patterns: [
                /\b(skill[_\-\s]?level|proficiency[_\-\s]?level|expertise[_\-\s]?level)\b/i,
                /\b(beginner|intermediate|advanced|expert)\b/i,
                /\b(years[_\-\s]?of[_\-\s]?experience[_\-\s]?with)\b/i
            ],
            confidence: 0.92,
            category: 'skills'
        },

        patents: {
            patterns: [
                /\b(patents?|patent[_\-\s]?applications?)\b/i,
                /\b(intellectual[_\-\s]?property|ip[_\-\s]?portfolio)\b/i,
                /\b(patent[_\-\s]?number|patent[_\-\s]?title)\b/i
            ],
            confidence: 0.98,
            category: 'skills'
        },

        // ==================== BATCH 5: REFERENCES ====================
        reference_name: {
            patterns: [
                /\b(reference[_\-\s]?name|referee[_\-\s]?name)\b/i,
                /\b(reference[_\-\s]?contact|professional[_\-\s]?reference)\b/i,
                /\b(name[_\-\s]?of[_\-\s]?reference|reference[_\-\s]?person)\b/i
            ],
            confidence: 0.97,
            category: 'references'
        },

        reference_email: {
            patterns: [
                /\b(reference[_\-\s]?email|referee[_\-\s]?email)\b/i,
                /\b(reference[_\-\s]?contact[_\-\s]?email)\b/i
            ],
            confidence: 0.98,
            category: 'references'
        },

        reference_phone: {
            patterns: [
                /\b(reference[_\-\s]?phone|referee[_\-\s]?phone)\b/i,
                /\b(reference[_\-\s]?contact[_\-\s]?number|reference[_\-\s]?tel)\b/i
            ],
            confidence: 0.98,
            category: 'references'
        },

        reference_relationship: {
            patterns: [
                /\b(reference[_\-\s]?relationship|relationship[_\-\s]?to[_\-\s]?reference)\b/i,
                /\b(how[_\-\s]?do[_\-\s]?you[_\-\s]?know|referee[_\-\s]?relation)\b/i,
                /\b(supervisor|colleague|manager|professor)\b/i
            ],
            confidence: 0.96,
            category: 'references'
        },

        // ==================== BATCH 6: EEO & LEGAL (Continued) ====================
        ethnicity: {
            patterns: [
                /\b(ethnicity|ethnic[_\-\s]?group|ethnic[_\-\s]?origin)\b/i,
                /\b(cultural[_\-\s]?background|heritage)\b/i
            ],
            confidence: 0.98,
            category: 'demographics'
        },

        schedule_a: {
            patterns: [
                /\b(schedule[_\-\s]?a|section[_\-\s]?503)\b/i,
                /\b(adaptive[_\-\s]?hiring|targeted[_\-\s]?disability)\b/i
            ],
            confidence: 0.99,
            category: 'demographics'
        },

        visa_status: {
            patterns: [
                /\b(visa[_\-\s]?status|immigration[_\-\s]?status)\b/i,
                /\b(current[_\-\s]?visa|visa[_\-\s]?type)\b/i,
                /\b(green[_\-\s]?card|permanent[_\-\s]?resident)\b/i
            ],
            confidence: 0.98,
            category: 'legal'
        },

        clearance_active: {
            patterns: [
                /\b(active[_\-\s]?clearance|clearance[_\-\s]?active)\b/i,
                /\b(current[_\-\s]?clearance[_\-\s]?status)\b/i,
                /\b(is[_\-\s]?your[_\-\s]?clearance[_\-\s]?active)\b/i
            ],
            confidence: 0.98,
            category: 'legal'
        },

        background_check: {
            patterns: [
                /\b(background[_\-\s]?check|background[_\-\s]?screening)\b/i,
                /\b(consent[_\-\s]?to[_\-\s]?background[_\-\s]?check)\b/i,
                /\b(authorize[_\-\s]?background[_\-\s]?check)\b/i
            ],
            confidence: 0.97,
            category: 'legal'
        },

        // ==================== BATCH 7: PREFERENCES & AVAILABILITY ====================
        start_date: {
            patterns: [
                /\b(start[_\-\s]?date|available[_\-\s]?to[_\-\s]?start|availability[_\-\s]?date)\b/i,
                /\b(when[_\-\s]?can[_\-\s]?you[_\-\s]?start|earliest[_\-\s]?start)\b/i,
                /\b(join[_\-\s]?date|commencement[_\-\s]?date)\b/i
            ],
            confidence: 0.94,
            category: 'preferences'
        },

        availability: {
            patterns: [
                /\b(availability|available|when[_\-\s]?available)\b/i,
                /\b(immediate[_\-\s]?availability|available[_\-\s]?immediately)\b/i,
                /\b(how[_\-\s]?soon[_\-\s]?available)\b/i
            ],
            confidence: 0.92,
            category: 'preferences',
            negative: /start[_\-\s]?date/i
        },

        relocation: {
            patterns: [
                /\b(relocation|relocate|willing[_\-\s]?to[_\-\s]?relocate)\b/i,
                /\b(open[_\-\s]?to[_\-\s]?relocation|relocation[_\-\s]?preference)\b/i,
                /\b(move[_\-\s]?to|willing[_\-\s]?to[_\-\s]?move)\b/i
            ],
            confidence: 0.96,
            category: 'preferences'
        },

        remote_preference: {
            patterns: [
                /\b(remote[_\-\s]?preference|work[_\-\s]?preference)\b/i,
                /\b(remote|hybrid|on[_\-\s]?site|office[_\-\s]?based)\b/i,
                /\b(work[_\-\s]?from[_\-\s]?home|wfh|telecommute)\b/i,
                /\b(prefer[_\-\s]?to[_\-\s]?work[_\-\s]?(remote|office))\b/i
            ],
            confidence: 0.95,
            category: 'preferences'
        },

        shift_preference: {
            patterns: [
                /\b(shift[_\-\s]?preference|shift[_\-\s]?availability)\b/i,
                /\b(preferred[_\-\s]?shift|work[_\-\s]?shift)\b/i,
                /\b(day[_\-\s]?shift|night[_\-\s]?shift|evening[_\-\s]?shift)\b/i
            ],
            confidence: 0.95,
            category: 'preferences'
        },

        travel_percentage: {
            patterns: [
                /\b(travel[_\-\s]?percentage|willing[_\-\s]?to[_\-\s]?travel)\b/i,
                /\b(travel[_\-\s]?requirements?|ability[_\-\s]?to[_\-\s]?travel)\b/i,
                /\b(%[_\-\s]?travel|percent[_\-\s]?travel)\b/i
            ],
            confidence: 0.96,
            category: 'preferences'
        },

        salary_minimum: {
            patterns: [
                /\b(minimum[_\-\s]?salary|salary[_\-\s]?minimum)\b/i,
                /\b(lowest[_\-\s]?acceptable[_\-\s]?salary|minimum[_\-\s]?compensation)\b/i
            ],
            confidence: 0.97,
            category: 'compensation'
        },

        salary_currency: {
            patterns: [
                /\b(salary[_\-\s]?currency|currency)\b/i,
                /\b(usd|eur|gbp|inr|cad)\b/i,
                /\b(payment[_\-\s]?currency)\b/i
            ],
            confidence: 0.94,
            category: 'compensation'
        },

        bonus_expected: {
            patterns: [
                /\b(bonus[_\-\s]?expectation|expected[_\-\s]?bonus)\b/i,
                /\b(annual[_\-\s]?bonus|performance[_\-\s]?bonus)\b/i,
                /\b(target[_\-\s]?bonus)\b/i
            ],
            confidence: 0.96,
            category: 'compensation'
        },

        equity_expected: {
            patterns: [
                /\b(equity[_\-\s]?expectation|stock[_\-\s]?options)\b/i,
                /\b(rsu|restricted[_\-\s]?stock[_\-\s]?units)\b/i,
                /\b(equity[_\-\s]?compensation|stock[_\-\s]?grant)\b/i
            ],
            confidence: 0.97,
            category: 'compensation'
        },

        // ==================== BATCH 8: SOCIAL & ONLINE ====================
        instagram_url: {
            patterns: [
                /\b(instagram|ig)\b/i,
                /\binstagram[_\-\s]?(url|handle|profile|link)\b/i,
                /\binsta[_\-\s]?handle\b/i,
                /instagram\.com/i
            ],
            confidence: 0.98,
            category: 'social'
        },

        facebook_url: {
            patterns: [
                /\bfacebook\b/i,
                /\bfacebook[_\-\s]?(url|profile|page|link)\b/i,
                /\bfb[_\-\s]?(url|profile)\b/i,
                /facebook\.com/i
            ],
            confidence: 0.98,
            category: 'social'
        },

        youtube_url: {
            patterns: [
                /\byoutube\b/i,
                /\byoutube[_\-\s]?(channel|url|link)\b/i,
                /\byt[_\-\s]?channel\b/i,
                /youtube\.com/i
            ],
            confidence: 0.98,
            category: 'social'
        },

        skype_url: {
            patterns: [
                /\bskype\b/i,
                /\bskype[_\-\s]?(id|username|handle)\b/i,
                /\bskype[_\-\s]?name\b/i
            ],
            confidence: 0.98,
            category: 'social'
        },

        google_scholar_url: {
            patterns: [
                /\bgoogle[_\-\s]?scholar\b/i,
                /\bscholar[_\-\s]?google\b/i,
                /\bscholar[_\-\s]?(profile|url|link)\b/i,
                /scholar\.google/i
            ],
            confidence: 0.99,
            category: 'social'
        },

        other_url: {
            patterns: [
                /\b(other[_\-\s]?url|additional[_\-\s]?url|website)\b/i,
                /\b(other[_\-\s]?link|additional[_\-\s]?link)\b/i,
                /\b(online[_\-\s]?presence|web[_\-\s]?presence)\b/i
            ],
            confidence: 0.88,
            category: 'social'
        },

        // ==================== BATCH 9: BEHAVIORAL & META ====================
        strengths: {
            patterns: [
                /\b(strengths?|strong[_\-\s]?points?|what[_\-\s]?are[_\-\s]?your[_\-\s]?strengths?)\b/i,
                /\b(greatest[_\-\s]?strengths?|top[_\-\s]?strengths?)\b/i,
                /\b(your[_\-\s]?best[_\-\s]?qualities)\b/i
            ],
            confidence: 0.95,
            category: 'behavioral'
        },

        weaknesses: {
            patterns: [
                /\b(weaknesses?|weak[_\-\s]?points?|areas[_\-\s]?for[_\-\s]?improvement)\b/i,
                /\b(greatest[_\-\s]?weaknesses?|what[_\-\s]?are[_\-\s]?your[_\-\s]?weaknesses?)\b/i,
                /\b(development[_\-\s]?areas)\b/i
            ],
            confidence: 0.95,
            category: 'behavioral'
        },

        challenge: {
            patterns: [
                /\b(challenge|biggest[_\-\s]?challenge|difficult[_\-\s]?situation)\b/i,
                /\b(overcome[_\-\s]?a[_\-\s]?challenge|describe[_\-\s]?a[_\-\s]?challenge)\b/i,
                /\b(toughest[_\-\s]?challenge|hardest[_\-\s]?challenge)\b/i
            ],
            confidence: 0.94,
            category: 'behavioral'
        },

        career_goals: {
            patterns: [
                /\b(career[_\-\s]?goals?|professional[_\-\s]?goals?)\b/i,
                /\b(where[_\-\s]?do[_\-\s]?you[_\-\s]?see[_\-\s]?yourself|future[_\-\s]?plans?)\b/i,
                /\b(long[_\-\s]?term[_\-\s]?goals?|aspirations?)\b/i,
                /\b(career[_\-\s]?aspirations?|what[_\-\s]?are[_\-\s]?your[_\-\s]?goals?)\b/i
            ],
            confidence: 0.94,
            category: 'behavioral'
        },

        interest_areas: {
            patterns: [
                /\b(interest[_\-\s]?areas?|areas?[_\-\s]?of[_\-\s]?interest)\b/i,
                /\b(research[_\-\s]?interests?|professional[_\-\s]?interests?)\b/i,
                /\b(what[_\-\s]?interests?[_\-\s]?you)\b/i
            ],
            confidence: 0.92,
            category: 'behavioral'
        },

        desired_role: {
            patterns: [
                /\b(desired[_\-\s]?role|target[_\-\s]?role|role[_\-\s]?seeking)\b/i,
                /\b(what[_\-\s]?role[_\-\s]?are[_\-\s]?you[_\-\s]?looking[_\-\s]?for)\b/i,
                /\b(ideal[_\-\s]?position|dream[_\-\s]?job)\b/i
            ],
            confidence: 0.93,
            category: 'behavioral'
        },

        referral_name: {
            patterns: [
                /\b(referral[_\-\s]?name|referred[_\-\s]?by|who[_\-\s]?referred[_\-\s]?you)\b/i,
                /\b(employee[_\-\s]?referral[_\-\s]?name|reference[_\-\s]?person)\b/i,
                /\b(name[_\-\s]?of[_\-\s]?referrer)\b/i
            ],
            confidence: 0.96,
            category: 'misc'
        },

        referrer_name: {
            patterns: [
                /\b(referrer[_\-\s]?name|referring[_\-\s]?employee)\b/i,
                /\b(name[_\-\s]?of[_\-\s]?person[_\-\s]?who[_\-\s]?referred)\b/i
            ],
            confidence: 0.96,
            category: 'misc'
        },

        referrer_email: {
            patterns: [
                /\b(referrer[_\-\s]?email|referring[_\-\s]?employee[_\-\s]?email)\b/i,
                /\b(email[_\-\s]?of[_\-\s]?referrer)\b/i
            ],
            confidence: 0.97,
            category: 'misc'
        },

        referral_code: {
            patterns: [
                /\b(referral[_\-\s]?code|promo[_\-\s]?code|invitation[_\-\s]?code)\b/i,
                /\b(employee[_\-\s]?code|reference[_\-\s]?code)\b/i,
                /\b(empfehlungscode)\b/i  // DE
            ],
            confidence: 0.97,
            category: 'misc'
        },

        resume_filename: {
            patterns: [
                /\b(resume[_\-\s]?file|cv[_\-\s]?file|resume[_\-\s]?filename)\b/i,
                /\b(upload[_\-\s]?resume|attach[_\-\s]?resume)\b/i,
                /\b(curriculum[_\-\s]?vitae|resume[_\-\/\s]cv)\b/i
            ],
            confidence: 0.94,
            category: 'misc'
        },

        agreement: {
            patterns: [
                /\b(agree|agreement|i[_\-\s]?agree|consent)\b/i,
                /\b(accept[_\-\s]?terms|terms[_\-\s]?and[_\-\s]?conditions)\b/i,
                /\b(authorize|authorization|acknowledge)\b/i,
                /\b(einverstanden|acepto)\b/i  // DE, ES
            ],
            confidence: 0.90,
            category: 'misc'
        },

        additional_info: {
            patterns: [
                /\b(additional[_\-\s]?information|additional[_\-\s]?details)\b/i,
                /\b(anything[_\-\s]?else|other[_\-\s]?information)\b/i,
                /\b(supplemental[_\-\s]?information|extra[_\-\s]?information)\b/i
            ],
            confidence: 0.88,
            category: 'misc'
        },

        notes: {
            patterns: [
                /\b(notes?|additional[_\-\s]?notes?|comments?)\b/i,
                /\b(remarks?|additional[_\-\s]?comments?)\b/i,
                /\b(anmerkungen|notas)\b/i  // DE, ES
            ],
            confidence: 0.86,
            category: 'misc'
        },

        // ==================== BATCH 10: REMAINING FIELDS ====================
        work_type: {
            patterns: [
                /\b(work[_\-\s]?type|employment[_\-\s]?type)\b/i,
                /\b(full[_\-\s]?time|part[_\-\s]?time|contract|temporary)\b/i,
                /\b(permanent|freelance|consultant)\b/i
            ],
            confidence: 0.93,
            category: 'preferences'
        },

        timezone: {
            patterns: [
                /\b(timezone|time[_\-\s]?zone|tz)\b/i,
                /\b(your[_\-\s]?timezone|what[_\-\s]?timezone)\b/i,
                /\b(utc|gmt|est|pst|cst)\b/i
            ],
            confidence: 0.95,
            category: 'location'
        },

        resume: {
            patterns: [
                /\b(resume|curriculum[_\-\s]?vitae|cv)\b/i,
                /\b(upload[_\-\s]?(your[_\-\s]?)?(resume|cv)|attach[_\-\s]?(your[_\-\s]?)?(resume|cv))\b/i,
                /\b(lebenslauf)\b/i  // DE
            ],
            confidence: 0.95,
            category: 'misc',
            negative: /filename|file[_\-\s]?name/i
        }
    };

    // ============================================================================
    // PRIORITY RULES
    // High-value fields checked first for faster matching
    // ============================================================================

    static PRIORITY_RULES = {
        compensation: {
            test: /\b(salary|ctc|remuneration|compensation|pay)\b/i,
            expected: /\b(expect|desire|want|prefer|target|requirement)\b/i,
            current: /\b(current|present|existing|annual)\b/i
        },
        date: {
            hasDate: /\b(date|month|year)\b/i,
            isStart: /\b(start|from|begin|join)\b/i,
            isEnd: /\b(end|to|left|graduat|complet|finish)\b/i,
            eduContext: /\b(education|school|degree|graduat|universit|college|institution)\b/i,
            workContext: /\b(work|job|employ|company|position|role)\b/i
        }
    };

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    constructor(options = {}) {
        this.debug = options.debug ?? HeuristicEngine.DEBUG;
        this.metrics = {
            totalClassifications: 0,
            matchesByCategory: {},
            averageConfidence: 0,
            lastClassificationTime: 0
        };
    }

    // ============================================================================
    // PUBLIC API
    // ============================================================================

    /**
     * Map HTML5 autocomplete attribute to FieldType
     * @param {string} autocomplete - Autocomplete attribute value
     * @returns {string|null} Matched field type or null
     */
    _mapAutocompleteToFieldType(autocomplete) {
        const mapping = {
            // Personal
            'name': 'full_name',
            'given-name': 'first_name',
            'additional-name': 'middle_name',
            'family-name': 'last_name',
            'nickname': 'preferred_name',
            'email': 'email',
            'tel': 'phone',
            'tel-country-code': 'phone',
            'tel-national': 'phone',
            'tel-local': 'phone',
            'bday': 'date_of_birth',
            'bday-day': 'date_of_birth',
            'bday-month': 'date_of_birth',
            'bday-year': 'date_of_birth',
            'sex': 'gender',
            'photo': 'profile_photo',

            // Location
            'street-address': 'address_line_1',
            'address-line1': 'address_line_1',
            'address-line2': 'address_line_2',
            'address-level1': 'state',
            'address-level2': 'city',
            'postal-code': 'zip_code',
            'country': 'country',
            'country-name': 'country',

            // Work
            'organization': 'company_name',
            'organization-title': 'job_title',

            // URLs
            'url': 'website_url',
            'home-url': 'website_url',
            'work-url': 'website_url',
            'impp': 'other_url'
        };

        const normalized = autocomplete.toLowerCase().trim();
        return mapping[normalized] || null;
    }

    /**
     * Calculate dynamic confidence score with bonuses/penalties
     * @param {number} baseConfidence - Base confidence from pattern
     * @param {Object} matchInfo - Information about the match
     * @returns {number} Adjusted confidence (0.60-0.99)
     */
    _calculateConfidence(baseConfidence, matchInfo = {}) {
        let confidence = baseConfidence;

        // Bonus: Autocomplete attribute present
        if (matchInfo.hasAutocomplete) {
            confidence += 0.05;
        }

        // Bonus: Multiple attributes matched (name + id + placeholder)
        if (matchInfo.multiAttributeMatch) {
            confidence += 0.03;
        }

        // Bonus: Context validation (parent/sibling confirms)
        if (matchInfo.contextConfirmed) {
            confidence += 0.02;
        }

        // Penalty: Negative pattern triggered
        if (matchInfo.hasNegativeMatch) {
            confidence -= 0.10;
        }

        // Ensure confidence stays within bounds
        return Math.min(0.99, Math.max(0.60, confidence));
    }

    /**
     * Classify a form field using heuristic patterns
     * @param {Object} field - Field object with name, id, placeholder, etc.
     * @param {Object} context - Optional context (parentContext, siblingContext)
     * @returns {Object|null} { label, confidence, source, category } or null if no match
     */
    classify(field, context = {}) {
        const startTime = performance.now();

        // Priority 0: Autocomplete attribute (highest signal)
        if (field.autocomplete && field.autocomplete !== 'off' && field.autocomplete !== 'on') {
            const mappedType = this._mapAutocompleteToFieldType(field.autocomplete);
            if (mappedType) {
                const result = this._createResult(mappedType, 0.99, 'autocomplete');
                this._recordMetrics(result, startTime, 'autocomplete');
                return result;
            }
        }

        // Build searchable text from field attributes
        const text = this._buildSearchText(field);
        const fullContext = this._buildFullContext(text, context, field);

        // Priority 1: Compensation fields (high-value)
        const compensationMatch = this._matchCompensation(text);
        if (compensationMatch) {
            this._recordMetrics(compensationMatch, startTime, 'compensation');
            return compensationMatch;
        }

        // Priority 2: Date fields (need context disambiguation)
        const dateMatch = this._matchDateField(text, fullContext);
        if (dateMatch) {
            this._recordMetrics(dateMatch, startTime, 'date');
            return dateMatch;
        }

        // Priority 3: Pattern-based matching
        const patternMatch = this._matchPatterns(text, fullContext, field);
        if (patternMatch) {
            this._recordMetrics(patternMatch, startTime, patternMatch.category);
            return patternMatch;
        }

        // No match found
        this._recordMetrics(null, startTime, null);
        return null;
    }

    /**
     * Get engine statistics
     * @returns {Object} Metrics object
     */
    getMetrics() {
        return { ...this.metrics };
    }

    /**
     * Reset metrics
     */
    resetMetrics() {
        this.metrics = {
            totalClassifications: 0,
            matchesByCategory: {},
            averageConfidence: 0,
            lastClassificationTime: 0
        };
    }

    /**
     * Get all supported field types
     * @returns {string[]} Array of field type labels
     */
    static getSupportedTypes() {
        return Object.keys(HeuristicEngine.PATTERNS);
    }

    /**
     * Get patterns by category
     * @param {string} category - Category name
     * @returns {Object} Patterns in that category
     */
    static getPatternsByCategory(category) {
        const result = {};
        for (const [label, config] of Object.entries(HeuristicEngine.PATTERNS)) {
            if (config.category === category) {
                result[label] = config;
            }
        }
        return result;
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    /**
     * Build searchable text from field attributes
     */
    _buildSearchText(field) {
        const parts = [
            field.label || '',
            field.name || '',
            field.id || '',
            field.placeholder || '',
            field.ariaLabel || '',
            field.autocomplete || ''
        ];
        return parts.join(' ').toLowerCase().trim();
    }

    /**
     * Build full context including parent/sibling context
     */
    _buildFullContext(text, context, field) {
        return [
            text,
            context.parentContext || field.parentContext || '',
            context.siblingContext || field.siblingContext || ''
        ].join(' ').toLowerCase();
    }

    /**
     * Match compensation fields (Priority 1)
     */
    _matchCompensation(text) {
        const rules = HeuristicEngine.PRIORITY_RULES.compensation;

        if (!rules.test.test(text)) return null;

        if (rules.expected.test(text)) {
            return this._createResult('salary_expected', 0.99, 'compensation');
        }
        if (rules.current.test(text)) {
            return this._createResult('salary_current', 0.99, 'compensation');
        }

        return null;
    }

    /**
     * Match date fields with context disambiguation (Priority 2)
     */
    _matchDateField(text, fullContext) {
        const rules = HeuristicEngine.PRIORITY_RULES.date;

        if (!rules.hasDate.test(text)) return null;

        const isStart = rules.isStart.test(text);
        const isEnd = rules.isEnd.test(text);
        const isEduContext = rules.eduContext.test(fullContext);
        const isWorkContext = rules.workContext.test(fullContext);

        if (isStart && isEduContext) {
            return this._createResult('education_start_date', 0.93, 'education');
        }
        if (isEnd && isEduContext) {
            return this._createResult('education_end_date', 0.93, 'education');
        }
        if (isStart && isWorkContext) {
            return this._createResult('job_start_date', 0.93, 'work');
        }
        if (isEnd && isWorkContext) {
            return this._createResult('job_end_date', 0.93, 'work');
        }

        // Default fallback for standalone date fields
        if (isStart) return this._createResult('job_start_date', 0.88, 'work');
        if (isEnd) return this._createResult('job_end_date', 0.88, 'work');

        return null;
    }

    /**
     * Match against pattern definitions (Priority 3)
     */
    _matchPatterns(text, fullContext, field = {}) {
        for (const [label, config] of Object.entries(HeuristicEngine.PATTERNS)) {
            // Check if any positive pattern matches
            const matched = config.patterns.some(pattern => pattern.test(text));

            if (matched) {
                // Check negative patterns (exclusions)
                if (config.negative && config.negative.test(fullContext)) {
                    continue; // Skip this match - negative pattern triggered
                }

                // Track match quality signals for dynamic confidence
                const matchInfo = {
                    hasAutocomplete: !!(field.autocomplete && field.autocomplete !== 'off'),
                    multiAttributeMatch: !!(field.name && field.id),  // Both name and id present
                    contextConfirmed: false,  // Could be enhanced with context validation
                    hasNegativeMatch: false  // Already filtered above
                };

                // Calculate dynamic confidence
                const adjustedConfidence = this._calculateConfidence(config.confidence, matchInfo);

                return this._createResult(label, adjustedConfidence, config.category);
            }
        }
        return null;
    }

    /**
     * Resolve field alias to canonical field type
     * @param {string} label - Predicted field type label
     * @returns {string} Canonical field type (or original if no alias)
     */
    _resolveAlias(label) {
        // Check if this label has a canonical form in our alias mapping
        const canonical = HeuristicEngine.FIELD_ALIASES[label];
        if (canonical && HeuristicEngine.PATTERNS[canonical]) {
            if (HeuristicEngine.DEBUG) {
                console.log(`[HeuristicEngine] Resolved alias: ${label} → ${canonical}`);
            }
            return canonical;
        }
        return label; // No alias, return original
    }

    /**
     * Create standardized result object
     */
    _createResult(label, confidence, category) {
        // Resolve any aliases to canonical field types
        const resolvedLabel = this._resolveAlias(label);

        return {
            label: resolvedLabel,
            confidence,
            category,
            source: 'heuristic_engine',
            version: HeuristicEngine.VERSION
        };
    }

    /**
     * Record metrics for analytics
     */
    _recordMetrics(result, startTime, category) {
        const elapsed = performance.now() - startTime;

        this.metrics.totalClassifications++;
        this.metrics.lastClassificationTime = elapsed;

        if (result) {
            this.metrics.matchesByCategory[category] = (this.metrics.matchesByCategory[category] || 0) + 1;

            // Running average of confidence
            const prevAvg = this.metrics.averageConfidence;
            const n = this.metrics.totalClassifications;
            this.metrics.averageConfidence = prevAvg + (result.confidence - prevAvg) / n;
        }

        if (this.debug) {
            console.log(`[HeuristicEngine] Classification: ${result?.label || 'NO_MATCH'} (${elapsed.toFixed(2)}ms)`);
        }
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof window !== 'undefined') {
    window.HeuristicEngine = HeuristicEngine;
    console.log('[Dependencies] HeuristicEngine V2.0 loaded into window');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = HeuristicEngine;
}
