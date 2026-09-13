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
  } else {
    state.mapInstance.invalidateSize();
    state.mapInstance.setView([state.currentLocation.lat, state.currentLocation.lng], 14);
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
        weight: 2,
        fillColor: feature.properties.color || "#10b981",
        fillOpacity: feature.properties.fillOpacity || 0.25
      }),
      onEachFeature: (feature, layer) => {
        layer.bindPopup(`
          <div style="color: #0b0f19; font-family: sans-serif; padding: 4px; min-width: 160px;">
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

function updateUserMarkerOnMap() {
  if (!state.mapInstance) return;

  const latlng = [state.currentLocation.lat, state.currentLocation.lng];
  if (state.mapLayers.userMarker) {
    state.mapLayers.userMarker.setLatLng(latlng);
  } else {
    const beaconIcon = L.divIcon({
      className: "user-gps-beacon",
      html: `<div style="position: relative; width: 18px; height: 18px;">
               <div style="position: absolute; width: 18px; height: 18px; border-radius: 50%; background: #38bdf8; opacity: 0.4; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
               <div style="position: absolute; top: 3px; left: 3px; width: 12px; height: 12px; background: #38bdf8; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 10px #38bdf8;"></div>
             </div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
    state.mapLayers.userMarker = L.marker(latlng, { icon: beaconIcon }).addTo(state.mapInstance);
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
    state.mapInstance.panTo([loc.lat, loc.lng]);
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

// ================= COMPLAINTS & COMMUNITY =================
function initComplaints() {
  document.getElementById("btn-submit-complaint")?.addEventListener("click", async () => {
    const textEl = document.getElementById("complaint-text");
    const catEl = document.getElementById("complaint-category");
    const text = textEl.value.trim();
    if (!text) return;

    try {
      await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          category: catEl.value,
          lat: state.currentLocation.lat,
          lng: state.currentLocation.lng,
          user_id: state.currentUser.id
        })
      });
      textEl.value = "";
      loadComplaints();
    } catch (err) {
      console.warn("Could not post complaint:", err);
    }
  });
}

