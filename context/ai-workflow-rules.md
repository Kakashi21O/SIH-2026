# AI Workflow Rules — SafeSteps

## 1. Development Approach
- **Spec-Driven Incremental Build**: Always develop against the specifications in `context/` and `githubworkflow.md`.
- **Workflow First, AI Second**: Build the core end-to-end user flows with deterministic logic first, then layer intelligent NLP, voice detection, and advanced risk calculations.
- **Runnable at Every Step**: Every completed unit and branch MUST leave the application in a fully functional, testable state. Never leave broken endpoints or unmounted frontend screens.

---

## 2. Scoping & Modularization Rules
1. **One Unit at a Time**: Complete individual vertical slices (e.g., Auth & PIN → Risk Map & Score → Distress & Verification → Guardian Alert → Complaint AI).
2. **Decouple Concerns**: Do not mix UI styling changes with backend database schema migrations in a single ambiguous commit.
3. **Keep Context Dense & Fast**: Keep code compact, modern, and avoid heavy unnecessary external framework dependencies.

---

## 3. The 6-Branch Development Lifecycle
Development strictly adheres to the 6 one-word branches defined in `githubworkflow.md`:
1. `foundation` — Complete end-to-end prototype with baseline data & flows.
2. `enhance` — Refined map, Safe Journey routing, improved UI & error handling.
3. `intelligence` — AI complaint NLP classification, similarity matching, hotspot engine.
4. `safety` — Voice distress detection, 10s countdown verification, severity escalation.
5. `polish` — Responsive UI polish, security audit, .env isolation, test coverage.
6. `final` — Final integration, stable seed data, presentation demo verification.

---

## 4. Handling Ambiguities & Missing Requirements
- Do not invent speculative product behaviors outside the core SafeSteps philosophy (*Detect → Verify → Decide → Protect → Learn*).
- If a parameter or formula requires clarification, document the design decision in `context/architecture.md` and log it under Architecture Decisions in `context/progress-tracker.md`.

---

## 5. Pre-Commit Checklist (Definition of Done)
Before marking any feature complete or switching branches:
1. Backend launches without errors (`uvicorn backend.main:app --reload`).
2. Frontend loads in browser and all active screens render without console errors.
3. The newly added feature interacts properly with existing services.
4. `context/progress-tracker.md` is updated to reflect current state.
5. Code comments clearly explain the rationale behind non-trivial logic.
