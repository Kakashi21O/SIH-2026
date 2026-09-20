/**
 * SafeSteps — Frontend Application Controller
 * Proactive Safety & Automated Emergency Response
 */

// Global Application State
const state = {
  currentUser: {
    id: "",
    name: "",
    phone: ""
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
    incidentId: null,
    triggerSource: "manual_sos",
    distressKeyword: null,
    repeatedSignal: false,
    tapCount: 0,
    lastTapTime: 0
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
    pois: [],
    userMarker: null,
    routePolylines: [],
    showHotspots: true,
    showPois: true
  },
  mapData: { pois: [], hotspots: [] }
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

  // Initialize SafeSteps AI Assistant widget
  if (window.SafeAssistantUI) {
    window.SafeAssistantUI.init();
  }
});

function showScreen(screenId) {
  document.querySelectorAll(".view-screen").forEach(s => s.classList.remove("active"));
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add("active");
  }

  // Update AI Assistant screen context
  if (window.SafeAssistantUI) {
    window.SafeAssistantUI.updateScreenContext(screenId);
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

// ================= AUTH FLOW (Session-Persistent) =================

const SS_KEY = "ss_user"; // localStorage key

function getStoredUser() {
  try { return JSON.parse(localStorage.getItem(SS_KEY)) || null; } catch { return null; }
}
function saveUser(data) {
  localStorage.setItem(SS_KEY, JSON.stringify(data));
}
function clearUser() {
  localStorage.removeItem(SS_KEY);
}

// Switch between "New User" and "Login" tabs on auth screen
function switchAuthTab(tab) {
  const isRegister = tab === "register";
  document.getElementById("tab-register").classList.toggle("active", isRegister);
  document.getElementById("tab-login").classList.toggle("active", !isRegister);
  document.getElementById("auth-step-1").style.display = isRegister ? "" : "none";
  document.getElementById("auth-step-2").style.display = "none";
  document.getElementById("auth-login-panel").style.display = isRegister ? "none" : "";
  document.getElementById("auth-error-1").textContent = "";
  document.getElementById("auth-error-login").textContent = "";
}

function initAuthFlow() {
  const stored = getStoredUser();

  // ── Auto-login: skip auth screen if already logged in ──
  if (stored?.loggedIn) {
    applySession(stored);
    showScreen("screen-home");
    return;
  }

  // ── Step 1 → Step 2 (Continue) ──
  document.getElementById("btn-next-step")?.addEventListener("click", () => {
    const name = document.getElementById("auth-name").value.trim();
    const phone = document.getElementById("auth-phone").value.trim();
    const pin = document.getElementById("auth-pin").value.trim();
    const pinConfirm = document.getElementById("auth-pin-confirm").value.trim();
    const errEl = document.getElementById("auth-error-1");

    if (!name) { errEl.textContent = "Please enter your full name."; return; }
    if (!phone || phone.length < 10) { errEl.textContent = "Enter a valid mobile number."; return; }
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) { errEl.textContent = "PIN must be exactly 4 digits."; return; }
    if (pin !== pinConfirm) { errEl.textContent = "PINs do not match."; return; }

    errEl.textContent = "";
    // Stash step-1 data temporarily
    window._authTemp = { name, phone, pin };
    document.getElementById("auth-step-1").style.display = "none";
    document.getElementById("auth-step-2").style.display = "";
  });

  // ── Back button (Step 2 → Step 1) ──
  document.getElementById("btn-back-step")?.addEventListener("click", () => {
    document.getElementById("auth-step-2").style.display = "none";
    document.getElementById("auth-step-1").style.display = "";
  });

  // ── Finish Registration (Step 2 with guardian) ──
  document.getElementById("btn-finish-register")?.addEventListener("click", () => {
    const gName = document.getElementById("reg-guardian-name").value.trim();
    const gPhone = document.getElementById("reg-guardian-phone").value.trim();
    const gRel = document.getElementById("reg-guardian-rel").value;
    const errEl = document.getElementById("auth-error-2");

    if (!gName || !gPhone) { errEl.textContent = "Please fill in guardian details to enable SOS."; return; }

    const guardian = { id: "g_" + Date.now(), name: gName, phone: gPhone, relationship: gRel };
    finishRegistration([guardian]);
  });

  // ── Skip Guardian ──
  document.getElementById("btn-skip-guardian")?.addEventListener("click", () => {
    finishRegistration([]);
  });

  // ── Login (returning user — phone + PIN) ──
  document.getElementById("btn-login")?.addEventListener("click", () => {
    const phone = document.getElementById("login-phone").value.trim();
    const pin = document.getElementById("login-pin").value.trim();
    const errEl = document.getElementById("auth-error-login");
    const stored = getStoredUser();

    if (!stored) {
      errEl.textContent = "No account found. Please register first."; return;
    }
    if (stored.phone !== phone) {
      errEl.textContent = "Phone number does not match."; return;
    }
    if (stored.pin !== pin) {
      errEl.textContent = "Incorrect PIN. Try again."; return;
    }

    stored.loggedIn = true;
    saveUser(stored);
    applySession(stored);
    showScreen("screen-home");
  });

  // ── Logout ──
  document.getElementById("btn-logout")?.addEventListener("click", () => {
    if (!confirm("Are you sure you want to logout?")) return;
    const stored = getStoredUser();
    if (stored) { stored.loggedIn = false; saveUser(stored); }
    document.getElementById("btn-logout").style.display = "none";
    showScreen("screen-auth");
    // Reset auth form to register tab
    switchAuthTab("register");
    ["auth-name","auth-phone","auth-pin","auth-pin-confirm","reg-guardian-name","reg-guardian-phone"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
  });
}

function finishRegistration(guardians) {
  const temp = window._authTemp || {};
  const userData = {
    name: temp.name,
    phone: temp.phone,
    pin: temp.pin,
    loggedIn: true,
    guardians: guardians
  };
  saveUser(userData);
  applySession(userData);

  // Sync guardian to backend API if provided
  if (guardians.length > 0) {
    const g = guardians[0];
    fetch("/api/guardians/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: temp.phone, name: g.name, phone: g.phone, relationship: g.relationship })
    }).catch(() => {}); // silent fail — guardian still saved locally
  }

  showScreen("screen-home");
}

