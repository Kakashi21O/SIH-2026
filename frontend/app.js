/**
 * SafeSteps — Frontend Application Controller & State Orchestrator
 * Theme: Smart Automation | SIH / InnoHack 2026 Prototype
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
  mapInstance: null,
  mapLayers: {
    zones: null,
    userMarker: null
  }
};

// Demo Preset Coordinates for Instant Live Jumps
const DEMO_LOCATIONS = {
  safe: { lat: 28.6315, lng: 77.2190, name: "Connaught Place Central Hub (Low Risk)" },
  mod: { lat: 28.6420, lng: 77.2105, name: "Paharganj Commercial Alleyway (Moderate)" },
  high: { lat: 28.6395, lng: 77.2315, name: "Railway Underpass Corridor (High Risk)" },
  crit: { lat: 28.6505, lng: 77.2385, name: "Old Industrial Bypass & Canal (Critical)" }
};

// ================= DOM INITIALIZATION & ROUTING =================
document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initAuthFlow();
  initScoreAndToggle();
  initEmergencyVerification();
  initPinKeypad();
  initComplaints();
  initDemoLocationJumpers();
  
  // Fetch initial system state
  updateSafetyScore(state.currentLocation.lat, state.currentLocation.lng);
});

// Navigate between the 7 screens
function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add("active");
  }

  // Update Bottom Nav Tab Highlights
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.classList.toggle("active", tab.getAttribute("data-target") === screenId);
  });

  // Screen-specific triggers
  if (screenId === "screen-map") {
    setTimeout(initOrResizeMap, 150);
  } else if (screenId === "screen-intelligence") {
    loadComplaints();
  }
}

function initNavigation() {
  // Back buttons
  document.querySelectorAll(".btn-back").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-target") || "screen-home";
      showScreen(target);
    });
  });

  // Bottom navigation tabs
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-target");
      if (target) showScreen(target);
    });
  });

  // Action cards on Home
  document.getElementById("btn-nav-journey")?.addEventListener("click", () => showScreen("screen-journey"));
  document.getElementById("btn-nav-map")?.addEventListener("click", () => showScreen("screen-map"));
  document.getElementById("btn-nav-intel")?.addEventListener("click", () => showScreen("screen-intelligence"));
  document.getElementById("btn-nav-contacts")?.addEventListener("click", () => {
    alert("Emergency Guardians Configured:\n1. Pooja Sharma (Mother) — +919811122233\n2. Rahul Sharma (Brother) — +919822233344");
  });
}

// ================= 1. AUTH FLOW =================
function initAuthFlow() {
  const btnLogin = document.getElementById("btn-login");
  btnLogin?.addEventListener("click", () => {
    const name = document.getElementById("auth-name").value.trim();
    const phone = document.getElementById("auth-phone").value.trim();
    if (name) state.currentUser.name = name;
    if (phone) state.currentUser.phone = phone;

    // Transition into Home Dashboard
    showScreen("screen-home");
  });
}

// ================= 2. HOME SCORE & AUTO SAFETY MODE =================
function initScoreAndToggle() {
  const toggle = document.getElementById("toggle-safety-mode");
  toggle?.addEventListener("change", (e) => {
    state.safetyModeActive = e.target.checked;
    updateStatusPill(state.safetyModeActive ? "Safety Mode ON" : "Active Safe", state.safetyModeActive ? "safe" : "safe");
  });

  document.getElementById("btn-switch-location")?.addEventListener("click", () => {
    showScreen("screen-map");
  });
}

function updateStatusPill(text, type = "safe") {
  const pill = document.getElementById("header-status-pill");
  const textEl = document.getElementById("header-status-text");
  const dot = pill.querySelector(".status-dot");
  if (textEl) textEl.textContent = text;
  if (dot) {
    dot.className = `status-dot ${type}`;
  }
}

async function updateSafetyScore(lat, lng) {
  try {
    const res = await fetch("/api/safety/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng, user_id: state.currentUser.id })
    });
    if (!res.ok) throw new Error("Failed to fetch safety score");
    const data = await res.json();

    state.safetyScore = data.overall_score;
    state.riskLevel = data.risk_level;
    state.currentLocation.name = data.active_zone_name || "Monitored Urban Sector";

    // Update Home UI elements
    const scoreVal = document.getElementById("home-score-value");
    const locName = document.getElementById("home-loc-name");
    const riskBadge = document.getElementById("home-risk-badge");
    const riskDesc = document.getElementById("home-risk-desc");
    const scoreRing = document.getElementById("score-ring");
    const toggle = document.getElementById("toggle-safety-mode");

    if (scoreVal) scoreVal.textContent = data.overall_score;
    if (locName) locName.textContent = state.currentLocation.name;
    if (riskDesc) riskDesc.textContent = data.recommended_action;

    // SVG Circular Progress (circumference ~314)
    if (scoreRing) {
      const offset = 314 - (314 * data.overall_score) / 100;
      scoreRing.style.strokeDashoffset = offset;
      
      if (data.overall_score >= 80) {
        scoreRing.style.stroke = "var(--state-safe)";
        if (riskBadge) { riskBadge.className = "badge badge-safe"; riskBadge.textContent = "🟢 LOW RISK ZONE"; }
      } else if (data.overall_score >= 60) {
        scoreRing.style.stroke = "var(--state-warn)";
        if (riskBadge) { riskBadge.className = "badge badge-warn"; riskBadge.textContent = "🟡 MODERATE RISK"; }
      } else if (data.overall_score >= 40) {
        scoreRing.style.stroke = "var(--state-high)";
        if (riskBadge) { riskBadge.className = "badge badge-high"; riskBadge.textContent = "🟠 HIGH RISK ZONE"; }
      } else {
        scoreRing.style.stroke = "var(--state-critical)";
        if (riskBadge) { riskBadge.className = "badge badge-critical"; riskBadge.textContent = "🔴 CRITICAL RISK ZONE"; }
      }
    }

    // Proactive Safety Mode Auto-Activation on High/Critical Zones
    if (data.auto_safety_mode_recommended && !state.safetyModeActive) {
      state.safetyModeActive = true;
      if (toggle) toggle.checked = true;
      updateStatusPill("Auto Safety Mode Active", "danger");
    }

  } catch (err) {
    console.warn("Using offline fallback score calculation:", err);
  }
}

// ================= 3. LEAFLET MAP ENGINE =================
function initOrResizeMap() {
  const mapContainer = document.getElementById("leaflet-map");
  if (!mapContainer) return;

  if (!state.mapInstance) {
    state.mapInstance = L.map("leaflet-map", {
      zoomControl: false,
      attributionControl: false
    }).setView([state.currentLocation.lat, state.currentLocation.lng], 14);

    // Dark Map Tiles
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19
    }).addTo(state.mapInstance);

    // Load Risk Zone Polygons from backend
    loadMapRiskZones();
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
        fillOpacity: feature.properties.fillOpacity || 0.3
      }),
      onEachFeature: (feature, layer) => {
        layer.bindPopup(`
          <div style="color: #0b0f19; font-family: sans-serif;">
            <b>${feature.properties.name}</b><br/>
            Score: ${feature.properties.safety_score}/100 (${feature.properties.risk_level})<br/>
            <small>${feature.properties.description}</small>
          </div>
        `);
      }
    }).addTo(state.mapInstance);
  } catch (err) {
    console.warn("Could not load map zones:", err);
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
      html: `<div style="width: 16px; height: 16px; background: #06b6d4; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 12px #06b6d4;"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
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

// ================= 4. EMERGENCY VERIFICATION (10s COUNTDOWN) =================
function initEmergencyVerification() {
  // SOS trigger on Home screen
  document.getElementById("btn-trigger-sos")?.addEventListener("click", () => {
    triggerEmergencyWorkflow("manual_sos");
  });

  // "I'M SAFE" Quick dismissal button
  document.getElementById("btn-im-safe")?.addEventListener("click", () => {
    cancelEmergencyCountdown("Safe button tapped");
  });

  // "Enter PIN" modal trigger
  document.getElementById("btn-enter-pin-modal")?.addEventListener("click", () => {
    openPinModal();
  });

  // Abort button on active emergency screen
  document.getElementById("btn-abort-emergency-active")?.addEventListener("click", () => {
    openPinModal();
  });
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
    console.warn("Offline fallback token:", err);
    state.emergencyState.verificationToken = "tok_local_demo";
  }

  // Show Verification Screen
  showScreen("screen-verify");
  updateCountdownUI();

  // Start 1-second interval countdown
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
  if (timerEl) {
    timerEl.textContent = state.emergencyState.countdownSeconds;
  }
}

function cancelEmergencyCountdown(reason) {
  clearInterval(state.emergencyState.countdownInterval);
  state.emergencyState.active = false;
  closePinModal();
  showScreen("screen-home");
  updateStatusPill("Active Safe", "safe");
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

    // Update Emergency Screen
    document.getElementById("emg-inc-id").textContent = data.id;
    document.getElementById("emg-inc-severity").textContent = `SEVERITY ${data.severity_score}/100`;
    document.getElementById("emg-coords-stream").textContent = `Broadcasting (${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}) • Live`;
  } catch (err) {
    console.warn("Offline emergency escalation fallback:", err);
  }

  updateStatusPill("EMERGENCY ACTIVE", "danger");
  showScreen("screen-emergency");
}

// ================= 5. PIN KEYPAD MODAL =================
function initPinKeypad() {
  const pinInput = document.getElementById("modal-pin-input");
  const errorMsg = document.getElementById("pin-error-msg");

  document.querySelectorAll(".key-btn[data-key]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (pinInput.value.length < 4) {
        pinInput.value += btn.getAttribute("data-key");
        errorMsg.textContent = "";
      }
    });
  });

  document.getElementById("btn-keypad-clear")?.addEventListener("click", () => {
    pinInput.value = "";
    errorMsg.textContent = "";
  });

  document.getElementById("btn-keypad-submit")?.addEventListener("click", async () => {
    const pin = pinInput.value;
    if (pin.length !== 4) {
      errorMsg.textContent = "Please enter complete 4-digit PIN";
      return;
    }

    try {
      const res = await fetch("/api/auth/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, user_id: state.currentUser.id })
      });
      const data = await res.json();

      if (data.valid) {
        cancelEmergencyCountdown("Valid PIN verified");
      } else {
        errorMsg.textContent = "Incorrect PIN. Try again.";
        pinInput.value = "";
      }
    } catch (err) {
      // Local fallback: default PIN 1234
      if (pin === "1234") {
        cancelEmergencyCountdown("Fallback valid PIN");
      } else {
        errorMsg.textContent = "Incorrect PIN (Demo PIN is 1234)";
        pinInput.value = "";
      }
    }
  });

  document.getElementById("btn-close-pin-modal")?.addEventListener("click", closePinModal);
}

function openPinModal() {
  const modal = document.getElementById("pin-modal");
  const input = document.getElementById("modal-pin-input");
  const errorMsg = document.getElementById("pin-error-msg");
  if (input) input.value = "";
  if (errorMsg) errorMsg.textContent = "";
  if (modal) modal.classList.add("active");
}

function closePinModal() {
  const modal = document.getElementById("pin-modal");
  if (modal) modal.classList.remove("active");
}

// ================= 6. COMPLAINTS & INTELLIGENCE =================
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

    container.innerHTML = items.map(c => `
      <div class="complaint-card">
        <div class="complaint-top">
          <span class="badge ${c.severity === 'CRITICAL' ? 'badge-critical' : 'badge-warn'}">${c.category.replace('_', ' ').toUpperCase()}</span>
          <small style="color: var(--text-dim); font-size: 0.7rem;">${new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
        </div>
        <p>${c.text}</p>
      </div>
    `).join("");
  } catch (err) {
    container.innerHTML = `<p style="color: var(--text-dim); font-size: 0.8rem;">Loading reports...</p>`;
  }
}
