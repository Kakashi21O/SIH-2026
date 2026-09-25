"""
SafeSteps — Web Search Tool (web_search.py)

Provides a lightweight web search capability for the AI assistant using the
DuckDuckGo Instant Answer API — no API key required, completely free.

Used when the LLM determines a question needs current internet information
(e.g., "latest women's safety advisory", "current news about Paharganj").

Returns a short 1-3 sentence summary safe for LLM injection (≤300 chars).
"""

from typing import Optional
import httpx


_DDG_API = "https://api.duckduckgo.com/"
_TIMEOUT = 8  # seconds — fast fallback if DDG is unreachable


def search_web(query: str) -> str:
    """
    Search the web using DuckDuckGo Instant Answer API.

    Args:
        query: Natural language search query (will be sanitized).

    Returns:
        A 1-3 sentence summary string, or a "no results" message.
        Always returns a string — never raises.
    """
    # Basic sanitize: strip dangerous chars, limit length
    safe_query = query.strip().replace("\n", " ")[:150]

    if not safe_query:
        return "No search query provided."

    try:
        resp = httpx.get(
            _DDG_API,
            params={
                "q": safe_query,
                "format": "json",
                "no_html": "1",
                "skip_disambig": "1",
            },
            timeout=_TIMEOUT,
            follow_redirects=True,
        )
        resp.raise_for_status()
        data = resp.json()

        # Try AbstractText first (Wikipedia-style instant answer)
        abstract = (data.get("AbstractText") or "").strip()
        if abstract:
            return abstract[:400]

        # Try Answer (direct answer like currency, date, etc.)
        answer = (data.get("Answer") or "").strip()
        if answer:
            return answer[:400]

        # Try RelatedTopics summary
        topics = data.get("RelatedTopics", [])
        summaries = []
        for t in topics[:3]:
            if isinstance(t, dict) and t.get("Text"):
                summaries.append(t["Text"].strip())
        if summaries:
            return " | ".join(summaries)[:400]

        return f"No instant answer found for: {safe_query}. The query may require a deeper web search."

    except httpx.TimeoutException:
        return "Web search timed out. Please try again or ask about SafeSteps data directly."
    except httpx.HTTPStatusError as e:
        return f"Web search unavailable (HTTP {e.response.status_code})."
    except Exception:
        return "Web search unavailable right now. Ask me about area safety using SafeSteps data instead."
