# SafeSteps GitHub Workflow & Branching Strategy

## 1. Core Development Strategy
SafeSteps is developed through **6 sequential one-word branches**. Each stage builds upon the previous completed branch, ensuring the project remains runnable, testable, and demonstrable at every single milestone.

| Part | Branch Name | Primary Objective | Deliverables |
| --- | --- | --- | --- |
| **1** | `foundation` | Complete baseline working prototype | 7 screens UI, Leaflet map, demo risk zones, basic score, auto Safety Mode, 10s PIN verify, mock Guardian/112, incident report, complaint store |
| **2** | `enhance` | UX & Safe Journey optimization | Safe Journey routing (Fastest vs Safer Route ⭐), guardian CRUD, improved map UX, error boundaries |
| **3** | `intelligence` | AI complaint analysis & dynamic risk | NLP complaint classification, similarity clustering, Safety Hotspots, dynamic risk score weighting |
| **4** | `safety` | Distress detection & emergency engine | Voice/keyword distress detection, weighted Severity Engine, emergency audio capture buffer |
| **5** | `polish` | UI polish, security & performance | `.env` secrets isolation, mobile responsiveness, input validation, API query caching, test suite |
| **6** | `final` | Submission & demo readiness | Clean demo seed datasets, 2-minute pitch flow validation, final README, PPT architecture diagrams |

---

## 2. The Golden Git Branch Flow

```text
main
 └── foundation
      └── enhance
           └── intelligence
                └── safety
                     └── polish
                          └── final
```

### Mandatory Rules
1. **Branch Naming**: Must be strictly one of the 6 lowercase names: `foundation`, `enhance`, `intelligence`, `safety`, `polish`, `final`.
2. **Never Skip Stages**: Branch `N` is always branched directly from completed Branch `N-1`.
3. **Always Runnable**: Do not commit broken or non-compiling code. Every branch must be capable of demonstrating the core flow.
4. **Clean Commits**: Format commit messages as `<branch>: <action-in-imperative>`:
   - `foundation: create baseline 7-screen spa and fastapi backend`
   - `foundation: add risk zone geofencing and auto safety mode`
   - `enhance: implement safer route recommendation engine`
   - `intelligence: add nlp complaint classifier and hotspot clusterer`
   - `safety: add voice distress trigger and emergency audio capture`
   - `polish: isolate secrets in env and optimize map rendering`
   - `final: stabilize seed data and finalize demo flow`

---

## 3. Human Code Commenting Standards
Every branch should contain stage-specific, natural human comments explaining **rationale, safety fallbacks, and engineering decisions**:
- **Foundation**: Explain state transitions and baseline logic.
  ```python
  # Activate Safety Mode automatically when the coordinates enter a high-risk polygon.
  ```
- **Enhance**: Explain routing heuristics and UX trade-offs.
  ```javascript
  // Prioritize Route B if the safety score increase outweighs the minor travel time difference.
  ```
- **Intelligence**: Explain AI/NLP thresholds and clustering logic.
  ```python
  # Group complaints within 300 meters sharing semantic keywords into a unified hotspot.
  ```
- **Safety**: Explain verification safeguards and false-alarm prevention.
  ```python
  # A 10-second verification window prevents accidental emergency dispatch from background noise.
  ```
- **Polish / Final**: Explain adapters, caching, and production boundaries.
  ```python
  # Adapter isolates the simulated 112 CAD endpoint for easy plug-and-play government API integration.
  ```

---

## 4. Environment & Secrets Management
- All configuration must reside in `.env` (database path, map tokens, API keys, port settings).
- Commit `.env.example` to Git; strictly ignore `.env` in `.gitignore`.
- Never hardcode mock credentials, API keys, or private phone numbers in source files.

---

## 5. Prototype vs Production Boundaries
- **Prototype (Demo-Ready)**: Uses simulated crime statistics, demo risk zones, Web Speech/button distress triggers, mock SMS/push notifications, and simulated 112 emergency dispatch.
- **Production-Ready Architecture**: Core logic connects to external providers via decoupled service adapters (`NotificationService`, `EmergencyEngine`, `RiskEngine`), allowing production government APIs and live telecom gateways to plug in without architectural rewrites.

---

## 6. Definition of Done Checklist (Per Branch)
1. Branch compiles and starts cleanly without console or runtime exceptions.
2. All 7 screens render and navigate properly.
3. Added features are covered by unit/integration checks or verifiable test steps.
4. Comments explain architectural rationale.
5. `context/progress-tracker.md` is updated.
6. Git commit created following the naming convention.
