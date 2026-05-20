export interface User {
  id: string;
  phoneNumber: string;
  email?: string;
  username?: string;
  hasPassword?: boolean;
  profilePhoto?: string;
  createdAt: string;
  trialStartDate: string;
  isSubscribed: boolean;
  subscriptionPlan?: 'monthly' | 'quarterly' | 'yearly';
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
  currency: string;
  language: string;
}

export interface Product {
  id: string;
  sku?: string;                  // Auto-generated PROD-000001 per user
  name: string;
  purchasePrice: number; // Prix d'achat par unité
  salePrice: number; // Prix de vente
  promotionPrice?: number; // Prix promo (optionnel)
  stock: number; // Quantité en stock
  category: string;
  unit?: string;                 // pcs, kg, L, sac... or custom (when user picked "autre")
  lowStockThreshold?: number;    // alert when stock <= this value (default 5)
  // Recomputed by the backend on every read
  outOfStock?: boolean;
  lowStock?: boolean;
  userId: string;
  createdAt: string;
  updatedAt: string;
  synced?: boolean;
  // Legacy field - mapped to salePrice for backward compat
  price?: number;
}

export interface Sale {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  totalAmount: number;
  paymentMethod: 'cash' | 'mobileMoney';
  currency: string;
  userId: string;
  createdAt: string;
  synced?: boolean;
}

export interface Expense {
  id: string;
  category: string;
  customCategory?: string;
  amount: number;
  currency: string;
  notes?: string;
  productId?: string; // Lien optionnel vers un produit
  productName?: string;
  userId: string;
  createdAt: string;
  synced?: boolean;
}

export interface Debt {
  id: string;
  debtorName: string;
  amount: number;
  currency: string;
  description?: string;
  dueDate?: string;
  isPaid: boolean;
  userId: string;
  createdAt: string;
  paidAt?: string;
  synced?: boolean;
}

export type CategoryType = 'food' | 'drinks' | 'clothes' | 'cosmetics' | 'electronics' | 'other';

export type ExpenseCategoryType = 
  | 'inventory'
  | 'transport'
  | 'rent'
  | 'electricity'
  | 'water'
  | 'internet'
  | 'salaries'
  | 'mobileMoneyFees'
  | 'taxes'
  | 'maintenance'
  | 'supplies'
  | 'miscellaneous'
  | 'custom';

export interface Purchase {
  id: string;
  productName: string;
  supplier: string;
  quantity: number;
  unitPrice: number;
  totalCost: number;
  currency: string;
  notes?: string;
  userId: string;
  createdAt: string;
  synced?: boolean;
}
