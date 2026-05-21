"""
Ambassador System v3 backend tests.

Covers tests A..J from the review request:
  A) Pricing tier
  B) Codes infinite validity
  C) Codes list with enrichment + plan filter
  D) Commissions API
  E) Single-use enforcement
  F) IDOR
  G) Migration
  H) Stripe quarterly 13€
  J) Regression
"""
import os
import sys
import time
import json
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv

ROOT = Path("/app/backend")
load_dotenv(ROOT / ".env")

BACKEND_BASE = "https://low-data-shop.preview.emergentagent.com"
API = f"{BACKEND_BASE}/api"
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "test_database")

ADMIN_PASSWORD = "Ndinemakutamillions82@"
AMB_EMAIL = "ambassador@tekateka.com"
AMB_PASSWORD = "Ambassador2025"

mongo = MongoClient(MONGO_URL)
db = mongo[DB_NAME]

results: List[Dict[str, Any]] = []


def record(name: str, ok: bool, msg: str = ""):
    status = "PASS" if ok else "FAIL"
    line = f"[{status}] {name}: {msg}"
    print(line, flush=True)
    results.append({"name": name, "ok": ok, "msg": msg})


def post(path: str, payload: dict, headers: Optional[dict] = None) -> requests.Response:
    return requests.post(f"{API}{path}", json=payload, headers=headers or {}, timeout=30)


# -----------------------------------------------------------------------
# Setup: get ambassador token + a test client user
# -----------------------------------------------------------------------
def setup():
    r = post("/ambassador/login", {"email": AMB_EMAIL, "password": AMB_PASSWORD})
    assert r.status_code == 200, f"Ambassador login failed: {r.status_code} {r.text}"
    amb_data = r.json()
    amb_token = amb_data["token"]
    amb_id = amb_data["ambassador"]["id"]
    print(f"Ambassador logged in: id={amb_id}")

    # Get a client user via phone-login (creates if not exists)
    r = post("/auth/phone-login", {"phoneNumber": "+243111000111"})
    assert r.status_code == 200, f"Phone login failed: {r.status_code} {r.text}"
    user_data = r.json()
    user_token = user_data.get("token")
    user_id = user_data.get("user", {}).get("id") or user_data.get("userId")
    print(f"Client user logged in: id={user_id}")

    return amb_token, amb_id, user_token, user_id


# -----------------------------------------------------------------------
# A) Pricing tier
# -----------------------------------------------------------------------
def test_a_pricing():
    r = post("/admin/pricing-info", {"adminPassword": ADMIN_PASSWORD})
    if r.status_code != 200:
        record("A1 pricing-info status", False, f"got {r.status_code} {r.text}")
        return
    data = r.json()
    ok = data.get("currentTier") == "standard"
    record("A1 currentTier==standard", ok, str(data.get("currentTier")))
    pricing = data.get("pricing", {})
    std = pricing.get("standard", {})
    m = std.get("monthly", {})
    q = std.get("quarterly", {})
    y = std.get("yearly", {})
    record("A1 monthly=10/4", m.get("appPrice") == 10 and m.get("ambassadorPrice") == 4, str(m))
    record("A1 quarterly=27/13", q.get("appPrice") == 27 and q.get("ambassadorPrice") == 13, str(q))
    record("A1 yearly=99/50", y.get("appPrice") == 99 and y.get("ambassadorPrice") == 50, str(y))
    record("A1 multiplierThreshold is None", data.get("multiplierThreshold") is None, str(data.get("multiplierThreshold")))
    record("A1 no early tier", "early" not in pricing, str(list(pricing.keys())))


