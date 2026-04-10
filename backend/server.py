from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime

# Import routers
from reporting import router as reporting_router
from otp_service import send_otp, verify_otp
from data_api import router as data_router

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
