"""
Account API — GDPR-compliant user data deletion.

Provides a single authenticated endpoint that purges all personal data
belonging to the authenticated user from MongoDB.

Firebase Auth account deletion is performed CLIENT-SIDE
(auth().currentUser?.delete()) because:
  1. The user is signed in to Firebase on their device — they have full
     authority to delete their own auth credential, no service-account key
     required on the backend.
  2. Right-to-be-forgotten is then a two-step flow:
       a) backend purges all business data (this endpoint)
       b) client deletes the Firebase Auth user
     If step (b) fails (e.g. requires re-auth), the local session is still
     cleared and the user is signed out — they can re-attempt later.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, Any

from bson import ObjectId
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient

# Re-use the JWT auth dependency from data_api so this endpoint is
# only callable by the authenticated owner of the account.
from data_api import get_current_user

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logger = logging.getLogger(__name__)

router = APIRouter(tags=["account"])

# Database (re-create our own handle here; matches the rest of the
# codebase where each router owns its Motor client)
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
_client = AsyncIOMotorClient(MONGO_URL)
db = _client[DB_NAME]

# All collections that may contain documents owned by the user.
# Anything keyed by `userId` (string == str(user._id)) lives here.
USER_OWNED_COLLECTIONS = (
    "products",
    "sales",
    "expenses",
    "debts",
    "notes",
    "purchases",
    "purchase_price_history",
    "payments",
    "counters",
    "stock_alerts",
)


@router.delete("/account/me")
async def delete_my_account(user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    """
    GDPR right-to-be-forgotten.

    Hard-deletes every personal document belonging to the caller across
    every business collection AND the `users` collection itself.

    The caller must be authenticated (Bearer JWT).  The endpoint is
    idempotent — calling it twice is harmless.

    Returns the per-collection deletion counts so the client can show a
    transparent receipt to the user ("Voici exactement ce qui a été
    supprimé"), which is itself a GDPR best practice.
    """
    if not user_id:
        raise HTTPException(status_code=401, detail="Non authentifié")

    # Look the user up first so we can log a (heavily redacted) audit
    # trail BEFORE we wipe the row.
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Identifiant utilisateur invalide")

    user_doc = await db.users.find_one({"_id": oid}, {"phoneNumber": 1, "email": 1})
    if not user_doc:
        # Already gone — return idempotent success.
        return {
            "status": "ok",
            "message": "Compte déjà supprimé.",
            "deleted_counts": {},
            "user_doc_existed": False,
        }

    # Anonymised audit log — keep the FACT of deletion (legally useful)
    # without keeping any PII.
    phone_suffix = (user_doc.get("phoneNumber") or "")[-4:]
    logger.info(
        "GDPR_DELETE user_id=%s phone_suffix=****%s timestamp=%s",
        user_id, phone_suffix, datetime.utcnow().isoformat(),
    )

    deleted_counts: Dict[str, int] = {}

    for col_name in USER_OWNED_COLLECTIONS:
        try:
            result = await db[col_name].delete_many({"userId": user_id})
            deleted_counts[col_name] = result.deleted_count
        except Exception as exc:
            # Don't abort the whole purge on one collection failure —
            # we want the rest of the user's data gone regardless.
            logger.error("GDPR_DELETE collection=%s error=%s", col_name, exc)
            deleted_counts[col_name] = -1

    # Finally, the user row itself.
    try:
        user_result = await db.users.delete_one({"_id": oid})
        deleted_counts["users"] = user_result.deleted_count
    except Exception as exc:
        logger.error("GDPR_DELETE users-row error=%s", exc)
        deleted_counts["users"] = -1

    # If the user happens to also be an ambassador, we leave the
    # `ambassadors` row + their issued `activation_codes` /
    # `ambassador_sales` / `commissions` alone — those belong to the
    # ambassador *business relationship* (a separate legal entity in
    # most cases) and are kept for accounting per the ToS.  If the
    # account is purely a customer account this branch is a no-op.

    return {
        "status": "ok",
        "message": "Toutes vos données personnelles ont été supprimées.",
        "deleted_counts": deleted_counts,
        "user_doc_existed": True,
    }
