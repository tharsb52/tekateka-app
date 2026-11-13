"""
Subscription access rules (mirrors frontend/context/AuthContext.tsx).

- Paid plan (any plan other than "trial" with status "active", e.g. monthly /
  quarterly / yearly or an admin-granted plan): full access until
  expiry + 48h grace period.
- Free trial: full access until trial end, no grace period.
- Otherwise: read-only (GET allowed, writes on /api/data/* refused with 402).
"""
from datetime import datetime, timedelta, timezone

PAID_PLANS_EXCLUDED = {None, "", "trial"}
GRACE_PERIOD = timedelta(hours=48)
TRIAL_DAYS = 7


def _parse(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def has_write_access(user: dict, now: datetime = None) -> bool:
    now = now or datetime.now(timezone.utc)
    sub = user.get("subscription") or {}
    expiry = _parse(sub.get("expiresAt") or sub.get("expiryDate"))

    if sub.get("status") == "active" and sub.get("plan") not in PAID_PLANS_EXCLUDED:
        return expiry is None or now < expiry + GRACE_PERIOD

    trial_end = _parse(sub.get("trialEndsAt")) or (expiry if sub.get("status") == "trial" else None)
    if trial_end is None:
        created = _parse(user.get("createdAt"))
        if created is None:
            return True
        trial_end = created + timedelta(days=TRIAL_DAYS)
    return now < trial_end
