/**
 * App Constants - URLs for production / preview builds
 *
 * The base URL is read from EXPO_PUBLIC_BACKEND_URL at build time so different
 * EAS profiles (preview vs production) can target different backends without
 * code changes. Falls back to the production deployment domain.
 *
 * Production URL: https://low-data-shop.emergent.host (Emergent native deployment)
 * Preview URL:    https://low-data-shop.preview.emergentagent.com (dev only)
 */
export const API_BASE_URL: string =
  (process.env.EXPO_PUBLIC_BACKEND_URL as string | undefined) ||
  'https://low-data-shop.emergent.host';
