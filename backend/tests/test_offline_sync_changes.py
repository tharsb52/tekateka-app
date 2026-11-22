# Offline sync (iteration 10): /api/data/changes signatures, clientId idempotency, offlineCreatedAt rules
import os
import time
import uuid
import concurrent.futures
from datetime import datetime, timedelta, timezone

import pytest
import requests


def _load_base_url():
    url = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
    if not url:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip().strip('"')
    return url.rstrip("/")


BASE_URL = _load_base_url()


def iso(dt):
    return dt.isoformat().replace("+00:00", "Z")


def parse(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


@pytest.fixture(scope="module")
def acct():
    """Throwaway TEST_ account, fully deleted at the end (DELETE /api/account/me)."""
    email = f"test_offline_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{BASE_URL}/api/auth/email-signup", json={"email": email, "password": "Test1234!", "name": "TEST_offline"}, timeout=20)
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    yield s
    s.delete(f"{BASE_URL}/api/account/me", timeout=20)


@pytest.fixture(scope="module")
def product(acct):
    r = acct.post(f"{BASE_URL}/api/data/products", json={"name": "TEST_Riz", "purchasePrice": 1, "salePrice": 2, "stock": 10, "category": "food", "currency": "USD"}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


# --- /api/data/changes ---
class TestChanges:
    def test_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/data/changes", timeout=20)
        assert r.status_code in (401, 403, 422)

    def test_shape_for_test_user(self):
        r = requests.post(f"{BASE_URL}/api/auth/credential-login", json={"identifier": "test@tekateka.com", "password": "Test1234!"}, timeout=20)
        assert r.status_code == 200
        tok = r.json().get("token") or r.json().get("access_token")
        c = requests.get(f"{BASE_URL}/api/data/changes", headers={"Authorization": f"Bearer {tok}"}, timeout=20)
        assert c.status_code == 200
        d = c.json()
        assert set(d.keys()) == {"products", "sales", "expenses", "debts", "purchases"}
        for v in d.values():
            assert isinstance(v, str) and ":" in v and v.split(":", 1)[0].isdigit()

    def test_empty_account_signatures(self, acct):
        d = acct.get(f"{BASE_URL}/api/data/changes", timeout=20).json()
        assert d["sales"] == "0:" and d["purchases"] == "0:" and d["expenses"] == "0:"

    def test_signature_changes_after_writes(self, acct, product):
        before = acct.get(f"{BASE_URL}/api/data/changes", timeout=20).json()
        assert before["products"].startswith("1:")
        acct.post(f"{BASE_URL}/api/data/sales", json={"productId": product["id"], "productName": "TEST_Riz", "quantity": 1, "total": 2, "paymentMethod": "cash", "currency": "USD"}, timeout=20)
        acct.post(f"{BASE_URL}/api/data/purchases", json={"productName": "TEST_P", "supplier": "S", "quantity": 1, "unitPrice": 1, "totalCost": 1, "currency": "USD"}, timeout=20)
        acct.post(f"{BASE_URL}/api/data/expenses", json={"category": "rent", "amount": 5, "currency": "USD"}, timeout=20)
        after = acct.get(f"{BASE_URL}/api/data/changes", timeout=20).json()
        assert after["sales"] != before["sales"]
        assert after["purchases"] != before["purchases"]
        assert after["expenses"] != before["expenses"]
        assert after["products"] != before["products"]  # stock change bumps updatedAt
        assert after["debts"] == before["debts"]


# --- clientId idempotency ---
class TestIdempotency:
    def test_sale_same_client_id_twice(self, acct, product):
        stock0 = next(p for p in acct.get(f"{BASE_URL}/api/data/products").json() if p["id"] == product["id"])["stock"]
        cid = f"TEST_{uuid.uuid4().hex}"
        body = {"productId": product["id"], "productName": "TEST_Riz", "quantity": 2, "total": 4, "paymentMethod": "cash", "currency": "USD", "clientId": cid}
        a = acct.post(f"{BASE_URL}/api/data/sales", json=body, timeout=20).json()
        b = acct.post(f"{BASE_URL}/api/data/sales", json=body, timeout=20).json()
        assert a["id"] == b["id"]
        sales = [s for s in acct.get(f"{BASE_URL}/api/data/sales").json() if s.get("clientId") == cid]
        assert len(sales) == 1
        stock1 = next(p for p in acct.get(f"{BASE_URL}/api/data/products").json() if p["id"] == product["id"])["stock"]
        assert stock1 == stock0 - 2

    def test_purchase_same_client_id_twice(self, acct):
        cid = f"TEST_{uuid.uuid4().hex}"
        body = {"productName": "TEST_P2", "supplier": "S", "quantity": 1, "unitPrice": 3, "totalCost": 3, "currency": "USD", "clientId": cid}
        a = acct.post(f"{BASE_URL}/api/data/purchases", json=body, timeout=20).json()
        b = acct.post(f"{BASE_URL}/api/data/purchases", json=body, timeout=20).json()
        assert a["id"] == b["id"]
        rows = [p for p in acct.get(f"{BASE_URL}/api/data/purchases").json() if p.get("clientId") == cid]
        assert len(rows) == 1

    def test_sale_concurrent_same_client_id(self, acct, product):
        """Race: two parallel replays of the same offline sale (no unique index)."""
        cid = f"TEST_{uuid.uuid4().hex}"
        body = {"productId": product["id"], "productName": "TEST_Riz", "quantity": 1, "total": 2, "paymentMethod": "cash", "currency": "USD", "clientId": cid}
        with concurrent.futures.ThreadPoolExecutor(4) as ex:
            list(ex.map(lambda _: acct.post(f"{BASE_URL}/api/data/sales", json=body, timeout=20), range(4)))
        rows = [s for s in acct.get(f"{BASE_URL}/api/data/sales").json() if s.get("clientId") == cid]
        assert len(rows) == 1, f"{len(rows)} duplicate sales created for one clientId"


# --- offlineCreatedAt ---
class TestOfflineCreatedAt:
    def _sale(self, acct, when):
        body = {"productId": "TEST_none", "productName": "TEST_x", "quantity": 1, "total": 1, "paymentMethod": "cash", "currency": "USD", "clientId": f"TEST_{uuid.uuid4().hex}", "offlineCreatedAt": when}
        return acct.post(f"{BASE_URL}/api/data/sales", json=body, timeout=20).json()

    def test_recent_kept(self, acct):
        t = datetime.now(timezone.utc) - timedelta(days=2)
        r = self._sale(acct, iso(t.replace(microsecond=0)))
        assert abs((parse(r["createdAt"]) - t.replace(microsecond=0)).total_seconds()) < 1

    def test_future_replaced(self, acct):
        r = self._sale(acct, iso(datetime.now(timezone.utc) + timedelta(days=1)))
        assert abs((parse(r["createdAt"]) - datetime.now(timezone.utc)).total_seconds()) < 120

    def test_too_old_replaced(self, acct):
        r = self._sale(acct, iso(datetime.now(timezone.utc) - timedelta(days=40)))
        assert abs((parse(r["createdAt"]) - datetime.now(timezone.utc)).total_seconds()) < 120

    def test_garbage_replaced(self, acct):
        r = self._sale(acct, "not-a-date")
        assert abs((parse(r["createdAt"]) - datetime.now(timezone.utc)).total_seconds()) < 120

    def test_purchase_recent_kept(self, acct):
        t = (datetime.now(timezone.utc) - timedelta(days=5)).replace(microsecond=0)
        body = {"productName": "TEST_P3", "quantity": 1, "unitPrice": 1, "totalCost": 1, "currency": "USD", "clientId": f"TEST_{uuid.uuid4().hex}", "offlineCreatedAt": iso(t)}
        r = acct.post(f"{BASE_URL}/api/data/purchases", json=body, timeout=20).json()
        assert abs((parse(r["createdAt"]) - t).total_seconds()) < 1


# --- read-only lock still applies to offline replays ---
class TestReadOnlyReplay:
    def test_expired_sale_with_client_id_402(self):
        r = requests.post(f"{BASE_URL}/api/auth/credential-login", json={"identifier": "expired@tekateka.com", "password": "Test1234!"}, timeout=20)
        if r.status_code != 200:
            pytest.skip("expired@ login failed")
        tok = r.json().get("token") or r.json().get("access_token")
        s = requests.post(f"{BASE_URL}/api/data/sales", headers={"Authorization": f"Bearer {tok}"}, json={"productName": "TEST_ro", "quantity": 1, "total": 1, "paymentMethod": "cash", "currency": "USD", "clientId": "TEST_ro"}, timeout=20)
        assert s.status_code == 402
        assert s.json().get("code") == "SUBSCRIPTION_EXPIRED"