function applySession(userData) {
  // Populate state
  if (userData.name) state.currentUser.name = userData.name;
  if (userData.phone) {
    state.currentUser.phone = userData.phone;
    state.currentUser.id = userData.phone; // use phone as unique user ID
  }

  // Show logout button
  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) logoutBtn.style.display = "flex";

  // Update emergency guardian status with real name
  const guardians = userData.guardians || [];
  const statusEl = document.getElementById("emg-guardian-status");
  if (statusEl && guardians.length > 0) {
    statusEl.textContent = `Alert will be sent to ${guardians[0].name} (${guardians[0].phone})`;
  } else if (statusEl) {
    statusEl.textContent = "No guardian set — add one in Contacts for SOS alerts.";
  }
}


// ================= DASHBOARD & SAFETY SCORE =================
function initScoreAndToggle() {
  const toggle = document.getElementById("toggle-safety-mode");
  toggle?.addEventListener("change", (e) => {
    state.safetyModeActive = e.target.checked;
    updateStatusPill(state.safetyModeActive ? "Monitoring On" : "Protected", state.safetyModeActive ? "safe" : "safe");
    
    // Proactively start or pause voice recognition based on user safety mode toggle
    if (window.SafeAudioEngine) {
      if (state.safetyModeActive) {
        window.SafeAudioEngine.startSpeechListening();
      } else {
        window.SafeAudioEngine.stopSpeechListening();
      }
    }
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

    const isRedZone = (data.overall_score < 40) || (data.risk_level === "CRITICAL") || (data.risk_level === "HIGH");

    if (data.auto_safety_mode_recommended && !state.safetyModeActive) {
      state.safetyModeActive = true;
      if (toggle) toggle.checked = true;
      updateStatusPill("High Risk Auto-Mode", "danger");
      showToastAlert(`⚠️ Red/High Risk Zone: ${state.currentLocation.name}. Safety Mode & Voice Distress Listener Auto-Engaged!`, "danger");

      // Auto-start Distress Keyword Listener when entering red/high-risk zone
      if (window.SafeAudioEngine && !window.SafeAudioEngine.isListening) {
        window.SafeAudioEngine.startSpeechListening(true);
      }
    } else if (isRedZone && window.SafeAudioEngine && !window.SafeAudioEngine.isListening) {
      // Proactively activate listener if user enters red zone even if safety mode was already on
      window.SafeAudioEngine.startSpeechListening(true);
      showToastAlert(`🎙️ Distress Voice Listener auto-activated for Red Zone: ${state.currentLocation.name}`, "danger");
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
    // Silky-smooth fractional zoom, eliminated stepping jitter, native hardware-accelerated animations
    state.mapInstance = L.map("leaflet-map", {
      zoomControl: true,
      attributionControl: false,
      zoomAnimation: true,
      markerZoomAnimation: false,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 120,
      fadeAnimation: true
    }).setView([state.currentLocation.lat, state.currentLocation.lng], 14);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(state.mapInstance);

    // Click anywhere on the map to inspect risk & move GPS beacon
    state.mapInstance.on("click", (e) => {
      state.currentLocation.lat = e.latlng.lat;
      state.currentLocation.lng = e.latlng.lng;
      updateSafetyScore(e.latlng.lat, e.latlng.lng);
      updateUserMarkerOnMap();
    });

    // Zoom-aware marker scaling — resize POI pins and report triangles on every zoom change
    state.mapInstance.on("zoomend", () => refreshMarkersForZoom());

    initAreaInfoModal();
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

function initAreaInfoModal() {
  const infoBtn = document.getElementById("btn-map-zone-info");
  const closeBtn = document.getElementById("btn-close-zone-info");
  const card = document.getElementById("map-zone-info-card");

  infoBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleAreaInfoCard();
  });

  closeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (card) card.style.display = "none";
  });

  // Layer toggle buttons inside the Area Info card
  const toggleReportsBtn = document.getElementById("btn-toggle-reports-layer");
  const togglePoisBtn = document.getElementById("btn-toggle-pois-layer");

  toggleReportsBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    state.mapLayers.showHotspots = !state.mapLayers.showHotspots;
    toggleReportsBtn.classList.toggle("active", state.mapLayers.showHotspots);
    const badge = document.getElementById("badge-reports-state");
    if (badge) badge.textContent = state.mapLayers.showHotspots ? "ON" : "OFF";
    
    // Toggle visibility of all hotspot elements on map
    if (state.mapLayers.hotspots && state.mapLayers.hotspots.length) {
      state.mapLayers.hotspots.forEach(layer => {
        if (state.mapLayers.showHotspots) {
          state.mapInstance.addLayer(layer);
        } else {
          state.mapInstance.removeLayer(layer);
        }
      });
    }
  });

  togglePoisBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    state.mapLayers.showPois = !state.mapLayers.showPois;
    togglePoisBtn.classList.toggle("active", state.mapLayers.showPois);
    const badge = document.getElementById("badge-pois-state");
    if (badge) badge.textContent = state.mapLayers.showPois ? "ON" : "OFF";

    // Toggle visibility of all POI markers on map
    if (state.mapLayers.pois && state.mapLayers.pois.length) {
      state.mapLayers.pois.forEach(layer => {
        if (state.mapLayers.showPois) {
          state.mapInstance.addLayer(layer);
        } else {
          state.mapInstance.removeLayer(layer);
        }
      });
    }
  });

  // Clicking anywhere else on map closes the info card
  state.mapInstance?.on("click", () => {
    if (card) card.style.display = "none";
  });
}

