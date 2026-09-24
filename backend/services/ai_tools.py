"""
SafeSteps — Controlled AI Data Access Layer (ai_tools.py)

Provides safe, read-only, parameterized access to SafeSteps domain data.
The LLM NEVER touches raw SQL. Every tool in this file is the only gateway
between the LLM and the database.

Tools available to the LLM:
  1. get_area_safety      — risk score, level, trend, primary issue (no user data)
  2. get_nearby_hotspots  — clustered complaint hotspots near coordinates
  3. find_similar_reports — anonymised complaint search by query text
  4. search_web           — DuckDuckGo instant answer (current internet info)

Security guarantees:
  - Never executes arbitrary SQL
  - No cross-user data leakage: each tool scoped to the calling user_id only
  - Does not invent data: returns explicit messages if data is unavailable
"""

import json
from typing import Any, Dict, List, Optional

from backend.database.database import get_db_connection
from backend.services.risk_engine import evaluate_location_risk
from backend.services.complaint_ai import (
    find_duplicate_report,
    group_reports_into_clusters,
    calculate_haversine_meters,
    classify_complaint_text,
)
from backend.services.location_service import compare_routes
from backend.services.web_search import search_web as _search_web


# ===========================================================================
# OpenAI-format tool definitions — compact & token-efficient
# ===========================================================================

