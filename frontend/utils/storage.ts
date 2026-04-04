import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, Product, Sale, Expense, Debt, Purchase } from '../types';

const KEYS = {
  USER: '@tekateka:user',
  PRODUCTS: '@tekateka:products',
  SALES: '@tekateka:sales',
  EXPENSES: '@tekateka:expenses',
  DEBTS: '@tekateka:debts',
  PURCHASES: '@tekateka:purchases',
  PENDING_SYNC: '@tekateka:pendingSync',
};

// User operations
export const saveUser = async (user: User): Promise<void> => {
  await AsyncStorage.setItem(KEYS.USER, JSON.stringify(user));
};

export const getUser = async (): Promise<User | null> => {
  const data = await AsyncStorage.getItem(KEYS.USER);
  return data ? JSON.parse(data) : null;
};

export const clearUser = async (): Promise<void> => {
  await AsyncStorage.removeItem(KEYS.USER);
};

// Products operations
export const saveProducts = async (products: Product[]): Promise<void> => {
  await AsyncStorage.setItem(KEYS.PRODUCTS, JSON.stringify(products));
};

export const getProducts = async (): Promise<Product[]> => {
  const data = await AsyncStorage.getItem(KEYS.PRODUCTS);
  return data ? JSON.parse(data) : [];
};

export const addProduct = async (product: Product): Promise<void> => {
  const products = await getProducts();
  products.push({ ...product, synced: false });
  await saveProducts(products);
};

export const updateProduct = async (productId: string, updates: Partial<Product>): Promise<void> => {
  const products = await getProducts();
  const index = products.findIndex(p => p.id === productId);
  if (index !== -1) {
    products[index] = { ...products[index], ...updates, synced: false, updatedAt: new Date().toISOString() };
    await saveProducts(products);
  }
};

export const deleteProduct = async (productId: string): Promise<void> => {
  const products = await getProducts();
  const filtered = products.filter(p => p.id !== productId);
  await saveProducts(filtered);
};

// Sales operations
export const saveSales = async (sales: Sale[]): Promise<void> => {
  await AsyncStorage.setItem(KEYS.SALES, JSON.stringify(sales));
};

export const getSales = async (): Promise<Sale[]> => {
  const data = await AsyncStorage.getItem(KEYS.SALES);
  return data ? JSON.parse(data) : [];
};

export const addSale = async (sale: Sale): Promise<void> => {
  const sales = await getSales();
  sales.push({ ...sale, synced: false });
  await saveSales(sales);
};

// Expenses operations
export const saveExpenses = async (expenses: Expense[]): Promise<void> => {
  await AsyncStorage.setItem(KEYS.EXPENSES, JSON.stringify(expenses));
};

export const getExpenses = async (): Promise<Expense[]> => {
  const data = await AsyncStorage.getItem(KEYS.EXPENSES);
  return data ? JSON.parse(data) : [];
};

export const addExpense = async (expense: Expense): Promise<void> => {
  const expenses = await getExpenses();
  expenses.push({ ...expense, synced: false });
  await saveExpenses(expenses);
};

// Debts operations
export const saveDebts = async (debts: Debt[]): Promise<void> => {
  await AsyncStorage.setItem(KEYS.DEBTS, JSON.stringify(debts));
};

export const getDebts = async (): Promise<Debt[]> => {
  const data = await AsyncStorage.getItem(KEYS.DEBTS);
  return data ? JSON.parse(data) : [];
};

export const addDebt = async (debt: Debt): Promise<void> => {
  const debts = await getDebts();
  debts.push({ ...debt, synced: false });
  await saveDebts(debts);
};

export const updateDebt = async (debtId: string, updates: Partial<Debt>): Promise<void> => {
  const debts = await getDebts();
  const index = debts.findIndex(d => d.id === debtId);
  if (index !== -1) {
    debts[index] = { ...debts[index], ...updates, synced: false };
    await saveDebts(debts);
  }
};

export const deleteDebt = async (debtId: string): Promise<void> => {
  const debts = await getDebts();
  const filtered = debts.filter(d => d.id !== debtId);
  await saveDebts(filtered);
};

// Purchases operations
export const savePurchases = async (purchases: Purchase[]): Promise<void> => {
  await AsyncStorage.setItem(KEYS.PURCHASES, JSON.stringify(purchases));
};

export const getPurchases = async (): Promise<Purchase[]> => {
  const data = await AsyncStorage.getItem(KEYS.PURCHASES);
  return data ? JSON.parse(data) : [];
};

export const addPurchase = async (purchase: Purchase): Promise<void> => {
  const purchases = await getPurchases();
  purchases.push({ ...purchase, synced: false });
  await savePurchases(purchases);
};

export const updatePurchase = async (purchaseId: string, updates: Partial<Purchase>): Promise<void> => {
  const purchases = await getPurchases();
  const index = purchases.findIndex(p => p.id === purchaseId);
  if (index !== -1) {
    purchases[index] = { ...purchases[index], ...updates, synced: false };
    await savePurchases(purchases);
  }
};

export const deletePurchase = async (purchaseId: string): Promise<void> => {
  const purchases = await getPurchases();
  const filtered = purchases.filter(p => p.id !== purchaseId);
  await savePurchases(filtered);
};

// Clear all data
export const clearAllData = async (): Promise<void> => {
  await AsyncStorage.multiRemove([KEYS.USER, KEYS.PRODUCTS, KEYS.SALES, KEYS.EXPENSES, KEYS.DEBTS, KEYS.PURCHASES, KEYS.PENDING_SYNC]);
};
