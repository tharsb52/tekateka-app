"""
Backend test for Stripe payment integration after JWT auth fix.
"""
import os
import sys
import json
import requests
from pymongo import MongoClient
from bson import ObjectId
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = "https://low-data-shop.preview.emergentagent.com/api"
TEST_PHONE = "+243111000111"

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "test_database")

mongo = MongoClient(MONGO_URL)
db = mongo[DB_NAME]

results = []

def log(name, passed, detail=""):
    icon = "PASS" if passed else "FAIL"
    print(f"[{icon}] {name} -- {detail}")
    results.append((name, passed, detail))
    return passed


def main():
    print("\n=== Step 1: Phone Login ===")
    r = requests.post(f"{BASE_URL}/auth/phone-login", json={"phoneNumber": TEST_PHONE}, timeout=15)
    if r.status_code != 200:
        log("Phone login", False, f"status={r.status_code} body={r.text[:200]}")
        return
    data = r.json()
    token = data.get("token")
    user_id = data.get("user", {}).get("id")
    log("Phone login", bool(token and user_id), f"user_id={user_id}")
    if not token:
        return

    headers = {"Authorization": f"Bearer {token}"}

    print("\n=== Step 2: Subscription Checkouts ===")
    plan_sessions = {}
    for plan in ["monthly", "quarterly", "yearly"]:
        r = requests.post(
            f"{BASE_URL}/payments/stripe/subscription/checkout",
            json={"plan": plan}, headers=headers, timeout=30,
        )
        if r.status_code != 200:
            log(f"Subscription checkout [{plan}]", False, f"status={r.status_code} body={r.text[:300]}")
            continue
        body = r.json()
        url = body.get("url", "")
        sid = body.get("sessionId", "")
        ok = url.startswith("https://checkout.stripe.com/") and sid.startswith("cs_test_")
        log(f"Subscription checkout [{plan}]", ok, f"sid={sid[:25]} url_prefix_ok={url.startswith('https://checkout.stripe.com/')}")
        if ok:
            plan_sessions[plan] = sid

    r = requests.post(
        f"{BASE_URL}/payments/stripe/subscription/checkout",
        json={"plan": "weekly"}, headers=headers, timeout=15,
    )
    detail = ""
    try:
        detail = r.json().get("detail", "")
    except Exception:
        pass
    log("Subscription checkout [invalid plan 'weekly'] -> 400", r.status_code == 400 and "Plan invalide" in detail,
        f"status={r.status_code} detail='{detail}'")

    print("\n=== Step 3: Ambassador Checkout ===")
    r = requests.post(
        f"{BASE_URL}/payments/stripe/ambassador/checkout",
        json={"quantity": 3}, headers=headers, timeout=30,
    )
    amb_session_id = None
    if r.status_code == 200:
        b = r.json()
        url = b.get("url", "")
        amb_session_id = b.get("sessionId", "")
        ok = url.startswith("https://checkout.stripe.com/") and amb_session_id.startswith("cs_test_")
        log("Ambassador checkout (qty=3)", ok, f"sid={amb_session_id[:25]}")
    else:
        log("Ambassador checkout (qty=3)", False, f"status={r.status_code} body={r.text[:300]}")

    print("\n=== Step 4: Session Status Polling (pending) ===")
    monthly_sid = plan_sessions.get("monthly")
    if monthly_sid:
        r = requests.get(f"{BASE_URL}/payments/stripe/session/{monthly_sid}", headers=headers, timeout=15)
        if r.status_code == 200:
            b = r.json()
            ok = (b.get("status") == "pending" and b.get("type") == "subscription"
                  and b.get("amount") == 2.0 and b.get("currency") == "USD")
            log("Session status polling (monthly, pending)", ok, f"body={b}")
        else:
            log("Session status polling (monthly)", False, f"status={r.status_code} body={r.text[:200]}")

    print("\n=== Step 5: Webhook Simulation - Subscription ===")
    if monthly_sid:
        webhook_body = {
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": monthly_sid,
                    "payment_status": "paid",
                    "payment_intent": "pi_test_dummy_mon",
                }
            }
        }
        r = requests.post(f"{BASE_URL}/payments/stripe/webhook", json=webhook_body, timeout=15)
        if r.status_code == 200 and r.json().get("received") is True:
            log("Webhook (subscription) -> 200 {received:true}", True, "")
        else:
            log("Webhook (subscription) -> 200 {received:true}", False, f"status={r.status_code} body={r.text[:200]}")

        pay = db.payments.find_one({"stripeSessionId": monthly_sid})
        log("Payments doc.status == 'completed' (subscription)", bool(pay and pay.get("status") == "completed"),
            f"status={pay.get('status') if pay else None}")

        user_doc = db.users.find_one({"_id": ObjectId(user_id)})
        sub = (user_doc or {}).get("subscription", {})
        expires_at = sub.get("expiresAt")
        days_ok = False
        diff_days = None
        if expires_at:
            try:
                exp_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                if exp_dt.tzinfo is None:
                    exp_dt = exp_dt.replace(tzinfo=timezone.utc)
                now_dt = datetime.now(timezone.utc)
                diff_days = (exp_dt - now_dt).total_seconds() / 86400.0
                days_ok = 29 < diff_days < 31
            except Exception:
                days_ok = False
        ok = sub.get("status") == "active" and sub.get("plan") == "monthly" and days_ok
        log("User.subscription active, monthly, expiresAt~30d", ok,
            f"status={sub.get('status')} plan={sub.get('plan')} diff_days={diff_days}")

    print("\n=== Step 6: Webhook Simulation - Ambassador Codes ===")
    if amb_session_id:
        webhook_body = {
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": amb_session_id,
                    "payment_status": "paid",
                    "payment_intent": "pi_test_dummy_amb",
                }
            }
        }
        r = requests.post(f"{BASE_URL}/payments/stripe/webhook", json=webhook_body, timeout=15)
        if r.status_code == 200 and r.json().get("received") is True:
            log("Webhook (ambassador) -> 200 {received:true}", True, "")
        else:
            log("Webhook (ambassador) -> 200 {received:true}", False, f"status={r.status_code} body={r.text[:200]}")

        pay = db.payments.find_one({"stripeSessionId": amb_session_id})
        log("Payments doc.status == 'completed' (ambassador)", bool(pay and pay.get("status") == "completed"),
            f"status={pay.get('status') if pay else None}")

        if pay:
            codes = list(db.ambassador_codes.find({"purchasePaymentId": str(pay["_id"])}))
        else:
            codes = []
        all_available = all(c.get("status") == "available" for c in codes)
        ok = len(codes) == 3 and all_available and all(c.get("ambassadorUserId") == user_id for c in codes)
        sample = [{"code": c.get("code"), "status": c.get("status")} for c in codes]
        log("3 ambassador_codes docs created (status=available)", ok, f"count={len(codes)} sample={sample}")

    print("\n=== Step 7: Session Status After Fulfillment ===")
    if monthly_sid:
        r = requests.get(f"{BASE_URL}/payments/stripe/session/{monthly_sid}", headers=headers, timeout=15)
        if r.status_code == 200:
            b = r.json()
            log("Session status now 'completed' (monthly)", b.get("status") == "completed", f"body={b}")

    print("\n=== Summary ===")
    passed = sum(1 for _, p, _ in results if p)
    total = len(results)
    print(f"{passed}/{total} passed")
    if passed != total:
        for name, p, detail in results:
            if not p:
                print(f"  FAIL: {name} -- {detail}")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
