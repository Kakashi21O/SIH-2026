import uuid
import datetime
import json
from fastapi import APIRouter, HTTPException
from backend.models.schemas import (
    ComplaintCreateRequest,
    ComplaintResponse,
    ComplaintAnalyzeRequest,
    ComplaintAnalyzeResponse,
    DuplicateCheckRequest,
    DuplicateCheckResponse,
    ComplaintClusterResponse
)
from backend.database.database import get_db_connection
from backend.services.complaint_ai import (
    classify_complaint_text,
    find_duplicate_report,
    group_reports_into_clusters
)

router = APIRouter(prefix="/api/complaints", tags=["Complaints & Hotspots"])

@router.post("/analyze", response_model=ComplaintAnalyzeResponse)
def analyze_complaint(payload: ComplaintAnalyzeRequest):
    """
    Real-time NLP analysis endpoint to preview AI categorization, confidence,
    and hazard severity before posting.
    """
    analysis = classify_complaint_text(payload.text)
    return ComplaintAnalyzeResponse(**analysis)

@router.post("/check-duplicate", response_model=DuplicateCheckResponse)
def check_duplicate(payload: DuplicateCheckRequest):
    """
    Checks if a matching hazard report already exists within 300m radius
    with high semantic similarity, enabling the user to confirm/upvote.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, text, category, lat, lng, severity, upvotes, cluster_id, created_at FROM complaints")
    rows = cursor.fetchall()
    conn.close()

    existing = [dict(r) for r in rows]
    match_result = find_duplicate_report(payload.text, payload.lat, payload.lng, existing)
    return DuplicateCheckResponse(**match_result)

@router.get("/clusters", response_model=list[ComplaintClusterResponse])
def list_clusters():
    """
    Returns aggregated issue clusters grouped by proximity (<= 300m)
    and semantic similarity.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, text, category, lat, lng, severity, upvotes, cluster_id, created_at FROM complaints")
    rows = cursor.fetchall()
    conn.close()

    reports = [dict(r) for r in rows]
    clusters = group_reports_into_clusters(reports)

    return [
        ComplaintClusterResponse(
            cluster_id=c["cluster_id"],
            category=c["category"],
            headline=c["headline"],
            severity=c["severity"],
            center_lat=round(c["center_lat"], 5),
            center_lng=round(c["center_lng"], 5),
            total_count=c["total_count"],
            upvotes_sum=c["upvotes_sum"],
            first_reported_at=str(c.get("first_reported_at") or "")
        )
        for c in clusters
    ]

@router.post("/{complaint_id}/upvote")
def upvote_complaint(complaint_id: str):
    """
    Upvote or confirm an existing safety hazard report.
    Increases verification weight and community validation.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, upvotes FROM complaints WHERE id = ?", (complaint_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Complaint not found")

    new_upvotes = (row["upvotes"] or 0) + 1
    cursor.execute("UPDATE complaints SET upvotes = ? WHERE id = ?", (new_upvotes, complaint_id))
    conn.commit()
    conn.close()

    return {"success": True, "complaint_id": complaint_id, "upvotes": new_upvotes}

@router.post("", response_model=ComplaintResponse)
def submit_complaint(payload: ComplaintCreateRequest):
    """Submit a community safety concern with automated AI NLP classification and spatial cluster assignment."""
    comp_id = f"comp_{uuid.uuid4().hex[:6]}"
    created_at = datetime.datetime.utcnow().isoformat() + "Z"

    # 1. Run AI analysis to detect category and severity
    nlp_result = classify_complaint_text(payload.text)
    category = payload.category if payload.category and payload.category != "auto" else nlp_result["category"]
    severity = nlp_result["severity"]

    # 2. Check for existing spatial cluster within 300m
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, text, category, lat, lng, severity, upvotes, cluster_id, created_at FROM complaints")
    existing_rows = cursor.fetchall()
    existing_reports = [dict(r) for r in existing_rows]

    dup_check = find_duplicate_report(payload.text, payload.lat, payload.lng, existing_reports)
    cluster_id = dup_check["cluster_id"] or f"cl_{category}_{uuid.uuid4().hex[:5]}"

    cursor.execute(
        """
        INSERT INTO complaints (id, user_id, text, category, lat, lng, severity, upvotes, cluster_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            comp_id,
            payload.user_id or "usr_demo",
            payload.text,
            category,
            payload.lat,
            payload.lng,
            severity,
            1,
            cluster_id,
            created_at
        )
    )

    # Dynamically increment complaint_count for the containing risk zone
    from backend.services.risk_engine import is_point_in_polygon
    cursor.execute("SELECT id, polygon_geojson FROM risk_zones")
    zone_rows = cursor.fetchall()
    for zr in zone_rows:
        try:
            geom = json.loads(zr["polygon_geojson"])
            if is_point_in_polygon(payload.lat, payload.lng, geom["coordinates"]):
                cursor.execute("UPDATE risk_zones SET complaint_count = complaint_count + 1 WHERE id = ?", (zr["id"],))
                break
        except Exception:
            pass

    conn.commit()
    conn.close()

    return ComplaintResponse(
        id=comp_id,
        user_id=payload.user_id or "usr_demo",
        text=payload.text,
        category=category,
        lat=payload.lat,
        lng=payload.lng,
        severity=severity,
        upvotes=1,
        created_at=created_at,
        confidence=nlp_result["confidence"],
        keywords=nlp_result["keywords"],
        cluster_id=cluster_id
    )

@router.get("", response_model=list[ComplaintResponse])
def list_complaints():
    """Fetch recent community safety complaints."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM complaints ORDER BY created_at DESC LIMIT 30")
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
            created_at=str(r["created_at"]),
            cluster_id=r["cluster_id"] if "cluster_id" in r.keys() else None
        )
        for r in rows
    ]
