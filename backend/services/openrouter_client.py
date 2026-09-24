"""
SafeSteps — OpenRouter LLM Client (openrouter_client.py)

Thin synchronous HTTP client wrapping the OpenRouter /chat/completions endpoint.
Uses httpx (already in requirements.txt) with a 15s timeout.

Token budget:
  System prompt   : ≤ 400 tokens
  Tool data       : ≤ 600 tokens
  Max response    : ≤ 350 tokens
  Total budget    : ≤ 1350 tokens  (well within free tier limits)

Raises no exceptions to callers — always returns a result dict.
"""

import json
from typing import Any, Dict, List, Optional

import httpx

from backend.config import settings


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _build_headers() -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://safesteps.onrender.com",
        "X-Title": "SafeSteps AI Assistant",
    }


def _trim(text: str, max_chars: int = 1200) -> str:
    """Hard-trim a string to stay inside token budget (approx 4 chars/token)."""
    return text[:max_chars] if len(text) > max_chars else text


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class OpenRouterClient:
    """
    Wraps OpenRouter /chat/completions with tool-calling support.
    All methods are synchronous (FastAPI runs them in a thread pool via `def`).
    """

    BASE_URL = settings.OPENROUTER_BASE_URL
    MODEL    = settings.OPENROUTER_MODEL
    TIMEOUT  = 20  # seconds

    # ------------------------------------------------------------------
    # Round 1: send message + tool definitions → get tool_call or text
    # ------------------------------------------------------------------
    @classmethod
    def chat_with_tools(
        cls,
        system_prompt: str,
        user_message: str,
        tools: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Send the initial user message with tool definitions.
        Returns either:
          {"type": "tool_calls", "calls": [{"name": ..., "args": {...}, "id": ...}]}
          {"type": "text", "content": "..."}
          {"type": "error", "content": "..."}
        """
        if not settings.OPENROUTER_API_KEY:
            return {"type": "error", "content": "OpenRouter API key not configured."}

        messages = [
            {"role": "system", "content": _trim(system_prompt, 1600)},
            {"role": "user",   "content": _trim(user_message, 400)},
        ]

        models_list = getattr(settings, "OPENROUTER_FALLBACK_MODELS", [cls.MODEL])
        payload: Dict[str, Any] = {
            "models": models_list,
            "messages": messages,
            "tools": tools,
            "tool_choice": "auto",
            "max_tokens": 180,
            "temperature": 0.3,
        }

        try:
            resp = httpx.post(
                f"{cls.BASE_URL}/chat/completions",
                headers=_build_headers(),
                json=payload,
                timeout=cls.TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
            choice = data["choices"][0]["message"]

            # Model chose to call a tool
            if choice.get("tool_calls"):
                calls = []
                for tc in choice["tool_calls"]:
                    fn = tc["function"]
                    try:
                        args = json.loads(fn.get("arguments", "{}"))
                    except json.JSONDecodeError:
                        args = {}
                    calls.append({"id": tc["id"], "name": fn["name"], "args": args})
                return {"type": "tool_calls", "calls": calls, "raw_message": choice}

            # Model answered directly
            content = choice.get("content") or ""
            return {"type": "text", "content": content.strip()}

        except httpx.TimeoutException:
            return {"type": "error", "content": "AI response timed out. Please try again."}
        except httpx.HTTPStatusError as e:
            return {"type": "error", "content": f"AI service error ({e.response.status_code})."}
        except Exception:
            return {"type": "error", "content": "AI service unavailable. Please try again."}

    # ------------------------------------------------------------------
    # Round 2: send tool results → get final natural-language answer
    # ------------------------------------------------------------------
    @classmethod
    def chat_with_tool_results(
        cls,
        system_prompt: str,
        user_message: str,
        tool_calls_message: Dict[str, Any],
        tool_results: List[Dict[str, Any]],
    ) -> str:
        """
        Inject tool results and get the final LLM answer.
        tool_results: [{"tool_call_id": ..., "name": ..., "content": "..."}]
        Returns: plain text answer string.
        """
        if not settings.OPENROUTER_API_KEY:
            return "OpenRouter API key not configured."

        messages = [
            {"role": "system",    "content": _trim(system_prompt, 1600)},
            {"role": "user",      "content": _trim(user_message, 400)},
            {"role": "assistant", **{k: v for k, v in tool_calls_message.items() if k != "type"}},
        ]
        for tr in tool_results:
            messages.append({
                "role":         "tool",
                "tool_call_id": tr["tool_call_id"],
                "name":         tr["name"],
                "content":      _trim(str(tr["content"]), 600),
            })

        models_list = getattr(settings, "OPENROUTER_FALLBACK_MODELS", [cls.MODEL])
        payload: Dict[str, Any] = {
            "models":     models_list,
            "messages":   messages,
            "max_tokens": 350,
            "temperature": 0.3,
        }

        try:
            resp = httpx.post(
                f"{cls.BASE_URL}/chat/completions",
                headers=_build_headers(),
                json=payload,
                timeout=cls.TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
            return (data["choices"][0]["message"].get("content") or "").strip()

        except httpx.TimeoutException:
            return "AI response timed out. Please try again."
        except httpx.HTTPStatusError as e:
            return f"AI service error ({e.response.status_code}). Please try again."
        except Exception:
            return "AI service unavailable. Please try again."

    # ------------------------------------------------------------------
    # Simple single-turn chat (no tools) — used for fallback
    # ------------------------------------------------------------------
    @classmethod
    def chat_simple(cls, system_prompt: str, user_message: str) -> str:
        """Single-turn chat without tool definitions."""
        if not settings.OPENROUTER_API_KEY:
            return "OpenRouter API key not configured."

        models_list = getattr(settings, "OPENROUTER_FALLBACK_MODELS", [cls.MODEL])
        payload: Dict[str, Any] = {
            "models": models_list,
            "messages": [
                {"role": "system", "content": _trim(system_prompt, 1600)},
                {"role": "user",   "content": _trim(user_message, 400)},
            ],
            "max_tokens": 300,
            "temperature": 0.4,
        }

        try:
            resp = httpx.post(
                f"{cls.BASE_URL}/chat/completions",
                headers=_build_headers(),
                json=payload,
                timeout=cls.TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
            return (data["choices"][0]["message"].get("content") or "").strip()
        except Exception:
            return "AI service unavailable. Please try again."
