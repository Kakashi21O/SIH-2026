"""
SafeSteps — AI Assistant Orchestrator (ai_assistant.py)

Replaces the previous keyword-matching engine with a real LLM integration
using OpenRouter → qwen/qwen3-30b-a3b:free.

Flow:
  1. Emergency guardrail (instant, no LLM involved)
  2. Build token-efficient system prompt with user context
  3. Round 1: send user message + tool definitions to LLM
  4. LLM picks tool(s) → backend dispatches each → collect results
  5. Round 2: send tool results → LLM generates final natural-language answer
  6. Graceful fallback if OpenRouter is unavailable

Security:
  - LLM never receives raw SQL results
  - Sensitive queries (PIN, password, phone) are refused before reaching LLM
  - Emergency messages bypass LLM entirely for zero-latency response
"""

import datetime
import json
from typing import Any, Dict, List, Optional

from backend.services.openrouter_client import OpenRouterClient
from backend.services.ai_tools import SafeStepsTools, TOOL_DEFINITIONS


# ---------------------------------------------------------------------------
# Emergency keywords — bypass LLM for instant response
# ---------------------------------------------------------------------------
_EMERGENCY_TERMS = {
    "help", "being followed", "someone following", "chasing", "chased",
    "in danger", "stalker", "stalking", "attack", "knife", "weapon",
    "sos", "emergency", "save me", "bachao", "chhod", "assault",
}
_SAFE_PREFIXES = {"how does", "explain", "what is", "tell me about", "does"}

_DENIED_QUERIES = {
    "pin", "password", "phone number", "my number", "otp",
    "guardian phone", "guardian number", "other user", "all users",
}


def _is_emergency(msg: str) -> bool:
    m = msg.lower()
    if any(p in m for p in _SAFE_PREFIXES):
        return False
    return any(t in m for t in _EMERGENCY_TERMS)


def _is_denied_query(msg: str) -> bool:
    m = msg.lower()
    return any(t in m for t in _DENIED_QUERIES)


# ---------------------------------------------------------------------------
# System prompt builder
# ---------------------------------------------------------------------------

def _build_system_prompt(
    lat: float,
    lng: float,
    area_name: Optional[str] = None,
    user_name: Optional[str] = None,
) -> str:
    loc = f"User area: '{area_name}' ({lat:.4f}, {lng:.4f})" if area_name else f"User coords: {lat:.4f}, {lng:.4f}"
    usr = f" User name: {user_name}." if user_name else ""

    return (
        f"You are SafeSteps AI, Delhi NCR women safety buddy. {loc}.{usr}\n"
        "Style:\n"
        "- Casual, natural Hinglish. Direct, realistic, like a helpful friend.\n"
        "- Give short answers in 2 to 3 sentences. No long bullet lists unless asked. Expand only when user asks.\n"
        "- Absolutely NO emojis.\n"
        "- No repetition or generic disclaimers.\n"
        "- 'this area' / 'here' = user area above. Call get_area_safety and get_nearby_hotspots.\n"
        "- If user asks about their name or profile, call get_current_user.\n"
        "- Never share PIN, passwords, phone numbers, or guardian data.\n"
        "- In immediate danger, tell them to press the SOS button.\n"
        "- Never make up numbers. Use tool data only."
    )


# ---------------------------------------------------------------------------
# Canned responses (no emojis, casual Hinglish, direct)
# ---------------------------------------------------------------------------

_EMERGENCY_RESPONSE = {
    "reply": (
        "Agar aap abhi danger me hain toh turant SOS button dabaiye. "
        "AI police dispatch nahi kar sakta. SOS button se 10-second countdown start hoga, "
        "guardians ko live location jayegi aur 112 emergency dispatch trigger hoga."
    ),
    "sources":         ["emergency_guardrail"],
    "structured_data": {"urgent_action_required": True},
}

