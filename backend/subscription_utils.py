"""
Single rule for every subscription extension (Stripe, activation code,
ambassador / QR activation):

    new_expiry = max(current_expiry, now) + purchased_days

Days already consumed are never given back; an expired (or missing)
subscription restarts from now. The write is a compare-and-swap on the
user's current subscription, so two purchases landing at the same time
both count once and never overwrite each other.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId

PLAN_DAYS = {"monthly": 30, "quarterly": 90, "yearly": 365}


def parse_expiry(value) -> Optional[datetime]:
    """ISO string / datetime -> naive UTC datetime (None if unreadable)."""
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        try:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def current_expiry(sub: Optional[dict]) -> Optional[datetime]:
    """Latest of the two legacy keys (expiresAt / expiryDate)."""
    sub = sub or {}
    dates = [d for d in (parse_expiry(sub.get("expiresAt")), parse_expiry(sub.get("expiryDate"))) if d]
    return max(dates) if dates else None


TRIAL_DAYS = 7  # same as subscription_guard


def compute_new_expiry(sub: Optional[dict], days: int, now: datetime, created_at=None) -> datetime:
    cur = current_expiry(sub)
    if cur is None and created_at:
        # Accounts with no subscription record are on the implicit 7-day trial
        created = parse_expiry(created_at)
        cur = created + timedelta(days=TRIAL_DAYS) if created else None
    base = cur if cur and cur > now else now
    return base + timedelta(days=days)


async def extend_subscription(db, user_id, plan: str, fields: dict, now: Optional[datetime] = None) -> datetime:
    """Apply the rule atomically and write the new subscription.
    `fields` = extra subscription fields (provider, method, activatedBy...).
    Returns the new expiry (naive UTC)."""
    days = PLAN_DAYS.get(plan, 30)
    oid = user_id if isinstance(user_id, ObjectId) else ObjectId(user_id)
    for _ in range(5):
        now_ = now or datetime.utcnow()
        user = await db.users.find_one({"_id": oid}, {"subscription": 1, "createdAt": 1})
        if not user:
            raise ValueError("user not found")
        old_sub = user.get("subscription")
        expiry = compute_new_expiry(old_sub, days, now_, user.get("createdAt"))
        iso = expiry.isoformat() + "Z"
        new_sub = {
            "plan": plan,
            "status": "active",
            "startedAt": now_.isoformat() + "Z",
            "startDate": now_.isoformat(),
            **fields,
            "expiresAt": iso,
            "expiryDate": iso,
        }
        # compare-and-swap: only write if nobody changed the subscription meanwhile
        res = await db.users.update_one(
            {"_id": oid, "subscription": old_sub} if old_sub is not None
            else {"_id": oid, "$or": [{"subscription": {"$exists": False}}, {"subscription": None}]},
            {"$set": {
                "subscription": new_sub,
                "isSubscribed": True,
                "subscriptionPlan": plan,
                "subscriptionEndDate": iso,
                "updatedAt": now_.isoformat() + "Z",
            }},
        )
        if res.modified_count == 1:
            return expiry
    raise RuntimeError("subscription update conflict, please retry")
