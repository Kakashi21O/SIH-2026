import uuid
from fastapi import APIRouter, HTTPException
from backend.models.schemas import (
    EmergencyTriggerRequest, EmergencyTriggerResponse,
    EmergencyEscalationRequest, IncidentReportResponse
)
from backend.services.emergency_engine import EmergencyOrchestrator
from backend.services.risk_engine import evaluate_location_risk
from backend.database.database import get_db_connection

router = APIRouter(prefix="/api/emergency", tags=["Emergency Engine"])

# In-memory pending verification registry for 10-second lifecycle checks
active_verifications = {}

@router.post("/trigger", response_model=EmergencyTriggerResponse)
def trigger_emergency(payload: EmergencyTriggerRequest):
    """
    Trigger emergency detection: Starts the 10-second client-side & server-side verification countdown.
    """
    verification_token = f"tok_{uuid.uuid4().hex[:12]}"
    active_verifications[verification_token] = {
        "user_id": payload.user_id,
        "lat": payload.lat,
        "lng": payload.lng,
        "trigger_source": payload.trigger_source,
        "distress_keyword": payload.distress_keyword
    }

    return EmergencyTriggerResponse(
        countdown_seconds=10,
        verification_token=verification_token,
        message="Distress detected. 10-second verification countdown active. Enter PIN to abort.",
        status="COUNTDOWN_ACTIVE"
    )

@router.post("/escalate", response_model=IncidentReportResponse)
def escalate_emergency(payload: EmergencyEscalationRequest):
    """
    Escalate after 10-second verification timeout or direct urgent trigger.
    Calculates severity and triggers Guardian & 112 dispatch simulation.
    """
    # Assess zone risk level for contextual severity calculation
    risk_info = evaluate_location_risk(payload.lat, payload.lng)
    
    incident = EmergencyOrchestrator.escalate_emergency(
        user_id=payload.user_id or "usr_demo",
        lat=payload.lat,
        lng=payload.lng,
        trigger_source=payload.trigger_source,
        zone_risk_level=risk_info["risk_level"]
    )

    return IncidentReportResponse(**incident)

@router.get("/incidents", response_model=list[IncidentReportResponse])
def list_incidents():
    """List historical incident logs."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM incidents ORDER BY created_at DESC LIMIT 10")
    rows = cursor.fetchall()
    conn.close()

    results = []
    for r in rows:
        results.append(
            IncidentReportResponse(
                id=r["id"],
                user_id=r["user_id"],
                timestamp=str(r["created_at"]),
                lat=r["lat"],
                lng=r["lng"],
                trigger_source=r["trigger_source"],
                severity_score=r["severity_score"],
                severity_level=r["severity_level"],
                guardian_notified=bool(r["guardian_notified"]),
                emergency_dispatched=bool(r["emergency_dispatched"]),
                audio_captured=bool(r["audio_captured"]),
                status=r["status"],
                actions_taken=[f"Incident logged with status {r['status']}"]
            )
        )
    return results
