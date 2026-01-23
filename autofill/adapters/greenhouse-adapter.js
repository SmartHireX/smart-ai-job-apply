/**
 * GreenhouseAdapter
 * 
 * Specialized handling for Greenhouse ATS.
 * Challenges: 
 * - Often embedded in iframes
 * - Multi-step forms
 * - Specific "Education" and "Experience" section structures
 */

class GreenhouseAdapter {
    constructor() {
        this.platformName = 'Greenhouse';
        this.selectors = [
            '#greenhouse-application',
            'form[action*="greenhouse.io"]',
            '.greenhouse-job-application'
        ];
    }

    /**
     * Check if this is a Greenhouse page
     */
    isMatch() {
        // Check URL
        if (window.location.host.includes('greenhouse.io') || window.location.host.includes('gh_jid')) return true;

        // Check DOM
        return this.selectors.some(sel => document.querySelector(sel));
    }

    /**
     * Get the main form container
     */
    getForm() {
        // Priority 1: Main application form
        let form = document.querySelector('form#application_form');

        // Priority 2: Generic form inside greenhouse container
        if (!form) {
            const container = document.querySelector('#greenhouse-application');
            if (container) form = container.querySelector('form');
        }

        return form;
    }

    /**
     * Enhance field detection for Greenhouse
     */
    enhanceField(field, element) {
        // Greenhouse uses specific IDs for education/employment
        if (element.id && element.id.includes('education_school_name')) {
            field.category = 'education';
            field.label = 'School Name';
        }

        if (element.id && element.id.includes('employment_company_name')) {
            field.category = 'work';
            field.label = 'Company Name';
        }

        // LinkedIn profile handling
        if (field.label.toLowerCase().includes('linkedin') || (element.name && element.name.includes('linkedin'))) {
            field.label = 'LinkedIn Profile URL';
        }

        return field;
    }
}

if (typeof window !== 'undefined') {
    window.GreenhouseAdapter = new GreenhouseAdapter();
}
