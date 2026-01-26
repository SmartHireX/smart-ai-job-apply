/**
 * section-detector.js
 * Multi-layer field section context detection system
 * Determines if a field belongs to "education", "work", or other sections
 */

// ============================================
// LAYER 1: Explicit Semantic HTML (Confidence: 10)
// ============================================

/**
 * Detect autocomplete section token
 */
function detectAutocompleteSection(field) {
    const autocomplete = field.getAttribute('autocomplete');
    if (!autocomplete) return null;

    const parts = autocomplete.toLowerCase().split(' ');
    const sectionToken = parts.find(p => p.startsWith('section-'));

    if (!sectionToken) return null;

    if (/education|school|academic/i.test(sectionToken)) {
        return { context: 'education', confidence: 10, method: 'autocomplete' };
    }
    if (/work|job|employment|career/i.test(sectionToken)) {
        return { context: 'work', confidence: 10, method: 'autocomplete' };
    }

    return null;
}

/**
 * Detect fieldset + legend grouping
 */
function detectFieldsetLegend(field) {
    const fieldset = field.closest('fieldset');
    if (!fieldset) return null;

    const legend = fieldset.querySelector('legend');
    if (!legend) return null;

    const text = (legend.innerText || legend.textContent || "").toLowerCase();

    if (/education|school|academic|college|university/i.test(text)) {
        return { context: 'education', confidence: 10, method: 'fieldset' };
    }
    if (/work|employment|job.*history|experience|career/i.test(text)) {
        return { context: 'work', confidence: 10, method: 'fieldset' };
    }

    return null;
}

// ============================================
// LAYER 2: Table Structure (Confidence: 8-9)
// ============================================

/**
 * Detect table caption
 */
function detectTableCaption(field) {
    const table = field.closest('table');
    if (!table) return null;

    const caption = table.querySelector('caption');
    if (!caption) return null;

    const text = (caption.innerText || caption.textContent || "").toLowerCase();

    if (/education|school|academic/i.test(text)) {
        return { context: 'education', confidence: 9, method: 'table-caption' };
    }
    if (/work|employment|job|experience/i.test(text)) {
        return { context: 'work', confidence: 9, method: 'table-caption' };
    }

    return null;
}

/**
 * Analyze table headers with weighted keyword scoring
 */
function detectTableHeaders(field) {
    const table = field.closest('table');
    if (!table) return null;

    const thead = table.querySelector('thead');
    if (!thead) return null;

    const headers = Array.from(thead.querySelectorAll('th'))
        .map(th => (th.innerText || th.textContent || "").toLowerCase())
        .join(' ');

    // Weighted scoring
    const eduScore =
        (headers.match(/school|university|college/gi) || []).length * 3 +
        (headers.match(/degree|major|gpa|qualification/gi) || []).length * 2 +
        (headers.match(/education|academic/gi) || []).length * 1;

    const workScore =
        (headers.match(/employer|company|organization/gi) || []).length * 3 +
        (headers.match(/job|title|position|role/gi) || []).length * 2 +
        (headers.match(/work|employment|experience/gi) || []).length * 1;

    // Require minimum score of 4
    if (eduScore > workScore && eduScore >= 4) {
        return { context: 'education', confidence: 8, method: 'table-headers' };
    }
    if (workScore > eduScore && workScore >= 4) {
        return { context: 'work', confidence: 8, method: 'table-headers' };
    }

    return null;
}

// ============================================
// LAYER 3: Section Headers (Confidence: 7)
// ============================================

/**
 * Find nearest heading above the field with distance decay
 */
function detectSectionHeader(field) {
    let current = field;
    let distance = 0;
    const maxDistance = 15;

    while (current && distance < maxDistance) {
        // Check previous siblings
        let sibling = current.previousElementSibling;
        while (sibling && distance < maxDistance) {
            if (/^H[1-6]$/.test(sibling.tagName)) {
                const text = (sibling.innerText || sibling.textContent || "").toLowerCase();

                // Calculate confidence with distance decay
                const baseConfidence = 7;
                const decayedConfidence = Math.max(3, baseConfidence - (distance * 0.2));

                if (/education|school|academic/i.test(text)) {
                    return {
                        context: 'education',
                        confidence: Math.round(decayedConfidence),
                        method: 'section-header'
                    };
                }
                if (/work|employment|job.*history|experience/i.test(text)) {
                    return {
                        context: 'work',
                        confidence: Math.round(decayedConfidence),
                        method: 'section-header'
                    };
                }

                // Found heading but no match - stop here
                return null;
            }
            sibling = sibling.previousElementSibling;
            distance++;
        }
        current = current.parentElement;
        distance++;
    }

    return null;
}

