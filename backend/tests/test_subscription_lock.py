# Subscription lock (48h grace for paid plans, read-only mode after) — unit + API tests
import os
import sys
from datetime import datetime, timedelta, timezone

import pytest
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from subscription_guard import has_write_access  # noqa: E402


def _load_base_url():
    url = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
    if not url:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip().strip('"')
    return url.rstrip("/")


BASE_URL = _load_base_url()
PASSWORD = "Test1234!"
NOW = datetime(2026, 11, 13, 12, 0, tzinfo=timezone.utc)


def iso(dt):
    return dt.isoformat().replace("+00:00", "Z")


# ---------- Unit: has_write_access ----------
class TestGuardLogic:
    def test_paid_active_not_expired(self):
        u = {"subscription": {"plan": "monthly", "status": "active", "expiresAt": iso(NOW + timedelta(days=3))}}
        assert has_write_access(u, NOW) is True

    def test_paid_in_grace(self):
        u = {"subscription": {"plan": "yearly", "status": "active", "expiresAt": iso(NOW - timedelta(hours=47))}}
        assert has_write_access(u, NOW) is True

    def test_paid_after_grace(self):
        u = {"subscription": {"plan": "quarterly", "status": "active", "expiresAt": iso(NOW - timedelta(hours=49))}}
        assert has_write_access(u, NOW) is False

    def test_paid_expiry_date_field_naive(self):
        # admin_api style: expiryDate without Z
        u = {"subscription": {"plan": "monthly", "status": "active", "expiryDate": (NOW - timedelta(hours=72)).replace(tzinfo=None).isoformat()}}
        assert has_write_access(u, NOW) is False
        u2 = {"subscription": {"plan": "monthly", "status": "active", "expiryDate": (NOW - timedelta(hours=10)).replace(tzinfo=None).isoformat()}}
        assert has_write_access(u2, NOW) is True

    def test_trial_no_grace(self):
        u = {"subscription": {"plan": "trial", "status": "trial", "trialEndsAt": iso(NOW - timedelta(minutes=5)), "expiresAt": iso(NOW - timedelta(minutes=5))}}
        assert has_write_access(u, NOW) is False
        u2 = {"subscription": {"plan": "trial", "status": "trial", "expiresAt": iso(NOW + timedelta(hours=1))}}
        assert has_write_access(u2, NOW) is True

    def test_no_subscription_uses_created_at(self):
        assert has_write_access({"createdAt": iso(NOW - timedelta(days=6))}, NOW) is True
        assert has_write_access({"createdAt": iso(NOW - timedelta(days=7, minutes=1))}, NOW) is False
        assert has_write_access({}, NOW) is True


# ---------- API ----------
def _login(identifier):
    r = requests.post(f"{BASE_URL}/api/auth/credential-login", json={"identifier": identifier, "password": PASSWORD}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"login {identifier} failed {r.status_code} {r.text[:200]}")
    data = r.json()
    return data.get("token") or data.get("access_token"), data


@pytest.fixture(scope="module")
def expired():
    tok, data = _login("expired@tekateka.com")
    return {"Authorization": f"Bearer {tok}"}, data


@pytest.fixture(scope="module")
def grace():
    tok, data = _login("grace@tekateka.com")
    return {"Authorization": f"Bearer {tok}"}, data


@pytest.fixture(scope="module")
def normal():
    tok, data = _login("test@tekateka.com")
    return {"Authorization": f"Bearer {tok}"}, data


PRODUCT = {"name": "TEST_lock_product", "purchasePrice": 1, "salePrice": 2, "stock": 5, "category": "Autre"}


class TestExpiredUser:
    def test_login_returns_user(self, expired):
        _, data = expired
        assert data["user"]["subscription"]["plan"] == "monthly"

    def test_reads_allowed(self, expired):
        h, _ = expired
        for p in ["products", "sales", "expenses", "debts", "purchases", "notes"]:
            r = requests.get(f"{BASE_URL}/api/data/{p}", headers=h, timeout=20)
            assert r.status_code == 200, f"{p}: {r.status_code}"

    def test_writes_blocked(self, expired):
        h, _ = expired
        calls = [
            ("post", "/api/data/products", PRODUCT),
            ("put", "/api/data/products/000000000000000000000000", {"name": "x"}),
            ("delete", "/api/data/products/000000000000000000000000", None),
            ("post", "/api/data/sales", {"productId": "x", "productName": "TEST_", "quantity": 1, "total": 1}),
            ("post", "/api/data/expenses", {"category": "TEST_", "amount": 1}),
            ("post", "/api/data/debts", {"debtorName": "TEST_", "amount": 1}),
            ("post", "/api/data/notes", {"title": "TEST_", "content": "x"}),
            ("post", "/api/data/purchases", {"productName": "TEST_", "quantity": 1}),
        ]
        for m, path, body in calls:
            r = getattr(requests, m)(f"{BASE_URL}{path}", headers=h, json=body, timeout=20)
            assert r.status_code == 402, f"{m} {path}: {r.status_code} {r.text[:120]}"
            assert r.json().get("code") == "SUBSCRIPTION_EXPIRED"
            assert "access-control-allow-origin" in {k.lower() for k in r.headers}  # CORS on 402

    def test_auth_profile_not_blocked(self, expired):
        h, _ = expired
        r = requests.get(f"{BASE_URL}/api/auth/profile", headers=h, timeout=20)
        assert r.status_code == 200
        r2 = requests.post(f"{BASE_URL}/api/auth/refresh", headers=h, timeout=20)
        assert r2.status_code != 402

    def test_payment_endpoints_not_blocked(self, expired):
        h, data = expired
        uid = data["user"]["id"]
        r = requests.post(f"{BASE_URL}/api/subscription/activate-code", json={"userId": uid, "code": "TK-ZZZZ-ZZZZ"}, timeout=20)
        assert r.status_code not in (402, 500), r.text
        r = requests.get(f"{BASE_URL}/api/payments/stripe/config", headers=h, timeout=20)
        assert r.status_code == 200
        r = requests.post(f"{BASE_URL}/api/payments/stripe/subscription/checkout", headers=h,
                          json={"plan": "TEST_invalid", "origin_url": BASE_URL}, timeout=30)
        # invalid plan -> 400 from the route itself (proves middleware lets it through, no pending payment created)
        assert r.status_code in (400, 422, 503), r.text

    def test_db_untouched(self, expired):
        h, _ = expired
        r = requests.get(f"{BASE_URL}/api/data/products", headers=h, timeout=20)
        names = [p.get("name") for p in r.json()] if isinstance(r.json(), list) else []
        assert "TEST_lock_product" not in names


class TestGraceAndNormal:
    @pytest.mark.parametrize("who", ["grace", "normal"])
    def test_write_allowed_and_cleanup(self, who, request):
        h, _ = request.getfixturevalue(who)
        r = requests.post(f"{BASE_URL}/api/data/products", headers=h, json={**PRODUCT, "name": f"TEST_lock_{who}"}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        pid = body.get("id") or (body.get("product") or {}).get("id")
        assert pid
        g = requests.get(f"{BASE_URL}/api/data/products", headers=h, timeout=20)
        assert any(p.get("id") == pid for p in g.json())
        d = requests.delete(f"{BASE_URL}/api/data/products/{pid}", headers=h, timeout=20)
        assert d.status_code == 200
