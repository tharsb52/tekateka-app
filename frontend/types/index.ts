export interface User {
  id: string;
  phoneNumber: string;
  createdAt: string;
  trialStartDate: string;
  isSubscribed: boolean;
  currency: string;
  language: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  category: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  synced?: boolean;
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
  userId: string;
  createdAt: string;
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
