/**
 * LeverAdapter
 * 
 * Specialized handling for Lever ATS forms.
 * Lever uses a custom "application-form" structure and occasionally custom dropdowns.
 */

class LeverAdapter {
    constructor() {
        this.platformName = 'Lever';
        this.selector = '.lever-job-form, body.lever-public-job-page';
    }

    /**
     * Check if this is a Lever page
     */
    isMatch() {
        return document.querySelector(this.selector) ||
            window.location.host.includes('lever.co');
    }

    /**
     * Get the main form container
     */
    getForm() {
        return document.querySelector('form') ||
            document.querySelector('.application-form');
    }

    /**
     * Enhance field detection for Lever
     * Lever tends to use standard labels but cleaner layout
     */
    enhanceField(field, element) {
        // Lever-specific label fixes
        if (field.label === 'Resume/CV') {
            field.label = 'Resume';
            field.type = 'file';
        }

        // Location fields on Lever are often typeahead
        if (field.label.toLowerCase().includes('location')) {
            field.isTypeahead = true;
        }

        // Add correct instance type
        if (field.label.toLowerCase().includes('links')) {
            field.instance_type = 'ATOMIC_MULTI';
        }

        return field;
    }
}

if (typeof window !== 'undefined') {
    window.LeverAdapter = new LeverAdapter();
}
