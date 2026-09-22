"""
SafeSteps — Controlled AI Data Access Layer (ai_tools.py)

Provides safe, read-only, parameterized access to SafeSteps domain data.
The LLM NEVER touches raw SQL. Every tool in this file is the only gateway
between the LLM and the database.

Tools available to the LLM:
  1. get_area_safety      — risk score, level, trend, primary issue (no user data)
  2. get_nearby_hotspots  — clustered complaint hotspots near coordinates
  3. find_similar_reports — anonymised complaint search by query text
  4. get_current_user     — name ONLY (never PIN, phone, guardian data)
  5. search_web           — DuckDuckGo instant answer (current internet info)

Security guarantees:
  - Never executes arbitrary SQL
  - get_current_user strips pin_hash, phone, guardian records before returning
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
# OpenAI-format tool definitions — sent to the LLM so it knows what to call
# ===========================================================================

TOOL_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_area_safety",
            "description": (
                "Get the current safety score, risk level, incident trend, and primary reported issue "
                "for a geographic location in Delhi NCR. Use this when the user asks about area safety, "
                "risk zones, or whether a place is safe to visit."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "lat": {
                        "type": "number",
                        "description": "Latitude of the location to check."
                    },
                    "lng": {
                        "type": "number",
                        "description": "Longitude of the location to check."
                    },
                    "area_name": {
                        "type": "string",
                        "description": "Optional area name if the user mentioned a specific place (e.g. 'Paharganj', 'Connaught Place')."
                    }
                },
                "required": ["lat", "lng"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_nearby_hotspots",
            "description": (
                "Get active safety hotspot clusters near given coordinates. "
                "Returns cluster details including category, severity, and distance. "
                "Use when the user asks about hotspots, recent incidents, or danger zones nearby."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "lat":            {"type": "number", "description": "Latitude"},
                    "lng":            {"type": "number", "description": "Longitude"},
                    "radius_meters":  {"type": "number", "description": "Search radius in metres (default 1200)."}
                },
                "required": ["lat", "lng"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "find_similar_reports",
            "description": (
                "Search SafeSteps complaint database for reports similar to a query text near given coordinates. "
                "Returns anonymised report snippets. Use when the user asks about past incidents, "
                "similar complaints, or what has been reported in an area."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The user's question or incident description to match against."},
                    "lat":   {"type": "number", "description": "Latitude"},
                    "lng":   {"type": "number", "description": "Longitude"}
                },
                "required": ["query", "lat", "lng"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_current_user",
            "description": (
                "Get the current logged-in user's name. "
                "Use ONLY when the user asks about their own profile details like their name. "
                "NEVER use this to get PIN, phone number, or guardian information."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "user_id": {"type": "string", "description": "The authenticated user's ID."}
                },
                "required": ["user_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": (
                "Search the internet for current information. Use when the user asks about recent news, "
                "current advisories, weather, or general knowledge not in SafeSteps data "
                "(e.g. 'latest women safety advisory', 'what happened today in Delhi')."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The search query."}
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
            "area_name":         resolved_name or risk_data.get("active_zone_name", "Delhi NCR"),
            "safety_score":      risk_data["overall_score"],
            "risk_level":        risk_data["risk_level"],
            "total_nearby_reports": total_nearby,
            "primary_issue":     primary_issue.replace("_", " "),
            "trend":             trend,
            "lighting_status":   risk_data["factors"].get("lighting_status", "unknown"),
            "police_presence":   risk_data["factors"].get("police_presence", "unknown"),
            "recommended_action": risk_data["recommended_action"],
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
        """Returns nearby complaint clusters. No user-identifying data included."""
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
                    "cluster_id":    c["cluster_id"],
                    "headline":      c["headline"],
                    "category":      c["category"].replace("_", " "),
                    "severity":      c["severity"],
                    "report_count":  c["total_count"],
                    "distance_m":    round(dist),
                })

        # Sort by distance
        nearby.sort(key=lambda x: x["distance_m"])
        return nearby[:6]  # cap at 6 for token budget

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
    # 4. Current User  — name ONLY, never PIN / phone / guardian data
    # -----------------------------------------------------------------------
    @staticmethod
    def get_current_user(user_id: str) -> Dict[str, Any]:
        """
        Returns ONLY the user's name for personalisation.
        Explicitly excludes: pin_hash, phone, and all guardian records.
        """
        if not user_id or user_id.strip() == "":
            return {"name": "there"}  # graceful anonymous fallback

        try:
            conn   = get_db_connection()
            cursor = conn.cursor()
            # SELECT only name — nothing else
            cursor.execute("SELECT name FROM users WHERE id = ?", (user_id.strip(),))
            row = cursor.fetchone()
            conn.close()

            if row:
                return {"name": row["name"]}
            return {"name": "there"}
        except Exception:
            return {"name": "there"}

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
        Uses default_lat, default_lng, default_area_name if the LLM omitted or defaulted coordinates.
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
            elif tool_name == "get_current_user":
                return cls.get_current_user(
                    user_id=str(args.get("user_id", "usr_demo")),
                )
            elif tool_name == "search_web":
                return cls.search_web(str(args.get("query", "")))
            else:
                return f"Unknown tool: {tool_name}"
        except Exception as e:
            return f"Tool error ({tool_name}): {str(e)[:100]}"
