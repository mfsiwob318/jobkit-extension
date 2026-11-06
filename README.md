# JobKit

A local-first job-application workspace inspired by the common profile → job posting → application kit → reviewed form-fill workflow. It is an independent implementation, not affiliated with or copied from ProActive.

## What is included

- **Backend:** Node.js HTTP API with a local JSON store; no database server, paid hosting, or API key required for basic use.
- **Web dashboard:** Candidate profile, application tracker, status changes, and optional AI provider settings.
- **Chrome extension:** Detects a job page, lets you edit job details, creates a draft kit, fills recognized form fields only after confirmation, and saves an application to the local tracker. It never submits a job application.
- **Optional AI:** Add your own Google Gemini API key to use its available free tier. Free quotas, model access, and account eligibility are governed by Google and can change. Without a key, a local template generator works without network AI.

## Requirements

- Node.js 20 or newer
- Google Chrome or Chromium-based browser
- Optional: a Gemini API key from Google AI Studio. Do not commit keys to source control.

## Run the backend and dashboard

From this folder, run `npm start`, then open `http://127.0.0.1:8787`. The server binds to loopback by default. Application data and an optional dashboard-entered key are stored under `backend/data/` and excluded from Git.

For deployments, prefer setting the environment variables `GEMINI_API_KEY` and optionally `GEMINI_MODEL` rather than saving a key through the dashboard. The dashboard never reads the secret back. Never expose this backend directly to the public internet as-is; it has no user authentication and is designed for local single-user use.

## Load the Chrome extension

1. Start the backend.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select this project's `extension/` folder.
4. Open a job posting, click the JobKit toolbar icon, review/edit the detected title, company, location, and description, then select **Create application kit**.
5. Review and edit the draft. **Fill form** asks for confirmation, fills eligible matching fields only, and does not submit. **Save to tracker** records the job in the dashboard.

If the extension was installed while a job page was already open, refresh that page once so Chrome can attach its content script. Restricted pages such as Chrome settings and the Chrome Web Store cannot be read.

## Privacy and safety

Job descriptions are sent to the local backend only when you request kit generation. If a Gemini key is configured, the backend sends the profile and job details to Google's Gemini API for that request; otherwise, generation is local. The extension's form-fill action is user-triggered, skips file uploads and sensitive/legal fields, and never presses submit. Verify all generated details and application answers before use.

## API overview

- `GET /api/health`
- `GET, PUT /api/profile`
- `GET, POST /api/applications`
- `PUT, DELETE /api/applications/:id`
- `GET, PUT /api/settings` — never returns the key itself
- `POST /api/generate`

The API is intended for local use and the extension's `chrome-extension://` origin. Do not use this sample as a multi-user/public service without authentication, proper secret management, input validation, and a production database.
