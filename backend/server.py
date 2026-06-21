from fastapi import FastAPI, APIRouter, Request
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import time
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
from collections import defaultdict

# Import routers
from reporting import router as reporting_router
from otp_service import send_otp, verify_otp
from data_api import router as data_router
from admin_api import router as admin_router
from payment_api import router as payment_router
from stripe_api import router as stripe_router
from ambassador_api import router as ambassador_router
from admin_ambassador_panel import router as amb_panel_router
from firebase_auth_page import router as firebase_page_router
from account_api import router as account_router
from legal_pages import router as legal_router
# NEW June 2026 — Email + PIN authentication (replaces Firebase Phone Auth).
# This router already has `/api` prefix built-in so we do NOT wrap it again
# in include_router below.
from auth_email_pin import router as auth_email_pin_router

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# ==========================================
# Security: Rate Limiting & Brute Force Protection
# ==========================================
login_attempts = defaultdict(list)  # IP -> list of timestamps
MAX_LOGIN_ATTEMPTS = 5
LOGIN_WINDOW = 300  # 5 minutes

request_counts = defaultdict(list)  # IP -> list of timestamps
MAX_REQUESTS_PER_MINUTE = 120

class SecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown")
        path = request.url.path
        now = time.time()

        # Rate limiting (per IP, per minute)
        request_counts[client_ip] = [t for t in request_counts[client_ip] if now - t < 60]
        if len(request_counts[client_ip]) >= MAX_REQUESTS_PER_MINUTE:
            return JSONResponse(
                status_code=429,
                content={"detail": "Trop de requêtes. Réessayez dans une minute."}
            )
        request_counts[client_ip].append(now)

        # Brute force protection on login endpoints
        if path in ["/api/auth/phone-login", "/api/auth/credential-login", "/api/otp/verify"]:
            login_attempts[client_ip] = [t for t in login_attempts[client_ip] if now - t < LOGIN_WINDOW]
            if len(login_attempts[client_ip]) >= MAX_LOGIN_ATTEMPTS:
                return JSONResponse(
                    status_code=429,
                    content={"detail": f"Trop de tentatives. Réessayez dans {int(LOGIN_WINDOW - (now - login_attempts[client_ip][0]))} secondes."}
                )
            login_attempts[client_ip].append(now)

        response = await call_next(request)

        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        return response

app.add_middleware(SecurityMiddleware)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# OTP Models
class OTPSendRequest(BaseModel):
    phoneNumber: str

class OTPVerifyRequest(BaseModel):
    phoneNumber: str
    code: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.get("/health")
async def health_check():
    """Health check endpoint for deployment monitoring"""
    try:
        await db.command("ping")
        return {"status": "healthy", "database": "connected"}
    except Exception:
        return {"status": "degraded", "database": "disconnected"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks(limit: int = 100, skip: int = 0):
    """
    Get status checks with pagination support.
    
    Args:
        limit: Maximum number of results to return (default: 100, max: 500)
        skip: Number of results to skip for pagination (default: 0)
    """
    # Enforce maximum limit to prevent memory issues
    limit = min(limit, 500)
    
    status_checks = await db.status_checks.find(
        {}, {"id": 1, "client_name": 1, "timestamp": 1, "_id": 0}
    ).limit(limit).skip(skip).to_list(limit)
    return [StatusCheck(**status_check) for status_check in status_checks]

# ==========================================
# OTP Routes (Africa's Talking)
# ==========================================
@api_router.post("/otp/send")
async def api_send_otp(request: OTPSendRequest):
    """Send OTP code via Africa's Talking SMS."""
    result = await send_otp(request.phoneNumber)
    return result

@api_router.post("/otp/verify")
async def api_verify_otp(request: OTPVerifyRequest):
    """Verify OTP code."""
    result = await verify_otp(request.phoneNumber, request.code)
    return result

# Include the router in the main app
app.include_router(api_router)

# Include data API router (auth + CRUD)
app.include_router(data_router, prefix="/api")

# Include admin API router (backoffice)
app.include_router(admin_router, prefix="/api")

# Include payment API router
app.include_router(payment_router, prefix="/api")
app.include_router(stripe_router, prefix="/api", tags=["stripe-payments"])

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Include reporting router
app.include_router(reporting_router, prefix="/api/reports", tags=["reports"])

# Include ambassador router
app.include_router(ambassador_router, prefix="/api", tags=["ambassador"])

# Include ambassador admin panel
app.include_router(amb_panel_router, prefix="/api", tags=["ambassador-panel"])

# Include Firebase auth page
app.include_router(firebase_page_router, prefix="/api", tags=["firebase-auth"])

# Include account API router (GDPR account deletion)
app.include_router(account_router, prefix="/api", tags=["account"])

# NEW June 2026 — Email + PIN authentication router (replaces Firebase Phone Auth).
# The router has `/api` prefix built-in so we mount it WITHOUT a prefix here.
app.include_router(auth_email_pin_router, tags=["auth-email-pin"])

# Include legal pages router (public privacy policy for Play Store / RGPD)
app.include_router(legal_router, prefix="/api", tags=["legal"])

# Serve downloadable brand assets (logos for Stripe, Play Store, etc.).
# Files live in /app/backend/static and are reachable at /api/assets/<filename>
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pathlib import Path as _Path  # noqa: E402
_static_dir = _Path(__file__).parent / "static"
if _static_dir.exists():
    app.mount("/api/assets", StaticFiles(directory=str(_static_dir)), name="assets")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
