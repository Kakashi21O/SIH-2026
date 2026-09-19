/**
 * SafeSteps — Frontend Application Controller
 * Proactive Safety & Automated Emergency Response
 */

// Global Application State
const state = {
  currentUser: {
    id: "usr_demo",
    name: "Ananya Sharma",
    phone: "+919876543210"
  },
  currentLocation: {
    lat: 28.6315,
    lng: 77.2190,
    name: "Connaught Place Central Hub"
  },
  safetyScore: 92,
  riskLevel: "LOW",
  safetyModeActive: false,
  emergencyState: {
    active: false,
    countdownInterval: null,
    countdownSeconds: 10,
    verificationToken: null,
    incidentId: null
  },
  journeyState: {
    active: false,
    data: null,
    activeRouteType: "SAFER",
    navInterval: null,
    currentWaypointIndex: 0
  },
  mapInstance: null,
  mapLayers: {
    zones: null,
    hotspots: [],
    userMarker: null,
    routePolylines: []
  }
};

// Preset demo locations
const DEMO_LOCATIONS = {
  safe: { lat: 28.6315, lng: 77.2190, name: "Connaught Place Central Hub" },
  mod: { lat: 28.6420, lng: 77.2105, name: "Paharganj Commercial Corridor" },
  high: { lat: 28.6395, lng: 77.2315, name: "Railway Underpass" },
  crit: { lat: 28.6505, lng: 77.2385, name: "Industrial Canal Bypass" }
};

// ================= INITIALIZATION & NAVIGATION =================
document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initAuthFlow();
  initScoreAndToggle();
  initEmergencyVerification();
  initPinKeypad();
  initComplaints();
  initDemoLocationJumpers();
  initJourneyFlow();
  initGuardianManagement();
  
  // Initial state fetch
  updateSafetyScore(state.currentLocation.lat, state.currentLocation.lng);
});

function showScreen(screenId) {
  document.querySelectorAll(".view-screen").forEach(s => s.classList.remove("active"));
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add("active");
  }

  // Update navigation tab highlights
  document.querySelectorAll(".bar-tab").forEach(tab => {
    tab.classList.toggle("active", tab.getAttribute("data-target") === screenId);
  });

  if (screenId === "screen-map") {
    setTimeout(initOrResizeMap, 150);
  } else if (screenId === "screen-intelligence") {
    loadComplaints();
  }
}

function initNavigation() {
  document.querySelectorAll(".back-link").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-target") || "screen-home";
      showScreen(target);
    });
  });

  document.querySelectorAll(".bar-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-target");
      if (target) showScreen(target);
    });
  });

  document.getElementById("btn-nav-journey")?.addEventListener("click", () => showScreen("screen-journey"));
  document.getElementById("btn-nav-map")?.addEventListener("click", () => showScreen("screen-map"));
  document.getElementById("btn-nav-intel")?.addEventListener("click", () => showScreen("screen-intelligence"));
  document.getElementById("btn-nav-contacts")?.addEventListener("click", openGuardiansModal);
}

// ================= AUTH FLOW =================
function initAuthFlow() {
  document.getElementById("btn-login")?.addEventListener("click", () => {
    const name = document.getElementById("auth-name").value.trim();
    const phone = document.getElementById("auth-phone").value.trim();
    if (name) state.currentUser.name = name;
    if (phone) state.currentUser.phone = phone;
    showScreen("screen-home");
  });
}

// ================= DASHBOARD & SAFETY SCORE =================
function initScoreAndToggle() {
  const toggle = document.getElementById("toggle-safety-mode");
  toggle?.addEventListener("change", (e) => {
    state.safetyModeActive = e.target.checked;
    updateStatusPill(state.safetyModeActive ? "Monitoring On" : "Protected", state.safetyModeActive ? "safe" : "safe");
  });

  document.getElementById("btn-switch-location")?.addEventListener("click", () => {
    showScreen("screen-map");
  });
}

function updateStatusPill(text, type = "safe") {
  const pill = document.getElementById("header-status-pill");
  const textEl = document.getElementById("header-status-text");
  const dot = pill?.querySelector(".status-indicator");
  if (textEl) textEl.textContent = text;
  if (dot) {
    dot.className = `status-indicator ${type === 'danger' ? 'danger' : ''}`;
  }
}

async function updateSafetyScore(lat, lng) {
  try {
    const res = await fetch("/api/safety/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng, user_id: state.currentUser.id })
    });
    if (!res.ok) throw new Error("Score request failed");
    const data = await res.json();

    state.safetyScore = data.overall_score;
    state.riskLevel = data.risk_level;
    state.currentLocation.name = data.active_zone_name || "Monitored Zone";

    // Update DOM
    const scoreNum = document.getElementById("home-score-value");
    const locName = document.getElementById("home-loc-name");
    const riskBadge = document.getElementById("home-risk-badge");
    const riskDesc = document.getElementById("home-risk-desc");
    const toggle = document.getElementById("toggle-safety-mode");

    const metricLighting = document.getElementById("metric-lighting");
    const metricPatrols = document.getElementById("metric-patrols");

    if (scoreNum) scoreNum.textContent = data.overall_score;
    if (locName) locName.textContent = state.currentLocation.name;
    if (riskDesc) riskDesc.textContent = data.recommended_action;

    if (metricLighting) metricLighting.textContent = data.factors.lighting_status === "ADEQUATE" ? "Good" : "Poor";
    if (metricPatrols) metricPatrols.textContent = data.factors.police_presence === "ACTIVE" ? "Active" : "Low";

    if (riskBadge) {
      if (data.overall_score >= 80) {
        riskBadge.className = "risk-pill safe";
        riskBadge.textContent = "Low Risk";
      } else if (data.overall_score >= 60) {
        riskBadge.className = "risk-pill warn";
        riskBadge.textContent = "Moderate";
      } else if (data.overall_score >= 40) {
        riskBadge.className = "risk-pill high";
        riskBadge.textContent = "High Risk";
      } else {
        riskBadge.className = "risk-pill danger";
        riskBadge.textContent = "Critical";
      }
    }

    if (data.auto_safety_mode_recommended && !state.safetyModeActive) {
      state.safetyModeActive = true;
      if (toggle) toggle.checked = true;
      updateStatusPill("High Risk Auto-Mode", "danger");
      showToastAlert(`⚠️ High Risk Zone: ${state.currentLocation.name}. Safety Mode Auto-Engaged!`, "danger");
    } else if (!data.auto_safety_mode_recommended && state.safetyModeActive) {
      updateStatusPill("Monitoring Active", "safe");
    }

  } catch (err) {
    console.warn("Safety score fallback:", err);
  }
}

