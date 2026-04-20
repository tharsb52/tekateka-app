"""
Payment Service for TekaTeka
Handles subscription payments and sales payments via Flutterwave
Currently in SANDBOX/SIMULATION mode - replace with real Flutterwave keys when ready
"""
import os
import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Request
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger(__name__)

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "test_database")
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Flutterwave keys - replace with real keys when ready
FLW_PUBLIC_KEY = os.getenv("FLW_PUBLIC_KEY", "")
FLW_SECRET_KEY = os.getenv("FLW_SECRET_KEY", "")
SANDBOX_MODE = not FLW_SECRET_KEY or FLW_SECRET_KEY.startswith("FLWSECK_TEST")

# JWT - reuse from data_api
import jwt
JWT_SECRET = os.getenv("JWT_SECRET", "tekateka-secret-key-2024")

router = APIRouter()


def get_current_user(request: Request) -> str:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token requis")
    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload["user_id"]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expiré")
    except Exception:
        raise HTTPException(status_code=401, detail="Token invalide")


# ==========================================
# Subscription Payment
# ==========================================
@router.post("/payments/subscribe")
async def initiate_subscription_payment(request: Request, user_id: str = Depends(get_current_user)):
    """Initiate a subscription payment."""
    body = await request.json()
    plan = body.get("plan")  # monthly, quarterly, yearly
    method = body.get("method", "mobile_money")  # mobile_money, card
    phone = body.get("phone", "")
    currency = body.get("currency", "USD")

    if plan not in ["monthly", "quarterly", "yearly"]:
        raise HTTPException(status_code=400, detail="Plan invalide")

    # Calculate amount based on plan
    prices = {
        "monthly": {"USD": 2, "CDF": 5000, "XAF": 1000, "XOF": 1000},
        "quarterly": {"USD": 5, "CDF": 12500, "XAF": 2500, "XOF": 2500},
        "yearly": {"USD": 15, "CDF": 37500, "XAF": 7500, "XOF": 7500},
    }
    amount = prices.get(plan, {}).get(currency, prices[plan]["USD"])
    tx_ref = f"sub_{user_id}_{plan}_{uuid.uuid4().hex[:8]}"

    # Store payment intent
    payment = {
        "userId": user_id,
        "type": "subscription",
        "plan": plan,
        "amount": amount,
        "currency": currency,
        "method": method,
        "phone": phone,
        "txRef": tx_ref,
        "status": "pending",
        "sandbox": SANDBOX_MODE,
        "createdAt": datetime.utcnow().isoformat(),
    }
    await db.payments.insert_one(payment)

    if SANDBOX_MODE:
        # Simulate successful payment in sandbox
        return {
            "success": True,
            "sandbox": True,
            "txRef": tx_ref,
            "amount": amount,
            "currency": currency,
            "message": f"[MODE TEST] Paiement de {amount} {currency} simulé avec succès pour l'abonnement {plan}.",
            "paymentLink": None,
        }
    else:
        # Real Flutterwave integration
        import httpx
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        payload = {
            "tx_ref": tx_ref,
            "amount": amount,
            "currency": currency,
            "payment_options": "mobilemoneyghana,mobilemoneyfranco,mobilemoneyuganda,card" if method == "mobile_money" else "card",
            "customer": {
                "email": user.get("email", f"{user.get('phoneNumber', '')}@tekateka.app"),
                "phonenumber": user.get("phoneNumber", phone),
                "name": user.get("username", "Utilisateur TekaTeka"),
            },
            "customizations": {
                "title": "TekaTeka - Abonnement",
                "description": f"Abonnement {plan}",
            },
            "meta": {"userId": user_id, "plan": plan, "type": "subscription"},
        }
        async with httpx.AsyncClient() as client_http:
            resp = await client_http.post(
                "https://api.flutterwave.com/v3/payments",
                json=payload,
                headers={"Authorization": f"Bearer {FLW_SECRET_KEY}"},
            )
            data = resp.json()
            if data.get("status") == "success":
                return {
                    "success": True,
                    "sandbox": False,
                    "txRef": tx_ref,
                    "paymentLink": data["data"]["link"],
                    "amount": amount,
                    "currency": currency,
                }
            else:
                raise HTTPException(status_code=400, detail=data.get("message", "Erreur de paiement"))


