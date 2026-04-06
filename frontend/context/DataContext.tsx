import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Product, Sale, Expense, Debt, Purchase } from '../types';
import {
  getProducts, getSales, getExpenses, getDebts, getPurchases,
  addProduct as addProductToStorage, updateProduct as updateProductInStorage, deleteProduct as deleteProductFromStorage,
  addSale as addSaleToStorage, updateSale as updateSaleInStorage, deleteSale as deleteSaleFromStorage,
  addExpense as addExpenseToStorage, updateExpense as updateExpenseInStorage, deleteExpense as deleteExpenseFromStorage,
  addDebt as addDebtToStorage, updateDebt as updateDebtInStorage, deleteDebt as deleteDebtFromStorage,
  addPurchase as addPurchaseToStorage, updatePurchase as updatePurchaseInStorage, deletePurchase as deletePurchaseFromStorage,
} from '../utils/storage';
import { useAuth } from './AuthContext';
import { sendInstantNotification } from '../services/notificationService';

interface DataContextType {
  products: Product[];
  sales: Sale[];
  expenses: Expense[];
  debts: Debt[];
  purchases: Purchase[];
  loading: boolean;
  addProduct: (p: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => Promise<void>;
  updateProduct: (id: string, u: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addSale: (s: Omit<Sale, 'id' | 'createdAt' | 'userId'>) => Promise<void>;
  updateSale: (id: string, u: Partial<Sale>) => Promise<void>;
  deleteSale: (id: string) => Promise<void>;
  addExpense: (e: Omit<Expense, 'id' | 'createdAt' | 'userId'>) => Promise<void>;
  updateExpense: (id: string, u: Partial<Expense>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  addDebt: (d: Omit<Debt, 'id' | 'createdAt' | 'userId'>) => Promise<void>;
  updateDebt: (id: string, u: Partial<Debt>) => Promise<void>;
  deleteDebt: (id: string) => Promise<void>;
  addPurchase: (p: Omit<Purchase, 'id' | 'createdAt' | 'userId'>) => Promise<void>;
  updatePurchase: (id: string, u: Partial<Purchase>) => Promise<void>;
  deletePurchase: (id: string) => Promise<void>;
  markDebtAsPaidWithRevenue: (id: string) => Promise<void>;
  refreshData: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
};

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user) loadData(); }, [user]);

  const loadData = async () => {
    try {
      const [p, s, e, d, pu] = await Promise.all([getProducts(), getSales(), getExpenses(), getDebts(), getPurchases()]);
      // Migrate old products: map legacy `price` to `salePrice`
      const migratedProducts = p.map((prod: any) => ({
        ...prod,
        salePrice: prod.salePrice ?? prod.price ?? 0,
        purchasePrice: prod.purchasePrice ?? 0,
      }));
      setProducts(migratedProducts);
      setSales(s); setExpenses(e); setDebts(d); setPurchases(pu);
    } catch (err) { console.error('Load data error:', err); }
    finally { setLoading(false); }
  };

  // PRODUCTS
  const addProduct = async (data: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => {
    if (!user) return;
    const np: Product = { ...data, id: Date.now().toString(), userId: user.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await addProductToStorage(np);
    setProducts(prev => [...prev, np]);
  };
  const updateProduct = async (id: string, u: Partial<Product>) => {
    await updateProductInStorage(id, u);
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...u } : p));
  };
  const deleteProduct = async (id: string) => {
    await deleteProductFromStorage(id);
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  // SALES
  const addSale = async (data: Omit<Sale, 'id' | 'createdAt' | 'userId'>) => {
    if (!user) return;
    const ns: Sale = { ...data, id: Date.now().toString(), userId: user.id, createdAt: new Date().toISOString() };
    await addSaleToStorage(ns);
    setSales(prev => [...prev, ns]);
    // Update stock
    const prod = products.find(p => p.id === data.productId);
    if (prod) {
      const newStock = prod.stock - data.quantity;
      await updateProduct(prod.id, { stock: newStock });
      // Stock alert: notify when product reaches 0
      if (newStock <= 0) {
        sendInstantNotification(
          'Stock épuisé !',
          `Le produit "${prod.name}" est en rupture de stock. Pensez à le réapprovisionner.`,
          { type: 'stock_alert', productId: prod.id, productName: prod.name }
        ).catch(() => {});
      }
    }
  };
  const updateSale = async (id: string, u: Partial<Sale>) => {
    await updateSaleInStorage(id, u);
    setSales(prev => prev.map(s => s.id === id ? { ...s, ...u } : s));
  };
  const deleteSale = async (id: string) => {
    await deleteSaleFromStorage(id);
    setSales(prev => prev.filter(s => s.id !== id));
  };

  // EXPENSES
  const addExpense = async (data: Omit<Expense, 'id' | 'createdAt' | 'userId'>) => {
    if (!user) return;
    const ne: Expense = { ...data, id: Date.now().toString(), userId: user.id, createdAt: new Date().toISOString() };
    await addExpenseToStorage(ne);
    setExpenses(prev => [...prev, ne]);
  };
  const updateExpense = async (id: string, u: Partial<Expense>) => {
    await updateExpenseInStorage(id, u);
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, ...u } : e));
  };
  const deleteExpense = async (id: string) => {
    await deleteExpenseFromStorage(id);
    setExpenses(prev => prev.filter(e => e.id !== id));
  };

  // DEBTS
  const addDebt = async (data: Omit<Debt, 'id' | 'createdAt' | 'userId'>) => {
    if (!user) return;
    const nd: Debt = { ...data, id: Date.now().toString(), userId: user.id, createdAt: new Date().toISOString() };
    await addDebtToStorage(nd);
    setDebts(prev => [...prev, nd]);
  };
  const updateDebt = async (id: string, u: Partial<Debt>) => {
    await updateDebtInStorage(id, u);
    setDebts(prev => prev.map(d => d.id === id ? { ...d, ...u } : d));
  };
  const deleteDebt = async (id: string) => {
    await deleteDebtFromStorage(id);
    setDebts(prev => prev.filter(d => d.id !== id));
  };
  const markDebtAsPaidWithRevenue = async (debtId: string) => {
    const debt = debts.find(d => d.id === debtId);
    if (!debt || !user) return;
    const paidAt = new Date().toISOString();
    await updateDebtInStorage(debtId, { isPaid: true, paidAt });
    setDebts(prev => prev.map(d => d.id === debtId ? { ...d, isPaid: true, paidAt } : d));
    const revSale: Sale = { id: `debt-${Date.now()}`, productId: 'debt-payment', productName: `Dette payee - ${debt.debtorName}`, quantity: 1, price: debt.amount, totalAmount: debt.amount, paymentMethod: 'cash', currency: debt.currency || user.currency || 'USD', userId: user.id, createdAt: paidAt };
    await addSaleToStorage(revSale);
    setSales(prev => [...prev, revSale]);
  };

  // PURCHASES
  const addPurchase = async (data: Omit<Purchase, 'id' | 'createdAt' | 'userId'>) => {
    if (!user) return;
    const np: Purchase = { ...data, id: Date.now().toString(), userId: user.id, createdAt: new Date().toISOString() };
    await addPurchaseToStorage(np);
    setPurchases(prev => [...prev, np]);
  };
  const updatePurchase = async (id: string, u: Partial<Purchase>) => {
    await updatePurchaseInStorage(id, u);
    setPurchases(prev => prev.map(p => p.id === id ? { ...p, ...u } : p));
  };
  const deletePurchase = async (id: string) => {
    await deletePurchaseFromStorage(id);
    setPurchases(prev => prev.filter(p => p.id !== id));
  };

  const refreshData = async () => { await loadData(); };

  return (
    <DataContext.Provider value={{
      products, sales, expenses, debts, purchases, loading,
      addProduct, updateProduct, deleteProduct,
      addSale, updateSale, deleteSale,
      addExpense, updateExpense, deleteExpense,
      addDebt, updateDebt, deleteDebt,
      addPurchase, updatePurchase, deletePurchase,
      markDebtAsPaidWithRevenue, refreshData,
    }}>
      {children}
    </DataContext.Provider>
  );
};