function showToastAlert(msg, type = "info") {
  let toast = document.getElementById("app-toast-alert");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "app-toast-alert";
    toast.className = "app-toast";
    document.querySelector(".app-frame")?.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `app-toast visible ${type}`;
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove("visible");
  }, 3500);
}

// ================= MAP ENGINE =================
function initOrResizeMap() {
  const mapContainer = document.getElementById("leaflet-map");
  if (!mapContainer) return;

  if (!state.mapInstance) {
    state.mapInstance = L.map("leaflet-map", {
      zoomControl: true,
      attributionControl: false
    }).setView([state.currentLocation.lat, state.currentLocation.lng], 14);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19
    }).addTo(state.mapInstance);

    // Click anywhere on the map to inspect risk & move GPS beacon
    state.mapInstance.on("click", (e) => {
      state.currentLocation.lat = e.latlng.lat;
      state.currentLocation.lng = e.latlng.lng;
      updateSafetyScore(e.latlng.lat, e.latlng.lng);
      updateUserMarkerOnMap();
    });

    loadMapRiskZones();
    loadMapPois();
    loadMapHotspots();
  } else {
    state.mapInstance.invalidateSize();
    state.mapInstance.setView([state.currentLocation.lat, state.currentLocation.lng], 14);
    loadMapHotspots();
  }

  updateUserMarkerOnMap();
}

async function loadMapRiskZones() {
  try {
    const res = await fetch("/api/safety/zones");
    if (!res.ok) return;
    const geojson = await res.json();

    if (state.mapLayers.zones) {
      state.mapInstance.removeLayer(state.mapLayers.zones);
    }

    state.mapLayers.zones = L.geoJSON(geojson, {
      style: (feature) => ({
        color: feature.properties.color || "#10b981",
        weight: 2.2,
        fillColor: feature.properties.color || "#10b981",
        fillOpacity: feature.properties.fillOpacity ? Math.min(0.5, feature.properties.fillOpacity + 0.08) : 0.35,
        lineJoin: "round",
        lineCap: "round",
        className: "organic-risk-zone"
      }),
      onEachFeature: (feature, layer) => {
        // Subtle hover highlight
        layer.on({
          mouseover: (e) => {
            const l = e.target;
            l.setStyle({
              weight: 3.5,
              fillOpacity: 0.55
            });
            if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
              l.bringToFront();
            }
          },
          mouseout: (e) => {
            state.mapLayers.zones.resetStyle(e.target);
          }
        });

        layer.bindPopup(`
          <div style="color: #0b0f19; font-family: sans-serif; padding: 4px; min-width: 170px;">
            <b style="font-size: 13px; color: #0b0f19;">${feature.properties.name}</b><br/>
            <div style="margin: 4px 0; font-size: 12px; color: #334155;">
              Safety Index: <b>${feature.properties.safety_score}/100</b><br/>
              Risk Level: <b style="color: ${feature.properties.color};">${feature.properties.risk_level}</b><br/>
              Reported Issues: <b>${feature.properties.complaint_count}</b>
            </div>
            <p style="font-size: 11px; margin: 4px 0 0 0; color: #64748b; line-height: 1.2;">${feature.properties.description}</p>
          </div>
        `);
      }
    }).addTo(state.mapInstance);
  } catch (err) {
    console.warn("Could not load map zones:", err);
  }
}

