import uuid
from typing import List
from fastapi import APIRouter, HTTPException, status
from backend.models.schemas import GuardianCreateRequest, GuardianUpdateRequest, GuardianResponse
from backend.database.database import get_db_connection

router = APIRouter(prefix="/api/guardians", tags=["Guardians"])

@router.get("", response_model=List[GuardianResponse])
def list_guardians(user_id: str = "usr_demo"):
    """Get registered emergency guardians for the user."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, name, phone, relationship, is_primary FROM guardians WHERE user_id = ? ORDER BY is_primary DESC, id ASC",
        (user_id,)
    )
    rows = cursor.fetchall()
    conn.close()

    return [
        GuardianResponse(
            id=r["id"],
            name=r["name"],
            phone=r["phone"],
            relationship=r["relationship"],
            is_primary=bool(r["is_primary"])
        )
        for r in rows
    ]

@router.post("", response_model=GuardianResponse, status_code=status.HTTP_201_CREATED)
def create_guardian(payload: GuardianCreateRequest):
    """Add a new emergency contact / guardian."""
    conn = get_db_connection()
    cursor = conn.cursor()

    guardian_id = f"g_{uuid.uuid4().hex[:6]}"

    # If this guardian is marked primary, demote other guardians
    if payload.is_primary:
        cursor.execute("UPDATE guardians SET is_primary = 0 WHERE user_id = ?", (payload.user_id,))

    cursor.execute(
        """
        INSERT INTO guardians (id, user_id, name, phone, relationship, is_primary)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (guardian_id, payload.user_id, payload.name, payload.phone, payload.relationship, int(payload.is_primary))
    )
    conn.commit()
    conn.close()

    return GuardianResponse(
        id=guardian_id,
        name=payload.name,
        phone=payload.phone,
        relationship=payload.relationship,
        is_primary=payload.is_primary
    )

@router.put("/{guardian_id}", response_model=GuardianResponse)
def update_guardian(guardian_id: str, payload: GuardianUpdateRequest):
    """Update guardian details or primary contact status."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, user_id, name, phone, relationship, is_primary FROM guardians WHERE id = ?", (guardian_id,))
    row = cursor.fetchone()

    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Guardian not found")

    new_name = payload.name if payload.name is not None else row["name"]
    new_phone = payload.phone if payload.phone is not None else row["phone"]
    new_rel = payload.relationship if payload.relationship is not None else row["relationship"]
    new_primary = payload.is_primary if payload.is_primary is not None else bool(row["is_primary"])

    if payload.is_primary:
        cursor.execute("UPDATE guardians SET is_primary = 0 WHERE user_id = ?", (row["user_id"],))

    cursor.execute(
        """
        UPDATE guardians
        SET name = ?, phone = ?, relationship = ?, is_primary = ?
        WHERE id = ?
        """,
        (new_name, new_phone, new_rel, int(new_primary), guardian_id)
    )
    conn.commit()
    conn.close()

    return GuardianResponse(
        id=guardian_id,
        name=new_name,
        phone=new_phone,
        relationship=new_rel,
        is_primary=new_primary
    )

@router.delete("/{guardian_id}")
def delete_guardian(guardian_id: str):
    """Remove a guardian from the emergency contact list."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM guardians WHERE id = ?", (guardian_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()

    if not deleted:
        raise HTTPException(status_code=404, detail="Guardian not found")

    return {"message": "Guardian removed successfully", "id": guardian_id}

@router.post("/{guardian_id}/test-alert")
def send_test_alert(guardian_id: str):
    """Simulate sending a test alert/SMS to verify contact connectivity."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT name, phone FROM guardians WHERE id = ?", (guardian_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Guardian not found")

    return {
        "status": "SENT",
        "recipient": row["name"],
        "phone": row["phone"],
        "message": f"SafeSteps TEST ALERT: Connectivity verified for {row['name']} ({row['phone']}). Emergency dispatch channel is active."
    }

