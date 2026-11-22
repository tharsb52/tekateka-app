# Security hardening regression tests (iteration 13): JWT secret, lockout, admin pwd, webhook, CORS, removed endpoints
import os
import time
import uuid
import random
from datetime import datetime, timedelta, timezone

import jwt
import pytest
import requests
from pymongo import MongoClient

LOCAL = "http://localhost:8001"
PUBLIC = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://low-data-shop.preview.emergentagent.com").rstrip("/")
ADMIN_PWD = "Ndinemakutamillions82@"
OLD_SECRET = "tekateka-secret-key-2025-change-in-production"
LOCK_MSG = "Trop de tentatives échouées. Accès bloqué pendant 15 min"

_mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
DB = _mongo[os.environ.get("DB_NAME", "test_database")]


def fip():
    """Fake client IP header, simulating 2 trusted proxy hops."""
    ip = f"10.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}"
    return {"X-Forwarded-For": f"{ip}, 1.1.1.1, 2.2.2.2"}


@pytest.fixture(scope="module", autouse=True)
def clean_locks():
    DB.login_lockouts.delete_many({})
    yield
    DB.login_lockouts.delete_many({})


@pytest.fixture(scope="module")
def merchant():
    email = f"test_sec_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{LOCAL}/api/auth/email-signup", json={"email": email, "password": "Test1234!", "name": "TEST_Sec"}, headers=fip())
    assert r.status_code == 200, r.text
    d = r.json()
    tok = d["token"]
    r2 = requests.post(f"{LOCAL}/api/auth/setup-pin", json={"pin": "4321"}, headers={"Authorization": f"Bearer {tok}"})
    assert r2.status_code == 200, r2.text
    uid = d["user"].get("id") or d["user"].get("_id")
    yield {"email": email, "token": tok, "id": uid}
    from bson import ObjectId
    DB.users.delete_one({"_id": ObjectId(uid)})


# --- Merchant auth regression
class TestMerchantAuth:
    def test_token_works_on_profile_and_data(self, merchant):
        h = {"Authorization": f"Bearer {merchant['token']}"}
        r = requests.get(f"{LOCAL}/api/auth/profile", headers=h)
        assert r.status_code == 200, r.text
        r = requests.get(f"{LOCAL}/api/data/products", headers=h)
        assert r.status_code == 200, r.text

    def test_login_pin_ok(self, merchant):
        r = requests.post(f"{LOCAL}/api/auth/login-pin", json={"identifier": merchant["email"], "pin": "4321"}, headers=fip())
        assert r.status_code == 200, r.text
        assert r.json()["token"]

    def test_credential_login_ok(self, merchant):
        r = requests.post(f"{LOCAL}/api/auth/credential-login", json={"identifier": merchant["email"], "password": "Test1234!"}, headers=fip())
        assert r.status_code == 200, r.text


