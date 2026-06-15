"""
Backend tests for the persistent-auth changes in data_api.py.

Under test:
  * POST /api/auth/refresh        — new endpoint, must be rock-solid (called
                                     on every app boot).
  * POST /api/auth/phone-login    — now issues a 365-day JWT (regression).
  * GET  /api/auth/profile        — must still work with the new long-lived
                                     JWT, and also with a fresh refreshed JWT.

Notes:
  * We only DECODE the JWT (no signature verification) to read `exp` — that
    matches the spec ("Decode JWT manually") and avoids leaking the server
    secret into the test process.
  * Phone numbers are uniquified per test run to avoid colliding with other
    tests and to dodge the brute-force rate limiter as much as possible.
"""
from __future__ import annotations

import base64
import json
import os
import time
from bson import ObjectId
import pytest
import requests

# The public preview URL is the same one the mobile client uses, so we test
# end-to-end through the ingress (incl. /api -> :8001 rewrite).
BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://low-data-shop.preview.emergentagent.com",
).rstrip("/")

ACCESS_TOKEN_EXPIRE_DAYS_EXPECTED = 365
# How much wiggle room we allow between the test machine's clock and the
# server's clock when checking the `exp` claim.
EXP_TOLERANCE_SECONDS = 60 * 60  # 1 hour — generous, the spec said "roughly"


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def _unique_phone() -> str:
    """+243 + 9 unique digits — keeps E.164 shape, avoids reserved ranges."""
    suffix = str(int(time.time() * 1000))[-9:]
    return f"+243{suffix}"


def _b64url_decode(seg: str) -> bytes:
    """Decode a JWT base64url segment, padding it as needed."""
    pad = "=" * (-len(seg) % 4)
    return base64.urlsafe_b64decode(seg + pad)


def _decode_jwt_payload(token: str) -> dict:
    """Decode the JWT payload without verifying the signature."""
    parts = token.split(".")
    assert len(parts) == 3, f"not a 3-part JWT: {token!r}"
    payload_bytes = _b64url_decode(parts[1])
    return json.loads(payload_bytes)


def _phone_login(session: requests.Session, phone: str | None = None) -> dict:
    """Helper to phone-login (creates user if not exists)."""
    phone = phone or _unique_phone()
    resp = session.post(
        f"{BASE_URL}/api/auth/phone-login",
        json={"phoneNumber": phone},
        timeout=20,
    )
    if resp.status_code == 429:
        pytest.skip(f"Rate-limited on /auth/phone-login: {resp.text}")
    assert resp.status_code == 200, f"phone-login failed: {resp.status_code} {resp.text}"
    data = resp.json()
    assert data.get("success") is True
    assert data.get("token")
    assert data.get("user", {}).get("id")
    data["_phone"] = phone
    return data


# ------------------------------------------------------------------
# Fixtures
# ------------------------------------------------------------------
@pytest.fixture(scope="module")
def session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def authed(session: requests.Session) -> dict:
    """One logged-in user shared across the refresh tests."""
    return _phone_login(session)


@pytest.fixture
def auth_headers(authed: dict) -> dict:
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {authed['token']}",
    }


# ------------------------------------------------------------------
# 1) Phone-login now returns a 365-day token (regression)
# ------------------------------------------------------------------
class TestPhoneLoginExpiry:
    """ACCESS_TOKEN_EXPIRE_DAYS was bumped 7 -> 365; verify the `exp` claim."""

    def test_phone_login_token_expires_in_365_days(self, authed: dict):
        payload = _decode_jwt_payload(authed["token"])

        # Required claims
        assert "exp" in payload, f"missing 'exp' in JWT payload: {payload}"
        assert "sub" in payload, f"missing 'sub' in JWT payload: {payload}"
        assert payload["sub"] == authed["user"]["id"], (
            f"sub mismatch: {payload['sub']} vs {authed['user']['id']}"
        )

        # exp ~= now + 365 days
        now = int(time.time())
        expected = now + ACCESS_TOKEN_EXPIRE_DAYS_EXPECTED * 86400
        delta = abs(int(payload["exp"]) - expected)
        assert delta <= EXP_TOLERANCE_SECONDS, (
            f"exp claim is {payload['exp']} (now+{(payload['exp']-now)/86400:.2f}d), "
            f"expected approx now+365d (={expected}); off by {delta}s"
        )


