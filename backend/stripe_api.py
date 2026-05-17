"""
Stripe Payment API for TekaTeka
================================

Two business flows:
  1. Subscription purchase (monthly / quarterly / yearly)
  2. Ambassador activation-code purchase (one-time, configurable amount)

Architecture choice
-------------------
We use Stripe **Checkout** (hosted payment page) instead of the native
React-Native SDK. This is intentional:
  * No native module to install -> APK size stays low.
  * No EAS build crash risk (we learned the hard way with expo-notifications).
  * Stripe hosts the card form -> PCI scope reduced to almost zero.

Frontend flow:
  POST /api/payments/stripe/subscription/checkout  -> returns { url }
  Mobile app opens `url` via Linking.openURL(...)
  User pays on Stripe-hosted page
  Stripe redirects to success_url / cancel_url
  Stripe webhook -> /api/payments/stripe/webhook updates DB authoritatively

The webhook is the **source of truth** for activation. The success_url
should only display a "thank you" page and re-fetch the user profile.
"""
import os
import logging
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import stripe
from fastapi import APIRouter, HTTPException, Depends, Request, Header
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from dotenv import load_dotenv
from pydantic import BaseModel

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger(__name__)

# --- Config -------------------------------------------------------------
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "test_database")
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "https://tekateka.app")

stripe.api_key = STRIPE_SECRET_KEY
STRIPE_ENABLED = bool(STRIPE_SECRET_KEY) and STRIPE_SECRET_KEY.startswith("sk_")

# JWT auth (reuse data_api logic)
import jwt
JWT_SECRET = os.getenv("JWT_SECRET", "tekateka-secret-key-2025-change-in-production")

router = APIRouter()


def get_current_user(request: Request) -> str:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token requis")
    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload.get("sub") or payload.get("user_id")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expiré")
    except Exception:
        raise HTTPException(status_code=401, detail="Token invalide")


# --- Pricing (EUR cents) -------------------------------------------------
# Direct user subscription (sold via /payments/stripe/subscription/checkout)
SUBSCRIPTION_PRICES_CENTS = {
    "monthly":    500,   # €5.00
    "quarterly": 1400,   # €14.00
    "yearly":    5500,   # €55.00
}

# Ambassador wholesale price for activation codes by plan
# (sold via /payments/stripe/ambassador/checkout)
AMBASSADOR_PLAN_PRICES_CENTS = {
    "monthly":    400,   # €4.00 per code
    "quarterly": 1200,   # €12.00 per code
    "yearly":    5000,   # €50.00 per code
}

SUBSCRIPTION_DURATION_DAYS = {
    "monthly":   30,
    "quarterly": 90,
    "yearly":   365,
}

# Free trial granted to new users at signup
FREE_TRIAL_DAYS = 7

PAYMENT_CURRENCY = "eur"


# --- Schemas ------------------------------------------------------------
class SubscriptionCheckoutRequest(BaseModel):
    plan: str  # "monthly" | "quarterly" | "yearly"


class AmbassadorCheckoutRequest(BaseModel):
    plan: str = "monthly"  # "monthly" | "quarterly" | "yearly"
    quantity: int = 1       # number of activation codes to buy


class CheckoutResponse(BaseModel):
    url: str
    sessionId: str


# --- Endpoints ----------------------------------------------------------
@router.get("/payments/stripe/config")
async def stripe_config():
    """Expose the publishable key (safe to share with frontend)."""
    return {
        "enabled": STRIPE_ENABLED,
        "publishableKey": STRIPE_PUBLISHABLE_KEY,
        "currency": PAYMENT_CURRENCY,
        "freeTrialDays": FREE_TRIAL_DAYS,
        "prices": {
            "subscription": SUBSCRIPTION_PRICES_CENTS,
            "ambassadorByPlan": AMBASSADOR_PLAN_PRICES_CENTS,
        },
        "durations": SUBSCRIPTION_DURATION_DAYS,
    }


