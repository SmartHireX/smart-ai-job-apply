/**
 * FieldCandidates.js
 * 
 * Accumulates identification hypotheses from multiple sources (Heuristic, Neural, Context).
 * Performs deterministic arbitration using best-score wins + margin validation.
 * 
 * Enterprise Logic:
 * - Max score per label (no additive noise)
 * - Source tracking for audit
 * - Normalized margin checks to prevent low-confidence guessing
 */

class FieldCandidates {
    constructor() {
        this.candidates = new Map(); // label → { score, sources: [] }
    }

    /**
     * Add a hypothesis from a classifier
     * @param {string} label - The predicted label (e.g. 'start_date')
     * @param {number} score - Confidence score (0.0 - 1.0)
     * @param {string} source - Origin of prediction (e.g. 'heuristic', 'neural_v8')
     */
    addCandidate(label, score, source) {
        if (!label || label === 'unknown') return;

        const existing = this.candidates.get(label) || { score: 0, sources: [] };

        // Logic: Keep the HIGHEST score for this label (don't sum weak signals)
        if (score > existing.score) {
            existing.score = score;
        }

        // Track all sources that voted for this label
        existing.sources.push(source);

        this.candidates.set(label, existing);
    }

    /**
     * Apply a boost to a specific label (e.g. from Context or ScanState)
     * @param {string} label 
     * @param {number} multiplier 
     */
    applyContextBoost(label, multiplier) {
        const existing = this.candidates.get(label);
        if (existing) {
            existing.score = Math.min(1.0, existing.score * multiplier);
            existing.sources.push('context_boost');
        }
    }

    /**
     * Get the winning label with margin validation
     * @param {number} minMargin - Minimum normalized margin required (default 0.15)
     * @returns {Object} { label, score, sources, reason? }
     */
    getBestCandidate(minMargin = 0.15) {
        // 1. Sort by Score Descending
        const sorted = [...this.candidates.entries()]
            .sort((a, b) => b[1].score - a[1].score);

        // Case: No candidates
        if (sorted.length === 0) {
            return { label: 'unknown', score: 0, reason: 'no_candidates' };
        }

        const [topLabel, topData] = sorted[0];

        // Case: Single candidate (automatic win if above threshold? let caller decide)
        if (sorted.length === 1) {
            return { label: topLabel, score: topData.score, sources: topData.sources };
        }

        // Case: Multiple candidates - Check Margin
        const secondScore = sorted[1][1].score;

        // CRITICAL FIX: Normalized margin
        // Avoids false confidence when top=0.02 and second=0.01
        const margin = (topData.score - secondScore) / Math.max(topData.score, 0.01);

        if (margin < minMargin) {
            return {
                label: 'unknown',
                score: topData.score,
                reason: 'low_margin',
                debug: { top: topLabel, second: sorted[1][0], margin }
            };
        }

        return { label: topLabel, score: topData.score, sources: topData.sources };
    }
}

if (typeof window !== 'undefined') window.FieldCandidates = FieldCandidates;
