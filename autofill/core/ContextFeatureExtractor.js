/**
 * ContextFeatureExtractor.js
 * 
 * Extracts a 12-dimension feature vector for Context-Aware Classification.
 * Focuses on signals 'outside' the field itself (structure, sequence, layout).
 * 
 * Target Features:
 * [0] Section Type (enum)
 * [1] Section Confidence (float)
 * [2] Heading Proximity (enum)
 * [3] Preceding Has Question (bool)
 * [4] Preceding Has Colon (bool)
 * [5] Is First in Group (bool)
 * [6] Is Last in Group (bool)
 * [7] Previous Field Label (enum)
 * [8] Label Quality Score (float)
 * [9] Feature Coverage (float)
 * [10] Has Date Sibling (bool)
 * [11] Has Pair Sibling (bool)
 */

class ContextFeatureExtractor {

    extract(field, scanState, neighbors = []) {
        const vec = {};

        // 0-1. Section Context
        vec.sectionType = this._encodeSectionType(field.section_type || 'generic');
        vec.sectionConfidence = field.sectionConfidence || 0.5;

        // 2. Heading Proximity
        // Assuming SectionDetector provides 'method' or we check DOM
        vec.headingProximity = this._calculateHeadingProximity(field);

        // 3-4. Preceding Text Signals
        const precedingText = this._getPrecedingText(field);
        vec.precedingQuestion = /\?|what|where|when/i.test(precedingText);
        vec.precedingColon = /:$/.test(precedingText.trim());

        // 5-6. Group Position
        vec.isFirstInGroup = field.field_index === 0;

        // NEW: isLastInGroup detection
        if (neighbors && neighbors.length > 0) {
            const sameInstance = neighbors.filter(n => n.instance_uid === field.instance_uid);
            if (sameInstance.length > 0) {
                const myIndex = sameInstance.findIndex(n => n.id === field.id);
                vec.isLastInGroup = myIndex !== -1 && myIndex === sameInstance.length - 1;
            } else {
                vec.isLastInGroup = false;
            }
        } else {
            vec.isLastInGroup = false;
        }

        // 7. Sequence (History)
        vec.prevLabel = scanState ? this._encodeLabel(scanState.lastAcceptedLabel) : 'none';

        // 8. Label Quality
        vec.labelQuality = this._calculateLabelQuality(field);

        // 9. Feature Coverage
        const features = [
            field.section_type,
            field.sectionConfidence,
            field.parentContext,
            field.label,
            field.id,
            field.placeholder
        ].filter(Boolean).length;
        vec.coverage = features / 6;

        // 10-11. Sibling Patterns
        vec.hasDateSibling = this._hasSibling(neighbors, /date|year|month/i);
        vec.hasPairSibling = this._hasSibling(neighbors, /start|end|from|to/i);

        return vec;
    }

    _encodeSectionType(type) {
        const map = { 'personal': 1, 'work': 2, 'education': 3, 'compensation': 4, 'generic': 0 };
        return map[type] || 0;
    }

    _encodeLabel(label) {
        const map = { 'start_date': 1, 'end_date': 2, 'company': 3, 'school': 4, 'title': 5 };
        return map[label] || 0; // 'other'
    }

    _calculateHeadingProximity(field) {
        // 0=same_container, 1=adjacent, 2=distant, 3=none
        // Simplified heuristic based on DOM
        if (field.parentContext) return 0; // Found via structure
        return 3;
    }

    _getPrecedingText(field) {
        if (!field.element) return '';
        // Rough accessibility tree simulation
        const prev = field.element.previousElementSibling;
        return prev ? (prev.innerText || '') : '';
    }

    _calculateLabelQuality(field) {
        let score = 0.4;
        if (field.label && field.element && field.element.labels && field.element.labels.length > 0) score = 1.0; // Explicit
        else if (field.ariaLabel) score = 0.9;
        else if (field.placeholder) score = 0.6;

        const labelText = (field.label || field.ariaLabel || field.placeholder || '').trim();

        // Question Penalty: Full questions are usually NOT atomic fields
        // EXCEPTION: Legal questions (Work Auth, Sponsorship) are naturally questions
        const isLegalQuestion = /sponsorship|authorization|right[_\-\s]?to[_\-\s]?work|visa/i.test(labelText);

        if (!isLegalQuestion && (labelText.includes('?') || /^(do|are|have|will|can|please)\b/i.test(labelText))) {
            score *= 0.7;
        }

        // Length Penalty: Atomic fields shouldn't have paragraph-long labels
        if (!isLegalQuestion && labelText.length > 100) {
            score *= 0.5; // High penalty for clauses
        } else if (!isLegalQuestion && labelText.length > 60) {
            score *= 0.8; // Moderate penalty for long questions
        }

        return score;
    }

    _hasSibling(neighbors, regex) {
        if (!neighbors || neighbors.length === 0) return false;
        return neighbors.some(n => {
            const l = (n.name || n.label || '').toLowerCase();
            return regex.test(l);
        });
    }
}

if (typeof window !== 'undefined') window.ContextFeatureExtractor = ContextFeatureExtractor;