@router.post("/payments/stripe/subscription/checkout", response_model=CheckoutResponse)
async def create_subscription_checkout(
    payload: SubscriptionCheckoutRequest,
    user_id: str = Depends(get_current_user),
):
    """Create a Stripe Checkout session for a subscription purchase.

    Returns the Stripe-hosted URL. The mobile app opens it with
    `Linking.openURL(url)` and the user pays on Stripe's page.
    """
    if not STRIPE_ENABLED:
        raise HTTPException(status_code=503, detail="Stripe non configuré")

    if payload.plan not in SUBSCRIPTION_PRICES_CENTS:
        raise HTTPException(status_code=400, detail="Plan invalide")

    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    amount_cents = SUBSCRIPTION_PRICES_CENTS[payload.plan]
    idempotency_key = f"sub-{user_id}-{payload.plan}-{uuid.uuid4().hex[:8]}"

    try:
        session = stripe.checkout.Session.create(
            mode="payment",  # one-time charge; we manage recurrence ourselves
            payment_method_types=["card"],
            line_items=[{
                "quantity": 1,
                "price_data": {
                    "currency": PAYMENT_CURRENCY,
                    "unit_amount": amount_cents,
                    "product_data": {
                        "name": f"TekaTeka - Abonnement {payload.plan}",
                        "description": f"Abonnement {payload.plan} ({SUBSCRIPTION_DURATION_DAYS[payload.plan]} jours)",
                    },
                },
            }],
            customer_email=user.get("email") or None,
            success_url=f"{FRONTEND_BASE_URL}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{FRONTEND_BASE_URL}/billing/cancel",
            metadata={
                "userId": user_id,
                "type": "subscription",
                "plan": payload.plan,
            },
            idempotency_key=idempotency_key,
        )
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error creating subscription session: {e}")
        raise HTTPException(status_code=502, detail=str(e))

    # Track pending payment
    await db.payments.insert_one({
        "userId": user_id,
        "type": "subscription",
        "plan": payload.plan,
        "amount": amount_cents / 100.0,
        "currency": PAYMENT_CURRENCY.upper(),
        "provider": "stripe",
        "stripeSessionId": session.id,
        "status": "pending",
        "idempotencyKey": idempotency_key,
        "createdAt": datetime.utcnow().isoformat() + "Z",
    })

    return CheckoutResponse(url=session.url, sessionId=session.id)


@router.post("/payments/stripe/ambassador/checkout", response_model=CheckoutResponse)
async def create_ambassador_checkout(
    payload: AmbassadorCheckoutRequest,
    user_id: str = Depends(get_current_user),
):
    """Create a Stripe Checkout session for an ambassador buying activation codes.

    Each code is bound to a plan (monthly / quarterly / yearly) which determines
    the duration the client gets when they activate it.
    """
    if not STRIPE_ENABLED:
        raise HTTPException(status_code=503, detail="Stripe non configuré")

    plan = payload.plan
    if plan not in AMBASSADOR_PLAN_PRICES_CENTS:
        raise HTTPException(status_code=400, detail="Plan invalide")

    qty = max(1, min(int(payload.quantity or 1), 100))
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    unit_amount = AMBASSADOR_PLAN_PRICES_CENTS[plan]
    idempotency_key = f"amb-{user_id}-{plan}-{qty}-{uuid.uuid4().hex[:8]}"

    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            payment_method_types=["card"],
            line_items=[{
                "quantity": qty,
                "price_data": {
                    "currency": PAYMENT_CURRENCY,
                    "unit_amount": unit_amount,
                    "product_data": {
                        "name": f"TekaTeka - Code d'activation {plan}",
                        "description": f"Code d'activation client ({SUBSCRIPTION_DURATION_DAYS[plan]} jours)",
                    },
                },
            }],
            customer_email=user.get("email") or None,
            success_url=f"{FRONTEND_BASE_URL}/ambassador/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{FRONTEND_BASE_URL}/ambassador/cancel",
            metadata={
                "userId": user_id,
                "type": "ambassador_codes",
                "plan": plan,
                "quantity": str(qty),
            },
            idempotency_key=idempotency_key,
        )
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error creating ambassador session: {e}")
        raise HTTPException(status_code=502, detail=str(e))

    await db.payments.insert_one({
        "userId": user_id,
        "type": "ambassador_codes",
        "plan": plan,
        "quantity": qty,
        "amount": (unit_amount * qty) / 100.0,
        "currency": PAYMENT_CURRENCY.upper(),
        "provider": "stripe",
        "stripeSessionId": session.id,
        "status": "pending",
        "idempotencyKey": idempotency_key,
        "createdAt": datetime.utcnow().isoformat() + "Z",
    })

    return CheckoutResponse(url=session.url, sessionId=session.id)


