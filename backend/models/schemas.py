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
    trigger_source: str = Field(..., example="manual_sos") # manual_sos, keyword_distress, timeout
    distress_keyword: Optional[str] = None
    repeated_signal: bool = False
    timed_out_without_pin: bool = True
    audio_base64: Optional[str] = None
    audio_duration_seconds: Optional[float] = None

class IncidentReportResponse(BaseModel):
    id: str
    user_id: str
    timestamp: str
    lat: float
    lng: float
    trigger_source: str
    severity_score: int
    severity_level: str
    severity_breakdown: Optional[Dict[str, int]] = None
    guardian_notified: bool
    emergency_dispatched: bool
    audio_captured: bool
    audio_data: Optional[str] = None
    status: str
    actions_taken: List[str]

# ================= COMPLAINTS SCHEMAS =================
class ComplaintAnalyzeRequest(BaseModel):
    text: str = Field(..., min_length=3, example="Streetlights are completely off and area is pitch dark.")

class ComplaintAnalyzeResponse(BaseModel):
    category: str
    confidence: float
    severity: str
    keywords: List[str]
    urgent_flag: bool

class DuplicateCheckRequest(BaseModel):
    text: str = Field(..., min_length=3, example="Streetlights are broken and dark here")
    lat: float = Field(..., example=28.6410)
    lng: float = Field(..., example=77.2310)

class DuplicateCheckResponse(BaseModel):
    is_duplicate: bool
    similarity_score: float
    distance_meters: Optional[float] = None
    matched_report: Optional[Dict[str, Any]] = None
    cluster_id: Optional[str] = None

class ComplaintClusterResponse(BaseModel):
    cluster_id: str
    category: str
    headline: str
    severity: str
    center_lat: float
    center_lng: float
    total_count: int
    upvotes_sum: int
    first_reported_at: Optional[str] = None

class HotspotClusterFeature(BaseModel):
    id: str
    category: str
    headline: str
    severity: str
    lat: float
    lng: float
    radius_meters: float
    report_count: int
    upvotes: int
    hazard_score: int

class ComplaintCreateRequest(BaseModel):
    user_id: Optional[str] = "usr_demo"
    text: str = Field(..., min_length=5, example="Streetlights are completely off and area is pitch dark.")
    lat: float = Field(..., example=28.6410)
    lng: float = Field(..., example=77.2310)
    category: Optional[str] = None # Auto-detected by NLP if omitted or "auto"

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
    confidence: Optional[float] = None
    keywords: Optional[List[str]] = None
    cluster_id: Optional[str] = None

# ================= JOURNEY SCHEMAS =================
class RouteCompareRequest(BaseModel):
    origin: Optional[str] = "Connaught Place Metro"
    destination: Optional[str] = "Karol Bagh Residence"
    user_id: Optional[str] = "usr_demo"

class JourneyStartRequest(BaseModel):
    user_id: Optional[str] = "usr_demo"
    origin_name: str
    dest_name: str
    selected_route_type: str  # SAFER or FASTEST
    safety_score: int

# ================= GUARDIAN SCHEMAS =================
class GuardianCreateRequest(BaseModel):
    user_id: Optional[str] = "usr_demo"
    name: str = Field(..., min_length=2, example="Pooja Sharma")
    phone: str = Field(..., min_length=10, example="+919811122233")
    relationship: str = Field(..., example="Mother")
    is_primary: Optional[bool] = False

class GuardianUpdateRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    relationship: Optional[str] = None
    is_primary: Optional[bool] = None

class GuardianResponse(BaseModel):
    id: str
    name: str
    phone: str
    relationship: str
    is_primary: bool

# ================= ASSISTANT SCHEMAS =================
class AssistantChatRequest(BaseModel):
    message: str = Field(..., min_length=1, example="Tell me about this area")
    lat: Optional[float] = None
    lng: Optional[float] = None
    context: Optional[Dict[str, Any]] = None

class AssistantChatResponse(BaseModel):
    reply: str
    sources: List[str]
    structured_data: Optional[Dict[str, Any]] = None