async function loadComplaints() {
  const container = document.getElementById("complaints-list");
  if (!container) return;

  try {
    const res = await fetch("/api/complaints");
    if (!res.ok) return;
    const items = await res.json();

    container.innerHTML = items.map(c => {
      const timeStr = new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="report-item">
          <div class="report-item-top">
            <span class="report-tag ${c.severity === 'CRITICAL' ? 'risk-pill danger' : 'risk-pill warn'}">${c.category.replace('_', ' ')}</span>
            <span class="report-time">${timeStr}</span>
          </div>
          <p>${c.text}</p>
        </div>
      `;
    }).join("");
  } catch (err) {
    container.innerHTML = `<p style="color: var(--text-dim); font-size: 0.8rem;">Loading reports...</p>`;
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

    const polyline = L.polyline(route.waypoints, {
      color: route.color || (routeType === "SAFER" ? "#10B981" : "#F97316"),
      weight: 5,
      opacity: 0.9,
      lineCap: "round",
      dashArray: routeType === "SAFER" ? null : "8, 8"
    }).addTo(state.mapInstance);

    state.mapLayers.routePolylines.push(polyline);
    state.mapInstance.fitBounds(polyline.getBounds(), { padding: [30, 30] });

    showToastAlert(`Showing ${routeType === "SAFER" ? "Recommended Safe" : "Fastest"} Route Preview`, "info");
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

    const polyline = L.polyline(route.waypoints, {
      color: route.color || (routeType === "SAFER" ? "#10B981" : "#F97316"),
      weight: 5,
      opacity: 0.9
    }).addTo(state.mapInstance);
    state.mapLayers.routePolylines.push(polyline);
    state.mapInstance.fitBounds(polyline.getBounds(), { padding: [30, 30] });

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
// ================= GUARDIAN MANAGEMENT =================
const REL_EMOJIS = {
  Mother: "👩",
  Father: "👨",
  Sister: "👧",
  Brother: "👦",
  Spouse: "💍",
  Friend: "🤝",
  Other: "🛡️"
};

function getRelEmoji(rel) {
  if (!rel) return "🛡️";
  if (REL_EMOJIS[rel]) return REL_EMOJIS[rel];
  const lower = rel.toLowerCase();
  if (lower.includes("mother") || lower.includes("mom") || lower.includes("maa")) return "👩";
  if (lower.includes("father") || lower.includes("dad") || lower.includes("papa")) return "👨";
  if (lower.includes("sister") || lower.includes("sis")) return "👧";
  if (lower.includes("brother") || lower.includes("bro")) return "👦";
  if (lower.includes("spouse") || lower.includes("husband") || lower.includes("wife") || lower.includes("partner")) return "💍";
  if (lower.includes("friend") || lower.includes("roommate") || lower.includes("colleague")) return "🤝";
  return "🛡️";
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function initGuardianManagement() {
  document.getElementById("btn-close-guardians-modal")?.addEventListener("click", closeGuardiansModal);
  document.getElementById("btn-header-guardians")?.addEventListener("click", openGuardiansModal);
  document.getElementById("btn-nav-contacts")?.addEventListener("click", openGuardiansModal);

  const toggleBtn = document.getElementById("btn-toggle-add-guardian");
  const form = document.getElementById("form-add-guardian");

  toggleBtn?.addEventListener("click", () => {
    if (form.style.display === "none" || !form.style.display) {
      form.style.display = "flex";
      toggleBtn.innerHTML = `<span>✕ Cancel</span>`;
      document.getElementById("g-input-name")?.focus();
    } else {
      resetGuardianForm();
    }
  });

  // Interactive relationship chips
  const chips = document.querySelectorAll(".rel-chip");
  const hiddenRelInput = document.getElementById("g-input-rel");
  const customContainer = document.getElementById("g-custom-rel-container");
  const customInput = document.getElementById("g-input-custom-rel");
  const hintBadge = document.getElementById("rel-hint-badge");

  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      chips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");

      const rel = chip.getAttribute("data-rel");
      if (hiddenRelInput) hiddenRelInput.value = rel;

      if (rel === "Other") {
        if (customContainer) {
          customContainer.style.display = "block";
          if (customInput) {
            customInput.focus();
            const val = customInput.value.trim();
            if (hintBadge) hintBadge.textContent = val ? `Selected: 🛡️ ${val}` : "Selected: 🛡️ Custom Relation";
          }
        }
      } else {
        if (customContainer) {
          customContainer.style.display = "none";
          if (customInput) customInput.value = "";
        }
        const icon = chip.querySelector(".chip-icon")?.textContent || "🛡️";
        if (hintBadge) hintBadge.textContent = `Selected: ${icon} ${rel}`;
      }
    });
  });

  // Update dynamic hint on typing custom relation
  customInput?.addEventListener("input", (e) => {
    const val = e.target.value.trim();
    if (hintBadge) {
      hintBadge.textContent = val ? `Selected: 🛡️ ${val}` : "Selected: 🛡️ Custom Relation";
    }
  });

  form?.addEventListener("submit", handleCreateGuardian);

  // Background fetch of contacts
  loadGuardiansList();
}

function resetGuardianForm() {
  const form = document.getElementById("form-add-guardian");
  if (form) {
    form.reset();
    form.style.display = "none";
  }

  // Reset chips to Mother
  document.querySelectorAll(".rel-chip").forEach(c => {
    c.classList.toggle("active", c.getAttribute("data-rel") === "Mother");
  });
  const hiddenInput = document.getElementById("g-input-rel");
  if (hiddenInput) hiddenInput.value = "Mother";

  const customContainer = document.getElementById("g-custom-rel-container");
  const customInput = document.getElementById("g-input-custom-rel");
  if (customContainer) customContainer.style.display = "none";
  if (customInput) customInput.value = "";

  const hintBadge = document.getElementById("rel-hint-badge");
  if (hintBadge) hintBadge.textContent = "Selected: 👩 Mother";

  const toggleBtn = document.getElementById("btn-toggle-add-guardian");
  if (toggleBtn) {
    toggleBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <span>Add Emergency Contact</span>
    `;
  }
}

function openGuardiansModal() {
  loadGuardiansList();
  document.getElementById("modal-guardians")?.classList.add("active");
}

function closeGuardiansModal() {
  document.getElementById("modal-guardians")?.classList.remove("active");
  resetGuardianForm();
}

async function loadGuardiansList() {
  const container = document.getElementById("guardians-list-container");
  const countBadge = document.getElementById("guardian-count-badge");
  const headerBadge = document.getElementById("header-guardian-badge");
  const homeTileDesc = document.querySelector("#btn-nav-contacts .tile-desc");
  if (!container) return;

  try {
    const res = await fetch(`/api/guardians?user_id=${state.currentUser.id}`);
    if (!res.ok) throw new Error("Failed to fetch guardians");
    const guardians = await res.json();

    if (countBadge) countBadge.textContent = `${guardians.length} Active`;
    if (headerBadge) headerBadge.textContent = `${guardians.length}`;
    if (homeTileDesc) homeTileDesc.textContent = `${guardians.length} Emergency Contact${guardians.length === 1 ? '' : 's'}`;

    if (guardians.length === 0) {
      container.innerHTML = `
        <div class="guardians-empty-state">
          <div class="empty-icon-shield">🛡️</div>
          <h4>No Emergency Guardians Registered</h4>
          <p>Add at least one trusted contact below to receive automated priority alerts, live GPS streaming, and emergency notifications.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = guardians.map(g => {
      const emoji = getRelEmoji(g.relationship);
      const safeName = escapeHtml(g.name);
      const safePhone = escapeHtml(g.phone);
      const safeRel = escapeHtml(g.relationship);
      const jsName = g.name.replace(/'/g, "\\'");

      return `
        <div class="guardian-item ${g.is_primary ? 'primary-card' : ''}" id="guardian-card-${g.id}">
          <div class="g-avatar-circle ${g.is_primary ? 'primary-avatar' : ''}">
            <span class="g-avatar-emoji">${emoji}</span>
          </div>
          <div class="g-info">
            <div class="g-header-row">
              <span class="g-name">${safeName}</span>
              ${g.is_primary ? '<span class="primary-pill">⭐ PRIMARY</span>' : ''}
            </div>
            <div class="g-meta-row">
              <span class="g-phone">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                ${safePhone}
              </span>
              <span class="g-rel-tag">${safeRel}</span>
            </div>
          </div>
          <div class="g-actions">
            <button class="g-action-btn test" onclick="handleSendTestAlert('${g.id}', '${jsName}')" title="Send simulated test SOS alert">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              <span>Test</span>
            </button>
            ${!g.is_primary ? `<button class="g-action-btn set-primary" onclick="handleSetPrimaryGuardian('${g.id}')">Make Primary</button>` : ''}
            <button class="g-action-btn delete" onclick="handleDeleteGuardian('${g.id}')" title="Remove Contact">✕</button>
          </div>
        </div>
      `;
    }).join("");

  } catch (err) {
    console.warn("Could not load guardians:", err);
    container.innerHTML = `<p style="color: var(--text-dim); font-size: 0.8rem; text-align: center; padding: 10px;">Could not load emergency contacts.</p>`;
  }
}

async function handleCreateGuardian(e) {
  e.preventDefault();
  const name = document.getElementById("g-input-name").value.trim();
  const phone = document.getElementById("g-input-phone").value.trim();
  let relationship = document.getElementById("g-input-rel")?.value || "Mother";
  const customRel = document.getElementById("g-input-custom-rel")?.value.trim();
  const is_primary = document.getElementById("g-input-primary")?.checked || false;

  if (relationship === "Other") {
    relationship = customRel ? customRel : "Other";
  }

  if (!name || !phone) {
    showToastAlert("Please provide both name and phone number", "warn");
    return;
  }

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
    
    resetGuardianForm();
    loadGuardiansList();
    showToastAlert(`✅ Added ${name} (${relationship}) as Emergency Guardian`, "safe");
  } catch (err) {
    console.warn("Error adding guardian:", err);
    showToastAlert("Failed to add contact. Please verify details.", "danger");
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
    showToastAlert("Failed to delete contact", "danger");
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
    showToastAlert("Failed to update primary contact", "danger");
  }
}

async function handleSendTestAlert(id, name) {
  try {
    const res = await fetch(`/api/guardians/${id}/test-alert`, { method: "POST" });
    if (!res.ok) throw new Error("Test alert failed");
    const data = await res.json();
    showToastAlert(`🔔 Test SOS Alert dispatched to ${data.recipient} (${data.phone})`, "safe");
  } catch (err) {
    console.warn("Error sending test alert:", err);
    showToastAlert("Test alert dispatch failed", "danger");
  }
}

