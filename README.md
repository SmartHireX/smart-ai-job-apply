# Smart AI Job Apply - Standalone Extension

A standalone Chrome extension that uses your own AI API key to fill job applications and chat with your resume data.

## Features

- **Privacy First**: Your data stays in your browser (Local Storage).
- **Bring Your Own Key**: Works with your Google Gemini API key (Free tier available).
- **Smart Form Filling**: AI analyzes forms and maps your resume data automatically.
- **AI Chat Assistant**: Ask questions about your resume or get help with application answers.
- **Resume Manager**: Manage your profile, experience, and skills directly in the extension.

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked**.
4. Select the `smart-ai-job-apply` folder.
5. The extension icon should appear in your toolbar.

## Setup Guide

1. Click the extension icon.
2. Click **Open Settings** (or the Setup button).
3. **API Key**: 
   - Get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
   - Enter it in the "API Key" tab and click Validate.
4. **Resume**:
   - Go to "Personal Info" and other tabs.
   - Fill in your details or import a JSON backup.
   - Click "Save All Changes" at the bottom.

## Usage

1. **Fill Forms**:
   - Navigate to any job application page (e.g., specific job posting).
   - Click the extension icon.
   - Valid forms will be detected. Click **Fill Form with AI**.
   - Review filled fields in the sidebar.

2. **Chat Assistant**:
   - Click **AI Assistant** in the popup.
   - Ask questions like "Summarize my experience" or "Write a cover letter for this job".

## Troubleshooting

- **"No forms detected"**: Refresh the page and try again. Some complex forms (iframes) might be tricky.
- **AI Errors**: Check your API key limits. The free tier has 60 requests/minute.
- **Extension Error**: Check the background script console (Inspect popup > Console) for details.
