"""Unblock the admin login immediately (instead of waiting 15 minutes).
Usage (from /app/backend):  python unlock_admin.py
A server restart / redeploy also unblocks the admin automatically."""
import asyncio

from security_config import unlock_admin

print(f"Admin unlocked ({asyncio.run(unlock_admin())} lock record(s) removed).")
