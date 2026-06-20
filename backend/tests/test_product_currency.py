"""
Backend tests for product currency persistence.

Covers:
- POST /api/data/products persists explicit `currency`
- POST /api/data/products without `currency` falls back to user's profile currency
- PUT /api/data/products/{id} updates `currency`
- Regression on: POST /api/auth/profile (PUT), GET /api/data/products, POST /api/data/sales
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://low-data-shop.preview.emergentagent.com").rstrip("/")


def _unique_phone() -> str:
    # Random phone in +324710XXXXXX (Belgium mobile range used by tests)
    suffix = str(int(time.time() * 1000))[-7:]
    return f"+324710{suffix}"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth(session):
    """Create a throwaway user via phone-login and return (token, user)."""
    phone = _unique_phone()
    r = session.post(f"{BASE_URL}/api/auth/phone-login", json={"phoneNumber": phone}, timeout=30)
    assert r.status_code == 200, f"phone-login failed: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("success") is True
    token = body["token"]
    user = body["user"]
    assert user.get("currency"), "Newly created user should have a default currency"
    return {"token": token, "user": user, "phone": phone}


@pytest.fixture(scope="module")
def auth_headers(auth):
    return {"Authorization": f"Bearer {auth['token']}", "Content-Type": "application/json"}


# ---------------------- Product Currency Tests ----------------------

class TestProductCurrency:
    """Currency persistence on products."""

    def test_create_product_with_explicit_eur_currency(self, session, auth_headers):
        payload = {
            "name": f"TEST_EUR_{uuid.uuid4().hex[:8]}",
            "purchasePrice": 1.5,
            "salePrice": 3.0,
            "stock": 10,
            "category": "food",
            "unit": "pcs",
            "currency": "EUR",
        }
        r = session.post(f"{BASE_URL}/api/data/products", json=payload, headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"create failed: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("duplicate") is False, f"Should not be duplicate: {data}"
        assert data.get("currency") == "EUR", f"Expected currency=EUR, got {data.get('currency')} in {data}"
        assert data.get("id"), "Product should have an id"

        # GET to verify persistence
        g = session.get(f"{BASE_URL}/api/data/products", headers=auth_headers, timeout=30)
        assert g.status_code == 200
        items = g.json()
        match = next((p for p in items if p.get("id") == data["id"]), None)
        assert match is not None, "Newly created product not found in GET list"
        assert match.get("currency") == "EUR", f"Persisted currency mismatch: {match}"

    def test_create_product_without_currency_uses_profile_currency(self, session, auth_headers, auth):
        # Make sure profile currency is set to a known value first (USD)
        r0 = session.put(
            f"{BASE_URL}/api/auth/profile",
            json={"currency": "USD"},
            headers=auth_headers,
            timeout=30,
        )
        assert r0.status_code == 200, f"profile update failed: {r0.text}"
        prof = r0.json()
        assert prof["user"]["currency"] == "USD"

        payload = {
            "name": f"TEST_NO_CUR_{uuid.uuid4().hex[:8]}",
            "purchasePrice": 2.0,
            "salePrice": 4.0,
            "stock": 5,
            "category": "food",
            "unit": "pcs",
            # currency intentionally omitted
        }
        r = session.post(f"{BASE_URL}/api/data/products", json=payload, headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"create failed: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("duplicate") is False
        assert data.get("currency") == "USD", (
            f"Expected fallback to profile currency USD, got {data.get('currency')}"
        )

        # Verify via GET
        g = session.get(f"{BASE_URL}/api/data/products", headers=auth_headers, timeout=30)
        assert g.status_code == 200
        match = next((p for p in g.json() if p.get("id") == data["id"]), None)
        assert match is not None
        assert match.get("currency") == "USD"

    def test_update_product_currency_to_usd(self, session, auth_headers):
        # Create product with EUR first
        payload = {
            "name": f"TEST_UPD_{uuid.uuid4().hex[:8]}",
            "purchasePrice": 5.0,
            "salePrice": 8.0,
            "stock": 3,
            "category": "food",
            "unit": "pcs",
            "currency": "EUR",
        }
        c = session.post(f"{BASE_URL}/api/data/products", json=payload, headers=auth_headers, timeout=30)
        assert c.status_code == 200
        created = c.json()
        assert created.get("currency") == "EUR"
        pid = created["id"]

        # PUT update to USD
        u = session.put(
            f"{BASE_URL}/api/data/products/{pid}",
            json={"currency": "USD"},
            headers=auth_headers,
            timeout=30,
        )
        assert u.status_code == 200, f"update failed: {u.status_code} {u.text}"
        updated = u.json()
        assert updated.get("currency") == "USD", f"Update did not persist currency: {updated}"

        # GET to verify persistence
        g = session.get(f"{BASE_URL}/api/data/products", headers=auth_headers, timeout=30)
        match = next((p for p in g.json() if p.get("id") == pid), None)
        assert match is not None
        assert match.get("currency") == "USD"


# ---------------------- Regression Tests ----------------------

class TestRegression:
    """Confirm previously working endpoints still pass."""

    def test_put_auth_profile(self, session, auth_headers):
        # Note: review request mentions POST /api/auth/profile, but the actual
        # implemented endpoint is PUT /api/auth/profile.
        r = session.put(
            f"{BASE_URL}/api/auth/profile",
            json={"currency": "CDF", "language": "fr"},
            headers=auth_headers,
            timeout=30,
        )
        assert r.status_code == 200, f"profile update failed: {r.text}"
        body = r.json()
        assert body.get("success") is True
        assert body["user"]["currency"] == "CDF"
        assert body["user"]["language"] == "fr"

        # Reset back to USD so later tests using profile fallback are predictable
        session.put(
            f"{BASE_URL}/api/auth/profile",
            json={"currency": "USD"},
            headers=auth_headers,
            timeout=30,
        )

    def test_get_products_list(self, session, auth_headers):
        r = session.get(f"{BASE_URL}/api/data/products", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # Each product should have core fields
        for p in data:
            assert "id" in p
            assert "name" in p
            assert "currency" in p, f"Product missing currency field: {p}"

    def test_post_sales(self, session, auth_headers):
        # Need at least one product for the sale
        prod_payload = {
            "name": f"TEST_SALE_PROD_{uuid.uuid4().hex[:8]}",
            "purchasePrice": 1.0,
            "salePrice": 2.5,
            "stock": 20,
            "category": "food",
            "unit": "pcs",
            "currency": "EUR",
        }
        pc = session.post(f"{BASE_URL}/api/data/products", json=prod_payload, headers=auth_headers, timeout=30)
        assert pc.status_code == 200
        prod = pc.json()
        pid = prod["id"]

        sale_payload = {
            "productId": pid,
            "productName": prod["name"],
            "quantity": 2,
            "total": 5.0,
            "paymentMethod": "cash",
            "currency": "EUR",
        }
        r = session.post(f"{BASE_URL}/api/data/sales", json=sale_payload, headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"sale create failed: {r.status_code} {r.text}"
        sale = r.json()
        assert sale.get("id"), "Sale should have id"
        assert sale.get("currency") == "EUR"
        assert sale.get("quantity") == 2

        # Verify stock decremented
        g = session.get(f"{BASE_URL}/api/data/products", headers=auth_headers, timeout=30)
        match = next((p for p in g.json() if p.get("id") == pid), None)
        assert match is not None
        assert match["stock"] == 18, f"Stock should be decremented to 18, got {match['stock']}"
