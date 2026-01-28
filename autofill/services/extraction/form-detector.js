/**
 * form-detection.js
 * Handles page analysis, job context extraction, and form field discovery.
 * 
 * ARCHITECTURE: 3-Tier Label Resolution (Enterprise Grade)
 * - TIER 1: Explicit HTML (autocomplete, labels, ARIA) - 100% confidence
 * - TIER 2: Semantic Hints (data-*, placeholder, table headers) - 80-95% confidence
 * - TIER 3: Visual Heuristics (proximity, parent text) - 40-70% confidence
 */

let cachedJobContext = null;
let cachedUrl = null;

// =============================================================================
// CONSTANTS: Label Extraction Configuration
// =============================================================================

/**
 * Autocomplete attribute to human-readable label mapping
 * Reference: https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofill
 */
const AUTOCOMPLETE_MAP = {
    'given-name': 'First Name',
    'family-name': 'Last Name',
    'additional-name': 'Middle Name',
    'name': 'Full Name',
    'email': 'Email',
    'tel': 'Phone',
    'tel-national': 'Phone',
    'street-address': 'Street Address',
    'address-line1': 'Address Line 1',
    'address-line2': 'Address Line 2',
    'address-level1': 'State',
    'address-level2': 'City',
    'postal-code': 'Zip Code',
    'country-name': 'Country',
    'country': 'Country',
    'organization': 'Company',
    'organization-title': 'Job Title',
    'username': 'Username',
    'new-password': 'Password',
    'current-password': 'Password',
    'bday': 'Date of Birth',
    'bday-day': 'Day',
    'bday-month': 'Month',
    'bday-year': 'Year',
    'sex': 'Gender',
    'url': 'Website',
    'photo': 'Photo',
    'cc-name': 'Cardholder Name',
    'cc-number': 'Card Number',
    'cc-exp': 'Expiration Date',
    'cc-csc': 'Security Code'
};

/**
 * Section heading patterns to REJECT during visual heuristics
 * These are almost never actual field labels
 */
const SECTION_HEADING_BLACKLIST = [
    // Generic section titles
    /^(text|date|number|file|select|checkbox|radio)\s*(inputs?|fields?|buttons?|dropdowns?)/i,
    /^(personal|contact|work|education|experience|skills|employment)\s*(information|details|history)?$/i,
    /^(basic|additional|other|optional|required)\s*(information|details|fields?)?$/i,

    // Emoji-prefixed section headers
    /^[📋📝🔘☑️📅🔢📎📄🧪⚙️💼🎓📞✉️🏠]/,

    // Form action labels
    /^(submit|cancel|reset|save|next|previous|back|continue|finish)/i,

    // Technical/Generic labels
    /^(section|step|part|form|input|field)\s*\d*/i,
    /^(question|item|row|column)\s*\d*/i
];

/**
 * Field container selectors for structural boundary detection
 */
const FIELD_CONTAINER_SELECTORS = [
    '.form-group', '.form-field', '.field-wrapper', '.input-group',
    '.form-row', '.field-row', '.form-control-group', '.input-wrapper',
    '[class*="FormField"]', '[class*="InputField"]', '[class*="form-group"]',
    '[class*="field-container"]', '[class*="input-container"]'
];

// =============================================================================
// JOB CONTEXT EXTRACTION
// =============================================================================

/**
 * Extract job context using intelligent multi-tier strategy
 * Priority: JSON-LD > Platform Selectors > Semantic Fallback
 */