_DENIED_RESPONSE = {
    "reply": (
        "Security reasons ki wajah se PIN, password, phone number ya personal data share karna allowed nahi hai. "
        "Settings screen me jakar details check kar sakte hain."
    ),
    "sources":         ["privacy_guardrail"],
    "structured_data": None,
}

_NO_KEY_RESPONSE = {
    "reply": (
        "AI assistant currently configured nahi hai. "
        "Baaki features jaise Map, Journey, aur SOS normally chal rahe hain."
    ),
    "sources":         ["config_error"],
    "structured_data": None,
}


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------

class SafeStepsAIAssistant:

    @classmethod
    def process_query(
        cls,
        message: str,
        lat: Optional[float]       = None,
        lng: Optional[float]       = None,
        context: Optional[Dict[str, Any]] = None,
        user_id: Optional[str]     = None,
    ) -> Dict[str, Any]:
        """
        Process a conversational query through the LLM tool-calling pipeline.

        Returns:
            {
                "reply":          str,
                "sources":        List[str],
                "structured_data": Optional[Dict]
            }
        """
        # --- Defaults ---
        message  = (message or "").strip()
        context  = context or {}
        lat      = lat  if lat  not in (None, 0.0) else context.get("lat",  28.6315)
        lng      = lng  if lng  not in (None, 0.0) else context.get("lng",  77.2190)
        user_id  = user_id or context.get("user_id") or "usr_demo"

        if not message:
            return {
                "reply": "Batao, kahan ki safety check karni hai ya route verify karna hai?",
                "sources":         ["greeting"],
                "structured_data": None,
            }

        # 1. Pre-LLM guardrails
        if _is_emergency(message):
            return _EMERGENCY_RESPONSE

        if _is_denied_query(message):
            return _DENIED_RESPONSE

        from backend.config import settings
        if not settings.OPENROUTER_API_KEY:
            return _NO_KEY_RESPONSE

        # 2. Build system prompt with current area name and user's coordinates
        area_name = context.get("area_name")
        system_prompt = _build_system_prompt(lat=lat, lng=lng, area_name=area_name)

        # 3. Round 1 — send message + tool definitions
        round1 = OpenRouterClient.chat_with_tools(
            system_prompt=system_prompt,
            user_message=message,
            tools=TOOL_DEFINITIONS,
        )

        # Handle round-1 errors / direct answers
        if round1["type"] == "error":
            return {
                "reply":           round1["content"],
                "sources":         ["openrouter_error"],
                "structured_data": None,
            }

        if round1["type"] == "text":
            # LLM answered directly without needing tools
            return {
                "reply":           round1["content"] or "I'm not sure how to answer that. Try asking about a specific area.",
                "sources":         ["llm_direct"],
                "structured_data": None,
            }

        # 4. Dispatch tool calls
        tool_calls  = round1["calls"]
        tool_results: List[Dict[str, Any]] = []
        sources_used: List[str] = []

        for tc in tool_calls:
            name   = tc["name"]
            args   = tc["args"]
            result = SafeStepsTools.dispatch(
                name,
                args,
                default_lat=lat,
                default_lng=lng,
                default_area_name=area_name,
                default_user_id=user_id,
            )
            sources_used.append(name)

            # Serialise result to string for the LLM
            if isinstance(result, (dict, list)):
                result_str = json.dumps(result, ensure_ascii=False)
            else:
                result_str = str(result)

            tool_results.append({
                "tool_call_id": tc["id"],
                "name":         name,
                "content":      result_str,
            })

        # 5. Round 2 — inject tool results, get final answer
        final_answer = OpenRouterClient.chat_with_tool_results(
            system_prompt=system_prompt,
            user_message=message,
            tool_calls_message=round1["raw_message"],
            tool_results=tool_results,
        )

        if not final_answer or not final_answer.strip():
            final_answer = (
                "I retrieved the safety data but couldn't format a response. "
                "Please try rephrasing your question."
            )

        return {
            "reply":           final_answer.strip(),
            "sources":         sources_used if sources_used else ["llm_direct"],
            "structured_data": None,
        }
