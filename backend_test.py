"""
TekaTeka - Stripe Integration Backend Tests (EUR + Free Trial)
================================================================
"""
import os
import sys
import time
import uuid
import requests
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / "backend" / ".env")
load_dotenv(Path(__file__).parent / "frontend" / ".env")

BACKEND_URL = os.getenv("EXPO_PUBLIC_BACKEND_URL", "https://low-data-shop.preview.emergentagent.com")
API = f"{BACKEND_URL}/api"
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "test_database")

TEST_PHONE_PRIMARY = "+243111000111"
FRESH_PHONE = f"+24398{uuid.uuid4().int % 10000000:07d}"

results = []


def log(name, ok, info=""):
    tag = "PASS" if ok else "FAIL"
    print(f"[{tag}] {name}: {info}")
    results.append((name, ok, info))


def phone_login(phone):
    return requests.post(f"{API}/auth/phone-login", json={"phoneNumber": phone}, timeout=30)


async def get_payment_doc(session_id):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    doc = await db.payments.find_one({"stripeSessionId": session_id})
    client.close()
    return doc


async def get_codes_for_session(session_id):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    payment = await db.payments.find_one({"stripeSessionId": session_id})
    if not payment:
        client.close()
        return None, []
    codes = await db.ambassador_codes.find({"purchasePaymentId": str(payment["_id"])}).to_list(100)
    client.close()
    return payment, codes


def test_config():
    r = requests.get(f"{API}/payments/stripe/config", timeout=15)
    if r.status_code != 200:
        log("1. GET /payments/stripe/config", False, f"status={r.status_code}")
        return False
    data = r.json()
    checks = [
        ("enabled=True", data.get("enabled") is True),
        ("currency=eur", data.get("currency") == "eur"),
        ("freeTrialDays=7", data.get("freeTrialDays") == 7),
        ("subscription prices",
         (data.get("prices") or {}).get("subscription") == {"monthly": 500, "quarterly": 1400, "yearly": 5500}),
        ("ambassadorByPlan",
         (data.get("prices") or {}).get("ambassadorByPlan") == {"monthly": 400, "quarterly": 1200, "yearly": 5000}),
        ("durations",
         data.get("durations") == {"monthly": 30, "quarterly": 90, "yearly": 365}),
    ]
    all_ok = all(ok for _, ok in checks)
    info = "; ".join(f"{n}={'OK' if ok else 'FAIL'}" for n, ok in checks)
    log("1. GET /payments/stripe/config", all_ok, info)
    return all_ok


def test_free_trial():
    r = phone_login(FRESH_PHONE)
    if r.status_code != 200:
        log("2a. phone-login (fresh)", False, f"status={r.status_code} body={r.text[:200]}")
        return None
    j = r.json()
    token = j.get("token")
    log("2a. phone-login (fresh phone)", bool(token), f"phone={FRESH_PHONE} keys={list(j.keys())}")
    if not token:
        return None

    r2 = requests.get(f"{API}/auth/profile", headers={"Authorization": f"Bearer {token}"}, timeout=15)
    if r2.status_code != 200:
        log("2b. GET /auth/profile", False, f"status={r2.status_code} body={r2.text[:200]}")
        return token
    pdata = r2.json()
    user_obj = pdata.get("user") or pdata
    sub = user_obj.get("subscription") or {}
    checks = [
        ("plan=trial", sub.get("plan") == "trial"),
        ("status=trial", sub.get("status") == "trial"),
        ("expiresAt present", bool(sub.get("expiresAt"))),
    ]
    try:
        exp_str = sub.get("expiresAt", "").replace("Z", "+00:00")
        exp_dt = datetime.fromisoformat(exp_str)
        now = datetime.now(timezone.utc)
        diff_days = (exp_dt - now).total_seconds() / 86400.0
        checks.append((f"expiresAt~7d (actual={diff_days:.2f}d)", 6.5 < diff_days < 7.5))
    except Exception as e:
        checks.append((f"expiresAt parse: {e}", False))
    all_ok = all(ok for _, ok in checks)
    info = "; ".join(f"{n}={'OK' if ok else 'FAIL'}" for n, ok in checks) + f" | sub={sub}"
    log("2b. New user free trial", all_ok, info)
    return token


