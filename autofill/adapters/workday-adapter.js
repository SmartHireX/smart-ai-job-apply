/**
 * WorkdayAdapter
 * 
 * Specialized handling for Workday ATS.
 * Challenges: 
 * - Heavy React / SPA structure
 * - "automation-id" attributes preferred over IDs
 * - Input masking and virtualization
 */

class WorkdayAdapter {
    constructor() {
        this.platformName = 'Workday';
        this.selectors = [
            '[data-automation-id="workday-application-flow"]',
            'div[data-automation-id^="task-"]',
            '.workday-task-view'
        ];
    }

    /**
     * Check if this is a Workday page
     */
    isMatch() {
        if (window.location.host.includes('myworkday.com') || window.location.host.includes('myworkdayjobs.com')) return true;
        return document.querySelector('[data-automation-id]');
    }

    /**
     * Get the main form container
     */
    getForm() {
        // Workday doesn't use <form> often, usually a div container
        return document.querySelector('[data-automation-id="workday-application-flow"]') ||
            document.querySelector('.workday-task-view') ||
            document.body; // Fallback to body for scanning
    }

    /**
     * Enhance field detection for Workday
     */
    enhanceField(field, element) {
        // Workday uses data-automation-id which is very reliable
        const automationId = element.getAttribute('data-automation-id') || '';

        if (automationId.includes('legalNameSection_firstName')) {
            field.label = 'First Name';
        } else if (automationId.includes('legalNameSection_lastName')) {
            field.label = 'Last Name';
        } else if (automationId.includes('email')) {
            field.label = 'Email';
        } else if (automationId.includes('phone')) {
            field.label = 'Phone';
        }

        // Address handling
        if (automationId.includes('addressSection_city')) field.label = 'City';
        if (automationId.includes('addressSection_postalCode')) field.label = 'Zip Code';

        return field;
    }
}

if (typeof window !== 'undefined') {
    window.WorkdayAdapter = new WorkdayAdapter();
}
