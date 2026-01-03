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

    // 0. Group Label (Legend) - Highest Priority for Radios/Checkboxes
    if (isGroup) {
        const fieldset = element.closest('fieldset');
        if (fieldset) {
            const legend = fieldset.querySelector('legend');
            if (legend && legend.innerText.trim().length > 0) {
                return legend.innerText.trim();
            }
        }
    }

    // 1. Explicit Label
    if (element.labels && element.labels[0]) {
        label = element.labels[0].textContent;
    }
    // 2. Aria Label
    if (!label && element.getAttribute('aria-label')) {
        label = element.getAttribute('aria-label');
    }
    // 3. Placeholder
    if (!label && element.placeholder) {
        label = element.placeholder;
    }
    // 4. Name/ID (secondary fallback)
    if (!label) {
        label = (element.name || element.id || '').replace(/[_-]/g, ' ');
    }

    // 5. Parent Text Fallback (Crucial for Textareas without distinct labels)
    if ((!label || label.length < 3) && element.parentElement) {
        if (!isGroup) {
            const parentText = element.parentElement.innerText || '';
            const cleanText = parentText.replace(element.value || '', '').trim();
            if (cleanText.length > 0 && cleanText.length < 100) {
                label = cleanText;
            }
        }
    }

    return label.trim() || 'Field';
}

function getElementSelector(element) {
    if (element.id) {
        return `#${CSS.escape(element.id)}`;
    }
    if (element.name) {
        if ((element.type === 'radio' || element.type === 'checkbox') && element.value) {
            return `input[name="${CSS.escape(element.name)}"][value="${CSS.escape(element.value)}"]`;
        }
        return `input[name="${CSS.escape(element.name)}"]`;
    }
    // Fallback: use tag + nth-of-type
    const parent = element.parentElement;
    if (parent) {
        const siblings = Array.from(parent.children).filter(child =>
            child.tagName === element.tagName
        );
        const index = siblings.indexOf(element) + 1;
        return `${element.tagName.toLowerCase()}:nth-of-type(${index})`;
    }
    return element.tagName.toLowerCase();
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
