from fastapi import APIRouter
from backend.database.database import get_db_connection

router = APIRouter(prefix="/api/guardians", tags=["Guardians"])

@router.get("")
def list_guardians(user_id: str = "usr_demo"):
    """Get registered emergency guardians for the user."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, phone, relationship, is_primary FROM guardians WHERE user_id = ?", (user_id,))
    rows = cursor.fetchall()
    conn.close()

    return [
        {
            "id": r["id"],
            "name": r["name"],
            "phone": r["phone"],
            "relationship": r["relationship"],
            "is_primary": bool(r["is_primary"])
        }
        for r in rows
    ]
