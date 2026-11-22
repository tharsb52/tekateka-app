/**
 * Offline support + light sync for the merchant data.
 *
 * - Cache: every collection is saved on the phone so screens show data
 *   instantly (even without network) and nothing is re-downloaded for nothing.
 * - Outbox: sales and purchases recorded without network are kept here and
 *   sent automatically when the network is back (idempotent via clientId).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Collection = 'products' | 'sales' | 'expenses' | 'debts' | 'purchases';

export interface OutboxItem {
  kind: 'sale' | 'purchase';
  clientId: string;
  createdAt: string;
  payload: any;
}

const cacheKey = (uid: string, name: string) => `@tekateka:cache:${uid}:${name}`;
const sigKey = (uid: string) => `@tekateka:cache:${uid}:signatures`;
const outboxKey = (uid: string) => `@tekateka:outbox:${uid}`;

export const newClientId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Network down / server unreachable (as opposed to a real 4xx refusal). */
export const isOfflineError = (e: any) =>
  /Connexion internet instable|Serveur temporairement indisponible|Network request failed|Failed to fetch|timeout/i.test(
    e?.message || '',
  );

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const loadCache = (uid: string, name: Collection) => readJson<any[] | null>(cacheKey(uid, name), null);
export const saveCache = (uid: string, name: Collection, data: any[]) =>
  AsyncStorage.setItem(cacheKey(uid, name), JSON.stringify(data)).catch(() => {});

export const loadSignatures = (uid: string) => readJson<Record<string, string>>(sigKey(uid), {});
export const saveSignatures = (uid: string, sigs: Record<string, string>) =>
  AsyncStorage.setItem(sigKey(uid), JSON.stringify(sigs)).catch(() => {});

export const loadOutbox = (uid: string) => readJson<OutboxItem[]>(outboxKey(uid), []);
export const saveOutbox = (uid: string, items: OutboxItem[]) =>
  AsyncStorage.setItem(outboxKey(uid), JSON.stringify(items)).catch(() => {});
