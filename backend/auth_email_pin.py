"""
TekaTeka — Email + PIN authentication module.

This is the NEW authentication system that replaces Firebase Phone Auth.
It is universal (works in 200+ countries), needs no Google Play Services,
no SHA fingerprints, no reCAPTCHA, and has no SMS quota.

Flow overview
=============

1. **Sign up** (`POST /auth/email-signup`)
   - email + password (+ optional name + optional phone) -> creates user
   - bcrypt-hashes the password
   - sends a welcome email via Resend (best effort, non-blocking)
   - returns a JWT immediately so the user is logged in

2. **Login with password** (already exists: `/auth/credential-login`)
   - Untouched. Used as the primary login on the new LoginScreen.

3. **Set PIN** (`POST /auth/setup-pin`)
   - Authenticated user picks a 4-digit PIN
   - PIN is bcrypt-hashed and stored on the user document under `pinHash`
   - Once set, the app remembers the user id + email locally and shows a
     PIN keypad on next launch.

4. **Login with PIN** (`POST /auth/login-pin`)
   - identifier (email/phone/userId) + 4-digit PIN -> JWT
   - Fast path for the daily login (no SMS, no password to retype).

5. **Forgot password** (`POST /auth/forgot-password`)
   - Generates a 6-digit code, stores its SHA-256 hash with 10-min TTL
   - Emails the code via Resend
   - Generic response to prevent user enumeration

6. **Reset password** (`POST /auth/reset-password`)
   - Verifies the code, updates the password hash, marks the code used

7. **Change PIN** (`POST /auth/change-pin`)
   - Authenticated user changes their PIN (old PIN -> new PIN)

All endpoints are mounted under `/api` by `server.py`.
"""

from __future__ import annotations

import hashlib
import logging
import os
import secrets
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from dotenv import load_dotenv
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field

from email_service import (
    ResendError,
    reset_email_fr,
    send_email,
    welcome_email_fr,
)

load_dotenv()

# ---------- DB & helpers ----------
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "tekateka_db")
_client = AsyncIOMotorClient(MONGO_URL)
db = _client[DB_NAME]

# Use the SAME bcrypt configuration as the existing `data_api.py` so PINs and
# passwords stay verifiable across modules.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Pepper added to the reset code hash so a DB dump alone cannot brute-force the
# small 6-digit space.
RESET_CODE_PEPPER = os.getenv("RESET_CODE_PEPPER", "tekateka_default_pepper_replace_me")

logger = logging.getLogger("auth_email_pin")

router = APIRouter(prefix="/api")


# Import the existing JWT helpers from data_api so tokens issued here are
# accepted by the rest of the API.
from data_api import create_access_token, get_current_user, serialize_user, utc_now_iso  # noqa: E402


# ---------- Index setup ----------
_indexes_ready = False


async def ensure_auth_indexes() -> None:
    """
    Create indexes used by the new auth system. Safe to call repeatedly —
    MongoDB ignores duplicate index requests.
    """
    global _indexes_ready
    if _indexes_ready:
        return
    try:
        # TTL index on reset codes — MongoDB removes the doc once expires_at
        # is reached. expireAfterSeconds=0 means "expire at the timestamp".
        await db.password_reset_codes.create_index(
            [("expires_at", 1)], expireAfterSeconds=0
        )
        # Lookup index for fast code retrieval
        await db.password_reset_codes.create_index([("email", 1)])
        # Unique email index — but ONLY on documents that have an email
        # (partial index — older Firebase-only users may not have one yet).
        await db.users.create_index(
            "email",
            unique=True,
            partialFilterExpression={"email": {"$type": "string"}},
        )
        _indexes_ready = True
    except Exception as e:  # pragma: no cover — never fatal
        logger.warning("Could not create auth indexes: %s", e)


# ---------- Pydantic models ----------

class EmailSignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    name: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=30)  # Optional — not used for auth


class SetupPinRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=6)  # 4-6 digits


class LoginPinRequest(BaseModel):
    identifier: str = Field(..., min_length=3)  # email, phone, or userId
    pin: str = Field(..., min_length=4, max_length=6)


class ChangePinRequest(BaseModel):
    oldPin: Optional[str] = None  # Optional — first time setting from no PIN
    newPin: str = Field(..., min_length=4, max_length=6)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=4, max_length=10)
    newPassword: str = Field(..., min_length=6, max_length=128)


