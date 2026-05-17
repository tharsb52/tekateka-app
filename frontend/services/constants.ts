/**
 * App Constants - Backend base URL
 *
 * Reads EXPO_PUBLIC_BACKEND_URL at build time. If not set (e.g. local EAS
 * build without a complete .env), falls back to the production deployment
 * URL so the mobile binary always has a working backend to talk to.
 *
 * Per-environment override:
 *   - production EAS profile -> EXPO_PUBLIC_BACKEND_URL=https://low-data-shop.emergent.host
 *   - preview EAS profile    -> EXPO_PUBLIC_BACKEND_URL=https://low-data-shop.preview.emergentagent.com
 */
const FALLBACK_PROD_URL = 'https://low-data-shop.emergent.host';

const envUrl = (process.env.EXPO_PUBLIC_BACKEND_URL as string | undefined)?.trim();

export const API_BASE_URL: string = envUrl && envUrl.length > 0 ? envUrl : FALLBACK_PROD_URL;