# -----------------------------------------------------------------------
# B) Codes infinite validity
# -----------------------------------------------------------------------
def test_b_codes_validity(amb_token: str, amb_id: str, user_id: str):
    # B1: list codes, unused ones must have expiresAt None/missing
    r = post("/ambassador/codes", {"token": amb_token})
    if r.status_code != 200:
        record("B1 codes list", False, f"got {r.status_code} {r.text}")
        return None
    codes = r.json()
    unused = [c for c in codes if c.get("status") == "unused"]
    bad = [c for c in unused if c.get("expiresAt") not in (None, "", "null")]
    record("B1 all unused codes have expiresAt None/missing",
           len(bad) == 0,
           f"unused={len(unused)} with_expiry={len(bad)}")

    # B2: manually insert a code with expiresAt=past_date and activate
    past_code = f"TK-PAST-{uuid.uuid4().hex[:4].upper()}"
    db.activation_codes.insert_one({
        "code": past_code,
        "plan": "monthly",
        "ambassadorId": amb_id,
        "status": "unused",
        "assignedAt": datetime.utcnow() - timedelta(days=60),
        "expiresAt": datetime.utcnow() - timedelta(days=10),  # PAST
        "usedAt": None,
        "usedByUserId": None,
    })
    # Try to activate - the activation flow picks ANY unused monthly code
    # for the ambassador. To ensure this specific past-date code is selected,
    # we drain other monthly unused codes first... but actually simplest is:
    # we just verify activate succeeds (any code). If activate picks past_code
    # it proves past expiresAt isn't blocking. If it picks another, we still
    # at least verify there's no expiry filter (the past code remains usable).
    # Let's verify the past_code is now in the list of unused codes:
    r2 = post("/ambassador/codes", {"token": amb_token, "plan": "monthly"})
    monthly_codes = r2.json() if r2.status_code == 200 else []
    past_in_list = any(c.get("code") == past_code for c in monthly_codes)
    record("B2 past-date code is selectable from list",
           past_in_list, f"past_code={past_code} in_list={past_in_list}")

    # B3: activate a monthly code -> should return commission:6, purchase:4, sale:10
    # Create a fresh client user for this test
    r3 = post("/auth/phone-login", {"phoneNumber": f"+243700{int(time.time())%1000000:06d}"})
    if r3.status_code != 200:
        record("B3 fresh client login", False, r3.text)
        return amb_token
    fresh_client = r3.json().get("user", {}).get("id")

    r4 = post("/ambassador/activate", {
        "token": amb_token,
        "clientUserId": fresh_client,
        "plan": "monthly"
    })
    if r4.status_code != 200:
        record("B3 activate monthly", False, f"{r4.status_code} {r4.text}")
        return amb_token
    act = r4.json()
    record("B3 commission=6", act.get("commission") == 6, str(act.get("commission")))
    record("B3 purchasePrice=4", act.get("purchasePrice") == 4, str(act.get("purchasePrice")))
    record("B3 salePrice=10", act.get("salePrice") == 10, str(act.get("salePrice")))
    # remember the used code for E1
    return act.get("code"), fresh_client


# -----------------------------------------------------------------------
# C) Codes list enrichment + plan filter
# -----------------------------------------------------------------------
def test_c_codes_enrichment(amb_token: str, monthly_used_code: str):
    # C1: all codes have clientName/clientPhone/statusLabel/assignedAt fields
    r = post("/ambassador/codes", {"token": amb_token})
    codes = r.json()
    missing_fields = []
    for c in codes:
        for f in ("clientName", "clientPhone", "statusLabel", "assignedAt"):
            if f not in c:
                missing_fields.append((c.get("code"), f))
                break
    record("C1 codes carry enrichment fields",
           len(missing_fields) == 0,
           f"missing in {len(missing_fields)} codes")

    # status labels correct
    status_label_ok = all(
        (c.get("statusLabel") == "used" if c.get("status") == "used" else c.get("statusLabel") == "available")
        for c in codes
    )
    record("C1 statusLabel matches status", status_label_ok, "")

    # C2 monthly only
    r2 = post("/ambassador/codes", {"token": amb_token, "plan": "monthly"})
    m = r2.json()
    record("C2 plan=monthly returns only monthly",
           all(c.get("plan") == "monthly" for c in m), f"count={len(m)}")

    # C3 quarterly only
    r3 = post("/ambassador/codes", {"token": amb_token, "plan": "quarterly"})
    q = r3.json()
    record("C3 plan=quarterly returns only quarterly",
           all(c.get("plan") == "quarterly" for c in q), f"count={len(q)}")

    # C4 weekly -> no filter (returns all)
    r4 = post("/ambassador/codes", {"token": amb_token, "plan": "weekly"})
    w = r4.json()
    record("C4 plan=weekly treated as no filter",
           len(w) == len(codes), f"weekly={len(w)} all={len(codes)}")

    # C5 the B3 code is now used
    used_match = [c for c in codes if c.get("code") == monthly_used_code]
    if used_match:
        c = used_match[0]
        ok = (c.get("status") == "used"
              and c.get("statusLabel") == "used"
              and c.get("clientName"))
        record("C5 B3 code is used + has clientName", ok,
               f"status={c.get('status')} label={c.get('statusLabel')} name={c.get('clientName')}")
    else:
        record("C5 B3 code visible in list", False, f"code={monthly_used_code} not found")


