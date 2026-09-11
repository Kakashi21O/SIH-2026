from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

# ================= AUTH & USER SCHEMAS =================
class UserLoginRequest(BaseModel):
    phone: str = Field(..., example="+919876543210")
    pin: str = Field(..., min_length=4, max_length=4, example="1234")

class UserResponse(BaseModel):
    id: str
    name: str
    phone: str
    created_at: str

class PinVerifyRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=4, example="1234")
    user_id: Optional[str] = "usr_demo"

class PinVerifyResponse(BaseModel):
    valid: bool
    message: str

# ================= RISK & LOCATION SCHEMAS =================
class Coordinate(BaseModel):
    lat: float
    lng: float

class LocationRiskCheckRequest(BaseModel):
    lat: float = Field(..., example=28.6495)
    lng: float = Field(..., example=77.2385)
    user_id: Optional[str] = "usr_demo"
    safety_mode_enabled: Optional[bool] = False

class RiskZoneFeature(BaseModel):
    id: str
    name: str
    risk_level: str
    safety_score: int
    color: str
    fill_opacity: float
    description: str
    geometry: Dict[str, Any]
    complaint_count: int

class SafetyScoreResponse(BaseModel):
    lat: float
    lng: float
    overall_score: int
    risk_level: str  # LOW, MODERATE, HIGH, CRITICAL
    active_zone_name: Optional[str]
    auto_safety_mode_recommended: bool
    recommended_action: str
    factors: Dict[str, Any]

# ================= EMERGENCY SCHEMAS =================
class EmergencyTriggerRequest(BaseModel):
    user_id: Optional[str] = "usr_demo"
    lat: float
    lng: float
    trigger_source: str = Field(..., example="manual_sos") # manual_sos, keyword_distress, high_risk_timeout
    distress_keyword: Optional[str] = None

class EmergencyTriggerResponse(BaseModel):
    countdown_seconds: int = 10
    verification_token: str
    message: str
    status: str

class EmergencyEscalationRequest(BaseModel):
    user_id: Optional[str] = "usr_demo"
    verification_token: str
    lat: float
    lng: float
    trigger_source: str
    timed_out_without_pin: bool = True

class IncidentReportResponse(BaseModel):
    id: str
    user_id: str
    timestamp: str
    lat: float
    lng: float
    trigger_source: str
    severity_score: int
    severity_level: str
    guardian_notified: bool
    emergency_dispatched: bool
    audio_captured: bool
    status: str
    actions_taken: List[str]

# ================= COMPLAINTS SCHEMAS =================
class ComplaintCreateRequest(BaseModel):
    user_id: Optional[str] = "usr_demo"
    text: str = Field(..., min_length=5, example="Streetlights are completely off and area is pitch dark.")
    lat: float = Field(..., example=28.6410)
    lng: float = Field(..., example=77.2310)
    category: Optional[str] = "poor_lighting"

class ComplaintResponse(BaseModel):
    id: str
    user_id: str
    text: str
    category: str
    lat: float
    lng: float
    severity: str
    upvotes: int
    created_at: str
