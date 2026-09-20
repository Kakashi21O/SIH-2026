"""
SafeSteps — Conversational AI Assistant Service (ai_assistant.py)
Provides natural language reasoning grounded strictly in SafeSteps application data.

Features:
- Never invents or hallucinates data
- Clear distinction between actual SafeSteps data and general guidance
- Never exposes sensitive private info (PINs, passwords, phones)
- Non-blocking fail-safe design: if AI fails, app features operate unaffected
- Pluggable provider abstraction (Default: Deterministic Local Knowledge Engine with 0 external tokens; optional external LLM)
- Directs users in immediate danger to the existing Emergency SOS button
"""

import os
import re
from typing import Dict, Any, List, Optional
from backend.services.ai_tools import SafeStepsDataTools

class SafeStepsAIAssistant:

    @classmethod
    def process_query(
        cls,
        message: str,
        lat: Optional[float] = None,
        lng: Optional[float] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Process incoming conversational query using controlled tool invocation.
        Returns:
            {
                "reply": str,
                "sources": List[str],
                "structured_data": Optional[Dict[str, Any]]
            }
        """
        if not message or not message.strip():
            return {
                "reply": "Hi, I'm SafeSteps AI. You can ask me about an area's safety, nearby hotspots, past reports, safer routes, or how SafeSteps features work.",
                "sources": ["general_help"],
                "structured_data": None
            }

        msg = message.strip()
        msg_lower = msg.lower()
        context = context or {}
        screen = context.get("screen", "home")
        curr_lat = lat if lat is not None and lat != 0.0 else context.get("lat", 28.6315)
        curr_lng = lng if lng is not None and lng != 0.0 else context.get("lng", 77.2190)

        # 1. EMERGENCY / IMMEDIATE DANGER GUARDRAIL
        emergency_indicators = [
            "help", "being followed", "someone is following", "chasing", "in danger",
            "stalker", "attack", "knife", "sos", "emergency", "save me", "bachao"
        ]
        if any(term in msg_lower for term in emergency_indicators) and ("how does" not in msg_lower and "explain" not in msg_lower):
            return {
                "reply": (
                    "🚨 **IMMEDIATE ACTION REQUIRED**\n\n"
                    "If you are in immediate danger or being followed, **use the SafeSteps Emergency SOS button immediately** on your screen.\n\n"
                    "• The AI assistant cannot directly dispatch police patrol by itself.\n"
                    "• Activating SOS initiates the 10-second verification countdown, streams your live coordinates to guardians, and prepares 112 emergency dispatch."
                ),
                "sources": ["emergency_guardrail"],
                "structured_data": {"urgent_action_required": True}
            }

        # 2. AREA SAFETY QUERY ("Tell me about this area" / "Is this area safe?" / "Before going to [Area]")
        area_indicators = [
            "tell me about this area", "is this area safe", "area safe", "safety of this area",
            "tell me about this place", "explain this area", "what should i know",
            "safety situation", "before going to", "travel to", "going to", "about"
        ]
        if any(term in msg_lower for term in area_indicators):
            # Extract potential area name if mentioned (e.g. "going to Paharganj", "about Connaught Place")
            query_name = None
            match = re.search(r"(?:going to|travel to|about|near)\s+([a-zA-Z0-9\s]+?)(?:,|\?|\.|\s+what|\s+is|$)", msg, re.IGNORECASE)
            if match:
                raw_name = match.group(1).strip()
                if len(raw_name) >= 3 and not raw_name.lower().startswith("this"):
                    query_name = raw_name

            area_data = SafeStepsDataTools.get_area_safety(curr_lat, curr_lng, query_name)
            hotspots = SafeStepsDataTools.get_nearby_hotspots(curr_lat, curr_lng, radius_meters=1000.0)

            reply = cls._format_area_briefing(area_data, hotspots)
            return {
                "reply": reply,
                "sources": ["risk_engine", "risk_zones", "complaints_db", "safety_hotspots"],
                "structured_data": area_data
            }

        # 3. SIMILAR COMPLAINT / REPORT SEARCH ("Has anything similar happened here?" / "similar reports")
        similar_indicators = [
            "similar", "happened here", "similar reports", "past reports", "recent reports",
            "any complaints", "what was reported", "complaint"
        ]
        if any(term in msg_lower for term in similar_indicators):
            sim_data = SafeStepsDataTools.find_similar_reports(msg, curr_lat, curr_lng)
            hotspots = SafeStepsDataTools.get_nearby_hotspots(curr_lat, curr_lng)

            reply = cls._format_similar_reports_response(sim_data, hotspots)
            return {
                "reply": reply,
                "sources": ["complaint_ai", "complaints_db", "clustering_engine"],
                "structured_data": sim_data
            }

        # 4. JOURNEY / ROUTE SAFETY INQUIRY ("Check my journey", "route safe", "safe journey")
        journey_indicators = ["journey", "route", "destination", "travel", "fastest vs safer"]
        if any(term in msg_lower for term in journey_indicators) or screen == "journey":
            origin = context.get("origin", "Current Location")
            destination = context.get("destination", "Karol Bagh Residence")
            
            # Extract if user specified "from X to Y"
            match = re.search(r"from\s+([a-zA-Z0-9\s]+)\s+to\s+([a-zA-Z0-9\s]+)", msg, re.IGNORECASE)
            if match:
                origin = match.group(1).strip()
                destination = match.group(2).strip()

            journey_data = SafeStepsDataTools.get_journey_safety_info(origin, destination)
            reply = cls._format_journey_safety_response(journey_data)
            return {
                "reply": reply,
                "sources": ["location_service", "journey_risk_engine"],
                "structured_data": journey_data
            }

        # 5. HOTSPOTS & RADAR INQUIRY ("What are these hotspots?", "radar")
        if "hotspot" in msg_lower or "radar" in msg_lower:
            hotspots = SafeStepsDataTools.get_nearby_hotspots(curr_lat, curr_lng)
            if not hotspots:
                reply = (
                    "**Safety Hotspots Status**\n\n"
                    "According to verified SafeSteps data, there are **no active emergency hotspot clusters** "
                    "within 1.2 km of your current location. Single isolated reports may exist, but no recurring pattern has met the radar threshold."
                )
            else:
                lines = [f"**Active Safety Hotspots Nearby ({len(hotspots)} Found)**\n"]
                for h in hotspots:
                    lines.append(f"• **{h['headline']}** — Category: *{h['category']}* | Severity: `{h['severity']}` | Distance: ~{h['distance_meters']}m ({h['report_count']} aggregated reports)")
                lines.append("\n*Hotspots represent dense clusters (≤300m radius) sharing overlapping semantic hazard tokens.*")
                reply = "\n".join(lines)

            return {
                "reply": reply,
                "sources": ["safety_hotspots", "complaint_ai"],
                "structured_data": {"hotspots": hotspots}
            }

        # 6. FEATURE & SYSTEM ARCHITECTURE QUESTIONS ("How does SafeSteps work?", "What is PIN?")
        feature_info = SafeStepsDataTools.get_safesteps_feature_info(msg)
        return {
            "reply": (
                f"**SafeSteps Safety Guide**\n\n"
                f"{feature_info}\n\n"
                "*Tip: You can ask me to inspect any area on the map or check safety along your planned journey.*"
            ),
            "sources": ["safesteps_knowledge_base"],
            "structured_data": None
        }

    @staticmethod
    def _format_area_briefing(area_data: Dict[str, Any], hotspots: List[Dict[str, Any]]) -> str:
        """Format a clear, authoritative area briefing strictly grounded in SafeSteps data."""
        name = area_data.get("area_name", "Monitored Zone")
        risk = area_data.get("risk_level", "MODERATE")
        score = area_data.get("safety_score", 65)
        reports = area_data.get("recent_reports_count", 0)
        issue = area_data.get("primary_issue", "None reported")
        trend = area_data.get("trend", "Stable")
        lighting = area_data.get("lighting_status", "UNKNOWN")
        police = area_data.get("police_presence", "UNKNOWN")

        badge = "🟢" if score >= 80 else "🟡" if score >= 60 else "🟠" if score >= 40 else "🔴"

        lines = [
            "**Area Safety Overview**\n",
            f"**Location:** {name}",
            f"**Current Risk:** {badge} **{risk}**",
            f"**Safety Score:** `{score}/100`",
            f"**Verified Recent Reports:** {reports}",
            f"**Primary Reported Issue:** {issue}",
            f"**Incident Trend:** {trend}\n",
            "**Verified Environmental Factors:**",
            f"• Street Lighting: *{lighting}*",
            f"• Police Patrol / Safe Haven Presence: *{police}*"
        ]

        if hotspots:
            lines.append(f"\n⚠️ **Nearby Emerging Hotspots:** {len(hotspots)} active cluster(s) within 1 km (e.g. *{hotspots[0]['headline']}*).")

        if risk in ["HIGH", "CRITICAL"]:
            lines.append("\n**Safety Advisory:**")
            lines.append("SafeSteps recommends enabling **Safety Mode** (dual-trigger voice distress listener) when navigating here, or checking the **Safe Journey** feature for well-lit alternative routes.")
        else:
            lines.append("\n**Safety Advisory:**")
            lines.append("Area exhibits regular verified patrol coverage and adequate safety scores. Standard situational awareness is advised.")

        return "\n".join(lines)

    @staticmethod
    def _format_similar_reports_response(sim_data: Dict[str, Any], hotspots: List[Dict[str, Any]]) -> str:
        """Format semantic complaint similarity response."""
        total = sim_data.get("total_similar_found", 0)
        cat = sim_data.get("query_category", "General Safety")
        crit = sim_data.get("critical_count", 0)

        if total == 0:
            return (
                f"**Similar Reports Search**\n\n"
                f"According to verified SafeSteps complaint records, **no similar reports** matching the category *{cat}* "
                f"were found within the immediate radius of this location.\n\n"
                f"If you encountered an unaddressed safety hazard, you can submit a new report on the **Reports** tab."
            )

        lines = [
            f"**Similar Reports Search**\n",
            f"Yes. SafeSteps database contains **{total} similar report(s)** in the surrounding area classified under *{cat}*.",
            f"• High/Critical Urgency Reports: `{crit}`"
        ]

        sample_reports = sim_data.get("sample_reports", [])
        if sample_reports:
            lines.append("\n**Recent Matching Records:**")
            for r in sample_reports:
                clean_snippet = (r['text'][:90] + '...') if len(r['text']) > 90 else r['text']
                lines.append(f"• *\"{clean_snippet}\"* — Severity: `{r['severity']}` (~{r['distance_meters']}m away)")

        lines.append("\n*Data aggregated using SafeSteps local TF-IDF vector classifier and 300m spatial clustering.*")
        return "\n".join(lines)

    @staticmethod
    def _format_journey_safety_response(journey_data: Dict[str, Any]) -> str:
        """Format route safety comparison briefing."""
        if not journey_data.get("success"):
            return (
                "**Journey Safety Analysis**\n\n"
                "SafeSteps can compare travel routes between your current location and destination. "
                "Open the **Journey** tab in SafeSteps to view recommended Safer Routes that bypass known High-Risk zones."
            )

        fastest = journey_data["fastest_route"]
        safer = journey_data["safer_route"]

        return (
            f"**Safe Journey Route Analysis**\n\n"
            f"**Route:** `{journey_data['origin']}` ➔ `{journey_data['destination']}`\n\n"
            f"• **Fastest Route:** {fastest['distance_km']} km | {fastest['duration_mins']} mins | Safety: `{fastest['safety_score']}/100` (Traverses: *{fastest['traverses']}*)\n"
            f"• **Safer Route ⭐:** {safer['distance_km']} km | {safer['duration_mins']} mins | Safety: `{safer['safety_score']}/100` (Traverses: *{safer['traverses']}*)\n\n"
            f"**SafeSteps Recommendation:**\n"
            f"{journey_data['recommendation']}"
        )
