"""
Backend tests for TekaTeka:
  TEST 1 — Admin reset ambassador password
  TEST 2 — Ambassador self-service change password
  TEST 3 — Cumulative subscription expiry on code activation (CUMUL)
  TEST 4 — Cumulative subscription expiry on Stripe webhook (code review)
"""
import os
import sys
import time
import asyncio
import requests
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

BACKEND_URL = "https://low-data-shop.preview.emergentagent.com/api"
ADMIN_PASSWORD = "Ndinemakutamillions82@"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

results = []


def log(name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {name}: {detail}")
    results.append((name, passed, detail))


def parse_iso(s):
    if not s:
        return None
    return datetime.fromisoformat(str(s).replace("Z", "+00:00")).replace(tzinfo=None)


async def _delete_ambassador(email):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    try:
        res = await db.ambassadors.delete_one({"email": email})
        return res.deleted_count
    finally:
        client.close()


def test1_reset_password():
    print("\n=== TEST 1: Admin reset ambassador password ===")
    email = "resetpwd-test@tekateka.com"
    # pre-clean
    asyncio.run(_delete_ambassador(email))
    r = requests.post(f"{BACKEND_URL}/admin/ambassadors/create", json={
        "adminPassword": ADMIN_PASSWORD,
        "name": "Test Reset",
        "email": email,
        "country": "Congo",
        "city": "Kinshasa",
        "ambassadorPassword": "OldPass123",
    })
    if r.status_code != 200:
        log("T1.create_ambassador", False, f"{r.status_code} {r.text[:200]}")
        return None
    data = r.json()
    amb_id = data.get("ambassadorId") or data.get("id") or data.get("_id")
    if not amb_id and isinstance(data.get("ambassador"), dict):
        amb_id = data["ambassador"].get("id") or data["ambassador"].get("_id")
    if not amb_id:
        rlist = requests.post(f"{BACKEND_URL}/admin/ambassadors/list", json={"adminPassword": ADMIN_PASSWORD})
        for a in rlist.json().get("ambassadors", []):
            if a.get("email") == email:
                amb_id = a.get("id") or a.get("_id")
                break
    log("T1.create_ambassador", bool(amb_id), f"id={amb_id} resp={data}")
    if not amb_id:
        return None

    r = requests.post(f"{BACKEND_URL}/ambassador/login", json={"email": email, "password": "OldPass123"})
    log("T1.login_old_pw_works", r.status_code == 200 and "token" in r.json(), f"{r.status_code}")

    r = requests.post(f"{BACKEND_URL}/admin/ambassadors/reset-password", json={
        "adminPassword": ADMIN_PASSWORD, "ambassadorId": amb_id, "newPassword": "NewPass456",
    })
    log("T1.reset_password_ok", r.status_code == 200 and r.json().get("success"), f"{r.status_code} {r.text[:120]}")

    r = requests.post(f"{BACKEND_URL}/ambassador/login", json={"email": email, "password": "OldPass123"})
    log("T1.old_pw_rejected_401", r.status_code == 401, f"{r.status_code} {r.text[:120]}")

    r = requests.post(f"{BACKEND_URL}/ambassador/login", json={"email": email, "password": "NewPass456"})
    log("T1.new_pw_works", r.status_code == 200 and "token" in r.json(), f"{r.status_code}")

    r = requests.post(f"{BACKEND_URL}/admin/ambassadors/reset-password", json={
        "adminPassword": "WRONG", "ambassadorId": amb_id, "newPassword": "AnotherPass123",
    })
    log("T1.wrong_admin_pw_401", r.status_code == 401, f"{r.status_code} {r.text[:120]}")

    r = requests.post(f"{BACKEND_URL}/admin/ambassadors/reset-password", json={
        "adminPassword": ADMIN_PASSWORD, "ambassadorId": amb_id, "newPassword": "abc",
    })
    ok = r.status_code == 400 and "6" in r.text
    log("T1.short_pw_400", ok, f"{r.status_code} {r.text[:120]}")

    r = requests.post(f"{BACKEND_URL}/admin/ambassadors/reset-password", json={
        "adminPassword": ADMIN_PASSWORD, "ambassadorId": "000000000000000000000000", "newPassword": "SomePass99",
    })
    log("T1.nonexistent_id_404", r.status_code == 404, f"{r.status_code} {r.text[:120]}")

    r = requests.post(f"{BACKEND_URL}/admin/ambassadors/reset-password", json={
        "adminPassword": ADMIN_PASSWORD, "ambassadorId": "notanid", "newPassword": "SomePass99",
    })
    log("T1.invalid_id_400", r.status_code == 400, f"{r.status_code} {r.text[:120]}")

    return amb_id


def test2_change_password(amb_id):
    print("\n=== TEST 2: Ambassador change own password ===")
    email = "resetpwd-test@tekateka.com"
    r = requests.post(f"{BACKEND_URL}/ambassador/login", json={"email": email, "password": "NewPass456"})
    token = r.json().get("token") if r.status_code == 200 else None
    log("T2.login_get_token", bool(token), f"{r.status_code}")
    if not token:
        return None

    r = requests.post(f"{BACKEND_URL}/ambassador/profile/change-password", json={
        "token": token, "currentPassword": "NewPass456", "newPassword": "SelfNew789",
    })
    log("T2.change_password_ok", r.status_code == 200 and r.json().get("success"), f"{r.status_code} {r.text[:120]}")

    r = requests.post(f"{BACKEND_URL}/ambassador/login", json={"email": email, "password": "SelfNew789"})
    new_token = r.json().get("token") if r.status_code == 200 else None
    log("T2.new_pw_login", bool(new_token), f"{r.status_code}")

    r = requests.post(f"{BACKEND_URL}/ambassador/login", json={"email": email, "password": "NewPass456"})
    log("T2.old_pw_rejected", r.status_code == 401, f"{r.status_code}")

    r = requests.post(f"{BACKEND_URL}/ambassador/profile/change-password", json={
        "token": "", "currentPassword": "SelfNew789", "newPassword": "Whatever123",
    })
    log("T2.empty_token_401", r.status_code == 401, f"{r.status_code} {r.text[:120]}")

    r = requests.post(f"{BACKEND_URL}/ambassador/profile/change-password", json={
        "token": "bad-token", "currentPassword": "SelfNew789", "newPassword": "Whatever123",
    })
    log("T2.invalid_jwt_401", r.status_code == 401, f"{r.status_code} {r.text[:120]}")

    r = requests.post(f"{BACKEND_URL}/ambassador/profile/change-password", json={
        "token": new_token, "currentPassword": "WRONG_CURRENT", "newPassword": "Whatever123",
    })
    ok = r.status_code == 401 and "actuel" in r.text.lower()
    log("T2.wrong_currentpw_401", ok, f"{r.status_code} {r.text[:200]}")

    r = requests.post(f"{BACKEND_URL}/ambassador/profile/change-password", json={
        "token": new_token, "currentPassword": "SelfNew789", "newPassword": "abc",
    })
    log("T2.short_newpw_400", r.status_code == 400, f"{r.status_code} {r.text[:120]}")

    return new_token


async def test3_cumul(amb_id):
    print("\n=== TEST 3: Cumulative subscription expiry on activation ===")
    if not amb_id:
        log("T3.precondition", False, "missing amb_id")
        return

    r = requests.post(f"{BACKEND_URL}/admin/codes/generate", json={
        "adminPassword": ADMIN_PASSWORD,
        "ambassadorId": amb_id,
        "count": 2,
        "plan": "monthly",
    })
    if r.status_code != 200:
        log("T3.generate_codes", False, f"{r.status_code} {r.text[:200]}")
        return
    codes = r.json().get("codes", [])
    log("T3.generate_codes", len(codes) == 2, f"codes={codes}")
    if len(codes) < 2:
        return

    test_phone = f"+243700{int(time.time()) % 1000000:06d}"
    rp = requests.post(f"{BACKEND_URL}/auth/phone-login", json={"phoneNumber": test_phone})
    if rp.status_code != 200:
        log("T3.create_user", False, f"{rp.status_code} {rp.text[:200]}")
        return
    user_obj = rp.json().get("user", {})
    user_id = user_obj.get("id") or user_obj.get("_id")
    log("T3.create_user", bool(user_id), f"user_id={user_id}")
    if not user_id:
        return

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    try:
        pre = await db.users.find_one({"_id": ObjectId(user_id)})
        pre_sub = (pre or {}).get("subscription") or {}
        log("T3.pre_snapshot", True,
            f"plan={pre_sub.get('plan')}, status={pre_sub.get('status')}, "
            f"exp={pre_sub.get('expiryDate') or pre_sub.get('expiresAt')}")

        r1 = requests.post(f"{BACKEND_URL}/subscription/activate-code", json={
            "userId": user_id, "code": codes[0],
        })
        log("T3.activate_code1", r1.status_code == 200, f"{r1.status_code} {r1.text[:200]}")
        if r1.status_code != 200:
            return

        after1 = await db.users.find_one({"_id": ObjectId(user_id)})
        sub1 = after1.get("subscription") or {}
        T1 = parse_iso(sub1.get("expiryDate") or sub1.get("expiresAt"))
        now1 = datetime.utcnow()
        delta1 = (T1 - now1).total_seconds() / 86400 if T1 else None
        log("T3.after_code1", T1 is not None,
            f"T1={T1}, status={sub1.get('status')}, plan={sub1.get('plan')}, "
            f"delta(T1-now)={delta1:.4f}d (expected ~30 if no prior sub; ~37 if 7d trial was extended)")

        r2 = requests.post(f"{BACKEND_URL}/subscription/activate-code", json={
            "userId": user_id, "code": codes[1],
        })
        log("T3.activate_code2", r2.status_code == 200, f"{r2.status_code} {r2.text[:200]}")
        if r2.status_code != 200:
            return

        after2 = await db.users.find_one({"_id": ObjectId(user_id)})
        sub2 = after2.get("subscription") or {}
        T2 = parse_iso(sub2.get("expiryDate") or sub2.get("expiresAt"))
        now2 = datetime.utcnow()
        delta_T2_T1 = (T2 - T1).total_seconds() / 86400 if (T2 and T1) else None
        delta_T2_now = (T2 - now2).total_seconds() / 86400 if T2 else None
        cumul_ok = delta_T2_T1 is not None and abs(delta_T2_T1 - 30) <= 1.0
        log("T3.CUMUL_T2_minus_T1_is_30d", cumul_ok,
            f"T2={T2}, T1={T1}, delta(T2-T1)={delta_T2_T1:.4f}d (expected ~30), "
            f"delta(T2-now)={delta_T2_now:.4f}d (would be ~60 if CUMUL works, ~30 if broken)")

        await db.users.delete_one({"_id": ObjectId(user_id)})
    finally:
        client.close()


def test4_stripe_code_review():
    print("\n=== TEST 4: Stripe webhook cumul (code review) ===")
    with open("/app/backend/stripe_api.py", "r") as f:
        src = f.read()
    snippet_idx = src.find("end_date = base + timedelta(days=plan_days)")
    if snippet_idx < 0:
        log("T4.snippet_found", False, "marker not found")
        return
    block = src[max(0, snippet_idx - 800):snippet_idx + 200]
    print("--- CODE BLOCK ---")
    print(block)
    print("--- END CODE BLOCK ---")
    checks = [
        ("reads_existing_user", "db.users.find_one" in block),
        ("reads_existing_subscription", "existing_sub" in block),
        ("checks_status_active_or_trial", '("active", "trial")' in block or "['active', 'trial']" in block or "'active', 'trial'" in block),
        ("checks_existing_dt_gt_now", "existing_dt > now" in block),
        ("base_default_now", "base = now" in block),
        ("uses_base_in_end_date", "end_date = base + timedelta" in block),
    ]
    all_ok = True
    for desc, ok in checks:
        log(f"T4.code.{desc}", ok)
        all_ok = all_ok and ok
    log("T4.overall_logic_implemented", all_ok)


def cleanup():
    print("\n=== CLEANUP ===")
    n = asyncio.run(_delete_ambassador("resetpwd-test@tekateka.com"))
    print(f"Deleted {n} ambassador(s) with email resetpwd-test@tekateka.com")


def main():
    amb_id = test1_reset_password()
    test2_change_password(amb_id)
    asyncio.run(test3_cumul(amb_id))
    test4_stripe_code_review()
    cleanup()

    print("\n=========== SUMMARY ===========")
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"{passed}/{total} checks passed")
    print("\nFAILURES:")
    for n, ok, d in results:
        if not ok:
            print(f"  FAIL — {n}: {d}")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
