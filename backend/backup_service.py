"""
Server-side data protection for TekaTeka.

- Daily automatic backup of the whole MongoDB database (gzip, Extended JSON),
  kept 30 days on the server disk + an off-site copy in Emergent Object Storage.
- Full export for the admin dashboard (same format, without password/PIN hashes).

Nothing here runs in the mobile app: no extra weight on the phone.
Restore: see restore_backup.py.
"""
import asyncio
import gzip
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from bson import json_util
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from starlette.concurrency import run_in_threadpool

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logger = logging.getLogger("backup_service")

db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

BACKUP_DIR = Path(os.environ.get("BACKUP_DIR") or ROOT_DIR / "backups")
RETENTION_DAYS = 30
APP_NAME = "tekateka"
META_COLLECTION = "backups"  # backup log (not itself backed up)

# Fields removed from the downloadable admin export
SECRET_FIELDS = {"passwordHash", "pinHash", "password", "pin", "hashed_password"}
# Collections never put in the admin export (short-lived secrets)
EXPORT_SKIP = {"password_reset_codes", META_COLLECTION}

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
_storage_key = None


# ---------------------------------------------------------------- storage
def _init_storage(force: bool = False) -> str:
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": os.environ.get("EMERGENT_LLM_KEY")}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path: str, data: bytes) -> dict:
    for attempt in range(2):
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": _init_storage(force=attempt == 1), "Content-Type": "application/gzip"},
            data=data, timeout=300,
        )
        if resp.status_code == 503 and attempt == 0:  # stale key -> re-init once
            continue
        resp.raise_for_status()
        return resp.json()


def get_object(path: str) -> bytes:
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": _init_storage()}, timeout=300)
    resp.raise_for_status()
    return resp.content


# ---------------------------------------------------------------- dump
def _strip_secrets(doc):
    return {k: v for k, v in doc.items() if k not in SECRET_FIELDS}


async def build_archive(for_export: bool) -> tuple[bytes, dict]:
    """Return (gzip bytes, {collection: count}). One JSON object per line:
    {"c": collection, "d": document} so restore can stream it."""
    counts = {}
    lines = [json_util.dumps({"meta": {"app": APP_NAME, "createdAt": datetime.now(timezone.utc).isoformat(),
                                        "type": "export" if for_export else "backup"}})]
    for name in sorted(await db.list_collection_names()):
        if name == META_COLLECTION or (for_export and name in EXPORT_SKIP):
            continue
        n = 0
        async for doc in db[name].find():
            if for_export:
                doc = _strip_secrets(doc)
            lines.append(json_util.dumps({"c": name, "d": doc}))
            n += 1
        counts[name] = n
    data = gzip.compress(("\n".join(lines) + "\n").encode("utf-8"), compresslevel=6)
    return data, counts


# ---------------------------------------------------------------- daily backup
async def run_backup() -> dict:
    """Create today's backup (local file + off-site copy) and prune old files."""
    now = datetime.now(timezone.utc)
    day = now.strftime("%Y-%m-%d")
    data, counts = await build_archive(for_export=False)
    filename = f"tekateka-backup-{now.strftime('%Y-%m-%d_%H%M%S')}.json.gz"

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    (BACKUP_DIR / filename).write_bytes(data)

    record = {"day": day, "createdAt": now.isoformat(), "filename": filename, "size": len(data),
              "counts": counts, "local": True, "remotePath": None, "remoteError": None}
    try:
        res = await run_in_threadpool(put_object, f"{APP_NAME}/backups/{filename}", data)
        record["remotePath"] = res.get("path")
    except Exception as e:  # keep the local copy even if off-site fails
        record["remoteError"] = str(e)[:300]
        logger.error("off-site backup upload failed: %s", e)

    await db[META_COLLECTION].insert_one(record)
    await prune_old_backups()
    record.pop("_id", None)
    logger.info("backup done: %s (%d bytes) remote=%s", filename, len(data), record["remotePath"])
    return record


async def prune_old_backups():
    """Delete local files older than 30 days. The off-site store has no delete
    API, so old remote copies are only flagged as expired in the log."""
    limit = (datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)).isoformat()
    async for rec in db[META_COLLECTION].find({"createdAt": {"$lt": limit}, "local": True}):
        try:
            (BACKUP_DIR / rec["filename"]).unlink(missing_ok=True)
        except OSError as e:
            logger.warning("could not delete %s: %s", rec["filename"], e)
    await db[META_COLLECTION].update_many(
        {"createdAt": {"$lt": limit}}, {"$set": {"local": False, "expired": True}}
    )


async def daily_backup_loop():
    """Checks every hour; makes one backup per UTC day (first check after 02:00 UTC,
    or immediately if yesterday's backup is missing)."""
    await asyncio.sleep(60)  # let the server start
    while True:
        try:
            now = datetime.now(timezone.utc)
            day = now.strftime("%Y-%m-%d")
            if now.hour >= 2 and not await db[META_COLLECTION].find_one({"day": day}):
                # claim the day atomically so 2 workers never back up twice
                claim = await db.backup_locks.update_one(
                    {"_id": day}, {"$setOnInsert": {"at": now.isoformat()}}, upsert=True
                )
                if claim.upserted_id is not None:
                    await run_backup()
        except Exception as e:
            logger.error("daily backup failed: %s", e)
        await asyncio.sleep(3600)


async def list_backups(limit: int = 40) -> list:
    return await db[META_COLLECTION].find({}, {"_id": 0}).sort("createdAt", -1).to_list(limit)
