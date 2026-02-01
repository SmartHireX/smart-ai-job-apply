/**
 * lifecycle.js
 * Extension lifecycle management and initialization
 */

/**
 * Lifecycle Manager
 * Handles extension initialization, cleanup, and event management
 */
class Lifecycle {
    static initialized = false;
    static services = new Map();
    static cleanupHandlers = [];

    /**
     * Initialize the extension
     */
    static async init() {
        if (this.initialized) {
            console.warn('⚠️ Lifecycle already initialized');
            return;
        }

        // // console.log('🚀 Nova AI Extension Loading...');

        try {
            // Initialize core services
            await this.initializeServices();

            // Setup event listeners
            this.setupEventListeners();

            // Register cleanup handlers
            this.registerCleanupHandlers();

            this.initialized = true;
            // // console.log('✅ Nova AI Extension Loaded Successfully');

        } catch (error) {
            console.error('❌ Extension initialization failed:', error);
            throw error;
        }
    }

    /**
     * Initialize core services
     */
    static async initializeServices() {
        // // console.log('⚙️ Initializing services...');

        // Neural Classifier initialization
        if (window.NeuralClassifier) {
            try {
                window.neuralClassifier = new window.NeuralClassifier();
                await window.neuralClassifier.init();
                this.services.set('NeuralClassifier', window.neuralClassifier);
                // // console.log('✅ Neural Classifier initialized');
            } catch (error) {
                console.error('❌ Neural Classifier init failed:', error);
            }
        }

        // Register other services as they become available
        this.registerService('ResumeManager', window.ResumeManager);
        this.registerService('FormAnalyzer', window.FormAnalyzer);
        this.registerService('AIClient', window.AIClient);
        this.registerService('BatchProcessor', window.ExecutionEngine); // Renamed
        this.registerService('SelectionCache', window.InteractionLog); // Renamed
        this.registerService('LocalMatcher', window.RuleEngine); // Renamed
        this.registerService('IndexingService', window.IndexingService);
        this.registerService('HistoryManager', window.EntityStore); // Renamed
        this.registerService('PipelineOrchestrator', window.PipelineOrchestrator); // New
        this.registerService('PipelineOrchestrator', window.PipelineOrchestrator); // New
        this.registerService('PrefetchEngine', window.PrefetchEngine);
        this.registerService('FormObserver', window.FormObserver);

        // Start Observer immediately
        if (window.FormObserver) window.FormObserver.start();
    }

    /**
     * Register a service
     * @param {string} name - Service name
     * @param {*} instance - Service instance
     */
    static registerService(name, instance) {
        if (instance) {
            this.services.set(name, instance);
            // // console.log(`✅ ${name} registered`);
        } else {
            console.warn(`⚠️ ${name} not available yet`);
        }
    }

    /**
     * Get a service by name
     * @param {string} name - Service name
     * @returns {*} Service instance or null
     */
    static getService(name) {
        return this.services.get(name) || null;
    }

    /**
     * Setup event listeners
     */
    static setupEventListeners() {
        // Focus event for speculative prefetching
        document.addEventListener('focusin', (e) => {
            if (e.target.classList.contains('smarthirex-typing')) return;

            const prefetchEngine = this.getService('PrefetchEngine');
            if (prefetchEngine && prefetchEngine.handleFocus) {
                prefetchEngine.handleFocus(e.target);
            }
        }, true);

        // // console.log('✅ Event listeners registered');
    }

    /**
     * Register cleanup handlers
     */
    static registerCleanupHandlers() {
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }

    /**
     * Add a cleanup handler
     * @param {Function} handler - Cleanup function
     */
    static addCleanupHandler(handler) {
        if (typeof handler === 'function') {
            this.cleanupHandlers.push(handler);
        }
    }

    /**
     * Cleanup resources
     */
    static cleanup() {
        // // console.log('🧹 Cleaning up extension resources...');

        // Execute all cleanup handlers
        this.cleanupHandlers.forEach(handler => {
            try {
                handler();
            } catch (error) {
                console.error('Cleanup handler error:', error);
            }
        });

        // Clear services
        this.services.clear();
        this.initialized = false;

        // // console.log('✅ Cleanup complete');
    }

    /**
     * Check if extension is ready
     * @returns {boolean}
     */
    static isReady() {
        return this.initialized;
    }

    /**
     * Wait for extension to be ready
     * @param {number} timeout - Timeout in ms (default: 10000)
     * @returns {Promise<boolean>}
     */
    static async waitUntilReady(timeout = 10000) {
        const startTime = Date.now();

        while (!this.initialized) {
            if (Date.now() - startTime > timeout) {
                console.error('⚠️ Extension initialization timeout');
                return false;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        return true;
    }
}

// Make globally accessible
window.NovaLifecycle = Lifecycle;
