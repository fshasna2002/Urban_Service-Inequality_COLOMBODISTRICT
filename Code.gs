/**
 * Urban Service Inequality Web-Based Mapping System — Colombo District
 * Google Apps Script Web App
 *
 * Reads the response Sheet linked to the Community Feedback Google Form
 * and publishes the rows as a JSON array that the web map can fetch.
 *
 * DEPLOYMENT: see APPS_SCRIPT_SETUP.md in the project root for the full
 * step-by-step walkthrough. Short version:
 *   1. Open the Google Sheet that collects your Form responses.
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
    return jsonResponse({ error: `Sheet "${SHEET_NAME}" not found.` });
  }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return jsonResponse([]); // header row only, no responses yet
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

  return jsonResponse(data);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
