import logging
import re
import uuid

from fastapi import APIRouter, Header, HTTPException, status
from backend.config import settings
from backend.database.database import get_db_connection, hash_pin
from backend.models.schemas import GoogleLoginRequest, PinVerifyRequest, PinVerifyResponse, UserProfileUpdateRequest, UserResponse

router = APIRouter(prefix="/api/auth", tags=["Auth & Security"])
logger = logging.getLogger(__name__)

@router.get("/config")
def auth_config():
    return {"provider": settings.AUTH_PROVIDER, "google_client_id": settings.GOOGLE_CLIENT_ID}

@router.post("/verify-pin", response_model=PinVerifyResponse)
def verify_emergency_pin(payload: PinVerifyRequest):
    """Retain the emergency cancellation PIN; it is not a login method."""
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT pin_hash FROM users WHERE id = ?", (payload.user_id,)).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="User profile not found")
    valid = hash_pin(payload.pin) == row["pin_hash"]
    return PinVerifyResponse(valid=valid, message="PIN verified successfully." if valid else "Incorrect PIN.")


def normalize_indian_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    if len(digits) != 10 or digits[0] not in "6789":
        raise HTTPException(status_code=422, detail="Enter a valid Indian mobile number")
    return f"+91{digits}"


def verify_google_credential(credential: str) -> dict:
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token
        google_request = google_requests.Request()
        claims = id_token.verify_oauth2_token(credential, google_request, settings.GOOGLE_CLIENT_ID or None)
    except Exception as exc:
        logger.warning("Google token verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid Google login")
    if claims.get("iss") not in {"accounts.google.com", "https://accounts.google.com"}:
        raise HTTPException(status_code=401, detail="Invalid Google login")
    if claims.get("email_verified") is not True or not claims.get("sub") or not claims.get("email"):
        raise HTTPException(status_code=401, detail="A verified Google account is required")
    return claims

def authenticated_google_uid(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    return verify_google_credential(authorization[7:])["sub"]

def authenticated_user_id(authorization: str | None) -> str:
    google_uid = authenticated_google_uid(authorization)
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT id FROM users WHERE google_uid = ?", (google_uid,)).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=401, detail="User profile not found")
    return row["id"]


def _response(row, new_user: bool = False) -> dict:
    return {"id": row["id"], "name": row["name"], "phone": row["phone"], "email": row["email"],
            "profile_photo": row["profile_photo"], "phone_verified": bool(row["phone_verified"]),
            "auth_provider": row["auth_provider"], "created_at": str(row["created_at"]), "new_user": new_user}


@router.post("/google", response_model=UserResponse)
def google_login(payload: GoogleLoginRequest):
    claims = verify_google_credential(payload.credential)
    google_uid, email = claims["sub"], claims["email"].lower().strip()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE google_uid = ? OR lower(email) = ? LIMIT 1", (google_uid, email))
    row = cursor.fetchone()
    new_user = row is None
    try:
        if row:
            cursor.execute("UPDATE users SET google_uid = ?, email = ?, profile_photo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                           (google_uid, email, claims.get("picture"), row["id"]))
        else:
            user_id = f"usr_{uuid.uuid4().hex[:12]}"
            cursor.execute("""INSERT INTO users
                (id, name, phone, pin_hash, google_uid, email, phone_verified, auth_provider, profile_photo, updated_at)
                VALUES (?, ?, '', '', ?, ?, 0, 'google', ?, CURRENT_TIMESTAMP)""",
                           (user_id, (claims.get("name") or email.split("@")[0])[:100], google_uid, email, claims.get("picture")))
        conn.commit()
        cursor.execute("SELECT * FROM users WHERE google_uid = ?", (google_uid,))
        return _response(cursor.fetchone(), new_user)
    except Exception:
        conn.rollback()
        logger.exception("Google user persistence failed")
        raise HTTPException(status_code=500, detail="Unable to complete login")
    finally:
        conn.close()


@router.patch("/profile", response_model=UserResponse)
def update_profile(payload: UserProfileUpdateRequest, authorization: str | None = Header(default=None)):
    google_uid = authenticated_google_uid(authorization)
    claims = verify_google_credential(authorization[7:])
    phone = normalize_indian_phone(payload.phone)
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET name = ?, phone = ?, phone_verified = 0, updated_at = CURRENT_TIMESTAMP WHERE google_uid = ?",
                       (payload.name.strip(), phone or "", google_uid))
        conn.commit()
        cursor.execute("SELECT * FROM users WHERE google_uid = ?", (google_uid,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User profile not found")
        return _response(row)
    finally:
        conn.close()
