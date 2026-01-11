/**
 * config.js
 * Runtime configuration and feature flag management
 */


/**
 * Configuration Manager
 * Handles feature flags and runtime settings
 */
class Config {
    /**
     * Check if new architecture is enabled
     * @returns {boolean}
     */
    static isNewArchEnabled() {
        return localStorage.getItem(FEATURE_FLAGS.NEW_ARCHITECTURE_KEY) === 'true';
    }

    /**
     * Enable new architecture
     */
    static enableNewArch() {
        localStorage.setItem(FEATURE_FLAGS.NEW_ARCHITECTURE_KEY, 'true');
        console.log('✅ New Architecture enabled');
    }

    /**
     * Disable new architecture
     */
    static disableNewArch() {
        localStorage.setItem(FEATURE_FLAGS.NEW_ARCHITECTURE_KEY, 'false');
        console.log('❌ New Architecture disabled (using legacy)');
    }

    /**
     * Get all feature flags
     * @returns {Object} Feature flag status
     */
    static getFeatureFlags() {
        return {
            newArchitecture: this.isNewArchEnabled()
        };
    }

    /**
     * Check if a service is available
     * @param {string} serviceName - Name of the service to check
     * @returns {boolean}
     */
    static isServiceAvailable(serviceName) {
        return window[serviceName] !== undefined;
    }

    /**
     * Wait for a service to be available
     * @param {string} serviceName - Name of the service
     * @param {number} timeout - Timeout in ms (default: 5000)
     * @returns {Promise<boolean>}
     */
    static async waitForService(serviceName, timeout = 5000) {
        const startTime = Date.now();

        while (!this.isServiceAvailable(serviceName)) {
            if (Date.now() - startTime > timeout) {
                console.warn(`⚠️ Service ${serviceName} not available after ${timeout}ms`);
                return false;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        return true;
    }

    /**
     * Get runtime environment info
     * @returns {Object}
     */
    static getEnvironment() {
        return {
            url: window.location.href,
            domain: window.location.hostname,
            isIframe: window !== window.top,
            userAgent: navigator.userAgent
        };
    }
}

// Make globally accessible
window.NovaConfig = Config;