# --- Lockouts
class TestLockouts:
    def test_pin_account_lockout(self, merchant):
        DB.login_lockouts.delete_many({})
        for i in range(5):
            r = requests.post(f"{LOCAL}/api/auth/login-pin", json={"identifier": merchant["email"], "pin": "0000"}, headers=fip())
            assert r.status_code == 401, f"attempt {i}: {r.status_code} {r.text}"
        r = requests.post(f"{LOCAL}/api/auth/login-pin", json={"identifier": merchant["email"], "pin": "4321"}, headers=fip())
        assert r.status_code == 429, r.text
        assert LOCK_MSG in r.json()["detail"]
        DB.login_lockouts.delete_many({})

    def test_pin_success_clears_counter(self, merchant):
        DB.login_lockouts.delete_many({})
        h = fip()
        for _ in range(4):
            assert requests.post(f"{LOCAL}/api/auth/login-pin", json={"identifier": merchant["email"], "pin": "0000"}, headers=h).status_code == 401
        assert requests.post(f"{LOCAL}/api/auth/login-pin", json={"identifier": merchant["email"], "pin": "4321"}, headers=h).status_code == 200
        # success resets ACCOUNT counter only (iter14 design) -> use a fresh IP for second batch
        h = fip()
        for _ in range(4):
            assert requests.post(f"{LOCAL}/api/auth/login-pin", json={"identifier": merchant["email"], "pin": "0000"}, headers=h).status_code == 401
        assert requests.post(f"{LOCAL}/api/auth/login-pin", json={"identifier": merchant["email"], "pin": "4321"}, headers=h).status_code == 200
        DB.login_lockouts.delete_many({})

    def test_pin_ip_lockout(self):
        DB.login_lockouts.delete_many({})
        h = fip()
        for i in range(5):
            r = requests.post(f"{LOCAL}/api/auth/login-pin", json={"identifier": f"nobody{i}_{uuid.uuid4().hex[:4]}@x.com", "pin": "0000"}, headers=h)
            assert r.status_code == 401
        r = requests.post(f"{LOCAL}/api/auth/login-pin", json={"identifier": "sixth@x.com", "pin": "0000"}, headers=h)
        assert r.status_code == 429, r.text
        # different IP not blocked
        r = requests.post(f"{LOCAL}/api/auth/login-pin", json={"identifier": "sixth@x.com", "pin": "0000"}, headers=fip())
        assert r.status_code == 401, r.text
        DB.login_lockouts.delete_many({})

    def test_xff_spoof_prefix_ignored(self):
        """Client-prepended XFF entries must not let attacker rotate IPs."""
        DB.login_lockouts.delete_many({})
        for i in range(5):
            h = {"X-Forwarded-For": f"9.9.9.{i}, 10.200.200.200, 1.1.1.1, 2.2.2.2"}
            requests.post(f"{LOCAL}/api/auth/login-pin", json={"identifier": f"spoof{i}@x.com", "pin": "0000"}, headers=h)
        h = {"X-Forwarded-For": "8.8.8.8, 10.200.200.200, 1.1.1.1, 2.2.2.2"}
        r = requests.post(f"{LOCAL}/api/auth/login-pin", json={"identifier": "spoof9@x.com", "pin": "0000"}, headers=h)
        assert r.status_code == 429, r.text
        DB.login_lockouts.delete_many({})

    def test_credential_login_lockout(self, merchant):
        DB.login_lockouts.delete_many({})
        for _ in range(5):
            r = requests.post(f"{LOCAL}/api/auth/credential-login", json={"identifier": merchant["email"], "password": "wrong"}, headers=fip())
            assert r.status_code == 401
            assert r.json()["detail"] == "Identifiant ou mot de passe incorrect"
        r = requests.post(f"{LOCAL}/api/auth/credential-login", json={"identifier": merchant["email"], "password": "Test1234!"}, headers=fip())
        assert r.status_code == 429, r.text
        assert LOCK_MSG in r.json()["detail"]
        DB.login_lockouts.delete_many({})


# --- Ambassador
class TestAmbassador:
    def test_ambassador_login_and_lockout(self):
        DB.login_lockouts.delete_many({})
        email = f"test_amb_{uuid.uuid4().hex[:6]}@example.com"
        r = requests.post(f"{LOCAL}/api/admin/ambassadors/create", json={
            "adminPassword": ADMIN_PWD, "name": "TEST_Amb", "country": "CD", "city": "Kin",
            "email": email, "ambassadorPassword": "AmbPass2026"}, headers=fip())
        assert r.status_code == 200, r.text
        try:
            r = requests.post(f"{LOCAL}/api/ambassador/login", json={"email": email, "password": "AmbPass2026"}, headers=fip())
            assert r.status_code == 200, r.text
            atok = r.json().get("token")
            assert atok
            for _ in range(5):
                assert requests.post(f"{LOCAL}/api/ambassador/login", json={"email": email, "password": "bad"}, headers=fip()).status_code == 401
            r = requests.post(f"{LOCAL}/api/ambassador/login", json={"email": email, "password": "AmbPass2026"}, headers=fip())
            assert r.status_code == 429, r.text
            assert LOCK_MSG in r.json()["detail"]
        finally:
            DB.ambassadors.delete_one({"email": email})
            DB.login_lockouts.delete_many({})


