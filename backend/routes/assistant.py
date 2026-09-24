"""
SafeSteps — AI Assistant Router (assistant.py)
Exposes POST /api/assistant/chat
"""

import logging

from fastapi import APIRouter
from backend.models.schemas import AssistantChatRequest, AssistantChatResponse
from backend.services.ai_assistant import SafeStepsAIAssistant

router = APIRouter(prefix="/api/assistant", tags=["SafeSteps AI Assistant"])
logger = logging.getLogger(__name__)


@router.post("/chat", response_model=AssistantChatResponse)
def chat_with_assistant(payload: AssistantChatRequest):
    """
    Query the SafeSteps AI Assistant.

    Routes conversational questions through the OpenRouter LLM with controlled
    tool access to area safety data, hotspots, complaint reports, and web search.
    Never exposes PIN, phone, passwords, or other users' data.
    """
    try:
        result = SafeStepsAIAssistant.process_query(
            message=payload.message,
            lat=payload.lat,
            lng=payload.lng,
            context=payload.context,
        )
        return AssistantChatResponse(**result)
    except Exception:
        # Non-blocking graceful failure — app features continue working
        logger.exception("Assistant request failed")
        return AssistantChatResponse(
            reply=(
                "I couldn't process that right now. "
                "All SafeSteps map, journey, and emergency features continue working normally."
            ),
            sources=["fallback_handler"],
            structured_data=None,
        )