@router.post("/payments/subscribe/confirm")
async def confirm_subscription(request: Request, user_id: str = Depends(get_current_user)):
    """Confirm a subscription payment (sandbox auto-confirms)."""
    body = await request.json()
    tx_ref = body.get("txRef")
    if not tx_ref:
        raise HTTPException(status_code=400, detail="Référence de transaction requise")

    payment = await db.payments.find_one({"txRef": tx_ref, "userId": user_id})
    if not payment:
        raise HTTPException(status_code=404, detail="Paiement introuvable")

    if payment.get("status") == "completed":
        return {"success": True, "message": "Paiement déjà confirmé"}

    # Update payment status
    await db.payments.update_one(
        {"txRef": tx_ref},
        {"$set": {"status": "completed", "completedAt": datetime.utcnow().isoformat()}}
    )

    # Activate subscription
    plan = payment.get("plan")
    now = datetime.utcnow()
    if plan == "monthly":
        end_date = now + timedelta(days=30)
    elif plan == "quarterly":
        end_date = now + timedelta(days=90)
    elif plan == "yearly":
        end_date = now + timedelta(days=365)
    else:
        end_date = now + timedelta(days=30)

    subscription = {
        "plan": plan,
        "status": "active",
        "startedAt": now.isoformat(),
        "expiresAt": end_date.isoformat(),
    }
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"subscription": subscription, "updatedAt": now.isoformat()}}
    )

    from data_api import serialize_user
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    return {"success": True, "user": serialize_user(user), "message": "Abonnement activé !"}


# ==========================================
# Sales Payment (Customer pays Merchant)
# ==========================================
@router.post("/payments/collect")
async def initiate_collection(request: Request, user_id: str = Depends(get_current_user)):
    """Initiate a payment collection for a sale (customer pays merchant)."""
    body = await request.json()
    amount = body.get("amount", 0)
    currency = body.get("currency", "USD")
    method = body.get("method", "mobile_money")  # mobile_money, card
    customer_phone = body.get("customerPhone", "")
    customer_name = body.get("customerName", "Client")
    description = body.get("description", "Paiement")
    sale_id = body.get("saleId", "")

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide")

    tx_ref = f"col_{user_id}_{uuid.uuid4().hex[:8]}"

    payment = {
        "userId": user_id,
        "type": "collection",
        "amount": amount,
        "currency": currency,
        "method": method,
        "customerPhone": customer_phone,
        "customerName": customer_name,
        "description": description,
        "saleId": sale_id,
        "txRef": tx_ref,
        "status": "pending",
        "sandbox": SANDBOX_MODE,
        "createdAt": datetime.utcnow().isoformat(),
    }
    await db.payments.insert_one(payment)

    if SANDBOX_MODE:
        return {
            "success": True,
            "sandbox": True,
            "txRef": tx_ref,
            "amount": amount,
            "currency": currency,
            "message": f"[MODE TEST] Demande de paiement de {amount} {currency} envoyée à {customer_name}.",
        }
    else:
        # Real Flutterwave charge
        import httpx
        async with httpx.AsyncClient() as client_http:
            payload = {
                "tx_ref": tx_ref,
                "amount": amount,
                "currency": currency,
                "payment_options": "mobilemoneyghana,mobilemoneyfranco,mobilemoneyuganda,card",
                "customer": {
                    "email": f"{customer_phone}@tekateka.app",
                    "phonenumber": customer_phone,
                    "name": customer_name,
                },
                "customizations": {
                    "title": "TekaTeka - Paiement",
                    "description": description,
                },
                "meta": {"userId": user_id, "saleId": sale_id, "type": "collection"},
            }
            resp = await client_http.post(
                "https://api.flutterwave.com/v3/payments",
                json=payload,
                headers={"Authorization": f"Bearer {FLW_SECRET_KEY}"},
            )
            data = resp.json()
            if data.get("status") == "success":
                return {
                    "success": True,
                    "sandbox": False,
                    "txRef": tx_ref,
                    "paymentLink": data["data"]["link"],
                    "amount": amount,
                    "currency": currency,
                }
            else:
                raise HTTPException(status_code=400, detail=data.get("message", "Erreur de paiement"))


@router.post("/payments/collect/confirm")
async def confirm_collection(request: Request, user_id: str = Depends(get_current_user)):
    """Confirm a collection payment."""
    body = await request.json()
    tx_ref = body.get("txRef")
    if not tx_ref:
        raise HTTPException(status_code=400, detail="Référence de transaction requise")

    payment = await db.payments.find_one({"txRef": tx_ref, "userId": user_id})
    if not payment:
        raise HTTPException(status_code=404, detail="Paiement introuvable")

    await db.payments.update_one(
        {"txRef": tx_ref},
        {"$set": {"status": "completed", "completedAt": datetime.utcnow().isoformat()}}
    )

    return {"success": True, "message": "Paiement confirmé"}


# ==========================================
# Payment History
# ==========================================
@router.get("/payments/history")
async def payment_history(user_id: str = Depends(get_current_user)):
    """Get payment history for the current user."""
    payments = await db.payments.find({"userId": user_id}).sort("createdAt", -1).to_list(100)
    result = []
    for p in payments:
        result.append({
            "id": str(p["_id"]),
            "type": p.get("type"),
            "amount": p.get("amount"),
            "currency": p.get("currency"),
            "method": p.get("method"),
            "status": p.get("status"),
            "txRef": p.get("txRef"),
            "plan": p.get("plan"),
            "customerName": p.get("customerName"),
            "description": p.get("description"),
            "sandbox": p.get("sandbox", True),
            "createdAt": p.get("createdAt"),
            "completedAt": p.get("completedAt"),
        })
    return result
