"""
SafeSteps — AI Assistant Router (assistant.py)
Exposes POST /api/assistant/chat
Accepts conversational questions, area inquiries, and route questions,
responding with grounded insights from the SafeSteps engine.
"""

from fastapi import APIRouter, HTTPException
from backend.models.schemas import AssistantChatRequest, AssistantChatResponse
from backend.services.ai_assistant import SafeStepsAIAssistant

router = APIRouter(prefix="/api/assistant", tags=["SafeSteps AI Assistant"])

@router.post("/chat", response_model=AssistantChatResponse)
def chat_with_assistant(payload: AssistantChatRequest):
    """
    Query the SafeSteps AI Assistant.
    Answers area safety questions, similar report lookups, journey comparisons,
    and platform feature explanations using actual SafeSteps application data.
    """
    try:
        result = SafeStepsAIAssistant.process_query(
            message=payload.message,
            lat=payload.lat,
            lng=payload.lng,
            context=payload.context
        )
        return AssistantChatResponse(**result)
    except Exception as e:
        # Non-blocking graceful failure guardrail
        return AssistantChatResponse(
            reply=(
                "I couldn't access the safety data right now. "
                "You can still use the Map, Journey, and Emergency features normally."
            ),
            sources=["fallback_handler"],
            structured_data={"error": str(e)}
        )