// ============================================
// LAYER 4: Semantic Containers (Confidence: 5-6)
// ============================================

/**
 * Detect semantic HTML5 section/article elements
 */
function detectSemanticContainer(field) {
    const section = field.closest('section, article');
    if (!section) return null;

    // Check for heading within section
    const heading = section.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4');
    if (heading) {
        const text = (heading.innerText || heading.textContent || "").toLowerCase();

        if (/education|school|academic/i.test(text)) {
            return { context: 'education', confidence: 6, method: 'section-element' };
        }
        if (/work|employment|job|experience/i.test(text)) {
            return { context: 'work', confidence: 6, method: 'section-element' };
        }
    }

    return null;
}

/**
 * Analyze container class/ID attributes
 */
function detectContainerAttributes(field) {
    let current = field;

    for (let i = 0; i < 5; i++) {
        if (!current || current.tagName === 'BODY') break;

        const className = (current.className || '').toLowerCase();
        const id = (current.id || '').toLowerCase();
        const combined = className + ' ' + id;

        // Exact pattern matches (higher confidence)
        if (/^education[-_]?(section|block|container)$/i.test(combined)) {
            return { context: 'education', confidence: 6, method: 'container-attrs' };
        }
        if (/^work[-_]?(history|section|block|container)$/i.test(combined)) {
            return { context: 'work', confidence: 6, method: 'container-attrs' };
        }

        // Partial matches (lower confidence)
        if (/education|school|academic/i.test(combined)) {
            return { context: 'education', confidence: 5, method: 'container-attrs' };
        }
        if (/work|employment|job|experience/i.test(combined)) {
            return { context: 'work', confidence: 5, method: 'container-attrs' };
        }

        current = current.parentElement;
    }

    return null;
}

// ============================================
// LAYER 5: "Add Another" Button (Confidence: 10 - Repeater Capability)
// ============================================

/**
 * Detect "Add Another" button for Repeater Capability
 * Includes Ownership Resolution and Negative Heuristics
 */
function detectAddButton(field) {
    const BUTTON_REGEX = /add\s+(another|more|new|job|education|experience|employ|item|row|entry|position|degree)/i;
    const NEGATIVE_REGEX = /note|comment|explanation|file|attachment|document/i;

    // Helper: Validates button text and infers context
    const analyzeButton = (btn) => {
        const text = (btn.innerText || btn.textContent || "").trim().toLowerCase();
        if (!BUTTON_REGEX.test(text)) return null;
        if (NEGATIVE_REGEX.test(text)) return null;

        if (/education|school|degree|academic/i.test(text)) return 'education';
        if (/job|work|employ|experience|position/i.test(text)) return 'work';
        return 'generic'; // Still a repeater, maybe 'generic' context or fallback
    };

    // Helper: Check ownership (Ownership Resolution)
    // 1. Walk up DOM for role="region" or aria-controls
    // 2. Else, find nearest preceding semantic container
    // For "field" detection, we look if the field is INSIDE a container that "owns" an Add Button.

    let current = field;
    // Walk up to find a container that might have an Add Button
    for (let i = 0; i < 6; i++) {
        if (!current || current.tagName === 'BODY') break;

        // Strategy A: Button INSIDE container (Footer pattern)
        const internalButtons = Array.from(current.querySelectorAll('button, a[role="button"], input[type="button"]'));
        for (const btn of internalButtons) {
            const context = analyzeButton(btn);
            if (context) {
                // Negative Heuristic: Container needs > 1 input to be a "List" ... 
                // BUT for "Latent State" (empty list), we might not have inputs yet. 
                // Since we are detecting for a *field* that exists, we already have 1 instance.
                // So we just return the signal.
                return { context: context === 'generic' ? null : context, confidence: 10, method: 'add-button', isRepeater: true };
            }
        }

        // Strategy B: Button is SIBLING of container (Action Bar pattern)
        let sibling = current.nextElementSibling;
        let checks = 0;
        while (sibling && checks < 3) {
            // Check if sibling IS the button
            if (sibling.tagName === 'BUTTON' || (sibling.tagName === 'A' && sibling.getAttribute('role') === 'button')) {
                const context = analyzeButton(sibling);
                if (context) return { context: context === 'generic' ? null : context, confidence: 10, method: 'add-button-sibling', isRepeater: true };
            }
            // Check if sibling CONTAINS the button (e.g. .actions-div > button)
            const siblingBtn = sibling.querySelector('button, a[role="button"]');
            if (siblingBtn) {
                const context = analyzeButton(siblingBtn);
                if (context) return { context: context === 'generic' ? null : context, confidence: 10, method: 'add-button-sibling', isRepeater: true };
            }
            sibling = sibling.nextElementSibling;
            checks++;
        }

        current = current.parentElement;
    }

    return null;
}

