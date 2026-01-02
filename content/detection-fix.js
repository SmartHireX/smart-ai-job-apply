// Simplified and fixed job detection
function detectJobPage() {
    const url = window.location.href.toLowerCase();
    const title = document.title.toLowerCase();

    // Strong job page indicators
    if (url.includes('linkedin.com/jobs/view') ||
        url.includes('indeed.com/viewjob') ||
        url.includes('glassdoor.com/job')) {
        return true;
    }

    // Medium signals - require title confirmation
    if (url.includes('/jobs/') || url.includes('/careers/')) {
        const hasJobTitle = title.includes('hiring') || title.includes('position') || title.includes('opening');
        return hasJobTitle;
    }

    return false;
}

// Detect if page has a fillable form
function detectFormPage() {
    const forms = document.querySelectorAll('form');
    const inputs = document.querySelectorAll('input[type="text"], input[type="email"], textarea, select');
    return forms.length > 0 && inputs.length >= 3;
}
