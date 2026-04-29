"""
Ambassador System API for TekaTeka
Features: Ambassador accounts, activation codes, commission tracking, QR scanning
"""
import os
import logging
import secrets
import string
from datetime import datetime, timedelta
from typing import Optional, List
from pathlib import Path

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from passlib.context import CryptContext
from jose import jwt, JWTError
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger(__name__)

# Database
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "test_database")
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Auth config
SECRET_KEY = os.getenv("JWT_SECRET", "tekateka-secret-key-2025-change-in-production")
ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter()

# ==========================================
# Pricing Configuration
# ==========================================
PRICING_TIERS = {
    "early": {  # First 500 clients (promo)
        "monthly": {"appPrice": 10, "ambassadorPrice": 8, "commission": 2},
        "quarterly": {"appPrice": 25, "ambassadorPrice": 20, "commission": 3},
        "yearly": {"appPrice": 60, "ambassadorPrice": 50, "commission": 5},
    },
    "standard": {  # After 500 clients
        "monthly": {"appPrice": 15, "ambassadorPrice": 12, "commission": 2},
        "quarterly": {"appPrice": 30, "ambassadorPrice": 28, "commission": 3},
        "yearly": {"appPrice": 65, "ambassadorPrice": 60, "commission": 5},
    },
}
EARLY_CLIENT_THRESHOLD = 500
COMMISSION_MULTIPLIER_THRESHOLD = 50  # Sales count for 1.5x multiplier
COMMISSION_MULTIPLIER = 1.5
CODE_VALIDITY_DAYS = 30

# ==========================================
# Models
# ==========================================
class AmbassadorCreate(BaseModel):
    name: str
    country: str
    city: str
    email: str
    password: str

class AmbassadorLogin(BaseModel):
    email: str
    password: str

class GenerateCodesRequest(BaseModel):
    count: int = 10
    plan: str  # monthly, quarterly, yearly

class AssignCodesRequest(BaseModel):
    ambassadorId: str
    codes: List[str]

class ActivateCodeRequest(BaseModel):
    clientUserId: str
    plan: str  # monthly, quarterly, yearly

class ScanClientRequest(BaseModel):
    clientUserId: str

# ==========================================
# Helpers
# ==========================================
def serialize_doc(doc):
    if doc is None:
        return None
    doc["id"] = str(doc.pop("_id"))
    return doc

def generate_activation_code():
    """Generate a unique 12-character activation code"""
    chars = string.ascii_uppercase + string.digits
    return "TK-" + "".join(secrets.choice(chars) for _ in range(4)) + "-" + "".join(secrets.choice(chars) for _ in range(4))

async def get_current_pricing_tier():
    """Determine pricing tier based on total active subscriptions"""
    active_subs = await db.users.count_documents({
        "subscription.status": "active"
    })
    return "early" if active_subs < EARLY_CLIENT_THRESHOLD else "standard"

async def get_ambassador_commission(ambassador_id: str, plan: str):
    """Calculate commission with multiplier if applicable"""
    tier = await get_current_pricing_tier()
    base_commission = PRICING_TIERS[tier][plan]["commission"]
    
    # Check if ambassador qualifies for multiplier (50+ sales = x1.5)
    total_sales = await db.ambassador_sales.count_documents({"ambassadorId": ambassador_id})
    if total_sales >= COMMISSION_MULTIPLIER_THRESHOLD:
        return base_commission * COMMISSION_MULTIPLIER
    return base_commission

