import os
from pathlib import Path
from dotenv import load_dotenv

# Base directory paths
BASE_DIR = Path(__file__).resolve().parent.parent

# Load local environment if .env file exists
env_path = BASE_DIR / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)

class Settings:
    APP_NAME: str = os.getenv("APP_NAME", "SafeSteps")
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    PORT: int = int(os.getenv("PORT", "8000"))
    HOST: str = os.getenv("HOST", "0.0.0.0")
    DEBUG: bool = os.getenv("DEBUG", "True").lower() in ("true", "1")
    
    # Path to SQLite database file
    DATABASE_PATH: str = os.getenv("DATABASE_PATH", str(BASE_DIR / "data" / "safesteps.db"))
    
    # Default 4-digit Safety PIN for quick demo verification
    DEFAULT_PIN: str = os.getenv("DEFAULT_PIN", "1234")
    
    # Pre-configured seed data paths
    RISK_ZONES_SEED: str = str(BASE_DIR / "data" / "risk_zones.json")
    COMPLAINTS_SEED: str = str(BASE_DIR / "data" / "complaints.json")
    INCIDENTS_SEED: str = str(BASE_DIR / "data" / "demo_incidents.json")

settings = Settings()
