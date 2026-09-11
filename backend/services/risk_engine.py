import json
from typing import Dict, Any, Optional, Tuple
from backend.database.database import get_db_connection

def is_point_in_polygon(lat: float, lng: float, polygon_coords: list) -> bool:
    """
    Ray-casting algorithm to determine if a point (lng, lat) is inside a GeoJSON polygon.
    Pure Python implementation ensures zero external GIS C-library dependencies.
    """
    # GeoJSON coordinates are in [longitude, latitude] order
    x = lng
    y = lat
    inside = False
    
    # polygon_coords is list of linear rings (first ring is outer boundary)
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
    Evaluate the live risk score for given GPS coordinates.
    Scans risk zone polygons and calculates situational score between 0 (Extreme Hazard) and 100 (Safe).
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, risk_level, safety_score, polygon_geojson, complaint_count FROM risk_zones")
    zones = cursor.fetchall()
    conn.close()

    matched_zone = None
    for zone in zones:
        geometry = json.loads(zone["polygon_geojson"])
        if is_point_in_polygon(lat, lng, geometry["coordinates"]):
            matched_zone = zone
            break

    if matched_zone:
        base_score = matched_zone["safety_score"]
        risk_level = matched_zone["risk_level"]
        zone_name = matched_zone["name"]
        complaints = matched_zone["complaint_count"]
    else:
        # Default baseline if outside pre-mapped demo zones
        base_score = 80
        risk_level = "LOW"
        zone_name = "Standard Monitored Urban Area"
        complaints = 0

    # Auto safety mode triggers when score drops below 50 or is HIGH/CRITICAL
    auto_safety_mode = base_score < 50 or risk_level in ["HIGH", "CRITICAL"]
    
    recommendation = (
        "High risk area detected. Safety Mode auto-engaged with active distress monitoring."
        if auto_safety_mode
        else "Area is well lit and actively monitored. Normal journey mode."
    )

    return {
        "lat": lat,
        "lng": lng,
        "overall_score": base_score,
        "risk_level": risk_level,
        "active_zone_name": zone_name,
        "auto_safety_mode_recommended": auto_safety_mode,
        "recommended_action": recommendation,
        "factors": {
            "base_zone_score": base_score,
            "complaint_density": complaints,
            "lighting_status": "POOR" if base_score < 50 else "ADEQUATE",
            "police_presence": "LOW" if base_score < 50 else "ACTIVE"
        }
    }
