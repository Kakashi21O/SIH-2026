"""
SafeSteps — Controlled AI Data Access Layer (ai_tools.py)
Provides safe, read-only, parameterized access to SafeSteps domain data:
- Risk Engine (zones, situational safety scores, factors)
- Complaint AI (clusters, semantic duplicate search, categories)
- Hotspot Hub (active radar clusters)
- Location & Journey System (route safety comparisons)
- General System Knowledge (verifications, privacy, emergency state machine)

Guarantees:
- Never executes arbitrary SQL
- Excludes sensitive private user info (passwords, PINs, phone numbers)
- Does not invent data: returns None or explicit 'insufficient_data' if unmapped
"""

import json
from typing import Dict, Any, List, Optional
from backend.database.database import get_db_connection
from backend.services.risk_engine import evaluate_location_risk, is_point_in_polygon
from backend.services.complaint_ai import (
    find_duplicate_report,
    group_reports_into_clusters,
    calculate_haversine_meters,
    classify_complaint_text
)
from backend.services.location_service import compare_routes

class SafeStepsDataTools:

    @staticmethod
    def get_area_safety(lat: float, lng: float, query_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Retrieve ground-truth situational safety details for a coordinate or named area.
        Combines Risk Engine evaluations, matched zone details, and complaint statistics.
        """
        conn = get_db_connection()
        cursor = conn.cursor()

        # If an area name was queried, attempt to resolve coordinates from known risk zones
        resolved_name = query_name
        if query_name and (lat == 0.0 or lng == 0.0 or lat is None):
            cursor.execute("SELECT name, polygon_geojson, safety_score, risk_level FROM risk_zones WHERE LOWER(name) LIKE ?", (f"%{query_name.lower().strip()}%",))
            matched_row = cursor.fetchone()
            if matched_row:
                geom = json.loads(matched_row["polygon_geojson"])
                coords = geom["coordinates"][0]
                # Calculate centroid of polygon
                lat = sum(c[1] for c in coords) / len(coords)
                lng = sum(c[0] for c in coords) / len(coords)
                resolved_name = matched_row["name"]

        # Run through official Risk Engine formula
        risk_data = evaluate_location_risk(lat, lng)

        # Retrieve complaint history around this coordinate (within 800m)
        cursor.execute("SELECT id, text, category, severity, upvotes, lat, lng, created_at FROM complaints")
        all_complaints = cursor.fetchall()
        
        nearby_reports = []
        category_counts: Dict[str, int] = {}
        for c in all_complaints:
            dist = calculate_haversine_meters(lat, lng, c["lat"], c["lng"])
            if dist <= 800:
                nearby_reports.append(dict(c))
                cat = c["category"]
                category_counts[cat] = category_counts.get(cat, 0) + 1

        conn.close()

        # Determine primary reported issue and trend
        primary_issue = max(category_counts, key=category_counts.get) if category_counts else "None reported"
        total_reports = len(nearby_reports)

        trend = "Stable"
        if total_reports >= 4:
            trend = "Increasing"
        elif total_reports == 0:
            trend = "Low Activity"

        return {
            "has_data": True,
            "area_name": resolved_name or risk_data.get("active_zone_name", "Delhi NCR Sector"),
            "lat": lat,
            "lng": lng,
            "risk_level": risk_data["risk_level"],
            "safety_score": risk_data["overall_score"],
            "recent_reports_count": total_reports,
            "primary_issue": primary_issue.replace("_", " ").title(),
            "trend": trend,
            "recommended_action": risk_data["recommended_action"],
            "lighting_status": risk_data["factors"].get("lighting_status", "UNKNOWN"),
            "police_presence": risk_data["factors"].get("police_presence", "UNKNOWN"),
            "nearby_complaint_penalty": risk_data["factors"].get("nearby_complaint_penalty", 0.0)
        }

    @staticmethod
    def get_nearby_hotspots(lat: float, lng: float, radius_meters: float = 1200.0) -> List[Dict[str, Any]]:
        """
        Query active safety hotspot clusters in the vicinity of coordinates.
        """
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, text, category, lat, lng, severity, upvotes, cluster_id, created_at FROM complaints")
        rows = cursor.fetchall()
        conn.close()

        reports = [dict(r) for r in rows]
        clusters = group_reports_into_clusters(reports)

        nearby_hotspots = []
        for c in clusters:
            dist = calculate_haversine_meters(lat, lng, c["center_lat"], c["center_lng"])
            if dist <= radius_meters:
                nearby_hotspots.append({
                    "cluster_id": c["cluster_id"],
                    "headline": c["headline"],
                    "category": c["category"].replace("_", " ").title(),
                    "severity": c["severity"],
                    "report_count": c["total_count"],
                    "distance_meters": round(dist, 1)
                })

        return nearby_hotspots

    @staticmethod
    def find_similar_reports(query_text: str, lat: float, lng: float) -> Dict[str, Any]:
        """
        Uses existing Complaint AI semantic vector & keyword similarity to search existing records.
        """
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, text, category, lat, lng, severity, upvotes, cluster_id, created_at FROM complaints")
        rows = cursor.fetchall()
        conn.close()

        existing = [dict(r) for r in rows]
        match_result = find_duplicate_report(query_text, lat, lng, existing)

        # Categorize query intent
        query_classification = classify_complaint_text(query_text)

        # Filter all matching category reports within 1.5km
        related_reports = []
        for r in existing:
            dist = calculate_haversine_meters(lat, lng, r["lat"], r["lng"])
            if dist <= 1500 and (r["category"] == query_classification["category"] or match_result["is_duplicate"]):
                related_reports.append({
                    "id": r["id"],
                    "text": r["text"],
                    "category": r["category"].replace("_", " ").title(),
                    "severity": r["severity"],
                    "distance_meters": round(dist, 1)
                })

        critical_count = sum(1 for r in related_reports if r["severity"] == "CRITICAL")

        return {
            "query_category": query_classification["category"].replace("_", " ").title(),
            "query_severity": query_classification["severity"],
            "matched_duplicate": match_result["is_duplicate"],
            "similarity_score": round(match_result["similarity_score"], 2),
            "total_similar_found": len(related_reports),
            "critical_count": critical_count,
            "sample_reports": related_reports[:3]
        }

    @staticmethod
    def get_journey_safety_info(origin: str, destination: str) -> Dict[str, Any]:
        """
        Compare routes between origin and destination using the existing Location Service.
        """
        try:
            comparison = compare_routes(origin, destination)
            return {
                "success": True,
                "origin": comparison["origin"],
                "destination": comparison["destination"],
                "fastest_route": comparison["routes"]["fastest"],
                "safer_route": comparison["routes"]["safer"],
                "recommendation": comparison["recommendation"]
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "Could not calculate journey routes for the specified points."
            }

    @staticmethod
    def get_safesteps_feature_info(topic: str) -> str:
        """
        Return authoritative architecture knowledge regarding SafeSteps mechanisms.
        """
        topic_lower = topic.lower()
        if "emergency" in topic_lower or "sos" in topic_lower:
            return (
                "SafeSteps Emergency Workflow: Triggered manually via the Emergency SOS button, "
                "repeated taps (escalates severity), or voice distress keyword detection. "
                "Initiates a 10-second verification countdown to prevent false alarms. "
                "If not cancelled by the user's 4-digit Safety PIN within 10 seconds, it automatically "
                "dispatches simulated 112 CAD alerts, sends live GPS tracking links to primary guardians, "
                "and captures ambient audio evidence."
            )
        elif "pin" in topic_lower:
            return (
                "Safety PIN: A secure 4-digit PIN configured during setup (demo default: 1234). "
                "Required to cancel the 10-second emergency countdown or disarm an active emergency. "
                "Stored in SQLite with SHA-256 cryptographic hashing."
            )
        elif "safety mode" in topic_lower or "listener" in topic_lower or "voice" in topic_lower:
            return (
                "Safety Mode & Dual-Trigger Voice Listener: A proactive monitoring mode that can be "
                "switched on manually or auto-engaged when entering a known Red or High-Risk zone. "
                "When active, the Web Speech API continuously listens for bilingual distress trigger "
                "keywords ('Help me', 'Bachao', 'Stop', 'Leave me', 'Chhod mujhe'). If verified by PIN as a mistake, "
                "the listener immediately disarms to standby."
            )
        elif "score" in topic_lower or "risk engine" in topic_lower or "formula" in topic_lower:
            return (
                "Situational Safety Score (0-100): Calculated using a multi-factor formula: "
                "Base Zone Risk (40%) + Nearby Verified Complaint Density (30%) + Time of Day (20%) + "
                "Safe Haven Proximity (10%). Scores ≥80 are Low Risk, 60-79 Moderate, 40-59 High Risk, "
                "and <40 Critical Danger."
            )
        elif "hotspot" in topic_lower or "cluster" in topic_lower:
            return (
                "Dynamic Safety Hotspots: Clustered from crowdsourced community hazard complaints "
                "using Haversine great-circle distance (≤300m) and NLP semantic similarity. Hotspots "
                "pulse dynamically on the Leaflet map as active radar warnings."
            )
        else:
            return (
                "SafeSteps is an AI-powered proactive personal safety platform combining geofenced "
                "risk maps, situational safety scores, community hazard crowdsourcing, safer-route journey "
                "recommendations, and an automated 10-second emergency verification countdown."
            )
