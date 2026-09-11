# UI Context — SafeSteps

## 1. Visual Theme & Design Language
- **Theme**: High-contrast, modern dark safety interface ("Tactical Dark"). Dark backgrounds reduce battery draw, enhance readability during night commutes, and make color-coded safety indicators instantly recognizable.
- **Tone**: Clean, authoritative, calm during normal mode, highly visible and urgent during emergency states.

---

## 2. Color Palette & CSS Variables

| Token | CSS Variable | Value | Purpose |
| --- | --- | --- | --- |
| **Base Background** | `--bg-base` | `#0b0f19` | Deep midnight canvas background |
| **Surface Card** | `--bg-surface` | `#131b2e` | Card surfaces, modals, elevated sheets |
| **Surface Accent** | `--bg-surface-elevated` | `#1c2744` | Active tabs, hover states, input fields |
| **Border Default** | `--border-default` | `#243252` | Subtle panel and divider borders |
| **Text Primary** | `--text-primary` | `#f8fafc` | Main titles, numbers, primary labels |
| **Text Muted** | `--text-muted` | `#94a3b8` | Subtitles, secondary descriptions |
| **Safe Green (Low Risk)** | `--state-safe` | `#10b981` | 80-100 Score, Low Risk zones, "I'm Safe" button |
| **Warning Yellow (Moderate)** | `--state-warn` | `#f59e0b` | 60-79 Score, Moderate Risk zones |
| **High Risk Orange** | `--state-high` | `#f97316` | 40-59 Score, High Risk zones |
| **Critical Emergency Red** | `--state-critical` | `#ef4444` | <40 Score, Critical zones, SOS button, Verification countdown |
| **Brand Primary Cyan** | `--brand-primary` | `#06b6d4` | SafeSteps brand highlight, active journeys, route polyline |

---

## 3. Typography & Sizing

| Category | Font Family | Variable | Usage |
| --- | --- | --- | --- |
| **Primary Sans** | Inter / system-ui, sans-serif | `--font-sans` | Standard UI copy, labels, forms |
| **Monospace / Metric** | JetBrains Mono / monospace | `--font-mono` | Safety scores, countdown numbers, coords, PIN input |

- **Type Scale**:
  - Hero Score / Timer: `3.5rem` (`56px`), bold, font-mono
  - Screen Titles: `1.5rem` (`24px`), font-bold
  - Card Headings: `1.125rem` (`18px`), font-semibold
  - Body Text: `0.9375rem` (`15px`), font-normal
  - Small / Badges: `0.75rem` (`12px`), font-medium uppercase

---

## 4. The 7 Core Screen Layouts

### 1. Login / Register (`#screen-auth`)
- Simple mobile card: App logo 🛡️, Name, Phone Number, 4-digit Emergency PIN setup, "Launch SafeSteps" button.

### 2. Home Dashboard (`#screen-home`)
- Current location badge with GPS status pulse.
- Large circular Safety Score card (e.g., `82/100 🟢 LOW RISK`).
- Prominent toggle switch: **Safety Mode** [ ON / OFF ].
- Quick action buttons: `[ 🚶 Safe Journey ]`, `[ 🗺️ Safety Map ]`, `[ 📢 Report Issue ]`, `[ 🚨 SOS ]`.

### 3. Safety Map (`#screen-map`)
- Full viewport Leaflet.js interactive map with custom dark tile styling.
- Colored risk zone polygons (🟢 Low, 🟡 Moderate, 🟠 High, 🔴 Critical).
- POI markers: Police stations 🚔, Hospitals 🏥, Emergency facilities.
- Dynamic user location pin with accuracy radius and safety status beacon.

### 4. Safe Journey (`#screen-journey`)
- Origin & Destination selection with quick presets (College → Home).
- Comparative Route Cards:
  - **Fastest Route**: `2.1 km | 10 mins | Safety: 42/100 🔴`
  - **Safer Route ⭐**: `2.6 km | 14 mins | Safety: 87/100 🟢 (Recommended)`
- "Start Safe Journey" action button with live turn/safety tracker.

### 5. Emergency Verification (`#screen-verify`)
- Full-screen modal overlay with pulsating red emergency beacon.
- Giant countdown timer: **`10 → 9 → 8 ... 0`**.
- Heading: *"Possible Distress Signal Detected! Are you safe?"*
- Primary Actions:
  - `[ 🟢 I'M SAFE ]` (Quick dismissal)
  - `[ 🔐 ENTER SAFETY PIN ]` (Secure cancellation keypad modal)

### 6. Emergency Active Mode (`#screen-emergency`)
- High-urgency red header: *"🚨 EMERGENCY MODE ACTIVE"*.
- Real-time automated status checklist:
  - ✓ Guardian Alert Dispatched (SMS/Push simulated)
  - ✓ Live Emergency Location Broadcast Active
  - ✓ 112 Emergency Workflow Initiated (Simulated)
  - ✓ Emergency Audio Evidence Recording (🎙️ Active indicator)
- `[ Cancel / Resolve Emergency (Requires PIN) ]` button.

### 7. Safety Intelligence & Complaints (`#screen-intelligence`)
- Top metrics: High Risk Areas count, Total Crowd Reports, Emerging Hotspots.
- "Submit Safety Complaint" text input + auto-categorize preview chip.
- Feed of clustered hotspots (e.g., `XYZ Road: 37 reports — Primary Issue: Poor Lighting 💡`).

---

## 5. UI Components & Interaction Conventions
- **Buttons**: Rounded-xl (`12px` border radius), minimum height `48px` for reliable mobile tap targets.
- **Haptic / Visual Feedback**: Pulsating glow animations on active states (`@keyframes pulse-ring`).
- **Icons**: Simple Unicode or lightweight SVG icons (🛡️, 📍, 🚨, 🎙️, 🚶, 🚔, 🏥, 💡, 🔐).
- **Responsive Container**: Standard centered mobile shell container (max-width `480px`) on desktop viewports, 100% full-bleed on mobile devices.
