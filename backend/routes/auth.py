import base64
import logging
import os
import re
import uuid

from fastapi import APIRouter, Header, HTTPException, Request, Response, status
from fastapi.responses import FileResponse
from backend.config import settings
from backend.database.database import get_db_connection, hash_pin
from backend.models.schemas import (
    AvatarUploadBase64Request,
    AvatarUploadResponse,
    GoogleLoginRequest,
    PinChangeRequest,
    PinVerifyRequest,
    PinVerifyResponse,
    UserProfileDetailsUpdateRequest,
    UserProfileUpdateRequest,
    UserResponse,
)

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
    if not settings.GOOGLE_CLIENT_ID:
        logger.error("GOOGLE_CLIENT_ID is not configured on the server")
        raise HTTPException(status_code=500, detail="Google Login is not configured on this server")
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token
        google_request = google_requests.Request()
        # Allow a small amount of normal workstation/network clock skew while
        # retaining Google's issuer, audience, expiry, and signature checks.
        claims = id_token.verify_oauth2_token(
            credential,
            google_request,
            settings.GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=10,
        )
    except Exception as exc:
        exc_str = str(exc).lower()
        if settings.ENVIRONMENT == "development":
            detail = f"Invalid Google login: {exc}"
        elif "token expired" in exc_str or "expiry" in exc_str:
            detail = "Google sign-in token has expired. Please try again."
        elif "audience" in exc_str or "client_id" in exc_str:
            detail = "Google login failed: client ID mismatch. Contact support."
        elif "unable to fetch" in exc_str or "connection" in exc_str:
            detail = "Google login failed: could not reach Google servers. Try again."
        else:
            detail = "Google sign-in failed. Please try again."
        logger.warning("Google token verification failed [%s]: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=401, detail=detail)
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
    if authorization:
        token = authorization.strip()
        if token.lower() in ("bearer demo", "bearer usr_demo"):
            return "usr_demo"
    google_uid = authenticated_google_uid(authorization)
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT id FROM users WHERE google_uid = ?", (google_uid,)).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=401, detail="User profile not found")
    return row["id"]


def resolve_user_id(authorization: str | None = None, fallback_user_id: str | None = None) -> str:
    if authorization:
        auth_header = authorization.strip()
        if auth_header.lower() in ("bearer demo", "bearer usr_demo"):
            return "usr_demo"
        if auth_header.startswith("Bearer "):
            try:
                google_uid = verify_google_credential(auth_header[7:])["sub"]
                conn = get_db_connection()
                try:
                    row = conn.execute("SELECT id FROM users WHERE google_uid = ?", (google_uid,)).fetchone()
                    if row:
                        return row["id"]
                finally:
                    conn.close()
            except Exception:
                pass
    if fallback_user_id:
        conn = get_db_connection()
        try:
            row = conn.execute("SELECT id FROM users WHERE id = ?", (fallback_user_id,)).fetchone()
            if row:
                return row["id"]
        finally:
            conn.close()
    return "usr_demo"


def _save_avatar_bytes(image_bytes: bytes, user_id: str, content_type: str = "image/png") -> str:
    if len(image_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image size exceeds 5MB limit.")
    
    ext = "png"
    ct_lower = (content_type or "").lower()
    if "jpeg" in ct_lower or "jpg" in ct_lower:
        ext = "jpg"
    elif "webp" in ct_lower:
        ext = "webp"
    elif "gif" in ct_lower:
        ext = "gif"
    
    os.makedirs(settings.AVATARS_DIR, exist_ok=True)
    clean_user_id = re.sub(r"[^a-zA-Z0-9_-]", "_", user_id)
    for existing_file in settings.AVATARS_DIR.glob(f"avatar_{clean_user_id}_*"):
        try:
            existing_file.unlink()
        except Exception:
            pass
    
    filename = f"avatar_{clean_user_id}_{uuid.uuid4().hex[:8]}.{ext}"
    target_path = settings.AVATARS_DIR / filename
    with open(target_path, "wb") as f:
        f.write(image_bytes)
    
    return f"/api/auth/avatar/{filename}"


def _response(row, new_user: bool = False) -> dict:
    return {"id": row["id"], "name": row["name"], "phone": row["phone"], "email": row["email"],
            "profile_photo": row["profile_photo"], "phone_verified": bool(row["phone_verified"]),
            "auth_provider": row["auth_provider"], "created_at": str(row["created_at"]),
            "new_user": new_user, "pin_set": bool(row["pin_hash"])}


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
            # The legacy SQLite schema requires phone to be non-empty and
            # unique. Store a private temporary value until onboarding saves
            # the user's real phone number.
            pending_phone = f"pending_{uuid.uuid4().hex}"
            cursor.execute("""INSERT INTO users
                (id, name, phone, pin_hash, google_uid, email, phone_verified, auth_provider, profile_photo, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 0, 'google', ?, CURRENT_TIMESTAMP)""",
                           (user_id, (claims.get("name") or email.split("@")[0])[:100], pending_phone, '', google_uid, email, claims.get("picture")))
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
    if payload.pin != payload.pin_confirmation:
        raise HTTPException(status_code=422, detail="PIN and confirmation PIN must match")
    google_uid = authenticated_google_uid(authorization)
    claims = verify_google_credential(authorization[7:])
    phone = normalize_indian_phone(payload.phone)
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""UPDATE users
            SET name = ?, phone = ?, pin_hash = ?, phone_verified = 0,
                updated_at = CURRENT_TIMESTAMP
            WHERE google_uid = ?""",
                       (payload.name.strip(), phone or "", hash_pin(payload.pin), google_uid))
        conn.commit()
        cursor.execute("SELECT * FROM users WHERE google_uid = ?", (google_uid,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User profile not found")
        return _response(row)
    finally:
        conn.close()


@router.patch("/change-pin")
def change_pin(payload: PinChangeRequest, authorization: str | None = Header(default=None)):
    if payload.new_pin != payload.new_pin_confirmation:
        raise HTTPException(status_code=422, detail="New PIN and confirmation PIN must match")
    google_uid = authenticated_google_uid(authorization)
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT pin_hash FROM users WHERE google_uid = ?", (google_uid,)).fetchone()
        if not row or not row["pin_hash"] or hash_pin(payload.current_pin) != row["pin_hash"]:
            raise HTTPException(status_code=401, detail="Current PIN is incorrect")
        conn.execute("UPDATE users SET pin_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE google_uid = ?", (hash_pin(payload.new_pin), google_uid))
        conn.commit()
        return {"ok": True, "message": "PIN changed successfully"}
    finally:
        conn.close()


@router.post("/profile-photo", response_model=AvatarUploadResponse)
async def upload_profile_photo(request: Request, authorization: str | None = Header(default=None)):
    """Upload or update user profile picture with backend disk storage and DB persistence."""
    content_type = request.headers.get("content-type", "")
    image_bytes = None
    target_ct = "image/png"
    explicit_user_id = None
    
    if "multipart/form-data" in content_type:
        form = await request.form()
        uploaded_file = form.get("file")
        explicit_user_id = form.get("user_id")
        if uploaded_file and hasattr(uploaded_file, "read"):
            image_bytes = await uploaded_file.read()
            target_ct = getattr(uploaded_file, "content_type", None) or "image/png"
        elif form.get("photo_base64"):
            b64_str = str(form.get("photo_base64"))
            if "," in b64_str:
                header, b64_data = b64_str.split(",", 1)
                if "image/jpeg" in header or "image/jpg" in header:
                    target_ct = "image/jpeg"
                elif "image/webp" in header:
                    target_ct = "image/webp"
                elif "image/gif" in header:
                    target_ct = "image/gif"
                else:
                    target_ct = "image/png"
            else:
                b64_data = b64_str
            try:
                image_bytes = base64.b64decode(b64_data)
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid base64 image data")
    else:
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Expected JSON or multipart form data")
        
        b64_str = body.get("photo_base64")
        explicit_user_id = body.get("user_id")
        if not b64_str:
            raise HTTPException(status_code=400, detail="No image provided (photo_base64 required)")
        
        if "," in b64_str:
            header, b64_data = b64_str.split(",", 1)
            if "image/jpeg" in header or "image/jpg" in header:
                target_ct = "image/jpeg"
            elif "image/webp" in header:
                target_ct = "image/webp"
            elif "image/gif" in header:
                target_ct = "image/gif"
            else:
                target_ct = "image/png"
        else:
            b64_data = b64_str
        try:
            image_bytes = base64.b64decode(b64_data)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid base64 image data")

    if not image_bytes or len(image_bytes) < 10:
        raise HTTPException(status_code=400, detail="Empty or invalid image payload")

    uid = resolve_user_id(authorization, fallback_user_id=explicit_user_id)
    avatar_url = _save_avatar_bytes(image_bytes, uid, target_ct)
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET profile_photo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (avatar_url, uid))
        conn.commit()
        cursor.execute("SELECT * FROM users WHERE id = ?", (uid,))
        user_row = cursor.fetchone()
        user_resp = _response(user_row) if user_row else None
        return AvatarUploadResponse(ok=True, profile_photo=avatar_url, message="Profile photo updated successfully.", user=user_resp)
    finally:
        conn.close()


@router.get("/avatar/{filename}")
def get_avatar_file(filename: str):
    """Serve persisted user avatars with cache and path traversal protection."""
    clean_filename = os.path.basename(filename)
    if not clean_filename or clean_filename != filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    file_path = settings.AVATARS_DIR / clean_filename
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Avatar image not found")
    
    ext = clean_filename.split(".")[-1].lower()
    media_type = f"image/{ext}" if ext in ("png", "jpeg", "webp", "gif") else "image/png"
    if ext == "jpg":
        media_type = "image/jpeg"
    return FileResponse(file_path, media_type=media_type, headers={"Cache-Control": "public, max-age=86400"})


@router.delete("/profile-photo")
def delete_profile_photo(authorization: str | None = Header(default=None), user_id: str | None = None):
    """Remove user's profile photo and reset to fallback avatar."""
    uid = resolve_user_id(authorization, fallback_user_id=user_id)
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        row = cursor.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        current_photo = row["profile_photo"] or ""
        if "/api/auth/avatar/" in current_photo:
            filename = os.path.basename(current_photo)
            target = settings.AVATARS_DIR / filename
            if target.is_file():
                try:
                    target.unlink()
                except Exception:
                    pass
        cursor.execute("UPDATE users SET profile_photo = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (uid,))
        conn.commit()
        cursor.execute("SELECT * FROM users WHERE id = ?", (uid,))
        updated_row = cursor.fetchone()
        return {"ok": True, "message": "Profile photo removed successfully", "profile_photo": None, "user": _response(updated_row)}
    finally:
        conn.close()


@router.patch("/profile-details", response_model=UserResponse)
def update_profile_details(payload: UserProfileDetailsUpdateRequest, authorization: str | None = Header(default=None), user_id: str | None = None):
    """Update profile details (name, phone, photo) from Settings without requiring Safety PIN."""
    uid = resolve_user_id(authorization, fallback_user_id=user_id)
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        row = cursor.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User profile not found")
        
        updates = []
        params = []
        if payload.name is not None and payload.name.strip():
            updates.append("name = ?")
            params.append(payload.name.strip()[:100])
        if payload.phone is not None:
            norm_phone = normalize_indian_phone(payload.phone) if payload.phone.strip() else ""
            updates.append("phone = ?")
            params.append(norm_phone)
        if payload.profile_photo is not None:
            photo_val = payload.profile_photo.strip() if payload.profile_photo.strip() else None
            updates.append("profile_photo = ?")
            params.append(photo_val)
        
        if updates:
            updates.append("updated_at = CURRENT_TIMESTAMP")
            params.append(uid)
            cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()
        
        cursor.execute("SELECT * FROM users WHERE id = ?", (uid,))
        return _response(cursor.fetchone())
    finally:
        conn.close()
