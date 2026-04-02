import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Product, Sale, Expense } from '../types';
import {
  getProducts,
  getSales,
  getExpenses,
  addProduct as addProductToStorage,
  updateProduct as updateProductInStorage,
  deleteProduct as deleteProductFromStorage,
  addSale as addSaleToStorage,
  addExpense as addExpenseToStorage,
} from '../utils/storage';
import { useAuth } from './AuthContext';

interface DataContextType {
  products: Product[];
  sales: Sale[];
  expenses: Expense[];
  loading: boolean;
  addProduct: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => Promise<void>;
  updateProduct: (productId: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (productId: string) => Promise<void>;
  addSale: (sale: Omit<Sale, 'id' | 'createdAt' | 'userId'>) => Promise<void>;
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt' | 'userId'>) => Promise<void>;
  refreshData: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within DataProvider');
  }
  return context;
};

interface DataProviderProps {
  children: ReactNode;
}

export const DataProvider: React.FC<DataProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      const [loadedProducts, loadedSales, loadedExpenses] = await Promise.all([
        getProducts(),
        getSales(),
        getExpenses(),
      ]);
      
      setProducts(loadedProducts);
      setSales(loadedSales);
      setExpenses(loadedExpenses);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const addProduct = async (productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'userId'>) => {
    if (!user) return;
    
    const newProduct: Product = {
      ...productData,
      id: Date.now().toString(),
      userId: user.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await addProductToStorage(newProduct);
    setProducts([...products, newProduct]);
  };

  const updateProduct = async (productId: string, updates: Partial<Product>) => {
    await updateProductInStorage(productId, updates);
    setProducts(products.map(p => p.id === productId ? { ...p, ...updates } : p));
  };

  const deleteProduct = async (productId: string) => {
    await deleteProductFromStorage(productId);
    setProducts(products.filter(p => p.id !== productId));
  };

  const addSale = async (saleData: Omit<Sale, 'id' | 'createdAt' | 'userId'>) => {
    if (!user) return;
    
    const newSale: Sale = {
      ...saleData,
      id: Date.now().toString(),
      userId: user.id,
      createdAt: new Date().toISOString(),
    };
    
    await addSaleToStorage(newSale);
    setSales([...sales, newSale]);
    
    // Update product stock
    const product = products.find(p => p.id === saleData.productId);
    if (product) {
      await updateProduct(product.id, { stock: product.stock - saleData.quantity });
    }
  };

  const addExpense = async (expenseData: Omit<Expense, 'id' | 'createdAt' | 'userId'>) => {
    if (!user) return;
    
    const newExpense: Expense = {
      ...expenseData,
      id: Date.now().toString(),
      userId: user.id,
      createdAt: new Date().toISOString(),
    };
    
    await addExpenseToStorage(newExpense);
    setExpenses([...expenses, newExpense]);
  };

  const refreshData = async () => {
    await loadData();
  };

  return (
    <DataContext.Provider
      value={{
        products,
        sales,
        expenses,
        loading,
        addProduct,
        updateProduct,
        deleteProduct,
        addSale,
        addExpense,
        refreshData,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};
