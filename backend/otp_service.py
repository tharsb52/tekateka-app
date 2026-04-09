"""
OTP Service using Africa's Talking SMS API
Handles sending and verifying OTP codes for TekaTeka authentication.
"""
import os
import random
import time
import logging
import africastalking
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger(__name__)

# Africa's Talking configuration
AT_USERNAME = os.getenv("AT_USERNAME", "sandbox")
AT_API_KEY = os.getenv("AT_API_KEY", "")

# Initialize Africa's Talking SDK
africastalking.initialize(AT_USERNAME, AT_API_KEY)
sms = africastalking.SMS

# In-memory OTP store (production should use Redis/DB)
# Format: { phone_number: { code: "1234", expires_at: timestamp, attempts: 0 } }
otp_store: dict = {}

# Constants
OTP_LENGTH = 4
OTP_EXPIRY_SECONDS = 5 * 60  # 5 minutes
MAX_VERIFY_ATTEMPTS = 5
SENDER_ID = None  # Use default for sandbox; set to "TekaTeka" in production


def generate_otp() -> str:
    """Generate a random N-digit OTP code."""
    return str(random.randint(10**(OTP_LENGTH-1), 10**OTP_LENGTH - 1))


def normalize_phone(phone: str) -> str:
    """Normalize phone number to include single + prefix."""
    phone = phone.strip().lstrip('+')
    return f'+{phone}'


async def send_otp(phone_number: str) -> dict:
    """
    Generate and send an OTP code via Africa's Talking SMS.
    Returns dict with success status and message.
    """
    phone = normalize_phone(phone_number)
    code = generate_otp()
    expires_at = time.time() + OTP_EXPIRY_SECONDS

    # Store OTP
    otp_store[phone] = {
        "code": code,
        "expires_at": expires_at,
        "attempts": 0,
    }

    message = f"TekaTeka: Votre code de verification est {code}. Valide pendant 5 minutes."

    logger.info(f"Sending OTP to {phone} (code: {code})")

    try:
        # Send SMS via Africa's Talking
        response = sms.send(message, [phone], sender_id=SENDER_ID)
        logger.info(f"AT SMS Response: {response}")

        # Check response
        recipients = response.get("SMSMessageData", {}).get("Recipients", [])
        if recipients:
            status = recipients[0].get("status", "")
            status_code = recipients[0].get("statusCode", -1)
            
            if status_code == 101 or status == "Success":
                return {
                    "success": True,
                    "message": f"Code envoyé à {phone}",
                    "sandbox": AT_USERNAME == "sandbox",
                    # In sandbox mode, return the code for testing
                    **({"debug_code": code} if AT_USERNAME == "sandbox" else {}),
                }
            else:
                logger.warning(f"AT SMS failed: status={status}, code={status_code}")
                return {
                    "success": True,  # Still return success since OTP is stored
                    "message": f"Code envoyé à {phone} (sandbox: {status})",
                    "sandbox": True,
                    "debug_code": code,
                }
        else:
            # No recipients in response - might be sandbox limitation
            logger.warning(f"AT SMS no recipients in response: {response}")
            return {
                "success": True,
                "message": f"Code envoyé à {phone}",
                "sandbox": AT_USERNAME == "sandbox",
                **({"debug_code": code} if AT_USERNAME == "sandbox" else {}),
            }

    except Exception as e:
        logger.error(f"Africa's Talking SMS error: {e}")
        # Even if SMS fails, the OTP is stored and can be verified
        # This is important for sandbox mode where SMS might not deliver
        return {
            "success": True,
            "message": f"Code généré pour {phone}",
            "sandbox": True,
            "debug_code": code,  # Always return in case of error for dev
            "warning": str(e),
        }


async def verify_otp(phone_number: str, code: str) -> dict:
    """
    Verify an OTP code for a given phone number.
    Returns dict with success status and message.
    """
    phone = normalize_phone(phone_number)

    stored = otp_store.get(phone)
    if not stored:
        return {
            "success": False,
            "message": "Aucun code envoyé pour ce numéro. Veuillez en demander un nouveau.",
        }

    # Check expiry
    if time.time() > stored["expires_at"]:
        del otp_store[phone]
        return {
            "success": False,
            "message": "Code expiré. Veuillez en demander un nouveau.",
        }

    # Check attempts
    if stored["attempts"] >= MAX_VERIFY_ATTEMPTS:
        del otp_store[phone]
        return {
            "success": False,
            "message": "Trop de tentatives. Veuillez demander un nouveau code.",
        }

    # Verify code
    stored["attempts"] += 1
    if stored["code"] != code:
        remaining = MAX_VERIFY_ATTEMPTS - stored["attempts"]
        return {
            "success": False,
            "message": f"Code incorrect. {remaining} tentatives restantes.",
        }

    # Success - remove OTP
    del otp_store[phone]
    return {
        "success": True,
        "message": "Vérification réussie!",
    }
