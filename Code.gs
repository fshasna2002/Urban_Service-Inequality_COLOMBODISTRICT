/**
 * Urban Service Inequality Web-Based Mapping System — Colombo District
 * Google Apps Script Web App
 *
 * doGet:  reads the Sheet and publishes rows as JSON for the web map to load.
 * doPost: ADDED — accepts a feedback submission directly from the website
 *         and appends it as a new row in the Sheet. This bypasses the
 *         Google Form's multiple-choice validation entirely (which was
 *         silently rejecting submissions whose dropdown text didn't
 *         exactly match the Form's predefined choices), so every
 *         submission now reliably lands in the Sheet for every visitor.
 *
 * DEPLOYMENT: see APPS_SCRIPT_SETUP.md in the project root for the full
 * step-by-step walkthrough. Short version:
 *   1. Open the Google Sheet that collects your Form responses (or any
 *      Sheet you want to use as the feedback store).
 *   2. Extensions -> Apps Script.
 *   3. Delete any starter code and paste this file's contents in.
 *   4. Deploy -> New deployment -> type "Web app".
 *        Execute as:  Me
 *        Who has access: Anyone
 *   5. Copy the resulting /exec URL into config.js -> APPS_SCRIPT_API_URL.
 */

// If your form responses live on a sheet tab with a different name,
// change this to match (Google names it "Form Responses 1" by default).
const SHEET_NAME = "Form Responses 1";

function doGet(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    return respond(e, { error: `Sheet "${SHEET_NAME}" not found.` });
  }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return respond(e, []); // header row only, no responses yet
  }

  const header = values[0].map(h => String(h).trim());
  const rows = values.slice(1);

  // Map the Form's actual column headers to the field names the web map
  // expects. Adjust the left-hand strings below if your Form used
  // different question text.
  const COLUMN_MAP = {
    "Timestamp": "timestamp",
    "GN Division": "gnDivision",
    "Service Type": "serviceType",
    "Issue Category": "issueCategory",
    "Describe the Issue": "description",
    "Location": "location",
  };

  const data = rows.map((row, i) => {
    const obj = { id: `row-${i + 2}` }; // +2 = 1-indexed + header row
    header.forEach((colName, idx) => {
      const key = COLUMN_MAP[colName] || colName;
      let val = row[idx];
      if (val instanceof Date) val = val.toISOString();
      obj[key] = val;
    });
    return obj;
  });

  // newest first
  data.reverse();

  return respond(e, data);
}

// --- ADDED: accepts a JSON POST body from the website and appends it as
// a new row, in the same column order as the existing header row (so it
// stays compatible with doGet's COLUMN_MAP above). If the Sheet is empty,
// it writes a header row first.
function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    return jsonResponse({ error: `Sheet "${SHEET_NAME}" not found.` });
  }

  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ error: "Invalid JSON body." });
  }

  const HEADER_ROW = ["Timestamp", "GN Division", "Service Type", "Issue Category", "Describe the Issue", "Location"];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER_ROW);
  }

  sheet.appendRow([
    new Date().toISOString(),
    body.gnDivision || "",
    body.serviceType || "",
    body.issueCategory || "",
    body.description || "",
    body.location || "",
  ]);

  return jsonResponse({ success: true });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- ADDED: if the request includes a ?callback=NAME parameter, wrap the
// JSON in a JSONP callback instead of returning plain JSON. Loading data
// via a <script> tag (JSONP) is not subject to CORS at all, which
// sidesteps a known inconsistency where Google's script.google.com/exec
// redirect sometimes omits the Access-Control-Allow-Origin header that
// fetch() cross-origin requests require.
function respond(e, obj) {
  const callback = e && e.parameter && e.parameter.callback;
  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${JSON.stringify(obj)})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return jsonResponse(obj);
}
