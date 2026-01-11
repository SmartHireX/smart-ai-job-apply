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

    const text = legend.innerText.toLowerCase();

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

    const text = caption.innerText.toLowerCase();

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
        .map(th => th.innerText.toLowerCase())
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
                const text = sibling.innerText.toLowerCase();

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
        const text = heading.innerText.toLowerCase();

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
    const detections = [
        detectAutocompleteSection(field),
        detectFieldsetLegend(field),
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
        reliability: Math.round(reliability * 100) / 100
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
function getNearestHeadingText(field) {
    if (!field) return null;

    // 1. Fieldset Legend (Strongest Grouping)
    const fieldset = field.closest('fieldset');
    if (fieldset) {
        const legend = fieldset.querySelector('legend');
        if (legend && legend.innerText.trim()) return legend.innerText.trim();
    }

    // 2. Table Context
    const cell = field.closest('td');
    if (cell) {
        // Try Row Header
        const row = cell.parentElement;
        if (row && row.tagName === 'TR') {
            const header = row.querySelector('th');
            if (header && header.innerText.trim()) return header.innerText.trim();
        }

        // Try Table Caption
        const table = field.closest('table');
        if (table) {
            const caption = table.querySelector('caption');
            if (caption && caption.innerText.trim()) return caption.innerText.trim();
        }
    }

    // 3. Reverse DOM Walk (The "Fang" Way)
    // Walk up parents, and for each parent, scan previous siblings for H1-H6
    let current = field;
    let depth = 0;
    const MAX_DEPTH = 5; // Don't look at whole page
    const MAX_SIBLINGS = 15; // Scan generous amount of siblings

    while (current && current.tagName !== 'BODY' && depth < MAX_DEPTH) {
        let sibling = current.previousElementSibling;
        let siblingCount = 0;

        while (sibling && siblingCount < MAX_SIBLINGS) {
            // Check if sibling IS a Header
            if (/^H[1-6]$/.test(sibling.tagName)) {
                return sibling.innerText.trim();
            }

            // Check if sibling CONTAINS a Header (e.g., <div class="header"><h3>Title</h3></div>)
            // Limit query to direct children or shallow depth to be fast
            const nestedHeader = sibling.querySelector('h1, h2, h3, h4, h5, h6');
            if (nestedHeader) {
                return nestedHeader.innerText.trim();
            }

            // Special Case: "Label-like" divs (common in modern frameworks)
            // <div class="section-label">Job Preferences</div>
            if (sibling.className && typeof sibling.className === 'string' &&
                (sibling.className.includes('label') || sibling.className.includes('title') || sibling.className.includes('header'))) {
                if (sibling.innerText.length < 50) return sibling.innerText.trim();
            }

            sibling = sibling.previousElementSibling;
            siblingCount++;
        }

        current = current.parentElement;
        depth++;
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
        detectTableCaption,
        detectTableHeaders,
        detectSectionHeader,
        detectSemanticContainer,
        detectContainerAttributes,
        detectFieldCluster
    };
}