# --- Admin
class TestAdmin:
    @pytest.mark.parametrize("path", ["/api/admin/login", "/api/admin/stats", "/api/admin/users", "/api/admin/export", "/api/admin/backups"])
    def test_admin_correct_and_wrong(self, path):
        DB.login_lockouts.delete_many({})
        r = requests.post(f"{LOCAL}{path}", json={"password": ADMIN_PWD}, headers=fip())
        assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"
        r = requests.post(f"{LOCAL}{path}", json={"password": "wrong"}, headers=fip())
        assert r.status_code == 401
        DB.login_lockouts.delete_many({})

    def test_admin_ambassadors_list(self):
        r = requests.post(f"{LOCAL}/api/admin/ambassadors/list", json={"adminPassword": ADMIN_PWD}, headers=fip())
        assert r.status_code == 200, r.text
        assert requests.post(f"{LOCAL}/api/admin/ambassadors/list", json={"adminPassword": "x"}, headers=fip()).status_code == 401
        DB.login_lockouts.delete_many({})

    def test_admin_lockout(self):
        DB.login_lockouts.delete_many({})
        for _ in range(5):
            assert requests.post(f"{LOCAL}/api/admin/login", json={"password": "wrong"}, headers=fip()).status_code == 401
        r = requests.post(f"{LOCAL}/api/admin/stats", json={"password": ADMIN_PWD}, headers=fip())
        assert r.status_code == 429, r.text
        DB.login_lockouts.delete_many({})
        assert requests.post(f"{LOCAL}/api/admin/login", json={"password": ADMIN_PWD}, headers=fip()).status_code == 200

    def test_change_password_removed(self):
        r = requests.post(f"{LOCAL}/api/admin/change-password", json={"password": ADMIN_PWD, "newPassword": "x"})
        assert r.status_code in (404, 405)


# --- JWT old secret rejected
class TestOldJwt:
    def test_old_secret_rejected(self, merchant):
        tok = jwt.encode({"sub": merchant["id"], "exp": datetime.now(timezone.utc) + timedelta(days=1)}, OLD_SECRET, algorithm="HS256")
        h = {"Authorization": f"Bearer {tok}"}
        assert requests.get(f"{LOCAL}/api/auth/profile", headers=h).status_code == 401
        assert requests.post(f"{LOCAL}/api/payments/stripe/subscription/checkout", json={"plan": "monthly"}, headers=h).status_code == 401
        assert requests.get(f"{LOCAL}/api/data/products", headers=h).status_code == 401
        assert requests.post(f"{LOCAL}/api/data/products", json={"name": "TEST_x", "price": 1}, headers=h).status_code == 401

    def test_old_secret_ambassador_rejected(self):
        tok = jwt.encode({"ambassador_id": "000000000000000000000000", "type": "ambassador", "exp": datetime.now(timezone.utc) + timedelta(days=1)}, OLD_SECRET, algorithm="HS256")
        h = {"Authorization": f"Bearer {tok}"}
        r = requests.post(f"{LOCAL}/api/ambassador/dashboard", json={"token": tok}, headers=h)
        assert r.status_code == 401, r.text
        r = requests.post(f"{LOCAL}/api/payments/stripe/ambassador/checkout", json={"plan": "monthly"}, headers=h)
        assert r.status_code in (401, 503), r.text


# --- Stripe
class TestStripe:
    def test_webhook_no_signature_refused(self, merchant):
        body = {"type": "checkout.session.completed", "data": {"object": {"id": "cs_test_fake", "payment_status": "paid"}}}
        r = requests.post(f"{LOCAL}/api/payments/stripe/webhook", json=body)
        assert r.status_code in (400, 503), r.text
        r = requests.post(f"{LOCAL}/api/payments/stripe/webhook", json=body, headers={"Stripe-Signature": "t=1,v1=abc"})
        assert r.status_code in (400, 503), r.text

    def test_checkout_session(self, merchant):
        r = requests.post(f"{LOCAL}/api/payments/stripe/subscription/checkout", json={"plan": "monthly"}, headers={"Authorization": f"Bearer {merchant['token']}"})
        assert r.status_code in (200, 503), r.text
        if r.status_code == 200:
            assert r.json()["url"].startswith("https://checkout.stripe.com")