def test_subscription_checkout(token):
    headers = {"Authorization": f"Bearer {token}"}
    expected = {"monthly": 5.0, "quarterly": 14.0, "yearly": 55.0}
    overall = True
    for plan, expected_amount in expected.items():
        r = requests.post(f"{API}/payments/stripe/subscription/checkout",
                          json={"plan": plan}, headers=headers, timeout=30)
        if r.status_code != 200:
            log(f"3. subscription/checkout plan={plan}", False, f"status={r.status_code} body={r.text[:200]}")
            overall = False
            continue
        j = r.json()
        url = j.get("url", "")
        sid = j.get("sessionId", "")
        url_ok = url.startswith("https://checkout.stripe.com/")
        sid_ok = sid.startswith("cs_test_")
        doc = asyncio.run(get_payment_doc(sid))
        currency_ok = doc and doc.get("currency") == "EUR"
        amount_ok = doc and abs(float(doc.get("amount", 0)) - expected_amount) < 0.001
        plan_ok = doc and doc.get("plan") == plan
        ok = url_ok and sid_ok and currency_ok and amount_ok and plan_ok
        if not ok:
            overall = False
        log(f"3. subscription/checkout plan={plan}", ok,
            f"url_ok={url_ok}, sid={sid[:30]}, currency={doc and doc.get('currency')}, "
            f"amount={doc and doc.get('amount')} (exp {expected_amount}), plan={doc and doc.get('plan')}")

    r = requests.post(f"{API}/payments/stripe/subscription/checkout",
                      json={"plan": "weekly"}, headers=headers, timeout=15)
    ok = r.status_code == 400
    log("3b. subscription/checkout plan=weekly invalid", ok, f"status={r.status_code} body={r.text[:200]}")
    overall = overall and ok
    return overall


def test_ambassador_checkout(token):
    headers = {"Authorization": f"Bearer {token}"}
    overall = True

    r = requests.post(f"{API}/payments/stripe/ambassador/checkout",
                      json={"plan": "monthly", "quantity": 5}, headers=headers, timeout=30)
    if r.status_code != 200:
        log("4a. ambassador/checkout monthly qty=5", False, f"status={r.status_code} body={r.text[:200]}")
        overall = False
    else:
        j = r.json()
        sid = j.get("sessionId", "")
        url = j.get("url", "")
        doc = asyncio.run(get_payment_doc(sid))
        url_ok = url.startswith("https://checkout.stripe.com/")
        ok = (url_ok and sid.startswith("cs_test_") and doc
              and doc.get("currency") == "EUR"
              and abs(float(doc.get("amount", 0)) - 20.0) < 0.001
              and doc.get("plan") == "monthly"
              and int(doc.get("quantity", 0)) == 5)
        if not ok:
            overall = False
        log("4a. ambassador/checkout monthly qty=5", ok,
            f"url_ok={url_ok}, amount={doc and doc.get('amount')} (exp 20.0), "
            f"plan={doc and doc.get('plan')}, qty={doc and doc.get('quantity')}, currency={doc and doc.get('currency')}")

    r = requests.post(f"{API}/payments/stripe/ambassador/checkout",
                      json={"plan": "yearly", "quantity": 2}, headers=headers, timeout=30)
    if r.status_code != 200:
        log("4b. ambassador/checkout yearly qty=2", False, f"status={r.status_code} body={r.text[:200]}")
        overall = False
    else:
        j = r.json()
        sid = j.get("sessionId", "")
        doc = asyncio.run(get_payment_doc(sid))
        ok = (doc and abs(float(doc.get("amount", 0)) - 100.0) < 0.001
              and doc.get("plan") == "yearly"
              and int(doc.get("quantity", 0)) == 2
              and doc.get("currency") == "EUR")
        if not ok:
            overall = False
        log("4b. ambassador/checkout yearly qty=2", ok,
            f"amount={doc and doc.get('amount')} (exp 100.0), plan={doc and doc.get('plan')}, qty={doc and doc.get('quantity')}")

    r = requests.post(f"{API}/payments/stripe/ambassador/checkout",
                      json={"plan": "invalidPlan", "quantity": 1}, headers=headers, timeout=15)
    ok = r.status_code == 400
    log("4c. ambassador/checkout invalid plan", ok, f"status={r.status_code} body={r.text[:200]}")
    overall = overall and ok
    return overall