function getJobContext() {
    // Cache per URL
    if (cachedUrl === window.location.href && cachedJobContext) {
        return cachedJobContext;
    }

    let context = '';

    // Helper: Validate extracted content
    const isValid = (text) => text && text.trim().length > 20;

    // Helper: Clean and deduplicate text
    const cleanText = (text) => {
        return text
            .replace(/\s+/g, ' ')
            .replace(/(.{50,}?)\1+/g, '$1')
            .trim();
    };

    // TIER 1: JSON-LD Structured Data (LinkedIn, Indeed, Glassdoor)
    try {
        const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of jsonLdScripts) {
            try {
                const data = JSON.parse(script.textContent);
                const jobData = data['@type'] === 'JobPosting' ? data : data.jobPosting;

                if (jobData && jobData.title) {
                    context = `Title: ${jobData.title || ''}\n`;
                    context += `Company: ${jobData.hiringOrganization?.name || ''}\n`;
                    context += `Location: ${jobData.jobLocation?.address?.addressLocality || ''}\n`;
                    context += `Description: ${cleanText(jobData.description || '')}`;

                    if (isValid(context)) {
                        cachedJobContext = context;
                        cachedUrl = window.location.href;
                        return context;
                    }
                }
            } catch (e) {
                console.warn('🧠 JSON-LD parse error:', e.message);
            }
        }
    } catch (e) {
        console.warn('🧠 JSON-LD extraction failed:', e.message);
    }

    // TIER 2: Platform-Specific Selectors
    try {
        const hostname = window.location.hostname;

        // Greenhouse
        if (hostname.includes('greenhouse') || hostname.includes('boards')) {
            try {
                const title = document.querySelector('.app-title, h1.app-title')?.innerText || '';
                const company = document.querySelector('.company-name')?.innerText || '';
                const desc = document.querySelector('#content .section-wrapper')?.innerText || '';
                if (isValid(title + desc)) {
                    context = `Title: ${title}\nCompany: ${company}\nDescription: ${cleanText(desc.substring(0, 2000))}`;
                }
            } catch (e) {
                console.warn('🧠 Greenhouse extraction error:', e.message);
            }
        }
        // Lever
        else if (hostname.includes('lever.co') || hostname.includes('jobs.lever')) {
            try {
                const title = document.querySelector('.posting-headline h2')?.innerText || '';
                const company = document.querySelector('.main-header-text-logo')?.innerText || '';
                const desc = document.querySelector('.section-wrapper')?.innerText || '';
                if (isValid(title + desc)) {
                    context = `Title: ${title}\nCompany: ${company}\nDescription: ${cleanText(desc.substring(0, 2000))}`;
                }
            } catch (e) {
                console.warn('🧠 Lever extraction error:', e.message);
            }
        }
        // Workday
        else if (hostname.includes('myworkday') || hostname.includes('wd')) {
            try {
                const title = document.querySelector('h2[data-automation-id="jobPostingHeader"]')?.innerText ||
                    document.querySelector('h3.css-12b42k6')?.innerText || '';
                const company = document.querySelector('[data-automation-id="company"]')?.innerText || '';
                const desc = document.querySelector('[data-automation-id="jobPostingDescription"]')?.innerText || '';
                if (isValid(title + desc)) {
                    context = `Title: ${title}\nCompany: ${company}\nDescription: ${cleanText(desc.substring(0, 2000))}`;
                }
            } catch (e) {
                console.warn('🧠 Workday extraction error:', e.message);
            }
        }

        if (isValid(context)) {
            cachedJobContext = context;
            cachedUrl = window.location.href;
            return context;
        }
    } catch (e) {
        console.warn('🧠 Platform selector extraction failed:', e.message);
    }

    // TIER 3: Semantic Fallback
    try {
        const title = document.title;
        const h1 = document.querySelector('h1')?.innerText || '';
        const h2 = document.querySelector('h2')?.innerText || '';
        const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
        const bodyText = document.body.innerText.substring(0, 2000);

        context = `Page Title: ${title}\nHeader: ${h1} | ${h2}\nMeta: ${metaDesc}\nContent: ${cleanText(bodyText)}`;
    } catch (e) {
        console.error('🧠 ❌ All context extraction methods failed:', e.message);
        context = 'Context extraction failed. Using resume data only.';
    }

    cachedJobContext = context;
    cachedUrl = window.location.href;
    return context;
}

// =============================================================================
// FORM DETECTION
// =============================================================================

