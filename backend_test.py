"""
Product Management v2 backend tests.

Covers:
  A) Auto SKU                       (A1..A6)
  B) Duplicate detection            (B1..B8)
  C) Restock + price history        (C1..C9)
  D) Stock alert flags              (D1..D6)
  E) Sale -> stock decrement alert  (E1..E4)
  F) SKU immutability + sequence    (F1..F3)
"""
import os
import sys
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from pymongo import MongoClient
from dotenv import load_dotenv

ROOT = Path("/app/backend")
load_dotenv(ROOT / ".env")

BACKEND_BASE = "https://low-data-shop.preview.emergentagent.com"
API = f"{BACKEND_BASE}/api"
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "test_database")

USER1_PHONE = "+243111000111"
USER2_PHONE = "+243777999888"

mongo = MongoClient(MONGO_URL)
db = mongo[DB_NAME]

results: List[Dict[str, Any]] = []


def log(test_id: str, ok: bool, detail: str = ""):
    status = "PASS" if ok else "FAIL"
    results.append({"id": test_id, "status": status, "detail": detail})
    print(f"[{status}] {test_id} - {detail}")


def post(path, token=None, body=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.post(f"{API}{path}", headers=h, data=json.dumps(body or {}), timeout=30)


def get(path, token=None):
    h = {}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.get(f"{API}{path}", headers=h, timeout=30)


def put(path, token, body):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.put(f"{API}{path}", headers=h, data=json.dumps(body), timeout=30)


def delete(path, token):
    h = {}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.delete(f"{API}{path}", headers=h, timeout=30)


def login(phone):
    r = post("/auth/phone-login", body={"phoneNumber": phone})
    r.raise_for_status()
    j = r.json()
    return {"token": j["token"], "user_id": j["user"]["id"], "phone": phone}


def reset_user(user_id):
    db.products.delete_many({"userId": user_id})
    db.counters.delete_many({"userId": user_id, "name": "products"})
    db.purchase_price_history.delete_many({"userId": user_id})
    db.sales.delete_many({"userId": user_id})


def main():
    print(f"== Backend: {API}")
    print(f"== Mongo: {MONGO_URL} / {DB_NAME}")

    u1 = login(USER1_PHONE)
    u2 = login(USER2_PHONE)
    print(f"User1 id={u1['user_id']}, User2 id={u2['user_id']}")

    reset_user(u1["user_id"])
    reset_user(u2["user_id"])

    t1, t2 = u1["token"], u2["token"]
    uid1, uid2 = u1["user_id"], u2["user_id"]

    # A) Auto SKU
    print("\n--- A) Auto SKU ---")
    r = post("/data/products", t1, {"name": "Riz", "purchasePrice": 2, "salePrice": 3, "stock": 10, "category": "food"})
    riz = r.json()
    log("A2", r.status_code == 200 and riz.get("sku") == "PROD-000001" and riz.get("duplicate") is False,
        f"sku={riz.get('sku')} duplicate={riz.get('duplicate')}")

    r = post("/data/products", t1, {"name": "Sucre", "purchasePrice": 1, "salePrice": 2, "stock": 20, "category": "food"})
    sucre = r.json()
    log("A3", r.status_code == 200 and sucre.get("sku") == "PROD-000002", f"sku={sucre.get('sku')}")

    r = post("/data/products", t1, {"name": "Huile", "purchasePrice": 5, "salePrice": 7, "stock": 8, "category": "food"})
    huile = r.json()
    log("A4", r.status_code == 200 and huile.get("sku") == "PROD-000003", f"sku={huile.get('sku')}")

    log("A5", True, "Monotonic increment confirmed A2..A4")

    r = get("/data/products", t1)
    products = r.json()
    skus = sorted([p.get("sku") for p in products])
    log("A6", r.status_code == 200 and skus == ["PROD-000001", "PROD-000002", "PROD-000003"] and len(products) == 3,
        f"count={len(products)} skus={skus}")

    # B) Duplicate detection
    print("\n--- B) Duplicate detection ---")
    initial = db.products.count_documents({"userId": uid1})

    r = post("/data/products", t1, {"name": "riz", "purchasePrice": 2, "salePrice": 3, "stock": 5, "category": "food"})
    j = r.json()
    after = db.products.count_documents({"userId": uid1})
    log("B1", r.status_code == 200 and j.get("duplicate") is True and j.get("samePrice") is True
        and j.get("existing", {}).get("sku") == "PROD-000001" and after == initial,
        f"duplicate={j.get('duplicate')} samePrice={j.get('samePrice')} existing.sku={j.get('existing',{}).get('sku')} unchanged={after==initial}")

    r = post("/data/products", t1, {"name": " Riz  ", "purchasePrice": 2, "salePrice": 3, "stock": 5, "category": "food"})
    j = r.json()
    log("B2", r.status_code == 200 and j.get("duplicate") is True and j.get("samePrice") is True,
        f"duplicate={j.get('duplicate')} samePrice={j.get('samePrice')}")

    r = post("/data/products", t1, {"name": "Riz", "purchasePrice": 5, "salePrice": 7, "stock": 5, "category": "food"})
    j = r.json()
    log("B3", r.status_code == 200 and j.get("duplicate") is True and j.get("samePrice") is False,
        f"duplicate={j.get('duplicate')} samePrice={j.get('samePrice')}")

    r = post("/data/products", t1, {"name": "Riz", "unit": "kg", "purchasePrice": 2, "salePrice": 3, "stock": 5, "category": "food"})
    j = r.json()
    riz_kg = j
    log("B4", r.status_code == 200 and j.get("duplicate") is False and j.get("sku") == "PROD-000004" and j.get("unit") == "kg",
        f"duplicate={j.get('duplicate')} sku={j.get('sku')} unit={j.get('unit')}")

    r = post("/data/products", t1, {"name": "Riz", "unit": "kg", "purchasePrice": 2})
    j = r.json()
    log("B5", r.status_code == 200 and j.get("duplicate") is True and j.get("existing", {}).get("sku") == "PROD-000004",
        f"existing.sku={j.get('existing',{}).get('sku')}")

    r = post("/data/products", t1, {"name": "Tisane", "unit": "autre", "customUnit": "tasse",
                                    "purchasePrice": 1, "salePrice": 2, "stock": 3, "category": "food"})
    tisane = r.json()
    log("B6", r.status_code == 200 and tisane.get("duplicate") is False and tisane.get("unit") == "tasse"
        and "customUnit" not in tisane and tisane.get("sku") == "PROD-000005",
        f"unit={tisane.get('unit')} customUnit_in_resp={'customUnit' in tisane} sku={tisane.get('sku')}")

    r = post("/data/products", t1, {"name": "Tisane", "unit": "tasse", "purchasePrice": 1})
    j = r.json()
    log("B7", r.status_code == 200 and j.get("duplicate") is True and j.get("existing", {}).get("sku") == "PROD-000005",
        f"existing.sku={j.get('existing',{}).get('sku')}")

    r = post("/data/products", t1, {"name": "", "purchasePrice": 1, "salePrice": 2})
    detail = ""
    try:
        detail = r.json().get("detail", "")
    except Exception:
        detail = r.text
    log("B8", r.status_code == 400 and "Nom" in str(detail),
        f"status={r.status_code} detail={detail}")

    # C) Restock + price history
    print("\n--- C) Restock + price history ---")
    sucre_id = sucre["id"]
    hist0 = db.purchase_price_history.count_documents({"productId": sucre_id})

    r = post(f"/data/products/{sucre_id}/restock", t1, {"quantityAdded": 5})
    j = r.json()
    h_after = db.purchase_price_history.count_documents({"productId": sucre_id})
    log("C1", r.status_code == 200 and j.get("stock") == 25 and j.get("purchasePrice") == 1 and h_after == hist0,
        f"stock={j.get('stock')} pp={j.get('purchasePrice')} hist_added={h_after-hist0}")

    r = post(f"/data/products/{sucre_id}/restock", t1, {"quantityAdded": 10, "newPurchasePrice": 1})
    j = r.json()
    h_after = db.purchase_price_history.count_documents({"productId": sucre_id})
    log("C2", r.status_code == 200 and j.get("stock") == 35 and j.get("purchasePrice") == 1 and h_after == hist0,
        f"stock={j.get('stock')} pp={j.get('purchasePrice')} hist_added={h_after-hist0}")

    r = post(f"/data/products/{sucre_id}/restock", t1,
             {"quantityAdded": 3, "newPurchasePrice": 1.5, "currency": "EUR", "note": "Hausse fournisseur"})
    j = r.json()
    h_after = db.purchase_price_history.count_documents({"productId": sucre_id})
    rec = db.purchase_price_history.find_one({"productId": sucre_id}, sort=[("date", -1)])
    ok = (r.status_code == 200 and j.get("stock") == 38 and j.get("purchasePrice") == 1.5
          and (h_after - hist0) == 1
          and rec and rec.get("oldPurchasePrice") == 1 and rec.get("newPurchasePrice") == 1.5
          and rec.get("quantityAdded") == 3 and rec.get("currency") == "EUR"
          and rec.get("note") == "Hausse fournisseur" and rec.get("source") == "restock"
          and rec.get("sku") == "PROD-000002")
    log("C3", ok,
        f"stock={j.get('stock')} pp={j.get('purchasePrice')} h_added=1 rec_fields=old={rec.get('oldPurchasePrice') if rec else None} new={rec.get('newPurchasePrice') if rec else None} src={rec.get('source') if rec else None}")

    r = post(f"/data/products/{sucre_id}/restock", t1, {"quantityAdded": 2, "newPurchasePrice": 1.5})
    j = r.json()
    h_after2 = db.purchase_price_history.count_documents({"productId": sucre_id})
    log("C4", r.status_code == 200 and j.get("stock") == 40 and j.get("purchasePrice") == 1.5 and h_after2 == h_after,
        f"stock={j.get('stock')} hist_added={h_after2-h_after}")

    r = post(f"/data/products/{sucre_id}/restock", t1, {"quantityAdded": 1, "newPurchasePrice": 2.0})
    j = r.json()
    tot = db.purchase_price_history.count_documents({"productId": sucre_id})
    rec2 = db.purchase_price_history.find_one({"productId": sucre_id}, sort=[("date", -1)])
    log("C5", r.status_code == 200 and j.get("stock") == 41 and j.get("purchasePrice") == 2.0
        and tot == 2 and rec2 and rec2.get("oldPurchasePrice") == 1.5 and rec2.get("newPurchasePrice") == 2.0,
        f"stock={j.get('stock')} pp={j.get('purchasePrice')} total_hist={tot}")

    r = get(f"/data/products/{sucre_id}/price-history", t1)
    hist = r.json()
    ok_c6 = (r.status_code == 200 and isinstance(hist, list) and len(hist) == 2
             and hist[0].get("newPurchasePrice") == 2.0 and hist[1].get("newPurchasePrice") == 1.5
             and all(h.get("sku") == "PROD-000002" for h in hist)
             and all(("productId" in h) and ("oldPurchasePrice" in h) and ("quantityAdded" in h) for h in hist))
    log("C6", ok_c6, f"count={len(hist)} desc_order={hist[0].get('newPurchasePrice')==2.0 if hist else False}")

    r = post(f"/data/products/{sucre_id}/restock", t1, {"quantityAdded": 0})
    a = r.status_code == 400
    r = post(f"/data/products/{sucre_id}/restock", t1, {"quantityAdded": -1})
    b = r.status_code == 400
    r = post(f"/data/products/{sucre_id}/restock", t1, {"quantityAdded": 1, "newPurchasePrice": -5})
    c = r.status_code == 400
    log("C7", a and b and c, f"qty0_400={a} qtyNeg_400={b} priceNeg_400={c}")

    r = post("/data/products/not-an-objectid/restock", t1, {"quantityAdded": 1})
    detail = ""
    try:
        detail = r.json().get("detail", "")
    except Exception:
        detail = r.text
    log("C8", r.status_code == 400 and "ID produit invalide" in str(detail),
        f"status={r.status_code} detail={detail}")

    r = post(f"/data/products/{sucre_id}/restock", t2, {"quantityAdded": 1})
    a = r.status_code == 404
    r = get(f"/data/products/{sucre_id}/price-history", t2)
    b = r.status_code == 404
    hist_unchanged = db.purchase_price_history.count_documents({"productId": sucre_id}) == 2
    log("C9", a and b and hist_unchanged,
        f"restock_404={a} priceHist_404={b} history_unchanged={hist_unchanged}")

    # D) Stock alert flags
    print("\n--- D) Stock alert flags ---")
    r = post("/data/products", t1, {"name": "AlertItem", "purchasePrice": 1, "salePrice": 2,
                                    "stock": 2, "lowStockThreshold": 5, "category": "food"})
    alert_item = r.json()
    aid = alert_item["id"]
    log("D1", r.status_code == 200 and alert_item.get("outOfStock") is False and alert_item.get("lowStock") is True,
        f"outOfStock={alert_item.get('outOfStock')} lowStock={alert_item.get('lowStock')}")

    r = put(f"/data/products/{aid}", t1, {"stock": 0})
    j = r.json()
    log("D2", j.get("outOfStock") is True and j.get("lowStock") is False,
        f"outOfStock={j.get('outOfStock')} lowStock={j.get('lowStock')}")

    r = put(f"/data/products/{aid}", t1, {"stock": 100})
    j = r.json()
    log("D3", j.get("outOfStock") is False and j.get("lowStock") is False,
        f"outOfStock={j.get('outOfStock')} lowStock={j.get('lowStock')}")

    r = put(f"/data/products/{aid}", t1, {"lowStockThreshold": 50})
    j = r.json()
    log("D4", j.get("outOfStock") is False and j.get("lowStock") is False,
        f"thr=50 stock=100 lowStock={j.get('lowStock')}")

    r = put(f"/data/products/{aid}", t1, {"stock": 30})
    j = r.json()
    log("D5", j.get("outOfStock") is False and j.get("lowStock") is True,
        f"stock=30 thr=50 lowStock={j.get('lowStock')}")

    r = get("/data/products", t1)
    plist = r.json()
    alert_in_list = next((p for p in plist if p["id"] == aid), None)
    sucre_in_list = next((p for p in plist if p["id"] == sucre_id), None)
    ok_d6 = (alert_in_list and alert_in_list.get("stock") == 30 and alert_in_list.get("lowStock") is True
             and sucre_in_list and sucre_in_list.get("stock") == 41
             and sucre_in_list.get("outOfStock") is False and sucre_in_list.get("lowStock") is False)
    log("D6", ok_d6,
        f"alert(stock={alert_in_list.get('stock') if alert_in_list else None},lowStock={alert_in_list.get('lowStock') if alert_in_list else None}) sucre(stock={sucre_in_list.get('stock') if sucre_in_list else None})")

    # E) Sales
    print("\n--- E) Sales -> stock alerts ---")
    r = post("/data/products", t1, {"name": "Cola", "purchasePrice": 1, "salePrice": 2,
                                    "stock": 10, "lowStockThreshold": 5, "category": "food"})
    cola = r.json()
    cola_id = cola["id"]

    r = post("/data/sales", t1, {"productId": cola_id, "productName": "Cola",
                                 "quantity": 4, "total": 8, "paymentMethod": "cash"})
    j = r.json()
    log("E1", r.status_code == 200 and j.get("lowStockAlert") is False and j.get("stockAlert") is False,
        f"stockAlert={j.get('stockAlert')} lowStockAlert={j.get('lowStockAlert')}")

    r = post("/data/sales", t1, {"productId": cola_id, "productName": "Cola",
                                 "quantity": 2, "total": 4, "paymentMethod": "cash"})
    j = r.json()
    log("E2", r.status_code == 200 and j.get("lowStockAlert") is True and j.get("stockAlert") is False,
        f"stockAlert={j.get('stockAlert')} lowStockAlert={j.get('lowStockAlert')}")

    r = post("/data/sales", t1, {"productId": cola_id, "productName": "Cola",
                                 "quantity": 4, "total": 8, "paymentMethod": "cash"})
    j = r.json()
    log("E3", r.status_code == 200 and j.get("stockAlert") is True and j.get("lowStockAlert") is False,
        f"stockAlert={j.get('stockAlert')} lowStockAlert={j.get('lowStockAlert')}")

    r = get("/data/products", t1)
    plist = r.json()
    cola_now = next((p for p in plist if p["id"] == cola_id), None)
    log("E4", cola_now and cola_now.get("stock") == 0 and cola_now.get("outOfStock") is True
        and cola_now.get("lowStock") is False,
        f"stock={cola_now.get('stock') if cola_now else None} outOfStock={cola_now.get('outOfStock') if cola_now else None}")

    # F) Immutability + sequence
    print("\n--- F) SKU immutability + sequence ---")
    r = put(f"/data/products/{cola_id}", t1, {"sku": "PROD-HACKER"})
    j = r.json()
    log("F1", j.get("sku") == cola["sku"], f"sku={j.get('sku')} expected={cola['sku']}")

    counter_now = db.counters.find_one({"userId": uid1, "name": "products"})
    seq_before = counter_now["seq"] if counter_now else 0
    tisane_id = tisane["id"]
    delete(f"/data/products/{tisane_id}", t1)
    r = post("/data/products", t1, {"name": "PostDelete", "purchasePrice": 1, "salePrice": 2, "stock": 5, "category": "food"})
    j = r.json()
    expected_seq = f"PROD-{seq_before+1:06d}"
    log("F3", j.get("sku") == expected_seq and j.get("sku") != "PROD-000005",
        f"new sku={j.get('sku')} expected={expected_seq}")
    log("F2", j.get("sku") == expected_seq,
        f"counter advanced past delete (seq_before={seq_before})")

    # Doc shapes
    print("\n--- Sample MongoDB doc shapes ---")
    p_sample = db.products.find_one({"userId": uid1, "sku": "PROD-000002"})
    h_sample = db.purchase_price_history.find_one({"productId": sucre_id})
    counter_sample = db.counters.find_one({"userId": uid1, "name": "products"})

    def stringify(d):
        if not d:
            return None
        return {k: (str(v) if k == "_id" else v) for k, v in d.items()}

    print(f"PRODUCT doc keys: {sorted(list(p_sample.keys())) if p_sample else None}")
    print(f"PRODUCT doc: {stringify(p_sample)}")
    print(f"HISTORY doc keys: {sorted(list(h_sample.keys())) if h_sample else None}")
    print(f"HISTORY doc: {stringify(h_sample)}")
    print(f"COUNTER doc: {stringify(counter_sample)}")

    print("\n========== SUMMARY ==========")
    passed = [r for r in results if r["status"] == "PASS"]
    failed = [r for r in results if r["status"] == "FAIL"]
    print(f"TOTAL: {len(results)}  PASS: {len(passed)}  FAIL: {len(failed)}")
    for r in failed:
        print(f"  FAIL {r['id']}: {r['detail']}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
