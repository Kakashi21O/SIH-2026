# 🛡️ SafeSteps

> Current status: working hackathon prototype with a static web frontend, FastAPI API, SQLite storage, and simulated emergency dispatch flows.

## What it does

SafeSteps helps a user check area risk, compare safer routes, report hazards, manage emergency guardians, and test an automated SOS flow. The prototype can detect distress keywords, show an emergency verification countdown, calculate severity, create an incident record, and provide an AI safety assistant.

The app is a demonstration system: guardian alerts, 112 dispatch, live tracking, and audio evidence are simulated locally and are not a replacement for emergency services.

## Main screens

Authentication, Home Dashboard, Live Risk Map, Safe Journey, Emergency Verification, Emergency Mode, Safety Intelligence, and Settings.

## Run locally

```bash
pip install -r requirements.txt
python -m uvicorn backend.main:app --reload --port 8000
```

Open `http://localhost:8000`. Run the API checks with `python -m pytest -q`.

For the short presentation flow, see [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md). For implementation details, see [`PROJECT_TECHNICAL_DOCUMENTATION.md`](PROJECT_TECHNICAL_DOCUMENTATION.md).

## Important configuration

Copy `.env.example` to `.env` and provide Google OAuth and OpenRouter values only when those integrations are needed. The default demo PIN is `1234`; change it for any non-demo use.

---

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
               │   (8 Reactive Screens) │
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

## 📱 Website Areas
1. **Login & Security PIN**: Quick onboarding and 4-digit emergency abort PIN configuration (Default demo PIN: `1234`).
2. **Home Dashboard**: Live GPS status, dynamic situational safety score badge (0-100), and auto Safety Mode indicator.
3. **Smart Safety Map**: Leaflet.js + CartoDB Dark Matter tiles with organic risk zones (🟢 Low, 🟡 Moderate, 🟠 High, 🔴 Critical), POIs (Police Stations, Safe Havens), and real-time crowd hazard radar.
4. **Safe Journey**: Multi-criteria routing comparing **Fastest Route** vs **Safer Route ⭐** (with risk penalties, lighting indicators, and waypoint tracking).
5. **Emergency Verification**: 10-second loud countdown alert (*"Are you safe?"*) with PIN keypad abort to prevent false alarms.
6. **Emergency Mode (Active)**: Live status checklist (Guardian SMS alert ✓, 112 CAD simulation ✓, Ambient audio evidence recording 🎙️ with in-app playback).
7. **Safety Intelligence**: Real-time complaint submission with AI NLP classification, duplicate detection, and dynamic spatial clustering.
8. **🤖 SafeSteps AI Safety Assistant**: Grounded conversational safety guide available across all screens with emergency auto-routing.

The current prototype is a browser-based demo. Emergency dispatch, guardian alerts, GPS data, and audio evidence are simulated or locally stored for demonstration; connect verified production services before real-world use.

## 🤖 Optional AI Coding Workflows

