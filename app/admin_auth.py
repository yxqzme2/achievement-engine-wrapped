# -----------------------------------------
# admin_auth.py — Admin session gate
# -----------------------------------------
# Every route with "admin" in its path (pages and APIs alike) requires a
# valid signed session cookie, checked by middleware in main.py. No new
# dependency: HMAC-SHA256 over stdlib hmac/hashlib, constant-time compare.
#
# ADMIN_PASSWORD must be set via environment. If unset, a random one-time
# password is generated at startup and printed to the container logs once —
# admin routes are never silently left open.
# -----------------------------------------

import hashlib
import hmac
import os
import secrets
import threading
import time

COOKIE_NAME = "ae_admin_session"
SESSION_TTL_SECONDS = 12 * 60 * 60  # 12 hours

MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_SECONDS = 15 * 60

_login_lock = threading.Lock()
_login_attempts = {}  # client ip -> {"fails": int, "locked_until": float}

_SESSION_SECRET = os.environ.get("ADMIN_SESSION_SECRET") or secrets.token_hex(32)
_ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
_GENERATED_PASSWORD = False

if not _ADMIN_PASSWORD:
    _ADMIN_PASSWORD = secrets.token_urlsafe(18)
    _GENERATED_PASSWORD = True


def startup_notice() -> None:
    if _GENERATED_PASSWORD:
        print("=" * 70)
        print("[admin_auth] ADMIN_PASSWORD was not set. Generated one for this run:")
        print(f"[admin_auth]   {_ADMIN_PASSWORD}")
        print("[admin_auth] Set ADMIN_PASSWORD in .env to keep it stable across restarts.")
        print("=" * 70)


def _sign(expiry: int) -> str:
    msg = f"admin:{expiry}".encode("utf-8")
    sig = hmac.new(_SESSION_SECRET.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    return f"{expiry}.{sig}"


def make_session_token() -> str:
    expiry = int(time.time()) + SESSION_TTL_SECONDS
    return _sign(expiry)


def is_valid_session_token(token: str) -> bool:
    if not token or "." not in token:
        return False
    expiry_s, _, sig = token.partition(".")
    try:
        expiry = int(expiry_s)
    except ValueError:
        return False
    if expiry < int(time.time()):
        return False
    expected = _sign(expiry)
    return hmac.compare_digest(expected, token)


def check_password(candidate: str) -> bool:
    return hmac.compare_digest(candidate or "", _ADMIN_PASSWORD)


def client_ip(request) -> str:
    """Best-effort real client IP. Prefers Cloudflare's own header (set by
    Cloudflare's edge, not trivially spoofable when traffic actually goes
    through Cloudflare) over the generic X-Forwarded-For, falling back to
    the raw connection IP. This is for login lockout bookkeeping only —
    not a security boundary by itself."""
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def login_lockout_remaining(request) -> int:
    """Seconds remaining in an active lockout for this client, or 0."""
    ip = client_ip(request)
    with _login_lock:
        rec = _login_attempts.get(ip)
        if not rec:
            return 0
        remaining = rec["locked_until"] - time.time()
        return int(remaining) if remaining > 0 else 0


def record_login_failure(request) -> None:
    ip = client_ip(request)
    with _login_lock:
        rec = _login_attempts.setdefault(ip, {"fails": 0, "locked_until": 0.0})
        rec["fails"] += 1
        if rec["fails"] >= MAX_LOGIN_ATTEMPTS:
            rec["locked_until"] = time.time() + LOCKOUT_SECONDS


def record_login_success(request) -> None:
    ip = client_ip(request)
    with _login_lock:
        _login_attempts.pop(ip, None)
