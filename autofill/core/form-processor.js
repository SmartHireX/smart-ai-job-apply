/**
 * form-processor.js
 * Main orchestrator for two-phase form filling workflow
 * Coordinates Phase 0 (Classification), Phase 1 (Instant Fill), and Phase 2 (AI Processing)
 */


/**
 * Form Processor
 * Main orchestrator for two-phase form filling workflow
 */
class FormProcessor {
    /**
     * Process form on current page
     * @returns {Promise<void>}
     */
    static async process() {
        console.log('🚀 [FormProcessor] Starting form processing...');

        // Show processing widget
        if (typeof window.showProcessingWidget === 'function') {
            window.showProcessingWidget('Instant Match...', 1);
        }

        try {
            // Execute FANG-Level FieldRouter Pipeline
            await this.executeFieldRouterPipeline();

            console.log('✅ [FormProcessor] Processing complete');

        } catch (error) {
            console.error('❌ [FormProcessor] Processing failed:', error);
            // ...
        } finally {
            // Always cleanup
            setTimeout(() => {
                if (typeof window.removeProcessingWidget === 'function') {
                    window.removeProcessingWidget();
                }
            }, 800);

            if (typeof window.activateSmartMemoryLearning === 'function') {
                window.activateSmartMemoryLearning();
            }

            chrome.runtime.sendMessage({ type: 'FILL_COMPLETE' });
        }
    }

    /**
     * Execute the Main FieldRouter Pipeline
     */
    static async executeFieldRouterPipeline() {
        console.log('🚀 [FormProcessor] Starting FANG-Level Pipeline (Stealth Mode)...');

        // Initialize neural classifier
        if (!window.neuralClassifier) {
            window.neuralClassifier = new window.NeuralClassifier();
            await window.neuralClassifier.init();
        }

        // Get context
        const [resumeData, smartMemory] = await Promise.all([
            window.ResumeManager.getResumeData(),
            window.SmartMemoryService ? window.SmartMemoryService.getAll() : {} // Direct access if possible, or use MemoryUtils
        ]);

        // Ensure SmartMemoryService is ready (it initializes itself usually, but good to check)

        if (!resumeData) throw new Error('Resume data missing');
        this.normalizeResumeSchema(resumeData);

        // Extract fields
        const formHTML = this.extractFormHTML();
        if (!formHTML) throw new Error('No form found');

        // Use FormAnalyzer to get fields
        const fields = window.FormAnalyzer.extractFieldsFromDOM(formHTML);
        console.log(`📊 [FormProcessor] Extracted ${fields.length} fields for Pipeline.`);

        // --- EXECUTE NEW PIPELINE ---
        if (window.PipelineOrchestrator) {
            const orchestrator = new window.PipelineOrchestrator();

            const context = {
                resumeData,
                smartMemory: {}, // Router accesses SmartMemoryService directly now
                callbacks: {}
            };

            // 3. Execute Pipeline
            const results = await orchestrator.executePipeline(fields, context);

            // 4. Update Stats
            this.updateStats(results);

            console.log('✅ [FormProcessor] Pipeline execution passed.');

            // TRIGGER PREVIEW
            console.log('🖼️ [FormProcessor] Opening Preview...');

            // Map results back to fields
            fields.forEach(f => {
                if (results[f.selector]) {
                    f.value = results[f.selector].value;
                    f.fieldData = {
                        ...f.fieldData,
                        value: results[f.selector].value,
                        source: results[f.selector].source,
                        confidence: results[f.selector].confidence
                    };
                }
            });

            // Use global function from sidebar-components.js
            if (typeof window.showAccordionSidebar === 'function') {
                window.showAccordionSidebar(fields);
            } else {
                console.warn('⚠️ window.showAccordionSidebar is not available');
            }

            // TRIGGER SUCCESS CELEBRATION
            if (typeof window.showSuccessToast === 'function') {
                const totalFilled = Object.values(results).filter(r => r.value).length;
                const totalReview = fields.length - totalFilled;
                window.showSuccessToast(totalFilled, totalReview);
            }

            if (typeof window.triggerConfetti === 'function') {
                window.triggerConfetti();
            }

        } else {
            console.error('❌ PipelineOrchestrator not found!');
            return {};
        }

        // Show completion
        if (typeof window.showProcessingWidget === 'function') {
            window.showProcessingWidget('Done!', 4);
        }
    }

    /**
     * Update fill statistics
     */
    static updateStats(results) {
        if (!results) return;
        const total = Object.keys(results).length;
        const filled = Object.values(results).filter(r => r.value).length;
        console.log(`📊 [Stats] Filled ${filled}/${total} fields.`);

        // Optional: Send to background for persistent tracking
        chrome.runtime.sendMessage({
            type: 'UPDATE_STATS',
            payload: { filled, total, timestamp: Date.now() }
        }).catch(() => { }); // Ignore if background is unreachable
    }

    /**
     * Normalize resume schema
     */
    static normalizeResumeSchema(resumeData) {
        if (!resumeData.experience && resumeData.work) {
            console.log('🔧 Normalizing Schema: mapped "work" to "experience"');
            resumeData.experience = resumeData.work;
        }
        if (!resumeData.education && resumeData.schools) {
            console.log('🔧 Normalizing Schema: mapped "schools" to "education"');
            resumeData.education = resumeData.schools;
        }
    }

    /**
     * Extract form HTML
     */
    static extractFormHTML() {
        if (typeof window.extractFormHTML === 'function') {
            return window.extractFormHTML();
        }
        // Fallback
        const forms = document.querySelectorAll('form');
        return forms.length > 0 ? forms[0].outerHTML : null;
    }

    /**
     * Get job context
     */
    static getJobContext() {
        if (typeof window.getJobContext === 'function') {
            return window.getJobContext();
        }
        // Fallback
        return document.body.innerText.substring(0, 1000);
    }

    /**
     * Check if form processor is ready
     * @returns {boolean} True if ready
     */
    static isReady() {
        return typeof window.extractFormHTML === 'function' &&
            window.FormAnalyzer !== undefined &&
            window.ResumeManager !== undefined;
    }

    /**
     * Wait for processor to be ready
     * @param {number} timeout - Timeout in ms (default: 5000)
     * @returns {Promise<boolean>}
     */
    static async waitUntilReady(timeout = 5000) {
        const startTime = Date.now();

        while (!this.isReady()) {
            if (Date.now() - startTime > timeout) {
                console.error('⚠️ Form processor not ready after timeout');
                return false;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        return true;
    }

    /**
     * Get processor status
     * @returns {Object} Status object
     */
    static getStatus() {
        return {
            ready: this.isReady(),
            formAnalyzer: window.FormAnalyzer !== undefined,
            resumeManager: window.ResumeManager !== undefined,
            neuralClassifier: window.neuralClassifier !== undefined,
            batchProcessor: window.BatchProcessor !== undefined,
            phase0: window.Phase0Classification !== undefined,
            phase1: window.Phase1InstantFill !== undefined,
            phase2: window.Phase2AIProcessing !== undefined
        };
    }
}

// Global export
window.FormProcessor = FormProcessor;

// Export for module usage
FormProcessor;