function detectForms() {
    const selectors = [
        'form',
        '[role="form"]',
        '[data-automation-id="form-container"]',
        '#application_form',
        '.application-form',
        '#form',
        '[id*="job-application"]',
        '[class*="job-application"]',
        '.ashby-application-form-container',
        '[class*="ashby-application-form"]',
        '[data-testid="application-form"]',
        'div[class*="ApplicationForm"]',
        '[class*="_applicationForm"]',
        'main [class*="application"]'
    ];

    const candidates = document.querySelectorAll(selectors.join(', '));

    const filtered = Array.from(candidates).filter(el => {
        const isSearch = el.getAttribute('role') === 'search' ||
            el.classList.contains('search-form') ||
            (el.id && el.id.includes('search'));
        const hasInputs = el.querySelectorAll('input, select, textarea').length > 0;
        return !isSearch && hasInputs;
    });

    // FALLBACK: Density Scan
    if (filtered.length === 0) {
        const inputContainers = new Map();
        const allInputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea');

        allInputs.forEach(input => {
            let parent = input.parentElement;
            for (let i = 0; i < 5; i++) {
                if (!parent || parent.tagName === 'BODY' || parent.tagName === 'HTML') break;
                if (!inputContainers.has(parent)) {
                    inputContainers.set(parent, 0);
                }
                inputContainers.set(parent, inputContainers.get(parent) + 1);
                parent = parent.parentElement;
            }
        });

        let winner = null;
        let maxCount = 0;
        for (const [container, count] of inputContainers.entries()) {
            if (count > maxCount && count >= 1) {
                const tagName = container.tagName;
                const cls = (container.className || '').toLowerCase();
                const role = container.getAttribute('role');

                if (tagName === 'NAV' || tagName === 'HEADER' || tagName === 'FOOTER') continue;
                if (cls.includes('search') || cls.includes('navbar') || cls.includes('menu')) continue;
                if (role === 'navigation' || role === 'banner' || role === 'contentinfo') continue;

                winner = container;
                maxCount = count;
            }
        }

        if (winner) {
            console.log('✅ [FormDetector] Density Scan Winner:', winner, `(${maxCount} inputs)`);
            filtered.push(winner);
        }
    }

    // Smart Deduplication
    const getContainerSignature = (el) => {
        const inputs = el.querySelectorAll('input, select, textarea');
        const sig = new Set();
        inputs.forEach(i => {
            if (i.type === 'hidden') return;
            const key = i.name || i.id || `${i.type}::${i.className}`;
            sig.add(key);
        });
        return sig;
    };

    const isSubset = (setA, setB) => {
        for (const elem of setB) {
            if (!setA.has(elem)) return false;
        }
        return true;
    };

    const candidatesWithSig = filtered.map(el => ({
        element: el,
        signature: getContainerSignature(el),
        uid: Math.random().toString(36).substring(2, 9)
    }));

    const finalCandidates = candidatesWithSig.filter(c => {
        const isRedundant = candidatesWithSig.some(other => {
            if (other === c) return false;
            const contains = other.element.contains(c.element);
            if (!contains) return false;
            return isSubset(other.signature, c.signature);
        });
        return !isRedundant;
    });

    return finalCandidates.map(c => {
        c.element.dataset.sourceContainerId = c.uid;
        return c.element;
    });
}

function extractFormHTML() {
    const forms = detectForms();

    if (forms.length === 1) {
        return forms[0];
    }

    if (forms.length > 1) {
        console.log(`[FormDetector] extractFormHTML: Found ${forms.length} distinct form containers. Finding common ancestor...`);

        let parent = forms[0].parentElement;
        while (parent && parent !== document.body) {
            const allContained = forms.every(f => parent.contains(f));
            if (allContained) {
                console.log(`[FormDetector] Merged ${forms.length} forms into common ancestor:`, parent.tagName, parent.className);
                return parent;
            }
            parent = parent.parentElement;
        }
        return document.body;
    }

    const allInputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea');
    if (allInputs.length > 0) {
        console.log(`[FormDetector] extractFormHTML: No forms. Returning body for total context (${allInputs.length} inputs).`);
        return document.body;
    }

    return null;
}

// =============================================================================
// LABEL EXTRACTION - 3-TIER ENTERPRISE ARCHITECTURE
// =============================================================================

/**
 * Clean text: normalize whitespace, trim
 */
