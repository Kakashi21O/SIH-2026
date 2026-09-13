import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from backend.config import settings
from backend.database.database import init_db
from backend.routes import auth, safety, emergency, complaints, guardians, location

app = FastAPI(
    title=settings.APP_NAME,
    description="AI-Powered Smart Women Safety and Automated Emergency Response System",
    version="1.0.0"
)

# CORS Middleware for local rapid testing and browser cross-origin calls
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database schema auto-initialization & seed data loading
@app.on_event("startup")
def on_startup():
    init_db()

# Mount API Routers
app.include_router(auth.router)
app.include_router(safety.router)
app.include_router(location.router)
app.include_router(emergency.router)
app.include_router(complaints.router)
app.include_router(guardians.router)

@app.get("/api/health")
def health_check():
    """System health check and diagnostic ping."""
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "environment": settings.ENVIRONMENT,
        "version": "1.0.0"
    }

# Mount Frontend Static Assets
frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
