# Urban Service Inequality Web-Based Mapping System — Colombo District

An interactive, planning-oriented Web GIS built with **HTML, CSS, JavaScript
and Leaflet.js**. It visualizes GN Division accessibility/priority indices,
five categories of urban service points, and a Google Forms–backed
community feedback system — all client-side, no server framework required.

## File structure

```
webgis/
├── index.html              Page structure (header, sidebars, map, feedback panel)
├── style.css               All styling / design tokens
├── config.js                ⭐ Paste your Google Form + Apps Script URLs here
├── script.js                Application logic (map, layers, search, feedback)
├── Code.gs                  Google Apps Script — publishes Sheet as JSON API
├── APPS_SCRIPT_SETUP.md      Step-by-step Apps Script deployment guide
├── generate_data.py         Script used to generate the sample GeoJSON (optional, not needed at runtime)
└── data/
    ├── GND_layer_n.geojson    GN Division polygons + population/accessibility/priority
    ├── Hospitals.geojson
    ├── Schools.geojson
    ├── Banks.geojson
    ├── Parks.geojson
    └── Bus_stops.geojson
```

> **Filenames are case-sensitive.** `data/Hospitals.geojson` and
> `data/hospitals.geojson` are different files on most web hosts
> (GitHub Pages included). If you rename or replace any file in `data/`,
> make sure the path in `script.js` (`SERVICE_META` and the GN division
> `fetch(...)` call) matches the actual filename exactly.

## GN Division data schema

`script.js` normalizes your GeoJSON's real attribute field names onto the
names the rest of the app expects, so nothing else in the codebase needs
to change if your source data uses different column names. This mapping
lives near the top of `loadGnDivisions()`:

```js
const FIELD = {
  name:          'ADM4_EN',
  population:    'Colombo_GN_Population_Population',
  accessibility: 'AI',
  priority:      'priority_i',
};
```

`AI` and `priority_i` are stored and displayed as their **raw 0–1
decimal** values (e.g. `0.62`), exactly as they appear in
`GND_layer_n.geojson` — nothing is rescaled. The color-bucket thresholds
in `accessibilityColor()` / `accessibilityLabel()` / `priorityColor()` /
`priorityLabel()` are set to match that 0–1 scale (`0.20/0.40/0.60/0.80`
and `0.33/0.66`).

If you replace the data with a different schema, only this `FIELD`
object needs updating — update the four right-hand values to your
GeoJSON's actual property names.

### Business rule: Very Poor accessibility ⇒ High Priority

A GN Division with `accessibility_index < 0.20` ("Very Poor") is always
displayed as **High Priority** — its pill badge, popup color, and the
polygon's fill color in the Priority theme all reflect this — regardless
of its raw `priority_i` value in the source data. This is handled by the
`effectivePriorityIndex()` helper in `script.js` and does not modify the
underlying data, only what's displayed.

## Where to paste your own IDs

| What | File | Where |
|---|---|---|
| Google Form "view" URL (opens when visitors click "Click for Feedback") | `config.js` | `GOOGLE_FORM_VIEW_URL` |
| Google Apps Script Web App URL (reads the Sheet back into the map) | `config.js` | `APPS_SCRIPT_API_URL` — see `APPS_SCRIPT_SETUP.md` |

`GOOGLE_FORM_ACTION_URL` / `GOOGLE_FORM_ENTRIES` are also present in
`config.js` for reference (e.g. if you ever want to rebuild an inline
submission form), but the map itself doesn't use them — see **Community
Feedback flow** below.

## Community Feedback flow

The right sidebar's Community Feedback panel is intentionally simple:

1. A **"📋 Click for Feedback"** button opens your real Google Form in a
   new tab (`GOOGLE_FORM_VIEW_URL`). Visitors fill it out using Google's
   own form UI — this means dropdown choices always match exactly (no
   risk of a mismatch silently dropping a submission).
