import json
from fastapi import APIRouter
from backend.models.schemas import LocationRiskCheckRequest, SafetyScoreResponse
from backend.services.risk_engine import evaluate_location_risk
from backend.database.database import get_db_connection

router = APIRouter(prefix="/api/safety", tags=["Risk & Safety"])

@router.post("/score", response_model=SafetyScoreResponse)
def get_safety_score(payload: LocationRiskCheckRequest):
    """
    Compute situational safety score (0-100) and check if Safety Mode should auto-trigger.
    """
    result = evaluate_location_risk(payload.lat, payload.lng)
    return SafetyScoreResponse(**result)

@router.get("/zones")
def get_all_risk_zones():
    """
    Return all geo-fenced risk zones and POIs for Leaflet map overlay rendering.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, risk_level, safety_score, color, fill_opacity, description, polygon_geojson, complaint_count FROM risk_zones")
    rows = cursor.fetchall()
    conn.close()

    features = []
    for r in rows:
        features.append({
            "type": "Feature",
            "id": r["id"],
            "properties": {
                "name": r["name"],
                "risk_level": r["risk_level"],
                "safety_score": r["safety_score"],
                "color": r["color"],
                "fillOpacity": r["fill_opacity"],
                "description": r["description"],
                "complaint_count": r["complaint_count"]
            },
            "geometry": json.loads(r["polygon_geojson"])
        })

    return {
        "type": "FeatureCollection",
        "features": features
    }

@router.get("/pois")
def get_safe_pois():
    """
    Return list of Safe Havens, Police Stations, and Emergency Hospitals for map rendering.
    """
    import os
    from backend.config import settings
    if os.path.exists(settings.RISK_ZONES_SEED):
        with open(settings.RISK_ZONES_SEED, "r", encoding="utf-8-sig") as f:
            data = json.load(f)
            return data.get("pois", [])
    return []

@router.get("/hotspots", response_model=list)
def get_active_safety_hotspots():
    """
    Compute and return dynamic safety hotspots from active community complaints
    for live pulsating radar rendering on the Leaflet map.
    """
    from backend.services.complaint_ai import group_reports_into_clusters

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, text, category, lat, lng, severity, upvotes, cluster_id, created_at FROM complaints")
    rows = cursor.fetchall()
    conn.close()

    reports = [dict(r) for r in rows]
    clusters = group_reports_into_clusters(reports)

    hotspots = []
    for cl in clusters:
        # Calculate dynamic hazard rating (0-100)
        sev_mult = 30 if cl["severity"] == "CRITICAL" else (20 if cl["severity"] == "HIGH" else 10)
        hazard_score = min(98, (cl["total_count"] * 15) + (cl["upvotes_sum"] * 3) + sev_mult)

        hotspots.append({
            "id": cl["cluster_id"],
            "category": cl["category"],
            "headline": cl["headline"],
            "severity": cl["severity"],
            "lat": round(cl["center_lat"], 5),
            "lng": round(cl["center_lng"], 5),
            "radius_meters": min(280.0, 100.0 + (cl["total_count"] * 35.0)),
            "report_count": cl["total_count"],
            "upvotes": cl["upvotes_sum"],
            "hazard_score": hazard_score
        })

    return hotspots

