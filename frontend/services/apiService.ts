/**
 * Centralized API service for TekaTeka backend.
 * All data flows through MongoDB for multi-device real-time sync.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_BASE_URL } from './constants';

const BACKEND_URL = API_BASE_URL;
const TOKEN_KEY = '@tekateka:auth_token';

// ==========================================
// Token Management
// ==========================================
let cachedToken: string | null = null;

export const getToken = async (): Promise<string | null> => {
  if (cachedToken) return cachedToken;
  cachedToken = await AsyncStorage.getItem(TOKEN_KEY);
  return cachedToken;
};

export const setToken = async (token: string) => {
  cachedToken = token;
  await AsyncStorage.setItem(TOKEN_KEY, token);
};

export const clearToken = async () => {
  cachedToken = null;
  await AsyncStorage.removeItem(TOKEN_KEY);
};

// ==========================================
// API Fetch Helper with automatic retry
// ==========================================
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function apiFetch(path: string, options: RequestInit = {}, retries = 3): Promise<any> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return apiFetchWithHeaders(path, options, headers, retries);
}

/**
 * Variant of apiFetch that uses the AMBASSADOR Bearer token instead of the
 * regular-user JWT. Used by the ambassador-only flows (e.g. buying activation
 * codes via Stripe Checkout) so they work without requiring a parallel
 * regular-user login.
 */
async function apiFetchAsAmbassador(path: string, options: RequestInit = {}, retries = 3): Promise<any> {
  const token = await AsyncStorage.getItem('ambassador_token');
  if (!token) {
    throw new Error('Session ambassadeur expirée. Reconnectez-vous.');
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
    'Authorization': `Bearer ${token}`,
  };
  return apiFetchWithHeaders(path, options, headers, retries);
}

async function apiFetchWithHeaders(
  path: string,
  options: RequestInit,
  headers: Record<string, string>,
  retries: number,
): Promise<any> {
  const url = `${BACKEND_URL}/api${path}`;
  let lastError: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Use AbortController for timeout (15s)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, { ...options, headers, signal: controller.signal });
      clearTimeout(timeoutId);

      const responseText = await response.text();

      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        // Non-JSON response (likely HTML proxy/error page) — retry on transient
        const preview = (responseText || '').substring(0, 80).replace(/<[^>]+>/g, '').trim();
        if (attempt < retries) {
          console.warn(`[API] Non-JSON response for ${path}, retrying (${attempt + 1}/${retries})... preview: ${preview}`);
          await sleep(500 * Math.pow(2, attempt));
          continue;
        }
        throw new Error(`Serveur temporairement indisponible. ${preview ? 'Réponse: ' + preview : ''}`);
      }

      if (!response.ok) {
        // 5xx → retry; 4xx → throw immediately (client error)
        if (response.status >= 500 && attempt < retries) {
          console.warn(`[API] ${response.status} for ${path}, retrying (${attempt + 1}/${retries})...`);
          await sleep(500 * Math.pow(2, attempt));
          continue;
        }
        throw new Error(data.detail || data.message || `Erreur ${response.status}`);
      }

      return data;
    } catch (error: any) {
      lastError = error;

      // Network errors / timeout → retry
      const isNetworkError =
        error?.name === 'AbortError' ||
        error?.message?.includes('fetch') ||
        error?.message?.includes('Network') ||
        error?.message?.includes('network') ||
        error?.message?.includes('Failed to fetch');

      if (isNetworkError && attempt < retries) {
        console.warn(`[API] Network error for ${path}, retrying (${attempt + 1}/${retries})...`, error.message);
        await sleep(500 * Math.pow(2, attempt));
        continue;
      }

      if (isNetworkError) {
        throw new Error('Connexion internet instable. Vérifiez votre réseau et réessayez.');
      }
      throw error;
    }
  }

  throw lastError || new Error('Erreur inconnue');
}

// ==========================================
// Auth API
// ==========================================
export const authAPI = {
  phoneLogin: async (phoneNumber: string) => {
    const data = await apiFetch('/auth/phone-login', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    });
    if (data.token) await setToken(data.token);
    return data;
  },

  credentialLogin: async (identifier: string, password: string) => {
    const data = await apiFetch('/auth/credential-login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    if (data.token) await setToken(data.token);
    return data;
  },

  setupCredentials: async (email?: string, username?: string, password?: string) => {
    return apiFetch('/auth/setup-credentials', {
      method: 'POST',
      body: JSON.stringify({ email, username, password }),
    });
  },

  getProfile: async () => {
    return apiFetch('/auth/profile');
  },

  updateProfile: async (updates: Record<string, any>) => {
    return apiFetch('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  logout: async () => {
    await clearToken();
  },

  subscribe: async (plan: string) => {
    return apiFetch('/auth/subscribe', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    });
  },

  updateProfilePhoto: async (photoBase64: string) => {
    return apiFetch('/auth/profile-photo', {
      method: 'PUT',
      body: JSON.stringify({ photo: photoBase64 }),
    });
  },
};

