/**
 * AutofillScanner.js
 * 
 * The backbone of the enterprise form understanding engine.
 * Traverses the DOM in visual order, maintains ScanState, and orchestrates
 * the classification pipeline for each field.
 * 
 * Philosophy:
 * - Sequential processing (Left-to-Right, Top-to-Bottom)
 * - State awareness (Start Date -> End Date)
 * - Hard vetoes before ML
 */

// ScanState is injected globally
// import { ScanState } from './ScanState.js';
// We'll lazy import or inject classifiers to avoid circular deps if needed
// import { HybridClassifier } from '../domains/inference/HybridClassifier.js';

class AutofillScanner {
    constructor(structureAnalyzer, hybridClassifier) {
        this.structureAnalyzer = structureAnalyzer;
        this.classifier = hybridClassifier;
        this.scanState = new ScanState();

        // TIER 0: Hard Veto Patterns (Enterprise Safety)
        this.VETO_PATTERNS = [
            /\b(search|filter|sort|keyword|find)\b/i,
            /\b(captcha|verify|robot|recaptcha|security)\b/i,
            /\b(optional|skip|later)\b/i, // Soft veto in future, hard block for now
            /\b(example|sample|demo)\b/i,
            /\b(why|describe|explain|tell us|elaborate)\b/i, // Block open-ended questions
            /\b(agreement|non[_\-\s]?compete|restrictive|covenant|prevent|prohibit)\b/i, // Legal clauses
            /\b(consent|privacy|policy|terms|condition|data[_\-\s]?processing|marketing|future[_\-\s]?job)\b/i // Compliance
        ];

        // Policy Engine (Phase 4)
        this.policy = window.FillabilityPolicy ? new window.FillabilityPolicy() : null;
    }

    /**
     * Main entry point: Scans a form logic representation.
     * 
     * @param {Object} form - The form object containing fields and structure
     * @param {HTMLElement} formElement - The actual DOM element (optional, for traversal)
     * @returns {Promise<Array>} - Array of classified fields with decisions
     */
    async scan(form) {
        // 1. Sort fields explicitly by visual order (DOM order is usually enough, but strictly ensure)
        // Assuming form.fields is already somewhat ordered, but we can enforce if needed.
        const sortedFields = this._sortFieldsVisually(form.fields);

        const results = [];

        // Reset state for new form
        this.scanState = new ScanState();

        for (const field of sortedFields) {
            // 2. Detect Section Boundary
            // This relies on structureAnalyzer to provide ID/Index of the container
            const sectionInfo = this.structureAnalyzer.getSectionInfo(field);
            this.scanState.onSectionBoundaryChange(sectionInfo.boundaryId, sectionInfo.instanceIndex);

            // 3. Process Field
            const result = await this._processField(field, sectionInfo, sortedFields);

            // 4. Record Decision in State
            if (result.decision === 'fill' || result.decision === 'suggest') {
                this.scanState.recordDecision(result.label, result.category);
            }

            results.push(result);
        }

        return results;
    }