// ============================================
// LAYER 5b: ATS Structure & Array Naming (Confidence: 10)
// ============================================

/**
 * Detect Greenouse/Lever style structures and Array Naming
 */
/**
 * Detect Greenouse/Lever style structures and Array Naming
 * ENHANCED: Also detects BEM-style semantic IDs (e.g. workExperience-6--jobTitle)
 */
function detectATSSignals(field) {
    const parent = field.closest('fieldset, [class*="repeater"], [class*="collection"], [class*="group"]');

    // 1. Semantic ID/Name Analysis (Strongest Signal)
    const identifiers = [field.id, field.name].filter(Boolean);

    for (const str of identifiers) {
        const lower = str.toLowerCase();

        // Check for Array Syntax: jobs[0][title]
        if (/\[\d*\]/.test(lower) || /\[\]/.test(lower)) {
            if (/educ|school|degree|institution/i.test(lower)) return { context: 'education', confidence: 10, method: 'ats-array', isRepeater: true };
            if (/job|work|employ|exp/i.test(lower)) return { context: 'work', confidence: 10, method: 'ats-array', isRepeater: true };
        }

        // Check for Semantic Prefixes/Infixes (Workday style: workExperience-6--jobTitle)
        // Matches: workExperience-, education-, jobHISTORY-, etc.
        if (/work.*exp|job.*hist|employ/i.test(lower)) {
            return { context: 'work', confidence: 10, method: 'semantic-id', isRepeater: true };
        }
        if (/educ|school|degree|academ/i.test(lower)) {
            return { context: 'education', confidence: 10, method: 'semantic-id', isRepeater: true };
        }
    }

    // 2. Fieldset/Repeater Class
    if (parent) {
        const cls = (parent.className || "").toLowerCase();
        if (cls.includes('repeater') || cls.includes('collection')) {
            // We need to know WHAT it repeats. Infer from field or parent text.
            const text = (parent.innerText || "").substring(0, 100).toLowerCase();
            if (/education|school/i.test(text)) return { context: 'education', confidence: 9, method: 'ats-structure', isRepeater: true };
            if (/work|employment|job/i.test(text)) return { context: 'work', confidence: 9, method: 'ats-structure', isRepeater: true };
        }
    }

    return null;
}

// ============================================
// LAYER 5d: Semantic Tuples & Fingerprinting (Confidence: 8)
// ============================================

/**
 * Require Minimum Viable Tuple (Size >= 2) to confirm Intent
 */
function analyzeSectionSemantics(field) {
    const container = field.closest('fieldset, section, article, .group, .row') || field.parentElement;
    if (!container) return null;

    const text = (container.innerText || "").toLowerCase();

    // Work Tuples
    const hasCompany = /company|employer|organization/i.test(text);
    const hasTitle = /title|role|position/i.test(text);
    const hasDate = /date|year/i.test(text);

    if (hasCompany && (hasTitle || hasDate)) {
        return { context: 'work', confidence: 8, method: 'semantic-tuple', isRepeater: true };
    }

    // Edu Tuples
    const hasSchool = /school|university|institution|college/i.test(text);
    const hasDegree = /degree|major|diploma/i.test(text);
    const hasGradDate = /grad|date|year/i.test(text);

    if (hasSchool && (hasDegree || hasGradDate)) {
        return { context: 'education', confidence: 8, method: 'semantic-tuple', isRepeater: true };
    }

    return null;
}

/**
 * Multiset Fingerprinting with Semantic Salt
 */