async def get_ambassador_from_token(authorization: str = None):
    """Extract ambassador from JWT token"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Token requis")
    
    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        ambassador_id = payload.get("ambassador_id")
        if not ambassador_id:
            raise HTTPException(status_code=401, detail="Token ambassadeur invalide")
        
        ambassador = await db.ambassadors.find_one({"_id": ObjectId(ambassador_id)})
        if not ambassador:
            raise HTTPException(status_code=401, detail="Ambassadeur introuvable")
        if ambassador.get("status") == "blocked":
            raise HTTPException(status_code=403, detail="Compte ambassadeur bloqué")
        
        return ambassador
    except JWTError:
        raise HTTPException(status_code=401, detail="Token invalide")

# ==========================================
# Ambassador Auth
# ==========================================
@router.post("/ambassador/login")
async def ambassador_login(req: AmbassadorLogin):
    logger.info(f"Ambassador login attempt: email='{req.email}'")
    ambassador = await db.ambassadors.find_one({"email": req.email})
    if not ambassador:
        logger.warning(f"Ambassador not found for email: '{req.email}'")
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    
    if not pwd_context.verify(req.password, ambassador["passwordHash"]):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    
    if ambassador.get("status") == "blocked":
        raise HTTPException(status_code=403, detail="Compte bloqué. Contactez l'administrateur.")
    
    token = jwt.encode(
        {"ambassador_id": str(ambassador["_id"]), "type": "ambassador", "exp": datetime.utcnow() + timedelta(days=30)},
        SECRET_KEY, algorithm=ALGORITHM
    )
    
    return {
        "token": token,
        "ambassador": {
            "id": str(ambassador["_id"]),
            "name": ambassador["name"],
            "country": ambassador["country"],
            "city": ambassador["city"],
            "email": ambassador["email"],
        }
    }

# ==========================================
# Ambassador Dashboard
# ==========================================
@router.post("/ambassador/dashboard")
async def ambassador_dashboard(body: dict):
    token = body.get("token", "")
    ambassador = await get_ambassador_from_token(f"Bearer {token}")
    amb_id = str(ambassador["_id"])
    
    # Stats
    total_sales = await db.ambassador_sales.count_documents({"ambassadorId": amb_id})
    
    # Monthly sales (current month)
    now = datetime.utcnow()
    month_start = datetime(now.year, now.month, 1)
    monthly_sales = await db.ambassador_sales.count_documents({
        "ambassadorId": amb_id,
        "createdAt": {"$gte": month_start}
    })
    
    # Commission earned
    pipeline = [
        {"$match": {"ambassadorId": amb_id}},
        {"$group": {"_id": None, "total": {"$sum": "$commission"}}}
    ]
    commission_result = await db.ambassador_sales.aggregate(pipeline).to_list(1)
    total_commission = commission_result[0]["total"] if commission_result else 0
    
    # Codes
    total_codes = await db.activation_codes.count_documents({"ambassadorId": amb_id})
    used_codes = await db.activation_codes.count_documents({"ambassadorId": amb_id, "status": "used"})
    remaining_codes = await db.activation_codes.count_documents({"ambassadorId": amb_id, "status": "unused"})
    
    # Has multiplier?
    has_multiplier = total_sales >= COMMISSION_MULTIPLIER_THRESHOLD
    
    # Current pricing tier
    tier = await get_current_pricing_tier()
    
    return {
        "ambassador": {
            "id": amb_id,
            "name": ambassador["name"],
            "country": ambassador["country"],
            "city": ambassador["city"],
        },
        "stats": {
            "totalSales": total_sales,
            "monthlySales": monthly_sales,
            "totalCommission": total_commission,
            "totalCodes": total_codes,
            "usedCodes": used_codes,
            "remainingCodes": remaining_codes,
            "hasMultiplier": has_multiplier,
            "multiplier": COMMISSION_MULTIPLIER if has_multiplier else 1,
        },
        "pricingTier": tier,
        "pricing": PRICING_TIERS[tier],
    }

# ==========================================
# Ambassador Sales History
# ==========================================
@router.post("/ambassador/sales")
async def ambassador_sales(body: dict):
    token = body.get("token", "")
    ambassador = await get_ambassador_from_token(f"Bearer {token}")
    amb_id = str(ambassador["_id"])
    
    sales = await db.ambassador_sales.find({"ambassadorId": amb_id}).sort("createdAt", -1).to_list(500)
    return [serialize_doc(s) for s in sales]

# ==========================================
# Ambassador Codes
# ==========================================
@router.post("/ambassador/codes")
async def ambassador_codes(body: dict):
    token = body.get("token", "")
    ambassador = await get_ambassador_from_token(f"Bearer {token}")
    amb_id = str(ambassador["_id"])
    
    codes = await db.activation_codes.find({"ambassadorId": amb_id}).sort("assignedAt", -1).to_list(500)
    return [serialize_doc(c) for c in codes]

# ==========================================
# Scan Client QR
# ==========================================
@router.post("/ambassador/scan-client")
async def scan_client(body: dict):
    token = body.get("token", "")
    await get_ambassador_from_token(f"Bearer {token}")
    
    client_user_id = body.get("clientUserId", "")
    if not client_user_id:
        raise HTTPException(status_code=400, detail="ID client requis")
    
    try:
        user = await db.users.find_one({"_id": ObjectId(client_user_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="ID client invalide")
    
    if not user:
        raise HTTPException(status_code=404, detail="Client introuvable")
    
    subscription = user.get("subscription", {})
    
    return {
        "client": {
            "id": str(user["_id"]),
            "name": user.get("username", user.get("phoneNumber", "N/A")),
            "phone": user.get("phoneNumber", "N/A"),
            "subscription": {
                "status": subscription.get("status", "inactive"),
                "plan": subscription.get("plan", None),
                "expiryDate": subscription.get("expiryDate", None),
            }
        }
    }

# ==========================================
# Activate Code for Client
# ==========================================
@router.post("/ambassador/activate")
async def activate_code(body: dict):
    token = body.get("token", "")
    ambassador = await get_ambassador_from_token(f"Bearer {token}")
    amb_id = str(ambassador["_id"])
    
    client_user_id = body.get("clientUserId", "")
    plan = body.get("plan", "")
    
    if not client_user_id or not plan:
        raise HTTPException(status_code=400, detail="ID client et plan requis")
    
    if plan not in ["monthly", "quarterly", "yearly"]:
        raise HTTPException(status_code=400, detail="Plan invalide")
    
    # Find an unused code for this ambassador
    code_doc = await db.activation_codes.find_one({
        "ambassadorId": amb_id,
        "status": "unused",
        "plan": plan,
        "expiresAt": {"$gt": datetime.utcnow()}  # Not expired
    })
    
    if not code_doc:
        raise HTTPException(status_code=404, detail="Aucun code disponible pour ce plan. Contactez l'administrateur.")
    
    # Verify client exists
    try:
        user = await db.users.find_one({"_id": ObjectId(client_user_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="ID client invalide")
    
    if not user:
        raise HTTPException(status_code=404, detail="Client introuvable")
    
    # Calculate expiry based on plan
    now = datetime.utcnow()
    if plan == "monthly":
        expiry = now + timedelta(days=30)
    elif plan == "quarterly":
        expiry = now + timedelta(days=90)
    else:  # yearly
        expiry = now + timedelta(days=365)
    
    # Calculate commission
    commission = await get_ambassador_commission(amb_id, plan)
    tier = await get_current_pricing_tier()
    price = PRICING_TIERS[tier][plan]["ambassadorPrice"]
    
    # Mark code as used
    await db.activation_codes.update_one(
        {"_id": code_doc["_id"]},
        {"$set": {
            "status": "used",
            "usedAt": now,
            "usedByUserId": client_user_id,
        }}
    )
    
    # Update user subscription
    await db.users.update_one(
        {"_id": ObjectId(client_user_id)},
        {"$set": {
            "subscription": {
                "status": "active",
                "plan": plan,
                "startDate": now.isoformat(),
                "expiryDate": expiry.isoformat(),
                "activatedBy": amb_id,
                "activationCode": code_doc["code"],
                "method": "ambassador_code",
            }
        }}
    )
    
    # Record sale
    sale_doc = {
        "ambassadorId": amb_id,
        "ambassadorName": ambassador["name"],
        "clientUserId": client_user_id,
        "clientName": user.get("username", user.get("phoneNumber", "N/A")),
        "clientPhone": user.get("phoneNumber", "N/A"),
        "plan": plan,
        "price": price,
        "commission": commission,
        "activationCode": code_doc["code"],
        "pricingTier": tier,
        "createdAt": now,
    }
    await db.ambassador_sales.insert_one(sale_doc)
    
    return {
        "success": True,
        "message": f"Abonnement {plan} activé pour {user.get('username', user.get('phoneNumber', 'le client'))}",
        "subscription": {
            "plan": plan,
            "expiryDate": expiry.isoformat(),
        },
        "commission": commission,
        "code": code_doc["code"],
    }

# ==========================================
# Client Self-Activate with Code
# ==========================================
@router.post("/subscription/activate-code")
async def client_activate_code(body: dict):
    """Allow a user to self-activate using a code bought from an ambassador"""
    user_id = body.get("userId", "")
    code_str = body.get("code", "").strip().upper()
    
    if not user_id or not code_str:
        raise HTTPException(status_code=400, detail="ID utilisateur et code requis")
    
    # Find the code
    code_doc = await db.activation_codes.find_one({
        "code": code_str,
        "status": "unused",
        "expiresAt": {"$gt": datetime.utcnow()}
    })
    
    if not code_doc:
        # Check if code exists but is used
        used_code = await db.activation_codes.find_one({"code": code_str, "status": "used"})
        if used_code:
            raise HTTPException(status_code=400, detail="Ce code a déjà été utilisé")
        expired_code = await db.activation_codes.find_one({"code": code_str})
        if expired_code:
            raise HTTPException(status_code=400, detail="Ce code est expiré")
        raise HTTPException(status_code=404, detail="Code invalide. Vérifiez le code et réessayez.")
    
    # Verify user exists
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="ID utilisateur invalide")
    
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    
    plan = code_doc["plan"]
    ambassador_id = code_doc["ambassadorId"]
    
    # Calculate expiry based on plan
    now = datetime.utcnow()
    if plan == "monthly":
        expiry = now + timedelta(days=30)
    elif plan == "quarterly":
        expiry = now + timedelta(days=90)
    else:  # yearly
        expiry = now + timedelta(days=365)
    
    # Get commission
    commission = await get_ambassador_commission(ambassador_id, plan)
    tier = await get_current_pricing_tier()
    price = PRICING_TIERS[tier][plan]["ambassadorPrice"]
    
    # Mark code as used
    await db.activation_codes.update_one(
        {"_id": code_doc["_id"]},
        {"$set": {"status": "used", "usedAt": now, "usedByUserId": user_id}}
    )
    
    # Update user subscription
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {
            "subscription": {
                "status": "active",
                "plan": plan,
                "startDate": now.isoformat(),
                "expiryDate": expiry.isoformat(),
                "activatedBy": ambassador_id,
                "activationCode": code_str,
                "method": "activation_code",
            },
            "isSubscribed": True,
            "subscriptionPlan": plan,
            "subscriptionEndDate": expiry.isoformat(),
        }}
    )
    
    # Record ambassador sale
    ambassador = await db.ambassadors.find_one({"_id": ObjectId(ambassador_id)})
    sale_doc = {
        "ambassadorId": ambassador_id,
        "ambassadorName": ambassador["name"] if ambassador else "N/A",
        "clientUserId": user_id,
        "clientName": user.get("username", user.get("phoneNumber", "N/A")),
        "clientPhone": user.get("phoneNumber", "N/A"),
        "plan": plan,
        "price": price,
        "commission": commission,
        "activationCode": code_str,
        "pricingTier": tier,
        "method": "client_self_activation",
        "createdAt": now,
    }
    await db.ambassador_sales.insert_one(sale_doc)
    
    plan_labels = {"monthly": "Mensuel", "quarterly": "Trimestriel", "yearly": "Annuel"}
    
    return {
        "success": True,
        "message": f"Abonnement {plan_labels.get(plan, plan)} activé avec succès !",
        "subscription": {
            "plan": plan,
            "expiryDate": expiry.isoformat(),
        }
    }

# ==========================================
# Admin: Create Ambassador
# ==========================================
@router.post("/admin/ambassadors/create")
async def admin_create_ambassador(body: dict):
    password = body.get("adminPassword", "")
    admin_pass = os.getenv("ADMIN_PASSWORD", "TekaTeka2025")
    if password != admin_pass:
        raise HTTPException(status_code=401, detail="Mot de passe admin incorrect")
    
    name = body.get("name", "")
    country = body.get("country", "")
    city = body.get("city", "")
    email = body.get("email", "")
    amb_password = body.get("ambassadorPassword", "")
    
    if not all([name, country, city, email, amb_password]):
        raise HTTPException(status_code=400, detail="Tous les champs sont requis")
    
    # Check email uniqueness
    existing = await db.ambassadors.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")
    
    doc = {
        "name": name,
        "country": country,
        "city": city,
        "email": email,
        "passwordHash": pwd_context.hash(amb_password),
        "status": "active",
        "createdAt": datetime.utcnow(),
    }
    result = await db.ambassadors.insert_one(doc)
    
    return {
        "success": True,
        "ambassador": {
            "id": str(result.inserted_id),
            "name": name,
            "email": email,
            "country": country,
            "city": city,
        }
    }

# ==========================================
# Admin: List Ambassadors
# ==========================================
@router.post("/admin/ambassadors/list")
async def admin_list_ambassadors(body: dict):
    password = body.get("adminPassword", "")
    admin_pass = os.getenv("ADMIN_PASSWORD", "TekaTeka2025")
    if password != admin_pass:
        raise HTTPException(status_code=401, detail="Mot de passe admin incorrect")
    
    ambassadors = await db.ambassadors.find().to_list(100)
    result = []
    for amb in ambassadors:
        amb_id = str(amb["_id"])
        total_sales = await db.ambassador_sales.count_documents({"ambassadorId": amb_id})
        total_codes = await db.activation_codes.count_documents({"ambassadorId": amb_id})
        unused_codes = await db.activation_codes.count_documents({"ambassadorId": amb_id, "status": "unused"})
        
        result.append({
            "id": amb_id,
            "name": amb["name"],
            "email": amb["email"],
            "country": amb["country"],
            "city": amb["city"],
            "status": amb.get("status", "active"),
            "totalSales": total_sales,
            "totalCodes": total_codes,
            "unusedCodes": unused_codes,
            "createdAt": amb.get("createdAt", "").isoformat() if amb.get("createdAt") else None,
        })
    
    return result

# ==========================================
# Admin: Block/Unblock Ambassador
# ==========================================
@router.post("/admin/ambassadors/toggle-status")
async def admin_toggle_ambassador(body: dict):
    password = body.get("adminPassword", "")
    admin_pass = os.getenv("ADMIN_PASSWORD", "TekaTeka2025")
    if password != admin_pass:
        raise HTTPException(status_code=401, detail="Mot de passe admin incorrect")
    
    ambassador_id = body.get("ambassadorId", "")
    try:
        amb = await db.ambassadors.find_one({"_id": ObjectId(ambassador_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="ID invalide")
    
    if not amb:
        raise HTTPException(status_code=404, detail="Ambassadeur introuvable")
    
    new_status = "blocked" if amb.get("status") == "active" else "active"
    await db.ambassadors.update_one({"_id": ObjectId(ambassador_id)}, {"$set": {"status": new_status}})
    
    return {"success": True, "newStatus": new_status}

# ==========================================
# Admin: Generate Codes
# ==========================================
@router.post("/admin/codes/generate")
async def admin_generate_codes(body: dict):
    password = body.get("adminPassword", "")
    admin_pass = os.getenv("ADMIN_PASSWORD", "TekaTeka2025")
    if password != admin_pass:
        raise HTTPException(status_code=401, detail="Mot de passe admin incorrect")
    
    count = body.get("count", 10)
    plan = body.get("plan", "monthly")
    ambassador_id = body.get("ambassadorId", "")
    
    if plan not in ["monthly", "quarterly", "yearly"]:
        raise HTTPException(status_code=400, detail="Plan invalide")
    
    if not ambassador_id:
        raise HTTPException(status_code=400, detail="ID ambassadeur requis")
    
    # Verify ambassador exists
    try:
        amb = await db.ambassadors.find_one({"_id": ObjectId(ambassador_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="ID ambassadeur invalide")
    
    if not amb:
        raise HTTPException(status_code=404, detail="Ambassadeur introuvable")
    
    now = datetime.utcnow()
    expires_at = now + timedelta(days=CODE_VALIDITY_DAYS)
    
    generated_codes = []
    for _ in range(count):
        code = generate_activation_code()
        # Ensure uniqueness
        while await db.activation_codes.find_one({"code": code}):
            code = generate_activation_code()
        
        doc = {
            "code": code,
            "plan": plan,
            "ambassadorId": ambassador_id,
            "status": "unused",
            "assignedAt": now,
            "expiresAt": expires_at,
            "usedAt": None,
            "usedByUserId": None,
        }
        await db.activation_codes.insert_one(doc)
        generated_codes.append(code)
    
    return {
        "success": True,
        "codes": generated_codes,
        "count": len(generated_codes),
        "plan": plan,
        "ambassador": amb["name"],
        "expiresAt": expires_at.isoformat(),
    }

# ==========================================
# Admin: All Sales
# ==========================================
@router.post("/admin/ambassador-sales")
async def admin_all_sales(body: dict):
    password = body.get("adminPassword", "")
    admin_pass = os.getenv("ADMIN_PASSWORD", "TekaTeka2025")
    if password != admin_pass:
        raise HTTPException(status_code=401, detail="Mot de passe admin incorrect")
    
    sales = await db.ambassador_sales.find().sort("createdAt", -1).to_list(1000)
    return [serialize_doc(s) for s in sales]

# ==========================================
# Admin: Pricing Info
# ==========================================
@router.post("/admin/pricing-info")
async def admin_pricing_info(body: dict):
    password = body.get("adminPassword", "")
    admin_pass = os.getenv("ADMIN_PASSWORD", "TekaTeka2025")
    if password != admin_pass:
        raise HTTPException(status_code=401, detail="Mot de passe admin incorrect")
    
    tier = await get_current_pricing_tier()
    active_subs = await db.users.count_documents({"subscription.status": "active"})
    
    return {
        "currentTier": tier,
        "activeSubscriptions": active_subs,
        "threshold": EARLY_CLIENT_THRESHOLD,
        "pricing": PRICING_TIERS,
        "commissionMultiplier": COMMISSION_MULTIPLIER,
        "multiplierThreshold": COMMISSION_MULTIPLIER_THRESHOLD,
    }