# -----------------------------------------------------------------------
# D) Commissions API
# -----------------------------------------------------------------------
def test_d_commissions(amb_token: str):
    # D1: snapshot
    r = post("/ambassador/commissions", {"token": amb_token})
    if r.status_code != 200:
        record("D1 commissions snapshot", False, f"{r.status_code} {r.text}")
        return None
    snap = r.json()
    total_before = snap.get("total", 0)
    count_before = snap.get("totalCount", 0)
    print(f"D1 snapshot: total={total_before}, count={count_before}")
    record("D1 commissions snapshot ok", True, f"total={total_before} count={count_before}")

    # Need fresh clients for each activation
    def fresh_client():
        r = post("/auth/phone-login", {"phoneNumber": f"+243701{int(time.time()*1000)%10000000:07d}"})
        time.sleep(0.05)
        return r.json().get("user", {}).get("id")

    # D2: activate quarterly -> commission 14
    c1 = fresh_client()
    r2 = post("/ambassador/activate", {"token": amb_token, "clientUserId": c1, "plan": "quarterly"})
    if r2.status_code != 200:
        record("D2 activate quarterly", False, f"{r2.status_code} {r2.text}")
    else:
        record("D2 quarterly commission=14", r2.json().get("commission") == 14, str(r2.json().get("commission")))

    # D3: activate yearly -> commission 49
    c2 = fresh_client()
    r3 = post("/ambassador/activate", {"token": amb_token, "clientUserId": c2, "plan": "yearly"})
    if r3.status_code != 200:
        record("D3 activate yearly", False, f"{r3.status_code} {r3.text}")
    else:
        record("D3 yearly commission=49", r3.json().get("commission") == 49, str(r3.json().get("commission")))

    # D4: commissions total ≈ before + 6 + 14 + 49
    r4 = post("/ambassador/commissions", {"token": amb_token})
    if r4.status_code != 200:
        record("D4 commissions list", False, r4.text)
        return None
    cur = r4.json()
    new_total = cur.get("total", 0)
    # B3 added 6 too
    expected_increment = 6 + 14 + 49  # monthly + quarterly + yearly
    actual_increment = new_total - total_before
    record(f"D4 total increased by ~69 (B3+D2+D3)",
           abs(actual_increment - expected_increment) < 0.01,
           f"before={total_before} after={new_total} diff={actual_increment}")

    items = cur.get("items", [])
    if items:
        first = items[0]
        required = {"id", "code", "planType", "purchasePrice", "salePrice",
                    "commissionAmount", "clientName", "clientPhone", "date"}
        missing = required - set(first.keys())
        record("D4 items carry all required fields", not missing, f"missing={missing}")
        # date desc
        dates = [i.get("date") for i in items if i.get("date")]
        is_desc = all(dates[i] >= dates[i+1] for i in range(len(dates)-1)) if dates else True
        record("D4 items sorted date desc", is_desc, "")

    # D5: monthly filter
    r5 = post("/ambassador/commissions", {"token": amb_token, "plan": "monthly"})
    m_items = r5.json().get("items", [])
    record("D5 plan=monthly only", all(i.get("planType") == "monthly" for i in m_items),
           f"count={len(m_items)}")

    # D6: yearly filter
    r6 = post("/ambassador/commissions", {"token": amb_token, "plan": "yearly"})
    y_items = r6.json().get("items", [])
    record("D6 plan=yearly only", all(i.get("planType") == "yearly" for i in y_items),
           f"count={len(y_items)}")

    # D7: no token -> 401
    r7 = post("/ambassador/commissions", {})
    record("D7 no token -> 401", r7.status_code == 401, f"got {r7.status_code}")

    # D8: bad token -> 401
    r8 = post("/ambassador/commissions", {"token": "bad.token"})
    record("D8 bad token -> 401", r8.status_code == 401, f"got {r8.status_code}")


