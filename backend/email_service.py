"""
Resend email service for TekaTeka.

Centralises all transactional email sending:
- password / PIN reset codes
- welcome emails

Following the Resend HTTP API requirements:
- HTTPS only
- Authorization: Bearer <api_key>
- User-Agent header is REQUIRED to avoid 403 / error 1010
- Idempotency-Key prevents duplicate sends on retry

Sender uses `onboarding@resend.dev` by default (no domain verification needed)
which works out of the box but emails will land in the recipient's spam folder
on some providers. To improve deliverability in production, the user must
verify their own domain in Resend dashboard and update `RESEND_FROM`.
"""

from __future__ import annotations

import os
import uuid
from html import escape
from typing import Optional, Tuple

import httpx
from dotenv import load_dotenv

load_dotenv()

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_FROM = os.getenv("RESEND_FROM", "TekaTeka <onboarding@resend.dev>")
RESEND_BASE_URL = "https://api.resend.com"


class ResendError(RuntimeError):
    """Raised when the Resend API returns an error."""


async def send_email(to: str, subject: str, html: str, text: Optional[str] = None) -> dict:
    """
    Send a transactional email via the Resend HTTP API.

    Returns the parsed JSON response on success (contains the email id).
    Raises ResendError if the API responds with a non-2xx status.
    Raises RuntimeError if RESEND_API_KEY is not configured.
    """
    if not RESEND_API_KEY:
        raise RuntimeError("RESEND_API_KEY not configured in backend/.env")

    headers = {
        "Authorization": f"Bearer {RESEND_API_KEY}",
        "Content-Type": "application/json",
        # User-Agent is REQUIRED per Resend docs — missing it causes 403/1010 errors
        "User-Agent": "tekateka-backend/1.0",
        # Idempotency-Key prevents duplicate sends if the request is retried
        "Idempotency-Key": str(uuid.uuid4()),
    }
    payload = {
        "from": RESEND_FROM,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if text:
        payload["text"] = text

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            r = await client.post(f"{RESEND_BASE_URL}/emails", json=payload, headers=headers)
        except httpx.RequestError as e:
            raise ResendError(f"Network error contacting Resend: {e}") from e
        if r.status_code >= 400:
            raise ResendError(f"Resend HTTP {r.status_code}: {r.text}")
        return r.json()


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