// ==========================================
// Products API
// ==========================================
export const productsAPI = {
  getAll: () => apiFetch('/data/products'),

  add: (product: any) => apiFetch('/data/products', {
    method: 'POST',
    body: JSON.stringify(product),
  }),

  update: (id: string, updates: any) => apiFetch(`/data/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  }),

  delete: (id: string) => apiFetch(`/data/products/${id}`, {
    method: 'DELETE',
  }),

  restock: (id: string, payload: { quantityAdded: number; newPurchasePrice?: number; currency?: string; note?: string }) =>
    apiFetch(`/data/products/${id}/restock`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  priceHistory: (id: string) => apiFetch(`/data/products/${id}/price-history`),
};

// ==========================================
// Sales API
// ==========================================
export const salesAPI = {
  getAll: () => apiFetch('/data/sales'),

  add: (sale: any) => apiFetch('/data/sales', {
    method: 'POST',
    body: JSON.stringify(sale),
  }),

  update: (id: string, updates: any) => apiFetch(`/data/sales/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  }),

  delete: (id: string) => apiFetch(`/data/sales/${id}`, {
    method: 'DELETE',
  }),
};

// ==========================================
// Expenses API
// ==========================================
export const expensesAPI = {
  getAll: () => apiFetch('/data/expenses'),

  add: (expense: any) => apiFetch('/data/expenses', {
    method: 'POST',
    body: JSON.stringify(expense),
  }),

  update: (id: string, updates: any) => apiFetch(`/data/expenses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  }),

  delete: (id: string) => apiFetch(`/data/expenses/${id}`, {
    method: 'DELETE',
  }),
};

// ==========================================
// Debts API
// ==========================================
export const debtsAPI = {
  getAll: () => apiFetch('/data/debts'),

  add: (debt: any) => apiFetch('/data/debts', {
    method: 'POST',
    body: JSON.stringify(debt),
  }),

  update: (id: string, updates: any) => apiFetch(`/data/debts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  }),

  delete: (id: string) => apiFetch(`/data/debts/${id}`, {
    method: 'DELETE',
  }),
};

// ==========================================
// Purchases API
// ==========================================
export const purchasesAPI = {
  getAll: () => apiFetch('/data/purchases'),

  add: (purchase: any) => apiFetch('/data/purchases', {
    method: 'POST',
    body: JSON.stringify(purchase),
  }),

  update: (id: string, updates: any) => apiFetch(`/data/purchases/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  }),

  delete: (id: string) => apiFetch(`/data/purchases/${id}`, {
    method: 'DELETE',
  }),
};

// ==========================================
// Notes API
// ==========================================
export const notesAPI = {
  getAll: () => apiFetch('/data/notes'),

  add: (note: any) => apiFetch('/data/notes', {
    method: 'POST',
    body: JSON.stringify(note),
  }),

  update: (id: string, updates: any) => apiFetch(`/data/notes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  }),

  delete: (id: string) => apiFetch(`/data/notes/${id}`, {
    method: 'DELETE',
  }),
};

// ==========================================
// Payments API
// ==========================================
export const paymentsAPI = {
  subscriptionPay: (data: any) => apiFetch('/payments/subscribe', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  subscriptionConfirm: (txRef: string) => apiFetch('/payments/subscribe/confirm', {
    method: 'POST',
    body: JSON.stringify({ txRef }),
  }),

  collect: (data: any) => apiFetch('/payments/collect', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  collectConfirm: (txRef: string) => apiFetch('/payments/collect/confirm', {
    method: 'POST',
    body: JSON.stringify({ txRef }),
  }),

  history: () => apiFetch('/payments/history'),

  // --- Stripe Checkout (web hosted) ---
  stripeConfig: () => apiFetch('/payments/stripe/config'),

  stripeSubscriptionCheckout: (plan: 'monthly' | 'quarterly' | 'yearly') =>
    apiFetch('/payments/stripe/subscription/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    }),

  stripeAmbassadorCheckout: (plan: 'monthly' | 'quarterly' | 'yearly', quantity: number) =>
    apiFetch('/payments/stripe/ambassador/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan, quantity }),
    }),

  /**
   * Same as stripeAmbassadorCheckout but uses the AMBASSADOR JWT (the one
   * stored under AsyncStorage['ambassador_token']). This is the correct
   * variant when the buyer is acting as an ambassador inside the dedicated
   * /ambassador/* flow — codes will be linked to their ambassador account
   * and appear in their ambassador dashboard.
   */
  stripeAmbassadorCheckoutAsAmbassador: (plan: 'monthly' | 'quarterly' | 'yearly', quantity: number) =>
    apiFetchAsAmbassador('/payments/stripe/ambassador/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan, quantity }),
    }),

  stripeSessionStatus: (sessionId: string) =>
    apiFetch(`/payments/stripe/session/${encodeURIComponent(sessionId)}`),

  /** Same as stripeSessionStatus but uses the ambassador JWT for ownership check. */
  stripeSessionStatusAsAmbassador: (sessionId: string) =>
    apiFetchAsAmbassador(`/payments/stripe/session/${encodeURIComponent(sessionId)}`),
};
