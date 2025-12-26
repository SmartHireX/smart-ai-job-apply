// API Configuration
const API_BASE_URL = 'http://localhost:8000';
const FRONTEND_URL = 'http://localhost:8080';


// DOM Elements
let authSection, mainSection, loginBtn, syncBtn, fillBtn, logoutLink;
let userInitial, userName, userEmail;
let formStatus, formCount;
let progressSection, progressFill, progressText;
let resultSection, resultIcon, resultMessage;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
    // Get DOM elements
    authSection = document.getElementById('auth-section');
    mainSection = document.getElementById('main-section');
    loginBtn = document.getElementById('login-btn');
    syncBtn = document.getElementById('sync-btn');
    fillBtn = document.getElementById('fill-btn');
    logoutLink = document.getElementById('logout-link');

    userInitial = document.getElementById('user-initial');
    userName = document.getElementById('user-name');
    userEmail = document.getElementById('user-email');

    formStatus = document.getElementById('form-status');
    formCount = document.getElementById('form-count');

    progressSection = document.getElementById('progress-section');
    progressFill = document.getElementById('progress-fill');
    progressText = document.getElementById('progress-text');

    resultSection = document.getElementById('result-section');
    resultIcon = document.getElementById('result-icon');
    resultMessage = document.getElementById('result-message');

    // Check authentication
    await checkAuth();

    // Add event listeners
    loginBtn.addEventListener('click', handleLogin);
    syncBtn.addEventListener('click', handleSyncSession);
    fillBtn.addEventListener('click', handleFillForm);
    logoutLink.addEventListener('click', handleLogout);
});

