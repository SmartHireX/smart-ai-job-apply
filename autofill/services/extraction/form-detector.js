/**
 * form-detection.js
 * Handles page analysis, job context extraction, and form field discovery.
 */

let cachedJobContext = null;
let cachedUrl = null;

/**
 * Extract job context using intelligent multi-tier strategy
 * Priority: JSON-LD > Platform Selectors > Semantic Fallback
 */
function getJobContext() {
    // Cache per URL
    if (cachedUrl === window.location.href && cachedJobContext) {
        // console.log('🧠 Using cached job context');
        return cachedJobContext;
    }

    let context = '';

    // Helper: Validate extracted content
    const isValid = (text) => text && text.trim().length > 20;

    // Helper: Clean and deduplicate text
    const cleanText = (text) => {
        return text
            .replace(/\s+/g, ' ') // Collapse whitespace
            .replace(/(.{50,}?)\1+/g, '$1') // Remove duplicates (rough heuristic)
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
                        // console.log('🧠 ✅ Extracted from JSON-LD');
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
                    // console.log('🧠 ✅ Extracted from Greenhouse selectors');
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
                    // console.log('🧠 ✅ Extracted from Lever selectors');
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
                    // console.log('🧠 ✅ Extracted from Workday selectors');
                }
            } catch (e) {
                console.warn('🧠 Workday extraction error:', e.message);
            }
        }

        // If we got valid context from platform selectors, return it
        if (isValid(context)) {
            cachedJobContext = context;
            cachedUrl = window.location.href;
            return context;
        }
    } catch (e) {
        console.warn('🧠 Platform selector extraction failed:', e.message);
    }

    // TIER 3: Semantic Fallback (if nothing worked above)
    try {
        const title = document.title;
        const h1 = document.querySelector('h1')?.innerText || '';
        const h2 = document.querySelector('h2')?.innerText || '';
        const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
        const bodyText = document.body.innerText.substring(0, 2000);

        context = `Page Title: ${title}\nHeader: ${h1} | ${h2}\nMeta: ${metaDesc}\nContent: ${cleanText(bodyText)}`;
        // console.log('🧠 ⚠️ Extracted from semantic fallback');
    } catch (e) {
        console.error('🧠 ❌ All context extraction methods failed:', e.message);
        context = 'Context extraction failed. Using resume data only.';
    }

    // Cache result
    cachedJobContext = context;
    cachedUrl = window.location.href;
    return context;
}

function detectForms() {
    // Broaden search to include semantic IDs and Classes common in ATS platforms
    const selectors = [
        'form',
        '[role="form"]',
        '[data-automation-id="form-container"]',
        '#application_form',
        '.application-form',
        '[id*="job-application"]',
        '[class*="job-application"]',
        '.ashby-application-form-container', // AshbyHQ specific container
        '[class*="ashby-application-form"]',   // AshbyHQ generic class
        '[data-testid="application-form"]',    // AshbyHQ test ID
        'div[class*="ApplicationForm"]',       // AshbyHQ React component class
        '[class*="_applicationForm"]',         // AshbyHQ CSS modules pattern
        'main [class*="application"]'          // Ashby main content area
    ];

    const candidates = document.querySelectorAll(selectors.join(', '));

    // Filter out obvious false positives (search bars, nav forms)
    const filtered = Array.from(candidates).filter(el => {
        // Exclude if it looks like a search bar
        const isSearch = el.getAttribute('role') === 'search' ||
            el.classList.contains('search-form') ||
            (el.id && el.id.includes('search'));

        // Ensure it has at least one input/select/textarea
        const hasInputs = el.querySelectorAll('input, select, textarea').length > 0;

        return !isSearch && hasInputs;
    });

    // FALLBACK: Density Scan
    // If no forms found via selectors (or all filtered out), find the "densest" div
    if (filtered.length === 0) {
        // console.log('⚠️ [FormDetector] No standard forms found. Running Density Scan...');
        const inputContainers = new Map();
        const allInputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea');

        allInputs.forEach(input => {
            // Traverse up 5 levels to find a suitable container
            let parent = input.parentElement;
            for (let i = 0; i < 5; i++) {
                if (!parent || parent.tagName === 'BODY' || parent.tagName === 'HTML') break;

                // Score containers based on depth (favor deeper/closer containers)
                // But we mainly want the one with the MOST inputs.
                if (!inputContainers.has(parent)) {
                    inputContainers.set(parent, 0);
                }
                inputContainers.set(parent, inputContainers.get(parent) + 1);
                parent = parent.parentElement;
            }
        });

        // Find winner
        let winner = null;
        let maxCount = 0;
        for (const [container, count] of inputContainers.entries()) {
            if (count > maxCount && count > 3) { // Threshold: at least 3 inputs
                // Filter out likely footers/navs based on tag/class if needed
                // For now, raw density wins
                winner = container;
                maxCount = count;
            }
        }

        if (winner) {
            // console.log('✅ [FormDetector] Density Scan Winner:', winner, `(${maxCount} inputs)`);
            filtered.push(winner);
        }
    }

    // ===============================================
    // SMART DEDUPLICATION (Enterprise Fix)
    // ===============================================
    // Prevent concatenating a Form AND its Wrapper (which doubles fields).
    // Rule: Discard Candidate B if:
    // 1. A contains B AND
    // 2. A captures all fields of B (Signature Subset)

    // Helper: Generate Field Signature
    const getContainerSignature = (el) => {
        const inputs = el.querySelectorAll('input, select, textarea');
        const sig = new Set();
        inputs.forEach(i => {
            if (i.type === 'hidden') return;
            // Use Name or ID or Type+Index as signature
            const key = i.name || i.id || `${i.type}::${i.className}`;
            sig.add(key);
        });
        return sig;
    };

    // Helper: Check if Set B is subset of Set A
    const isSubset = (setA, setB) => {
        for (const elem of setB) {
            if (!setA.has(elem)) return false;
        }
        return true;
    };

    // Pre-calculate signatures
    const candidatesWithSig = filtered.map(el => ({
        element: el,
        signature: getContainerSignature(el),
        uid: Math.random().toString(36).substring(2, 9) // Assign UID for tagging
    }));

    const finalCandidates = candidatesWithSig.filter(c => {
        // Check if ANY other candidate contains this one AND is a superset
        const isRedundant = candidatesWithSig.some(other => {
            if (other === c) return false;

            const contains = other.element.contains(c.element);
            if (!contains) return false;

            // If other contains current, check signatures
            // If other has ALL of current's fields, current is redundant.
            return isSubset(other.signature, c.signature);
        });

        return !isRedundant;
    });

    return finalCandidates.map(c => {
        // Attach UID to element for Analyzer to pick up (via data attribute or property)
        c.element.dataset.sourceContainerId = c.uid;
        return c.element;
    });
}