function computeFingerprint(field) {
    const container = field.closest('fieldset, .repeater-item, .collection-item') || field.parentElement?.parentElement; // Go up 2 levels
    if (!container || container.tagName === 'BODY' || !container.parentElement) return null;

    const siblings = Array.from(container.parentElement.children).filter(c => c !== container && c.tagName === container.tagName);
    if (siblings.length === 0) return null;

    // Helper: Generate multiset hash for a container
    const generateHash = (el) => {
        const inputs = Array.from(el.querySelectorAll('input, select, textarea'));
        const types = inputs.map(i => i.type || i.tagName).sort().join('|'); // Order-independent (Multiset)
        // Semantic Salt (Dominant Context)
        const txt = el.innerText.toLowerCase();
        let salt = 'generic';
        if (/school|degree/i.test(txt)) salt = 'edu';
        else if (/job|company/i.test(txt)) salt = 'work';

        return `${salt}:${types}`;
    };

    const myHash = generateHash(container);
    // Find matching sibling
    const hasMatch = siblings.some(sib => generateHash(sib) === myHash);

    if (hasMatch && myHash.length > 10) { // Avoid empty hashes
        const context = myHash.startsWith('edu') ? 'education' : (myHash.startsWith('work') ? 'work' : 'generic');
        if (context !== 'generic') {
            return { context: context, confidence: 9, method: 'fingerprint', isRepeater: true };
        }
    }

    return null;
}

// ============================================
// LAYER 5c: Negative Domains (Blocking)
// ============================================

/**
 * Block specific domains/keywords from being repeaters
 */
function detectNegativeDomains(field) {
    // 1. Context Check (Parent/Label)
    let current = field;
    let text = "";
    for (let i = 0; i < 3; i++) {
        if (!current || current.tagName === 'BODY') break;
        text += (current.className || "") + " " + (current.id || "") + " ";
        current = current.parentElement;
    }
    const label = (field.label || field.name || "").toLowerCase();
    const context = (text + label).toLowerCase();

    // Block List
    if (/survey|consent|preferences|referral|newsletter|marketing|feedback|questionnaire/i.test(context)) {
        return { context: 'other', confidence: 10, method: 'negative-domain', isBlocked: true };
    }
    return null;
}

// ============================================
// LAYER 6: Field Proximity Clustering (Confidence: 4)
// ============================================

/**
 * Analyze neighboring fields for context clues
 */
function detectFieldCluster(field, allFields) {
    if (!allFields || allFields.length === 0) return null;

    const fieldIndex = allFields.indexOf(field);
    if (fieldIndex === -1) return null;

    const window = 5;
    const start = Math.max(0, fieldIndex - window);
    const end = Math.min(allFields.length, fieldIndex + window + 1);
    const neighbors = allFields.slice(start, end);

    // Get field label helper
    const getLabel = (f) => {
        const text = `${f.name || ''} ${f.label || ''} ${f.placeholder || ''}`.toLowerCase();
        return text;
    };

    const context = neighbors.map(getLabel).join(' ');

    // Count keyword matches
    const eduMatches = context.match(/school|university|degree|major|gpa|college|academic/gi) || [];
    const workMatches = context.match(/employer|company|job|title|position|role|work|employment/gi) || [];

    if (eduMatches.length >= 3 && eduMatches.length > workMatches.length) {
        return { context: 'education', confidence: 4, method: 'field-cluster' };
    }
    if (workMatches.length >= 3 && workMatches.length > eduMatches.length) {
        return { context: 'work', confidence: 4, method: 'field-cluster' };
    }

    return null;
}

// ============================================
// ORCHESTRATOR: Weighted Voting System
// ============================================

/**
 * Main function: Detect field section context using all strategies
 * @param {HTMLElement} field - The DOM element
 * @param {Array} allFields - All fields for clustering analysis (optional)
 * @returns {Object|null} - { context, confidence, methods, reliability }
 */
