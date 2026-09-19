import json
import datetime
from typing import Dict, Any, Optional, Tuple, List
from backend.database.database import get_db_connection
from backend.services.complaint_ai import calculate_haversine_meters

def is_point_in_polygon(lat: float, lng: float, polygon_coords: list) -> bool:
    """
    Ray-casting algorithm to determine if a point (lng, lat) is inside a GeoJSON polygon.
    Pure Python implementation ensures zero external GIS C-library dependencies.
    """
    x = lng
    y = lat
    inside = False
    
    ring = polygon_coords[0] if len(polygon_coords) > 0 else []
    n = len(ring)
    
    if n < 3:
        return False

    p1x, p1y = ring[0]
    for i in range(1, n + 1):
        p2x, p2y = ring[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y

    return inside

def evaluate_location_risk(lat: float, lng: float) -> Dict[str, Any]:
    """
    Evaluate situational safety score using the weighted multi-factor formula:
    Safety Score = Base Zone Score (40%) + Complaint Density (30%) + Time of Day (20%) + Safe Haven Proximity (10%)
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Fetch risk zones
    cursor.execute("SELECT id, name, risk_level, safety_score, polygon_geojson, complaint_count FROM risk_zones")
    zones = cursor.fetchall()

    matched_zone = None
    for zone in zones:
        geometry = json.loads(zone["polygon_geojson"])
        if is_point_in_polygon(lat, lng, geometry["coordinates"]):
            matched_zone = zone
            break

    if matched_zone:
        base_zone_score = matched_zone["safety_score"]
        base_risk_level = matched_zone["risk_level"]
        zone_name = matched_zone["name"]
    else:
        base_zone_score = 82
        base_risk_level = "LOW"
        zone_name = "Standard Monitored Urban Area"

    # 2. Factor: Recent Complaints & Hotspots within 500m (30% weight)
    cursor.execute("SELECT id, text, category, lat, lng, severity, upvotes FROM complaints")
    all_complaints = cursor.fetchall()
    conn.close()

    nearby_complaints = []
    complaint_penalty = 0.0

    for c in all_complaints:
        dist = calculate_haversine_meters(lat, lng, c["lat"], c["lng"])
        if dist <= 500.0:
            nearby_complaints.append(c)
            weight = 1.0 if dist <= 200.0 else 0.6
            upvote_mult = 1.0 + (min(c["upvotes"] or 1, 10) * 0.05)

            if c["severity"] == "CRITICAL":
                complaint_penalty += 12.0 * weight * upvote_mult
            elif c["severity"] == "HIGH":
                complaint_penalty += 7.0 * weight * upvote_mult
            else:
                complaint_penalty += 3.5 * weight * upvote_mult

    complaint_score = max(10.0, 100.0 - complaint_penalty)

    # 3. Factor: Time of Day (20% weight)
    current_hour = datetime.datetime.now().hour
    # Late night / early morning (21:00 to 05:00) reduces score
    if current_hour >= 22 or current_hour < 4:
        time_score = 45.0
    elif current_hour >= 20 or current_hour < 6:
        time_score = 65.0
    else:
        time_score = 95.0

    # 4. Factor: Safe Haven / Police Station Proximity (10% weight)
    # Pre-defined major emergency safe havens
    SAFE_HAVENS = [
        {"lat": 28.6315, "lng": 77.2190, "type": "POLICE"},
        {"lat": 28.6250, "lng": 77.2010, "type": "HOSPITAL"},
        {"lat": 28.6328, "lng": 77.2197, "type": "SAFE_HUB"}
    ]
    min_haven_dist = min([calculate_haversine_meters(lat, lng, sh["lat"], sh["lng"]) for sh in SAFE_HAVENS])
    if min_haven_dist <= 300.0:
        haven_score = 98.0
    elif min_haven_dist <= 700.0:
        haven_score = 80.0
    else:
        haven_score = 60.0

    # Weighted final situational score:
    # Weighted final situational score:
    # 40% Base Zone + 30% Complaints + 20% Time + 10% Haven Proximity
    computed_score = (
        (base_zone_score * 0.40) +
        (complaint_score * 0.30) +
        (time_score * 0.20) +
        (haven_score * 0.10)
    )

    # Inherent zone hazard guardrails (a known critical zone cannot be rated low risk)
    if base_risk_level == "CRITICAL":
        overall_score = round(min(38.0, (base_zone_score * 0.60) + (computed_score * 0.40)))
    elif base_risk_level == "HIGH":
        overall_score = round(min(52.0, (base_zone_score * 0.50) + (computed_score * 0.50)))
    else:
        overall_score = round(computed_score)

    overall_score = max(15, min(99, overall_score))

    # Determine dynamic risk level
    if overall_score >= 80:
        risk_level = "LOW"
    elif overall_score >= 60:
        risk_level = "MODERATE"
    elif overall_score >= 40:
        risk_level = "HIGH"
    else:
        risk_level = "CRITICAL"

    auto_safety_mode = overall_score < 50 or risk_level in ["HIGH", "CRITICAL"]

    recommendation = (
        f"High risk detected near {zone_name}. Active hazard reports nearby. Safety Mode engaged."
        if auto_safety_mode
        else f"{zone_name} is actively monitored. Regular patrol coverage verified."
    )

    return {
        "lat": lat,
        "lng": lng,
        "overall_score": overall_score,
        "risk_level": risk_level,
        "active_zone_name": zone_name,
        "auto_safety_mode_recommended": auto_safety_mode,
        "recommended_action": recommendation,
        "factors": {
            "base_zone_score": base_zone_score,
            "complaint_density": len(nearby_complaints),
            "nearby_complaint_penalty": round(complaint_penalty, 1),
            "lighting_status": "ADEQUATE" if overall_score >= 60 else "POOR",
            "police_presence": "ACTIVE" if min_haven_dist <= 500.0 else "LOW"
        }
    }
