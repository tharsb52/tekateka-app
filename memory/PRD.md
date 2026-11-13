# TekaTeka — PRD

## Product
TekaTeka is a mobile business app for small merchants in Africa. Built with Expo **SDK 58** (React Native 0.88), FastAPI and MongoDB.

## Features done
- **Login:** email + password + 4-digit PIN. Password/PIN reset by email through Gmail SMTP. Firebase phone login was **removed entirely**: the package, `google-services.json` and the plugins are gone, and `READ_PHONE_STATE` is blocked.
- **Business tools:**
  - Products: auto SKU, restock, price history, stock alerts, and currency per product.
  - Sales, expenses, debts, purchases, and notes.
  - Monthly report and best sellers.
- **Accounts and roles:**
  - Ambassador system, with commissions shown in the ambassador's chosen currency.
  - Admin and Ambassador web dashboards, which stay logged in after a page refresh.
- **Payments:** Stripe subscriptions in live mode.
- **Privacy:** GDPR account deletion.

## June 2026: SDK 58 upgrade
- **Packages:**
  - Expo 54 → 58.
  - `@expo/vector-icons` → `@react-native-vector-icons/ionicons`, which loads its own fonts (no manual font loading).
- **Code changes for SDK 58:**
  - `app/+html.tsx` now uses `useServerDocumentContext` (required in SDK 58, or the web page goes blank).
  - `absoluteFillObject` → `absoluteFill`.
  - Removed `StatusBar` `backgroundColor`.
  - CSV export uses the new `expo-file-system` `File` API.
  - Removed `newArchEnabled` and `edgeToEdgeEnabled` from `app.json`.
- **Bugs fixed:**
  - The subscription screen was not calling `refreshUser`.
  - Product list rows now show each product's own currency, and the form total uses the currency picked in the form.
  - Backend reset-code timezone bug (`tz_aware=True`).

## Build
The user builds locally with `eas build` (package `com.tekateka.app`). Download the latest source from Emergent first.

## Backlog
- **P2:** real Mobile Money (Flutterwave, MTN, Orange, M-Pesa).
- **P2:** native expiry reminders.
- **P2:** MongoDB aggregation pipelines in `admin_api`.
- **Minor:**
  - Remove the hardcoded fallback values in `auth_email_pin.py`.
  - Fix "Passez a" → "Passez à".
  - Remove the duplicate trial banner.

## Nov 2026 — Subscription lock (48h grace)
- Paid plan expired: full access + red banner "accès bloqué dans X h" for 48h, then read-only.
- Trial: read-only immediately at createdAt+7d (no grace).
- Read-only: login → /subscription first ("Consulter mes données" button), tabs viewable, writes blocked client-side (apiService) + server-side (server.py middleware → 402 on /api/data/* writes, rules in backend/subscription_guard.py).
- Security: disabled free self-activation endpoints /api/auth/subscribe and /api/payments/subscribe/confirm (410). Plans only via Stripe, activation codes, admin.
- Frontend now reads expiry from expiresAt OR expiryDate (activation-code users had no expiry before → never blocked).