function detectFieldSectionContext(field, allFields = []) {
    if (!field) return null;

    // Run all detection strategies
    // Negative Domain Check first (Blocking)
    const neg = detectNegativeDomains(field);
    if (neg && neg.isBlocked) return null; // Hard Block

    const detections = [
        detectAutocompleteSection(field),
        detectFieldsetLegend(field),
        detectAddButton(field),
        detectATSSignals(field),
        analyzeSectionSemantics(field), // New Tuple Logic
        computeFingerprint(field),      // New Fingerprint Logic
        detectTableCaption(field),
        detectTableHeaders(field),
        detectSectionHeader(field),
        detectSemanticContainer(field),
        detectContainerAttributes(field),
        detectFieldCluster(field, allFields)
    ].filter(r => r !== null);

    if (detections.length === 0) return null;

    // Weighted voting
    const votes = {};
    detections.forEach(detection => {
        const ctx = detection.context;
        votes[ctx] = (votes[ctx] || 0) + detection.confidence;
    });

    // Find winner
    const entries = Object.entries(votes);
    if (entries.length === 0) return null;

    entries.sort((a, b) => b[1] - a[1]);
    const [winnerContext, winnerScore] = entries[0];

    // Calculate reliability (percentage of total votes)
    const totalVotes = entries.reduce((sum, [_, score]) => sum + score, 0);
    const reliability = winnerScore / totalVotes;

    // Require 60% minimum confidence
    if (reliability < 0.6) return null;

    return {
        context: winnerContext,
        confidence: Math.round(winnerScore),
        methods: detections.filter(d => d.context === winnerContext).map(d => d.method),
        reliability: Math.round(reliability * 100) / 100,
        isRepeater: detections.some(d => d.context === winnerContext && d.isRepeater) // Propagate Repeater Signal
    };
}

/**
 * Find the nearest heading text (Accessibility Tree style context)
 * 1. Fieldset Legend
 * 2. Table Header
 * 3. Nearest Preceding Heading (Reverse DOM Walk)
 * @param {HTMLElement} field
 * @returns {string|null}
 */
/**
 * Find the nearest heading text (Accessibility Tree style context)
 * Priority Ladder:
 * 1. Semantic Headers (H1-H6, role="heading")
 * 2. Fieldset Legend
 * 3. Group Labels (Not associated with field)
 * 4. Table Context
 * 5. Aggressive Sibling Search (Question-like divs)
 * @param {HTMLElement} field
 * @returns {string|null}
 */
