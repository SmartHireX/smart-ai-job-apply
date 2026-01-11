/**
 * phase0-classification.js
 * Phase 0: Neural Classification Workflow
 * Classifies all fields using TinyML before processing
 */


/**
 * Phase 0: Neural Classification
 * Runs ML classification on all fields and attaches predictions
 */
class Phase0Classification {
    /**
     * Run neural classification on all fields
     * @param {Array} fields - Array of field objects
     * @returns {Array} Fields with ml_prediction attached
     */
    static async run(fields) {
        if (!window.neuralClassifier) {
            console.warn('⚠️ Neural Classifier not available');
            return fields;
        }

        console.log('🧠 [Phase 0] Running TinyML Classification on all fields...');

        const classificationHash = {}; // Store results in hash map

        fields.forEach(field => {
            const prediction = window.neuralClassifier.predict(field);

            // Add ml_prediction (Primary storage)
            field.ml_prediction = {
                label: prediction.label,
                confidence: prediction.confidence,
                source: prediction.source
            };

            // Store in hash map (Secondary method)
            if (field.selector) {
                classificationHash[field.selector] = prediction;
            }

            // Smart Indexing Injection
            this.attachFieldIndex(field, prediction);
        });

        console.log('🧠 [Phase 0] Classification Complete. Results stored on fields.');

        return fields;
    }

    /**
     * Attach field index for work/education fields
     * @param {Object} field - Field object
     * @param {Object} prediction - ML prediction
     */
    static attachFieldIndex(field, prediction) {
        if (!window.IndexingService || prediction.confidence <= window.NovaConstants.CONFIDENCE.NEURAL_MATCH) {
            return;
        }

        const label = prediction.label;
        let type = null;

        // Determine Type (Work vs Education)
        if (window.NovaConstants.WORK_LABELS.includes(label)) {
            type = 'work';
        } else if (window.NovaConstants.EDUCATION_LABELS.includes(label)) {
            type = 'education';
        }

        if (type) {
            const index = window.IndexingService.getIndex(field, type);
            field.field_index = index;
            console.log(`🎯 [Indexed Field] "${label}" Index: ${index}`, field);
        }
    }

    /**
     * Self-teaching: Train neural network from heuristic matches
     * @param {Array} fields - Fields with predictions
     */
    static selfTeach(fields) {
        if (!window.neuralClassifier) return;

        fields.forEach(field => {
            const prediction = field.ml_prediction;

            // If Heuristics found this (source: 'heuristic_hybrid'), teach the Neural Network
            if (prediction?.source === 'heuristic_hybrid') {
                window.neuralClassifier.train(field, prediction.label);
            }
        });
    }
}

// Global export
window.Phase0Classification = Phase0Classification;

Phase0Classification;
