/**
 * TypeaheadHandler
 * 
 * Handles autocomplete/typeahead inputs that require:
 * 1. Typing to trigger dropdown
 * 2. Waiting for options to appear
 * 3. Selecting from dropdown
 * 
 * Supports: Select2, Choices.js, React-Select, MUI Autocomplete, custom implementations
 */

class TypeaheadHandler {
    constructor() {
        // Selectors for dropdown/listbox containers
        this.DROPDOWN_SELECTORS = [
            '[role="listbox"]',
            '[role="menu"]',
            '.dropdown-menu:not(.hidden)',
            '.suggestions',
            '.autocomplete-results',
            '.select2-results',
            '.choices__list--dropdown',
            '[class*="MenuList"]',      // React-Select
            '[class*="option"]',        // Generic
            'ul[id*="listbox"]',
            'div[id*="listbox"]'
        ];

        // Selectors for option items
        this.OPTION_SELECTORS = [
            '[role="option"]',
            '.dropdown-item',
            '.suggestion-item',
            '.autocomplete-item',
            '.select2-results__option',
            '.choices__item--selectable',
            '[class*="Option"]',        // React-Select
            'li[id*="option"]'
        ];

        // Selectors to detect typeahead inputs
        this.TYPEAHEAD_INPUT_SELECTORS = [
            'input[role="combobox"]',
            'input[aria-autocomplete]',
            'input[aria-haspopup="listbox"]',
            'input[data-autocomplete]',
            'input.select2-search__field',
            'input.choices__input',
            'input[class*="autocomplete"]',
            'input[class*="typeahead"]'
        ];
    }

    /**
     * Check if an element is a typeahead input
     */
    isTypeahead(element) {
        if (!element || element.tagName !== 'INPUT') return false;

        // Check ARIA attributes
        if (element.getAttribute('role') === 'combobox') return true;
        if (element.hasAttribute('aria-autocomplete')) return true;
        if (element.getAttribute('aria-haspopup') === 'listbox') return true;

        // Check common classes
        const className = (element.className || '').toLowerCase();
        if (className.includes('autocomplete') ||
            className.includes('typeahead') ||
            className.includes('combobox') ||
            className.includes('select2') ||
            className.includes('choices__input')) {
            return true;
        }

        // Check data attributes
        if (element.hasAttribute('data-autocomplete')) return true;

        // Check if there's an associated listbox
        const listboxId = element.getAttribute('aria-controls') || element.getAttribute('aria-owns');
        if (listboxId && document.getElementById(listboxId)) return true;

        return false;
    }

    /**
     * Fill a typeahead input
     * @param {HTMLElement} element - The input element
     * @param {string} value - The value to fill
     * @param {number} confidence - Fill confidence
     * @returns {Promise<boolean>} Success status
     */
    async fill(element, value, confidence = 1.0) {
        if (!element || !value) return false;

        console.log(`🔍 [Typeahead] Filling: "${value}"`);

        try {
            // 1. Clear and focus
            element.focus();
            element.value = '';
            this.dispatchInputEvent(element);

            // 2. Type characters slowly to trigger search
            const searchText = this.getSearchText(value);
            await this.simulateTyping(element, searchText);

            // 3. Wait for dropdown
            const dropdown = await this.waitForDropdown(element, 2000);
            if (!dropdown) {
                console.warn('[Typeahead] Dropdown did not appear, attempting direct value set');
                element.value = value;
                this.dispatchInputEvent(element);
                return true;
            }

            // 4. Find and click best matching option
            const option = await this.findBestOption(value);
            if (option) {
                console.log(`🎯 [Typeahead] Selecting: "${option.textContent.trim()}"`);
                option.click();

                // Dispatch events for React
                option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                option.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

                await this.sleep(100);
                return true;
            }

            // 5. Fallback: Press Enter to select first option
            console.log('[Typeahead] No exact match, selecting first option');
            element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            await this.sleep(100);
            return true;

        } catch (error) {
            console.error('[Typeahead] Error:', error);
            // Fallback to direct value set
            element.value = value;
            this.dispatchInputEvent(element);
            return false;
        }
    }

