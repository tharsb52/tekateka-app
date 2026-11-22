"""
Restore a TekaTeka backup into MongoDB.

Usage (from /app/backend):
  python restore_backup.py --list                       # show available backups
  python restore_backup.py FILE.json.gz --yes           # restore a local file
  python restore_backup.py --remote FILENAME --yes      # download the off-site copy, then restore
  add --db other_db_name to restore into another database (safe test first)

WARNING: each collection present in the backup is emptied then refilled.
"""
import argparse
import asyncio
import gzip
import os
import sys

from bson import json_util

import backup_service as bs


async def restore(data: bytes, db_name: str):
    target = bs.db.client[db_name]
    docs = {}
    for line in gzip.decompress(data).decode("utf-8").splitlines():
        if not line.strip():
            continue
        row = json_util.loads(line)
        if "c" in row:
            docs.setdefault(row["c"], []).append(row["d"])
    for name, items in docs.items():
        if name == bs.META_COLLECTION:
            continue
        await target[name].delete_many({})
        for i in range(0, len(items), 1000):
            await target[name].insert_many(items[i:i + 1000])
        print(f"  {name}: {len(items)} documents")
    print(f"Restore finished into database '{db_name}'.")


async def main():
    p = argparse.ArgumentParser()
    p.add_argument("file", nargs="?")
    p.add_argument("--remote")
    p.add_argument("--list", action="store_true")
    p.add_argument("--db", default=os.environ["DB_NAME"])
    p.add_argument("--yes", action="store_true")
    a = p.parse_args()

    if a.list:
        for r in await bs.list_backups(100):
            print(r["createdAt"], r["filename"], r["size"], "local" if r.get("local") else "-",
                  "remote" if r.get("remotePath") else "-")
        return
    if a.remote:
        data = bs.get_object(f"{bs.APP_NAME}/backups/{a.remote}")
    elif a.file:
        path = a.file if os.path.exists(a.file) else bs.BACKUP_DIR / a.file
        data = open(path, "rb").read()
    else:
        p.print_help()
        return
    if not a.yes:
        sys.exit("Add --yes to confirm: existing data in the restored collections will be replaced.")
    await restore(data, a.db)


if __name__ == "__main__":
    asyncio.run(main())
