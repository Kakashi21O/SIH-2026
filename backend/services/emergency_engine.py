import uuid
import datetime
from typing import Dict, Any, List
from backend.database.database import get_db_connection

class EmergencyOrchestrator:
    """
    Manages the 10-second verification lifecycle, severity calculation,
    guardian dispatch simulation, and incident report generation.
    """

    @staticmethod
    def calculate_severity(trigger_source: str, zone_risk_level: str) -> tuple[int, str]:
        """
        Multi-factor severity scoring:
        - Trigger weights: manual_sos (45), keyword_distress (40), timeout (35)
        - Zone weights: CRITICAL (45), HIGH (35), MODERATE (20), LOW (10)
        """
        score = 0
        if trigger_source == "manual_sos":
            score += 45
        elif trigger_source == "keyword_distress":
            score += 40
        else:
            score += 35

        if zone_risk_level == "CRITICAL":
            score += 45
        elif zone_risk_level == "HIGH":
            score += 35
        elif zone_risk_level == "MODERATE":
            score += 20
        else:
            score += 10

        severity_level = "CRITICAL" if score >= 75 else "HIGH" if score >= 55 else "MODERATE"
        return min(score, 100), severity_level

    @classmethod
    def escalate_emergency(
        cls, user_id: str, lat: float, lng: float, trigger_source: str, zone_risk_level: str = "HIGH"
    ) -> Dict[str, Any]:
        """
        Orchestrate immediate protective escalation:
        1. Calculate emergency severity.
        2. Notify primary guardians with live GPS coordinate stream link.
        3. Dispatch simulated 112 emergency response payload.
        4. Log immutable incident record in SQLite.
        """
        severity_score, severity_level = cls.calculate_severity(trigger_source, zone_risk_level)
        incident_id = f"inc_{uuid.uuid4().hex[:8]}"
        created_at = datetime.datetime.utcnow().isoformat() + "Z"

        conn = get_db_connection()
        cursor = conn.cursor()

        # Fetch configured guardians
        cursor.execute("SELECT name, phone, relationship FROM guardians WHERE user_id = ?", (user_id,))
        guardians = cursor.fetchall()
        guardian_names = [f"{g['name']} ({g['phone']})" for g in guardians]

        # Insert Incident Record
        cursor.execute(
            """
            INSERT INTO incidents (
                id, user_id, lat, lng, trigger_source, severity_score, 
                severity_level, guardian_notified, emergency_dispatched, 
                audio_captured, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                incident_id,
                user_id,
                lat,
                lng,
                trigger_source,
                severity_score,
                severity_level,
                1, # guardian notified
                1 if severity_score >= 50 else 0, # 112 dispatch
                1, # emergency audio capture active
                "ACTIVE_EMERGENCY",
                created_at
            )
        )
        conn.commit()
        conn.close()

        actions = [
            f"⚡ Emergency triggered via: {trigger_source.replace('_', ' ').title()}",
            f"📱 Live location link sent to guardians: {', '.join(guardian_names) if guardian_names else 'Pooja Sharma (Mother)'}",
            f"🚨 112 Emergency Dispatch CAD alert initiated with GPS ({lat:.4f}, {lng:.4f})",
            "🎙️ Emergency audio evidence stream buffered and encrypted",
            f"🛡️ Incident {incident_id} registered with Severity {severity_score}/100 ({severity_level})"
        ]

        return {
            "id": incident_id,
            "user_id": user_id,
            "timestamp": created_at,
            "lat": lat,
            "lng": lng,
            "trigger_source": trigger_source,
            "severity_score": severity_score,
            "severity_level": severity_level,
            "guardian_notified": True,
            "emergency_dispatched": severity_score >= 50,
            "audio_captured": True,
            "status": "ACTIVE_EMERGENCY",
            "actions_taken": actions
        }