# --- Activation code
class TestActivationCode:
    def test_generate_and_activate(self, merchant):
        email = f"test_ambc_{uuid.uuid4().hex[:6]}@example.com"
        r = requests.post(f"{LOCAL}/api/admin/ambassadors/create", json={
            "adminPassword": ADMIN_PWD, "name": "TEST_AmbC", "country": "CD", "city": "Kin",
            "email": email, "ambassadorPassword": "AmbPass2026"}, headers=fip())
        assert r.status_code == 200, r.text
        amb = DB.ambassadors.find_one({"email": email})
        try:
            r = requests.post(f"{LOCAL}/api/admin/codes/generate", json={"adminPassword": ADMIN_PWD, "count": 1, "plan": "monthly", "ambassadorId": str(amb["_id"])}, headers=fip())
            assert r.status_code == 200, r.text
            codes = r.json().get("codes")
            code = codes[0]["code"] if isinstance(codes[0], dict) else codes[0]
            # no token -> 401 (userId in body must be ignored)
            r = requests.post(f"{LOCAL}/api/subscription/activate-code", json={"userId": merchant["id"], "code": code})
            assert r.status_code == 401, r.text
            assert r.json()["detail"] == "Connectez-vous pour activer un code"
            # invalid token -> 401
            r = requests.post(f"{LOCAL}/api/subscription/activate-code", json={"code": code}, headers={"Authorization": "Bearer garbage"})
            assert r.status_code == 401, r.text
            assert DB.activation_codes.find_one({"code": code})["status"] == "unused"
            # with token, bogus userId in body ignored
            r = requests.post(f"{LOCAL}/api/subscription/activate-code", json={"userId": "000000000000000000000000", "code": code},
                              headers={"Authorization": f"Bearer {merchant['token']}"})
            assert r.status_code == 200, r.text
            # reuse -> 400
            r = requests.post(f"{LOCAL}/api/subscription/activate-code", json={"code": code}, headers={"Authorization": f"Bearer {merchant['token']}"})
            assert r.status_code == 400, r.text
            prof = requests.get(f"{LOCAL}/api/auth/profile", headers={"Authorization": f"Bearer {merchant['token']}"}).json()
            sub = (prof.get("user") or prof).get("subscription") or {}
            assert sub.get("status") == "active", prof
        finally:
            DB.activation_codes.delete_many({"ambassadorId": str(amb["_id"])})
            DB.ambassador_sales.delete_many({"ambassadorId": str(amb["_id"])})
            DB.commissions.delete_many({"ambassadorId": str(amb["_id"])})
            DB.ambassadors.delete_one({"_id": amb["_id"]})


# --- Removed endpoints & CORS
class TestRemovedAndCors:
    @pytest.mark.parametrize("path", ["/api/otp/send", "/api/otp/verify", "/api/firebase-auth", "/api/firebase-auth/verify"])
    def test_removed(self, path):
        assert requests.post(f"{LOCAL}{path}", json={"phone": "+243111000111"}).status_code == 404

    def test_cors_evil_rejected(self):
        r = requests.options(f"{PUBLIC}/api/health", headers={"Origin": "https://evil.com", "Access-Control-Request-Method": "POST"})
        assert r.headers.get("access-control-allow-origin") is None, dict(r.headers)

    def test_cors_preview_allowed(self):
        r = requests.options(f"{PUBLIC}/api/health", headers={"Origin": "https://low-data-shop.preview.emergentagent.com", "Access-Control-Request-Method": "POST"})
        assert r.headers.get("access-control-allow-origin") == "https://low-data-shop.preview.emergentagent.com", dict(r.headers)

    def test_cors_lookalike_rejected(self):
        r = requests.options(f"{PUBLIC}/api/health", headers={"Origin": "https://emergentagent.com.evil.com", "Access-Control-Request-Method": "POST"})
        assert r.headers.get("access-control-allow-origin") is None


