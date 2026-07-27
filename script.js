/* =====================================================================
   Urban Service Inequality Web-Based Mapping System — Colombo District
   Main application logic (Leaflet + vanilla JS)
   ===================================================================== */

(() => {
  "use strict";

  // -------------------------------------------------------------
  // MAP SETUP
  // -------------------------------------------------------------
  const COLOMBO_BOUNDS = L.latLngBounds([6.70, 79.80], [7.00, 80.15]);

  const map = L.map("map", {
    zoomControl: true,
    minZoom: 9,
  }).fitBounds(COLOMBO_BOUNDS);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  // -------------------------------------------------------------
  // STATE
  // -------------------------------------------------------------
  let currentTheme = "accessibility"; // 'accessibility' | 'priority'
  let gnLayer = null;
  let gnByName = new Map();
  let highlightedGn = null;

  const serviceLayers = {}; // key -> { group, data, color, label }
  const feedbackMarkersById = new Map();
  let feedbackData = [];
  // ADDED: cache key so submitted feedback survives a page refresh even
  // before/without the Apps Script backend responding.
  const FEEDBACK_CACHE_KEY = "colombo_feedback_cache_v1";
  let pickModeActive = false;

  const SERVICE_META = {
    hospitals: { file: "data/Hospitals.geojson", color: "#D7263D", label: "Hospitals" },
    schools:   { file: "data/Schools.geojson",   color: "#3B82C4", label: "Schools" },
    banks:     { file: "data/Banks.geojson",     color: "#E8C93D", label: "Banks" },
    parks:     { file: "data/Parks.geojson",     color: "#4FA85C", label: "Parks" },
    busstops:  { file: "data/Bus_stops.geojson", color: "#9B6FD1", label: "Bus Stops" },
  };

  const FEEDBACK_SERVICE_COLOR = {
    "Hospital": "#D7263D",
    "School": "#3B82C4",
    "Bank": "#E8C93D",
    "Park": "#4FA85C",
    "Bus Stop": "#9B6FD1",
  };

  // -------------------------------------------------------------
  // COLOR SCALES
  // -------------------------------------------------------------
  // NOTE: thresholds below use the 0–1 decimal scale to match the raw
  // AI / priority_i values pulled directly from GND_layer_n.geojson
  // (e.g. 0.62), since those values are kept as-is, unscaled.
  function accessibilityColor(v) {
    if (v < 0.20) return "#D7263D";   // Very Poor
    if (v < 0.40) return "#E8703D";   // Poor
    if (v < 0.60) return "#E8C93D";   // Moderate
    if (v < 0.80) return "#8FC96A";   // Good
    return "#3FA796";                 // Excellent
  }
  function accessibilityLabel(v) {
    if (v < 0.20) return "Very Poor";
    if (v < 0.40) return "Poor";
    if (v < 0.60) return "Moderate";
    if (v < 0.80) return "Good";
    return "Excellent";
  }
  function priorityColor(v) {
    if (v < 0.33) return "#3FA796";   // Low priority
    if (v < 0.66) return "#E8A33D";   // Medium priority
    return "#D7263D";                 // High priority
  }
  function priorityLabel(v) {
    if (v < 0.33) return "Low Priority";
    if (v < 0.66) return "Medium Priority";
    return "High Priority";
  }

  // --- ADDED: business rule — a GND with Very Poor accessibility
  // (accessibility_index < 0.20) is always treated as High Priority for
  // display/color purposes, regardless of its raw priority_i value.
  // The original priority_index value from the GeoJSON is left untouched;
  // this only affects what's shown (label, pill color, polygon fill).
  function effectivePriorityIndex(p) {
    if (p.accessibility_index < 0.20) return Math.max(p.priority_index, 0.66);
    return p.priority_index;
  }

  function themeColor(props) {
    return currentTheme === "accessibility"
      ? accessibilityColor(props.accessibility_index)
      : priorityColor(effectivePriorityIndex(props));
  }

  // -------------------------------------------------------------
  // GN DIVISION LAYER
  // -------------------------------------------------------------
  function gnStyle(feature) {
    return {
      color: "#0A1420",
      weight: 1,
      fillColor: themeColor(feature.properties),
      fillOpacity: 0.65,
    };
  }

  function highlightLayer(layer) {
    if (highlightedGn) resetHighlight(highlightedGn);
    layer.setStyle({ weight: 3, color: "#E8A33D", fillOpacity: 0.8 });
    layer.bringToFront();
    highlightedGn = layer;
  }
  function resetHighlight(layer) {
    if (gnLayer) gnLayer.resetStyle(layer);
  }

  function gnPopupHtml(p) {
    const accLabel = accessibilityLabel(p.accessibility_index);
    const effPriority = effectivePriorityIndex(p);
    const prLabel = priorityLabel(effPriority);
    return `
      <div class="popup-title">${p.gn_name}</div>
      <div class="popup-row"><span>Population</span><b>${p.population.toLocaleString()}</b></div>
      <div class="popup-row"><span>Accessibility Index</span><b>${p.accessibility_index}</b></div>
      <div class="popup-row"><span>Priority Index</span><b>${p.priority_index}</b></div>
      <div class="popup-pills">
        <span class="pill" style="background:${accessibilityColor(p.accessibility_index)}22;color:${accessibilityColor(p.accessibility_index)}">${accLabel}</span>
        <span class="pill" style="background:${priorityColor(effPriority)}22;color:${priorityColor(effPriority)}">${prLabel}</span>
      </div>
    `;
  }

  function updateGnInfoPanel(p) {
    const el = document.getElementById("gnInfoPanel");
    el.classList.remove("empty");
    el.classList.add("filled");
    const accLabel = accessibilityLabel(p.accessibility_index);
    const effPriority = effectivePriorityIndex(p);
    const prLabel = priorityLabel(effPriority);
    el.innerHTML = `
      <div class="gn-info-name">${p.gn_name}</div>
      <div class="gn-info-row"><span>Population</span><b>${p.population.toLocaleString()}</b></div>
      <div class="gn-info-row"><span>Accessibility Index</span><b>${p.accessibility_index}</b></div>
      <div class="gn-info-row"><span>Priority Index</span><b>${p.priority_index}</b></div>
      <div class="gn-info-row" style="border-bottom:none;">
        <span class="pill" style="background:${accessibilityColor(p.accessibility_index)}22;color:${accessibilityColor(p.accessibility_index)}">${accLabel}</span>
        <span class="pill" style="background:${priorityColor(effPriority)}22;color:${priorityColor(effPriority)}">${prLabel}</span>
      </div>
    `;
  }

  function loadGnDivisions() {
    return fetch("data/GND_layer_n.geojson")
      .then(r => r.json())
      .then(fc => {

        // --- ADDED: normalize real GeoJSON field names to what the rest
        // of the app expects (gn_name, population, accessibility_index,
        // priority_index). Does not touch loadGnLayer/styleForCurrentTheme/
        // renderLegend/updateInfoPanel — they keep reading the same props.
        const FIELD = {
          name:          'ADM4_EN',
          population:    'Colombo_GN_Population_Population',
          accessibility: 'AI',
          priority:      'priority_i',
        };
        fc.features.forEach(f => {
          const p = f.properties;
          p.gn_name             = p[FIELD.name];
          p.population          = Number(p[FIELD.population]) || 0;
          // AI / priority_i kept as-is (0–1 decimal), straight from each
          // GND feature's own attribute values — no scaling applied.
          p.accessibility_index = Number(p[FIELD.accessibility]) || 0;
          p.priority_index      = Number(p[FIELD.priority]) || 0;
        });

        gnLayer = L.geoJSON(fc, {
          style: gnStyle,
          onEachFeature: (feature, layer) => {
            const p = feature.properties;
            gnByName.set(p.gn_name, layer);
            layer.bindTooltip(p.gn_name, { className: "gn-tooltip", sticky: true });
            layer.bindPopup(gnPopupHtml(p));
            layer.on("click", (e) => {
              // If the user is in "Select Location" mode, a click on a
              // GND polygon should place the feedback marker instead of
              // doing the normal highlight/popup/info-panel behavior
              // (a polygon's own bound popup otherwise swallows the click
              // before it reaches the map's click listener).
              if (pickModeActive) {
                handleLocationPick(e.latlng);
                return;
              }
              highlightLayer(layer);
              updateGnInfoPanel(p);
            });
          },
        }).addTo(map);

        // populate search datalist
        const datalist = document.getElementById("gn-list");
        [...gnByName.keys()].sort().forEach(name => {
          const opt = document.createElement("option");
          opt.value = name;
          datalist.appendChild(opt);
        });

        renderLegend();
        renderStats();
      });
  }

  function repaintGnLayer() {
    if (!gnLayer) return;
    gnLayer.eachLayer(layer => {
      if (layer !== highlightedGn) {
        gnLayer.resetStyle(layer);
        layer.setStyle(gnStyle(layer.feature));
      }
    });
  }

  // -------------------------------------------------------------
  // LEGEND
  // -------------------------------------------------------------
  function renderLegend() {
    const box = document.getElementById("legendBox");
    let rows;
    if (currentTheme === "accessibility") {
      rows = [
        ["#D7263D", "Very Poor"],
        ["#E8703D", "Poor"],
        ["#E8C93D", "Moderate"],
        ["#8FC96A", "Good"],
        ["#3FA796", "Excellent"],
      ];
    } else {
      rows = [
        ["#3FA796", "Low Priority"],
        ["#E8A33D", "Medium Priority"],
        ["#D7263D", "High Priority"],
      ];
    }
    box.innerHTML =
      `<div class="legend-title-mini">${currentTheme === "accessibility" ? "Accessibility Index" : "Priority Index"}</div>` +
      rows.map(([c, l]) => `
        <div class="legend-row"><span class="legend-swatch" style="background:${c}"></span>${l}</div>
      `).join("");
  }

  // -------------------------------------------------------------
  // SERVICE POINT LAYERS
  // -------------------------------------------------------------
  function dotIcon(color) {
    return L.divIcon({
      className: "",
      html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #0A1420;box-shadow:0 0 0 1px ${color};"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });
  }

  function servicePopupHtml(p) {
    const rows = Object.entries(p)
      .filter(([k]) => !["type"].includes(k))
      .map(([k, v]) => `<div class="popup-row"><span>${prettyKey(k)}</span><b>${v}</b></div>`)
      .join("");
    return `<div class="popup-title">${p.name}</div>${rows}`;
  }
  function prettyKey(k) {
    return k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }

  function loadServiceLayer(key) {
    const meta = SERVICE_META[key];
    return fetch(meta.file)
      .then(r => r.json())
      .then(fc => {

        // --- ADDED: auto-detect facility name/category field names since
        // schema wasn't confirmed. Does not touch loadServiceLayer's
        // clustering, dotIcon, popup, or count logic below.
        const NAME_KEYS = ['name', 'Name', 'NAME', 'facility', 'Facility', 'title'];
        const CATEGORY_KEYS = ['category', 'Category', 'type', 'Type', 'TYPE'];
        fc.features.forEach(f => {
          const p = f.properties;
          if (!p.name) {
            const nk = NAME_KEYS.find(k => p[k] != null);
            p.name = nk ? p[nk] : meta.label.slice(0, -1);
          }
          if (!p.category) {
            const ck = CATEGORY_KEYS.find(k => p[k] != null);
            if (ck) p.category = p[ck];
          }
        });

        const group = L.markerClusterGroup({
          maxClusterRadius: 45,
          iconCreateFunction: cluster => L.divIcon({
            html: `<div style="background:${meta.color}CC;color:#0A1420;font-weight:700;font-size:12px;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #0A1420;">${cluster.getChildCount()}</div>`,
            className: "",
            iconSize: [32, 32],
          }),
        });

        fc.features.forEach(f => {
          const [lon, lat] = f.geometry.coordinates;
          const marker = L.marker([lat, lon], { icon: dotIcon(meta.color) });
          marker.bindPopup(servicePopupHtml(f.properties));
          group.addLayer(marker);
        });

        serviceLayers[key] = { group, count: fc.features.length, meta };
        document.getElementById(`count-${key}`).textContent = fc.features.length;
        group.addTo(map);
      });
  }

  function loadAllServiceLayers() {
    return Promise.all(Object.keys(SERVICE_META).map(loadServiceLayer));
  }

  function wireLayerToggles() {
    document.querySelectorAll('#layerList input[type=checkbox]').forEach(cb => {
      cb.addEventListener("change", () => {
        const key = cb.dataset.layer;
        const layer = serviceLayers[key];
        if (!layer) return;
        if (cb.checked) map.addLayer(layer.group);
        else map.removeLayer(layer.group);
      });
    });
  }

  // -------------------------------------------------------------
  // DASHBOARD STATISTICS
  // -------------------------------------------------------------
  function renderStats() {
    const grid = document.getElementById("statsGrid");
    const counts = Object.fromEntries(
      Object.keys(SERVICE_META).map(k => [k, serviceLayers[k]?.count ?? 0])
    );

    let avgAccess = "—";
    if (gnByName.size) {
      let sum = 0, n = 0;
      gnByName.forEach(layer => { sum += layer.feature.properties.accessibility_index; n++; });
      avgAccess = (sum / n).toFixed(1);
    }

    const cards = [
      ["Total Hospitals", counts.hospitals],
      ["Total Schools", counts.schools],
      ["Total Banks", counts.banks],
      ["Total Parks", counts.parks],
      ["Total Bus Stops", counts.busstops],
      ["Avg. Accessibility Index", avgAccess],
    ];

    grid.innerHTML = cards.map(([label, value], i) => `
      <div class="stat-card ${i === cards.length - 1 ? 'wide' : ''}">
        <div class="stat-value">${value}</div>
        <div class="stat-label">${label}</div>
      </div>
    `).join("");
  }

  // -------------------------------------------------------------
  // THEME SWITCHER
  // -------------------------------------------------------------
  document.querySelectorAll(".theme-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".theme-btn").forEach(b => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      currentTheme = btn.dataset.theme;
      repaintGnLayer();
      renderLegend();
    });
  });

  // -------------------------------------------------------------
  // SEARCH
  // -------------------------------------------------------------
  function doSearch() {
    const val = document.getElementById("gnSearchInput").value.trim();
    if (!val) return;
    // exact match first, then case-insensitive partial match
    let layer = gnByName.get(val);
    if (!layer) {
      const match = [...gnByName.keys()].find(
        name => name.toLowerCase() === val.toLowerCase() || name.toLowerCase().includes(val.toLowerCase())
      );
      if (match) layer = gnByName.get(match);
    }
    if (!layer) {
      alert("GN Division not found. Try selecting a suggestion from the list.");
      return;
    }
    map.fitBounds(layer.getBounds(), { maxZoom: 14 });
    highlightLayer(layer);
    updateGnInfoPanel(layer.feature.properties);
    layer.openPopup();
  }
  document.getElementById("gnSearchBtn").addEventListener("click", doSearch);
  document.getElementById("gnSearchInput").addEventListener("keydown", e => {
    if (e.key === "Enter") doSearch();
  });

  // -------------------------------------------------------------
  // MOBILE SIDEBAR TOGGLES
  // -------------------------------------------------------------
  const leftSidebar = document.getElementById("sidebarLeft");
  const rightSidebar = document.getElementById("sidebarRight");
  document.getElementById("mobileLeftToggle").addEventListener("click", () => {
    rightSidebar.classList.remove("open");
    leftSidebar.classList.toggle("open");
  });
  document.getElementById("mobileRightToggle").addEventListener("click", () => {
    leftSidebar.classList.remove("open");
    rightSidebar.classList.toggle("open");
  });

  // -------------------------------------------------------------
  // COMMUNITY FEEDBACK — LOCATION PICKER
  // -------------------------------------------------------------
  const pickBtn = document.getElementById("pickLocationBtn");
  const pickBanner = document.getElementById("pickLocationBanner");
  const cancelPickBtn = document.getElementById("cancelPickBtn");
  const locationInput = document.getElementById("fLocation");

  function enterPickMode() {
    pickModeActive = true;
    pickBanner.classList.remove("hidden");
    map.getContainer().style.cursor = "crosshair";
    map.getContainer().classList.add("picking-location");
  }
  function exitPickMode() {
    pickModeActive = false;
    pickBanner.classList.add("hidden");
    map.getContainer().style.cursor = "";
    map.getContainer().classList.remove("picking-location");
  }
  pickBtn.addEventListener("click", enterPickMode);
  cancelPickBtn.addEventListener("click", exitPickMode);

  // Shared picker logic, called from either the map's own click (empty
  // areas) or from a GN polygon's click (colored areas — see the
  // pickModeActive branch inside onEachFeature above).
  function handleLocationPick(latlng) {
    const { lat, lng } = latlng;
    locationInput.value = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    exitPickMode();
    L.circleMarker(latlng, {
      radius: 6, color: "#E8A33D", weight: 2, fillColor: "#E8A33D", fillOpacity: 0.9,
    }).addTo(map).bindPopup("Selected feedback location").openPopup();
  }

  map.on("click", e => {
    if (!pickModeActive) return;
    handleLocationPick(e.latlng);
  });

  // -------------------------------------------------------------
  // COMMUNITY FEEDBACK — SUBMIT (to the real Google Form, so it counts
  // as an official Form response; correct entry IDs + matching dropdown
  // wording avoid the earlier silent-validation-failure issue)
  // -------------------------------------------------------------
  const form = document.getElementById("feedbackForm");
  const formMsg = document.getElementById("formMsg");
  const submitBtn = document.getElementById("submitFeedbackBtn");

  form.addEventListener("submit", e => {
    e.preventDefault();

    const gn = document.getElementById("fGn").value.trim();
    const service = document.getElementById("fService").value;
    const issue = document.getElementById("fIssue").value;
    const description = document.getElementById("fDesc").value.trim();
    const location = locationInput.value.trim();

    if (!location) {
      showFormMsg("Please select a location on the map before submitting.", "error");
      return;
    }

    const entries = CONFIG.GOOGLE_FORM_ENTRIES;
    const params = new URLSearchParams();
    params.append(entries.gnDivision, gn);
    params.append(entries.serviceType, service);
    params.append(entries.issueCategory, issue);
    params.append(entries.description, description);
    params.append(entries.location, location);

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";

    // Submits to the real Google Form, so it counts as an official Form
    // response (visible in the Form's own Responses tab) and lands in
    // the same Sheet that Apps Script (doGet) reads back into the map.
    // Google Forms does not support CORS, so this is sent in "no-cors"
    // mode — the browser can't read the response, but the submission
    // itself still reaches the Form/Sheet as long as the entry IDs and
    // dropdown option text exactly match the live Form's fields.
    fetch(CONFIG.GOOGLE_FORM_ACTION_URL, {
      method: "POST",
      mode: "no-cors",
      body: params,
    })
      .then(() => {
        showFormMsg("Feedback submitted successfully.", "success");
        addOptimisticCard({ gn, service, issue, description, location });
        form.reset();
        locationInput.value = "";
        // Give Google Sheets a moment to receive the row, then reconcile
        // the optimistic entry with the real data from Apps Script.
        setTimeout(fetchFeedback, 4000);
      })
      .catch(() => {
        showFormMsg("Could not reach the Google Form. Check your connection and try again.", "error");
      })
      .finally(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Feedback";
      });
  });

  function showFormMsg(text, type) {
    formMsg.textContent = text;
    formMsg.className = `form-msg ${type}`;
  }

  // -------------------------------------------------------------
  // COMMUNITY FEEDBACK — RECENT LIST + MAP MARKERS
  // -------------------------------------------------------------
  const cardsContainer = document.getElementById("feedbackCards");
  const feedbackMarkerGroup = L.layerGroup().addTo(map);

  function addOptimisticCard(entry) {
    const id = `local-${Date.now()}`;
    const item = {
      id,
      gn: entry.gn,
      service: entry.service,
      issue: entry.issue,
      description: entry.description,
      location: entry.location,
      timestamp: new Date().toISOString(),
      _optimistic: true,
    };
    feedbackData.unshift(item);
    renderFeedback();
  }

  function feedbackIcon(service) {
    const color = FEEDBACK_SERVICE_COLOR[service] || "#3FA796";
    return L.divIcon({
      className: "",
      html: `<div style="width:16px;height:16px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #0A1420;"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 16],
    });
  }

  function formatTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString("en-GB", {
      day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  // ADDED: persist feedbackData to localStorage so it survives a page
  // refresh, and restore it on load. Wrapped in try/catch in case
  // localStorage is unavailable (private browsing, etc.).
  function saveFeedbackCache() {
    try {
      localStorage.setItem(FEEDBACK_CACHE_KEY, JSON.stringify(feedbackData));
    } catch (e) { /* ignore — storage unavailable */ }
  }
  function loadFeedbackCache() {
    try {
      const raw = localStorage.getItem(FEEDBACK_CACHE_KEY);
      if (raw) feedbackData = JSON.parse(raw);
    } catch (e) { /* ignore — storage unavailable or corrupt */ }
  }

  // ADDED: which service tab is currently selected in Recent Submitted
  // Feedback ("all" or one of "Hospital"/"School"/"Bank"/"Park"/"Bus Stop").
  let activeFeedbackTab = "all";
  const feedbackTabButtons = document.querySelectorAll("#feedbackTabs .feedback-tab");

  function updateFeedbackTabActiveClasses() {
    feedbackTabButtons.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.service === activeFeedbackTab);
    });
  }
  function switchFeedbackTab(service) {
    activeFeedbackTab = service;
    updateFeedbackTabActiveClasses();
    renderFeedbackCards(); // only re-renders the card list, not the map markers
  }
  feedbackTabButtons.forEach(btn => {
    btn.addEventListener("click", () => switchFeedbackTab(btn.dataset.service));
  });

  function renderFeedback() {
    // sort newest first
    feedbackData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    saveFeedbackCache(); // keep the cache in sync every time the list changes
    renderFeedbackCards();
    renderFeedbackMarkers();
  }

  function renderFeedbackCards() {
    const filtered = activeFeedbackTab === "all"
      ? feedbackData
      : feedbackData.filter(item => item.service === activeFeedbackTab);

    if (!filtered.length) {
      cardsContainer.innerHTML = activeFeedbackTab === "all"
        ? `<div class="fc-empty">No feedback submitted yet. Be the first to report an issue.</div>`
        : `<div class="fc-empty">No feedback submitted for this service yet.</div>`;
    } else {
      cardsContainer.innerHTML = filtered.map(item => `
        <div class="feedback-card" data-id="${item.id}">
          <div class="fc-row">📍 <b>GN Division:</b>&nbsp;${escapeHtml(item.gn)}</div>
          <div class="fc-row">🔧 <b>Service:</b>&nbsp;${escapeHtml(item.service)}</div>
          <div class="fc-row">⚠ <b>Issue Category:</b>&nbsp;${escapeHtml(item.issue)}</div>
          <div class="fc-row fc-desc">📝 “${escapeHtml(item.description)}”</div>
          <div class="fc-row">📌 <b>Location:</b>&nbsp;${escapeHtml(item.location)}</div>
          <div class="fc-time">🕒 ${formatTime(item.timestamp)}</div>
        </div>
      `).join("");
    }
    wireCardClicks();
  }

  function renderFeedbackMarkers() {
    feedbackMarkerGroup.clearLayers();
    feedbackMarkersById.clear();
    feedbackData.forEach(item => {
      const coords = parseLocation(item.location);
      if (!coords) return;
      const marker = L.marker(coords, { icon: feedbackIcon(item.service) });
      marker.bindPopup(`
        <div class="popup-title">${escapeHtml(item.service)} Feedback</div>
        <div class="popup-row"><span>GN Division</span><b>${escapeHtml(item.gn)}</b></div>
        <div class="popup-row"><span>Issue</span><b>${escapeHtml(item.issue)}</b></div>
        <div class="popup-row"><span>Description</span><b>${escapeHtml(item.description)}</b></div>
        <div class="popup-row"><span>Submitted</span><b>${formatTime(item.timestamp)}</b></div>
      `);
      marker.on("click", () => {
        // Switch to that service's tab so the corresponding card is
        // visible in the (possibly filtered) list before highlighting it.
        if (activeFeedbackTab !== "all" && activeFeedbackTab !== item.service) {
          switchFeedbackTab(item.service);
        }
        highlightCard(item.id);
      });
      feedbackMarkerGroup.addLayer(marker);
      feedbackMarkersById.set(item.id, marker);
    });
  }

  function parseLocation(loc) {
    if (!loc) return null;
    const parts = loc.split(",").map(s => parseFloat(s.trim()));
    if (parts.length !== 2 || parts.some(isNaN)) return null;
    return parts;
  }

  function wireCardClicks() {
    cardsContainer.querySelectorAll(".feedback-card").forEach(card => {
      card.addEventListener("click", () => {
        const id = card.dataset.id;
        const marker = feedbackMarkersById.get(id);
        if (!marker) return;
        map.setView(marker.getLatLng(), 15, { animate: true });
        marker.openPopup();
        highlightCard(id);
      });
    });
  }

  function highlightCard(id) {
    cardsContainer.querySelectorAll(".feedback-card").forEach(c => c.classList.remove("highlight"));
    const card = cardsContainer.querySelector(`.feedback-card[data-id="${id}"]`);
    if (card) {
      card.classList.add("highlight");
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, s => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[s]));
  }

  // -------------------------------------------------------------
  // FETCH LIVE FEEDBACK FROM APPS SCRIPT
  // -------------------------------------------------------------
  const refreshBtn = document.getElementById("refreshFeedbackBtn");

  // ADDED: loads data via a <script> tag (JSONP) instead of fetch().
  // <script> tags are never subject to CORS, which reliably sidesteps a
  // known Google Apps Script quirk where the script.google.com/exec
  // redirect can omit the Access-Control-Allow-Origin header that
  // fetch() cross-origin requests strictly require (this can happen
  // even on a correctly configured "Anyone" access deployment).
  function jsonpRequest(url) {
    return new Promise((resolve, reject) => {
      const callbackName = `feedbackJsonp_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const script = document.createElement("script");

      const cleanup = () => {
        delete window[callbackName];
        script.remove();
      };

      window[callbackName] = (data) => {
        cleanup();
        resolve(data);
      };
      script.onerror = () => {
        cleanup();
        reject(new Error("JSONP script failed to load."));
      };

      const separator = url.includes("?") ? "&" : "?";
      script.src = `${url}${separator}callback=${callbackName}`;
      document.head.appendChild(script);
    });
  }

  function fetchFeedback() {
    if (!CONFIG.APPS_SCRIPT_API_URL || CONFIG.APPS_SCRIPT_API_URL.startsWith("PASTE_")) {
      // No live backend configured yet — keep whatever is in memory
      // (e.g. optimistic local submissions) and let the user know once.
      return;
    }
    refreshBtn.classList.add("spinning");
    jsonpRequest(CONFIG.APPS_SCRIPT_API_URL)
      .then(rows => {
        // Expecting an array of objects with keys matching the Sheet's
        // columns — see APPS_SCRIPT_SETUP.md for the exact shape.
        const remote = rows.map((r, i) => ({
          id: r.id || `remote-${r.timestamp || i}`,
          gn: r.gnDivision ?? r["GN Division"] ?? "",
          service: r.serviceType ?? r["Service Type"] ?? "",
          issue: r.issueCategory ?? r["Issue Category"] ?? "",
          description: r.description ?? r["Describe the Issue"] ?? "",
          location: r.location ?? r["Location"] ?? "",
          timestamp: r.timestamp ?? r["Timestamp"] ?? new Date().toISOString(),
        }));
        // drop optimistic local entries once real data arrives
        feedbackData = remote;
        renderFeedback();
      })
      .catch((err) => {
        console.error("fetchFeedback failed:", err);
        showFormMsg("Could not load live feedback from the Apps Script API.", "error");
      })
      .finally(() => refreshBtn.classList.remove("spinning"));
  }

  refreshBtn.addEventListener("click", fetchFeedback);

  // -------------------------------------------------------------
  // BOOTSTRAP
  // -------------------------------------------------------------
  Promise.all([loadGnDivisions(), loadAllServiceLayers()]).then(() => {
    wireLayerToggles();
    renderStats();
    loadFeedbackCache(); // ADDED: restore previously submitted feedback immediately on refresh
    renderFeedback();
    fetchFeedback();
    if (CONFIG.AUTO_REFRESH_MS) {
      setInterval(fetchFeedback, CONFIG.AUTO_REFRESH_MS);
    }
  });

})();
