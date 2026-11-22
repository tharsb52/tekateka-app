"""Integration tests (public URL) for the subscription extension rule:
new_expiry = max(current_expiry, now) + plan_days, for activation-code, ambassador
activation, Stripe idempotency + regressions (profile, write guard, admin grant-premium).
Run: pytest tests/test_subscription_extension_api.py -v
"""
import os
import uuid
import concurrent.futures
from datetime import datetime, timedelta

import pytest
import requests
from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(HERE, ".env"))
load_dotenv(os.path.join(os.path.dirname(HERE), "frontend", ".env"))

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_PW = "Ndinemakutamillions82@"  # from /app/memory/test_credentials.md
TOL = 180  # seconds tolerance

mdb = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
CREATED_USERS, CREATED_NOTES, CREATED_PAYMENTS = [], [], []


def iso(dt):
    return dt.isoformat() + "Z"


def parse(v):
    return datetime.fromisoformat(str(v).replace("Z", "")) if v else None


def close(a, b, tol=TOL):
    return abs((a - b).total_seconds()) < tol


def new_user():
    email = f"test_ext_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/email-signup", json={"email": email, "password": "Test1234!", "name": "TEST_Ext"})
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    uid = r.json()["user"]["id"]
    CREATED_USERS.append(uid)
    r = requests.post(f"{API}/auth/setup-pin", json={"pin": "4321"}, headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200, r.text
    r = requests.post(f"{API}/auth/login-pin", json={"identifier": email, "pin": "4321"})
    assert r.status_code == 200, r.text
    return uid, r.json()["token"]


def set_sub(uid, sub):
    mdb.users.update_one({"_id": ObjectId(uid)}, {"$set": {"subscription": sub}})


def get_sub(uid):
    return mdb.users.find_one({"_id": ObjectId(uid)}).get("subscription") or {}


@pytest.fixture(scope="module")
def amb():
    mdb.login_lockouts.delete_many({})
    email = f"test_amb_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/admin/ambassadors/create", json={
        "adminPassword": ADMIN_PW, "name": "TEST_Amb", "country": "CD", "city": "Kin",
        "email": email, "ambassadorPassword": "Amb12345!", "phone": "+243000000"})
    assert r.status_code == 200, r.text
    amb_id = r.json()["ambassador"]["id"]
    r = requests.post(f"{API}/ambassador/login", json={"email": email, "password": "Amb12345!"})
    assert r.status_code == 200, r.text
    yield {"id": amb_id, "token": r.json()["token"]}
    # teardown: only what we created
    mdb.activation_codes.delete_many({"ambassadorId": amb_id})
    mdb.ambassador_sales.delete_many({"ambassadorId": amb_id})
    mdb.commissions.delete_many({"ambassadorId": amb_id})
    mdb.ambassadors.delete_one({"_id": ObjectId(amb_id)})
    for n in CREATED_NOTES:
        mdb.notes.delete_one({"_id": ObjectId(n)})
    for p in CREATED_PAYMENTS:
        mdb.payments.delete_one({"_id": p})
    for u in CREATED_USERS:
        mdb.users.delete_one({"_id": ObjectId(u)})
    mdb.login_lockouts.delete_many({})


def gen_code(amb, plan="monthly", count=1):
    r = requests.post(f"{API}/admin/codes/generate", json={
        "adminPassword": ADMIN_PW, "count": count, "plan": plan, "ambassadorId": amb["id"]})
    assert r.status_code == 200, r.text
    return r.json()["codes"]


def activate(tok, code):
    return requests.post(f"{API}/subscription/activate-code", json={"code": code},
                         headers={"Authorization": f"Bearer {tok}"})