# -----------------------------------------------------------------------
# E) Single-use enforcement
# -----------------------------------------------------------------------
def test_e_single_use(user_token: str, used_monthly_code: str, amb_token: str):
    # E1: redeem an already-used code -> 400
    r = post("/subscription/activate-code", {"userId": "anyid", "code": used_monthly_code})
    # Actually look at the endpoint signature - it takes userId+code in body
    # If the code is already used, returns 400 "Ce code a déjà été utilisé"
    if r.status_code == 400 and "déjà" in r.text:
        record("E1 used code re-redeem -> 400 déjà utilisé", True, r.text[:120])
    else:
        record("E1 used code re-redeem -> 400 déjà utilisé", False,
               f"got {r.status_code} {r.text[:150]}")

    # E2: drain all unused monthly codes
    drained = 0
    max_iter = 200
    while max_iter > 0:
        max_iter -= 1
        # fresh client
        rfc = post("/auth/phone-login", {"phoneNumber": f"+243702{int(time.time()*1000)%10000000:07d}"})
        if rfc.status_code != 200:
            break
        client_id = rfc.json().get("user", {}).get("id")
        ra = post("/ambassador/activate", {
            "token": amb_token,
            "clientUserId": client_id,
            "plan": "monthly"
        })
        if ra.status_code == 200:
            drained += 1
            time.sleep(0.05)
        elif ra.status_code == 404:
            record(f"E2 drain monthly: depleted after {drained} activations, /activate returns 404",
                   "Aucun code" in ra.text, ra.text[:120])
            return
        else:
            record(f"E2 drain monthly unexpected error", False,
                   f"after {drained}: {ra.status_code} {ra.text[:150]}")
            return
    record("E2 drain monthly hit max iterations", False, f"drained={drained}")


# -----------------------------------------------------------------------
# F) IDOR
# -----------------------------------------------------------------------
def test_f_idor(amb1_id: str):
    # F1: Create amb2
    email2 = f"amb2-v3-{int(time.time())}@tekateka.com"
    r = post("/admin/ambassadors/create", {
        "adminPassword": ADMIN_PASSWORD,
        "name": "Test Amb 2",
        "email": email2,
        "ambassadorPassword": "Amb2v3Pass!",
        "country": "CD",
        "city": "Kinshasa",
    })
    if r.status_code != 200:
        record("F1 create amb2", False, f"{r.status_code} {r.text}")
        return
    amb2_id = r.json().get("ambassador", {}).get("id")
    record("F1 amb2 created", bool(amb2_id), f"id={amb2_id}")

    # F2: login amb2
    r2 = post("/ambassador/login", {"email": email2, "password": "Amb2v3Pass!"})
    if r2.status_code != 200:
        record("F2 amb2 login", False, r2.text)
        return
    token2 = r2.json()["token"]
    record("F2 amb2 login", True, "")

    # F3: amb2 commissions = empty
    r3 = post("/ambassador/commissions", {"token": token2})
    data = r3.json()
    ok = data.get("total") == 0 and len(data.get("items", [])) == 0
    record("F3 amb2 commissions empty", ok, str(data)[:200])

    # F4: amb2 codes don't include amb1's codes
    r4 = post("/ambassador/codes", {"token": token2})
    codes = r4.json()
    # Each code should have ambassadorId == amb2_id, not amb1_id
    bad = [c for c in codes if c.get("ambassadorId") and c.get("ambassadorId") != amb2_id]
    record("F4 amb2 codes do not include amb1's codes",
           len(bad) == 0, f"count={len(codes)} cross={len(bad)}")