// Check if user is authenticated
async function checkAuth() {
    try {
        let { token } = await chrome.storage.local.get(['token']);

        if (!token) {
            // Check if logged in on another tab
            await checkExistingSession();
            const result = await chrome.storage.local.get(['token']);
            token = result.token;

            if (!token) {
                showAuthSection();
                return;
            }
        }

        // Verify token and get user info
        const response = await fetch(`${API_BASE_URL}/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            // Token invalid
            await chrome.storage.local.remove(['token', 'email']);
            showAuthSection();
            return;
        }

        const user = await response.json();

        // Store email
        const { email } = await chrome.storage.local.get(['email']);
        if (!email && user.email) {
            await chrome.storage.local.set({ email: user.email });
        }

        showMainSection(user);
        await detectForms();

    } catch (error) {
        console.error('Auth check failed:', error);
        showAuthSection();
    }
}

// Check existing tabs for active session
async function checkExistingSession() {
    try {
        const tabs = await chrome.tabs.query({ url: `${FRONTEND_URL}/*` });

        if (tabs.length > 0) {
            const result = await chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                func: () => sessionStorage.getItem('access_token')
            });

            if (result?.[0]?.result) {
                await chrome.storage.local.set({ token: result[0].result });
            }
        }
    } catch (error) {
        console.error('Check existing session failed:', error);
    }
}

// Show authentication section
function showAuthSection() {
    authSection.classList.remove('hidden');
    mainSection.classList.add('hidden');
    logoutLink.classList.add('hidden');
}

// Show main section
function showMainSection(user) {
    authSection.classList.add('hidden');
    mainSection.classList.remove('hidden');
    logoutLink.classList.remove('hidden');

    // Update user info
    if (user.name) {
        userName.textContent = user.name;
        userInitial.textContent = user.name.charAt(0).toUpperCase();
    }
    if (user.email) {
        userEmail.textContent = user.email;
    }
}

// Handle login
function handleLogin() {
    // Open main app in new tab for login (root page has login UI)
    chrome.tabs.create({ url: FRONTEND_URL }, async (tab) => {
        // Set up listener for when user logs in
        chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
            if (tabId === tab.id && changeInfo.status === 'complete') {
                // Inject script to check for token and send it to extension
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        // Get token from sessionStorage
                        const token = sessionStorage.getItem('access_token');
                        if (token) {
                            // Send token to extension
                            chrome.runtime.sendMessage({
                                type: 'STORE_TOKEN',
                                token: token
                            });
                        }
                    }
                });
            }
        });
    });
}


// Handle manual session sync
async function handleSyncSession() {
    console.log('Manual sync session triggered');
    syncBtn.disabled = true;
    syncBtn.textContent = 'Syncing...';

    await checkExistingSession();

    // Check if we got a token
    const { token } = await chrome.storage.local.get(['token']);

    if (token) {
        console.log('Token synced successfully!');
        await checkAuth();
    } else {
        alert('No active session found. Please make sure you are logged in to SmartHireX in another tab.');
        syncBtn.disabled = false;
        syncBtn.textContent = 'Already logged in? Sync Session';
    }
}


// Handle logout
async function handleLogout() {
    await chrome.storage.local.remove(['token', 'email']);
    showAuthSection();
}

// Detect forms on current page
async function detectForms() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Send message to content script to detect forms
        const response = await chrome.tabs.sendMessage(tab.id, {
            type: 'DETECT_FORMS'
        });

        if (response && response.formCount > 0) {
            formCount.textContent = `${response.formCount} form${response.formCount > 1 ? 's' : ''} detected`;
            formStatus.classList.add('success');
            fillBtn.disabled = false;
        } else {
            formCount.textContent = 'No forms detected on this page';
            formStatus.classList.remove('success');
            fillBtn.disabled = true;
        }
    } catch (error) {
        console.error('Form detection failed:', error);
        formCount.textContent = 'Unable to detect forms';
        formStatus.classList.add('error');
        fillBtn.disabled = true;
    }
}

// Handle fill form
async function handleFillForm() {
    try {
        fillBtn.disabled = true;
        hideResult();
        showProgress('Analyzing form fields...', 20);

        const { token } = await chrome.storage.local.get(['token']);
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Get form HTML from content script
        showProgress('Extracting form data...', 40);
        const formData = await chrome.tabs.sendMessage(tab.id, {
            type: 'GET_FORM_HTML'
        });

        if (!formData || !formData.html) {
            throw new Error('Could not extract form data');
        }

        // Analyze form with backend
        showProgress('AI is analyzing the form...', 60);
        const analysisResponse = await fetch(`${API_BASE_URL}/autofill/analyze`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                html: formData.html,
                url: tab.url
            })
        });

        if (!analysisResponse.ok) {
            throw new Error('Form analysis failed');
        }

        const analysis = await analysisResponse.json();

        // Map user data to form fields
        showProgress('Mapping your data to form fields...', 80);
        const { email } = await chrome.storage.local.get(['email']);

        const mappingResponse = await fetch(`${API_BASE_URL}/autofill/map-data`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_email: email,
                form_fields: analysis.fields
            })
        });

        if (!mappingResponse.ok) {
            throw new Error('Data mapping failed');
        }

        const mapping = await mappingResponse.json();

        // Check if there are missing fields that need user input
        if (mapping.missing_fields && mapping.missing_fields.length > 0) {
            hideProgress();

            // Show missing data dialog and wait for user input
            const additionalData = await showMissingDataDialog(mapping.missing_fields, analysis.fields);

            if (!additionalData) {
                // User cancelled
                showResult('error', '⚠️', 'Form filling cancelled. Please provide the required information.');
                fillBtn.disabled = false;
                return;
            }

            // Complete mapping with additional data
            showProgress('Processing your additional data...', 70);
            const completeResponse = await fetch(`${API_BASE_URL}/autofill/complete-with-data`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    user_email: email,
                    form_fields: analysis.fields,
                    additional_data: additionalData
                })
            });

            if (!completeResponse.ok) {
                throw new Error('Failed to complete mapping with additional data');
            }

            const completeMapping = await completeResponse.json();
            mapping.mappings = completeMapping.mappings;
        }

        // Fill form via content script
        showProgress('Filling form fields...', 90);
        const fillResult = await chrome.tabs.sendMessage(tab.id, {
            type: 'FILL_FORM',
            mappings: mapping.mappings
        });

        showProgress('Complete!', 100);

        // Show success result
        setTimeout(() => {
            hideProgress();
            showResult(
                'success',
                '✅',
                `Successfully filled ${fillResult.filled} out of ${fillResult.total} fields!`
            );
            fillBtn.disabled = false;
        }, 500);

    } catch (error) {
        console.error('Form filling failed:', error);
        hideProgress();
        showResult(
            'error',
            '❌',
            error.message || 'Failed to fill form. Please try again.'
        );
        fillBtn.disabled = false;
    }
}

// Show progress
function showProgress(message, percent) {
    progressSection.classList.remove('hidden');
    progressText.textContent = message;
    progressFill.style.width = `${percent}%`;
}

// Hide progress
function hideProgress() {
    progressSection.classList.add('hidden');
    progressFill.style.width = '0%';
}

// Show result
function showResult(type, icon, message) {
    resultSection.classList.remove('hidden', 'success', 'error');
    resultSection.classList.add(type);
    resultIcon.textContent = icon;
    resultMessage.textContent = message;
}

// Hide result
function hideResult() {
    resultSection.classList.add('hidden');
}

// Show missing data dialog and collect user input
async function showMissingDataDialog(missingFields, allFields) {
    return new Promise((resolve) => {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.id = 'missing-data-overlay';
        overlay.className = 'modal-overlay';

        // Create modal dialog
        const dialog = document.createElement('div');
        dialog.className = 'missing-data-dialog';

        // Dialog header
        const header = document.createElement('div');
        header.className = 'dialog-header';
        header.innerHTML = `
            <h3>📝 Additional Information Needed</h3>
            <p>We need a few more details to complete the form</p>
        `;

        // Dialog content
        const content = document.createElement('div');
        content.className = 'dialog-content';

        // Create form fields for missing data
        const form = document.createElement('form');
        form.id = 'missing-data-form';

        missingFields.forEach((fieldPurpose) => {
            // Find the field details from allFields
            const fieldDetail = allFields.find(f => f.purpose === fieldPurpose);
            const label = fieldDetail ? fieldDetail.label : fieldPurpose;
            const fieldType = fieldDetail ? fieldDetail.type : 'text';

            const fieldGroup = document.createElement('div');
            fieldGroup.className = 'field-group';

            const fieldLabel = document.createElement('label');
            fieldLabel.textContent = label || fieldPurpose;
            fieldLabel.setAttribute('for', `field-${fieldPurpose}`);

            let input;
            if (fieldType === 'textarea' || fieldPurpose.includes('letter') || fieldPurpose.includes('why')) {
                input = document.createElement('textarea');
                input.rows = 4;
            } else {
                input = document.createElement('input');
                input.type = fieldType === 'email' ? 'email' : 'text';
            }

            input.id = `field-${fieldPurpose}`;
            input.name = fieldPurpose;
            input.placeholder = `Enter ${label || fieldPurpose}`;
            input.required = true;

            fieldGroup.appendChild(fieldLabel);
            fieldGroup.appendChild(input);
            form.appendChild(fieldGroup);
        });

        content.appendChild(form);

        // Dialog footer
        const footer = document.createElement('div');
        footer.className = 'dialog-footer';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.textContent = 'Cancel';

        const submitBtn = document.createElement('button');
        submitBtn.type = 'button';
        submitBtn.className = 'btn btn-primary';
        submitBtn.textContent = 'Continue';

        footer.appendChild(cancelBtn);
        footer.appendChild(submitBtn);

        // Assemble dialog
        dialog.appendChild(header);
        dialog.appendChild(content);
        dialog.appendChild(footer);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // Event handlers
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
            resolve(null);
        });

        submitBtn.addEventListener('click', () => {
            // Validate form
            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }

            // Collect data
            const formData = new FormData(form);
            const additionalData = {};

            for (const [key, value] of formData.entries()) {
                additionalData[key] = value;
            }

            document.body.removeChild(overlay);
            resolve(additionalData);
        });
    });
}

// Listen for messages from content script or background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TOKEN_STORED') {
        // Re-check auth after login
        checkAuth();
    }
});

// Also listen for postMessage from main app (if user logs in in extension tab)
window.addEventListener('message', async (event) => {
    if (event.origin === FRONTEND_URL && event.data.type === 'SMARTHIREX_LOGIN') {
        const { token } = event.data;
        if (token) {
            // Verify token and get user info
            try {
                const response = await fetch(`${API_BASE_URL}/me`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const user = await response.json();
                    await chrome.storage.local.set({
                        token: token,
                        email: user.email
                    });
                    checkAuth();
                }
            } catch (error) {
                console.error('Token verification failed:', error);
            }
        }
    }
});
