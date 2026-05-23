"""
Backend tests for Ambassador Preferred Currency endpoint
(POST /api/ambassador/profile/currency) + regression checks.
"""
import json
import os
import sys
import requests

BASE = "https://low-data-shop.preview.emergentagent.com/api"
EMAIL = "ambassador@tekateka.com"
PASSWORD = "Ambassador2025"

passed = 0
failed = 0
failures = []


def assert_eq(label, actual, expected):
    global passed, failed
    if actual == expected:
        print(f"  ✅ {label}: {actual!r}")
        passed += 1
    else:
        print(f"  ❌ {label}: expected {expected!r}, got {actual!r}")
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")
        failed += 1


def assert_true(label, cond, detail=""):
    global passed, failed
    if cond:
        print(f"  ✅ {label}")
        passed += 1
    else:
        print(f"  ❌ {label} {detail}")
        failures.append(f"{label} {detail}")
        failed += 1


def post(path, body):
    url = f"{BASE}{path}"
    r = requests.post(url, json=body, timeout=30)
    try:
        data = r.json()
    except Exception:
        data = {"_raw": r.text}
    return r.status_code, data


def set_currency(token, currency):
    return post("/ambassador/profile/currency", {"token": token, "currency": currency})


def get_dashboard(token):
    return post("/ambassador/dashboard", {"token": token})


