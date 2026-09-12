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
  mapInstance: null,
  mapLayers: {
    zones: null,
    userMarker: null
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
  document.getElementById("btn-nav-contacts")?.addEventListener("click", () => {
    alert("Emergency Contacts:\n• Pooja Sharma (Mother) — +91 98111 22233\n• Rahul Sharma (Brother) — +91 98222 33344");
  });
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
