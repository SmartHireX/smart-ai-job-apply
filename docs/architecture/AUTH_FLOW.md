# Extension Authentication Flow

The extension needs to authenticate users with the SmartHireX backend. Here's how it works:

## Current Issue

The extension tries to open `/login?extension=true`, but this route doesn't exist in the frontend.

## Solution

The extension now:
1. Opens the root URL (`/`) where users can login via Google OAuth
2. Monitors the tab for successful login
3. Extracts the token from sessionStorage after login
4. Stores it in the extension's local storage

## How Users Will Login

### Method 1: Via Extension Popup
1. Click extension icon
2. Click "Login to SmartHireX"
3. New tab opens with SmartHireX home page
4. User clicks "Get Started" or "Sign in with Google"
5. After successful login, extension automatically detects and stores token

### Method 2: Already Logged In
If user is already logged in to SmartHireX in a tab:
1. Extension checks for token in Chrome storage
2. If not found, user clicks "Login to SmartHireX"
3. Opens main app (user already logged in)
4. Extension grabs token from sessionStorage

## Implementation Details

**popup.js** - Updated to:
- Open root URL instead of /login
- Inject script to check for token after page loads
- Listen for token messages from background script

**background.js** - Handles:
- Storing token from injected script
- Broadcasting token updates to popup

## Alternative: Manual Token Entry

Users can also manually copy their token:
1. Login to SmartHireX normally
2. Open browser DevTools > Application > Session Storage
3. Copy `access_token`
4. Paste in extension (if we add this UI)

## Future Enhancement

Add a settings page in extension where users can:
- View their login status
- Manually enter/refresh token
- Logout from extension
