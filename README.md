# 🛡️ SafeSteps

> **AI-Powered Smart Women Safety & Automated Emergency Response System**  
> *Theme: Smart Automation | Team: GeoGuardians | SIH / InnoHack 2026 Prototype*

---

## 💡 The Philosophy: *"From Reactive SOS to Proactive Safety Automation"*
Traditional safety apps force a woman in distress to manually reach for her phone, unlock it, and press a panic button. If she is running, restrained, or terrified, this fails.

**SafeSteps creates an automated safety envelope:**
1. **Detect**: Identifies high-risk zones and automatically activates Safety Mode.
2. **Verify**: Listens for distress signals and triggers an immediate 10-second verification window with PIN abort.
3. **Decide**: Evaluates contextual severity (location risk + distress signals + silence).
4. **Protect**: Automatically notifies guardians, shares live coordinates, records emergency audio evidence, and initiates the 112 emergency workflow.
5. **Learn**: Analyzes community complaints using NLP to detect emerging safety hotspots and dynamically update risk scores.

---

## 🏛️ System Architecture

```text
               ┌────────────────────────┐
               │   SafeSteps Web App    │
               │   (7 Reactive Screens) │
               └───────────┬────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  GPS & Risk  │   │ NLP Complaint│   │   Distress   │
│    Engine    │   │  Hotspot Hub │   │  Detection   │
└───────┬──────┘   └──────┬───────┘   └──────┬───────┘
        ▼                 ▼                  ▼
  Safety Score       Hotspots &       10s Verification
   (0-100 🟢🔴)      Risk Map Update     & PIN Abort
        ▼                                    ▼
 Auto Safety Mode                     Severity Engine
                                             ▼
                                     ┌───────┴───────┐
                                     ▼               ▼
                                 Guardians     112 Dispatch
                                 (SMS/Alert)    (Simulation)
                                     ▼               ▼
                                 Live Location & Audio Evidence
                                             ▼
                                  Automated Incident Report
```

---

## 📱 7 Core Screens + SafeSteps AI Assistant
1. **Login & Security PIN**: Quick onboarding and 4-digit emergency abort PIN configuration (Default demo PIN: `1234`).
2. **Home Dashboard**: Live GPS status, dynamic situational safety score badge (0-100), and auto Safety Mode indicator.
3. **Smart Safety Map**: Leaflet.js + CartoDB Dark Matter tiles with organic risk zones (🟢 Low, 🟡 Moderate, 🟠 High, 🔴 Critical), POIs (Police Stations, Safe Havens), and real-time crowd hazard radar.
4. **Safe Journey**: Multi-criteria routing comparing **Fastest Route** vs **Safer Route ⭐** (with risk penalties, lighting indicators, and waypoint tracking).
5. **Emergency Verification**: 10-second loud countdown alert (*"Are you safe?"*) with PIN keypad abort to prevent false alarms.
6. **Emergency Mode (Active)**: Live status checklist (Guardian SMS alert ✓, 112 CAD simulation ✓, Ambient audio evidence recording 🎙️ with in-app playback).
7. **Safety Intelligence**: Real-time complaint submission with AI NLP classification, duplicate detection, and dynamic spatial clustering.
8. **🤖 SafeSteps AI Safety Assistant**: Grounded conversational safety guide available across all screens with emergency auto-routing.

---

## 🛠️ Technology Stack
- **Frontend**: Zero-build Vanilla HTML5, CSS3, ES6+, Leaflet.js 1.9.4
- **Backend**: Python 3.10+, FastAPI, Uvicorn, Pydantic v2
- **Database**: SQLite with auto-initializing schema and pre-seeded demo datasets
- **AI / NLP**: In-memory TF-IDF + lexicon semantic classifier (`backend/services/complaint_ai.py`)
- **Audio / Media**: Continuous Web Speech API distress detection & MediaStream audio evidence buffering
- **Testing**: Automated `pytest` suite with `httpx` TestClient

---

## 🚀 Quickstart & Running Tests

```bash
# 1. Clone repository & install dependencies
pip install -r requirements.txt

# 2. Run automated regression test suite (7/7 tests)
python -m pytest -v tests/test_backend_api.py

# 3. Start FastAPI Backend & Static Server
python -m uvicorn backend.main:app --reload --port 8000

# 4. Open SafeSteps in your browser
# Navigate to: http://localhost:8000
```

---

## ⏱️ 2-Minute Hackathon Demo
Follow our structured, step-by-step judge demonstration guide in **`DEMO_SCRIPT.md`** to present the end-to-end prototype in under 120 seconds!

---

## 🌿 6-Stage Git Workflow
Development strictly follows the 6 controlled branches:
`foundation` ➔ `enhance` ➔ `intelligence` ➔ `safety` ➔ `polish` ➔ `final`

For full architectural details and context documentation, see `githubworkflow.md` and the `context/` directory.