# ---------- Helpers ----------

def _is_valid_pin(pin: str) -> bool:
    return bool(re.fullmatch(r"\d{4,6}", pin))


def _hash_reset_code(code: str, email: str) -> str:
    return hashlib.sha256(f"{code}:{email}:{RESET_CODE_PEPPER}".encode("utf-8")).hexdigest()


async def _send_email_bg(to: str, subject: str, html: str, text: str) -> None:
    """
    Wrapper to send an email in the background. Failures are logged but never
    propagated — we don't want a temporary Resend outage to break signup.
    """
    try:
        await send_email(to=to, subject=subject, html=html, text=text)
    except ResendError as e:
        logger.error("Resend failed for %s: %s", to, e)
    except Exception as e:  # pragma: no cover
        logger.exception("Unexpected email error for %s: %s", to, e)


# ---------- ROUTES ----------

@router.post("/auth/email-signup")
async def email_signup(req: EmailSignupRequest, background_tasks: BackgroundTasks):
    """
    Create a new account using email + password only. No SMS, no Firebase.
    Returns a JWT so the user is immediately signed in.
    """
    await ensure_auth_indexes()
    email_lower = req.email.lower().strip()

    # Reject if email already in use
    existing = await db.users.find_one({"email": email_lower})
    if existing:
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé. Connectez-vous.")

    now = utc_now_iso()
    doc = {
        "email": email_lower,
        "passwordHash": pwd_context.hash(req.password),
        "name": (req.name or "").strip() or None,
        "phoneNumber": (req.phone or "").strip() or None,
        "createdAt": now,
        "updatedAt": now,
        # Default values matching the existing user shape so the rest of the
        # app behaves like for a phone-auth account.
        "currency": "USD",
        "country": "BE",
        "language": "fr",
        "isSubscribed": False,
        "subscriptionPlan": "trial",
    }
    res = await db.users.insert_one(doc)
    user = await db.users.find_one({"_id": res.inserted_id})
    token = create_access_token(str(user["_id"]), user.get("phoneNumber") or email_lower)

    # Best-effort welcome email
    html, text = welcome_email_fr(req.name, email_lower)
    background_tasks.add_task(_send_email_bg, email_lower, "Bienvenue sur TekaTeka 🎉", html, text)

    return {"success": True, "token": token, "user": serialize_user(user)}


@router.post("/auth/setup-pin")
async def setup_pin(req: SetupPinRequest, user_id: str = Depends(get_current_user)):
    """
    Set or replace the 4-6 digit PIN for the authenticated user.

    The PIN is bcrypt-hashed exactly like a password. It is intended as a
    convenience shortcut on the user's own device (the app must remember which
    user id the PIN belongs to).
    """
    if not _is_valid_pin(req.pin):
        raise HTTPException(status_code=400, detail="Le PIN doit contenir entre 4 et 6 chiffres uniquement.")

    pin_hash = pwd_context.hash(req.pin)
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"pinHash": pin_hash, "pinSetAt": utc_now_iso(), "updatedAt": utc_now_iso()}},
    )
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    return {"success": True, "user": serialize_user(user)}


@router.post("/auth/login-pin")
async def login_pin(req: LoginPinRequest):
    """
    Login with `identifier` (email / phone / userId) + 4-digit PIN.

    Returns a JWT just like the password login. Never reveals whether the
    identifier exists when the credentials are invalid — we use a generic
    "PIN incorrect" message.
    """
    if not _is_valid_pin(req.pin):
        raise HTTPException(status_code=400, detail="Le PIN doit contenir entre 4 et 6 chiffres.")

    identifier = req.identifier.strip().lower()

    # Try every reasonable lookup path
    user = None
    if "@" in identifier:
        user = await db.users.find_one({"email": identifier})
    if not user and identifier.startswith("+"):
        user = await db.users.find_one({"phoneNumber": identifier})
    if not user:
        try:
            user = await db.users.find_one({"_id": ObjectId(identifier)})
        except Exception:
            user = None
    if not user:
        user = await db.users.find_one({"username": identifier})

    if not user or not user.get("pinHash"):
        # Generic error so we don't leak whether the account exists
        raise HTTPException(status_code=401, detail="Identifiant ou PIN incorrect")

    if not pwd_context.verify(req.pin, user["pinHash"]):
        raise HTTPException(status_code=401, detail="Identifiant ou PIN incorrect")

    token = create_access_token(str(user["_id"]), user.get("phoneNumber", ""))
    return {"success": True, "token": token, "user": serialize_user(user)}


