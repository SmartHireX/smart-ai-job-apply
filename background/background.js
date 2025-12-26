// Background service worker
console.log('SmartHireX background service worker started');

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'STORE_TOKEN') {
        // Store authentication token and fetch user info
        const token = message.token;

        // Fetch user info from backend
        fetch('http://localhost:8000/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
            .then(response => response.json())
            .then(user => {
                // Store token and email
                chrome.storage.local.set({
                    token: token,
                    email: user.email
                }, () => {
                    console.log('Token and user info stored');
                    // Notify popup to refresh
                    chrome.runtime.sendMessage({ type: 'TOKEN_STORED' });
                    sendResponse({ success: true });
                });
            })
            .catch(error => {
                console.error('Failed to fetch user info:', error);
                // Store token anyway
                chrome.storage.local.set({ token: token }, () => {
                    chrome.runtime.sendMessage({ type: 'TOKEN_STORED' });
                    sendResponse({ success: false, error: error.message });
                });
            });

        return true; // Keep message channel open for async response
    }
});


// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('SmartHireX extension installed');
        // Open welcome page
        chrome.tabs.create({
            url: 'http://localhost:8080/?extension=installed'
        });
    } else if (details.reason === 'update') {
        console.log('SmartHireX extension updated');
    }
});


// Listen for tab updates to inject content script if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // Content script should already be injected via manifest
        // This is just for additional handling if needed
        console.log('Page loaded:', tab.url);
    }
});
