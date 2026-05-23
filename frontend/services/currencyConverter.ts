/**
 * Centralized currency conversion service.
 *
 * DESIGN NOTE — extensibility:
 *
 * Today this module wraps the STATIC exchange rates declared in
 * `utils/currencies.ts` so we keep a single source of truth across the whole
 * application (merchant dashboard + ambassador screens).
 *
 * Tomorrow, we can swap the implementation of `convertAmount()` with a call
 * to a live FX API (e.g. https://api.exchangerate.host) WITHOUT touching any
 * business logic — every screen already routes through this service via the
 * thin `convertAmount`/`formatAmount` helpers.
 *
 * To migrate to a live API:
 *   1. Fetch + cache rates inside `getRates()` (with TTL, e.g. 1h).
 *   2. Return the cached rates from `getRates()`.
 *   3. The rest of the code keeps working as-is.
 */

import { CURRENCIES, convertCurrency, formatCurrency } from '../utils/currencies';

export type CurrencyCode = string;

/** Available currencies — shared with the rest of the app. */
export const SUPPORTED_CURRENCIES = CURRENCIES;

/**
 * Convert `amount` expressed in `fromCurrency` into `toCurrency`.
 * Uses the static rates declared in `utils/currencies.ts`.
 */
export function convertAmount(
  amount: number,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
): number {
  if (!Number.isFinite(amount)) return 0;
  return convertCurrency(amount, fromCurrency, toCurrency);
}

/** Format an amount already in the target currency. */
export function formatAmount(amount: number, currency: CurrencyCode): string {
  return formatCurrency(amount, currency);
}

/** Convert + format in one call. */
export function convertAndFormat(
  amount: number,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
): string {
  return formatAmount(convertAmount(amount, fromCurrency, toCurrency), toCurrency);
}

/** Sanitize a currency code coming from the backend / storage. */
export function normalizeCurrency(
  code: string | null | undefined,
  defaultCurrency: CurrencyCode = 'EUR',
): CurrencyCode {
  if (!code) return defaultCurrency;
  const known = SUPPORTED_CURRENCIES.find(c => c.code === code);
  return known ? known.code : defaultCurrency;
}
