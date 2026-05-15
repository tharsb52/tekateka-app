"""
Authentication & Data API for TekaTeka
Supports: Phone OTP + Email/Username+Password login
All data stored in MongoDB for multi-device real-time sync
"""
import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from pathlib import Path

# Helper: produce ISO 8601 UTC timestamp with explicit 'Z' suffix so JS clients
# parse it as UTC (not local time). Without this, frontend displays wrong times.
def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

from fastapi import APIRouter, HTTPException, Depends, Header, Request
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
ACCESS_TOKEN_EXPIRE_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter()

# ==========================================
# Models
# ==========================================
class PhoneLoginRequest(BaseModel):
    phoneNumber: str

class RegisterRequest(BaseModel):
    phoneNumber: str
    email: Optional[str] = None
    username: Optional[str] = None
    password: str
    currency: str = "USD"
    language: str = "fr"

class CredentialLoginRequest(BaseModel):
    identifier: str  # email or username
    password: str

class SetupCredentialsRequest(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    password: str

class UpdateProfileRequest(BaseModel):
    currency: Optional[str] = None
    language: Optional[str] = None
    email: Optional[str] = None
    username: Optional[str] = None

class SubscribeRequest(BaseModel):
    plan: str  # monthly, quarterly, yearly

class PurchaseModel(BaseModel):
    productName: str
    supplier: str = ""
    quantity: int = 1
    unitPrice: float = 0
    totalCost: float = 0
    currency: str = "USD"
    notes: Optional[str] = None

class NoteModel(BaseModel):
    title: str = ""
    content: str = ""
    color: str = "#fff9c4"

class ProductModel(BaseModel):
    name: str
    purchasePrice: float = 0
    salePrice: float = 0
    promotionPrice: Optional[float] = None
    stock: int = 0
    category: str = "food"

class SaleModel(BaseModel):
    productId: str
    productName: str = ""
    quantity: int = 1
    total: float = 0
    paymentMethod: str = "cash"
    currency: str = "USD"
    customerCurrency: Optional[str] = None
    customerTotal: Optional[float] = None
    date: Optional[str] = None
    clientTime: Optional[str] = None  # Local time from device (e.g. "2024-01-15T15:30:00")

class ExpenseModel(BaseModel):
    category: str
    customCategory: Optional[str] = None
    amount: float
    currency: str = "USD"
    notes: Optional[str] = None
    productId: Optional[str] = None

class DebtModel(BaseModel):
    debtorName: str
    amount: float
    currency: str = "USD"
    description: Optional[str] = None
    dueDate: Optional[str] = None
    isPaid: bool = False
    paidDate: Optional[str] = None

# ==========================================
# JWT Token helpers
# ==========================================
def create_access_token(user_id: str, phone: str) -> str:
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode = {"sub": user_id, "phone": phone, "exp": expire}
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Token manquant")
    try:
        token = authorization.replace("Bearer ", "")
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token invalide")
        return user_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Token expiré ou invalide")

# ==========================================
# Auth Routes
# ==========================================
@router.post("/auth/phone-login")
async def phone_login(req: PhoneLoginRequest = None, phone_number: str = None, phoneNumber: str = None):
    """Login/register via phone after OTP verification. Creates user if not exists."""
    phone = None
    if req and req.phoneNumber:
        phone = req.phoneNumber
    else:
        phone = phoneNumber or phone_number
    if not phone:
        raise HTTPException(status_code=400, detail="Numéro requis")
    
    phone = phone.strip().lstrip('+')
    phone = f"+{phone}"
    
    user = await db.users.find_one({"phoneNumber": phone})
    
    if not user:
        # Create new user
        now = utc_now_iso()
        new_user = {
            "phoneNumber": phone,
            "email": None,
            "username": None,
            "passwordHash": None,
            "currency": "USD",
            "language": "fr",
            "subscription": {
                "plan": None,
                "status": "trial",
                "trialEndsAt": (datetime.utcnow() + timedelta(days=7)).isoformat(),
                "expiresAt": None,
            },
            "createdAt": now,
            "updatedAt": now,
        }
        result = await db.users.insert_one(new_user)
        user_id = str(result.inserted_id)
    else:
        user_id = str(user["_id"])
    
    token = create_access_token(user_id, phone)
    
    # Fetch full user
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    
    return {
        "success": True,
        "token": token,
        "user": serialize_user(user),
    }

@router.post("/auth/setup-credentials")
async def setup_credentials(req: SetupCredentialsRequest, user_id: str = Depends(get_current_user)):
    """Set email/username + password for an existing phone account."""
    update = {"passwordHash": pwd_context.hash(req.password), "updatedAt": utc_now_iso()}
    
    if req.email:
        existing = await db.users.find_one({"email": req.email.lower(), "_id": {"$ne": ObjectId(user_id)}})
        if existing:
            raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")
        update["email"] = req.email.lower()
    
    if req.username:
        existing = await db.users.find_one({"username": req.username.lower(), "_id": {"$ne": ObjectId(user_id)}})
        if existing:
            raise HTTPException(status_code=400, detail="Ce nom d'utilisateur est déjà pris")
        update["username"] = req.username.lower()
    
    if not req.email and not req.username:
        raise HTTPException(status_code=400, detail="Email ou nom d'utilisateur requis")
    
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update})
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    
    return {"success": True, "user": serialize_user(user)}

