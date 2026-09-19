from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import models
from .database import engine, Base
from .routers import auth, patients, documents, timeline, doctors, consultations, admin, notifications

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="MediSync Clinical & Telemedicine API",
    description=(
        "Healthcare platform with multi-role support (Doctor, Patient, Administrator), "
        "UIDAI E-KYC verification, multilingual language matchmaking, video consultations, "
        "clinical diagnosis/cure/prescriptions, document OCR timeline, and notifications."
    ),
    version="1.0.0",
)

# Wide-open CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(doctors.router)
app.include_router(consultations.router)
app.include_router(admin.router)
app.include_router(notifications.router)
app.include_router(patients.router)
app.include_router(documents.router)
app.include_router(timeline.router)


@app.get("/api/health", tags=["health"])
def health_check():
    return {"status": "ok", "service": "medisync-api", "version": "1.0.0"}
