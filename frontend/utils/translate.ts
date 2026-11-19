/**
 * Runtime French → English translation of the whole UI.
 *
 * The app's screens are written in French. When the merchant picks English,
 * every string rendered through components/AppText (Text, TextInput
 * placeholders, Alert) is looked up in i18n/en-auto.json, which is generated
 * by scripts/extract_translate.py. Strings with dynamic parts are stored with
 * placeholders ("{0} jours restants") and matched with a regex.
 */
import { useSyncExternalStore } from 'react';
import i18n, { subscribeLocale } from './i18n';
import en from '../i18n/en-auto.json';

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Words that must stay as-is: language names in the picker, and the word the
// merchant must type to confirm account deletion.
const NO_TRANSLATE = new Set(['Français', 'English', 'Lingala', 'Kiswahili', 'SUPPRIMER']);
// Manual fixes on top of the machine translation.
const OVERRIDES: Record<string, string> = {
  '{0} jour{1} restant{2}': '{0} day{1} left',
  jours: 'days',
  charges: 'expenses',
};

const exact = new Map<string, string>();
const patterns: { re: RegExp; out: string; order: number[] }[] = [];

for (const [fr, auto] of Object.entries({ ...OVERRIDES, ...(en as Record<string, string>) })) {
  const key = normalize(fr);
  if (NO_TRANSLATE.has(key)) continue;
  const english = OVERRIDES[fr] ?? auto;
  if (/\{\d+\}/.test(key)) {
    const parts = key.split(/(\{\d+\})/);
    const order: number[] = [];
    const body = parts
      .map((p) => {
        const m = p.match(/^\{(\d+)\}$/);
        if (m) {
          order.push(Number(m[1]));
          return '(.+?)';
        }
        return escapeRe(p);
      })
      .join('');
    // Skip patterns that are only placeholders (would match everything)
    if (parts.some((p) => p && !/^\{\d+\}$/.test(p) && /[A-Za-zÀ-ÿ]/.test(p))) {
      patterns.push({ re: new RegExp(`^${body}$`, 's'), out: english, order });
    }
  } else {
    exact.set(key, english);
  }
}
// Longest (most specific) patterns first
patterns.sort((a, b) => b.re.source.length - a.re.source.length);

const cache = new Map<string, string>();

function translateCore(key: string): string {
  const hit = exact.get(key);
  if (hit !== undefined) return hit;
  for (const p of patterns) {
    const m = key.match(p.re);
    if (m) {
      return p.out.replace(/\{(\d+)\}/g, (_, n) => {
        const idx = p.order.indexOf(Number(n));
        return idx >= 0 ? m[idx + 1] : '';
      });
    }
  }
  // Fallback: translate the text pieces around numbers, amounts and
  // separators ("7 jours · 0 vente(s)", "Stock faible · 3", "$0,00 non payé").
  const pieces = key.split(/(\s*[·•|:]\s*|[-+]?[$€£]?\s?\d[\d\s.,]*\s?(?:[$€£%]|FC|CDF|XAF|XOF)?)/);
  if (pieces.length > 1) {
    let changed = false;
    const out = pieces.map((piece) => {
      const k = normalize(piece);
      const t = k && exact.get(k);
      if (t) {
        changed = true;
        return piece.replace(k, t);
      }
      return piece;
    });
    if (changed) return out.join('');
  }
  return key;
}

/** Translate one UI string to the current language (no-op in French). */
export function tr<T>(value: T): T {
  if (typeof value !== 'string' || i18n.locale !== 'en' || !/[A-Za-zÀ-ÿ]/.test(value)) return value;
  const cached = cache.get(value);
  if (cached !== undefined) return cached as unknown as T;
  const key = normalize(value);
  const lead = value.match(/^\s*/)?.[0] ?? '';
  const trail = value.match(/\s*$/)?.[0] ?? '';
  const translated = translateCore(key);
  const out = translated === key ? value : lead + translated + trail;
  cache.set(value, out);
  return out as unknown as T;
}

/** Translate the string children of a <Text>. */
export function trChildren(children: any): any {
  if (typeof children === 'string') return tr(children);
  if (Array.isArray(children)) {
    // Try the joined text first so "{n} jours restants" matches its pattern,
    // otherwise translate each string part on its own.
    const allPrimitive = children.every((c) => typeof c === 'string' || typeof c === 'number');
    if (allPrimitive && i18n.locale === 'en') {
      const joined = children.join('');
      const t = tr(joined);
      if (t !== joined) return t;
    }
    return children.map((c) => (typeof c === 'string' ? tr(c) : c));
  }
  return children;
}

/** Re-render the calling component whenever the app language changes. */
export function useLocale(): string {
  return useSyncExternalStore(subscribeLocale, () => i18n.locale, () => i18n.locale);
}
