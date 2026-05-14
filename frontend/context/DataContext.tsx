import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Product, Sale, Expense, Debt, Purchase } from '../types';
import { useAuth } from './AuthContext';
import { sendInstantNotification } from '../services/notificationService';
import { productsAPI, salesAPI, expensesAPI, debtsAPI, purchasesAPI } from '../services/apiService';

// Map backend sale to frontend Sale type
function mapBackendSale(s: any): Sale {
  return {
    id: s.id || '',
    productId: s.productId || '',
    productName: s.productName || '',
    quantity: s.quantity || 1,
    price: s.price || (s.total && s.quantity ? s.total / s.quantity : 0),
    totalAmount: s.totalAmount || s.total || 0,
    paymentMethod: s.paymentMethod || 'cash',
    currency: s.currency || 'USD',
    userId: s.userId || '',
    createdAt: s.createdAt || s.date || new Date().toISOString(),
  };
}

// Map backend product to frontend Product type
function mapBackendProduct(p: any): Product {
  return {
    id: p.id || '',
    name: p.name || '',
    purchasePrice: p.purchasePrice ?? 0,
    salePrice: p.salePrice ?? p.price ?? 0,
    promotionPrice: p.promotionPrice,
    stock: p.stock ?? 0,
    category: p.category || 'food',
    userId: p.userId || '',
    createdAt: p.createdAt || new Date().toISOString(),
    updatedAt: p.updatedAt || p.createdAt || new Date().toISOString(),
  };
}

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

  useEffect(() => {
    if (user) {
      loadData();
    } else {
      // Clear data when user logs out
      setProducts([]);
      setSales([]);
      setExpenses([]);
      setDebts([]);
      setPurchases([]);
      setLoading(false);
    }
  }, [user?.id]);

  // Auto-refresh data every 30s when user is logged in (silent sync across devices)
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      loadData(true).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const loadData = async (silent: boolean = false) => {
    if (!silent) setLoading(true);
    try {
      const [prods, sls, exps, dbts, prchs] = await Promise.all([
        productsAPI.getAll().catch(() => []),
        salesAPI.getAll().catch(() => []),
        expensesAPI.getAll().catch(() => []),
        debtsAPI.getAll().catch(() => []),
        purchasesAPI.getAll().catch(() => []),
      ]);
      setProducts((prods || []).map(mapBackendProduct));
      setSales((sls || []).map(mapBackendSale));
      setExpenses(exps || []);
      setDebts(dbts || []);
      setPurchases(prchs || []);
    } catch (err) {
      console.error('Load data error:', err);
    } finally {
      setLoading(false);
    }
  };

  // PRODUCTS
  const addProduct = async (data: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => {
    if (!user) return;
    try {
      const result = await productsAPI.add({
        name: data.name,
        purchasePrice: data.purchasePrice,
        salePrice: data.salePrice,
        promotionPrice: data.promotionPrice,
        stock: data.stock,
        category: data.category,
      });
      setProducts(prev => [...prev, mapBackendProduct(result)]);
    } catch (error) {
      console.error('Add product error:', error);
      throw error;
    }
  };

  const updateProduct = async (id: string, u: Partial<Product>) => {
    try {
      const result = await productsAPI.update(id, u);
      setProducts(prev => prev.map(p => p.id === id ? mapBackendProduct(result) : p));
    } catch (error) {
      console.error('Update product error:', error);
      throw error;
    }
  };

  const deleteProduct = async (id: string) => {
    try {
      await productsAPI.delete(id);
      setProducts(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error('Delete product error:', error);
      throw error;
    }
  };

  // SALES
  const addSale = async (data: Omit<Sale, 'id' | 'createdAt' | 'userId'>) => {
    if (!user) return;
    try {
      const salePayload = {
        productId: data.productId,
        productName: data.productName,
        quantity: data.quantity,
        total: data.totalAmount || (data.price || 0) * (data.quantity || 1),
        paymentMethod: data.paymentMethod,
        currency: data.currency,
      };
      const result = await salesAPI.add(salePayload);
      setSales(prev => [...prev, mapBackendSale(result)]);

      // Stock alert from backend
      if (result.stockAlert && result.productNameAlert) {
        sendInstantNotification(
          'Stock epuise !',
          `Le produit "${result.productNameAlert}" est en rupture de stock. Pensez a le reapprovisionner.`,
          { type: 'stock_alert', productId: data.productId, productName: result.productNameAlert }
        ).catch(() => {});
      }

      // Refresh products to get updated stock from backend
      try {
        const updatedProducts = await productsAPI.getAll();
        setProducts((updatedProducts || []).map(mapBackendProduct));
      } catch (_e) { /* silent */ }
    } catch (error) {
      console.error('Add sale error:', error);
      throw error;
    }
  };

  const updateSale = async (id: string, u: Partial<Sale>) => {
    try {
      const result = await salesAPI.update(id, u);
      setSales(prev => prev.map(s => s.id === id ? mapBackendSale(result) : s));
    } catch (error) {
      console.error('Update sale error:', error);
      throw error;
    }
  };

  const deleteSale = async (id: string) => {
    try {
      await salesAPI.delete(id);
      setSales(prev => prev.filter(s => s.id !== id));
    } catch (error) {
      console.error('Delete sale error:', error);
      throw error;
    }
  };

  // EXPENSES
  const addExpense = async (data: Omit<Expense, 'id' | 'createdAt' | 'userId'>) => {
    if (!user) return;
    try {
      const result = await expensesAPI.add({
        category: data.category,
        customCategory: data.customCategory,
        amount: data.amount,
        currency: data.currency,
        notes: data.notes,
        productId: data.productId,
      });
      setExpenses(prev => [...prev, result]);
    } catch (error) {
      console.error('Add expense error:', error);
      throw error;
    }
  };

  const updateExpense = async (id: string, u: Partial<Expense>) => {
    try {
      const result = await expensesAPI.update(id, u);
      setExpenses(prev => prev.map(e => e.id === id ? result : e));
    } catch (error) {
      console.error('Update expense error:', error);
      throw error;
    }
  };

  const deleteExpense = async (id: string) => {
    try {
      await expensesAPI.delete(id);
      setExpenses(prev => prev.filter(e => e.id !== id));
    } catch (error) {
      console.error('Delete expense error:', error);
      throw error;
    }
  };

  // DEBTS
  const addDebt = async (data: Omit<Debt, 'id' | 'createdAt' | 'userId'>) => {
    if (!user) return;
    try {
      const result = await debtsAPI.add({
        debtorName: data.debtorName,
        amount: data.amount,
        currency: data.currency,
        description: data.description,
        dueDate: data.dueDate,
        isPaid: data.isPaid,
      });
      setDebts(prev => [...prev, result]);
    } catch (error) {
      console.error('Add debt error:', error);
      throw error;
    }
  };

  const updateDebt = async (id: string, u: Partial<Debt>) => {
    try {
      const result = await debtsAPI.update(id, u);
      setDebts(prev => prev.map(d => d.id === id ? result : d));
    } catch (error) {
      console.error('Update debt error:', error);
      throw error;
    }
  };

  const deleteDebt = async (id: string) => {
    try {
      await debtsAPI.delete(id);
      setDebts(prev => prev.filter(d => d.id !== id));
    } catch (error) {
      console.error('Delete debt error:', error);
      throw error;
    }
  };

  const markDebtAsPaidWithRevenue = async (debtId: string) => {
    const debt = debts.find(d => d.id === debtId);
    if (!debt || !user) return;
    const paidAt = new Date().toISOString();

    try {
      // Update debt as paid
      await debtsAPI.update(debtId, { isPaid: true, paidDate: paidAt });
      setDebts(prev => prev.map(d => d.id === debtId ? { ...d, isPaid: true, paidAt } : d));

      // Create a revenue sale
      const salePayload = {
        productId: 'debt-payment',
        productName: `Dette payee - ${debt.debtorName}`,
        quantity: 1,
        total: debt.amount,
        paymentMethod: 'cash',
        currency: debt.currency || user.currency || 'USD',
      };
      const newSale = await salesAPI.add(salePayload);
      setSales(prev => [...prev, mapBackendSale(newSale)]);
    } catch (error) {
      console.error('Mark debt as paid error:', error);
      throw error;
    }
  };

  // PURCHASES
  const addPurchase = async (data: Omit<Purchase, 'id' | 'createdAt' | 'userId'>) => {
    if (!user) return;
    try {
      const result = await purchasesAPI.add({
        productName: data.productName,
        supplier: data.supplier,
        quantity: data.quantity,
        unitPrice: data.unitPrice,
        totalCost: data.totalCost,
        currency: data.currency,
        notes: data.notes,
      });
      setPurchases(prev => [...prev, result]);
    } catch (error) {
      console.error('Add purchase error:', error);
      throw error;
    }
  };

  const updatePurchase = async (id: string, u: Partial<Purchase>) => {
    try {
      const result = await purchasesAPI.update(id, u);
      setPurchases(prev => prev.map(p => p.id === id ? result : p));
    } catch (error) {
      console.error('Update purchase error:', error);
      throw error;
    }
  };

  const deletePurchase = async (id: string) => {
    try {
      await purchasesAPI.delete(id);
      setPurchases(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error('Delete purchase error:', error);
      throw error;
    }
  };

  const refreshData = async () => {
    await loadData();
  };

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