function toggleAreaInfoCard() {
  const card = document.getElementById("map-zone-info-card");
  if (!card) return;

  const isVisible = card.style.display === "block";
  if (isVisible) {
    card.style.display = "none";
    return;
  }

  // Populate card with current location's live data
  const nameEl = document.getElementById("zinfo-name");
  const scoreEl = document.getElementById("zinfo-score");
  const pillEl = document.getElementById("zinfo-risk-pill");
  const reportsEl = document.getElementById("zinfo-reports");
  const descEl = document.getElementById("zinfo-desc");

  if (nameEl) nameEl.textContent = state.currentLocation.name || "Monitored Zone";
  if (scoreEl) scoreEl.innerHTML = `${state.safetyScore}<small>/100</small>`;
  
  if (pillEl) {
    pillEl.textContent = state.riskLevel || "LOW";
    if (state.safetyScore >= 80) {
      pillEl.className = "risk-pill safe";
    } else if (state.safetyScore >= 60) {
      pillEl.className = "risk-pill warn";
    } else if (state.safetyScore >= 40) {
      pillEl.className = "risk-pill high";
    } else {
      pillEl.className = "risk-pill danger";
    }
  }

  // Find nearest risk zone or report count
  let reportedCount = 2;
  let zoneDesc = "Active commercial corridors with verified police presence and street illumination.";

  if (state.riskLevel === "CRITICAL" || state.safetyScore < 40) {
    reportedCount = 28;
    zoneDesc = "Isolated bypass route with broken streetlights and unmonitored canal underpass. Exercise high caution.";
  } else if (state.riskLevel === "HIGH" || state.safetyScore < 60) {
    reportedCount = 14;
    zoneDesc = "Poor lighting reported near underpass corridors. High surveillance recommended.";
  } else if (state.riskLevel === "MODERATE") {
    reportedCount = 8;
    zoneDesc = "Dense pedestrian transit area with medium illumination and periodic police patrols.";
  }

  if (reportsEl) reportsEl.textContent = reportedCount;
  if (descEl) descEl.textContent = zoneDesc;

  card.style.display = "block";
}

