/* =====================================================================
   CONFIGURATION — paste your own IDs/URLs here.
   This file is intentionally separate from script.js so you never have
   to touch the application logic when connecting your own Google Sheet.

   The Community Feedback panel is an in-page form (not a link out to
   Google Forms). Submissions POST directly to APPS_SCRIPT_API_URL below
   (handled by doPost in Code.gs), which appends a row straight into the
   Sheet. This avoids Google Forms' strict multiple-choice validation,
   which silently drops a submission whenever the dropdown text doesn't
   exactly match the Form's predefined choices.

   The only thing you MUST set below is APPS_SCRIPT_API_URL (#3).
   GOOGLE_FORM_ACTION_URL / GOOGLE_FORM_ENTRIES / GOOGLE_FORM_VIEW_URL are
   kept here for reference only, in case you want a standalone Google
   Form as an alternate, separate way for people to submit — the in-page
   form on the map doesn't use them.
   ===================================================================== */

const CONFIG = {

  // 1) (Optional, not used by the in-page form) Google Form "formResponse"
  //    submission URL and its view URL, kept for reference.
  GOOGLE_FORM_ACTION_URL:
    "https://docs.google.com/forms/u/0/d/e/1FAIpQLSdhZqHQnwJ_VTmfngSdNurf_MrFFtjjBOGGgv1d6SAezps2fw/formResponse",
  GOOGLE_FORM_VIEW_URL:
    "https://docs.google.com/forms/d/e/1FAIpQLSdhZqHQnwJ_VTmfngSdNurf_MrFFtjjBOGGgv1d6SAezps2fw/viewform",

  // 2) (Optional, not used by the in-page form) Entry IDs for the
  //    standalone Google Form, if you keep using it separately.
  GOOGLE_FORM_ENTRIES: {
    gnDivision:  "entry.323032994",
    serviceType: "entry.1615350334",
    issueCategory: "entry.151701495", // FIXED: real entry ID, was a duplicate of serviceType before
    description: "entry.283401894",
    location:    "entry.1312166089",
  },

  // 3) REQUIRED — Google Apps Script Web App URL (deployed from the
  //    Google Sheet you want feedback stored in). The map uses this
  //    for BOTH reading the feedback list (doGet) AND submitting new
  //    feedback (doPost) — see Code.gs.
  //    See APPS_SCRIPT_SETUP.md for step-by-step deployment instructions.
  //    Paste the URL Google gives you after deployment below, e.g.:
  //    "https://script.google.com/macros/s/AKfycb.../exec"
  APPS_SCRIPT_API_URL: "https://script.google.com/macros/s/AKfycbwkc2yoSFEvazhm7PDwmKGyGD3pBJsqaLsyZ5ZDQfXl51xAOdxkCyL4BpOkvaDnxSKWWw/exec",

  // How often (ms) to auto-refresh the Recent Feedback list.
  AUTO_REFRESH_MS: 30000,
};
