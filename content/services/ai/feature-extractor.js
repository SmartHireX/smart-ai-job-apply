/**
 * FeatureExtractor
 * Converts raw form fields into numerical vectors for the Neural Classifier.
 * Features:
 * 1. Label Keywords (Bag of Words hashing)
 * 2. Attribute clues (Type, Name, ID)
 * 3. Contextual Neighbors (Preceding text)
 * 4. Geometric properties (First field, visual weight)
 */

class FeatureExtractor {
    constructor() {
        // Simple hashing space for "Bag of Words"
        this.VOCAB_SIZE = 100;
    }

    /**
     * Vectorize a field object into an array of numbers
     * @param {Object} field - The field object constructed by FormExtractor
     * @returns {Array<number>} Input vector for the model
     */
    extract(field) {
        // Safety check: Ensure field is effectively an object
        if (!field) return new Array(this.VOCAB_SIZE + 20).fill(0); // Return empty vector

        // Helper to safely get attribute
        const getAttr = (attr) => (field.getAttribute && typeof field.getAttribute === 'function') ? field.getAttribute(attr) : (field[attr] || null);

        // AXTree: Calculate the "Computed Name" (What a Screen Reader hears)
        const computedLabel = this.getComputedLabel(field);
        const computedRole = getAttr('role') || (field.tagName ? field.tagName.toLowerCase() : (field.type || 'text'));

        const features = [
            // 1. Structural Features (One-Hot / Binary)
            this.isType(field, 'text'),
            this.isType(field, 'number'),
            this.isType(field, 'email'),
            this.isType(field, 'password'),
            this.isType(field, 'tel'),

            // 2. Heuristic Features
            computedLabel ? 1 : 0,           // Has accessible label?
            field.placeholder ? 1 : 0,       // Has placeholder?
            this.calculateVisualWeight(field),
            (computedRole === 'combobox' || computedRole === 'listbox') ? 1 : 0, // Is complex select?

            // 3. Textual Features (Hashed Bag of Words)
            // WE NOW USE THE COMPUTED ACCESSIBILITY LABEL INSTEAD OF JUST DOM LABEL
            ...this.hashText(computedLabel || '', 10),   // First 10 slots for Label
            ...this.hashText(field.name || '', 10),      // Next 10 slots for Name/ID
            // Handle context (can be on object or DOM attribute)
            ...this.hashText(getAttr('context') || field.context || '', 5)     // Next 5 slots for Section Context
        ];

        return features;
    }

    // --- ACCESSIBILITY TREE HELPER ---

    /**
     * Imitates the browser's Accessibility API to find the "Accessible Name"
     * Precedence: aria-labelledby > aria-label > <label for=""> > placeholder > title
     */
    getComputedLabel(field) {
        // Check for DOM capability
        const isDOM = typeof field.hasAttribute === 'function';

        // 1. aria-labelledby (Points to another ID)
        if (isDOM && field.hasAttribute('aria-labelledby')) {
            const id = field.getAttribute('aria-labelledby');
            const labelEl = document.getElementById(id);
            if (labelEl) return labelEl.innerText.trim();
        }

        // 2. aria-label (Direct override)
        if (isDOM && field.hasAttribute('aria-label')) {
            return field.getAttribute('aria-label').trim();
        }

        // 3. Explicit <label for="id"> (Passed from FormScanner usually, but double check)
        if (field.labels && field.labels.length > 0) {
            return Array.from(field.labels).map(l => l.innerText).join(' ').trim();
        }

        // 4. Implicit Wrapper <label><input></label>
        // (Handled by field.labels usually)

        // 5. Fallback to passed label from Scanner (Common for plain objects)
        if (field.label) return field.label;

        // 6. Placeholder / Title (Weakest signals)
        // Handle both DOM and Object property access
        const placeholder = field.placeholder || (isDOM ? field.getAttribute('placeholder') : '');
        const title = field.title || (isDOM ? field.getAttribute('title') : '');

        return placeholder || title || '';
    }

    // --- Helpers ---

    isType(field, type) {
        // Handle both DOM 'type' property and object 'type' property
        const t = (field.type || '').toLowerCase();
        return (t === type) ? 1.0 : 0.0;
    }

    // --- GEOMETRIC HEURISTICS ---

    calculateVisualWeight(field) {
        // Mock default for simulated environment or plain objects
        if (typeof field.getBoundingClientRect !== 'function') return 0.5;

        const rect = field.getBoundingClientRect();

        // 1. Visibility Check
        if (rect.width === 0 || rect.height === 0 || field.style.display === 'none') {
            return 0.0; // Invisible fields (Honeypots)
        }

        // 2. Prominence (Bigger is often more important)
        const area = rect.width * rect.height;
        const screenArea = window.innerWidth * window.innerHeight;
        const relativeSize = Math.min(area / (screenArea * 0.05), 1.0); // Cap at 5% screen space

        // 3. Position (Top of form is usually Name/Email)
        // Normalize Y position (0 = top, 1 = bottom)
        const relativeY = Math.min(rect.top / window.innerHeight, 1.0);
        const positionScore = 1.0 - relativeY;

        // Combine: Size (30%) + Position (70%)
        return (relativeSize * 0.3) + (positionScore * 0.7);
    }

    /**
     * Simple hashing trick (MurmurHash-like) to map text to fixed vector slots
     * Prevents needing a massive dictionary file.
     * STRATEGY: Strip numbers so "job_title_0" and "job_title_1" map to SAME vector.
     */
    hashText(text, slots) {
        const vector = new Array(slots).fill(0);

        // Remove digits to treat "employer_1" identical to "employer_2"
        const cleanText = text.replace(/\d+/g, '');

        const words = cleanText.toLowerCase().split(/\W+/).filter(w => w.length > 2);

        words.forEach(word => {
            let hash = 0;
            for (let i = 0; i < word.length; i++) {
                hash = ((hash << 5) - hash) + word.charCodeAt(i);
                hash |= 0; // Convert to 32bit integer
            }
            const index = Math.abs(hash) % slots;
            vector[index] = 1.0; // Mark slot as active
        });

        return vector;
    }
}

// Export
if (typeof window !== 'undefined') window.FeatureExtractor = FeatureExtractor;
if (typeof module !== 'undefined') module.exports = FeatureExtractor;
