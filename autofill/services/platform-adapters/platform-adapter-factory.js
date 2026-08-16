/**
 * Platform Adapter Factory
 *
 * Auto-detects ATS platforms and routes to specialized adapters
 * for improved label extraction, option detection, and form filling.
 *
 * Supports: Workday, Lever, Greenhouse, Taleo, Ashby, iCIMS, and more
 *
 * @version 1.0.0
 * @author SmartHireX Team
 */

class PlatformAdapterFactory {

    static VERSION = '1.0.0';
    static DEBUG = false;

    // Registered adapters with priority order
    static ADAPTERS = [
        { name: 'workday', class: 'WorkdayAdapter', priority: 10 },
        { name: 'lever', class: 'LeverAdapter', priority: 8 },
        { name: 'greenhouse', class: 'GreenhouseAdapter', priority: 7 }
    ];

    static _currentAdapter = null;
    static _currentPlatformName = null;
    static _cache = new Map();

    /**
     * Auto-detect and return the appropriate platform adapter
     * @returns {Object|null} Platform adapter class or null for universal fallback
     */
    static detectPlatform() {
        // Check cache first (same page)
        const cacheKey = window.location.hostname;
        if (this._cache.has(cacheKey)) {
            return this._cache.get(cacheKey);
        }

        // Try each adapter in priority order
        for (const { name, class: className } of this.ADAPTERS) {
            const AdapterClass = window[className];

            if (AdapterClass && AdapterClass.detect && AdapterClass.detect()) {
                this._log(`Detected platform: ${name.toUpperCase()}`);
                this._cache.set(cacheKey, AdapterClass);
                this._currentAdapter = AdapterClass;
                this._currentPlatformName = name;
                return AdapterClass;
            }
        }

        this._log('No specific platform detected, using universal fallback');
        this._currentAdapter = null;
        this._currentPlatformName = 'universal';
        this._cache.set(cacheKey, null);
        return null;
    }

    /**
     * Get label for a field using platform-specific or universal strategy
     * @param {HTMLElement} element - Form field element
     * @returns {string|null} Extracted label or null
     */
    static extractLabel(element) {
        if (!element) return null;

        const adapter = this.detectPlatform();

        // Try platform-specific extraction first
        if (adapter && adapter.extractLabel) {
            try {
                const label = adapter.extractLabel(element);
                if (label && label.length > 0) {
                    this._log(`Label extracted via ${this._currentPlatformName}: "${label}"`);
                    return label;
                }
            } catch (error) {
                console.warn(`[PlatformAdapter] ${this._currentPlatformName} extractLabel failed:`, error);
            }
        }

        // No platform-specific extraction available or failed
        return null;
    }

    /**
     * Extract options for select/radio/checkbox fields
     * @param {HTMLElement} element - Form field element
     * @returns {Array} Array of {value, text, element} objects
     */
    static extractOptions(element) {
        if (!element) return [];

        const adapter = this.detectPlatform();

        // Try platform-specific extraction
        if (adapter && adapter.extractOptions) {
            try {
                const options = adapter.extractOptions(element);
                if (options && options.length > 0) {
                    this._log(`Options extracted via ${this._currentPlatformName}: ${options.length} options`);
                    return options;
                }
            } catch (error) {
                console.warn(`[PlatformAdapter] ${this._currentPlatformName} extractOptions failed:`, error);
            }
        }

        // Fallback to universal extraction
        return this._universalExtractOptions(element);
    }

    /**
     * Fill a field using platform-specific strategy
     * @param {HTMLElement} element - Form field element
     * @param {string|number|boolean} value - Value to fill
     * @returns {Promise<boolean>} True if successful
     */
    static async fillField(element, value) {
        if (!element) return false;

        const adapter = this.detectPlatform();

        // Try platform-specific filling
        if (adapter && adapter.fillField) {
            try {
                await adapter.fillField(element, value);
                this._log(`Field filled via ${this._currentPlatformName}`);
                return true;
            } catch (error) {
                console.warn(`[PlatformAdapter] ${this._currentPlatformName} fillField failed:`, error);
            }
        }

        // Fallback to universal filling
        return this._universalFillField(element, value);
    }

