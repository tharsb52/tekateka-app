"""
Iteration 7: PIN login (lockout) + ambassador self-signup / approval / 7-day rule / forgot password.
"""
import os
import uuid
from datetime import datetime, timedelta

import pytest
import requests
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


# --- PIN login (throwaway user) ---
@pytest.fixture(scope="module")
def pin_user(s):
    email = f"test_pin_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{BASE_URL}/api/auth/email-signup",
               json={"email": email, "password": "TestPass123", "name": "TEST_PinUser"}, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    r2 = s.post(f"{BASE_URL}/api/auth/setup-pin", json={"pin": "4321"},
                headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    assert r2.status_code == 200, r2.text
    yield {"email": email, "token": tok}
    s.delete(f"{BASE_URL}/api/account/me", headers={"Authorization": f"Bearer {tok}"}, timeout=30)


class TestPinLogin:
    def test_pin_login_ok(self, s, pin_user):
        r = s.post(f"{BASE_URL}/api/auth/login-pin", json={"identifier": pin_user["email"], "pin": "4321"})
        assert r.status_code == 200, r.text
        assert r.json()["token"] and r.json()["user"]["email"] == pin_user["email"]

    def test_pin_login_uppercase_email(self, s, pin_user):
        r = s.post(f"{BASE_URL}/api/auth/login-pin", json={"identifier": pin_user["email"].upper(), "pin": "4321"})
        assert r.status_code == 200, r.text

    def test_wrong_pin_401_message(self, s, pin_user):
        r = s.post(f"{BASE_URL}/api/auth/login-pin", json={"identifier": pin_user["email"], "pin": "0000"})
        assert r.status_code == 401
        assert r.json()["detail"] == "Identifiant ou PIN incorrect"

    def test_unknown_user_generic(self, s):
        r = s.post(f"{BASE_URL}/api/auth/login-pin", json={"identifier": "nobody_x@example.com", "pin": "1234"})
        assert r.status_code == 401 and r.json()["detail"] == "Identifiant ou PIN incorrect"

    def test_five_wrong_then_locked_429(self, s, pin_user):
        # one wrong already done above -> reset by a good login first
        s.post(f"{BASE_URL}/api/auth/login-pin", json={"identifier": pin_user["email"], "pin": "4321"})
        codes = [s.post(f"{BASE_URL}/api/auth/login-pin",
                        json={"identifier": pin_user["email"], "pin": "0000"}).status_code for _ in range(5)]
        assert codes == [401] * 5, codes
        r = s.post(f"{BASE_URL}/api/auth/login-pin", json={"identifier": pin_user["email"], "pin": "4321"})
        assert r.status_code == 429, r.text
        assert "Trop d'essais" in r.json()["detail"]
        u = mdb.users.find_one({"email": pin_user["email"]})
        assert u.get("pinLockedUntil") is not None


# --- Ambassador self-signup ---
@pytest.fixture(scope="module")
def amb(s):
    email = f"test_amb_{uuid.uuid4().hex[:8]}@example.com"
    body = {"name": "TEST_Amb", "email": email, "country": "RDC", "city": "Kinshasa",
            "phone": "+243999000111", "password": "AmbPass123"}
    r = s.post(f"{BASE_URL}/api/ambassador/register", json=body, timeout=30)
    assert r.status_code == 200, r.text
    doc = mdb.ambassadors.find_one({"email": email})
    assert doc is not None
    yield {"email": email, "password": "AmbPass123", "id": str(doc["_id"]), "reg": r.json()}
    s.post(f"{BASE_URL}/api/admin/ambassadors/delete", json={"adminPassword": ADMIN_PW, "ambassadorId": str(doc["_id"])})
    mdb.ambassadors.delete_one({"_id": doc["_id"]})


def login(s, a):
    return s.post(f"{BASE_URL}/api/ambassador/login", json={"email": a["email"], "password": a["password"]})


class TestAmbassadorFlow:
    def test_register_pending(self, amb):
        assert amb["reg"]["success"] is True and "attente" in amb["reg"]["message"]
        assert mdb.ambassadors.find_one({"email": amb["email"]})["status"] == "pending"

    def test_register_duplicate_400(self, s, amb):
        r = s.post(f"{BASE_URL}/api/ambassador/register", json={"name": "TEST_x", "email": amb["email"].upper(),
                   "country": "RDC", "city": "K", "password": "AmbPass123"})
        assert r.status_code == 400

    def test_register_validation(self, s):
        r = s.post(f"{BASE_URL}/api/ambassador/register", json={"name": "TEST_x", "email": "bad", "country": "R",
                   "city": "K", "password": "AmbPass123"})
        assert r.status_code == 400
        r = s.post(f"{BASE_URL}/api/ambassador/register", json={"name": "TEST_x"})
        assert r.status_code == 400

    def test_pending_login_403(self, s, amb):
        r = login(s, amb)
        assert r.status_code == 403 and "en attente de validation" in r.json()["detail"]

    def test_admin_panel_lists_pending(self, s, amb):
        r = s.post(f"{BASE_URL}/api/admin/ambassadors/list", json={"adminPassword": ADMIN_PW})
        assert r.status_code == 200
        r2 = s.get(f"{BASE_URL}/api/admin/ambassador-panel")
        assert r2.status_code == 200 and "En attente" in r2.text and "Valider" in r2.text

    def test_approve_wrong_pw_401(self, s, amb):
        r = s.post(f"{BASE_URL}/api/admin/ambassadors/approve", json={"adminPassword": "nope", "ambassadorId": amb["id"]})
        assert r.status_code == 401

    def test_approve_then_login(self, s, amb):
        r = s.post(f"{BASE_URL}/api/admin/ambassadors/approve", json={"adminPassword": ADMIN_PW, "ambassadorId": amb["id"]})
        assert r.status_code == 200, r.text
        d = mdb.ambassadors.find_one({"email": amb["email"]})
        assert d["status"] == "active" and d.get("approvedAt")
        r2 = login(s, amb)
        assert r2.status_code == 200 and r2.json()["token"]
        r3 = s.post(f"{BASE_URL}/api/admin/ambassadors/approve", json={"adminPassword": ADMIN_PW, "ambassadorId": amb["id"]})
        assert r3.status_code == 400

    def test_blocked_after_7_days_no_codes(self, s, amb):
        mdb.ambassadors.update_one({"email": amb["email"]}, {"$set": {"approvedAt": datetime.utcnow() - timedelta(days=8)}})
        r = login(s, amb)
        assert r.status_code == 403, r.text
        assert r.json()["detail"].startswith("Compte bloqué : aucun code acheté")
        d = mdb.ambassadors.find_one({"email": amb["email"]})
        assert d["status"] == "blocked" and d["blockedReason"] == "no_purchase"

    def test_admin_unblock_permanent(self, s, amb):
        r = s.post(f"{BASE_URL}/api/admin/ambassadors/toggle-status", json={"adminPassword": ADMIN_PW, "ambassadorId": amb["id"]})
        assert r.status_code == 200 and r.json() == {"success": True, "newStatus": "active"}
        for _ in range(2):
            r2 = login(s, amb)
            assert r2.status_code == 200, r2.text
        d = mdb.ambassadors.find_one({"email": amb["email"]})
        assert d["status"] == "active" and d.get("noPurchaseRuleWaived") is True

    def test_forgot_and_reset_invalid_code(self, s, amb):
        r = s.post(f"{BASE_URL}/api/ambassador/forgot-password", json={"email": amb["email"]})
        assert r.status_code == 200 and r.json()["success"] is True
        d = mdb.ambassadors.find_one({"email": amb["email"]})
        assert d.get("resetCodeHash") and len(d["resetCodeHash"]) == 64
        r2 = s.post(f"{BASE_URL}/api/ambassador/reset-password",
                    json={"email": amb["email"], "code": "000000", "newPassword": "NewPass123"})
        assert r2.status_code == 400 and "Code invalide" in r2.json()["detail"]
        r3 = s.post(f"{BASE_URL}/api/ambassador/forgot-password", json={"email": "unknown_zz@example.com"})
        assert r3.status_code == 200  # generic
        assert login(s, amb).status_code == 200  # old password still valid
