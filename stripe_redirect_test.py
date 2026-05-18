"""Quick validation tests for Stripe checkout redirect URLs."""
import os
import sys
import requests
import stripe
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BACKEND_URL = "https://low-data-shop.preview.emergentagent.com"
API = f"{BACKEND_URL}/api"

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "").strip()

results = []

def record(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}: {name} {('- ' + detail) if detail else ''}")

# 1. Success HTML page
try:
    r = requests.get(f"{API}/payments/stripe/success", timeout=20)
    ok = r.status_code == 200 and "Paiement confirmé" in r.text and "TekaTeka" in r.text
    record("GET /payments/stripe/success", ok, f"status={r.status_code}, content_check={'Paiement confirmé' in r.text}")
except Exception as e:
    record("GET /payments/stripe/success", False, str(e))

# 2. Cancel HTML page
try:
    r = requests.get(f"{API}/payments/stripe/cancel", timeout=20)
    ok = r.status_code == 200 and "Paiement annulé" in r.text
    record("GET /payments/stripe/cancel", ok, f"status={r.status_code}, content_check={'Paiement annulé' in r.text}")
except Exception as e:
    record("GET /payments/stripe/cancel", False, str(e))

# 3. Phone login - get JWT
TOKEN = None
try:
    r = requests.post(f"{API}/auth/phone-login", json={"phoneNumber": "+243111000111"}, timeout=20)
    if r.status_code == 200:
        data = r.json()
        TOKEN = data.get("token") or data.get("access_token")
        record("POST /auth/phone-login", bool(TOKEN), f"got token={bool(TOKEN)}")
    else:
        record("POST /auth/phone-login", False, f"status={r.status_code}, body={r.text[:200]}")
except Exception as e:
    record("POST /auth/phone-login", False, str(e))

if not TOKEN:
    print("Cannot continue without token")
    sys.exit(1)

H = {"Authorization": f"Bearer {TOKEN}"}

def verify_redirects(session_id, label):
    """Retrieve session from Stripe to verify success/cancel URLs."""
    try:
        s = stripe.checkout.Session.retrieve(session_id)
        success_url = s.success_url or ""
        cancel_url = s.cancel_url or ""
        backend_host_ok = (
            "low-data-shop.preview.emergentagent.com" in success_url
            or "localhost" in success_url
            or "testserver" in success_url
        ) and "tekateka.app" not in success_url
        path_ok = "/api/payments/stripe/success" in success_url
        cancel_ok = "/api/payments/stripe/cancel" in cancel_url and "tekateka.app" not in cancel_url
        record(
            f"{label} success_url uses backend host",
            backend_host_ok,
            f"success_url={success_url}",
        )
        record(
            f"{label} success_url path /api/payments/stripe/success",
            path_ok,
            "",
        )
        record(
            f"{label} cancel_url uses backend host + /api/payments/stripe/cancel",
            cancel_ok,
            f"cancel_url={cancel_url}",
        )
    except Exception as e:
        record(f"{label} Stripe session retrieve", False, str(e))

# 4. Subscription checkout
try:
    r = requests.post(f"{API}/payments/stripe/subscription/checkout",
                      json={"plan": "monthly"}, headers=H, timeout=30)
    if r.status_code == 200:
        d = r.json()
        url = d.get("url", "")
        sid = d.get("sessionId", "")
        ok = url.startswith("https://checkout.stripe.com/") and sid.startswith("cs_test_")
        record("POST /payments/stripe/subscription/checkout (monthly)", ok,
               f"url_ok={url.startswith('https://checkout.stripe.com/')}, sid={sid[:15]}...")
        if sid:
            verify_redirects(sid, "Subscription")
    else:
        record("POST /payments/stripe/subscription/checkout (monthly)", False,
               f"status={r.status_code}, body={r.text[:200]}")
except Exception as e:
    record("POST /payments/stripe/subscription/checkout (monthly)", False, str(e))

# 5. Ambassador checkout
try:
    r = requests.post(f"{API}/payments/stripe/ambassador/checkout",
                      json={"plan": "monthly", "quantity": 1}, headers=H, timeout=30)
    if r.status_code == 200:
        d = r.json()
        url = d.get("url", "")
        sid = d.get("sessionId", "")
        ok = url.startswith("https://checkout.stripe.com/") and sid.startswith("cs_test_")
        record("POST /payments/stripe/ambassador/checkout", ok,
               f"url_ok={url.startswith('https://checkout.stripe.com/')}, sid={sid[:15]}...")
        if sid:
            verify_redirects(sid, "Ambassador")
            # Save for later webhook test
            ambassador_session_id = sid
    else:
        record("POST /payments/stripe/ambassador/checkout", False,
               f"status={r.status_code}, body={r.text[:200]}")
        ambassador_session_id = None
except Exception as e:
    record("POST /payments/stripe/ambassador/checkout", False, str(e))
    ambassador_session_id = None

# 6a. Invalid plan -> 400
try:
    r = requests.post(f"{API}/payments/stripe/subscription/checkout",
                      json={"plan": "weekly"}, headers=H, timeout=20)
    record("Invalid plan returns 400", r.status_code == 400, f"status={r.status_code}, body={r.text[:120]}")
except Exception as e:
    record("Invalid plan returns 400", False, str(e))

# 6b. Webhook simulation - subscription
try:
    # Create a fresh subscription checkout for webhook
    r = requests.post(f"{API}/payments/stripe/subscription/checkout",
                      json={"plan": "monthly"}, headers=H, timeout=30)
    sub_sid = r.json().get("sessionId") if r.status_code == 200 else None
    if sub_sid:
        webhook_event = {
            "type": "checkout.session.completed",
            "data": {"object": {"id": sub_sid, "payment_status": "paid", "payment_intent": "pi_test_x"}}
        }
        wr = requests.post(f"{API}/payments/stripe/webhook", json=webhook_event, timeout=20)
        ok_webhook = wr.status_code == 200 and wr.json().get("received") is True
        record("Webhook checkout.session.completed", ok_webhook,
               f"status={wr.status_code}, body={wr.text[:120]}")

        # Verify status polling
        sr = requests.get(f"{API}/payments/stripe/session/{sub_sid}", headers=H, timeout=20)
        status_ok = sr.status_code == 200 and sr.json().get("status") == "completed"
        record("Session status polling shows completed", status_ok,
               f"status={sr.status_code}, body={sr.text[:160]}")
    else:
        record("Webhook simulation", False, "Could not create new subscription session")
except Exception as e:
    record("Webhook simulation", False, str(e))

# Summary
print("\n========== SUMMARY ==========")
passed = sum(1 for _, ok, _ in results if ok)
failed = len(results) - passed
print(f"Total: {len(results)}, Passed: {passed}, Failed: {failed}")
for name, ok, detail in results:
    if not ok:
        print(f"  FAILED: {name} - {detail}")

sys.exit(0 if failed == 0 else 1)