async function loadMapRiskZones() {
  try {
    const res = await fetch("/api/safety/zones");
    if (!res.ok) return;
    const geojson = await res.json();

    if (state.mapLayers.zones) {
      state.mapInstance.removeLayer(state.mapLayers.zones);
    }

    // Chaikin spline subdivision to turn angular polygon vertex lines into smooth curved organic water edges
    function smoothPolygonCoords(ring, iterations = 3) {
      let coords = ring.slice();
      for (let it = 0; it < iterations; it++) {
        const smoothed = [];
        for (let i = 0; i < coords.length - 1; i++) {
          const p0 = coords[i];
          const p1 = coords[i + 1];
          const q = [0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1]];
          const r = [0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1]];
          smoothed.push(q, r);
        }
        smoothed.push(smoothed[0]); // close polygon ring
        coords = smoothed;
      }
      return coords;
    }

    // Deep copy and smooth GeoJSON polygons into curves
    const curvedGeojson = JSON.parse(JSON.stringify(geojson));
    curvedGeojson.features.forEach(f => {
      if (f.geometry && f.geometry.type === "Polygon") {
        f.geometry.coordinates = f.geometry.coordinates.map(ring => smoothPolygonCoords(ring, 3));
      }
    });

    // Static watercolor risk zones: interactive: false ensures NO clicks, NO popups, and clicks pass to map
    state.mapLayers.zones = L.geoJSON(curvedGeojson, {
      interactive: false,
      style: (feature) => {
        const color = feature.properties.color || "#10b981";
        return {
          stroke: false,
          fillColor: color,
          fillOpacity: 0.38,
          smoothFactor: 3.0,
          className: "fluid-water-zone"
        };
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
    state.mapData.pois = await res.json();
    refreshMarkersForZoom();
  } catch (err) {
    console.warn("Could not load POIs:", err);
  }
}

async function loadMapHotspots() {
  try {
    const res = await fetch("/api/safety/hotspots");
    if (!res.ok) return;
    state.mapData.hotspots = await res.json();
    refreshMarkersForZoom();
  } catch (err) {
    console.warn("Could not load map hotspots:", err);
  }
}

// ---- Zoom-aware size tiers ----
// Returns pixel sizes for POI pins and hotspot triangles based on zoom level.
// zoom <=12 → tiny, 13-14 → small, 15-16 → medium, >=17 → large
function getZoomSizes(zoom) {
  if (zoom <= 12) return { pw: 14, ph: 18, pa: [7, 18], pp: [0, -20], tw: 7,  th: 7  };
  if (zoom <= 14) return { pw: 19, ph: 25, pa: [9, 25], pp: [0, -27], tw: 10, th: 10 };
  if (zoom <= 16) return { pw: 26, ph: 34, pa: [13,34], pp: [0, -36], tw: 14, th: 14 };
                  return { pw: 34, ph: 44, pa: [17,44], pp: [0, -46], tw: 19, th: 19 };
}

function buildPoiSvg(poi, w, h) {
  const isPolice   = poi.type === "POLICE";
  const isHospital = poi.type === "HOSPITAL";
  if (isPolice) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 32 42">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 26 16 26S32 26 32 16C32 7.163 24.837 0 16 0z" fill="#1a73e8"/>
      <path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 26 16 26S32 26 32 16C32 7.163 24.837 0 16 0z" fill="none" stroke="#1557b0" stroke-width="1.2"/>
      <path d="M16 7l5.5 2.2v4.8c0 3.2-2.3 6-5.5 6.8-3.2-.8-5.5-3.6-5.5-6.8V9.2L16 7z" fill="white" opacity="0.9"/>
      <rect x="14.8" y="13.5" width="2.4" height="3" rx="0.4" fill="#1a73e8"/>
      <rect x="14" y="12" width="4" height="2" rx="0.4" fill="#1a73e8"/>
    </svg>`;
  } else if (isHospital) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 32 42">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 26 16 26S32 26 32 16C32 7.163 24.837 0 16 0z" fill="#ea4335"/>
      <path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 26 16 26S32 26 32 16C32 7.163 24.837 0 16 0z" fill="none" stroke="#c5221f" stroke-width="1.2"/>
      <rect x="13.5" y="8" width="5" height="16" rx="1.5" fill="white"/>
      <rect x="8" y="13.5" width="16" height="5" rx="1.5" fill="white"/>
    </svg>`;
  } else {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 32 42">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 26 16 26S32 26 32 16C32 7.163 24.837 0 16 0z" fill="#0f9d58"/>
      <path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 26 16 26S32 26 32 16C32 7.163 24.837 0 16 0z" fill="none" stroke="#0b8043" stroke-width="1.2"/>
      <path d="M16 8l5.5 2.2v4.8c0 3.2-2.3 6-5.5 6.8-3.2-.8-5.5-3.6-5.5-6.8V10.2L16 8z" fill="white" opacity="0.9"/>
      <path d="M13 16l2.2 2.2 4.5-4.5" stroke="#0f9d58" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>`;
  }
}

function refreshMarkersForZoom() {
  if (!state.mapInstance) return;
  const zoom = state.mapInstance.getZoom();
  const sz = getZoomSizes(zoom);

  // --- Re-render POI markers ---
  if (state.mapLayers.pois && state.mapLayers.pois.length) {
    state.mapLayers.pois.forEach(m => state.mapInstance.removeLayer(m));
    state.mapLayers.pois = [];
  }
  state.mapData.pois.forEach(poi => {
    const icon = L.divIcon({
      className: "safe-poi-icon",
      html: buildPoiSvg(poi, sz.pw, sz.ph),
      iconSize: [sz.pw, sz.ph],
      iconAnchor: sz.pa,
      popupAnchor: sz.pp
    });
    const m = L.marker([poi.lat, poi.lng], { icon })
      .bindPopup(`<div style="color:#0b0f19;font-family:sans-serif;padding:2px;">
        <b style="font-size:13px;">${poi.name}</b><br/>
        <span style="font-size:12px;color:#475569;">Type: <b>${poi.type}</b> • ETA: <b>${poi.eta_mins} mins</b></span><br/>
        <span style="font-size:11px;color:#0284c7;">Emergency: ${poi.phone}</span>
      </div>`);
    if (state.mapLayers.showPois) m.addTo(state.mapInstance);
    state.mapLayers.pois.push(m);
  });

  // --- Re-render hotspot markers ---
  if (state.mapLayers.hotspots && state.mapLayers.hotspots.length) {
    state.mapLayers.hotspots.forEach(m => state.mapInstance.removeLayer(m));
    state.mapLayers.hotspots = [];
  }
  state.mapData.hotspots.forEach(hs => {
    const color = hs.severity === "CRITICAL" ? "#ef4444" : (hs.severity === "HIGH" ? "#f97316" : "#f59e0b");
    const icon = L.divIcon({
      className: "hotspot-center-icon",
      html: `<div class="hotspot-pin-dot ${hs.severity.toLowerCase()}">
        <svg width="${sz.tw}" height="${sz.th}" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 1L9.33 8.5H0.67L5 1Z" fill="${color}" stroke="rgba(0,0,0,0.35)" stroke-width="0.5"/>
          <rect x="4.4" y="4.2" width="1.2" height="2.4" rx="0.3" fill="white"/>
          <circle cx="5" cy="7.4" r="0.55" fill="white"/>
        </svg>
      </div>`,
      iconSize: [sz.tw, sz.th],
      iconAnchor: [sz.tw / 2, sz.th / 2]
    });
    const popup = `<div style="color:#0b0f19;font-family:sans-serif;padding:4px;min-width:180px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <b style="font-size:12px;color:${color};">⚠️ ${hs.category.replace(/_/g,' ').toUpperCase()}</b>
        <span style="background:${color}22;color:${color};font-size:9px;font-weight:700;padding:1px 5px;border-radius:99px;">${hs.severity}</span>
      </div>
      <p style="font-size:11px;color:#334155;margin:3px 0;">"${hs.headline}"</p>
      <div style="font-size:10px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:3px;margin-top:3px;">
        <span>Reports: <b>${hs.report_count}</b></span> • <span>Upvotes: <b>${hs.upvotes}</b></span><br/>
        <span>Hazard Index: <b>${hs.hazard_score}/100</b></span>
      </div>
    </div>`;
    const m = L.marker([hs.lat, hs.lng], { icon, zIndexOffset: 800 }).bindPopup(popup);
    if (state.mapLayers.showHotspots) m.addTo(state.mapInstance);
    state.mapLayers.hotspots.push(m);
  });
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

// ================= EMERGENCY VERIFICATION & AUDIO INTELLIGENCE =================
function initEmergencyVerification() {
  // Manual SOS Trigger with repeated tap detection
  const sosBtn = document.getElementById("btn-trigger-sos");
  sosBtn?.addEventListener("click", () => {
    const now = Date.now();
    if (now - state.emergencyState.lastTapTime < 2500) {
      state.emergencyState.tapCount += 1;
      state.emergencyState.repeatedSignal = true;
      showToastAlert(`🚨 Repeated SOS Signal Detected (Tap count: ${state.emergencyState.tapCount})! Severity Elevated.`, "danger");
    } else {
      state.emergencyState.tapCount = 1;
      state.emergencyState.repeatedSignal = false;
    }
    state.emergencyState.lastTapTime = now;
    triggerEmergencyWorkflow("manual_sos");
  });

  // Voice Trigger Simulation Chips
  document.querySelectorAll(".voice-chip[data-keyword]").forEach(chip => {
    chip.addEventListener("click", () => {
      const keyword = chip.getAttribute("data-keyword");
      triggerEmergencyWorkflow("keyword_distress", keyword);
    });
  });

  // Speech Recognition Listener Toggle
  document.getElementById("btn-toggle-mic-listen")?.addEventListener("click", () => {
    if (window.SafeAudioEngine) {
      if (window.SafeAudioEngine.isListening) {
        window.SafeAudioEngine.stopSpeechListening();
        showToastAlert("🎙️ Distress Keyword Listener Paused", "info");
      } else {
        window.SafeAudioEngine.startSpeechListening();
        showToastAlert("🎙️ Distress Keyword Listener Active (English & Hindi)", "safe");
      }
    }
  });

  // Initialize Speech Recognition
  if (window.SafeAudioEngine) {
    window.SafeAudioEngine.initSpeechRecognition((detectedKeyword) => {
      triggerEmergencyWorkflow("keyword_distress", detectedKeyword);
    });
  }

  // Clicking 'I Am Safe' strictly opens the 4-digit PIN keypad
  document.getElementById("btn-im-safe")?.addEventListener("click", () => {
    openPinModal();
  });

  document.getElementById("btn-abort-emergency-active")?.addEventListener("click", openPinModal);
}

async function triggerEmergencyWorkflow(source = "manual_sos", keyword = null) {
  state.emergencyState.active = true;
  state.emergencyState.countdownSeconds = 10;
  state.emergencyState.triggerSource = source;
  state.emergencyState.distressKeyword = keyword;

  // Start ambient audio evidence buffer capture immediately
  if (window.SafeAudioEngine) {
    window.SafeAudioEngine.startEvidenceRecording();
  }

  // Update verification UI details
  const triggerTag = document.getElementById("verify-trigger-tag");
  const leadText = document.getElementById("verify-lead-text");
  if (triggerTag) {
    if (source === "keyword_distress") {
      triggerTag.textContent = `Voice Trigger: "${keyword || 'Distress Word'}"`;
    } else if (state.emergencyState.repeatedSignal) {
      triggerTag.textContent = `Repeated Manual SOS (${state.emergencyState.tapCount}x)`;
    } else {
      triggerTag.textContent = "Trigger: Manual SOS";
    }
  }
  if (leadText) {
    leadText.textContent = source === "keyword_distress"
      ? `Distress phrase "${keyword}" recognized by audio engine. Are you safe?`
      : "Emergency SOS activated. Are you safe?";
  }

  try {
    const res = await fetch("/api/emergency/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: state.currentLocation.lat,
        lng: state.currentLocation.lng,
        trigger_source: source,
        distress_keyword: keyword,
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
  state.emergencyState.repeatedSignal = false;
  state.emergencyState.tapCount = 0;

  // Stop evidence recording without escalating
  if (window.SafeAudioEngine) {
    window.SafeAudioEngine.stopEvidenceRecording();
    
    // Turn off Distress Keyword Listener if alarm was triggered mistakenly and cancelled by valid PIN
    window.SafeAudioEngine.stopSpeechListening();
  }

  closePinModal();
  showScreen("screen-home");
  updateStatusPill("Protected", "safe");
  showToastAlert("✅ Alarm Cancelled by PIN: Distress Listener & Recording Deactivated", "safe");
}

async function escalateToActiveEmergency(source) {
  clearInterval(state.emergencyState.countdownInterval);
  closePinModal();

  // Stop recording to finalize audio chunks & blob
  if (window.SafeAudioEngine) {
    window.SafeAudioEngine.stopEvidenceRecording();
  }

  // Small delay to allow MediaRecorder onstop to produce base64
  await new Promise(r => setTimeout(r, 200));

  const audioPayload = window.SafeAudioEngine ? window.SafeAudioEngine.recordedAudioBase64 : null;

  try {
    const res = await fetch("/api/emergency/escalate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        verification_token: state.emergencyState.verificationToken || "tok_timeout",
        lat: state.currentLocation.lat,
        lng: state.currentLocation.lng,
        trigger_source: source,
        distress_keyword: state.emergencyState.distressKeyword,
        repeated_signal: state.emergencyState.repeatedSignal,
        timed_out_without_pin: true,
        user_id: state.currentUser.id,
        audio_base64: audioPayload,
        audio_duration_seconds: 10.0
      })
    });
    const data = await res.json();
    state.emergencyState.incidentId = data.id;

    // Populate Emergency Screen UI
    document.getElementById("emg-inc-id").textContent = `Incident: ${data.id}`;
    document.getElementById("emg-inc-severity").textContent = `${data.severity_level} ${data.severity_score}/100`;
    document.getElementById("emg-coords-stream").textContent = `Broadcasting (${data.lat.toFixed(4)}, ${data.lng.toFixed(4)})`;

    // Render Multi-Factor Severity Breakdown Pills
    const pillsContainer = document.getElementById("emg-breakdown-pills");
    if (pillsContainer && data.severity_breakdown) {
      pillsContainer.innerHTML = `
        <span class="breakdown-pill ${data.severity_breakdown.manual_sos ? 'active' : ''}">Manual SOS: +${data.severity_breakdown.manual_sos}</span>
        <span class="breakdown-pill ${data.severity_breakdown.distress_signal ? 'active' : ''}">Distress Signal: +${data.severity_breakdown.distress_signal}</span>
        <span class="breakdown-pill ${data.severity_breakdown.repeated_signal ? 'active' : ''}">Repeated Signal: +${data.severity_breakdown.repeated_signal}</span>
        <span class="breakdown-pill ${data.severity_breakdown.no_response_timeout ? 'active' : ''}">Timeout / No PIN: +${data.severity_breakdown.no_response_timeout}</span>
        <span class="breakdown-pill ${data.severity_breakdown.zone_factor ? 'active' : ''}">Zone Factor: +${data.severity_breakdown.zone_factor}</span>
      `;
    }

    // Audio status update
    const audioStatusEl = document.getElementById("emg-audio-status");
    if (audioStatusEl) {
      audioStatusEl.textContent = data.audio_captured
        ? "Encrypted ambient audio evidence captured (10s)"
        : "Audio evidence stream buffered";
    }

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

  // Check against the user's own login PIN stored in localStorage
  const userData = getStoredUser();
  const savedPin = userData?.pin || "";

  if (enteredPin === savedPin) {
    cancelEmergencyCountdown("PIN verified");
  } else {
    if (errorMsg) errorMsg.textContent = "Incorrect PIN. Try again.";
    enteredPin = "";
    updatePinDots();
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
  if (state.mapLayers.navVehicleMarker) {
    state.mapInstance.removeLayer(state.mapLayers.navVehicleMarker);
    state.mapLayers.navVehicleMarker = null;
  }
}

// Compute bearing angle between two lat/lng coordinates in degrees
function calculateHeading(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

function updateNavVehicleMarker(lat, lng, heading = 0) {
  if (!state.mapInstance) return;
  const latlng = [lat, lng];

  if (state.mapLayers.navVehicleMarker) {
    state.mapLayers.navVehicleMarker.setLatLng(latlng);
    const wrap = document.getElementById("nav-vehicle-arrow-wrap");
    if (wrap) {
      wrap.style.transform = `rotate(${heading}deg)`;
    }
  } else {
    const vehicleIcon = L.divIcon({
      className: "nav-vehicle-marker-custom",
      html: `
        <div class="nav-vehicle-arrow-wrap" id="nav-vehicle-arrow-wrap" style="transform: rotate(${heading}deg);">
          <div class="nav-vehicle-pulse"></div>
          <div class="nav-vehicle-chevron">
            <svg viewBox="0 0 24 24">
              <path d="M12 2L4 20l8-4 8 4L12 2z"/>
            </svg>
          </div>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });
    state.mapLayers.navVehicleMarker = L.marker(latlng, { 
      icon: vehicleIcon, 
      zIndexOffset: 1500 
    }).addTo(state.mapInstance);
  }
}

