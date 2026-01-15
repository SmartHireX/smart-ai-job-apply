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

    static VERSION = '2.0.0';
    static DEBUG = false;  // Toggle for verbose logging

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
            category: 'personal'
        },

        // ======================== SOCIAL & PORTFOLIO ========================
        linkedin: {
            patterns: [
                /\blinkedin\b/i,
                /\blinked[\-_\s]?in\b/i,
                /\blinkedin[_\-\s]?(url|profile|link)\b/i,
                /linkedin\.com/i
            ],
            confidence: 0.99,
            category: 'social'
        },

        github: {
            patterns: [
                /\bgithub\b/i,
                /\bgit[\-_\s]?hub\b/i,
                /\bgithub[_\-\s]?(url|profile|link|username)\b/i,
                /github\.com/i
            ],
            confidence: 0.99,
            category: 'social'
        },

        portfolio: {
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

        website: {
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
        address: {
            patterns: [
                /\b(address|street[_\-\s]?address|mailing[_\-\s]?address)\b/i,
                /\b(home[_\-\s]?address|residential[_\-\s]?address)\b/i,
                /\b(current[_\-\s]?address|permanent[_\-\s]?address)\b/i,
                /\b(address[_\-\s]?line[_\-\s]?[12]?|street[_\-\s]?line)\b/i,
                /\b(adresse|dirección|indirizzo)\b/i  // DE/FR, ES, IT
            ],
            confidence: 0.94,
            category: 'location'
        },

        city: {
            patterns: [
                /\b(city|town|municipality)\b/i,
                /\b(city[_\-\s]?name|your[_\-\s]?city|location[_\-\s]?city)\b/i,
                /\b(stadt|ville|ciudad|città)\b/i,  // DE, FR, ES, IT
                /\btown[_\-\/]city\b/i
            ],
            confidence: 0.94,
            category: 'location'
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
            negative: /\bjob[_\-\s]?description/i
        },

        employer_name: {
            patterns: [
                /\b(company|employer|organization|organisation)\b/i,
                /\b(company[_\-\s]?name|employer[_\-\s]?name)\b/i,
                /\b(current[_\-\s]?company|previous[_\-\s]?company)\b/i,
                /\b(workplace|firm|business[_\-\s]?name)\b/i,
                /\b(unternehmen|entreprise|empresa)\b/i  // DE, FR, ES
            ],
            confidence: 0.95,
            category: 'work'
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

        work_description: {
            patterns: [
                /\b(job[_\-\s]?description|responsibilities|duties)\b/i,
                /\b(role[_\-\s]?description|work[_\-\s]?description)\b/i,
                /\b(key[_\-\s]?responsibilities|achievements)\b/i,
                /\bwhat[_\-\s]?did[_\-\s]?you[_\-\s]?do\b/i
            ],
            confidence: 0.92,
            category: 'work'
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
            category: 'education'
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
            category: 'education'
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

        gpa_score: {
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
     * Classify a form field using heuristic patterns
     * @param {Object} field - Field object with name, id, placeholder, etc.
     * @param {Object} context - Optional context (parentContext, siblingContext)
     * @returns {Object|null} { label, confidence, source, category } or null if no match
     */
    classify(field, context = {}) {
        const startTime = performance.now();

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
        const patternMatch = this._matchPatterns(text, fullContext);
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
    _matchPatterns(text, fullContext) {
        for (const [label, config] of Object.entries(HeuristicEngine.PATTERNS)) {
            // Check negative patterns (exclusions)
            if (config.negative && config.negative.test(text)) {
                continue;
            }

            // Check context filter
            if (config.contextFilter && !config.contextFilter(fullContext)) {
                continue;
            }

            // Match any pattern
            for (const pattern of config.patterns) {
                if (pattern.test(text)) {
                    return this._createResult(label, config.confidence, config.category);
                }
            }
        }

        return null;
    }

    /**
     * Create standardized result object
     */
    _createResult(label, confidence, category) {
        return {
            label,
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
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = HeuristicEngine;
}