@router.get("/payments/stripe/session/{session_id}")
async def get_session_status(session_id: str, user_id: str = Depends(get_current_user)):
    """Polled by the mobile app after returning from Checkout.

    Webhook is authoritative, but polling lets us refresh the UI quickly
    without waiting for the next data sync.
    """
    payment = await db.payments.find_one({"stripeSessionId": session_id, "userId": user_id})
    if not payment:
        raise HTTPException(status_code=404, detail="Paiement introuvable")

    # If still pending, query Stripe directly (covers cases where the
    # webhook hasn't arrived yet because of network latency).
    if payment.get("status") == "pending" and STRIPE_ENABLED:
        try:
            session = stripe.checkout.Session.retrieve(session_id)
            if session.payment_status == "paid":
                await _fulfill_payment(payment, session)
                payment = await db.payments.find_one({"stripeSessionId": session_id})
        except stripe.error.StripeError as e:
            logger.warning(f"Could not retrieve session {session_id}: {e}")

    return {
        "status": payment.get("status"),
        "type": payment.get("type"),
        "amount": payment.get("amount"),
        "currency": payment.get("currency"),
    }


# --- Webhook ------------------------------------------------------------
@router.post("/payments/stripe/webhook", include_in_schema=False)
async def stripe_webhook(request: Request, stripe_signature: Optional[str] = Header(None)):
    """Receives Stripe webhook events. Signature-verified."""
    raw_body = await request.body()

    if not STRIPE_WEBHOOK_SECRET:
        # In dev we accept unsigned events for easy testing.
        logger.warning("STRIPE_WEBHOOK_SECRET is empty - skipping signature check (DEV ONLY)")
        try:
            import json
            event = json.loads(raw_body)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid payload")
    else:
        try:
            event = stripe.Webhook.construct_event(
                payload=raw_body,
                sig_header=stripe_signature or "",
                secret=STRIPE_WEBHOOK_SECRET,
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid payload")
        except stripe.error.SignatureVerificationError:
            raise HTTPException(status_code=400, detail="Invalid signature")

    event_type = event.get("type") if isinstance(event, dict) else event["type"]
    data_object = (event.get("data") or {}).get("object") if isinstance(event, dict) else event["data"]["object"]

    if event_type == "checkout.session.completed":
        session_id = data_object.get("id")
        payment = await db.payments.find_one({"stripeSessionId": session_id})
        if payment:
            await _fulfill_payment(payment, data_object)
        else:
            logger.warning(f"Received checkout.session.completed for unknown session {session_id}")

    return {"received": True}


# --- Fulfillment --------------------------------------------------------
async def _fulfill_payment(payment: dict, session: dict):
    """Activate subscription or issue ambassador codes after payment confirmed."""
    if payment.get("status") == "completed":
        return  # idempotent

    payment_status = session.get("payment_status") if isinstance(session, dict) else getattr(session, "payment_status", None)
    if payment_status and payment_status != "paid":
        return

    now = datetime.utcnow()
    user_id = payment.get("userId")
    ptype = payment.get("type")

    await db.payments.update_one(
        {"_id": payment["_id"]},
        {"$set": {
            "status": "completed",
            "completedAt": now.isoformat() + "Z",
            "stripePaymentIntentId": session.get("payment_intent") if isinstance(session, dict) else getattr(session, "payment_intent", None),
        }}
    )

    if ptype == "subscription":
        plan = payment.get("plan", "monthly")
        end_date = now + timedelta(days=SUBSCRIPTION_DURATION_DAYS.get(plan, 30))
        await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {
                "subscription": {
                    "plan": plan,
                    "status": "active",
                    "startedAt": now.isoformat() + "Z",
                    "expiresAt": end_date.isoformat() + "Z",
                    "provider": "stripe",
                },
                "updatedAt": now.isoformat() + "Z",
            }}
        )
        logger.info(f"Activated {plan} subscription for user {user_id}")

    elif ptype == "ambassador_codes":
        qty = int(payment.get("quantity", 1))
        plan = payment.get("plan", "monthly")
        duration_days = SUBSCRIPTION_DURATION_DAYS.get(plan, 30)
        codes_created = []
        for _ in range(qty):
            code = f"TK-{uuid.uuid4().hex[:8].upper()}"
            await db.ambassador_codes.insert_one({
                "code": code,
                "ambassadorUserId": user_id,
                "plan": plan,
                "durationDays": duration_days,
                "status": "available",
                "purchasePaymentId": str(payment["_id"]),
                "createdAt": now.isoformat() + "Z",
            })
            codes_created.append(code)
        logger.info(f"Created {qty} ambassador codes ({plan}) for user {user_id}: {codes_created}")
