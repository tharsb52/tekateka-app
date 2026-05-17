/**
 * App Constants - Backend base URL
 *
 * MUST come from EXPO_PUBLIC_BACKEND_URL at build time. Set per EAS profile:
 *   - production -> https://low-data-shop.emergent.host
 *   - preview    -> https://low-data-shop.preview.emergentagent.com
 *
 * No fallback: if the env var is missing, deployment is misconfigured and
 * we want to fail loudly rather than silently hit the wrong backend.
 */
export const API_BASE_URL: string = (process.env.EXPO_PUBLIC_BACKEND_URL as string) || '';

if (!API_BASE_URL && typeof console !== 'undefined') {
  console.warn('[constants] EXPO_PUBLIC_BACKEND_URL is not set!');
}
