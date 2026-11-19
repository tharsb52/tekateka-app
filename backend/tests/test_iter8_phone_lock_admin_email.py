"""
Iteration 8: phone-login disabled (410), admin set-email, ambassador pending toggle guard + forgot-password anti-spam.
"""
import os
import uuid

import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
ADMIN_PW = os.environ.get("ADMIN_PASSWORD")
mdb = MongoClient(os.environ.get("MONGO_URL"))[os.environ.get("DB_NAME")]


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# --- Security: phone-login closed ---
class TestPhoneLoginDisabled:
    @pytest.mark.parametrize("payload", [
        {"phoneNumber": "+243111000111"},
        {"phoneNumber": "+243999888777"},
    ])
    def test_phone_login_410(self, s, payload):
        r = s.post(f"{BASE_URL}/api/auth/phone-login", json=payload, timeout=30)
        assert r.status_code in (410, 429), r.text  # 429 = per-IP login limiter (also no token)
        assert "token" not in r.text
        assert "email" in r.json()["detail"]

    def test_phone_login_query_param_410(self, s):
        r = s.post(f"{BASE_URL}/api/auth/phone-login?phoneNumber=%2B243111000111", timeout=30)
        assert r.status_code in (410, 422, 429), r.text
        assert "token" not in r.text


# --- Admin set-email for phone-only merchants ---
@pytest.fixture(scope="module")
def throwaway(s):
    email = f"test_setemail_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{BASE_URL}/api/auth/email-signup",
               json={"email": email, "password": "TestPass123", "name": "TEST_SetEmail"}, timeout=30)
    assert r.status_code == 200, r.text
    doc = mdb.users.find_one({"email": email})
    state = {"id": str(doc["_id"]), "email": email}
    yield state
    mdb.users.delete_one({"_id": ObjectId(state["id"])})


class TestAdminSetEmail:
    def test_wrong_admin_pw_401(self, s, throwaway):
        r = s.post(f"{BASE_URL}/api/admin/user/{throwaway['id']}/set-email",
                   json={"password": "nope", "email": "x_test@example.com", "newPassword": "Abcdef1"})
        assert r.status_code == 401

    def test_invalid_email_and_short_pw_400(self, s, throwaway):
        r = s.post(f"{BASE_URL}/api/admin/user/{throwaway['id']}/set-email",
                   json={"password": ADMIN_PW, "email": "bad", "newPassword": "Abcdef1"})
        assert r.status_code == 400
        r = s.post(f"{BASE_URL}/api/admin/user/{throwaway['id']}/set-email",
                   json={"password": ADMIN_PW, "email": "ok_test@example.com", "newPassword": "123"})
        assert r.status_code == 400

    def test_duplicate_email_400(self, s, throwaway):
        r = s.post(f"{BASE_URL}/api/admin/user/{throwaway['id']}/set-email",
                   json={"password": ADMIN_PW, "email": "test@tekateka.com", "newPassword": "Abcdef12"})
        assert r.status_code == 400 and "déjà utilisé" in r.json()["detail"]
        # test@ untouched
        assert mdb.users.find_one({"email": "test@tekateka.com"}) is not None

    def test_set_email_then_credential_login(self, s, throwaway):
        new_email = f"test_newmail_{uuid.uuid4().hex[:8]}@example.com"
        r = s.post(f"{BASE_URL}/api/admin/user/{throwaway['id']}/set-email",
                   json={"password": ADMIN_PW, "email": new_email.upper(), "newPassword": "NewPass789"})
        assert r.status_code == 200, r.text
        assert r.json() == {"success": True, "email": new_email}
        throwaway["email"] = new_email
        assert mdb.users.find_one({"_id": ObjectId(throwaway["id"])})["email"] == new_email
        r2 = s.post(f"{BASE_URL}/api/auth/credential-login", json={"identifier": new_email, "password": "NewPass789"})
        assert r2.status_code == 200, r2.text
        assert r2.json().get("token")
        r3 = s.post(f"{BASE_URL}/api/auth/credential-login", json={"identifier": new_email, "password": "TestPass123"})
        assert r3.status_code in (401, 429)  # never 200 with old password

    def test_unknown_user_404(self, s):
        r = s.post(f"{BASE_URL}/api/admin/user/{str(ObjectId())}/set-email",
                   json={"password": ADMIN_PW, "email": f"z_{uuid.uuid4().hex[:6]}@example.com", "newPassword": "Abcdef12"})
        assert r.status_code == 404

    def test_malformed_user_id_not_500(self, s):
        r = s.post(f"{BASE_URL}/api/admin/user/not-an-id/set-email",
                   json={"password": ADMIN_PW, "email": f"z_{uuid.uuid4().hex[:6]}@example.com", "newPassword": "Abcdef12"})
        assert r.status_code in (400, 404), f"{r.status_code} {r.text[:200]}"

    def test_admin_panel_html_has_section(self, s):
        r = s.get(f"{BASE_URL}/api/admin")
        assert r.status_code == 200
        assert "Connexion par email" in r.text and "set-email" in r.text