2. Form responses land in the linked Google Sheet, as normal.
3. The Apps Script (`Code.gs`, deployed as a Web App) reads that Sheet
   and serves it as JSON via `doGet`.
4. `script.js` fetches that JSON on page load and every
   `CONFIG.AUTO_REFRESH_MS` (default 30s), or on demand via the ⟳
   refresh button, and renders it into **Recent Submitted Feedback** —
   sorted newest first, with a permanent colored marker on the map for
   every submission (Hospital = red, School = blue, Bank = yellow,
   Park = green, Bus Stop = purple).

This means submitted feedback is genuinely permanent and visible to
**every visitor on every device** — it lives in your Google Sheet, not
in any one visitor's browser. (There is also a small `localStorage`
cache as a client-side safety net, so a single visitor's own browser
shows their session's view instantly on refresh even before the network
fetch completes — but the Sheet is the real source of truth.)

`Code.gs` also includes a `doPost` handler that can append a row
directly to the Sheet if you ever want to submit without going through
the Google Form UI at all — not used by the current button-based flow,
but available if you build an alternate submission path later.

### Right sidebar layout

The feedback panel (button) is pinned in place; **Recent Submitted
Feedback** scrolls independently below it, so new submissions are always
reachable by scrolling that section without the button ever moving out
of view.

## Running locally

Because the app loads GeoJSON files with `fetch()`, opening `index.html`
directly from disk (`file://…`) will be blocked by the browser's CORS
policy. Serve the folder instead, e.g.:

```bash
cd webgis
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static file server works (VS Code "Live Server" extension, `npx serve`, etc.).

## Deploying on GitHub Pages

1. Push everything in this folder to a GitHub repository (keep `data/`
   in place — GitHub Pages serves `.geojson` files with no extra config).
2. **Settings → Pages** → Source: your branch, folder `/ (root)` → Save.
3. GitHub publishes at `https://<your-username>.github.io/<repo-name>/`.
4. After any push, GitHub Pages' CDN can serve a cached copy of your
   files for a few minutes. If a change doesn't seem to appear, wait a
   couple of minutes and **hard-refresh** (`Ctrl+Shift+R` / `Cmd+Shift+R`)
   before assuming something's broken.

## Feature checklist

- GN Division choropleth with 5-class Accessibility Index and 3-class
  Priority Index (0–1 scale), switchable via the header buttons, with
  the Very-Poor-accessibility-⇒-High-Priority override described above.
- Five toggleable service point layers (Hospitals, Schools, Banks, Parks,
  Bus Stops) with live counts, marker clustering, and popups.
- Dynamic legend, dashboard statistics, and a GN Division profile panel
  (with color-coded status pills) that updates on map click.
- GN Division search with zoom, boundary highlight and popup.
- Map popups and the sidebar info panel both show Accessibility/Priority
  status pills matching the sidebar styling.
- Community Feedback: one-click link to your real Google Form, a live
  card list backed by an Apps Script JSON API, permanent colored map
  markers per submission, bidirectional card ⟷ marker highlighting,
  manual refresh + 30s auto-refresh, and a right-sidebar layout where
  the feedback button stays fixed while the feedback list scrolls
  independently.

## Troubleshooting

- **GN layer / service points not showing:** almost always a filename
  case mismatch between `script.js`'s `fetch()` paths and the actual
  files in `data/` — check spelling and capitalization exactly.
- **Feedback list stays empty:** confirm `APPS_SCRIPT_API_URL` in
  `config.js` is a real deployed `/exec` URL (not the placeholder text),
  and that your Apps Script's `SHEET_NAME` matches your response tab's
  actual name.
- **Submitted through the Form but it's not showing on the map:** give
  it a few seconds (Sheets can take a moment to register a new Form
  response) and use the ⟳ refresh button, or wait for the 30s
  auto-refresh.
- **Changes not appearing after a GitHub Pages push:** see the CDN
  caching note above — wait a couple of minutes and hard-refresh.