async function loadMapPois() {
  try {
    const res = await fetch("/api/safety/pois");
    if (!res.ok) return;
    const pois = await res.json();

    pois.forEach(poi => {
      const isPolice = poi.type === "POLICE";
      const isHospital = poi.type === "HOSPITAL";
      const iconColor = isPolice ? "#38bdf8" : (isHospital ? "#ec4899" : "#10b981");
      const iconSymbol = isPolice ? "🛡️" : (isHospital ? "🏥" : "🟢");

      const poiIcon = L.divIcon({
        className: "safe-poi-icon",
        html: `<div style="background: rgba(18,21,31,0.85); border: 1.5px solid ${iconColor}; border-radius: 50%; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; font-size: 13px; box-shadow: 0 0 8px ${iconColor}44;">${iconSymbol}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });

      L.marker([poi.lat, poi.lng], { icon: poiIcon })
        .bindPopup(`
          <div style="color: #0b0f19; font-family: sans-serif; padding: 2px;">
            <b style="font-size: 13px;">${poi.name}</b><br/>
            <span style="font-size: 12px; color: #475569;">Type: <b>${poi.type}</b> • ETA: <b>${poi.eta_mins} mins</b></span><br/>
            <span style="font-size: 11px; color: #0284c7;">Emergency: ${poi.phone}</span>
          </div>
        `)
        .addTo(state.mapInstance);
    });
  } catch (err) {
    console.warn("Could not load POIs:", err);
  }
}

async function loadMapHotspots() {
  try {
    const res = await fetch("/api/safety/hotspots");
    if (!res.ok) return;
    const hotspots = await res.json();

    // Clear existing hotspot markers
    if (state.mapLayers.hotspots && state.mapLayers.hotspots.length) {
      state.mapLayers.hotspots.forEach(layer => state.mapInstance.removeLayer(layer));
      state.mapLayers.hotspots = [];
    }

    hotspots.forEach(hs => {
      const isCritical = hs.severity === "CRITICAL";
      const color = isCritical ? "#ef4444" : (hs.severity === "HIGH" ? "#f97316" : "#f59e0b");

      // Outer pulsating radar circle
      const radarCircle = L.circle([hs.lat, hs.lng], {
        radius: hs.radius_meters || 180,
        color: color,
        weight: 1.5,
        opacity: 0.85,
        fillColor: color,
        fillOpacity: 0.18,
        className: isCritical ? "hotspot-radar-pulse-critical" : "hotspot-radar-pulse"
      }).addTo(state.mapInstance);

      // Center hazard badge marker
      const hazardIcon = L.divIcon({
        className: "hotspot-center-icon",
        html: `<div class="hotspot-pin-dot ${hs.severity.toLowerCase()}">
                 <span class="hotspot-pin-count">${hs.report_count}</span>
               </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const pinMarker = L.marker([hs.lat, hs.lng], { icon: hazardIcon, zIndexOffset: 800 }).addTo(state.mapInstance);

      const popupContent = `
        <div style="color: #0b0f19; font-family: sans-serif; padding: 4px; min-width: 180px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <b style="font-size: 13px; color: ${color};">⚠️ ${hs.category.replace(/_/g, ' ').toUpperCase()}</b>
            <span style="background: ${color}22; color: ${color}; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 99px;">${hs.severity}</span>
          </div>
          <p style="font-size: 12px; color: #334155; margin: 4px 0;">"${hs.headline}"</p>
          <div style="font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 4px; margin-top: 4px;">
            <span>Reports: <b>${hs.report_count}</b></span> • <span>Upvotes: <b>${hs.upvotes}</b></span><br/>
            <span>Hazard Index: <b>${hs.hazard_score}/100</b></span>
          </div>
        </div>
      `;

      radarCircle.bindPopup(popupContent);
      pinMarker.bindPopup(popupContent);

      state.mapLayers.hotspots.push(radarCircle);
      state.mapLayers.hotspots.push(pinMarker);
    });
  } catch (err) {
    console.warn("Could not load map hotspots:", err);
  }
}

function updateUserMarkerOnMap() {
  if (!state.mapInstance) return;

  const latlng = [state.currentLocation.lat, state.currentLocation.lng];
  if (state.mapLayers.userMarker) {
    state.mapLayers.userMarker.setLatLng(latlng);
  } else {
    // Multi-layer radar sonar beacon for active user GPS marker
    const beaconIcon = L.divIcon({
      className: "user-gps-beacon-custom",
      html: `<div class="user-gps-beacon-wrap">
               <div class="sonar-ring"></div>
               <div class="sonar-ring delay-1"></div>
               <div class="sonar-ring delay-2"></div>
               <div class="beacon-core-dot"></div>
             </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
    state.mapLayers.userMarker = L.marker(latlng, { icon: beaconIcon, zIndexOffset: 1000 }).addTo(state.mapInstance);
  }
}

function initDemoLocationJumpers() {
  document.getElementById("sim-safe")?.addEventListener("click", () => jumpToLocation("safe"));
  document.getElementById("sim-mod")?.addEventListener("click", () => jumpToLocation("mod"));
  document.getElementById("sim-high")?.addEventListener("click", () => jumpToLocation("high"));
  document.getElementById("sim-crit")?.addEventListener("click", () => jumpToLocation("crit"));
}

function jumpToLocation(key) {
  const loc = DEMO_LOCATIONS[key];
  if (!loc) return;
  state.currentLocation.lat = loc.lat;
  state.currentLocation.lng = loc.lng;
  state.currentLocation.name = loc.name;

  updateSafetyScore(loc.lat, loc.lng);
  updateUserMarkerOnMap();
  if (state.mapInstance) {
    // Smooth cinematic camera pan/zoom to new location scenario
    state.mapInstance.flyTo([loc.lat, loc.lng], 14, {
      animate: true,
      duration: 0.9,
      easeLinearity: 0.25
    });
  }
}

// ================= EMERGENCY VERIFICATION =================
function initEmergencyVerification() {
  document.getElementById("btn-trigger-sos")?.addEventListener("click", () => {
    triggerEmergencyWorkflow("manual_sos");
  });

  // Clicking 'I Am Safe' now strictly opens the 4-digit PIN keypad
  document.getElementById("btn-im-safe")?.addEventListener("click", () => {
    openPinModal();
  });

  document.getElementById("btn-abort-emergency-active")?.addEventListener("click", openPinModal);
}

async function triggerEmergencyWorkflow(source = "manual_sos") {
  state.emergencyState.active = true;
  state.emergencyState.countdownSeconds = 10;

  try {
    const res = await fetch("/api/emergency/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: state.currentLocation.lat,
        lng: state.currentLocation.lng,
        trigger_source: source,
        user_id: state.currentUser.id
      })
    });
    const data = await res.json();
    state.emergencyState.verificationToken = data.verification_token;
  } catch (err) {
    state.emergencyState.verificationToken = "tok_local_demo";
  }

  showScreen("screen-verify");
  updateCountdownUI();

  clearInterval(state.emergencyState.countdownInterval);
  state.emergencyState.countdownInterval = setInterval(() => {
    state.emergencyState.countdownSeconds -= 1;
    updateCountdownUI();

    if (state.emergencyState.countdownSeconds <= 0) {
      clearInterval(state.emergencyState.countdownInterval);
      escalateToActiveEmergency(source);
    }
  }, 1000);
}

function updateCountdownUI() {
  const timerEl = document.getElementById("verify-countdown");
  const sheetTimerEl = document.getElementById("pin-sheet-timer");
  if (timerEl) {
    timerEl.textContent = state.emergencyState.countdownSeconds;
  }
  if (sheetTimerEl) {
    sheetTimerEl.textContent = `${state.emergencyState.countdownSeconds}s`;
  }
}

function cancelEmergencyCountdown(reason) {
  clearInterval(state.emergencyState.countdownInterval);
  state.emergencyState.active = false;
  closePinModal();
  showScreen("screen-home");
  updateStatusPill("Protected", "safe");
  showToastAlert("✅ Emergency Cancelled: PIN Verified Successfully", "safe");
}

async function escalateToActiveEmergency(source) {
  clearInterval(state.emergencyState.countdownInterval);
  closePinModal();

  try {
    const res = await fetch("/api/emergency/escalate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        verification_token: state.emergencyState.verificationToken || "tok_timeout",
        lat: state.currentLocation.lat,
        lng: state.currentLocation.lng,
        trigger_source: source,
        user_id: state.currentUser.id,
        timed_out_without_pin: true
      })
    });
    const data = await res.json();
    state.emergencyState.incidentId = data.id;

    document.getElementById("emg-inc-id").textContent = `Incident ID: ${data.id}`;
    document.getElementById("emg-inc-severity").textContent = `Severity ${data.severity_score}/100`;
    document.getElementById("emg-coords-stream").textContent = `Broadcasting (${data.lat.toFixed(4)}, ${data.lng.toFixed(4)})`;
  } catch (err) {
    console.warn("Escalation error fallback:", err);
  }

  updateStatusPill("EMERGENCY ACTIVE", "danger");
  showScreen("screen-emergency");
}

// ================= PIN KEYPAD WITH DOT INDICATORS =================
let enteredPin = "";

function updatePinDots() {
  const dots = document.querySelectorAll(".pin-dot");
  dots.forEach((dot, index) => {
    if (index < enteredPin.length) {
      dot.classList.add("filled");
    } else {
      dot.classList.remove("filled");
    }
  });
}

function initPinKeypad() {
  const errorMsg = document.getElementById("pin-error-msg");

  document.querySelectorAll(".num-btn[data-key]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (enteredPin.length < 4) {
        enteredPin += btn.getAttribute("data-key");
        updatePinDots();
        if (errorMsg) errorMsg.textContent = "";

        // Auto-verify on 4th digit
        if (enteredPin.length === 4) {
          submitPin();
        }
      }
    });
  });

  document.getElementById("btn-keypad-clear")?.addEventListener("click", () => {
    if (enteredPin.length > 0) {
      enteredPin = enteredPin.slice(0, -1);
      updatePinDots();
      if (errorMsg) errorMsg.textContent = "";
    }
  });

  document.getElementById("btn-keypad-submit")?.addEventListener("click", submitPin);
  document.getElementById("btn-close-pin-modal")?.addEventListener("click", closePinModal);
}

async function submitPin() {
  const errorMsg = document.getElementById("pin-error-msg");
  if (enteredPin.length !== 4) {
    if (errorMsg) errorMsg.textContent = "Please enter 4 digits";
    return;
  }

  try {
    const res = await fetch("/api/auth/verify-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: enteredPin, user_id: state.currentUser.id })
    });
    const data = await res.json();

    if (data.valid) {
      cancelEmergencyCountdown("PIN verified");
    } else {
      if (errorMsg) errorMsg.textContent = "Incorrect PIN. Try again.";
      enteredPin = "";
      updatePinDots();
    }
  } catch (err) {
    if (enteredPin === "1234") {
      cancelEmergencyCountdown("Fallback PIN verified");
    } else {
      if (errorMsg) errorMsg.textContent = "Incorrect PIN (Demo is 1234)";
      enteredPin = "";
      updatePinDots();
    }
  }
}

function openPinModal() {
  enteredPin = "";
  updatePinDots();
  const errorMsg = document.getElementById("pin-error-msg");
  if (errorMsg) errorMsg.textContent = "";
  document.getElementById("pin-modal")?.classList.add("active");
}

function closePinModal() {
  enteredPin = "";
  updatePinDots();
  document.getElementById("pin-modal")?.classList.remove("active");
}

// ================= COMPLAINTS & COMMUNITY (NLP & CLUSTERING) =================
let nlpDebounceTimer = null;
let currentIntelTab = "all"; // "all" or "clustered"
let pendingDuplicateMatch = null;

function initComplaints() {
  const textEl = document.getElementById("complaint-text");
  const catEl = document.getElementById("complaint-category");
  const livePill = document.getElementById("ai-live-tag-pill");
  const liveText = document.getElementById("ai-live-tag-text");
  const dupWarningBox = document.getElementById("duplicate-warning-box");
  const dupMatchedText = document.getElementById("dup-matched-text");
  const btnDupUpvote = document.getElementById("btn-dup-upvote");
  const btnDupDismiss = document.getElementById("btn-dup-dismiss");

  // Tab switching (All vs Clustered)
  document.getElementById("tab-all-reports")?.addEventListener("click", () => switchIntelTab("all"));
  document.getElementById("tab-clustered-issues")?.addEventListener("click", () => switchIntelTab("clustered"));

  // Real-time debounced NLP classification & spatial duplicate check
  textEl?.addEventListener("input", () => {
    const query = textEl.value.trim();
    clearTimeout(nlpDebounceTimer);

    if (query.length < 5) {
      if (livePill) livePill.style.display = "none";
      if (dupWarningBox) dupWarningBox.style.display = "none";
      pendingDuplicateMatch = null;
      return;
    }

    nlpDebounceTimer = setTimeout(async () => {
      try {
        // 1. NLP Preview
        const res = await fetch("/api/complaints/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: query })
        });
        if (!res.ok) return;
        const data = await res.json();

        if (livePill && liveText) {
          const catPretty = data.category.replace(/_/g, " ").toUpperCase();
          liveText.textContent = `AI: ${catPretty} • ${data.severity}`;
          livePill.className = `ai-tag-pill ${data.severity.toLowerCase()}`;
          livePill.style.display = "inline-flex";

          if (catEl && catEl.value === "auto") {
            catEl.options[0].textContent = `⚡ Auto: ${data.category.replace(/_/g, " ")}`;
          }
        }

        // 2. Spatial duplicate check within 300m
        const dupRes = await fetch("/api/complaints/check-duplicate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: query,
            lat: state.currentLocation.lat,
            lng: state.currentLocation.lng
          })
        });

        if (dupRes.ok) {
          const dupData = await dupRes.json();
          if (dupData.is_duplicate && dupData.matched_report) {
            pendingDuplicateMatch = dupData.matched_report;
            if (dupWarningBox && dupMatchedText) {
              dupMatchedText.textContent = `"${dupData.matched_report.text}" (${dupData.distance_meters}m away, ${Math.round(dupData.similarity_score * 100)}% match)`;
              dupWarningBox.style.display = "flex";
            }
          } else {
            if (dupWarningBox) dupWarningBox.style.display = "none";
            pendingDuplicateMatch = null;
          }
        }
      } catch (err) {
        console.warn("Live NLP/duplicate error:", err);
      }
    }, 300);
  });

  // Upvote existing report instead of creating duplicate
  btnDupUpvote?.addEventListener("click", async () => {
    if (!pendingDuplicateMatch) return;
    await upvoteReport(pendingDuplicateMatch.id);
    if (textEl) textEl.value = "";
    if (dupWarningBox) dupWarningBox.style.display = "none";
    if (livePill) livePill.style.display = "none";
    pendingDuplicateMatch = null;
    showToastAlert("👍 Upvoted & verified existing nearby hazard!", "safe");
    loadComplaints();
  });

  btnDupDismiss?.addEventListener("click", () => {
    if (dupWarningBox) dupWarningBox.style.display = "none";
    pendingDuplicateMatch = null;
  });

  catEl?.addEventListener("change", () => {
    if (catEl.value !== "auto" && catEl.options[0]) {
      catEl.options[0].textContent = "⚡ Auto-Detect (AI NLP)";
    }
  });

  document.getElementById("btn-submit-complaint")?.addEventListener("click", async () => {
    const text = textEl.value.trim();
    if (!text) {
      showToastAlert("Please write a hazard description", "warn");
      return;
    }

    const selectedCategory = catEl.value === "auto" ? null : catEl.value;

    try {
      const res = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          category: selectedCategory,
          lat: state.currentLocation.lat,
          lng: state.currentLocation.lng,
          user_id: state.currentUser.id
        })
      });

      if (!res.ok) throw new Error("Submission failed");
      const saved = await res.json();

      textEl.value = "";
      if (livePill) livePill.style.display = "none";
      if (dupWarningBox) dupWarningBox.style.display = "none";
      if (catEl) catEl.value = "auto";
      if (catEl?.options[0]) catEl.options[0].textContent = "⚡ Auto-Detect (AI NLP)";

      showToastAlert(`✅ Report Logged: ${saved.category.replace(/_/g, " ")} (${saved.severity})`, "safe");
      loadComplaints();
    } catch (err) {
      console.warn("Could not post complaint:", err);
      showToastAlert("Failed to submit complaint", "danger");
    }
  });
}

function switchIntelTab(tab) {
  currentIntelTab = tab;
  document.getElementById("tab-all-reports")?.classList.toggle("active", tab === "all");
  document.getElementById("tab-clustered-issues")?.classList.toggle("active", tab === "clustered");
  loadComplaints();
}

async function upvoteReport(reportId) {
  try {
    const res = await fetch(`/api/complaints/${reportId}/upvote`, { method: "POST" });
    if (!res.ok) return;
    const data = await res.json();
    showToastAlert(`Verified! Upvotes: ${data.upvotes}`, "safe");
    loadComplaints();
  } catch (err) {
    console.warn("Upvote error:", err);
  }
}

async function loadComplaints() {
  const container = document.getElementById("complaints-list");
  if (!container) return;

  if (currentIntelTab === "clustered") {
    loadClusteredIssues(container);
  } else {
    loadAllReports(container);
  }
}

async function loadAllReports(container) {
  try {
    const res = await fetch("/api/complaints");
    if (!res.ok) return;
    const items = await res.json();

    container.innerHTML = items.map(c => {
      const timeStr = new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const sevClass = c.severity === 'CRITICAL' ? 'risk-pill danger' : (c.severity === 'HIGH' ? 'risk-pill high' : 'risk-pill warn');
      const catLabel = (c.category || 'general_safety').replace(/_/g, ' ');
      const confBadge = c.confidence ? `<span class="confidence-pill">${Math.round(c.confidence * 100)}% Match</span>` : '';
      const upvoteCount = c.upvotes || 1;

      return `
        <div class="report-item">
          <div class="report-item-top">
            <div class="report-meta-badges">
              <span class="report-tag ${sevClass}">${catLabel}</span>
              ${confBadge}
            </div>
            <span class="report-time">${timeStr}</span>
          </div>
          <p>${c.text}</p>
          <div class="cluster-footer">
            <span>📍 (${c.lat.toFixed(3)}, ${c.lng.toFixed(3)})</span>
            <button class="btn-upvote-inline" onclick="upvoteReport('${c.id}')">
              👍 <span>${upvoteCount} Confirm${upvoteCount > 1 ? 's' : ''}</span>
            </button>
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    container.innerHTML = `<p style="color: var(--text-dim); font-size: 0.8rem;">Loading reports...</p>`;
  }
}

async function loadClusteredIssues(container) {
  try {
    const res = await fetch("/api/complaints/clusters");
    if (!res.ok) return;
    const clusters = await res.json();

    if (!clusters.length) {
      container.innerHTML = `<p style="color: var(--text-dim); font-size: 0.8rem; padding: 12px;">No active issue clusters detected in this area.</p>`;
      return;
    }

    container.innerHTML = clusters.map(cl => {
      const sevClass = cl.severity === 'CRITICAL' ? 'risk-pill danger' : (cl.severity === 'HIGH' ? 'risk-pill high' : 'risk-pill warn');
      const catLabel = cl.category.replace(/_/g, ' ');

      return `
        <div class="cluster-group-card">
          <div class="cluster-group-top">
            <div class="cluster-badge-wrap">
              <span class="report-tag ${sevClass}">${catLabel}</span>
              <span class="cluster-count-pill">${cl.total_count} Report${cl.total_count > 1 ? 's' : ''}</span>
            </div>
            <span class="confidence-pill">👍 ${cl.upvotes_sum} Upvotes</span>
          </div>
          <p class="cluster-headline">"${cl.headline}"</p>
          <div class="cluster-footer">
            <span>Cluster Center: (${cl.center_lat.toFixed(3)}, ${cl.center_lng.toFixed(3)})</span>
            <span style="color: var(--accent-primary); font-weight: 600;">Radius &le; 300m</span>
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    container.innerHTML = `<p style="color: var(--text-dim); font-size: 0.8rem;">Loading clustered issues...</p>`;
  }
}

// ================= SAFE JOURNEY ROUTE ENGINE =================
function initJourneyFlow() {
  document.getElementById("preset-trip-1")?.addEventListener("click", () => selectTripPreset("cp_to_karolbagh", "preset-trip-1"));
  document.getElementById("preset-trip-2")?.addEventListener("click", () => selectTripPreset("campus_to_hostel", "preset-trip-2"));

  document.getElementById("btn-start-safer")?.addEventListener("click", () => startLiveNavigation("SAFER"));
  document.getElementById("btn-preview-safer")?.addEventListener("click", () => previewRouteOnMap("SAFER"));

  document.getElementById("btn-start-fastest")?.addEventListener("click", () => startLiveNavigation("FASTEST"));
  document.getElementById("btn-preview-fastest")?.addEventListener("click", () => previewRouteOnMap("FASTEST"));

  document.getElementById("btn-end-navigation")?.addEventListener("click", endLiveNavigation);

  // Initial fetch for default trip
  fetchRouteComparison("Connaught Place Metro", "Karol Bagh Residence");
}

function selectTripPreset(presetKey, activeBtnId) {
  document.querySelectorAll(".preset-pill").forEach(b => b.classList.remove("active"));
  document.getElementById(activeBtnId)?.classList.add("active");

  const originInput = document.getElementById("journey-origin");
  const destInput = document.getElementById("journey-dest");

  if (presetKey === "cp_to_karolbagh") {
    if (originInput) originInput.value = "Connaught Place Metro";
    if (destInput) destInput.value = "Karol Bagh Residence";
    fetchRouteComparison("Connaught Place Metro", "Karol Bagh Residence");
  } else {
    if (originInput) originInput.value = "North Campus Library";
    if (destInput) destInput.value = "Civil Lines Hostel";
    fetchRouteComparison("North Campus Library", "Civil Lines Hostel");
  }
}

async function fetchRouteComparison(origin, destination) {
  try {
    const res = await fetch("/api/location/routes/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin, destination, user_id: state.currentUser.id })
    });
    if (!res.ok) throw new Error("Route compare request failed");
    const data = await res.json();
    state.journeyState.data = data;
    renderRouteCards(data);
  } catch (err) {
    console.warn("Route comparison error:", err);
  }
}

function renderRouteCards(data) {
  if (!data) return;
  const safer = data.safer_route;
  const fastest = data.fastest_route;

  const saferScore = document.getElementById("safer-score-pill");
  const saferTitle = document.getElementById("safer-route-title");
  const saferDesc = document.getElementById("safer-route-desc");
  if (saferScore) saferScore.textContent = `Score ${safer.safety_score}`;
  if (saferTitle) saferTitle.textContent = safer.name;
  if (saferDesc) saferDesc.textContent = `${safer.distance_km} km • ${safer.duration_mins} mins • ${safer.lighting_rating}`;

  const fastScore = document.getElementById("fastest-score-pill");
  const fastTitle = document.getElementById("fastest-route-title");
  const fastDesc = document.getElementById("fastest-route-desc");
  if (fastScore) fastScore.textContent = `Score ${fastest.safety_score}`;
  if (fastTitle) fastTitle.textContent = fastest.name;
  if (fastDesc) fastDesc.textContent = `${fastest.distance_km} km • ${fastest.duration_mins} mins • ${fastest.lighting_rating}`;
}

function clearRoutePolylines() {
  if (!state.mapInstance) return;
  state.mapLayers.routePolylines.forEach(layer => state.mapInstance.removeLayer(layer));
  state.mapLayers.routePolylines = [];
}

function previewRouteOnMap(routeType) {
  if (!state.journeyState.data) return;
  const route = routeType === "SAFER" ? state.journeyState.data.safer_route : state.journeyState.data.fastest_route;

  showScreen("screen-map");
  setTimeout(() => {
    initOrResizeMap();
    clearRoutePolylines();

    // Animated glowing route polyline
    const polyline = L.polyline(route.waypoints, {
      color: route.color || (routeType === "SAFER" ? "#10B981" : "#F97316"),
      weight: 6,
      opacity: 0.95,
      lineCap: "round",
      className: routeType === "SAFER" ? "route-polyline-safe-glow" : "route-polyline-fastest",
      dashArray: routeType === "SAFER" ? "12, 8" : "8, 8"
    }).addTo(state.mapInstance);

    state.mapLayers.routePolylines.push(polyline);
    // Smooth cinematic zoom and pan to fit entire route
    state.mapInstance.flyToBounds(polyline.getBounds(), { 
      padding: [35, 35], 
      maxZoom: 16,
      animate: true, 
      duration: 1.1 
    });

    showToastAlert(`Showing ${routeType === "SAFER" ? "⭐ Recommended Safe" : "⚡ Fastest"} Route Preview`, "info");
  }, 200);
}

async function startLiveNavigation(routeType) {
  if (!state.journeyState.data) return;
  const route = routeType === "SAFER" ? state.journeyState.data.safer_route : state.journeyState.data.fastest_route;

  state.journeyState.active = true;
  state.journeyState.activeRouteType = routeType;
  state.journeyState.currentWaypointIndex = 0;

  try {
    await fetch("/api/location/journey/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: state.currentUser.id,
        origin_name: state.journeyState.data.origin.name,
        dest_name: state.journeyState.data.destination.name,
        selected_route_type: routeType,
        safety_score: route.safety_score
      })
    });
  } catch (err) {
    console.warn("Journey start API error:", err);
  }

  showScreen("screen-map");
  setTimeout(() => {
    initOrResizeMap();
    clearRoutePolylines();

    // Animated glowing navigation route
    const polyline = L.polyline(route.waypoints, {
      color: route.color || (routeType === "SAFER" ? "#10B981" : "#F97316"),
      weight: 6,
      opacity: 0.95,
      lineCap: "round",
      className: routeType === "SAFER" ? "route-polyline-safe-glow" : "route-polyline-fastest",
      dashArray: routeType === "SAFER" ? "12, 8" : "8, 8"
    }).addTo(state.mapInstance);
    state.mapLayers.routePolylines.push(polyline);
    state.mapInstance.flyToBounds(polyline.getBounds(), { 
      padding: [35, 35], 
      maxZoom: 16,
      animate: true, 
      duration: 1.1 
    });

    const hud = document.getElementById("map-nav-hud");
    const hudTag = document.getElementById("hud-route-type");
    const hudDest = document.getElementById("hud-dest-name");
    const hudScore = document.getElementById("hud-score-badge");
    const hudEta = document.getElementById("hud-eta-text");
    const hudFill = document.getElementById("hud-progress-fill");

    if (hud) hud.style.display = "flex";
    if (hudTag) hudTag.textContent = routeType === "SAFER" ? "⭐ SAFE JOURNEY ACTIVE" : "⚡ FASTEST ROUTE (MONITORED)";
    if (hudDest) hudDest.textContent = state.journeyState.data.destination.name;
    if (hudScore) {
      hudScore.textContent = `Score ${route.safety_score}`;
      hudScore.className = `hud-score-pill ${route.safety_score >= 80 ? 'safe' : 'danger'}`;
    }
    if (hudEta) hudEta.textContent = `${route.duration_mins} mins remaining`;
    if (hudFill) hudFill.style.width = "5%";

    updateStatusPill(routeType === "SAFER" ? "Safe Journey Active" : "Route Monitored", "safe");
    showToastAlert(`🚀 Navigation Started via ${route.name}`, "safe");

    clearInterval(state.journeyState.navInterval);
    const waypoints = route.waypoints;
    state.journeyState.navInterval = setInterval(() => {
      state.journeyState.currentWaypointIndex++;
      if (state.journeyState.currentWaypointIndex < waypoints.length) {
        const pt = waypoints[state.journeyState.currentWaypointIndex];
        state.currentLocation.lat = pt[0];
        state.currentLocation.lng = pt[1];
        updateUserMarkerOnMap();
        updateSafetyScore(pt[0], pt[1]);

        // Smooth camera follow during live GPS movement
        if (state.mapInstance) {
          state.mapInstance.panTo([pt[0], pt[1]], { animate: true, duration: 0.6 });
        }

        const pct = Math.round(((state.journeyState.currentWaypointIndex + 1) / waypoints.length) * 100);
        if (hudFill) hudFill.style.width = `${pct}%`;
        const minsLeft = Math.max(1, Math.round(route.duration_mins * (1 - pct / 100)));
        if (hudEta) hudEta.textContent = `${minsLeft} mins remaining (${pct}% completed)`;
      } else {
        clearInterval(state.journeyState.navInterval);
        if (hudEta) hudEta.textContent = "Arrived safely at destination!";
        showToastAlert("🎉 Safe Arrival: You have reached your destination!", "safe");
      }
    }, 2500);

  }, 200);
}

function endLiveNavigation() {
  clearInterval(state.journeyState.navInterval);
  state.journeyState.active = false;
  const hud = document.getElementById("map-nav-hud");
  if (hud) hud.style.display = "none";
  clearRoutePolylines();
  updateStatusPill("Protected", "safe");
  showToastAlert("Safe Journey navigation ended.", "info");
}

// ================= GUARDIAN MANAGEMENT =================
function initGuardianManagement() {
  document.getElementById("btn-close-guardians-modal")?.addEventListener("click", closeGuardiansModal);

  const toggleBtn = document.getElementById("btn-toggle-add-guardian");
  const form = document.getElementById("form-add-guardian");

  toggleBtn?.addEventListener("click", () => {
    if (form.style.display === "none" || !form.style.display) {
      form.style.display = "flex";
      toggleBtn.innerHTML = `<span>✕ Cancel</span>`;
    } else {
      form.style.display = "none";
      toggleBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>Add New Contact</span>
      `;
    }
  });

  form?.addEventListener("submit", handleCreateGuardian);
}

function openGuardiansModal() {
  loadGuardiansList();
  document.getElementById("modal-guardians")?.classList.add("active");
}

function closeGuardiansModal() {
  document.getElementById("modal-guardians")?.classList.remove("active");
  const form = document.getElementById("form-add-guardian");
  if (form) form.style.display = "none";
  const toggleBtn = document.getElementById("btn-toggle-add-guardian");
  if (toggleBtn) {
    toggleBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <span>Add New Contact</span>
    `;
  }
}

async function loadGuardiansList() {
  const container = document.getElementById("guardians-list-container");
  const countBadge = document.getElementById("guardian-count-badge");
  if (!container) return;

  try {
    const res = await fetch(`/api/guardians?user_id=${state.currentUser.id}`);
    if (!res.ok) throw new Error("Failed to fetch guardians");
    const guardians = await res.json();

    if (countBadge) countBadge.textContent = `${guardians.length} Active`;

    if (guardians.length === 0) {
      container.innerHTML = `<p style="color: var(--text-dim); font-size: 0.8rem; text-align: center; padding: 12px;">No guardians added yet. Add your trusted contacts below.</p>`;
      return;
    }

    container.innerHTML = guardians.map(g => `
      <div class="guardian-item ${g.is_primary ? 'primary-card' : ''}" id="guardian-card-${g.id}">
        <div class="g-info">
          <div class="g-header-row">
            <span class="g-name">${g.name}</span>
            ${g.is_primary ? '<span class="primary-pill">⭐ Primary</span>' : ''}
          </div>
          <div class="g-meta-row">
            <span class="g-phone">${g.phone}</span>
            <span class="g-rel-tag">${g.relationship}</span>
          </div>
        </div>
        <div class="g-actions">
          <button class="g-action-btn test" onclick="handleSendTestAlert('${g.id}', '${g.name.replace(/'/g, "\\'")}')">
            <span>Test Alert</span>
          </button>
          ${!g.is_primary ? `<button class="g-action-btn set-primary" onclick="handleSetPrimaryGuardian('${g.id}')">Make Primary</button>` : ''}
          <button class="g-action-btn delete" onclick="handleDeleteGuardian('${g.id}')">✕</button>
        </div>
      </div>
    `).join("");

  } catch (err) {
    console.warn("Could not load guardians:", err);
    container.innerHTML = `<p style="color: var(--text-dim); font-size: 0.8rem;">Could not load emergency contacts.</p>`;
  }
}

async function handleCreateGuardian(e) {
  e.preventDefault();
  const name = document.getElementById("g-input-name").value.trim();
  const phone = document.getElementById("g-input-phone").value.trim();
  const relationship = document.getElementById("g-input-rel").value;
  const is_primary = document.getElementById("g-input-primary").checked;

  if (!name || !phone) return;

  try {
    const res = await fetch("/api/guardians", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: state.currentUser.id,
        name,
        phone,
        relationship,
        is_primary
      })
    });

    if (!res.ok) throw new Error("Failed to create guardian");
    
    // Reset form
    document.getElementById("form-add-guardian").reset();
    document.getElementById("form-add-guardian").style.display = "none";
    const toggleBtn = document.getElementById("btn-toggle-add-guardian");
    if (toggleBtn) {
      toggleBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>Add New Contact</span>
      `;
    }

    loadGuardiansList();
    showToastAlert(`✅ Added ${name} (${relationship}) as Emergency Guardian`, "safe");
  } catch (err) {
    console.warn("Error adding guardian:", err);
    showToastAlert("Failed to add contact", "danger");
  }
}

async function handleDeleteGuardian(id) {
  try {
    const res = await fetch(`/api/guardians/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Delete failed");
    loadGuardiansList();
    showToastAlert("Guardian removed from emergency list", "info");
  } catch (err) {
    console.warn("Error deleting guardian:", err);
  }
}

async function handleSetPrimaryGuardian(id) {
  try {
    const res = await fetch(`/api/guardians/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_primary: true })
    });
    if (!res.ok) throw new Error("Update failed");
    loadGuardiansList();
    showToastAlert("⭐ Primary guardian updated", "safe");
  } catch (err) {
    console.warn("Error updating primary guardian:", err);
  }
}

async function handleSendTestAlert(id, name) {
  try {
    const res = await fetch(`/api/guardians/${id}/test-alert`, { method: "POST" });
    if (!res.ok) throw new Error("Test alert failed");
    const data = await res.json();
    showToastAlert(`🔔 Test SOS Alert sent to ${data.recipient} (${data.phone})`, "safe");
  } catch (err) {
    console.warn("Error sending test alert:", err);
    showToastAlert("Test alert dispatch failed", "danger");
  }
}

