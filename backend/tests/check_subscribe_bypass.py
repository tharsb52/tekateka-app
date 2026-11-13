# Manual check: trial-expired TEST_ user blocked immediately (no grace) + /api/auth/subscribe free self-activation bypass
import os, asyncio, uuid, requests
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

load_dotenv("/app/backend/.env")
BASE = [l.split("=", 1)[1].strip() for l in open("/app/frontend/.env") if l.startswith("EXPO_PUBLIC_BACKEND_URL=")][0].rstrip("/")


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    email = f"test_lock_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{BASE}/api/auth/email-signup", json={"email": email, "password": "Test1234!", "name": "TEST_lock"}, timeout=20)
    print("signup", r.status_code)
    uid = r.json()["user"]["id"]; h = {"Authorization": f"Bearer {r.json()['token']}"}
    try:
        r = requests.post(f"{BASE}/api/data/products", headers=h, json={"name": "TEST_p", "purchasePrice": 1, "salePrice": 2, "stock": 1}, timeout=20)
        print("new trial user write:", r.status_code)
        pid = r.json().get("id")
        if pid: requests.delete(f"{BASE}/api/data/products/{pid}", headers=h, timeout=20)
        old = (datetime.now(timezone.utc) - timedelta(days=7, hours=1)).isoformat()
        await db.users.update_one({"_id": ObjectId(uid)}, {"$set": {"createdAt": old}})
        r = requests.post(f"{BASE}/api/data/products", headers=h, json={"name": "TEST_p", "purchasePrice": 1, "salePrice": 2, "stock": 1}, timeout=20)
        print("trial ended 1h ago write:", r.status_code, r.json().get("code"))
        r = requests.post(f"{BASE}/api/auth/subscribe", headers=h, json={"plan": "monthly"}, timeout=20)
        print("POST /api/auth/subscribe (no payment):", r.status_code, (r.json().get("user") or {}).get("subscription"))
        r = requests.post(f"{BASE}/api/data/products", headers=h, json={"name": "TEST_p2", "purchasePrice": 1, "salePrice": 2, "stock": 1}, timeout=20)
        print("write after free subscribe:", r.status_code)
    finally:
        await db.products.delete_many({"userId": uid})
        await db.users.delete_one({"_id": ObjectId(uid)})
        print("cleaned", uid)

asyncio.run(main())
