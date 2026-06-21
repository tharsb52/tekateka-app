"""
Email service for TekaTeka.

PRIMARY: Gmail SMTP (free, ~500 emails/day, works with any recipient)
FALLBACK: Resend HTTP API (if SMTP fails for some reason)

This dual-provider strategy means:
1. Day-to-day emails go through Gmail SMTP — no domain verification needed
2. If Gmail is down or rate-limited, we automatically fall back to Resend
3. The user doesn't need to do ANYTHING differently — same templates, same flow
"""

from __future__ import annotations

import asyncio
import logging
import os
import smtplib
import uuid
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape
from typing import Optional, Tuple

import httpx
from dotenv import load_dotenv

load_dotenv()

# ---- Gmail SMTP config (primary) ----
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_EMAIL = os.getenv("SMTP_EMAIL", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").replace(" ", "")  # Gmail app passwords come with spaces; strip them
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "TekaTeka")

# ---- Resend config (fallback) ----
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_FROM = os.getenv("RESEND_FROM", "TekaTeka <onboarding@resend.dev>")
RESEND_BASE_URL = "https://api.resend.com"

logger = logging.getLogger("email_service")


class ResendError(RuntimeError):
    """Raised when both SMTP AND Resend fail to deliver."""


def _send_smtp_sync(to: str, subject: str, html: str, text: Optional[str]) -> None:
    """
    Blocking SMTP send via Gmail. We run it through asyncio.to_thread() from
    the async wrapper below to avoid blocking the event loop.

    Gmail requires:
    - smtp.gmail.com:587 with STARTTLS
    - 2FA enabled on the account
    - An "app password" (NOT the regular Gmail password)
    """
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        raise RuntimeError("SMTP not configured (SMTP_EMAIL / SMTP_PASSWORD missing)")

    msg = MIMEMultipart("alternative")
    msg["From"] = f"{SMTP_FROM_NAME} <{SMTP_EMAIL}>"
    msg["To"] = to
    msg["Subject"] = subject
    if text:
        msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=15) as server:
        server.starttls()
        server.login(SMTP_EMAIL, SMTP_PASSWORD)
        server.sendmail(SMTP_EMAIL, [to], msg.as_string())


async def _send_resend(to: str, subject: str, html: str, text: Optional[str]) -> dict:
    """Resend fallback. Same signature as the primary."""
    if not RESEND_API_KEY:
        raise RuntimeError("RESEND_API_KEY not configured")
    headers = {
        "Authorization": f"Bearer {RESEND_API_KEY}",
        "Content-Type": "application/json",
        "User-Agent": "tekateka-backend/1.0",
        "Idempotency-Key": str(uuid.uuid4()),
    }
    payload = {"from": RESEND_FROM, "to": [to], "subject": subject, "html": html}
    if text:
        payload["text"] = text
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(f"{RESEND_BASE_URL}/emails", json=payload, headers=headers)
        if r.status_code >= 400:
            raise ResendError(f"Resend HTTP {r.status_code}: {r.text}")
        return r.json()


async def send_email(to: str, subject: str, html: str, text: Optional[str] = None) -> dict:
    """
    Send a transactional email.

    Tries Gmail SMTP first. If that fails (timeout, auth error, rate limit…)
    AND Resend is configured, automatically falls back to Resend. The caller
    only sees a single dict result either way.
    """
    # 1) Try Gmail SMTP (primary)
    if SMTP_EMAIL and SMTP_PASSWORD:
        try:
            await asyncio.to_thread(_send_smtp_sync, to, subject, html, text)
            logger.info("Email sent via Gmail SMTP to %s", to)
            return {"provider": "gmail_smtp", "to": to, "ok": True}
        except Exception as e:
            logger.warning("Gmail SMTP failed for %s: %s — trying Resend fallback", to, e)

    # 2) Resend fallback
    if RESEND_API_KEY:
        try:
            res = await _send_resend(to, subject, html, text)
            res["provider"] = "resend"
            return res
        except Exception as e:
            logger.error("Resend fallback also failed for %s: %s", to, e)
            raise ResendError(f"Both SMTP and Resend failed: {e}") from e

    raise RuntimeError("No email provider configured (set SMTP_EMAIL/SMTP_PASSWORD or RESEND_API_KEY)")


# ---------- French email templates ----------

def reset_email_fr(name: Optional[str], code: str) -> Tuple[str, str]:
    """
    Build the password/PIN reset email body (HTML + plain text fallback) in French.

    All user-controlled strings are HTML-escaped to prevent injection.
    """
    who = escape((name or "").strip())
    greeting = f"Bonjour {who} !" if who else "Bonjour !"
    html = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2937;">
      <h2 style="color: #f59e0b; margin-bottom: 4px;">TekaTeka</h2>
      <p style="color: #6b7280; margin-top: 0;">Votre code de réinitialisation</p>
      <p>{greeting}</p>
      <p>Vous avez demandé à réinitialiser votre mot de passe ou votre code PIN. Voici votre code :</p>
      <div style="background: #f3f4f6; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
        <div style="font-size: 36px; font-weight: 700; letter-spacing: 6px; color: #f59e0b; font-family: monospace;">{escape(code)}</div>
      </div>
      <p style="color: #6b7280; font-size: 14px;">⏳ Ce code expire dans <strong>10 minutes</strong>.</p>
      <p style="color: #6b7280; font-size: 14px;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — votre compte reste sécurisé.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0 16px;" />
      <p style="color: #9ca3af; font-size: 12px; text-align: center;">TekaTeka — Gestion commerciale simple pour entrepreneurs</p>
    </div>
    """
    text = (
        f"{greeting}\n\n"
        "Vous avez demandé à réinitialiser votre mot de passe.\n\n"
        f"Votre code : {code}\n\n"
        "Ce code expire dans 10 minutes.\n"
        "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.\n\n"
        "— TekaTeka"
    )
    return html, text


def welcome_email_fr(name: Optional[str], email: str) -> Tuple[str, str]:
    """Welcome email sent after successful email + password signup."""
    who = escape((name or "").strip())
    greeting = f"Bonjour {who} !" if who else "Bonjour !"
    safe_email = escape(email)
    html = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2937;">
      <h2 style="color: #f59e0b; margin-bottom: 4px;">Bienvenue sur TekaTeka 🎉</h2>
      <p>{greeting}</p>
      <p>Votre compte a été créé avec succès. Vous pouvez désormais vous connecter avec :</p>
      <p><strong>Email :</strong> {safe_email}</p>
      <p style="margin-top: 24px;">Pour aller plus vite la prochaine fois, créez un <strong>code PIN à 4 chiffres</strong> directement dans l'app après votre première connexion. ⚡</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0 16px;" />
      <p style="color: #9ca3af; font-size: 12px; text-align: center;">TekaTeka — Gestion commerciale simple pour entrepreneurs</p>
    </div>
    """
    text = (
        f"{greeting}\n\n"
        "Votre compte TekaTeka est prêt.\n\n"
        f"Email : {email}\n\n"
        "Astuce : créez un code PIN à 4 chiffres dans l'app pour des connexions plus rapides.\n\n"
        "— TekaTeka"
    )
    return html, text
