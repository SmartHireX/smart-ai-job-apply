# SmartHireX Browser Extension

AI-powered form filling extension for job applications.

## Installation

### For Development

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `smart-hirex-extension` directory

### For Users

*(Will be published to Chrome Web Store after testing)*

## Usage

1. **Login**: Click the extension icon and login to your SmartHireX account
2. **Navigate**: Go to any job application page
3. **Fill**: Click the extension icon → "Fill Form with AI"
4. **Review**: Check filled fields and submit

## Features

- ✅ Automatic form detection
- ✅ AI-powered field mapping
- ✅ Visual feedback (highlighted fields)
- ✅ Submit button highlighting
- ✅ Secure authentication
- ✅ Works on any website
- ✅ **NEW**: Automatic token sync with SmartHireX website

## Technical Details

### Architecture

- **Manifest V3**: Latest Chrome extension standard
- **Content Scripts**: Injected into web pages for form manipulation
- **Background Worker**: Handles extension lifecycle and messaging
- **Popup UI**: User interface for triggering AI fill

### API Integration

Communicates with SmartHireX backend at `http://localhost:8000`:
- `/autofill/analyze` - Analyze form fields
- `/autofill/map-data` - Map user data to fields
- `/me` - Verify authentication

### Permissions

- `activeTab`: Access current tab content
- `storage`: Store authentication token
- `scripting`: Inject content scripts

## Development

### File Structure

```
smart-hirex-extension/
├── manifest.json           # Extension configuration
├── popup/                  # Extension popup
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── content/                # Content scripts
│   ├── content.js
│   └── content.css
├── background/             # Background worker
│   └── background.js
└── icons/                  # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### Testing

1. Make changes to source files
2. Go to `chrome://extensions/`
3. Click "Reload" button for SmartHireX extension
4. Test on a sample form page

## Privacy & Security

- Tokens stored locally in Chrome storage
- No form data sent to third parties
- HTTPS for all API communications (in production)
- User data only accessed with permission

## Troubleshooting

**Extension not detecting forms?**
- Refresh the page after installing extension
- Check if page has actual `<form>` tags
- Some dynamic forms may need manual field detection

**Login not working?**
- Make sure backend server is running at `http://localhost:8000`
- Ensure frontend is running at `http://localhost:8080`
- Check browser console for errors
- Clear extension storage and try again

**Forms not filling correctly?**
- Some fields may use custom input components
- Try filling manually then use extension for remaining fields
- Report issues to help improve AI mapping

## Recent Updates

### Authentication Sync Fix (Dec 2024)
- Fixed URL port mismatch (now correctly uses port 8080)
- Added automatic token sync from website to extension
- Improved authentication flow documentation

## Future Features

- [ ] Multi-page form support
- [ ] File upload handling
- [ ] Form template saving
- [ ] Firefox support
- [ ] Custom field mapping editor

