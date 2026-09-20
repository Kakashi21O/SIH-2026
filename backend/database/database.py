import sqlite3
import json
import os
import hashlib
from typing import Optional
from backend.config import settings

def get_db_connection():
    """Create and return a thread-safe connection to the SQLite database with row factory."""
    conn = sqlite3.connect(settings.DATABASE_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def hash_pin(pin: str) -> str:
    """Hash the 4-digit safety PIN using SHA-256 for secure verification."""
    return hashlib.sha256(pin.encode("utf-8")).hexdigest()

def init_db():
    """
    Initialize SQLite schema and load default seed datasets for demo readiness.
    Ensures zero-setup onboarding during judging and automated test runs.
    """
    os.makedirs(os.path.dirname(settings.DATABASE_PATH), exist_ok=True)
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL UNIQUE,
        pin_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 2. Guardians table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS guardians (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        relationship TEXT NOT NULL,
        is_primary INTEGER DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
    """)

    # 3. Risk Zones table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS risk_zones (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        risk_level TEXT NOT NULL,
        safety_score INTEGER NOT NULL,
        color TEXT NOT NULL,
        fill_opacity REAL NOT NULL,
        description TEXT,
        polygon_geojson TEXT NOT NULL,
        complaint_count INTEGER DEFAULT 0
    );
    """)

    # 4. Complaints table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS complaints (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        text TEXT NOT NULL,
        category TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        severity TEXT NOT NULL,
        upvotes INTEGER DEFAULT 0,
        cluster_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 5. Incidents table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        trigger_source TEXT NOT NULL,
        severity_score INTEGER NOT NULL,
        severity_level TEXT NOT NULL,
        guardian_notified INTEGER DEFAULT 0,
        emergency_dispatched INTEGER DEFAULT 0,
        audio_captured INTEGER DEFAULT 0,
        audio_data TEXT,
        status TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Migration check for existing databases
    cursor.execute("PRAGMA table_info(incidents);")
    columns = [col[1] for col in cursor.fetchall()]
    if "audio_data" not in columns:
        cursor.execute("ALTER TABLE incidents ADD COLUMN audio_data TEXT;")

    # 6. Journeys table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS journeys (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        origin_name TEXT NOT NULL,
        dest_name TEXT NOT NULL,
        selected_route_type TEXT NOT NULL,
        safety_score INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    conn.commit()

    # Seed Default User & Guardians if table is empty
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        demo_user_id = "usr_demo"
        cursor.execute(
            "INSERT INTO users (id, name, phone, pin_hash) VALUES (?, ?, ?, ?)",
            (demo_user_id, "Ananya Sharma", "+919876543210", hash_pin(settings.DEFAULT_PIN))
        )
        
        # Primary & Secondary Emergency Guardians
        cursor.execute(
            "INSERT INTO guardians (id, user_id, name, phone, relationship, is_primary) VALUES (?, ?, ?, ?, ?, ?)",
            ("g_1", demo_user_id, "Pooja Sharma (Mother)", "+919811122233", "Mother", 1)
        )
        cursor.execute(
            "INSERT INTO guardians (id, user_id, name, phone, relationship, is_primary) VALUES (?, ?, ?, ?, ?, ?)",
            ("g_2", demo_user_id, "Rahul Sharma (Brother)", "+919822233344", "Brother", 0)
        )
        conn.commit()

    # Seed or synchronize Risk Zones from JSON seed
    if os.path.exists(settings.RISK_ZONES_SEED):
        with open(settings.RISK_ZONES_SEED, "r", encoding="utf-8-sig") as f:
            zone_data = json.load(f)
            for feature in zone_data.get("features", []):
                cursor.execute(
                    """
                    INSERT INTO risk_zones (id, name, risk_level, safety_score, color, fill_opacity, description, polygon_geojson, complaint_count)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        name=excluded.name,
                        risk_level=excluded.risk_level,
                        safety_score=excluded.safety_score,
                        color=excluded.color,
                        fill_opacity=excluded.fill_opacity,
                        description=excluded.description,
                        polygon_geojson=excluded.polygon_geojson,
                        complaint_count=excluded.complaint_count
                    """,
                    (
                        feature["id"],
                        feature["properties"]["name"],
                        feature["properties"]["risk_level"],
                        feature["properties"]["safety_score"],
                        feature["properties"]["color"],
                        feature["properties"]["fillOpacity"],
                        feature["properties"]["description"],
                        json.dumps(feature["geometry"]),
                        feature["properties"].get("complaint_count", 0)
                    )
                )
        conn.commit()

    # Seed Complaints using INSERT OR IGNORE so new entries always load
    if os.path.exists(settings.COMPLAINTS_SEED):
        with open(settings.COMPLAINTS_SEED, "r", encoding="utf-8-sig") as f:
            complaint_data = json.load(f)
            for comp in complaint_data:
                cursor.execute(
                    """
                    INSERT OR IGNORE INTO complaints (id, user_id, text, category, lat, lng, severity, upvotes, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        comp["id"],
                        "usr_demo",
                        comp["text"],
                        comp["category"],
                        comp["lat"],
                        comp["lng"],
                        comp["severity"],
                        comp.get("upvotes", 0),
                        comp.get("created_at")
                    )
                )
        conn.commit()

    conn.close()