    /**
     * Get current platform name
     * @returns {string} Platform name or 'universal'
     */
    static getPlatformName() {
        if (!this._currentPlatformName) {
            this.detectPlatform();
        }
        return this._currentPlatformName || 'universal';
    }

    /**
     * Check if platform-specific adapter is active
     * @returns {boolean} True if adapter is active
     */
    static hasAdapter() {
        return this._currentAdapter !== null;
    }

    /**
     * Clear platform detection cache (useful for testing)
     */
    static clearCache() {
        this._cache.clear();
        this._currentAdapter = null;
        this._currentPlatformName = null;
    }

    // ========================================================================
    // UNIVERSAL FALLBACK METHODS
    // ========================================================================

    /**
     * Universal option extraction (works on any platform)
     * @private
     */
    static _universalExtractOptions(element) {
        const options = [];

        try {
            // SELECT dropdown
            if (element.tagName === 'SELECT') {
                element.querySelectorAll('option').forEach(opt => {
                    if (opt.value && opt.value.trim() !== '') {
                        options.push({
                            value: opt.value,
                            text: this._cleanText(opt.textContent),
                            element: opt
                        });
                    }
                });
            }

            // RADIO or CHECKBOX
            else if (element.type === 'radio' || element.type === 'checkbox') {
                const name = element.name;
                if (!name) return options;

                const inputs = document.querySelectorAll(
                    `input[type="${element.type}"][name="${CSS.escape(name)}"]`
                );

                inputs.forEach(input => {
                    const label = input.labels?.[0] || input.closest('label');
                    let text = input.value;

                    if (label) {
                        const clone = label.cloneNode(true);
                        clone.querySelector('input')?.remove();
                        text = this._cleanText(clone.textContent);
                    }

                    options.push({
                        value: input.value || text,
                        text: text,
                        element: input
                    });
                });
            }
        } catch (error) {
            console.warn('[PlatformAdapter] Universal option extraction failed:', error);
        }

        return options;
    }

    /**
     * Universal field filling (works on any platform)
     * @private
     */
    static _universalFillField(element, value) {
        try {
            const tagName = element.tagName;
            const type = element.type;

            // TEXT, EMAIL, TEL, etc.
            if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
                const prototype = tagName === 'TEXTAREA'
                    ? window.HTMLTextAreaElement.prototype
                    : window.HTMLInputElement.prototype;

                const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
                if (descriptor && descriptor.set) {
                    descriptor.set.call(element, value);
                }

                // Trigger events for React/Vue/Angular
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.dispatchEvent(new Event('blur', { bubbles: true }));

                return true;
            }

            // SELECT dropdown
            else if (tagName === 'SELECT') {
                const targetValue = String(value).toLowerCase();

                for (const option of element.options) {
                    const optionText = this._cleanText(option.textContent).toLowerCase();
                    const optionValue = (option.value || '').toLowerCase();

                    if (optionText === targetValue || optionValue === targetValue ||
                        optionText.includes(targetValue) || optionValue.includes(targetValue)) {
                        element.value = option.value;
                        element.dispatchEvent(new Event('change', { bubbles: true }));
                        return true;
                    }
                }

                // No match found, try first non-empty option
                for (const option of element.options) {
                    if (option.value && option.value.trim() !== '') {
                        element.value = option.value;
                        element.dispatchEvent(new Event('change', { bubbles: true }));
                        return true;
                    }
                }
            }

            // RADIO or CHECKBOX
            else if (type === 'radio' || type === 'checkbox') {
                element.checked = true;
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.click(); // Some forms need actual click
                return true;
            }
        } catch (error) {
            console.warn('[PlatformAdapter] Universal fill failed:', error);
            return false;
        }

        return false;
    }

    /**
     * Clean and normalize text
     * @private
     */
    static _cleanText(text) {
        if (!text) return '';
        return text.replace(/\s+/g, ' ').replace(/\*/g, '').trim();
    }

    /**
     * Debug logging
     * @private
     */
    static _log(message) {
        if (this.DEBUG) {
            console.log(`[PlatformAdapter] ${message}`);
        }
    }
}

// Export for browser
if (typeof window !== 'undefined') {
    window.PlatformAdapterFactory = PlatformAdapterFactory;
    console.log('[PlatformAdapter] Factory loaded successfully');
}

// Export for Node.js (testing)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlatformAdapterFactory;
}
