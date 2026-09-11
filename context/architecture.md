# Architecture Context — SafeSteps

## 1. Technology Stack

| Layer | Technology | Role |
| --- | --- | --- |
| **Frontend UI** | HTML5, Modern CSS3, Vanilla JS (ES6+) | Lightweight, zero-build, ultra-fast 7-screen responsive interface |
| **Map Engine** | Leaflet.js (v1.9+) + OpenStreetMap tiles | Real-time map rendering, custom colored risk polygon overlays, GPS tracking |
| **Backend API** | Python 3.10+ & FastAPI (Uvicorn) | RESTful API endpoints, state orchestrator, business logic |
| **Database** | SQLite + SQLite JSON extensions | Embedded lightweight relational database for rapid hackathon execution |
| **AI / NLP Engine** | Python `scikit-learn` / `nltk` / regex + fuzzy matching | Complaint classification, similarity scoring, spatial hotspot clustering |
| **Audio Interface** | Web Audio API / MediaStream Recording | Visible emergency evidence capture & Web Speech API distress trigger |

---

## 2. System Architecture & Boundaries

```text
                  ┌──────────────────────────────────────────────┐
                  │          SAFESTEPS FRONTEND (SPA)           │
                  │   HTML5 / CSS3 / Vanilla JS / Leaflet.js     │
                  └──────────────────────┬───────────────────────┘
                                         │ REST API / JSON
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │             FASTAPI BACKEND CORE             │
                  │  main.py | config.py | database/database.py  │
                  └────────┬─────────────┬─────────────┬─────────┘
                           │             │             │
        ┌──────────────────┴──┐    ┌─────┴──────┐   ┌──┴──────────────────┐
        ▼                     ▼    ▼            ▼   ▼                     ▼
┌───────────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────────────┐
│  Risk Engine  │ │  Emergency   │ │Complaint AI  │ │ Notification Svc  │
│  & Geofencing │ │  Orchestrator│ │& Hotspot Hub │ │ (Guardian / 112)  │
└───────┬───────┘ └───────┬──────┘ └──────┬───────┘ └─────────┬─────────┘
        │                 │               │                   │
        └─────────────────┼───────────────┼───────────────────┘
                          ▼               ▼
                  ┌──────────────────────────────┐
                  │    SQLITE LOCAL DATABASE     │
                  │   data/safesteps.db & JSON   │
                  └──────────────────────────────┘
```

### Directory Structure & Responsibilities
```text
SafeSteps/
├── backend/
│   ├── main.py                  # FastAPI app factory, CORS, static mounting
│   ├── config.py                # Environment configurations & defaults
│   ├── database/
│   │   └── database.py          # SQLite connection, schema migrations, seed loader
│   ├── models/
│   │   ├── user.py              # User & Guardian schemas
│   │   ├── risk_zone.py         # GeoJSON risk polygon & safety score models
│   │   ├── complaint.py         # Complaint input & classification models
│   │   └── incident.py          # Emergency event & incident report models
│   ├── routes/
│   │   ├── auth.py              # Register, login, PIN verification
│   │   ├── location.py          # GPS ping, geofencing, route comparison
│   │   ├── safety.py            # Safety score query, Safety Mode toggle
│   │   ├── emergency.py         # Distress event, countdown trigger, PIN abort, 112
│   │   ├── complaints.py        # Submit complaint, list hotspots, AI analysis
│   │   └── guardians.py         # Guardian CRUD & test dispatch
│   └── services/
│       ├── risk_engine.py       # Score computation (0-100) & risk zone evaluation
│       ├── emergency_engine.py  # 10s state machine, severity engine, incident generator
│       ├── complaint_ai.py      # NLP categorizer, TF-IDF / keyword similarity
│       ├── notification.py      # Guardian SMS/Alert adapter & 112 simulation adapter
│       └── location_service.py  # Coordinate distance calculations & route safety rank
├── frontend/
│   ├── index.html               # Multi-screen SPA shell (7 interactive screens)
│   ├── style.css                # Professional dark-safety theme styling
│   ├── app.js                   # Application state manager & screen router
│   ├── map.js                   # Leaflet map manager, layers, live markers
│   └── audio.js                 # Distress simulation & emergency audio recorder
├── data/
│   ├── risk_zones.json          # Seed geo-zones (Low, Moderate, High, Critical)
│   ├── complaints.json          # Seed complaints for NLP hotspot demo
│   └── demo_incidents.json      # Sample historical incident reports
├── githubworkflow.md            # 6-part branch progression guide
└── README.md                    # Setup, run commands, and SIH demo walkthrough
```

---

## 3. Storage Model (SQLite)

- **`users`**: `id`, `name`, `phone`, `pin_hash`, `created_at`
- **`guardians`**: `id`, `user_id`, `name`, `phone`, `relationship`, `is_primary`
- **`risk_zones`**: `id`, `name`, `risk_level` (LOW, MODERATE, HIGH, CRITICAL), `base_score`, `polygon_geojson`, `crime_count`, `active_reports`
- **`complaints`**: `id`, `user_id`, `text`, `category`, `lat`, `lng`, `severity`, `cluster_id`, `created_at`
- **`safety_hotspots`**: `id`, `location_name`, `lat`, `lng`, `report_count`, `primary_issue`, `risk_increase`, `trend`
- **`incidents`**: `id`, `user_id`, `lat`, `lng`, `trigger_source`, `severity_score`, `severity_level`, `guardian_notified`, `emergency_dispatched`, `audio_captured`, `status`, `created_at`
- **`journeys`**: `id`, `user_id`, `origin_name`, `dest_name`, `selected_route_type`, `status`, `created_at`

---

## 4. Auth, Access & Privacy Model
1. **User Identity & PIN**: Simple auth based on phone + hashed 4-digit emergency PIN. PIN is strictly required to abort triggered emergency countdowns.
2. **Data Minimization & Geolocation Privacy**: GPS coordinates are tracked locally on device. Coordinates are persisted to server only when Safety Mode is active or during a Journey.
3. **Emergency-Only Audio Capture**: Microphone access is never continuously recorded. Emergency recording buffer only engages when severity escalates past verification. Visual indicator is mandatory.

---

## 5. Architectural Invariants
1. **Never Block on AI**: Complaint NLP processing and hotspot clustering must execute asynchronously or sub-50ms so as not to block location updates or emergency calls.
2. **Deterministic Emergency Fallback**: If backend is temporarily unreachable, frontend maintains local 10s countdown timer and stores incident locally for sync.
3. **Decoupled External Adapters**: Emergency 112 dispatch and SMS gateways must sit behind abstract adapters (`NotificationService`) so real APIs can replace mocks seamlessly.
4. **Clean Stateless APIs**: FastAPI routes communicate standard JSON payloads and handle errors with structured HTTP error codes (400, 404, 422, 500).
