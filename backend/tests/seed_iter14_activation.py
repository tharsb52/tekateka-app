# Iteration 14 helper: creates a TEST_ ambassador + 1 activation code + a fresh TEST_ merchant (public URL). Prints JSON.
import json
import os
import uuid

import requests
from pymongo import MongoClient

PUBLIC = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
ADMIN_PWD = os.environ["ADMIN_PASSWORD"]
DB = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

amb_email = f"test_amb14_{uuid.uuid4().hex[:6]}@example.com"
r = requests.post(f"{PUBLIC}/api/admin/ambassadors/create", json={
    "adminPassword": ADMIN_PWD, "name": "TEST_Amb14", "country": "CD", "city": "Kin",
    "email": amb_email, "ambassadorPassword": "AmbPass2026"})
r.raise_for_status()
amb = DB.ambassadors.find_one({"email": amb_email})
r = requests.post(f"{PUBLIC}/api/admin/codes/generate", json={"adminPassword": ADMIN_PWD, "count": 1, "plan": "monthly", "ambassadorId": str(amb["_id"])})
r.raise_for_status()
c = r.json()["codes"][0]
code = c["code"] if isinstance(c, dict) else c
m_email = f"test_m14_{uuid.uuid4().hex[:6]}@example.com"
r = requests.post(f"{PUBLIC}/api/auth/email-signup", json={"email": m_email, "password": "Test1234!", "name": "TEST_M14"})
r.raise_for_status()
d = r.json()
r2 = requests.post(f"{PUBLIC}/api/ambassador/login", json={"email": amb_email, "password": "AmbPass2026"})
print(json.dumps({"amb_email": amb_email, "amb_id": str(amb["_id"]), "code": code, "merchant_email": m_email,
                  "merchant_id": d["user"].get("id") or d["user"].get("_id"), "sub": d["user"].get("subscription"),
                  "amb_login_status": r2.status_code}))