function extractFormHTML() {
    const forms = detectForms();
    return Array.from(forms).map(f => f.innerHTML).join('\n');
}

function getFieldLabel(element) {
    let label = '';
    const type = element.type;
    const isGroup = type === 'radio' || type === 'checkbox';

    // Helper: Clean text
    const clean = (txt) => (txt || '').replace(/[\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();

    // 0. Group Label Strategy (Highest Priority for Radios/Checkboxes)
    if (isGroup) {
        // 0a. Fieldset Legend (Golden Standard)
        const fieldset = element.closest('fieldset');
        if (fieldset) {
            const legend = fieldset.querySelector('legend');
            if (legend) return clean(legend.innerText);
        }

        // 0b. Smart Block Search
        // Scan up to 4 parents to find a "Question Block"
        let parent = element.parentElement;
        for (let i = 0; i < 4; i++) {
            if (!parent || parent.tagName === 'FORM' || parent.tagName === 'BODY') break;

            // STRATEGY 1: Internal Header
            // Look for any header (H1-H6) or Legend INSIDE this parent that is ABOVE the current element.
            // This catches: <div> <h3>My Question</h3> <div><input></div> </div>
            const headers = parent.querySelectorAll('h1, h2, h3, h4, h5, h6, legend, label.question, .form-label');
            for (const header of headers) {
                // Must be BEFORE the element in DOM order
                if (header.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) {
                    const text = clean(header.innerText);
                    if (text.length > 5 && text.length < 200) return text;
                }
            }

            // STRATEGY 2: Previous Sibling Loop
            // Check all previous siblings, not just the first one.
            // This catches: <h3>Question</h3> <p>Desc</p> <div class="options">...</div>
            let sibling = parent.previousElementSibling;
            while (sibling) {
                const text = clean(sibling.innerText);
                // Stop if we hit a substantial header
                if (/H[1-6]|LABEL|LEGEND/.test(sibling.tagName) && text.length > 5) {
                    return text;
                }
                // Stop if we hit a 'label' class
                if (sibling.classList && (sibling.classList.contains('label') || sibling.classList.contains('question'))) {
                    return text;
                }

                sibling = sibling.previousElementSibling;
            }

            parent = parent.parentElement;
        }
    }

    // 1. Table Column Strategy (NEW: For Education/Work History tables)
    // Matches <td> input to <th> header by column index
    const td = element.closest('td');
    if (td) {
        const table = td.closest('table');
        if (table) {
            const tr = td.parentElement;
            const colIndex = Array.from(tr.children).indexOf(td);
            const thead = table.querySelector('thead');
            if (thead) {
                // Try to find the corresponding TH
                // Logic: Find the LAST row in thead (usually contains the actual column headers)
                const rows = thead.querySelectorAll('tr');
                if (rows.length > 0) {
                    const thRow = rows[rows.length - 1]; // Last row is safest bet
                    if (thRow && thRow.children[colIndex]) {
                        const th = thRow.children[colIndex];
                        const headerText = clean(th.innerText);
                        if (headerText.length > 2) {
                            return headerText;
                        }
                    }
                }
            }
        }
    }

    // 2. Explicit Label (Standard)
    // For radio/checkbox: Find the label WITH for="id" to get the SPECIFIC option label
    // element.labels[0] can return the GROUP question label which is wrong!
    if (isGroup && element.id) {
        const specificLabel = document.querySelector(`label[for="${element.id}"]`);
        if (specificLabel) {
            return clean(specificLabel.textContent);
        }
    }

    // For non-group fields, labels[0] is fine
    if (!isGroup && element.labels && element.labels.length > 0) {
        return clean(element.labels[0].textContent);
    }

    // 2. ARIA Label (Direct)
    if (element.hasAttribute('aria-label')) {
        return clean(element.getAttribute('aria-label'));
    }

    // 3. ARIA LabelledBy (Indirect)
    if (element.hasAttribute('aria-labelledby')) {
        const id = element.getAttribute('aria-labelledby');
        const labelEl = document.getElementById(id);
        if (labelEl) return clean(labelEl.textContent);
    }

    // 4. Nearby Text Strategy (Visual Adjacency) - Higher Priority than Placeholder now
    // Check previous sibling directly
    let prev = element.previousElementSibling;
    if (prev && clean(prev.innerText).length > 0 && clean(prev.innerText).length < 50) {
        return clean(prev.innerText);
    }

    // Check parent text (minus input value)
    if (element.parentElement) {
        const parentText = element.parentElement.innerText || '';
        // Remove own value to avoid "Name Name"
        const val = element.value || '';
        const textWithoutVal = parentText.replace(val, '').trim();
        if (textWithoutVal.length > 2 && textWithoutVal.length < 50) return clean(textWithoutVal);
    }

    // 5. Placeholder (Fallback for Text Inputs)
    if (!isGroup && element.placeholder) {
        return clean(element.placeholder);
    }

    // 6. Name/ID Fallback (Last Resort)
    const fallback = element.name || element.id;
    if (fallback) {
        return clean(fallback.replace(/[-_]/g, ' ').replace(/([A-Z])/g, ' $1')); // camelCaese -> camel Case
    }

    if (element.type === 'radio' || element.type === 'checkbox') {
        console.warn('[Scraper Debug] Failed to find label for:', element);
    }
    return 'Unknown Field';
}

function getElementSelector(element) {
    // 1. ID - The Gold Standard (BUT only if unique)
    if (element.id && !/\d{5,}/.test(element.id)) {
        const idSelector = `#${CSS.escape(element.id)}`;
        // Check uniqueness locally (quick check)
        if (document.querySelectorAll(idSelector).length === 1) {
            return idSelector;
        }
    }

    // 2. Stable QA/Automation Attributes ("FANG" style)
    const attributes = ['data-testid', 'data-cy', 'data-automation-id', 'name'];
    for (const attr of attributes) {
        if (element.hasAttribute(attr)) {
            const val = element.getAttribute(attr);
            // Validation: Ensure value is not empty or just whitespace
            if (!val || val.trim() === '') continue;

            if (attr === 'name') {
                let candidate = '';
                // Special handling for Radio/Checkbox groups
                if ((element.type === 'radio' || element.type === 'checkbox') && element.value && element.value.trim() !== '') {
                    candidate = `input[name="${CSS.escape(val)}"][value="${CSS.escape(element.value)}"]`;
                } else {
                    candidate = `input[name="${CSS.escape(val)}"]`;
                }

                // Verify uniqueness
                if (document.querySelectorAll(candidate).length === 1) return candidate;

                // If not unique (duplicates on page), try combining with form parent
                const form = element.closest('form');
                if (form && form.id) {
                    const formScoped = `form#${CSS.escape(form.id)} ${candidate}`;
                    if (document.querySelectorAll(formScoped).length === 1) return formScoped;
                }

                // If still not unique, don't return partial match, fall through to Path Strategy
                continue;
            }

            const attrSelector = `[${attr}="${CSS.escape(val)}"]`;
            if (document.querySelectorAll(attrSelector).length === 1) return attrSelector;
        }
    }

    // 3. Fallback: Stable Hierarchical Path
    // Go up 2 levels
    let path = element.tagName.toLowerCase();
    let current = element;

    for (let i = 0; i < 2; i++) {
        const parent = current.parentElement;
        if (!parent || parent.tagName === 'BODY' || parent.tagName === 'HTML') break;

        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        const idx = siblings.indexOf(current) + 1;

        path = `${parent.tagName.toLowerCase()} > ${path}:nth-of-type(${idx})`;
        current = parent;
    }

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
            element.offsetHeight > 0
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

// Export to window for global access
if (typeof window !== 'undefined') {
    window.getJobContext = getJobContext;
    window.detectForms = detectForms;
    window.extractFormHTML = extractFormHTML;
    window.getFieldLabel = getFieldLabel;
    window.getElementSelector = getElementSelector;
    window.isFieldVisible = isFieldVisible;
}
