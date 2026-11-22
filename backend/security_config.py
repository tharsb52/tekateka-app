"""
Single source of truth for TekaTeka secrets + login brute-force protection.

- JWT_SECRET and ADMIN_PASSWORD come ONLY from the environment (Emergent
  Secrets). No fallback in code: the server refuses to start without them.
- Login lockout: 5 failures -> blocked 15 minutes, counted per account AND per
  IP address, stored in MongoDB (works across restarts / workers).
"""
import hmac
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent / ".env")


def _required(name: str, min_len: int) -> str:
    value = (os.environ.get(name) or "").strip()
    if len(value) < min_len:
        raise RuntimeError(
            f"{name} is missing or too short (min {min_len} chars). "
            f"Set it in the app Secrets before starting the server."
        )
    return value


JWT_SECRET = _required("JWT_SECRET", 32)
JWT_ALGORITHM = "HS256"
ADMIN_PASSWORD = _required("ADMIN_PASSWORD", 8)

# Allowed browser origins (native apps send no Origin header, so they are not
# affected by CORS). Extra origins can be added with ALLOWED_ORIGINS="a,b".
ALLOWED_ORIGINS = sorted({
    o.strip().rstrip("/") for o in (
        [os.environ.get("FRONTEND_BASE_URL", ""), "https://tekateka.app", "https://www.tekateka.app"]
        + (os.environ.get("ALLOWED_ORIGINS") or "").split(",")
    ) if o.strip()
})
# Any *.emergentagent.com / *.emergent.host page (preview + deployed app)
ALLOWED_ORIGIN_REGEX = r"https://([a-z0-9-]+\.)*(emergentagent\.com|emergent\.host)"

# ---------------------------------------------------------------- lockout
MAX_FAILURES = 5
LOCK_MINUTES = 15
# Number of trusted proxies that append to X-Forwarded-For after the client
# (preview: Cloudflare + Google load balancer = 2).
TRUSTED_PROXY_HOPS = int(os.environ.get("TRUSTED_PROXY_HOPS") or 2)

_db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
_locks = _db.login_lockouts


def client_ip(request: Request) -> str:
    """Real client IP: values added by our own proxies are at the END of the
    X-Forwarded-For chain, so we ignore anything the client could prepend."""
    chain = [p.strip() for p in (request.headers.get("x-forwarded-for") or "").split(",") if p.strip()]
    if len(chain) > TRUSTED_PROXY_HOPS:
        return chain[-(TRUSTED_PROXY_HOPS + 1)]
    if chain:
        return chain[0]
    return request.client.host if request.client else "unknown"


def _keys(scope: str, account: str, request: Request):
    return [f"{scope}:acct:{(account or '').strip().lower()}", f"{scope}:ip:{client_ip(request)}"]


def _locked_message(until: datetime, now: datetime) -> str:
    minutes = max(1, int((until - now).total_seconds() // 60) + 1)
    return f"Trop de tentatives échouées. Accès bloqué pendant {minutes} min, réessayez plus tard."


async def ensure_lock_indexes():
    await _locks.create_index("expiresAt", expireAfterSeconds=0)  # cleanup only


async def check_not_locked(scope: str, account: str, request: Request):
    now = datetime.now(timezone.utc)
    async for doc in _locks.find({"_id": {"$in": _keys(scope, account, request)}, "lockedUntil": {"$gt": now}}):
        until = doc["lockedUntil"]
        if until.tzinfo is None:
            until = until.replace(tzinfo=timezone.utc)
        raise HTTPException(status_code=429, detail=_locked_message(until, now))


async def record_failure(scope: str, account: str, request: Request):
    """Count one failure on the account and on the IP; lock at 5 within 15 min."""
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(minutes=LOCK_MINUTES)
    for key in _keys(scope, account, request):
        await _locks.update_one(
            {"_id": key},
            [{"$set": {
                "failures": {"$cond": [{"$lt": [{"$ifNull": ["$windowStart", window_start]}, window_start]},
                                       1, {"$add": [{"$ifNull": ["$failures", 0]}, 1]}]},
                "windowStart": {"$cond": [{"$lt": [{"$ifNull": ["$windowStart", window_start]}, window_start]},
                                          now, {"$ifNull": ["$windowStart", now]}]},
                "expiresAt": now + timedelta(minutes=LOCK_MINUTES * 2),
            }}, {"$set": {
                "lockedUntil": {"$cond": [{"$gte": ["$failures", MAX_FAILURES]},
                                          now + timedelta(minutes=LOCK_MINUTES), None]},
            }}],
            upsert=True,
        )


async def clear_failures(scope: str, account: str, request: Request):
    """Success resets the ACCOUNT counter only; the IP counter expires by itself,
    so a valid account cannot be used to reset the per-IP limit."""
    await _locks.delete_one({"_id": _keys(scope, account, request)[0]})


async def require_admin(request: Request, password) -> None:
    """Admin password check with lockout (used by every admin endpoint)."""
    await check_not_locked("admin", "admin", request)
    if not isinstance(password, str) or not hmac.compare_digest(password.encode(), ADMIN_PASSWORD.encode()):
        await record_failure("admin", "admin", request)
        raise HTTPException(status_code=401, detail="Accès refusé")
    await clear_failures("admin", "admin", request)