# ---------- Client activation by code ----------
class TestActivateCode:
    def test_active_40d_plus_monthly_gives_70d(self, amb):
        uid, tok = new_user()
        now = datetime.utcnow()
        set_sub(uid, {"plan": "quarterly", "status": "active", "expiresAt": iso(now + timedelta(days=40)),
                      "expiryDate": (now + timedelta(days=40)).isoformat()})
        code = gen_code(amb)[0]
        r = activate(tok, code)
        assert r.status_code == 200, r.text
        sub = get_sub(uid)
        assert sub["expiresAt"] == sub["expiryDate"]
        assert close(parse(sub["expiresAt"]), now + timedelta(days=70)), sub
        assert close(parse(r.json()["subscription"]["expiryDate"]), parse(sub["expiresAt"]), 2)
        assert sub["status"] == "active" and sub["plan"] == "monthly"
        c = mdb.activation_codes.find_one({"code": code})
        assert c["status"] == "used" and c["usedByUserId"] == uid
        assert mdb.commissions.find_one({"code": code}) is not None
        assert mdb.ambassador_sales.find_one({"activationCode": code}) is not None
        # regression: profile shows the active subscription
        p = requests.get(f"{API}/auth/profile", headers={"Authorization": f"Bearer {tok}"})
        assert p.status_code == 200
        psub = p.json()["user"]["subscription"]
        assert psub["status"] == "active" and psub["expiresAt"] == sub["expiresAt"]
        u = mdb.users.find_one({"_id": ObjectId(uid)})
        assert u["isSubscribed"] is True and u["subscriptionEndDate"] == sub["expiresAt"]
        # reuse of the same code refused and does not extend again
        r2 = activate(tok, code)
        assert r2.status_code == 400
        assert get_sub(uid)["expiresAt"] == sub["expiresAt"]

    def test_expired_plus_monthly_starts_from_now(self, amb):
        uid, tok = new_user()
        now = datetime.utcnow()
        set_sub(uid, {"plan": "monthly", "status": "active", "expiresAt": iso(now - timedelta(days=10))})
        r = activate(tok, gen_code(amb)[0])
        assert r.status_code == 200, r.text
        assert close(parse(get_sub(uid)["expiresAt"]), now + timedelta(days=30))

    def test_fresh_email_signup_user(self, amb):
        uid, tok = new_user()  # email-signup stores no subscription object
        now = datetime.utcnow()
        r = activate(tok, gen_code(amb)[0])
        assert r.status_code == 200, r.text
        # implicit 7-day trial (createdAt + 7) is still running -> trial end + 30
        assert close(parse(get_sub(uid)["expiresAt"]), now + timedelta(days=37))

    def test_trial_user_trial_expiry_plus_30(self, amb):
        uid, tok = new_user()
        now = datetime.utcnow()
        t_end = iso(now + timedelta(days=5))
        set_sub(uid, {"plan": "trial", "status": "trial", "trialEndsAt": t_end, "expiresAt": t_end})
        r = activate(tok, gen_code(amb)[0])
        assert r.status_code == 200, r.text
        assert close(parse(get_sub(uid)["expiresAt"]), now + timedelta(days=35))

    def test_quarterly_code_on_active_sub(self, amb):
        uid, tok = new_user()
        now = datetime.utcnow()
        set_sub(uid, {"plan": "monthly", "status": "active", "expiresAt": iso(now + timedelta(days=10))})
        r = activate(tok, gen_code(amb, "quarterly")[0])
        assert r.status_code == 200, r.text
        assert close(parse(get_sub(uid)["expiresAt"]), now + timedelta(days=100))

    def test_concurrent_two_codes_both_count(self, amb):
        uid, tok = new_user()
        now = datetime.utcnow()
        set_sub(uid, {"plan": "quarterly", "status": "active", "expiresAt": iso(now + timedelta(days=40))})
        codes = gen_code(amb, count=2)
        with concurrent.futures.ThreadPoolExecutor(2) as ex:
            res = list(ex.map(lambda c: activate(tok, c), codes))
        assert all(r.status_code == 200 for r in res), [r.text for r in res]
        assert close(parse(get_sub(uid)["expiresAt"]), now + timedelta(days=100))

    def test_no_auth_401(self, amb):
        r = requests.post(f"{API}/subscription/activate-code", json={"code": "TK-AAAA-BBBB"})
        assert r.status_code == 401