def main():
    print("=" * 70)
    print("Test 1: Login")
    print("=" * 70)
    status, data = post("/ambassador/login", {"email": EMAIL, "password": PASSWORD})
    assert_eq("login status", status, 200)
    token = data.get("token")
    assert_true("token present", bool(token), str(data)[:200])
    if not token:
        print("FATAL: no token, aborting.")
        sys.exit(1)
    print(f"  token={token[:30]}...")

    print("\n" + "=" * 70)
    print("Test 2: Baseline dashboard - preferredCurrency present")
    print("=" * 70)
    status, data = get_dashboard(token)
    assert_eq("dashboard status", status, 200)
    amb = data.get("ambassador") or {}
    assert_true("ambassador.preferredCurrency present", "preferredCurrency" in amb,
                detail=f"keys={list(amb.keys())}")
    print(f"  Current preferredCurrency = {amb.get('preferredCurrency')!r}")

    print("\n" + "=" * 70)
    print("Test 3: Set to USD")
    print("=" * 70)
    status, data = set_currency(token, "USD")
    assert_eq("status", status, 200)
    assert_eq("success", data.get("success"), True)
    assert_eq("preferredCurrency", data.get("preferredCurrency"), "USD")

    print("\n" + "=" * 70)
    print("Test 4: Dashboard reflects USD")
    print("=" * 70)
    status, data = get_dashboard(token)
    assert_eq("dashboard status", status, 200)
    assert_eq("ambassador.preferredCurrency",
              (data.get("ambassador") or {}).get("preferredCurrency"), "USD")

    print("\n" + "=" * 70)
    print("Test 5: Set to 'cfa' (lowercase) -> should uppercase to CFA")
    print("=" * 70)
    status, data = set_currency(token, "cfa")
    assert_eq("status", status, 200)
    assert_eq("preferredCurrency response", data.get("preferredCurrency"), "CFA")
    status, data = get_dashboard(token)
    assert_eq("dashboard reflects CFA",
              (data.get("ambassador") or {}).get("preferredCurrency"), "CFA")

    print("\n" + "=" * 70)
    print("Test 6: Reject invalid currency JPY -> 400")
    print("=" * 70)
    status, data = set_currency(token, "JPY")
    assert_eq("status", status, 400)
    assert_eq("detail", data.get("detail"), "Devise non supportée")
    status, dash = get_dashboard(token)
    assert_eq("dashboard still CFA",
              (dash.get("ambassador") or {}).get("preferredCurrency"), "CFA")

    print("\n" + "=" * 70)
    print("Test 7: Reject empty currency -> 400")
    print("=" * 70)
    status, data = set_currency(token, "")
    assert_eq("status", status, 400)
    assert_eq("detail", data.get("detail"), "Devise non supportée")

    print("\n" + "=" * 70)
    print("Test 8: Reject missing token -> 401")
    print("=" * 70)
    status, data = post("/ambassador/profile/currency", {"currency": "USD"})
    assert_eq("status", status, 401)
    assert_eq("detail", data.get("detail"), "Token requis")

    print("\n" + "=" * 70)
    print("Test 9: Reject bad token -> 401")
    print("=" * 70)
    status, data = post("/ambassador/profile/currency",
                        {"token": "garbage", "currency": "USD"})
    assert_eq("status", status, 401)
    assert_eq("detail", data.get("detail"), "Token invalide")

    print("\n" + "=" * 70)
    print("Test 10: Whitelist coverage EUR, CDF, KES, RWF, BIF, NGN")
    print("=" * 70)
    for cur in ["EUR", "CDF", "KES", "RWF", "BIF", "NGN"]:
        status, data = set_currency(token, cur)
        assert_eq(f"set {cur} status", status, 200)
        assert_eq(f"set {cur} response", data.get("preferredCurrency"), cur)
        status, dash = get_dashboard(token)
        assert_eq(f"dashboard {cur}",
                  (dash.get("ambassador") or {}).get("preferredCurrency"), cur)

    print("\n" + "=" * 70)
    print("Test 11: Reset to EUR baseline")
    print("=" * 70)
    status, data = set_currency(token, "EUR")
    assert_eq("reset status", status, 200)
    assert_eq("reset value", data.get("preferredCurrency"), "EUR")
    status, dash = get_dashboard(token)
    assert_eq("dashboard EUR",
              (dash.get("ambassador") or {}).get("preferredCurrency"), "EUR")

    print("\n" + "=" * 70)
    print("REGRESSION: /api/ambassador/commissions structure")
    print("=" * 70)
    status, data = post("/ambassador/commissions", {"token": token})
    assert_eq("commissions status", status, 200)
    assert_true("has 'total'", "total" in data, str(data)[:200])
    assert_true("has 'items'", "items" in data, str(data)[:200])
    assert_true("items is list", isinstance(data.get("items"), list))
    print(f"  total={data.get('total')}, totalCount={data.get('totalCount')}, items_len={len(data.get('items', []))}")

    print("\n" + "=" * 70)
    print("REGRESSION: /api/ambassador/dashboard codesByPlan keys")
    print("=" * 70)
    status, dash = get_dashboard(token)
    assert_eq("dashboard status", status, 200)
    stats = (dash or {}).get("stats") or {}
    cbp = stats.get("codesByPlan") or {}
    for key in ("monthly", "quarterly", "yearly"):
        assert_true(f"codesByPlan.{key} present", key in cbp,
                    detail=f"keys={list(cbp.keys())}")
        sub = cbp.get(key) or {}
        for f in ("total", "used", "remaining"):
            assert_true(f"codesByPlan.{key}.{f} present", f in sub)

    print("\n" + "=" * 70)
    print("REGRESSION: /api/ambassador/codes with plan=monthly")
    print("=" * 70)
    status, data = post("/ambassador/codes", {"token": token, "plan": "monthly"})
    assert_eq("codes status", status, 200)
    assert_true("codes is list", isinstance(data, list))
    if isinstance(data, list) and len(data) > 0:
        sample = data[0]
        assert_true("code has 'code' field", "code" in sample)
        assert_true("code has 'plan' field", "plan" in sample)
        if data:
            non_monthly = [c for c in data if c.get("plan") != "monthly"]
            assert_eq("only monthly codes", len(non_monthly), 0)
    print(f"  Got {len(data) if isinstance(data, list) else 'N/A'} monthly codes")

    print("\n" + "=" * 70)
    print(f"SUMMARY: {passed} passed, {failed} failed")
    print("=" * 70)
    if failures:
        for f in failures:
            print(f"  - {f}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