    /**
     * Get search text (first 3-5 characters for efficiency)
     */
    getSearchText(value) {
        // For locations like "San Francisco, CA", use first word
        const firstWord = value.split(/[\s,]/)[0];
        return firstWord.length > 3 ? firstWord.substring(0, 4) : firstWord;
    }

    /**
     * Simulate typing with delays (triggers autocomplete)
     */
    async simulateTyping(element, text) {
        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            // Focus first
            if (!document.activeElement === element) {
                element.focus();
            }

            // Key events
            element.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));

            // Update value incrementally
            element.value = text.substring(0, i + 1);

            // Input event (important for React)
            element.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                inputType: 'insertText',
                data: char
            }));

            element.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));

            // Small delay between characters
            await this.sleep(50 + Math.random() * 30);
        }

        // Final pause to let autocomplete load
        await this.sleep(300);
    }

    /**
     * Wait for dropdown to appear
     */
    async waitForDropdown(element, timeout = 2000) {
        const startTime = Date.now();

        // Check for associated listbox first
        const listboxId = element.getAttribute('aria-controls') || element.getAttribute('aria-owns');

        while (Date.now() - startTime < timeout) {
            // Method 1: Check aria-controls/aria-owns
            if (listboxId) {
                const listbox = document.getElementById(listboxId);
                if (listbox && listbox.children.length > 0) {
                    return listbox;
                }
            }

            // Method 2: Check known selectors
            for (const selector of this.DROPDOWN_SELECTORS) {
                try {
                    const dropdown = document.querySelector(selector);
                    if (dropdown && this.isVisible(dropdown) && dropdown.children.length > 0) {
                        return dropdown;
                    }
                } catch (e) { /* Invalid selector, skip */ }
            }

            // Method 3: Check nearby siblings
            const parent = element.parentElement;
            if (parent) {
                const sibling = parent.querySelector('[role="listbox"], .dropdown-menu, .suggestions');
                if (sibling && this.isVisible(sibling)) {
                    return sibling;
                }
            }

            await this.sleep(50);
        }

        return null;
    }

    /**
     * Find best matching option in dropdown
     */
    async findBestOption(targetValue) {
        const target = targetValue.toLowerCase().trim();
        let bestMatch = null;
        let bestScore = 0;

        // Get all visible options
        const allOptions = [];
        for (const selector of this.OPTION_SELECTORS) {
            try {
                const options = document.querySelectorAll(selector);
                options.forEach(opt => {
                    if (this.isVisible(opt) && !opt.getAttribute('aria-disabled')) {
                        allOptions.push(opt);
                    }
                });
            } catch (e) { /* Skip invalid selectors */ }
        }

        for (const option of allOptions) {
            const text = (option.textContent || '').toLowerCase().trim();
            const value = (option.getAttribute('data-value') || option.getAttribute('value') || '').toLowerCase();

            // Scoring: Exact > Starts-with > Contains
            let score = 0;
            if (text === target || value === target) {
                score = 100; // Exact match
            } else if (text.startsWith(target) || value.startsWith(target)) {
                score = 80;
            } else if (target.startsWith(text) || target.startsWith(value)) {
                score = 70;
            } else if (text.includes(target) || value.includes(target)) {
                score = 50;
            } else if (target.includes(text) || target.includes(value)) {
                score = 40;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = option;
            }
        }

        // Return match if score is reasonable
        return bestScore >= 40 ? bestMatch : null;
    }

    /**
     * Helper: Check if element is visible
     */
    isVisible(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            element.offsetParent !== null;
    }

    /**
     * Helper: Dispatch input events for React compatibility
     */
    dispatchInputEvent(element) {
        const opts = { bubbles: true, cancelable: true };
        element.dispatchEvent(new Event('input', opts));
        element.dispatchEvent(new Event('change', opts));
    }

    /**
     * Helper: Sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export
if (typeof window !== 'undefined') {
    window.TypeaheadHandler = new TypeaheadHandler();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TypeaheadHandler;
}
