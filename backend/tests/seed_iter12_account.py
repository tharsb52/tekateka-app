# Seeds a throwaway TEST_ account (language en, 1 product) for offline-profile / sell UI retests.
# Usage: python seed_iter12_account.py -> writes /tmp/iter12_account.json. Cleanup: DELETE /api/account/me.
import json
import uuid
import requests
from test_offline_sync_changes import BASE_URL

email = f"test_i12_{uuid.uuid4().hex[:8]}@example.com"
r = requests.post(f"{BASE_URL}/api/auth/email-signup", json={"email": email, "password": "Test1234!", "name": "TEST_i12"}, timeout=20)
r.raise_for_status()
tok = r.json()["token"]
uid = r.json()["user"]["id"]
s = requests.Session()
s.headers.update({"Authorization": f"Bearer {tok}"})
print(s.put(f"{BASE_URL}/api/auth/profile", json={"language": "en"}).status_code)
p = s.post(f"{BASE_URL}/api/data/products", json={"name": "TEST_Soap", "purchasePrice": 1, "salePrice": 2, "stock": 50, "category": "food", "currency": "USD"}).json()
json.dump({"email": email, "password": "Test1234!", "token": tok, "uid": uid, "pid": p["id"]}, open("/tmp/iter12_account.json", "w"))
print(email, uid)
