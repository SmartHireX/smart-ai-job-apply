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

    // 1. Standard Case: Specific forms found
    if (forms.length > 0) {
        return Array.from(forms).map(f => f.outerHTML).join('\n');
    }

    // 2. Fallback: No distinct forms, but inputs exist (SPA/Modern Web)
    const allInputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea');
    if (allInputs.length > 0) {
        // console.log('⚠️ [FormDetector] No distinct form containers found. Using full body content.');
        return document.body.innerHTML;
    }

    return null;
}

/**
 * VISUAL LABEL ALGORITHM (The "Human Eye" Strategy)
 * Mimics how a user visually scans for a label.
 * 1. Look at immediate previous sibling (Left/Above)
 * 2. Walk up to parent, look at parent's previous sibling (Container Label)
 * 3. Walk up to grandparent, etc.
 * 4. Score candidates based on "Question Likeness" (?, :)
 */
function getVisualLabel(element) {
    const EXCLUSION_PATTERNS = /autofill|resume|upload|download|attach|button|submit|cancel/i;
    const QUESTION_PATTERNS = /\?$|what|where|when|why|how|which|who|are you|do you|have you|please|enter your|provide your|:$|expected/i;

    let current = element;
    let bestCandidate = null;
    let bestScore = 0;

    // Walk up 5 levels maximum
    for (let depth = 0; depth < 5; depth++) {
        if (!current || current.tagName === 'BODY' || current.tagName === 'HTML' || current.tagName === 'FORM') break;

        // Check Previous Siblings at this level
        let sibling = current.previousElementSibling;
        let siblingCount = 0;

        while (sibling && siblingCount < 3) { // Limit sibling lookback
            const text = (sibling.innerText || '').trim();
            const cleanText = text.replace(/[\n\r]/g, ' ').replace(/\s+/g, ' ');

            if (isValidLabel(cleanText)) {
                let score = 10 - (depth * 2) - siblingCount; // Base score (Distance decay)

                // Content Bonuses
                if (QUESTION_PATTERNS.test(cleanText)) score += 20; // It's a question!
                if (/H[1-6]|LABEL|LEGEND/.test(sibling.tagName)) score += 5; // It's a semantic header
                if (sibling.className.includes('label') || sibling.className.includes('question')) score += 5; // CSS hint

                // Length Penalties
                if (cleanText.length > 100) score -= 5;

                // Exclusion Update
                if (EXCLUSION_PATTERNS.test(cleanText)) score = -100;

                if (score > bestScore) {
                    bestScore = score;
                    bestCandidate = cleanText;
                }
            }
            sibling = sibling.previousElementSibling;
            siblingCount++;
        }

        // Also check if the Parent itself has text (e.g. <label>Question <input></label>)
        if (depth > 0) { // Don't check self
            const parentText = Array.from(current.childNodes)
                .filter(n => n.nodeType === Node.TEXT_NODE)
                .map(n => n.textContent.trim())
                .join(' ');

            if (isValidLabel(parentText)) {
                let score = 10 - (depth * 2) + 2; // Direct parent text is good
                if (QUESTION_PATTERNS.test(parentText)) score += 20;
                if (current.tagName === 'LABEL') score += 10;
                if (score > bestScore) {
                    bestScore = score;
                    bestCandidate = parentText;
                }
            }
        }

        current = current.parentElement;
    }

    return bestScore > 5 ? bestCandidate : null;
}

function isValidLabel(text) {
    if (!text) return false;
    if (text.length < 2 || text.length > 300) return false;
    if (/^[0-9]+$/.test(text)) return false; // Ignore pure numbers
    return true;
}