# ------------------------------------------------------------------
# 2) Refresh endpoint — auth failures
# ------------------------------------------------------------------
class TestRefreshAuthFailures:
    """POST /api/auth/refresh must reject unauthenticated callers."""

    def test_no_authorization_header_returns_401(self, session: requests.Session):
        resp = session.post(f"{BASE_URL}/api/auth/refresh", timeout=15)
        assert resp.status_code == 401, f"got {resp.status_code}: {resp.text}"
        assert "detail" in resp.json()

    def test_invalid_bearer_returns_401(self, session: requests.Session):
        resp = session.post(
            f"{BASE_URL}/api/auth/refresh",
            headers={"Authorization": "Bearer not-a-real-jwt"},
            timeout=15,
        )
        assert resp.status_code == 401, f"got {resp.status_code}: {resp.text}"
        assert "detail" in resp.json()

    def test_malformed_authorization_returns_401(self, session: requests.Session):
        # No "Bearer " prefix -> jose decode fails -> 401
        resp = session.post(
            f"{BASE_URL}/api/auth/refresh",
            headers={"Authorization": "garbage"},
            timeout=15,
        )
        assert resp.status_code == 401, f"got {resp.status_code}: {resp.text}"

    def test_empty_bearer_token_returns_401(self, session: requests.Session):
        resp = session.post(
            f"{BASE_URL}/api/auth/refresh",
            headers={"Authorization": "Bearer "},
            timeout=15,
        )
        assert resp.status_code == 401, f"got {resp.status_code}: {resp.text}"


# ------------------------------------------------------------------
# 3) Refresh endpoint — happy path
# ------------------------------------------------------------------
class TestRefreshHappyPath:

    def test_refresh_returns_expected_shape(
        self, session: requests.Session, auth_headers: dict, authed: dict
    ):
        # Sleep 1.1s so the new `exp` claim differs from the old one by at
        # least 1 second (jose encodes exp as integer-seconds — without this,
        # two calls inside the same wall-clock second produce identical JWTs).
        time.sleep(1.1)
        resp = session.post(
            f"{BASE_URL}/api/auth/refresh", headers=auth_headers, timeout=15
        )
        assert resp.status_code == 200, f"got {resp.status_code}: {resp.text}"
        body = resp.json()

        # Response shape per spec
        assert body.get("success") is True, body
        assert isinstance(body.get("token"), str) and body["token"], body
        assert isinstance(body.get("user"), dict) and body["user"], body
        assert body.get("expiresInDays") == ACCESS_TOKEN_EXPIRE_DAYS_EXPECTED, body

        # user payload sanity
        assert body["user"].get("id") == authed["user"]["id"]
        assert body["user"].get("phoneNumber") == authed["user"]["phoneNumber"]

        # New token must differ from the old one (re-signed at refresh time)
        assert body["token"] != authed["token"], (
            "Refresh returned the SAME token as the original — exp claim "
            "is integer-second precision, so two calls inside the same "
            "second collide. The 1.1s sleep before this call should have "
            "prevented that."
        )

        # The new token must itself decode to a ~365-day expiry
        new_payload = _decode_jwt_payload(body["token"])
        now = int(time.time())
        expected = now + ACCESS_TOKEN_EXPIRE_DAYS_EXPECTED * 86400
        assert abs(int(new_payload["exp"]) - expected) <= EXP_TOLERANCE_SECONDS, (
            f"refreshed token exp off by {abs(int(new_payload['exp']) - expected)}s"
        )
        assert new_payload.get("sub") == authed["user"]["id"]

        # Stash for the next test
        authed["_refreshed_token"] = body["token"]

    def test_refreshed_token_works_against_profile(
        self, session: requests.Session, authed: dict
    ):
        """The new token must be usable on a protected endpoint."""
        new_token = authed.get("_refreshed_token")
        assert new_token, "previous test should have populated _refreshed_token"

        resp = session.get(
            f"{BASE_URL}/api/auth/profile",
            headers={"Authorization": f"Bearer {new_token}"},
            timeout=15,
        )
        assert resp.status_code == 200, f"profile failed: {resp.status_code} {resp.text}"
        body = resp.json()
        assert body.get("success") is True
        assert body.get("user", {}).get("id") == authed["user"]["id"]

    def test_old_token_still_works_after_refresh(
        self, session: requests.Session, auth_headers: dict, authed: dict
    ):
        """Refresh does NOT invalidate the previous token (no blacklist).
        Documenting actual behavior — both tokens are valid until expiry.
        """
        resp = session.get(
            f"{BASE_URL}/api/auth/profile", headers=auth_headers, timeout=15
        )
        # Per current implementation old token remains valid
        assert resp.status_code == 200, (
            f"old token unexpectedly rejected after refresh: {resp.status_code} {resp.text}"
        )


