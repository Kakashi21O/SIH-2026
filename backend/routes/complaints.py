import uuid
import datetime
from fastapi import APIRouter
from backend.models.schemas import ComplaintCreateRequest, ComplaintResponse
from backend.database.database import get_db_connection

router = APIRouter(prefix="/api/complaints", tags=["Complaints & Hotspots"])

@router.post("", response_model=ComplaintResponse)
def submit_complaint(payload: ComplaintCreateRequest):
    """Submit a community safety concern/complaint."""
    comp_id = f"comp_{uuid.uuid4().hex[:6]}"
    created_at = datetime.datetime.utcnow().isoformat() + "Z"
    severity = "HIGH" if "dark" in payload.text.lower() or "stalk" in payload.text.lower() else "MODERATE"

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO complaints (id, user_id, text, category, lat, lng, severity, upvotes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            comp_id,
            payload.user_id or "usr_demo",
            payload.text,
            payload.category or "general_safety",
            payload.lat,
            payload.lng,
            severity,
            1,
            created_at
        )
    )
    conn.commit()
    conn.close()

    return ComplaintResponse(
        id=comp_id,
        user_id=payload.user_id or "usr_demo",
        text=payload.text,
        category=payload.category or "general_safety",
        lat=payload.lat,
        lng=payload.lng,
        severity=severity,
        upvotes=1,
        created_at=created_at
    )

@router.get("", response_model=list[ComplaintResponse])
def list_complaints():
    """Fetch recent community safety complaints."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM complaints ORDER BY created_at DESC LIMIT 20")
    rows = cursor.fetchall()
    conn.close()

    return [
        ComplaintResponse(
            id=r["id"],
            user_id=r["user_id"] or "anonymous",
            text=r["text"],
            category=r["category"],
            lat=r["lat"],
            lng=r["lng"],
            severity=r["severity"],
            upvotes=r["upvotes"] or 0,
            created_at=str(r["created_at"])
        )
        for r in rows
    ]
