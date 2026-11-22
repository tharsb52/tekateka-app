"""Rule: new_expiry = max(current_expiry, now) + purchased_days. Run: pytest tests/test_subscription_extension.py -q"""
import asyncio
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv  # noqa: E402
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from bson import ObjectId  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from subscription_utils import compute_new_expiry, extend_subscription  # noqa: E402

NOW = datetime(2026, 6, 20, 12, 0, 0)


def iso(dt):
    return dt.isoformat() + "Z"


def test_active_40_days_left_plus_one_month():
    sub = {"status": "active", "plan": "quarterly", "expiresAt": iso(NOW + timedelta(days=40))}
    assert compute_new_expiry(sub, 30, NOW) == NOW + timedelta(days=70)


def test_expired_plus_one_month_starts_from_now():
    sub = {"status": "active", "plan": "monthly", "expiresAt": iso(NOW - timedelta(days=10))}
    assert compute_new_expiry(sub, 30, NOW) == NOW + timedelta(days=30)


def test_first_subscription():
    assert compute_new_expiry(None, 30, NOW) == NOW + timedelta(days=30)
    assert compute_new_expiry({}, 30, NOW) == NOW + timedelta(days=30)


def test_legacy_keys_use_latest_date():
    sub = {"expiryDate": (NOW + timedelta(days=5)).isoformat(), "expiresAt": iso(NOW + timedelta(days=40))}
    assert compute_new_expiry(sub, 30, NOW) == NOW + timedelta(days=70)


def test_db_concurrent_extensions_each_count_once():
    async def run():
        db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
        oid = ObjectId()
        now = datetime.utcnow().replace(microsecond=0)
        await db.users.insert_one({"_id": oid, "email": "test_ext@example.com",
                                   "subscription": {"status": "active", "plan": "quarterly",
                                                    "expiresAt": iso(now + timedelta(days=40))}})
        try:
            await asyncio.gather(*[extend_subscription(db, oid, "monthly", {"provider": "test"}, now) for _ in range(2)])
            u = await db.users.find_one({"_id": oid})
            assert u["subscription"]["expiresAt"] == iso(now + timedelta(days=100))
        finally:
            await db.users.delete_one({"_id": oid})
    asyncio.run(run())


def test_stripe_duplicate_event_extends_once():
    async def run():
        import stripe_api
        db = stripe_api.db
        uid, pid = ObjectId(), ObjectId()
        now = datetime.utcnow().replace(microsecond=0)
        await db.users.insert_one({"_id": uid, "email": "test_dup@example.com",
                                   "subscription": {"status": "active", "plan": "quarterly",
                                                    "expiresAt": iso(now + timedelta(days=40))}})
        pay = {"_id": pid, "userId": str(uid), "type": "subscription", "plan": "monthly", "status": "pending"}
        await db.payments.insert_one(dict(pay))
        try:
            session = {"payment_status": "paid", "payment_intent": "pi_test"}
            await asyncio.gather(stripe_api._fulfill_payment(dict(pay), session),
                                 stripe_api._fulfill_payment(dict(pay), session))
            await stripe_api._fulfill_payment(dict(pay), session)  # replayed event
            u = await db.users.find_one({"_id": uid})
            exp = datetime.fromisoformat(u["subscription"]["expiresAt"].replace("Z", ""))
            assert abs((exp - (now + timedelta(days=70))).total_seconds()) < 60
        finally:
            await db.users.delete_one({"_id": uid})
            await db.payments.delete_one({"_id": pid})
    asyncio.run(run())


def test_implicit_trial_counts_for_accounts_without_subscription():
    created = (NOW - timedelta(days=2)).isoformat() + "Z"  # trial ends in 5 days
    assert compute_new_expiry(None, 30, NOW, created) == NOW + timedelta(days=35)
    old = (NOW - timedelta(days=20)).isoformat() + "Z"  # trial already over
    assert compute_new_expiry(None, 30, NOW, old) == NOW + timedelta(days=30)
