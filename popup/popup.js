/**
 * Popup JavaScript for Smart AI Job Apply Extension
 * 
 * Handles popup UI, form detection, and triggers form filling.
 * Uses local AI client and resume manager instead of backend.
 */

// DOM Elements
let setupSection, mainSection, progressSection;
let fillBtn, chatBtn, undoBtn, settingsBtn, openSettingsBtn;
let formStatus, statusIcon;
let progressFill, progressTitle, progressText;

// State
let isReady = false;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Smart AI Job Apply popup loaded');

    // Get DOM elements
    setupSection = document.getElementById('setup-section');
    mainSection = document.getElementById('main-section');
    progressSection = document.getElementById('progress-section');

    fillBtn = document.getElementById('fill-btn');
    chatBtn = document.getElementById('chat-btn');
    undoBtn = document.getElementById('undo-btn');
    settingsBtn = document.getElementById('settings-btn');
    openSettingsBtn = document.getElementById('open-settings-btn');

    formStatus = document.getElementById('form-status');
    statusIcon = document.getElementById('status-icon');

    progressFill = document.getElementById('progress-fill');
    progressTitle = document.getElementById('progress-title');
    progressText = document.getElementById('progress-text');

    // Add event listeners
    fillBtn.addEventListener('click', handleFillForm);
    chatBtn.addEventListener('click', handleChatOpen);
    undoBtn.addEventListener('click', handleUndo);
    settingsBtn.addEventListener('click', openSettings);
    openSettingsBtn.addEventListener('click', openSettings);

    // Check setup status
    await checkSetup();
});

/**
 * Check if extension is properly set up
 */
async function checkSetup() {
    try {
        const status = await window.AIClient.checkSetupStatus();

        console.log('Setup status:', status);

        // Update checklist UI
        updateChecklist('check-api', status.hasApiKey);
        updateChecklist('check-resume', status.hasResume);

        if (status.ready) {
            isReady = true;
            showMainSection();
            await detectForms();
        } else {
            showSetupSection(status);
        }

    } catch (error) {
        console.error('Setup check failed:', error);
        showSetupSection({ hasApiKey: false, hasResume: false });
    }
}

function updateChecklist(id, isComplete) {
    const item = document.getElementById(id);
    const icon = item.querySelector('.check-icon');

    if (isComplete) {
        item.classList.add('complete');
        icon.textContent = '✓';
    } else {
        item.classList.remove('complete');
        icon.textContent = '○';
    }
}

function showSetupSection(status) {
    setupSection.classList.remove('hidden');
    mainSection.classList.add('hidden');
    progressSection.classList.add('hidden');

    // Update message based on what's missing
    const message = document.getElementById('setup-message');
    if (!status.hasApiKey && !status.hasResume) {
        message.textContent = 'Configure your API key and resume to get started.';
    } else if (!status.hasApiKey) {
        message.textContent = 'Add your Gemini API key to enable AI features.';
    } else {
        message.textContent = 'Add your resume data to auto-fill applications.';
    }
}

function showMainSection() {
    setupSection.classList.add('hidden');
    mainSection.classList.remove('hidden');
    progressSection.classList.add('hidden');
}

function showProgressSection() {
    setupSection.classList.add('hidden');
    mainSection.classList.add('hidden');
    progressSection.classList.remove('hidden');
}

/**
 * Open settings/options page
 */
function openSettings() {
    chrome.runtime.openOptionsPage();
}

/**
 * Detect forms on current page
 */