@router.post("/auth/credential-login")
async def credential_login(req: CredentialLoginRequest):
    """Login with email/username + password."""
    identifier = req.identifier.lower().strip()
    
    # Try email first, then username
    user = await db.users.find_one({"email": identifier})
    if not user:
        user = await db.users.find_one({"username": identifier})
    
    if not user:
        raise HTTPException(status_code=401, detail="Identifiant non trouvé")
    
    if not user.get("passwordHash"):
        raise HTTPException(status_code=401, detail="Aucun mot de passe configuré pour ce compte")
    
    if not pwd_context.verify(req.password, user["passwordHash"]):
        raise HTTPException(status_code=401, detail="Mot de passe incorrect")
    
    token = create_access_token(str(user["_id"]), user.get("phoneNumber", ""))
    
    return {
        "success": True,
        "token": token,
        "user": serialize_user(user),
    }

@router.get("/auth/profile")
async def get_profile(user_id: str = Depends(get_current_user)):
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    return {"success": True, "user": serialize_user(user)}

@router.put("/auth/profile")
async def update_profile(req: UpdateProfileRequest, user_id: str = Depends(get_current_user)):
    update = {"updatedAt": utc_now_iso()}
    if req.currency: update["currency"] = req.currency
    if req.language: update["language"] = req.language
    if req.email: update["email"] = req.email.lower()
    if req.username: update["username"] = req.username.lower()
    
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update})
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    return {"success": True, "user": serialize_user(user)}

@router.put("/auth/profile-photo")
async def update_profile_photo(request: Request, user_id: str = Depends(get_current_user)):
    """Upload profile photo as base64."""
    body = await request.json()
    photo = body.get("photo")
    if not photo:
        raise HTTPException(status_code=400, detail="Photo requise")
    # Limit size: ~2MB base64
    if len(photo) > 3_000_000:
        raise HTTPException(status_code=400, detail="Photo trop volumineuse (max 2MB)")
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"profilePhoto": photo, "updatedAt": utc_now_iso()}}
    )
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    return {"success": True, "user": serialize_user(user)}

# ==========================================
# Products CRUD
# ==========================================
@router.get("/data/products")
async def get_products(user_id: str = Depends(get_current_user)):
    products = await db.products.find({"userId": user_id}).to_list(1000)
    return [serialize_doc(p) for p in products]

@router.post("/data/products")
async def add_product(product: ProductModel, user_id: str = Depends(get_current_user)):
    doc = product.dict()
    doc["userId"] = user_id
    doc["createdAt"] = utc_now_iso()
    result = await db.products.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    return serialize_doc(doc)

@router.put("/data/products/{product_id}")
async def update_product(product_id: str, updates: dict, user_id: str = Depends(get_current_user)):
    updates.pop("id", None)
    updates.pop("_id", None)
    updates.pop("userId", None)
    updates["updatedAt"] = utc_now_iso()
    await db.products.update_one({"_id": ObjectId(product_id), "userId": user_id}, {"$set": updates})
    doc = await db.products.find_one({"_id": ObjectId(product_id)})
    return serialize_doc(doc) if doc else {}

@router.delete("/data/products/{product_id}")
async def delete_product(product_id: str, user_id: str = Depends(get_current_user)):
    await db.products.delete_one({"_id": ObjectId(product_id), "userId": user_id})
    return {"success": True}

# ==========================================
# Sales CRUD
# ==========================================
@router.get("/data/sales")
async def get_sales(user_id: str = Depends(get_current_user)):
    sales = await db.sales.find({"userId": user_id}).to_list(5000)
    return [serialize_doc(s) for s in sales]