def test_webhook_fulfillment(token):
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.post(f"{API}/payments/stripe/ambassador/checkout",
                      json={"plan": "quarterly", "quantity": 3}, headers=headers, timeout=30)
    if r.status_code != 200:
        log("5. ambassador/checkout quarterly qty=3 (setup)", False, f"status={r.status_code} body={r.text[:200]}")
        return False
    j = r.json()
    sid = j.get("sessionId")
    log("5a. setup ambassador checkout (quarterly qty=3)", True, f"sid={sid[:30]}")

    webhook_body = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": sid,
                "payment_status": "paid",
                "payment_intent": "pi_test_webhook",
            }
        },
    }
    wr = requests.post(f"{API}/payments/stripe/webhook", json=webhook_body, timeout=20)
    if wr.status_code != 200:
        log("5b. POST /payments/stripe/webhook", False, f"status={wr.status_code} body={wr.text[:200]}")
        return False
    log("5b. POST /payments/stripe/webhook", True, f"resp={wr.json()}")

    time.sleep(0.5)
    payment, codes = asyncio.run(get_codes_for_session(sid))
    if not payment:
        log("5c. verify fulfillment", False, "no payment doc")
        return False
    checks = [
        ("payment.status=completed", payment.get("status") == "completed"),
        ("3 codes created", len(codes) == 3),
        ("all plan=quarterly", all(c.get("plan") == "quarterly" for c in codes)),
        ("all durationDays=90", all(c.get("durationDays") == 90 for c in codes)),
        ("all status=available", all(c.get("status") == "available" for c in codes)),
        ("all start with TK-", all(c.get("code", "").startswith("TK-") for c in codes)),
    ]
    all_ok = all(ok for _, ok in checks)
    info = "; ".join(f"{n}={'OK' if ok else 'FAIL'}" for n, ok in checks)
    info += f" | codes={[c.get('code') for c in codes]}"
    log("5c. verify fulfillment", all_ok, info)
    return all_ok


if __name__ == "__main__":
    print(f"\n=== TekaTeka Stripe Integration Test ===")
    print(f"Backend: {API}\n")

    test_config()
    trial_token = test_free_trial()

    rp = phone_login(TEST_PHONE_PRIMARY)
    if rp.status_code == 200:
        primary_token = rp.json().get("token")
        log("Primary user phone-login", bool(primary_token), f"phone={TEST_PHONE_PRIMARY}")
    else:
        primary_token = None
        log("Primary user phone-login", False, f"status={rp.status_code} body={rp.text[:200]}")

    token = primary_token or trial_token
    if not token:
        print("\nCRITICAL: No JWT token available")
        sys.exit(1)

    test_subscription_checkout(token)
    test_ambassador_checkout(token)
    test_webhook_fulfillment(token)

    print("\n=== SUMMARY ===")
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"{passed}/{total} checks passed\n")
    for name, ok, info in results:
        tag = "PASS" if ok else "FAIL"
        print(f"[{tag}] {name}")
        if not ok:
            print(f"      -> {info}")
    sys.exit(0 if passed == total else 1)
