/**
 * Timezone-aware date utilities for TekaTeka.
 *
 * Rule:
 *  - Dates are stored in the DB as UTC ISO strings (e.g. "2026-05-17T13:00:00Z").
 *  - Dates are ALWAYS displayed in the user's local timezone, detected via
 *    `expo-localization` (Localization.timezone). If undetectable, falls back
 *    to Europe/Brussels (Belgium).
 *  - Default display format: "dd/MM/yyyy HH:mm" (e.g. "17/05/2026 15:00").
 */
import * as Localization from 'expo-localization';
import { formatInTimeZone } from 'date-fns-tz';

const FALLBACK_TZ = 'Europe/Brussels';

/**
 * Returns the user's IANA timezone (e.g. "Europe/Brussels", "Africa/Kinshasa").
 * Falls back to Europe/Brussels when the device cannot provide one.
 */
export const getUserTimezone = (): string => {
  try {
    const tz = (Localization as any).timezone;
    if (typeof tz === 'string' && tz.length > 0) return tz;
    // Newer expo-localization: getCalendars()[0].timeZone
    const calendars: any = (Localization as any).getCalendars?.();
    if (Array.isArray(calendars) && calendars[0]?.timeZone) {
      return calendars[0].timeZone as string;
    }
  } catch (_e) {
    // ignore
  }
  return FALLBACK_TZ;
};

/**
 * Normalize an incoming date value into a Date that JS understands as UTC.
 *
 * - "2026-05-17T13:00:00Z"        -> parsed as UTC (native)
 * - "2026-05-17T13:00:00+02:00"   -> parsed with explicit offset (native)
 * - "2026-05-17T13:00:00"         -> NO timezone in string. We treat it as UTC
 *                                    by appending "Z" so old/buggy entries are
 *                                    handled deterministically across engines
 *                                    (Hermes parses tz-less strings as UTC,
 *                                    V8 parses as local; this normalization
 *                                    removes that ambiguity).
 * - Date object                    -> returned as-is
 */
const toUtcDate = (input: string | number | Date | null | undefined): Date | null => {
  if (input == null) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  if (typeof input === 'number') {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof input === 'string') {
    let s = input.trim();
    if (!s) return null;
    // Detect explicit timezone indicator in ISO string
    const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(s);
    if (!hasTz) {
      // Naive ISO -> treat as UTC for consistency with DB convention
      // Replace space separator with T, if present
      s = s.replace(' ', 'T');
      s = s + 'Z';
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};

/**
 * Format a date value in the user's local timezone.
 *
 * @param input  ISO string, Date, or epoch number stored canonically in UTC
 * @param fmt    date-fns format (default "dd/MM/yyyy HH:mm")
 * @returns      Formatted string, or "" if the value is invalid.
 */
export const formatLocal = (
  input: string | number | Date | null | undefined,
  fmt: string = 'dd/MM/yyyy HH:mm'
): string => {
  const d = toUtcDate(input);
  if (!d) return '';
  try {
    return formatInTimeZone(d, getUserTimezone(), fmt);
  } catch (_e) {
    try {
      return formatInTimeZone(d, FALLBACK_TZ, fmt);
    } catch {
      return '';
    }
  }
};

/** Convenience: only time, e.g. "15:00". */
export const formatLocalTime = (input: string | number | Date | null | undefined): string =>
  formatLocal(input, 'HH:mm');

/** Convenience: only date, e.g. "17/05/2026". */
export const formatLocalDate = (input: string | number | Date | null | undefined): string =>
  formatLocal(input, 'dd/MM/yyyy');

/** Convenience: short, e.g. "17 mai 2026" — locale agnostic, numeric to avoid loading locales. */
export const formatLocalShort = (input: string | number | Date | null | undefined): string =>
  formatLocal(input, 'dd MMM yyyy');

/**
 * Returns the LOCAL day key (yyyy-MM-dd) for a UTC date, in the user's TZ.
 * Useful for grouping/charting sales by local day.
 */
export const localDayKey = (input: string | number | Date | null | undefined): string =>
  formatLocal(input, 'yyyy-MM-dd');

/**
 * Convert a local Date object (created via `new Date()` on the device) to a
 * canonical UTC ISO string for storage.
 *
 *   new Date()  ->  "2026-05-17T13:00:00.000Z"
 */
export const toUtcIso = (d: Date = new Date()): string => d.toISOString();