    /**
     * Process a single field through the pipeline.
     * 
     * Pipeline:
     * 1. TIER 0 Veto (Hard Block)
     * 2. ScanState Hints (Date Pairing)
     * 3. Hybrid Classification (Heuristic + Neural + Context)
     * 4. Fillability Policy (Fill/Ask/Ignore)
     */
    async _processField(field, sectionInfo, neighbors = []) {
        // --- STEP 1: TIER 0 VETO ---
        if (this._isVetoed(field)) {
            return this._createResult(field, 'ignore', 1.0, 'veto', 'pattern_block');
        }

        // Init Logic
        if (typeof window.FieldCandidates === 'undefined') {
            console.warn('FieldCandidates not loaded - fallback to unsafe simple classification');
            return { fieldId: field.id, label: 'unknown', confidence: 0, decision: 'ignore' };
        }
        const candidates = new window.FieldCandidates();

        // --- STEP 2: CONTEXT EXTRACTION (Phase 3) ---
        if (window.ContextFeatureExtractor) {
            const extractor = new window.ContextFeatureExtractor();
            field.contextFeatures = extractor.extract(field, this.scanState, neighbors);
        }
        console.log('in get auto fill scanner')
        // --- STEP 3: HYPOTHESIS COLLECTION ---
        // Get raw signals from ML/Heuristics
        // Use getHypotheses if available, otherwise fallback to classify (legacy support)
        if (this.classifier.getHypotheses) {
            const { heuristic, neural } = await this.classifier.getHypotheses(field);
            candidates.addCandidate(heuristic.label, heuristic.confidence, heuristic.source);
            candidates.addCandidate(neural.label, neural.confidence, neural.source);
        } else {
            const result = await this.classifier.classify(field);
            candidates.addCandidate(result.label, result.confidence, result.source);
        }

        // --- STEP 3: SCAN STATE SIGNALS ---
        const stateLabel = this.scanState.getDateLabel(sectionInfo.type);
        if (stateLabel && stateLabel !== 'unknown') {
            // High confidence signal from structural position
            candidates.addCandidate(stateLabel, 0.95, 'scan_sequence');
        }

        // --- STEP 4: ARBITRATION ---
        // Relax margin for high-priority legal fields (Work Auth, Sponsorship)
        // These often have confused neural signals but strong heuristics.
        let minMargin = 0.15;
        const topHypothesis = candidates.getBestCandidate(0.00); // Probe without margin filter
        if (['work_auth', 'sponsorship'].includes(topHypothesis.label)) {
            minMargin = 0.02;
        }

        const best = candidates.getBestCandidate(minMargin);

        // --- STEP 5: FILLABILITY POLICY (Phase 4) ---
        if (this.policy) {
            const labelQuality = field.contextFeatures?.labelQuality ?? 1.0;

            // Conflict Logic: Did ScanState disagree with ML?
            let conflict = false;
            if (stateLabel && stateLabel !== 'unknown' && best.label !== 'unknown') {
                if (best.label !== stateLabel) conflict = true;
            }

            const policyResult = this.policy.evaluate(best, labelQuality, { conflict });

            return this._createResult(field, policyResult.decision, policyResult.confidence, best.label, policyResult.reason);
        }

        // Fallback (Legacy/Simple)
        if (best.label === 'unknown') {
            return this._createResult(field, 'ignore', best.score, 'unknown', best.reason);
        }

        // --- STEP 6: BOOLEAN FALLBACK (Workday/Custom Widgets) ---
        // If it's a legal question with sparse options, inject standard Yes/No candidates
        if (['work_auth', 'sponsorship'].includes(best.label)) {
            field.options = field.options || [];
            const hasYes = field.options.some(opt => /yes/i.test(opt.text || opt.value));
            const hasNo = field.options.some(opt => /no/i.test(opt.text || opt.value));

            if (!hasYes) field.options.push({ value: 'yes', text: 'Yes' });
            if (!hasNo) field.options.push({ value: 'no', text: 'No' });

            // console.log(`🛠️ [Scanner] Injected boolean fallback for ${best.label}`);
        }

        return this._createResult(field, 'fill', best.score, best.label, 'candidates_consensus');
    }

    _isVetoed(field) {
        // Check name, id, label, placeholder against veto patterns
        const textToCheck = [
            field.name,
            field.id,
            field.label,
            field.placeholder,
            field.ariaLabel
        ].filter(Boolean).join(' ');

        // Guard: 'optional' and 'skip' should only veto if they are the primary intent of the field
        // If they are part of a longer descriptive label (e.g. "Github Profile (Optional)"), they should not veto.
        const softVetoPattern = /\b(optional|skip|later)\b/i;
        if (softVetoPattern.test(textToCheck) && textToCheck.length > 20) {
            // Filter patterns to check everything EXCEPT the soft veto markers
            const otherVetoes = this.VETO_PATTERNS.filter(p => p.toString() !== softVetoPattern.toString());
            return otherVetoes.some(p => p.test(textToCheck));
        }

        return this.VETO_PATTERNS.some(p => p.test(textToCheck));
    }

    _sortFieldsVisually(fields) {
        if (!fields || fields.length === 0) return [];

        // Create a copy to avoid mutating the original array if it matters
        return [...fields].sort((a, b) => {
            // If elements are missing, preserve order
            if (!a.element || !b.element) return 0;

            // bitmask: 2 = precedes, 4 = follows
            const position = a.element.compareDocumentPosition(b.element);

            if (position & 2) return 1; // b precedes a -> swap
            if (position & 4) return -1; // b follows a -> correct
            return 0;
        });
    }

    _createResult(field, decision, confidence, label, reason) {
        return {
            fieldId: field.id || '',
            fieldName: field.name || '',
            instanceUid: field.instance_uid || '',
            label: label,
            confidence: confidence,
            decision: decision,
            reason: reason
        };
    }
}

if (typeof window !== 'undefined') window.AutofillScanner = AutofillScanner;
