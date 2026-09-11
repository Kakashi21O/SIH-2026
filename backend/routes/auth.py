from fastapi import APIRouter, HTTPException, status
from backend.models.schemas import PinVerifyRequest, PinVerifyResponse, UserLoginRequest, UserResponse
from backend.database.database import get_db_connection, hash_pin

router = APIRouter(prefix="/api/auth", tags=["Auth & Security"])

@router.post("/verify-pin", response_model=PinVerifyResponse)
def verify_pin(payload: PinVerifyRequest):
    """
    Verify the 4-digit Safety PIN during emergency countdown abort.
    Must return in <20ms to allow zero-lag emergency cancellation.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT pin_hash FROM users WHERE id = ?", (payload.user_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="User profile not found")

    input_hash = hash_pin(payload.pin)
    if input_hash == row["pin_hash"]:
        return PinVerifyResponse(valid=True, message="PIN verified successfully. Emergency countdown aborted.")
    else:
        return PinVerifyResponse(valid=False, message="Incorrect PIN. Please re-enter or alarm will escalate.")

@router.post("/login", response_model=UserResponse)
def user_login(payload: UserLoginRequest):
    """Simple login/profile retrieval for demo user."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, phone, pin_hash, created_at FROM users WHERE phone = ?", (payload.phone,))
    row = cursor.fetchone()
    conn.close()

    if not row or hash_pin(payload.pin) != row["pin_hash"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid phone or PIN")

    return UserResponse(
        id=row["id"],
        name=row["name"],
        phone=row["phone"],
        created_at=str(row["created_at"])
    )