# ------------------------------------------------------------------
# 4) Refresh — deleted user must get 404
# ------------------------------------------------------------------
class TestRefreshDeletedUser:
    """If the user row no longer exists but the JWT is cryptographically valid,
    /api/auth/refresh must return 404 (not 200, not 500)."""

    def test_refresh_returns_404_for_deleted_user(self, session: requests.Session):
        # 1) create a brand-new user
        data = _phone_login(session)
        token = data["token"]
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        }

        # Sanity: refresh works while user exists
        time.sleep(1.1)
        r0 = session.post(
            f"{BASE_URL}/api/auth/refresh", headers=headers, timeout=15
        )
        assert r0.status_code == 200, f"pre-delete refresh failed: {r0.status_code} {r0.text}"

        # 2) delete the user via the GDPR endpoint (keeps token signature valid)
        rdel = session.delete(
            f"{BASE_URL}/api/account/me", headers=headers, timeout=30
        )
        assert rdel.status_code == 200, (
            f"account-delete prep failed: {rdel.status_code} {rdel.text}"
        )

        # 3) refresh must now return 404 — "Utilisateur introuvable"
        r1 = session.post(
            f"{BASE_URL}/api/auth/refresh", headers=headers, timeout=15
        )
        assert r1.status_code == 404, (
            f"expected 404 after user deletion, got {r1.status_code}: {r1.text}"
        )
        body = r1.json()
        assert "detail" in body
        # Spec keeps the message in French ("Utilisateur introuvable")
        assert "introuvable" in body["detail"].lower() or "not found" in body["detail"].lower(), (
            f"unexpected detail message: {body['detail']!r}"
        )


# ------------------------------------------------------------------
# 5) Regression — other protected endpoints still work with new 365-day JWT
# ------------------------------------------------------------------
class TestRegressionWithLongLivedJwt:
    """Make sure bumping ACCESS_TOKEN_EXPIRE_DAYS to 365 didn't break
    unrelated protected endpoints (notes/products/profile)."""

    def test_profile_with_new_token(self, session: requests.Session, auth_headers: dict, authed: dict):
        resp = session.get(
            f"{BASE_URL}/api/auth/profile", headers=auth_headers, timeout=15
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body.get("success") is True
        assert body["user"]["id"] == authed["user"]["id"]

    def test_get_notes_with_new_token(self, session: requests.Session, auth_headers: dict):
        resp = session.get(
            f"{BASE_URL}/api/data/notes", headers=auth_headers, timeout=15
        )
        assert resp.status_code == 200, resp.text
        assert isinstance(resp.json(), list)

    def test_get_products_with_new_token(self, session: requests.Session, auth_headers: dict):
        resp = session.get(
            f"{BASE_URL}/api/data/products", headers=auth_headers, timeout=15
        )
        assert resp.status_code == 200, resp.text
        assert isinstance(resp.json(), list)


# ------------------------------------------------------------------
# 6) Cleanup — purge the shared test user via GDPR delete
# ------------------------------------------------------------------
@pytest.fixture(scope="module", autouse=True)
def _cleanup_user(authed, session):
    """Best-effort cleanup: delete the shared module-scoped test user after
    all tests in this module have finished. Yields so cleanup runs at teardown.
    """
    yield
    try:
        token = authed.get("_refreshed_token") or authed.get("token")
        if not token:
            return
        session.delete(
            f"{BASE_URL}/api/account/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=20,
        )
    except Exception:
        pass