function cleanLabel(txt) {
    return (txt || '').replace(/[\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Convert technical names to human-readable format
 * "first-name" → "First Name", "firstName" → "First Name"
 */
function humanizeLabel(str) {
    if (!str) return '';
    return str
        .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase
        .replace(/[-_]/g, ' ')                 // kebab-case, snake_case
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Check if text matches section heading blacklist
 */
function isSectionHeading(text) {
    if (!text) return false;
    return SECTION_HEADING_BLACKLIST.some(pattern => pattern.test(text));
}

/**
 * Check if text is a valid label (not too short, not too long, not garbage)
 */
function isValidLabel(text) {
    if (!text) return false;
    if (text.length < 2 || text.length > 300) return false;
    if (/^[0-9]+$/.test(text)) return false;
    if (isSectionHeading(text)) return false;
    return true;
}

/**
 * TIER 1: Extract label from explicit HTML associations
 * Priority: autocomplete → element.labels → label[for] → ARIA
 * Confidence: 100%
 */
function getExplicitLabel(element) {
    // 1a. autocomplete attribute (developer intent - Chrome's #1 priority)
    const autocomplete = element.getAttribute('autocomplete');
    if (autocomplete && autocomplete !== 'on' && autocomplete !== 'off') {
        // Handle compound values: "billing street-address" → "street-address"
        const tokens = autocomplete.split(/\s+/);
        const fieldType = tokens[tokens.length - 1];
        if (AUTOCOMPLETE_MAP[fieldType]) {
            return AUTOCOMPLETE_MAP[fieldType];
        }
        // Fallback: humanize unknown autocomplete values
        if (fieldType.length > 2) {
            return humanizeLabel(fieldType);
        }
    }

    // 1b. Native label association (element.labels API)
    if (element.labels && element.labels.length > 0) {
        const labelText = cleanLabel(element.labels[0].textContent);
        if (isValidLabel(labelText)) {
            return labelText;
        }
    }

    // 1c. Explicit label[for="id"] selector
    if (element.id) {
        const labelFor = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        if (labelFor) {
            const labelText = cleanLabel(labelFor.textContent);
            if (isValidLabel(labelText)) {
                return labelText;
            }
        }
    }

    // 1d. aria-label (direct)
    if (element.hasAttribute('aria-label')) {
        const ariaLabel = cleanLabel(element.getAttribute('aria-label'));
        if (isValidLabel(ariaLabel)) {
            return ariaLabel;
        }
    }

    // 1e. aria-labelledby (indirect)
    if (element.hasAttribute('aria-labelledby')) {
        const id = element.getAttribute('aria-labelledby');
        const labelEl = document.getElementById(id);
        if (labelEl) {
            const labelText = cleanLabel(labelEl.textContent);
            if (isValidLabel(labelText)) {
                return labelText;
            }
        }
    }

    // 1f. aria-describedby (secondary label)
    if (element.hasAttribute('aria-describedby')) {
        const id = element.getAttribute('aria-describedby');
        const descEl = document.getElementById(id);
        if (descEl) {
            const descText = cleanLabel(descEl.textContent);
            if (descText.length > 5 && descText.length < 150 && isValidLabel(descText)) {
                return descText;
            }
        }
    }

    return null;
}

/**
 * TIER 2: Extract label from semantic hints
 * Priority: data-*, placeholder, fieldset legend, table headers
 * Confidence: 80-95%
 */
function getSemanticLabel(element) {
    const type = element.type;
    const isGroup = type === 'radio' || type === 'checkbox';

    // 2a. Data attributes (React/Testing hooks)
    const dataAttrs = ['data-label', 'data-field-name', 'data-testid', 'data-cy'];
    for (const attr of dataAttrs) {
        if (element.hasAttribute(attr)) {
            const val = element.getAttribute(attr);
            if (val && val.length > 3 && val.length < 100) {
                // Skip UUIDs
                if (!/^[a-f0-9-]{20,}$/i.test(val)) {
                    return humanizeLabel(val);
                }
            }
        }
    }

    // 2b. Fieldset legend (for radio/checkbox groups)
    if (isGroup) {
        const fieldset = element.closest('fieldset');
        if (fieldset) {
            const legend = fieldset.querySelector('legend');
            if (legend) {
                const legendText = cleanLabel(legend.innerText);
                if (isValidLabel(legendText)) {
                    return legendText;
                }
            }
        }
    }

    // 2c. Table column header (for tabular forms)
    const td = element.closest('td');
    if (td) {
        const table = td.closest('table');
        if (table) {
            const tr = td.parentElement;
            const colIndex = Array.from(tr.children).indexOf(td);
            const thead = table.querySelector('thead');
            if (thead) {
                const rows = thead.querySelectorAll('tr');
                if (rows.length > 0) {
                    const thRow = rows[rows.length - 1];
                    if (thRow && thRow.children[colIndex]) {
                        const headerText = cleanLabel(thRow.children[colIndex].innerText);
                        if (headerText.length > 2 && isValidLabel(headerText)) {
                            return headerText;
                        }
                    }
                }
            }
        }
    }

    // 2d. Placeholder (for text inputs)
    if (!isGroup && element.placeholder) {
        const placeholder = cleanLabel(element.placeholder);
        if (isValidLabel(placeholder)) {
            return placeholder;
        }
    }

    // 2e. Title attribute
    if (element.hasAttribute('title')) {
        const title = cleanLabel(element.getAttribute('title'));
        if (isValidLabel(title)) {
            return title;
        }
    }

    return null;
}

/**
 * TIER 3: Visual heuristics (proximity-based search)
 * Only used as FALLBACK when explicit/semantic methods fail
 * Confidence: 40-70%
 */
function getVisualLabel(element) {
    const EXCLUSION_PATTERNS = /autofill|resume|upload|download|attach|button|submit|cancel|^indicates.*required|^[mdy]{1,4}$|month|year|day|date format/i;
    const QUESTION_PATTERNS = /\?$|:$|what|where|when|why|how|which|who|are you|do you|have you|please|enter|provide|select|choose|describe|indicate/i;
    const BOUNDARY_TAGS = new Set(['FORM', 'BODY', 'HTML', 'SECTION', 'ARTICLE']);

    let current = element;
    let bestCandidate = null;
    let bestScore = -100;

    // First: Try to find label within field container (structural boundary)
    const container = element.closest(FIELD_CONTAINER_SELECTORS.join(', '));
    if (container) {
        // Search for label-like elements within the container
        const candidates = container.querySelectorAll('label, .label, .field-label, .form-label, legend, h3, h4, h5, h6');
        for (const candidate of candidates) {
            if (candidate.contains(element)) continue; // Skip if it contains the input
            if (candidate.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) {
                const text = cleanLabel(candidate.innerText);
                if (isValidLabel(text) && !EXCLUSION_PATTERNS.test(text)) {
                    return text; // Found within container, high confidence
                }
            }
        }
    }

    // Fallback: Walk up DOM (limited to 4 levels, was 8)
    for (let depth = 0; depth < 4; depth++) {
        if (!current || BOUNDARY_TAGS.has(current.tagName)) break;

        // Scan previous siblings
        let sibling = current.previousElementSibling;
        let siblingDistance = 0;

        while (sibling && siblingDistance < 5) { // Reduced from 10
            // Stop at field boundary
            const hasInput = sibling.tagName === 'INPUT' ||
                sibling.tagName === 'SELECT' ||
                sibling.tagName === 'TEXTAREA' ||
                (sibling.querySelector && sibling.querySelector('input:not([type="hidden"]), select, textarea'));

            if (hasInput) break;

            // Extract text
            let candidates = [];
            try {
                candidates = extractTextCandidates(sibling);
            } catch (e) {
                candidates = [(sibling.innerText || '').trim()];
            }

            for (const text of candidates) {
                if (!isValidLabel(text) || EXCLUSION_PATTERNS.test(text)) continue;

                // Scoring with aggressive distance penalties
                let score = 50;
                score -= (depth * 15);           // Heavy vertical penalty
                score -= (siblingDistance * 8);  // Heavy horizontal penalty

                // Content bonuses
                if (QUESTION_PATTERNS.test(text)) score += 40;
                if (text.endsWith('?')) score += 30;
                if (text.endsWith(':')) score += 15;
                if (/LABEL|LEGEND/.test(sibling.tagName)) score += 20;

                // Section heading penalty
                if (/H[1-3]/.test(sibling.tagName)) score -= 40;

                // Length penalties
                if (text.length > 80) score -= 10;
                if (text.length > 150) score -= 20;

                if (score > bestScore) {
                    bestScore = score;
                    bestCandidate = text;
                }
            }
            sibling = sibling.previousElementSibling;
            siblingDistance++;
        }

        current = current.parentElement;
    }

    return bestScore > 10 ? bestCandidate : null;
}

/**
 * Extract valid text strings from an element tree
 */
function extractTextCandidates(root) {
    const results = [];
    const walk = (node) => {
        if (!node) return;
        if (node.nodeType === Node.TEXT_NODE) {
            const t = node.textContent.trim();
            if (t.length > 2) results.push(t);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            if (['SCRIPT', 'STYLE', 'BUTTON', 'NAV', 'FOOTER', 'INPUT', 'SELECT', 'TEXTAREA'].includes(node.tagName)) return;
            node.childNodes.forEach(walk);
        }
    };
    walk(root);
    return results;
}

/**
 * MAIN ENTRY POINT: Get field label using 3-tier resolution
 * 
 * Priority Order:
 * 1. TIER 1: Explicit HTML (autocomplete, labels, ARIA) - 100% confidence
 * 2. TIER 2: Semantic hints (data-*, placeholder, table headers) - 80-95%
 * 3. TIER 3: Visual heuristics (proximity) - 40-70%
 * 4. FALLBACK: Humanized name/id
 */
function getFieldLabel(element) {
    // TIER 1: Explicit HTML associations (HIGHEST PRIORITY)
    const explicitLabel = getExplicitLabel(element);
    if (explicitLabel) {
        return explicitLabel;
    }

    // TIER 2: Semantic hints
    const semanticLabel = getSemanticLabel(element);
    if (semanticLabel) {
        return semanticLabel;
    }

    // TIER 3: Visual heuristics (FALLBACK ONLY)
    const visualLabel = getVisualLabel(element);
    if (visualLabel) {
        return visualLabel;
    }

    // TIER 4: Final fallback - humanized name/id
    const fallback = element.name || element.id;
    if (fallback) {
        // Skip UUIDs and bracket syntax
        if (/^[a-f0-9-]{20,}$/i.test(fallback) || /\[.*\]/.test(fallback)) {
            return 'Unknown Field';
        }
        return humanizeLabel(fallback);
    }

    return 'Unknown Field';
}

// =============================================================================
// SELECTOR GENERATION
// =============================================================================

function getElementSelector(element) {
    // 1. ID (if unique)
    if (element.id && !/\d{5,}/.test(element.id)) {
        const idSelector = `#${CSS.escape(element.id)}`;
        if (document.querySelectorAll(idSelector).length === 1) {
            return idSelector;
        }
    }

    // 2. Stable attributes
    const attributes = ['data-testid', 'data-cy', 'data-automation-id', 'name'];
    for (const attr of attributes) {
        if (element.hasAttribute(attr)) {
            const val = element.getAttribute(attr);
            if (!val || val.trim() === '') continue;

            if (attr === 'name') {
                let candidate = '';
                if ((element.type === 'radio' || element.type === 'checkbox') && element.value && element.value.trim() !== '') {
                    candidate = `input[name="${CSS.escape(val)}"][value="${CSS.escape(element.value)}"]`;
                } else {
                    candidate = `input[name="${CSS.escape(val)}"]`;
                }

                if (document.querySelectorAll(candidate).length === 1) return candidate;

                const form = element.closest('form');
                if (form && form.id) {
                    const formScoped = `form#${CSS.escape(form.id)} ${candidate}`;
                    if (document.querySelectorAll(formScoped).length === 1) return formScoped;
                }
                continue;
            }

            const attrSelector = `[${attr}="${CSS.escape(val)}"]`;
            if (document.querySelectorAll(attrSelector).length === 1) return attrSelector;
        }
    }

    // 3. Hierarchical path
    let path = '';
    let current = element;

    for (let i = 0; i < 4; i++) {
        const parent = current.parentElement;
        if (!parent || parent.tagName === 'HTML') break;

        let tag = current.tagName.toLowerCase();

        if (current.id && !current.id.match(/\d/)) {
            path = `#${CSS.escape(current.id)}` + (path ? ' > ' + path : '');
            if (document.querySelectorAll(path).length === 1) return path;
        }

        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        const idx = siblings.indexOf(current) + 1;

        const part = `${tag}:nth-of-type(${idx})`;
        path = part + (path ? ' > ' + path : '');

        if (document.querySelectorAll(path).length === 1) return path;

        current = parent;
    }

    if (path === 'input' || path === 'select' || path === 'textarea') return null;
    return path;
}

function isFieldVisible(element) {
    if (!element) return false;
    try {
        const style = window.getComputedStyle(element);
        return (
            element.type !== 'hidden' &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            element.offsetWidth > 0 &&
            element.offsetHeight > 0 &&
            !element.closest('[aria-hidden="true"]')
        );
    } catch { return false; }
}

function findLabelText(element) {
    if (element.labels && element.labels[0]) return element.labels[0].textContent;
    if (element.id) {
        const l = document.querySelector(`label[for="${element.id}"]`);
        if (l) return l.textContent;
    }
    return '';
}

// =============================================================================
// EXPORTS
// =============================================================================

if (typeof window !== 'undefined') {
    window.getJobContext = getJobContext;
    window.detectForms = detectForms;
    window.extractFormHTML = extractFormHTML;
    window.getFieldLabel = getFieldLabel;
    window.getElementSelector = getElementSelector;
    window.isFieldVisible = isFieldVisible;
}

// Debug logging
if (typeof window !== 'undefined') {
    console.log('[FormDetector] Enterprise Label Extraction v2.0 loaded. 3-Tier Architecture active.');
}
