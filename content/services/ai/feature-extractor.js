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
        const features = [
            // 1. Structural Features (One-Hot / Binary)
            this.isType(field, 'text'),
            this.isType(field, 'number'),
            this.isType(field, 'email'),
            this.isType(field, 'password'),
            this.isType(field, 'tel'),

            // 2. Heuristic Features
            field.label ? 1 : 0,           // Has label?
            field.placeholder ? 1 : 0,     // Has placeholder?
            this.calculateVisualWeight(field),

            // 3. Textual Features (Hashed Bag of Words)
            ...this.hashText(field.label || '', 10),     // First 10 slots for Label
            ...this.hashText(field.name || '', 10),      // Next 10 slots for Name/ID
            ...this.hashText(field.context || '', 5)     // Next 5 slots for Section Context
        ];

        return features;
    }

    // --- Helpers ---

    isType(field, type) {
        return (field.type === type) ? 1.0 : 0.0;
    }

    calculateVisualWeight(field) {
        // Mock visual weight based on DOM data if available
        // In real browser context, we'd use getBoundingClientRect().height
        // Here we approximate importance
        return 1.0;
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
