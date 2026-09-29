import pytest
from fastapi.testclient import TestClient
from backend.main import app

@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client

def test_health_check(client):
    """Verify system health check endpoint."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "SafeSteps" in data["app"]

def test_auth_pin_verification(client):
    """Verify safety PIN validation."""
    # Correct PIN default is 1234
    res_correct = client.post("/api/auth/verify-pin", json={"user_id": "usr_demo", "pin": "1234"})
    assert res_correct.status_code == 200
    assert res_correct.json()["valid"] is True

    # Invalid PIN
    res_wrong = client.post("/api/auth/verify-pin", json={"user_id": "usr_demo", "pin": "9999"})
    assert res_wrong.status_code == 200
    assert res_wrong.json()["valid"] is False

def test_safety_score_and_zones(client):
    """Verify safety risk evaluation and zones retrieval."""
    res_zones = client.get("/api/safety/zones")
    assert res_zones.status_code == 200
    zones = res_zones.json()
    assert "features" in zones
    assert len(zones["features"]) > 0

    # Evaluate safety for known coordinates
    res_eval = client.post("/api/safety/score", json={"lat": 12.9716, "lng": 77.5946})
    assert res_eval.status_code == 200
    data = res_eval.json()
    assert "overall_score" in data
    assert 0 <= data["overall_score"] <= 100
    assert "risk_level" in data

def test_emergency_trigger_and_escalate(client):
    """Verify distress trigger countdown generation and emergency escalation."""
    # 1. Trigger emergency to initiate 10s verification
    res_trigger = client.post("/api/emergency/trigger", json={
        "user_id": "usr_demo",
        "lat": 12.9716,
        "lng": 77.5946,
        "trigger_source": "VOICE_KEYWORD",
        "distress_keyword": "help me"
    })
    assert res_trigger.status_code == 200
    trigger_data = res_trigger.json()
    assert trigger_data["countdown_seconds"] == 30
    verification_token = trigger_data["verification_token"]
    assert "tok_" in verification_token

    # 2. Escalate emergency after verification timeout
    res_escalate = client.post("/api/emergency/escalate", json={
        "user_id": "usr_demo",
        "verification_token": verification_token,
        "lat": 12.9716,
        "lng": 77.5946,
        "trigger_source": "VOICE_KEYWORD",
        "distress_keyword": "help me",
        "repeated_signal": True,
        "timed_out_without_pin": True
    })
    assert res_escalate.status_code == 200
    escalate_data = res_escalate.json()
    assert "id" in escalate_data
    assert escalate_data["severity_score"] >= 50
    assert "CRITICAL" in escalate_data["severity_level"] or "HIGH" in escalate_data["severity_level"]

def test_complaints_and_clustering(client):
    """Verify complaint submission, NLP classification, and hotspot clustering."""
    res_submit = client.post("/api/complaints", json={
        "text": "Dark isolated street with broken streetlights near the bus terminal. Highly unsafe.",
        "category": "Poor Lighting",
        "lat": 12.9750,
        "lng": 77.5980
    })
    assert res_submit.status_code == 200
    comp_data = res_submit.json()
    assert "id" in comp_data
    assert comp_data["category"] == "Poor Lighting"

    # Check hotspots list
    res_hotspots = client.get("/api/safety/hotspots")
    assert res_hotspots.status_code == 200
    hotspots = res_hotspots.json()
    assert isinstance(hotspots, list)

def test_route_comparison(client):
    """Verify Safe Journey routing comparison (Fastest vs Safer Route)."""
    res_routes = client.post("/api/location/routes/compare", json={
        "origin": "Majestic Bus Station",
        "destination": "MG Road Metro"
    })
    assert res_routes.status_code == 200
    routes_data = res_routes.json()
    assert "fastest_route" in routes_data
    assert "safer_route" in routes_data
    assert routes_data["safer_route"]["safety_score"] >= routes_data["fastest_route"]["safety_score"]

def test_assistant_chat(client):
    """Verify SafeSteps AI conversational safety assistant."""
    res_chat = client.post("/api/assistant/chat", json={
        "message": "What is the safety score here?",
        "context": {
            "lat": 12.9716,
            "lng": 77.5946,
            "safety_mode": False
        }
    })
    assert res_chat.status_code == 200
    chat_data = res_chat.json()
    assert "reply" in chat_data
    assert len(chat_data["reply"]) > 0


def test_profile_photo_and_details_storage(client):
    """Verify backend storage for user profile picture, static retrieval, and details updates."""
    # 1x1 transparent PNG as base64
    sample_png_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    
    # 1. Upload base64 cropped avatar
    headers = {"Authorization": "Bearer demo"}
    res_upload = client.post("/api/auth/profile-photo", json={"photo_base64": sample_png_b64}, headers=headers)
    assert res_upload.status_code == 200
    upload_data = res_upload.json()
    assert upload_data["ok"] is True
    avatar_url = upload_data["profile_photo"]
    assert avatar_url.startswith("/api/auth/avatar/")

    # 2. Retrieve avatar via static file serving endpoint
    res_file = client.get(avatar_url)
    assert res_file.status_code == 200
    assert res_file.headers.get("content-type") == "image/png"
    assert len(res_file.content) > 0

    # 3. Update profile details (name, phone)
    res_patch = client.patch(
        "/api/auth/profile-details",
        json={"name": "Ananya Updated", "phone": "9876543210"},
        headers=headers
    )
    assert res_patch.status_code == 200
    user_data = res_patch.json()
    assert user_data["name"] == "Ananya Updated"
    assert user_data["phone"] == "+919876543210"
    assert user_data["profile_photo"] == avatar_url

    # 4. Remove profile photo
    res_del = client.delete("/api/auth/profile-photo", headers=headers)
    assert res_del.status_code == 200
    del_data = res_del.json()
    assert del_data["ok"] is True
    assert del_data["profile_photo"] is None

    # Reset user name back to default Ananya Sharma
    client.patch("/api/auth/profile-details", json={"name": "Ananya Sharma"}, headers=headers)

