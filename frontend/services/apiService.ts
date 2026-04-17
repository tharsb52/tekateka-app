/**
 * Centralized API service for TekaTeka backend.
 * All data flows through MongoDB for multi-device real-time sync.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
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
// API Fetch Helper
// ==========================================
async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${BACKEND_URL}/api${path}`;
  
  try {
    const response = await fetch(url, { ...options, headers });
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.detail || data.message || `Erreur ${response.status}`);
    }
    
    return data;
  } catch (error: any) {
    if (error.message?.includes('fetch') || error.message?.includes('Network')) {
      throw new Error('Erreur réseau. Vérifiez votre connexion.');
    }
    throw error;
  }
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
