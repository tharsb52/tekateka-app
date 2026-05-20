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
    unit: Optional[str] = None          # one of UNIT_PRESETS or any custom string
    customUnit: Optional[str] = None    # used when unit == "autre"; final stored unit becomes this
    lowStockThreshold: int = 5          # per-product threshold; default 5

class RestockRequest(BaseModel):
    quantityAdded: int
    newPurchasePrice: Optional[float] = None
    currency: Optional[str] = None
    note: Optional[str] = None

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
        # Create new user with a 7-day free trial
        now = utc_now_iso()
        trial_end = (datetime.utcnow() + timedelta(days=7)).isoformat() + "Z"
        new_user = {
            "phoneNumber": phone,
            "email": None,
            "username": None,
            "passwordHash": None,
            "currency": "EUR",
            "language": "fr",
            "subscription": {
                "plan": "trial",
                "status": "trial",
                "trialEndsAt": trial_end,
                "expiresAt": trial_end,
                "startedAt": now,
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

# Pre-defined unit list for product sale units. The frontend renders a picker
# from this list; choosing "autre" lets the user type a free-text unit. Both
# preset and custom values end up stored in the same `unit` field.
UNIT_PRESETS = [
    "pcs", "kg", "g", "L", "mL", "sac", "carton", "bouteille",
    "paquet", "caisse", "botte", "mètre", "boîte", "douzaine", "autre",
]


def _normalize_unit(unit: Optional[str], custom_unit: Optional[str]) -> Optional[str]:
    """Return the canonical unit string actually stored on the product.

    If the user picked "autre", we promote `customUnit` to be the stored unit.
    Trimming + case-preservation keeps "kg" and "KG" identical for duplicate
    detection (handled in _normalize_for_match below) without altering display.
    """
    if (unit or "").strip().lower() == "autre":
        cu = (custom_unit or "").strip()
        return cu or None
    u = (unit or "").strip()
    return u or None


def _normalize_for_match(value: Optional[str]) -> str:
    """Lower-cased, whitespace-collapsed key used to compare names/units."""
    if not value:
        return ""
    return " ".join(value.strip().lower().split())


async def _next_product_sku(user_id: str) -> str:
    """Atomically increment a per-user counter and return a zero-padded SKU.

    The first SKU for a user is "PROD-000001". The counter lives in
    db.counters keyed by (userId, name). Using $inc + upsert guarantees
    uniqueness even under concurrent inserts.
    """
    res = await db.counters.find_one_and_update(
        {"userId": user_id, "name": "products"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,  # returns the post-increment document
    )
    # Fall back to a fresh fetch if the driver returned None (very old motor)
    if not res:
        res = await db.counters.find_one({"userId": user_id, "name": "products"})
    seq = int((res or {}).get("seq", 1))
    return f"PROD-{seq:06d}"


def _stock_alert_flags(stock: int, threshold: int) -> dict:
    """Returns booleans the frontend uses to render stock badges.

    * `outOfStock`  = stock is exhausted (0 or less)
    * `lowStock`    = there's some stock left, but it's at or under the threshold
    These flags are RECOMPUTED on every read/update so the dashboards always
    reflect the latest stock value — they're never cached on the document.
    """
    stock = int(stock or 0)
    threshold = max(0, int(threshold or 0))
    return {
        "outOfStock": stock <= 0,
        "lowStock": 0 < stock <= threshold,
    }


def _serialize_product(doc: dict) -> dict:
    """Standard product payload returned to the frontend. Adds derived flags."""
    out = serialize_doc(doc)
    out.update(_stock_alert_flags(doc.get("stock", 0), doc.get("lowStockThreshold", 5)))
    return out


@router.get("/data/products")
async def get_products(user_id: str = Depends(get_current_user)):
    products = await db.products.find({"userId": user_id}).to_list(1000)
    return [_serialize_product(p) for p in products]


@router.post("/data/products")
async def add_product(product: ProductModel, user_id: str = Depends(get_current_user)):
    """Create a new product OR detect a duplicate and ask the client to restock.

    Duplicate criteria (per-user shop):
      * normalized name matches (trim + lowercase + collapsed spaces)
      * unit matches (both None == match; "kg" vs None == DIFFERENT)
    A different unit means a different product (e.g. "Sucre" pcs vs "Sucre" kg).

    Response shapes:
      * Created normally  -> 200 { ...product, duplicate: false }
      * Duplicate found   -> 200 { duplicate: true, samePrice: bool, existing: <product> }
    The frontend then prompts the user to confirm a restock via the dedicated
    /restock endpoint below — never creating a silent duplicate.
    """
    name_key = _normalize_for_match(product.name)
    if not name_key:
        raise HTTPException(status_code=400, detail="Nom du produit requis")

    unit = _normalize_unit(product.unit, product.customUnit)
    unit_key = _normalize_for_match(unit)

    # Detect duplicate among this user's existing products
    existing = None
    candidates = await db.products.find({"userId": user_id}).to_list(2000)
    for p in candidates:
        if _normalize_for_match(p.get("name")) == name_key and \
           _normalize_for_match(p.get("unit")) == unit_key:
            existing = p
            break

    if existing:
        same_price = float(existing.get("purchasePrice") or 0) == float(product.purchasePrice or 0)
        return {
            "duplicate": True,
            "samePrice": same_price,
            "existing": _serialize_product(existing),
        }

    # No duplicate -> create the product with an auto SKU
    sku = await _next_product_sku(user_id)
    doc = product.dict()
    doc["unit"] = unit
    doc.pop("customUnit", None)  # not stored; merged into `unit` already
    doc["sku"] = sku
    doc["userId"] = user_id
    doc["createdAt"] = utc_now_iso()
    doc["lowStockThreshold"] = max(0, int(product.lowStockThreshold or 5))

    result = await db.products.insert_one(doc)
    doc["_id"] = result.inserted_id
    payload = _serialize_product(doc)
    payload["duplicate"] = False
    return payload


@router.put("/data/products/{product_id}")
async def update_product(product_id: str, updates: dict, user_id: str = Depends(get_current_user)):
    updates.pop("id", None)
    updates.pop("_id", None)
    updates.pop("userId", None)
    updates.pop("sku", None)  # SKU is immutable once assigned
    updates.pop("createdAt", None)

    # Normalize unit if the client is editing it
    if "unit" in updates or "customUnit" in updates:
        updates["unit"] = _normalize_unit(updates.get("unit"), updates.get("customUnit"))
        updates.pop("customUnit", None)

    if "lowStockThreshold" in updates and updates["lowStockThreshold"] is not None:
        updates["lowStockThreshold"] = max(0, int(updates["lowStockThreshold"]))

    updates["updatedAt"] = utc_now_iso()
    await db.products.update_one({"_id": ObjectId(product_id), "userId": user_id}, {"$set": updates})
    doc = await db.products.find_one({"_id": ObjectId(product_id)})
    return _serialize_product(doc) if doc else {}


@router.delete("/data/products/{product_id}")
async def delete_product(product_id: str, user_id: str = Depends(get_current_user)):
    await db.products.delete_one({"_id": ObjectId(product_id), "userId": user_id})
    return {"success": True}


@router.post("/data/products/{product_id}/restock")
async def restock_product(
    product_id: str,
    body: RestockRequest,
    user_id: str = Depends(get_current_user),
):
    """Increase the stock of an existing product. Optionally records a new
    purchase price into the per-product price history.

    Behavior (per user spec, choice "3A"):
      * Stock is incremented by quantityAdded (must be >= 1).
      * If newPurchasePrice is provided AND differs from the current
        purchasePrice, we append a record to purchase_price_history AND
        replace the current purchasePrice with the new value. The old price
        is preserved in history forever for accounting.
      * If newPurchasePrice is missing OR equal to the current price, no
        history record is created.
    """
    try:
        oid = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID produit invalide")

    prod = await db.products.find_one({"_id": oid, "userId": user_id})
    if not prod:
        raise HTTPException(status_code=404, detail="Produit introuvable")

    qty = int(body.quantityAdded or 0)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="La quantité doit être supérieure à zéro")

    now = utc_now_iso()
    set_updates = {
        "stock": int(prod.get("stock", 0)) + qty,
        "updatedAt": now,
    }

    old_price = float(prod.get("purchasePrice") or 0)
    new_price_in = body.newPurchasePrice
    record_history = False
    if new_price_in is not None:
        new_price = float(new_price_in)
        if new_price < 0:
            raise HTTPException(status_code=400, detail="Prix d'achat invalide")
        if abs(new_price - old_price) > 1e-9:
            set_updates["purchasePrice"] = new_price
            record_history = True

    await db.products.update_one({"_id": oid}, {"$set": set_updates})

    if record_history:
        await db.purchase_price_history.insert_one({
            "productId": str(oid),
            "userId": user_id,
            "sku": prod.get("sku"),
            "name": prod.get("name"),
            "oldPurchasePrice": old_price,
            "newPurchasePrice": float(new_price_in),
            "quantityAdded": qty,
            "currency": body.currency or "EUR",
            "note": body.note,
            "date": now,
            "source": "restock",
        })

    updated = await db.products.find_one({"_id": oid})
    return _serialize_product(updated) if updated else {}


@router.get("/data/products/{product_id}/price-history")
async def get_price_history(product_id: str, user_id: str = Depends(get_current_user)):
    """Return the chronological purchase-price history of a single product
    (most recent first). Always scoped to the requesting user (IDOR-safe)."""
    try:
        oid = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID produit invalide")

    prod = await db.products.find_one({"_id": oid, "userId": user_id})
    if not prod:
        raise HTTPException(status_code=404, detail="Produit introuvable")

    history = await db.purchase_price_history.find(
        {"productId": str(oid), "userId": user_id}
    ).sort("date", -1).to_list(500)
    return [serialize_doc(h) for h in history]

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
    # Always store the canonical UTC timestamp. The mobile app converts to the
    # user's local timezone for display via `utils/dateUtils.formatLocal`.
    doc["createdAt"] = utc_now_iso()
    # Clean up legacy helper field if present
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
                # Recompute alert flags against the product's own threshold so
                # the dashboard / list refreshes immediately with the right
                # badge (out-of-stock vs low-stock vs ok).
                threshold = int(prod.get("lowStockThreshold", 5) or 5)
                doc["stockAlert"] = new_stock <= 0
                doc["lowStockAlert"] = 0 < new_stock <= threshold
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
