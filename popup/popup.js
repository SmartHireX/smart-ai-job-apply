// API Configuration
const API_BASE_URL = 'http://localhost:8000';
const FRONTEND_URL = 'http://localhost:8080';


// DOM Elements
let authSection, mainSection, loginBtn, fillBtn, chatBtn, logoutLink, undoBtn;
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
    chatBtn = document.getElementById('chat-btn');
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
    chatBtn.addEventListener('click', handleChatOpen);
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

// Handle chat window open
// Handle chat window open
async function handleChatOpen() {
    console.log('Toggling chat overlay...');
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab) {
            console.log('No active tab found');
            return;
        }

        // Send message to content script to toggle chat
        await chrome.tabs.sendMessage(tab.id, {
            type: 'TOGGLE_CHAT'
        });

        // Close the extension popup since the chat will appear on page
        window.close();

    } catch (error) {
        console.error('Failed to toggle chat:', error);
    }
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

        // Check for quota error
        if (analysis.error === 'AI_QUOTA_EXCEEDED') {
            showQuotaErrorModal(analysis.error_message);
            return;
        }

        if (!analysis.success) {
            throw new Error(analysis.error_message || 'Form analysis failed');
        }

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

        // Check for quota error
        if (mapping.error === 'AI_QUOTA_EXCEEDED') {
            showQuotaErrorModal(mapping.error_message);
            return;
        }

        if (!mapping.success) {
            throw new Error(mapping.error_message || 'Data mapping failed');
        }
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

        if (!previewResult.success || (previewResult.data && previewResult.data.cancelled)) {
            // User cancelled from preview OR error occurred
            hideProgress();

            if (!previewResult.success || (previewResult.data && previewResult.data.error)) {
                const errMsg = previewResult.error || (previewResult.data ? previewResult.data.error : 'Unknown error in preview');
                showResult('error', '⚠️', `Form filling failed: ${errMsg}`);
                console.error("Preview modal error:", errMsg);
            } else {
                showResult('info', 'ℹ️', 'Form filling cancelled.');
            }

            fillBtn.disabled = false;
            return;
        }

        // Form is already filled by content script, just show the result
        // New instant fill returns: { success: true, filled: X, review: Y }
        const filledCount = previewResult.filled || 0;
        const reviewCount = previewResult.review || 0;
        showProgress('Complete!', 100);

        // Show success result
        setTimeout(() => {
            hideProgress();

            // Build success message
            let successMessage = `Successfully filled ${filledCount} field${filledCount !== 1 ? 's' : ''}!`;

            // Add review reminder if there are fields needing review
            if (reviewCount > 0) {
                successMessage += `\n\n⚠️ ${reviewCount} field${reviewCount !== 1 ? 's' : ''} need${reviewCount === 1 ? 's' : ''} your review.`;
            }

            showResult(
                'success',
                '✅',
                successMessage
            );


            fillBtn.disabled = false;

            // Auto-close popup after 3 seconds to let user see the success animation
            console.log('✅ Setting up auto-close in 3 seconds...');
            setTimeout(() => {
                console.log('⏰ Attempting to close popup now...');
                window.close();
            }, 3000);
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

// Show progress with premium animated UI
function showProgress(message, percent) {
    progressSection.classList.remove('hidden');
    progressText.textContent = message;
    progressFill.style.width = `${percent}%`;

    // Create or update premium loader overlay
    let overlay = document.getElementById('premium-loader-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'premium-loader-overlay';
        overlay.className = 'premium-loader-overlay';

        // Determine which step we're on based on percent
        let currentStep = 1;
        if (percent >= 60) currentStep = 3;
        else if (percent >= 40) currentStep = 2;

        overlay.innerHTML = `
            <div class="premium-loader-card">
                <div class="loader-icon">
                    <div class="spinning-ring"></div>
                    <div class="pulsing-dot"></div>
                </div>
                <div class="loader-steps">
                    <div class="step ${currentStep >= 1 ? 'active' : ''}" data-step="1">
                        <div class="step-icon">📊</div>
                        <div class="step-label">Analyzing Form</div>
                    </div>
                    <div class="step ${currentStep >= 2 ? 'active' : ''}" data-step="2">
                        <div class="step-icon">✨</div>
                        <div class="step-label">AI Processing</div>
                    </div>
                    <div class="step ${currentStep >= 3 ? 'active' : ''}" data-step="3">
                        <div class="step-icon">🎯</div>
                        <div class="step-label">Mapping Data</div>
                    </div>
                </div>
                <div class="loader-message">${message}</div>
            </div>
        `;
        document.body.appendChild(overlay); // Append to body for full screen
    } else {
        // Update existing overlay
        const messageEl = overlay.querySelector('.loader-message');
        if (messageEl) messageEl.textContent = message;

        // Update step indicators
        let currentStep = 1;
        if (percent >= 80) currentStep = 4; // All done
        else if (percent >= 60) currentStep = 3;
        else if (percent >= 40) currentStep = 2;

        const steps = overlay.querySelectorAll('.step');
        steps.forEach((step, idx) => {
            if (idx + 1 <= currentStep) {
                step.classList.add('active');
            } else {
                step.classList.remove('active');
            }
        });
    }

    // Inject premium loader styles if not already present
    if (!document.getElementById('premium-loader-styles')) {
        const style = document.createElement('style');
        style.id = 'premium-loader-styles';
        style.textContent = `
            .premium-loader-overlay {
                position: fixed; /* Fixed to cover window */
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                /* Semi-transparent animated gradient to show blur */
                background: linear-gradient(-45deg, rgba(255,255,255,0.95), rgba(250,250,250,0.95), rgba(245,245,245,0.95), rgba(255,255,255,0.95));
                background-size: 400% 400%;
                backdrop-filter: blur(8px); /* Strong blur */
                -webkit-backdrop-filter: blur(8px);
                animation: gradient-flow 6s ease infinite, fadeIn 0.4s ease-out;
                z-index: 9999; /* Highest z-index */
                display: flex;
                align-items: center;
                justify-content: center;
            }

            @keyframes gradient-flow {
                0% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
            }
            
            .premium-loader-card {
                text-align: center;
                padding: 24px;
            }
            
            .loader-icon {
                position: relative;
                width: 60px;
                height: 60px;
                margin: 0 auto 20px;
            }
            
            .spinning-ring {
                position: absolute;
                width: 60px;
                height: 60px;
                border-radius: 50%;
                border: 3px solid transparent;
                border-top-color: #0a66c2;
                border-right-color: #60a5fa;
                animation: spin-gradient 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
            }
            
            @keyframes spin-gradient {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            .pulsing-dot {
                position: absolute;
                top: 50%;
                left: 50%;
                width: 12px;
                height: 12px;
                margin: -6px 0 0 -6px;
                border-radius: 50%;
                background: linear-gradient(135deg, #0a66c2, #3b82f6);
                animation: pulse-dot 2s ease-in-out infinite;
            }
            
            @keyframes pulse-dot {
                0%, 100% {
                    transform: scale(0.8);
                    opacity: 0.6;
                }
                50% {
                    transform: scale(1.2);
                    opacity: 1;
                }
            }
            
            .loader-steps {
                display: flex;
                justify-content: center;
                gap: 16px;
                margin-bottom: 20px;
            }
            
            .step {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 6px;
                opacity: 0.4;
                transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            .step.active {
                opacity: 1;
                transform: scale(1.05);
            }
            
            .step-icon {
                font-size: 20px;
                filter: grayscale(1);
                transition: filter 0.3s;
            }
            
            .step.active .step-icon {
                filter: grayscale(0);
                animation: bounce-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            
            @keyframes bounce-in {
                0% { transform: scale(0.3); }
                50% { transform: scale(1.1); }
                100% { transform: scale(1); }
            }
            
            .step-label {
                font-size: 10px;
                font-weight: 600;
                color: #64748b;
                white-space: nowrap;
            }
            
            .step.active .step-label {
                color: #0a66c2;
            }
            
            .loader-message {
                font-size: 13px;
                font-weight: 600;
                background: linear-gradient(90deg, #0a66c2, #3b82f6, #0a66c2);
                background-size: 200% auto;
                -webkit-background-clip: text;
                background-clip: text;
                -webkit-text-fill-color: transparent;
                animation: shimmer 4s linear infinite;
            }
            
            @keyframes shimmer {
                0% { background-position: 200% center; }
                100% { background-position: -200% center; }
            }
            
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
}

// Hide progress
function hideProgress() {
    progressSection.classList.add('hidden');
    progressFill.style.width = '0%';
    const overlay = document.getElementById('premium-loader-overlay');
    if (overlay) overlay.remove();
}


// Show premium result modal
function showResult(type, icon, message) {
    // Remove basic result section
    resultSection.classList.add('hidden');

    // Remove any existing premium modal
    const existingModal = document.getElementById('premium-result-modal');
    if (existingModal) existingModal.remove();

    // Create premium modal
    const modal = document.createElement('div');
    modal.id = 'premium-result-modal';
    modal.className = `premium-result-modal ${type}`;

    const isSuccess = type === 'success';
    const isError = type === 'error';

    modal.innerHTML = `
        <div class="premium-result-backdrop"></div>
        <div class="premium-result-card">
            <div class="result-icon-container ${isError ? 'shake-error' : ''}">
                ${isSuccess ? `
                    <svg class="checkmark" viewBox="0 0 52 52">
                        <circle class="checkmark-circle" cx="26" cy="26" r="25" fill="none"/>
                        <path class="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                    </svg>
                ` : `
                    <div class="error-icon">${icon}</div>
                `}
            </div>
            <h3 class="result-title">${isSuccess ? '✨ Success!' : isError ? 'Oops!' : 'Notice'}</h3>
            <p class="result-text">${message}</p>
            <button class="result-close-btn" onclick="window.close();">
                ${isSuccess ? 'Done! Close Extension' : 'Got it'}
            </button>
        </div>
        ${isSuccess ? '<div class="confetti-container"></div>' : ''}
    `;

    document.body.appendChild(modal);

    // Trigger confetti animation for success
    if (isSuccess) {
        createConfetti(modal.querySelector('.confetti-container'));
    }

    // Inject premium result styles if not already present
    if (!document.getElementById('premium-result-styles')) {
        const style = document.createElement('style');
        style.id = 'premium-result-styles';
        style.textContent = `
            .premium-result-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
                animation: modal-fade-in 0.3s ease-out;
            }
            
            @keyframes modal-fade-in {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            .premium-result-backdrop {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(15, 23, 42, 0.7);
                backdrop-filter: blur(8px);
            }
            
            .premium-result-card {
                position: relative;
                background: white;
                border-radius: 20px;
                padding: 40px 32px 32px;
                max-width: 340px;
                width: calc(100% - 40px);
                text-align: center;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                animation: card-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            }
            
            @keyframes card-slide-up {
                from {
                    transform: translateY(32px) scale(0.95);
                    opacity: 0;
                }
                to {
                    transform: translateY(0) scale(1);
                    opacity: 1;
                }
            }
            
            .result-icon-container {
                width: 80px;
                height: 80px;
                margin: 0 auto 20px;
                position: relative;
            }
            
            /* Success Checkmark Animation */
            .checkmark {
                width: 80px;
                height: 80px;
                border-radius: 50%;
                display: block;
                stroke-width: 3;
                stroke: #10b981;
                stroke-miterlimit: 10;
                animation: fill-success 0.4s ease-in-out 0.4s forwards, scale-success 0.3s ease-in-out 0.9s both;
            }
            
            .checkmark-circle {
                stroke-dasharray: 166;
                stroke-dashoffset: 166;
                stroke-width: 3;
                stroke: #10b981;
                fill: none;
                animation: stroke-circle 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
            }
            
            .checkmark-check {
                transform-origin: 50% 50%;
                stroke-dasharray: 48;
                stroke-dashoffset: 48;
                animation: stroke-check 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.8s forwards;
            }
            
            @keyframes stroke-circle {
                100% {
                    stroke-dashoffset: 0;
                }
            }
            
            @keyframes stroke-check {
                100% {
                    stroke-dashoffset: 0;
                }
            }
            
            @keyframes scale-success {
                0%, 100% {
                    transform: scale(1);
                }
                50% {
                    transform: scale(1.1);
                }
            }
            
            @keyframes fill-success {
                100% {
                    box-shadow: inset 0 0 0 40px #10b981;
                }
            }
            
            /* Error Icon Animation */
            .error-icon {
                font-size: 48px;
                animation: shake 0.5s ease-in-out;
            }
            
            .shake-error {
                animation: shake 0.5s ease-in-out;
            }
            
            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
                20%, 40%, 60%, 80% { transform: translateX(8px); }
            }
            
            .result-title {
                font-size: 24px;
                font-weight: 700;
                color: #0f172a;
                margin: 0 0 12px;
                letter-spacing: -0.02em;
            }
            
            .result-text {
                font-size: 15px;
                color: #64748b;
                line-height: 1.6;
                margin: 0 0 24px;
                white-space: pre-line;
            }
            
            .result-close-btn {
                width: 100%;
                padding: 14px 20px;
                background: linear-gradient(135deg, #0a66c2 0%, #3b82f6 100%);
                color: white;
                border: none;
                border-radius: 4px; /* rounded-sm */
                font-size: 15px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                box-shadow: 0 4px 12px rgba(10, 102, 194, 0.3);
            }
            
            .result-close-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(10, 102, 194, 0.4);
            }
            
            .result-close-btn:active {
                transform: translateY(0);
            }
            
            /* Confetti */
            .confetti-container {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                overflow: hidden;
                pointer-events: none;
                z-index: 100000;
            }
            
            .confetti-piece {
                position: absolute;
                width: 8px;
                height: 8px;
                background: var(--confetti-color);
                top: 0;
                opacity: 0;
                animation: confetti-fall 2.5s ease-in-out forwards;
            }
            
            @keyframes confetti-fall {
                0% {
                    opacity: 1;
                    transform: translateY(0) rotate(0deg);
                }
                100% {
                    opacity: 0;
                    transform: translateY(100vh) rotate(720deg);
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Don't auto-dismiss success modals - popup will close automatically
}

// Create confetti particles
function createConfetti(container) {
    const colors = ['#0a66c2', '#3b82f6', '#10b981', '#f59e0b', '#0ea5e9'];
    const pieces = 30;

    for (let i = 0; i < pieces; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti-piece';
        confetti.style.setProperty('--confetti-color', colors[Math.floor(Math.random() * colors.length)]);
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.animationDelay = Math.random() * 0.3 + 's';
        confetti.style.animationDuration = (Math.random() * 1 + 2) + 's';
        container.appendChild(confetti);
    }
}

// Hide result (now removes modal)
function hideResult() {
    resultSection.classList.add('hidden');
    const modal = document.getElementById('premium-result-modal');
    if (modal) modal.remove();
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
// Add this to the end of popup.js

/**
 * Show premium error modal for AI quota exceeded
 */
function showQuotaErrorModal(message) {
    // Hide progress
    hideProgress();

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 20px;
    `;

    overlay.innerHTML = `
        <div style="
            background: white;
            border-radius: 16px;
            padding: 32px;
            max-width: 400px;
            text-align: center;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        ">
            <div style="
                width: 64px;
                height: 64px;
                background: linear-gradient(135deg, #f59e0b, #ef4444);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 20px;
                font-size: 32px;
            ">⚠️</div>
            
            <h2 style="
                font-size: 20px;
                font-weight: 700;
                color: #1e293b;
                margin: 0 0 12px;
            ">AI Quota Exceeded</h2>
            
            <p style="
                font-size: 14px;
                color: #64748b;
                line-height: 1.6;
                margin: 0 0 24px;
            ">${message || 'You\'ve exceeded your AI quota. Please try again in a few minutes.'}</p>
            
            <div style="
                display: flex;
                gap: 12px;
                justify-content: center;
            ">
                <button onclick="this.closest('div').parentElement.remove()" style="
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: transform 0.2s;
                " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                    Got It
                </button>
                
                <a href="https://ai.google.dev/" target="_blank" style="
                    background: #f1f5f9;
                    color: #475569;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    text-decoration: none;
                    display: inline-block;
                    transition: background 0.2s;
                " onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">
                    Learn More
                </a>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Auto-remove after 10 seconds
    setTimeout(() => {
        if (overlay.parentNode) {
            overlay.remove();
        }
    }, 10000);

    // ALSO Show toaster on the actual page (content script)
    try {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'SHOW_ERROR_TOAST',
                    message: message || 'You\'ve exceeded your AI quota.'
                });
            }
        });
    } catch (e) {
        console.error('Failed to show error toaster:', e);
    }
}
