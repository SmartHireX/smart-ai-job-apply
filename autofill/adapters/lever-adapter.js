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

    /**
     * Specialized Label Finding for Lever
     * Lever wraps custom questions in div.custom-question or div.application-question
     */
    findLabel(element) {
        // Traverse up to find the question container
        let parent = element.parentElement;
        for (let i = 0; i < 5; i++) {
            if (!parent) break;

            // Check for Lever's question block classes
            if (parent.classList.contains('custom-question') ||
                parent.classList.contains('application-question') ||
                parent.classList.contains('application-label') ||
                parent.classList.contains('card-field') || // Added card-field support
                parent.className.includes('question')) {

                // 1. Look for explicit .application-label
                const label = parent.querySelector('.application-label, .card-field-label, .text, .question-text, label');
                if (label) return label.innerText.trim();

                // 2. Look for the text node directly in this container (common in Lever)
                // Often the structure is: <div class="text">Question?</div> <input>
                const textNodes = Array.from(parent.childNodes)
                    .filter(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 5);

                if (textNodes.length > 0) return textNodes[0].textContent.trim();

                // 3. Look for previous sibling of the inputs wrapper
                // Structure: <div class="text">Question</div> <div class="fields"><input></div>
                if (parent.classList.contains('fields') || parent.tagName === 'LABEL' || parent.classList.contains('card-field-input-container')) {
                    const grandParent = parent.parentElement;
                    if (grandParent) {
                        const questionSibling = grandParent.querySelector('.text, .application-label, .card-field-label');
                        if (questionSibling) return questionSibling.innerText.trim();
                    }
                }
            }

            // Generic fallback for Lever Cards: If we are in a 'card' and didn't find specific classes
            if (parent.className.includes('card')) {
                const text = parent.innerText.split('\n')[0]; // Often the first line is the label
                if (text && text.length > 5 && text.length < 150) return text.trim();
            }

            parent = parent.parentElement;
        }
        return null;
    }
}

if (typeof window !== 'undefined') {
    window.LeverAdapter = new LeverAdapter();
}
