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
        // console.log('🚀 [FormProcessor] Starting form processing...');

        // Show processing widget
        if (typeof window.showProcessingWidget === 'function') {
            window.showProcessingWidget('Instant Match...', 1);
        }

        try {
            // Execute FANG-Level FieldRouter Pipeline
            await this.executeFieldRouterPipeline();

            // console.log('✅ [FormProcessor] Processing complete');

        } catch (error) {
            if (error.message === 'No form found') {
                console.warn('⚠️ [FormProcessor] No form found in this frame (common for top-level frames in iframed sites). Skipping.');
                // Do not show user-facing error toast for this common case
                return;
            }
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
        // console.log('🚀 [FormProcessor] Starting FANG-Level Pipeline (Stealth Mode)...');



        // Get context
        const [resumeData, smartMemory] = await Promise.all([
            globalThis.ResumeManager.getResumeData(),
            globalThis.GlobalMemory ? globalThis.GlobalMemory.getCache() : {}
        ]);

        // Ensure SmartMemoryService is ready (it initializes itself usually, but good to check)

        if (!resumeData) {
            console.warn('⚠️ [FormProcessor] Resume data missing. Proceeding with Memory/Cache only.');
        } else {
            this.normalizeResumeSchema(resumeData);
        }

        // Extract fields
        let formSource = null;

        // ROBUST SCRAPER UPGRADE:
        // If we have the robust FormExtractor (Phase 1), we MUST pass the full document body.
        // The old logic (extractFormHTML) extracted a specific <form> or Density Winner,
        // which physically removed all other sections (Repeaters, Modals, Portals) from view.
        if (window.FormExtractor) {
            console.log('🚀 [FormProcessor] Robust Scraper detected. Using FULL DOM access.');
            formSource = document.body;
        } else {
            // Legacy Fallback
            formSource = this.extractFormHTML();
            if (!formSource) throw new Error('No form found');
        }

        // Use FormAnalyzer to get fields
        const fields = await window.FormAnalyzer.extractFieldsFromDOM(formSource);
        console.log(`📊 [FormProcessor] Extracted ${fields.length} fields. First field label: ${fields[0]?.label}`);

        // new pipeline execution
        if (window.PipelineOrchestrator) {
            const orchestrator = new window.PipelineOrchestrator();
            const aiStatusResult = window.AIClient?.getAIStatus ? await window.AIClient.getAIStatus() : { status: 'ok', usableKeys: 1, totalKeys: 1 };

            const context = {
                resumeData,
                smartMemory: {}, // Router accesses SmartMemoryService directly now
                aiStatus: aiStatusResult.status, // 'ok' | 'degraded' | 'offline'
                callbacks: {
                    // Inject Progress Callbacks
                    onBatchStart: (current, total, labels) => {
                        if (typeof window.showProcessingWidget === 'function') {
                            // Update Dot State
                            window.showProcessingWidget('Processing fields with AI...', 2, {
                                currentBatch: current,
                                totalBatches: total
                            });

                            // Calculate progress: Start of batch
                            // If total=3, Batch 1 Start = 0%, Batch 2 Start = 33%, Batch 3 Start = 66%
                            const percent = ((current - 1) / total) * 100;
                            if (typeof window.updateProcessingProgress === 'function') {
                                window.updateProcessingProgress(percent);
                            }
                        }
                    },
                    onBatchComplete: (mappings, isFinal) => {
                        // We could update granular progress here if needed
                    },
                    onFieldAnswered: (selector, value, confidence) => {
                        // Optional: Micro-interactions for specific fields
                    },
                    onAllComplete: (mappings) => {
                        if (typeof window.updateProcessingProgress === 'function') {
                            window.updateProcessingProgress(100);
                        }
                    },
                    onAIDegraded: (reason) => {
                        if (typeof window.showAIDegradedBanner === 'function') {
                            window.showAIDegradedBanner(reason);
                        }
                    }
                }
            };

            // One-time banner when AI is offline (heuristic-only mode)
            if (aiStatusResult.status === 'offline' && typeof window.showAIDegradedBanner === 'function') {
                window.showAIDegradedBanner('offline');
            }

            // 3. Execute Pipeline
            const results = await orchestrator.executePipeline(fields, context);

            // 4. Update Stats
            this.updateStats(results);

            // console.log('✅ [FormProcessor] Pipeline execution passed.');

            // TRIGGER PREVIEW
            // console.log('🖼️ [FormProcessor] Opening Preview...');


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
        // console.log(`📊 [Stats] Filled ${filled}/${total} fields.`);

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
            // console.log('🔧 Normalizing Schema: mapped "work" to "experience"');
            resumeData.experience = resumeData.work;
        }
        if (!resumeData.education && resumeData.schools) {
            // console.log('🔧 Normalizing Schema: mapped "schools" to "education"');
            resumeData.education = resumeData.schools;
        }
        if (!resumeData.basics && resumeData.personal) {
            // console.log('🔧 Normalizing Schema: mapped "personal" to "basics"');
            resumeData.basics = resumeData.personal;
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
            neuralClassifier: window.HybridClassifier !== undefined,
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
