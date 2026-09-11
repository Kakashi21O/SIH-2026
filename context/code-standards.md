# Code Standards — SafeSteps

## 1. General Principles
- **Clarity over Cleverness**: Write simple, readable, testable code. Every module must have a single clear purpose.
- **Fail-Safe by Design**: Safety and emergency flows must always default to a safe state. If an API call fails, provide graceful local degradation.
- **Explain the "Why" in Comments**: Code comments must explain the engineering reasoning, risk logic, or fallback decision—never describe obvious syntax.
- **No Hardcoded Secrets**: All keys, ports, and external service URLs must be loaded via `backend/config.py` and `.env`.

---

## 2. Backend Standards (Python / FastAPI)
- **Type Annotations**: Use Python type hints (`int`, `str`, `List[dict]`, `Optional[str]`) across all functions and route signatures.
- **Pydantic Schemas**: Every API request body and response model must use Pydantic `BaseModel` for validation.
- **FastAPI Routers**: Keep endpoint handlers lightweight; delegate business logic to `services/` (`risk_engine.py`, `emergency_engine.py`, `complaint_ai.py`).
- **Database Access**: Use clean parameterized SQL queries or ORM models in `database/database.py` to prevent SQL injection.
- **Consistent Response Shapes**:
  ```json
  {
    "success": true,
    "data": { ... },
    "message": "Optional status message"
  }
  ```
  Errors must raise `HTTPException(status_code=..., detail="...")`.

---

## 3. Frontend Standards (HTML / CSS / JavaScript)
- **Modular JavaScript**: Organize frontend logic into distinct modules:
  - `app.js` — State management, screen routing, DOM event listeners.
  - `map.js` — Leaflet map initialization, risk polygon rendering, markers, route polylines.
  - `audio.js` — Web Speech recognition simulation, MediaRecorder audio buffer management.
- **Vanilla DOM Manipulation**: Use `document.querySelector` and utility functions; avoid bloated external frontend framework dependencies.
- **Strict CSS Custom Properties**: Always use tokens from `style.css` (e.g., `var(--state-critical)`), avoiding hardcoded hex colors.
- **Responsive Layout**: Mobile-first design using flexbox and grid, with touch targets `≥ 48px`.

---

## 4. AI & NLP Standards
- **Lightweight & Fast**: Use standard scikit-learn / TF-IDF / fuzzy matching or lightweight transformer embeddings for NLP classification. Execution time per complaint must remain `< 50ms`.
- **Heuristic / Rule-Based Scoring Engine**: The Severity Engine and Risk Engine must use clear, documented weighting formulas:
  - *Risk Score*: `Base Crime Data (40%) + Recent Complaints (30%) + Time of Day (20%) + Proximity to Police/Hospitals (10%)`.
  - *Emergency Severity*: `Zone Factor (+20) + Distress Signal (+30) + Repeated Signal (+20) + No Response (+20) + Manual SOS (+50)`.
- **Safe Fallback**: If NLP model loading fails, default to a keyword-matching classifier so complaint submissions never break.

---

## 5. Commenting Guidelines by Development Phase
Write natural, human comments explaining architectural and safety intent:
- *Part 1 (Foundation)*: Explain basic state transitions (e.g., `# Auto-activate Safety Mode when user coordinates cross into a known high-risk boundary`).
- *Part 2 (Enhance)*: Explain routing trade-offs (e.g., `# Recommend Route B when its safety score is significantly higher despite a small distance penalty`).
- *Part 3 (Intelligence)*: Explain NLP & clustering choices (e.g., `# Group complaints within 300m radius sharing overlapping keywords into a single safety hotspot`).
- *Part 4 (Safety)*: Explain verification logic (e.g., `# Do not immediately dispatch emergency on audio trigger; initiate 10s countdown to verify user intent`).
- *Part 5 & 6 (Polish & Final)*: Explain caching and mock adapter boundaries (e.g., `# Mock adapter maintains identical interface to production 112 CAD dispatch API`).
