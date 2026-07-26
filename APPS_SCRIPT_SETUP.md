# Connecting the map to your Google Form / Sheet

The map already points at the Google Form URL and entry IDs you supplied
(see `config.js`). The only remaining step is publishing your response
Sheet as a small JSON API so the **Recent Submitted Feedback** panel can
read it back.

## 1. Open the linked Sheet

In your Google Form, click the **Responses** tab → the green Sheets
icon → this opens (or creates) the spreadsheet that stores every
submission. Note the tab name at the bottom — it's usually
`Form Responses 1`.

## 2. Add the Apps Script

1. In the Sheet, go to **Extensions → Apps Script**.
2. Delete the placeholder `myFunction() {}` code.
3. Paste in the contents of `Code.gs` (included in this project).
4. If your response tab isn't named `Form Responses 1`, update the
   `SHEET_NAME` constant at the top of the script.
5. Click **Save** (the disk icon), name the project something like
   `Colombo Feedback API`.

## 3. Deploy as a Web App

1. Click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" → choose **Web app**.
3. Fill in:
   - **Description:** `Colombo feedback JSON API`
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
4. Click **Deploy**.
5. Google will ask you to authorize the script the first time —
   accept the permissions (it only reads your own Sheet).
6. Copy the **Web app URL** shown — it ends in `/exec`.

## 4. Paste the URL into the map

Open `config.js` in the project and paste the URL here:

```js
APPS_SCRIPT_API_URL: "https://script.google.com/macros/s/AKfycb.../exec",
```

Reload `index.html` — the Recent Submitted Feedback list should now
populate from your Sheet, and refresh automatically every 30 seconds
(or on demand via the ⟳ button).

## 5. Re-deploying after edits

If you change `Code.gs` later, you must create a **new version** for
the live URL to pick up the change:
**Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy.**
The `/exec` URL stays the same, so you won't need to update `config.js`
again.

## Troubleshooting

- **Empty list / no error:** check that `SHEET_NAME` in `Code.gs`
  exactly matches your response tab name.
- **`Could not load live feedback` message:** the deployment's
  "Who has access" setting probably isn't `Anyone` — edit the
  deployment and redeploy.
- **New submissions not appearing immediately:** Google Sheets can
  take a few seconds to register a Form submission; the map already
  retries automatically 4 seconds after you submit, and again every
  30 seconds after that.
