import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, Product, Sale, Expense, Debt, Purchase } from '../types';

// Active user key (global - tracks who is logged in)
const ACTIVE_USER_KEY = '@tekateka:active_user';

// Get user-specific keys
const userKeys = (userId: string) => ({
  PRODUCTS: `@tekateka:${userId}:products`,
  SALES: `@tekateka:${userId}:sales`,
  EXPENSES: `@tekateka:${userId}:expenses`,
  DEBTS: `@tekateka:${userId}:debts`,
  PURCHASES: `@tekateka:${userId}:purchases`,
  PENDING_SYNC: `@tekateka:${userId}:pendingSync`,
  USER_PROFILE: `@tekateka:${userId}:profile`,
});

// ============ USER operations ============
export const saveUser = async (user: User): Promise<void> => {
  const keys = userKeys(user.id);
  await AsyncStorage.setItem(ACTIVE_USER_KEY, user.id);
  await AsyncStorage.setItem(keys.USER_PROFILE, JSON.stringify(user));
};

export const getUser = async (): Promise<User | null> => {
  const activeId = await AsyncStorage.getItem(ACTIVE_USER_KEY);
  if (!activeId) return null;
  const keys = userKeys(activeId);
  const data = await AsyncStorage.getItem(keys.USER_PROFILE);
  return data ? JSON.parse(data) : null;
};

export const clearUser = async (): Promise<void> => {
  // Only clear the active session, NOT the user's data
  await AsyncStorage.removeItem(ACTIVE_USER_KEY);
};

// Helper to get the active userId
const getActiveUserId = async (): Promise<string | null> => {
  return await AsyncStorage.getItem(ACTIVE_USER_KEY);
};

// ============ PRODUCTS operations ============
export const saveProducts = async (products: Product[]): Promise<void> => {
  const userId = await getActiveUserId();
  if (!userId) return;
  await AsyncStorage.setItem(userKeys(userId).PRODUCTS, JSON.stringify(products));
};

export const getProducts = async (): Promise<Product[]> => {
  const userId = await getActiveUserId();
  if (!userId) return [];
  const data = await AsyncStorage.getItem(userKeys(userId).PRODUCTS);
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

// ============ SALES operations ============
export const saveSales = async (sales: Sale[]): Promise<void> => {
  const userId = await getActiveUserId();
  if (!userId) return;
  await AsyncStorage.setItem(userKeys(userId).SALES, JSON.stringify(sales));
};

export const getSales = async (): Promise<Sale[]> => {
  const userId = await getActiveUserId();
  if (!userId) return [];
  const data = await AsyncStorage.getItem(userKeys(userId).SALES);
  return data ? JSON.parse(data) : [];
};

export const addSale = async (sale: Sale): Promise<void> => {
  const sales = await getSales();
  sales.push({ ...sale, synced: false });
  await saveSales(sales);
};

export const updateSale = async (saleId: string, updates: Partial<Sale>): Promise<void> => {
  const sales = await getSales();
  const index = sales.findIndex(s => s.id === saleId);
  if (index !== -1) {
    sales[index] = { ...sales[index], ...updates, synced: false };
    await saveSales(sales);
  }
};

export const deleteSale = async (saleId: string): Promise<void> => {
  const sales = await getSales();
  const filtered = sales.filter(s => s.id !== saleId);
  await saveSales(filtered);
};

// ============ EXPENSES operations ============
export const saveExpenses = async (expenses: Expense[]): Promise<void> => {
  const userId = await getActiveUserId();
  if (!userId) return;
  await AsyncStorage.setItem(userKeys(userId).EXPENSES, JSON.stringify(expenses));
};

export const getExpenses = async (): Promise<Expense[]> => {
  const userId = await getActiveUserId();
  if (!userId) return [];
  const data = await AsyncStorage.getItem(userKeys(userId).EXPENSES);
  return data ? JSON.parse(data) : [];
};

export const addExpense = async (expense: Expense): Promise<void> => {
  const expenses = await getExpenses();
  expenses.push({ ...expense, synced: false });
  await saveExpenses(expenses);
};

export const updateExpense = async (expenseId: string, updates: Partial<Expense>): Promise<void> => {
  const expenses = await getExpenses();
  const index = expenses.findIndex(e => e.id === expenseId);
  if (index !== -1) {
    expenses[index] = { ...expenses[index], ...updates, synced: false };
    await saveExpenses(expenses);
  }
};

export const deleteExpense = async (expenseId: string): Promise<void> => {
  const expenses = await getExpenses();
  const filtered = expenses.filter(e => e.id !== expenseId);
  await saveExpenses(filtered);
};

// ============ DEBTS operations ============
export const saveDebts = async (debts: Debt[]): Promise<void> => {
  const userId = await getActiveUserId();
  if (!userId) return;
  await AsyncStorage.setItem(userKeys(userId).DEBTS, JSON.stringify(debts));
};

export const getDebts = async (): Promise<Debt[]> => {
  const userId = await getActiveUserId();
  if (!userId) return [];
  const data = await AsyncStorage.getItem(userKeys(userId).DEBTS);
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

// ============ PURCHASES operations ============
export const savePurchases = async (purchases: Purchase[]): Promise<void> => {
  const userId = await getActiveUserId();
  if (!userId) return;
  await AsyncStorage.setItem(userKeys(userId).PURCHASES, JSON.stringify(purchases));
};

export const getPurchases = async (): Promise<Purchase[]> => {
  const userId = await getActiveUserId();
  if (!userId) return [];
  const data = await AsyncStorage.getItem(userKeys(userId).PURCHASES);
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

// ============ Clear all data for current user ============
export const clearAllData = async (): Promise<void> => {
  const userId = await getActiveUserId();
  if (!userId) return;
  const keys = userKeys(userId);
  await AsyncStorage.multiRemove([
    keys.USER_PROFILE, keys.PRODUCTS, keys.SALES,
    keys.EXPENSES, keys.DEBTS, keys.PURCHASES, keys.PENDING_SYNC,
  ]);
  await AsyncStorage.removeItem(ACTIVE_USER_KEY);
};

// ============ Check if user has data (for sample data init) ============
export const userHasData = async (userId: string): Promise<boolean> => {
  const data = await AsyncStorage.getItem(userKeys(userId).PRODUCTS);
  return data !== null && JSON.parse(data).length > 0;
};