@router.post("/data/sales")
async def add_sale(sale: SaleModel, user_id: str = Depends(get_current_user)):
    doc = sale.dict()
    doc["userId"] = user_id
    # Prefer the device's local time (sent by the app) so dates reflect the user's actual wall clock
    doc["createdAt"] = doc.get("clientTime") or doc.get("date") or utc_now_iso()
    # Clean up the helper field
    doc.pop("clientTime", None)
    result = await db.sales.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    
    # Update product stock
    if sale.productId:
        try:
            prod = await db.products.find_one({"_id": ObjectId(sale.productId), "userId": user_id})
            if prod:
                new_stock = prod.get("stock", 0) - sale.quantity
                await db.products.update_one(
                    {"_id": ObjectId(sale.productId)},
                    {"$set": {"stock": new_stock, "updatedAt": utc_now_iso()}}
                )
                doc["stockAlert"] = new_stock <= 0
                doc["productNameAlert"] = prod.get("name", "")
        except Exception as e:
            logger.warning(f"Stock update error: {e}")
    
    return serialize_doc(doc)

@router.delete("/data/sales/{sale_id}")
async def delete_sale(sale_id: str, user_id: str = Depends(get_current_user)):
    await db.sales.delete_one({"_id": ObjectId(sale_id), "userId": user_id})
    return {"success": True}

@router.put("/data/sales/{sale_id}")
async def update_sale(sale_id: str, updates: dict, user_id: str = Depends(get_current_user)):
    updates.pop("id", None)
    updates.pop("_id", None)
    updates.pop("userId", None)
    updates["updatedAt"] = utc_now_iso()
    await db.sales.update_one({"_id": ObjectId(sale_id), "userId": user_id}, {"$set": updates})
    doc = await db.sales.find_one({"_id": ObjectId(sale_id)})
    return serialize_doc(doc) if doc else {}

# ==========================================
# Expenses CRUD
# ==========================================
@router.get("/data/expenses")
async def get_expenses(user_id: str = Depends(get_current_user)):
    expenses = await db.expenses.find({"userId": user_id}).to_list(5000)
    return [serialize_doc(e) for e in expenses]

@router.post("/data/expenses")
async def add_expense(expense: ExpenseModel, user_id: str = Depends(get_current_user)):
    doc = expense.dict()
    doc["userId"] = user_id
    doc["createdAt"] = utc_now_iso()
    result = await db.expenses.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    return serialize_doc(doc)

@router.put("/data/expenses/{expense_id}")
async def update_expense(expense_id: str, updates: dict, user_id: str = Depends(get_current_user)):
    updates.pop("id", None)
    updates.pop("_id", None)
    updates.pop("userId", None)
    updates["updatedAt"] = utc_now_iso()
    await db.expenses.update_one({"_id": ObjectId(expense_id), "userId": user_id}, {"$set": updates})
    doc = await db.expenses.find_one({"_id": ObjectId(expense_id)})
    return serialize_doc(doc) if doc else {}

@router.delete("/data/expenses/{expense_id}")
async def delete_expense(expense_id: str, user_id: str = Depends(get_current_user)):
    await db.expenses.delete_one({"_id": ObjectId(expense_id), "userId": user_id})
    return {"success": True}

# ==========================================
# Debts CRUD
# ==========================================
@router.get("/data/debts")
async def get_debts(user_id: str = Depends(get_current_user)):
    debts = await db.debts.find({"userId": user_id}).to_list(5000)
    return [serialize_doc(d) for d in debts]

@router.post("/data/debts")
async def add_debt(debt: DebtModel, user_id: str = Depends(get_current_user)):
    doc = debt.dict()
    doc["userId"] = user_id
    doc["createdAt"] = utc_now_iso()
    result = await db.debts.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    return serialize_doc(doc)

@router.put("/data/debts/{debt_id}")
async def update_debt(debt_id: str, updates: dict, user_id: str = Depends(get_current_user)):
    updates.pop("id", None)
    updates.pop("_id", None)
    updates.pop("userId", None)
    updates["updatedAt"] = utc_now_iso()
    await db.debts.update_one({"_id": ObjectId(debt_id), "userId": user_id}, {"$set": updates})
    doc = await db.debts.find_one({"_id": ObjectId(debt_id)})
    return serialize_doc(doc) if doc else {}

@router.delete("/data/debts/{debt_id}")
async def delete_debt(debt_id: str, user_id: str = Depends(get_current_user)):
    await db.debts.delete_one({"_id": ObjectId(debt_id), "userId": user_id})
    return {"success": True}

# ==========================================
# Purchases CRUD
# ==========================================
@router.get("/data/purchases")
async def get_purchases(user_id: str = Depends(get_current_user)):
    purchases = await db.purchases.find({"userId": user_id}).to_list(5000)
    return [serialize_doc(p) for p in purchases]