# --- Iteration 14: reports protected by X-Admin-Password
class TestReportsProtected:
    @pytest.mark.parametrize("method,path", [("get", "/api/reports/analytics"), ("post", "/api/reports/send-report"), ("get", "/api/reports/test-email")])
    def test_reports_require_admin(self, method, path):
        DB.login_lockouts.delete_many({})
        r = getattr(requests, method)(f"{LOCAL}{path}", headers=fip())
        assert r.status_code == 401, f"{path} no header: {r.status_code} {r.text[:200]}"
        h = fip(); h["X-Admin-Password"] = "wrong"
        r = getattr(requests, method)(f"{LOCAL}{path}", headers=h)
        assert r.status_code == 401, f"{path} wrong: {r.status_code}"
        DB.login_lockouts.delete_many({})

    def test_analytics_ok_with_admin(self):
        DB.login_lockouts.delete_many({})
        h = fip(); h["X-Admin-Password"] = ADMIN_PWD
        r = requests.get(f"{LOCAL}/api/reports/analytics", headers=h)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert isinstance(d.get("total_users"), int)
        assert isinstance(d.get("countries"), (dict, list))

    def test_reports_public_url_401(self):
        r = requests.get(f"{PUBLIC}/api/reports/analytics")
        assert r.status_code == 401, r.text[:200]
        DB.login_lockouts.delete_many({})


# --- Iteration 14: success clears only the ACCOUNT counter, not the IP counter
class TestIpCounterNotReset:
    def test_success_does_not_reset_ip_counter(self, merchant):
        DB.login_lockouts.delete_many({})
        h = fip()
        for i in range(4):
            r = requests.post(f"{LOCAL}/api/auth/login-pin", json={"identifier": f"rnd{i}_{uuid.uuid4().hex[:4]}@x.com", "pin": "0000"}, headers=h)
            assert r.status_code == 401, r.text
        r = requests.post(f"{LOCAL}/api/auth/login-pin", json={"identifier": merchant["email"], "pin": "4321"}, headers=h)
        assert r.status_code == 200, r.text
        r = requests.post(f"{LOCAL}/api/auth/login-pin", json={"identifier": "fifth@x.com", "pin": "0000"}, headers=h)
        assert r.status_code == 401, r.text
        r = requests.post(f"{LOCAL}/api/auth/login-pin", json={"identifier": "any@x.com", "pin": "0000"}, headers=h)
        assert r.status_code == 429, r.text
        # also the valid merchant is blocked from that IP
        r = requests.post(f"{LOCAL}/api/auth/login-pin", json={"identifier": merchant["email"], "pin": "4321"}, headers=h)
        assert r.status_code == 429, r.text
        DB.login_lockouts.delete_many({})

    def test_credential_success_does_not_reset_ip_counter(self, merchant):
        DB.login_lockouts.delete_many({})
        h = fip()
        for i in range(4):
            assert requests.post(f"{LOCAL}/api/auth/credential-login", json={"identifier": f"rnd{i}@x.com", "password": "bad"}, headers=h).status_code == 401
        assert requests.post(f"{LOCAL}/api/auth/credential-login", json={"identifier": merchant["email"], "password": "Test1234!"}, headers=h).status_code == 200
        assert requests.post(f"{LOCAL}/api/auth/credential-login", json={"identifier": "x5@x.com", "password": "bad"}, headers=h).status_code == 401
        assert requests.post(f"{LOCAL}/api/auth/credential-login", json={"identifier": "x6@x.com", "password": "bad"}, headers=h).status_code == 429
        DB.login_lockouts.delete_many({})


# --- Iteration 14: ambassador panel pricing table in €
class TestAmbassadorPanel:
    def test_panel_no_undefined(self):
        r = requests.get(f"{LOCAL}/api/admin/ambassador-panel")
        assert r.status_code == 200
        assert "$undefined" not in r.text
