"""
Regression tests for Email + Password + PIN auth (post Firebase removal / SDK 58 upgrade)
and product CRUD with currency.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
MAIN_EMAIL = "test@tekateka.com"
MAIN_PASSWORD = "Test1234!"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def new_user(s):
    """Throwaway signup user; deleted at teardown via DELETE /api/account/me."""
    email = f"test_{uuid.uuid4().hex[:10]}@example.com"
    r = s.post(f"{BASE_URL}/api/auth/email-signup",
               json={"email": email, "password": "TestPass123", "name": "TEST_User"}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    yield {"email": email, "token": body["token"], "user": body["user"]}
    s.delete(f"{BASE_URL}/api/account/me", headers={"Authorization": f"Bearer {body['token']}"}, timeout=30)


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# --- Email signup ---
class TestSignup:
    def test_signup_returns_token_and_user(self, new_user):
        assert new_user["token"]
        assert new_user["user"].get("email") == new_user["email"]
        assert "_id" not in new_user["user"]

    def test_signup_duplicate_email_400(self, s, new_user):
        r = s.post(f"{BASE_URL}/api/auth/email-signup",
                   json={"email": new_user["email"], "password": "TestPass123"}, timeout=30)
        assert r.status_code == 400

    def test_signup_invalid_email_422(self, s):
        r = s.post(f"{BASE_URL}/api/auth/email-signup", json={"email": "bad", "password": "TestPass123"}, timeout=30)
        assert r.status_code == 422

    def test_signup_short_password_422(self, s):
        r = s.post(f"{BASE_URL}/api/auth/email-signup",
                   json={"email": f"t_{uuid.uuid4().hex[:6]}@example.com", "password": "123"}, timeout=30)
        assert r.status_code == 422

    def test_credential_login_new_user(self, s, new_user):
        r = s.post(f"{BASE_URL}/api/auth/credential-login",
                   json={"identifier": new_user["email"], "password": "TestPass123"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("token")


# --- Main account login (read-only) ---
class TestMainLogin:
    def test_main_credential_login(self, s):
        r = s.post(f"{BASE_URL}/api/auth/credential-login",
                   json={"identifier": MAIN_EMAIL, "password": MAIN_PASSWORD}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("token")

    def test_wrong_password_401(self, s):
        r = s.post(f"{BASE_URL}/api/auth/credential-login",
                   json={"identifier": MAIN_EMAIL, "password": "wrongpass"}, timeout=30)
        assert r.status_code == 401


# --- PIN ---
class TestPin:
    def test_setup_pin_and_login(self, s, new_user):
        r = s.post(f"{BASE_URL}/api/auth/setup-pin", json={"pin": "4321"}, headers=H(new_user["token"]), timeout=30)
        assert r.status_code == 200, r.text
        r2 = s.post(f"{BASE_URL}/api/auth/login-pin", json={"identifier": new_user["email"], "pin": "4321"}, timeout=30)
        assert r2.status_code == 200, r2.text
        assert r2.json().get("token")

    def test_login_pin_wrong_401(self, s, new_user):
        r = s.post(f"{BASE_URL}/api/auth/login-pin", json={"identifier": new_user["email"], "pin": "0000"}, timeout=30)
        assert r.status_code == 401

    def test_setup_pin_non_digits_400(self, s, new_user):
        r = s.post(f"{BASE_URL}/api/auth/setup-pin", json={"pin": "abcd"}, headers=H(new_user["token"]), timeout=30)
        assert r.status_code == 400

    def test_setup_pin_requires_auth(self, s):
        r = s.post(f"{BASE_URL}/api/auth/setup-pin", json={"pin": "1234"}, timeout=30)
        assert r.status_code in (401, 403)


# --- Forgot / reset password ---
class TestForgot:
    def test_forgot_unknown_email_generic(self, s):
        r = s.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": "nobody_zz@example.com"}, timeout=30)
        assert r.status_code == 200
        assert r.json().get("success") is True

    def test_forgot_known_email_twice(self, s, new_user):
        r1 = s.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": new_user["email"]}, timeout=30)
        assert r1.status_code == 200, r1.text
        # second call within 60s hits the throttle branch (datetime comparison)
        r2 = s.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": new_user["email"]}, timeout=30)
        assert r2.status_code == 200, f"throttle branch failed: {r2.status_code} {r2.text}"

    def test_reset_password_wrong_code_400(self, s, new_user):
        r = s.post(f"{BASE_URL}/api/auth/reset-password",
                   json={"email": new_user["email"], "code": "000000", "newPassword": "NewPass123"}, timeout=30)
        assert r.status_code == 400, f"{r.status_code} {r.text}"


# --- Product CRUD with currency ---
class TestProducts:
    def test_product_crud_currency(self, s, new_user):
        h = H(new_user["token"])
        r = s.post(f"{BASE_URL}/api/data/products", headers=h, timeout=30,
                   json={"name": "TEST_Prod", "price": 10, "purchasePrice": 5, "stock": 20, "unit": "pièce", "currency": "EUR"})
        assert r.status_code in (200, 201), r.text
        p = r.json()
        pid = p.get("id") or p.get("product", {}).get("id")
        assert pid
        r = s.put(f"{BASE_URL}/api/data/products/{pid}", headers=h, json={"price": 12, "name": "TEST_Prod2"}, timeout=30)
        assert r.status_code == 200, r.text
        lst = s.get(f"{BASE_URL}/api/data/products", headers=h, timeout=30).json()
        items = lst if isinstance(lst, list) else lst.get("products", lst.get("data", []))
        got = next(x for x in items if x.get("id") == pid)
        assert got["currency"] == "EUR"
        assert got["price"] == 12
        r = s.delete(f"{BASE_URL}/api/data/products/{pid}", headers=h, timeout=30)
        assert r.status_code in (200, 204)
        lst = s.get(f"{BASE_URL}/api/data/products", headers=h, timeout=30).json()
        items = lst if isinstance(lst, list) else lst.get("products", lst.get("data", []))
        assert not any(x.get("id") == pid for x in items)