@router.post("/data/purchases")
async def add_purchase(purchase: PurchaseModel, user_id: str = Depends(get_current_user)):
    doc = purchase.dict()
    doc["userId"] = user_id
    doc["createdAt"] = utc_now_iso()
    result = await db.purchases.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    return serialize_doc(doc)

@router.put("/data/purchases/{purchase_id}")
async def update_purchase(purchase_id: str, updates: dict, user_id: str = Depends(get_current_user)):
    updates.pop("id", None)
    updates.pop("_id", None)
    updates.pop("userId", None)
    updates["updatedAt"] = utc_now_iso()
    await db.purchases.update_one({"_id": ObjectId(purchase_id), "userId": user_id}, {"$set": updates})
    doc = await db.purchases.find_one({"_id": ObjectId(purchase_id)})
    return serialize_doc(doc) if doc else {}

@router.delete("/data/purchases/{purchase_id}")
async def delete_purchase(purchase_id: str, user_id: str = Depends(get_current_user)):
    await db.purchases.delete_one({"_id": ObjectId(purchase_id), "userId": user_id})
    return {"success": True}

# ==========================================
# Notes CRUD
# ==========================================
@router.get("/data/notes")
async def get_notes(user_id: str = Depends(get_current_user)):
    notes = await db.notes.find({"userId": user_id}).sort("updatedAt", -1).to_list(5000)
    return [serialize_doc(n) for n in notes]

@router.post("/data/notes")
async def add_note(note: NoteModel, user_id: str = Depends(get_current_user)):
    doc = note.dict()
    doc["userId"] = user_id
    now = utc_now_iso()
    doc["createdAt"] = now
    doc["updatedAt"] = now
    result = await db.notes.insert_one(doc)
    doc["id"] = str(result.inserted_id)
    return serialize_doc(doc)

@router.put("/data/notes/{note_id}")
async def update_note(note_id: str, updates: dict, user_id: str = Depends(get_current_user)):
    updates.pop("id", None)
    updates.pop("_id", None)
    updates.pop("userId", None)
    updates["updatedAt"] = utc_now_iso()
    await db.notes.update_one({"_id": ObjectId(note_id), "userId": user_id}, {"$set": updates})
    doc = await db.notes.find_one({"_id": ObjectId(note_id)})
    return serialize_doc(doc) if doc else {}

@router.delete("/data/notes/{note_id}")
async def delete_note(note_id: str, user_id: str = Depends(get_current_user)):
    await db.notes.delete_one({"_id": ObjectId(note_id), "userId": user_id})
    return {"success": True}

# ==========================================
# Subscription
# ==========================================
@router.post("/auth/subscribe")
async def subscribe(req: SubscribeRequest, user_id: str = Depends(get_current_user)):
    """Subscribe to a plan."""
    now = datetime.utcnow()
    if req.plan == "monthly":
        end_date = now + timedelta(days=30)
    elif req.plan == "quarterly":
        end_date = now + timedelta(days=90)
    elif req.plan == "yearly":
        end_date = now + timedelta(days=365)
    else:
        raise HTTPException(status_code=400, detail="Plan invalide")
    
    subscription = {
        "plan": req.plan,
        "status": "active",
        "startedAt": now.isoformat(),
        "expiresAt": end_date.isoformat(),
    }
    
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"subscription": subscription, "updatedAt": now.isoformat()}}
    )
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    return {"success": True, "user": serialize_user(user)}

# ==========================================
# Helpers
# ==========================================
def serialize_doc(doc):
    """Convert MongoDB document to JSON-serializable dict."""
    if not doc:
        return {}
    result = {}
    for k, v in doc.items():
        if k == "_id":
            result["id"] = str(v)
        elif isinstance(v, ObjectId):
            result[k] = str(v)
        elif isinstance(v, datetime):
            result[k] = v.isoformat()
        else:
            result[k] = v
    if "id" not in result and "_id" not in doc:
        result["id"] = result.get("id", "")
    return result

def serialize_user(user):
    """Serialize user document, excluding sensitive fields."""
    if not user:
        return {}
    return {
        "id": str(user["_id"]),
        "phoneNumber": user.get("phoneNumber", ""),
        "email": user.get("email"),
        "username": user.get("username"),
        "hasPassword": bool(user.get("passwordHash")),
        "currency": user.get("currency", "USD"),
        "language": user.get("language", "fr"),
        "subscription": user.get("subscription", {}),
        "profilePhoto": user.get("profilePhoto"),
        "createdAt": user.get("createdAt", ""),
    }