function getFieldLabel(element) {
    let label = '';
    const type = element.type;
    const isGroup = type === 'radio' || type === 'checkbox';

    // 0. Platform-Specific Adapter Strategy (Highest Priority)
    if (window.LeverAdapter && window.LeverAdapter.isMatch && window.LeverAdapter.isMatch()) {
        const leverLabel = window.LeverAdapter.findLabel(element);
        if (leverLabel) return leverLabel;
    }

    // 0.5. Visual Label Strategy (The "Human Eye" / Heuristic Accessibility Mapper)
    // Overrides standard labels if they are missing or likely generic
    const visualLabel = getVisualLabel(element);
    if (visualLabel) {
        // Only accept if we don't have a strong explicit label, OR if the visual label is extremely high confidence (question)
        // Actually, let's treat it as high priority because standard labels failing is the root cause here.
        return clean(visualLabel);
    }

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

    // 3b. ARIA DescribedBy (Secondary label/description)
    if (element.hasAttribute('aria-describedby')) {
        const id = element.getAttribute('aria-describedby');
        const descEl = document.getElementById(id);
        if (descEl) {
            const text = clean(descEl.textContent);
            if (text.length > 5 && text.length < 150) return text;
        }
    }

    // 3c. Data Attributes (React/Testing hooks)
    const dataAttrs = ['data-label', 'data-field-name', 'data-testid', 'data-cy'];
    for (const attr of dataAttrs) {
        if (element.hasAttribute(attr)) {
            const val = element.getAttribute(attr);
            if (val && val.length > 3 && val.length < 100) {
                // Return cleaned value: "first-name-input" -> "First Name Input"
                // Avoid returning raw UUIDs or selectors
                if (!/^[a-f0-9-]{20,}$/i.test(val)) {
                    return clean(val.replace(/[-_]/g, ' ').replace(/([A-Z])/g, ' $1'));
                }
            }
        }
    }

    // 4. Deep Parent Search for SPA/React Forms
    // Look for question text in parent containers (common in Ashby, Lever, etc.)
    let parent = element.parentElement;
    const QUESTION_PATTERNS = /\?$|what|where|when|why|how|which|who|are you|do you|have you|please|enter your|provide your/i;
    const EXCLUSION_PATTERNS = /autofill|resume|upload|download|attach|button|submit|cancel/i;

    for (let i = 0; i < 6 && parent && parent.tagName !== 'FORM' && parent.tagName !== 'BODY'; i++) {
        // Look for question-like headers in this parent
        const headers = parent.querySelectorAll('h1, h2, h3, h4, h5, h6, legend, label, .form-label, .field-label, .question');

        for (const header of headers) {
            // Must be BEFORE the element in DOM order
            if (header.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) {
                const text = clean(header.innerText);
                if (text.length > 5 && text.length < 200 && !EXCLUSION_PATTERNS.test(text)) {
                    return text;
                }
            }
        }

        // Check for text directly in parent (for simple structures)
        const directText = Array.from(parent.childNodes)
            .filter(n => n.nodeType === Node.TEXT_NODE)
            .map(n => n.textContent.trim())
            .filter(t => t.length > 5 && t.length < 150 && !EXCLUSION_PATTERNS.test(t))
            .find(t => QUESTION_PATTERNS.test(t));

        if (directText) return clean(directText);

        parent = parent.parentElement;
    }

    // 5. Nearby Text Strategy (Visual Adjacency)
    // Check previous sibling directly
    let prev = element.previousElementSibling;
    if (prev) {
        const prevText = clean(prev.innerText);
        if (prevText.length > 0 && prevText.length < 150 && !EXCLUSION_PATTERNS.test(prevText)) {
            return prevText;
        }
    }

    // 6. Placeholder (Fallback for Text Inputs)
    if (!isGroup && element.placeholder) {
        return clean(element.placeholder);
    }

    // 7. Name/ID Fallback (Last Resort) - but only if looks like a real label
    const fallback = element.name || element.id;
    if (fallback) {
        // Skip UUIDs and random-looking strings or array-like names (cards[...])
        if (/^[a-f0-9-]{20,}$/i.test(fallback) || /\[.*\]/.test(fallback)) {
            return 'Unknown Field'; // Don't use UUID or array syntax as label
        }
        return clean(fallback.replace(/[-_]/g, ' ').replace(/([A-Z])/g, ' $1')); // camelCase -> camel Case
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
    // Build path upwards until unique or hit limit
    let path = '';
    let current = element;

    for (let i = 0; i < 4; i++) { // Increased depth to 4
        const parent = current.parentElement;
        if (!parent || parent.tagName === 'HTML') break;

        let tag = current.tagName.toLowerCase();

        // Add ID if present
        if (current.id && !current.id.match(/\d/)) { // simple alpha IDs only
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

    // If we're here, path is still ambiguous or too generic
    // Only return if it's better than just "input"
    if (path === 'input' || path === 'select' || path === 'textarea') return null; // Fail gracefully instead of returning generic tag
    return path;

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
            !element.closest('[aria-hidden="true"]') // Prevent focus on hidden elements
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