@router.post("/auth/change-pin")
async def change_pin(req: ChangePinRequest, user_id: str = Depends(get_current_user)):
    """Change the PIN. Requires the OLD PIN if one is already set."""
    if not _is_valid_pin(req.newPin):
        raise HTTPException(status_code=400, detail="Le nouveau PIN doit contenir entre 4 et 6 chiffres.")

    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    if user.get("pinHash"):
        # A PIN exists -> require the old one
        if not req.oldPin or not pwd_context.verify(req.oldPin, user["pinHash"]):
            raise HTTPException(status_code=401, detail="Ancien PIN incorrect")

    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"pinHash": pwd_context.hash(req.newPin), "pinSetAt": utc_now_iso(), "updatedAt": utc_now_iso()}},
    )
    return {"success": True}


@router.post("/auth/forgot-password")
async def forgot_password(req: ForgotPasswordRequest, background_tasks: BackgroundTasks):
    """
    Send a 6-digit reset code by email. Returns a GENERIC response in all cases
    to prevent user enumeration. If the email is unknown we simply don't send.
    """
    await ensure_auth_indexes()
    email_lower = req.email.lower().strip()

    # Compose generic answer — used whether or not we send anything
    generic = {"success": True, "message": "Si un compte existe pour cet email, un code a été envoyé."}

    user = await db.users.find_one({"email": email_lower})
    if not user:
        # Don't reveal that the email is unknown
        return generic

    # Throttle: don't send more than 1 code per 60s per email
    recent = await db.password_reset_codes.find_one(
        {"email": email_lower},
        sort=[("created_at", -1)],
    )
    if recent:
        created_at = recent.get("created_at")
        if isinstance(created_at, datetime):
            if (datetime.now(timezone.utc) - created_at).total_seconds() < 60:
                return generic  # silently ignore

    code = f"{secrets.randbelow(1_000_000):06d}"
    code_hash = _hash_reset_code(code, email_lower)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    # Wipe any previous codes for this email so only the latest is valid
    await db.password_reset_codes.delete_many({"email": email_lower})
    await db.password_reset_codes.insert_one({
        "email": email_lower,
        "code_hash": code_hash,
        "created_at": datetime.now(timezone.utc),
        "expires_at": expires_at,
        "used_at": None,
        "attempts": 0,
    })

    html, text = reset_email_fr(user.get("name"), code)
    background_tasks.add_task(_send_email_bg, email_lower, "Code de réinitialisation TekaTeka", html, text)
    return generic


@router.post("/auth/reset-password")
async def reset_password(req: ResetPasswordRequest):
    """
    Verify the 6-digit code and replace the user's password. Also wipes the
    PIN so the user must set a new one (prevents an attacker who only knows
    the email + reset code from also using an old PIN).
    """
    email_lower = req.email.lower().strip()
    row = await db.password_reset_codes.find_one({"email": email_lower, "used_at": None})
    if not row:
        raise HTTPException(status_code=400, detail="Code invalide ou expiré")

    # Manual expiry check (in case the TTL hasn't kicked in yet)
    if row.get("expires_at") and row["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Code invalide ou expiré")

    # Brute-force protection — max 5 attempts per code
    if (row.get("attempts") or 0) >= 5:
        raise HTTPException(status_code=429, detail="Trop de tentatives. Redemandez un nouveau code.")

    incoming_hash = _hash_reset_code(req.code.strip(), email_lower)
    if incoming_hash != row["code_hash"]:
        await db.password_reset_codes.update_one({"_id": row["_id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Code invalide ou expiré")

    user = await db.users.find_one({"email": email_lower})
    if not user:
        # Should not happen since we found a code, but defensively bail
        raise HTTPException(status_code=400, detail="Code invalide ou expiré")

    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "passwordHash": pwd_context.hash(req.newPassword),
                "updatedAt": utc_now_iso(),
            },
            # Force the user to set a new PIN — old PIN is no longer valid
            "$unset": {"pinHash": "", "pinSetAt": ""},
        },
    )
    await db.password_reset_codes.update_one(
        {"_id": row["_id"]},
        {"$set": {"used_at": datetime.now(timezone.utc)}},
    )
    return {"success": True, "message": "Mot de passe mis à jour. Reconnectez-vous."}
