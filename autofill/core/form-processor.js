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
            // Check for new architecture
            if (Config.isNewArchEnabled() && window.NovaAI && window.NovaAI.processFormNew) {
                await this.processWithNewArchitecture();
                return;
            }

            // Use legacy two-phase architecture
            await this.processWithLegacyArchitecture();

            console.log('✅ [FormProcessor] Processing complete');

        } catch (error) {
            console.error('❌ [FormProcessor] Processing failed:', error);

            if (typeof window.showProcessingWidget === 'function') {
                window.showProcessingWidget('Error', -1);
            }
            if (typeof window.showErrorToast === 'function') {
                window.showErrorToast('Partial Error: ' + error.message);
            }

            throw error;
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
     * Process with new architecture (if enabled)
     */
    static async processWithNewArchitecture() {
        console.log('🚀 [New Architecture] Processing form with new system...');

        // Get resume and memory
        const [resumeData, smartMemory] = await Promise.all([
            window.ResumeManager.getResumeData(),
            MemoryUtils.getCache()
        ]);

        if (!resumeData) throw new Error('Resume data missing');

        // Normalize schema
        this.normalizeResumeSchema(resumeData);

        // Extract fields
        const formHTML = this.extractFormHTML();
        if (!formHTML) throw new Error('No form found');
        const fields = window.FormAnalyzer.extractFieldsFromDOM(formHTML);

        // Use new architecture callbacks
        const callbacks = {
            onFieldAnswered: (selector, value, confidence) => {
                if (typeof window.simulateTyping === 'function') {
                    window.simulateTyping(selector, value, 0.3).catch(err =>
                        console.error('Fill error:', err)
                    );
                }
            },
            onBatchComplete: (mappings) => {
                console.log('[New Arch] Batch complete:', Object.keys(mappings).length);
            },
            onAllComplete: (allMappings) => {
                console.log('[New Arch] All complete:', Object.keys(allMappings).length);
                if (typeof window.showFormReview === 'function') {
                    window.showFormReview(allMappings, fields);
                }
            }
        };

        await window.NovaAI.processFormNew(fields, resumeData, smartMemory, callbacks);

        console.log('✅ [New Architecture] Form processing complete');
    }

    /**
     * Process with legacy two-phase architecture
     */
    static async processWithLegacyArchitecture() {
        console.log('🚀 [FormProcessor] Starting FANG-Level Pipeline (Stealth Mode)...');

        // Initialize neural classifier
        if (!window.neuralClassifier) {
            window.neuralClassifier = new window.NeuralClassifier();
            await window.neuralClassifier.init();
        }

        // Get context
        const [resumeData, smartMemory] = await Promise.all([
            window.ResumeManager.getResumeData(),
            MemoryUtils.getCache()
        ]);

        if (!resumeData) throw new Error('Resume data missing');
        this.normalizeResumeSchema(resumeData);

        // Extract fields
        const formHTML = this.extractFormHTML();
        if (!formHTML) throw new Error('No form found');

        // Use FormAnalyzer to get fields
        const fields = window.FormAnalyzer.extractFieldsFromDOM(formHTML);
        console.log(`📊 [FormProcessor] Extracted ${fields.length} fields for Pipeline.`);

        // --- EXECUTE NEW PIPELINE ---
        if (window.FieldRouter) {
            const router = new window.FieldRouter();

            const context = {
                resumeData,
                smartMemory,
                callbacks: {}
            };

            // This will trigger the "Grouped Fields" log inside FieldRouter
            const results = await router.executePipeline(fields, context);

            console.log('✅ [FormProcessor] Pipeline execution passed.');
        } else {
            console.error('❌ FieldRouter not found! Falling back to legacy? No, aborting.');
        }

        // Show completion
        if (typeof window.showProcessingWidget === 'function') {
            window.showProcessingWidget('Done!', 4);
        }
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