async function detectForms() {
    console.log('Detecting forms on page...');
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab) {
            formStatus.textContent = 'No active page';
            return;
        }

        // Check if we can access this page
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
            formStatus.textContent = 'Cannot access this page';
            statusIcon.textContent = '⚠';
            statusIcon.style.background = 'var(--warning)';
            return;
        }

        const response = await chrome.tabs.sendMessage(tab.id, {
            type: 'DETECT_FORMS'
        });

        console.log('Form detection response:', response);

        if (response && response.formCount > 0) {
            formStatus.textContent = `${response.formCount} form(s) detected`;
            statusIcon.textContent = '✓';
            statusIcon.style.background = 'var(--success)';
            fillBtn.disabled = false;
        } else {
            formStatus.textContent = 'No forms found on this page';
            statusIcon.textContent = '○';
            statusIcon.style.background = 'var(--gray-400)';
            fillBtn.disabled = true;
        }

    } catch (error) {
        console.error('Form detection error:', error);

        if (error.message.includes('Receiving end does not exist') ||
            error.message.includes('Could not establish connection')) {
            formStatus.textContent = 'Please refresh the page';
        } else {
            formStatus.textContent = 'Could not detect forms';
        }

        statusIcon.textContent = '!';
        statusIcon.style.background = 'var(--danger)';
        fillBtn.disabled = true;
    }
}

/**
 * Handle fill form button click
 */
async function handleFillForm() {
    if (!isReady) {
        showSetupSection({ hasApiKey: false, hasResume: false });
        return;
    }

    try {
        fillBtn.disabled = true;

        // Get active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab) {
            console.error('No active tab found');
            return;
        }

        // Step 1: Activate extension (load all scripts lazily)
        console.log('🔄 Activating extension (loading scripts)...');
        formStatus.textContent = 'Loading extension...';

        const activationResponse = await chrome.tabs.sendMessage(tab.id, {
            type: 'ACTIVATE_EXTENSION'
        });

        if (!activationResponse || !activationResponse.loaded) {
            console.error('Extension activation failed');
            showError('Failed to load extension. Please refresh page.');
            fillBtn.disabled = false;
            return;
        }

        console.log('✅ Extension activated and ready');

        // Step 2: Trigger form processing
        console.log('🚀 Triggering local AI form processing...');
        formStatus.textContent = 'Processing forms...';

        chrome.tabs.sendMessage(tab.id, {
            type: 'START_LOCAL_PROCESSING'
        });

        // Close popup to let animation take over on page
        window.close();

    } catch (error) {
        console.error('Failed to start processing:', error);
        fillBtn.disabled = false;
        showError('Failed to start. Please try again.');
    }
}

/**
 * Handle chat button click
 */
async function handleChatOpen() {
    console.log('Opening chat overlay...');
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab) {
            console.log('No active tab found');
            return;
        }

        // Activate extension first
        console.log('🔄 Activating extension for chat...');
        await chrome.tabs.sendMessage(tab.id, {
            type: 'ACTIVATE_EXTENSION'
        });

        // Then toggle chat
        await chrome.tabs.sendMessage(tab.id, {
            type: 'TOGGLE_CHAT'
        });

        // Close popup
        window.close();

    } catch (error) {
        console.error('Failed to open chat:', error);
        showError('Connection error. Please reload the webpage.');
    }
}

/**
 * Handle undo button click
 */
async function handleUndo() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab) return;

        const result = await chrome.tabs.sendMessage(tab.id, {
            type: 'UNDO_FILL'
        });

        if (result && result.success) {
            undoBtn.classList.add('hidden');
            showToast('Form fill undone');
        } else {
            showToast('Nothing to undo', 'warning');
        }

    } catch (error) {
        console.error('Undo failed:', error);
    }
}

/**
 * Show error message
 */
function showError(message) {
    formStatus.textContent = message;
    formStatus.style.color = 'var(--danger)';
    statusIcon.textContent = '!';
    statusIcon.style.background = 'var(--danger)';
}

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => toast.classList.add('visible'), 10);

    // Remove after delay
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'FILL_COMPLETE') {
        undoBtn.classList.remove('hidden');
        fillBtn.disabled = false;
    }

    if (message.type === 'FILL_ERROR') {
        showError(message.error);
        fillBtn.disabled = false;
    }
});