# ---------- Ambassador direct / QR activation ----------
class TestAmbassadorActivate:
    def test_active_sub_plus_quarterly(self, amb):
        uid, _ = new_user()
        now = datetime.utcnow()
        set_sub(uid, {"plan": "quarterly", "status": "active", "expiresAt": iso(now + timedelta(days=40))})
        code = gen_code(amb, "quarterly")[0]
        r = requests.post(f"{API}/ambassador/activate", json={"token": amb["token"], "clientUserId": uid, "plan": "quarterly"})
        assert r.status_code == 200, r.text
        sub = get_sub(uid)
        assert close(parse(sub["expiresAt"]), now + timedelta(days=130))
        assert sub["expiresAt"] == sub["expiryDate"]
        assert close(parse(r.json()["subscription"]["expiryDate"]), parse(sub["expiresAt"]), 2)
        assert r.json()["code"] == code
        assert mdb.activation_codes.find_one({"code": code})["status"] == "used"
        assert mdb.commissions.find_one({"code": code, "clientId": uid}) is not None
        assert mdb.ambassador_sales.find_one({"activationCode": code, "clientUserId": uid}) is not None

    def test_expired_sub_monthly_from_now(self, amb):
        uid, _ = new_user()
        now = datetime.utcnow()
        set_sub(uid, {"plan": "monthly", "status": "active", "expiresAt": iso(now - timedelta(days=10))})
        gen_code(amb, "monthly")
        r = requests.post(f"{API}/ambassador/activate", json={"token": amb["token"], "clientUserId": uid, "plan": "monthly"})
        assert r.status_code == 200, r.text
        assert close(parse(get_sub(uid)["expiresAt"]), now + timedelta(days=30))

    def test_no_code_available_404(self, amb):
        uid, _ = new_user()
        r = requests.post(f"{API}/ambassador/activate", json={"token": amb["token"], "clientUserId": uid, "plan": "yearly"})
        assert r.status_code == 404
        assert get_sub(uid) == {}


# ---------- Stripe idempotency ----------
class TestStripe:
    def test_status_poll_completed_payment_no_extension(self, amb):
        uid, tok = new_user()
        now = datetime.utcnow()
        exp = iso(now + timedelta(days=40))
        set_sub(uid, {"plan": "quarterly", "status": "active", "expiresAt": exp})
        sid = f"cs_test_TEST_{uuid.uuid4().hex[:10]}"
        pid = mdb.payments.insert_one({"userId": uid, "buyerId": uid, "buyerKind": "user", "type": "subscription",
                                       "plan": "monthly", "status": "completed", "stripeSessionId": sid}).inserted_id
        CREATED_PAYMENTS.append(pid)
        for _ in range(3):
            r = requests.get(f"{API}/payments/stripe/session/{sid}", headers={"Authorization": f"Bearer {tok}"})
            assert r.status_code == 200, r.text
            assert r.json()["status"] == "completed"
        assert get_sub(uid)["expiresAt"] == exp

    def test_status_poll_other_user_404(self, amb):
        uid, tok = new_user()
        sid = f"cs_test_TEST_{uuid.uuid4().hex[:10]}"
        pid = mdb.payments.insert_one({"userId": str(ObjectId()), "type": "subscription", "plan": "monthly",
                                       "status": "completed", "stripeSessionId": sid}).inserted_id
        CREATED_PAYMENTS.append(pid)
        r = requests.get(f"{API}/payments/stripe/session/{sid}", headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 404

    def test_webhook_without_signature_refused(self):
        r = requests.post(f"{API}/payments/stripe/webhook", data=b'{"type":"checkout.session.completed"}',
                          headers={"Content-Type": "application/json"})
        assert r.status_code in (400, 503), r.text


# ---------- Regressions ----------
class TestRegression:
    def test_write_guard_expired_then_active(self, amb):
        uid, tok = new_user()
        h = {"Authorization": f"Bearer {tok}"}
        now = datetime.utcnow()
        set_sub(uid, {"plan": "monthly", "status": "active", "expiresAt": iso(now - timedelta(days=10))})
        r = requests.post(f"{API}/data/notes", json={"title": "TEST_note", "content": "x"}, headers=h)
        assert r.status_code == 402, r.text
        assert activate(tok, gen_code(amb)[0]).status_code == 200
        r = requests.post(f"{API}/data/notes", json={"title": "TEST_note", "content": "x"}, headers=h)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        nid = body.get("id") or (body.get("note") or {}).get("id")
        if nid:
            CREATED_NOTES.append(nid)

    def test_admin_grant_premium_unchanged_now_plus_days(self, amb):
        uid, tok = new_user()
        now = datetime.utcnow()
        set_sub(uid, {"plan": "quarterly", "status": "active", "expiresAt": iso(now + timedelta(days=40))})
        r = requests.post(f"{API}/admin/user/{uid}/grant-premium", json={"password": ADMIN_PW, "days": 30, "plan": "monthly"})
        assert r.status_code == 200, r.text
        sub = get_sub(uid)
        assert close(parse(sub["expiresAt"]), now + timedelta(days=30))
        assert sub["status"] == "active"
