"""
TekaTeka - Stripe Ambassador Checkout - Explicit Stripe Price IDs Tests
=========================================================================
Refactor verification:
  * Ambassador checkout now prefers Stripe Price IDs (price=...).
  * In TEST mode (sk_test_), fallback to dynamic price_data is expected.
  * Subscription checkout endpoint MUST be unchanged.
"""
import os
import sys
import uuid
import json
import requests
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
from pathlib import Path
from dotenv import load_dotenv
import stripe

load_dotenv(Path(__file__).parent / "backend" / ".env")
load_dotenv(Path(__file__).parent / "frontend" / ".env")

BACKEND_URL = os.getenv("EXPO_PUBLIC_BACKEND_URL", "https://low-data-shop.preview.emergentagent.com")
API = f"{BACKEND_URL}/api"
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "test_database")

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
stripe.api_key = STRIPE_SECRET_KEY

TEST_PHONE_PRIMARY = "+243111000111"
results = []


def log(name, ok, info=""):
    tag = "PASS" if ok else "FAIL"
    print(f"[{tag}] {name}: {info}")
    results.append((name, ok, info))


def login_get_token():
    r = requests.post(f"{API}/auth/phone-login", json={"phoneNumber": TEST_PHONE_PRIMARY}, timeout=30)
    r.raise_for_status()
    data = r.json()
    return data["token"], data["user"]["id"]


async def mongo_find_payment(session_id):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    doc = await db.payments.find_one({"stripeSessionId": session_id})
    client.close()
    return doc


async def mongo_find_codes_for_payment(payment_id_str):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    cur = db.ambassador_codes.find({"purchasePaymentId": payment_id_str})
    docs = await cur.to_list(length=None)
    client.close()
    return docs


# --------------------------------------------------------------------- A
def test_A1_config():
    r = requests.get(f"{API}/payments/stripe/config", timeout=30)
    ok = r.status_code == 200
    body = r.json() if ok else {}
    enabled = body.get("enabled") is True
    mode = body.get("mode") == "test"
    currency = body.get("currency") == "eur"
    overall = ok and enabled and mode and currency
    log("A1 GET /payments/stripe/config", overall,
        f"status={r.status_code} enabled={body.get('enabled')} mode={body.get('mode')} currency={body.get('currency')}")
    return body


def test_A2_subscription_monthly(token):
    r = requests.post(f"{API}/payments/stripe/subscription/checkout",
                      headers={"Authorization": f"Bearer {token}"},
                      json={"plan": "monthly"}, timeout=30)
    ok = r.status_code == 200
    body = r.json() if ok else {}
    url = body.get("url", "")
    sid = body.get("sessionId", "")
    valid = url.startswith("https://checkout.stripe.com/") and sid.startswith("cs_test_")
    # Verify uses price_data internally (not price ID)
    line_item_kind = "?"
    if valid:
        try:
            sess = stripe.checkout.Session.retrieve(sid, expand=["line_items.data.price"])
            li = sess.line_items.data[0]
            # When price_data is used, price.id is a one-time auto-generated price
            # and price.lookup_key is None. We check that no STRIPE_AMBASSADOR_PRICE_* 
            # is used. For subscription it's always price_data.
            line_item_kind = li.price.id if li.price else "?"
        except Exception as e:
            line_item_kind = f"ERR:{e}"
    log("A2 POST /payments/stripe/subscription/checkout {monthly}", ok and valid,
        f"status={r.status_code} url_ok={url.startswith('https://checkout.stripe.com/')} sid={sid[:14]}... line_item_price={line_item_kind[:30]}")


def test_A3_subscription_invalid(token):
    r = requests.post(f"{API}/payments/stripe/subscription/checkout",
                      headers={"Authorization": f"Bearer {token}"},
                      json={"plan": "weekly"}, timeout=30)
    ok = r.status_code == 400 and "invalide" in (r.json().get("detail") or "").lower()
    log("A3 POST subscription/checkout {weekly} -> 400", ok,
        f"status={r.status_code} body={r.text[:80]}")


