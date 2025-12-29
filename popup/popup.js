// API Configuration
const API_BASE_URL = 'http://localhost:8000';
const FRONTEND_URL = 'http://localhost:8080';


// DOM Elements
let authSection, mainSection, loginBtn, fillBtn, logoutLink, undoBtn;
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
    undoBtn = document.getElementById('undo-btn');

    // Check authentication
    await checkAuth();

    // Add event listeners
    loginBtn.addEventListener('click', handleLogin);
    fillBtn.addEventListener('click', handleFillForm);
    logoutLink.addEventListener('click', handleLogout);
    undoBtn.addEventListener('click', handleUndo);
});

// Check authentication status
async function checkAuth() {
    try {
        console.log('Checking authentication status...');

        // First, try to sync session from existing tabs automatically
        const { token: existingToken } = await chrome.storage.local.get(['token']);

        if (!existingToken) {
            console.log('No stored token, checking for active session in tabs...');
            await checkExistingSession();
        }

        // Now check if we have a token (either from storage or newly synced)
        const { token } = await chrome.storage.local.get(['token']);

        if (!token) {
            console.log('No token available, showing auth section');
            showAuthSection();
            return;
        }

        // Verify token is still valid
        console.log('Verifying token with backend...');
        const response = await fetch(`${API_BASE_URL}/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            console.log('Token invalid, clearing and showing auth section');
            // Token invalid
            await chrome.storage.local.remove(['token', 'email']);

            // Try one more sync before giving up
            await checkExistingSession();
            const { token: newToken } = await chrome.storage.local.get(['token']);

            if (!newToken) {
                showAuthSection();
                return;
            }

            // Recursive call with new token
            return checkAuth();
        }

        const user = await response.json();
        console.log('User authenticated:', user.email);

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
    console.log('Showing auth section');
    authSection.classList.remove('hidden');
    mainSection.classList.add('hidden');
    logoutLink.classList.add('hidden');
}

// Show main section
function showMainSection(user) {
    console.log('Showing main section for user:', user);
    authSection.classList.add('hidden');
    mainSection.classList.remove('hidden');
    logoutLink.classList.remove('hidden');

    // Update user info
    if (user.name) {
        userName.textContent = user.name;
        userInitial.textContent = user.name.charAt(0).toUpperCase();
    } else if (user.email) {
        userName.textContent = user.email;
        userInitial.textContent = user.email.charAt(0).toUpperCase();
    }
    if (user.email) {
        userEmail.textContent = user.email;
    }
    console.log('Main section displayed successfully');
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
    console.log('Logging out...');
    await chrome.storage.local.remove(['token', 'email']);
    await checkAuth();
}

// Detect forms on current page
async function detectForms() {
    console.log('Detecting forms on page...');
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab) {
            console.log('No active tab found');
            formCount.textContent = 'No active page';
            return;
        }

        console.log('Current tab:', tab.url);

        const response = await chrome.tabs.sendMessage(tab.id, {
            type: 'DETECT_FORMS'
        });

        console.log('Form detection response:', response);

        if (response && response.formCount > 0) {
            formStatus.classList.remove('error');
            formStatus.classList.add('success');
            formCount.textContent = `${response.formCount} form(s) detected`;
            fillBtn.disabled = false;
            console.log(`Forms found: ${response.formCount}`);
        } else {
            formStatus.classList.remove('success', 'error');
            formCount.textContent = 'No forms found on this page';
            fillBtn.disabled = true;
            console.log('No forms found');
        }
    } catch (error) {
        console.error('Form detection error:', error);
        formStatus.classList.remove('success');
        formStatus.classList.add('error');
        formCount.textContent = 'Could not detect forms';
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

        console.log('Extracted HTML length:', formData.html.length);
        console.log('HTML preview (first 500 chars):', formData.html.substring(0, 500));

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
        console.log('Analysis result:', analysis);
        console.log('Fields detected:', analysis.fields ? analysis.fields.length : 0);

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
        console.log('Mapping result:', mapping);
        console.log('Mappings count:', mapping.mappings ? Object.keys(mapping.mappings).length : 0);
        console.log('Missing fields:', mapping.missing_fields);

        // Add missing fields to mappings with empty values for inline editing in preview
        if (mapping.missing_fields && mapping.missing_fields.length > 0) {
            console.log('Adding missing fields to preview modal for inline editing');

            // Find the missing fields in the analysis
            for (const missingPurpose of mapping.missing_fields) {
                // Find field with this purpose
                const field = analysis.fields.find(f =>
                    f.purpose === missingPurpose ||
                    f.label.toLowerCase().includes(missingPurpose.toLowerCase())
                );

                if (field && field.selector) {
                    // Add to mappings with empty value and low confidence
                    mapping.mappings[field.selector] = {
                        value: '',
                        confidence: 0.3,
                        source: 'user_input_required',
                        field_type: field.type,
                        required: field.required || false
                    };
                }
            }
        }


        // Show preview modal for user to review and confirm
        hideProgress();
        showProgress('Ready to preview mappings...', 85);

        // Show preview modal for reviewing mappings before filling
        const previewResult = await chrome.tabs.sendMessage(tab.id, {
            type: 'SHOW_PREVIEW_MODAL',
            mappings: mapping.mappings,
            analysis: analysis,
            allFields: analysis.fields
        });

        if (!previewResult.success || previewResult.data.cancelled) {
            // User cancelled from preview
            hideProgress();
            showResult('info', 'ℹ️', 'Form filling cancelled.');
            fillBtn.disabled = false;
            return;
        }

        // Form is already filled by content script, just show the result
        const fillResult = previewResult.data;
        showProgress('Complete!', 100);

        // Show success result
        setTimeout(() => {
            hideProgress();

            // Build success message
            let successMessage = `Successfully filled ${fillResult.filled} out of ${fillResult.total} fields!`;

            // Add file upload reminder if there are file fields
            if (fillResult.fileFields && fillResult.fileFields.length > 0) {
                const fileCount = fillResult.fileFields.length;
                const fileWord = fileCount === 1 ? 'document' : 'documents';
                successMessage += `\n\n📄 Please upload ${fileCount} ${fileWord} at the highlighted field${fileCount > 1 ? 's' : ''}.`;
            }

            showResult(
                'success',
                '✅',
                successMessage
            );

            // Show undo button if undo data is available
            if (fillResult.canUndo) {
                undoBtn.classList.remove('hidden');
            }

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
    return new Promise(async (resolve, reject) => {
        try {
            // Get active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab) {
                reject(new Error('No active tab found'));
                return;
            }

            // Send message to content script to show modal on the page
            const response = await chrome.tabs.sendMessage(tab.id, {
                type: 'SHOW_MISSING_DATA_MODAL',
                missingFields: missingFields,
                allFields: allFields
            });

            if (response && response.success) {
                resolve(response.data);
            } else {
                reject(new Error(response?.error || 'Failed to collect missing data'));
            }
        } catch (error) {
            console.error('Error showing missing data modal:', error);
            reject(error);
        }
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

// Handle undo button click
async function handleUndo() {
    try {
        undoBtn.disabled = true;
        hideResult();
        showProgress('Restoring original values...', 50);

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Send undo message to content script
        const undoResult = await chrome.tabs.sendMessage(tab.id, {
            type: 'UNDO_FILL'
        });

        hideProgress();

        if (undoResult.success) {
            showResult(
                'success',
                '✨',
                `Successfully restored ${undoResult.restored} fields to their original values!`
            );
            // Hide undo button after successful undo
            undoBtn.classList.add('hidden');
        } else {
            showResult(
                'error',
                '❌',
                undoResult.error || 'Failed to undo. Please refresh the page and try again.'
            );
            undoBtn.disabled = false;
        }

    } catch (error) {
        console.error('Undo failed:', error);
        hideProgress();
        showResult(
            'error',
            '❌',
            'Undo failed. Please try again.'
        );
        undoBtn.disabled = false;
    }
}