function getNearestHeadingText(field) {
    if (!field) return null;

    // Exclusion patterns - common UI elements that are NOT form questions
    const EXCLUSION_PATTERNS = /autofill|resume|upload|download|attach|drag.*drop|browse.*file|supported.*format|pdf|docx|button|submit|cancel|back|next|previous|step \d|page \d|^indicates.*required/i;

    // Question-like patterns (prioritize these)
    const QUESTION_PATTERNS = /\?|what|where|when|why|how|which|who|are you|do you|have you|can you|will you|would you|please|enter|provide|describe|select|choose|years.*experience|tell.*us/i;

    // Helper to validate heading text
    const isValidHeading = (text, element = null) => {
        if (!text || text.length < 3 || text.length > 200) return false;
        if (EXCLUSION_PATTERNS.test(text)) return false;

        // If element is provided, check if it's a generic container rather than a label
        if (element) {
            const cls = (element.className || "").toLowerCase();
            // Ignore field containers that might contain labels of multiple fields or the previous field
            if (cls.includes('field-entry') || cls.includes('form-group') || cls.includes('section-container') || cls.includes('row') || cls.includes('ashby-application-form-field-entry')) {
                return false;
            }
        }
        return true;
    };

    // Helper: Check if a label is associated with the CURRENT field (Control Label)
    const isAssociatedLabel = (label, currentField) => {
        if (label.htmlFor && label.htmlFor === currentField.id) return true;
        if (label.contains(currentField)) return true;
        // In some frameworks, label is a sibling with a specific aria-relation, typically rare but possible.
        // Simple heuristic: If it's a LABEL tag and explicitly has `for` pointing elsewhere, it's definitely NOT for this group (unless it's the group label? No, group labels usually don't have 'for').
        return false;
    };

    // Helper: Check if it's a valid Group Label (Standalone)
    const isGroupLabel = (label, currentField) => {
        // Must NOT be associated with the field
        if (isAssociatedLabel(label, currentField)) return false;
        // Must NOT target another input explicitly (unless we want to chance it, but safer to skip)
        if (label.htmlFor && label.htmlFor !== currentField.id) return false;
        // Must NOT contain another input (unless it's the one we're looking at, which we checked)
        if (label.querySelector('input, select, textarea')) return false;

        return true; // Likely a text-only label acting as a header
    };


    // 1. Traverse up to find Semantically Strong Headers (H1-H6, Legend, Role=Heading)
    // We walk up parents, and for each parent, scan previous siblings.
    let current = field;
    let depth = 0;
    const MAX_DEPTH = 6;
    const MAX_SIBLINGS = 15;

    while (current && current.tagName !== 'BODY' && depth < MAX_DEPTH) {

        // Check Parent for Fieldset Legend immediately
        if (current.tagName === 'FIELDSET') {
            const legend = current.querySelector('legend');
            if (legend) {
                const text = (legend.innerText || legend.textContent || "").trim();
                if (isValidHeading(text, legend)) return text;
            }
        }

        // Check Previous Siblings
        let sibling = current.previousElementSibling;
        let siblingCount = 0;

        while (sibling && siblingCount < MAX_SIBLINGS) {

            // DISTANCE CAP: Stop if we hit another Control (Input/Textarea/Select)
            // This prevents leaking context from a previous field ("Name" label from previous field becoming "Section" for this one)
            const tagName = sibling.tagName;
            if (tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA') {
                // If we hit a raw input, we've likely gone too far in this sibling list.
                // Stop scanning siblings, but continue walking up parents.
                break;
            }
            // Also check if sibling WRAPS a control (standard form-group pattern)
            // Using a cheaper check than querySelectorAll if possible
            if (sibling.querySelector && sibling.querySelector('input, select, textarea')) {
                // But wait! Nesting ATS Case: <label>Work Exp <div><label>Comp</label><input></div></label>
                // If we are INSIDE this sibling, we shouldn't stop.
                // We are currently scanning `current`'s previous siblings. `current` is the ancestor of our field.
                // So `sibling` is completely separate. If `sibling` contains an input, it's a previous question.
                break;
            }


            const text = (sibling.innerText || sibling.textContent || "").trim();

            if (!text) {
                sibling = sibling.previousElementSibling;
                siblingCount++;
                continue;
            }

            // Priority 1: Semantic Heading (H1-H6)
            if (/^H[1-6]$/.test(tagName) || sibling.getAttribute('role') === 'heading') {
                if (isValidHeading(text, sibling)) return text;
            }

            // Priority 2: Group/Section Label
            if (tagName === 'LABEL') {
                // Check if it's a valid Group Label (Not associated with field, no 'for', no input)
                if (isGroupLabel(sibling, field)) {
                    if (isValidHeading(text, sibling)) return text;
                }
                // If associated, we SKIP it (it's a control label)
            }

            // Priority 3: Nested Headings (div > h3)
            const nestedHeader = sibling.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]');
            if (nestedHeader) {
                const hText = (nestedHeader.innerText || nestedHeader.textContent || "").trim();
                if (isValidHeading(hText, nestedHeader)) return hText;
            }

            // Priority 4: "Label-like" divs (Fallback)
            if (sibling.className && typeof sibling.className === 'string') {
                const cls = sibling.className.toLowerCase();
                if (cls.includes('form-label') || cls.includes('field-label') ||
                    cls.includes('question') || cls.includes('form-title')) {
                    // Treat as Group Label candidate
                    if (isValidHeading(text, sibling)) return text;
                }
            }

            sibling = sibling.previousElementSibling;
            siblingCount++;
        }

        current = current.parentElement;
        depth++;
    }

    // 2. Table Context (Secondary)
    const cell = field.closest('td');
    if (cell) {
        const table = field.closest('table');
        if (table) {
            // Try Caption
            const caption = table.querySelector('caption');
            if (caption) {
                const cText = (caption.innerText || caption.textContent || "").trim();
                if (isValidHeading(cText, caption)) return cText;
            }
            // Try Thead
            const header = table.querySelector('th');
            if (header) {
                const hText = (header.innerText || header.textContent || "").trim();
                if (isValidHeading(hText, header)) return hText;
            }
        }
    }

    return null;
}

// Export to window
if (typeof window !== 'undefined') {
    window.SectionDetector = {
        detect: detectFieldSectionContext,
        getNearestHeadingText, // New Export
        // Expose individual layers for testing
        detectAutocompleteSection,
        detectFieldsetLegend,
        detectAddButton,
        detectATSSignals,
        analyzeSectionSemantics,
        computeFingerprint,
        detectNegativeDomains,
        detectTableCaption,
        detectTableHeaders,
        detectSectionHeader,
        detectSemanticContainer,
        detectContainerAttributes,
        detectFieldCluster
    };
}
