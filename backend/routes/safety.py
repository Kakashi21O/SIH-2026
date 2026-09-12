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