function previewRouteOnMap(routeType) {
  if (!state.journeyState.data) return;
  const route = routeType === "SAFER" ? state.journeyState.data.safer_route : state.journeyState.data.fastest_route;

  showScreen("screen-map");
  setTimeout(() => {
    initOrResizeMap();
    clearRoutePolylines();

    // Google Maps double-layer route rendering: Dark contrast outer casing + glowing colored core
    const casingPolyline = L.polyline(route.waypoints, {
      color: "#0b0f19",
      weight: 10,
      opacity: 0.9,
      lineCap: "round",
      lineJoin: "round",
      className: "route-polyline-casing"
    }).addTo(state.mapInstance);

    const activePolyline = L.polyline(route.waypoints, {
      color: route.color || (routeType === "SAFER" ? "#10B981" : "#F97316"),
      weight: 6,
      opacity: 1,
      lineCap: "round",
      lineJoin: "round",
      className: routeType === "SAFER" ? "route-polyline-safe-glow" : "route-polyline-fastest"
    }).addTo(state.mapInstance);

    state.mapLayers.routePolylines.push(casingPolyline);
    state.mapLayers.routePolylines.push(activePolyline);

    // Smooth camera pan to fit entire route
    state.mapInstance.flyToBounds(activePolyline.getBounds(), { 
      padding: [45, 45], 
      maxZoom: 16,
      animate: true, 
      duration: 1.0 
    });

    showToastAlert(`Showing ${routeType === "SAFER" ? "⭐ Recommended Safe" : "⚡ Fastest"} Route along road network`, "info");
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

    const waypoints = route.waypoints;
    const initialPt = waypoints[0];
    const nextPt = waypoints.length > 1 ? waypoints[1] : waypoints[0];
    const initialHeading = calculateHeading(initialPt[0], initialPt[1], nextPt[0], nextPt[1]);

    // Outer casing for sharp road-contrast
    const casingPolyline = L.polyline(waypoints, {
      color: "#0b0f19",
      weight: 10,
      opacity: 0.9,
      lineCap: "round",
      lineJoin: "round",
      className: "route-polyline-casing"
    }).addTo(state.mapInstance);

    // Vibrant path ahead (will be trimmed dynamically as user travels)
    const activePolyline = L.polyline(waypoints, {
      color: route.color || (routeType === "SAFER" ? "#10B981" : "#F97316"),
      weight: 6,
      opacity: 1,
      lineCap: "round",
      lineJoin: "round",
      className: routeType === "SAFER" ? "route-polyline-safe-glow" : "route-polyline-fastest"
    }).addTo(state.mapInstance);

    state.mapLayers.routePolylines.push(casingPolyline);
    state.mapLayers.routePolylines.push(activePolyline);

    // Hide standard static circle and show Google Maps directional vehicle chevron
    if (state.mapLayers.userMarker) {
      state.mapInstance.removeLayer(state.mapLayers.userMarker);
      state.mapLayers.userMarker = null;
    }
    updateNavVehicleMarker(initialPt[0], initialPt[1], initialHeading);

    // Initial camera focus on starting road segment
    state.mapInstance.setView([initialPt[0], initialPt[1]], 16, { animate: true });

    // Populate HUD
    const hud = document.getElementById("map-nav-hud");
    const hudScore = document.getElementById("hud-score-badge");
    const hudEta = document.getElementById("hud-eta-text");
    const hudDistRemain = document.getElementById("hud-dist-remain");
    const hudFill = document.getElementById("hud-progress-fill");
    const hudDistToTurn = document.getElementById("hud-dist-to-turn");
    const hudInstruction = document.getElementById("hud-instruction-text");
    const hudTurnWrap = document.getElementById("hud-turn-icon-wrap");

    if (hud) hud.style.display = "flex";
    if (hudScore) {
      hudScore.textContent = `Score ${route.safety_score}`;
      hudScore.className = `hud-score-pill ${route.safety_score >= 80 ? 'safe' : 'danger'}`;
    }

    const steps = route.steps || [];
    function renderStepManeuver(stepIdx) {
      const step = steps[stepIdx] || steps[0] || { instruction: `Follow ${route.name}`, distance: "300m", maneuver: "straight" };
      if (hudDistToTurn) hudDistToTurn.textContent = step.distance;
      if (hudInstruction) hudInstruction.textContent = step.instruction;
      if (hudTurnWrap) {
        hudTurnWrap.className = `hud-maneuver-icon-wrap ${step.maneuver || 'straight'}`;
      }
    }

    renderStepManeuver(0);
    if (hudEta) hudEta.textContent = `${route.duration_mins} mins`;
    if (hudDistRemain) hudDistRemain.textContent = `${route.distance_km} km remaining`;
    if (hudFill) hudFill.style.width = "4%";

    // Re-center button action
    const recenterBtn = document.getElementById("btn-nav-recenter");
    if (recenterBtn) {
      recenterBtn.onclick = () => {
        const curIdx = state.journeyState.currentWaypointIndex;
        const curPt = waypoints[curIdx] || waypoints[0];
        state.mapInstance.panTo([curPt[0], curPt[1]], { animate: true, duration: 0.5 });
      };
    }

    updateStatusPill(routeType === "SAFER" ? "Safe Navigation Active" : "Navigating (Monitored)", "safe");
    showToastAlert(`🚀 Navigation Started along ${route.name}`, "safe");

    clearInterval(state.journeyState.navInterval);

    // Live Step-by-Step Traversal with Real-Time Path Trimming
    state.journeyState.navInterval = setInterval(() => {
      state.journeyState.currentWaypointIndex++;
      const curIdx = state.journeyState.currentWaypointIndex;

      if (curIdx < waypoints.length) {
        const pt = waypoints[curIdx];
        const nextPtAhead = curIdx + 1 < waypoints.length ? waypoints[curIdx + 1] : pt;
        const heading = calculateHeading(pt[0], pt[1], nextPtAhead[0], nextPtAhead[1]);

        state.currentLocation.lat = pt[0];
        state.currentLocation.lng = pt[1];

        // 1. Move vehicle marker & rotate heading
        updateNavVehicleMarker(pt[0], pt[1], heading);
        updateSafetyScore(pt[0], pt[1]);

        // 2. REAL-TIME PATH TRIMMING: Traversed path behind is removed, only path ahead remains!
        const remainingWaypoints = waypoints.slice(curIdx);
        casingPolyline.setLatLngs(remainingWaypoints);
        activePolyline.setLatLngs(remainingWaypoints);

        // 3. Smooth camera follow along road
        if (state.mapInstance) {
          state.mapInstance.panTo([pt[0], pt[1]], { animate: true, duration: 0.6 });
        }

        // 4. Update HUD Progress & Turn Maneuver
        const pct = Math.round(((curIdx + 1) / waypoints.length) * 100);
        if (hudFill) hudFill.style.width = `${pct}%`;
        const minsLeft = Math.max(1, Math.round(route.duration_mins * (1 - pct / 100)));
        const kmLeft = (route.distance_km * (1 - pct / 100)).toFixed(1);
        if (hudEta) hudEta.textContent = `${minsLeft} mins`;
        if (hudDistRemain) hudDistRemain.textContent = `${kmLeft} km remaining`;

        // Update step maneuver instruction corresponding to progression
        const stepIdx = Math.min(steps.length - 1, Math.floor((curIdx / waypoints.length) * steps.length));
        renderStepManeuver(stepIdx);

      } else {
        clearInterval(state.journeyState.navInterval);
        
        // Remove remaining route polylines upon safe arrival
        casingPolyline.setLatLngs([]);
        activePolyline.setLatLngs([]);

        if (hudDistToTurn) hudDistToTurn.textContent = "0 m";
        if (hudInstruction) hudInstruction.textContent = "You have arrived safely at your destination!";
        if (hudTurnWrap) hudTurnWrap.className = "hud-maneuver-icon-wrap arrive";
        if (hudEta) hudEta.textContent = "Arrived";
        if (hudDistRemain) hudDistRemain.textContent = "Safe Destination Reached";
        if (hudFill) hudFill.style.width = "100%";

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
  updateUserMarkerOnMap();
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

  // Load from localStorage — the user's own guardians
  const userData = getStoredUser();
  const guardians = userData?.guardians || [];

  if (countBadge) countBadge.textContent = `${guardians.length} Active`;

  if (guardians.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:20px 12px;">
      <div style="font-size:2rem;margin-bottom:8px;">👥</div>
      <p style="color:var(--text-dim);font-size:0.85rem;line-height:1.5;">No emergency contacts yet.<br/>Add a guardian to enable SOS alerts.</p>
    </div>`;
    return;
  }

  container.innerHTML = guardians.map((g, idx) => `
    <div class="guardian-item ${idx === 0 ? 'primary-card' : ''}" id="guardian-card-${g.id}">
      <div class="g-info">
        <div class="g-header-row">
          <span class="g-name">${g.name}</span>
          ${idx === 0 ? '<span class="primary-pill">⭐ Primary</span>' : ''}
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
        <button class="g-action-btn delete" onclick="handleDeleteGuardian('${g.id}')">✕</button>
      </div>
    </div>
  `).join("");
}

async function handleCreateGuardian(e) {
  e.preventDefault();
  const name = document.getElementById("g-input-name").value.trim();
  const phone = document.getElementById("g-input-phone").value.trim();
  const relationship = document.getElementById("g-input-rel").value;

  if (!name || !phone) return;

  // Save to localStorage
  const userData = getStoredUser();
  if (!userData) return;
  if (!userData.guardians) userData.guardians = [];

  const newGuardian = { id: "g_" + Date.now(), name, phone, relationship };
  userData.guardians.push(newGuardian);
  saveUser(userData);

  // Sync to backend silently
  fetch("/api/guardians", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: state.currentUser.id, name, phone, relationship, is_primary: userData.guardians.length === 1 })
  }).catch(() => {});

  // Reset form UI
  document.getElementById("form-add-guardian").reset();
  document.getElementById("form-add-guardian").style.display = "none";
  const toggleBtn = document.getElementById("btn-toggle-add-guardian");
  if (toggleBtn) toggleBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    <span>Add New Contact</span>
  `;

  loadGuardiansList();
  applySession(userData); // refresh SOS guardian status
  showToastAlert(`✅ Added ${name} (${relationship}) as Emergency Guardian`, "safe");
}

async function handleDeleteGuardian(id) {
  const userData = getStoredUser();
  if (!userData) return;
  userData.guardians = (userData.guardians || []).filter(g => g.id !== id);
  saveUser(userData);
  loadGuardiansList();
  applySession(userData);
  showToastAlert("Guardian removed from emergency list", "info");
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