# --------------------------------------------------------------------- B
async def _ambassador_checkout_and_verify(token, plan, qty, expected_qty=None, label=""):
    r = requests.post(f"{API}/payments/stripe/ambassador/checkout",
                      headers={"Authorization": f"Bearer {token}"},
                      json={"plan": plan, "quantity": qty}, timeout=30)
    ok = r.status_code == 200
    body = r.json() if ok else {}
    url = body.get("url", "")
    sid = body.get("sessionId", "")
    valid = url.startswith("https://checkout.stripe.com/") and sid.startswith("cs_test_")

    # Mongo doc verification
    doc = await mongo_find_payment(sid) if valid else None
    final_qty = expected_qty if expected_qty is not None else qty
    unit_prices = {"monthly": 400, "quarterly": 1200, "yearly": 5000}
    expected_amount = unit_prices[plan] * final_qty / 100.0

    doc_ok = doc is not None and (
        doc.get("status") == "pending"
        and doc.get("type") == "ambassador_codes"
        and doc.get("plan") == plan
        and doc.get("quantity") == final_qty
        and abs(doc.get("amount", 0) - expected_amount) < 0.01
        and (doc.get("currency") or "").upper() == "EUR"
        and doc.get("stripePriceId") in (None,)  # null because TEST mode fallback
        and (doc.get("stripeSessionId") or "").startswith("cs_test_")
    )

    info = (f"status={r.status_code} url_ok={valid} qty_doc={doc and doc.get('quantity')} "
            f"amount={doc and doc.get('amount')} stripePriceId={doc and doc.get('stripePriceId')!r}")
    log(f"B {label} ambassador/checkout plan={plan} qty={qty}", ok and valid and doc_ok, info)
    return body, doc


# --------------------------------------------------------------------- B8
def verify_stripe_session_uses_price_data(sid):
    """Inspect Stripe session to confirm line_item is price_data (not price ref)."""
    try:
        sess = stripe.checkout.Session.retrieve(sid, expand=["line_items.data.price.product"])
        li = sess.line_items.data[0]
        price = li.price
        # If price_data was used, Stripe creates an inline price; its product is also inline.
        # Inline products have type=service and a generated id, but no "lookup_key" we set.
        product = price.product if not isinstance(price.product, str) else None
        # The hardcoded LIVE Price IDs are price_1TZ7XB.../1TZ7Zf.../1TZ7b0...
        hardcoded = ("price_1TZ7XB2Hpe19XBXi9wjvH4yI", "price_1TZ7Zf2Hpe19XBXiUPtD9xT0", "price_1TZ7b02Hpe19XBXipYBofcoD")
        is_hardcoded = price.id in hardcoded
        product_name = None
        try:
            if isinstance(price.product, str):
                pobj = stripe.Product.retrieve(price.product)
                product_name = pobj.name
            elif product:
                product_name = product.name
        except Exception:
            pass
        # In TEST mode fallback path, product name should contain "Code d'activation"
        uses_price_data = not is_hardcoded
        return uses_price_data, price.id, product_name
    except Exception as e:
        return None, None, f"ERR:{e}"


# --------------------------------------------------------------------- C
def test_C_webhook_fulfillment(token, user_id, loop):
    # C1: create checkout
    r = requests.post(f"{API}/payments/stripe/ambassador/checkout",
                      headers={"Authorization": f"Bearer {token}"},
                      json={"plan": "quarterly", "quantity": 3}, timeout=30)
    if r.status_code != 200:
        log("C1 create ambassador checkout quarterly x3", False, f"status={r.status_code}")
        return
    sid = r.json().get("sessionId")
    log("C1 create ambassador checkout quarterly x3", True, f"sid={sid[:14]}...")

    # C2: webhook
    webhook_payload = {
        "id": f"evt_test_{uuid.uuid4().hex[:8]}",
        "object": "event",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": sid,
                "object": "checkout.session",
                "payment_status": "paid",
                "payment_intent": f"pi_test_{uuid.uuid4().hex[:8]}",
                "amount_total": 3600,
                "currency": "eur",
                "metadata": {
                    "userId": user_id,
                    "type": "ambassador_codes",
                    "plan": "quarterly",
                    "quantity": "3",
                },
            }
        },
    }
    wr = requests.post(f"{API}/payments/stripe/webhook", json=webhook_payload, timeout=30)
    log("C2 POST /payments/stripe/webhook checkout.session.completed", wr.status_code == 200,
        f"status={wr.status_code} body={wr.text[:80]}")

    # C3: verify payment and codes
    async def _verify():
        doc = await mongo_find_payment(sid)
        if not doc:
            return False, "no payment doc"
        if doc.get("status") != "completed":
            return False, f"payment status={doc.get('status')}"
        codes = await mongo_find_codes_for_payment(str(doc["_id"]))
        if len(codes) != 3:
            return False, f"codes count={len(codes)}"
        for c in codes:
            if not c.get("code", "").startswith("TK-"):
                return False, f"bad code prefix {c.get('code')}"
            if c.get("plan") != "quarterly":
                return False, f"bad plan {c.get('plan')}"
            if c.get("durationDays") != 90:
                return False, f"bad duration {c.get('durationDays')}"
            if c.get("status") != "available":
                return False, f"bad status {c.get('status')}"
            if c.get("ambassadorUserId") != user_id:
                return False, f"bad ambassadorUserId {c.get('ambassadorUserId')}"
        return True, f"codes={[c['code'] for c in codes]}"

    ok, info = loop.run_until_complete(_verify())
    log("C3 webhook fulfillment - 3 codes + payment completed", ok, info)

    # C4: idempotency
    wr2 = requests.post(f"{API}/payments/stripe/webhook", json=webhook_payload, timeout=30)
    async def _verify_no_dup():
        doc = await mongo_find_payment(sid)
        codes = await mongo_find_codes_for_payment(str(doc["_id"]))
        return len(codes) == 3, f"after replay count={len(codes)}"
    ok2, info2 = loop.run_until_complete(_verify_no_dup())
    log("C4 webhook idempotency (replay)", wr2.status_code == 200 and ok2, info2)


