"""
Backend tests for the recent TekaTeka backend changes.

Coverage (per review request):
  1. Subscription refresh flow:
       - POST /api/subscription/activate-code  +  GET /api/auth/profile
       - POST /api/auth/subscribe (plan=yearly) + GET /api/auth/profile
  2. Ambassador preferred currency:
       - POST /api/ambassador/profile/currency persists & is echoed by
         POST /api/ambassador/dashboard
  3. POST /api/admin/login (unchanged password validation)
  4. POST /api/admin/ambassadors/list (still takes adminPassword body field)
  5. HTML admin pages (GET /api/admin and /api/admin/ambassador-panel)
     contain `sessionStorage` (F5-persistence JS)
  6. POST /api/auth/refresh still works with a valid JWT

The tests hit the public preview URL (same one the mobile client uses)
so we exercise the ingress + /api -> :8001 rewrite.
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://low-data-shop.preview.emergentagent.com",
).rstrip("/")

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Ndinemakutamillions82@")
# A throwaway test ambassador is created via /api/admin/ambassadors/create at
# module setup. Email is uniquified per run so re-runs don't collide on the
# case-insensitive unique-email check.
AMBASSADOR_PASSWORD = "TestAmb2025!"

REQ_TIMEOUT = 20


# ----------------------------------------------------------------------
# Fixtures / helpers
# ----------------------------------------------------------------------
def _unique_phone() -> str:
    """+243 + 9 unique digits — keeps E.164 shape, avoids reserved ranges."""
    suffix = str(int(time.time() * 1000) + int(uuid.uuid4().int % 1000))[-9:]
    return f"+243{suffix}"


@pytest.fixture(scope="module")
def session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def user(session: requests.Session) -> dict:
    """Create a fresh phone-login user for subscription tests."""
    phone = _unique_phone()
    r = session.post(
        f"{BASE_URL}/api/auth/phone-login",
        json={"phoneNumber": phone},
        timeout=REQ_TIMEOUT,
    )
    if r.status_code == 429:
        pytest.skip(f"Rate-limited on /auth/phone-login: {r.text}")
    assert r.status_code == 200, f"phone-login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("success") is True
    assert data.get("token")
    assert data["user"].get("id")
    data["_phone"] = phone
    return data


@pytest.fixture(scope="module", autouse=True)
def _cleanup_user(user, session):
    """Best-effort cleanup: purge the shared test user via GDPR delete."""
    yield
    try:
        token = user.get("token")
        if not token:
            return
        session.delete(
            f"{BASE_URL}/api/account/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=REQ_TIMEOUT,
        )
    except Exception:
        pass


@pytest.fixture(scope="module")
def ambassador_login(session: requests.Session) -> dict:
    """Create a throwaway ambassador via admin endpoint, then log in.
    Uses a unique email per run so the case-insensitive uniqueness check
    in /api/admin/ambassadors/create doesn't collide on re-runs.
    """
    email = f"test-amb-{int(time.time())}-{uuid.uuid4().hex[:6]}@tekateka-test.local"
    r_create = session.post(
        f"{BASE_URL}/api/admin/ambassadors/create",
        json={
            "adminPassword": ADMIN_PASSWORD,
            "name": "Test Ambassador",
            "country": "BE",
            "city": "Brussels",
            "email": email,
            "ambassadorPassword": AMBASSADOR_PASSWORD,
        },
        timeout=REQ_TIMEOUT,
    )
    if r_create.status_code != 200:
        pytest.skip(
            f"Could not seed test ambassador ({r_create.status_code}): "
            f"{r_create.text}. Dependent tests will be skipped."
        )
    r = session.post(
        f"{BASE_URL}/api/ambassador/login",
        json={"email": email, "password": AMBASSADOR_PASSWORD},
        timeout=REQ_TIMEOUT,
    )
    if r.status_code != 200:
        pytest.skip(
            f"Ambassador login failed ({r.status_code}): {r.text} — "
            "tests depending on this will be skipped."
        )
    data = r.json()
    assert data.get("token")
    assert data["ambassador"].get("id")
    data["_email"] = email
    return data


@pytest.fixture(scope="module", autouse=True)
def _cleanup_ambassador(ambassador_login, session):
    """Delete the throwaway ambassador after the module finishes."""
    yield
    try:
        amb_id = ambassador_login.get("ambassador", {}).get("id")
        if not amb_id:
            return
        session.post(
            f"{BASE_URL}/api/admin/ambassadors/delete",
            json={"adminPassword": ADMIN_PASSWORD, "ambassadorId": amb_id},
            timeout=REQ_TIMEOUT,
        )
    except Exception:
        pass


# ----------------------------------------------------------------------
# 3) Admin login still works
# ----------------------------------------------------------------------
class TestAdminLogin:
    def test_admin_login_success(self, session: requests.Session):
        r = session.post(
            f"{BASE_URL}/api/admin/login",
            json={"password": ADMIN_PASSWORD},
            timeout=REQ_TIMEOUT,
        )
        assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
        assert r.json().get("success") is True

    def test_admin_login_wrong_password_returns_401(self, session: requests.Session):
        r = session.post(
            f"{BASE_URL}/api/admin/login",
            json={"password": "definitely-not-the-password-" + uuid.uuid4().hex},
            timeout=REQ_TIMEOUT,
        )
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"


# ----------------------------------------------------------------------
# 4) Admin ambassadors list — still accepts adminPassword body field
# ----------------------------------------------------------------------
class TestAdminAmbassadorsList:
    def test_list_with_valid_admin_password(self, session: requests.Session):
        r = session.post(
            f"{BASE_URL}/api/admin/ambassadors/list",
            json={"adminPassword": ADMIN_PASSWORD},
            timeout=REQ_TIMEOUT,
        )
        assert r.status_code == 200, f"got {r.status_code}: {r.text}"
        body = r.json()
        assert isinstance(body, list), f"expected list, got {type(body).__name__}"
        # Sanity: shape of an ambassador entry
        if body:
            amb = body[0]
            for key in ("id", "name", "email", "country", "status"):
                assert key in amb, f"missing key '{key}' in ambassador entry: {amb}"

    def test_list_with_wrong_admin_password_returns_401(self, session: requests.Session):
        r = session.post(
            f"{BASE_URL}/api/admin/ambassadors/list",
            json={"adminPassword": "nope-" + uuid.uuid4().hex},
            timeout=REQ_TIMEOUT,
        )
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"


# ----------------------------------------------------------------------
# 5) HTML admin pages render with sessionStorage logic
# ----------------------------------------------------------------------
class TestAdminHtmlPages:
    def test_admin_html_contains_sessionstorage(self, session: requests.Session):
        r = session.get(f"{BASE_URL}/api/admin", timeout=REQ_TIMEOUT)
        assert r.status_code == 200, f"GET /api/admin failed: {r.status_code}"
        ctype = r.headers.get("content-type", "")
        assert "text/html" in ctype.lower(), f"expected HTML, got {ctype}"
        assert "sessionStorage" in r.text, (
            "GET /api/admin response does not contain 'sessionStorage' — "
            "the F5-persistence JS (tryRestoreSession) may have been removed."
        )
        # Also verify the restore function is wired up
        assert "tryRestoreSession" in r.text, "tryRestoreSession() missing in /api/admin"

    def test_ambassador_panel_html_contains_sessionstorage(self, session: requests.Session):
        r = session.get(f"{BASE_URL}/api/admin/ambassador-panel", timeout=REQ_TIMEOUT)
        assert r.status_code == 200, f"GET /api/admin/ambassador-panel failed: {r.status_code}"
        ctype = r.headers.get("content-type", "")
        assert "text/html" in ctype.lower(), f"expected HTML, got {ctype}"
        assert "sessionStorage" in r.text, (
            "GET /api/admin/ambassador-panel response does not contain "
            "'sessionStorage' — F5-persistence JS may have been removed."
        )
        assert "tryRestoreSession" in r.text, (
            "tryRestoreSession() missing in /api/admin/ambassador-panel"
        )


# ----------------------------------------------------------------------
# 6) POST /api/auth/refresh still returns new token + user with valid JWT
# ----------------------------------------------------------------------
class TestAuthRefresh:
    def test_refresh_returns_new_token_and_user(self, session: requests.Session, user: dict):
        # Sleep so the new JWT exp differs from the original (integer-second
        # precision in `exp` claim).
        time.sleep(1.1)
        r = session.post(
            f"{BASE_URL}/api/auth/refresh",
            headers={"Authorization": f"Bearer {user['token']}"},
            timeout=REQ_TIMEOUT,
        )
        assert r.status_code == 200, f"refresh failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("success") is True
        assert isinstance(body.get("token"), str) and body["token"]
        assert body["token"] != user["token"], (
            "refresh returned the SAME token (exp claim collision)"
        )
        assert isinstance(body.get("user"), dict)
        assert body["user"].get("id") == user["user"]["id"]
        assert body.get("expiresInDays") == 365
        # Replace the user's token with the refreshed one so cleanup uses the
        # freshest valid token.
        user["token"] = body["token"]


# ----------------------------------------------------------------------
# 1a) Subscription refresh — POST /api/auth/subscribe + GET /api/auth/profile
# ----------------------------------------------------------------------
class TestSubscribeAndProfileRefresh:
    """After POST /api/auth/subscribe, an immediate GET /api/auth/profile
    must return the updated subscription.expiresAt field."""

    def test_subscribe_yearly_then_profile_reflects_expiresat(
        self, session: requests.Session, user: dict
    ):
        # Capture the "before" state from /auth/profile
        headers = {"Authorization": f"Bearer {user['token']}"}
        r_before = session.get(
            f"{BASE_URL}/api/auth/profile", headers=headers, timeout=REQ_TIMEOUT
        )
        assert r_before.status_code == 200, r_before.text
        before_sub = r_before.json()["user"].get("subscription", {})
        before_expires = before_sub.get("expiresAt")
        before_plan = before_sub.get("plan")

        # Subscribe yearly
        r_sub = session.post(
            f"{BASE_URL}/api/auth/subscribe",
            headers=headers,
            json={"plan": "yearly"},
            timeout=REQ_TIMEOUT,
        )
        assert r_sub.status_code == 200, f"subscribe failed: {r_sub.status_code} {r_sub.text}"
        sub_body = r_sub.json()
        assert sub_body.get("success") is True
        # Subscribe response should already echo new subscription
        sub_in_response = sub_body["user"]["subscription"]
        assert sub_in_response.get("plan") == "yearly"
        assert sub_in_response.get("status") == "active"
        assert sub_in_response.get("expiresAt"), "subscribe didn't return expiresAt"

        # IMMEDIATELY call GET /api/auth/profile — this is the key contract
        # (frontend calls authAPI.getProfile() right after activation)
        r_after = session.get(
            f"{BASE_URL}/api/auth/profile", headers=headers, timeout=REQ_TIMEOUT
        )
        assert r_after.status_code == 200, r_after.text
        after_user = r_after.json()["user"]
        after_sub = after_user.get("subscription", {})

        assert after_sub.get("plan") == "yearly", (
            f"expected plan=yearly, got {after_sub.get('plan')}; before was {before_plan}"
        )
        assert after_sub.get("status") == "active"
        assert after_sub.get("expiresAt"), "profile.subscription.expiresAt missing after subscribe"
        # The new expiresAt must differ from the trial expiry that was seeded
        # at user creation (subscribe sets it to now+365d).
        assert after_sub.get("expiresAt") != before_expires, (
            f"expiresAt did NOT change after subscribe: "
            f"before={before_expires} after={after_sub.get('expiresAt')}"
        )
        # And it must equal what the subscribe call itself returned (no DB lag)
        assert after_sub.get("expiresAt") == sub_in_response.get("expiresAt"), (
            "expiresAt from /auth/profile differs from /auth/subscribe response"
        )


# ----------------------------------------------------------------------
# 1b) Subscription refresh — POST /api/subscription/activate-code + GET /api/auth/profile
# ----------------------------------------------------------------------
class TestActivateCodeAndProfileRefresh:
    """After POST /api/subscription/activate-code, an immediate
    GET /api/auth/profile must return the updated subscription."""

    def test_activate_code_then_profile_reflects_expiresat(
        self, session: requests.Session, ambassador_login: dict
    ):
        ambassador_id = ambassador_login["ambassador"]["id"]

        # 1) Generate ONE fresh yearly code for this ambassador via admin endpoint
        r_gen = session.post(
            f"{BASE_URL}/api/admin/codes/generate",
            json={
                "adminPassword": ADMIN_PASSWORD,
                "ambassadorId": ambassador_id,
                "plan": "yearly",
                "count": 1,
            },
            timeout=REQ_TIMEOUT,
        )
        assert r_gen.status_code == 200, f"codes/generate failed: {r_gen.status_code} {r_gen.text}"
        gen = r_gen.json()
        assert gen.get("success") is True
        assert isinstance(gen.get("codes"), list) and len(gen["codes"]) == 1
        code = gen["codes"][0]
        assert code.startswith("TK-"), f"unexpected code format: {code}"

        # 2) Create a fresh phone-login user (don't pollute the shared module user)
        phone = _unique_phone()
        r_login = session.post(
            f"{BASE_URL}/api/auth/phone-login",
            json={"phoneNumber": phone},
            timeout=REQ_TIMEOUT,
        )
        if r_login.status_code == 429:
            pytest.skip(f"Rate-limited on /auth/phone-login: {r_login.text}")
        assert r_login.status_code == 200, r_login.text
        ldata = r_login.json()
        user_id = ldata["user"]["id"]
        token = ldata["token"]
        headers = {"Authorization": f"Bearer {token}"}

        try:
            # Snapshot BEFORE
            r_before = session.get(
                f"{BASE_URL}/api/auth/profile", headers=headers, timeout=REQ_TIMEOUT
            )
            assert r_before.status_code == 200, r_before.text
            before_sub = r_before.json()["user"].get("subscription", {})
            before_expires = before_sub.get("expiresAt")
            assert before_sub.get("plan") in (None, "trial"), (
                f"expected fresh user to be on trial, got {before_sub}"
            )

            # 3) Activate the code
            r_act = session.post(
                f"{BASE_URL}/api/subscription/activate-code",
                json={"userId": user_id, "code": code},
                timeout=REQ_TIMEOUT,
            )
            assert r_act.status_code == 200, (
                f"activate-code failed: {r_act.status_code} {r_act.text}"
            )

            # 4) IMMEDIATELY call GET /api/auth/profile — this is what the
            #    mobile app does (authAPI.getProfile()) to refresh user state.
            r_after = session.get(
                f"{BASE_URL}/api/auth/profile", headers=headers, timeout=REQ_TIMEOUT
            )
            assert r_after.status_code == 200, r_after.text
            after_sub = r_after.json()["user"].get("subscription", {})

            # The CRITICAL assertion — expiresAt must be updated and visible
            # on /auth/profile right after activation (no DB lag, no caching).
            assert after_sub.get("plan") == "yearly", (
                f"expected plan=yearly after activate-code, got {after_sub}"
            )
            assert after_sub.get("status") == "active", (
                f"expected status=active after activate-code, got {after_sub}"
            )
            assert after_sub.get("expiresAt"), (
                "subscription.expiresAt missing on /auth/profile after activate-code"
            )
            assert after_sub.get("expiresAt") != before_expires, (
                f"expiresAt did NOT change after activate-code: "
                f"before={before_expires} after={after_sub.get('expiresAt')}"
            )
        finally:
            # Cleanup: delete the throwaway user
            try:
                session.delete(
                    f"{BASE_URL}/api/account/me",
                    headers=headers,
                    timeout=REQ_TIMEOUT,
                )
            except Exception:
                pass


# ----------------------------------------------------------------------
# 2) Ambassador currency preference persists & is returned by dashboard
# ----------------------------------------------------------------------
class TestAmbassadorCurrencyPreference:
    """POST /api/ambassador/profile/currency must persist the currency, and
    POST /api/ambassador/dashboard must echo it under ambassador.preferredCurrency.
    """

    @pytest.mark.parametrize("currency", ["USD", "EUR", "CDF"])
    def test_set_currency_then_dashboard_reflects_it(
        self, session: requests.Session, ambassador_login: dict, currency: str
    ):
        token = ambassador_login["token"]

        # Set currency
        r_set = session.post(
            f"{BASE_URL}/api/ambassador/profile/currency",
            json={"token": token, "currency": currency},
            timeout=REQ_TIMEOUT,
        )
        assert r_set.status_code == 200, (
            f"profile/currency failed for {currency}: {r_set.status_code} {r_set.text}"
        )
        body = r_set.json()
        assert body.get("success") is True
        assert body.get("preferredCurrency") == currency

        # Verify via dashboard
        r_dash = session.post(
            f"{BASE_URL}/api/ambassador/dashboard",
            json={"token": token},
            timeout=REQ_TIMEOUT,
        )
        assert r_dash.status_code == 200, (
            f"dashboard failed: {r_dash.status_code} {r_dash.text}"
        )
        dash = r_dash.json()
        amb = dash.get("ambassador", {})
        assert amb.get("preferredCurrency") == currency, (
            f"dashboard.ambassador.preferredCurrency is {amb.get('preferredCurrency')!r}, "
            f"expected {currency!r}"
        )

    def test_invalid_currency_returns_400(
        self, session: requests.Session, ambassador_login: dict
    ):
        token = ambassador_login["token"]
        r = session.post(
            f"{BASE_URL}/api/ambassador/profile/currency",
            json={"token": token, "currency": "ZZZ"},
            timeout=REQ_TIMEOUT,
        )
        assert r.status_code == 400, f"expected 400 for invalid currency, got {r.status_code}: {r.text}"