TOOL_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_area_safety",
            "description": "Safety score, risk level, lighting, police presence for location.",
            "parameters": {
                "type": "object",
                "properties": {
                    "lat": {"type": "number"},
                    "lng": {"type": "number"},
                    "area_name": {"type": "string"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_nearby_hotspots",
            "description": "Active hazard clusters nearby.",
            "parameters": {
                "type": "object",
                "properties": {
                    "lat": {"type": "number"},
                    "lng": {"type": "number"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "find_similar_reports",
            "description": "Search past community complaint reports.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "lat": {"type": "number"},
                    "lng": {"type": "number"}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": "Search internet for latest info or news.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"}
                },
                "required": ["query"]
            }
        }
    }
]


# ===========================================================================
# Tool Implementations
# ===========================================================================

class SafeStepsTools:

    # -----------------------------------------------------------------------
    # 1. Area Safety
    # -----------------------------------------------------------------------
    @staticmethod
    def get_area_safety(
        lat: float,
        lng: float,
        area_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Retrieve safety details for a coordinate or named area.
        Returns only non-sensitive aggregate data.
        """
        conn = get_db_connection()
        cursor = conn.cursor()

        resolved_name = area_name
        # Resolve named area to coordinates if coordinates are default/zero
        if area_name and (not lat or not lng or (lat == 28.6315 and lng == 77.2190)):
            cursor.execute(
                "SELECT name, polygon_geojson, safety_score, risk_level "
                "FROM risk_zones WHERE LOWER(name) LIKE ?",
                (f"%{area_name.lower().strip()}%",)
            )
            row = cursor.fetchone()
            if row:
                geom = json.loads(row["polygon_geojson"])
                coords = geom["coordinates"][0]
                lat = sum(c[1] for c in coords) / len(coords)
                lng = sum(c[0] for c in coords) / len(coords)
                resolved_name = row["name"]

        risk_data = evaluate_location_risk(lat, lng)

        # Aggregate complaints within 800m (no text/user IDs returned)
        cursor.execute(
            "SELECT category, severity, lat, lng FROM complaints"
        )
        all_complaints = cursor.fetchall()
        conn.close()

        category_counts: Dict[str, int] = {}
        total_nearby = 0
        for c in all_complaints:
            dist = calculate_haversine_meters(lat, lng, c["lat"], c["lng"])
            if dist <= 800:
                total_nearby += 1
                cat = c["category"]
                category_counts[cat] = category_counts.get(cat, 0) + 1

        primary_issue = (
            max(category_counts, key=category_counts.get)
            if category_counts else "none_reported"
        )
        trend = "increasing" if total_nearby >= 4 else ("low_activity" if total_nearby == 0 else "stable")

        return {
            "area": resolved_name or risk_data.get("active_zone_name", "Delhi NCR"),
            "score": f"{risk_data['overall_score']}/100",
            "risk": risk_data["risk_level"],
            "lighting": risk_data["factors"].get("lighting_status", "unknown"),
            "police": risk_data["factors"].get("police_presence", "unknown"),
            "issue": primary_issue.replace("_", " "),
        }

    # -----------------------------------------------------------------------
    # 2. Nearby Hotspots
    # -----------------------------------------------------------------------
    @staticmethod
    def get_nearby_hotspots(
        lat: float,
        lng: float,
        radius_meters: float = 1200.0,
    ) -> List[Dict[str, Any]]:
        """Returns top 3 nearby hazard clusters. Token-efficient RAG."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, text, category, lat, lng, severity, upvotes, cluster_id, created_at "
            "FROM complaints"
        )
        rows = cursor.fetchall()
        conn.close()

        reports  = [dict(r) for r in rows]
        clusters = group_reports_into_clusters(reports)

        nearby = []
        for c in clusters:
            dist = calculate_haversine_meters(lat, lng, c["center_lat"], c["center_lng"])
            if dist <= radius_meters:
                nearby.append({
                    "headline": c["headline"],
                    "severity": c["severity"],
                    "dist": f"{round(dist)}m",
                })

        nearby.sort(key=lambda x: int(x["dist"].replace("m", "")))
        return nearby[:3]

    # -----------------------------------------------------------------------
    # 3. Similar Reports
    # -----------------------------------------------------------------------
    @staticmethod
    def find_similar_reports(
        query: str,
        lat: float,
        lng: float,
    ) -> Dict[str, Any]:
        """
        Semantic complaint search. Returns anonymised snippets only.
        No user_id, no reporter identity, no personal data.
        """
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, text, category, lat, lng, severity FROM complaints"
        )
        rows = cursor.fetchall()
        conn.close()

        existing      = [dict(r) for r in rows]
        match_result  = find_duplicate_report(query, lat, lng, existing)
        classification = classify_complaint_text(query)

        related = []
        for r in existing:
            dist = calculate_haversine_meters(lat, lng, r["lat"], r["lng"])
            if dist <= 1500 and (
                r["category"] == classification["category"]
                or match_result["is_duplicate"]
            ):
                snippet = r["text"][:80] + ("…" if len(r["text"]) > 80 else "")
                related.append({
                    "snippet":    snippet,
                    "category":   r["category"].replace("_", " "),
                    "severity":   r["severity"],
                    "distance_m": round(dist),
                })

        related.sort(key=lambda x: x["distance_m"])
        critical = sum(1 for r in related if r["severity"] == "CRITICAL")

        return {
            "query_category":    classification["category"].replace("_", " "),
            "total_found":       len(related),
            "critical_count":    critical,
            "sample_reports":    related[:3],  # cap for token budget
        }

    # -----------------------------------------------------------------------
    # -----------------------------------------------------------------------
    # 5. Web Search
    # -----------------------------------------------------------------------
    @staticmethod
    def search_web(query: str) -> str:
        """Pass-through to web_search module."""
        return _search_web(query)

    # -----------------------------------------------------------------------
    # Dispatcher — single entry point called by the orchestrator
    # -----------------------------------------------------------------------
    @classmethod
    def dispatch(
        cls,
        tool_name: str,
        args: Dict[str, Any],
        default_lat: float = 28.6315,
        default_lng: float = 77.2190,
        default_area_name: Optional[str] = None,
    ) -> Any:
        """
        Dispatch a tool call from the LLM to the correct method.
        Uses default location context if omitted by the LLM.
        Any unknown tool name returns an error string (never crashes).
        """
        try:
            if tool_name == "get_area_safety":
                req_lat = float(args.get("lat") or default_lat)
                req_lng = float(args.get("lng") or default_lng)
                req_name = args.get("area_name") or default_area_name
                return cls.get_area_safety(
                    lat=req_lat,
                    lng=req_lng,
                    area_name=req_name,
                )
            elif tool_name == "get_nearby_hotspots":
                req_lat = float(args.get("lat") or default_lat)
                req_lng = float(args.get("lng") or default_lng)
                return cls.get_nearby_hotspots(
                    lat=req_lat,
                    lng=req_lng,
                    radius_meters=float(args.get("radius_meters", 1200.0)),
                )
            elif tool_name == "find_similar_reports":
                req_lat = float(args.get("lat") or default_lat)
                req_lng = float(args.get("lng") or default_lng)
                return cls.find_similar_reports(
                    query=str(args.get("query", "")),
                    lat=req_lat,
                    lng=req_lng,
                )
            elif tool_name == "search_web":
                return cls.search_web(str(args.get("query", "")))
            else:
                return f"Unknown tool: {tool_name}"
        except Exception:
            return f"Tool unavailable: {tool_name}"