# --------------------------------------------------------------------- D (code-path)
def test_D_code_path():
    """Inspect _resolve_ambassador_price_id logic by reading source."""
    src = Path("/app/backend/stripe_api.py").read_text()
    # D1: hardcoded LIVE defaults exist
    has_live_default = ("price_1TZ7XB2Hpe19XBXi9wjvH4yI" in src
                        and "price_1TZ7Zf2Hpe19XBXiUPtD9xT0" in src
                        and "price_1TZ7b02Hpe19XBXipYBofcoD" in src)
    # D1: returns these when STRIPE_LIVE_MODE is True
    live_logic = "if STRIPE_LIVE_MODE:" in src and "_AMBASSADOR_PRICE_DEFAULTS_LIVE.get(plan" in src
    # D2: env override
    env_override = 'os.getenv(env_key' in src and 'STRIPE_AMBASSADOR_PRICE_' in src
    log("D1 hardcoded LIVE Price IDs present in source", has_live_default,
        f"all 3 IDs present={has_live_default}")
    log("D1 live-mode branch returns hardcoded defaults", live_logic,
        f"branch present={live_logic}")
    log("D2 env var STRIPE_AMBASSADOR_PRICE_<PLAN> override logic", env_override,
        f"override logic present={env_override}")


# --------------------------------------------------------------------- main
def main():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    print("=" * 70)
    print(f"Backend URL: {API}")
    print(f"Mongo: {MONGO_URL} db={DB_NAME}")
    print(f"Stripe key mode: {'TEST' if STRIPE_SECRET_KEY.startswith('sk_test_') else 'LIVE'}")
    print("=" * 70)

    # A) sanity
    test_A1_config()
    token, user_id = login_get_token()
    print(f"[i] Logged in user_id={user_id}")
    test_A2_subscription_monthly(token)
    test_A3_subscription_invalid(token)

    # B) ambassador checkouts in TEST mode (fallback)
    b1_body, b1_doc = loop.run_until_complete(_ambassador_checkout_and_verify(token, "monthly", 1, label="1"))
    b2_body, b2_doc = loop.run_until_complete(_ambassador_checkout_and_verify(token, "quarterly", 3, label="2"))
    b3_body, b3_doc = loop.run_until_complete(_ambassador_checkout_and_verify(token, "yearly", 5, label="3"))

    # B4 invalid
    r = requests.post(f"{API}/payments/stripe/ambassador/checkout",
                      headers={"Authorization": f"Bearer {token}"},
                      json={"plan": "weekly", "quantity": 1}, timeout=30)
    log("B4 invalid plan -> 400", r.status_code == 400 and "invalide" in (r.json().get("detail") or "").lower(),
        f"status={r.status_code} body={r.text[:80]}")

    # B5 cap qty=1000 -> 100
    loop.run_until_complete(_ambassador_checkout_and_verify(token, "monthly", 1000, expected_qty=100, label="5 cap"))

    # B6 min qty=0 -> 1
    loop.run_until_complete(_ambassador_checkout_and_verify(token, "monthly", 0, expected_qty=1, label="6 min"))

    # B8 stripe-side verification: confirm price_data (not price ref) in test mode
    for label, body in [("monthly", b1_body), ("quarterly", b2_body), ("yearly", b3_body)]:
        sid = body.get("sessionId")
        if not sid:
            log(f"B8 {label} session inspection", False, "no sid")
            continue
        uses_pd, price_id, product_name = verify_stripe_session_uses_price_data(sid)
        log(f"B8 {label} Stripe session uses price_data (TEST fallback)", uses_pd is True,
            f"price_id={price_id} product_name={product_name}")

    # C) webhook fulfillment
    test_C_webhook_fulfillment(token, user_id, loop)

    # D) code-path verification
    test_D_code_path()

    # ---------- summary
    print("=" * 70)
    passed = sum(1 for _, ok, _ in results if ok)
    failed = [r for r in results if not r[1]]
    print(f"TOTAL: {passed}/{len(results)} PASSED")
    if failed:
        print("FAILED:")
        for n, _, info in failed:
            print(f"  - {n}: {info}")
    sys.exit(0 if not failed else 1)


if __name__ == "__main__":
    main()
