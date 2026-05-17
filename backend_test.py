"""
Stripe Payment Integration Tests for TekaTeka
=============================================
Tests endpoints under /api/payments/stripe/*
"""
import os
import json
import time
import requests
from datetime import datetime

BASE_URL = "https://low-data-shop.preview.emergentagent.com/api"
PHONE = "+243111000111"

results = []

def record(name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    line = f"[{status}] {name} :: {detail}"
    print(line)
    results.append((name, passed, detail))


def login_phone():
    r = requests.post(f"{BASE_URL}/auth/phone-login", json={"phoneNumber": PHONE})
    r.raise_for_status()
    data = r.json()
    return data["token"], data["user"]["id"]


def test_config():
    r = requests.get(f"{BASE_URL}/payments/stripe/config")
    ok = r.status_code == 200
    if not ok:
        record("GET /payments/stripe/config", False, f"HTTP {r.status_code} - {r.text[:200]}")
        return
    body = r.json()
    enabled = body.get("enabled") is True
    pk = body.get("publishableKey", "")
    pk_ok = pk.startswith("pk_test_")
    prices = body.get("prices", {})
    sub_prices = prices.get("subscription", {})
    has_plans = all(p in sub_prices for p in ["monthly", "quarterly", "yearly"])
    has_amb = "ambassadorCode" in prices
    detail = f"enabled={body.get('enabled')} pk_test={pk_ok} currency={body.get('currency')} plans_present={has_plans} ambassadorCode={has_amb}"
    record("GET /payments/stripe/config", enabled and pk_ok and has_plans and has_amb, detail)


def test_subscription_checkout(token, plan):
    r = requests.post(
        f"{BASE_URL}/payments/stripe/subscription/checkout",
        json={"plan": plan},
        headers={"Authorization": f"Bearer {token}"},
    )
    if r.status_code != 200:
        record(f"POST /payments/stripe/subscription/checkout ({plan})", False, f"HTTP {r.status_code} - {r.text[:300]}")
        return None
    body = r.json()
    url = body.get("url", "")
    sid = body.get("sessionId", "")
    ok = url.startswith("https://checkout.stripe.com/") and sid.startswith("cs_test_")
    record(f"POST /payments/stripe/subscription/checkout ({plan})", ok, f"sessionId={sid[:25]} url_ok={url.startswith('https://checkout.stripe.com/')}")
    return sid


def test_invalid_plan(token):
    r = requests.post(
        f"{BASE_URL}/payments/stripe/subscription/checkout",
        json={"plan": "weekly"},
        headers={"Authorization": f"Bearer {token}"},
    )
    record("POST subscription/checkout invalid plan -> 400", r.status_code == 400, f"HTTP {r.status_code} - {r.text[:150]}")


def test_ambassador_checkout(token, qty=3):
    r = requests.post(
        f"{BASE_URL}/payments/stripe/ambassador/checkout",
        json={"quantity": qty},
        headers={"Authorization": f"Bearer {token}"},
    )
    if r.status_code != 200:
        record(f"POST /payments/stripe/ambassador/checkout (qty={qty})", False, f"HTTP {r.status_code} - {r.text[:300]}")
        return None
    body = r.json()
    url = body.get("url", "")
    sid = body.get("sessionId", "")
    ok = url.startswith("https://checkout.stripe.com/") and sid.startswith("cs_test_")
    record(f"POST /payments/stripe/ambassador/checkout (qty={qty})", ok, f"sessionId={sid[:25]}")
    return sid


def test_session_status(token, session_id, expected_type):
    r = requests.get(
        f"{BASE_URL}/payments/stripe/session/{session_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    if r.status_code != 200:
        record(f"GET session/{session_id[:18]}... ({expected_type})", False, f"HTTP {r.status_code} - {r.text[:200]}")
        return None
    body = r.json()
    ok = body.get("type") == expected_type and body.get("status") in ("pending", "completed")
    record(f"GET session/... ({expected_type})", ok, f"status={body.get('status')} type={body.get('type')} amount={body.get('amount')}")
    return body


def test_webhook(session_id, label):
    event = {
        "id": f"evt_test_{label}_{int(time.time())}",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": session_id,
                "payment_status": "paid",
                "payment_intent": f"pi_test_{label}_{int(time.time())}",
            }
        },
    }
    r = requests.post(f"{BASE_URL}/payments/stripe/webhook", json=event)
    record(f"POST /payments/stripe/webhook ({label})", r.status_code == 200, f"HTTP {r.status_code} - {r.text[:200]}")


