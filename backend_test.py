#!/usr/bin/env python3
"""
Stripe Ambassador Buy-Codes — Comprehensive Backend Tests
=========================================================

Validates the new ambassador-JWT path through /api/payments/stripe/ambassador/checkout
and the webhook fulfillment into db.activation_codes.

Tests A1..H2 from the review request.
"""
import os
import re
import time
import uuid
import asyncio
import random
import string
from datetime import datetime

import requests
from motor.motor_asyncio import AsyncIOMotorClient

BACKEND = "https://low-data-shop.preview.emergentagent.com"
API = f"{BACKEND}/api"

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "test_database")

AMBASSADOR_EMAIL = "ambassador@tekateka.com"
AMBASSADOR_PASSWORD = "Ambassador2025"
ADMIN_PASSWORD = "Ndinemakutamillions82@"
USER_PHONE = "+243111000111"

RESULTS = []  # (id, name, passed, detail)


def record(test_id, name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    color = "\033[32m" if passed else "\033[31m"
    print(f"{color}[{status}]\033[0m {test_id} {name}: {detail}")
    RESULTS.append((test_id, name, passed, detail))


def post(path, json_body=None, headers=None):
    return requests.post(f"{API}{path}", json=json_body or {}, headers=headers or {}, timeout=30)


def get(path, headers=None):
    return requests.get(f"{API}{path}", headers=headers or {}, timeout=30)


def ensure_ambassador_exists():
    r = post("/admin/ambassadors/create", {
        "adminPassword": ADMIN_PASSWORD,
        "name": "Ambassador Test",
        "country": "RDC",
        "city": "Kinshasa",
        "email": AMBASSADOR_EMAIL,
        "ambassadorPassword": AMBASSADOR_PASSWORD,
    })
    print(f"  setup: ambassador create -> {r.status_code}: {r.text[:120]}")


def ambassador_login():
    r = post("/ambassador/login", {"email": AMBASSADOR_EMAIL, "password": AMBASSADOR_PASSWORD})
    assert r.status_code == 200, f"Ambassador login failed: {r.text}"
    data = r.json()
    return data["token"], data["ambassador"]["id"]


def user_login(phone=USER_PHONE):
    r = post("/auth/phone-login", {"phoneNumber": phone})
    assert r.status_code == 200, f"User login failed: {r.text}"
    data = r.json()
    return data["token"], data["user"]["id"]


async def mongo():
    return AsyncIOMotorClient(MONGO_URL)[DB_NAME]


async def count_activation_codes(ambassador_id, **extra):
    db = await mongo()
    return await db.activation_codes.count_documents({"ambassadorId": ambassador_id, **extra})


async def count_ambassador_codes_legacy(buyer_id):
    db = await mongo()
    return await db.ambassador_codes.count_documents({
        "$or": [{"ambassadorUserId": buyer_id}, {"buyerId": buyer_id}]
    })


async def get_payment(session_id):
    db = await mongo()
    return await db.payments.find_one({"stripeSessionId": session_id})


def test_A_regression(user_token, ambassador_token):
    r = get("/payments/stripe/config")
    cfg = r.json() if r.status_code == 200 else {}
    ok = (r.status_code == 200 and cfg.get("currency") == "eur" and cfg.get("freeTrialDays") == 7
          and "subscription" in cfg.get("prices", {}))
    record("A1", "GET /payments/stripe/config", ok, f"status={r.status_code} keys={list(cfg.keys())}")

    r = post("/payments/stripe/subscription/checkout", {"plan": "monthly"},
             headers={"Authorization": f"Bearer {user_token}"})
    body = r.json() if r.status_code < 500 else {}
    ok = r.status_code == 200 and body.get("sessionId", "").startswith("cs_test_") and body.get("url", "").startswith("https://checkout.stripe.com/")
    record("A2", "POST subscription/checkout USER_JWT", ok, f"status={r.status_code} sid={body.get('sessionId', '')[:16]}")

    r = post("/payments/stripe/subscription/checkout", {"plan": "monthly"})
    try:
        detail = (r.json() or {}).get("detail", "")
    except Exception:
        detail = ""
    ok = r.status_code == 401 and ("Token requis" in detail or "Token manquant" in detail)
    record("A3", "subscription/checkout NO AUTH → 401", ok, f"status={r.status_code} detail={detail}")

    r = post("/payments/stripe/subscription/checkout", {"plan": "monthly"},
             headers={"Authorization": f"Bearer {ambassador_token}"})
    try:
        detail = (r.json() or {}).get("detail", "")
    except Exception:
        detail = r.text[:100]
    ok = r.status_code != 200  # must NOT succeed
    record("A4", "subscription/checkout AMBASSADOR_JWT must NOT succeed", ok,
           f"status={r.status_code} detail={detail}")


def test_B_ambassador_checkout(ambassador_token, ambassador_id):
    captured = {}

    async def verify_db(session_id, plan, qty, expected_amount):
        await asyncio.sleep(0.4)
        doc = await get_payment(session_id)
        if not doc:
            return False, "no payment doc"
        checks = {
            "buyerKind=ambassador": doc.get("buyerKind") == "ambassador",
            "ambassadorId": doc.get("ambassadorId") == ambassador_id,
            "userId is None": doc.get("userId") is None,
            "quantity": doc.get("quantity") == qty,
            "plan": doc.get("plan") == plan,
            "currency=EUR": (doc.get("currency") or "").upper() == "EUR",
            "amount": abs((doc.get("amount") or 0) - expected_amount) < 0.001,
            "status=pending": doc.get("status") == "pending",
        }
        failed = [k for k, v in checks.items() if not v]
        return len(failed) == 0, f"failed={failed} amount={doc.get('amount')} qty={doc.get('quantity')}"

    record("B1", "Ambassador login captures token+id", True, f"ambId={ambassador_id}")

    r = post("/payments/stripe/ambassador/checkout",
             {"plan": "monthly", "quantity": 1},
             headers={"Authorization": f"Bearer {ambassador_token}"})
    body = r.json() if r.status_code < 500 else {}
    ok = r.status_code == 200 and body.get("sessionId", "").startswith("cs_test_") and "checkout.stripe.com" in body.get("url", "")
    captured["B2_session"] = body.get("sessionId")
    record("B2", "ambassador/checkout monthly qty=1", ok, f"status={r.status_code} sid={body.get('sessionId', '')[:20]}")

    # Verify Stripe metadata
    try:
        import stripe
        stripe.api_key = ""
        try:
            with open("/app/backend/.env") as f:
                for line in f:
                    if line.startswith("STRIPE_SECRET_KEY="):
                        stripe.api_key = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
        if stripe.api_key and captured["B2_session"]:
            session = stripe.checkout.Session.retrieve(captured["B2_session"])
            md = dict(session.metadata or {})
            ok = (md.get("buyerKind") == "ambassador" and md.get("buyerId") == ambassador_id
                  and md.get("plan") == "monthly" and md.get("quantity") == "1")
            record("B2.meta", "Stripe session metadata", ok, f"metadata={md}")
        else:
            record("B2.meta", "Stripe session metadata (skipped)", True, "no stripe key in env")
    except Exception as e:
        record("B2.meta", "Stripe metadata retrieve error", False, str(e)[:200])

    ok, det = asyncio.run(verify_db(captured["B2_session"], "monthly", 1, 4.0))
    record("B3", "db.payments doc for monthly qty=1 (€4)", ok, det)

    for plan, qty, expected in [("quarterly", 3, 36.0), ("yearly", 5, 250.0)]:
        r = post("/payments/stripe/ambassador/checkout",
                 {"plan": plan, "quantity": qty},
                 headers={"Authorization": f"Bearer {ambassador_token}"})
        body = r.json() if r.status_code < 500 else {}
        ok = r.status_code == 200 and body.get("sessionId", "").startswith("cs_test_")
        record(f"B4.{plan}", f"ambassador/checkout {plan} qty={qty}", ok, f"status={r.status_code}")
        if ok:
            ok2, det = asyncio.run(verify_db(body["sessionId"], plan, qty, expected))
            record(f"B4.{plan}.db", f"db.payments {plan} qty={qty} (€{expected})", ok2, det)

    # B5
    async def check_qty(sid, exp):
        await asyncio.sleep(0.3)
        doc = await get_payment(sid)
        return (doc is not None and doc.get("quantity") == exp), f"actual={doc.get('quantity') if doc else None}"

    r0 = post("/payments/stripe/ambassador/checkout",
              {"plan": "monthly", "quantity": 0},
              headers={"Authorization": f"Bearer {ambassador_token}"})
    if r0.status_code == 200:
        ok, det = asyncio.run(check_qty(r0.json()["sessionId"], 1))
        record("B5.zero", "quantity=0 clamps to 1", ok, det)
    else:
        record("B5.zero", "quantity=0 clamps to 1", False, f"status={r0.status_code}")

    r1000 = post("/payments/stripe/ambassador/checkout",
                 {"plan": "monthly", "quantity": 1000},
                 headers={"Authorization": f"Bearer {ambassador_token}"})
    if r1000.status_code == 200:
        ok, det = asyncio.run(check_qty(r1000.json()["sessionId"], 100))
        record("B5.max", "quantity=1000 clamps to 100", ok, det)
    else:
        record("B5.max", "quantity=1000 clamps to 100", False, f"status={r1000.status_code}")

    r = post("/payments/stripe/ambassador/checkout",
             {"plan": "weekly", "quantity": 1},
             headers={"Authorization": f"Bearer {ambassador_token}"})
    detail = ""
    try:
        detail = (r.json() or {}).get("detail", "")
    except Exception:
        pass
    ok = r.status_code == 400 and "Plan invalide" in detail
    record("B6", "invalid plan='weekly' → 400", ok, f"status={r.status_code} detail={detail}")


def test_C_webhook_fulfillment(ambassador_token, ambassador_id):
    async def run():
        before_count = await count_activation_codes(ambassador_id)
        before_legacy = await count_ambassador_codes_legacy(ambassador_id)

        r = post("/payments/stripe/ambassador/checkout",
                 {"plan": "quarterly", "quantity": 3},
                 headers={"Authorization": f"Bearer {ambassador_token}"})
        if r.status_code != 200:
            return False, f"checkout {r.status_code} {r.text[:120]}"
        session_id = r.json()["sessionId"]
        await asyncio.sleep(0.4)
        payment_doc = await get_payment(session_id)
        if not payment_doc:
            return False, "no payment doc"
        payment_id_str = str(payment_doc["_id"])

        webhook_payload = {
            "type": "checkout.session.completed",
            "data": {"object": {
                "id": session_id,
                "payment_status": "paid",
                "payment_intent": f"pi_test_{uuid.uuid4().hex[:12]}",
                "metadata": {
                    "buyerKind": "ambassador",
                    "buyerId": ambassador_id,
                    "ambassadorId": ambassador_id,
                    "type": "ambassador_codes",
                    "plan": "quarterly",
                    "quantity": "3",
                },
            }},
        }
        wr = requests.post(f"{API}/payments/stripe/webhook", json=webhook_payload, timeout=20)
        if wr.status_code != 200 or not wr.json().get("received"):
            return False, f"webhook {wr.status_code} {wr.text[:120]}"
        await asyncio.sleep(0.6)

        after_payment = await get_payment(session_id)
        after_count = await count_activation_codes(ambassador_id)
        after_legacy = await count_ambassador_codes_legacy(ambassador_id)

        problems = []
        if after_payment.get("status") != "completed":
            problems.append(f"payment.status={after_payment.get('status')}")
        if after_count - before_count != 3:
            problems.append(f"activation_codes delta={after_count - before_count} expected 3")
        if after_legacy != before_legacy:
            problems.append(f"LEGACY ambassador_codes grew by {after_legacy - before_legacy}")

        db = await mongo()
        new_codes = await db.activation_codes.find({
            "ambassadorId": ambassador_id, "stripePaymentId": payment_id_str
        }).to_list(50)
        if len(new_codes) != 3:
            problems.append(f"codes linked to payment_id: {len(new_codes)}")
        else:
            pat = re.compile(r"^TK-[A-Z0-9]{4}-[A-Z0-9]{4}$")
            for c in new_codes:
                if not pat.match(c.get("code", "")):
                    problems.append(f"bad format: {c.get('code')}")
                for f, exp in [("plan", "quarterly"), ("status", "unused"), ("source", "stripe_purchase")]:
                    if c.get(f) != exp:
                        problems.append(f"{f}={c.get(f)} expected {exp}")
                if c.get("usedAt") is not None:
                    problems.append("usedAt not None")
                if c.get("usedByUserId") is not None:
                    problems.append("usedByUserId not None")
                exp_at = c.get("expiresAt")
                if isinstance(exp_at, datetime):
                    diff = (exp_at - datetime.utcnow()).days
                    if not (28 <= diff <= 31):
                        problems.append(f"expiresAt diff={diff}d")
        return (len(problems) == 0,
                "; ".join(problems) if problems
                else f"sid={session_id} codes={[c.get('code') for c in new_codes]}")

    ok, det = asyncio.run(run())
    record("C1-C4", "Webhook fulfills 3 quarterly codes into activation_codes", ok, det)

    async def replay():
        db = await mongo()
        latest = await db.payments.find({
            "ambassadorId": ambassador_id, "status": "completed", "plan": "quarterly"
        }).sort([("createdAt", -1)]).to_list(1)
        if not latest:
            return False, "no completed payment"
        sid = latest[0]["stripeSessionId"]
        before_count = await count_activation_codes(ambassador_id)
        webhook_payload = {
            "type": "checkout.session.completed",
            "data": {"object": {
                "id": sid, "payment_status": "paid", "payment_intent": "pi_test_replay",
                "metadata": {"buyerKind": "ambassador", "buyerId": ambassador_id,
                             "type": "ambassador_codes", "plan": "quarterly", "quantity": "3"},
            }},
        }
        wr = requests.post(f"{API}/payments/stripe/webhook", json=webhook_payload, timeout=20)
        if wr.status_code != 200:
            return False, f"replay {wr.status_code}"
        await asyncio.sleep(0.4)
        after_count = await count_activation_codes(ambassador_id)
        after_payment = await db.payments.find_one({"stripeSessionId": sid})
        problems = []
        if after_count != before_count:
            problems.append(f"codes grew! delta={after_count - before_count}")
        if after_payment.get("status") != "completed":
            problems.append(f"status changed: {after_payment.get('status')}")
        return len(problems) == 0, "; ".join(problems) or "idempotent OK"

    ok, det = asyncio.run(replay())
    record("C5", "Webhook replay idempotent (no duplicates)", ok, det)


def test_D_dashboard(ambassador_token, ambassador_id):
    r0 = post("/ambassador/dashboard", {"token": ambassador_token})
    base = r0.json() if r0.status_code == 200 else {}
    base_monthly = base.get("stats", {}).get("codesByPlan", {}).get("monthly", {}).get("remaining", 0)
    base_total = base.get("stats", {}).get("totalCodes", 0)
    base_remaining = base.get("stats", {}).get("remainingCodes", 0)

    r = post("/payments/stripe/ambassador/checkout",
             {"plan": "monthly", "quantity": 2},
             headers={"Authorization": f"Bearer {ambassador_token}"})
    if r.status_code != 200:
        record("D1", "Dashboard reflects new codes", False, "checkout failed")
        return
    sid = r.json()["sessionId"]
    requests.post(f"{API}/payments/stripe/webhook", json={
        "type": "checkout.session.completed",
        "data": {"object": {
            "id": sid, "payment_status": "paid", "payment_intent": "pi_test_d",
            "metadata": {"buyerKind": "ambassador", "buyerId": ambassador_id,
                         "type": "ambassador_codes", "plan": "monthly", "quantity": "2"},
        }},
    }, timeout=20)
    time.sleep(0.7)
    r1 = post("/ambassador/dashboard", {"token": ambassador_token})
    new = r1.json() if r1.status_code == 200 else {}
    new_monthly = new.get("stats", {}).get("codesByPlan", {}).get("monthly", {}).get("remaining", 0)
    new_total = new.get("stats", {}).get("totalCodes", 0)
    new_remaining = new.get("stats", {}).get("remainingCodes", 0)

    ok = (new_monthly - base_monthly == 2 and new_total - base_total == 2 and new_remaining - base_remaining == 2)
    record("D1", "Dashboard monthly.remaining/totalCodes/remainingCodes +2",
           ok, f"monthly.remaining {base_monthly}→{new_monthly}, total {base_total}→{new_total}")

    r2 = post("/ambassador/codes", {"token": ambassador_token})
    codes = r2.json() if r2.status_code == 200 else []
    stripe_codes = [c for c in codes if c.get("source") == "stripe_purchase"]
    ok = len(stripe_codes) >= 2 and all(re.match(r"^TK-[A-Z0-9]{4}-[A-Z0-9]{4}$", c.get("code", "")) for c in stripe_codes[:5])
    record("D2", "/ambassador/codes lists stripe_purchase codes", ok, f"stripe count={len(stripe_codes)}")


def test_E_activation(ambassador_token, ambassador_id):
    async def get_counts():
        db = await mongo()
        u = await db.activation_codes.count_documents({"ambassadorId": ambassador_id, "plan": "quarterly", "status": "used"})
        n = await db.activation_codes.count_documents({"ambassadorId": ambassador_id, "plan": "quarterly", "status": "unused"})
        return u, n

    before_used, before_unused = asyncio.run(get_counts())
    if before_unused == 0:
        record("E1-E4", "Code activation", False, "no unused quarterly codes available")
        return

    rand_phone = "+243" + "".join(random.choices(string.digits, k=9))
    r = post("/auth/phone-login", {"phoneNumber": rand_phone})
    if r.status_code != 200:
        record("E1-E4", "Create test client", False, f"{r.status_code} {r.text}")
        return
    client_id = r.json()["user"]["id"]

    r = post("/ambassador/activate", {"token": ambassador_token, "clientUserId": client_id, "plan": "quarterly"})
    if r.status_code != 200:
        record("E2", "POST /ambassador/activate quarterly", False, f"{r.status_code} {r.text}")
        return
    activated_code = r.json().get("code")
    record("E2", "POST /ambassador/activate quarterly", True, f"code={activated_code}")

    async def verify():
        db = await mongo()
        c = await db.activation_codes.find_one({"code": activated_code})
        after_used, after_unused = await get_counts()
        problems = []
        if c.get("status") != "used":
            problems.append(f"status={c.get('status')}")
        if c.get("usedByUserId") != client_id:
            problems.append(f"usedByUserId={c.get('usedByUserId')}")
        if c.get("usedAt") is None:
            problems.append("usedAt None")
        if after_used - before_used != 1:
            problems.append(f"used delta={after_used - before_used}")
        if before_unused - after_unused != 1:
            problems.append(f"unused delta={before_unused - after_unused}")
        return len(problems) == 0, "; ".join(problems) or f"used {before_used}→{after_used}, unused {before_unused}→{after_unused}"

    ok, det = asyncio.run(verify())
    record("E3-E4", "activation_codes used=used + dashboard counters", ok, det)


def test_F_idor(ambassador_token, ambassador_id, user_token, user_id):
    r = post("/payments/stripe/subscription/checkout", {"plan": "monthly"},
             headers={"Authorization": f"Bearer {user_token}"})
    if r.status_code != 200:
        record("F1-F9", "User checkout for IDOR test", False, f"{r.status_code}")
        return
    session_user = r.json()["sessionId"]

    r = post("/payments/stripe/ambassador/checkout", {"plan": "monthly", "quantity": 1},
             headers={"Authorization": f"Bearer {ambassador_token}"})
    if r.status_code != 200:
        record("F1-F9", "Ambassador checkout for IDOR test", False, f"{r.status_code}")
        return
    session_amb = r.json()["sessionId"]
    time.sleep(0.3)

    r = get(f"/payments/stripe/session/{session_amb}", headers={"Authorization": f"Bearer {user_token}"})
    record("F3", "user→ambassador_session must 404", r.status_code == 404, f"status={r.status_code}")

    r = get(f"/payments/stripe/session/{session_user}", headers={"Authorization": f"Bearer {ambassador_token}"})
    record("F4", "ambassador→user_session must 404", r.status_code == 404, f"status={r.status_code}")

    r = get(f"/payments/stripe/session/{session_amb}", headers={"Authorization": f"Bearer {ambassador_token}"})
    record("F5", "ambassador own session → 200", r.status_code == 200, f"status={r.status_code}")

    r = get(f"/payments/stripe/session/{session_user}", headers={"Authorization": f"Bearer {user_token}"})
    record("F6", "user own session → 200", r.status_code == 200, f"status={r.status_code}")

    tampered = ambassador_token[:-3] + "AAA"
    r = post("/payments/stripe/ambassador/checkout", {"plan": "monthly", "quantity": 1},
             headers={"Authorization": f"Bearer {tampered}"})
    detail = (r.json() or {}).get("detail", "") if r.headers.get("content-type", "").startswith("application/json") else ""
    record("F7", "Tampered ambassador JWT → 401",
           r.status_code == 401 and "invalide" in detail.lower(), f"status={r.status_code} detail={detail}")

    r = post("/payments/stripe/ambassador/checkout", {"plan": "monthly", "quantity": 1})
    detail = (r.json() or {}).get("detail", "") if r.headers.get("content-type", "").startswith("application/json") else ""
    record("F8", "No auth → 401 Token requis",
           r.status_code == 401 and "requis" in detail.lower(), f"status={r.status_code} detail={detail}")

    rnd = f"cs_test_{uuid.uuid4().hex}"
    r1 = get(f"/payments/stripe/session/{rnd}", headers={"Authorization": f"Bearer {user_token}"})
    r2 = get(f"/payments/stripe/session/{rnd}", headers={"Authorization": f"Bearer {ambassador_token}"})
    record("F9", "Random session id → 404",
           r1.status_code == 404 and r2.status_code == 404, f"user={r1.status_code} amb={r2.status_code}")


def test_G_cancelled(ambassador_token, ambassador_id):
    async def run():
        before_count = await count_activation_codes(ambassador_id)
        r = post("/payments/stripe/ambassador/checkout",
                 {"plan": "quarterly", "quantity": 2},
                 headers={"Authorization": f"Bearer {ambassador_token}"})
        if r.status_code != 200:
            return False, f"checkout {r.status_code}"
        sid = r.json()["sessionId"]
        await asyncio.sleep(0.3)
        doc1 = await get_payment(sid)
        if doc1.get("status") != "pending":
            return False, f"initial status={doc1.get('status')}"

        wr = requests.post(f"{API}/payments/stripe/webhook", json={
            "type": "checkout.session.expired",
            "data": {"object": {"id": sid, "metadata": {}}},
        }, timeout=20)
        if wr.status_code != 200:
            return False, f"webhook {wr.status_code}"
        await asyncio.sleep(0.4)
        doc2 = await get_payment(sid)
        after_count = await count_activation_codes(ambassador_id)
        problems = []
        if doc2.get("status") != "failed":
            problems.append(f"status={doc2.get('status')} expected failed")
        if after_count != before_count:
            problems.append(f"codes grew! delta={after_count - before_count}")
        return len(problems) == 0, "; ".join(problems) or "status=failed, no codes generated"

    ok, det = asyncio.run(run())
    record("G1-G2", "Expired checkout → status=failed, no codes", ok, det)


def test_H_amount(ambassador_token):
    async def run():
        problems = []
        for plan, qty, expected in [("monthly", 4, 16.0), ("quarterly", 2, 24.0), ("yearly", 3, 150.0)]:
            r = post("/payments/stripe/ambassador/checkout",
                     {"plan": plan, "quantity": qty},
                     headers={"Authorization": f"Bearer {ambassador_token}"})
            if r.status_code != 200:
                problems.append(f"{plan}: {r.status_code}")
                continue
            sid = r.json()["sessionId"]
            await asyncio.sleep(0.3)
            doc = await get_payment(sid)
            actual = doc.get("amount")
            if abs(actual - expected) > 0.001:
                problems.append(f"{plan} qty={qty}: amount={actual} expected={expected}")
        return len(problems) == 0, "; ".join(problems) or "all amounts match (4/12/50 EUR × qty)"

    ok, det = asyncio.run(run())
    record("H1-H2", "Amount stored == per-code mirror × qty", ok, det)


def main():
    print(f"\nTesting backend: {API}\n")
    ensure_ambassador_exists()
    ambassador_token, ambassador_id = ambassador_login()
    user_token, user_id = user_login()
    print(f"  ambassador_id={ambassador_id}")
    print(f"  user_id={user_id}\n")

    print("\n=== A) Regression ===")
    test_A_regression(user_token, ambassador_token)

    print("\n=== B) Ambassador checkout ===")
    test_B_ambassador_checkout(ambassador_token, ambassador_id)

    print("\n=== C) Webhook fulfillment ===")
    test_C_webhook_fulfillment(ambassador_token, ambassador_id)

    print("\n=== D) Dashboard reflects new codes ===")
    test_D_dashboard(ambassador_token, ambassador_id)

    print("\n=== E) Code activation ===")
    test_E_activation(ambassador_token, ambassador_id)

    print("\n=== F) IDOR isolation ===")
    test_F_idor(ambassador_token, ambassador_id, user_token, user_id)

    print("\n=== G) Cancelled checkout ===")
    test_G_cancelled(ambassador_token, ambassador_id)

    print("\n=== H) Amount verification ===")
    test_H_amount(ambassador_token)

    print("\n" + "=" * 70)
    passed = sum(1 for r in RESULTS if r[2])
    failed = sum(1 for r in RESULTS if not r[2])
    print(f"TOTAL: {passed}/{len(RESULTS)} passed, {failed} failed")
    if failed:
        print("\nFAILURES:")
        for tid, name, ok, det in RESULTS:
            if not ok:
                print(f"  [{tid}] {name} — {det}")
    print("=" * 70)


if __name__ == "__main__":
    main()