# -----------------------------------------------------------------------
# G) Migration check
# -----------------------------------------------------------------------
def test_g_migration():
    # Count unused codes with non-null expiresAt
    n_total = db.activation_codes.count_documents({"status": "unused"})
    n_with_expiry = db.activation_codes.count_documents({
        "status": "unused",
        "expiresAt": {"$ne": None, "$exists": True},
    })
    record(
        "G1 unused codes with non-null expiresAt == 0",
        n_with_expiry == 0,
        f"total_unused={n_total} with_expiry={n_with_expiry}",
    )


# -----------------------------------------------------------------------
# H) Stripe quarterly 13€
# -----------------------------------------------------------------------
def test_h_stripe(amb_token: str):
    headers = {"Authorization": f"Bearer {amb_token}"}
    r = requests.post(
        f"{API}/payments/stripe/ambassador/checkout",
        headers={**headers, "Content-Type": "application/json"},
        json={"plan": "quarterly", "quantity": 1},
        timeout=30,
    )
    if r.status_code != 200:
        record("H1 stripe quarterly checkout 200", False, f"{r.status_code} {r.text[:200]}")
        return
    data = r.json()
    url = data.get("url", "")
    session_id = data.get("sessionId", "")
    record("H1 returns cs_test_ session", session_id.startswith("cs_test_"), session_id[:40])
    record("H1 returns checkout url", "checkout.stripe.com" in url, url[:80])

    # Verify the db.payments doc
    pay = db.payments.find_one({"stripeSessionId": session_id})
    if not pay:
        record("H1 payments doc inserted", False, "not found in DB")
        return
    record("H1 payments amount==13.0", pay.get("amount") == 13.0, str(pay.get("amount")))
    record("H1 payments quantity==1", pay.get("quantity") == 1, str(pay.get("quantity")))


# -----------------------------------------------------------------------
# J) Regression
# -----------------------------------------------------------------------
def test_j_regression(amb_token: str, user_id: str):
    # J1 dashboard
    r = post("/ambassador/dashboard", {"token": amb_token})
    if r.status_code != 200:
        record("J1 dashboard", False, r.text)
        return
    stats = r.json().get("stats", {})
    cbp = stats.get("codesByPlan", {})
    total_comm = stats.get("totalCommission", 0)
    record("J1 dashboard has codesByPlan", isinstance(cbp, dict) and "monthly" in cbp and "quarterly" in cbp and "yearly" in cbp, str(list(cbp.keys())))
    record("J1 totalCommission > 0", total_comm > 0, str(total_comm))

    # J2 scan-client
    if user_id:
        r2 = post("/ambassador/scan-client", {"token": amb_token, "clientUserId": user_id})
        record("J2 scan-client works", r2.status_code == 200, f"{r2.status_code}")


# -----------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------
def main():
    print("=" * 70)
    print("Ambassador System v3 - Backend Tests")
    print("=" * 70)

    amb_token, amb_id, user_token, user_id = setup()

    # Ensure ambassador has codes of all 3 plans (need plenty for drain test)
    for plan, count in [("monthly", 15), ("quarterly", 5), ("yearly", 5)]:
        rg = post("/admin/codes/generate", {
            "adminPassword": ADMIN_PASSWORD,
            "count": count,
            "plan": plan,
            "ambassadorId": amb_id,
        })
        if rg.status_code == 200:
            print(f"Generated {count} {plan} codes")
        else:
            print(f"WARN generate {plan}: {rg.status_code} {rg.text[:120]}")

    test_a_pricing()
    b_result = test_b_codes_validity(amb_token, amb_id, user_id)
    monthly_used_code = b_result[0] if isinstance(b_result, tuple) else None
    if monthly_used_code:
        test_c_codes_enrichment(amb_token, monthly_used_code)
    test_d_commissions(amb_token)
    if monthly_used_code:
        test_e_single_use(user_token, monthly_used_code, amb_token)
    test_f_idor(amb_id)
    test_g_migration()
    test_h_stripe(amb_token)
    test_j_regression(amb_token, user_id)

    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    passed = sum(1 for r in results if r["ok"])
    failed = sum(1 for r in results if not r["ok"])
    print(f"Total: {len(results)} | Passed: {passed} | Failed: {failed}")
    if failed:
        print("\nFailed tests:")
        for r in results:
            if not r["ok"]:
                print(f"  - {r['name']}: {r['msg']}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
