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

## 📱 7 Core Screens
1. **Login & Security PIN**: Quick onboarding and 4-digit emergency abort PIN configuration.
2. **Home Dashboard**: Live GPS status, dynamic safety score badge, manual/automatic Safety Mode toggle.
3. **Smart Safety Map**: Leaflet.js + OpenStreetMap with color-coded risk zones (🟢 Low, 🟡 Moderate, 🟠 High, 🔴 Critical), POIs (Police, Hospitals), and user beacon.
4. **Safe Journey**: Multi-criteria routing comparing **Fastest Route** vs **Safer Route ⭐**.
5. **Emergency Verification**: 10-second countdown alert (*"Are you safe?"*) with PIN keypad abort.
6. **Emergency Mode (Active)**: Live status checklist (Guardian notified ✓, Location shared ✓, 112 dispatched ✓, Audio evidence recording 🎙️).
7. **Safety Intelligence**: Complaint submission, NLP categorization, and emerging safety hotspot feed.

---

## 🛠️ Technology Stack
- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6+), Leaflet.js, OpenStreetMap
- **Backend**: Python 3.10+, FastAPI, Uvicorn
- **Database**: SQLite (SQLAlchemy / JSON storage)
- **AI / NLP**: Text categorization, keyword similarity matching, and spatial clustering
- **Audio / Media**: Web Speech API & MediaStream Recording

---

## 🚀 Quickstart & Setup

```bash
# 1. Clone repository & install dependencies
pip install -r requirements.txt

# 2. Start FastAPI Backend & Frontend Server
uvicorn backend.main:app --reload --port 8000

# 3. Open SafeSteps in your browser
# Navigate to: http://localhost:8000
```

---

## 🌿 6-Stage Git Workflow
Development strictly follows the 6 controlled branches:
`foundation` ➔ `enhance` ➔ `intelligence` ➔ `safety` ➔ `polish` ➔ `final`

For full details, see [githubworkflow.md](file:///c:/Users/vijay/OneDrive/Documents/Git/SIH%202026/githubworkflow.md) and the [context/](file:///c:/Users/vijay/OneDrive/Documents/Git/SIH%202026/context/) directory.
