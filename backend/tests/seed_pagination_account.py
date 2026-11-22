# Seeds a throwaway TEST_ account with >20 products/sales/purchases/debts for pagination UI tests.
# Usage: python seed_pagination_account.py  -> writes /tmp/pag_account.json (email, password, token)
# Cleanup: DELETE /api/account/me with that token.
import json
import uuid
import requests
from test_offline_sync_changes import BASE_URL

email = f"test_pag_{uuid.uuid4().hex[:8]}@example.com"
r = requests.post(f"{BASE_URL}/api/auth/email-signup", json={"email": email, "password": "Test1234!", "name": "TEST_pag"}, timeout=20)
r.raise_for_status()
tok = r.json()["token"]
s = requests.Session()
s.headers.update({"Authorization": f"Bearer {tok}"})
pids = []
for i in range(25):
    p = s.post(f"{BASE_URL}/api/data/products", json={"name": f"TEST_Prod{i:02d}", "purchasePrice": 1, "salePrice": 2, "stock": 100, "category": "food", "currency": "USD"}).json()
    pids.append(p["id"])
for i in range(25):
    s.post(f"{BASE_URL}/api/data/sales", json={"productId": pids[i], "productName": f"TEST_Prod{i:02d}", "quantity": 1, "total": 2, "paymentMethod": "cash", "currency": "USD"})
for i in range(25):
    s.post(f"{BASE_URL}/api/data/purchases", json={"productName": f"TEST_Achat{i:02d}", "supplier": "TEST_S", "quantity": 1, "unitPrice": 1, "totalCost": 1, "currency": "USD"})
for i in range(22):
    s.post(f"{BASE_URL}/api/data/debts", json={"debtorName": f"TEST_Debiteur{i:02d}", "amount": 5, "currency": "USD", "isPaid": False})
    s.post(f"{BASE_URL}/api/data/debts", json={"debtorName": f"TEST_Paye{i:02d}", "amount": 5, "currency": "USD", "isPaid": True})
print(s.get(f"{BASE_URL}/api/data/changes").json())
json.dump({"email": email, "password": "Test1234!", "token": tok}, open("/tmp/pag_account.json", "w"))
print(email)
