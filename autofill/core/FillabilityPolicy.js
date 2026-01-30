/**
 * FillabilityPolicy.js
 * 
 * "Separation of Classification vs Fillability"
 * 
 * Determines WHAT to do with a prediction (Fill, Suggest, Ask, Ignore)
 * based on confidence, label quality, and enterprise safety thresholds.
 * 
 * Enterprise Logic:
 * - Placeholders are weak (downgrade confidence)
 * - Explicit Labels are strong (preserve confidence)
 * - Veto is absolute
 */

class FillabilityPolicy {
    constructor(thresholds = { autoFill: 0.90, suggest: 0.75, ask: 0.50 }) {
        this.thresholds = thresholds;
    }

    /**
     * Evaluate whether to fill a field
     * @param {Object} candidateResult - Best candidate { label, score, reason }
     * @param {number} labelQuality - 0.0 to 1.0 (from ContextFeatureExtractor)
     * @param {Object} contextSupport - { conflict: boolean }
     * @returns {Object} { decision: 'fill'|'suggest'|'ask'|'ignore'|'veto', confidence, reason }
     */
    evaluate(candidateResult, labelQuality = 1.0, contextSupport = {}) {
        // 1. Absolute Veto Check
        if (candidateResult.tier === 'veto' || candidateResult.label === 'unknown') {
            return { decision: 'ignore', confidence: 0, reason: candidateResult.reason || 'unknown_or_veto' };
        }

        // 2. Calculate Effective Confidence (Multiplicative Safety)
        // Base Score * Label Quality Factor * Context Factor

        const contextFactor = contextSupport.conflict ? 0.5 : 1.0;

        // If prediction is 'scan_sequence' (ScanState), we assume it's structurally verified (quality 1.0 effectively for that signal)
        // But if it came from ML, we penalize by visual label quality.
        let qualityFactor = labelQuality;

        // Exception: If ML is VERY confident (>0.98), maybe we trust it even if label is weak (placeholder)?
        // Chromium policy: Trust explicit labels.
        // For now, strict multiplicative:

        const fillConfidence = candidateResult.score * qualityFactor * contextFactor;

        // 3. Decision Logic
        let decision = 'ignore';
        if (fillConfidence >= this.thresholds.autoFill) decision = 'fill';
        else if (fillConfidence >= this.thresholds.suggest) decision = 'suggest';
        else if (fillConfidence >= this.thresholds.ask) decision = 'ask';

        // 4. Soft Veto (Safety Downgrade)
        // If the visual label is weak (placeholder/none) AND we aren't at extreme confidence,
        // we downgrade from 'fill' to 'suggest' to be safe.
        if (decision === 'fill' && labelQuality < 0.5 && fillConfidence < 0.95) {
            return {
                decision: 'suggest',
                confidence: fillConfidence,
                reason: 'soft_veto_low_quality_label'
            };
        }

        return {
            decision: decision,
            confidence: fillConfidence,
            reason: decision === 'ignore' ? 'below_threshold' : 'policy_consensus'
        };
    }
}

if (typeof window !== 'undefined') window.FillabilityPolicy = FillabilityPolicy;