# --- Ambassador: pending toggle guard + forgot anti-spam ---
@pytest.fixture(scope="module")
def amb(s):
    email = f"test_amb8_{uuid.uuid4().hex[:8]}@example.com"
    body = {"name": "TEST_Amb8", "email": email, "country": "RDC", "city": "Kinshasa",
            "phone": "+243999000112", "password": "AmbPass123"}
    r = s.post(f"{BASE_URL}/api/ambassador/register", json=body, timeout=30)
    assert r.status_code == 200, r.text
    doc = mdb.ambassadors.find_one({"email": email})
    yield {"email": email, "id": str(doc["_id"])}
    mdb.ambassadors.delete_one({"_id": doc["_id"]})


class TestAmbassadorGuards:
    def test_toggle_pending_400(self, s, amb):
        r = s.post(f"{BASE_URL}/api/admin/ambassadors/toggle-status",
                   json={"adminPassword": ADMIN_PW, "ambassadorId": amb["id"]})
        assert r.status_code == 400, r.text
        assert "Valider" in r.json()["detail"]
        assert mdb.ambassadors.find_one({"email": amb["email"]})["status"] == "pending"

    def test_forgot_twice_single_code(self, s, amb):
        r1 = s.post(f"{BASE_URL}/api/ambassador/forgot-password", json={"email": amb["email"]})
        assert r1.status_code == 200 and r1.json()["success"] is True
        d1 = mdb.ambassadors.find_one({"email": amb["email"]})
        r2 = s.post(f"{BASE_URL}/api/ambassador/forgot-password", json={"email": amb["email"].upper()})
        assert r2.status_code == 200 and r2.json() == r1.json()
        d2 = mdb.ambassadors.find_one({"email": amb["email"]})
        assert d1["resetCodeExpiresAt"] == d2["resetCodeExpiresAt"]
        assert d1["resetCodeHash"] == d2["resetCodeHash"]


# --- Admin HTML panels: inline JS must parse (a raw "\n" in the Python string broke the whole panel) ---
@pytest.mark.parametrize("path", ["/api/admin", "/api/admin/ambassador-panel"])
def test_admin_panel_js_parses(s, path, tmp_path):
    import re, shutil, subprocess
    if not shutil.which("node"):
        pytest.skip("node not installed")
    html = s.get(f"{BASE_URL}{path}", timeout=30).text
    js = "\n".join(re.findall(r"<script>(.*?)</script>", html, re.S))
    f = tmp_path / "panel.js"
    f.write_text(js)
    res = subprocess.run(["node", "--check", str(f)], capture_output=True, text=True)
    assert res.returncode == 0, res.stderr[:500]


# --- Iter9: admin panel must HTML-escape merchant data (stored XSS guard) ---
def test_admin_panel_escapes_merchant_data(s):
    import re
    html = s.get(f"{BASE_URL}/api/admin", timeout=30).text
    raw = re.findall(r"\$\{(?:p\.name|dd\.name|dd\.debtorName|dd\.userPhone|s\.productName|u\.phone|d\.email|phone)\}", html)
    assert raw == [], f"unescaped interpolations: {raw}"
