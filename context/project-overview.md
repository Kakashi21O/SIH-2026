# Project Overview — SafeSteps

## 1. Product Summary
**SafeSteps** is an AI-powered smart women safety and automated emergency response system designed for women travelling alone. Unlike conventional reactive SOS applications, SafeSteps provides **proactive safety automation**: continuously evaluating environmental risk, auto-activating Safety Mode in high-risk zones, detecting distress signals, running a 10-second false-alarm verification check, auto-escalating severity to guardians and 112 emergency workflows, and aggregating crowd complaints via NLP to detect emerging safety hotspots.

- **Team**: GeoGuardians
- **Theme**: Smart Automation
- **Core Motto**: *Detect → Verify → Decide → Protect → Learn*
- **USP**: *"From Reactive SOS to Proactive Safety Automation"*

---

## 2. Core Problem & Solution
- **Problem**: In sudden danger (stalking, harassment, physical restraint), a woman may be frightened or unable to manually unlock her phone and press SOS. Authorities also lack aggregated intelligence on emerging unsafe spots.
- **Solution**:
  1. **Individual Safety**: Automated safety layer (GPS risk assessment → auto Safety Mode → distress detection → 10s PIN/Safe verification → severity calculation → guardian notification + location sharing + audio evidence + 112 workflow).
  2. **Community Safety Intelligence**: Complaints + incident data processed via NLP/clustering to generate dynamic risk maps and hotspot alerts.

---

## 3. Core User Flows

### Flow A: Automated Journey & Risk Monitoring
1. User sets destination (e.g., College → Home).
2. System computes **Fastest Route** vs **Safer Route ⭐** (balancing distance + safety score).
3. If user enters a high-risk zone (Score < 40/100 🔴), **Safety Mode activates automatically** (user can override with confirmation).
4. Safety monitoring listens for configured distress keywords (e.g., "Help", "Bachao", "Madad") or manual triggers.

### Flow B: Emergency Escalation & Verification
1. Potential distress detected → 10-second countdown with visual/audio alert ("Are you safe?").
2. **If Safe / PIN entered**: Emergency cancelled (false alarm prevented).
3. **If No Response**: Severity Engine calculates risk score (Zone + Distress + Silence) → escalates:
   - **Low**: Advisory log.
   - **Medium**: Guardian alert.
   - **High/Critical**: Guardian alert + live location stream + emergency audio capture + 112 dispatch workflow simulation + auto Incident Report generation.

### Flow C: Complaint & Safety Intelligence Loop
1. User logs complaint (e.g., "Very dark near bus stop, no streetlights").
2. AI NLP categorizes (e.g., `Infrastructure / Poor Lighting`), groups similar reports, identifies emerging hotspot clusters, and adjusts future area risk scores.

---

## 4. Key Feature Modules
1. **Smart Risk Map & Safety Score**: Dynamic 0–100 score (🟢 Low, 🟡 Moderate, 🟠 High, 🔴 Critical) based on demo crime stats, complaint density, time of day, and infrastructure proximity.
2. **Safe Journey & Route Recommendation**: Multi-criteria routing comparing travel time and safety metrics.
3. **Automated Safety Mode & Distress Detection**: Background geofence/risk trigger + keyword audio detection (simulated trigger + Web Speech API).
4. **10-Second Verification & Safety PIN**: Rapid fallback to prevent false police alarms.
5. **Severity Engine & Automated Emergency Orchestrator**: Rule-based weighted scoring engine determining automated escalation.
6. **Guardian Notification & Emergency Location Sharing**: Temporary live coordinate broadcast and status dashboard for emergency contacts.
7. **Emergency Audio Evidence**: Visible active recording only triggered during confirmed emergency states.
8. **Automated Incident Report**: Structured incident logging (ID, timestamp, coordinates, risk factor breakdown, evidence links).
9. **AI Complaint Analysis & Hotspot Detection**: Text classification, keyword extraction, similarity grouping, and geospatial clustering.

---

## 5. Scope Boundaries

### In Scope (SIH/InnoHack Prototype)
- 7 Core interactive screens (Login/PIN, Home, Safety Map, Safe Journey, Emergency Verification, Emergency Mode, Safety Intelligence).
- Interactive Leaflet.js + OpenStreetMap with custom risk overlays and route rendering.
- FastAPI backend with SQLite persistence for users, guardians, risk zones, complaints, and incidents.
- Simulated distress keyword trigger + 10s countdown + PIN abort.
- Simulated guardian SMS/push notification & simulated 112 emergency dispatch workflow.
- Working NLP text categorization and similarity clustering for crowd complaints.
- Full 2-minute judge-ready demo script & test datasets.

### Out of Scope (Prototype Phase)
- Live production integration with state/national 112 dispatch backends (mocked via standard adapter).
- Real-time smartwatch hardware / BLE sensor pairing.
- Continuous stealth audio recording (strictly emergency-activated for privacy compliance).
- Production multi-region PostgreSQL/PostGIS database cluster.

---

## 6. Measurable Success Criteria
1. **Interactive Demo Speed**: Complete end-to-end demo flow (Normal → Red Zone → Auto Safety Mode → Distress Trigger → 10s Timeout → Guardian Alert + 112 + Incident Report → Complaint Submission → Hotspot update) executable in under 2 minutes.
2. **Zero False-Alarm Lockout**: User entering valid 4-digit PIN cancels emergency within 10-second window 100% of the time.
3. **Complaint Grouping**: Submitting 3 variations of lighting complaints clusters them under the same location hotspot with correct category tags.
4. **Clean Execution**: Backend and frontend launch locally with zero external paid API dependencies required for base functionality.