def test_auth_required():
    r = requests.post(f"{BASE_URL}/payments/stripe/subscription/checkout", json={"plan": "monthly"})
    record("Subscription checkout without auth -> 401", r.status_code == 401, f"HTTP {r.status_code}")

    r2 = requests.post(f"{BASE_URL}/payments/stripe/ambassador/checkout", json={"quantity": 1})
    record("Ambassador checkout without auth -> 401", r2.status_code == 401, f"HTTP {r2.status_code}")


def mongo_verify(user_id, sub_session_id, amb_session_id, amb_qty):
    try:
        from pymongo import MongoClient
        from bson import ObjectId
    except Exception as e:
        record("Mongo verification import", False, str(e))
        return
    mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.getenv("DB_NAME", "test_database")
    cli = MongoClient(mongo_url)
    db = cli[db_name]

    if sub_session_id:
        p = db.payments.find_one({"stripeSessionId": sub_session_id})
        if p:
            record(
                "Mongo: subscription payment doc inserted",
                p.get("provider") == "stripe" and p.get("type") == "subscription",
                f"status={p.get('status')} type={p.get('type')} plan={p.get('plan')} amount={p.get('amount')}",
            )
        else:
            record("Mongo: subscription payment doc inserted", False, "no doc found")

    if amb_session_id:
        p = db.payments.find_one({"stripeSessionId": amb_session_id})
        if p:
            record(
                "Mongo: ambassador payment doc inserted",
                p.get("provider") == "stripe" and p.get("type") == "ambassador_codes" and p.get("quantity") == amb_qty,
                f"status={p.get('status')} qty={p.get('quantity')} amount={p.get('amount')}",
            )
            codes = list(db.ambassador_codes.find({"purchasePaymentId": str(p["_id"])}))
            record(
                f"Mongo: ambassador_codes generated (expected {amb_qty})",
                len(codes) == amb_qty and all(c.get("status") == "available" for c in codes),
                f"found={len(codes)} statuses={[c.get('status') for c in codes]}",
            )
        else:
            record("Mongo: ambassador payment doc inserted", False, "no doc found")

    try:
        u = db.users.find_one({"_id": ObjectId(user_id)})
        sub = (u or {}).get("subscription", {})
        record(
            "Mongo: user.subscription active after fulfillment",
            sub.get("status") == "active" and sub.get("provider") == "stripe",
            f"subscription={sub}",
        )
    except Exception as e:
        record("Mongo: user.subscription lookup", False, str(e))


def main():
    print("=" * 80)
    print("STRIPE PAYMENT INTEGRATION TESTS")
    print(f"Base URL: {BASE_URL}")
    print(f"Time: {datetime.utcnow().isoformat()}Z")
    print("=" * 80)

    test_config()
    test_auth_required()

    try:
        token, user_id = login_phone()
        print(f"[INFO] Logged in user_id={user_id}")
    except Exception as e:
        record("Phone login", False, str(e))
        return

    test_invalid_plan(token)

    sid_monthly = test_subscription_checkout(token, "monthly")
    sid_quarterly = test_subscription_checkout(token, "quarterly")
    sid_yearly = test_subscription_checkout(token, "yearly")

    amb_qty = 3
    sid_amb = test_ambassador_checkout(token, qty=amb_qty)

    if sid_monthly:
        test_session_status(token, sid_monthly, "subscription")
    if sid_amb:
        test_session_status(token, sid_amb, "ambassador_codes")

    if sid_monthly:
        test_webhook(sid_monthly, "sub")
    if sid_amb:
        test_webhook(sid_amb, "amb")

    # Post-webhook verification
    if sid_monthly:
        test_session_status(token, sid_monthly, "subscription")
    if sid_amb:
        test_session_status(token, sid_amb, "ambassador_codes")

    mongo_verify(user_id, sid_monthly, sid_amb, amb_qty)

    # Summary
    print("\n" + "=" * 80)
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"RESULTS: {passed}/{total} passed")
    for n, ok, d in results:
        print(f"  [{'PASS' if ok else 'FAIL'}] {n} -- {d}")
    print("=" * 80)


if __name__ == "__main__":
    main()
