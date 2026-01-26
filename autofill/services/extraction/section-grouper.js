/**
 * SectionGrouper.js
 * 
 * Identifies and fingerprints repeating container blocks (e.g., job rows, education entries).
 * Moves from Field-Level Inference to Layout-Level Truth.
 */

class SectionGrouper {
    constructor() {
        this.STOP_TAGS = ['FORM', 'BODY', 'HTML'];
        this.STOP_ROLES = ['form', 'main', 'navigation'];
    }

    /**
     * Find the likely "Repeater Row" for a field
     * Closes at form boundaries or semantic stops.
     */
    findRepeaterContainer(element) {
        if (!element) return null;

        let current = element.parentElement;
        let depth = 0;
        const MAX_DEPTH = 8;
        let lastValidRepeater = null;

        while (current && depth < MAX_DEPTH) {
            // Hard Stop check
            if (this.STOP_TAGS.includes(current.tagName)) break;
            const role = current.getAttribute('role');
            if (role && this.STOP_ROLES.includes(role)) break;
            if (current instanceof ShadowRoot) break;

            // Structural check: Does this container have similar siblings?
            if (this.isLikelyRepeaterInstance(current)) {
                lastValidRepeater = current; // Keep track of the highest one found so far
            }

            current = current.parentElement;
            depth++;
        }

        return lastValidRepeater;
    }

    /**
     * Heuristic for identifying a repeated layout primitive.
     * Requires ≥2 similarity matches.
     */
    isLikelyRepeaterInstance(container) {
        const parent = container.parentElement;
        if (!parent) return false;

        const siblings = Array.from(parent.children).filter(c => c !== container);
        if (siblings.length === 0) return false;

        const containerSignature = this.getNodeSignature(container);

        for (const sibling of siblings) {
            let matches = 0;
            const siblingSignature = this.getNodeSignature(sibling);

            // Match 1: TagName
            if (container.tagName === sibling.tagName) matches++;

            // Match 2: Child Input Count (Fuzzy: ±1 to handle optional fields like "Address 2")
            const countDiff = Math.abs(containerSignature.inputCount - siblingSignature.inputCount);
            if (countDiff <= 1 && containerSignature.inputCount > 0) matches++;

            // Match 3: Class overlap (≥60%)
            const overlap = this.calculateClassOverlap(containerSignature.classes, siblingSignature.classes);
            if (overlap >= 0.6) matches++;

            // Match 4: Internal Label Signature (Token overlap)
            const labelOverlap = this.calculateLabelOverlap(containerSignature.labels, siblingSignature.labels);
            if (labelOverlap >= 0.7) matches++;

            if (matches >= 2) return true;
        }

        return false;
    }

    /**
     * Generate a stable fingerprint for a container type.
     * survivors React remounts and CSS hash changes.
     */
    getContainerFingerprint(container, fieldsInContainer = []) {
        if (!container) return null;

        // 1. Tag Path (Relative, trimmed to 3 levels)
        const path = this.getRelativePath(container, 3);

        // 2. Normalized Class Set (Sorted, filtered to exclude numeric hashes)
        const classes = Array.from(container.classList)
            .filter(c => !/\d/.test(c)) // Exclude dynamic/hashed classes
            .sort()
            .join('.');

        // 3. Internal Field Signature (ML label sequence)
        const fieldSignature = fieldsInContainer
            .map(f => f.ml_prediction?.label || f.label || 'unknown')
            .sort()
            .join(',');

        return `${path}[${classes}]|${fieldSignature}`;
    }

    /**
     * Partition fields into structural blocks
     */
    groupFieldsByContainer(fields) {
        const blocks = new Map(); // container_element -> fields[]
        const orphans = [];

        fields.forEach(field => {
            const container = this.findRepeaterContainer(field.element);
            if (container) {
                if (!blocks.has(container)) blocks.set(container, []);
                blocks.get(container).push(field);
            } else {
                orphans.push(field);
            }
        });

        const result = [];

        // Convert blocks to result objects
        blocks.forEach((blockFields, container) => {
            const fingerprint = this.getContainerFingerprint(container, blockFields);
            result.push({
                container,
                fingerprint,
                fields: blockFields,
                top: container.getBoundingClientRect().top
            });
        });

        return { blocks: result, orphans };
    }

    // --- Helpers ---

    getNodeSignature(node) {
        const inputs = node.querySelectorAll('input, select, textarea');
        const labels = Array.from(node.querySelectorAll('label, .label, span')).map(l => l.innerText.toLowerCase().trim());
        return {
            tagName: node.tagName,
            inputCount: inputs.length,
            classes: new Set(node.classList),
            labels: labels.filter(l => l.length > 2)
        };
    }

    calculateClassOverlap(setA, setB) {
        if (setA.size === 0 && setB.size === 0) return 1;
        const intersection = new Set([...setA].filter(x => setB.has(x)));
        return intersection.size / Math.max(setA.size, setB.size);
    }

    calculateLabelOverlap(listA, listB) {
        if (listA.length === 0 && listB.length === 0) return 1;
        const setA = new Set(listA);
        const setB = new Set(listB);
        const intersection = new Set([...setA].filter(x => setB.has(x)));
        return intersection.size / Math.max(setA.size, setB.size);
    }

    getRelativePath(node, maxDepth) {
        const path = [];
        let current = node;
        let depth = 0;
        while (current && depth < maxDepth && current.tagName !== 'BODY') {
            path.unshift(current.tagName.toLowerCase());
            current = current.parentElement;
            depth++;
        }
        return path.join('>');
    }
}

if (typeof window !== 'undefined') {
    window.SectionGrouper = new SectionGrouper();
}
