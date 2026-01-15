# Quick Start Guide - SmartHireX Extension

## Fixed: Login Flow

✅ **Issue Resolved**: The extension now correctly opens the home page instead of a non-existent `/login` route.

## How to Use the Extension

### Step 1: Install Extension

1. Open Chrome: `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select folder: `/Users/karan-sayaji.kadam/my_app/smart-hirex/smart-hirex-extension/`

### Step 2: Login

**Option A: Via Extension**
1. Click the SmartHireX extension icon in toolbar
2. Click "Login to SmartHireX" button
3. This opens `http://localhost:5173/` in a new tab
4. Click "Get Started" or sign in with Google
5. After successful login, extension automatically detects your session
6. You can close the login tab

**Option B: Already Logged In**
If you're already using SmartHireX in another tab:
1. Just click the extension icon
2. If you're logged in, it should auto-detect
3. If not, click "Login to SmartHireX" and login in the new tab

### Step 3: Fill Forms

1. Navigate to any job application page
2. Click the SmartHireX extension icon
3. Extension shows "X forms detected"
4. Click "Fill Form with AI" button
5. Watch the magic happen! ✨

## How It Works

The extension:
1. Detects you're logged in by checking your session token
2. Extracts form fields from the current page
3. Sends them to the AI backend
4. Gets back your data (from resume/profile)
5. Fills the form automatically
6. Highlights the submit button

## Troubleshooting

**"Please log in to use AI form filling"**
- Make sure you have an account at `http://localhost:5173/`
- Click "Login to SmartHireX" and complete the login
- The extension should auto-detect after successful login

**Extension icon not showing**
- Check if extension is enabled in `chrome://extensions/`
- Look for puzzle piece icon in toolbar and pin SmartHireX

**Forms not detected**
- Refresh the page after installing extension
- Some forms may use custom components
- Check browser console for errors

## Test It Out

Try this simple test form:

1. Create a file called `test-form.html`:
```html
<!DOCTYPE html>
<html>
<body>
  <h1>Test Job Application</h1>
  <form>
    <p><label>Name: <input type="text" name="name"/></label></p>
    <p><label>Email: <input type="email" name="email"/></label></p>
    <p><label>Phone: <input type="tel" name="phone"/></label></p>
    <p><label>LinkedIn: <input type="url" name="linkedin"/></label></p>
    <p><label>Cover Letter: <textarea name="cover"></textarea></label></p>
    <p><button type="submit">Submit Application</button></p>
  </form>
</body>
</html>
```

2. Open it in Chrome
3. Click extension icon
4. Click "Fill Form with AI"
5. Watch it fill!

## Next Steps

- Make sure backend is running: `http://localhost:8000`
- Make sure frontend is running: `http://localhost:5173`
- Upload your resume to SmartHireX
- Test on real job applications!