- [beautiful-ui](https://github.com/Kainiko943/beautiful-ui) can guide the agent to plan a visual direction, reuse the existing design system, cover responsive/accessibility states, and verify the rendered UI. Use it for frontend redesigns; it is not a website runtime dependency.
- [ponytail](https://github.com/DietrichGebert/ponytail) can guide an agent to reuse existing code, prefer native browser features, and avoid unnecessary dependencies. Use it during implementation/review; keep validation, security, privacy, and accessibility checks.

Example request: `Review SafeSteps with beautiful-ui and ponytail. Preserve the current workflow, improve only the necessary UI, cover mobile/loading/error states, and report tests before changing code.`

---

## 🎙️ Voice Distress Detection V2 Architecture

SafeSteps features a multi-layer client-side audio intelligence and evidence recording engine (`SafeAudioEngine` in `frontend/audio.js`).

```text
              MICROPHONE
                  ↓
          Audio Preprocessing (Echo Cancellation, Noise Suppression, AGC)
                  ↓
       ┌──────────┴──────────┐
       ↓                     ↓
 Speech Recognition      Audio Analysis (Web Audio API)
       ↓                     ↓
 Fuzzy Keyword Match    VAD / Noise Floor / Vocal Intensity
       └──────────┬──────────┘
                  ↓
          Confidence Engine (Multi-Signal Scoring: 0-100)
                  ↓
       Distress Confirmation (Score ≥ 70 / HIGH / CRITICAL)
                  ↓
          10-Second Verification Flow & Debounced Escalation
```

### Key Technical Capabilities:
- **Microphone Quality & Constraints**: Requests native audio stream with `echoCancellation: true`, `noiseSuppression: true`, and `autoGainControl: true`, tracking hardware permission and availability states (`'granted'`, `'denied'`, `'unavailable'`).
- **Adaptive Gain Normalization**: Uses Web Audio API `DynamicsCompressorNode` and adaptive gain to amplify weak microphone inputs (up to 2.5x) while preventing clipping on sudden loud signals.
- **Voice Activity (VAD) & Noise Analysis**: Local RMS calculation and dynamic noise floor tracking distinguish background noise from active speech and high vocal intensity screams.
- **Fuzzy Distress Keyword Matching**: 14+ bilingual English and Hindi triggers (`"help"`, `"bachao"`, `"stop"`, `"chhod mujhe"`, `"police"`, etc.) with text normalization and Levenshtein typo tolerance (`"hep"` → `"help"`, `"bachaaao"` → `"bachao"`).
- **Multi-Signal Confidence Engine**: Combines keyword match (+50), repeated distress (+20), multiple keywords (+20), voice activity (+10), and vocal intensity (+15). Benign conversational mentions (e.g., *"help me understand this"*, *"stop the video"*, *"police station"*) are heavily down-ranked to prevent false triggers.
- **Speech Recognition Fallback**: Resilient `SpeechRecognition` / `webkitSpeechRecognition` listener with bounded exponential backoff (max 5 restarts in 15s) and automatic fallback to local audio VAD analysis.
- **Verification Hardening**: 10-second countdown alert debounces duplicate events and includes a 3-second cooldown window to prevent duplicate intervals.
- **Emergency Audio Evidence Recording**: Captures ambient sound via `MediaRecorder` using runtime format detection (`MediaRecorder.isTypeSupported` across WebM/Opus, MP4, AAC, WAV). Encoded to Base64 and stored in SQLite `incidents` table for verified guardian and 112 CAD review.
- **Privacy & Security**: Zero continuous audio streaming or uploading during idle listening. If user enters their PIN within the 10-second window, the temporary audio buffer is dropped immediately from browser memory.
- **Capability Matrix**: Runtime degradation across 4 tiers (`FULL_SUPPORT`, `AUDIO_ONLY`, `LIMITED_AUDIO`, `MANUAL_SOS_ONLY`) ensuring zero application crashes on any device.

---

## 🛠️ Technology Stack
- **Frontend**: Zero-build Vanilla HTML5, CSS3, ES6+, Leaflet.js 1.9.4
- **Backend**: Python 3.10+, FastAPI, Uvicorn, Pydantic v2
- **Database**: SQLite with auto-initializing schema and pre-seeded demo datasets
- **AI / NLP**: In-memory TF-IDF + lexicon semantic classifier (`backend/services/complaint_ai.py`)
- **Audio / Media**: Continuous Web Speech API distress detection & MediaStream audio evidence buffering (`frontend/audio.js`)
- **Testing**: Automated `pytest` suite and Node.js voice detection test suite (`tests/test_voice_distress_v2.js`)

---

## 🚀 Quickstart & Running Tests

```bash
# 1. Clone repository & install dependencies
pip install -r requirements.txt

# 2. Run automated regression test suite
python -m pytest -v tests/test_backend_api.py

# 3. Start FastAPI Backend and static frontend
python -m uvicorn backend.main:app --reload --port 8000

# 4. Open http://localhost:8000 in your browser
```

---

## ⏱️ 2-Minute Hackathon Demo
Follow our structured, step-by-step judge demonstration guide in **`DEMO_SCRIPT.md`** to present the end-to-end prototype in under 120 seconds!

---

## 🌿 6-Stage Git Workflow
Development strictly follows the 6 controlled branches:
`foundation` ➔ `enhance` ➔ `intelligence` ➔ `safety` ➔ `polish` ➔ `final`

For full architectural details and context documentation, see `githubworkflow.md` and the `context/` directory. The project is currently a SIH/InnoHack prototype, not a production emergency service.

