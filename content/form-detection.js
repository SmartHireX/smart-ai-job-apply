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
        console.log('🧠 Using cached job context');
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
                        console.log('🧠 ✅ Extracted from JSON-LD');
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
                    console.log('🧠 ✅ Extracted from Greenhouse selectors');
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
                    console.log('🧠 ✅ Extracted from Lever selectors');
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
                    console.log('🧠 ✅ Extracted from Workday selectors');
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
        console.log('🧠 ⚠️ Extracted from semantic fallback');
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
    return document.querySelectorAll('form, [role="form"], [data-automation-id="form-container"]');
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
        // 0a. Fieldset Legend
        const fieldset = element.closest('fieldset');
        if (fieldset) {
            const legend = fieldset.querySelector('legend');
            if (legend) return clean(legend.innerText);
        }

        // 0b. Container Header Strategy (Common in React/Div soups)
        // Look up up to 3 parents
        let parent = element.parentElement;
        for (let i = 0; i < 3; i++) {
            if (!parent || parent.tagName === 'FORM' || parent.tagName === 'BODY') break;

            // Look for a preceding sibling that looks like a label (h* tag, label, or bold span)
            let sibling = parent.previousElementSibling;
            if (sibling) {
                // Heuristic: Short text, header, or 'label' class
                const text = clean(sibling.innerText);
                if (text.length > 2 && text.length < 150) {
                    // Strong signal: Heading tag or explicit class
                    if (/H[1-6]|LABEL|LEGEND/.test(sibling.tagName) ||
                        (sibling.className && typeof sibling.className === 'string' && sibling.className.toLowerCase().includes('label'))) {
                        return text;
                    }
                    // Medium signal: Just text before a likely group container
                    return text;
                }
            }

            // Look for a distinct header INSIDE the parent (if it's a wrapper)
            const internalHeader = parent.querySelector('h1, h2, h3, h4, h5, h6, label, .label, .question');
            if (internalHeader && !internalHeader.contains(element)) {
                return clean(internalHeader.innerText);
            }

            parent = parent.parentElement;
        }
    }

    // 1. Explicit Label (Standard)
    if (element.labels && element.labels.length > 0) {
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

    // 4. Placeholder (for Text Inputs)
    if (!isGroup && element.placeholder) {
        return clean(element.placeholder);
    }

    // 5. Nearby Text Strategy (Visual Adjacency for non-groups or failed groups)
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

    // 6. Name/ID Fallback (Last Resort)
    const fallback = element.name || element.id;
    if (fallback) {
        return clean(fallback.replace(/[-_]/g, ' ').replace(/([A-Z])/g, ' $1')); // camelCaese -> camel Case
    }

    return 'Unknown Field';
}

function getElementSelector(element) {
    // 1. ID - The Gold Standard (if valid and not dynamic gibberish)
    if (element.id && !/\d{5,}/.test(element.id)) { // Avoid auto-generated IDs like "input-12345"
        return `#${CSS.escape(element.id)}`;
    }

    // 2. Stable QA/Automation Attributes ("FANG" style)
    const attributes = ['data-testid', 'data-cy', 'data-automation-id', 'name'];
    for (const attr of attributes) {
        if (element.hasAttribute(attr)) {
            const val = element.getAttribute(attr);
            if (attr === 'name') {
                // Special handling for Radio/Checkbox groups
                if ((element.type === 'radio' || element.type === 'checkbox') && element.value) {
                    return `input[name="${CSS.escape(val)}"][value="${CSS.escape(element.value)}"]`;
                }
                return `input[name="${CSS.escape(val)}"]`;
            }
            return `[${attr}="${CSS.escape(val)}"]`;
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
